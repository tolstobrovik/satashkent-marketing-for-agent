import { useSyncExternalStore } from 'react'

// The crew's "Start here" task, remembered for the phone's bar (P-01): My
// Day works it out (crewDay in lib/coach.js) and says it here; the bar's
// middle button is then "Hand in" and opens that task on its step, from any
// page. Nothing is decided here — My Day reads the day, this only keeps the
// answer between pages. It is left standing when My Day unmounts, so the bar
// does not flicker between search and Hand in on every navigation; the next
// visit to My Day refreshes it.
let current = null
const watchers = new Set()
export const setStartHere = (v) => {
  const next = v ? { id: v.id, kind: v.kind || null } : null
  if ((current?.id || null) === (next?.id || null) && (current?.kind || null) === (next?.kind || null)) return
  current = next
  for (const w of watchers) w()
}
export const useStartHere = () => useSyncExternalStore(
  (w) => { watchers.add(w); return () => watchers.delete(w) },
  () => current,
)
