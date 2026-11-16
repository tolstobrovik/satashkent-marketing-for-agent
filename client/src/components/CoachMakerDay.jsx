import { useEffect, useState } from 'react'
import { ArrowRight, Check, Send, PenLine } from 'lucide-react'
import {
  KIND,
  Badge, MakerBadge, MonthTag, RemindButton, StartHere, More,
  DayHead, Rows, Row, Section, MoreRows,
  firstName, dayInLine, dayShort, hoursOf, lateWords,
} from './CoachParts.jsx'
import { timelineOf } from './Timeline.jsx'
import { api } from '../lib/api.js'
import { reviewDue } from '../lib/due.js'
import { kindOfAct } from '../lib/coach.js'
import { toast } from '../lib/toast.js'
import { usePieceColors, colorStyle } from '../lib/pieceColor.js'
import { TaskFiles } from './DriveFiles.jsx'
import { tr as tx } from '../lib/i18n.jsx'
import { isCarried, planMonthOf, monthTone, monthLongOf } from '../lib/planMonth.js'
import '../styles-myday-maker.css'

// ---- the content maker's day, the Coach way -----------------------------------------
//
// "For the content makers… like today what has to be filmed, which one is
// pending pravka and etc in priority." So a maker's day is not one list by
// date: it is five groups, in the order the owner set —
//
//   1  Filming today      it happens at a set hour: time, and who films
//   2  Fixes              Check it — a cut or artwork came in and waits for an
//      (key `pravka`)     answer; Being fixed — changes were asked, and the
//                         crew has them (who, which round, until when, remind)
//   3  Late               past its day
//   4  Your move          the crew cannot start until the maker adds something
//   5  Ready to publish   finished: post it
//
// then, since My Day round 1 (myday-tz §5 A1), the pieces carried over from an
// earlier month's plan — a group of their own, on the page, not inside More.
//
// A group with nothing in it is not drawn at all, and neither is a group (or a
// sub of Fixes) whose only row is the start-here card's piece: that piece is
// never repeated in a list below it. Other days, and the month, are the
// Calendar screen (components/CoachCalendar.jsx).
//
// Round 11: round 8 stood the day's shoots on a strip of hours above the
// groups ("the day as a line"). It said in boxes what "Filming today" says in
// words two inches lower, and the boxes were the part nobody would read. It is
// gone; a shoot is a row with its hour.
//
// Round 9 ("too complex — simplify everything"): a group is its name, its
// count and its rows, four of them and the rest on request; a row is the
// title, who has it and one badge or one button.
//
// A piece is in exactly one group, and which one is not decided here: that is
// makerDay in lib/coach.js, pinned by qa/coach-suite.mjs. So is "Start here" —
// the first piece the maker can act on, lifted into the big card.
//
// What a row's button does: an answer that needs nothing else is taken on the
// spot (Accept, with Undo); a reminder is sent on the spot; a verb opens the
// task (components/CoachTask.jsx) on its step, where the server is asked what
// the step is still missing. On a phone (≤ 700 px, the line the shared row
// flips at) a verb that only opens the task is not a button: the row is the
// one door and its grey line carries the verb (R30); Accept, Publish and
// Remind stay buttons.
//
// Pieces that are on time and in somebody else's hands are in none of the
// groups — they are in the week, in the calendar, and listed under More, with
// everything else this page used to show.

// `key:` order is the owner's order; qa/coach-suite.mjs reads it from here.
// (The key `pravka` stays; the word on the screen is "Fixes" — myday-tz §2.1.3.)
const GROUPS = [
  { key: 'film', label: () => tx('Filming today'), why: () => tx('It happens at a set time, so it comes first. Check that the crew is coming.'), none: () => tx('Nothing is filmed today.') },
  { key: 'pravka', label: () => tx('Fixes'), why: () => tx('Someone waits for your answer — or fixes what was asked.'), none: () => tx('Nothing to check and nothing is being fixed.') },
  { key: 'late', label: () => tx('Overdue'), why: () => tx('Past its day. Remind the person who has it — or do your own step.'), none: () => tx('Nothing is late.') },
  { key: 'move', label: () => tx('Your move'), why: () => tx('The crew can’t start until you add your words.'), none: () => tx('Nothing waits for your words.') },
  { key: 'ready', label: () => tx('Ready to publish'), why: () => tx('Finished. Post it and press “Publish”.'), none: () => tx('Nothing is ready yet. Finished pieces land here.') },
  // A piece with no day is on no week and no calendar — so it is here, by
  // name, until it is given one (the owner, 23 Oct 2026: "I don't know where
  // to find the task").
  { key: 'nodate', label: () => tx('No day yet'), why: () => tx('Give it a day — until then it is only here.'), none: () => '' },
]
const SUBS = [
  { key: 'check', label: () => tx('Check it'), why: () => tx('An edit or artwork came in. Look and answer.'), none: () => tx('Nothing to check. New edits and artwork land here.') },
  { key: 'fix', label: () => tx('Being fixed'), why: () => tx('Changes were asked for. Nothing to press.'), none: () => tx('Nothing is being fixed.') },
]
// A group shows its first four rows, then "Show all {n}" (round 9).
const FIRST = 4

// The line the shared row flips at (styles.css, "My Day round 1 — shared").
const PHONE_Q = '(max-width: 700px)'
const narrow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_Q).matches
function useNarrow() {
  const [is, setIs] = useState(narrow)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(PHONE_Q)
    const on = (e) => setIs(e.matches)
    setIs(mq.matches)
    if (mq.addEventListener) mq.addEventListener('change', on)
    else mq.addListener(on)
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on) }
  }, [])
  return is
}

// After an in-place act the pressed button is gone with its row: the keyboard
// lands on the next row, else the group's heading — never on <body> (§2.5).
const focusAfter = (target) => setTimeout(() => {
  const a = document.activeElement
  if (a && a !== document.body && a.isConnected) return
  const el = [target?.next, target?.head, document.querySelector('.co-mkday .co-here h2 button'), document.querySelector('.co-mkday h2.co-sec-h')]
    .find((x) => x && x.isConnected)
  el?.focus({ preventScroll: false })
}, 60)

export default function CoachMakerDay({
  model, pieces, user, today, byKey, pipe, team, roundsOf, reviewsOn, making = null, onOpen, onChanged, onNew = null, more = null, moreNote = '', onClassic = null, note = null,
}) {
  const [busy, setBusy] = useState(false)
  const colorOf = usePieceColors()
  const phone = useNarrow()
  const name = user.name.split(' ')[0]
  const person = (id) => team.find((u) => u.id === id) || null
  const nameOf = (id) => firstName(person(id))
  // A seat somebody holds whose name has not loaded yet still gets a subject.
  const crewName = (id) => nameOf(id) || tx('The crew')

  const { rows, first, month } = model
  // Pieces still open from an earlier month's plan stand apart, in their own
  // group after Ready to publish and in their month's colour, so last month's
  // videos do not mix with what goes out now (lib/planMonth.js). Which of them
  // is most pressing is still makerDay's reading: only where it is drawn moves.
  const carried = rows.filter((r) => r.group !== 'plan' && isCarried(r.t, today))
  const carriedIds = new Set(carried.map((r) => r.t.id))
  // "Carried over from {month}" names the EARLIEST month among them (the
  // heading reads "from September" when September's and October's are here).
  const carriedMonths = carried.map((r) => planMonthOf(r.t)).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort()
  const fromMonth = carriedMonths[0] || ''
  const inGroup = (k) => rows.filter((r) => !carriedIds.has(r.t.id) && (k === 'pravka' ? r.group === 'check' || r.group === 'fix' : r.group === k))
  const showHero = !!first
  const heroId = first?.t.id
  // What a list draws: its rows less the start-here card's piece.
  const drawn = (k) => (k === 'carried' ? carried : inGroup(k)).filter((r) => !(showHero && r.t.id === heroId))
  const [openAll, setOpenAll] = useState({})   // a long group shows four; the rest on request
  // Whether the preview under the card drew a file, by task — so a press that
  // brings the next piece up does not carry the last one's answer over.
  const [preview, setPreview] = useState({})

  // ---- what the maker can press without opening anything ----
  const takeBack = async (t) => {
    try {
      const u = await api.post(`/content/${t.id}/undo`)
      onChanged?.(u)
      toast(tx('Taken back: «{title}»', { title: t.title }))
    } catch (e) { toast(e.message, 'err') }
  }
  const accept = async (r, e = null) => {
    if (busy) return
    // Where the keyboard goes once this row has left (read before it leaves).
    const li = e?.currentTarget?.closest?.('li')
    const target = li ? {
      next: (li.nextElementSibling || li.previousElementSibling)?.querySelector('.co-row-b'),
      head: li.closest('section')?.querySelector('h2.co-sec-h'),
    } : null
    setBusy(true)
    try {
      const u = await api.post(`/content/${r.t.id}/approve`, {})
      toast(tx('Accepted — it is ready to publish'), 'ok', { label: tx('Undo'), onClick: () => takeBack(r.t) })
      onChanged?.(u)
      focusAfter(target)
    } catch (err) { toast(err.message, 'err') } finally { setBusy(false) }
  }

  // The one line of facts: what it is, who has it and what they are doing, when.
  const release = (t) => (!reviewDue(t) ? '' : reviewDue(t) < today ? tx('was planned for {day}', { day: dayShort(reviewDue(t)) }) : tx('goes out {day}', { day: dayInLine(reviewDue(t), today) }))
  const doing = (r) => {
    const n = nameOf(r.holder)
    if (!n) return ''
    const w = r.act.wait
    return w === 'shoot' ? tx('{name} films it', { name: n }) : w === 'cut' ? tx('{name} edits it', { name: n })
      : w === 'artwork' ? tx('{name} draws it', { name: n }) : w === 'review' ? tx('{name} checks it and posts it', { name: n }) : ''
  }
  const factOf = (r) => {
    const { t, act } = r
    const bits = []
    if (r.group === 'film') bits.push(hoursOf(t), nameOf(t.operator_id) && tx('{name} films it', { name: nameOf(t.operator_id) }))
    else if (act.kind === 'check') {
      bits.push(act.what === 'cut' ? tx('{name} handed in the edit', { name: crewName(r.holder) }) : tx('{name} handed in the artwork', { name: crewName(r.holder) }))
      if (roundsOf(t) > 0) bits.push(tx('delivery {n}', { n: roundsOf(t) + 1 }))
    } else if (act.kind === 'fixing') {
      bits.push(act.seat === 'designer' ? tx('{name} fixes the artwork', { name: crewName(r.holder) })
        : act.seat === 'operator' ? tx('{name} films it again', { name: crewName(r.holder) })
          : tx('{name} fixes the edit', { name: crewName(r.holder) }),
      // Until when — the owner's line for this group is "who, which round,
      // until when". The round is the row's badge. The day is the next one
      // the piece is still promised for (fixUntil, read once in makerDay) —
      // never a day already gone; with none left, the day it was to go out.
      r.until ? tx('until {day}', { day: dayInLine(r.until, today) }) : release(t))
    } else if (r.late) bits.push(doing(r))   // how late is the badge — unless the row has a button (below)
    else bits.push(doing(r), release(t))
    return bits.filter(Boolean).join(' · ')
  }
  // D-03: a row carries ONE trailing element — a button or a badge, never both.
  // When a late row has a button, the button wins and how late goes into the
  // grey line: "15 days late · Kamola edits it". A piece being fixed keeps its
  // round as the badge and says how late in the line the same way.
  const lineOf = (r, action) => {
    const facts = factOf(r)
    const sayLate = r.late > 0 && (!!action || r.act.kind === 'fixing')
    return sayLate ? [lateWords(r.late), facts].filter(Boolean).join(' · ') : facts
  }
  // The word on the button that opens the task on the maker's own step.
  const verbOf = (act) => (act.kind === 'publish' ? tx('Publish') : act.kind === 'move' ? tx(act.verb)
    : act.kind === 'ownfix' || act.kind === 'fix' ? tx('Fix it') : act.kind === 'ask' ? tx('Answer')
      : act.kind === 'seat' ? (act.wait === 'shoot' ? tx('Name who films it') : act.wait === 'artwork' ? tx('Name who draws it') : tx('Name who edits it'))
        : tx('Open'))
  // A verb that only opens the task (every own step but Publish): on a phone
  // it is the row's grey line, not a second door (R30).
  const opensOnly = (r) => r.actionable && r.act.kind !== 'check' && r.act.kind !== 'publish'
  const actionOf = (r) => {
    const { act, t } = r
    if (act.kind === 'check') {
      // One button a row (round 10). "Ask for changes" is on the big card and
      // in the task, which a press on the row opens.
      return (
        <button type="button" className="co-btn co-btn-t co-btn-sm co-row-act" disabled={busy} onClick={(e) => accept(r, e)}
          aria-label={tx('Accept «{title}»', { title: t.title })}>
          <Check size={16} aria-hidden="true" /><span className="co-row-act-w">{tx('Accept')}</span>
        </button>
      )
    }
    if (r.actionable) {
      if (phone && opensOnly(r)) return null
      // Publish wears its send icon and a fix its pen; a move is its words
      // alone (R46: no pencil on "Send to the shoot").
      const Icon = act.kind === 'publish' ? Send : act.kind === 'ownfix' || act.kind === 'fix' ? PenLine : null
      return (
        <button type="button" className="co-btn co-btn-t co-btn-sm co-row-act" onClick={() => onOpen(t, { focus: 'step' })}>
          {Icon && <Icon size={16} aria-hidden="true" />}<span className="co-row-act-w">{verbOf(act)}</span>
        </button>
      )
    }
    // In somebody else's hands: a reminder, where there is something to be
    // reminded of — a fix, a late step, a shoot today nobody has said yes to.
    const nudge = r.group === 'fix' || r.group === 'late' || (r.group === 'film' && r.state !== 'coming')
    return nudge && r.holder ? <RemindButton small title={t.title} user={user} taskId={t.id} person={person(r.holder)} today={today} /> : null
  }

  // A shoot today is a shoot, whatever step the piece is waiting on.
  const kindOf = (r) => (r.group === 'film' ? 'shoot' : kindOfAct(r.act))
  // r11 (the owner: "too complicated again"): a row is its colour, its title,
  // one line, and ONE thing on the right — its button, else its badge (D-03:
  // never both; a late row with a button says how late in the line). A
  // carried row also wears its month: the rule on its left in the month's
  // colour, and the month's word where it is not the heading's month.
  const row = (r, { carried: old = false } = {}) => {
    const { t } = r
    const action = actionOf(r)
    // On a phone a verb that only opens the task is in the line (R30); the
    // badge then says only what a badge must — how late.
    const asLine = phone && opensOnly(r)
    const line = asLine
      ? [tx('Your step: {verb}', { verb: verbOf(r.act) }), lineOf(r, null)].filter(Boolean).join(' · ')
      : lineOf(r, action)
    const badge = asLine
      ? (r.late > 0 ? <Badge tone="late">{lateWords(r.late)}</Badge> : null)
      : <MakerBadge row={r} today={today} nameOf={nameOf} />
    const ym = old ? planMonthOf(t) : ''
    const tag = old && ym !== fromMonth ? <MonthTag ym={ym} today={today} /> : null
    return (
      <Row key={t.id} kind={kindOf(r)} title={t.title} onOpen={() => onOpen(t)}
        className={old ? `co-mk-old co-mk-m-${monthTone(ym, today)}` : ''}
        lead={colorOf(t) != null ? <i className="pc-dot" style={colorStyle(colorOf(t))} aria-hidden="true" /> : null}
        line={<>{tag}{tag ? ' ' : ''}<b className="co-row-kw">{(KIND[kindOf(r)] || KIND.idea).word()}</b>{line ? <> · {line}</> : null}</>}
        stops={null}
        youId={user.id}
        action={action} badge={action ? null : badge} />
    )
  }

  const hero = () => {
    const r = first
    const { act, t } = r
    // The reason says what to do — never the lateness, which is the badge (R21).
    const why = act.kind === 'check'
      ? (act.what === 'cut'
        ? tx('{name} finished the edit and waits for your answer.', { name: crewName(r.holder) })
        : tx('{name} finished the artwork and waits for your answer.', { name: crewName(r.holder) }))
      : r.state === 'unsent' ? tx('It is planned to be filmed today, and it is not sent to the shoot yet.')
        : act.kind === 'publish' ? tx('It is finished. Post it, then press Publish.')
          : act.kind === 'move' ? tx('The crew can’t start until you add your words.')
            : act.kind === 'ownfix' ? tx('Changes were asked of you. Somebody waits for the new version.')
              : tx('This step is yours, and it is next.')
    // R14: the loud button never accepts what nobody has watched. While the
    // preview has not drawn a file (or has not answered yet), the one ruby
    // fill opens the task on the material; Accept is tonal beside it.
    const seen = act.kind === 'check' && preview[t.id] === true
    const acceptBtn = (cls) => (
      <button type="button" className={`co-btn ${cls}`} disabled={busy} onClick={(e) => accept(r, e)}>
        <Check size={18} aria-hidden="true" />{act.what === 'cut' ? tx('Accept the edit') : tx('Accept the artwork')}
      </button>
    )
    const askBtn = reviewsOn(t).ask ? <button type="button" className="co-btn co-btn-g" onClick={() => onOpen(t, { focus: 'note' })}>{tx('Ask for changes')}</button> : null
    return (
      <StartHere kind={kindOf(r)} own title={t.title} onOpen={() => onOpen(t)} why={why}
        line={<MakerBadge row={r} today={today} nameOf={nameOf} />}
        /* r11 (the owner): the preview — watch what was handed in, right here. */
        extra={act.kind === 'check' ? (
          <div className="co-here-prev">
            <TaskFiles taskId={t.id} onList={(l) => setPreview((old) => ({ ...old, [t.id]: (l?.files || []).some((f) => f.state === 'ok') }))} />
          </div>
        ) : null}
        buttons={act.kind === 'check' ? (seen ? (
          <>{acceptBtn('co-btn-p')}{askBtn}</>
        ) : (
          <>
            <button type="button" className="co-btn co-btn-p" onClick={() => onOpen(t, { focus: 'files' })}>
              {act.what === 'cut' ? tx('Watch the edit') : tx('Look at the artwork')}
            </button>
            {acceptBtn('co-btn-t')}
            {askBtn}
          </>
        )) : (
          <button type="button" className="co-btn co-btn-p" onClick={() => onOpen(t, { focus: 'step' })}>{verbOf(act)} <ArrowRight size={18} aria-hidden="true" /></button>
        )} />
    )
  }

  // A list of rows: the first four, then "Show all {n}".
  const list = (k) => {
    const shown = drawn(k)
    const id = `co-mk-${k}`
    const open = !!openAll[k]
    return (
      <>
        <Rows id={id}>{(open ? shown : shown.slice(0, FIRST)).map((r) => row(r, { carried: k === 'carried' }))}</Rows>
        {shown.length > FIRST && (
          <MoreRows open={open} controls={id} n={shown.length} onToggle={() => setOpenAll((old) => ({ ...old, [k]: !old[k] }))} />
        )}
      </>
    )
  }

  const onWay = rows.filter((r) => r.group === 'plan')
  // A group (or a sub of Fixes) whose only row is the card's piece is not drawn.
  const subs = SUBS.filter((x) => drawn(x.key).length > 0)
  const groups = GROUPS.filter((g) => (g.key === 'pravka' ? subs.length > 0 : drawn(g.key).length > 0))
  const countOf = (k) => (k === 'pravka' ? subs.reduce((n, x) => n + drawn(x.key).length, 0) : drawn(k).length)
  const nCarried = drawn('carried').length
  const section = (g) => (
    <Section key={g.key} id={`co-mk-h-${g.key}`} label={g.label()} n={countOf(g.key)} tone={g.key === 'late' ? 'late' : ''}
      className={`co-mk-g co-mk-g-${g.key}`}>
      {g.key === 'pravka' ? subs.map((x) => (
        <div key={x.key} className="co-mk-sub">
          <h3 className="co-mk-sub-h">{x.label()}</h3>
          {list(x.key)}
        </div>
      )) : list(g.key)}
    </Section>
  )
  const afterReady = groups.findIndex((g) => g.key === 'ready')
  const at = afterReady >= 0 ? afterReady + 1 : groups.findIndex((g) => g.key === 'nodate') >= 0 ? groups.findIndex((g) => g.key === 'nodate') : groups.length

  return (
    <div className="co co-mkday">
      <DayHead today={today} title={first ? tx('{name}, start here.', { name }) : tx('{name}, nothing waits for you right now.', { name })} />
      {note}

      {showHero && hero()}
      {groups.slice(0, at).map(section)}
      {/* A1 (myday-tz §5): the pieces carried over from an earlier month are on
          the page, after Ready to publish — never in a fold inside a fold. */}
      {nCarried > 0 && (
        <Section id="co-mk-h-carried" label={tx('Carried over from {month}', { month: monthLongOf(fromMonth) })} n={nCarried} className="co-mk-g co-mk-g-carried">
          {list('carried')}
        </Section>
      )}
      {groups.slice(at).map(section)}
      {!first && !groups.length && !nCarried && <p className="co-quiet co-mk-none">{tx('Nothing waits for you today. What the crew is making is under More.')}</p>}

      {/* D-07: the fold names what is inside, with counts — "More · On its way 5 ·
          What you’ve done 10" — not "More" and a chevron. */}
      <More note={[
        onWay.length > 0 && `${tx('On its way')} ${onWay.length}`,
        moreNote,
      ].filter(Boolean).join(' · ')}>
        <p className="co-quiet">{tx('{done} of {total} pieces are out this month', { done: month.out, total: month.total })}</p>
        {onWay.length > 0 && (
          <details className="sd-fold">
            <summary>{tx('On its way — nothing for you to press')} <span className="count">· {onWay.length}</span></summary>
            <Rows>{onWay.map((r) => row(r))}</Rows>
          </details>
        )}
        {more}
        {onClassic && (
          <button type="button" className="sd-classic" onClick={onClassic}>{tx('Bring back the previous look')}</button>
        )}
      </More>
    </div>
  )
}
