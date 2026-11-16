// A tiny Gemini API stand-in for the QA gate. It lists models the way Google
// does (stable, -lite, -preview and older Flash among them), answers
// generateContent with a checklist — one item per sentence of the note, and
// what it "heard" when audio came along — and records every request.
//   GET  /__calls   what it was sent      POST /__reset   forget it
//   POST /__mode    { mode: 'ok' | '429' | '400audio' | '500' }
import http from 'http'

const PORT = Number(process.env.MOCK_GEMINI_PORT || 9934)
const calls = []
let mode = 'ok'

const MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.6-flash-lite', 'gemini-3.7-flash-preview',
  'gemini-3.6-pro', 'gemini-3.6-flash-live-preview', 'text-embedding-005']

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/__calls') return res.end(JSON.stringify(calls))
    if (req.url === '/__reset') { calls.length = 0; return res.end('{}') }
    if (req.url === '/__mode') { mode = JSON.parse(body || '{}').mode || 'ok'; return res.end('{}') }
    let payload = {}
    try { payload = JSON.parse(body || '{}') } catch { payload = {} }
    calls.push({ method: req.method, url: req.url, key: req.headers['x-goog-api-key'] || '', body: payload })
    if (!req.headers['x-goog-api-key']) { res.writeHead(403); return res.end(JSON.stringify({ error: { code: 403, message: 'no key' } })) }
    if (req.method === 'GET' && /^\/models\b/.test(req.url)) {
      return res.end(JSON.stringify({ models: MODELS.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: m.startsWith('text-') ? ['embedContent'] : ['generateContent'] })) }))
    }
    const m = req.url.match(/^\/models\/([^:]+):generateContent$/)
    if (!m) { res.writeHead(404); return res.end(JSON.stringify({ error: { code: 404, message: 'no such route' } })) }
    const parts = payload.contents?.[0]?.parts || []
    const audio = parts.find((p) => p.inlineData)
    if (mode === '429') {
      res.writeHead(429)
      return res.end(JSON.stringify({ error: { code: 429, message: 'Resource has been exhausted', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1s' }] } }))
    }
    if (mode === '500') { res.writeHead(500); return res.end(JSON.stringify({ error: { code: 500, message: 'Internal error' } })) }
    if (mode === '400audio' && audio) { res.writeHead(400); return res.end(JSON.stringify({ error: { code: 400, message: 'Unsupported MIME type' } })) }
    const text = parts.map((p) => p.text || '').join('\n')
    const system = (payload.systemInstruction?.parts || []).map((p) => p.text || '').join('\n')
    const reply = (out) => res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof out === 'string' ? out : JSON.stringify(out) }] } }], modelVersion: m[1] }))
    // Jarvis, asked: it echoes the question, says whether it heard a voice and
    // how many turns it was given, and names a piece the way it is told to.
    if (/You are talking to/.test(system)) {
      const turns = payload.contents || []
      const last = turns[turns.length - 1]
      const q = (last?.parts || []).map((p) => p.text || '').join(' ')
      const voice = (last?.parts || []).some((p) => p.inlineData) ? ' (heard a voice)' : ''
      const lang = (system.match(/Write in (\w+)/) || [])[1] || '?'
      return reply(`[${lang}] You asked: ${q}${voice}. Turns: ${turns.length}.\n- Look at [the first piece](task:1) first.`)
    }
    // Jarvis, reading the day: every usage line is a struggle; "logo" asked
    // three times or more is a repeat.
    if (/You find problems worth/.test(system)) {
      const usage = (text.split('What reviewers asked')[0].match(/^- .+$/gm) || []).map((l) => l.slice(2))
      const logos = (text.match(/logo/gi) || []).length
      const tri = (s) => ({ en: s, ru: `RU ${s}`, uz: `UZ ${s}` })
      return reply({
        struggles: usage.map((u) => tri(`People struggle: ${u.slice(0, 60)}`)),
        repeats: logos >= 3 ? [{ issue: tri('the logo is too small'), times: logos, channel: 'instagram', rule: tri('logo at least 15% of the width') }] : [],
      })
    }
    const note =(text.split('The written note:\n')[1] || '').split('\n').filter((l) => !/\/api\/telegram\/voice\//.test(l)).join(' ')
    const lang = (text.match(/Write the items in (\w+)/) || [])[1] || '?'
    const items = note.split(/[.!?]\s+|\.$/).map((s) => s.trim()).filter(Boolean).map((s) => `[${lang}] ${s}`)
    const heard = audio ? `heard ${audio.inlineData.mimeType} ${audio.inlineData.data.length}` : ''
    const out = { heard, items: items.length ? items : (audio ? [`[${lang}] what the clip asked`] : []) }
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }], modelVersion: m[1] }))
  })
})
server.listen(PORT, () => console.log(`mock-gemini on ${PORT}`))
