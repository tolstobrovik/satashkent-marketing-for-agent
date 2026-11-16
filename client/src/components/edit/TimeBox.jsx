// The shoot's hours (moved from the edit form): ONE box "15:30 – 17:00" — two quarter-hour selects, the length as quiet
// words at its end — and beside it the free windows of the one who films that day, as chips; a press moves the shoot
// into the window. Selects, not <input type="time">: the browser's box writes "03:30 PM" in an English browser.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { tr as tx } from '../../lib/i18n.jsx'
import { QUARTERS, toMin, toHH, lenWords, freeWindows } from './slots.js'

// A pick on a select is held a moment and sent once (a pause, Enter or the focus leaving): a closed select changes on
// every arrow press, and one PATCH a quarter hour booked steps nobody chose. The focused select is never disabled
// while the PATCH is out (that dropped the focus to the page); the picked value is drawn until the server answers.
const PAUSE = 700

export default function TimeBox({ start: was, end: wasEnd, onChange, shootDay = null, disabled = false, bad = false, label }) {
  const [pend, setPend] = useState(null)          // { recording_time?, recording_end? } picked and not yet answered
  const [due, setDue] = useState(false)           // the pause after the last pick is over
  const [fly, setFly] = useState(false)           // sent; the parent is busy with it
  const [foc, setFoc] = useState('')              // the select the keyboard is on
  const timer = useRef(null)
  const sent = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!due || !pend || fly || disabled) return
    setDue(false)
    // arrowed away and back: nothing to send
    if (Object.entries(pend).every(([k, v]) => (v || '') === ((k === 'recording_time' ? was : wasEnd) || ''))) { setPend(null); return }
    setFly(true); sent.current = pend; onChange(pend)
  }, [due, pend, fly, disabled]) // eslint-disable-line react-hooks/exhaustive-deps
  // the parent is free again (or the hours came back changed): the props hold the answer — a refusal puts the old
  // hours back; a pick made since stays and goes next
  useEffect(() => { if (fly && !disabled) { setFly(false); setPend((p) => (p === sent.current ? null : p)) } }, [disabled, was, wasEnd]) // eslint-disable-line react-hooks/exhaustive-deps
  const hold = (body, now = false) => {
    clearTimeout(timer.current)
    setPend((p) => ({ ...(p || {}), ...body })); setDue(now)
    if (!now) timer.current = setTimeout(() => setDue(true), PAUSE)
  }
  const flush = () => { if (pend) { clearTimeout(timer.current); setDue(true) } }
  const start = pend && 'recording_time' in pend ? pend.recording_time || '' : was
  const end = pend && 'recording_end' in pend ? pend.recording_end || '' : wasEnd
  const len = start && end ? toMin(end) - toMin(start) : 60
  const ends = useMemo(() => {
    if (!start) return []
    const a = toMin(start); const list = []
    for (let m = a + 15; m <= Math.min(23 * 60 + 45, a + 8 * 60); m += 15) list.push(toHH(m))
    if (end && !list.includes(end) && end > start) list.push(end)
    return list.sort()
  }, [start, end])
  // Moving the start keeps the length; the end is any quarter hour after the start.
  const setStart = (v, now) => hold({ recording_time: v || null, recording_end: v ? toHH(Math.min(23 * 60 + 45, toMin(v) + (start && end ? toMin(end) - toMin(start) : 60))) : null }, now)
  const setEnd = (v) => hold({ recording_end: v || null })
  const sel = (k) => ({ onFocus: () => setFoc(k), onBlur: () => { setFoc(''); flush() }, onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); flush() } } })
  const wins = freeWindows(shootDay)
  return (
    <div className={'tw-hours' + (bad ? ' tw-bad' : '') + (fly ? ' is-busy' : '')} aria-busy={fly || undefined}>
      <div className="tw-hours-row">
        <div className="tw-range" role="group" aria-label={label || tx('Time')}>
          <Clock size={16} aria-hidden="true" />
          <select data-f="recording_time" className="tw-rsel" aria-label={tx('Starts')} value={start || ''} disabled={disabled && foc !== 'start'} {...sel('start')} onChange={(e) => setStart(e.target.value)}>
            <option value="">—</option>
            {(start && !QUARTERS.includes(start) ? [start, ...QUARTERS].sort() : QUARTERS).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <span className="tw-range-d" aria-hidden="true">–</span>
          <select data-f="recording_end" className="tw-rsel" aria-label={tx('Ends')} value={end || ''} disabled={(disabled && foc !== 'end') || !start} {...sel('end')} onChange={(e) => setEnd(e.target.value)}>
            {!start && <option value="">—</option>}
            {ends.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {start && end && len > 0 && <span className="tw-range-len">{lenWords(len)}</span>}
        </div>
        {shootDay && (wins.length > 0 ? (
          <div className="tw-free" role="group" aria-label={tx('Free that day')}>
            <span className="tw-free-lb">{tx('Free')}</span>
            {wins.map((w) => (
              <button key={w.from} type="button" className="tw-free-b" aria-pressed={w.from === start} disabled={disabled} onClick={() => setStart(w.from, true)}
                aria-label={tx('Free {from}–{to}: start at {from}', { from: w.from, to: w.to })}>{w.from}–{w.to}</button>
            ))}
          </div>
        ) : <span className="tw-free-none">{shootDay.working ? tx('No free time that day') : tx('Day off')}</span>)}
      </div>
    </div>
  )
}
