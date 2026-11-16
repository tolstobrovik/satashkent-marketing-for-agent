import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react'
import TimeBand from './TimeBand.jsx'
import { Face, dayShort, firstName } from './CoachParts.jsx'
import { addDays } from '../lib/coach.js'
import Modal from './Modal.jsx'
import DayPick, { TimePick } from './DayPick.jsx'
import { useClash } from './ClashDialog.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { todayISO, TELEGRAM_TYPES } from '../lib/constants.js'
import { toast } from '../lib/toast.js'
import { tr as tx } from '../lib/i18n.jsx'
import { useChannels } from '../lib/channels.jsx'
import CharCount, { limitOf, charsOf } from './CharCount.jsx'
import UploadField from './UploadField.jsx'
import PersonPick from './PersonPick.jsx'

// ---- the next step, as one sheet ------------------------------------------------
//
// Moving a piece on used to be a drag, then a refusal, then a hunt through the
// task window for the box the refusal was about, then the drag again — once
// per missing thing. The rules behind that are good ones (a shoot is booked
// with a person, a day, an hour and a script; a piece goes out with its link);
// what was wrong was finding them out one at a time, by being told no.
//
// This asks the server first. A dry run (`PATCH …?dry=1`) names every field the
// move would be refused for, and the handover (`GET …/handover`) says who may
// take the next stage — and the answers become ONE short form: only the
// questions this piece has not answered yet, in plain words, with one button
// that is the move itself. Nothing here knows a rule; a rule added on the
// server tomorrow turns up as one more question.
//
// T-07 (the TZ of 19 October 2026): it is drawn as a SHEET — 520 px in the
// middle of a desk, a sheet from the bottom edge of a phone (Modal.jsx,
// `kind="sheet"`) — from the board and from the task window alike. The window
// used to draw the same questions inline under "Your step now", where the time
// rows wrapped to four rows of three; the board drew them in a panel at the
// card, 820 px wide for the shoot. One sheet now: one question in sight at a
// time (round 8, the owner's "one question at a time"), an answer that is a
// choice is one large press and goes on by itself, the last answer is the
// move, and the footer says what happens after the press. The press that
// opened the sheet is the move when there is nothing to ask.
//
// Who films, the day and the hours are ONE question: the time band
// (components/TimeBand.jsx) — "When do you film, and who films?".
//
// `seat` is the one question the PAGE adds to the server's: the seat of the
// stage this move lands on, when nobody holds it (lib/coach.js seatAt). The
// server would take the move without it — and leave the piece on a stage with
// nobody to make it — so the button waits for that name.

// How each field is asked. A field the server names that is not listed here is
// asked as a line of text, with the server's own sentence above it.
const ASK = {
  operator_id: { q: 'Who films it?', kind: 'person', role: 'operator' },
  editor_id: { q: 'Who edits it?', kind: 'person', role: 'editor' },
  designer_id: { q: 'Who designs it?', kind: 'person', role: 'designer' },
  reviewer_id: { q: 'Who checks it?', kind: 'person', role: 'reviewer' },
  recording_date: { q: 'When is the shoot?', kind: 'date' },
  recording_time: { q: 'What time?', kind: 'hours' },
  edit_ready_date: { q: 'When must the edit be ready?', kind: 'date' },
  design_ready_date: { q: 'When must the artwork be ready?', kind: 'date' },
  release_date: { q: 'When does it go out?', kind: 'date' },
  script: { q: 'What is filmed? (the script)', kind: 'text' },
  tz: { q: 'What should be made? (ТЗ)', kind: 'text' },
  description: { q: 'A short description', kind: 'text' },
  reference_text: { q: 'An example to follow — a link or a few words', kind: 'line', ph: 'https://… or: warm light, slow walk, 30 seconds' },
  format: { q: 'Format', kind: 'choice' },
  rubrika: { q: 'Rubrika', kind: 'choice' },
  telegram_type: { q: 'What kind of Telegram piece is it?', kind: 'choice' },
  post_link: { q: 'Link to the published post', kind: 'line', ph: 'https://' },
  // Uploaded here first (UploadField), a Drive link only if it is already there (the owner, 13 Oct).
  shot_link: { q: 'The footage', kind: 'upload', job: 'shoot', ph: 'https://drive.google.com/…', optional: true },
  ready_link: { q: 'The edit', kind: 'upload', job: 'edit', ph: 'https://drive.google.com/…', optional: true },
}
const ORDER = Object.keys(ASK)
// The four fields the time band answers together.
const SHOOT = ['operator_id', 'recording_date', 'recording_time', 'recording_end']

// What a move is usually told, by the stage it lands on. The server asks an
// admin nothing — they are the one catching the board up on work that already
// happened — so for an admin the same questions are OFFERED rather than
// demanded: a shoot handed out with nobody's name on it is still a shoot
// nobody is holding, and this is the moment that is easiest to say whose it is.
const OFFER = [
  [/to\s*shoot|shooting|s[yj]omka/i, () => ['operator_id', 'recording_date', 'recording_time', 'script']],
  [/editing|montaj/i, (t) => (['reel', 'video'].includes(t.type) ? ['editor_id', 'tz', 'reference_text', 'release_date'] : t.type === 'post' ? ['designer_id', 'tz'] : [])],
  [/^ready$|review|tayyor/i, () => ['reviewer_id']],
]

// What happens after the press, in one sentence — said under the button in the
// sheet and in the window. Named after whoever the answers name, so "Aziz gets
// the booking question" is Aziz the moment he is pressed.
export function afterWords(item, to, verb, values = {}, nameOf = () => '') {
  const label = String(to?.label || '')
  const who = (k) => nameOf(Number(values[k] ?? item[k]) || null)
  if (verb === 'Publish' || to?.is_final) return tx('The task moves to Published. The team sees it is out. Nothing more to do.')
  if (verb === 'Send to the shoot' || /to\s*shoot|shooting|s[yj]omka/i.test(label)) {
    const n = who('operator_id')
    return n ? tx('{name} gets the booking question.', { name: n }) : tx('The person who films gets the task and says if they can come.')
  }
  if (verb === 'Send to the designer') {
    const n = who('designer_id')
    return `${n ? tx('{name} gets the task with your words and draws it.', { name: n }) : tx('The designer gets the task with your words and draws it.')} ${tx('Then it comes back to you to check.')}`
  }
  if (verb === 'Send to editing' || verb === 'Start the work') {
    const n = who('editor_id')
    if (n) return tx('{name} gets the footage and starts the edit.', { name: n })
  }
  return tx('The task moves to «{stage}».', { stage: tx(label) })
}

export default function NextStep({ item, to, verb = '', title: given = '', quiet = false, onDone, onCancel, seat = null }) {
  const { user } = useAuth()
  const { byKey } = useChannels()
  const [asks, setAsks] = useState(null)        // [{ field, error?, wrong?, gate? }]
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [fatal, setFatal] = useState('')
  const [rules, setRules] = useState(null)
  const [team, setTeam] = useState([])
  const [clashUi, askClash] = useClash()
  const [clashing, setClashing] = useState(false)
  const [at, setAt] = useState(0)               // the question in sight
  const today = todayISO()

  const bodyOf = (v) => {
    const body = { status_id: to.id }
    for (const [k, val] of Object.entries(v)) {
      if (val === '' || val == null) continue
      // An answer to a question no longer asked is not sent: a reference typed
      // here would replace one added in the window meanwhile (the bug hunt, 14 Oct 2026).
      if (asks && !asks.some((a) => a.field === k) && !SHOOT.includes(k)) continue
      if (k === 'reviewer_id') body.reviewer_ids = [Number(val)]
      else body[k] = /_id$/.test(k) ? Number(val) : val
    }
    return body
  }
  // What the server would refuse this move for, with these answers in hand.
  const dry = (v) => api.patch(`/content/${item.id}?dry=1`, bodyOf(v)).then(() => [], (e) => {
    if (Array.isArray(e.data?.missing)) return e.data.missing
    const field = e.data?.field || (e.data?.needs === 'post_link' ? 'post_link' : null)
    if (field) return [{ field, error: e.message }]
    throw e
  })
  const move = async (v, extra = {}) => {
    const u = await api.patch(`/content/${item.id}`, { ...bodyOf(v), ...extra })
    if (!quiet) toast(tx('Done — «{title}» moved on', { title: item.title }))
    onDone(u)
  }

  useEffect(() => {
    let alive = true
    api.cached('/fields').then((f) => alive && setRules(f)).catch(() => {})
    api.cached('/users').then((u) => alive && setTeam(Array.isArray(u) ? u : [])).catch(() => {})
    Promise.all([
      api.get(`/content/${item.id}/handover?to=${to.id}`).then((d) => d.gates || [], () => []),
      dry({}),
    ]).then(async ([gates, missing]) => {
      if (!alive) return
      const list = []
      const seen = new Set()
      const add = (a) => { if (!seen.has(a.field)) { seen.add(a.field); list.push(a) } }
      // Two answers from the server, and they are not the same question. The
      // dry run says what the move would be REFUSED for; the handover says who
      // could take each stage the move passes. A seat the handover offers and
      // the dry run does not demand is offered here too, not demanded — or the
      // button stayed asleep on a move the server would take: a poster sent to
      // its designer waited on "Who films it?", because the handover lists the
      // shooting stage for every piece that passes it, filmed or not.
      //
      // One seat is demanded whatever the dry run says: `seat`, the stage the
      // piece LANDS on. (Offering every seat let "Start the work" send a piece
      // to Editing with no editor — the window said "nothing is missing", took
      // the press, and then said "nobody is named to edit it yet".)
      const demanded = new Set(missing.map((m) => m.field))
      if (seat) demanded.add(seat)
      for (const g of gates) {
        if (!g.current?.length) add({ field: g.owner_field, gate: g, optional: !demanded.has(g.owner_field) })
        if (g.link_field && !g.link_ok) add({ field: g.link_field, optional: !demanded.has(g.link_field) })
      }
      for (const m of missing) add(m)
      // The landing seat when no gate offered it (a designer has no gate).
      if (seat) add({ field: seat })
      // An hour is asked with its day, and the end of it with the start.
      if (seen.has('recording_date') && !seen.has('recording_time') && !item.recording_time) add({ field: 'recording_time' })
      // The band answers these together: a missing end is not a question of its own.
      if (seen.has('recording_time') && !seen.has('recording_end') && !item.recording_end) add({ field: 'recording_end', optional: true })
      if (list.length === 0 && user?.role === 'admin') {
        const offer = (OFFER.find(([re]) => re.test(String(to.label || '')))?.[1](item) || [])
          .filter((f) => item[f] == null || item[f] === '' || (f === 'reviewer_id' && !item.reviewer_id))
        for (const f of offer) add({ field: f, optional: true })
      }
      if (list.length === 0) {
        // Nothing to ask: the press that opened the sheet was the move.
        try { await move({}) } catch (e) { if (alive) { setAsks([]); setFatal(e.message) } }
        return
      }
      // What is needed first, what is only offered after it; each in the
      // order a person would answer them.
      const offered = (a) => (ASK[a.field]?.optional || a.optional ? 1 : 0)
      list.sort((a, b) => offered(a) - offered(b) || (ORDER.indexOf(a.field) + 99) % 99 - (ORDER.indexOf(b.field) + 99) % 99)
      setAsks(list)
      setErrors(Object.fromEntries(list.filter((a) => a.wrong).map((a) => [a.field, a.error])))
      // A post over its channel's length limit is fixed, not retyped: the box
      // opens holding the words it has, with the count under it.
      if (list.some((a) => a.field === 'description' && a.wrong))
        setValues((old) => ({ description: item.description || '', ...old }))
    }).catch((e) => { if (alive) { setAsks([]); setFatal(e.message) } })
    return () => { alive = false }
  }, [item.id, to.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => { setValues((old) => ({ ...old, [k]: typeof v === 'function' ? v(old[k] ?? '') : v })); setErrors((old) => ({ ...old, [k]: '' })); setFatal('') }

  const go = async (extra = {}) => {
    if (busy) return
    setBusy(true); setFatal('')
    try {
      const still = await dry(values)
      if (still.length) {
        setAsks((old) => {
          const have = new Set((old || []).map((a) => a.field))
          return [...(old || []), ...still.filter((m) => !have.has(m.field))]
        })
        setErrors(Object.fromEntries(still.map((m) => [m.field, m.wrong || values[m.field] ? m.error : tx('This one is needed')])))
        return
      }
      await move(values, extra)
    } catch (e) {
      if (askClash(e, () => go({ force: true }), onCancel)) { setClashing(true); return }
      const field = e.data?.field || (e.data?.needs === 'post_link' ? 'post_link' : null)
      if (field) {
        setAsks((old) => ((old || []).some((a) => a.field === field) ? old : [...(old || []), { field }]))
        setErrors((old) => ({ ...old, [field]: e.message }))
      } else setFatal(e.message)
    } finally { setBusy(false) }
  }

  // Who can be picked for a seat: the handover's own short list where there is
  // one, otherwise everybody who holds that hat.
  const peopleFor = (a) => {
    const role = ASK[a.field]?.role
    if (a.gate) return { first: a.gate.candidates || [], rest: a.gate.others || [] }
    const holds = (u) => (role === 'reviewer' ? (u.role === 'admin' || !!u.permissions?.review_publish) : (u.crew_roles || []).includes(role))
    return { first: team.filter(holds), rest: team.filter((u) => !holds(u) && u.role !== 'ambassador') }
  }
  const choicesFor = (field) => (field === 'telegram_type'
    ? TELEGRAM_TYPES.map((t) => ({ value: t.key, label: tx(t.label) }))
    : (rules?.[field]?.options || []).map((o) => ({ value: o, label: o })))
  const nameOf = (id) => firstName(team.find((u) => u.id === id))

  const title = given || tx(verb)
  const ready = useMemo(() => (asks || []).every((a) => {
    const spec = ASK[a.field]
    return spec?.optional || a.optional || String(values[a.field] ?? '').trim() !== ''
  }), [asks, values])

  const leave = () => {
    if (busy) return
    const typed = Object.values(values).some((v) => String(v ?? '').trim() !== '')
    if (typed && !window.confirm(tx('Leave without saving what you entered?'))) return
    onCancel()
  }

  if (clashing && !fatal) return clashUi
  if (!asks) {
    return (
      <Modal kind="sheet" title={title} onClose={onCancel}>
        <div className="st-sub">{item.title}</div>
        <p className="muted">{tx('Checking what is needed…')}</p>
      </Modal>
    )
  }

  // ---- the time band: who films, the day and the hours, as one question ----
  const offeredAsk = (a) => !!(ASK[a.field]?.optional || a.optional)
  const shootAsks = asks.filter((a) => SHOOT.includes(a.field))
  const band = () => {
    const v = (k) => values[k] ?? item[k] ?? ''
    const err = SHOOT.map((k) => errors[k]).find(Boolean)
    const people = peopleFor(shootAsks.find((a) => a.field === 'operator_id') || { field: 'operator_id' })
    return (
      <div key="shoot" className={'ns-ask ns-band' + (err ? ' ns-bad' : '')}>
        <span className="ns-q">{tx('When do you film, and who films?')}
          {shootAsks.every(offeredAsk) && <span className="ns-opt"> · {tx('optional')}</span>}</span>
        <TimeBand compact
          day={v('recording_date')} onDay={(d) => set('recording_date', d)}
          value={{ from: String(v('recording_time')).slice(0, 5), to: String(v('recording_end')).slice(0, 5) }}
          onChange={({ from, to: until }) => { set('recording_time', from); set('recording_end', until) }}
          operatorId={Number(v('operator_id')) || null} onOperator={(id) => set('operator_id', id || '')}
          operators={people.first.length ? people.first : people.rest} excludeId={item.id} />
        {err && <span className="ns-err">{err}</span>}
      </div>
    )
  }
  // The questions as they are drawn: the band stands where its first field stood.
  const drawn = (list) => {
    const out = []
    for (const a of list) {
      if (!SHOOT.includes(a.field)) out.push(a)
      else if (!out.some((x) => x.field === 'shoot')) out.push({ field: 'shoot', optional: shootAsks.every(offeredAsk) })
    }
    return out
  }
  const answered = (a) => (a.field === 'shoot'
    ? shootAsks.filter((x) => !offeredAsk(x)).every((x) => String(values[x.field] ?? '').trim() !== '')
    : offeredAsk(a) || String(values[a.field] ?? '').trim() !== '')
  const steps = drawn(asks)
  const i = Math.min(at, Math.max(0, steps.length - 1))
  const cur = steps[i]
  const last = i >= steps.length - 1
  // A choice pressed is the answer: it goes on by itself.
  const pick = (field, value) => { set(field, value); setAt((n) => Math.min(n + 1, steps.length - 1)) }

  // One question, drawn the way its field is asked.
  const question = (a) => {
    if (a.field === 'shoot') return band()
    const spec = ASK[a.field] || { q: null, kind: 'line' }
    const err = errors[a.field]
    const id = `ns-${a.field}`
    const v = values[a.field] ?? ''
    // T-07: a day is three buttons sized by their label — tomorrow, the day
    // after, and "Another day" on the calendar card — never a week of chips.
    const quick = [addDays(today, 1), addDays(today, 2)]
    return (
      <div key={a.field} className={'ns-ask' + (err ? ' ns-bad' : '')}>
        <label className="ns-q" htmlFor={id}>
          {spec.q ? tx(spec.q) : a.error}
          {(spec.optional || a.optional) && <span className="ns-opt"> · {tx('optional')}</span>}
        </label>
        {spec.kind === 'person' && (() => {
          const { first, rest } = peopleFor(a)
          if (first.length + rest.length <= 8) {
            return (
              <span className="co-ask-people" role="group" aria-label={tx(spec.q)}>
                {(first.length ? first : rest).map((u) => (
                  <button key={u.id} type="button" className="co-ask-person" aria-pressed={String(v) === String(u.id)} disabled={busy}
                    onClick={() => pick(a.field, u.id)}><Face person={u} size="sm" /><b>{u.name}</b></button>
                ))}
              </span>
            )
          }
          // Round 14: who can first, everyone else a press away, a few letters to find anyone (PersonPick).
          return <PersonPick id={id} value={v || null} disabled={busy} label={tx(spec.q)} first={first} rest={rest} onChange={(uid) => set(a.field, uid)} />
        })()}
        {spec.kind === 'date' && (
          <span className="co-ask-days" role="group" aria-label={tx(spec.q)}>
            {quick.map((d, n) => (
              <button key={d} type="button" className="co-chip co-ask-day" aria-pressed={v === d} disabled={busy} onClick={() => pick(a.field, d)}>
                <b>{n === 0 ? tx('Tomorrow') : dayShort(d)}</b>
              </button>
            ))}
            <DayPick id={id} value={quick.includes(v) ? '' : v} min={today} disabled={busy} label={tx('Another day')} placeholder={tx('Another day…')}
              className={'co-ask-day co-ask-other' + (v && !quick.includes(v) ? ' sel' : '')} onChange={(d) => set(a.field, d)} />
          </span>
        )}
        {spec.kind === 'hours' && (
          <span className="ns-hours">
            <TimePick id={id} value={v} disabled={busy} label={tx(spec.q)} onChange={(t) => set(a.field, t)} />
            <span>–</span>
            <TimePick value={values.recording_end ?? ''} disabled={busy} label={tx('until')} onChange={(t) => set('recording_end', t)} />
          </span>
        )}
        {spec.kind === 'text' && (
          <textarea id={id} className="input" rows={3} value={v} disabled={busy} onChange={(e) => set(a.field, e.target.value)} />
        )}
        {a.field === 'description' && <CharCount text={v} channels={item.channels} />}
        {spec.kind === 'line' && (
          <input id={id} className="input" value={v} placeholder={spec.ph ? tx(spec.ph) : ''} disabled={busy} onChange={(e) => set(a.field, e.target.value)} />
        )}
        {spec.kind === 'upload' && (
          <UploadField item={item} kind={spec.job} id={id} value={v} placeholder={spec.ph} busy={busy} onLink={(next) => set(a.field, next)} />
        )}
        {spec.kind === 'choice' && (choicesFor(a.field).length > 0 ? (
          <select id={id} className="select" value={v} disabled={busy} onChange={(e) => set(a.field, e.target.value)}>
            <option value="">{tx('Choose…')}</option>
            {choicesFor(a.field).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input id={id} className="input" value={v} disabled={busy} onChange={(e) => set(a.field, e.target.value)} />
        ))}
        {/* Over the length limit the count under the box says why, in the reader's language. */}
        {err && !(a.field === 'description' && charsOf(v) > (limitOf(item.channels, byKey)?.char_limit ?? Infinity)) && <span className="ns-err">{err}</span>}
      </div>
    )
  }

  // The footer: the dots only when there is more than one question (the one
  // ruby dot under a single question was the "stray red dot" of the TZ), the
  // way back, the way on — and under the move itself what happens after it.
  const button = (
    <button type="button" className="co-btn co-btn-p st-go" disabled={busy || !ready} onClick={() => go()}>
      {busy ? tx('Saving…') : title}
    </button>
  )
  return (
    <Modal kind="sheet" title={title} onClose={leave}
      footer={(
        <>
          {last && !fatal && <p className="co-after co-sheet-after"><b>{tx('After you press:')}</b> {afterWords(item, to, verb, values, nameOf)}</p>}
          {steps.length > 1 && (
            <span className="co-ask-dots" aria-label={tx('{n} of {of}', { n: i + 1, of: steps.length })}>
              {steps.map((s, n) => <i key={s.field} className={n === i ? 'on' : n < i ? 'done' : ''} />)}
            </span>
          )}
          <span className="st-spacer" />
          {i > 0 && <button type="button" className="co-btn co-btn-q" disabled={busy} onClick={() => setAt(i - 1)}><ArrowLeft size={16} aria-hidden="true" />{tx('Back')}</button>}
          {last ? button : (
            <button type="button" className="co-btn co-btn-s" disabled={busy || !answered(cur)} onClick={() => setAt(i + 1)}>{tx('Next')}<ArrowRight size={16} aria-hidden="true" /></button>
          )}
        </>
      )}>
      <div className="ns co-sheet-b" key={cur?.field || 'none'}>
        <div className="st-sub">{item.title}</div>
        {cur ? question(cur) : <p className="st-none">{tx('Nothing else is needed.')}</p>}
        {fatal && <p className="gate-fatal"><AlertTriangle size={16} /> {fatal}</p>}
      </div>
    </Modal>
  )
}
