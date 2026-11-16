// The bot's night: nothing buzzes from 23:00 to 08:00 Tashkent time, and
// what the night brought leaves in the morning as ONE message a person.
//
// One server holds a night on purpose (TG_QUIET_HOURS=0-24): every message
// worth a buzz is kept beside the database instead of sent. A second server on
// the same data wakes after it (TG_QUIET_HOURS=off) — a restart overnight is
// the ordinary case — and the first look sends the mornings: one thing held
// goes out as it was, buttons and all; several are one message, a button into
// each task. Nothing is sent twice.
//
// Self-contained: API :4131, Telegram mock :9931.
//   DASHB_ROOT=$PWD node qa/tgnight-suite.mjs
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
const SP = fileURLToPath(new URL('.', import.meta.url))
const BASE = 'http://localhost:4131'
const MOCK = 'http://localhost:9931'
const TOKEN = 'tgnight-test-token'
const SECRET = createHash('sha256').update(`satashkent:${TOKEN}`).digest('hex').slice(0, 40)
const DATA = join(tmpdir(), `tgnight-${Date.now()}`)
const NIGHT = join(DATA, 'telegram', 'night.ndjson')

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const procs = []
const boot = (args, env) => { const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'ignore' }); procs.push(p); return p }
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL') } catch { /* gone */ } } })
const api = (quiet) => boot([join(ROOT, 'server/index.js')], {
  DATA_DIR: DATA, PORT: '4131', TG_QUIET_HOURS: quiet, PUBLIC_URL: 'https://night.example.org',
  TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_BASE: MOCK,
  GITHUB_DATA_TOKEN: '', GH_DATA_TOKEN: '', DATABASE_URL: '', CRON_SECRET: '',
})
const up = async (url) => {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return true } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

boot([join(SP, 'mock-tg.mjs')], { MOCK_PORT: '9931' })
let server = api('0-24')
ok('mock + API are up, holding a night', (await up(MOCK + '/__sent')) && (await up(BASE + '/api/health')))

const login = async (u, p) => (await (await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }),
})).json()).token
let T = await login('admin', 'admin123')
const req = async (p, m = 'GET', b, t = T) => {
  const r = await fetch(BASE + '/api' + p, {
    method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: b ? JSON.stringify(b) : undefined,
  })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}
const hook = (update) => fetch(BASE + '/api/telegram/webhook', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET },
  body: JSON.stringify(update),
})
const sentList = async () => (await (await fetch(MOCK + '/__sent')).json()).filter((m) => (m.method || 'sendMessage') === 'sendMessage')
const reset = () => fetch(MOCK + '/__reset', { method: 'POST' })
const to = (sent, chat) => sent.filter((m) => String(m.chat_id) === String(chat))
const buttons = (m) => (m?.reply_markup?.inline_keyboard || []).flat()

const statuses = (await req('/statuses')).data
const EDITING = statuses.find((s) => /^editing$/i.test(s.label))?.id
const chKey = (await req('/channels')).data.find((c) => c.format === 'social')?.key
const mk = async (name, username, role, departments = [chKey]) =>
  (await req('/users', 'POST', { name, username, password: 'probe1234', role, departments })).data
const rev = await mk('Nigora Night', 'tn_rev', 'member')
const ed = await mk('Nodir Night', 'tn_ed', 'editor', [])
const one = await mk('Nilufar Night', 'tn_one', 'member')
const tok = { rev: await login('tn_rev', 'probe1234'), ed: await login('tn_ed', 'probe1234'), one: await login('tn_one', 'probe1234') }
const CHAT = { rev: 701, ed: 702, one: 703 }
for (const [t, chat] of [[tok.rev, CHAT.rev], [tok.ed, CHAT.ed], [tok.one, CHAT.one]]) {
  const l = (await req('/telegram/link', 'POST', {}, t)).data
  await hook({ message: { chat: { id: chat }, text: `/start ${l.code}` } })
}

// ===================== the night =====================
await reset()
const a = (await req('/content', 'POST', {
  title: 'Night: the edit', channels: [chKey], type: 'video', status_id: EDITING, editor_id: ed.id, reviewer_ids: [rev.id],
})).data
let r = await req(`/content/${a.id}`, 'PATCH', { ready_link: 'https://drive.google.com/night-1', milestone: 'edited' }, tok.ed)
ok('the editor hands in at night', r.status === 200, `${r.status} ${r.data.error || ''}`)
r = await req(`/content/${a.id}/revisions`, 'POST', { note: 'The intro is too long', target: 'editor' }, tok.rev)
ok('…and the reviewer sends a pravka back', r.status === 201, `${r.status} ${r.data.error || ''}`)
const b = (await req('/content', 'POST', {
  title: 'Night: the second', channels: [chKey], type: 'video', status_id: EDITING, editor_id: ed.id,
})).data
await req(`/content/${b.id}/comments`, 'POST', { text: '@Nilufar Night can you check the captions?' })
ok('nothing buzzed overnight', (await sentList()).length === 0, JSON.stringify((await sentList()).map((m) => [m.chat_id, m.text?.slice(0, 30)])))
const held = existsSync(NIGHT) ? readFileSync(NIGHT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
ok('…it is kept beside the database, not inside it', held.length >= 3 && !NIGHT.endsWith('.db'), String(held.length))
ok('…for the people it was for', held.some((h) => h.uid === rev.id) && held.some((h) => h.uid === ed.id))

// ===================== the morning =====================
server.kill('SIGINT')
await new Promise((res) => server.once('exit', res))
server = api('off')
ok('the server wakes after the night', await up(BASE + '/api/health'))
T = await login('admin', 'admin123')
await req('/statuses')
let sent = []
for (let i = 0; i < 20 && sent.length < 3; i++) {
  await new Promise((res) => setTimeout(res, 250))
  sent = await sentList()
}
const edMorning = to(sent, CHAT.ed)
const revMorning = to(sent, CHAT.rev)
ok('the editor gets ONE message for the night', edMorning.length === 1, JSON.stringify(edMorning.map((m) => m.text)))
ok('…which says it is the night’s', /^☀️ Good morning\. While you slept \(\d\):/.test(edMorning[0]?.text || ''), edMorning[0]?.text)
ok('…and has all of it: the new work and the pravka', /Night: the second/.test(edMorning[0]?.text || '') && /The intro is too long/.test(edMorning[0]?.text || ''))
ok('…with a button into each task', buttons(edMorning[0]).some((x) => x.url?.endsWith(`/brief?task=${a.id}`)) && buttons(edMorning[0]).some((x) => x.url?.endsWith(`/brief?task=${b.id}`)),
  JSON.stringify(edMorning[0]?.reply_markup))
ok('the reviewer gets one message too, the cut to review in it', revMorning.length === 1 && /ready for review/.test(revMorning[0].text), revMorning[0]?.text)
ok('…and the cut’s Accept and Pravka under its name', buttons(revMorning[0]).some((x) => x.callback_data === `ok:${a.id}`) && buttons(revMorning[0]).some((x) => x.callback_data === `fix:${a.id}`),
  JSON.stringify(revMorning[0]?.reply_markup))
const oneMorning = to(sent, CHAT.one)
ok('whoever had one thing gets it as it was', oneMorning.length === 1 && /While you slept \(1\):\n\n💬/.test(oneMorning[0].text) && /captions/.test(oneMorning[0].text), oneMorning[0]?.text)
ok('…with its Open button', buttons(oneMorning[0]).length === 1 && /Open the task/.test(buttons(oneMorning[0])[0].text), JSON.stringify(oneMorning[0]?.reply_markup))
ok('the night is gone once it is sent', !existsSync(NIGHT) && !existsSync(`${NIGHT}.sending`))
ok('waking again, the bot already pointed here is left alone', !(await (await fetch(MOCK + '/__sent')).json()).some((m) => m.method === 'setWebhook'))

// ===================== the day =====================
await reset()
await req(`/content/${b.id}/revisions`, 'POST', { note: 'Colour is off', target: 'editor' })
ok('by day a message goes out at once, on its own', to(await sentList(), CHAT.ed).length === 1 && !/While you slept/.test(to(await sentList(), CHAT.ed)[0].text))

console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
