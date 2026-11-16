// A pravka, as the list of changes the person fixing it works through.
//
// The reviewer writes (or says) what is wrong; Gemini (gemini.js) reads the
// note and hears the clip, and the round gets a checklist in the FIXER's
// language: one change a line, ticked off in the task window or in Telegram.
// The note and the clip stay as they were — the list sits beside them.
//
// HOW IT RUNS. Never inside the request that made the pravka: the reviewer's
// press answers at once and the list follows a few seconds later. One list at
// a time, in this process. A list Google could not make yet — a limit, a bad
// minute — is written down with when to try again (list_state 'wait',
// list_next) and the sweep picks it up, so a 429 costs time and nothing else;
// after eight tries it is 'failed' and the pravka is simply its note. A round
// that was fixed in the meantime is left alone.
//
// TELEGRAM. The pravka's own message has already gone to the fixer. The list
// follows as a silent reply under it — no second buzz — with a button per
// change to tick. When the message it answers is not known (a restart, the
// night), the list goes out as the pravka's own kind of message.
import { all, get, run } from './db.js'
import { guessLang } from './ai.js'
import { geminiReady, checklistOf, GeminiError } from './gemini.js'
import { tgApi, tgEsc, tgFileUrl, tgKeyboard, tgMirror, tgPublicUrl } from './telegram.js'
import { tgWords } from './tgcopy.js'

const AUDIO_MAX = 4 * 1024 * 1024
const TRIES = 8
// Minutes between tries; PRAVKA_RETRY_SCALE shrinks them for the suite.
const BACKOFF = [1, 2, 5, 10, 30, 60, 180, 360].map((m) => m * 60000 * Number(process.env.PRAVKA_RETRY_SCALE || 1))

export const listOf = (rev) => { try { const l = JSON.parse(rev?.checklist || '[]'); return Array.isArray(l) ? l : [] } catch { return [] } }

// ---- the words, in Telegram ------------------------------------------------
export function listText(lang, title, round, list) {
  const w = tgWords(lang)
  const lines = list.map((c, i) => `${c.done ? '☑' : '☐'} ${i + 1}. ${tgEsc(c.text)}`)
  const all = list.length && list.every((c) => c.done)
  return `${w.listHead(`<b>«${tgEsc(title)}»</b>`, round)}\n${lines.join('\n')}\n\n${all ? w.listDone : w.listFoot}`
}
export const listMask = (list) => list.map((c) => (c.done ? '1' : '0')).join('')

// ---- the clip --------------------------------------------------------------
// A voice note recorded on the page is kept as a data URL (voice_notes); one
// sent to the bot is a Telegram file, named by the signed link in the note.
async function audioOf(rev) {
  if (rev.voice_id) {
    const v = await get('SELECT mime, size, data FROM voice_notes WHERE id = ?', rev.voice_id).catch(() => null)
    const comma = v?.data ? v.data.indexOf(',') : -1
    if (v && comma > 0 && (v.size || 0) <= AUDIO_MAX) return { mime: String(v.mime || 'audio/webm').split(';')[0], base64: v.data.slice(comma + 1) }
  }
  const fid = String(rev.note || '').match(/\/api\/telegram\/voice\/([^?\s]+)\?s=/)?.[1]
  if (!fid) return null
  const f = await tgApi('getFile', { file_id: decodeURIComponent(fid) }).catch(() => null)
  const path = f?.result?.file_path
  if (!path || (f.result.file_size || 0) > AUDIO_MAX) return null
  const r = await fetch(tgFileUrl(path), { signal: AbortSignal.timeout(30000) }).catch(() => null)
  if (!r?.ok) return null
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > AUDIO_MAX) return null
  return { mime: /\.mp3$/i.test(path) ? 'audio/mpeg' : 'audio/ogg', base64: buf.toString('base64') }
}

// ---- the queue -------------------------------------------------------------
const waiting = new Map() // revision id → { sent: [{ chat_id, message_id }] }
// The messages a list will answer, kept past a failed try — so a list that
// waited for Google still arrives as the silent reply, not a second buzz.
const answers = new Map()
const busy = new Set()
let running = false

// After a pravka is made: `sent` are the messages that told its fixer, which
// the list will answer.
export function listLater(revId, sent = []) {
  if (!geminiReady() || !revId) return
  if (sent.length) answers.set(Number(revId), sent)
  waiting.set(Number(revId), { sent })
  drain()
}

async function drain() {
  if (running) return
  running = true
  try {
    while (waiting.size) {
      const [id, job] = waiting.entries().next().value
      waiting.delete(id)
      busy.add(id)
      try { await listOne(id, job) } catch (e) { console.error(`pravka list ${id} failed:`, e.message) } finally { busy.delete(id) }
    }
  } finally { running = false }
}

// What a restart forgot, and what Google asked to wait for. Throttled by its
// caller (every five minutes), five at a time.
//
// A pravka made moments ago is not forgotten: its own request queues it
// (listLater) with the Telegram messages the list will answer, right after
// those are sent. A sweep that took it first found no messages to answer and
// sent the list as a second buzz instead of the silent reply — the race
// qa/gemini-suite.mjs lost one run in three with the sweep at 700 ms. So a
// revision with no list state yet is the sweep's only once it is older than
// a request could possibly take.
const FRESH_MS = 15000
export async function sweepLists() {
  if (!geminiReady()) return 0
  const now = new Date().toISOString()
  const since = new Date(Date.now() - 2 * 864e5).toISOString()
  const settled = new Date(Date.now() - FRESH_MS).toISOString()
  const due = await all(`SELECT id FROM revisions WHERE resolved_at IS NULL
    AND ((list_state IS NULL AND created_at > ? AND created_at < ?) OR (list_state = 'wait' AND list_next <= ?)) ORDER BY id LIMIT 5`, since, settled, now)
  for (const r of due) if (!busy.has(r.id) && !waiting.has(r.id)) waiting.set(r.id, { sent: [] })
  if (due.length) drain()
  return due.length
}

async function listOne(id, job) {
  const sent = job.sent?.length ? job.sent : answers.get(id) || []
  const rev = await get('SELECT * FROM revisions WHERE id = ?', id)
  if (!rev || rev.resolved_at || rev.list_state === 'done' || rev.list_state === 'failed') { answers.delete(id); return }
  const row = await get('SELECT * FROM content WHERE id = ?', rev.content_id)
  if (!row) return
  const fixer = row[`${rev.target}_id`] || null
  const chosen = fixer ? (await get('SELECT lang FROM users WHERE id = ?', fixer).catch(() => null))?.lang : null
  // The fixer's language; a fixer who never chose one reads the note's.
  const lang = chosen || guessLang(rev.note) || 'en'
  const tries = (rev.list_tries || 0) + 1
  const audio = await audioOf(rev).catch(() => null)
  let made
  try {
    made = await checklistOf({ note: rev.note, audio, lang, title: row.title })
  } catch (e) {
    // A clip Google cannot read (a container it does not take) is not worth
    // the list: the note is always there in writing.
    if (audio && e instanceof GeminiError && e.status === 400) {
      try { made = await checklistOf({ note: rev.note, audio: null, lang, title: row.title }) } catch (e2) { e = e2 }
    }
    if (!made) {
      const later = e instanceof GeminiError ? e.later : true
      if (later && tries < TRIES) {
        const wait = Math.max(e.wait || 0, BACKOFF[tries - 1])
        await run("UPDATE revisions SET list_state = 'wait', list_tries = ?, list_next = ? WHERE id = ?",
          tries, new Date(Date.now() + wait).toISOString(), id)
      } else {
        await run("UPDATE revisions SET list_state = 'failed', list_tries = ? WHERE id = ?", tries, id)
        answers.delete(id)
      }
      console.error(`pravka list ${id}: ${e.message}${later && tries < TRIES ? ' — trying again later' : ''}`)
      return
    }
  }
  const list = made.items.map((text) => ({ text, done: false }))
  const out = await run(`UPDATE revisions SET checklist = ?, heard = ?, list_state = 'done', list_model = ?, list_lang = ?, list_tries = ?
    WHERE id = ? AND resolved_at IS NULL`, JSON.stringify(list), made.heard, made.model, lang, tries, id)
  answers.delete(id)
  if (!out?.changes || !fixer) return
  const origin = await tgPublicUrl().catch(() => '')
  const fixerLang = chosen || lang
  const text = listText(fixerLang, row.title, rev.round, list)
  const markup = tgKeyboard(fixerLang, row.id, origin, [`list:${id}:${listMask(list)}`])
  const answered = []
  for (const m of sent || []) {
    const r = await tgApi('sendMessage', {
      chat_id: m.chat_id, text, parse_mode: 'HTML', disable_notification: true, disable_web_page_preview: true,
      reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true },
      ...(markup ? { reply_markup: markup } : {}),
    }).catch(() => null)
    if (r?.ok) answered.push(m)
  }
  if (!answered.length) {
    await tgMirror([fixer], (l) => listText(l, row.title, rev.round, list), row.id, origin,
      { kind: 'pravka', actions: [`list:${id}:${listMask(list)}`] })
  }
}
