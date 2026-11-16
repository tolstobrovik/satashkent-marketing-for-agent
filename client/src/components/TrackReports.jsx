import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Flame } from 'lucide-react'
import { api, getToken } from '../lib/api.js'
import { toast } from '../lib/toast.js'
import { tr as tx } from '../lib/i18n.jsx'
import { parseMd } from '../lib/markdown.js'

// A-04: the report is read, not shown as a block of Markdown. Its headings
// and its tables' column names are the server's English, looked up in the
// books here (every one is listed so the translation gate sees it); the
// sentences inside — the findings, with their numbers and names — are the
// server's own. "What to improve first" is the first card.
const WORDS = {
  'What to improve first': () => tx('What to improve first'),
  'Who was on it': () => tx('Who was on it'),
  'Pages': () => tx('Pages'),
  'Closing a task (inside the task window)': () => tx('Closing a task (inside the task window)'),
  'What was pressed most': () => tx('What was pressed most'),
  'Where people got stuck': () => tx('Where people got stuck'),
  'Common trips (three pages in a row)': () => tx('Common trips (three pages in a row)'),
  'Person': () => tx('Person'), 'Role': () => tx('Role'), 'Presses': () => tx('Presses'), 'Tasks opened': () => tx('Tasks opened'),
  'Changed a task': () => tx('Changed a task'), 'First': () => tx('First'), 'Last': () => tx('Last'), 'Page': () => tx('Page'),
  'Views': () => tx('Views'), 'People': () => tx('People'), 'Not-a-button presses': () => tx('Not-a-button presses'),
  'Repeated presses': () => tx('Repeated presses'), 'Pressed': () => tx('Pressed'), 'Times': () => tx('Times'), 'What': () => tx('What'),
  'Who': () => tx('Who'), 'Bursts': () => tx('Bursts'), 'Message': () => tx('Message'), 'Trip': () => tx('Trip'),
  'Nothing stood out.': () => tx('Nothing stood out.'), 'Nothing was recorded.': () => tx('Nothing was recorded.'),
}
const word = (s) => (WORDS[s] ? WORDS[s]() : s)

function Block({ b }) {
  if (b.kind === 'p') return <p>{word(b.text)}</p>
  if (b.kind === 'note') return <p className="tr-note">{b.text}</p>
  if (b.kind === 'list') return <ul>{b.items.map((it, i) => <li key={i}>{word(it)}</li>)}</ul>
  if (!b.rows.length) return <p className="tr-none">{tx('Nothing here.')}</p>
  return (
    <div className="table-wrap">
      <table className="tbl tr-tbl">
        <thead><tr>{b.head.map((h, i) => <th key={i}>{word(h)}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

// ---- "How the board is used": the daily and weekly reports (round 13) --------
// The owner, 14 Oct 2026: a daily and a weekly .md file, on an admin page only,
// to download and read when planning the next round; and a heatmap. The report
// is written by the server (server/routes/track.js); this lists the days and
// weeks, shows one, hands it over as a file, and opens a page with its presses
// drawn on it.
const asText = async (path) => {
  const r = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!r.ok) throw new Error(tx('The report could not be read'))
  return r
}

export default function TrackReports() {
  const navigate = useNavigate()
  const [list, setList] = useState(null)
  const [pick, setPick] = useState(null)      // { day } or { week }
  const [text, setText] = useState('')
  useEffect(() => {
    api.get('/track/days').then((r) => {
      setList(r)
      if (r.days?.[0]) setPick({ day: r.days[0].day })
    }).catch(() => setList({ days: [], weeks: [] }))
  }, [])
  const query = pick ? (pick.week ? `week=${pick.week}` : `day=${pick.day}`) : ''
  useEffect(() => {
    if (!query) return undefined
    let on = true
    setText('')
    asText(`/track/report?${query}`).then((r) => r.text()).then((s) => { if (on) setText(s) }).catch((e) => { if (on) setText(e.message) })
    return () => { on = false }
  }, [query])
  // The report as .md, or every line the day or week recorded (`raw`) — for
  // when the totals are not enough to say who did what to which task.
  const download = async (raw = false) => {
    try {
      const blob = await (await asText(raw ? `/track/raw?${query}` : `/track/report?${query}&download=1`)).blob()
      const name = `board-${raw ? 'log' : 'usage'}-${pick.week ? `week-${pick.week}` : pick.day}.${raw ? 'ndjson' : 'md'}`
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (e) { toast(e.message, 'err') }
  }
  const doc = useMemo(() => parseMd(text), [text])
  const fix = doc.sections.find((s) => s.title === 'What to improve first')
  const rest = doc.sections.filter((s) => s !== fix)
  // The pages in the report's own table, each with a way to see its presses.
  const pages = useMemo(() => {
    const part = text.split('## Pages')[1]?.split('\n## ')[0] || ''
    // Only the board's own pages: never "//other.site", which navigate() would leave the board for.
    return part.split('\n').map((l) => /^\| (\/[^|]*?) \|/.exec(l)?.[1]).filter((p) => p && /^\/(?![/\\])/.test(p) && !p.includes(':id')).slice(0, 8)
  }, [text])

  if (!list) return <div className="card"><span className="spinner" /></div>
  if (!list.days.length) {
    return (
      <div className="card tr-card">
        <h3>{tx('How the board is used')}</h3>
        <p className="stat-sub">{tx('Nothing recorded yet. The first report appears after people have used the board for a while.')}</p>
      </div>
    )
  }
  return (
    <div className="card tr-card">
      <div className="tr-head">
        <h3>{tx('How the board is used')}</h3>
        <select className="select tr-pick" value={pick?.week ? `w:${pick.week}` : `d:${pick?.day || ''}`} aria-label={tx('Which report')}
          onChange={(e) => { const [k, v] = e.target.value.split(':'); setPick(k === 'w' ? { week: v } : { day: v }) }}>
          <optgroup label={tx('Days')}>{list.days.map((d) => <option key={d.day} value={`d:${d.day}`}>{d.day}</option>)}</optgroup>
          <optgroup label={tx('Weeks')}>{list.weeks.map((w) => <option key={w} value={`w:${w}`}>{tx('Week of {day}', { day: w })}</option>)}</optgroup>
        </select>
        <button type="button" className="btn btn-sm" onClick={() => download()} disabled={!text}><Download size={15} aria-hidden="true" /> {tx('Download .md')}</button>
        <button type="button" className="btn btn-sm" onClick={() => download(true)} disabled={!text}><Download size={15} aria-hidden="true" /> {tx('Download the full log')}</button>
      </div>
      <p className="stat-sub">{tx('Pages opened, where people pressed and what the board said no with, by name — never what anybody typed.')}</p>
      {!text ? <p className="stat-sub">…</p> : (
        <div className="tr-md">
          <div className="tr-fix">
            <b>{tx('What to improve first')}</b>
            {fix ? fix.blocks.map((b, i) => <Block key={i} b={b} />) : doc.lead.map((b, i) => <Block key={i} b={b} />)}
          </div>
          {fix && doc.lead.map((b, i) => <Block key={i} b={b} />)}
      {pages.length > 0 && (
        <div className="tr-heat">
          <span>{tx('See where people pressed:')}</span>
          {pages.map((p) => (
            <button key={p} type="button" className="btn btn-sm" onClick={() => navigate(`${p}?heatmap=${pick?.week ? `week:${pick.week}` : `day:${pick.day}`}`)}><Flame size={14} aria-hidden="true" /> {p}</button>
          ))}
        </div>
      )}
          {rest.map((s) => (
            <section key={s.title} className="tr-sec">
              <h4>{word(s.title)}</h4>
              {s.blocks.map((b, i) => <Block key={i} b={b} />)}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
