import { useEffect, useRef, useState } from 'react'
import { Route, Users, Scissors, Palette, UserRound, Plus } from 'lucide-react'
import { addDaysISO, longDayLabel, dateLabel, todayISO } from '../../lib/constants.js'
import { tr as tx } from '../../lib/i18n.jsx'
import MiniCalendar from './MiniCalendar.jsx'
import FacePicker from './FacePicker.jsx'
import DayPick from '../DayPick.jsx'
import TimeBand from '../TimeBand.jsx'
import Timeline from '../Timeline.jsx'
import { dayShort, firstName } from '../CoachParts.jsx'

// Plan — the piece as its line of stops (round 18, 23 Oct 2026): Idea ✓ →
// Shoot → Edit (or Artwork) → Out. Pressing a stop opens, under the line,
// what that stop needs: the shoot its day, hours and who films (round 11's
// rows of buttons, TimeBand); the edit its day and who edits; the artwork
// its day and who designs; Out the month. Each stop writes its day and its
// person on itself, so the plan is read off the line, not off a sentence.
// Everything is optional — a seat left empty is asked again when the piece
// is sent on — and Out reads "Today · for now" until it is changed: a piece
// given no day is born on today (TaskBuilder, bornDay).
// A series of short shoots (the owner, 10 Nov 2026): n pieces of m minutes, one task each, booked
// back to back from the start on the quarter-hour grid the server keeps. The status line and the
// tasks TaskBuilder makes read this one plan, so they can never disagree. The start snaps down to
// the quarter (as the server snaps a start); a piece's footprint is the quarters it touches, never
// shorter than one; the day ends at 23:59 — what would run past it stands on the last quarter,
// 23:45–23:59, together (`capped`). `shared` is a piece that adds no quarter an earlier piece did
// not already hold: it can only clash with its own siblings, so it is sent with `force` at once.
export const seriesN = (v) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 1 ? Math.min(30, x) : 1 }
export const seriesMins = (v) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 1 ? Math.min(120, Math.max(5, x)) : 5 }
export function seriesPlan(from, n, m) {
  const Q = 15, LAST = 23 * 60 + 45, CAP = 23 * 60 + 59
  const toM = (s) => { const [h, mi] = String(s || '00:00').split(':').map(Number); return (h || 0) * 60 + (mi || 0) }
  const hm = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
  const q = (v) => Math.floor(v / Q) * Q
  const a = Math.min(LAST, q(toM(from)))
  const pieces = []
  let edge = a
  for (let i = 0; i < n; i++) {
    const s = Math.min(LAST, q(a + i * m))
    const e = Math.min(CAP, Math.max(s + Q, q(a + (i + 1) * m + Q - 1)))
    pieces.push({ from: hm(s), to: hm(e), shared: i > 0 && e <= edge })
    edge = Math.max(edge, e)
  }
  return { from: hm(a), to: pieces[pieces.length - 1].to, pieces, capped: a + n * m > CAP }
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)

// One day as a row: today and the next four, then any other day. `min` is the
// first day allowed (an edit is never before the shoot), `max` the last (never
// after the release).
function DayRow({ label, value, onChange, min = '', max = '' }) {
  const today = todayISO()
  const first = min && min > today ? min : today
  return (
    <div className="tb-dayrow">
      <div className="tb-pills" role="group" aria-label={label}>
        {[0, 1, 2, 3, 4].map((n) => {
          const d = addDaysISO(today, n)
          const off = d < first || (!!max && d > max)
          return (
            <button key={d} type="button" className={'tb-pill' + (value === d ? ' on' : '')} aria-pressed={value === d} disabled={off}
              onClick={() => onChange(value === d ? '' : d)}>
              {n === 0 ? tx('Today') : n === 1 ? tx('Tomorrow') : dayShort(d)}
            </button>
          )
        })}
        <DayPick className="tb-otherday" value={[0, 1, 2, 3, 4].some((n) => addDaysISO(today, n) === value) ? '' : value} min={first}
          label={tx('Another day')} placeholder={tx('Another day')} onChange={onChange} />
        {value && <button type="button" className="tb-link tb-date-clear" onClick={() => onChange('')}>{tx('Clear')}</button>}
      </div>
    </div>
  )
}

export default function StepPlan({ today, d, set, film, edit, design, quick = [], operators, editors, designers, people, owners }) {
  const box = useRef(null)
  const dayWord = (x) => (x === today ? tx('Today') : x === addDaysISO(today, 1) ? tx('Tomorrow') : dayShort(x))
  const who = (list, id) => firstName(list.find((u) => u.id === id)) || ''
  const sub = (day, person, assumed = '') => [day ? dayWord(day) : assumed ? `${dayWord(assumed)} · ${tx('for now')}` : '—', person].filter(Boolean).join(' · ')
  // The stops, in the order the work happens; the idea is already written.
  const stops = [
    { key: 'idea', kind: 'idea', label: tx('Idea'), state: 'done', fixed: true, sub: tx('Today') },
    film && { key: 'shoot', kind: 'shoot', label: tx('Shoot'), state: d.recording_date ? 'on' : 'todo', sub: sub(d.recording_date, who(operators, d.operator_id)) },
    edit && { key: 'cut', kind: 'edit', label: tx('Editing'), state: d.edit_ready_date ? 'on' : 'todo', sub: sub(d.edit_ready_date, who(editors, d.editor_id)) },
    design && { key: 'art', kind: 'design', label: tx('Artwork'), state: d.design_ready_date ? 'on' : 'todo', sub: sub(d.design_ready_date, who(designers, d.designer_id)) },
    { key: 'out', kind: 'out', label: tx('Goes out'), state: d.release_date ? 'on' : 'todo', sub: sub(d.release_date, '', today) },
  ].filter(Boolean)
  // Open on the first stop still empty, so the plan is filled in the order
  // the work happens.
  const [picked, setPicked] = useState(() => (stops.find((s) => !s.fixed && s.state === 'todo') || stops[stops.length - 1]).key)
  useEffect(() => {
    if (picked === 'out') box.current?.querySelector('.mc-day.on, .mc-day.today')?.focus()
  }, [picked])
  const [facesOpen, setFacesOpen] = useState(() => d.type === 'target' || (d.face_ids || []).length > 0)
  // The boxes keep what is typed (a "1" on the way to "15" is not yet a number to clamp) and
  // settle on leaving; everything read off them goes through seriesN / seriesMins, so the status
  // and the tasks never see a blank or a NaN. Whether the panel is open is the form's own state
  // (`series_open`), so leaving the step and coming back finds it as it was.
  const nSeries = seriesN(d.series_n)
  const mSeries = seriesMins(d.series_mins)
  const plan = d.recording_time ? seriesPlan(d.recording_time, nSeries, mSeries) : null
  const away = d.release_date ? daysBetween(today, d.release_date) : null
  const when = away === null ? '' : away === 0 ? tx('Today') : away === 1 ? tx('Tomorrow') : away > 1 ? tx('in {n} days', { n: away }) : ''
  return (
    <div className="tb-q" ref={box}>
      <h2 className="tb-ask"><span className="tb-ask-icon" aria-hidden="true"><Route size={18} /></span>{tx('Who does what, and when?')}</h2>
      <Timeline size="plan" stops={stops} picked={picked} onPick={setPicked} label={tx('Plan')} />
      <div className="tb-plan-panel" key={picked}>
        {picked === 'shoot' && (
          <>
            <TimeBand compact day={d.recording_date} onDay={(day) => set({ recording_date: day || '' })}
              value={{ from: d.recording_time, to: d.recording_end }}
              onChange={({ from, to }) => set({ recording_time: from || '', recording_end: to || '' })}
              operatorId={d.operator_id} onOperator={(id) => set({ operator_id: id || null })}
              operators={operators} />
            {/* A series (the owner, 10 Nov 2026): target videos are many five-minute shoots with the same
                crew and day and only the script apart — one task each, booked back to back from the start. */}
            {d.series_open || nSeries > 1 ? (
              <div className="tb-series" role="group" aria-label={tx('Several short shoots in a row')}>
                <div className="tb-series-row">
                  <label className="tb-series-f"><span>{tx('Pieces')}</span>
                    <input type="number" className="input" inputMode="numeric" min={1} max={30} value={d.series_n ?? ''}
                      onChange={(e) => set({ series_n: e.target.value })} onBlur={() => set({ series_n: nSeries })} />
                  </label>
                  <label className="tb-series-f"><span>{tx('Minutes each')}</span>
                    <input type="number" className="input" inputMode="numeric" min={5} max={120} step={5} value={d.series_mins ?? ''}
                      onChange={(e) => set({ series_mins: e.target.value })} onBlur={() => set({ series_mins: mSeries })} />
                  </label>
                  <span className="tb-series-sum" role="status">
                    {/* the block ends on the quarter hour the server keeps, and never past 23:59 */}
                    {nSeries > 1 && plan ? tx('{n} tasks, {from}–{to}', { n: nSeries, from: plan.from, to: plan.to })
                      : nSeries > 1 ? tx('{n} tasks — book the start above', { n: nSeries }) : tx('One task')}
                  </span>
                </div>
                <label className="tb-series-f tb-series-scripts"><span>{tx('Scripts, one line each')}</span>
                  <textarea className="input" rows={Math.min(8, Math.max(3, nSeries))} value={d.series_scripts || ''} placeholder={tx('Line 1 is the first piece’s script, line 2 the second’s…')}
                    onChange={(e) => set({ series_scripts: e.target.value })} />
                </label>
              </div>
            ) : (
              <button type="button" className="tb-link tb-more-q tb-series-link" onClick={() => set({ series_open: true, ...(nSeries < 2 ? { series_n: 3 } : {}) })}>
                <Plus size={14} /> {tx('Several short shoots in a row')}
              </button>
            )}
            {facesOpen
              ? <FacePicker label={tx('Who is in it?')} Icon={Users} people={people} value={d.face_ids} onChange={(ids) => set({ face_ids: ids })} multi />
              : (
                <button type="button" className="tb-link tb-more-q" onClick={() => setFacesOpen(true)}>
                  <Plus size={14} /> {tx('Who is in it?')}
                </button>
              )}
          </>
        )}
        {picked === 'cut' && (
          <>
            <DayRow label={tx('Edit due')} value={d.edit_ready_date} onChange={(v) => set({ edit_ready_date: v })} min={d.recording_date} max={d.release_date} />
            <FacePicker label={tx('Who edits it?')} Icon={Scissors} people={editors} value={d.editor_id} onChange={(id) => set({ editor_id: id })} />
          </>
        )}
        {picked === 'art' && (
          <>
            <DayRow label={tx('Artwork due')} value={d.design_ready_date} onChange={(v) => set({ design_ready_date: v })} max={d.release_date} />
            <FacePicker label={tx('Who designs it?')} Icon={Palette} people={designers} value={d.designer_id} onChange={(id) => set({ designer_id: id })} />
          </>
        )}
        {picked === 'out' && (
          <>
            {/* How far ahead this kind of work is usually given — a Telegram post
                two days, a paid ad three, a reel about a week — as one press each. */}
            {quick.length > 0 && (
              <div className="tb-pills tb-quick" role="group" aria-label={tx('When should it go out?')}>
                {quick.map((n) => {
                  const day = addDaysISO(today, n)
                  const rel = n === 0 ? tx('Today') : n === 1 ? tx('Tomorrow') : tx('in {n} days', { n })
                  return (
                    <button key={n} type="button" className={'tb-pill' + (d.release_date === day ? ' on' : '')} aria-pressed={d.release_date === day}
                      disabled={!!d.recording_date && day < d.recording_date} onClick={() => set({ release_date: day })}>
                      {rel.charAt(0).toUpperCase() + rel.slice(1)}
                      {n > 1 && <span className="tb-quick-day">· {dateLabel(day)}</span>}
                    </button>
                  )
                })}
              </div>
            )}
            <MiniCalendar value={d.release_date} onChange={(v) => set({ release_date: v })} today={today} film={d.recording_date} min={d.recording_date || ''} label={tx('When should it go out?')} />
            <p className="tb-date-say" aria-live="polite">
              {d.release_date ? (
                <>
                  <b>{longDayLabel(d.release_date)}</b>
                  {when && <span className="tb-date-away"> · {when}</span>}
                  <button type="button" className="tb-link tb-date-clear" onClick={() => set({ release_date: '' })}>{tx('Clear')}</button>
                </>
              ) : tx('No day picked — it sits on today until you move it.')}
            </p>
          </>
        )}
      </div>
      {owners && <FacePicker label={tx('Whose task is it?')} Icon={UserRound} people={owners} value={d.owner_id} onChange={(id) => set({ owner_id: id })} required />}
    </div>
  )
}
