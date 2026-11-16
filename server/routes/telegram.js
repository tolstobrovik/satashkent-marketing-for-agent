// The Telegram bridge's front door. The webhook is the one route Telegram
// itself calls (proved by the derived secret header, no session); everything
// else is a signed-in member managing their own link, plus the admin's
// one-press webhook activation after a deploy.
import { Router } from 'express'
import { randomBytes } from 'crypto'
import { Readable } from 'stream'
import { all, get, run } from '../db.js'
import { authRequired, wrap, isFullAdmin } from '../auth.js'
import { tgEnabled, tgApi, tgBotUsername, tgWebhookSecret, tgSendTo, tgPublicUrl, tgRememberUrl, tgClip, tgSendTemplate, tgAudience, tgFileUrl, tgSetProfile } from '../telegram.js'
import { tgOnButton, tgOnReply, tgVoiceSigned, tgJarvis } from '../tgactions.js'
import { tgWords, tgLangOf } from '../tgcopy.js'

const router = Router()

router.post('/webhook', wrap(async (req, res) => {
  if (!tgEnabled()) return res.status(503).json({ error: 'Telegram is not configured' })
  if (req.get('X-Telegram-Bot-Api-Secret-Token') !== tgWebhookSecret())
    return res.status(403).json({ error: 'Wrong secret' })
  // A button under one of the bot's messages (tgactions.js).
  if (req.body?.callback_query) {
    await tgOnButton(req.body.callback_query)
    return res.json({ ok: true })
  }
  const msg = req.body?.message
  const chatId = msg?.chat?.id
  const text = String(msg?.text || '')
  // The language Telegram says this person reads — for whoever has not chosen
  // one in the dashboard yet.
  const heard = tgLangOf(msg?.from?.language_code)
  if (chatId && /^\/start\b/.test(text)) {
    // The deep link carries a one-time code minted on the Profile page —
    // pressing Start hands it back here and ties the accounts together.
    const code = text.split(/\s+/)[1] || ''
    const u = code ? await get('SELECT id, name, lang FROM users WHERE telegram_code = ?', code) : null
    if (u) {
      await run('UPDATE users SET telegram_chat_id = ?, telegram_code = NULL WHERE id = ?', String(chatId), u.id)
      await tgApi('sendMessage', { chat_id: chatId, text: tgWords(u.lang || heard).connected(u.name) })
    } else {
      await tgApi('sendMessage', { chat_id: chatId, text: tgWords(heard).howToConnect })
    }
  } else if (chatId && /^\/stop\b/.test(text)) {
    const was = await get('SELECT lang FROM users WHERE telegram_chat_id = ?', String(chatId))
    await run('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = ?', String(chatId))
    await tgApi('sendMessage', { chat_id: chatId, text: tgWords(was?.lang || heard).disconnected })
  } else if (chatId && (text || msg.voice) && await tgOnReply(msg)) {
    // The answer to a question the bot asked (a pravka, a "no"): filed.
  } else if (chatId && (msg.voice || (text && !text.startsWith('/'))) && await tgJarvis(msg)) {
    // An admin asking Jarvis (jarvis.js): answered when it has thought.
  } else if (chatId && (text || msg.voice)) {
    // Anything else — "/help", "привет", a forwarded photo caption — used to
    // meet silence, which reads exactly like a broken bot. It answers instead,
    // and says who it is and what its buttons do.
    const who = await get('SELECT name, lang FROM users WHERE telegram_chat_id = ?', String(chatId))
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: who
        ? tgWords(who.lang || heard).help(who.name)
        : tgWords(heard).intro,
    })
  }
  res.json({ ok: true })
}))

// A voice pravka, played. The link in the note is signed (tgactions.js); the
// clip is streamed from Telegram as it is read — never kept, never held whole
// in memory. Telegram keeps a voice message as long as the chat has it.
router.get('/voice/:fid', wrap(async (req, res) => {
  if (!tgEnabled()) return res.status(503).json({ error: 'Telegram is not configured' })
  if (!tgVoiceSigned(req.params.fid, req.query.s)) return res.status(403).json({ error: 'This link is not valid' })
  const f = await tgApi('getFile', { file_id: req.params.fid }).catch(() => null)
  const path = f?.result?.file_path
  if (!path) return res.status(404).json({ error: 'Telegram no longer has this clip' })
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 30000)
  const r = await fetch(tgFileUrl(path), { signal: stop.signal }).catch(() => null)
  clearTimeout(timer)
  if (!r?.ok || !r.body) return res.status(502).json({ error: 'Telegram did not hand the clip over' })
  res.setHeader('Content-Type', /\.mp3$/i.test(path) ? 'audio/mpeg' : 'audio/ogg')
  if (r.headers.get('content-length')) res.setHeader('Content-Length', r.headers.get('content-length'))
  res.setHeader('Cache-Control', 'private, max-age=3600')
  const body = Readable.fromWeb(r.body)
  body.on('error', () => res.destroy())
  body.pipe(res)
}))

router.use(authRequired)

// People the admin stopped asking to connect (12 Nov 2026, the owner: "add an
// option of deleting some people from chasing"). A meta list of user ids: the
// get-set-up card no longer prompts them, and Settings → Telegram lists them
// apart. Asking again takes the id out.
const notAsked = async () => {
  try { return new Set(JSON.parse((await get("SELECT value FROM meta WHERE key = 'telegram_not_asked'"))?.value || '[]').map(Number)) } catch { return new Set() }
}

// Is the bridge configured, am I linked, and what's the bot called?
router.get('/status', wrap(async (req, res) => {
  const u = await get('SELECT telegram_chat_id FROM users WHERE id = ?', req.user.id)
  res.json({ enabled: tgEnabled(), linked: !!u?.telegram_chat_id, bot: await tgBotUsername(), ask: !(await notAsked()).has(req.user.id) })
}))

// Mint a fresh one-time code and the t.me deep link that carries it.
router.post('/link', wrap(async (req, res) => {
  if (!tgEnabled()) return res.status(503).json({ error: 'The bot isn’t configured yet — the admin sets TELEGRAM_BOT_TOKEN first' })
  const code = randomBytes(8).toString('hex')
  await run('UPDATE users SET telegram_code = ? WHERE id = ?', code, req.user.id)
  const bot = await tgBotUsername()
  res.json({ code, bot, url: bot ? `https://t.me/${bot}?start=${code}` : null })
}))

router.post('/unlink', wrap(async (req, res) => {
  const u = await get('SELECT telegram_chat_id, lang FROM users WHERE id = ?', req.user.id)
  await run('UPDATE users SET telegram_chat_id = NULL, telegram_code = NULL WHERE id = ?', req.user.id)
  if (u?.telegram_chat_id) await tgApi('sendMessage', { chat_id: u.telegram_chat_id, text: tgWords(u.lang).disconnected })
  res.json({ ok: true })
}))

// Admin, once after the token lands in the environment: tell Telegram where
// the webhook lives. Defaults to this deployment's own public address.
router.post('/set-webhook', wrap(async (req, res) => {
  if (!isFullAdmin(req.user)) return res.status(403).json({ error: 'Admins only' })
  if (!tgEnabled()) return res.status(503).json({ error: 'Set TELEGRAM_BOT_TOKEN in the environment first' })
  const url = String(req.body?.url || `https://${req.get('host')}/api/telegram/webhook`)
  if (!/^https:\/\//.test(url)) return res.status(400).json({ error: 'The webhook needs a public https:// URL' })
  // callback_query: the buttons under the bot's messages (tgactions.js).
  const out = await tgApi('setWebhook', { url, secret_token: tgWebhookSecret(), allowed_updates: ['message', 'callback_query'] })
  // Remember where we live — from now on messages carry task links — and
  // give the bot its face in the three languages: what it is, what it sends,
  // its menu of commands.
  let profile = null
  if (out?.ok) {
    await tgRememberUrl(url.replace(/\/api\/telegram\/webhook$/, ''))
    profile = await tgSetProfile().catch(() => false)
  }
  res.json({ ok: !!out?.ok, url, telegram: out, profile })
}))

// ---- the admin panel ----
// One picture for the admin: is the bridge alive, where the webhook points
// (straight from Telegram, errors included), and who of the team is wired up.
router.get('/admin', wrap(async (req, res) => {
  if (!isFullAdmin(req.user)) return res.status(403).json({ error: 'Admins only' })
  const skip = await notAsked()
  const members = (await all('SELECT id, name, username, role, telegram_chat_id FROM users ORDER BY role DESC, name'))
    .map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, linked: !!u.telegram_chat_id, asked: !skip.has(u.id) }))
  const webhook = tgEnabled() ? (await tgApi('getWebhookInfo', {}))?.result || null : null
  res.json({
    enabled: tgEnabled(), bot: await tgBotUsername(), webhook,
    public_url: await tgPublicUrl(), members,
  })
}))

// The admin untangles someone who left the team or lost the phone.
router.post('/admin/unlink', wrap(async (req, res) => {
  if (!isFullAdmin(req.user)) return res.status(403).json({ error: 'Admins only' })
  const uid = Number(req.body?.user_id)
  if (!uid) return res.status(400).json({ error: 'user_id required' })
  const u = await get('SELECT telegram_chat_id, lang FROM users WHERE id = ?', uid)
  await run('UPDATE users SET telegram_chat_id = NULL, telegram_code = NULL WHERE id = ?', uid)
  if (u?.telegram_chat_id) await tgApi('sendMessage', { chat_id: u.telegram_chat_id, text: tgWords(u.lang).adminUnlinked })
  res.json({ ok: true })
}))

// Stop (ask: false) or start again (ask: true) prompting one person to connect.
router.post('/admin/ask', wrap(async (req, res) => {
  if (!isFullAdmin(req.user)) return res.status(403).json({ error: 'Admins only' })
  const uid = Number(req.body?.user_id)
  if (!uid || !(await get('SELECT id FROM users WHERE id = ?', uid))) return res.status(400).json({ error: 'user_id required' })
  const skip = await notAsked()
  if (req.body?.ask === false) skip.add(uid); else skip.delete(uid)
  await run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', 'telegram_not_asked', JSON.stringify([...skip]))
  res.json({ ok: true, asked: !skip.has(uid) })
}))

// One announcement to everyone who is wired up — planning changes, "планёрка
// в 15:00", a released video worth celebrating.
router.post('/broadcast', wrap(async (req, res) => {
  if (!isFullAdmin(req.user)) return res.status(403).json({ error: 'Admins only' })
  if (!tgEnabled()) return res.status(503).json({ error: 'Set the bot token first' })
  const text = String(req.body?.text ?? '').trim().slice(0, 3000)
  if (!text) return res.status(400).json({ error: 'Write the announcement first' })
  const linked = await all('SELECT id, telegram_chat_id FROM users WHERE telegram_chat_id IS NOT NULL')
  await Promise.allSettled(linked.map((u) =>
    tgApi('sendMessage', { chat_id: u.telegram_chat_id, text: tgClip(`📢 ${req.user.name}: ${text}`), disable_web_page_preview: true })))
  res.json({ ok: true, sent: linked.length })
}))

// ---- the admin's ready-made nudges ----
// Reminders worth repeating — "is the week planned?", "does every task carry
// its brief?" — kept as templates so nobody rewrites them each Monday. Each
// can be fired at anyone on demand, or left to arrive by itself on chosen
// weekdays at a chosen hour.
const adminOnly = (req, res) => {
  if (!isFullAdmin(req.user)) { res.status(403).json({ error: 'Admins only' }); return true }
  return false
}
const cleanTemplate = (b, old = {}) => ({
  title: String(b.title ?? old.title ?? '').trim().slice(0, 120),
  text: String(b.text ?? old.text ?? '').trim().slice(0, 3000),
  audience: /^(linked|role:[\w-]+|channel:[\w-]+|users:[\d,]+)$/.test(String(b.audience ?? ''))
    ? String(b.audience) : (old.audience || 'linked'),
  days: JSON.stringify((Array.isArray(b.days) ? b.days : (() => { try { return JSON.parse(old.days || '[]') } catch { return [] } })())
    .map(Number).filter((d) => d >= 0 && d <= 6)),
  hour: Math.min(23, Math.max(0, Number(b.hour ?? old.hour ?? 9) || 0)),
  enabled: (b.enabled === undefined ? (old.enabled ?? 1) : (b.enabled ? 1 : 0)),
})

router.get('/templates', wrap(async (req, res) => {
  if (adminOnly(req, res)) return
  const rows = await all('SELECT * FROM tg_templates ORDER BY sort, id')
  res.json(rows.map((t) => ({ ...t, days: (() => { try { return JSON.parse(t.days || '[]') } catch { return [] } })(), enabled: !!t.enabled })))
}))

router.post('/templates', wrap(async (req, res) => {
  if (adminOnly(req, res)) return
  const b = req.body || {}
  const t = cleanTemplate(b)
  if (!t.title || !t.text) return res.status(400).json({ error: 'A reminder needs a name and something to say' })
  const max = (await get('SELECT COALESCE(MAX(sort), -1) AS m FROM tg_templates')).m
  const info = await run(`INSERT INTO tg_templates (title, text, audience, days, hour, enabled, sort, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, t.title, t.text, t.audience, t.days, t.hour, t.enabled, max + 1, new Date().toISOString())
  res.status(201).json(await get('SELECT * FROM tg_templates WHERE id = ?', info.lastInsertRowid))
}))

router.patch('/templates/:id', wrap(async (req, res) => {
  if (adminOnly(req, res)) return
  const old = await get('SELECT * FROM tg_templates WHERE id = ?', req.params.id)
  if (!old) return res.status(404).json({ error: 'Not found' })
  const t = cleanTemplate(req.body || {}, old)
  if (!t.title || !t.text) return res.status(400).json({ error: 'A reminder needs a name and something to say' })
  await run('UPDATE tg_templates SET title = ?, text = ?, audience = ?, days = ?, hour = ?, enabled = ? WHERE id = ?',
    t.title, t.text, t.audience, t.days, t.hour, t.enabled, old.id)
  res.json(await get('SELECT * FROM tg_templates WHERE id = ?', old.id))
}))

router.delete('/templates/:id', wrap(async (req, res) => {
  if (adminOnly(req, res)) return
  await run('DELETE FROM tg_templates WHERE id = ?', req.params.id)
  res.json({ ok: true })
}))

// Send it now — to the template's own audience, or to exactly the people
// picked in the dialog.
router.post('/templates/:id/send', wrap(async (req, res) => {
  if (adminOnly(req, res)) return
  if (!tgEnabled()) return res.status(503).json({ error: 'Set the bot token first' })
  const tpl = await get('SELECT * FROM tg_templates WHERE id = ?', req.params.id)
  if (!tpl) return res.status(404).json({ error: 'Not found' })
  const picked = Array.isArray(req.body?.user_ids) ? req.body.user_ids.map(Number).filter(Boolean) : null
  const sent = await tgSendTemplate(tpl, picked)
  res.json({ ok: true, sent })
}))

// Who would hear this audience right now — so the dialog can say "12 people"
// instead of leaving the admin to guess.
router.get('/audience', wrap(async (req, res) => {
  if (adminOnly(req, res)) return
  res.json({ count: (await tgAudience(String(req.query.audience || 'linked'))).length })
}))

// A signed-in sanity check: send myself a test line through the bridge.
router.post('/test', wrap(async (req, res) => {
  if (!tgEnabled()) return res.status(503).json({ error: 'Set TELEGRAM_BOT_TOKEN in the environment first' })
  const me = await get('SELECT lang FROM users WHERE id = ?', req.user.id)
  await tgSendTo(req.user.id, tgWords(me?.lang).works)
  res.json({ ok: true })
}))

export default router
