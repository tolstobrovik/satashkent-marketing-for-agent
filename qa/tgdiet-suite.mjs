// The Telegram diet: the bell logs everything, the phone buzzes for little.
//
// People stopped reading the bot because it spoke for every card dragged from
// Idea to To shoot, and the two messages that matter — a pravka, and a cut
// handed in — drowned in it. Telegram now carries only:
//
//   delivered  a hand-in: the cut or artwork to the reviewers, footage to the
//              editor who cuts it
//   pravka     to the one hat that fixes it (never the operator for a cut)
//   assigned   new work, a booking asked, and the crew's yes/no to the owner
//   mention    somebody named with @
//
// …in the reader's own language, and never about their own act. Everything
// else — stage moves one at a time or ten at once, publishing, approvals,
// date asks, comments nobody was named in, and since 27 October 2026 a piece
// running late — is the bell's alone, and the bell still logs it.
//
// And the buttons under them (tgactions.js): a delivered cut is accepted or
// sent back from the chat, a pravka typed or spoken in reply; a booking is
// answered yes, or no with the reason in reply — each through the API, as the
// person who pressed.
//
// Self-contained: API :4129, Telegram mock :9929.
//   DASHB_ROOT=$PWD node qa/tgdiet-suite.mjs
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
const SP = fileURLToPath(new URL('.', import.meta.url))
const BASE = 'http://localhost:4129'
const MOCK = 'http://localhost:9929'
const TOKEN = 'tgdiet-test-token'
const SECRET = createHash('sha256').update(`satashkent:${TOKEN}`).digest('hex').slice(0, 40)

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const procs = []
const boot = (args, env) => { const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'ignore' }); procs.push(p); return p }
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL') } catch { /* gone */ } } })

boot([join(SP, 'mock-tg.mjs')], { MOCK_PORT: '9929' })
boot([join(ROOT, 'server/index.js')], {
  DATA_DIR: join(tmpdir(), `tgdiet-${Date.now()}`), PORT: '4129',
  TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_BASE: MOCK, TG_QUIET_HOURS: 'off', PUBLIC_URL: 'https://team.example.org',
  GITHUB_DATA_TOKEN: '', GH_DATA_TOKEN: '', DATABASE_URL: '', CRON_SECRET: '',
})
const up = async (url) => {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return true } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
ok('mock + API are up', (await up(MOCK + '/__sent')) && (await up(BASE + '/api/health')))

// ===================== it points itself at this deployment =====================
// No Activate: the server sets its own webhook at boot, from PUBLIC_URL.
let booted = []
for (let i = 0; i < 20 && !booted.some((m) => m.method === 'setMyCommands'); i++) {
  await new Promise((r) => setTimeout(r, 250))
  booted = await (await fetch(MOCK + '/__sent')).json()
}
const selfHook = booted.find((m) => m.method === 'setWebhook')
ok('at boot the bot points itself at this deployment — nobody presses Activate', selfHook?.url === 'https://team.example.org/api/telegram/webhook'
  && (selfHook.allowed_updates || []).includes('callback_query') && selfHook.secret_token === SECRET, JSON.stringify(selfHook))
ok('…and gives itself its face (menu, description)', booted.some((m) => m.method === 'setMyCommands') && booted.some((m) => m.method === 'setMyDescription'))

const login = async (u, p) => (await (await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }),
})).json()).token
const T = await login('admin', 'admin123')
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
const bell = async (tok, id) => ((await req('/notifications', 'GET', null, tok)).data.events || []).filter((e) => e.content_id === id)
const day = (off = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(Date.now() + off * 864e5))

const statuses = (await req('/statuses')).data
const sid = (re) => statuses.find((s) => re.test(s.label))?.id
const IDEA = sid(/^idea$/i), EDITING = sid(/^editing$/i), READY = sid(/^ready$/i)
const FINAL = statuses.find((s) => s.is_final)?.id
const chKey = (await req('/channels')).data.find((c) => c.format === 'social')?.key

const mk = async (name, username, role, departments = [chKey]) =>
  (await req('/users', 'POST', { name, username, password: 'probe1234', role, departments })).data
const rev = await mk('Rana Reviewer', 'dt_rev', 'member')
const ed = await mk('Eldor Editor', 'dt_ed', 'editor', [])
const op = await mk('Otabek Operator', 'dt_op', 'operator', [])
const own = await mk('Orzu Owner', 'dt_own', 'member')
const smm = await mk('Sami Other', 'dt_smm', 'member')
const both = await mk('Bahrom Both', 'dt_both', 'member')
const tok = {}
for (const u of ['dt_rev', 'dt_ed', 'dt_op', 'dt_own', 'dt_smm', 'dt_both']) tok[u] = await login(u, 'probe1234')
const CHAT = { admin: 800, rev: 801, ed: 802, op: 803, own: 804, smm: 805, both: 806 }
for (const [t, chat] of [[T, CHAT.admin], [tok.dt_rev, CHAT.rev], [tok.dt_ed, CHAT.ed], [tok.dt_op, CHAT.op],
  [tok.dt_own, CHAT.own], [tok.dt_smm, CHAT.smm], [tok.dt_both, CHAT.both]]) {
  const l = (await req('/telegram/link', 'POST', {}, t)).data
  await hook({ message: { chat: { id: chat }, text: `/start ${l.code}` } })
}

// ===================== new work is worth a buzz =====================
await reset()
const a = (await req('/content', 'POST', {
  title: 'Diet: the cut', channels: [chKey], type: 'video', status_id: EDITING,
  editor_id: ed.id, operator_id: op.id, reviewer_ids: [rev.id], assignee_ids: [own.id],
})).data
let sent = await sentList()
ok('handing work to people reaches them (📌)', to(sent, CHAT.ed).some((m) => /📌/.test(m.text)) && to(sent, CHAT.op).some((m) => /📌/.test(m.text)), JSON.stringify(sent.map((m) => m.chat_id)))

// ===================== moving cards is silent =====================
await reset()
for (const s of [IDEA, EDITING, READY, EDITING]) await req(`/content/${a.id}`, 'PATCH', { status_id: s })
sent = await sentList()
ok('moving a task freely between stages sends 0 Telegram messages — Ready included', sent.length === 0, JSON.stringify(sent.map((m) => [m.chat_id, m.text?.slice(0, 30)])))
ok('…while the bell logs every move', (await bell(tok.dt_own, a.id)).filter((e) => e.kind === 'status').length >= 3)
ok('…and the reviewer’s bell still has the drag onto Ready (the dashboard ding)', (await bell(tok.dt_rev, a.id)).some((e) => e.kind === 'review'))

const ten = []
for (let i = 1; i <= 10; i++) ten.push((await req('/content', 'POST', { title: `Diet: bulk ${i}`, channels: [chKey], type: 'post', status_id: IDEA })).data)
await reset()
for (const t of ten) await req(`/content/${t.id}`, 'PATCH', { status_id: EDITING })
for (const t of ten) await req(`/content/${t.id}`, 'PATCH', { status_id: READY })
ok('an admin bulk-moving 10 tasks, twice, sends 0 Telegram messages', (await sentList()).length === 0, String((await sentList()).length))

// ===================== a hand-in reaches the reviewer, once =====================
await reset()
let r = await req(`/content/${a.id}`, 'PATCH', { ready_link: 'https://drive.google.com/diet-cut-1', milestone: 'edited' }, tok.dt_ed)
ok('the editor hands the cut in', r.status === 200 && r.data.status_id === READY, `${r.status} ${r.data.error || ''}`)
sent = await sentList()
ok('delivering the ready_link sends exactly 1 Telegram message…', sent.length === 1, JSON.stringify(sent.map((m) => m.chat_id)))
ok('…to the reviewer, in the spec’s words', to(sent, CHAT.rev).length === 1 && /✅ Work ready for review: <b>«Diet: the cut»<\/b>/.test(to(sent, CHAT.rev)[0].text), to(sent, CHAT.rev)[0]?.text)
ok('…with the file to watch', /diet-cut-1/.test(to(sent, CHAT.rev)[0]?.text || ''))

// ===================== a pravka reaches the fixer, once =====================
await reset()
r = await req(`/content/${a.id}/revisions`, 'POST', { note: 'The music is too loud at 0:40', target: 'editor' }, tok.dt_rev)
ok('the reviewer sends it back', r.status === 201, `${r.status} ${r.data.error || ''}`)
sent = await sentList()
ok('a pravka sends exactly 1 Telegram message…', sent.length === 1, JSON.stringify(sent.map((m) => m.chat_id)))
ok('…to the editor — not the operator on the same video', to(sent, CHAT.ed).length === 1 && to(sent, CHAT.op).length === 0)
ok('…in the spec’s words, the note with it', /📝 Pravka requested on: <b>«Diet: the cut»<\/b>/.test(to(sent, CHAT.ed)[0]?.text || '') && /too loud at 0:40/.test(to(sent, CHAT.ed)[0]?.text || ''),
  to(sent, CHAT.ed)[0]?.text)

// The fix is a delivery too — to the reviewer, once.
const open = (await req(`/content/${a.id}`)).data.revisions.find((v) => !v.resolved_at)
await reset()
await req(`/content/revisions/${open.id}/resolve`, 'POST', { link: 'https://drive.google.com/diet-cut-2' }, tok.dt_ed)
sent = await sentList()
ok('pressing "Fixed" reaches the reviewer once, and nobody else', sent.length === 1 && to(sent, CHAT.rev).length === 1, JSON.stringify(sent.map((m) => m.chat_id)))

// ===================== in the reader's language =====================
ok('a person can tell the server which language they read', (await req('/users/me', 'PATCH', { lang: 'ru' }, tok.dt_ed)).data.lang === 'ru')
ok('…and only a language the bot speaks', (await req('/users/me', 'PATCH', { lang: 'fr' }, tok.dt_ed)).status === 400)
await reset()
await req(`/content/${a.id}/revisions`, 'POST', { note: 'Субтитры съехали', target: 'editor' }, tok.dt_rev)
sent = await sentList()
ok('the editor who reads Russian gets the pravka in Russian', /📝 Новая правка: <b>«Diet: the cut»<\/b>/.test(to(sent, CHAT.ed)[0]?.text || '') && /Открыть задачу/.test(JSON.stringify(to(sent, CHAT.ed)[0]?.reply_markup || {})),
  to(sent, CHAT.ed)[0]?.text)

// ===================== nobody hears about their own act =====================
const b = (await req('/content', 'POST', {
  title: 'Diet: two hats', channels: [chKey], type: 'video', status_id: EDITING,
  editor_id: both.id, reviewer_ids: [both.id], assignee_ids: [own.id],
})).data
await reset()
r = await req(`/content/${b.id}`, 'PATCH', { ready_link: 'https://drive.google.com/diet-both', milestone: 'edited' }, tok.dt_both)
ok('the reviewer who is also the editor hands in', r.status === 200, `${r.status} ${r.data.error || ''}`)
ok('…and is not told about it', to(await sentList(), CHAT.both).length === 0)

// ===================== the rest is the bell's =====================
await reset()
await req(`/content/${a.id}/comments`, 'POST', { text: 'Looks good so far' }, tok.dt_rev)
ok('a comment nobody is named in: 0 Telegram messages', (await sentList()).length === 0)
await reset()
await req(`/content/${a.id}/comments`, 'POST', { text: '@Sami Other can you check the captions?' }, tok.dt_rev)
sent = await sentList()
ok('naming somebody in the Talk tab reaches exactly them — even off the task', sent.length === 1 && to(sent, CHAT.smm).length === 1, JSON.stringify(sent.map((m) => m.chat_id)))
{
  // A reminder rings the bell of the one person it names and of nobody else on the task.
  const before = (await bell(tok.dt_ed, a.id)).length
  const mine = (await bell(tok.dt_smm, a.id)).length
  await req(`/content/${a.id}/comments`, 'POST', { text: '@Sami Other — a reminder: this task is waiting for you.', remind: true }, tok.dt_rev)
  ok('a reminder rings only the person it names', (await bell(tok.dt_ed, a.id)).length === before && (await bell(tok.dt_smm, a.id)).length === mine + 1)
}

const c = (await req('/content', 'POST', {
  title: 'Diet: approve me', channels: [chKey], type: 'video', status_id: EDITING, editor_id: ed.id, reviewer_ids: [rev.id],
})).data
await req(`/content/${c.id}`, 'PATCH', { ready_link: 'https://drive.google.com/diet-c', milestone: 'edited' }, tok.dt_ed)
await reset()
await req(`/content/${c.id}/approve`, 'POST', {}, tok.dt_rev)
ok('an approval: 0 Telegram messages', (await sentList()).length === 0)
ok('…the editor’s bell has it', (await bell(tok.dt_ed, c.id)).some((e) => /approved by Rana Reviewer/.test(e.text)))
await reset()
await req(`/content/${c.id}`, 'PATCH', { status_id: FINAL, post_link: 'https://instagram.com/p/diet' })
ok('publishing: 0 Telegram messages', (await sentList()).length === 0)
const d = (await req('/content', 'POST', { title: 'Diet: a dated piece', channels: [chKey], type: 'post', status_id: EDITING, release_date: day(5) })).data
await reset()
r = await req(`/content/${d.id}/date-requests`, 'POST', { field: 'release_date', to: day(7), reason: 'The speaker moved the event' }, tok.dt_rev)
ok('asking to move a date: 0 Telegram messages (the admins have it in the bell)', r.status < 300 && (await sentList()).length === 0, `${r.status} ${r.data.error || ''}`)

// ===================== late is the bell's =====================
const late = (await req('/content', 'POST', {
  title: 'Diet: the late cut', channels: [chKey], type: 'video', status_id: EDITING,
  editor_id: ed.id, operator_id: op.id, edit_ready_date: day(-4), release_date: day(2),
})).data
await reset()
await fetch(BASE + '/api/cron/daily')
sent = await sentList()
ok('a piece past its deadline: no Telegram message to its hat', !to(sent, CHAT.ed).some((m) => /Diet: the late cut/.test(m.text)),
  to(sent, CHAT.ed).map((m) => m.text).join(' | '))
ok('…nor to the admin', !to(sent, CHAT.admin).some((m) => /Diet: the late cut/.test(m.text)), to(sent, CHAT.admin).map((m) => m.text).join(' | '))
ok('…while the bell still raises it', (await bell(tok.dt_ed, late.id)).some((e) => e.kind === 'flag'))

// ===================== bookings, and their answers =====================
const e = (await req('/content', 'POST', { title: 'Diet: the shoot', channels: [chKey], type: 'video', status_id: EDITING, assignee_ids: [own.id] })).data
await reset()
r = await req(`/content/${e.id}`, 'PATCH', { operator_id: op.id, recording_date: day(3), recording_time: '10:00', recording_end: '11:00' })
sent = await sentList()
ok('booking a shoot asks the operator', r.status === 200 && to(sent, CHAT.op).some((m) => /🗓|📌/.test(m.text)), `${r.status} ${r.data.error || ''} ${JSON.stringify(sent.map((m) => m.chat_id))}`)
await reset()
r = await req(`/content/${e.id}/confirm`, 'POST', { which: 'shoot', ok: true }, tok.dt_op)
sent = await sentList()
ok('the operator’s yes reaches the task’s owner', r.status === 200 && to(sent, CHAT.own).length === 1 && /confirmed/.test(to(sent, CHAT.own)[0].text), `${r.status} ${r.data.error || ''} ${JSON.stringify(sent.map((m) => m.chat_id))}`)
ok('…and only the owner — the admin has it in the bell', to(sent, CHAT.admin).length === 0)

// ===================== the buttons =====================
const all = async () => (await (await fetch(MOCK + '/__sent')).json())
const press = (chat, data) => hook({ callback_query: { id: `cb-${Math.random()}`, from: { id: chat }, data, message: { message_id: 1, chat: { id: chat },
  reply_markup: { inline_keyboard: [[{ text: 'x', callback_data: data }], [{ text: 'Open the task ↗', url: 'https://team.example.org/brief?task=1' }]] } } } })
const say = (chat, extra) => hook({ message: { message_id: Math.floor(Math.random() * 1e6), chat: { id: chat }, ...extra } })
const buttons = (m) => (m?.reply_markup?.inline_keyboard || []).flat()
await req('/telegram/set-webhook', 'POST', { url: 'https://team.example.org/api/telegram/webhook' })
ok('Activate asks Telegram for the buttons’ presses too', (await all()).some((m) => m.method === 'setWebhook' && (m.allowed_updates || []).includes('callback_query')))

const g = (await req('/content', 'POST', {
  title: 'Diet: buttons', channels: [chKey], type: 'video', status_id: EDITING, editor_id: ed.id, reviewer_ids: [rev.id],
})).data
await reset()
await req(`/content/${g.id}`, 'PATCH', { ready_link: 'https://drive.google.com/diet-g', milestone: 'edited' }, tok.dt_ed)
const hand = to(await sentList(), CHAT.rev).find((m) => /Diet: buttons/.test(m.text))
ok('a delivered cut carries ✅ Accept and 📝 Pravka', buttons(hand).some((b) => b.callback_data === `ok:${g.id}`) && buttons(hand).some((b) => b.callback_data === `fix:${g.id}`), JSON.stringify(hand?.reply_markup))
ok('…and the way into the task, as a button', buttons(hand).some((b) => b.url === `https://team.example.org/brief?task=${g.id}`))
ok('…not as a line in the text', !/brief\?task=/.test(hand?.text || ''))

// 📝 Pravka, typed
await reset()
await press(CHAT.rev, `fix:${g.id}`)
let ask = to(await sentList(), CHAT.rev).find((m) => m.reply_markup?.force_reply)
ok('📝 asks what to fix, as a reply', !!ask && /What should be fixed/.test(ask.text) && /Diet: buttons/.test(ask.text), ask?.text)
await reset()
await say(CHAT.rev, { text: 'Logo is cut off at 0:03' })
let task = (await req(`/content/${g.id}`)).data
ok('the answer is the pravka, filed by the reviewer', (task.revisions || []).some((v) => /Logo is cut off at 0:03/.test(v.note) && !v.resolved_at), JSON.stringify((task.revisions || []).map((v) => v.note)))
sent = await sentList()
ok('…the editor is told, the server’s own way', to(sent, CHAT.ed).some((m) => /Logo is cut off/.test(m.text)))
ok('…the reviewer hears it went', to(sent, CHAT.rev).some((m) => /Pravka sent/.test(m.text)))
ok('…and the pressed message keeps only its Open button', (await all()).some((m) => m.method === 'editMessageReplyMarkup' && buttons(m).length === 1 && buttons(m)[0].url))
await reset()
await say(CHAT.rev, { text: 'and one more thing' })
ok('a message after the answer is not another pravka', ((await req(`/content/${g.id}`)).data.revisions || []).filter((v) => /one more thing/.test(v.note)).length === 0)

// 📝 Pravka, spoken
await req(`/content/revisions/${(task.revisions || []).find((v) => !v.resolved_at).id}/resolve`, 'POST', { link: 'https://drive.google.com/diet-g2' }, tok.dt_ed)
await press(CHAT.rev, `fix:${g.id}`)
await say(CHAT.rev, { voice: { file_id: 'VOICE-1', duration: 7 } })
task = (await req(`/content/${g.id}`)).data
const vnote = (task.revisions || []).find((v) => /VOICE-1/.test(v.note))?.note || ''
ok('a voice answer is a pravka with the clip’s link', /🎤 Voice pravka — listen: https:\/\/team\.example\.org\/api\/telegram\/voice\/VOICE-1\?s=[0-9a-f]{32}/.test(vnote), vnote)
const link = (vnote.match(/https:\/\/\S+/) || [''])[0].replace('https://team.example.org', BASE)
let clip = await fetch(link)
ok('…which plays: streamed from Telegram', clip.status === 200 && /audio\/ogg/.test(clip.headers.get('content-type') || '') && (await clip.text()) === 'OggS-mock:voice/VOICE-1.oga', String(clip.status))
ok('…and only with its signature', (await fetch(link.replace(/s=[0-9a-f]+/, 's=00000000000000000000000000000000'))).status === 403)
ok('…the token never in the note', !vnote.includes(TOKEN))

// ✅ Accept: only the reviewer's
await reset()
await press(CHAT.ed, `ok:${g.id}`)
let toast = (await all()).find((m) => m.method === 'answerCallbackQuery')
ok('the editor pressing Accept is refused, with the server’s reason in the editor’s Russian', !!toast?.show_alert && /Принять монтаж может только проверяющий канала/.test(toast.text), toast?.text)
ok('…and nothing is approved', !(await req(`/content/${g.id}`)).data.approved_at)
await req(`/content/revisions/${((await req(`/content/${g.id}`)).data.revisions || []).find((v) => !v.resolved_at).id}/resolve`, 'POST', { link: 'https://drive.google.com/diet-g3' }, tok.dt_ed)
await reset()
await press(CHAT.rev, `ok:${g.id}`)
toast = (await all()).find((m) => m.method === 'answerCallbackQuery')
ok('the reviewer’s Accept approves it', !!(await req(`/content/${g.id}`)).data.approved_at, toast?.text)
ok('…and says so', /Accepted/.test(toast?.text || ''))
await reset()
await press(9999, `ok:${g.id}`)
ok('a chat nobody linked is told so', /not connected/.test((await all()).find((m) => m.method === 'answerCallbackQuery')?.text || ''))

// a booking: yes, or no with the reason
const bk = (await req('/content', 'POST', { title: 'Diet: booked', channels: [chKey], type: 'video', status_id: EDITING, assignee_ids: [own.id] })).data
await reset()
await req(`/content/${bk.id}`, 'PATCH', { operator_id: op.id, recording_date: day(4), recording_time: '10:00', recording_end: '11:00' })
const q = to(await sentList(), CHAT.op).find((m) => /🗓/.test(m.text))
ok('a booking asks with ✅ Yes and ❌ No', buttons(q).some((b) => b.callback_data === `yes:${bk.id}:shoot`) && buttons(q).some((b) => b.callback_data === `no:${bk.id}:shoot`), JSON.stringify(q?.reply_markup))
await reset()
await press(CHAT.op, `no:${bk.id}:shoot`)
ask = to(await sentList(), CHAT.op).find((m) => m.reply_markup?.force_reply)
ok('❌ asks what is in the way', !!ask && /What is in the way/.test(ask.text), ask?.text)
await say(CHAT.op, { text: 'I am at the other campus that morning', reply_to_message: { message_id: 1, from: { is_bot: true } } })
ok('a reply to an old question is not filed — the bot says so', (await req(`/content/${bk.id}`)).data.shoot_ack !== 'no'
  && to(await sentList(), CHAT.op).some((m) => /no longer open/.test(m.text)))
await press(CHAT.op, `no:${bk.id}:shoot`)
await say(CHAT.op, { text: 'I am at the other campus that morning' })
let row = (await req(`/content/${bk.id}`)).data
ok('the answer is the no, with its reason', /campus/.test(row.shoot_ack_note || '') && row.shoot_ack === 'no', JSON.stringify([row.shoot_ack, row.shoot_ack_note]))
await reset()
await press(CHAT.op, `yes:${bk.id}:shoot`)
row = (await req(`/content/${bk.id}`)).data
ok('✅ Yes confirms the booking', row.shoot_ack === 'yes', JSON.stringify(row.shoot_ack))
ok('…and the owner hears it', to(await sentList(), CHAT.own).some((m) => /confirmed/.test(m.text)))

// ===================== every word in the reader's language =====================
await reset()
const ru = (await req('/content', 'POST', {
  title: 'Diet: in Russian', channels: [chKey], type: 'video', status_id: EDITING, editor_id: ed.id, release_date: day(6),
})).data
let ruMsg = to(await sentList(), CHAT.ed).find((m) => /Diet: in Russian/.test(m.text))
ok('new work reaches a Russian reader in Russian — the hat and the day too', /📌 Новая работа для вас: монтажёр/.test(ruMsg?.text || '') && /выход /.test(ruMsg?.text || '') && /От кого: Admin/.test(ruMsg?.text || ''), ruMsg?.text)
await reset()
await req(`/content/${ru.id}/comments`, 'POST', { text: '@Eldor Editor где исходники?' }, tok.dt_rev)
ruMsg = to(await sentList(), CHAT.ed).find((m) => /💬/.test(m.text))
ok('…and so does an @-mention, the name after a colon', /💬 <b>«Diet: in Russian»<\/b>\nRana Reviewer: “@Eldor Editor где исходники\?”\nОтветьте в задаче/.test(ruMsg?.text || ''), ruMsg?.text)
ok('an operator can read Uzbek', (await req('/users/me', 'PATCH', { lang: 'uz' }, tok.dt_op)).data.lang === 'uz')
await reset()
await req(`/content/${ru.id}`, 'PATCH', { operator_id: op.id, recording_date: day(5), recording_time: '14:00', recording_end: '15:00' })
const uzAsk = to(await sentList(), CHAT.op).find((m) => /🗓/.test(m.text))
ok('…and is asked about the booking in Uzbek', /Qila olasizmi\? Suratga olish — .*14:00-15:00/.test(uzAsk?.text || ''), uzAsk?.text)
ok('…the buttons in Uzbek too', buttons(uzAsk).some((b) => b.text === '✅ Ha, qila olaman') && buttons(uzAsk).some((b) => /Vazifani ochish/.test(b.text)), JSON.stringify(uzAsk?.reply_markup))
await reset()
await press(CHAT.op, `yes:${ru.id}:shoot`)
const uzYes = to(await sentList(), CHAT.admin).find((m) => /Diet: in Russian/.test(m.text))
ok('the yes reaches the owner in the owner’s own language', /✅ <b>«Diet: in Russian»<\/b>\nOtabek Operator confirmed the shoot — /.test(uzYes?.text || ''), uzYes?.text)
await reset()
await hook({ message: { chat: { id: 4242 }, from: { id: 4242, language_code: 'ru' }, text: 'привет' } })
ok('somebody not connected yet is answered in the language their Telegram reads', to(await sentList(), 4242).some((m) => /Я приношу уведомления платформы Satashkent/.test(m.text)))

// ===================== the bot's face =====================
await reset()
await req('/telegram/set-webhook', 'POST', { url: 'https://team.example.org/api/telegram/webhook' })
const face = await all()
const desc = face.filter((m) => m.method === 'setMyDescription')
ok('Activate gives the bot its description in three languages', desc.length === 3 && desc.some((m) => !m.language_code) && desc.some((m) => m.language_code === 'ru' && /SATashkent/.test(m.description)) && desc.some((m) => m.language_code === 'uz'),
  JSON.stringify(desc.map((m) => m.language_code || 'default')))
ok('…its short line', face.filter((m) => m.method === 'setMyShortDescription').length === 3)
const cmds = face.filter((m) => m.method === 'setMyCommands')
ok('…and its menu: /help and /stop', cmds.length === 3 && cmds.every((m) => m.commands.map((c) => c.command).join() === 'help,stop'), JSON.stringify(cmds.map((m) => m.commands)))

// what anybody else types still meets the help, in their language
await reset()
await say(CHAT.ed, { text: '/help' })
ok('anything else meets the help, in the reader’s language', to(await sentList(), CHAT.ed).some((m) => /Здравствуйте/.test(m.text) && /23:00/.test(m.text)))

console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
