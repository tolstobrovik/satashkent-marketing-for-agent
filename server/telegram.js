// The Telegram bridge: the bell, mirrored into each member's pocket.
// Configured by ONE secret — the TELEGRAM_BOT_TOKEN environment variable
// (the server's .env.production, or the local shell). It is
// never written to the repo or the database; with no token the whole bridge
// is inert and invisible. Messages are Telegram-HTML — titles read bold and
// links hide behind words — so every scrap of user-typed text (titles,
// names, notes) walks through tgEsc before joining a message.
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'fs'
import { appendFile } from 'fs/promises'
import { join } from 'path'
import { all, get, run, dayISO, TG_DIR } from './db.js'
import { resolveGates, phasePassed } from './deadlines.js'
import { tgWords } from './tgcopy.js'
// The token comes from the environment only, so local dev stacks and the QA
// gate can never ring a real bot by accident.
export const tgToken = () => process.env.TELEGRAM_BOT_TOKEN || ''
export const tgEnabled = () => !!tgToken()

// Where the dashboard lives publicly — learned the day the admin presses
// "Activate webhook" and remembered, so messages can carry task links.
// Cached in-process for a minute: the address basically never changes, and a
// burst of notifications should not pay a database read per message.
let urlCache = { v: null, at: 0 }
export async function tgPublicUrl() {
  if (urlCache.v !== null && Date.now() - urlCache.at < 60000) return urlCache.v
  const v = (await get("SELECT value FROM meta WHERE key = 'public_url'"))?.value || ''
  urlCache = { v, at: Date.now() }
  return v
}
export const tgRememberUrl = (origin) => {
  urlCache = { v: origin, at: Date.now() }
  return run("INSERT INTO meta (key, value) VALUES ('public_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", origin)
}
// api.telegram.org, unless the QA mock points elsewhere.
const base = () => process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'
// Where a file Telegram keeps is read from (getFile's file_path). The address
// carries the token, so it is only ever fetched here, never handed out.
export const tgFileUrl = (path) => `${base()}/file/bot${tgToken()}/${path}`

// The webhook proves itself with a secret derived from the token — Telegram
// echoes it back in a header on every update, and there is nothing extra to
// configure, store or rotate separately.
export const tgWebhookSecret = () =>
  createHash('sha256').update(`satashkent:${tgToken()}`).digest('hex').slice(0, 40)

export async function tgApi(method, payload) {
  if (!tgEnabled()) return null
  const r = await fetch(`${base()}/bot${tgToken()}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  return r.json().catch(() => null)
}

// The bot's public @username (for the t.me deep link) — asked once, then kept.
let botName = null
export async function tgBotUsername() {
  if (!tgEnabled()) return null
  if (!botName) botName = (await tgApi('getMe', {}).catch(() => null))?.result?.username || null
  return botName
}

// Telegram-HTML knows four special characters; everything a person typed
// passes through here before joining a message, so a title like "A <b> tag"
// can never break (or style) the notification.
export const tgEsc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Dates the way people read them, in their own language: 2026-08-12 →
// "Wed, 12 Aug", «ср, 12 авг.», "Chor, 12-avg".
const DATE_TAG = { en: 'en-GB', ru: 'ru-RU', uz: 'uz-Latn-UZ' }
export const tgDate = (iso, lang = 'en') => {
  const s = String(iso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return iso || ''
  return new Date(`${s}T12:00:00Z`).toLocaleDateString(DATE_TAG[lang] || 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

// Telegram refuses messages over 4096 characters — a runaway task title or
// pasted essay must never silence the whole notification.
export const tgClip = (s) => {
  const t = String(s ?? '')
  return t.length > 4000 ? `${t.slice(0, 4000)}…` : t
}

// One message to one linked member. A Telegram hiccup must never break the
// request that triggered it — the bell row is already written; this is a
// mirror. If the HTML ever fails to parse (a clipped tag), or a button is
// refused (Telegram takes no localhost address), the same words go out plain,
// the task's address written under them, rather than not at all.
// Answers with the message Telegram kept ({ chat_id, message_id }), or null —
// so a later message can be sent as a reply to it (pravkalist.js).
export async function tgSendTo(userId, text, markup = null) {
  if (!tgEnabled() || !userId) return null
  try {
    const u = await get('SELECT telegram_chat_id FROM users WHERE id = ?', userId)
    if (!u?.telegram_chat_id) return null
    const r = await tgApi('sendMessage', {
      chat_id: u.telegram_chat_id, text: tgClip(text), parse_mode: 'HTML', disable_web_page_preview: true,
      ...(markup ? { reply_markup: markup } : {}),
    })
    if (r && r.ok === false) {
      // Blocking the bot, or deleting the chat, is a decision — not a hiccup.
      // Telegram will refuse every future message the same way, so the link
      // is dropped: the person stops being told they are connected when they
      // are not, the admin panel tells the truth, and nobody keeps calling an
      // API that has already said no. Profile → Connect brings it back.
      if (r.error_code === 403 || /chat not found|user is deactivated|bot was blocked/i.test(r.description || '')) {
        await run('UPDATE users SET telegram_chat_id = NULL WHERE id = ?', userId)
        console.error(`telegram: ${u.telegram_chat_id} refuses messages (${r.description || r.error_code}) — link dropped`)
        return null
      }
      const open = markup?.inline_keyboard?.flat().find((b) => b.url)?.url
      const plain = await tgApi('sendMessage', { chat_id: u.telegram_chat_id, text: tgClip(open ? `${text}\n${open}` : text), disable_web_page_preview: true })
      return plain?.result?.message_id ? { chat_id: u.telegram_chat_id, message_id: plain.result.message_id } : null
    }
    return r?.result?.message_id ? { chat_id: u.telegram_chat_id, message_id: r.result.message_id } : null
  } catch (e) { console.error('telegram send failed:', e.message); return null }
}
// Where a message's task link should point: the remembered public address
// when the admin has activated the webhook, otherwise the address the
// triggering request itself arrived on — so links work from the very first
// notification, not only after Activate.
export const tgOriginFrom = (req) => {
  const h = req?.get?.('host') || ''
  if (!h) return ''
  return `${/^(localhost|127\.)/.test(h) ? 'http' : 'https'}://${h}`
}

// ---- the diet: what is worth a phone buzzing --------------------------------
// The bell mirrored everything, and a phone that buzzes for every card dragged
// from Idea to To shoot is a phone people stop reading — so the pravka and the
// delivered cut were drowning in it. The bell still logs every event; Telegram
// carries only what somebody has to act on, now:
//
//   delivered  a cut, artwork or footage handed in — to whoever works next:
//              the reviewer for a cut or artwork, the editor for footage
//   pravka     a pravka asked of the one hat that fixes it
//   assigned   work newly given to somebody, a booking asked of them, and
//              their yes or no back to the task's owner
//   mention    somebody named with @ — a direct question is high-signal
//
// The owner's four (27 October 2026): new work or a booking, a pravka, work
// to review, a mention. A piece running late and the editors' reminders the
// evening before and the morning of a day were on the phone too, and are the
// bell's now — the callers still say `late` and `reminder`, and are silent.
//
// A caller says which it is. A caller that says nothing is silent — so a new
// kind of notice added next year stays in the bell until somebody decides it
// is worth a buzz, rather than buzzing by default. Stage moves, publishing,
// approvals, date requests and comments nobody was named in are the bell's.
//
// And nobody is told about their own act: the `actor` is dropped from the
// recipients whatever the caller passed, so a reviewer who is also the editor
// is not pinged by their own hand-in.
// …and Jarvis's alerts to the admins (jarvis.js): a problem it spotted, told once.
export const TG_KINDS = new Set(['delivered', 'pravka', 'assigned', 'mention', 'jarvis'])

// ---- the buttons -------------------------------------------------------------
// What the reader can do from the chat itself, then the way into the task. A
// caller names the actions the message offers; a press is answered by
// tgactions.js, through the same API routes the dashboard calls, as the person
// who pressed — so every rule stays the server's.
//   review          ✅ Accept · 📝 Pravka   (a delivered cut or artwork)
//   booking:shoot   ✅ Yes · ❌ No          (a booking asked of the operator)
//   booking:edit    ✅ Yes · ❌ No          (…or of the editor)
//   list:<rev>:<01…> ☐ 1 ☑ 2 …             (a pravka's checklist, pravkalist.js)
// Telegram caps callback_data at 64 bytes: "fix:123456" is the whole of it.
export function tgKeyboard(lang, contentId, origin, actions = []) {
  const w = tgWords(lang)
  const rows = []
  for (const a of actions || []) {
    if (a === 'review') {
      rows.push([{ text: w.btn.accept, callback_data: `ok:${contentId}` }, { text: w.btn.pravka, callback_data: `fix:${contentId}` }])
      continue
    }
    const b = /^booking:(shoot|edit)$/.exec(a)
    if (b) rows.push([{ text: w.btn.yes, callback_data: `yes:${contentId}:${b[1]}` }, { text: w.btn.no, callback_data: `no:${contentId}:${b[1]}` }])
    const l = /^list:(\d+):([01]+)$/.exec(a)
    if (l) {
      const ticks = [...l[2]].map((d, i) => ({ text: `${d === '1' ? '☑' : '☐'} ${i + 1}`, callback_data: `ck:${l[1]}:${i}` }))
      for (let i = 0; i < ticks.length; i += 5) rows.push(ticks.slice(i, i + 5))
    }
  }
  if (origin && contentId) rows.push([{ text: w.open, url: `${origin}/brief?task=${contentId}` }])
  return rows.length ? { inline_keyboard: rows } : null
}

// ---- the night ---------------------------------------------------------------
// Nothing buzzes from 23:00 to 08:00 Tashkent time. What the night brings is
// kept beside the database (DATA_DIR/telegram/night.ndjson — never inside it: a
// write to the database is an upload of the whole file) and leaves the first
// time the bot looks after eight, as ONE message a person.
// TG_QUIET_HOURS is "23-8" unless set; "off" for the suites, which run at any
// hour, and "0-24" for the one that holds a night on purpose.
const NIGHT = () => join(TG_DIR, 'night.ndjson')
export function tgQuietNow(hour = tashkentHour()) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(process.env.TG_QUIET_HOURS ?? '23-8').trim())
  if (!m) return false
  const from = Number(m[1]), to = Number(m[2])
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to
}
async function holdForMorning(rows) {
  mkdirSync(TG_DIR, { recursive: true })
  await appendFile(NIGHT(), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
}

// The morning: everything held, a person at a time. One thing held goes out as
// it would have, buttons and all; several are one message — the night's
// messages one under the other, a button into each task and the task's own
// buttons under it. The file is
// renamed before it is read, so what arrives while it is sent starts the next
// night's, and a send cut short by a restart is finished by the next look.
let mornings = false
export async function tgMorning() {
  if (!tgEnabled() || mornings || tgQuietNow()) return 0
  const sending = `${NIGHT()}.sending`
  if (!existsSync(sending) && !existsSync(NIGHT())) return 0
  mornings = true
  try {
    if (!existsSync(sending)) renameSync(NIGHT(), sending)
    const held = readFileSync(sending, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter((r) => r?.uid && r.text)
    const byUser = new Map()
    for (const r of held) byUser.set(r.uid, [...(byUser.get(r.uid) || []), r])
    const ids = [...new Set(held.map((r) => r.contentId).filter(Boolean))]
    const titles = new Map(ids.length ? (await all(
      `SELECT id, title FROM content WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).catch(() => []))
      .map((t) => [t.id, t.title]) : [])
    const origin = await tgPublicUrl().catch(() => '')
    const langs = new Map((await all('SELECT id, lang FROM users').catch(() => [])).map((u) => [u.id, u.lang]))
    for (const [uid, rows] of byUser) {
      const lang = langs.get(uid)
      const w = tgWords(lang)
      if (rows.length === 1) {
        const r = rows[0]
        await tgSendTo(uid, `${w.morning(1)}\n\n${r.text}`, tgKeyboard(lang, r.contentId, origin || r.origin, r.actions))
        continue
      }
      // Whole messages only, never a clipped one: a cut tag would turn the
      // summary plain. What does not fit is counted.
      let body = w.morning(rows.length)
      let shown = 0
      for (const r of rows) {
        if (body.length + r.text.length > 3600) break
        body += `\n\n${r.text}`
        shown++
      }
      if (shown < rows.length) body += `\n\n${w.more(rows.length - shown)}`
      // A task a row: its name opens it, and what it still asks of the reader
      // (Accept, Pravka, Yes, No) sits under its name — the summary keeps the
      // buttons the night's messages had.
      const at = origin || rows.find((r) => r.origin)?.origin
      const keys = []
      for (const id of [...new Set(rows.map((r) => r.contentId).filter(Boolean))].slice(0, 8)) {
        if (at) keys.push([{ text: `▶ «${String(titles.get(id) || `#${id}`).slice(0, 40)}»`, url: `${at}/brief?task=${id}` }])
        const acts = [...new Set(rows.filter((r) => r.contentId === id).flatMap((r) => r.actions || []))]
        keys.push(...(tgKeyboard(lang, id, '', acts)?.inline_keyboard || []))
      }
      await tgSendTo(uid, body, keys.length ? { inline_keyboard: keys } : null)
    }
    unlinkSync(sending)
    return held.length
  } finally { mornings = false }
}

// The bell's fan-out, with a tap-to-open task button — immediately, or at
// eight when it happens at night. `text` is either the message, or a function
// of the reader's language that writes it (see tgcopy.js), so each person
// reads it in the language they chose. `actions` are the buttons it offers
// (tgKeyboard). Answers with the messages that went out now (none at night).
export async function tgMirror(userIds, text, contentId = null, fallbackOrigin = '', { kind = null, actor = null, actions = [] } = {}) {
  if (!tgEnabled() || !TG_KINDS.has(kind)) return []
  const ids = [...new Set(userIds)].filter((id) => id && id !== actor)
  if (!ids.length) return []
  const langs = new Map((await all(
    `SELECT id, lang FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).catch(() => []))
    .map((u) => [u.id, u.lang]))
  const origin = contentId ? ((await tgPublicUrl().catch(() => '')) || fallbackOrigin) : ''
  const lineOf = (id) => (typeof text === 'function' ? text(langs.get(id)) : text)
  if (tgQuietNow()) {
    const linked = new Set((await all(
      `SELECT id FROM users WHERE telegram_chat_id IS NOT NULL AND id IN (${ids.map(() => '?').join(',')})`, ...ids)
      .catch(() => [])).map((u) => u.id))
    const at = new Date().toISOString()
    const rows = ids.filter((id) => linked.has(id))
      .map((id) => ({ uid: id, text: lineOf(id), contentId, origin, actions, kind, at }))
    if (rows.length) await holdForMorning(rows).catch((e) => console.error('telegram: the night could not be kept:', e.message))
    return []
  }
  const sent = await Promise.allSettled(ids.map((id) => tgSendTo(id, lineOf(id), tgKeyboard(langs.get(id), contentId, origin, actions))))
  return sent.map((s) => (s.status === 'fulfilled' ? s.value : null)).filter(Boolean)
}

// ---- pointing itself at this deployment ------------------------------------------
// The webhook is where Telegram sends what people write and press. It waited
// for an admin to press Activate after a token landed; now the server does it
// as it boots, from its own public address (PUBLIC_URL, which the deploy
// writes): when Telegram's webhook points anywhere else, misses the buttons'
// presses, or was last refused here (a new token derives a new secret, so
// the old webhook's deliveries meet a 403). A bot already pointed here, and
// heard, is left alone. Activate stays, for an address the deploy does not
// know.
export async function tgSelfActivate() {
  if (!tgEnabled()) return false
  const site = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '')
  if (!/^https:\/\//.test(site)) return false
  const url = `${site}/api/telegram/webhook`
  const info = (await tgApi('getWebhookInfo', {}).catch(() => null))?.result
  const updates = info?.allowed_updates || []
  const heard = !/\b(401|403)\b/.test(info?.last_error_message || '')
  if (info && info.url === url && (!updates.length || updates.includes('callback_query')) && heard) {
    if (!(await tgPublicUrl().catch(() => ''))) await tgRememberUrl(site)
    return false
  }
  const out = await tgApi('setWebhook', { url, secret_token: tgWebhookSecret(), allowed_updates: ['message', 'callback_query'] })
  if (!out?.ok) {
    console.error(`telegram: could not point the bot at ${url}: ${out?.description || 'no answer'}`)
    return false
  }
  await tgRememberUrl(site)
  await tgSetProfile().catch(() => false)
  console.log(`telegram: the bot now answers at ${url}`)
  return true
}

// ---- the bot's face ------------------------------------------------------------
// What Telegram shows before anybody has written a word — the description in
// an empty chat, the line on the bot's profile, the menu of commands — in
// English, and in Russian and Uzbek for whoever's Telegram reads those. Set
// with the webhook, so one press of Activate does it all.
export async function tgSetProfile() {
  if (!tgEnabled()) return false
  const calls = []
  for (const lang of ['en', 'ru', 'uz']) {
    const w = tgWords(lang)
    const language_code = lang === 'en' ? undefined : lang
    const scope = language_code ? { language_code } : {}
    calls.push(
      tgApi('setMyDescription', { description: w.about, ...scope }),
      tgApi('setMyShortDescription', { short_description: w.aboutShort, ...scope }),
      tgApi('setMyCommands', {
        commands: [{ command: 'help', description: w.commands.help }, { command: 'stop', description: w.commands.stop }],
        ...scope,
      }),
    )
  }
  const out = await Promise.all(calls.map((c) => c.catch(() => null)))
  return out.every((r) => r?.ok)
}

// ---- the admin's own nudges -------------------------------------------------
// Who a template speaks to. Everything resolves to plain user ids; whoever
// hasn't connected Telegram simply hears nothing.
export async function tgAudience(audience) {
  const a = String(audience || 'linked')
  if (a.startsWith('users:')) {
    const ids = a.slice(6).split(',').map(Number).filter(Boolean)
    if (!ids.length) return []
    // Like every other audience: the people who would actually hear it. A
    // picked name with no Telegram was counted in the audience and in "sent".
    return (await all(`SELECT id FROM users WHERE telegram_chat_id IS NOT NULL AND id IN (${ids.map(() => '?').join(',')})`, ...ids)).map((u) => u.id)
  }
  if (a.startsWith('role:')) {
    const role = a.slice(5)
    return (await all('SELECT id FROM users WHERE role = ? AND telegram_chat_id IS NOT NULL', role)).map((u) => u.id)
  }
  if (a.startsWith('channel:')) {
    const key = a.slice(8)
    return (await all('SELECT id, departments FROM users WHERE telegram_chat_id IS NOT NULL'))
      .filter((u) => { try { return JSON.parse(u.departments || '[]').includes(key) } catch { return false } })
      .map((u) => u.id)
  }
  return (await all('SELECT id FROM users WHERE telegram_chat_id IS NOT NULL')).map((u) => u.id)
}

// Send one template. The words are the admin's, so they go out escaped —
// nobody should have to think about angle brackets to write a reminder.
export async function tgSendTemplate(tpl, userIds = null) {
  // A hand-picked list goes through the same filter as a saved audience.
  const ids = await tgAudience(userIds && userIds.length ? `users:${userIds.join(',')}` : tpl.audience)
  if (!ids.length) return 0
  const origin = await tgPublicUrl().catch(() => '')
  const body = `<b>${tgEsc(tpl.title)}</b>\n${tgEsc(tpl.text)}`
  const langs = new Map((await all(
    `SELECT id, lang FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).catch(() => []))
    .map((u) => [u.id, u.lang]))
  await Promise.allSettled([...new Set(ids)].map((id) => tgSendTo(id, body,
    origin ? { inline_keyboard: [[{ text: tgWords(langs.get(id)).openDay, url: `${origin}/brief` }]] } : null)))
  return new Set(ids).size
}

// The hour, and the weekday, as Tashkent sees them.
const tashkentHour = () => Number(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false,
}).format(new Date()))
const tashkentWeekday = () => new Date(`${dayISO(0)}T12:00:00Z`).getUTCDay() // 0 = Sunday

// Fire whatever is due. Each template claims its day in the same breath as
// it is chosen, so a schedule goes out ONCE however many times this is
// called — and it is called often, because the host's cron only runs nightly
// and a Monday-morning nudge should not wait for midnight.
export async function tgRunSchedules() {
  if (!tgEnabled()) return 0
  const today = dayISO(0)
  const hour = tashkentHour()
  const weekday = tashkentWeekday()
  const due = (await all('SELECT * FROM tg_templates WHERE enabled = 1')).filter((t) => {
    if (t.last_sent === today) return false
    if (Number(t.hour) > hour) return false
    let days = []
    try { days = JSON.parse(t.days || '[]') } catch { days = [] }
    return Array.isArray(days) && days.includes(weekday)
  })
  let sent = 0
  for (const t of due) {
    // claim first: two instances waking at the same minute must not both send
    const claim = await run('UPDATE tg_templates SET last_sent = ? WHERE id = ? AND (last_sent IS NULL OR last_sent <> ?)',
      today, t.id, today)
    if (!claim?.changes) continue
    try { sent += await tgSendTemplate(t) } catch (e) { console.error('template send failed:', e.message) }
  }
  return sent
}

