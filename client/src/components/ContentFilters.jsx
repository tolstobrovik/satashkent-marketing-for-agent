import { useEffect, useMemo, useRef } from 'react'
import { Filter, X, UserRound } from 'lucide-react'
import { CONTENT_TYPES } from '../lib/constants.js'
import PersonPicker from './PersonPicker.jsx'
import { useAuth } from '../lib/auth.jsx'
import { tr as tx } from '../lib/i18n.jsx'
import { typeInfo } from '../lib/constants.js'

// Narrowing the content workspace: who it belongs to, what kind of thing it
// is, which stage it sits at. One row of plain selects above the board and
// the calendars — whatever is chosen applies to ALL of them at once (board,
// both calendars, the unscheduled tray and a day's agenda), so switching
// views never quietly changes what you are looking at.

export const BLANK_FILTER = { person: '', type: '', stage: '' }

// Everyone a task can belong to — the people picked as assignees plus the
// three crew seats. Filtering by "Anvar" should find the shoots he films and
// the cuts he edits, not only the tasks he was formally handed.
// Who a task was HANDED to. The API sends `assignees` — an array — and keeps
// `assignee_id` as a mirror of the first entry for old clients. Reading the
// mirror finds one person out of two; reading `assignee_ids`, which the API
// has never sent, finds nobody at all. Both mistakes were live in four
// different places, and each looked like "the board does not show my task".
export const assigneesOf = (t) => (
  Array.isArray(t?.assignees) && t.assignees.length ? t.assignees.map(Number)
    : t?.assignee_id ? [Number(t.assignee_id)] : []
)

export const peopleOf = (t) => {
  const ids = assigneesOf(t)
  for (const f of ['operator_id', 'editor_id', 'designer_id']) if (t[f]) ids.push(t[f])
  return [...new Set(ids)]
}

export function matchesFilter(t, f) {
  if (f.type && t.type !== f.type) return false
  if (f.stage && String(t.status_id) !== String(f.stage)) return false
  if (f.person) {
    const ids = peopleOf(t)
    if (f.person === 'none') return ids.length === 0
    if (!ids.includes(Number(f.person))) return false
  }
  return true
}

export const filterIsOn = (f) => !!(f.person || f.type || f.stage)

// B-01: what is chosen, as one line under the headline — "Mine · Reel · Editing · showing 9 of 25 · Clear".
export function FilterSummary({ filter, onChange, items, shown, statuses, teamById }) {
  const { user } = useAuth()
  if (!filterIsOn(filter)) return null
  const person = filter.person === '' ? '' : filter.person === 'none' ? tx('Nobody yet')
    : String(filter.person) === String(user.id) ? tx('Mine') : (teamById[Number(filter.person)]?.name || '').split(' ')[0]
  const type = filter.type ? tx(typeInfo(filter.type).label) : ''
  const stage = filter.stage ? tx(statuses.find((s) => String(s.id) === String(filter.stage))?.label || '') : ''
  return (
    <p className="cf-sum" role="status">
      <span>{[person, type, stage].filter(Boolean).join(' · ')}</span>
      <span className="cf-dot" aria-hidden="true">·</span>
      <span>{tx('showing {n} of {of}', { n: shown, of: items.length })}</span>
      <button type="button" className="co-link" onClick={() => onChange({ ...BLANK_FILTER })}>{tx('Clear')}</button>
    </p>
  )
}

export default function ContentFilters({ filter, onChange, items, shown, statuses, teamById, popover = false, onClose = null }) {
  const { user } = useAuth()
  // Only offer people who actually appear on this channel's work — an empty
  // menu of forty names helps nobody.
  const people = useMemo(() => {
    const seen = new Set()
    for (const t of items) for (const id of peopleOf(t)) seen.add(id)
    if (filter.person && filter.person !== 'none') seen.add(Number(filter.person)) // keep the current choice pickable
    return [...seen]
      .map((id) => ({ id, name: teamById[id]?.name || `#${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items, teamById, filter.person])
  // Same for types and stages: show what this channel really uses.
  const types = useMemo(() => {
    const seen = new Set(items.map((t) => t.type))
    return CONTENT_TYPES.filter((c) => seen.has(c.key) || c.key === filter.type)
  }, [items, filter.type])
  const stages = useMemo(() => {
    const seen = new Set(items.map((t) => String(t.status_id)))
    return statuses.filter((s) => seen.has(String(s.id)) || String(s.id) === String(filter.stage))
  }, [items, statuses, filter.stage])

  const on = filterIsOn(filter)
  const set = (patch) => onChange({ ...filter, ...patch })
  // "Only mine" is the choice people make most, and finding your own name in
  // a menu of forty is the slowest way to make it. One switch, and it is the
  // same person filter underneath — so it clears with everything else.
  const onlyMine = String(filter.person) === String(user.id)

  // '' is "anyone"; 'none' is the pseudo-person "nobody yet"; anything else
  // is a real id, and the picker matches on the id's own type.
  const personValue = filter.person === '' ? null : (filter.person === 'none' ? 'none' : Number(filter.person))

  // B-01: the same four questions as chips, in a small window under the
  // Filter button; Esc and a click outside close it.
  const pop = useRef(null)
  useEffect(() => {
    if (!popover) return undefined
    const away = (e) => { if (!pop.current?.contains(e.target) && !e.target.closest?.('.cf-popwrap > button')) onClose?.() }
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', key, true) }
  }, [popover]) // eslint-disable-line react-hooks/exhaustive-deps
  if (popover) {
    const chip = (key, sel, label, onPick) => (
      <button key={key} type="button" className={'co-chip' + (sel ? ' sel' : '')} aria-pressed={sel} onClick={onPick}>{label}</button>
    )
    return (
      <div className="cf-pop" ref={pop} role="dialog" aria-label={tx('Filter')}>
        <div className="cf-pop-q">
          <b>{tx('Whose')}</b>
          <div className="cf-chips">
            {chip('mine', onlyMine, tx('Mine'), () => set({ person: onlyMine ? '' : String(user.id) }))}
            {chip('none', filter.person === 'none', tx('Nobody yet'), () => set({ person: filter.person === 'none' ? '' : 'none' }))}
            {people.filter((p) => String(p.id) !== String(user.id)).slice(0, 8).map((p) => chip(p.id, String(filter.person) === String(p.id), p.name.split(' ')[0], () => set({ person: String(filter.person) === String(p.id) ? '' : String(p.id) })))}
            {people.length > 9 && (
              <PersonPicker className="cf-person" value={personValue} placeholder={tx('Someone else…')}
                groups={[{ label: '', people: people.map((p) => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar })) }]}
                onPick={(id) => set({ person: id === null ? '' : String(id) })} />
            )}
          </div>
        </div>
        <div className="cf-pop-q">
          <b>{tx('Kind')}</b>
          <div className="cf-chips">
            {chip('any', !filter.type, tx('Any type'), () => set({ type: '' }))}
            {types.map((c) => chip(c.key, filter.type === c.key, tx(c.label), () => set({ type: filter.type === c.key ? '' : c.key })))}
          </div>
        </div>
        <div className="cf-pop-q">
          <b>{tx('Stage')}</b>
          <div className="cf-chips">
            {chip('any', !filter.stage, tx('Any stage'), () => set({ stage: '' }))}
            {stages.map((st) => chip(st.id, String(filter.stage) === String(st.id), tx(st.label), () => set({ stage: String(filter.stage) === String(st.id) ? '' : String(st.id) })))}
          </div>
        </div>
        <div className="co-btns">
          {on && <button type="button" className="co-btn co-btn-q co-btn-sm" onClick={() => onChange({ ...BLANK_FILTER })}>{tx('Clear')}</button>}
          <button type="button" className="co-btn co-btn-t co-btn-sm" onClick={() => onClose?.()}>{tx('Done')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className={'cf-bar' + (on ? ' on' : '')}>
      <Filter size={13} className="cf-icon" />
      <button className={'cf-mine' + (onlyMine ? ' active' : '')}
        onClick={() => set({ person: onlyMine ? '' : String(user.id) })}
        data-tip={onlyMine ? tx('Show everyone’s work again') : tx('Only the work you are on')} aria-pressed={onlyMine}>
        <UserRound size={12} /> {tx('Mine')}
      </button>
      {/* Typing a name here used to JUMP: a select's type-ahead moves the
          highlight to the first match and forgets the letter. On a board with
          twenty people that is the wrong behaviour — what everybody expects is
          for the list to get SHORTER. So it does. */}
      <PersonPicker
        className="cf-person"
        value={personValue}
        placeholder={tx('Anyone')}
        tip={tx("Only work this person is on — assigned, filming, editing or designing")}
        groups={[
          { label: '', people: [{ id: 'none', name: tx('Nobody yet') }] },
          { label: '', people: people.map((p) => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar })) },
        ].filter((g) => g.people.length > 0)}
        onPick={(id) => set({ person: id === null ? '' : String(id) })}
      />
      <select className="select cf-sel" value={filter.type} onChange={(e) => set({ type: e.target.value })}
        data-tip={tx("Only one kind of content")} aria-label={tx("Only one kind of content")}>
        <option value="">{tx("Any type")}</option>
        {types.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <select className="select cf-sel" value={filter.stage} onChange={(e) => set({ stage: e.target.value })}
        data-tip={tx("Only one stage of the pipeline")} aria-label={tx("Only one stage of the pipeline")}>
        <option value="">{tx("Any stage")}</option>
        {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      {on && (
        <>
          <span className="cf-count">showing {shown} of {items.length}</span>
          <button className="cf-clear" onClick={() => onChange({ ...BLANK_FILTER })} data-tip={tx("Show everything again")}>
            <X size={12} /> Clear
          </button>
        </>
      )}
    </div>
  )
}
