import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { toast } from '../lib/toast.js'
import { tr as tx } from '../lib/i18n.jsx'
import { Section, Rows, Row, MoreRows, DayNote, dayShort } from './CoachParts.jsx'

// ---- the day moves waiting on an admin's answer (myday-tz §2.1.2, item 3) --------
//
// "Waiting on your answer · {n}": every open ask is a row of its own — the
// title, one grey line ("Dilnoza: Tue 10 Nov → Fri 20 Nov · The footage came
// in late") and the two answers on the row's right x: Move it (tonal, the
// admin's own in-place act) and Keep it (the quiet ghost). Round 14's ruby
// strip and its filled "Answer" are gone: the page has one ruby fill, the
// start-here card's (R20). Three rows, then "Show all {n}".
//
// After an answer the row leaves and focus moves on — to the next ask's
// door, else to the next section's heading — never to <body> (§2.5). The
// toast is plain: the server keeps no undo for a decided ask (§3.6).
//
// A failed read is said, never passed off as "nobody waits on you" (R24).
//
// The asks are read once for the page (useAdminAsks), because the start-here
// card takes the oldest of them first (adminFirst in lib/coach.js); the ask in
// the card is left out of this list by the caller.

// The asks' channels come as the database's JSON text.
export const chansOfAsk = (a) => {
  if (Array.isArray(a?.channels)) return a.channels
  try { const c = JSON.parse(a?.channels || '[]'); return Array.isArray(c) ? c : [] } catch { return [] }
}
const hhmm = (t) => String(t || '').slice(0, 5)
// The kind of work the asked day belongs to: the colour of the row.
export const kindOfAsk = (a) => ({ recording_date: 'shoot', edit_ready_date: 'edit', design_ready_date: 'design', release_date: 'send' }[a?.field] || 'idea')
// "Dilnoza: Tue 10 Nov → Fri 20 Nov, 15:00 · The footage came in late" — the name after a colon.
export const askLine = (a) => `${String(a.asked_name || '').split(' ')[0] || tx('Someone')}: ${dayShort(a.from_date)} → ${dayShort(a.to_date)}${a.to_time ? `, ${hhmm(a.to_time)}` : ''}${a.reason ? ` · ${a.reason}` : ''}`

export function useAdminAsks() {
  const [asks, setAsks] = useState([])
  const [err, setErr] = useState('')
  const [settled, setSettled] = useState(false)
  const load = useCallback(() => api.get('/content/date-requests/open')
    .then((d) => { if (Array.isArray(d)) setAsks(d); setErr('') })
    .catch((e) => setErr(e?.message || 'error'))
    .finally(() => setSettled(true)), [])
  useEffect(() => {
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, 30000)
    return () => clearInterval(id)
  }, [load])
  // The answer; the caller moves focus. Throws on a refusal (the caller says it).
  const answer = useCallback(async (a, approve) => {
    await api.post(`/content/date-requests/${a.id}/decide`, { approve })
    setAsks((prev) => prev.filter((x) => x.id !== a.id))
    toast(approve ? tx('Moved — they hear it right away') : tx('Kept where it was — they hear why'))
  }, [])
  return { asks, err, settled, load, answer }
}

const FIRST = 3

//   asks     the open asks to list (the channel's, the card's own left out)
//   err      the read failed: one quiet line with "Try again"
//   onRetry  reads them again
//   answer   (ask, approve) → Promise (useAdminAsks' answer)
//   onOpen   (content_id) → the task window
//   afterId  the id of the next section's h2: where focus goes after the last answer
export default function AdminAsks({ asks, err = '', onRetry, answer, onOpen, afterId = '' }) {
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(null)
  const pending = useRef(null)
  // Focus moves once the row has left (the list re-rendered without it).
  useLayoutEffect(() => {
    if (!pending.current) return
    const el = document.getElementById(pending.current.id)
    const target = el && (pending.current.door ? el.querySelector('.co-row-b') : el)
    if (target) { target.focus(); pending.current = null }
  })
  if (err && !asks.length) return <DayNote kind="side" text={tx('Could not check who waits on you')} onRetry={onRetry} />
  if (!asks.length) return null

  const shown = all ? asks : asks.slice(0, FIRST)
  const press = async (a, approve) => {
    if (busy) return
    const i = asks.indexOf(a)
    const next = asks[i + 1] || asks[i - 1]
    setBusy(a.id)
    try {
      await answer(a, approve)
      pending.current = next ? { id: `co-ad-ask-${next.id}`, door: true } : afterId ? { id: afterId, door: false } : null
      // With "Show all" shut, the next ask may be past the first three: open them.
      if (next && asks.indexOf(next) >= FIRST) setAll(true)
    } catch (e) { toast(e.message, 'err') } finally { setBusy(null) }
  }
  return (
    <Section id="co-ad-asks-h" label={tx('Waiting on your answer')} n={asks.length} className="co-ad-asks2">
      <Rows id="co-ad-asks-l">
        {shown.map((a) => (
          <Row key={a.id} id={`co-ad-ask-${a.id}`} kind={kindOfAsk(a)} title={a.title} onOpen={() => onOpen(a.content_id)}
            line={askLine(a)} className="co-ad-askrow"
            action={(
              <>
                {/* aria-disabled, not disabled: the pressed button keeps focus until the row leaves. */}
                <button type="button" className="co-btn co-btn-t co-btn-sm" aria-disabled={busy === a.id || undefined}
                  aria-label={tx('Move it: «{title}»', { title: a.title })} onClick={() => press(a, true)}>{tx('Move it')}</button>
                <button type="button" className="co-btn co-btn-g co-btn-sm" aria-disabled={busy === a.id || undefined}
                  aria-label={tx('Keep it: «{title}»', { title: a.title })} onClick={() => press(a, false)}>{tx('Keep it')}</button>
              </>
            )} />
        ))}
      </Rows>
      {asks.length > FIRST && <MoreRows open={all} onToggle={() => setAll(!all)} controls="co-ad-asks-l" n={asks.length} />}
      {err && <DayNote kind="side" text={tx('Could not check who waits on you')} onRetry={onRetry} />}
    </Section>
  )
}

