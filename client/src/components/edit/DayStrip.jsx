// The strip of days (moved from the edit form): seven days from the stop before this one (never before today), the
// chosen one ringed, a day's load as its shade and a mark under its number; the calendar at the end is any other day.
// One Tab stop: the arrows move the focus from the day that has it, Enter or Space (a press) chooses.
import { useEffect, useId, useMemo, useRef } from 'react'
import DayPick from '../DayPick.jsx'
import { dayShort, weekdayShort } from '../CoachParts.jsx'
import { addDaysISO } from '../../lib/constants.js'
import { tr as tx } from '../../lib/i18n.jsx'
import { WEEK } from './slots.js'

const MARKS = { one: 1, two: 2, many: 3, full: 1 }   // dots under a day's number for its load; `full` draws one bar

export default function DayStrip({ value, onChange, today, label, load = null, film = '', from = '', disabled = false, bad = false, f, autoFocus = false, allowPast = false }) {
  const uid = useId()
  const strip = useRef(null)
  // the new-task sheet (13 Nov 2026) takes a day before today too: the strip starts yesterday, the picker opens to any day
  const floor = allowPast ? addDaysISO(today, -1) : today
  const start = from && from > floor ? from : floor
  const days = useMemo(() => {
    const list = Array.from({ length: WEEK }, (_, i) => addDaysISO(start, i))
    if (value && !list.includes(value)) list.unshift(value)
    return list
  }, [start, value])
  const at = Math.max(0, days.indexOf(value))
  // The chosen day is kept in sight when the strip scrolls (a phone): the strip scrolls, never the page.
  useEffect(() => {
    const s = strip.current; const el = s?.querySelector('[aria-checked="true"]')
    if (!s || !el || s.scrollWidth <= s.clientWidth) return
    const want = el.offsetLeft - (s.clientWidth - el.offsetWidth) / 2
    s.scrollTo({ left: Math.max(0, want), behavior: 'auto' })
  }, [value, days.length])
  useEffect(() => {
    if (!autoFocus) return
    const el = strip.current?.querySelector('[tabindex="0"]')
    el?.focus({ preventScroll: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const keys = (e) => {
    // only the days' own keys: the "another day" picker inside the group keeps its arrows (and its calendar's)
    if (e.target.parentElement !== e.currentTarget || !e.target.dataset.day) return
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const here = days.indexOf(e.target.dataset.day)
    let i = here >= 0 ? here : at                    // from the day the focus is on, not the chosen one
    for (let k = 0; k < days.length; k++) { i = (i + d + days.length) % days.length; if (days[i] >= today) break }
    e.currentTarget.querySelector(`[data-day="${days[i]}"]`)?.focus()
  }
  return (
    <div ref={strip} className={'tw-days' + (bad ? ' tw-bad' : '')} role="radiogroup" aria-label={label} data-f={f} tabIndex={-1} onKeyDown={keys}>
      {days.map((d, i) => {
        const past = !allowPast && d < today
        const l = load?.(d)
        return (
          <button key={d} type="button" role="radio" aria-checked={d === value} data-day={d} disabled={disabled || (past && d !== value)}
            tabIndex={i === at ? 0 : -1} className={'tw-day' + (d === today ? ' today' : '') + (d < today ? ' is-past' : '') + (d === film ? ' film' : '') + (l ? ` is-${l.tone}` : '')}
            aria-label={`${dayShort(d)}${d === today ? `, ${tx('today')}` : ''}${l ? `, ${l.say}` : ''}`} title={l ? l.say : undefined}
            onClick={() => !past && onChange(d)}>
            <span className="tw-day-w">{weekdayShort(d)}</span>
            <span className="tw-day-n">{d.slice(8).replace(/^0/, '')}</span>
            <span className="tw-day-m" aria-hidden="true">{l && MARKS[l.tone] && Array.from({ length: MARKS[l.tone] }, (_, j) => <i key={j} />)}</span>
          </button>
        )
      })}
      <DayPick value="" min={allowPast ? '' : today} past={allowPast} film={film} label={tx('{label}: another day', { label })} placeholder={' '} disabled={disabled} className="tw-other" onChange={(d) => d && onChange(d)} id={`${uid}-o`} />
    </div>
  )
}
