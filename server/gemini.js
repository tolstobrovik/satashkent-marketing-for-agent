// Gemini, for the work only a model that hears can do.
//
// ai.js translates and simplifies briefs with whatever model the board has a
// key for. This is Gemini's own, because it takes the voice clip itself: a
// reviewer says what is wrong with an edit, and the person who fixes it gets
// the list of changes — in their language, one change a line.
//
// THE KEY is GEMINI_API_KEY: the environment (the deploy writes it from the
// repository secret), else what an admin typed into the AI panel — ai.js's
// own lookup. No key, and nothing here runs: a pravka is the note it always
// was.
//
// THE MODEL is not written down here. Google renames and retires Flash models
// every few months, so the board asks which ones this key may call and takes
// the newest stable Flash — "gemini-<version>-flash", never a -lite, -preview,
// -live or -tts — and asks again twice a day. GEMINI_MODEL overrides it.
//
// WHEN GOOGLE SAYS NO. A 429 (a limit) or a 5xx is not the end: the error
// carries how long to wait (`wait`, in ms) and the caller keeps the job for
// later. A 4xx otherwise is an answer — this will not work as asked.
//
// Every Google address is overridable (GEMINI_BASE_URL), so the suites run
// against a mock.
import { _internals } from './ai.js'

const { secret } = _internals
const API = () => (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
const FALLBACK = 'gemini-2.5-flash'
const TIMEOUT = 60000

export const geminiKey = () => secret('GEMINI_API_KEY') || ''
export const geminiReady = () => !!geminiKey()

export class GeminiError extends Error {
  constructor(message, { status = 0, wait = 0 } = {}) {
    super(message)
    this.status = status
    this.wait = wait
  }
  // Worth another try later: a limit, Google having a bad minute, or no answer.
  get later() { return this.status === 429 || this.status >= 500 || this.status === 0 }
}

async function call(path, { method = 'GET', body } = {}) {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), TIMEOUT)
  let r
  try {
    r = await fetch(`${API()}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: body ? JSON.stringify(body) : undefined,
      signal: stop.signal,
    })
  } catch (e) {
    throw new GeminiError(`Gemini did not answer: ${e.name === 'AbortError' ? 'timed out' : e.message}`)
  } finally { clearTimeout(timer) }
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    // "retryDelay": "37s" in the error's RetryInfo, when Google says how long.
    const delay = (d.error?.details || []).find((x) => x.retryDelay)?.retryDelay
    const wait = delay ? Math.ceil(parseFloat(delay) * 1000) : Number(r.headers.get('retry-after') || 0) * 1000
    throw new GeminiError(d.error?.message || `Gemini answered ${r.status}`, { status: r.status, wait })
  }
  return d
}

// "gemini-3.5-flash" → [3, 5]; newest first.
const versionOf = (id) => (id.match(/^gemini-(\d+(?:\.\d+)*)-flash$/)?.[1] || '0').split('.').map(Number)
const newer = (a, b) => {
  const x = versionOf(a), y = versionOf(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0)
  return 0
}

let picked = { id: '', at: 0 }
export async function geminiModel() {
  const forced = secret('GEMINI_MODEL')
  if (forced) return forced
  if (picked.id && Date.now() - picked.at < 12 * 3600e3) return picked.id
  try {
    const d = await call('models?pageSize=1000')
    const ids = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((id) => /^gemini-\d+(?:\.\d+)*-flash$/.test(id))
      .sort(newer)
    picked = { id: ids[0] || FALLBACK, at: Date.now() }
  } catch {
    // Ask again in an hour rather than in twelve.
    picked = { id: picked.id || FALLBACK, at: Date.now() - 11 * 3600e3 }
  }
  return picked.id
}

const LANG = { en: 'English', ru: 'Russian', uz: 'Uzbek (Latin script; write oʻ and gʻ with U+02BB)' }

const LIST_RULES = [
  'You turn a pravka — a reviewer’s request for changes to a video edit, a design or footage — into a checklist for the one person who will fix it.',
  'If an audio clip is attached, it is the reviewer speaking. First transcribe it word for word in the language spoken (Russian, Uzbek and English are often mixed); put that in "heard". Without audio, "heard" is an empty string.',
  'Then write "items": one item per separate change asked for, in the written note and in the audio together, each a short instruction that starts with a verb (at most about 14 words).',
  'Keep timestamps (0:12, 1:05), numbers, names, @handles, quoted on-screen text and links exactly as given.',
  'Never add advice, never invent a change nobody asked for, never merge two different changes into one item. A pravka that asks one thing is one item. When something is unclear, keep the reviewer’s own words in the item.',
  'Ignore lines that are only a link to a voice recording.',
]

// A pravka → { items: [string], heard: string, model }.
// `audio` is { mime, base64 } or null; `lang` is the fixer's (en, ru, uz).
export async function checklistOf({ note, audio = null, lang = 'en', title = '' }) {
  const model = await geminiModel()
  const parts = [{
    text: `Write the items in ${LANG[lang] || LANG.en}.\nThe piece: «${title}».\nThe written note:\n${note || '(none — only the audio)'}`,
  }]
  if (audio?.base64) parts.push({ inlineData: { mimeType: audio.mime, data: audio.base64 } })
  const d = await call(`models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    body: {
      systemInstruction: { parts: [{ text: LIST_RULES.join('\n') }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { heard: { type: 'STRING' }, items: { type: 'ARRAY', items: { type: 'STRING' } } },
          required: ['heard', 'items'],
        },
      },
    },
  })
  const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim()
  let out
  try { out = JSON.parse(text) } catch { throw new GeminiError('Gemini answered something that is not a checklist', { status: 502 }) }
  const items = (Array.isArray(out.items) ? out.items : [])
    .map((s) => String(s ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 15).map((s) => s.slice(0, 300))
  if (!items.length) throw new GeminiError('Gemini found nothing to change in that pravka', { status: 422 })
  return { items, heard: String(out.heard || '').trim().slice(0, 4000), model }
}

// A conversation, for Jarvis (jarvis.js): the rules, the turns so far —
// [{ role: 'user' | 'model', text, audio? }] — and the answer as text, or as
// JSON when a `schema` is given.
export async function geminiAnswer({ system, turns, schema = null, maxTokens = 4096, temperature = 0.3 }) {
  const model = await geminiModel()
  const contents = turns.map((t) => ({
    role: t.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(t.text || '') }, ...(t.audio?.base64 ? [{ inlineData: { mimeType: t.audio.mime, data: t.audio.base64 } }] : [])],
  }))
  const d = await call(`models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
      },
    },
  })
  const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim()
  if (!text) throw new GeminiError('Gemini gave no answer', { status: 502 })
  if (!schema) return { text, model }
  try { return { json: JSON.parse(text), model } } catch { throw new GeminiError('Gemini answered something that is not what was asked', { status: 502 }) }
}
