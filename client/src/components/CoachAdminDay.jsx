import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronDown, Clapperboard, Scissors, Send, Palette } from 'lucide-react'
import { api } from '../lib/api.js'
import { addDaysISO, serverNow } from '../lib/constants.js'
import { toast } from '../lib/toast.js'
import { tr as tx } from '../lib/i18n.jsx'
import { adminFirst, atRisk, teamOverdue } from '../lib/coach.js'
import {
  KIND, Badge, Face, StartHere, RemindButton, firstName, dayInLine, lateWords,
  DayHead, Section, Rows, Row, MoreRows, DayNote,
} from './CoachParts.jsx'
import Skeleton from './Skeleton.jsx'
import { timelineOf } from './Timeline.jsx'
import Housekeeping from './Housekeeping.jsx'
import AdminAsks, { useAdminAsks, chansOfAsk, kindOfAsk, askLine } from './AdminAsks.jsx'
import '../styles-myday-admin.css'

// ---- an admin's My Day: My Day · Team (myday-tz §2.1.2) -------------------------
//
// "I am an admin and I need to see the deadlines first of all in my day, and
// the schedule of the team — Jasmina has two shoots, at 14:00 and 15:00."
//
// My Day round 1 (12 Nov 2026) splits the page in two tabs, as the handbook
// names them. MY DAY is the decisions, top to bottom: "Nobody holds these"
// (round 19: a step with no person on it — first, never folded, drawn only
// when there is one), the start-here card (adminFirst in lib/coach.js: a shoot
// today nobody films, else a day move waiting on the admin, else the release
// at risk that goes out soonest, else the most late step the archive does
// not take — never a piece Monday's archive takes), the asks as open rows,
// Today (atRisk: a release whose shoot, edit or artwork is not in leads, in
// words), Overdue (teamOverdue: one row a piece, at the step that can move,
// Remind for its holder only; five, then "Show all"; what the archive takes
// is one quiet line that opens Team at Housekeeping). TEAM is who is where:
// "Who does what today" over the timetable (round 14, Float: everyone down,
// the hours across — a real table on a desk, a list of people on a phone),
// who is free now, Housekeeping and the old deadline lists, folded.
//
// The owner refused the timetable folded away (23 Oct 2026). A tab is not a
// fold — one press, kept in the address (?tab=team), the timetable whole when
// it is there — but the owner may read it as one: TABS = false puts the page
// back to one column in the same order, nothing folded.
const TABS = true

// What is late and what is done is the server's reading (GET /content/day/team,
// routes/content.js — lateDue and phasePassed); which row comes first is
// lib/coach.js's. This page only draws them.
const WHAT = { shoot: () => tx('Shoot'), design: () => tx('Artwork'), release: () => tx('Goes out'), edit: () => tx('Editing') }
const KIND_OF = { shoot: 'shoot', design: 'design', release: 'send', edit: 'edit' }
// The step in the way of a release that goes out today, in words (R09).
const NOT_IN = { shoot: (time) => tx('Not filmed yet · {time}', { time }), edit: (time) => tx('Edit not in · {time}', { time }), design: (time) => tx('Artwork not in · {time}', { time }) }
const toMin = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5))
const hhmm = (t) => String(t || '').slice(0, 5)
const ofMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const clockMin = () => toMin(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(serverNow()))
const FIRST = 5   // round 9: five rows, then "Show all" (the admin's Overdue may be cut)

// A phone has no hour grid (R04): a list of people instead.
const NARROW = '(max-width: 700px)'
function useNarrow() {
  const [n, setN] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(NARROW).matches)
  useEffect(() => {
    const m = window.matchMedia?.(NARROW)
    if (!m) return undefined
    const f = () => setN(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return n
}

export default function CoachAdminDay({ user, team, byKey, today, onOpen, pieces = null, pipe = null, making = null }) {
  const [day, setDay] = useState(today)
  // Every row wears the piece's line of stops, the way the crew's and the makers' rows do (12 Nov 2026,
  // the refine list: "the admin's rows draw no timeline"). Read off the piece Brief already holds; a piece
  // it does not hold draws its row without the line rather than fetching one.
  const stopsOf = (id) => {
    if (!pieces || !pipe || !making) return null
    const p = pieces.find((x) => x.id === id)
    return p ? timelineOf(p, pipe, making(p), { person: (pid) => (team || []).find((u) => u.id === pid) || null, userId: user.id, today }) : null
  }
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')          // the first load failed
  const [stale, setStale] = useState(false)   // a refresh failed; the last good day stays
  const [lastAt, setLastAt] = useState('')
  const [hk, setHk] = useState(undefined)     // the housekeeping summary: undefined loading, null failed
  const [chan, setChan] = useState('all')
  // Who is on the timetable: the busy by default (the owner, 23 Oct 2026:
  // "the free ones are just taking space"); everyone, the crew, the makers, who is free now.
  const [show, setShow] = useState('busy')
  const [recordOpen, setRecordOpen] = useState(false)   // the record's fold (the Team tab), opened by Review them
  const [held, setHeld] = useState(null)       // whose Overdue list is open
  const [due, setDue] = useState(null)         // whose "due today" list is open, and which kind: { id, k }
  const [open, setOpen] = useState(null)       // the phone's open person
  const [heroBusy, setHeroBusy] = useState(false)   // an answer on the card is on its way
  const [all, setAll] = useState({})
  const [trkW, setTrkW] = useState(0)
  const [more, setMore] = useState(false)      // the timetable has more to the right
  const [, tick] = useState(0)
  const narrow = useNarrow()
  const [params, setParams] = useSearchParams()
  const tab = TABS && params.get('tab') === 'team' ? 'team' : 'day'
  const [teamSeen, setTeamSeen] = useState(tab === 'team')
  const focusNext = useRef(null)
  const dataRef = useRef(null)
  const reqRef = useRef(0)
  const tabRefs = { day: useRef(null), team: useRef(null) }
  const wrapRef = useRef(null)
  const hdRef = useRef(null)
  const { asks, err: asksErr, settled: asksSettled, load: loadAsks, answer } = useAdminAsks()

  const load = useCallback(() => {
    const n = ++reqRef.current
    return api.get(`/content/day/team?date=${day}&everyone=1`)
      .then((d) => { if (n !== reqRef.current) return; dataRef.current = d; setData(d); setErr(''); setStale(false); setLastAt(ofMin(clockMin())) })
      // A failed refresh of the day on screen keeps it, said stale; a failed read of
      // ANOTHER day (an arrow, Today) is the error frame — never yesterday's day
      // under tomorrow's date.
      .catch((e) => {
        if (n !== reqRef.current) return
        if (dataRef.current && dataRef.current.day === day) { setStale(true); return }
        dataRef.current = null; setData(null); setStale(false); setErr(e?.message || '')
      })
  }, [day])
  // The summary carries archive_days and the archive's own list (`candidates`):
  // the start-here card is never a piece Monday's archive takes.
  const loadHk = useCallback(() => api.get('/content/housekeeping/summary').then((s) => setHk(s || null)).catch(() => setHk((x) => (x ? x : null))), [])
  useEffect(() => {
    load()
    const id = setInterval(() => { if (!document.hidden) { load(); loadHk(); tick((k) => k + 1) } }, 60000)
    return () => clearInterval(id)
  }, [load, loadHk])
  useEffect(() => { loadHk() }, [loadHk])
  useEffect(() => { if (tab === 'team') setTeamSeen(true) }, [tab])
  // Focus that waits for a render: after an answer on the card, after "Review them".
  useLayoutEffect(() => {
    if (!focusNext.current) return
    const el = document.querySelector(focusNext.current)
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'start' }); focusNext.current = null }
  })
  // The hour labels keep 36 px apart: how wide the track is.
  useEffect(() => {
    const el = hdRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => setTrkW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  })
  // The edge fade, only while there is more to the right.
  const fade = useCallback(() => {
    const w = wrapRef.current
    if (w) setMore(w.scrollLeft < w.scrollWidth - w.clientWidth - 1)
  }, [])
  useEffect(() => {
    fade()
    const w = wrapRef.current
    if (!w || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(fade)
    ro.observe(w)
    return () => ro.disconnect()
  })

  const person = (id) => team.find((u) => u.id === id)
  const names = (ids) => (ids || []).map((id) => firstName(person(id))).filter(Boolean).join(', ')
  const on = (x) => chan === 'all' || (x.channels || []).includes(chan)

  // The channels that have something today or on the timeline — the menu.
  const chans = useMemo(() => {
    if (!data) return []
    const seen = new Set()
    for (const x of [...data.overdue, ...data.dueToday, ...data.editAsap, ...(data.seatless || []), ...data.timeline.flatMap((p) => p.items)])
      for (const c of x.channels || []) seen.add(c)
    return [...seen].filter((c) => byKey[c]).sort((a, b) => (byKey[a].label || a).localeCompare(byKey[b].label || b))
  }, [data, byKey])

  const firstNameOf = firstName(user)
  const title = tx('{name}, start here.', { name: firstNameOf })
  const pick = (t) => {
    setParams((p) => { const n = new URLSearchParams(p); if (t === 'team') n.set('tab', 'team'); else n.delete('tab'); return n }, { replace: true })
  }

  // The day controls, on the head's right x (under the headline on a phone).
  const controls = (
    <div className="co-ad-ctl2">
      <button type="button" className="icon-btn" onClick={() => setDay(addDaysISO(day, -1))} aria-label={tx('A day earlier')}><ChevronLeft size={18} aria-hidden="true" /></button>
      <button type="button" className="icon-btn" onClick={() => setDay(addDaysISO(day, 1))} aria-label={tx('A day later')}><ChevronRight size={18} aria-hidden="true" /></button>
      {day !== today && <button type="button" className="co-link co-ad-today" onClick={() => setDay(today)}>{tx('Today')}</button>}
      {/* One menu, not a row of nine buttons (round 9: "too complex"). */}
      <select className="select co-chan-pick" aria-label={tx('Channels')} value={chan} onChange={(e) => setChan(e.target.value)}>
        <option value="all">{tx('All channels')}</option>
        {chans.map((c) => <option key={c} value={c}>{byKey[c].label}</option>)}
      </select>
    </div>
  )

  // Loading: the page's own grey frame (Skeleton, after 150 ms), until the day
  // and the archive's measure are both in — the card must not jump from an
  // archive candidate to the right one.
  if (!data && err) {
    return (
      <div className="co co-admin">
        <DayHead today={day} title={title}>{controls}</DayHead>
        <DayNote kind="error" text={tx('The team’s day did not load.')} cause={err} onRetry={load} />
      </div>
    )
  }
  if (!data || hk === undefined || !asksSettled) return <Skeleton kind="admin" name={firstNameOf} today={day} />

  const overdue = data.overdue.filter(on)
  const dueToday = data.dueToday.filter(on)
  const editAsap = data.editAsap.filter(on)
  // Steps with nobody in the seat (the role play, 24 Oct 2026): the owner's
  // "it was not assigned and I didn't see it" — first on the page, every day.
  const seatless = (data.seatless || []).filter(on)
  const teamF = { ...data, overdue, dueToday, editAsap, seatless, timeline: data.timeline.map((p) => ({ ...p, items: p.items.filter(on) })) }
  const asksF = asks.filter((a) => chan === 'all' || chansOfAsk(a).includes(chan))
  const archiveDays = hk ? hk.archive_days : null
  const candidates = hk ? hk.candidates : null
  const first = adminFirst(teamF, { archiveDays, asks: asksF, candidates, today })
  const heroId = first ? first.content_id : null
  const od = teamOverdue(teamF, { archiveDays, asks: asksF, candidates })
  const risk = atRisk(teamF)

  // ---- the people: a row each, the crew first ----
  const now = day === today ? clockMin() : null
  const statusOf = (p) => {
    if (!p.working) return { k: 'off', t: tx('Not a working day') }
    if (now == null) return { k: '', t: '' }
    const end = (i) => (i.to ? toMin(i.to) : toMin(i.from) + 60)
    const filming = p.items.find((i) => i.kind === 'shoot' && i.from && toMin(i.from) <= now && now < end(i))
    if (filming) return { k: 'film', t: tx('Filming until {time}', { time: ofMin(end(filming)) }) }
    const busy = p.busy.find((b) => toMin(b.from) <= now && now < toMin(b.to))
    if (busy) return { k: 'busy', t: tx('At lessons until {time}', { time: hhmm(busy.to) }) }
    if (p.work_start && now < toMin(p.work_start)) return { k: 'later', t: tx('Starts at {time}', { time: hhmm(p.work_start) }) }
    if (p.work_end && now >= toMin(p.work_end)) return { k: 'gone', t: tx('Day is over') }
    const next = [...p.items.filter((i) => i.kind === 'shoot' && i.from).map((i) => toMin(i.from)), ...p.busy.map((b) => toMin(b.from))]
      .filter((m) => m > now).sort((a, b) => a - b)[0]
    return { k: 'free', t: next != null ? tx('Free until {time}', { time: ofMin(next) }) : tx('Free') }
  }
  const crew = (p) => (p.crew_roles || []).length > 0
  // What a person holds of Overdue: the pieces whose step that can move is
  // theirs (teamOverdue — never a downstream seat that cannot start).
  const holdsOf = (id) => od.rows.filter((r) => (r.owners || []).includes(id))
  const everyone = teamF.timeline
    .map((p) => ({ ...p, st: statusOf(p) }))
    .filter((p) => chan === 'all' || p.items.length)
  const freeN = everyone.filter((p) => p.st.k === 'free').length
  const busy = (p) => p.items.some((i) => !i.done) || holdsOf(p.id).length > 0
  const busyN = everyone.filter(busy).length
  const rows = everyone
    .filter((p) => show === 'all' || (show === 'busy' ? busy(p) : show === 'crew' ? crew(p) : show === 'makers' ? !crew(p) : p.st.k === 'free'))
    .sort((a, b) => (crew(b) - crew(a)) || String(a.items.find((i) => i.from)?.from || '99').localeCompare(String(b.items.find((i) => i.from)?.from || '99')) || a.name.localeCompare(b.name))
  // A shoot on the day that nobody films yet: a row of its own, first.
  const nobody = [...new Map(everyone.flatMap((p) => p.items).filter((i) => i.kind === 'shoot' && !i.operator_id && i.from).map((i) => [i.content_id, i])).values()]

  // ---- the hours: from the first working hour, stretched to whatever is on it ----
  const shown = [...rows, ...(nobody.length ? [{ items: nobody, busy: [] }] : [])]
  const times = shown.flatMap((p) => [...p.items.flatMap((i) => [i.from, i.to]), ...p.busy.flatMap((b) => [b.from, b.to])]).filter(Boolean).map(toMin)
  const workStarts = rows.map((p) => p.work_start).filter(Boolean).map(toMin)
  const start = Math.min(workStarts.length ? Math.floor(Math.min(...workStarts) / 60) * 60 : 9 * 60, ...times.map((m) => Math.floor(m / 60) * 60))
  // a post's chip needs room after its hour (its words): the track runs two hours past the last post
  const postTimes = shown.flatMap((p) => p.items.filter((i) => i.kind === 'post' && i.from).map((i) => toMin(i.from) + 120))
  const end = Math.max(20 * 60, ...times.map((m) => Math.ceil(m / 60) * 60), ...postTimes.map((m) => Math.ceil(m / 60) * 60), ...(now != null && now >= start ? [Math.ceil((now + 1) / 60) * 60] : []))
  const early = now != null && now < start   // before the day starts: the now line waits at the left edge
  const pct = (m) => `${((Math.max(start, Math.min(end, m)) - start) / (end - start)) * 100}%`
  const span = (a, b) => ({ left: pct(a), width: `${Math.max(1.5, ((Math.min(end, b) - Math.max(start, a)) / (end - start)) * 100)}%` })
  // Thinned to every 2nd or 3rd hour, so the labels stay at least 36 px apart (R19).
  const perHour = trkW > 0 ? trkW / ((end - start) / 60) : 60
  const every = Math.max(1, Math.ceil(36 / perHour))
  const hours = []
  // The left edge needs no label of its own: the first one is an hour in.
  for (let m = start + 60 * every; m < end; m += 60 * every) hours.push(m)
  // No hour label under the now pill — measured where the pill is drawn, clamped 24 px inside the track.
  const atPx = (m) => ((Math.max(start, Math.min(end, m)) - start) / (end - start)) * (trkW || 1)
  const pillPx = now == null ? 0 : trkW > 48 ? Math.min(Math.max(atPx(now), 24), trkW - 24) : atPx(now)
  const nearNow = (m) => now != null && !early && Math.abs(pillPx - atPx(m)) < 44

  const filmsName = (i) => (i.operator_id ? firstName(person(i.operator_id)) : tx('nobody yet'))
  // the owner (15 Nov 2026): "too many texts, hard to read" — a day nobody works is said once over the table, not
  // hatched in every row; a person's own day off is one quiet word; a post is a chip with its hour and its title
  const track = (p, items) => {
    const ws = p.work_start ? toMin(p.work_start) : null, we = p.work_end ? toMin(p.work_end) : null
    const posts = items.filter((i) => i.kind === 'post' && i.from).sort((a, b) => toMin(a.from) - toMin(b.from))
    const lanes = []; posts.forEach((i, k) => lanes.push(k > 0 && toMin(i.from) - toMin(posts[k - 1].from) < 110 && lanes[k - 1] === 0 ? 1 : 0))   // two posts within two hours: the second on a lower lane
    return (
      <div className="co-ad-trk" role="cell">
        {!p.working ? null : (
          <>
            {ws != null && ws > start && <i className="co-ad-off" style={span(start, ws)} />}
            {we != null && we < end && <i className="co-ad-off" style={span(we, end)} />}
          </>
        )}
        {p.busy.map((b, k) => <span key={`b${k}`} className="co-ad-busy" style={span(toMin(b.from), toMin(b.to))}>{b.label || tx('Lessons')}</span>)}
        {items.filter((i) => i.kind === 'shoot' && i.from).map((i) => {
          const a = toMin(i.from), b = i.to ? toMin(i.to) : a + 60
          return (
            <button key={`s${i.content_id}`} type="button" style={span(a, b)} onClick={() => onOpen(i.content_id)}
              className={'co-ad-bar' + (i.done || (now != null && b <= now) ? ' done' : '') + (now != null && a <= now && now < b ? ' now' : '') + (i.operator_id ? '' : ' nobody')}
              aria-label={tx('{title}, {from}–{to}, films: {name}', { title: i.title, from: hhmm(i.from), to: ofMin(b), name: filmsName(i) })}
              title={`${i.title}, ${hhmm(i.from)}–${ofMin(b)}`}>
              <b aria-hidden="true"><small>{hhmm(i.from)}</small>{i.title}</b>
            </button>
          )
        })}
        {posts.map((i, k) => (
          <button key={`p${i.content_id}`} type="button" className={'co-ad-pin' + (i.done ? ' done' : '') + (lanes[k] ? ' lane-1' : '')} style={{ '--at': pct(toMin(i.from)) }}
            onClick={() => onOpen(i.content_id)} aria-label={`${tx('Goes out')} ${hhmm(i.from)}: ${i.title}`} title={`${tx('Goes out')} ${hhmm(i.from)} · ${i.title}`}>
            <Send size={13} aria-hidden="true" /><small aria-hidden="true">{hhmm(i.from)}</small><span aria-hidden="true">{i.title}</span>
          </button>
        ))}
        {now != null && now <= end && <i className={'co-ad-nl' + (early ? ' early' : '')} style={{ left: pct(now) }} aria-hidden="true" />}
      </div>
    )
  }
  // Due that day, said in words: "1 edit", "2 covers" — pressed, the list of
  // them opens under the row (the owner, 23 Oct 2026); a shoot or a post with
  // no hour is named here too.
  const dueOf = (p, k) => p.items.filter((i) => i.kind === k && !i.done)
  const looseOf = (p) => p.items.filter((i) => (i.kind === 'shoot' || i.kind === 'post') && !i.from && !i.done)
  const dueToggle = (p, k) => setDue(due && due.id === p.id && due.k === k ? null : { id: p.id, k })
  const dueCell = (p) => {
    const cuts = dueOf(p, 'cut'), arts = dueOf(p, 'art')
    const isOpen = (k) => !!due && due.id === p.id && due.k === k
    return (
      <>
        {cuts.length > 0 && <button type="button" className="co-ad-du co-k-cut" aria-expanded={isOpen('cut')} onClick={() => dueToggle(p, 'cut')} title={cuts.map((i) => i.title).join(', ')}><Scissors size={13} aria-hidden="true" />{cuts.length > 1 ? tx('{n} edits', { n: cuts.length }) : tx('1 edit')}</button>}
        {arts.length > 0 && <button type="button" className="co-ad-du co-k-art" aria-expanded={isOpen('art')} onClick={() => dueToggle(p, 'art')} title={arts.map((i) => i.title).join(', ')}><Palette size={13} aria-hidden="true" />{arts.length > 1 ? tx('{n} covers', { n: arts.length }) : tx('1 cover')}</button>}
        {looseOf(p).map((i) => <button key={`l${i.kind}${i.content_id}`} type="button" className="co-ad-du" onClick={() => onOpen(i.content_id)} title={i.title}>{i.kind === 'post' ? <Send size={13} aria-hidden="true" /> : <Clapperboard size={13} aria-hidden="true" />}{i.kind === 'post' ? tx('Goes out') : tx('Shoot, no hour')}</button>)}
      </>
    )
  }
  // "Overdue": how many pieces wait on this person, and the oldest (R11: no
  // colour that turns at three days — the words carry it).
  const oldest = (h) => Math.max(...h.map((x) => x.days_late))
  const odName = (p, h) => tx('{name}: {n} overdue, the oldest {d} days', { name: firstName(person(p.id) || p), n: h.length, d: oldest(h) })
  const holdBtn = (p) => {
    const h = holdsOf(p.id)
    if (!h.length) return null
    return (
      // The name starts with the words on the pill (WCAG 2.5.3), then says them in full.
      <button type="button" className="co-ad-od" aria-expanded={held === p.id} aria-controls={`co-ad-od-${p.id}`} onClick={() => setHeld(held === p.id ? null : p.id)}
        aria-labelledby={`co-ad-odv-${p.id} co-ad-odn-${p.id}`}>
        <span id={`co-ad-odv-${p.id}`}>{tx('{n} overdue · {d} d', { n: h.length, d: oldest(h) })}</span>
        <span id={`co-ad-odn-${p.id}`} className="sr-only">{odName(p, h)}</span>
      </button>
    )
  }

  // The old row, for the deadline lists under "All deadlines" (moved as they were).
  const row = (x, kind, fact, badge) => (
    <div key={`${x.content_id}:${x.phase || kind}`} className={`co-row nonum ${KIND[kind].cls}`}>
      <button type="button" className="co-row-b" onClick={() => onOpen(x.content_id)}>
        <span className="co-row-t">{x.title}</span>
        <span className="co-row-f">{fact}</span>
      </button>
      <span className="co-row-r">{badge}</span>
    </div>
  )
  const whose = (x) => names(x.owners) || tx('nobody yet')
  const GROUPS = [
    {
      key: 'seatless', label: () => tx('Nobody holds these'), list: seatless,
      why: () => tx('A step with no person on it. Nothing happens until somebody is named — press it and name them.'), none: () => tx('Every step has a person.'),
    },
    {
      key: 'late', label: () => tx('Overdue now'), list: overdue,
      why: () => tx('Past its day and not done. The most late first.'), none: () => tx('Nothing is late. Every step is on its day.'),
      draw: (x) => row(x, KIND_OF[x.phase], `${WHAT[x.phase]()} · ${whose(x)}`,
        <Badge tone="late">{lateWords(x.days_late)}</Badge>),
    },
    {
      key: 'today', label: () => tx('Due today'), list: dueToday,
      why: () => tx('Its day is today: shoots and posts with their hour.'), none: () => tx('Nothing is due today.'),
      draw: (x) => row(x, KIND_OF[x.phase], `${WHAT[x.phase]()} · ${whose(x)}`,
        <Badge>{x.time ? hhmm(x.time) : tx('Today')}</Badge>),
    },
    {
      key: 'edit', label: () => tx('Needs editing ASAP'), list: editAsap,
      why: () => tx('The footage is in, and the edit is late or due within a day.'), none: () => tx('No edit is close to its day.'),
      draw: (x) => row(x, 'edit', whose(x),
        x.days_late > 0 ? <Badge tone="late">{lateWords(x.days_late)}</Badge>
          : <Badge tone="wait">{x.days_late === 0 ? tx('due today') : tx('due tomorrow')}</Badge>),
    },
  ]
  const SHOW = [['busy', `${tx('Busy')} (${busyN})`], ['all', tx('Everyone')], ['crew', tx('Crew')], ['makers', tx('Makers')], ...(now != null ? [['free', `${tx('Free')} (${freeN})`]] : [])]

  // ---- My Day: the start-here card (adminFirst) ----
  const afterRemind = tx('After you press: a reminder goes into the task’s comments, and only that person gets a bell.')
  // One answer at a time: a second press while the first is on its way would
  // answer the next ask, and a decided ask has no undo (§3.6).
  const decide = async (a, approve) => {
    if (heroBusy) return
    setHeroBusy(true)
    try {
      await answer(a, approve)
      // The card takes the next thing; focus goes to its title, else to Today.
      focusNext.current = '#co-now-t button, #co-ad-today-h'
    } catch (e) { toast(e.message, 'err') } finally { setHeroBusy(false) }
  }
  const hero = () => {
    if (!first) {
      return (
        <section className="co-here co-here-none" aria-label={tx('Start here')}>
          <p className="co-here-l"><span className="co-here-w">{tx('Start here')}</span></p>
          <p className="co-here-empty">{tx('Nothing is overdue. Every step is on its day and every shoot has its person.')}</p>
        </section>
      )
    }
    const open1 = () => onOpen(first.content_id)
    if (first.kind === 'nobody') {
      return (
        <StartHere kind="shoot" id="co-now-t" title={first.title} onOpen={open1}
          line={<Badge icon="clock">{first.time ? hhmm(first.time) : tx('Today')}</Badge>}
          why={`${tx('Shoot')} · ${tx('nobody yet')}`}
          buttons={<button type="button" className="co-btn co-btn-p" onClick={open1}>{tx('Choose who films it')}</button>}
          after={tx('After you press: the task opens. Name who films it, and they get the booking question.')} />
      )
    }
    if (first.kind === 'ask') {
      const a = first.ask
      return (
        <StartHere kind={kindOfAsk(a)} id="co-now-t" title={first.title} onOpen={open1}
          line={<Badge tone="wait">{tx('Move asked')}</Badge>}
          why={askLine(a)}
          buttons={(
            <>
              <button type="button" className="co-btn co-btn-p" aria-disabled={heroBusy || undefined} onClick={() => decide(a, true)}>{tx('Move it')}</button>
              <button type="button" className="co-btn co-btn-g" aria-disabled={heroBusy || undefined} onClick={() => decide(a, false)}>{tx('Keep it')}</button>
            </>
          )}
          after={tx('After you press: they hear your answer right away.')} />
      )
    }
    // 'risk' and 'late': the step that can move, and whose it is.
    const step = first.kind === 'risk' ? first.risk.phase : first.phase
    const who = first.holder ? person(first.holder) : null
    const canRemind = !!who && who.id !== user.id
    const badge = first.kind === 'risk'
      ? <Badge tone="late">{(NOT_IN[step] || NOT_IN.shoot)(first.time ? hhmm(first.time) : tx('today'))}</Badge>
      : <Badge tone="late">{lateWords(first.days_late)}</Badge>
    return (
      <StartHere kind={KIND_OF[step] || 'edit'} id="co-now-t" title={first.title} onOpen={open1}
        line={badge}
        why={`${(WHAT[step] || WHAT.edit)()} · ${who ? firstName(who) : tx('nobody yet')}`}
        buttons={canRemind ? <RemindButton primary user={user} taskId={first.content_id} person={who} today={today} /> : null}
        after={canRemind ? afterRemind : null} />
    )
  }
  // The card says it could not check the archive (it may then be a piece the archive takes).
  const hkNote = hk === null && first && first.kind === 'late' ? <DayNote kind="side" text={tx('Could not check the archive')} onRetry={loadHk} /> : null

  // ---- My Day: Nobody holds these (round 19: first, never folded, only when there is one) ----
  const seatlessCard = seatless.length > 0 && (
    <Section id="co-ad-seat-h" label={GROUPS[0].label()} n={seatless.length} className="co-ad-seatless">
      <p className="co-ad-why">{GROUPS[0].why()}</p>
      <Rows id="co-ad-seat-l">
        {(all.seatless ? seatless : seatless.slice(0, FIRST)).map((x) => (
          <Row key={`${x.content_id}:${x.phase}`} kind={KIND_OF[x.phase] || 'edit'} title={x.title} onOpen={() => onOpen(x.content_id)} stops={stopsOf(x.content_id)}
            line={`${(WHAT[x.phase] || WHAT.edit)()} · ${whose(x)}`} badge={<Badge tone="wait">{tx('Name who')}</Badge>} />
        ))}
      </Rows>
      {seatless.length > FIRST && <MoreRows open={!!all.seatless} onToggle={() => setAll((a) => ({ ...a, seatless: !a.seatless }))} controls="co-ad-seat-l" n={seatless.length} />}
    </Section>
  )

  // ---- My Day: Today (atRisk — a release whose step is not in leads, in words) ----
  const todayRows = risk.rows.filter((x) => x.content_id !== heroId)
  // The card's piece is not listed again; when it was Today's only one, the card says where it is.
  const todayCard = (
    <Section id="co-ad-today-h" label={tx('Today')} n={risk.rows.length} unit="step" className="co-ad-today2"
      none={risk.rows.length ? tx('Shown above: {n}', { n: risk.rows.length }) : tx('Nothing goes out today.')}>
      {todayRows.length > 0 && (
        <Rows id="co-ad-today-l">
          {(all.today ? todayRows : todayRows.slice(0, FIRST)).map((x) => (
            <Row key={`${x.content_id}:${x.phase}`} kind={KIND_OF[x.phase] || 'edit'} title={x.title} onOpen={() => onOpen(x.content_id)} stops={stopsOf(x.content_id)}
              line={`${(WHAT[x.phase] || WHAT.edit)()} · ${whose(x)}`}
              badge={x.risk
                ? <Badge tone="late">{(NOT_IN[x.risk.phase] || NOT_IN.shoot)(x.time ? hhmm(x.time) : tx('today'))}</Badge>
                : x.time ? <Badge icon="clock">{hhmm(x.time)}</Badge> : null} />
          ))}
        </Rows>
      )}
      {todayRows.length > FIRST && <MoreRows open={!!all.today} onToggle={() => setAll((a) => ({ ...a, today: !a.today }))} controls="co-ad-today-l" n={todayRows.length} />}
    </Section>
  )

  // ---- My Day: Overdue (teamOverdue — one row a piece, the step that can move) ----
  const odRows = od.rows.filter((r) => r.content_id !== heroId)
  const review = () => {
    setRecordOpen(true)
    focusNext.current = '#co-ad-hk'
    if (TABS && tab !== 'team') pick('team')
    else tick((k) => k + 1)
  }
  const archLine = od.archived > 0 && archiveDays > 0 && (() => {
    const s = tx('{n} more are over {d} days late · Review them', { n: od.archived, d: archiveDays })
    const i = s.lastIndexOf(' · ')
    return (
      <p className="co-ad-arch">
        <span>{i > 0 ? s.slice(0, i) : s}</span>
        {i > 0 && <>{' '}<span aria-hidden="true">·</span>{' '}<button type="button" className="co-link co-ad-arch-b" onClick={review}>{s.slice(i + 3)}</button></>}
      </p>
    )
  })()
  const overdueCard = (
    <Section id="co-ad-od-h" label={tx('Overdue')} n={od.total} tone="late" className="co-ad-bands co-ad-od2"
      none={!od.total ? tx('Nothing is late. Every step is on its day.') : odRows.length || od.archived ? '' : tx('Shown above: {n}', { n: 1 })}>
      {odRows.length > 0 && (
        <Rows id="co-ad-od-l">
          {(all.late ? odRows : odRows.slice(0, FIRST)).map((r) => {
            const who = r.holder ? person(r.holder) : null
            const waits = [...new Set(r.then.flatMap((s) => s.owners || []))].filter((id) => !(r.owners || []).includes(id))
              .map((id) => firstName(person(id))).filter(Boolean)
            return (
              <Row key={r.content_id} kind={KIND_OF[r.phase] || 'edit'} title={r.title} onOpen={() => onOpen(r.content_id)} stops={stopsOf(r.content_id)}
                line={`${(WHAT[r.phase] || WHAT.edit)()} · ${who ? firstName(who) : tx('nobody yet')} · ${lateWords(r.days_late)}`}
                sub={waits.length ? tx('Waits on it: {names}', { names: waits.join(', ') }) : ''}
                badge={r.ask ? <Badge tone="wait">{tx('Move asked')}</Badge> : null}
                action={!r.ask && who && who.id !== user.id ? <RemindButton small user={user} taskId={r.content_id} person={who} today={today} title={r.title} /> : null} />
            )
          })}
        </Rows>
      )}
      {odRows.length > FIRST && <MoreRows open={!!all.late} onToggle={() => setAll((a) => ({ ...a, late: !a.late }))} controls="co-ad-od-l" n={odRows.length} />}
      {archLine || null}
    </Section>
  )

  // ---- Team: who does what today ----
  const ttName = tx('Who does what today')
  const people = [...(nobody.length && show !== 'makers' ? [{ id: 0, nobody: true, name: tx('Nobody yet'), items: nobody, busy: [], working: true, st: { k: '', t: tx('Press it to choose who films it') } }] : []), ...rows]
  const allOff = people.some((q) => !q.nobody) && people.filter((q) => !q.nobody).every((q) => !q.working)   // the rows on screen: a day none of them works is said once, over the table
  const drawers = (p) => (
    <>
      {due && due.id === p.id && (() => {
        const list = dueOf(p, due.k)
        const k = `d${p.id}${due.k}`
        const kind = due.k === 'cut' ? 'edit' : 'design'
        return (
          <div role="row" className="co-ad-drw-r">
            <div role="cell" className="co-ad-drw" aria-label={due.k === 'cut' ? tx('Edits due today') : tx('Covers due today')}>
              <Rows id={`co-ad-du-${p.id}`}>
                {(all[k] ? list : list.slice(0, FIRST)).map((x) => (
                  <Row key={x.content_id} kind={kind} title={x.title} onOpen={() => onOpen(x.content_id)} stops={stopsOf(x.content_id)}
                    line={(x.channels || []).map((c) => byKey[c]?.label || c).join(' · ')} badge={<Badge tone="wait">{tx('due today')}</Badge>} />
                ))}
              </Rows>
              {list.length > FIRST && <MoreRows open={!!all[k]} onToggle={() => setAll((a) => ({ ...a, [k]: !a[k] }))} controls={`co-ad-du-${p.id}`} n={list.length} />}
            </div>
          </div>
        )
      })()}
      {held === p.id && (
        <div role="row" className="co-ad-drw-r">
          <div role="cell" className="co-ad-drw" id={`co-ad-od-${p.id}`}>
            <Rows id={`co-ad-odl-${p.id}`}>
              {(all[`h${p.id}`] ? holdsOf(p.id) : holdsOf(p.id).slice(0, FIRST)).map((x) => (
                <Row key={x.content_id} kind={KIND_OF[x.phase] || 'edit'} title={x.title} onOpen={() => onOpen(x.content_id)} stops={stopsOf(x.content_id)}
                  line={(WHAT[x.phase] || WHAT.edit)()} badge={<Badge tone="late">{lateWords(x.days_late)}</Badge>} />
              ))}
            </Rows>
            {holdsOf(p.id).length > FIRST && <MoreRows open={!!all[`h${p.id}`]} onToggle={() => setAll((a) => ({ ...a, [`h${p.id}`]: !a[`h${p.id}`] }))} controls={`co-ad-odl-${p.id}`} n={holdsOf(p.id).length} />}
          </div>
        </div>
      )}
    </>
  )
  const deskTable = (
    <div className={'co-ad-frame' + (more ? ' more' : '')}>
      <div className="co-ad-wrap" ref={wrapRef} onScroll={fade} role="region" tabIndex={0} aria-label={tx('Timetable, scrolls sideways')}>
        <div className="co-ad" role="table" aria-label={tx('Timetable')}>
          <div className="co-ad-r co-ad-hd" role="row">
            <span className="co-ad-who" role="columnheader"><span className="sr-only">{tx('People')}</span></span>
            <div className={'co-ad-trk' + (early ? ' early' : '')} role="columnheader" ref={hdRef}>
              <span className="sr-only">{tx('Hours')}</span>
              {hours.map((m, k) => !nearNow(m) && <span key={m} className={'co-ad-hr' + (hours.length > 9 && k % 2 ? ' co-ad-hr-skip' : '')} style={{ left: pct(m) }} aria-hidden="true">{ofMin(m)}</span>)}
              {now != null && (early
                ? <b className="co-ad-nowl early">{tx('Now: {time}, before the day starts', { time: ofMin(now) })}</b>
                : now <= end && <b className="co-ad-nowl" style={{ left: `clamp(24px, ${pct(now)}, calc(100% - 24px))` }}>{ofMin(now)}</b>)}
            </div>
            <span className="co-ad-dk co-ad-owed" role="columnheader">{tx('Due and overdue')}</span>
          </div>
          {people.map((p) => (
            <div key={p.id} className="co-ad-rg" role="rowgroup">
              <div className={'co-ad-r' + (p.nobody ? ' nobody' : '')} role="row">
                <span className="co-ad-who" role="rowheader">
                  {p.nobody ? <span className="co-ad-q" aria-hidden="true">?</span> : <Face person={person(p.id) || { name: p.name }} />}
                  <span><b>{p.nobody ? p.name : firstName(person(p.id) || p)}</b><small className={p.st.k}>{p.st.t}</small></span>
                </span>
                {track(p, p.items)}
                <span className="co-ad-dk co-ad-owed" role="cell">{p.nobody ? null : <>{dueCell(p)}{holdBtn(p)}</>}</span>
              </div>
              {!p.nobody && drawers(p)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
  // A phone: no hour grid (R04) — a person a row, the day's things one press away.
  const phoneList = (
    <ul className="co-ad-ppl">
      {people.map((p) => {
        const timed = p.items.filter((i) => (i.kind === 'shoot' || i.kind === 'post') && i.from && !i.done).sort((a, b) => toMin(a.from) - toMin(b.from))
        const cuts = p.nobody ? [] : dueOf(p, 'cut'), arts = p.nobody ? [] : dueOf(p, 'art'), loose = p.nobody ? [] : looseOf(p)
        const h = p.nobody ? [] : holdsOf(p.id)
        const dueN = cuts.length + arts.length + loose.length + timed.length
        const has = dueN + h.length > 0
        const lid = `co-ad-pp-${p.id}`
        const isOpen = open === p.id
        const head = (
          <>
            {p.nobody ? <span className="co-ad-q" aria-hidden="true">?</span> : <Face person={person(p.id) || { name: p.name }} size="sm" />}
            <span className="co-ad-ppl-t"><b>{p.nobody ? p.name : firstName(person(p.id) || p)}</b>{p.st.t && <small className={p.st.k}>{p.st.t}</small>}</span>
            <span className="co-ad-ppl-r">
              {dueN > 0 && <span className="co-ad-pill">{tx('{n} due', { n: dueN })}</span>}
              {h.length > 0 && <span className="co-ad-pill"><span aria-hidden="true">{tx('{n} overdue · {d} d', { n: h.length, d: oldest(h) })}</span><span className="sr-only">{odName(p, h)}</span></span>}
              {has && <ChevronDown size={16} className="co-ad-ppl-c" aria-hidden="true" />}
            </span>
          </>
        )
        return (
          <li key={p.id} className={'co-ad-ppl-i' + (p.nobody ? ' nobody' : '')}>
            {has
              ? <button type="button" className="co-ad-ppl-b" aria-expanded={isOpen} aria-controls={lid} onClick={() => setOpen(isOpen ? null : p.id)}>{head}</button>
              : <div className="co-ad-ppl-b">{head}</div>}
            {has && isOpen && (
              <Rows id={lid}>
                {timed.map((i) => {
                  const b = i.to ? toMin(i.to) : toMin(i.from) + 60
                  return (
                    <Row key={`t${i.kind}${i.content_id}`} kind={i.kind === 'post' ? 'send' : 'shoot'} title={i.title} onOpen={() => onOpen(i.content_id)}
                      line={i.kind === 'post' ? `${hhmm(i.from)} · ${tx('Goes out')}` : `${hhmm(i.from)}–${ofMin(b)} · ${tx('Shoot')}`} />
                  )
                })}
                {cuts.map((i) => <Row key={`c${i.content_id}`} kind="edit" title={i.title} onOpen={() => onOpen(i.content_id)} line={tx('Edit due')} />)}
                {arts.map((i) => <Row key={`a${i.content_id}`} kind="design" title={i.title} onOpen={() => onOpen(i.content_id)} line={tx('Cover due')} />)}
                {loose.map((i) => <Row key={`l${i.kind}${i.content_id}`} kind={i.kind === 'post' ? 'send' : 'shoot'} title={i.title} onOpen={() => onOpen(i.content_id)} line={i.kind === 'post' ? tx('Goes out') : tx('Shoot, no hour')} />)}
                {h.map((x) => <Row key={`h${x.content_id}`} kind={KIND_OF[x.phase] || 'edit'} title={x.title} onOpen={() => onOpen(x.content_id)} line={`${(WHAT[x.phase] || WHAT.edit)()} · ${lateWords(x.days_late)}`} />)}
              </Rows>
            )}
          </li>
        )
      })}
    </ul>
  )
  const timetable = (
    <section className="co-sec co-ad-tt" aria-labelledby="co-ad-tt-h2">
      <div className="co-ad-tt-h">
        <h2 className="co-sec-h" id="co-ad-tt-h2" tabIndex={-1}>{ttName}</h2>
        <select className="select co-ad-show" aria-label={tx('Show')} value={show} onChange={(e) => setShow(e.target.value)}>
          {SHOW.map(([k, label]) => <option key={k} value={k}>{tx('Show: {filter}', { filter: label })}</option>)}
        </select>
      </div>
      {allOff && <p className="co-ad-tt-sub">{tx('Nobody’s working day. What still has its hour is here.')}</p>}
      {narrow ? phoneList : deskTable}
      {rows.length === 0 && <p className="co-sec-none">{show === 'free' ? tx('Nobody is free right now.') : tx('Nobody has a shoot, an edit or a post on {day}.', { day: dayInLine(day, today) })}</p>}
      {rows.length === 0 && show === 'busy' && everyone.length > 0 && <p className="co-sec-none">{tx('The whole team is free: press “Everyone”.')}</p>}
    </section>
  )
  // Who is free now: never the viewer, never somebody with no seat (R44).
  const freeNow = now != null ? everyone.filter((p) => p.st.k === 'free' && p.id !== user.id && (crew(p) || p.role === 'member')) : []
  const freeLine = freeNow.length > 0 && (
    <p className="co-ad-free2">{tx('Free now: {names}', { names: freeNow.map((p) => firstName(person(p.id) || p)).join(', ') })}</p>
  )
  const housekeeping = (
    // "Review them" lands here (a wrapper this page owns: Housekeeping draws nothing until its own read is in).
    <div id="co-ad-hk" className="co-ad-hk" role="group" tabIndex={-1} aria-label={tx('Overdue on the board')}>
      {hk === null ? (TABS || !hkNote) && <DayNote kind="side" text={tx('Could not check the archive')} onRetry={loadHk} /> : <Housekeeping />}
    </div>
  )
  // Round 14: the deadline lists of before, folded — nothing is taken away (r10).
  const deadlines = (
    // The record (the owner, 15 Nov 2026: "unnecessary, but I have to keep it — not comfy"): the archive card and
    // the deadline lists of before under one quiet line, shut until wanted; "Review them" opens it.
    <details className="co-card sd-fold co-ad-dl co-ad-record" open={recordOpen} onToggle={(e) => setRecordOpen(e.currentTarget.open)}>
      <summary>
        <h2 className="co-sec-h co-ad-dl-h">{tx('The record')}</h2>
        <span className="co-ad-dl-sub">{tx('{n} overdue · {m} due today · the pieces headed for the archive', { n: overdue.length, m: dueToday.length })}</span>
        <ChevronDown size={14} className="cd-done-caret" aria-hidden="true" />
      </summary>
      {housekeeping}
      {GROUPS.slice(1).map((g) => (
        <div key={g.key} className={'co-grp' + (g.list.length ? '' : ' none')}>
          <div className="co-grp-h">
            <h3>{g.label()}{g.list.length > 0 && <span>{g.list.length}</span>}</h3>
            {g.list.length === 0 && <p>{g.none()}</p>}
          </div>
          {(all[g.key] ? g.list : g.list.slice(0, FIRST)).map(g.draw)}
          {g.list.length > FIRST && (
            <button type="button" className="co-link co-more-rows" onClick={() => setAll((a) => ({ ...a, [g.key]: !a[g.key] }))}>
              {all[g.key] ? tx('Show fewer') : tx('Show all {n}', { n: g.list.length })}
            </button>
          )}
        </div>
      ))}
    </details>
  )

  // The ask in the card is not listed again.
  const asksListed = first && first.kind === 'ask' ? asksF.filter((a) => a.id !== first.ask.id) : asksF
  const myDay = (
    <>
      {/* Steps with nobody in the seat stand first, never folded: a folded
          list is where "I didn't see it" lives (the role play, 24 Oct 2026). */}
      {seatlessCard}
      {/* adminFirst: the one thing to do first. */}
      {hero()}
      {hkNote}
      <AdminAsks asks={asksListed} err={asksErr} onRetry={loadAsks} answer={answer} onOpen={onOpen} afterId="co-ad-today-h" />
      {todayCard}
      {overdueCard}
    </>
  )
  const teamPart = (
    <>
      {timetable}
      {freeLine}
      {deadlines}
    </>
  )

  const tabKey = (e) => {
    const order = ['day', 'team']
    const i = order.indexOf(tab)
    const to = e.key === 'ArrowRight' ? order[(i + 1) % 2] : e.key === 'ArrowLeft' ? order[(i + 1) % 2] : e.key === 'Home' ? 'day' : e.key === 'End' ? 'team' : null
    if (!to) return
    e.preventDefault()
    pick(to)
    tabRefs[to].current?.focus()
  }

  return (
    <div className={'co co-admin' + (TABS ? ' co-ad-tabbed' : '')}>
      <DayHead today={day} title={title}>{controls}</DayHead>
      {stale && <DayNote kind="stale" at={lastAt} onRetry={load} />}
      {TABS ? (
        <>
          <div className="co-ad-tabs" role="tablist" onKeyDown={tabKey} data-at={tab}>
            <span className="co-ad-tabs-pill" aria-hidden="true" />
            <button type="button" role="tab" id="co-ad-tab-day" ref={tabRefs.day} aria-selected={tab === 'day'} aria-controls="co-ad-p-day"
              tabIndex={tab === 'day' ? 0 : -1} onClick={() => pick('day')}>{tx('My Day')}</button>
            <button type="button" role="tab" id="co-ad-tab-team" ref={tabRefs.team} aria-selected={tab === 'team'} aria-controls="co-ad-p-team"
              tabIndex={tab === 'team' ? 0 : -1} onClick={() => pick('team')}>{tx('Team')}</button>
          </div>
          <div className="co-ad-panel" role="tabpanel" id="co-ad-p-day" aria-labelledby="co-ad-tab-day" hidden={tab !== 'day'}>{myDay}</div>
          {(teamSeen || tab === 'team') && (
            <div className="co-ad-panel" role="tabpanel" id="co-ad-p-team" aria-labelledby="co-ad-tab-team" hidden={tab !== 'team'}>{teamPart}</div>
          )}
        </>
      ) : (
        <>
          {myDay}
          {teamPart}
        </>
      )}
    </div>
  )
}
