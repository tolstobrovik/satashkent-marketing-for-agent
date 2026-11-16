// The pieces of the task's plan that are used in place in the task window (task-window-tz.md §2.3) —
// moved out of the edit form (TaskEdit.jsx, 10 Nov 2026), which is gone: a person's days asked once,
// the load of a day, and the hours.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { tr as tx } from '../../lib/i18n.jsx'

export const hh = (v) => String(v || '').slice(0, 5)
export const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m }
export const toHH = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const STARTS = Array.from({ length: 29 }, (_, i) => toHH(7 * 60 + i * 30))   // 07:00 … 21:00
export const QUARTERS = Array.from({ length: 57 }, (_, i) => toHH(7 * 60 + i * 15))  // 07:00 … 21:00, the quarter hour the server keeps
export const lenWords = (m) => (m < 60 ? tx('{n} min', { n: m }) : m % 60 ? tx('{h} h {n} min', { h: Math.floor(m / 60), n: m % 60 }) : tx('{n} h', { n: m / 60 }))
export const WEEK = 7

// GET /users/:id/slots answers a calendar of days: free starts, what is booked, the cuts due.
// Kept per question, so a roster of three faces asks three times and a second look asks nothing.
const SLOTS = new Map()   // key → { answer, waiters }
export function useSlots(id, from, days, mins, exclude) {
  const key = id && from ? `${id}:${from}:${days}:${mins}:${exclude || 0}` : ''
  const [, tick] = useState(0)
  useEffect(() => {
    if (!key) return undefined
    let e = SLOTS.get(key)
    if (!e) {
      e = { answer: null, waiters: new Set() }
      SLOTS.set(key, e)
      api.get(`/users/${id}/slots?from=${from}&days=${days}&mins=${mins}${exclude ? `&exclude=${exclude}` : ''}`)
        .then((a) => { e.answer = a || false }, () => { e.answer = false })
        .then(() => { for (const w of e.waiters) w((n) => n + 1) })
    }
    e.waiters.add(tick)
    if (e.answer != null) tick((n) => n + 1)
    return () => { e.waiters.delete(tick) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return key ? SLOTS.get(key)?.answer || null : null
}
// A booking changed: the days asked before are stale.
export const forgetSlots = () => SLOTS.clear()
export const dayOf = (a, day) => a?.calendar?.find((c) => c.day === day) || null
// How a day stands for the one on the seat (the owner, 10 Nov 2026): the day's SHADE says it, the word is for the
// screen reader and the tooltip. `tone`: free · one · two · many · full · off.
export const loadWords = (c, seat) => {
  if (!c) return null
  if (!c.working) return { say: tx('day off'), tone: 'off' }
  if (seat === 'shoot') {
    const n = c.busy.length
    if (n && !c.slots.length) return { say: tx('full'), tone: 'full' }
    if (n) return { say: n === 1 ? tx('1 shoot') : tx('{n} shoots', { n }), tone: n === 1 ? 'one' : n === 2 ? 'two' : 'many' }
    return { say: tx('free'), tone: 'free' }
  }
  if (seat === 'edit') {
    const n = c.due.length
    return n ? { say: tx('{n} due', { n }), tone: n === 1 ? 'one' : n === 2 ? 'two' : 'many' } : { say: tx('free'), tone: 'free' }
  }
  return null
}
// The free WINDOWS of the one who films that day ("09:00–13:00"): the server's slots step through each gap, so the
// slots that touch are one window. A press takes the window's start.
export const freeWindows = (day) => {
  if (!day?.working) return []
  const slots = [...day.slots].map((s) => ({ from: toMin(hh(s.from)), to: toMin(hh(s.to)) })).sort((a, b) => a.from - b.from)
  const win = []
  for (const s of slots) { const last = win[win.length - 1]; if (last && s.from <= last.to) last.to = Math.max(last.to, s.to); else win.push({ ...s }) }
  return win.slice(0, 4).map((w) => ({ from: toHH(w.from), to: toHH(w.to) }))
}
// A day moved forward pulls the days after it along (the owner, 10 Nov 2026): the edit is never due before the shoot,
// the release never before the edit or the cover. A day moved back moves nothing.
// The edit's day is its live one: the re-promise a late handover wrote (edit_due_revised), else edit_ready_date — the
// server's liveDateField. A release day the server gave (release_born) is never sent: the server moves it along by
// itself and keeps it its own; sending it would make it a day somebody chose (content.js, `release_born = 0`).
export const cascade = (t, k, v) => {
  const n = { [k]: v }
  if (!v) return n
  const cur = { ...t, ...n }
  const edit = t.edit_due_revised ? 'edit_due_revised' : 'edit_ready_date'
  const after = (key, floor) => { if (cur[key] && floor && cur[key] < floor) { n[key] = floor; cur[key] = floor } }
  if (k === 'recording_date') { after(edit, v); after('design_ready_date', v) }
  if (!t.release_born && ['recording_date', 'edit_ready_date', 'edit_due_revised', 'design_ready_date'].includes(k)) {
    const floor = [cur.recording_date, cur[edit], cur.design_ready_date].filter(Boolean).sort().pop()
    after('release_date', floor)
  }
  return n
}
