import { useEffect, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Upload } from 'lucide-react'
import {
  KIND, Badge, CrewBadge, Empty, KindMark, ownOf, StartHere,
  firstName, dayInLine, dayShort, hoursOf,
  DayHead, Rows, Row, SecHead, MoreRows, Fold,
} from './CoachParts.jsx'
import { Capsule, Frame, DayChip } from './CoachBits.jsx'
import { timelineOf } from './Timeline.jsx'
import { api } from '../lib/api.js'
import { typeLabel, serverNow } from '../lib/constants.js'
import { ownersOf, daysBetween } from '../lib/coach.js'
import { toast } from '../lib/toast.js'
import { usePieceColors, colorStyle } from '../lib/pieceColor.js'
import { tr as tx } from '../lib/i18n.jsx'
import { isCarried, carriedFrom, monthLongOf } from '../lib/planMonth.js'
import '../styles-myday-crew.css'

// ---- the crew's day, the Coach way -------------------------------------------------
//
// From the top:
//
//   the headline      "{name}, start here." (DayHead), then the stale note when
//                     a refresh failed (Brief passes it as `note`)
//   Now               (round 14, the owner's pick: Jobber) the first task that
//                     can be done, lifted out of the list: what it is, why it is
//                     first, the line of stops with the stop it is on said in
//                     one full sentence, and ONE ruby button that says what its
//                     press does — "Hand in the edit" — opening the task window
//                     at the hand-in. The title is the card's one door. A shoot
//                     in its hours is Now. Beside it, one height, the square:
//                     today's shoots for whoever films, today's edits for an
//                     editor; a row of it pressed is brought into Now
//   the bands         (round 14, the owner's pick: Microsoft Planner) Overdue,
//                     Today and Coming up side by side, three rows each and
//                     "N more"; a row is its line of stops, the title, one grey
//                     line and one badge. A booking question is answered on its
//                     row (Yes, No). A band's count is its own rows; the rows of
//                     it drawn higher up (Now, the square) are "{n} above"
//   Waiting for others  below the bands, open, with its count: what is theirs
//                     but cannot be started — no footage yet, not sent on by
//                     its maker, a booking they said no to — each row naming
//                     whom it waits for. It folds; it does not start folded
//                     (13 Oct: an editor with only such work saw one shut line).
//                     Done today is a fold under it, shut
//
// Round 9 (the owner, on the live page: "too complex — simplify everything"):
// nothing is said twice. A long band showed five rows and the rest on request;
// round 14 (the Planner pick) makes it three in every band, with its count
// (CUT). What waits for somebody else is always all on screen.
//
// Round 11 ("the hard parts that will be misunderstood by the team"): an
// editor's "Overdue 41" was mostly work nobody could start, so the bands hold
// only what the person can do and the rest is "Waiting for others" — still
// counted, still saying how late, because a piece parked out of sight is
// worse than a false alarm. The strip of hours (round 8's "day as a line")
// is the square beside Now since round 14: today's shoots in order, by the hour.
//
// My Day round 1 (design-variants/myday-tz.md §2.1.4): the shared row, heads
// and folds (CoachParts.jsx); the piece in Now is listed nowhere below it; an
// asked shoot is never "Next"; an empty band is a quiet line, never a tinted
// box; the designer's wall holds everything of hers, carried and dayless too.
// The screen's own styles are styles-myday-crew.css.
//
// Which task is first and which band a row is in are not decided here: that
// is crewDay in lib/coach.js, pinned by qa/coach-suite.mjs. This draws it.
//
// Pressing a row opens the task (components/CoachTask.jsx), and the task's
// last step is the one button — so there is one place where work is handed
// in, and it is the place that says what happens next. Only a yes to "can you
// make it?" is done in place, because nothing can be missing from it.
//
// Nothing is taken away: the month calendar is a page in the menu on the left.

const BANDS = [
  { key: 'late', label: () => tx('Overdue'), none: () => tx('Nothing is late.') },
  { key: 'today', label: () => tx('Today'), none: () => tx('Nothing for today.') },
  { key: 'soon', label: () => tx('Coming up'), none: () => tx('Nothing planned yet.') },
  // Yours, with no day: under the three bands, never hidden (23 Oct 2026).
  { key: 'none', label: () => tx('No day yet'), none: () => '' },
  { key: 'done', label: () => tx('Done today'), none: () => '' },
]
// Three rows a band and the rest one press away (the owner's Planner pick, 15 Oct 2026).
const CUT = 3
// What the card's one button does, by the job: it opens the window at the hand-in.
const HAND = { shoot: () => tx('Hand in the videos'), edit: () => tx('Hand in the edit'), design: () => tx('Hand in the artwork') }

const hh = (t) => String(t || '').slice(0, 5)
const minutesOf = (t) => (t ? Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5)) : null)
// The team's clock, like every "today" on the board.
const clockHM = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(serverNow())
const inWords = (m) => (m < 60 ? tx('{n} min', { n: m }) : m % 60 ? tx('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 }) : tx('{h} h', { h: m / 60 }))
// A shoot's day and start, for the square's last line: "Sat 14 Nov, 15:00".
const shootWhen = (r) => `${dayShort(r.due)}${r.t.recording_time ? `, ${hh(r.t.recording_time)}` : ''}`

export default function CoachCrewDay({
  model, entries, user, today, byKey, pipe, team, making = null, onOpen, onChanged, calendar = null, more = null, onClassic = null, note = null,
}) {
  const [busy, setBusy] = useState(false)
  const colorOf = usePieceColors()
  const [pick, setPick] = useState(null)     // a row of the square brought into Now
  const [openAll, setOpenAll] = useState({})   // a band opened past its three rows
  // Now and "in 40 min" follow the clock.
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(id) }, [])
  const name = user.name.split(' ')[0]
  const person = (id) => team.find((u) => u.id === id) || null
  // Who the work is for: whoever runs the piece.
  const forWhom = (t) => person(ownersOf(t)[0])
  const waiting = (t) => firstName(forWhom(t)) || tx('The team')

  const { rows, first, held } = model
  const open = (r, focus = null) => onOpen(r.t, { prefer: r.kind, focus })

  // The one line of facts under a title: what kind of work, for whom, when.
  const whenOf = (r) => {
    const hours = r.kind === 'shoot' ? hoursOf(r.t) : ''
    if (!r.due) return ''
    // A change sent back: its day is the next one the piece is promised for.
    if (r.state === 'fix') return tx('due {day}', { day: dayInLine(r.due, today) })
    if (r.late) return tx('was due {day}', { day: dayShort(r.due) })
    if (r.kind === 'shoot') return `${dayInLine(r.due, today)}${hours ? `, ${hours}` : ''}`
    return tx('due {day}', { day: dayInLine(r.due, today) })
  }
  // Round 9: nothing is said twice. The badge is the day, how late, or what it
  // waits on — so the line is for whom, plus the day only where the badge is
  // busy saying something else. A booking question says what Yes and No
  // answer: "Can you? today, 15:30".
  const factOf = (r) => [
    r.state === 'ask' && [tx('Can you?'), whenOf(r)].filter(Boolean).join(' '),
    firstName(forWhom(r.t)) && tx('for {name}', { name: firstName(forWhom(r.t)) }),
    r.state === 'fix' && whenOf(r),
  ].filter(Boolean).join(' · ')
  // Round 11: what a person cannot start is not theirs to be late on. Whom it
  // waits for comes after a colon — a name inside a clause would need a case
  // in Russian and in Uzbek.
  const waits = (r) => ['blocked', 'early', 'declined'].includes(r.state)
  const waitsFor = (r) => (r.state === 'blocked' ? tx('Waits for the footage: {name}', { name: firstName(person(r.t.operator_id)) || tx('nobody yet') })
    : r.state === 'early' ? tx('Not sent to you yet: {name}', { name: waiting(r.t) })
      : tx('Has to answer: {name}', { name: waiting(r.t) }))

  // A yes needs nothing else, so it is taken on the spot — the same route the
  // booking box in the window uses. Focus moves on before the row leaves (to
  // the next row, else its band's heading; from the card, to the card's
  // title), so it never falls to the page. While it is sent the buttons are
  // aria-disabled, not disabled: a disabled button drops the focus to the
  // page. No Undo: the server has none for an answer (myday-tz §3.6).
  const sayYes = async (r = first, e = null) => {
    if (busy || !r) return
    const li = e?.currentTarget?.closest('li')
    const next = li ? (li.nextElementSibling?.querySelector('button') || li.closest('section, details')?.querySelector('h2[tabindex]'))
      : document.getElementById('co-now-t')?.querySelector('button')
    setBusy(true)
    try {
      const u = await api.post(`/content/${r.t.id}/confirm`, { which: r.ask.which, ok: true })
      toast(tx('Confirmed — it is in your day now'))
      next?.focus?.()
      onChanged?.(u)
    } catch (err) { toast(err.message, 'err') } finally { setBusy(false) }
  }

  // ---- Now (round 14, the owner's pick: Jobber) --------------------------------------
  // The card is what to do now, and beside it the whole of today: the shoots
  // for whoever films, today's edits for an editor. A shoot in its hours is Now
  // (the clock is the team's); a row of the square pressed is brought into Now,
  // and "Not now" puts back what the day would start with.
  const films = (user.crew_roles || []).includes('operator') || entries.some((e) => e.kind === 'shoot')
  const nowMin = minutesOf(clockHM())
  const sq = (films
    ? rows.filter((r) => r.kind === 'shoot' && r.due === today).sort((a, b) => String(a.t.recording_time || '99').localeCompare(String(b.t.recording_time || '99')))
    : rows.filter((r) => r.kind !== 'shoot' && r.band === 'today' && !waits(r)))
  const span = (r) => {
    const a = minutesOf(r.t.recording_time)
    return a == null ? null : { a, b: minutesOf(r.t.recording_end) ?? a + 60 }
  }
  const running = films ? sq.find((r) => r.state === 'go' && span(r) && span(r).a <= nowMin && nowMin < span(r).b) || null : null
  const ended = (r) => films && r.state === 'go' && span(r) && span(r).b <= nowMin
  const base = running || first || null
  const picked = pick ? sq.find((r) => r.key === pick && r !== base) || null : null
  const now = picked || base
  const later = picked ? base : running && first !== running ? first : null
  const upNext = films ? sq.find((r) => r.state === 'go' && span(r) && span(r).a > nowMin) : null
  // The next shoot that is booked (R34): a shoot only asked of you is not
  // "next" — it is a question, answered on its row in Today. When nothing is
  // booked, the square names the asked one as what it is.
  const later_ = films ? rows.filter((r) => r.kind === 'shoot' && r.due > today && !['done', 'declined'].includes(r.state))
    .sort((a, b) => `${a.due} ${a.t.recording_time || ''}`.localeCompare(`${b.due} ${b.t.recording_time || ''}`)) : []
  const nextShoot = later_.find((r) => r.state !== 'ask') || null
  const askedShoot = nextShoot ? null : later_.find((r) => r.state === 'ask') || null

  // Why this one is first: a row brought in by hand, or the shoot under way, says only what it is.
  const pickedWhy = (r) => (r.kind === 'shoot'
    ? (r === running ? tx('Shoot for {name}. When it is done, upload the videos and press the button.', { name: waiting(r.t) }) : tx('Shoot for {name}.', { name: waiting(r.t) }))
    : r.state === 'fix' ? tx('{name} asked you to change something, and is waiting for it.', { name: (r.fix?.requested_name || waiting(r.t)).split(' ')[0] })
      : r.late ? tx('{name} is waiting for it.', { name: waiting(r.t) }) : '')

  const hero = (r) => {
    const who = waiting(r.t)
    // The one sentence this look adds, so it has to be true in every state.
    // Somebody waiting on an answer or a change is said first, whatever day
    // the work is due. "The oldest late task" is said of the oldest one that
    // CAN be started. And "nothing is late" is never said while the bar above
    // counts an overdue row: when what is late cannot be started (no footage,
    // or its maker has not sent it on — crewDay's `held`), the card says so,
    // and says that this is the first one that can be done.
    const HELD = {
      blocked: () => tx('What is late can’t be started yet: the footage is not in.'),
      early: () => tx('What is late can’t be started yet: it is not sent to you.'),
      mixed: () => tx('What is late can’t be started yet: it waits for somebody else.'),
    }
    const why = r !== first ? pickedWhy(r)
      : r.state === 'fix' ? tx('{name} asked you to change something, and is waiting for it.', { name: (r.fix.requested_name || who).split(' ')[0] })
        : r.state === 'ask' ? tx('{name} is waiting for your answer. It takes one tap.', { name: who })
          : r.late ? tx('{name} is waiting for it.', { name: who })
            : held ? `${(HELD[held.why] || HELD.mixed)()} ${tx('So this is the first one you can do: {when}.', { when: whenOf(r) || tx('No date') })}`
              : r.band === 'today' ? tx('Nothing is late. This is the next thing in your day: {when}.', { when: whenOf(r) || tx('today') })
                : tx('Nothing is late and today is clear. This is the next one: {when}.', { when: whenOf(r) || tx('No date') })
    // The button says what its press does (R35): it opens the window at the
    // hand-in of this job. Whom the work goes to next is the after-line's.
    const button = r.state === 'fix' ? tx('Hand in the fix') : (HAND[r.kind] || HAND.edit)()
    // A shoot goes to whoever edits it; anything else back to whose it is —
    // the window's own button then reads "Send to {name}". Footage handed in
    // with nobody to edit it stays on To shoot as its owner's step (the
    // server's rule), so then the next person is the owner, never "editing".
    const editor = firstName(person(r.t.editor_id))
    const to = r.state === 'fix' ? String(r.fix?.requested_name || '').split(' ')[0] : r.kind === 'shoot' ? editor || firstName(forWhom(r.t)) : firstName(forWhom(r.t))
    // True to the press (D-04: the hand-in is the window's; the card never
    // holds a form): the press opens the window, the files are dropped there
    // and sent on to the next person.
    const press = r.state === 'ask' ? null
      : to ? tx('After you press: drop the files and send them. Next: {name}', { name: to })
        : tx('Drop the file in the task, then press Send.')
    const label = picked ? (r.kind === 'shoot' ? (r.state === 'ask' ? tx('Asked of you') : tx('Shoot')) : tx('Picked'))
      : r === running ? tx('Filming now') : tx('Now')
    // ONE badge beside the label: a shoot under way says until when; anything
    // else its lateness, its hour or what it waits on.
    const badge = r === running && r.t.recording_end ? <Badge icon="clock">{tx('until {time}', { time: hh(r.t.recording_end) })}</Badge> : <CrewBadge row={r} today={today} />
    return (
      <StartHere kind={r.kind} id="co-now-t" title={r.t.title} onOpen={() => open(r)} why={why}
        label={label}
        line={<>
          {twoJobs && <span className="co-kind">{KIND[r.kind].word()}</span>}{badge}
          {picked && <button type="button" className="co-link co-here-x" onClick={() => setPick(null)}>{tx('Not now')}</button>}
        </>}
        mark={<KindMark {...ownOf(r.t, user.id)} size={22} />}
        extra={null}
        buttons={r.state === 'ask' ? (
          <>
            <button type="button" className="co-btn co-btn-p" aria-disabled={busy || undefined} onClick={(e) => sayYes(r, e)}><Check size={18} aria-hidden="true" />{tx('I can make it')}</button>
            <button type="button" className="co-btn co-btn-g" aria-disabled={busy || undefined} onClick={() => !busy && open(r, 'no')}>{tx('I can’t')}</button>
          </>
        ) : (
          <button type="button" className="co-btn co-btn-p" onClick={() => open(r, 'step')}>{button} <ArrowRight size={18} aria-hidden="true" /></button>
        )}
        after={(press || later) ? (
          <>
            {press && <span className="co-cd-press">{press}</span>}
            {later && <span className="co-cd-later">{picked ? tx('After this') : tx('After the shoot')}: <button type="button" className="co-link" onClick={() => open(later)}>{later.t.title}</button></span>}
          </>
        ) : null} />
    )
  }

  // The square: every one of today's, in order, one height with Now; it
  // scrolls inside rather than leave room empty. An empty one shrinks to its
  // words (R47).
  const sqName = films ? tx('Today’s shoots') : (user.crew_roles || []).includes('editor') ? tx('Today’s edits') : tx('Due today')
  const square = () => (
    <section className={'co-sq' + (films ? '' : ' edits') + (sq.length ? '' : ' is-empty')} aria-label={sqName}>
      <div className="co-sq-in">
        <h2 className="co-sq-h">{sqName}{sq.length > 0 && <span>{sq.length}</span>}</h2>
        {sq.length ? (
          <ol>
            {sq.map((r) => {
              const state = r === now ? (r === running ? tx('Filming now') : tx('Now'))
                : r.state === 'done' ? tx('Done')
                  : r.state === 'ask' ? tx('Can you?')
                    : r.state === 'fix' ? tx('Changes asked')
                      : waits(r) ? tx('Not sent to you yet')
                        : ended(r) ? <span className="co-sq-up"><Upload size={12} aria-hidden="true" />{tx('Hand in')}</span>
                          : r === running ? tx('Filming now')
                            : r === upNext ? tx('in {time}', { time: inWords(span(r).a - nowMin) }) : ''
              // A row that can be done now is brought into Now; the rest open their task.
              const take = ['go', 'ask', 'fix'].includes(r.state)
              return (
                <li key={r.key} className={(r === now ? 'now' : '') + (r.state === 'done' || ended(r) ? ' gone' : '') + (r.state === 'ask' ? ' ask' : '')}>
                  <button type="button" className="co-sq-b" aria-current={r === now || undefined}
                    onClick={() => (!take ? open(r) : r === base ? setPick(null) : setPick(r.key))}>
                    {films && <span className="co-sq-tm">{hh(r.t.recording_time) || '—'}{r.t.recording_end && <small>–{hh(r.t.recording_end)}</small>}</span>}
                    <span className="co-sq-t"><b>{r.t.title}</b><small>{firstName(forWhom(r.t)) ? tx('for {name}', { name: firstName(forWhom(r.t)) }) : typeLabel(r.t.type)}</small></span>
                    <span className="co-sq-s">{state}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        ) : <p className="co-sq-none">{films ? tx('No shoots today.') : tx('Nothing for today.')}</p>}
        {nextShoot && <p className="co-sq-next">{tx('Next shoot: {when}', { when: shootWhen(nextShoot) })} · {nextShoot.t.title}</p>}
        {askedShoot && <p className="co-sq-next">{tx('Asked of you: {when}', { when: shootWhen(askedShoot) })} · {askedShoot.t.title}</p>}
      </div>
    </section>
  )

  const twoJobs = new Set(entries.map((e) => e.kind)).size > 1

  // ---- a row (the shared li.co-row) -------------------------------------------------
  // Its line of stops beside the button, the title, one grey line, and ONE
  // badge — or, for a booking question, its Yes and No, each named with the
  // piece and the time (R37). What waits for somebody else says whom, and
  // how late only when it is.
  const row = (r) => {
    const when = whenOf(r)
    const action = r.state === 'ask' ? (
      <>
        <button type="button" className="co-btn co-btn-t co-btn-sm" aria-disabled={busy || undefined} onClick={(e) => sayYes(r, e)}
          aria-label={tx('Yes, I can: «{title}», {when}', { title: r.t.title, when })}><Check size={16} aria-hidden="true" />{tx('Yes')}</button>
        <button type="button" className="co-btn co-btn-g co-btn-sm" aria-disabled={busy || undefined} onClick={() => !busy && open(r, 'no')}
          aria-label={tx('No, I can’t: «{title}», {when}', { title: r.t.title, when })}>{tx('No')}</button>
      </>
    ) : null
    const badge = action ? null : waits(r) ? (r.late > 0 ? <CrewBadge row={{ ...r, state: 'go' }} today={today} /> : null) : <CrewBadge row={r} today={today} />
    const dot = colorOf(r.t) != null ? <i className="pc-dot" style={colorStyle(colorOf(r.t))} aria-hidden="true" /> : null
    return (
      <Row key={r.key} kind={r.kind} title={r.t.title} onOpen={() => open(r)}
        className={`${r.state === 'done' ? 'is-done' : ''}${r.state === 'ask' ? ' ask' : ''}`}
        line={waits(r) ? waitsFor(r) : factOf(r)}
        stops={making ? timelineOf(r.t, pipe, making(r.t), { person, userId: user.id, today }) : null}
        late={r.late} youId={user.id} badge={badge} action={action} mark={false}
        lead={dot} />
    )
  }

  // ---- the lists (round 14, the owner's pick: Microsoft Planner) ---------------------
  // Overdue, Today and Coming up side by side, three rows each and "N more"
  // for the rest in the same short form (the owner, 15 Oct: "3 rows per band").
  // That overrides the 13 Oct rule that what is late or for today is never cut:
  // the count is on every band and the rest is one press away. What is in Now
  // or in the square is not listed again — nor any other job on the piece in
  // Now (myday-tz §2.1.1) — and is counted as "{n} above" on its band, so the
  // band plus what is above adds up to the admin's number (R40). What waits
  // for somebody else, and what is done today, are folds below; done starts folded.
  const shown = new Set([now, ...sq].filter(Boolean).map((r) => r.key))
  const heroId = now ? now.t.id : null
  const above = (r) => shown.has(r.key) || (heroId != null && r.t.id === heroId)
  const carriedRows = rows.filter((r) => r.band !== 'done' && !waits(r) && isCarried(r.t, today) && !above(r))
  const carriedKeys = new Set(carriedRows.map((r) => r.key))
  const from = carriedFrom(carriedRows, today, (r) => r.t)
  const bands = BANDS.map((b) => ({
    ...b,
    rows: rows.filter((r) => r.band === b.key && !waits(r) && !carriedKeys.has(r.key) && !above(r)),
    above: rows.filter((r) => r.band === b.key && !waits(r) && above(r)).length,
  }))
  const cols = bands.filter((b) => b.key !== 'done' && b.key !== 'none')
  const doneRows = bands.find((b) => b.key === 'done').rows
  const noDayRows = bands.find((b) => b.key === 'none').rows
  const parked = rows.filter((r) => waits(r) && !above(r))
  const listed = cols.some((b) => b.rows.length) || carriedRows.length > 0 || noDayRows.length > 0
  const band = (b) => {
    const cut = openAll[b.key] ? b.rows.length : CUT
    const list = `co-crew-${b.key}`
    // The count is the band's own rows. What of it is drawn higher up is said
    // once: beside the count when the band has rows, as the band's one line
    // when it has none ("Shown above: 1", never "Nothing for today", R33).
    const up = b.above || 0
    return (
      <section key={b.key} className={`co-band co-band-${b.key}${b.rows.length ? '' : ' is-empty'}`} aria-labelledby={`${list}-h`}>
        <h2 className="co-sec-h" id={`${list}-h`} tabIndex={-1}>
          {b.key === 'late' && b.rows.length > 0 && <i className="co-sec-dot co-sec-dot-late" aria-hidden="true" />}
          {b.label()} <span>{b.rows.length}</span>
          {up > 0 && b.rows.length > 0 && <span className="co-above"><span aria-hidden="true">· </span><span className="sr-only">, </span>{tx('{n} above', { n: up })}</span>}
        </h2>
        {b.rows.length ? <Rows id={list}>{b.rows.slice(0, cut).map(row)}</Rows>
          : <p className="co-sec-none">{up > 0 ? tx('Shown above: {n}', { n: up }) : b.none()}</p>}
        {b.rows.length > CUT && (
          <MoreRows open={!!openAll[b.key]} controls={list} onToggle={() => setOpenAll((old) => ({ ...old, [b.key]: !old[b.key] }))}
            more={tx('{n} more', { n: b.rows.length - CUT })} />
        )}
      </section>
    )
  }

  // A person whose one job is to draw gets "the wall" (the owner's pick for the
  // designer): every piece as a frame at its true shape, in the order to do
  // them, showing what it should look like — the picture when there is one,
  // else the words of its ТЗ. No stages line, no percentage. Everything of
  // hers is on it (R16): every band, what was carried over and what has no
  // day yet, in crewDay's order. A late card says how late in words (R17).
  const wall = !films && entries.length > 0 && entries.every((e) => e.kind === 'design')
  const shapeOf = (t) => (t.type === 'story' || t.type === 'reel' ? 'tall' : t.type === 'video' ? 'wide' : 'square')
  const words = (t) => { const w = String(t.tz || t.description || '').trim(); return w.length > 110 ? `${w.slice(0, 110).trim()}…` : w }
  const wallRows = wall ? rows.filter((r) => r.band !== 'done' && !waits(r) && !above(r)) : []
  const walled = wallRows.length > 0
  const dayWord = (day) => { if (!day) return tx('No date'); const n = daysBetween(today, day); return n === 0 ? tx('Today') : n === 1 ? tx('Tomorrow') : dayShort(day) }

  return (
    <div className="co co-cd">
      <DayHead today={today} title={now ? tx('{name}, start here.', { name }) : tx('{name}, nothing to start right now.', { name })} />
      {note}

      {(now || films || sq.length > 0) && (
        <div className={'co-nn' + (now ? '' : ' solo')}>
          {now ? hero(now) : (
            <section className="co-here co-here-none" aria-label={tx('Now')}>
              <p className="co-here-l"><span className="co-here-w">{tx('Now')}</span><span>{tx('nothing you can start')}</span></p>
              <p className="co-here-empty">{parked.length ? tx('Everything of yours waits for somebody else.') : tx('Nothing is waiting for you. New work shows up here the moment someone gives it to you.')}</p>
            </section>
          )}
          {square()}
        </div>
      )}

      {walled && (
        <section className="co-wall-sec" aria-labelledby="co-wall-h">
          <SecHead id="co-wall-h" label={tx('Next for you')} n={wallRows.length} />
          <div className="co-wall">
            {wallRows.map((r) => {
              const id = `co-wall-${r.key}`
              const late = r.state !== 'go' || r.late > 0 || !r.due
              const forName = firstName(forWhom(r.t)) ? tx('for {name}', { name: firstName(forWhom(r.t)) }) : ''
              // The name starts with the title (R49); the badge describes it.
              return (
                <button key={r.key} type="button" className="co-wall-it" onClick={() => open(r)}
                  aria-label={[r.t.title, dayWord(r.due), forName].filter(Boolean).join(', ')} aria-describedby={late ? `${id}-b` : undefined}>
                  <span className="co-wall-top" aria-hidden="true"><DayChip day={r.due} today={today} />{late && <span id={`${id}-b`}><CrewBadge row={r} today={today} /></span>}</span>
                  <Frame shape={shapeOf(r.t)} src={r.t.photo_thumb || null}>
                    {!r.t.photo_thumb && <span className="co-wall-words">{words(r.t) || tx('Nothing is written here yet — ask whoever gave you the task.')}</span>}
                  </Frame>
                  <b>{r.t.title}</b>
                  <small>{[typeLabel(r.t.type), forName].filter(Boolean).join(' · ')}</small>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="co-list co-cols" aria-label={tx('Your tasks, in the order to do them')} hidden={walled || !listed}>
        {cols.map(band)}
      </section>
      {carriedRows.length > 0 && !walled && band({ key: 'carried', label: () => tx('Carried over from {month}', { month: monthLongOf(from) }), none: () => '', rows: carriedRows })}
      {noDayRows.length > 0 && !walled && band(bands.find((b) => b.key === 'none'))}
      {/* Said once: where the empty Now card is drawn (whoever films) it already says this. */}
      {!now && !films && sq.length === 0 && !listed && parked.length === 0 && doneRows.length === 0 && (
        <Empty good title={tx('All done, {name}', { name })}
          why={tx('Nothing is waiting for you. New work shows up here the moment someone gives it to you.')} />
      )}

      {parked.length > 0 && (
        <details open className="co-card sd-fold co-parked">
          <summary><h2 className="co-sec-h">{tx('Waiting for others')} <span>{parked.length}</span></h2><ChevronDown size={16} className="co-fold-c" aria-hidden="true" /></summary>
          <Rows id="co-crew-parked">{parked.map(row)}</Rows>
        </details>
      )}
      {doneRows.length > 0 && (
        <Fold label={tx('Done today')} n={doneRows.length} className="co-cd-done">
          <Rows id="co-crew-done">{doneRows.map(row)}</Rows>
        </Fold>
      )}
    </div>
  )
}
