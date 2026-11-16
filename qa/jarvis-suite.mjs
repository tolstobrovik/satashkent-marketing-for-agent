// Jarvis — the platform's second brain, for the admins who run the team
// (server/jarvis.js, routes/jarvis.js, JarvisDock.jsx, the bot).
//
//   ASK     an admin asks on the page or writes (or says) it to the bot;
//           Jarvis answers from the live board — read as that admin — keeps
//           the thread for a follow-up, and names pieces as links.
//   ALERTS  only when there is a problem: a piece on its last pravka, a person
//           holding three late steps, a place on the board people trip over,
//           the same change asked again and again. Each told once a week.
//
// Nobody else talks to it: a member, a channel's admin, a chat not connected.
// With no key it says so and calls nothing.
//
// Self-contained: API :4137 (and :4139 with no key), Telegram mock :9937,
// Gemini mock :9938.
//   DASHB_ROOT=$PWD node qa/jarvis-suite.mjs
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
const SP = fileURLToPath(new URL('.', import.meta.url))
const BASE = 'http://localhost:4137'
const BARE = 'http://localhost:4139'
const TG = 'http://localhost:9937'
const GM = 'http://localhost:9938'
const TOKEN = 'jarvis-test-token'
const SECRET = createHash('sha256').update(`satashkent:${TOKEN}`).digest('hex').slice(0, 40)
const DATA = join(tmpdir(), `jarvis-${Date.now()}`)

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const procs = []
const boot = (args, env) => { const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'ignore' }); procs.push(p); return p }
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL') } catch { /* gone */ } } })
const common = { TG_QUIET_HOURS: 'off', GITHUB_DATA_TOKEN: '', GH_DATA_TOKEN: '', DATABASE_URL: '', CRON_SECRET: '', GEMINI_BASE_URL: GM }
boot([join(SP, 'mock-tg.mjs')], { MOCK_PORT: '9937' })
boot([join(SP, 'mock-gemini.mjs')], { MOCK_GEMINI_PORT: '9938' })
// JARVIS_HOUR=99: the day's own look never fires by itself here; the suite
// asks for it (POST /jarvis/look), as an admin can.
boot([join(ROOT, 'server/index.js')], {
  ...common, DATA_DIR: DATA, PORT: '4137', TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_BASE: TG,
  GEMINI_API_KEY: 'jarvis-key', JARVIS_HOUR: '99', PRAVKA_SWEEP_MS: '700',
})
boot([join(ROOT, 'server/index.js')], { ...common, DATA_DIR: join(tmpdir(), `jarvis-bare-${Date.now()}`), PORT: '4139', GEMINI_API_KEY: '', TELEGRAM_BOT_TOKEN: '' })
const up = async (url) => {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return true } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
ok('mocks + both APIs are up', (await up(TG + '/__sent')) && (await up(GM + '/__calls')) && (await up(BASE + '/api/health')) && (await up(BARE + '/api/health')))

const login = async (u, p, base = BASE) => (await (await fetch(base + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }),
})).json()).token
const T = await login('admin', 'admin123')
const req = async (p, m = 'GET', b, t = T, base = BASE) => {
  const r = await fetch(base + '/api' + p, {
    method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: b ? JSON.stringify(b) : undefined,
  })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}
const hook = (update) => fetch(BASE + '/api/telegram/webhook', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET },
  body: JSON.stringify(update),
})
const tgAll = async () => (await (await fetch(TG + '/__sent')).json())
const sentTo = async (chat) => (await tgAll()).filter((m) => m.method === 'sendMessage' && String(m.chat_id) === String(chat))
const asks = async () => (await (await fetch(GM + '/__calls')).json()).filter((c) => /You are talking to/.test(JSON.stringify(c.body.systemInstruction || '')))
const readings = async () => (await (await fetch(GM + '/__calls')).json()).filter((c) => /You find problems worth/.test(JSON.stringify(c.body.systemInstruction || '')))
const resets = () => Promise.all([fetch(TG + '/__reset', { method: 'POST' }), fetch(GM + '/__reset', { method: 'POST' })])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 250) { const v = await fn(); if (v) return v; await sleep(250) } return null }
const day = (off = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(Date.now() + off * 864e5))

const statuses = (await req('/statuses')).data
const EDITING = statuses.find((s) => /^editing$/i.test(s.label))?.id
const chKey = (await req('/channels')).data.find((c) => c.format === 'social')?.key
const mk = async (name, username, role, extra = {}) =>
  (await req('/users', 'POST', { name, username, password: 'probe1234', role, departments: [chKey], ...extra })).data
const mem = await mk('Malika Member', 'jv_mem', 'member')
const ed = await mk('Bekzod Editor', 'jv_ed', 'editor', { departments: [] })
const chad = await mk('Kamola Channel', 'jv_chad', 'admin')
await req(`/users/${chad.id}`, 'PATCH', { admin_channels: [chKey] })
const tok = { mem: await login('jv_mem', 'probe1234'), ed: await login('jv_ed', 'probe1234'), chad: await login('jv_chad', 'probe1234') }
const CHAT = { admin: 950, mem: 951, ed: 952 }
for (const [t, chat] of [[T, CHAT.admin], [tok.mem, CHAT.mem], [tok.ed, CHAT.ed]]) {
  const l = (await req('/telegram/link', 'POST', {}, t)).data
  await hook({ message: { chat: { id: chat }, text: `/start ${l.code}` } })
}

// a board with something on it: three late edits on one editor
const late = []
for (let i = 1; i <= 3; i++) {
  late.push((await req('/content', 'POST', {
    title: `Jarvis: late ${i}`, channels: [chKey], type: 'video', status_id: EDITING, editor_id: ed.id,
    edit_ready_date: day(-3 - i), release_date: day(3), assignee_ids: [mem.id],
  })).data)
}

// ===================== who may talk to it =====================
let r = await req('/jarvis/status')
ok('the admin who runs the team has a Jarvis, awake', r.data.can === true && r.data.ready === true, JSON.stringify(r.data))
ok('a member has none', (await req('/jarvis/status', 'GET', null, tok.mem)).data.can === false)
ok('…nor an admin of one channel', (await req('/jarvis/status', 'GET', null, tok.chad)).data.can === false)
ok('…and their questions are refused', (await req('/jarvis/ask', 'POST', { q: 'who is late?' }, tok.mem)).status === 403
  && (await req('/jarvis/ask', 'POST', { q: 'who is late?' }, tok.chad)).status === 403)

// ===================== ask, on the page =====================
await resets()
r = await req('/jarvis/ask', 'POST', { q: 'Who is overloaded this week?', lang: 'en' })
ok('the admin asks, Jarvis answers', r.status === 200 && /You asked: Who is overloaded this week\?/.test(r.data.answer), JSON.stringify(r.data))
ok('…naming a piece the way the page draws as a link', /\[the first piece\]\(task:1\)/.test(r.data.answer || ''))
let call = (await asks())[0]
const data = JSON.stringify(call?.body.contents?.[0] || '')
ok('…from the live board: the team, the late steps, the pravkas, the numbers, the usage', ['## The team', 'Late, due today', 'Jarvis: late 2', 'Bekzod Editor', 'Statistics', 'Content results', 'Where people struggled'].every((s) => data.includes(s)),
  ['## The team', 'Late, due today', 'Jarvis: late 2', 'Bekzod Editor', 'Statistics', 'Content results', 'Where people struggled'].filter((s) => !data.includes(s)).join(', '))
ok('…and nothing private in it: no password hash, no pictures', !/\$2[aby]\$/.test(data) && !/data:image/.test(data))
ok('…told to answer in the asker’s language', /Write in English/.test(JSON.stringify(call?.body.systemInstruction)))
r = await req('/jarvis/ask', 'POST', { q: 'And who should take one of them?', lang: 'ru' })
call = (await asks()).pop()
ok('a follow-up carries the thread so far', /Turns: 5/.test(r.data.answer || '') && /Who is overloaded/.test(JSON.stringify(call?.body.contents)), r.data.answer)
ok('…in the language asked for', /Write in Russian/.test(JSON.stringify(call?.body.systemInstruction)))
r = await req('/jarvis/ask', 'POST', { q: 'What about this one?', task: late[0].id })
call = (await asks()).pop()
ok('asked from a task, Jarvis has that task in front of it', /The piece the admin is looking at now/.test(JSON.stringify(call?.body.contents?.[0])) && r.status === 200)
ok('an empty question is not sent', (await req('/jarvis/ask', 'POST', { q: '  ' })).status === 400)

// ===================== ask, in Telegram =====================
await req('/telegram/set-webhook', 'POST', { url: 'https://team.example.org/api/telegram/webhook' })
await resets()
const t0 = Date.now()
await hook({ message: { message_id: 501, chat: { id: CHAT.admin }, text: 'Who is late today?' } })
ok('the webhook answers Telegram at once', Date.now() - t0 < 3000, `${Date.now() - t0}ms`)
const answer = await until(async () => (await sentTo(CHAT.admin)).find((m) => /You asked: Who is late today\?/.test(m.text || '')))
ok('an admin writing to the bot gets Jarvis’s answer, as a reply', !!answer && answer.reply_parameters?.message_id === 501, JSON.stringify(answer && answer.reply_parameters))
ok('…with the piece as a link into the task', /<a href="[^"]*\/brief\?task=1">the first piece<\/a>/.test(answer?.text || ''), answer?.text)
ok('…after a “typing…”', (await tgAll()).some((m) => m.method === 'sendChatAction' && String(m.chat_id) === String(CHAT.admin)))
await resets()
await hook({ message: { message_id: 502, chat: { id: CHAT.admin }, voice: { file_id: 'JV-VOICE', duration: 5 } } })
const heard = await until(async () => (await sentTo(CHAT.admin)).find((m) => /heard a voice/.test(m.text || '')))
ok('…and can just say it: a voice question is heard', !!heard, JSON.stringify((await sentTo(CHAT.admin)).map((m) => m.text)))
await resets()
await hook({ message: { message_id: 503, chat: { id: CHAT.mem }, text: 'Who is late today?' } })
await sleep(800)
ok('a member writing the same gets the help, not Jarvis', (await asks()).length === 0 && (await sentTo(CHAT.mem)).some((m) => /23:00/.test(m.text || '')))

// ===================== alerts =====================
// the usage log of yesterday: one label pressed six times that is not a button
mkdirSync(join(DATA, 'track'), { recursive: true })
const y = day(-1)
writeFileSync(join(DATA, 'track', `${y}.ndjson`), Array.from({ length: 6 }, (_, i) => JSON.stringify({
  at: `${y}T07:0${i}:00.000Z`, u: mem.id, n: 'Malika Member', r: 'member', ty: 'click', p: '/brief', el: 'Release day', dead: 1,
})).join('\n') + '\n')
// the same change asked three times on three pieces
const asked = []
for (let i = 1; i <= 3; i++) {
  const t = (await req('/content', 'POST', { title: `Jarvis: logo ${i}`, channels: [chKey], type: 'video', status_id: EDITING, editor_id: ed.id, reviewer_ids: [mem.id] })).data
  await req(`/content/${t.id}`, 'PATCH', { ready_link: `https://drive.google.com/l${i}`, milestone: 'edited' }, tok.ed)
  await req(`/content/${t.id}/revisions`, 'POST', { note: `The logo is too small. Fix the music at 0:0${i}. Shorter intro.`, target: 'editor' })
  asked.push(t)
}
await until(async () => (await req(`/content/${asked[2].id}/revisions`)).data.every((x) => x.list_state === 'done'), 8000)
await resets()
r = await req('/jarvis/look', 'POST', {})
ok('the day’s look finds what is wrong', r.status === 200 && r.data.told >= 3, JSON.stringify(r.data))
let alert = (await sentTo(CHAT.admin)).find((m) => /Jarvis/.test(m.text || ''))
ok('…and tells the admin in one message', (await sentTo(CHAT.admin)).filter((m) => /Jarvis/.test(m.text || '')).length === 1, String((await sentTo(CHAT.admin)).length))
ok('…the editor holding three late steps', /⏰ Bekzod Editor holds 3 late steps/.test(alert?.text || ''), alert?.text)
ok('…where people trip on the board', /🧭 People struggle: .*Release day/.test(alert?.text || ''))
ok('…and the change that keeps coming back, with a rule for the brief', /🔂 The same change keeps coming back: the logo is too small — \d times/.test(alert?.text || '') && /logo at least 15%/.test(alert?.text || ''))
ok('…read by Gemini once', (await readings()).length === 1)
ok('nobody but the admins hears it', (await sentTo(CHAT.mem)).length === 0 && (await sentTo(CHAT.ed)).length === 0)
await resets()
r = await req('/jarvis/look', 'POST', {})
ok('looking again the same day tells nothing new', r.data.told === 0 && (await sentTo(CHAT.admin)).length === 0, JSON.stringify(r.data))

// the last allowed pravka, said the moment it opens
const last = asked[0]
const rv = (await req(`/content/${last.id}/revisions`)).data.find((x) => !x.resolved_at)
await req(`/content/revisions/${rv.id}/resolve`, 'POST', { link: 'https://drive.google.com/l1b' }, tok.ed)
await resets()
r = await req(`/content/${last.id}/revisions`, 'POST', { note: 'Still too small.', target: 'editor' })
const loop = await until(async () => (await sentTo(CHAT.admin)).find((m) => /🔁/.test(m.text || '')))
ok('the last allowed pravka is told the moment it opens', r.status === 201 && /Jarvis: logo 1.*pravka round 2 — the last one/.test(loop?.text || '') && /Fixing it: Bekzod Editor/.test(loop?.text || ''), loop?.text)

// the page
r = await req('/jarvis/alerts?lang=en')
ok('the page lists what Jarvis spotted, newest first, as plain words', r.status === 200 && r.data.length >= 4 && /🔁/.test(r.data[0].text) && !/<a /.test(JSON.stringify(r.data)), JSON.stringify(r.data.map((a) => a.text.slice(0, 40))))
ok('…a piece’s alert opening its task', r.data[0].task === last.id)
ok('…for the admins only', (await req('/jarvis/alerts', 'GET', null, tok.mem)).status === 403)

// ===================== no key =====================
const TB = await login('admin', 'admin123', BARE)
r = await req('/jarvis/status', 'GET', null, TB, BARE)
ok('with no key Jarvis is there, asleep', r.data.can === true && r.data.ready === false)
await resets()
r = await req('/jarvis/ask', 'POST', { q: 'Anything?' }, TB, BARE)
ok('…says what wakes it, and calls nothing', r.status === 503 && /Gemini key/.test(r.data.error) && (await asks()).length === 0)

console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
