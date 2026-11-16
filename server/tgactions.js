// The buttons under the bot's messages, and the answers typed back to it.
//
// A press is done AS the person who pressed: the chat names the linked
// member, and the bot calls the dashboard's own API with a short session of
// theirs — the route the window's button calls, with its rules, its bell rows
// and its Telegram messages. Nothing here decides whether a person may accept
// a cut or answer a booking; the server says yes, or says why not, and the bot
// passes that on, in the reader's language (phrasebook.js).
//
//   ok:<id>          ✅ Accept    POST /content/:id/approve
//   fix:<id>         📝 Pravka    asks what to fix, then POST /content/:id/revisions
//   yes:<id>:<which> ✅ Yes       POST /content/:id/confirm { which, ok: true }
//   no:<id>:<which>  ❌ No        asks what is in the way, then the same with ok: false
//   ck:<rev>:<i>     ☐ / ☑       ticks change i of a pravka's list (pravkalist.js)
//
// A question waits for its answer in memory, a chat at a time, for half an
// hour. A restart forgets it, and the answer is then met with "press the
// button again" — never filed against a task nobody chose.
//
// A voice answer is not downloaded: the note carries a link to
// /api/telegram/voice, which streams the clip from Telegram when it is played
// (signed, so the link is the only key). Gemini will read the same clip.
import { createHmac, timingSafeEqual } from 'crypto'
import { get, publicUser } from './db.js'
import { asPerson } from './selfapi.js'
import { tgApi, tgEsc, tgPublicUrl, tgToken, tgKeyboard, tgFileUrl } from './telegram.js'
import { tgWords } from './tgcopy.js'
import { phraseIn } from './phrasebook.js'
import { listText, listMask } from './pravkalist.js'
import { geminiReady } from './gemini.js'
import { jarvisFor, jarvisAsk, jarvisHtml } from './jarvis.js'

const WAIT = 30 * 60 * 1000
const asked = new Map() // chat id → { kind, id, which, prompt, at }

const userOfChat = (chatId) =>
  get('SELECT id, name, lang, role FROM users WHERE telegram_chat_id = ?', String(chatId)).catch(() => null)

// The API's refusal, in the reader's language where the phrase book has it.
const why = (user, r) => phraseIn(user?.lang, r.data?.error || String(r.status || ''))

const title = async (id) => (await get('SELECT title FROM content WHERE id = ?', id).catch(() => null))?.title || `#${id}`

// The pressed message keeps only its Open button: the question is answered,
// and a second press of the same Accept should not be there to make.
async function settle(cb, lang, id) {
  const msg = cb.message
  if (!msg) return
  const origin = await tgPublicUrl().catch(() => '')
  const open = msg.reply_markup?.inline_keyboard?.flat().find((b) => b.url)?.url
  const markup = open ? { inline_keyboard: [[{ text: tgWords(lang).open, url: open }]] }
    : tgKeyboard(lang, id, origin, []) || { inline_keyboard: [] }
  await tgApi('editMessageReplyMarkup', { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: markup }).catch(() => null)
}

const toast = (cb, text, alert = false) =>
  tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: String(text).slice(0, 190), show_alert: alert }).catch(() => null)

// ---- a press -----------------------------------------------------------------
export async function tgOnButton(cb) {
  const chatId = cb.message?.chat?.id ?? cb.from?.id
  const user = chatId ? await userOfChat(chatId) : null
  const w = tgWords(user?.lang)
  if (!user) return toast(cb, w.notLinked, true)
  const [act, rawId, which] = String(cb.data || '').split(':')
  const id = Number(rawId)
  if (!id) return toast(cb, w.stale)

  if (act === 'ck') {
    const r = await asPerson(user, 'PATCH', `/content/revisions/${id}/checklist`, { i: Number(which) })
    if (r.status !== 200) return toast(cb, w.failed(why(user, r)), true)
    const { checklist: list, title: name, round, content_id: task } = r.data
    const origin = await tgPublicUrl().catch(() => '')
    if (cb.message) {
      await tgApi('editMessageText', {
        chat_id: cb.message.chat.id, message_id: cb.message.message_id,
        text: listText(user.lang, name, round, list), parse_mode: 'HTML', disable_web_page_preview: true,
        reply_markup: tgKeyboard(user.lang, task, origin, [`list:${id}:${listMask(list)}`]) || { inline_keyboard: [] },
      }).catch(() => null)
    }
    const done = list[Number(which)]?.done
    return toast(cb, `${done ? '☑' : '☐'} ${Number(which) + 1}`)
  }

  if (act === 'ok') {
    const r = await asPerson(user, 'POST', `/content/${id}/approve`)
    if (r.status !== 200) return toast(cb, w.failed(why(user, r)), true)
    await settle(cb, user.lang, id)
    return toast(cb, w.accepted)
  }
  if (act === 'yes' && (which === 'shoot' || which === 'edit')) {
    const r = await asPerson(user, 'POST', `/content/${id}/confirm`, { which, ok: true })
    if (r.status !== 200) return toast(cb, w.failed(why(user, r)), true)
    await settle(cb, user.lang, id)
    return toast(cb, w.saidYes)
  }
  if (act === 'fix' || (act === 'no' && (which === 'shoot' || which === 'edit'))) {
    const t = `<b>«${tgEsc(await title(id))}»</b>`
    const sent = await tgApi('sendMessage', {
      chat_id: chatId,
      text: act === 'fix' ? w.askPravka(t) : w.askNo(t),
      parse_mode: 'HTML',
      reply_markup: { force_reply: true, input_field_placeholder: act === 'fix' ? w.hintPravka : w.hintNo },
    })
    asked.set(String(chatId), { kind: act, id, which, prompt: sent?.result?.message_id ?? null, msg: cb.message, at: Date.now() })
    return toast(cb, '')
  }
  return toast(cb, w.stale)
}

// ---- an answer typed (or spoken) back ----------------------------------------
// True when the message was the answer to a question the bot asked, so the
// webhook does not also answer it with the help text.
export async function tgOnReply(msg) {
  const chatId = String(msg.chat?.id ?? '')
  const q = asked.get(chatId)
  const replyTo = msg.reply_to_message?.message_id
  const open = q && Date.now() - q.at < WAIT && (!replyTo || !q.prompt || replyTo === q.prompt)
  if (!open) {
    if (q && Date.now() - q.at >= WAIT) asked.delete(chatId)
    // A reply to one of the bot's questions that is no longer waiting — a
    // restart, or half an hour gone — is told so rather than lost in silence.
    if (replyTo && msg.reply_to_message?.from?.is_bot && (msg.text || msg.voice)) {
      const user = await userOfChat(chatId)
      if (user) {
        await tgApi('sendMessage', { chat_id: chatId, text: tgWords(user.lang).stale })
        return true
      }
    }
    return false
  }
  const user = await userOfChat(chatId)
  if (!user) return false
  const w = tgWords(user.lang)
  let words = String(msg.text || msg.caption || '').trim()
  if (msg.voice?.file_id) {
    const link = await tgVoiceLink(msg.voice.file_id)
    const said = `${q.kind === 'fix' ? w.voice : w.voiceNo}: ${link}`
    words = words ? `${words}\n${said}` : said
  }
  if (!words) return false
  asked.delete(chatId)
  const r = q.kind === 'fix'
    ? await asPerson(user, 'POST', `/content/${q.id}/revisions`, { note: words })
    : await asPerson(user, 'POST', `/content/${q.id}/confirm`, { which: q.which, ok: false, note: words.slice(0, 400) })
  if (r.status < 200 || r.status >= 300) {
    await tgApi('sendMessage', { chat_id: chatId, text: w.failed(why(user, r)) })
    return true
  }
  if (q.msg) await settle({ message: q.msg }, user.lang, q.id)
  await tgApi('sendMessage', { chat_id: chatId, text: q.kind === 'fix' ? w.sentPravka : w.saidNo })
  return true
}

// ---- the voice link ----------------------------------------------------------
// The key is derived from the bot's token, like the webhook's secret: nothing
// more to store, and a new token retires every old link with it.
const voiceSig = (fileId) =>
  createHmac('sha256', `satashkent-voice:${tgToken()}`).update(String(fileId)).digest('hex').slice(0, 32)

export async function tgVoiceLink(fileId) {
  const origin = await tgPublicUrl().catch(() => '')
  return `${origin}/api/telegram/voice/${encodeURIComponent(fileId)}?s=${voiceSig(fileId)}`
}

export function tgVoiceSigned(fileId, sig) {
  const want = Buffer.from(voiceSig(fileId))
  const got = Buffer.from(String(sig || ''))
  return got.length === want.length && timingSafeEqual(got, want)
}

// ---- Jarvis, asked in the chat ---------------------------------------------
// What a full admin writes or says to the bot, when it is not the answer to a
// question the bot asked, is a question for Jarvis (jarvis.js). The webhook
// is answered at once — Gemini may think for longer than Telegram waits — and
// the answer follows as its own message. True when it was a question for
// Jarvis, so the help text does not answer it too.
export async function tgJarvis(msg) {
  const chatId = String(msg.chat?.id ?? '')
  const row = await get('SELECT * FROM users WHERE telegram_chat_id = ?', chatId).catch(() => null)
  const user = row ? publicUser(row) : null
  if (!user || !jarvisFor(user)) return false
  const w = tgWords(row.lang)
  if (!geminiReady()) {
    await tgApi('sendMessage', { chat_id: chatId, text: w.jarvis.noKey })
    return true
  }
  tgApi('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => null)
  ;(async () => {
    let audio = null
    if (msg.voice?.file_id) {
      const f = await tgApi('getFile', { file_id: msg.voice.file_id }).catch(() => null)
      const path = f?.result?.file_path
      if (path && (f.result.file_size || 0) <= 4 * 1024 * 1024) {
        const r = await fetch(tgFileUrl(path), { signal: AbortSignal.timeout(30000) }).catch(() => null)
        if (r?.ok) audio = { mime: 'audio/ogg', base64: Buffer.from(await r.arrayBuffer()).toString('base64') }
      }
    }
    try {
      const { answer } = await jarvisAsk(user, msg.text || msg.caption || '', { lang: row.lang || 'en', audio })
      await tgApi('sendMessage', {
        chat_id: chatId, text: jarvisHtml(answer, await tgPublicUrl().catch(() => '')).slice(0, 4000),
        parse_mode: 'HTML', disable_web_page_preview: true,
        reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
      })
    } catch (e) {
      await tgApi('sendMessage', { chat_id: chatId, text: w.jarvis.failed(e.message) }).catch(() => null)
    }
  })().catch((e) => console.error('jarvis in telegram failed:', e.message))
  return true
}
