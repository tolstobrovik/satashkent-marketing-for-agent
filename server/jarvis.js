// Jarvis — the platform's second brain, for the owner and the admins.
//
// Two things, both Gemini (gemini.js):
//
//   ASK     an admin asks anything — "who is overloaded?", "why is Instagram
//           late?", "what should we fix on the board?" — on the page or by
//           writing (or saying) it to the bot, and Jarvis answers from the
//           live board.
//   ALERTS  when it spots a problem, it says so — on Telegram and on the
//           page — and only then: a piece on its last allowed pravka, one
//           person with a pile of late steps, a place on the board people
//           keep tripping over, the same change asked again and again.
//           Each problem is told once a week at most; nothing new, no message.
//
// WHAT IT READS is what the asking admin could read: the board's own routes,
// called as them (selfapi.js) — the admin's day, the open pravkas, the
// statistics, the views, who made what — plus the usage report
// (routes/track.js) and the pravka lists of the last month. Real names go to
// Gemini: the owner's decision of 27 October 2026, for this feature.
//
// WHO. Full admins only (no channel limits): Jarvis reads the whole team.
import { createHash } from 'crypto'
import { all, get, run, dayISO, publicUser } from './db.js'
import { isFullAdmin } from './auth.js'
import { asPerson } from './selfapi.js'
import { reportOf } from './routes/track.js'
import { geminiReady, geminiAnswer } from './gemini.js'
import { tgMirror, tgEsc, tgPublicUrl } from './telegram.js'
import { tgWords } from './tgcopy.js'

export const jarvisFor = (user) => isFullAdmin(user)
const LANG = { en: 'English', ru: 'Russian', uz: 'Uzbek (Latin script; oʻ and gʻ with U+02BB)' }
const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 12)

// ---- the data -----------------------------------------------------------------
// Heavy and private fields out, long strings cut, long lists shortened — the
// board's answers were written for screens, not for a model's context.
const DROP = /photo|thumb|^data$|voice|avatar|password|token|script|^tz$|reference|description|caption|html|^code$/i
function slim(v, depth = 0) {
  if (v == null) return v
  if (typeof v === 'string') return v.startsWith('data:') ? '[file]' : v.length > 280 ? `${v.slice(0, 280)}…` : v
  if (Array.isArray(v)) return v.slice(0, 80).map((x) => slim(x, depth + 1))
  if (typeof v === 'object') {
    if (depth > 6) return '…'
    const o = {}
    for (const [k, x] of Object.entries(v)) {
      if (DROP.test(k) || x == null || x === '' || (Array.isArray(x) && !x.length)) continue
      o[k] = slim(x, depth + 1)
    }
    return o
  }
  return v
}
const cap = (s, n = 24000) => (s.length > n ? `${s.slice(0, n)}\n… (cut)` : s)
const section = (title, value) => {
  if (value == null || value === '') return ''
  const body = typeof value === 'string' ? value : JSON.stringify(slim(value))
  return `## ${title}\n${cap(body)}\n`
}
const ok = (r) => (r.status === 'fulfilled' ? r.value : null)
const okData = (r) => { const v = ok(r); return v && v.status === 200 ? v.data : null }

const lastDays = (n) => Array.from({ length: n }, (_, i) => dayISO(i - n + 1))

// The usage report, from "What to improve first" on — the conclusions and
// the evidence, not the raw lines.
async function usage(days) {
  const md = await reportOf(lastDays(days), `the last ${days} days`).catch(() => '')
  return md
}

// What reviewers asked to change, round by round, with the lists Gemini made.
async function recentAsks(days, names) {
  const since = new Date(Date.now() - days * 864e5).toISOString()
  const rows = await all(`SELECT r.content_id, r.round, r.target, r.created_at, r.resolved_at, r.checklist, r.note,
      c.title, c.channels, c.operator_id, c.editor_id, c.designer_id
    FROM revisions r JOIN content c ON c.id = r.content_id WHERE r.created_at > ? ORDER BY r.id DESC LIMIT 150`, since)
  return rows.map((r) => {
    let items = []
    try { items = JSON.parse(r.checklist || '[]').map((c) => c.text) } catch { items = [] }
    return {
      task: r.content_id, title: r.title, channel: (() => { try { return JSON.parse(r.channels || '[]')[0] } catch { return null } })(),
      round: r.round, fixer: names.get(r[`${r.target}_id`]) || r.target, day: String(r.created_at).slice(0, 10),
      fixed: !!r.resolved_at, asked: items.length ? items : String(r.note || '').slice(0, 300),
    }
  })
}

// The whole board, as one admin may read it, in one text. Kept two minutes,
// so a follow-up question does not read everything again.
const digests = new Map()
export async function jarvisDigest(user, { task = null } = {}) {
  const key = `${user.id}:${task || ''}`
  const hit = digests.get(key)
  if (hit && Date.now() - hit.at < 120000) return hit.text
  const people = await all("SELECT id, name, role, departments, daily_cap FROM users WHERE role <> 'ambassador' ORDER BY name")
  const names = new Map(people.map((p) => [p.id, p.name]))
  const [day, open, stats, views, work, asks, used, one] = await Promise.allSettled([
    asPerson(user, 'GET', '/content/day/team'),
    asPerson(user, 'GET', '/content/open-revisions'),
    asPerson(user, 'GET', '/reports/stats'),
    asPerson(user, 'GET', '/reports/views'),
    asPerson(user, 'GET', '/reports/work'),
    recentAsks(30, names),
    usage(7),
    task ? asPerson(user, 'GET', `/content/${Number(task)}`) : Promise.resolve(null),
  ])
  const text = [
    `Today is ${dayISO(0)} (Tashkent). People are named by id in some sections; the team list maps them.`,
    section('The team', people.map((p) => ({ id: p.id, name: p.name, role: p.role, channels: p.departments, daily_cap: p.daily_cap || undefined }))),
    section('Late, due today and edits to rush — the admin’s day', okData(day)),
    section('Pravkas still open', okData(open)),
    section('What reviewers asked to change, the last 30 days', ok(asks)),
    section('Statistics (this month)', okData(stats)),
    section('Content results: views typed in by hand (this month)', okData(views)),
    section('Who made what (this month)', okData(work)),
    section('Where people struggled on the platform (usage, the last 7 days)', ok(used)),
    section('The piece the admin is looking at now', okData(one)),
  ].filter(Boolean).join('\n')
  digests.set(key, { at: Date.now(), text })
  return text
}

// ---- ask ------------------------------------------------------------------------
const RULES = (name, lang) => [
  `You are Jarvis, the second brain of the SATashkent marketing team's platform: a board where every piece — a reel, a post, a design — goes Idea → Shoot → Edit → Out, made by owners, operators, editors and designers and checked by reviewers, who send pravkas (requests for changes) back.`,
  `You are talking to ${name}, an admin who runs the team. Answer from THE DATA only — the live board.`,
  'Lead with the answer in one sentence, then at most six short lines starting with "- ". Be concrete: name the people and the pieces, give the numbers and the days.',
  'When asked what to improve, say what to change and why, from where people struggle (the usage report), what keeps coming back in pravkas, and what is late.',
  'If THE DATA does not say, say so plainly and say where on the platform to look. Never invent a person, a piece or a number.',
  'When you name a piece, write it as [its title](task:ID) with its id.',
  `Write in ${LANG[lang] || LANG.en}. Plain text: no tables, no headings, no bold.`,
].join('\n')

const talks = new Map() // admin id → { at, turns }
export async function jarvisAsk(user, question, { lang = 'en', task = null, audio = null } = {}) {
  const data = await jarvisDigest(user, { task })
  const talk = talks.get(user.id)
  const past = talk && Date.now() - talk.at < 15 * 60e3 ? talk.turns : []
  const asked = String(question || '').trim().slice(0, 2000) || '(The question is in the attached voice message — listen to it, then answer it.)'
  const { text, model } = await geminiAnswer({
    system: RULES(user.name || 'the admin', lang),
    turns: [
      { role: 'user', text: `THE DATA (the live board):\n\n${data}` },
      { role: 'model', text: 'I have the board. Ask.' },
      ...past,
      { role: 'user', text: asked, audio },
    ],
  })
  talks.set(user.id, { at: Date.now(), turns: [...past, { role: 'user', text: asked }, { role: 'model', text }].slice(-6) })
  return { answer: text, model }
}

// An answer drawn for Telegram: [title](task:ID) becomes a link into the task.
export function jarvisHtml(text, origin) {
  return String(text).split(/(\[[^\]]+\]\(task:\d+\))/g).map((part) => {
    const m = /^\[([^\]]+)\]\(task:(\d+)\)$/.exec(part)
    if (!m) return tgEsc(part)
    return origin ? `<a href="${origin}/brief?task=${m[2]}">${tgEsc(m[1])}</a>` : `«${tgEsc(m[1])}»`
  }).join('')
}

// ---- alerts ---------------------------------------------------------------------
// A problem is a key and its facts. A key told in the last seven days is not
// told again; the table is also what the page lists.
const WEEK = 7 * 864e5

async function toldRecently(keys) {
  if (!keys.length) return new Set()
  const since = new Date(Date.now() - WEEK).toISOString()
  const rows = await all(`SELECT key FROM jarvis_alerts WHERE created_at > ? AND key IN (${keys.map(() => '?').join(',')})`, since, ...keys)
  return new Set(rows.map((r) => r.key))
}

async function bosses() {
  return (await all("SELECT * FROM users WHERE role = 'admin'")).map(publicUser).filter(isFullAdmin)
}

// The rules that need no model: they are facts on the board.
async function boardProblems(admin) {
  const out = []
  // A piece on its last allowed pravka round (PRAVKA_ROUNDS), still open: the
  // next delivery is approved as it stands, so this is the round to get right.
  const { PRAVKA_ROUNDS } = await import('./routes/content.js')
  const loops = await all(`SELECT r.content_id, r.round, r.target, c.title, c.operator_id, c.editor_id, c.designer_id
    FROM revisions r JOIN content c ON c.id = r.content_id WHERE r.resolved_at IS NULL AND r.round >= ? AND c.done_at IS NULL`, PRAVKA_ROUNDS)
  const names = new Map((await all('SELECT id, name FROM users')).map((u) => [u.id, u.name]))
  for (const l of loops) {
    out.push({ key: `loop:${l.content_id}:${l.round}`, kind: 'loop', task: l.content_id, title: l.title, round: l.round, who: names.get(l[`${l.target}_id`]) || '' })
  }
  // One person holding three late steps or more. The admin's day keeps a late
  // edit under editAsap, never twice, so both lists are read.
  const day = await asPerson(admin, 'GET', '/content/day/team')
  const late = new Map()
  const steps = day.status === 200 ? [...(day.data.overdue || []), ...(day.data.editAsap || []).filter((s) => s.days_late > 0)] : []
  for (const s of steps) {
    for (const uid of s.owners || []) late.set(uid, [...(late.get(uid) || []), s])
  }
  for (const [uid, steps] of late) {
    if (steps.length < 3) continue
    out.push({ key: `late:${uid}`, kind: 'late', who: names.get(uid) || `#${uid}`, n: steps.length,
      titles: [...new Set(steps.map((s) => s.title))].slice(0, 3), worst: Math.max(...steps.map((s) => s.days_late || 0)) })
  }
  return out
}

// What needs a reading, not a rule: where people struggled on the platform
// yesterday, and the same change asked again and again. One call to Gemini,
// with every line in the three languages the admins read.
async function readProblems() {
  const md = await reportOf([dayISO(-1)], dayISO(-1)).catch(() => '')
  const fixes = (md.split('## What to improve first')[1] || '').split('\n## ')[0]
    .split('\n').filter((l) => l.startsWith('- ') && !/Nothing stood out/.test(l)).map((l) => l.slice(2))
  const asks = await recentAsks(14, new Map((await all('SELECT id, name FROM users')).map((u) => [u.id, u.name])))
  const items = asks.flatMap((a) => (Array.isArray(a.asked) ? a.asked : [a.asked]).map((t) => ({ t, ch: a.channel, who: a.fixer })))
  if (!fixes.length && items.length < 8) return []
  const line = { type: 'OBJECT', properties: { en: { type: 'STRING' }, ru: { type: 'STRING' }, uz: { type: 'STRING' } }, required: ['en', 'ru', 'uz'] }
  const { json } = await geminiAnswer({
    system: [
      'You are Jarvis, the second brain of a marketing team’s platform. You find problems worth an admin’s attention — and only real ones.',
      '"struggles": for each line of the usage report given, one short sentence saying what people struggle with on the platform and what to change — in English, Russian and Uzbek (Latin, oʻ gʻ with U+02BB). Leave out a line that is not worth an admin’s time.',
      '"repeats": only a change that reviewers asked for at least three times in the list given (the same kind of fix — e.g. "logo too small" — not merely the same word). For each: the issue, how many times, the channel if one, and the rule to add to briefs so it stops coming back — in the three languages. None is a fine answer.',
    ].join('\n'),
    turns: [{ role: 'user', text: `Usage report lines:\n${fixes.map((f) => `- ${f}`).join('\n') || '(none)'}\n\nWhat reviewers asked to change, the last 14 days:\n${JSON.stringify(items.slice(0, 300))}` }],
    schema: {
      type: 'OBJECT',
      properties: {
        struggles: { type: 'ARRAY', items: line },
        repeats: { type: 'ARRAY', items: { type: 'OBJECT', properties: { issue: line, times: { type: 'INTEGER' }, channel: { type: 'STRING' }, rule: line }, required: ['issue', 'times', 'rule'] } },
      },
      required: ['struggles', 'repeats'],
    },
    maxTokens: 4096,
    temperature: 0.2,
  })
  const out = []
  for (const s of (json.struggles || []).slice(0, 3)) out.push({ key: `ux:${hash(String(s.en).toLowerCase().replace(/\d+/g, '#'))}`, kind: 'ux', text: s })
  for (const r of (json.repeats || []).filter((x) => x.times >= 3).slice(0, 3)) {
    out.push({ key: `repeat:${hash(String(r.issue?.en).toLowerCase())}`, kind: 'repeat', text: r.issue, rule: r.rule, times: r.times, channel: r.channel || '' })
  }
  return out
}

// One message for the admins, in each one's language.
export function alertText(lang, problems, origin = '') {
  const w = tgWords(lang)
  const link = (task, title) => (origin && task ? `<a href="${origin}/brief?task=${task}">«${tgEsc(title)}»</a>` : `<b>«${tgEsc(title)}»</b>`)
  const lines = problems.map((p) => {
    if (p.kind === 'loop') return w.jarvis.loop(link(p.task, p.title), p.round, tgEsc(p.who))
    if (p.kind === 'late') return w.jarvis.late(tgEsc(p.who), p.n, p.titles.map((t) => `«${tgEsc(t)}»`).join(', '), p.worst)
    if (p.kind === 'ux') return w.jarvis.ux(tgEsc(p.text?.[lang] || p.text?.en || ''))
    if (p.kind === 'repeat') return w.jarvis.repeat(tgEsc(p.text?.[lang] || p.text?.en || ''), p.times, tgEsc(p.channel), tgEsc(p.rule?.[lang] || p.rule?.en || ''))
    return ''
  }).filter(Boolean)
  return `${w.jarvis.head(lines.length)}\n\n${lines.join('\n\n')}\n\n${w.jarvis.foot}`
}

async function tell(problems) {
  const fresh = []
  const told = await toldRecently(problems.map((p) => p.key))
  for (const p of problems) if (!told.has(p.key) && !fresh.some((f) => f.key === p.key)) fresh.push(p)
  if (!fresh.length) return 0
  const now = new Date().toISOString()
  for (const p of fresh) {
    await run('INSERT INTO jarvis_alerts (key, kind, data, created_at) VALUES (?, ?, ?, ?)', p.key, p.kind, JSON.stringify(p), now)
  }
  const admins = await bosses()
  const origin = await tgPublicUrl().catch(() => '')
  await tgMirror(admins.map((a) => a.id), (lang) => alertText(lang, fresh, origin), null, '', { kind: 'jarvis' })
  return fresh.length
}

// The moment a pravka opens the last allowed round — said at once.
export async function jarvisOnPravka(contentId, round) {
  const { PRAVKA_ROUNDS } = await import('./routes/content.js')
  if (!geminiReady() || round < PRAVKA_ROUNDS) return 0
  const row = await get('SELECT id, title, operator_id, editor_id, designer_id FROM content WHERE id = ?', contentId)
  const rev = await get('SELECT target FROM revisions WHERE content_id = ? AND round = ?', contentId, round)
  if (!row || !rev) return 0
  const who = (await get('SELECT name FROM users WHERE id = ?', row[`${rev.target}_id`]))?.name || ''
  return tell([{ key: `loop:${row.id}:${round}`, kind: 'loop', task: row.id, title: row.title, round, who }])
}

// The day's look, at ten in the morning (Tashkent), once a day. Called often
// (every five minutes); it claims its day before it does anything.
const tashkentHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(new Date()))
export async function jarvisDaily({ force = false } = {}) {
  if (!geminiReady()) return 0
  const hour = Number(process.env.JARVIS_HOUR ?? 10)
  if (!force && tashkentHour() < hour) return 0
  const today = dayISO(0)
  if (!force) {
    const last = (await get("SELECT value FROM meta WHERE key = 'jarvis_day'"))?.value
    if (last === today) return 0
    await run("INSERT INTO meta (key, value) VALUES ('jarvis_day', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", today)
  }
  const admin = (await bosses())[0]
  if (!admin) return 0
  const found = await boardProblems(admin).catch((e) => { console.error('jarvis: board', e.message); return [] })
  const read = await readProblems().catch((e) => { console.error('jarvis: reading', e.message); return [] })
  return tell([...found, ...read])
}

// What the page lists: the last alerts, in the reader's language.
export async function jarvisAlerts(lang, limit = 20) {
  const rows = await all('SELECT id, kind, data, created_at FROM jarvis_alerts ORDER BY id DESC LIMIT ?', limit)
  return rows.map((r) => {
    let p = {}
    try { p = JSON.parse(r.data || '{}') } catch { p = {} }
    const html = alertText(lang, [p]).split('\n\n')[1] || ''
    const text = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    return { id: r.id, kind: r.kind, task: p.task || null, text, created_at: r.created_at }
  })
}
