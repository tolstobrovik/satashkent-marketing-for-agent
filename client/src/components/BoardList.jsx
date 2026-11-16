import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react'
import { StageMark } from './CoachParts.jsx'
import { ACCENT } from './builder/TaskBuilder.jsx'
import { peopleOf } from './ContentFilters.jsx'
import { dateLabel, todayISO, typeInfo, isDeletedLabel } from '../lib/constants.js'
import { useIsPhone } from '../lib/usePhone.js'
import { tr as tx } from '../lib/i18n.jsx'

// ---- the List lens of the channel board (B-03, 31 Oct 2026) ----------------
//
// Admin → Tasks was every open task of every channel as a flat list with a
// trash icon on each row. Here the same rows are a lens of the board itself:
// one table — title, kind, channels, stage, day, who — sorted by any column,
// narrowed by the same Filter as the board, and every row opens the task
// and offers the card's own "…" menu (where Delete is, for whoever may).
// Nothing is decided here: the rows are the board's rows, filtered the same
// way; `dueOf` is the page's own reading of the next promised day.

const COLS = ['title', 'kind', 'channels', 'stage', 'day', 'who']

export default function BoardList({ items, statuses, byKey, teamById, dueOf, onOpen, onMenu }) {
  const phone = useIsPhone()
  const [sort, setSort] = useState({ key: 'day', dir: 1 })
  const today = todayISO()
  const statusesById = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses])
  const stageRank = useMemo(() => Object.fromEntries(statuses.map((s, i) => [s.id, i])), [statuses])
  const first = (id) => (teamById[id]?.name || '').split(' ')[0]
  const whoOf = (t) => peopleOf(t).map(first).filter(Boolean).join(', ')
  const dayOf = (t) => (t.done_at ? t.done_at.slice(0, 10) : dueOf(t) || '')
  const chansOf = (t) => (t.channels || []).map((c) => byKey[c]?.label || c).join(', ')

  const rows = useMemo(() => {
    const live = items.filter((t) => !isDeletedLabel(statusesById[t.status_id]?.label))
    const val = {
      title: (t) => t.title || '',
      kind: (t) => tx(typeInfo(t.type).label),
      channels: chansOf,
      stage: (t) => stageRank[t.status_id] ?? 99,
      day: (t) => dayOf(t) || '9999',   // no day sorts last
      who: whoOf,
    }[sort.key]
    return [...live].sort((a, b) => {
      const x = val(a), y = val(b)
      const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y))
      return (c || (a.title || '').localeCompare(b.title || '')) * sort.dir
    })
  }, [items, sort, statusesById]) // eslint-disable-line react-hooks/exhaustive-deps

  const press = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))
  const LABEL = { title: tx('Title'), kind: tx('Kind'), channels: tx('Channels'), stage: tx('Stage'), day: tx('Day'), who: tx('Who') }
  const dayCell = (t) => {
    const d = dayOf(t)
    if (!d) return <span className="co-lst-none">{tx('No day yet')}</span>
    if (t.done_at) return tx('went out {day}', { day: dateLabel(d) })
    return <span className={d < today ? 'late' : ''}>{dateLabel(d)}</span>
  }
  const dots = (t) => onMenu && (
    <button type="button" className="co-btn co-btn-i co-lst-dots" data-notrack aria-label={tx('More for this task')}
      onClick={(e) => { e.stopPropagation(); onMenu(e, t) }}><MoreHorizontal size={16} aria-hidden="true" /></button>
  )

  if (rows.length === 0) return <p className="co-quiet co-lst-empty">{tx('Nothing on this board matches the filter.')}</p>

  // A phone has no room for six columns: a row is the title, one grey line
  // (kind · stage · day · who) and the "…" — the shape My Day's rows have.
  if (phone) {
    return (
      <div className="co-lst-list" role="list">
        {rows.map((t) => (
          <div key={t.id} className="co-lst-card" role="listitem" style={{ '--k': ACCENT[t.type] || 'var(--type-other)' }}
            onClick={() => onOpen(t)} onContextMenu={onMenu ? (e) => onMenu(e, t) : undefined}>
            <div className="co-lst-card-t">{t.title}</div>
            <div className="co-lst-card-l">
              <span>{tx(typeInfo(t.type).label)}</span>
              <span className="tcard-dot" aria-hidden="true">·</span><StageMark status={statusesById[t.status_id]} />
              <span className="tcard-dot" aria-hidden="true">·</span>{dayCell(t)}
              {whoOf(t) && <><span className="tcard-dot" aria-hidden="true">·</span><span>{whoOf(t)}</span></>}
            </div>
            {dots(t)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <table className="co-lst">
      <thead>
        <tr>
          {COLS.map((c) => (
            <th key={c} scope="col" aria-sort={sort.key === c ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
              <button type="button" onClick={() => press(c)}>
                {LABEL[c]}{sort.key === c && (sort.dir > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
              </button>
            </th>
          ))}
          {onMenu && <th scope="col" className="co-lst-acts"><span className="sr-only">{tx('More for this task')}</span></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className="co-lst-row" style={{ '--k': ACCENT[t.type] || 'var(--type-other)' }}
            onClick={() => onOpen(t)} onContextMenu={onMenu ? (e) => onMenu(e, t) : undefined}>
            <td className="co-lst-t">{t.title}</td>
            <td>{tx(typeInfo(t.type).label)}</td>
            <td className="co-lst-ch">{chansOf(t)}</td>
            <td><StageMark status={statusesById[t.status_id]} /></td>
            <td className="co-lst-d">{dayCell(t)}</td>
            <td>{whoOf(t)}</td>
            {onMenu && <td className="co-lst-acts">{dots(t)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
