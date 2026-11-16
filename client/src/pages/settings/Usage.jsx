// Settings → History → How the board is used (/admin/usage, 12 Nov 2026,
// design-variants/admin-tz.md §0 #15, §2.1). The owner: "I need the statistics
// like who how much used and then a button to download the heatmap and useful
// info for your further updates". So: who used it and how much (GET /usage —
// the minutes with the board in front of them, and the presses), who did not
// open it, the few things to fix first (GET /api/track/summary), and one file
// with everything a later look needs (GET /api/track/pack). The press lists,
// "Where they go", the heatmap chips and the reports' reader left the page;
// the heatmap still opens with ?heatmap= from the file's page list.
import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { api, getToken } from '../../lib/api.js'
import { toast } from '../../lib/toast.js'
import { tr as tx } from '../../lib/i18n.jsx'
import { todayISO, addDaysISO, tashkentDay, dayWord } from '../../lib/constants.js'
import Avatar from '../../components/Avatar.jsx'
import { Group, Page } from './parts.jsx'

const SPANS = [['1', 'Today'], ['7', '7 days'], ['30', '30 days']]
const SPAN_WORDS = { Today: () => tx('Today'), '7 days': () => tx('7 days'), '30 days': () => tx('30 days') }

// "3h 20m" reads; 12000 does not. Under a minute is still a visit.
const spell = (secs) => {
  const m = Math.round((Number(secs) || 0) / 60)
  if (m < 1) return tx('under a minute')
  const h = Math.floor(m / 60)
  return h ? tx('{h}h {m}m', { h, m: m % 60 }) : tx('{n}m', { n: m })
}
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' })
// When, by the team's clock: "today, 14:32" / "12 Nov, 09:05".
const seen = (iso) => {
  if (!iso) return tx('never')
  try { return `${dayWord(tashkentDay(iso))}, ${clock.format(new Date(iso))}` } catch { return '' }
}

// A file the server hands over: its body and the name it gives.
async function fetchFile(path) {
  const r = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!r.ok) {
    let said = ''
    try { said = (await r.json()).error } catch { /* not JSON */ }
    throw new Error(said ? tx(said) : tx('The report could not be read'))
  }
  const name = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1] || ''
  return { blob: await r.blob(), name }
}
// Hand it to the browser to keep. An empty file is never saved.
function keep(blob, name) {
  if (!blob.size) throw new Error(tx('Nothing was recorded.'))
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Today · 7 days · 30 days — a radio group, arrows move and choose.
function Span({ value, onChange }) {
  const refs = useRef([])
  const key = (e, i) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const j = (i + step + SPANS.length) % SPANS.length
    onChange(SPANS[j][0]); refs.current[j]?.focus()
  }
  return (
    <div className="co-st-seg co-st-span" role="radiogroup" aria-label={tx('Period')}>
      {SPANS.map(([k, w], i) => (
        <button key={k} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={value === k} tabIndex={value === k ? 0 : -1}
          onClick={() => onChange(k)} onKeyDown={(e) => key(e, i)}>{SPAN_WORDS[w]()}</button>
      ))}
    </div>
  )
}

export default function Usage() {
  const [span, setSpan] = useState('7')
  const [rows, setRows] = useState(null)
  const [sum, setSum] = useState(null)
  const [busy, setBusy] = useState('')
  const n = Number(span)
  const to = todayISO()
  const from = n === 1 ? to : addDaysISO(to, -(n - 1))

  // A card whose answer never came says so — never "Nobody opened" or
  // "Nothing stood out", which would be untrue.
  useEffect(() => {
    let on = true
    setRows(null); setSum(null)
    api.get(`/usage?from=${from}&to=${to}`).then((r) => { if (on) setRows(r?.rows || []) }).catch(() => { if (on) setRows(false) })
    api.get(`/track/summary?days=${n}`).then((r) => { if (on) setSum(r || {}) }).catch(() => { if (on) setSum(false) })
    return () => { on = false }
  }, [from, to, n])

  const used = (rows || []).filter((r) => r.seconds > 0).sort((a, b) => b.seconds - a.seconds || b.taps - a.taps)
  const idle = (rows || []).filter((r) => !(r.seconds > 0)).map((r) => r.name).filter(Boolean)
  const fixes = sum?.fixes || []

  const pack = async () => {
    setBusy('pack')
    try {
      const { blob, name } = await fetchFile(`/track/pack?days=${n}`)
      keep(blob, name || `board-analysis-${from}${from === to ? '' : `-${to}`}.json`)
    } catch (e) { toast(e.message, 'err') }
    setBusy('')
  }
  // The log of exactly the days in view: the server keeps a file a day, so
  // each day is asked for in turn and the lines are put one after another.
  const log = async () => {
    setBusy('log')
    try {
      const parts = []
      for (let i = 0; i < n; i++) {
        const { blob } = await fetchFile(`/track/raw?day=${addDaysISO(from, i)}`)
        if (!blob.size) continue
        parts.push(blob)
        if ((await blob.slice(-1).text()) !== '\n') parts.push('\n')
      }
      keep(new Blob(parts, { type: 'application/x-ndjson' }), `board-log-${from}${from === to ? '' : `-${to}`}.ndjson`)
    } catch (e) { toast(e.message, 'err') }
    setBusy('')
  }

  return (
    <Page title={tx('How the board is used')}>
      <Span value={span} onChange={setSpan} />

      <Group title={tx('Who used it')} note={rows && idle.length ? tx('Not opened: {names}', { names: idle.join(', ') }) : null}>
        {rows === null && <p className="co-st-empty" aria-busy="true">{tx('Loading…')}</p>}
        {rows === false && <p className="co-st-empty" role="status">{tx('The report could not be read')}</p>}
        {rows && !used.length && <p className="co-st-empty">{tx('Nobody opened the board in these days.')}</p>}
        {used.map((r) => (
          <div key={r.id} className="co-st-row co-st-line co-st-who">
            <span className="co-st-face"><Avatar name={r.name} color={r.color || undefined} src={r.avatar || null} size="sm" /></span>
            <span className="co-st-t">{r.name}<small>{tx('last seen {when}', { when: seen(r.last_at) })}</small></span>
            <span className="co-st-v">{r.taps === 1 ? tx('{time} · 1 press', { time: spell(r.seconds) }) : tx('{time} · {n} presses', { time: spell(r.seconds), n: r.taps || 0 })}</span>
          </div>
        ))}
      </Group>

      <Group title={tx('What to fix first')}>
        {sum === null && <p className="co-st-empty" aria-busy="true">{tx('Loading…')}</p>}
        {sum === false && <p className="co-st-empty" role="status">{tx('The report could not be read')}</p>}
        {sum && !fixes.length && <p className="co-st-empty">{tx('Nothing stood out.')}</p>}
        {fixes.map((f, i) => (
          <div key={i} className="co-st-row co-st-line co-st-fix"><span className="co-st-t">{f}</span></div>
        ))}
      </Group>

      <div className="co-st-dl">
        <button type="button" className="co-btn co-btn-p" onClick={pack} disabled={!!busy} aria-busy={busy === 'pack'}>
          <Download size={18} aria-hidden="true" />{tx('Download for analysis')}
        </button>
        <button type="button" className="co-btn co-btn-q co-btn-sm" onClick={log} disabled={!!busy} aria-busy={busy === 'log'}>
          {tx('Full log')}
        </button>
      </div>
    </Page>
  )
}
