// Instagram: every published piece reads its own views, and a reel its
// 3-second skip rate, so nobody types them in and the finance platform's
// "views" and "posts" lines stop waiting for data (October 2026).
//
// THE TOKENS ONLY READ, AND READ LITTLE. The accounts are the school's, and a
// Meta block would cost far more than a number typed by hand. So:
//
//   - every call is a GET to one of five read addresses (READS below): the
//     token's own account, its Pages, one account, an account's media list,
//     one media's insights. Anything else is refused here, before it leaves
//     the server. Nothing posts, comments, replies, renews a token or changes
//     a setting — not now, not by a later edit that forgets this paragraph;
//   - only what will be written is asked for: a piece of a frozen month, of a
//     paid month or of a month typed by hand is never read again, a reel's
//     skip rate is not asked once its week is over, and an account with
//     nothing to read is not listed. A quiet day costs no call at all;
//   - one call a second, at most IG_MAX_CALLS (300) a run, once a day, and by
//     hand at most once every half hour;
//   - Meta's own gauge is read on every answer (x-app-usage,
//     x-business-use-case-usage): at half of any limit the run stops. A
//     "slow down" answer stops it at once and pauses every read for a day;
//   - a refused token (expired, revoked, missing a permission) is never tried
//     again until a new one is pasted;
//   - no retry of a failed call, ever: the next day's run is the retry;
//   - with IG_APP_SECRET set, every Facebook call carries its
//     appsecret_proof, so a token copied off the server is no use alone.
//
// WHERE THE KEYS LIVE. An admin pastes one access token per Instagram channel
// under Settings → Integrations. It is written to a file of its own on the
// server (INSTAGRAM_TOKEN_FILE, default ~/.satashkent/instagram.json, readable
// by the app's user only) — outside the repository, outside the deploy's
// rsync and outside DATA_DIR, whose database is pushed to git whole. The same
// place Google Drive keeps its key (drive.js). A token can also come from the
// environment, IG_TOKEN_<CHANNEL KEY> (IG_TOKEN_INSTAGRAM_MAIN). A token is
// never logged, never put in an error and never sent to a browser.
//
// TWO KINDS OF TOKEN. A Facebook Login token (EAA…, graph.facebook.com) reads
// a Business or Creator account through the Facebook Page it is connected to;
// an Instagram Login token (IG…, graph.instagram.com) reads the account it was
// made for. Both are accepted; the first characters say which.
//
// WHAT IS READ. Per media: `views` (the current metric — plays and
// impressions are gone) and `reach` in one call, the like count off the media
// list, and for a reel `reels_skip_rate` (December 2025) in a call of its own,
// so an account the API will not give it for still gets its views; the page
// then says the skip rate stays typed by hand, and it is not asked again.
//
// MATCHING. A task is its media by the shortcode in post_link (igShortcode:
// /p/, /reel/, /reels/, /tv/, /<account>/p/, any query string, two links in
// one field — the first one wins). Every media of every connected account is
// listed, so a piece filed on Main but posted from Uzb still finds its numbers.
//
// WHEN, AND WHAT IS WRITTEN. All the readings of one run are written in ONE
// batch at the end: a write to the database is an upload of the whole file.
//
//   - views go on the content row (views_by = 'instagram_api') for pieces
//     published this month;
//   - on the first run of a month the previous month's pieces are read one last
//     time and FROZEN (ig_media.frozen_month): their views never move again,
//     so the salary numbers do not move after the month is done;
//   - the skip rate is written until the reel is 7 days old, and that reading
//     is kept (skip_final_at) — Jaloliddin's KPI card grades it there;
//   - a piece published in a month before the first run, or in a month that
//     was already paid (paid_month), is never written over: its numbers were
//     typed by hand and somebody may have been paid by them;
//   - every reading goes to ig_history, one row a piece a day.
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, chmodSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { createHmac } from 'crypto'
import { all, get, run, batch, dayISO, tashkentDay } from './db.js'

const FB = () => process.env.IG_GRAPH_FB_BASE || 'https://graph.facebook.com'
const IG = () => process.env.IG_GRAPH_IG_BASE || 'https://graph.instagram.com'
const VER = () => process.env.IG_GRAPH_VERSION || 'v26.0'
const PAUSE = () => Number(process.env.IG_PAUSE_MS ?? 1000)
const MAX_CALLS = () => Number(process.env.IG_MAX_CALLS ?? 300)
const HIGH_WATER = 50          // per cent of any of Meta's gauges
const HAND_GAP = 30 * 60000    // "Read now", at most once in this
const WINDOW_DAYS = 45
const SKIP_DAYS = 7
const DAY = 86400000

export const tokenFile = () => process.env.INSTAGRAM_TOKEN_FILE || join(homedir(), '.satashkent', 'instagram.json')

// ---- the link -------------------------------------------------------------------
// The first Instagram post in a field, as its shortcode — case kept, because a
// shortcode is case-sensitive. null when the field holds no post address (a
// profile, a story, another site).
const IG_POST = /(?:^|[^A-Za-z0-9])(?:www\.|m\.)?instagr(?:am\.com|\.am)\/(?:[A-Za-z0-9_.]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i
export const igShortcode = (text) => IG_POST.exec(String(text || ''))?.[1] || null
// A story's address: /stories/<account>/<id>/, a highlight's
// /stories/highlights/<id>/, or the app's share link /s/<code>. Instagram has
// no other address for a story, and its views are not read from it — the API
// keeps a story for a day and has no highlights — so they stay typed by hand.
// The id is required: /stories/<account>/ alone is whatever the account has up
// today, gone tomorrow. And instagram.com has to be the host, not a word in
// another site's path.
const IG_STORY = /(?:^|\/\/|[^A-Za-z0-9./_-])(?:www\.|m\.)?instagr(?:am\.com|\.am)\/(?:stories\/([A-Za-z0-9_.]+)\/\d+|s\/[A-Za-z0-9_=-]+)/i
export const igStory = (text) => IG_STORY.test(String(text || ''))
// …and a highlight's own address, which every story kept in it shares.
export const igHighlight = (text) => /^highlights$/i.test(IG_STORY.exec(String(text || ''))?.[1] || '')

// ---- the keys -------------------------------------------------------------------
function readFileStore() {
  try {
    const j = JSON.parse(readFileSync(tokenFile(), 'utf8'))
    return j && typeof j === 'object' && j.accounts && typeof j.accounts === 'object' ? j : { accounts: {} }
  } catch { return { accounts: {} } }
}
function writeFileStore(s) {
  const f = tokenFile()
  mkdirSync(dirname(f), { recursive: true, mode: 0o700 })
  writeFileSync(f, JSON.stringify(s, null, 2), { mode: 0o600 })
  try { chmodSync(f, 0o600) } catch { /* Windows keeps its own ACLs */ }
}
const hostOf = (token) => (/^IG/.test(token) ? 'ig' : 'fb')
const tailOf = (token) => `…${String(token).slice(-4)}`

// Every channel's key, from the file first and the environment after. The
// account id is resolved when it is saved; an environment token resolves it on
// its first run and keeps it in memory.
const envResolved = new Map()
export function accounts() {
  const out = {}
  const stored = readFileStore().accounts
  for (const [key, a] of Object.entries(stored)) if (a?.token) out[key] = { ...a, from: 'settings' }
  for (const [name, token] of Object.entries(process.env)) {
    if (!name.startsWith('IG_TOKEN_') || !token) continue
    const key = name.slice('IG_TOKEN_'.length).toLowerCase()
    if (!out[key]) out[key] = { token, host: hostOf(token), ...(envResolved.get(key) || {}), from: 'environment' }
  }
  return out
}

// ---- Instagram, read-only -------------------------------------------------------
export class GraphError extends Error {
  constructor(message, code, status, kind = '') { super(message); this.code = code; this.status = status; this.kind = kind }
}
// The only addresses a token is ever sent to, all of them read with GET.
const READS = [
  /^\/me$/,                    // which account a token is
  /^\/me\/accounts$/,          // the Pages a person's token manages
  /^\/\d+$/,                   // one account, by its id
  /^\/(?:me|\d+)\/media$/,     // an account's media list
  /^\/\d+\/insights$/,         // one media's numbers
]
const FIELDS = new Set(['fields', 'limit', 'after', 'metric'])
// "Slow down" in Meta's words: app, user, page and business-use limits, and
// Instagram's own.
const THROTTLE = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014])
// The token itself is refused: expired or revoked (190), or it lacks a
// permission (10, 200–299). Tried again only once a new one is pasted.
const refusedToken = (code) => code === 190 || code === 10 || (code >= 200 && code <= 299)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// One run's budget and Meta's gauge, shared by every call the run makes.
let budget = null
const gauge = (headers) => {
  let top = 0
  for (const h of ['x-app-usage', 'x-business-use-case-usage', 'x-ad-account-usage']) {
    const raw = headers.get(h)
    if (!raw) continue
    try {
      const walk = (v) => {
        if (Array.isArray(v)) return v.forEach(walk)
        if (v && typeof v === 'object') {
          for (const [k, x] of Object.entries(v)) {
            if (['call_count', 'total_cputime', 'total_time', 'acc_id_util_pct'].includes(k) && Number.isFinite(Number(x))) top = Math.max(top, Number(x))
            else if (k === 'estimated_time_to_regain_access' && Number(x) > 0) top = Math.max(top, 100)
            else walk(x)
          }
        }
      }
      walk(JSON.parse(raw))
    } catch { /* a gauge we cannot read is not a reason to stop */ }
  }
  return top
}

export const isRead = (path, params = {}) =>
  READS.some((re) => re.test(path)) && Object.keys(params).every((k) => FIELDS.has(k))

async function graph(a, path, params = {}) {
  if (!isRead(path, params)) throw new GraphError('Not a read — refused before it left the server', 0, 0, 'refused')
  if (budget) {
    if (budget.stop) throw new GraphError(budget.stop, 0, 0, 'stopped')
    if (budget.calls >= MAX_CALLS()) { budget.stop = 'This run asked enough for one day — the rest are read tomorrow'; throw new GraphError(budget.stop, 0, 0, 'stopped') }
    budget.calls++
  }
  if (PAUSE() > 0) await sleep(PAUSE())
  const qs = new URLSearchParams({ ...params, access_token: a.token })
  const secret = process.env.IG_APP_SECRET
  if (secret && a.host !== 'ig') qs.set('appsecret_proof', createHmac('sha256', secret).update(a.token).digest('hex'))
  let r
  try {
    r = await fetch(`${a.host === 'ig' ? IG() : FB()}/${VER()}${path}?${qs}`, { method: 'GET', signal: AbortSignal.timeout(30000) })
  } catch (e) {
    throw new GraphError(`Instagram did not answer (${e.name === 'TimeoutError' ? 'timed out' : 'no connection'})`, 0, 0)
  }
  const top = gauge(r.headers)
  if (budget && top >= HIGH_WATER) budget.stop = budget.stop || 'Meta’s limit is half used — the rest are read tomorrow'
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.error) {
    const code = Number(j?.error?.code ?? 0)
    if (THROTTLE.has(code) || r.status === 429) {
      if (budget) budget.stop = 'Instagram asked us to slow down — reading again tomorrow'
      throw new GraphError('Instagram asked us to slow down — reading again tomorrow', code, r.status, 'throttled')
    }
    if (refusedToken(code)) {
      throw new GraphError(code === 190 ? 'The token has expired or was revoked — paste a new one'
        : 'The token is missing a permission — make one with instagram_basic, instagram_manage_insights, pages_read_engagement and pages_show_list', code, r.status, 'token')
    }
    throw new GraphError(String(j?.error?.message || `Instagram answered ${r.status}`).slice(0, 300), code, r.status)
  }
  return j
}

// Which Instagram account a token reads. `want` is what the admin typed beside
// it, if anything: the account's numeric id or its @username. One or two calls.
export async function resolveAccount(token, want = '') {
  const host = hostOf(token)
  const a = { token, host }
  const wanted = String(want || '').trim().replace(/^@/, '')
  if (host === 'ig') {
    const me = await graph(a, '/me', { fields: 'user_id,username' })
    return { host, ig_id: String(me.user_id || me.id), username: me.username || '' }
  }
  if (/^\d{6,}$/.test(wanted)) {
    const acc = await graph(a, `/${wanted}`, { fields: 'id,username' })
    return { host, ig_id: String(acc.id), username: acc.username || '' }
  }
  // A Page's own token answers /me as the Page…
  let me = null
  try { me = await graph(a, '/me', { fields: 'instagram_business_account{id,username}' }) } catch (e) {
    if (e.kind === 'token' || e.kind === 'throttled') throw e
  }
  const own = me?.instagram_business_account
  if (own?.id && (!wanted || own.username?.toLowerCase() === wanted.toLowerCase()))
    return { host, ig_id: String(own.id), username: own.username || '' }
  // …a person's token lists the Pages they manage.
  const pages = await graph(a, '/me/accounts', { fields: 'name,instagram_business_account{id,username}', limit: '100' })
  const found = (pages.data || []).map((p) => p.instagram_business_account).filter((x) => x?.id)
  const pick = wanted ? found.filter((x) => x.username?.toLowerCase() === wanted.toLowerCase()) : found
  if (pick.length === 1) return { host, ig_id: String(pick[0].id), username: pick[0].username || '' }
  if (!found.length) throw new GraphError('This token reaches no Instagram Business or Creator account — the account has to be connected to a Facebook Page the token can read', 0, 400)
  throw new GraphError(`This token reaches ${found.map((x) => '@' + x.username).join(', ')} — type which one beside it`, 0, 400)
}

// One account's media posted on or after `since`, newest first, as shortcode →
// media. Paged by Instagram's own cursor (never by following an address it
// hands back), and stopped at the first one older than `since`.
async function listMedia(a, since) {
  const out = new Map()
  let after = null
  for (let page = 0; page < 10; page++) {
    const j = await graph(a, a.host === 'ig' ? '/me/media' : `/${a.ig_id}/media`, {
      fields: 'id,permalink,media_type,media_product_type,timestamp,like_count', limit: '100', ...(after ? { after } : {}),
    })
    let older = false
    for (const m of j.data || []) {
      const code = igShortcode(m.permalink)
      if (code && !out.has(code)) out.set(code, m)
      if (m.timestamp && Date.parse(m.timestamp) < since) older = true
    }
    after = j.paging?.cursors?.after
    if (older || !j.paging?.next || !after) break
  }
  return out
}

const valueOf = (d) => {
  const v = d?.total_value?.value ?? d?.values?.[0]?.value
  return typeof v === 'number' ? v : (v == null ? null : Number(v))
}
async function readInsights(a, mediaId) {
  const j = await graph(a, `/${mediaId}/insights`, { metric: 'views,reach' })
  const by = Object.fromEntries((j.data || []).map((d) => [d.name, valueOf(d)]))
  return { views: by.views ?? null, reach: by.reach ?? null }
}
// A percentage, 0–100, to one decimal. The API's description says
// "percentage"; a value of 1 or under is read as a fraction, because no reel
// is skipped by under 1% of the people who saw it.
export const skipPercent = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round((n <= 1 ? n * 100 : n) * 10) / 10
}
async function readSkip(a, mediaId) {
  const j = await graph(a, `/${mediaId}/insights`, { metric: 'reels_skip_rate' })
  const d = (j.data || []).find((x) => x.name === 'reels_skip_rate')
  return d ? skipPercent(valueOf(d)) : null
}

// ---- the board ------------------------------------------------------------------
const readState = async (k) => (await get('SELECT v FROM ig_state WHERE k = ?', k))?.v ?? null
const setState = (k, v) => ['INSERT OR REPLACE INTO ig_state (k, v) VALUES (?, ?)', k, v]
const parseList = (v) => { try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : [] } catch { return [] } }

// The channels that are Instagram accounts: the icon the board gives them, or
// the name. Instagram Main, Uzb, HR, Kazakhstan.
export async function igChannels() {
  return all("SELECT key, label FROM channels WHERE icon = 'instagram' OR key LIKE 'instagram%' OR lower(label) LIKE '%instagram%' ORDER BY sort, id")
}

// The published pieces on an Instagram channel, from `sinceDay` on, with what
// a run needs. Published = on a final stage and stamped done.
async function publishedPieces(sinceDay, igKeys) {
  const rows = await all(`
    SELECT c.id, c.title, c.channels, c.type, c.post_link, c.done_at, c.paid_month, c.assignee_id,
           c.views, c.views_at, c.views_by, c.skip_rate, c.skip_rate_at,
           m.state, m.detail, m.channel AS found_on, m.media_id, m.media_kind, m.posted_at, m.reach, m.likes,
           m.checked_at, m.skip_final_at, m.frozen_month
    FROM content c
    JOIN statuses s ON s.id = c.status_id AND s.is_final = 1
    LEFT JOIN ig_media m ON m.content_id = c.id
    WHERE c.done_at IS NOT NULL AND c.done_at >= ?
  `, sinceDay)
  return rows
    .map((r) => ({ ...r, ig: parseList(r.channels).filter((k) => igKeys.has(k)) }))
    .filter((r) => r.ig.length > 0)
}

// Which shortcodes sit on more than one live card, anywhere on the board.
async function twinsByCode() {
  const statuses = await all('SELECT id, label FROM statuses')
  const dead = new Set(statuses.filter((s) => /^deleted$/i.test(s.label)).map((s) => s.id))
  const rows = await all("SELECT id, status_id, post_link FROM content WHERE post_link LIKE '%instagr%'")
  const by = new Map()
  for (const r of rows) {
    if (dead.has(r.status_id)) continue
    const code = igShortcode(r.post_link)
    if (!code) continue
    if (!by.has(code)) by.set(code, [])
    by.get(code).push(r.id)
  }
  return by
}

// What the link alone says, before Instagram is asked anything.
function linkState(piece, twins) {
  if (!String(piece.post_link || '').trim()) return { state: 'no_link' }
  const code = igShortcode(piece.post_link)
  // A story at its story's or highlight's address has nothing to read: its
  // views are typed by hand on purpose (igStory).
  if (!code) return { state: piece.type === 'story' && igStory(piece.post_link) ? 'story' : 'not_instagram' }
  const ids = (twins.get(code) || []).filter((id) => id !== piece.id)
  if (ids.length) return { state: 'twin', code, detail: ids.join(',') }
  return { state: 'ok', code }
}

// Numbers typed by hand that are left alone: a month before the first run, or
// a month already paid.
const handTypedOf = (p, firstMonth) => tashkentDay(p.done_at).slice(0, 7) < firstMonth || !!p.paid_month

// ---- one run --------------------------------------------------------------------
let running = null
let lastRun = null
export const runState = () => ({ running: !!running, last: lastRun })

// `now` is for the suite (qa/instagram-suite.mjs), which lives a month in a
// minute; the server always reads the clock.
export function igRefresh({ why = 'daily', now } = {}) {
  if (!running) running = doRefresh(why, now).finally(() => { running = null; budget = null })
  return running
}

async function doRefresh(why, nowAt) {
  const started = new Date(nowAt ?? Date.now())
  const now = started.getTime()
  const iso = started.toISOString()
  const today = tashkentDay(iso)
  const month = today.slice(0, 7)
  const chans = await igChannels()
  const igKeys = new Set(chans.map((c) => c.key))
  const accs = accounts()
  const states = Object.fromEntries((await all('SELECT k, v FROM ig_state')).map((r) => [r.k, r.v]))
  const summary = { why, at: iso, calls: 0, read: 0, written: 0, frozen: 0, unmatched: 0, errors: [] }
  const done = async (writes, note) => {
    if (note) summary.note = note
    writes.push(setState('last_run', JSON.stringify(summary)))
    await batch(writes)
    lastRun = summary
    return summary
  }
  // Paused by Instagram: not one call until the pause is over.
  if (states.paused_until && Date.parse(states.paused_until) > now) return done([], 'Instagram asked us to slow down — reading again tomorrow')
  // A token refused before is not tried again until a new one is pasted.
  const live = Object.entries(accs).filter(([k, a]) => igKeys.has(k) && states[`dead:${k}`] !== tailOf(a.token))
  if (!live.length) { lastRun = { ...summary, note: 'no account is connected' }; return lastRun }

  // The first month this ever ran in. Pieces of months before it keep the
  // numbers people typed (see the head of this file).
  const writes = []
  let firstMonth = states.first_month
  if (!firstMonth) { firstMonth = month; writes.push(setState('first_month', month)) }

  const pieces = await publishedPieces(new Date(now - WINDOW_DAYS * DAY).toISOString(), igKeys)
  const twins = await twinsByCode()

  // What each piece still needs from Instagram. Nothing at all for a piece
  // whose numbers are settled: frozen, paid, typed by hand, its week over.
  const plan = pieces.map((p) => {
    const pmonth = tashkentDay(p.done_at).slice(0, 7)
    const ls = linkState(p, twins)
    const hand = handTypedOf(p, firstMonth)
    const wantViews = !hand && !p.frozen_month && pmonth <= month
    const wantSkip = !hand && !p.skip_final_at && (p.media_kind ? p.media_kind === 'REELS' : true)
    return { p, pmonth, ls, hand, ask: ls.state === 'ok' && (wantViews || wantSkip), wantViews, wantSkip }
  })
  const asking = plan.filter((x) => x.ask)
  // Back well past the oldest piece asked about (a card is sometimes moved to
  // Published days after the post went up).
  const since = asking.reduce((m, x) => Math.min(m, Date.parse(x.p.done_at)), now) - 14 * DAY

  budget = { calls: 0, stop: null }
  const media = new Map()   // shortcode → { m, key, a }
  const failed = new Map()  // key → Instagram's words
  if (asking.length) {
    for (const [key, a0] of live) {
      if (budget.stop) break
      try {
        let a = a0
        if (!a.ig_id) {
          a = { ...a, ...(await resolveAccount(a.token)) }
          if (a.from === 'environment') envResolved.set(key, { host: a.host, ig_id: a.ig_id, username: a.username })
        }
        for (const [code, m] of await listMedia(a, since)) if (!media.has(code)) media.set(code, { m, key, a })
        writes.push(setState(`error:${key}`, ''))
      } catch (e) {
        failed.set(key, e.message)
        if (e.kind !== 'stopped') summary.errors.push({ channel: key, error: e.message })
        if (e.kind !== 'stopped') writes.push(setState(`error:${key}`, e.message))
        if (e.kind === 'token') writes.push(setState(`dead:${key}`, tailOf(a0.token)))
      }
    }
  }

  for (const x of plan) {
    const { p, pmonth, ls, hand } = x
    let state = ls.state
    let detail = ls.detail || null
    const hit = ls.code ? media.get(ls.code) : null
    // A piece with nothing to ask keeps what it had; only its link is read again.
    if (!x.ask) {
      if (state !== 'ok' && state !== p.state) {
        writes.push(['INSERT OR REPLACE INTO ig_media (content_id, shortcode, state, detail, checked_at, skip_final_at, frozen_month) VALUES (?, ?, ?, ?, ?, ?, ?)',
          p.id, ls.code || null, state, detail, iso, p.skip_final_at || null, p.frozen_month || null])
      }
      if (state !== 'ok' && state !== 'story') summary.unmatched++
      continue
    }
    if (!hit) {
      if (budget.stop && !failed.size) continue // not looked for this time: no verdict
      if (p.ig.some((k) => failed.has(k))) { state = 'error'; detail = p.ig.map((k) => failed.get(k)).find(Boolean) }
      else if (p.ig.some((k) => !live.some(([lk]) => lk === k))) state = 'no_token'
      else if (failed.size) { state = 'error'; detail = [...failed.values()][0] }
      else state = 'foreign'
    }
    let views = null, reach = null, skip = null
    const reel = hit?.m?.media_product_type === 'REELS'
    if (state === 'ok' && x.wantViews && !budget.stop) {
      try {
        ;({ views, reach } = await readInsights(hit.a, hit.m.id))
        summary.read++
      } catch (e) {
        // Stopped or told to slow down: this piece keeps what it had.
        if (e.kind === 'stopped' || e.kind === 'throttled') continue
        state = 'error'; detail = e.message
        if (e.kind === 'token') { failed.set(hit.key, e.message); writes.push(setState(`dead:${hit.key}`, tailOf(hit.a.token)), setState(`error:${hit.key}`, e.message)) }
      }
    }
    const skipNo = hit && states[`skip:${hit.key}`] === 'no'
    if (state === 'ok' && reel && x.wantSkip && !skipNo && !budget.stop) {
      try { skip = await readSkip(hit.a, hit.m.id) } catch (e) {
        // A metric this account will not give: said once on the settings
        // page, never asked again, and the skip rate stays typed by hand.
        if (!e.kind && (e.code === 100 || e.status === 400)) {
          states[`skip:${hit.key}`] = 'no'
          writes.push(setState(`skip:${hit.key}`, 'no'))
        }
      }
      if (skip != null && states[`skip:${hit.key}`] !== 'yes') { states[`skip:${hit.key}`] = 'yes'; writes.push(setState(`skip:${hit.key}`, 'yes')) }
    }

    const posted = hit?.m?.timestamp ? Date.parse(hit.m.timestamp) : Date.parse(p.done_at)
    const age = (now - posted) / DAY
    const freezeNow = views != null && !hand && !p.frozen_month && pmonth < month
    const viewsNow = views != null && !hand && !p.frozen_month
    const skipNow = skip != null && !hand
    // A non-reel has no skip week to wait for: settled once it is matched.
    const skipFinal = p.skip_final_at || (skipNow && age >= SKIP_DAYS) || (state === 'ok' && hit && !reel) || (state === 'ok' && reel && skipNo) ? (p.skip_final_at || iso) : null
    summary.calls = budget.calls

    if (viewsNow && skipNow) {
      writes.push(["UPDATE content SET views = ?, views_at = ?, views_by = 'instagram_api', skip_rate = ?, skip_rate_at = ? WHERE id = ?", views, iso, skip, iso, p.id])
    } else if (viewsNow) {
      writes.push(["UPDATE content SET views = ?, views_at = ?, views_by = 'instagram_api' WHERE id = ?", views, iso, p.id])
    } else if (skipNow) {
      writes.push(['UPDATE content SET skip_rate = ?, skip_rate_at = ? WHERE id = ?', skip, iso, p.id])
    }
    if (viewsNow) summary.written++
    if (freezeNow) summary.frozen++
    if (state !== 'ok') summary.unmatched++

    writes.push([`INSERT OR REPLACE INTO ig_media (content_id, shortcode, channel, media_id, media_kind, state, detail, reach, likes,
                   posted_at, checked_at, skip_final_at, frozen_month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id, ls.code || null, hit?.key || null, hit?.m?.id || null, hit ? (reel ? 'REELS' : 'FEED') : null,
      state, detail, reach ?? p.reach ?? null, hit?.m?.like_count ?? null, hit?.m?.timestamp || null, iso,
      skipFinal, freezeNow ? pmonth : p.frozen_month || null])
    if (views != null || skip != null)
      writes.push(['INSERT OR REPLACE INTO ig_history (content_id, day, views, skip_rate, reach, likes, frozen) VALUES (?, ?, ?, ?, ?, ?, ?)',
        p.id, today, views, skip, reach, hit?.m?.like_count ?? null, freezeNow ? 1 : 0])
  }
  summary.calls = budget.calls
  if (budget.stop) {
    summary.note = budget.stop
    // Told to slow down: every read waits a day.
    if (/slow down/.test(budget.stop)) writes.push(setState('paused_until', new Date(now + DAY).toISOString()))
  }
  // A reading is kept 90 days; a frozen one for good.
  writes.push(['DELETE FROM ig_history WHERE frozen = 0 AND day < ?', new Date(now - 90 * DAY).toISOString().slice(0, 10)])
  return done(writes)
}

// Once a day: the nightly job calls this, and so does the first request of a
// day (app.js), whichever comes first. The day is written down before the run,
// so two requests in the same second do not both start one.
export async function igDaily() {
  if (running) return null
  if (!Object.keys(accounts()).length) return null
  const today = dayISO()
  if ((await readState('last_day')) === today) return null
  await run('INSERT OR REPLACE INTO ig_state (k, v) VALUES (?, ?)', 'last_day', today)
  return igRefresh({ why: 'daily' })
}

// "Read now", by hand: refused while a run goes, inside half an hour of the
// last run, and while Instagram has asked for a pause. → the refusal, or null.
export async function handRefusal(now = Date.now()) {
  if (running) return null
  const paused = await readState('paused_until')
  if (paused && Date.parse(paused) > now) return 'Instagram asked us to slow down — reading again tomorrow'
  let last = lastRun
  if (!last) { try { last = JSON.parse((await readState('last_run')) || 'null') } catch { last = null } }
  if (last?.at && now - Date.parse(last.at) < HAND_GAP && last.calls > 0) return 'Instagram was read less than half an hour ago — try again later'
  return null
}

// ---- what the pages read --------------------------------------------------------
export async function igStatus() {
  const chans = await igChannels()
  const accs = accounts()
  const states = Object.fromEntries((await all('SELECT k, v FROM ig_state')).map((r) => [r.k, r.v]))
  let last = lastRun
  if (!last && states.last_run) { try { last = JSON.parse(states.last_run) } catch { last = null } }
  return {
    channels: chans.map((c) => {
      const a = accs[c.key]
      return {
        key: c.key, label: c.label,
        connected: !!a,
        from: a?.from || null,
        username: a?.username || null,
        via: a ? (a.host === 'ig' ? 'instagram' : 'facebook') : null,
        tail: a ? tailOf(a.token) : null,
        saved_at: a?.saved_at || null,
        error: states[`error:${c.key}`] || null,
        stopped: !!a && states[`dead:${c.key}`] === tailOf(a.token),
        skip: states[`skip:${c.key}`] || null, // 'yes' | 'no' | null (not asked yet)
      }
    }),
    running: !!running,
    last,
    paused_until: states.paused_until && Date.parse(states.paused_until) > Date.now() ? states.paused_until : null,
    first_month: states.first_month || null,
  }
}

// A new token for a channel: checked with one or two reads, then kept. Whatever
// was said about the old one — refused, no skip rate — is forgotten with it.
export async function saveAccount(key, token, want, by) {
  const t = String(token || '').trim()
  const r = await resolveAccount(t, want)
  const s = readFileStore()
  s.accounts[key] = { token: t, ...r, saved_at: new Date().toISOString(), saved_by: by }
  writeFileStore(s)
  await batch([['DELETE FROM ig_state WHERE k IN (?, ?, ?)', `dead:${key}`, `error:${key}`, `skip:${key}`]])
  return r
}
export function forgetAccount(key) {
  const s = readFileStore()
  delete s.accounts[key]
  if (Object.keys(s.accounts).length) writeFileStore(s)
  else { try { if (existsSync(tokenFile())) unlinkSync(tokenFile()) } catch { /* already gone */ } }
}

// The published Instagram pieces that have no numbers from Instagram, and why,
// per channel. The link's own problems are read now (fixing the link clears
// them at once); what only Instagram can say is the last run's. Pieces whose
// numbers are typed by hand on purpose are not listed.
export async function unmatched() {
  const chans = await igChannels()
  const igKeys = new Set(chans.map((c) => c.key))
  const from = `${dayISO().slice(0, 7)}-01`
  const prev = new Date(Date.parse(from) - DAY).toISOString().slice(0, 7)
  const firstMonth = (await readState('first_month')) || from.slice(0, 7)
  const pieces = await publishedPieces(`${prev}-01`, igKeys)
  const twins = await twinsByCode()
  const users = Object.fromEntries((await all('SELECT id, name FROM users')).map((u) => [u.id, u.name]))
  const out = []
  for (const p of pieces) {
    const ls = linkState(p, twins)
    let state = ls.state
    let detail = ls.detail || null
    if (state === 'ok') {
      if (handTypedOf(p, firstMonth)) continue
      if (!p.state) state = 'pending'
      else if (p.state !== 'ok' && !['no_link', 'not_instagram', 'twin', 'story'].includes(p.state)) { state = p.state; detail = p.detail }
      else if (p.state !== 'ok') state = 'pending' // the link was fixed since the last read
    }
    if (state === 'ok' || state === 'story') continue
    out.push({
      id: p.id, title: p.title, channel: p.ig[0], channels: p.ig, type: p.type,
      day: tashkentDay(p.done_at), maker: users[p.assignee_id] || null,
      post_link: p.post_link || null, state, detail,
      twins: state === 'twin' ? String(detail || '').split(',').filter(Boolean).map(Number) : [],
    })
  }
  out.sort((a, b) => (a.day < b.day ? 1 : -1))
  return {
    channels: chans.map((c) => ({ key: c.key, label: c.label, rows: out.filter((r) => r.channel === c.key) })),
  }
}

// One task's Instagram reading, for the task window.
export async function taskReading(id) {
  const m = await get('SELECT state, detail, channel, media_kind, reach, likes, checked_at, skip_final_at, frozen_month FROM ig_media WHERE content_id = ?', id)
  if (!m) return null
  const skip = m.channel ? await readState(`skip:${m.channel}`) : null
  return { ...m, skip_from_api: skip === 'yes', skip_refused: skip === 'no' }
}
