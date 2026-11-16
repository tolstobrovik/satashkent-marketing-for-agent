// The roster (moved from the edit form): who can take a seat, as faces with how their day stands; the holders of the
// job first, then the rest of the team under "Others" (§2.2, the addendum: anybody can be given the seat in place);
// "Nobody" is the last radio (a tile, not a sentence).
// Keyboard: one roving radiogroup — the arrows MOVE the focus, Enter/Space (a press) picks; it opens on the chosen tile.
import { useEffect, useRef, useState } from 'react'
import { UserX } from 'lucide-react'
import { Face } from '../CoachParts.jsx'
import { jobOf } from '../Sidebar.jsx'
import { tr as tx } from '../../lib/i18n.jsx'
import { useSlots, dayOf } from './slots.js'

// `quiet`: a tile of the rest of the team when the job has holders — its day is not asked (one request a person).
function Tile({ u, on, day, mins, seat, taskId, tabIndex, onPick, quiet = false }) {
  const a = useSlots(seat === 'design' || quiet ? null : u.id, day, 1, mins, taskId)
  const c = dayOf(a, day)
  let st = null
  if (c && seat === 'shoot') {
    if (!c.working) st = { say: tx('Day off'), tone: 'busy' }
    else if (c.slots.length && !c.busy.length) st = { say: tx('Free'), tone: 'free' }
    else if (c.slots.length) st = { say: tx('Free from {t}', { t: c.slots[0].from }), tone: 'part' }
    else st = { say: tx('Full'), tone: 'busy' }
  } else if (c && seat === 'edit') st = c.due.length ? { say: c.due.length === 1 ? tx('1 due that day') : tx('{n} due that day', { n: c.due.length }), tone: 'part' } : { say: tx('Nothing due'), tone: 'free' }
  return (
    <button type="button" role="radio" aria-checked={on} tabIndex={tabIndex} className="tw-pt" data-id={u.id} onClick={() => onPick(u.id)}
      aria-label={`${u.name}, ${jobOf(u)}${st ? `, ${st.say}` : ''}`}>
      <Face person={u} size="md" />
      <span className="tw-pt-t"><b>{u.name}</b><small>{jobOf(u)}</small></span>
      {st && <span className={`tw-st ${st.tone}`}>{st.say}</span>}
    </button>
  )
}

export default function Roster({ team, role, seat, value, onPick, day, mins, taskId, label, disabled }) {
  const tiles = useRef(null)
  const first = team.filter((u) => (u.crew_roles || []).includes(role))
  const rest = team.filter((u) => !(u.crew_roles || []).includes(role) && u.role !== 'ambassador' && u.id !== 0)
  const shown = [...first, ...rest]
  // "Nobody" is there when the seat had somebody when the roster opened.
  const [withNone] = useState(value != null)
  const idx = shown.findIndex((u) => String(u.id) === String(value))
  const [at, setAt] = useState(idx >= 0 ? idx : 0)
  const total = shown.length + (withNone ? 1 : 0)
  useEffect(() => { const r = tiles.current; (r?.querySelector('[role="radio"][aria-checked="true"]') || r?.querySelector('[role="radio"]'))?.focus({ preventScroll: true }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const keys = (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d || !total) return
    e.preventDefault()
    const i = (at + d + total) % total
    setAt(i)
    e.currentTarget.querySelector(i === shown.length ? '[data-id="none"]' : `[data-id="${shown[i].id}"]`)?.focus()
  }
  return (
    <div className="tw-roster">
      <div ref={tiles} className="tw-pts" role="radiogroup" aria-label={label} onKeyDown={keys} aria-disabled={disabled || undefined}>
        {shown.flatMap((u, i) => [
          first.length > 0 && i === first.length && <span key="others" className="tw-pt-sep" role="presentation">{tx('Others')}</span>,
          <Tile key={u.id} u={u} on={String(u.id) === String(value)} day={day} mins={mins} seat={seat} taskId={taskId} tabIndex={i === at ? 0 : -1} onPick={onPick} quiet={first.length > 0 && i >= first.length} />,
        ])}
        {withNone && (
          <button type="button" role="radio" aria-checked={value == null} data-id="none" tabIndex={at === shown.length ? 0 : -1} className="tw-pt tw-pt-none" disabled={disabled}
            onClick={() => onPick(null)} aria-label={`${tx('Nobody')} — ${tx('Leave the seat empty')}`} title={tx('Leave the seat empty')}>
            <span className="tw-none-ic" aria-hidden="true"><UserX size={18} /></span>
            <span className="tw-pt-t"><b>{tx('Nobody')}</b></span>
          </button>
        )}
      </div>
    </div>
  )
}
