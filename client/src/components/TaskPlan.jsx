// ---- the plan of a task: one row per stop, each value its own field (task-window-tz.md §2.3) ----------------
//
// The owner (12 Nov 2026): whoever may change a thing changes it where they read it. The plan is a block of the
// window, always open, for everybody: one row per stop of the piece — the shoot, the edit, the cover, the day it
// goes out — each with its kind's tile, its word, the person on it and the day (and, for the shoot, the hours).
// The person and the day are each their own small form (lib/mayChange.js says who may): a press opens, UNDER the
// row, the edit form's own pieces used in place — the roster of faces, the strip of days with each day's load, the
// one time box and the free windows of whoever films — one at a time. A day pressed is saved at once, the days
// after it pulled along (`cascade`), one PATCH; a double booking opens the clash window (Book anyway). A promised day
// a person may only ask about opens "Ask to move · reason" in the same place; an admin sees an open ask at the row —
// the day struck through, the asked one beside it — and answers it there. Whoever may not change a value reads it.
// Each value is its own field (§2.2, §2.6): the value in flight is drawn at half strength, a refusal keeps the old one
// with the ring and the server's sentence at the row, and after a commit or a cancel the focus goes back to the button
// that opened the row (the Plan heading if the row has gone).
import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Scissors, Palette, Send, X, Check, UserPlus, Plus, Clock } from 'lucide-react'
import DayPick from './DayPick.jsx'
import { Face, firstName, dayShort, lateWords } from './CoachParts.jsx'
import { useClash } from './ClashDialog.jsx'
import DayStrip from './edit/DayStrip.jsx'
import Roster from './edit/Roster.jsx'
import TimeBox from './edit/TimeBox.jsx'
import AskDay from './edit/AskDay.jsx'
import { useSlots, dayOf, loadWords, hh, toMin, cascade, STARTS, WEEK } from './edit/slots.js'
import { addDaysISO } from '../lib/constants.js'
import { api } from '../lib/api.js'
import { editDue } from '../lib/due.js'
import { makeDone, daysBetween } from '../lib/coach.js'
import { toast } from '../lib/toast.js'
import { tr as tx } from '../lib/i18n.jsx'

export default function TaskPlan({ t, label = '', making, team = [], today, byKey = {}, may = () => false, onPatch, onAnswered, isAdmin = false, runsName = '', askField = '', draft = false, only = null }) {
  // the calendar's 'Ask to move' opens the window with that day's row open: its strip, or its ask
  const ROW_OF = { recording_date: 'shoot', edit_ready_date: 'edit', design_ready_date: 'design', release_date: 'out' }
  const [open, setOpen] = useState(() => (askField && ROW_OF[askField] && may(askField) ? { row: ROW_OF[askField], what: may(askField) === 'ask' ? 'ask' : 'day' } : null))   // { row, what: 'seat' | 'day' | 'ask' }
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)              // the guard a press reads at once (the state lags a render)
  const [err, setErr] = useState(null)        // { row, what, text }
  const [pending, setPending] = useState(null) // { row, what, body }: the value on its way, drawn at half strength
  const askOnce = useRef(false)
  const askMay = askField ? may(askField) : false
  useEffect(() => { if (askField && ROW_OF[askField] && askMay && !askOnce.current) { askOnce.current = true; setOpen({ row: ROW_OF[askField], what: askMay === 'ask' ? 'ask' : 'day' }) } }, [askMay]) // eslint-disable-line react-hooks/exhaustive-deps
  const [clashUi, askClash] = useClash()
  const person = (id) => team.find((u) => u.id === id) || null
  // what the rows draw: the task with the value in flight laid over it
  const v = pending ? { ...t, ...pending.body } : t

  // Focus (§2.6): the read-view buttons by `${row}:seat` / `${row}:day`; a commit or a cancel gives the focus back to
  // the one that opened the row, or to the Plan heading when the row has gone — never to the page.
  const list = useRef(null)
  const btns = useRef({})
  const back = useRef(null)
  const btnRef = (key) => (el) => { btns.current[key] = el }
  const focusBack = (key) => {
    const a = document.activeElement
    // the person went elsewhere (the clash window, closing over a row it saved, is not elsewhere)
    if (a && a !== document.body && a.isConnected && !list.current?.contains(a) && !a.closest('[role="alertdialog"]')) return
    const el = key && btns.current[key]
    if (el?.isConnected) { el.focus(); return }
    const h = list.current?.closest('.tw-plan-blk')?.querySelector('.tw-bh h3')
    if (h) { h.tabIndex = -1; h.focus() }
  }
  const close = () => { if (open) back.current = `${open.row}:${open.what === 'seat' ? 'seat' : 'day'}`; setOpen(null) }
  useEffect(() => {
    if (open || !back.current) return
    const k = back.current; back.current = null
    focusBack(k)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  // On a phone the strip or the picker opened under a row is scrolled into sight (§2.8) — once it has unfolded.
  useEffect(() => {
    if (!open || !window.matchMedia?.('(max-width: 640px)').matches) return undefined
    const el = list.current?.querySelector(`[data-row="${open.row}"] .tw-pr-open`)
    if (!el) return undefined
    const go = () => el.scrollIntoView({ block: 'nearest' })
    const f = requestAnimationFrame(go)
    el.addEventListener('transitionend', go, { once: true })
    return () => { cancelAnimationFrame(f); el.removeEventListener('transitionend', go) }
  }, [open?.row, open?.what]) // eslint-disable-line react-hooks/exhaustive-deps

  // the loads under the strip's days, for the days the strip shows (DayStrip: from the stop before, never before today)
  const len = t.recording_time && t.recording_end ? toMin(hh(t.recording_end)) - toMin(hh(t.recording_time)) : 60
  const editFrom = v.recording_date && v.recording_date > today ? v.recording_date : today
  const opA = useSlots(open?.row === 'shoot' && making?.filmed ? t.operator_id : null, today, WEEK + 1, len, t.id)
  const edA = useSlots(open?.row === 'edit' ? t.editor_id : null, editFrom, WEEK + 1, 60, t.id)
  // a shoot booked past the strip still shows its free windows under the hours
  const farShoot = !!v.recording_date && v.recording_date > addDaysISO(today, WEEK)
  const shA = useSlots(open?.row === 'shoot' && making?.filmed && farShoot ? t.operator_id : null, v.recording_date, 1, len, t.id)
  const shootDay = dayOf(opA, v.recording_date) || dayOf(shA, v.recording_date)

  // one PATCH; a double booking asks first (the clash window, Book anyway → force). The focused control stays
  // pressable while its own save runs (disabling it would drop the focus to the page): a second press waits here.
  const whatOf = (field) => (field === 'recording_time' || field === 'release_time' ? 'time' : /_id$/.test(field) ? 'seat' : 'day')
  const save = async (body, row, field, { keep = false } = {}) => {
    if (inFlight.current) return
    const what = whatOf(field)
    inFlight.current = true
    setBusy(true); setErr(null); setPending({ row, what, body })
    const go = async (extra = {}) => { await onPatch({ ...body, ...extra }, field); if (!keep) close() }
    try { await go() } catch (e) {
      // Book anyway reports its own outcome: a forced save refused for another reason is said at the row
      const again = () => { setPending({ row, what, body }); return go({ force: true }).catch((e2) => setErr({ row, what, text: e2.message })).finally(() => setPending(null)) }
      if (!askClash(e, again)) setErr({ row, what, text: e.message })
    } finally { inFlight.current = false; setBusy(false); setPending(null) }
  }

  // the Goes-out row is the day it goes out: release_date, shown and written (a review's re-promise is not it)
  const out = v.release_date || null
  // the edit's live day is its re-promise when a late handover wrote one (the server's liveDateField): shown AND
  // written there, so a pressed day is the day the row then reads; asks and who-may stay under edit_ready_date
  const editField = t.edit_due_revised ? 'edit_due_revised' : 'edit_ready_date'
  const chans = (t.channels || []).map((c) => byKey[c]?.label || c).join(', ')
  const rows = []
  if (making?.filmed) {
    rows.push({ k: 'shoot', Icon: Clapperboard, cls: 'co-k-shoot', word: tx('Shoot'), q: tx('Who films it?'), seat: 'operator_id', role: 'operator',
      day: v.recording_date, dayField: 'recording_date', askF: 'recording_date', time: v.recording_time ? `${hh(v.recording_time)}${v.recording_end ? `–${hh(v.recording_end)}` : ''}` : '', done: !!t.shot_at })
  }
  if (making && !making.written && !making.repost && (making.filmed || !making.designed || t.editor_id)) {
    rows.push({ k: 'edit', Icon: Scissors, cls: 'co-k-cut', word: tx('Edit'), q: tx('Who edits it?'), seat: 'editor_id', role: 'editor',
      day: editDue(v), dayField: editField, askF: 'edit_ready_date', done: makeDone(t, label, 'editor') })
  }
  const coverWanted = !!(making?.designed || t.designer_id || t.design_ready_date)
  if (making && !making.written && !making.repost) {
    rows.push({ k: 'design', Icon: Palette, cls: 'co-k-art', word: making.filmed ? tx('Cover') : tx('Artwork'), q: making.filmed ? tx('Who makes the cover?') : tx('Who makes the artwork?'),
      seat: 'designer_id', role: 'designer', day: v.design_ready_date, dayField: 'design_ready_date', askF: 'design_ready_date', done: makeDone(t, label, 'designer'), ghost: !coverWanted })
  }
  rows.push({ k: 'out', Icon: Send, cls: 'co-k-good', word: tx('Goes out'), whoText: chans, day: out, dayField: 'release_date', askF: 'release_date', done: !!t.done_at })

  const late = (r) => !r.done && !!r.day && r.day < today
  const asks = (t.date_requests || []).filter((r) => r.state === 'open')
  const askOf = (field) => asks.find((r) => r.field === field) || null
  const decide = async (rq, row, approve, force = false) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const o = await api.post(`/content/date-requests/${rq.id}/decide`, { approve, ...(force ? { force: true } : {}) })
      toast(approve ? tx('Moved — {name} is told', { name: (rq.asked_name || '').split(' ')[0] }) : tx('Kept — {name} is told', { name: (rq.asked_name || '').split(' ')[0] }))
      onAnswered?.(o?.task || null)
      focusBack(`${row}:day`)   // the answer leaves with the ask; the row's day is where it was read
    } catch (e) { if (!askClash(e, () => decide(rq, row, approve, true))) toast(e.message, 'err') } finally { inFlight.current = false; setBusy(false) }
  }
  const toggle = (row, what) => { setErr(null); setOpen(open?.row === row && open?.what === what ? null : { row, what }) }
  // F2 opens a read view, as in the window's other fields (Enter and Space press the button)
  const f2 = (row, what) => (e) => { if (e.key === 'F2') { e.preventDefault(); toggle(row, what) } }
  const escClose = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
  // a value people try to change and may not: one line says whose it is to change
  const whoseTip = runsName ? tx('Changed by whoever runs it: {name}', { name: runsName }) : undefined

  return (
    <>
      <ol ref={list} className="tw-plan" aria-label={tx('Plan')}>
        {(only ? rows.filter((r) => only.includes(r.k)) : rows).map((r) => {
          const seatMay = r.seat ? may(r.seat) : false
          const dayMay = may(r.askF)
          const u = r.seat ? person(t[r.seat]) : null
          const isOpen = open?.row === r.k
          const rq = askOf(r.askF)
          const inRow = pending?.row === r.k ? pending.what : ''
          const seatBusy = !!pending && !!r.seat && pending.body[r.seat] !== undefined
          const dayBusy = !!pending && (pending.body[r.dayField] !== undefined || (r.k === 'shoot' && pending.body.recording_time !== undefined))
          const seatBad = err?.row === r.k && err.what === 'seat'
          const dayBad = err?.row === r.k && err.what === 'day'
          // the cover before anybody is on it: a ghost row, pressed to give it a person
          if (r.ghost) {
            if (!seatMay) return null
            return (
              <li key={r.k} className={`tw-pr tw-pr-${r.k} tw-pr-ghost`} data-row={r.k}>
                <div className="tw-pr-line">
                  <span className={`co-kic ${r.cls}`} aria-hidden="true"><r.Icon size={16} /></span>
                  <div className="tw-pr-vals">
                    <button ref={btnRef(`${r.k}:seat`)} type="button" className={'tw-rv tw-plv' + (seatBad ? ' tw-bad' : '')} aria-expanded={isOpen && open.what === 'seat'}
                      onClick={() => toggle(r.k, 'seat')} onKeyDown={f2(r.k, 'seat')}
                      aria-label={`${r.word}: ${tx('nobody yet')}`}><Plus size={16} aria-hidden="true" /><span className="tw-pr-w">{r.word}</span></button>
                  </div>
                </div>
                {isOpen && open.what === 'seat' && (
                  <div className="tw-pr-open"><div><div className="tw-pr-ed" data-busy={inRow || undefined} onKeyDown={escClose}>
                    <Roster team={team} role={r.role} seat="design" value={v[r.seat] ?? null} day={v.design_ready_date || today} mins={60} taskId={t.id} label={r.q}
                      onPick={(id) => save({ [r.seat]: id }, r.k, r.seat)} />
                    {err?.row === r.k && <p className="tw-f-err" role="alert">{err.text}</p>}
                    <div className="tw-pr-edbar">
                      <span>{r.q}</span>
                      <button type="button" className="tw-cx" aria-label={tx('Close')} onClick={close}><X size={16} aria-hidden="true" /></button>
                    </div>
                  </div></div></div>
                )}
              </li>
            )
          }
          const dayWords = r.day ? `${dayShort(r.day)}${r.time ? `, ${r.time}` : ''}` : r.k === 'shoot' ? tx('Book a time') : tx('Set a day')
          const lateW = late(r) ? lateWords(daysBetween(r.day, today)) : ''
          const seatName = u ? firstName(u) : tx('Nobody yet')
          const seatEl = r.whoText != null ? <span className="tw-plv">{r.whoText || '—'}</span>
            : seatMay
              ? <button ref={btnRef(`${r.k}:seat`)} type="button" className={'tw-rv tw-plv' + (u ? '' : ' is-empty') + (seatBusy ? ' is-busy' : '') + (seatBad ? ' tw-bad' : '')}
                aria-expanded={isOpen && open.what === 'seat'} onClick={() => toggle(r.k, 'seat')} onKeyDown={f2(r.k, 'seat')}
                aria-label={`${r.q.replace(/\?$/, '')}: ${u ? firstName(u) : tx('Assign')}`}>{u ? <Face person={u} size="xs" /> : <UserPlus size={16} aria-hidden="true" />}<span>{u ? firstName(u) : tx('Assign')}</span></button>
              : <span className={'tw-plv' + (u ? '' : ' is-empty')} title={whoseTip}>{u && <Face person={u} size="xs" />}{seatName}</span>
          // an open ask: the day struck through, the asked one beside it — for an admin too, beside the button they
          // open the strip from, so "Approve new date" says which day it approves
          const propEl = rq && <span className="tw-pr-prop">{dayMay !== true && <s>{r.day ? dayShort(r.day) : '—'}</s>}<b>{rq.to_date ? dayShort(rq.to_date) : tx('cleared')}</b><span className="tw-rv-empty">{tx('asked')}</span></span>
          const dayText = <>{r.k === 'shoot' && r.time ? <Clock size={14} aria-hidden="true" /> : null}{dayWords}{lateW ? ` · ${lateW}` : ''}</>
          const dayEl = rq && dayMay !== true ? propEl : (
            <>
              {dayMay
                ? <button ref={btnRef(`${r.k}:day`)} type="button" className={'tw-rv tw-plv' + (lateW ? ' is-late' : '') + (r.day ? '' : ' is-empty') + (dayBusy ? ' is-busy' : '') + (dayBad ? ' tw-bad' : '')}
                  aria-expanded={isOpen && open.what !== 'seat'}
                  onClick={() => toggle(r.k, dayMay === 'ask' ? 'ask' : 'day')} onKeyDown={f2(r.k, dayMay === 'ask' ? 'ask' : 'day')}
                  aria-label={`${r.word}: ${dayWords}${lateW ? `, ${lateW}` : ''}${dayMay === 'ask' ? ` — ${tx('press to ask to move')}` : ''}`}>
                  {rq ? <s>{dayText}</s> : dayText}</button>
                : <span className={'tw-plv' + (lateW ? ' is-late' : '') + (r.day ? '' : ' is-empty')} title={whoseTip}>{dayWords}{lateW ? ` · ${lateW}` : ''}</span>}
              {rq && propEl}
            </>
          )
          return (
            <li key={r.k} className={`tw-pr tw-pr-${r.k}`} data-row={r.k}>
              <div className="tw-pr-line">
                <span className={`co-kic ${r.cls}`} aria-hidden="true"><r.Icon size={16} /></span>
                <div className="tw-pr-vals">
                  <span className="tw-pr-w">{r.done && <Check size={14} aria-hidden="true" className="tw-pr-tick" />}{r.word}</span>
                  {seatEl}
                  {dayEl}
                </div>
              </div>
              {/* an admin answers an open ask on the row */}
              {rq && isAdmin && (
                <div className="tw-pr-ed tw-pr-ask">
                  <span className="tw-rv-empty">“{rq.reason}” — {(rq.asked_name || '').split(' ')[0]}</span>
                  <span className="co-btns"><button type="button" className="co-btn co-btn-t co-btn-sm" aria-disabled={busy || undefined} onClick={() => decide(rq, r.k, true)}><Check size={16} aria-hidden="true" />{tx('Approve new date')}</button>
                  <button type="button" className="co-btn co-btn-q co-btn-sm" aria-disabled={busy || undefined} onClick={() => decide(rq, r.k, false)}>{tx('Keep current date')}</button></span>
                </div>
              )}
              {isOpen && (
                <div className="tw-pr-open"><div>
                  <div className="tw-pr-ed" data-busy={inRow || undefined} onKeyDown={escClose}>
                    {open.what === 'seat' && (
                      <Roster team={team} role={r.role} seat={r.k === 'shoot' ? 'shoot' : r.k === 'edit' ? 'edit' : 'design'} value={v[r.seat] ?? null}
                        day={r.day || today} mins={r.k === 'shoot' ? len : 60} taskId={t.id} label={r.q}
                        onPick={(id) => { if (id === (t[r.seat] ?? null)) { close(); return } save({ [r.seat]: id }, r.k, r.seat) }} />
                    )}
                    {open.what === 'day' && (r.k === 'out' && (t.done_at || making?.written) ? (
                      // a day with nothing after it: the month, in place
                      <DayPick value={r.day || ''} min={t.done_at ? '' : today} past={!!t.done_at} startOpen label={r.word} placeholder={tx('Pick a day')} onChange={(d) => { if (d && d !== r.day) save({ release_date: d }, r.k, 'release_date') }} />
                    ) : (
                      <>
                        <DayStrip value={r.day || ''} today={today} label={r.word} autoFocus bad={dayBad} f={r.askF}
                          from={r.k === 'edit' || r.k === 'design' ? (v.recording_date || '') : r.k === 'out' ? ([v.recording_date, editDue(v), v.design_ready_date].filter(Boolean).sort().pop() || '') : ''}
                          film={r.k !== 'shoot' ? (v.recording_date || '') : ''}
                          load={r.k === 'shoot' && t.operator_id ? (d) => loadWords(dayOf(opA, d), 'shoot') : r.k === 'edit' && t.editor_id ? (d) => loadWords(dayOf(edA, d), 'edit') : null}
                          onChange={(d) => { if (d !== r.day) save(cascade(t, r.dayField, d), r.k, r.askF, { keep: r.k === 'shoot' }) }} />
                        {r.k === 'shoot' && may('recording_time') && (
                          <TimeBox start={hh(v.recording_time)} end={hh(v.recording_end)} shootDay={shootDay} bad={err?.row === r.k && err.what === 'time'}
                            onChange={(body) => save(body, r.k, 'recording_time', { keep: true })} />
                        )}
                        {r.k === 'out' && may('release_time') && (
                          <label className={'tw-range' + (err?.row === r.k && err.what === 'time' ? ' tw-bad' : '')}><Clock size={16} aria-hidden="true" />
                            <select className="tw-rsel" aria-label={tx('At')} value={hh(v.release_time)} onChange={(e) => save({ release_time: e.target.value || null }, r.k, 'release_time', { keep: true })}>
                              <option value="">—</option>
                              {(v.release_time && !STARTS.includes(hh(v.release_time)) ? [hh(v.release_time), ...STARTS].sort() : STARTS).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </label>
                        )}
                      </>
                    ))}
                    {open.what === 'ask' && (
                      <AskDay t={t} field={r.askF} today={today} label={r.word} onClose={close} onMoved={(u2) => onAnswered?.(u2)} />
                    )}
                    {err?.row === r.k && <p className="tw-f-err" role="alert">{err.text}</p>}
                    {open.what !== 'ask' && (
                      <div className="tw-pr-edbar">
                        <span>{open.what === 'seat' ? r.q : draft ? tx('Kept in the draft until Create') : tx('A day pressed is saved')}</span>
                        <button type="button" className="tw-cx" aria-label={tx('Close')} onClick={close}><X size={16} aria-hidden="true" /></button>
                      </div>
                    )}
                  </div>
                </div></div>
              )}
            </li>
          )
        })}
      </ol>
      {clashUi}
    </>
  )
}
