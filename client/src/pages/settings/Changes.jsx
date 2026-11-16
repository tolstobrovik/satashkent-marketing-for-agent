// Settings → History → Changes (/admin/history, 12 Nov 2026,
// design-variants/admin-tz.md §2.1). The owner, of the old log: "looks
// terrifying". Same rows and rules as Admin.jsx's HistoryTab — GET
// /content/activity/all every 15 s, the "what" and "who" filters, newest first
// by the clock, grouped by the Tashkent day — drawn as the settings' rows: a
// day label that stays while its day scrolls, a card of rows, a row one line
// (time · who did what to which task) that unfolds to the whole line and a way
// to the task. Forty rows, then forty more. No inner scroll box: the page
// scrolls.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { tr as tx } from '../../lib/i18n.jsx'
import { activityLine } from '../../lib/activity.js'
import { todayISO, addDaysISO, tashkentDay, longDayLabel } from '../../lib/constants.js'
import { Page } from './parts.jsx'

const STEP = 40
// Created, moved (the stage), sent back (a pravka), everything else — the old log's rule.
const whatOf = (a) => (a.kind === 'created' ? 'created' : a.field === 'stage' ? 'moved' : a.field === 'pravki' ? 'back' : 'other')
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' })
const at = (ts) => { try { return clock.format(new Date(ts)) } catch { return '' } }

export default function Changes() {
  const [rows, setRows] = useState(null)
  const [what, setWhat] = useState('all')
  const [who, setWho] = useState('all')
  const [limit, setLimit] = useState(STEP)
  const [open, setOpen] = useState(() => new Set())
  // The log never came: say so (never "No changes"), and offer another try;
  // the 15 s poll keeps trying too. A poll that fails later keeps what is drawn.
  const [failed, setFailed] = useState(false)
  const loadRef = useRef(() => {})

  useEffect(() => {
    let on = true
    const load = () => api.get('/content/activity/all')
      .then((r) => { if (on) { setRows(Array.isArray(r) ? r : []); setFailed(false) } })
      .catch(() => { if (on) setFailed(true) })
    loadRef.current = load
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, 15000)
    return () => { on = false; clearInterval(id) }
  }, [])
  useEffect(() => { setLimit(STEP) }, [what, who])

  const all = rows || []
  const people = useMemo(() => [...new Set(all.map((r) => r.user_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [all])
  // A task deleted later keeps its earlier rows; none of them may lead to it.
  const gone = useMemo(() => new Set(all.filter((a) => a.kind === 'deleted').map((a) => a.content_id)), [all])
  const shown = useMemo(() => all
    .filter((r) => (who === 'all' || r.user_name === who) && (what === 'all' || whatOf(r) === what))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [all, who, what])
  const today = todayISO()
  const days = useMemo(() => {
    const out = []
    for (const a of shown.slice(0, limit)) {
      const day = tashkentDay(a.created_at)
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, rows: [] })
      out[out.length - 1].rows.push(a)
    }
    return out
  }, [shown, limit])
  const dayWords = (day) => (day === today ? tx('Today') : day === addDaysISO(today, -1) ? tx('Yesterday') : longDayLabel(day))
  const flip = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const left = shown.length - limit

  return (
    <Page title={tx('Changes')}>
      <div className="co-st-tools">
        <select className="select" value={what} onChange={(e) => setWhat(e.target.value)} aria-label={tx('What')}>
          <option value="all">{tx('Everything')}</option>
          <option value="created">{tx('Created')}</option>
          <option value="moved">{tx('Moved')}</option>
          <option value="back">{tx('Sent back')}</option>
          <option value="other">{tx('Other changes')}</option>
        </select>
        <select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label={tx('Who')}>
          <option value="all">{tx('Everyone')}</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {rows === null && !failed && <div className="co-st-card"><p className="co-st-empty" aria-busy="true">{tx('Loading…')}</p></div>}
      {rows === null && failed && (
        <div className="co-st-card">
          <p className="co-st-empty" role="status">{tx('The board did not answer. Try again.')}</p>
          <div className="co-st-retry"><button type="button" className="co-btn co-btn-q co-btn-sm" onClick={() => loadRef.current()}>{tx('Try again')}</button></div>
        </div>
      )}
      {rows !== null && shown.length === 0 && <div className="co-st-card"><p className="co-st-empty">{tx('No changes')}</p></div>}

      {days.map((d) => (
        <section key={d.day} className="co-st-days" aria-labelledby={`st-day-${d.day}`}>
          <h2 className="co-st-day" id={`st-day-${d.day}`}>{dayWords(d.day)}</h2>
          <div className="co-st-card">
            {d.rows.map((a) => {
              const isOpen = open.has(a.id)
              const canOpen = a.kind !== 'deleted' && a.content_id && !gone.has(a.content_id)
              const xid = `st-log-${a.id}`
              return (
                <div key={a.id} className="co-st-logw">
                  <button type="button" className="co-st-row co-st-log" aria-expanded={isOpen} aria-controls={isOpen && canOpen ? xid : undefined} onClick={() => flip(a.id)}>
                    <span className="co-st-when">{at(a.created_at)}</span>
                    <span className="co-st-t"><b>{a.user_name || '?'}</b> {activityLine(a)}{a.field === 'title' ? '' : <>: «{a.content_title || '—'}»</>}</span>
                  </button>
                  {isOpen && canOpen && (
                    <div className="co-st-logx" id={xid}>
                      <Link className="co-btn co-btn-q co-btn-sm" to={`/brief?task=${a.content_id}`}>{tx('Open the task')}</Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {left > 0 && (
        <div className="co-st-moreb">
          <button type="button" className="co-btn co-btn-t co-btn-sm" onClick={() => setLimit((n) => n + STEP)}>
            {tx('Show {n} more', { n: Math.min(STEP, left) })}
          </button>
        </div>
      )}
    </Page>
  )
}
