// A reading of the Markdown the server writes (A-04, the TZ of 19 October
// 2026): the usage report in server/routes/track.js. It is not a Markdown
// engine — it knows the handful of shapes that report uses, and nothing it
// reads is ever HTML: every string goes to React as text.
//
//   # title                → doc.title
//   ## heading             → a section
//   | a | b |  (+ |---|)   → a table: head, rows (rows may be none)
//   - item                 → a list
//   _note_                 → a note (muted)
//   anything else          → a paragraph; blank lines end it
//
//   parseMd(text) → { title, lead: [blocks before the first ##], sections: [{ title, blocks }] }
//   a block is { kind: 'p' | 'note' | 'list' | 'table', text? | items? | head?, rows? }

const isRow = (l) => /^\|.*\|\s*$/.test(l)
const isSep = (l) => /^\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(l)
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function parseMd(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const doc = { title: '', lead: [], sections: [] }
  let blocks = doc.lead
  let i = 0
  const flushP = (buf) => { if (buf.length) blocks.push({ kind: 'p', text: buf.join(' ') }) }
  let buf = []
  while (i < lines.length) {
    const l = lines[i]
    if (/^# /.test(l)) { flushP(buf); buf = []; doc.title = l.slice(2).trim(); i++; continue }
    if (/^## /.test(l)) { flushP(buf); buf = []; const s = { title: l.slice(3).trim(), blocks: [] }; doc.sections.push(s); blocks = s.blocks; i++; continue }
    if (isRow(l) && isSep(lines[i + 1] || '')) {
      flushP(buf); buf = []
      const head = cells(l)
      const rows = []
      i += 2
      while (i < lines.length && isRow(lines[i]) && !isSep(lines[i])) { rows.push(cells(lines[i])); i++ }
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    if (/^- /.test(l)) {
      flushP(buf); buf = []
      const items = []
      while (i < lines.length && /^- /.test(lines[i])) { items.push(lines[i].slice(2).trim()); i++ }
      blocks.push({ kind: 'list', items })
      continue
    }
    if (/^_.*_\s*$/.test(l)) { flushP(buf); buf = []; blocks.push({ kind: 'note', text: l.trim().slice(1, -1) }); i++; continue }
    if (!l.trim()) { flushP(buf); buf = []; i++; continue }
    buf.push(l.trim()); i++
  }
  flushP(buf)
  return doc
}
