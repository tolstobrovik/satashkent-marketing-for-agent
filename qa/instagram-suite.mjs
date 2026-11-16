// Instagram's numbers (server/instagram.js, routes/instagram.js) against a mock
// Graph API that answers like the real one, errors included.
//
//   the link        /p/, /reel/, /reels/, /<account>/p/, ?igsh= and utm_
//                   tails, two links in one field: one shortcode
//   one post        the same reel pasted with another ?igsh= is refused on a
//                   second card, and the refusal names the first
//   the wall        a piece going out on Instagram alone is published at an
//                   Instagram post's address
//   the keys        pasted by a whole-board admin, kept in a file of their
//                   own — never in the database, never sent back whole
//   the run         views (views_by 'instagram_api'), a reel's skip rate, the
//                   account that will not give it, the post from an account
//                   nobody connected, the link on two cards
//   caution         only GETs to the five read addresses ever leave; a settled
//                   piece is never asked again; a refused token and a "slow
//                   down" are not tried again; half of Meta's gauge stops a run;
//                   "Read now" waits half an hour
//   the calendar    the skip rate kept at day 7, the month frozen on the 1st,
//                   months typed by hand before the first run left alone
//
// Self-contained: API :4146, mock Graph :4147, plus one database in-process.
//   DASHB_ROOT=$PWD node qa/instagram-suite.mjs
import { spawn } from 'child_process'
import { createServer } from 'http'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'

const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
const BASE = 'http://localhost:4146'
const GRAPH = 'http://localhost:4147'
const STAMP = Date.now()

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const procs = []
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL') } catch { /* gone */ } } })

// ---- the mock Graph API ---------------------------------------------------------
// Main is read through a Facebook Page token, Uzb through an Instagram Login
// token, and Uzb's API will not give the skip rate.
const MAIN = { id: '17840000000000001', username: 'satashkent' }
const UZB = { id: '17840000000000002', username: 'satashkent.uz' }
const NOW_TS = new Date().toISOString().replace('Z', '+0000')
const media = {
  [MAIN.id]: [
    { id: '1805', permalink: 'https://www.instagram.com/p/EEE555ee/', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: NOW_TS, like_count: 3 },
    { id: '1801', permalink: 'https://www.instagram.com/reel/AAA111aa/', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-10-19T09:00:00+0000', like_count: 50 },
    { id: '1804', permalink: 'https://www.instagram.com/reel/DDD444dd/', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-10-10T09:00:00+0000', like_count: 1 },
    { id: '1802', permalink: 'https://www.instagram.com/p/BBB222bb/', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: '2026-09-25T09:00:00+0000', like_count: 7 },
  ],
  [UZB.id]: [
    { id: '1803', permalink: 'https://www.instagram.com/reel/CCC333cc/', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-10-16T09:00:00+0000', like_count: 9 },
  ],
}
const insights = { 1801: { views: 1200, reach: 900, skip: 0.42 }, 1802: { views: 300, reach: 280 }, 1803: { views: 77, reach: 60, skip: 0.3 }, 1804: { views: 10, reach: 9, skip: 51 }, 1805: { views: 300, reach: 250 } }
// Every request the mock was sent, and two switches: "slow down", and Meta's gauge.
const mock = { log: [], throttle: false, gauge: 0 }
const asked = (id) => mock.log.filter((x) => x.path === `/${id}/insights`).length
const graph = createServer((req, res) => {
  const u = new URL(req.url, GRAPH)
  const tok = u.searchParams.get('access_token') || ''
  const p = u.pathname.replace(/^\/v[\d.]+/, '')
  mock.log.push({ method: req.method, path: p, params: [...u.searchParams.keys()].filter((k) => k !== 'access_token') })
  const headers = { 'Content-Type': 'application/json' }
  if (mock.gauge) headers['x-app-usage'] = JSON.stringify({ call_count: mock.gauge, total_cputime: 1, total_time: 1 })
  const send = (code, body) => { res.writeHead(code, headers); res.end(JSON.stringify(body)) }
  const err = (code, message, status = 400) => send(status, { error: { message, type: 'OAuthException', code } })
  if (tok.includes('dead')) return err(190, 'Error validating access token: Session has expired')
  const acct = tok.startsWith('EAAmain') ? MAIN : tok.startsWith('IGAAuzb') ? UZB : tok.startsWith('EAAuser') ? null : undefined
  if (acct === undefined) return err(190, 'Invalid OAuth access token')
  if (p === '/me' && tok.startsWith('IGAA')) return send(200, { id: 'app-scoped', user_id: acct.id, username: acct.username })
  if (p === '/me') return send(200, acct ? { id: 'page1', instagram_business_account: acct } : { id: 'person1' })
  if (p === '/me/accounts') return send(200, { data: [{ name: 'SAT', instagram_business_account: MAIN }, { name: 'SAT Uzb', instagram_business_account: UZB }] })
  if (/^\/\d+$/.test(p)) { const a = [MAIN, UZB].find((x) => x.id === p.slice(1)); return a ? send(200, a) : err(100, 'Unsupported get request') }
  const list = p.match(/^\/(me|\d+)\/media$/)
  if (list) {
    const who = list[1] === 'me' ? acct : [MAIN, UZB].find((a) => a.id === list[1])
    const every = media[who.id] || []
    // One a page, with Instagram's cursor, so the suite pages a long feed.
    const after = Number(u.searchParams.get('after') || 0)
    const more = after + 1 < every.length
    return send(200, { data: every.slice(after, after + 1), paging: more ? { cursors: { after: String(after + 1) }, next: `${GRAPH}/never-followed` } : {} })
  }
  const ins = p.match(/^\/(\d+)\/insights$/)
  if (ins) {
    if (mock.throttle) return err(4, 'Application request limit reached')
    const m = insights[ins[1]]
    const metric = u.searchParams.get('metric')
    if (metric === 'reels_skip_rate') {
      if (acct === UZB) return err(100, '(#100) The metric reels_skip_rate is not supported')
      return send(200, { data: [{ name: 'reels_skip_rate', period: 'lifetime', values: [{ value: m.skip }] }] })
    }
    return send(200, { data: metric.split(',').map((name) => ({ name, period: 'lifetime', values: [{ value: m[name] }] })) })
  }
  err(100, `Unknown path ${p}`)
})
await new Promise((r) => graph.listen(4147, r))

// ---- the link, read on its own --------------------------------------------------
const UNIT_TOKENS = join(tmpdir(), `ig-unit-tok-${STAMP}.json`)
Object.assign(process.env, {
  DATA_DIR: join(tmpdir(), `ig-unit-${STAMP}`), INSTAGRAM_TOKEN_FILE: UNIT_TOKENS,
  IG_GRAPH_FB_BASE: GRAPH, IG_GRAPH_IG_BASE: GRAPH, IG_PAUSE_MS: '0',
  GITHUB_DATA_TOKEN: '', GH_DATA_TOKEN: '', DATABASE_URL: '',
})
const ig = await import(pathToFileURL(join(ROOT, 'server/instagram.js')).href)
const db = await import(pathToFileURL(join(ROOT, 'server/db.js')).href)
const { postKey } = await import(pathToFileURL(join(ROOT, 'server/routes/content.js')).href)
const S = ig.igShortcode
ok('a /p/ link', S('https://www.instagram.com/p/DPq1aB2cD3e/') === 'DPq1aB2cD3e')
ok('a /reel/ link', S('https://instagram.com/reel/DPq1aB2cD3e') === 'DPq1aB2cD3e')
ok('a /reels/ link', S('https://www.instagram.com/reels/DPq1aB2cD3e/') === 'DPq1aB2cD3e')
ok('an /<account>/p/ link', S('https://www.instagram.com/satashkent/p/DPq1aB2cD3e/') === 'DPq1aB2cD3e')
ok('an /<account>/reel/ link with ?igsh=', S('https://www.instagram.com/satashkent/reel/DPq1aB2cD3e/?igsh=MWx4') === 'DPq1aB2cD3e')
ok('?igsh=, ?stkn= and utm_ tails are not the code', S('https://www.instagram.com/reel/DPq1aB2cD3e/?igsh=abc&utm_source=ig_web_copy_link') === 'DPq1aB2cD3e'
  && S('https://www.instagram.com/p/DPq1aB2cD3e?stkn=xyz') === 'DPq1aB2cD3e')
ok('no scheme, no www', S('instagram.com/p/DPq1aB2cD3e') === 'DPq1aB2cD3e')
ok('two links in one field: the first', S('https://instagram.com/reel/FIRST1234/ https://instagram.com/p/SECOND123/') === 'FIRST1234')
ok('…even glued together', S('https://instagram.com/reel/FIRST1234/https://instagram.com/p/SECOND123/') === 'FIRST1234')
ok('the case of a shortcode is kept', S('https://instagram.com/p/AbCdEf123/') === 'AbCdEf123')
ok('a profile, a story and another site are no post',
  !S('https://instagram.com/satashkent/') && !S('https://instagram.com/stories/satashkent/123/') && !S('https://t.me/satashkent/5'))
ok('a story, a highlight and the app’s share link are a story’s address',
  ig.igStory('https://www.instagram.com/stories/satashkent/3456789012345678901/')
  && ig.igStory('https://www.instagram.com/stories/highlights/18116857682329206/')
  && ig.igStory('https://www.instagram.com/s/aGlnaGxpZ2h0OjE4MTE2ODU3NjgyMzI5MjA2?story_media_id=1&igsh=x'))
ok('…without a scheme too', ig.igStory('instagram.com/stories/highlights/18116857682329206'))
ok('…and a post, a profile and another site are not',
  !ig.igStory('https://instagram.com/p/DPq1aB2cD3e/') && !ig.igStory('https://instagram.com/satashkent/') && !ig.igStory('https://example.com/stories/1'))
ok('…nor a story address with no id: today’s stories of an account, gone tomorrow',
  !ig.igStory('https://www.instagram.com/stories/satashkent/') && !ig.igStory('https://www.instagram.com/stories/highlights/'))
ok('…nor instagram.com as a word in another site’s path',
  !ig.igStory('https://example.com/instagram.com/stories/highlights/1/') && !ig.igStory('https://notinstagram.com/stories/a/1'))
ok('a highlight is told from a single story',
  ig.igHighlight('https://www.instagram.com/stories/highlights/18116857682329206/') && !ig.igHighlight('https://www.instagram.com/stories/satashkent/3456789012345678901/'))
ok('one post is one key, whatever its tail', postKey('https://www.instagram.com/reel/AAA111aa/?igsh=one') === postKey('instagram.com/satashkent/reel/AAA111aa?igsh=two'))
ok('…and other sites keep their query (youtube.com/watch?v=)', postKey('https://youtube.com/watch?v=a') !== postKey('https://youtube.com/watch?v=b'))
ok('a fraction is read as a percentage', ig.skipPercent(0.42) === 42 && ig.skipPercent(51) === 51 && ig.skipPercent(-1) === null)
ok('the five read addresses are reads', ig.isRead('/me', { fields: 'x' }) && ig.isRead('/me/accounts') && ig.isRead('/1784/media', { after: '1' })
  && ig.isRead('/me/media') && ig.isRead('/1801/insights', { metric: 'views' }))
ok('nothing else leaves: publishing, comments, messages, tokens, settings', ['/1784/media_publish', '/1801/comments', '/me/messages', '/refresh_access_token',
  '/oauth/access_token', '/1784/subscribed_apps', '/me/feed', '/1801/replies', '/1784/tags'].every((x) => !ig.isRead(x)))
ok('…nor a read with a field that is not one', !ig.isRead('/1801/insights', { metric: 'views', message: 'hi' }) && !ig.isRead('/me', { method: 'post' }))

// ---- the calendar, in-process ----------------------------------------------------
// One database and a clock the suite moves: October 2026, the first month the
// reading runs in, then the 1st of November.
await db.initDb()
const { get, all, run } = db
const final = (await get('SELECT id FROM statuses WHERE is_final = 1')).id
const admin = (await get("SELECT id FROM users WHERE username = 'admin'")).id
const piece = async (title, link, doneAt, x = {}) => (await run(
  `INSERT INTO content (title, channels, type, status_id, assignee_id, post_link, done_at, created_at, views, views_by, paid_month)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  title, JSON.stringify(x.channels || ['instagram_main']), x.type || 'reel', final, admin, link, doneAt, doneAt,
  x.views ?? null, x.views_by ?? null, x.paid_month ?? null)).lastInsertRowid
const tokens = (accounts) => writeFileSync(UNIT_TOKENS, JSON.stringify({ accounts }))
const row = (id) => get('SELECT views, views_by, views_at, skip_rate FROM content WHERE id = ?', id)
const igRow = (id) => get('SELECT * FROM ig_media WHERE content_id = ?', id)

const A = await piece('September post, typed by hand', 'https://www.instagram.com/p/BBB222bb/', '2026-09-25T10:00:00.000Z', { type: 'post', views: 500, views_by: admin })
const B = await piece('October reel', 'https://www.instagram.com/satashkent/reel/AAA111aa/?igsh=MWx4 https://t.me/x/1', '2026-10-19T10:00:00.000Z')
const C = await piece('Paid already', 'https://instagram.com/reel/DDD444dd', '2026-10-10T10:00:00.000Z', { paid_month: '2026-10' })
const D = await piece('A collab', 'https://instagram.com/reel/ZZZ999zz/', '2026-10-15T10:00:00.000Z')
const E = await piece('On Uzb', 'https://instagram.com/reel/CCC333cc/', '2026-10-16T10:00:00.000Z', { channels: ['instagram_uzb'] })
const F = await piece('Twin one', 'https://instagram.com/p/TWIN12345/?igsh=1', '2026-10-17T10:00:00.000Z')
const G = await piece('Twin two', 'https://www.instagram.com/p/TWIN12345?igsh=2', '2026-10-18T10:00:00.000Z')
const H = await piece('Also on Telegram', 'https://t.me/satashkent/77', '2026-10-18T11:00:00.000Z', { channels: ['instagram_main', 'telegram_uzb'] })
const I = await piece('Nothing pasted', null, '2026-10-18T12:00:00.000Z')

ok('nothing connected: a run asks Instagram nothing', (await ig.igRefresh({ now: Date.parse('2026-10-20T08:00:00Z') })).read === 0)
tokens({ instagram_main: { token: 'EAAmain-0000000000000000', host: 'fb', ig_id: MAIN.id, username: MAIN.username, saved_at: '2026-10-20T00:00:00Z' } })
let sum = await ig.igRefresh({ now: Date.parse('2026-10-20T08:00:00Z') })
ok('the first run reads only what it will write', sum.read === 1 && sum.errors.length === 0, JSON.stringify(sum))
let r = await row(B)
ok('an October reel gets its views from Instagram', r.views === 1200 && r.views_by === 'instagram_api' && !!r.views_at, JSON.stringify(r))
ok('…and its skip rate, as a percentage', r.skip_rate === 42, String(r.skip_rate))
ok('…not yet kept for good: it is a day old', !(await igRow(B)).skip_final_at)
ok('…reach and likes are kept beside it', (await igRow(B)).reach === 900 && (await igRow(B)).likes === 50)
r = await row(A)
ok('a September piece, typed before the first run, keeps its typed views', r.views === 500 && Number(r.views_by) === admin, JSON.stringify(r))
ok('…and Instagram is not even asked about it', asked('1802') === 0)
ok('a piece of a paid month is never written over, nor asked about', (await row(C)).views == null && (await row(C)).skip_rate == null && asked('1804') === 0)
ok('a post no connected account has: "posted from an account we cannot read"', (await igRow(D)).state === 'foreign')
ok('a post on a channel nobody connected: "not connected"', (await igRow(E)).state === 'no_token')
ok('one shortcode on two cards: neither is counted', (await igRow(F)).state === 'twin' && (await igRow(G)).state === 'twin'
  && (await igRow(F)).detail === String(G) && (await row(F)).views == null)
ok('a link that is not an Instagram post', (await igRow(H)).state === 'not_instagram')
ok('no link at all', (await igRow(I)).state === 'no_link')

// A week on: Uzb connected with an Instagram Login token, the reel a week old.
tokens({
  instagram_main: { token: 'EAAmain-0000000000000000', host: 'fb', ig_id: MAIN.id, username: MAIN.username, saved_at: '2026-10-20T00:00:00Z' },
  instagram_uzb: { token: 'IGAAuzb-0000000000000000', host: 'ig', ig_id: UZB.id, username: UZB.username, saved_at: '2026-10-27T00:00:00Z', refreshed_at: new Date().toISOString() },
})
insights[1801] = { views: 1500, reach: 1100, skip: 0.45 }
sum = await ig.igRefresh({ now: Date.parse('2026-10-27T08:00:00Z') })
r = await row(B)
ok('day 8: the views move', r.views === 1500, String(r.views))
ok('…and the skip rate is read at about a week and kept from then on', r.skip_rate === 45 && !!(await igRow(B)).skip_final_at, String(r.skip_rate))
ok('a reel on Uzb gets its views', (await row(E)).views === 77 && (await igRow(E)).state === 'ok')
ok('…and an account that will not give the skip rate leaves it to be typed', (await row(E)).skip_rate == null
  && (await get("SELECT v FROM ig_state WHERE k = 'skip:instagram_uzb'"))?.v === 'no')

// The 1st of November, 07:00 in Tashkent: October is frozen.
insights[1801] = { views: 2000, reach: 1300, skip: 0.6 }
sum = await ig.igRefresh({ now: Date.parse('2026-11-01T02:00:00Z') })
r = await row(B)
ok('the 1st: October is read one last time and frozen', r.views === 2000 && (await igRow(B)).frozen_month === '2026-10' && sum.frozen >= 1, JSON.stringify(sum))
ok('…the skip rate kept at day 7 does not move', r.skip_rate === 45, String(r.skip_rate))
ok('…and the frozen reading is in the history for good', (await get('SELECT frozen, views FROM ig_history WHERE content_id = ? AND day = ?', B, '2026-11-01'))?.frozen === 1)
insights[1801] = { views: 2600, reach: 1500, skip: 0.6 }
const before = asked('1801')
await ig.igRefresh({ now: Date.parse('2026-11-02T08:00:00Z') })
ok('the 2nd: the frozen views stay, so the salary does not move', (await row(B)).views === 2000)
ok('…and a settled piece is not asked again', asked('1801') === before, `${asked('1801') - before} more`)
ok('a reel whose account will not give the skip rate is not asked it again',
  mock.log.filter((x) => x.path === '/1803/insights' && x.params.includes('metric')).length <= 3, String(asked('1803')))

// A dead token: said once, and never tried again until a new one is pasted.
// D, the collab, is still asked about, so the run has a reason to call.
tokens({ instagram_main: { token: 'EAAdead-0000000000000000', host: 'fb', ig_id: MAIN.id, username: MAIN.username, saved_at: '2026-10-20T00:00:00Z' } })
sum = await ig.igRefresh({ now: Date.parse('2026-11-03T08:00:00Z') })
ok('an expired token is said in plain words', /expired or was revoked/.test(sum.errors[0]?.error || ''), JSON.stringify(sum.errors))
ok('…and the views already read stay', (await row(B)).views === 2000)
let calls = mock.log.length
sum = await ig.igRefresh({ now: Date.parse('2026-11-04T08:00:00Z') })
ok('…and the dead token is not tried again', mock.log.length === calls && sum.calls === 0, `${mock.log.length - calls} calls`)

// "Slow down": the run stops at once and every read waits a day.
await run('UPDATE content SET post_link = ? WHERE id = ?', 'https://instagram.com/p/oldlinkgone', B)
const N = await piece('November reel', 'https://www.instagram.com/reel/AAA111aa/', '2026-11-05T10:00:00.000Z')
tokens({ instagram_main: { token: 'EAAmain-1111111111111111', host: 'fb', ig_id: MAIN.id, username: MAIN.username, saved_at: '2026-11-05T00:00:00Z' } })
mock.throttle = true
calls = mock.log.length
sum = await ig.igRefresh({ now: Date.parse('2026-11-05T12:00:00Z') })
mock.throttle = false
const insightCalls = mock.log.slice(calls).filter((x) => /insights/.test(x.path)).length
ok('Instagram says slow down: the run stops at its first refusal', /slow down/.test(sum.note || '') && insightCalls === 1, `${insightCalls} · ${JSON.stringify(sum)}`)
ok('…and the piece keeps what it had, no error written on it', (await row(N)).views == null && (await igRow(N)) == null)
calls = mock.log.length
await ig.igRefresh({ now: Date.parse('2026-11-05T20:00:00Z') })
ok('…not one call is made until the pause is over', mock.log.length === calls, `${mock.log.length - calls} calls`)
ok('…and "Read now" is refused while it lasts', /slow down/.test((await ig.handRefusal(Date.parse('2026-11-05T21:00:00Z'))) || ''))

// Meta's own gauge at half: the run stops after the answer that said so.
await run("DELETE FROM ig_state WHERE k = 'paused_until'")
mock.gauge = 55
calls = mock.log.length
sum = await ig.igRefresh({ now: Date.parse('2026-11-07T08:00:00Z') })
mock.gauge = 0
ok('half of Meta’s limit used: the run stops', /half used/.test(sum.note || '') && mock.log.length - calls === 1, `${mock.log.length - calls} calls · ${sum.note}`)

ok('only GETs ever left the server', mock.log.length > 0 && mock.log.every((x) => x.method === 'GET'))
ok('…every one to a read address, with read fields only',
  mock.log.every((x) => ig.isRead(x.path, Object.fromEntries(x.params.map((k) => [k, 1])))), JSON.stringify(mock.log.find((x) => !ig.isRead(x.path))))
ok('…and no address Instagram handed back was followed', !mock.log.some((x) => x.path.includes('never-followed')))
ok('nothing of a token is in the database', !(await all('SELECT v FROM ig_state')).some((x) => /EAA|IGAA/.test(x.v || '')))
db.closeDb()

// ---- the routes, against a server of its own -------------------------------------
const DATA = join(tmpdir(), `ig-api-${STAMP}`)
const TOKFILE = join(tmpdir(), `ig-api-keys-${STAMP}`, 'instagram.json')
procs.push(spawn(process.execPath, [join(ROOT, 'server/index.js')], {
  env: {
    ...process.env, DATA_DIR: DATA, PORT: '4146', INSTAGRAM_TOKEN_FILE: TOKFILE,
    IG_GRAPH_FB_BASE: GRAPH, IG_GRAPH_IG_BASE: GRAPH, IG_PAUSE_MS: '0',
    GITHUB_DATA_TOKEN: '', GH_DATA_TOKEN: '', DATABASE_URL: '', CRON_SECRET: '', TELEGRAM_BOT_TOKEN: '', GEMINI_API_KEY: '',
  },
  stdio: 'ignore',
}))
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break } catch { /* not yet */ }
  await new Promise((res) => setTimeout(res, 500))
}
const login = async (u, p) => (await (await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }),
})).json()).token
const req = async (p, m = 'GET', b, t = T) => {
  const res = await fetch(BASE + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: b ? JSON.stringify(b) : undefined })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
const T = await login('admin', 'admin123')
ok('the API is up', !!T)

const member = await req('/users', 'POST', { name: `IG member ${STAMP}`, username: `igm${STAMP}`, password: 'member123', role: 'member' })
const TM = member.status < 300 ? await login(`igm${STAMP}`, 'member123') : null
if (TM) ok('a member cannot read or paste the keys', (await req('/instagram', 'GET', null, TM)).status === 403
  && (await req('/instagram/instagram_main', 'PUT', { token: 'EAAmain-0000000000000000' }, TM)).status === 403)

let st = await req('/instagram')
ok('the settings list the Instagram channels', st.status === 200 && st.data.channels.some((c) => c.key === 'instagram_main') && st.data.channels.every((c) => !c.connected), JSON.stringify(st.data).slice(0, 200))
ok('a channel that is not Instagram is refused', (await req('/instagram/telegram_uzb', 'PUT', { token: 'EAAmain-0000000000000000' })).status === 404)
ok('half a token is refused', (await req('/instagram/instagram_main', 'PUT', { token: 'EAA main' })).status === 400)
const bad = await req('/instagram/instagram_main', 'PUT', { token: 'EAAdead-0000000000000000' })
ok('a dead token is refused with Instagram’s reason, and not kept', bad.status === 400 && /expired/.test(bad.data.error) && !existsSync(TOKFILE), bad.data.error)
const many = await req('/instagram/instagram_main', 'PUT', { token: 'EAAuser-0000000000000000' })
ok('a person’s token that reaches two accounts asks which one', many.status === 400 && /@satashkent, @satashkent\.uz/.test(many.data.error), many.data.error)
const picked = await req('/instagram/instagram_uzb', 'PUT', { token: 'EAAuser-0000000000000000', account: '@satashkent.uz' })
ok('…and takes the one typed beside it', picked.status === 200 && picked.data.channels.find((c) => c.key === 'instagram_uzb')?.username === 'satashkent.uz')
const saved = await req('/instagram/instagram_main', 'PUT', { token: 'EAAmain-0000000000000000' })
const mainSt = saved.data.channels?.find((c) => c.key === 'instagram_main')
ok('a Page token is kept and read as its account', saved.status === 200 && mainSt?.connected && mainSt.username === 'satashkent' && mainSt.via === 'facebook', JSON.stringify(mainSt))
ok('…the token is never sent back, only its last four', !JSON.stringify(saved.data).includes('EAAmain') && mainSt.tail === '…0000')
ok('…it lives in its own file, outside the data folder', existsSync(TOKFILE) && readFileSync(TOKFILE, 'utf8').includes('EAAmain'))
ok('…and nowhere in the data folder', !readdirSync(DATA).some((f) => {
  try { return readFileSync(join(DATA, f)).includes('EAAmain-0000') } catch { return false }
}))

// The board's own walls, on real moves.
const statuses = (await req('/statuses')).data
const finalId = statuses.find((s) => s.is_final).id
const mk = async (title, channels = ['instagram_main'], type = 'post') => (await req('/content', 'POST', { title, channels, type, release_date: new Date().toISOString().slice(0, 10) })).data
const p1 = await mk(`IG one ${STAMP}`)
const elsewhere = await req(`/content/${p1.id}`, 'PATCH', { status_id: finalId, post_link: 'https://example.com/post' })
ok('a piece on Instagram alone is not published at another site’s address', elsewhere.status === 400 && /instagram\.com\/p/.test(elsewhere.data.error), JSON.stringify(elsewhere.data).slice(0, 160))
const pub = await req(`/content/${p1.id}`, 'PATCH', { status_id: finalId, post_link: 'https://www.instagram.com/satashkent/p/EEE555ee/?igsh=one' })
ok('…and is, at its Instagram post’s', pub.status === 200, JSON.stringify(pub.data).slice(0, 160))
const p2 = await mk(`IG two ${STAMP}`)
const twin = await req(`/content/${p2.id}`, 'PATCH', { post_link: 'instagram.com/p/EEE555ee?igsh=two' })
ok('the same post with another ?igsh= is refused on a second card', twin.status === 400 && twin.data.twin?.id === p1.id, JSON.stringify(twin.data).slice(0, 160))
const p3 = await mk(`IG three ${STAMP}`, ['instagram_main', 'telegram_uzb'])
const both = await req(`/content/${p3.id}`, 'PATCH', { status_id: finalId, post_link: 'https://t.me/satashkent/9' })
ok('a piece on Instagram and Telegram may carry the Telegram link', both.status === 200, JSON.stringify(both.data).slice(0, 160))
const s1 = await mk(`IG story ${STAMP}`, ['instagram_main'], 'story')
const profile = await req(`/content/${s1.id}`, 'PATCH', { status_id: finalId, post_link: 'https://www.instagram.com/satashkent/' })
ok('a story on Instagram alone is not published at the account’s address', profile.status === 400 && /instagram\.com\/stories/.test(profile.data.error), JSON.stringify(profile.data).slice(0, 160))
const kept = await req(`/content/${s1.id}`, 'PATCH', { status_id: finalId, post_link: 'https://www.instagram.com/stories/highlights/18116857682329206/' })
ok('…and is, at the highlight it is kept in', kept.status === 200, JSON.stringify(kept.data).slice(0, 160))
const p4 = await mk(`IG four ${STAMP}`)
const storyOnPost = await req(`/content/${p4.id}`, 'PATCH', { status_id: finalId, post_link: 'https://www.instagram.com/stories/satashkent/3456789012345678901/' })
ok('a post is not published at a story’s address, and is told why', storyOnPost.status === 400 && /not a story/.test(storyOnPost.data.error), JSON.stringify(storyOnPost.data).slice(0, 160))
const s2 = await mk(`IG story two ${STAMP}`, ['instagram_main'], 'story')
const shelf = await req(`/content/${s2.id}`, 'PATCH', { status_id: finalId, post_link: 'https://www.instagram.com/stories/highlights/18116857682329206/' })
ok('a second story kept in the same highlight is published at its address too — a highlight is no twin', shelf.status === 200, JSON.stringify(shelf.data).slice(0, 160))
const s3 = await mk(`IG story three ${STAMP}`, ['instagram_main'], 'story')
const one = 'https://www.instagram.com/stories/satashkent/3456789012345678902/'
await req(`/content/${s3.id}`, 'PATCH', { status_id: finalId, post_link: one })
const s4 = await mk(`IG story four ${STAMP}`, ['instagram_main'], 'story')
const sameStory = await req(`/content/${s4.id}`, 'PATCH', { post_link: one })
ok('…but one story’s own address is still one task', sameStory.status === 400 && sameStory.data.twin?.id === s3.id, JSON.stringify(sameStory.data).slice(0, 160))

// "Read now", and what the pages read after it.
const started = await req('/instagram/refresh', 'POST')
ok('"Read now" starts a run and answers at once', started.status === 202)
for (let i = 0; i < 40 && (st = await req('/instagram')).data.running; i++) await new Promise((res) => setTimeout(res, 250))
ok('…and says how it went', st.data.last && st.data.last.read >= 1, JSON.stringify(st.data.last))
const again = await req('/instagram/refresh', 'POST')
ok('"Read now" again within half an hour is refused', again.status === 429 && /half an hour/.test(again.data.error), JSON.stringify(again.data))
const t1 = (await req(`/content/${p1.id}`)).data
ok('the published post has its views from Instagram', t1.views === 300 && t1.views_by === 'instagram_api', `${t1.views} ${t1.views_by}`)
const reading = await req(`/instagram/task/${p1.id}`, 'GET', null, TM || T)
ok('…and its window can say so, to anybody on the board', reading.status === 200 && reading.data.state === 'ok' && !!reading.data.checked_at)
const un = await req('/instagram/unmatched')
const mainRows = un.data.channels?.find((c) => c.key === 'instagram_main')?.rows || []
ok('the Unmatched list names the piece with no Instagram link, and why', mainRows.some((x) => x.id === p3.id && x.state === 'not_instagram'), JSON.stringify(mainRows).slice(0, 200))
ok('…and not the one that was read', !mainRows.some((x) => x.id === p1.id))
ok('…nor the story at its highlight’s address: its views are typed by hand on purpose', !mainRows.some((x) => x.id === s1.id))
ok('…and the story’s window says so', (await req(`/instagram/task/${s1.id}`)).data?.state === 'story')
if (TM) ok('…for admins only', (await req('/instagram/unmatched', 'GET', null, TM)).status === 403)
const gone = await req('/instagram/instagram_uzb', 'DELETE')
ok('a channel can be disconnected', gone.status === 200 && !gone.data.channels.find((c) => c.key === 'instagram_uzb').connected)

graph.close()
console.log(fails ? `\n${fails} CHECKS FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
