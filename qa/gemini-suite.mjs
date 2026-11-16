// Gemini: a pravka, as the fixer's list of changes (server/gemini.js,
// server/pravkalist.js).
//
// The reviewer writes — or says — what is wrong; a few seconds later the round
// carries a checklist in the fixer's language, one change a line; the fixer's
// Telegram gets it as a silent reply under the pravka, with a button to tick
// each change, and the window ticks the same list. A limit from Google waits
// and comes back with nothing lost; a clip Google cannot read leaves the
// written note to work from; with no key nothing of this runs at all.
//
// Self-contained: API :4133 (and :4135 with no key), Telegram mock :9933,
// Gemini mock :9934.
//   DASHB_ROOT=$PWD node qa/gemini-suite.mjs
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
const SP = fileURLToPath(new URL('.', import.meta.url))
const BASE = 'http://localhost:4133'
const BARE = 'http://localhost:4135'
const TG = 'http://localhost:9933'
const GM = 'http://localhost:9934'
const TOKEN = 'gemini-test-token'
const KEY = 'gemini-test-key'
const SECRET = createHash('sha256').update(`satashkent:${TOKEN}`).digest('hex').slice(0, 40)

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const procs = []
const boot = (args, env) => { const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'ignore' }); procs.push(p); return p }
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL') } catch { /* gone */ } } })
const common = {
  TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_BASE: TG, TG_QUIET_HOURS: 'off',
  GITHUB_DATA_TOKEN: '', GH_DATA_TOKEN: '', DATABASE_URL: '', CRON_SECRET: '',
}
boot([join(SP, 'mock-tg.mjs')], { MOCK_PORT: '9933' })
boot([join(SP, 'mock-gemini.mjs')], { MOCK_GEMINI_PORT: '9934' })
boot([join(ROOT, 'server/index.js')], {
  ...common, DATA_DIR: join(tmpdir(), `gemini-${Date.now()}`), PORT: '4133',
  GEMINI_API_KEY: KEY, GEMINI_BASE_URL: GM, PRAVKA_RETRY_SCALE: '0.0001', PRAVKA_SWEEP_MS: '700',
})
boot([join(ROOT, 'server/index.js')], {
  ...common, DATA_DIR: join(tmpdir(), `gemini-bare-${Date.now()}`), PORT: '4135',
  GEMINI_API_KEY: '', GEMINI_BASE_URL: GM, TELEGRAM_BOT_TOKEN: '',
})
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
const gmCalls = async () => (await (await fetch(GM + '/__calls')).json()).filter((c) => /generateContent/.test(c.url))
const mode = (m) => fetch(GM + '/__mode', { method: 'POST', body: JSON.stringify({ mode: m }) })
const resets = () => Promise.all([fetch(TG + '/__reset', { method: 'POST' }), fetch(GM + '/__reset', { method: 'POST' })])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rounds = async (id) => (await req(`/content/${id}/revisions`)).data
const until = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 250) { const v = await fn(); if (v) return v; await sleep(250) } return null }

const statuses = (await req('/statuses')).data
const EDITING = statuses.find((s) => /^editing$/i.test(s.label))?.id
const chKey = (await req('/channels')).data.find((c) => c.format === 'social')?.key
const mk = async (name, username, role, departments = [chKey]) =>
  (await req('/users', 'POST', { name, username, password: 'probe1234', role, departments })).data
const rev = await mk('Gulnora Reviewer', 'gm_rev', 'member')
const ed = await mk('Jasur Editor', 'gm_ed', 'editor', [])
const tok = { rev: await login('gm_rev', 'probe1234'), ed: await login('gm_ed', 'probe1234') }
ok('the editor reads Uzbek', (await req('/users/me', 'PATCH', { lang: 'uz' }, tok.ed)).data.lang === 'uz')
const CHAT = { ed: 902, rev: 901 }
for (const [t, chat] of [[tok.ed, CHAT.ed], [tok.rev, CHAT.rev]]) {
  const l = (await req('/telegram/link', 'POST', {}, t)).data
  await hook({ message: { chat: { id: chat }, text: `/start ${l.code}` } })
}
const piece = async (title) => {
  const t = (await req('/content', 'POST', { title, channels: [chKey], type: 'video', status_id: EDITING, editor_id: ed.id, reviewer_ids: [rev.id] })).data
  await req(`/content/${t.id}`, 'PATCH', { ready_link: `https://drive.google.com/${t.id}`, milestone: 'edited' }, tok.ed)
  return t
}

// ===================== a typed pravka =====================
const a = await piece('Gemini: the reel')
await resets()
const t0 = Date.now()
let r = await req(`/content/${a.id}/revisions`, 'POST', { note: 'The intro is too long. Make the logo bigger at 0:12.', target: 'editor' }, tok.rev)
ok('the reviewer’s pravka is answered at once, before any list', r.status === 201 && Date.now() - t0 < 3000, `${r.status} ${Date.now() - t0}ms`)
let round = await until(async () => (await rounds(a.id)).find((x) => x.checklist?.length))
ok('a few seconds later the round carries its list of changes', round?.checklist?.length === 2, JSON.stringify(round?.checklist))
ok('…one change a line, nothing ticked', round?.checklist.every((c) => c.done === false) && /intro is too long/.test(round.checklist[0].text) && /0:12/.test(round.checklist[1].text))
ok('…written in the fixer’s language', round?.list_lang === 'uz' && round.checklist.every((c) => c.text.startsWith('[Uzbek')), JSON.stringify(round?.checklist))
ok('…by the newest stable Flash the key may call', round?.list_model === 'gemini-3.6-flash', round?.list_model)
ok('…the reviewer’s own words untouched beside it', round?.note === 'The intro is too long. Make the logo bigger at 0:12.')
let g = await gmCalls()
ok('Gemini is asked once, the key in a header and never in the address', g.length === 1 && g[0].key === KEY && !g[0].url.includes(KEY), JSON.stringify(g.map((c) => c.url)))

// Telegram: the pravka, then the list as a silent reply under it. The reply
// leaves after the list is saved, so it is waited for, not assumed.
const toEd = async () => (await tgAll()).filter((m) => m.method === 'sendMessage' && String(m.chat_id) === String(CHAT.ed))
await until(async () => (await toEd()).some((m) => m.reply_parameters))
let sent = await toEd()
const pravkaMsg = sent.find((m) => /📝/.test(m.text) && !m.reply_parameters)
const listMsg = sent.find((m) => m.reply_parameters)
ok('the fixer’s Telegram gets the pravka, then its list', !!pravkaMsg && !!listMsg, JSON.stringify(sent.map((m) => m.text?.slice(0, 40))))
ok('…the list a silent reply under the pravka — one buzz, not two', listMsg?.disable_notification === true && Number.isInteger(listMsg?.reply_parameters?.message_id))
ok('…in Uzbek, with a box per change', /Nimani tuzatish kerak — <b>«Gemini: the reel»<\/b>, 1-bosqich:/.test(listMsg?.text || '') && /☐ 1\. /.test(listMsg?.text || '') && /☐ 2\. /.test(listMsg?.text || ''), listMsg?.text)
const ticks = (listMsg?.reply_markup?.inline_keyboard || []).flat().filter((b) => /^ck:/.test(b.callback_data || ''))
ok('…and a button to tick each one', ticks.length === 2 && ticks[0].callback_data === `ck:${round?.id}:0`, JSON.stringify(ticks))

// ticking, in Telegram and in the window
await resets()
await hook({ callback_query: { id: 'cb-1', from: { id: CHAT.ed }, data: `ck:${round.id}:0`, message: { message_id: 5, chat: { id: CHAT.ed } } } })
round = (await rounds(a.id)).find((x) => x.id === round.id)
ok('the fixer ticks change 1 from Telegram', round.checklist[0].done === true && round.checklist[1].done === false)
const edit = (await tgAll()).find((m) => m.method === 'editMessageText')
ok('…and the message redraws with it ticked', /☑ 1\. /.test(edit?.text || '') && /☐ 2\. /.test(edit?.text || ''), edit?.text)
r = await req(`/content/revisions/${round.id}/checklist`, 'PATCH', { i: 1, done: true }, tok.rev)
ok('the reviewer cannot tick the fixer’s list', r.status === 403, String(r.status))
r = await req(`/content/revisions/${round.id}/checklist`, 'PATCH', { i: 1, done: true }, tok.ed)
ok('…the fixer can, from the window', r.status === 200 && r.data.checklist.every((c) => c.done), JSON.stringify(r.data))
r = await req(`/content/revisions/${round.id}/checklist`, 'PATCH', { i: 9 }, tok.ed)
ok('…and only a change that is on the list', r.status === 400)
await resets()
await hook({ callback_query: { id: 'cb-2', from: { id: CHAT.ed }, data: `ck:${round.id}:1`, message: { message_id: 5, chat: { id: CHAT.ed } } } })
await hook({ callback_query: { id: 'cb-3', from: { id: CHAT.ed }, data: `ck:${round.id}:1`, message: { message_id: 5, chat: { id: CHAT.ed } } } })
const done = (await tgAll()).filter((m) => m.method === 'editMessageText').pop()
ok('all ticked, the message says to hand the fix in', /Hammasi tayyor/.test(done?.text || ''), done?.text)

// ===================== a spoken pravka, on the page =====================
const b = await piece('Gemini: the spoken one')
await resets()
r = await req(`/content/${b.id}/revisions`, 'POST', {
  note: 'Listen to the clip.', target: 'editor', voice: `data:audio/webm;base64,${Buffer.from('a voice').toString('base64')}`, voice_secs: 4,
}, tok.rev)
ok('a pravka with a voice note is made', r.status === 201, `${r.status} ${r.data.error || ''}`)
round = await until(async () => (await rounds(b.id)).find((x) => x.checklist?.length))
g = await gmCalls()
ok('Gemini hears the clip itself', g.some((c) => c.body.contents?.[0]?.parts?.some((p) => p.inlineData?.mimeType === 'audio/webm')), JSON.stringify(g.map((c) => c.body.contents?.[0]?.parts?.length)))
ok('…and what it heard is kept with the list', /heard audio\/webm/.test(round?.heard || ''), round?.heard)

// ===================== a spoken pravka, from Telegram =====================
const c = await piece('Gemini: from the bot')
await resets()
const deliv = (await req('/content', 'POST', { title: 'x', channels: [chKey], type: 'video', status_id: EDITING })).data
void deliv
await hook({ callback_query: { id: 'cb-4', from: { id: CHAT.rev }, data: `fix:${c.id}`, message: { message_id: 7, chat: { id: CHAT.rev } } } })
await hook({ message: { message_id: 77, chat: { id: CHAT.rev }, voice: { file_id: 'VOICE-GM', duration: 6 } } })
round = await until(async () => (await rounds(c.id)).find((x) => x.checklist?.length))
g = await gmCalls()
ok('a voice pravka sent to the bot is heard too, as Telegram’s OGG', g.some((c2) => c2.body.contents?.[0]?.parts?.some((p) => p.inlineData?.mimeType === 'audio/ogg')) && /heard audio\/ogg/.test(round?.heard || ''), round?.heard)

// ===================== when Google says "not now" =====================
const d = await piece('Gemini: the busy day')
await mode('429')
await resets()
await req(`/content/${d.id}/revisions`, 'POST', { note: 'Colour is too warm.', target: 'editor' }, tok.rev)
round = await until(async () => (await rounds(d.id)).find((x) => x.list_state === 'wait'), 6000)
ok('a limit leaves the pravka as it is, waiting for its list', round?.list_state === 'wait' && !round.checklist.length && round.list_wait === true, JSON.stringify(round && { s: round.list_state, l: round.checklist }))
await mode('ok')
round = await until(async () => (await rounds(d.id)).find((x) => x.checklist?.length), 15000)
ok('…and the list comes once Google takes it again — nothing lost', round?.checklist?.length === 1 && round.list_state === 'done', JSON.stringify(round?.checklist))
const late = await until(async () => (await tgAll()).find((m) => String(m.chat_id) === String(CHAT.ed) && /Gemini: the busy day/.test(m.text || '') && /☐ 1\./.test(m.text || '')))
ok('…the fixer told then — still the silent reply under the pravka', !!late && late.disable_notification === true && !!late.reply_parameters, JSON.stringify(late && { r: late.reply_parameters, s: late.disable_notification }))

// ===================== a clip Google cannot read =====================
const e = await piece('Gemini: odd clip')
await mode('400audio')
await resets()
await req(`/content/${e.id}/revisions`, 'POST', {
  note: 'Cut the last shot.', target: 'editor', voice: `data:audio/webm;base64,${Buffer.from('odd').toString('base64')}`, voice_secs: 2,
}, tok.rev)
round = await until(async () => (await rounds(e.id)).find((x) => x.checklist?.length))
ok('a clip Google cannot read still gives a list, from the written note', round?.checklist?.length === 1 && /last shot/.test(round.checklist[0].text), JSON.stringify(round?.checklist))
await mode('ok')

// ===================== a round fixed before its list =====================
const f = await piece('Gemini: quick fix')
await mode('500')
await req(`/content/${f.id}/revisions`, 'POST', { note: 'Fix the typo.', target: 'editor' }, tok.rev)
const open = await until(async () => (await rounds(f.id)).find((x) => x.list_state === 'wait'), 6000)
await req(`/content/revisions/${open.id}/resolve`, 'POST', { link: 'https://drive.google.com/fixed' }, tok.ed)
await mode('ok')
await resets()
await sleep(2500)
round = (await rounds(f.id)).find((x) => x.id === open.id)
ok('a round fixed in the meantime is left alone', !round.checklist.length && !round.list_wait && (await gmCalls()).length === 0, JSON.stringify({ s: round.list_state, n: (await gmCalls()).length }))

// ===================== no key, no Gemini =====================
await resets()
const TB = await login('admin', 'admin123', BARE)
const ch2 = (await req('/channels', 'GET', null, TB, BARE)).data.find((x) => x.format === 'social')?.key
const st2 = (await req('/statuses', 'GET', null, TB, BARE)).data.find((s) => /^editing$/i.test(s.label))?.id
const z = (await req('/content', 'POST', { title: 'No key', channels: [ch2], type: 'video', status_id: st2 }, TB, BARE)).data
r = await req(`/content/${z.id}/revisions`, 'POST', { note: 'Shorter, please.', target: 'editor' }, TB, BARE)
await sleep(1500)
const zr = (await req(`/content/${z.id}/revisions`, 'GET', null, TB, BARE)).data[0]
ok('with no key a pravka is its note — no list, no waiting, no call', r.status === 201 && !zr.checklist.length && zr.list_wait === false && (await gmCalls()).length === 0,
  JSON.stringify({ s: r.status, w: zr?.list_wait }))

console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
