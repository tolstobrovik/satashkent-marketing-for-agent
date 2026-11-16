import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { X, ExternalLink, FileText, ChevronDown, Send, Check, Clock, ArrowRight, CalendarClock, Plus, Hand, Undo2, UploadCloud, ChevronLeft, Film, CalendarDays, Link2, History, Download, MessageSquare, MoreHorizontal, Trash2, CopyPlus, Copy, LayoutList, ClipboardList, Pencil } from 'lucide-react'
import HandIn from './HandIn.jsx'
import PravkaList from './PravkaList.jsx'
import FacePicker from './builder/FacePicker.jsx'
import PersonPick from './PersonPick.jsx'
import DayPick from './DayPick.jsx'
import NextStep, { afterWords } from './NextStep.jsx'
import Booking from './Booking.jsx'
import PravkaBox from './PravkaBox.jsx'
import PravkaNote from './PravkaNote.jsx'
import ChangeList, { newItem, noteOf } from './ChangeList.jsx'
import RefMedia from './RefMedia.jsx'
import CharCount from './CharCount.jsx'
import Reposts from './Reposts.jsx'
import TaskMore, { DayAsks, RaiseHand } from './TaskMore.jsx'
import TaskPlan from './TaskPlan.jsx'
import { LineField, LongField, ChipField } from './edit/Field.jsx'
import { KINDS } from './builder/StepType.jsx'
import { mayChange, stageOf } from '../lib/mayChange.js'
import '../styles-task.css'
import Material from './Material.jsx'
import { Fold } from './MediaGrid.jsx'
import { DEMO, useMaterial } from '../lib/demoMedia.js'
import { activityLine } from '../lib/activity.js'
import IgNumbers, { onInstagram } from './IgNumbers.jsx'
import { VoiceRecorder, VoicePlayer, canRecord } from './VoiceNote.jsx'
import { CopyName } from './DriveDrops.jsx'
import { TaskFiles, DriveBox } from './DriveFiles.jsx'
import { LinkText, LinkViewer, LinkPreview, embedOf } from './LinkView.jsx'
import {
  KIND, Chans, Badge, Face, CrewBadge, MakerBadge, RemindButton, remindHelp, isRemindLine, firstName, dayInLine, dayShort, hoursOf, lateWords, KindMark, ownOf, StageMark, KindTile,
} from './CoachParts.jsx'
import { Capsule, tracks } from './CoachBits.jsx'
import { api } from '../lib/api.js'
import { can, PRAVKA_ROUNDS, tashkentDay, typeLabel, todayISO, telegramTypeLabel, iconFor, typeInfo, TELEGRAM_TYPES } from '../lib/constants.js'
import { editDue, reviewDue } from '../lib/due.js'
import { actOf, kindOfAct, makerDay, wayOf, ownersOf, daysBetween, fixUntil, seatAt, putBack, HATS } from '../lib/coach.js'
import { deliveryHref, URL_RE, isSentence } from '../lib/text.js'
import { toast } from '../lib/toast.js'
import { useIsPhone } from '../lib/usePhone.js'
import { colorIndexOf, colorStyle, ownerIdOf, PALETTE } from '../lib/pieceColor.js'
import { tr as tx } from '../lib/i18n.jsx'
import { reachOf, adminOn } from '../lib/auth.jsx'
import { track, act as trackAct } from '../lib/track.js'

// ---- a task, in the window that slides in -------------------------------------------
//
// One window for everybody. The crew's task page and the maker's task page
// were two windows that showed the same piece from two chairs, and each ended
// in a button that opened a second window to ask what the first had not. The
// owner's choice was the opposite: the task comes in from the side of the
// page, over the list it was opened from, and reads top to bottom as an
// instruction —
//
//   what to do, step by step      a short numbered list, ticked as it is done
//   your step now                 the ONE ruby button, what is still missing
//                                 for it, and what happens after it is pressed
//   the way of this task          every stop from an idea to out, and who does it
//   the brief · files · comments  what to make, what to make it from, what was said
//
// and it is the same for the person holding the camera and the person running
// the piece. What differs is only "your step now", and that is one reading —
// actOf in lib/coach.js — of whose step it is.
//
// It knows no rule. Handing work in is components/HandIn.jsx and moving a
// piece on is components/NextStep.jsx, both drawn here `inline`: the same
// questions the server asks, the same writes, without a window of their own.
// A booking is answered through components/Booking.jsx, changes are asked
// through the same PravkaBox the full task sheet uses, and accepting, sending
// back and commenting are the server's own routes. So a rule added on the
// server tomorrow turns up here as one more question, or one more refusal said
// in the server's words.


const GO = { shoot: () => tx('Shoot is done'), edit: () => tx('Hand in the edit'), design: () => tx('Hand in the artwork') }
// A list the server keeps as JSON text or as an array (reviewers, faces, the checklist), or a single id.
const listed = (v, one = null) => {
  const l = Array.isArray(v) ? v : (() => { try { return JSON.parse(v || '[]') } catch { return [] } })()
  return l.length ? l : one ? [one] : []
}

// Each part of the brief wears its own mark and tint (12 Nov 2026, the owner: "make them stand out, a little
// different on their own"): the ТЗ is the editor's (scissors' colour), the script the shoot's, the post copy the artwork's.
const BRIEF_ICON = { tz: ClipboardList, script: Film, description: MessageSquare }

// A section's head that folds it (12 Nov 2026, the owner: "add toggle to plan, brief and etc. in the task
// view, but by default it is opened"). Open unless this person folded it; the choice is kept in this browser.
// v2 (12 Nov 2026, the owner: Plan, Brief and the files open by default): folds kept under the first key are let go,
// so every window opens whole again once; what a person folds from now on is kept.
const SHUT_KEY = 'satashkent_tw_shut2'
const readShut = () => { try { return new Set(JSON.parse(localStorage.getItem(SHUT_KEY) || '[]')) } catch { return new Set() } }
function useShut() {
  const [shut, setShut] = useState(readShut)
  const toggle = useCallback((k) => setShut((s) => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k); else n.add(k)
    try { localStorage.setItem(SHUT_KEY, JSON.stringify([...n])) } catch { /* private window */ }
    return n
  }), [])
  return [shut, toggle]
}
export function FoldHead({ icon: Icon, label, open, onToggle, id }) {
  return (
    <div className="tw-bh">
      <h3>
        <button type="button" className="tw-bh-t" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
          <ChevronDown size={16} className="tw-bh-c" aria-hidden="true" />
        </button>
      </h3>
    </div>
  )
}

export default function CoachTask({
  item, user, byKey, step, prefer = null, focus = null, next = null, onNext = null, onClose, onChanged,
  mayEdit = null, edit = null, editIn = null, startEdit = false, askFor = null, onDeleted = null,
}) {
  const { stepOf, pipe, makingFor, reviewsOn } = step
  const phone = useIsPhone()
  const today = todayISO()

  // Which sections this person folded (Plan, Brief, Reference, Files); every one opens by default.
  const [shut, toggleShut] = useShut()
  const fold = (k, Icon, label) => <FoldHead icon={Icon} label={label} open={!shut.has(k)} onToggle={() => toggleShut(k)} id={`tw-sec-${k}`} />
  const shutCls = (k) => (shut.has(k) ? ' is-shut' : '')
  // The piece as this window knows it: the row it was opened from, then the
  // whole task once the server answers, then whatever each press sends back.
  const [t, setT] = useState(item)
  const [loaded, setLoaded] = useState(false)
  const [team, setTeam] = useState([])
  const load = useCallback(() => api.get(`/content/${item.id}`).then((f) => {
    // The full task carries its rounds, not the two list columns read off them.
    const open = (f.revisions || []).filter((r) => !r.resolved_at)
    setT((old) => ({ ...old, ...f, open_round: open.length ? Math.max(...open.map((r) => r.round)) : null, open_for: open[open.length - 1]?.target || null }))
    setLoaded(true)
  }).catch((e) => { toast(e.message, 'err'); setLoaded(true) }), [item.id])
  useEffect(() => { load() }, [load])
  // A task window opened and closed, for "how people close a task" (lib/track.js).
  useEffect(() => {
    const at = Date.now()
    track('open', { task: item.id })
    return () => track('close', { task: item.id, ms: Date.now() - at })
  }, [item.id])
  // The names: asked again until they come. A window opened while the server
  // was restarting said "Nobody is named to edit it yet" and "You can remind ."
  // over a piece Jaloliddin edits (the owner's screenshot, 14 Oct 2026).
  useEffect(() => {
    let stop = false, wait = 2000
    const get = () => api.cached('/users').then((u) => { if (!stop) setTeam(Array.isArray(u) ? u : []) })
      .catch(() => { if (!stop) setTimeout(get, (wait = Math.min(wait * 2, 30000))) })
    get()
    return () => { stop = true }
  }, [])
  // ---- changing the task: in place, one field at a time (task-window-tz.md, 12 Nov 2026) ----
  // No Edit button, no form, no mode — the owner: "whoever may change a thing changes it where they read it; an admin
  // who clicks the script is editing it at once, with nothing else in the window moving". Every value a person may
  // change is its own small form where it is read (components/edit/Field.jsx; the plan's rows, TaskPlan.jsx), and
  // lib/mayChange.js — the server's PATCH gates, mirrored — says who may. "All fields" (the full sheet) stays in "…".
  const [editing, setEditing] = useState(null)   // null | 'builder' | 'sheet' (All fields)
  const [editStep] = useState('')
  const editOut = useRef(null)   // the sheet's own way out: it asks over unsaved changes
  const canEditIt = !!(editIn || edit) && loaded && !!mayEdit?.(t)
  // P-03: on a phone the title is two lines, the rest on press (for whoever only reads it).
  const [titleOpen, setTitleOpen] = useState(false)
  const person = (id) => team.find((u) => u.id === id) || null
  const nameOf = (id) => firstName(person(id))
  // A sentence needs a subject even when a name has not loaded or a seat's
  // holder has left: the crew, for whoever makes; the team, for whoever waits.
  const crewName = (id) => nameOf(id) || tx('The crew')
  const teamName = (id) => nameOf(id) || tx('The team')

  // A press landed: the window shows the piece as it is now, the page behind
  // it hears, and the thread and the rounds are read again.
  const [acted, setActed] = useState(false)
  // ---- Undo ----
  // The design has an Undo after every press, and the server has had the
  // route all along: POST /content/:id/undo takes a stage move back for ten
  // seconds — the stage and everything the move stamped (the links, the
  // clocks, the seats) — for whoever made the move. It is what the board's
  // "Moved to… · Undo" toast presses. So after a press that MOVED the piece
  // (a hand-in, a send, a publish) the window offers it, for as long as the
  // server will take it and not a second longer; a refusal ("Too late to undo
  // that") is said in the server's words. Accepting a delivery, asking for
  // changes and answering a booking move no stage and have no undo on the
  // server, so none is offered there.
  const UNDO_MS = 9000   // the server keeps the move for 10 s; a second is left for the way there
  const [undo, setUndo] = useState(0)        // when the offer ends (ms), or 0
  const [left, setLeft] = useState(0)        // whole seconds still left, for the button
  const [undoing, setUndoing] = useState(false)
  useEffect(() => {
    if (!undo) return undefined
    const tickDown = () => { const s = Math.ceil((undo - Date.now()) / 1000); if (s <= 0) setUndo(0); else setLeft(s) }
    tickDown()
    const id = setInterval(tickDown, 250)
    return () => clearInterval(id)
  }, [undo])
  // `undoable: false` — asking for changes and the owner's own fix move the
  // stage through routes that keep no snapshot, so Undo would only fail.
  const apply = (u, opts) => {
    track('change', { task: item.id })
    if (!u?.id) { load(); return }
    if (opts?.undoable !== false && u.status_id != null && u.status_id !== t.status_id) setUndo(Date.now() + UNDO_MS)
    setT((old) => ({ ...old, ...u }))
    setActed(true)
    onChanged?.(u)
    load()
  }
  // ---- a field changed in place: one PATCH, the server's row back, Undo for nine seconds (§2.7) ----
  // The window keeps the values it changed (one level) and puts them back with a PATCH of the old values; the server
  // answers the row and the window draws it, never its own guess. "Saved" is said in the status region (no focus move).
  const FIELD_WORDS = { title: 'Name', tz: 'ТЗ', script: 'Script', description: 'Post copy', type: 'Kind', channels: 'Channel', telegram_type: 'Telegram',
    operator_id: 'Who films it', editor_id: 'Who edits it', designer_id: 'Who makes the artwork', recording_date: 'Shoot day', recording_time: 'Shoot hours',
    edit_ready_date: 'Edit due', design_ready_date: 'Artwork due', release_date: 'Goes out', release_time: 'At', checklist: 'Checklist',
    owners: 'Whose piece', reviewers: 'Checks it', reference_text: 'Reference', reference_links: 'Reference',
    shot_link: 'Footage', ready_link: 'The edit', design_link: 'The artwork', post_link: 'The published post' }
  const fieldWord = (f) => (f === 'tz' ? 'ТЗ' : tx(FIELD_WORDS[f] || f))
  // How a value was changed, for the usage report (addendum §4): a choice from a menu or a picker, or typed in place.
  const PICKED = new Set(['type', 'channels', 'telegram_type', 'owners', 'reviewers', 'operator_id', 'editor_id', 'designer_id',
    'recording_date', 'recording_time', 'edit_ready_date', 'design_ready_date', 'release_date', 'release_time'])
  // The value on the page an Undo puts back: its own wrapper (data-field), else its plan row (TaskPlan's data-row) —
  // the seat is the row's first value, a day or an hour its last.
  const ROW_OF_FIELD = { operator_id: 'shoot', recording_date: 'shoot', recording_time: 'shoot', editor_id: 'edit', edit_ready_date: 'edit',
    designer_id: 'design', design_ready_date: 'design', release_date: 'out', release_time: 'out' }
  const fieldAt = (f) => {
    const box = panel.current?.querySelector(`[data-field="${f}"], [data-f="${f}"]`) || (ROW_OF_FIELD[f] ? panel.current?.querySelector(`[data-row="${ROW_OF_FIELD[f]}"]`) : null)
    const btns = box ? [...box.querySelectorAll('button.tw-rv, button.r14-pp-trigger, input[type="checkbox"]')] : []
    return { box, btn: (ROW_OF_FIELD[f] && !/_id$/.test(f) ? btns[btns.length - 1] : btns[0]) || null }
  }
  const [fieldUndo, setFieldUndo] = useState(null)   // { field, before, until }
  const [fieldLeft, setFieldLeft] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const sayStatus = (msg, ms) => { setStatusMsg(msg); setTimeout(() => setStatusMsg((m) => (m === msg ? '' : m)), ms) }
  useEffect(() => {
    if (!fieldUndo) return undefined
    const tickDown = () => {
      const n = Math.ceil((fieldUndo.until - Date.now()) / 1000)
      if (n > 0) { setFieldLeft(n); return }
      // The line leaves under the keyboard: the focus goes to the value it was about, never to the page body.
      if (document.activeElement?.closest?.('.tw-fundo')) (fieldAt(fieldUndo.field).btn || closeBtn.current)?.focus({ preventScroll: true })
      setFieldUndo(null)
    }
    tickDown()
    const id = setInterval(tickDown, 250)
    return () => clearInterval(id)
  }, [fieldUndo]) // eslint-disable-line react-hooks/exhaustive-deps
  // Values the server keeps as lists go back as lists (Undo sent the stored JSON text, which the server reads as none).
  const LISTS = ['checklist', 'reference_links']
  // A long text the server refused as changed while it was typed (409): the window's copy is older than the server's,
  // so "Keep mine" overwrites theirs — and Undo puts theirs back, not the window's stale copy. Read off the row as it
  // stands, not off the refusal, and without redrawing the window under the open box.
  const theirs = useRef({})
  const patchField = async (body, field, opts = {}) => {
    const forced = 'since' in opts && !opts.since   // "Keep mine": the resend without the version
    const was = (k) => (forced && k in theirs.current ? theirs.current[k] : LISTS.includes(k) ? listed(t[k]) : t[k] ?? null)
    // A release day the server gave (release_born) follows the later days by itself; written back by Undo it would
    // turn into a day somebody chose — so it is only put back when it is the very value that was changed.
    const before = opts.before || Object.fromEntries(Object.keys(body)
      .filter((k) => k !== 'force' && !(k === 'release_date' && t.release_born && field !== 'release_date')).map((k) => [k, was(k)]))
    let u
    try {
      u = await api.patch(`/content/${t.id}`, opts.since ? { ...body, if_updated_at: opts.since } : body)
    } catch (e) {
      if (e.status === 409 && 'since' in opts && field in body) api.get(`/content/${t.id}`).then((f) => { if (f?.id) theirs.current[field] = f[field] ?? null }).catch(() => {})
      throw e
    }
    for (const k of Object.keys(body)) delete theirs.current[k]
    track('change', { task: item.id, f: field })
    trackAct('task.edit', { task: item.id, f: field, how: opts.how || (PICKED.has(field) ? 'pick' : 'inline') })   // the label, never the value
    if (u?.id) { setT((old) => ({ ...old, ...u })); onChanged?.(u) }
    setActed(true)
    load()
    setFieldUndo({ field, before, until: Date.now() + UNDO_MS })
    // Said once in the status region; the line's countdown is for the eye only (it was read out every second).
    sayStatus(`${tx('Saved')} · ${tx('«{field}» changed', { field: fieldWord(field) })}`, 3000)
    return u
  }
  const takeFieldBack = async () => {
    const f = fieldUndo
    if (!f) return
    // The keyboard goes to the value before the Undo line leaves under it (it fell to the page body).
    const hold = () => (fieldAt(f.field).btn || closeBtn.current)?.focus({ preventScroll: true })
    hold()
    setFieldUndo(null)
    try {
      const u = await api.patch(`/content/${t.id}`, f.before)
      if (u?.id) { setT((old) => ({ ...old, ...u })); onChanged?.(u) }
      load()
      sayStatus(tx('Change taken back'), 2000)
      requestAnimationFrame(() => {
        fieldAt(f.field).box?.scrollIntoView({ block: 'nearest' })
        if (!panel.current?.contains(document.activeElement)) hold()
      })
    } catch (e) { toast(e.message, 'err') }
  }
  // A press in the window's record (a round, a hand raised, a day moved): the
  // window reads the task again, and the page behind takes the row it got.
  // (Only a row of this task: a hand raised answers with the flag's own row.)
  const heard = (u) => { if (u?.id === item.id) onChanged?.(u); load() }
  const takeBack = async () => {
    if (undoing) return
    setUndoing(true)
    try {
      const u = await api.post(`/content/${t.id}/undo`)
      setUndo(0); setActed(false)
      setT((old) => ({ ...old, ...u }))
      onChanged?.(u)
      load()
      toast(tx('Move taken back'))
    } catch (e) { setUndo(0); toast(e.message, 'err') } finally { setUndoing(false) }
  }

  // ---- whose step it is ----
  const revisions = t.revisions || []
  const openRound = revisions.filter((r) => !r.resolved_at).slice(-1)[0] || null
  const reviews = reviewsOn(t)
  const read = actOf(t, { userId: user.id, pipe, step: stepOf(t), today, rounds: revisions.length, maxRounds: PRAVKA_ROUNDS, canReview: reviews.accept, prefer })
  // A job on a piece its maker is still planning is "not sent to you yet" —
  // the list gives it no number and the window says who has it. But the server
  // takes a hand-in at any stage (a maker who asked for the poster in the
  // corridor and never pressed "Send"), and the previous look let them hand it
  // in, so nothing is taken away: one quiet link opens the same hand-in box.
  const [anyway, setAnyway] = useState(false)
  const act = read.kind === 'early' && anyway ? { kind: 'handin', hat: read.hat } : read
  const hat = act.hat || null
  const kind = kindOfAct(act)
  const owners = ownersOf(t)
  const owner = owners[0] || null
  // Whoever runs the piece may nudge the person holding it. A pen is offered
  // only on a piece that is theirs to write to (the server's canTouch): anybody
  // may open any piece, from the calendars and the quick find.
  const reach = reachOf(user, t)
  const runs = owners.includes(user.id) || (reach && can(user, 'manage_content'))
  const at = pipe.live.findIndex((s) => s.id === t.status_id)
  // Somebody who held a job on the piece and has handed it over keeps reading
  // the window as that job, done — the crew's pages never show a release day,
  // which is somebody else's promise.
  const doneHat = !hat && act.didMine && !runs ? HATS.find((h) => t[h.seat] === user.id) : null
  // the crew on their own task (the owner, 15 Nov 2026): the window shows their stop and their brief and nothing
  // of the rest — an operator shoots, and the edit, the cover and the day out are not theirs to read
  const mySeats = HATS.filter((h) => t[h.seat] === user.id).map((h) => ({ operator_id: 'shoot', editor_id: 'edit', designer_id: 'design' })[h.seat]).filter(Boolean)
  const crewOnly = mySeats.length > 0 && !adminOn(user, t.channels) && owner !== user.id && !(t.assignees || []).includes(user.id)

  // ---- when ----
  // A change sent back has no day of its own on the server: its day is the
  // next one the piece is still promised for (fixUntil), the same the list drew.
  // A piece put back with no round is read the same way (crewDay, `again`): not
  // late by the day of the delivery it already met.
  const again = !!hat && hat.kind !== 'shoot' && act.kind === 'handin' && putBack(t, pipe.live[at]?.label || '')
    && !(hat.kind === 'design' && t.editor_id)
  const due = !hat ? null : again ? (fixUntil(t, hat.name, today) || today) : act.kind === 'fix' ? fixUntil(t, hat.name, today) : hat.kind === 'shoot' ? t.recording_date : hat.kind === 'edit' ? (editDue(t) || reviewDue(t)) : (t.design_ready_date || reviewDue(t))
  const hours = hoursOf(t)
  const shootWhen = t.recording_date ? `${dayInLine(t.recording_date, today)}${hours ? `, ${hours}` : ''}` : ''
  const lateDays = due && due < today && act.kind !== 'fix' ? daysBetween(due, today) : 0
  // 9 Nov 2026: the day is a date, never a clause ("was due", "goes out") — how late is the badge's word.
  const whenLine = hat
    ? (hat.kind === 'shoot' && act.kind !== 'fix' ? shootWhen : !due ? '' : dayInLine(due, today))
    : doneHat ? ''
      : t.done_at ? dayInLine(tashkentDay(t.done_at), today)
        : !reviewDue(t) ? '' : dayInLine(reviewDue(t), today)
  // The same badge the list drew for it.
  const badge = hat
    ? <CrewBadge today={today} row={{ t, kind: hat.kind, due, late: lateDays, state: { fix: 'fix', ask: 'ask', handin: 'go', blocked: 'blocked', notyet: 'wait', early: 'early', declined: 'declined' }[act.kind] }} />
    : doneHat ? <CrewBadge today={today} row={{ t, kind: doneHat.kind, state: 'done' }} />
      : at >= 0 ? <MakerBadge today={today} nameOf={nameOf}
        row={makerDay({ pieces: [t], today, userId: user.id, pipe, stepOf, roundsOf: () => revisions.length, maxRounds: PRAVKA_ROUNDS, canReviewOf: () => reviews.accept }).rows[0]} />
        : <Badge>{tx('Deleted')}</Badge>

  // ---- the form under "Your step now" tells the window where it stands ----
  const [awake, setAwake] = useState(true)        // is the button awake?
  // An admin hands the work in for whoever holds the step (the owner, 14 Oct
  // 2026: "sometimes I upload instead of the editors"). The seat keeps the
  // credit and the pay — both are read off the seat, never off who pressed.
  const [forThem, setForThem] = useState(false)
  // T-07: a move's questions are asked in a sheet over the window (NextStep.jsx), opened by the step's button.
  const [stepping, setStepping] = useState(false)

  // ---- accept, or ask for changes ----
  const [asking, setAsking] = useState(focus === 'note')
  // The list closed (Cancel, or sent): the keyboard goes back to the button that opened it
  // (the a11y audit, 10 Nov 2026 — it fell to the page body).
  const askBtn = useRef(null)
  const wasAsking = useRef(asking)
  useEffect(() => { if (wasAsking.current && !asking) setTimeout(() => (askBtn.current || panel.current?.querySelector('.tw-review-btns .co-btn-p'))?.focus({ preventScroll: true }), 0); wasAsking.current = asking }, [asking])
  const [note, setNote] = useState('')
  const [changes, setChanges] = useState(() => [newItem()])   // the list asked for; the note is made of it
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const accept = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const u = await api.post(`/content/${t.id}/approve`, {})
      toast(tx('Accepted — it is ready to publish'))
      apply(u)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  // Whom the changes go to: the maker of what came in, unless the asker picks
  // another seat — the operator for a re-shoot (the sheet's choice, kept).
  const targets = [
    t.editor_id && { key: 'editor', label: tx('Editor') },
    t.operator_id && { key: 'operator', label: tx('Operator · re-shoot') },
    t.designer_id && { key: 'designer', label: tx('Designer') },
  ].filter(Boolean)
  const [target, setTarget] = useState(null)
  const sendTarget = target || (act.what === 'artwork' ? 'designer' : 'editor')
  const fixer = target ? t[`${target}_id`] : act.maker
  const [noteClip, setNoteClip] = useState(null)
  const sendBack = async () => {
    const said = noteOf(changes) || note.trim() || (noteClip ? tx('Voice note') : '')
    if (busy || uploading || !said) return
    setBusy(true); setErr('')
    try {
      const u = await api.post(`/content/${t.id}/revisions`, {
        note: said, target: sendTarget,
        ...(noteClip ? { voice: noteClip.data, voice_secs: noteClip.secs } : {}),
      })
      toast(tx('{name} got your note', { name: crewName(fixer) }))
      setAsking(false); setNote(''); setNoteClip(null); setChanges([newItem()])
      apply(u, { undoable: false })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  // A change asked of the piece's owner — a written post has no editor's seat —
  // is answered with the new version's link, through the round's own route.
  const [fixLink, setFixLink] = useState('')
  const ownFix = async () => {
    if (busy || !fixLink.trim() || !openRound) return
    setBusy(true); setErr('')
    try {
      const r = await api.post(`/content/revisions/${openRound.id}/resolve`, { link: fixLink.trim() })
      toast(tx('Fixed — back to the SMM'))
      setFixLink('')
      apply(r.task, { undoable: false })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  // ---- the thread ----
  const [draft, setDraft] = useState('')
  const [saying, setSaying] = useState(false)
  const [sayClip, setSayClip] = useState(null)   // a voice note, said instead of or beside the words
  const [clipKey, setClipKey] = useState(0)      // remounts the recorder to clear it
  const comments = t.comments || []
  const addComment = (c) => setT((old) => ({ ...old, comments: [...(old.comments || []), c] }))
  // A ref, not only the state: two Enters in a row arrive before the state
  // has redrawn, and the same comment was posted twice (the audit, 12 Oct).
  const sayingNow = useRef(false)
  const say = async () => {
    const text = draft.trim()
    if ((!text && !sayClip) || sayingNow.current) return
    sayingNow.current = true
    setSaying(true)
    try {
      addComment(await api.post(`/content/${t.id}/comments`, { text, ...(sayClip ? { voice: sayClip.data, voice_secs: sayClip.secs } : {}) }))
      setDraft(''); setSayClip(null); setClipKey((n) => n + 1)
    } catch (e) { toast(e.message, 'err') } finally { sayingNow.current = false; setSaying(false) }
  }

  // ---- the one button ----
  // r10: a hand-in says who gets it — "Send to Jasmina" — as the design for
  // the simpler task window has it. (The numbered steps that once stood above
  // it, and the ticks they kept, are gone — round 8 stopped drawing them and
  // D-04 removed them everywhere.)
  // A reel's cover handed in before its cut waits for the edit (the server holds it on Editing).
  const coverFirst = hat?.kind === 'design' && !!t.editor_id && act.kind !== 'fix'
    && (!t.ready_link || revisions.some((r) => !r.resolved_at && r.target === 'editor'))
  const sendTo = act.kind === 'fix' ? (String(openRound?.requested_name || '').split(' ')[0] || nameOf(owner)) : nameOf(owner)
  // T-08: the button says who gets the work — the footage goes to the editor.
  const button = act.kind === 'ownfix' ? tx('Hand in the fix')
    : hat?.kind === 'shoot' && act.kind !== 'fix' && nameOf(t.editor_id) && t.editor_id !== user.id ? tx('Send to {name}', { name: nameOf(t.editor_id) })
    : hat && hat.kind !== 'shoot' && sendTo && owner !== user.id && !coverFirst ? tx('Send to {name}', { name: sendTo })
      : act.kind === 'fix' ? tx('Hand in the fix') : hat ? GO[hat.kind]() : act.kind === 'publish' ? tx('Publish') : act.verb ? tx(act.verb) : ''
  // ---- the brief, and what to make it from ----
  const BRIEF = { tz: () => 'ТЗ', script: () => tx('Script'), description: () => tx('Post copy') }
  // The day this person works to, by the job they hold — or, for whoever owns
  // the piece, the day it goes out (r11). The server moves it on their word.
  const DAY_OF = { shoot: 'recording_date', edit: 'edit_ready_date', design: 'design_ready_date' }
  // Whoever has no job on it — an admin, a planner, somebody looking — reads the
  // day it goes out: the window starts with the deadline for every role (the
  // owner's order, 13 Oct). Crew who handed theirs over do not: that day is
  // somebody else's promise.
  const myDay = hat ? DAY_OF[hat.kind] : doneHat || ((t.done_at || at < 0) && !owners.includes(user.id)) ? null : 'release_date'
  const refLinks = (() => {
    const raw = t.reference_links
    const list = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]') } catch { return [] } })()
    // As LinkText reads them: a bare domain is a link too, and a sentence's full stop is not part of it.
    const inText = [...String(t.reference_text || '').matchAll(URL_RE)]
      .map((m) => m[0].replace(/[.,;:!?)\]»"']+$/, '')).map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`))
    return [...new Set([...list, ...inText])].filter((u) => /^https?:\/\//i.test(u))
  })()
  // The links kept as links (not the ones inside the words): each its own value to change in place.
  const refList = listed(t.reference_links).filter((u) => typeof u === 'string')
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
  // The words around the links (the links are drawn as previews): "Like this,
  // fast cuts: <link> and <link>" reads "Like this, fast cuts".
  const refWords = String(t.reference_text || '').replace(URL_RE, ' ').replace(/[ \t]{2,}/g, ' ')
    .replace(/(?:[\s,:;–—-]+(?:and|или|и|va|yoki))*[\s,:;–—-]*$/i, '').trim()
  // The team's Google Drive, as the server reads this task: the files it points
  // at (drawn by TaskFiles, with a player and Download), and which link boxes
  // those came from — those are not drawn a second time as plain links.
  const [drive, setDrive] = useState(null)
  const boxAdd = useRef(null)
  const registerBox = useCallback((fn) => { boxAdd.current = fn }, [])
  const shownHere = drive?.handled || []
  const files = [
    deliveryHref(t.shot_link) && { href: deliveryHref(t.shot_link), label: tx('Footage'), field: 'shot_link' },
    deliveryHref(t.ready_link) && { href: deliveryHref(t.ready_link), label: tx('The edit'), field: 'ready_link' },
    deliveryHref(t.design_link) && { href: deliveryHref(t.design_link), label: tx('The artwork'), field: 'design_link' },
    deliveryHref(t.post_link) && { href: deliveryHref(t.post_link), label: tx('The published post'), field: 'post_link' },
  ].filter((m) => m && !shownHere.includes(m.field))
  const docs = t.documents || []
  // The material on the plate (9 Nov 2026): what this chair came for as a
  // player — the footage for whoever edits, the edit for whoever reviews (that
  // one plays inside the job block) — the rest as strips.
  // 9 Nov 2026, round 3: each set of files is one even grid. What the job block already
  // holds is not drawn again: the shoot's own uploads, the editor's own edit, the
  // edit under review. The maker's footage folds away in review.
  const matShow = act.kind === 'check' ? { footage: 'compact', cover: act.what === 'cut' }
    : hat?.kind === 'edit' ? { footage: 'grid', edit: act.kind === 'fix' ? 'grid' : null, cover: true }
      : hat?.kind === 'shoot' ? {}
        : hat?.kind === 'design' ? { footage: 'grid', edit: 'grid' }
          : { edit: 'grid', footage: 'grid', cover: true }
  // r11 (the crew's feedback): a link opens here, in the viewer — never a jump to another site.
  const [linkOpen, setLinkOpen] = useState(null)
  // A link or a note added to the reference (the owner, 13 Oct), kept in reference_text.
  const [refDraft, setRefDraft] = useState('')
  // The reference is drawn only when there is one (the owner, 13 Oct: "reference if
  // given"): words, a link, or a picture RefMedia holds. The first one is added
  // from More details, which opens the block in its place.
  const [refHeld, setRefHeld] = useState(0)
  const [refOpen, setRefOpen] = useState(false)
  const refInput = useRef(null)
  useEffect(() => { if (refOpen) refInput.current?.focus() }, [refOpen])
  const hasRef = !!String(t.reference_text || '').trim() || refLinks.length > 0 || refHeld > 0
  // What is empty is not drawn (the owner, 14 Oct 2026: "if not done, do not
  // show — straight to the ТЗ"). Only the task's owner keeps a small "+ Add"
  // line; a reference's words and links, and a delivery link, are changed in
  // place by whoever may (§2.2).
  const mayRef = at >= 0 && owners.includes(user.id)
  const [fileOpen, setFileOpen] = useState(false)
  const [allLog, setAllLog] = useState(false)   // the admin's history: six lines, then all
  // A booking is answered on one row (the owner's drawing): Yes at once; No opens the ask's form.
  const [sayNo, setSayNo] = useState(focus === 'no')
  const sayYes = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try { const u = await api.post(`/content/${t.id}/confirm`, { which: act.which, ok: true }); toast(tx('Confirmed — it is in your day now')); apply(u) }
    catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  const mat = useMaterial(t)
  const nFiles = (DEMO ? 0 : files.length) + docs.length + (drive?.files?.length || 0)
  const [refBusy, setRefBusy] = useState(false)
  const addRef = async () => {
    const v = refDraft.trim()
    if (!v || refBusy) return
    setRefBusy(true)
    try {
      // Added under what is there — anybody on the task may (POST /content/:id/reference).
      apply(await api.post(`/content/${t.id}/reference`, { text: v }))
      setRefDraft('')
    } catch (e) { toast(e.message, 'err') } finally { setRefBusy(false) }
  }
  const openDoc = async (d) => {
    try { const { url } = await api.get(`/content/files/${d.id}`); window.open(url, '_blank', 'noopener') } catch (e) { toast(e.message, 'err') }
  }

  // ---- the window itself: in from the right, out on Esc or a click outside ----
  const panel = useRef(null)
  const closeBtn = useRef(null)
  // The sticky step box sits under the sticky head, however tall the head is
  // (a long title, the leave note): its height is kept on the panel.
  const headRef = useRef(null)
  useEffect(() => {
    const keep = () => panel.current?.style.setProperty('--co-head-h', `${Math.ceil(headRef.current?.offsetHeight || 0)}px`)
    keep()
    if (!headRef.current || !window.ResizeObserver) return undefined
    const ro = new ResizeObserver(keep)
    ro.observe(headRef.current)
    return () => ro.disconnect()
  }, [])
  // T-03: the window opens scrolled to its top, whatever the page behind it
  // had scrolled to (opened from a board after a scroll it started past its title).
  useEffect(() => {
    const el = panel.current
    if (!el) return undefined
    el.scrollTop = 0
    const id = requestAnimationFrame(() => { el.scrollTop = 0 })
    return () => cancelAnimationFrame(id)
  }, [item.id])
  const [closing, setClosing] = useState(false)
  // What was typed in the window and is still in its box — a correction, a
  // link, a reason, a comment. None of it is saved until its own button is
  // pressed, and Esc or one click beside a 540px panel used to throw it away.
  // The boxes belong to five different forms, so they are not asked one by
  // one: every box typed into is remembered, and "unsent" is any of those
  // still on the page with words in it (a form that sent clears or leaves).
  const typed = useRef(new Set())
  // A one-line field (the title, a link) is not unsent: it saves when the focus leaves it, which the press on × or
  // beside the window is — the ask said "it is lost" over a save already on its way.
  const held = (el) => el.isConnected && !el.matches?.('.tw-line-in') && String(el.value || '').trim()
  const unsent = () => [...typed.current].some(held)
  // Only long-text boxes hold words: they are kept as a draft in this browser (edit/Field.jsx), so the ask says so, not "it is lost".
  const draftOnly = () => [...typed.current].filter(held).every((el) => el.matches?.('.tw-long-in'))
  // `leaving` is the way out that was asked for and is being held: closing,
  // the full task sheet ("Edit the task" / "All details"), or the next task.
  // All three take this window off the page and its boxes with it, so all
  // three ask first. (The first cut asked only on closing: a pravka typed and
  // then "Edit the task" pressed was gone without a word.)
  const [leaving, setLeaving] = useState(null)   // null | 'close' | 'full' | 'next' | 'dup'
  // Where the keyboard was when the ask came up: "Keep writing" puts it back there
  // (the a11y audit, 10 Nov 2026 — it fell to the page body); a box gone meanwhile, to the first box with words.
  const leaveFrom = useRef(null)
  const askLeave = (how) => { leaveFrom.current = document.activeElement; setLeaving(how) }
  const keepWriting = () => { setLeaving(null); const el = leaveFrom.current?.isConnected ? leaveFrom.current : [...typed.current].find(held); if (el?.isConnected) setTimeout(() => el.focus?.({ preventScroll: true }), 0) }
  // The ask already up: asked again (a press beside the window) it keeps where the keyboard came from, not its own button.
  const inAsk = () => !!document.activeElement?.closest?.('.co-leave')
  const close = useCallback((sure) => {
    if (busy) return
    if (editing === 'sheet') { editOut.current?.(); return }
    if (sure !== true && unsent()) { if (!inAsk()) askLeave('close'); return }
    setClosing(true)
    // Long enough for the panel to leave; at once for whoever asked for less motion.
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setTimeout(onClose, calm ? 0 : 180)
  }, [busy, onClose, editing])
  useEffect(() => {
    // A window opened over this one (a clash to settle, the full task) takes Esc first.
    // A second Esc does not confirm: only the button does. Esc in the ask is "Keep writing" (it re-asked, and lost the box).
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) { if (inAsk()) keepWriting(); else close() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
  useEffect(() => {
    // The page behind does not scroll, and the row that opened the window gets
    // the focus back when it closes — so the keyboard is where the eye is.
    const opener = document.activeElement
    document.body.classList.add('co-held')
    // Addendum §1: the window opens on its title, not on × (the title's own button follows once the rights are read).
    if (focus !== 'note' && focus !== 'step') (panel.current?.querySelector('#co-win-t') || closeBtn.current)?.focus({ preventScroll: true })
    return () => {
      document.body.classList.remove('co-held')
      if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Opened from the start-here card (D-02): the keyboard lands on the step's
  // first control — the drop box, the question, the button — once it is drawn.
  useEffect(() => {
    if (focus !== 'step' || !loaded) return undefined
    const t = setTimeout(() => {
      const el = panel.current?.querySelector('.co-act button:not([disabled]), .co-act input:not([disabled]), .co-act textarea:not([disabled]), .co-act [tabindex="0"]')
      el?.focus({ preventScroll: false })
    }, 60)
    return () => clearTimeout(t)
  }, [focus, loaded])
  // "Watch the edit" on My Day (focus 'files'): the window opens on what was made, in view, the first
  // thing in it to press focused — not on Close. The material shows first where it is drawn, else the files.
  useEffect(() => {
    if (focus !== 'files' || !loaded) return undefined
    const t = setTimeout(() => {
      const blk = panel.current?.querySelector('.tw-mat, .co-files-blk:not([hidden])')
      if (!blk) return
      blk.scrollIntoView({ block: 'start', behavior: 'smooth' })
      const el = blk.querySelector('video, button:not([disabled]), a[href], [tabindex="0"]')
      el?.focus({ preventScroll: true })
    }, 120)
    return () => clearTimeout(t)
  }, [focus, loaded])
  // Once the rights are read, the keyboard moves from the heading to the title's button, for whoever may change it.
  // Opened to change it (the board's "Edit", `startEdit`), the field opens at once: a long text through LongField's
  // `opened`, the title by its own press (LineField has no `opened`).
  const openField = startEdit === true ? 'title' : typeof startEdit === 'string' ? startEdit : ''
  useEffect(() => {
    if (!loaded || focus === 'note' || focus === 'step' || focus === 'files' || (openField && openField !== 'title')) return
    const h = panel.current?.querySelector('#co-win-t')
    const btn = h?.querySelector('.tw-tt .tw-rv')
    if (!btn) return
    if (openField === 'title') btn.click()
    else if (!document.activeElement || document.activeElement === document.body || document.activeElement === h) btn.focus({ preventScroll: true })
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps
  // The step the builder opens at rides with the way out: a plan row's, else Idea.
  const leave = (how) => { setLeaving(null); if (how === 'next') onNext(); else if (how === 'full') setEditing(edit ? 'sheet' : 'builder'); else if (how === 'dup') duplicate(); else close(true) }
  const goOut = (how) => { if (unsent()) askLeave(how); else leave(how) }
  // Tab stays inside the window while it is open.
  const trap = (e) => {
    if (e.key !== 'Tab' || !panel.current) return
    const stops = [...panel.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, audio[controls], video[controls], [contenteditable="true"], [tabindex]:not([tabindex="-1"])')]
      // What is inside a shut <details> still has a box in Chrome (content-visibility),
      // so visibility is asked, not measured — else the last stop is one the
      // keyboard can never reach, and Tab walks out of the window after the summary.
      // What is inside a shut fold is `inert` (MediaGrid's Fold) and can never take the
      // focus: counted as the last stop, it let Tab walk out of the window onto the page
      // behind (the a11y audit, 10 Nov 2026).
      .filter((el) => (el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0) && !el.closest('[hidden], [aria-hidden="true"], [inert]'))
    if (!stops.length) return
    const first = stops[0], last = stops[stops.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // ---- "After you press: …" — who gets it next, in their name ----
  // 9 Nov 2026 (the owner): the window shows the job, it does not explain it —
  // no "After you press", no "Not yet", no "Nothing to press". The three stay
  // as names so every case below reads as before; each draws nothing.
  const after = () => null
  const notYet = () => null
  const nothing = () => null
  // The strip over the step (round 17): the stage as its mark, whose turn it
  // is as a face, and the day — the same three marks the calendar and My Day
  // wear, so the window is read before its words are.
  const stop = at >= 0 ? wayOf(t, pipe, makingFor(t)).find((s) => s.cls === 'on') : null
  const holder = stop?.who && stop.who !== user.id ? person(stop.who) : null
  // The block's head is the job's word with its tile (9 Nov 2026), never "Your
  // step now": Shoot, Edit, Cover, Review, Publish — and, for a step that is
  // somebody else's, that step's word with their face beside it.
  // How late the step on show is: the crew's own day, else the day the piece goes out.
  const headLate = hat ? lateDays
    : !t.done_at && at >= 0 && reviewDue(t) && reviewDue(t) < today ? daysBetween(reviewDue(t), today) : 0
  const JOBW = { shoot: () => tx('Shoot'), edit: () => tx('Editing'), design: () => tx('Artwork') }
  const SEAT_KIND = { operator: 'shoot', editor: 'edit', designer: 'design' }
  const WAIT_KIND = { shoot: 'shoot', cut: 'edit', artwork: 'design', review: 'send' }
  const jobKind = hat ? hat.kind : act.kind === 'check' || act.kind === 'publish' ? 'send' : act.kind === 'fixing' ? (SEAT_KIND[act.seat] || 'edit')
    : act.wait ? (WAIT_KIND[act.wait] || 'idea') : act.kind === 'out' ? 'out' : doneHat ? doneHat.kind : 'idea'
  const jobWord = hat ? JOBW[hat.kind]() : act.kind === 'check' ? tx('Review') : act.kind === 'publish' ? tx('Publish') : act.kind === 'move' && act.verb ? tx(act.verb)
    : act.kind === 'ownfix' ? tx('Fix') : act.kind === 'out' ? tx('Published') : jobKind === 'send' ? tx('Review') : JOBW[jobKind] ? JOBW[jobKind]() : (pipe.live[at]?.label || tx('Idea'))
  const box = (title, body, opts = {}) => (
    <section className={'co-act' + (opts.noHead ? ' tw-nohead' : '')} aria-label={jobWord || title}>
      {!opts.noHead && <div className="r14-act-h">
        <KindTile kind={jobKind} done={jobKind === 'out' || !!act.didMine} size={20} />
        <h3>{jobWord || title}</h3>
        {holder && !crewOnly && !['waiting', 'fixing'].includes(act.kind) && <span className="co-strip-who"><Face person={holder} size="xs" />{firstName(holder)}</span>}   {/* the crew's window shows their stop alone: the face of whoever holds the piece's current stop (the operator, over a designer's "Artwork") read as the wrong person (16 Nov 2026) */}
        {headLate > 0
          ? <span className="r14-act-when tw-late"><Clock size={14} aria-hidden="true" />{lateWords(headLate)}</span>
          : !opts.noWhen && whenLine && <span className="r14-act-when"><CalendarDays size={14} aria-hidden="true" />{whenLine}</span>}
        {opts.head}
      </div>}
      {body}
    </section>
  )
  const holderRow = (id, line, sub) => (
    <div className="co-holder">
      {person(id) ? <Face person={person(id)} size="lg" /> : <span className="co-kic co-k-idea" aria-hidden="true"><Clock size={18} /></span>}
      <div><b>{line}</b>{sub && <span>{sub}</span>}</div>
    </div>
  )
  const nextBtn = next && onNext && (
    <button type="button" className="co-btn co-btn-p" onClick={() => goOut('next')}>
      {tx('Next: {title}', { title: next.title.length > 26 ? `${next.title.slice(0, 24)}…` : next.title })} <ArrowRight size={18} aria-hidden="true" />
    </button>
  )
  const ownerName = teamName(owner)

  const handInAfter = () => {
    if (!awake) return notYet(drive?.connected ? tx('Drop the file first. Then the button appears.') : tx('Paste the link first. Then the button appears.'))
    // A re-shoot is footage like any other: it goes to the editor, not back to
    // whoever asked (the bug hunt, 14 Oct 2026).
    if (act.kind === 'fix' && hat.kind !== 'shoot') return after(openRound?.requested_name ? tx('{name} gets the new version and checks it again.', { name: openRound.requested_name.split(' ')[0] }) : tx('The new version goes back to be checked again.'))
    if (hat.kind === 'shoot') {
      if (t.editor_id === user.id) return after(tx('The task moves to Editing. You edit it next — it comes back to your list as an edit.'))
      if (nameOf(t.editor_id)) return after(tx('{name} gets the footage and starts to edit it. You are done with this one.', { name: nameOf(t.editor_id) }))
      return after(tx('The task moves on. {name} sees that it is filmed.', { name: ownerName }))
    }
    if (coverFirst) return after(tx('Your artwork waits for the edit. Then {name} checks both.', { name: ownerName }))
    return after(hat.kind === 'edit'
      ? tx('{name} gets your edit. {name} watches it and takes it — or asks you to change something.', { name: ownerName })
      : tx('{name} gets your artwork. {name} looks at it and takes it — or asks you to change something.', { name: ownerName }))
  }

  const actBox = () => {
    if (!loaded) return box(tx('Your step now'), <div className="hi-drop hi-drop-big" aria-busy="true" style={{ opacity: 0.4, pointerEvents: 'none' }} />)
    switch (act.kind) {
      case 'ask': {
        // The owner's drawing (9 Nov 2026): who asks, the day and the hours, Yes, No —
        // one row, nothing said twice (the head leaves its day out).
        const bookDay = act.which === 'shoot' ? t.recording_date : editDue(t)
        const mins = (() => {
          const m = (x) => (/^\d\d:\d\d/.test(x || '') ? Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5)) : null)
          const a = m(t.recording_time), b = m(t.recording_end)
          return act.which === 'shoot' && a != null && b != null && b > a ? b - a : 0
        })()
        const span = mins ? `${Math.floor(mins / 60) ? `${Math.floor(mins / 60)} h` : ''}${mins % 60 ? ` ${mins % 60} min` : ''}`.trim() : ''
        return box(tx('Your step now'), (
        <>
          {!sayNo ? (
            <div className="tw-book">
              <span className="tw-book-job"><KindTile kind={jobKind} size={20} /><b>{jobWord}</b></span>
              {person(owner) ? <Face person={person(owner)} size="lg" /> : <span className="co-kic co-k-idea" aria-hidden="true"><Clock size={18} /></span>}
              <div className="tw-book-when">
                <b>{bookDay ? dayInLine(bookDay, today) : ''}</b>
                {act.which === 'shoot' && hoursOf(t) && <span><Clock size={16} aria-hidden="true" />{hoursOf(t)}{span ? ` · ${span}` : ''}</span>}
              </div>
              <div className="tw-book-btns">
                <button type="button" className="co-btn tw-yes" disabled={busy} onClick={sayYes}><Check size={20} aria-hidden="true" />{tx('Yes')}</button>
                <button type="button" className="co-btn tw-no" disabled={busy} onClick={() => setSayNo(true)}><X size={20} aria-hidden="true" />{tx('No')}</button>
              </div>
            </div>
          ) : (
            <Booking item={t} which={act.which} label={act.which === 'shoot' ? tx('Shoot') : tx('Editing')} mine holderName={user.name} openNo
              onAnswered={(u) => { setSayNo(false); if (u?.released) { onChanged?.(u); onClose() } else apply(u) }} />
          )}
        </>
      ), { noWhen: true, noHead: !sayNo })
      }
      case 'fix':
      case 'handin': return box(tx('Your step now'), (
        <>
          <HandIn inline local={DEMO} key={`${t.id}:${hat.kind}:${act.kind}`} item={t} kind={hat.kind} label={button} onReady={(ok) => setAwake(ok)} onDone={apply} />
          {handInAfter()}
        </>
      ))
      case 'blocked': return box(tx('Not your step yet'), (
        <>
          {holderRow(t.operator_id, nameOf(t.operator_id) || tx('Shoot'), shootWhen)}
          {/* T-04: no sleeping button. The sentence says what is missing; the
              button appears the moment it can be pressed. */}
        </>
      ))
      case 'early': {
        const name = teamName(act.holder)
        return box(tx('Not your step yet'), (
          <>
            {holderRow(act.holder, name, tx('Not sent yet'))}
            <div><button type="button" className="co-link" onClick={() => setAnyway(true)}>{tx('Hand it in')}</button></div>
          </>
        ))
      }
      // They said no and still hold the seat: the maker's step. The answer is
      // shown with its reason, and can be changed to a yes right here (the
      // server takes a new answer from the holder).
      case 'declined': {
        const name = teamName(act.holder)
        return box(tx('Not your step now'), (
          <>
            {holderRow(act.holder, name, tx('You said no'))}
            <Booking item={t} which={act.which} label={act.which === 'shoot' ? tx('Shoot') : tx('Editing')} mine holderName={user.name} onAnswered={apply} />
          </>
        ))
      }
      case 'notyet': return box(tx('Not your step yet'), (
        <>
          {holderRow(t.operator_id, nameOf(t.operator_id) || tx('Shoot'), shootWhen || tx('No day yet'))}
        </>
      ))
      case 'check': {
        const maker = crewName(act.maker)
        const href = deliveryHref(act.what === 'cut' ? t.ready_link : t.design_link)
        const list = act.what === 'cut' ? mat.edit : mat.cover
        const file = list[list.length - 1]
        const wide = file?.orient === 'h'
        // The reference, when it is a video: it stands beside the edit (the owner, 9 Nov 2026).
        const FILE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i
        const refVid = refLinks.find((u) => FILE.test(u) || (embedOf(u) && !embedOf(u).page && /youtube|instagram|drive/.test(embedOf(u).src)))
        const checks = [['description', tx('Post copy'), MessageSquare], ['tz', 'ТЗ', FileText], ['script', tx('Script'), FileText]]
          .map(([k, label, Icon]) => [k, label, Icon, String(t[k] || '').trim()]).filter(([, , , v]) => v)
        const rounds = [...revisions].reverse()
        const canSend = !!(noteOf(changes) || note.trim() || noteClip)
        return box(tx('Your step now'), (
          <div className={'tw-review' + (wide ? ' wide' : '') + (refVid ? ' with-ref' : '') + (asking ? ' asking' : '')}>
            <div className="tw-review-media">
              {file ? (/^image\//.test(file.type || '')
                ? <img src={file.url} alt={`${act.what === 'cut' ? tx('The edit') : tx('The artwork')}: ${file.name || ''}`} />
                : <video key={file.url} src={file.url} controls playsInline preload="metadata" aria-label={`${tx('The edit')}: ${file.name || ''}`} />)
                : href && <a className="co-file" href={href} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" />{act.what === 'cut' ? tx('The edit') : tx('The artwork')}</a>}
              {file?.version != null && <span className="tw-ver">V{file.version}</span>}
              <span className="tw-media-lb">{act.what === 'cut' ? tx('Edit') : tx('Cover')}</span>
            </div>
            {refVid && (
              <div className="tw-review-media tw-review-ref">
                {FILE.test(refVid)
                  ? <video src={refVid} controls playsInline preload="metadata" aria-label={tx('Reference')} />
                  : <iframe src={embedOf(refVid).src} title={tx('Reference')} loading="lazy" allowFullScreen />}
                <span className="tw-media-lb">{tx('Reference')}</span>
              </div>
            )}
            <div className="tw-review-side">
              {asking ? (
                <>
                  <ChangeList taskId={t.id} items={changes} onChange={setChanges} phone={phone} disabled={busy} onError={setErr} onUploading={setUploading}
                    voice={canRecord()} onVoice={setNoteClip}
                    timeOf={() => panel.current?.querySelector('.tw-review-media:not(.tw-review-ref) video')?.currentTime ?? null} />
                  {/* The voice note is the one other way to say it; the changes go to whoever made
                      the thing (the server's default), so nobody is asked whom. */}
                  <div className="tw-review-btns tw-send-row">
                    {/* T-04 (12 Nov 2026): Send appears once there is a change, a note or a voice clip — never asleep. */}
                    {canSend && <button type="button" className="co-btn co-btn-p" disabled={busy || uploading} onClick={sendBack} title={tx('Send to {name}', { name: crewName(fixer) })}>
                      <Send size={20} aria-hidden="true" />{tx('Send')}
                    </button>}
                    <button type="button" className="co-ib tw-cancel" disabled={busy} onClick={() => setAsking(false)} aria-label={tx('Cancel')} title={tx('Cancel')}><X size={20} aria-hidden="true" /></button>
                  </div>
                </>
              ) : (
                <>
                  {checks.length > 0 && (
                    <div className="tw-review-copy">
                      {checks.map(([k, label, Icon, v]) => (
                        <div key={k} className="tw-review-part">
                          <span className="tw-lb"><Icon size={16} aria-hidden="true" />{label}</span>
                          <p>{v}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {rounds.length > 0 && (
                    <div className="tw-rounds">
                      {rounds.map((r) => (
                        <details key={r.id} className="tw-round" open={!r.resolved_at}>
                          <summary>
                            <Undo2 size={16} aria-hidden="true" />
                            <b>{tx('Round {n}', { n: r.round })}</b>
                            <span>{(r.requested_name || '').split(' ')[0]}{r.created_at ? ` · ${dayShort(tashkentDay(r.created_at))}` : ''}</span>
                            {r.resolved_at ? <Badge tone="good" icon="check">{tx('Fixed')}</Badge> : <Badge tone="wait" icon="clock">{tx('Open')}</Badge>}
                          </summary>
                          <div className="tw-round-b"><PravkaNote text={r.note} /><PravkaList taskId={t.id} round={r} /></div>
                        </details>
                      ))}
                    </div>
                  )}
                  <div className="tw-review-btns">
                    <button type="button" className="co-btn co-btn-p" disabled={busy} onClick={accept}><Check size={20} aria-hidden="true" />{tx('Approve')}</button>
                    {reviews.ask && <button type="button" className="co-btn co-btn-s" ref={askBtn} aria-expanded={asking} onClick={() => setAsking(true)}><Undo2 size={20} aria-hidden="true" />{tx('Request changes')}</button>}
                  </div>
                </>
              )}
            </div>
          </div>
        ), {
          head: (
            <span className="tw-head-who">
              {file?.version != null && <span className="tw-chip"><Film size={16} aria-hidden="true" />V{file.version}</span>}
              {person(act.maker) && <span className="tw-chip"><Face person={person(act.maker)} size="xs" />{maker}{file?.at ? ` · ${dayShort(tashkentDay(file.at))}` : ''}</span>}
              {file && <a className="co-ib" href={file.url} download={file.name} aria-label={tx('Download')} title={tx('Download')}><Download size={16} aria-hidden="true" /></a>}
            </span>
          ),
        })
      }
      case 'fixing': {
        const name = crewName(act.holder)
        const does = act.seat === 'designer' ? tx('{name} fixes the artwork', { name })
          : act.seat === 'operator' ? tx('{name} films it again', { name }) : tx('{name} fixes the edit', { name })
        const until = fixUntil(t, act.seat, today)
        const gone = !until && reviewDue(t) && reviewDue(t) < today
        return box(tx('Not your step now'), (
          <>
            {holderRow(act.holder, name, [tx('round {n}', { n: act.round }),
              until ? tx('until {day}', { day: dayInLine(until, today) }) : gone && tx('was planned for {day}', { day: dayShort(reviewDue(t)) })].filter(Boolean).join(' · '))}
            {openRound && <div className="co-quote"><b>{tx('What was asked')}</b><PravkaNote text={openRound.note} /><PravkaList taskId={t.id} round={openRound} /></div>}
            {nothing(tx('When {name} hands it in, it comes back under “Check it”.', { name }))}
            <div className="co-btns">
              {runs && <RemindButton user={user} taskId={t.id} person={person(act.holder)} today={today} onSent={addComment} />}
              {acted && nextBtn}
            </div>
          </>
        ))
      }
      case 'ownfix': return box(tx('Your step now'), (
        <>
          {openRound && <div className="co-quote"><b>{tx('What to change')}</b><PravkaNote text={openRound.note} /><PravkaList taskId={t.id} round={openRound} canTick /></div>}
          <input className="input" value={fixLink} placeholder={tx('Link to the new version')} aria-label={tx('Link to the new version')}
            disabled={busy} onChange={(e) => { setFixLink(e.target.value); setErr('') }} />
          {fixLink.trim() && (
            <div className="co-btns">
              <button type="button" className="co-btn co-btn-p" disabled={busy} onClick={ownFix}><Check size={18} aria-hidden="true" />{tx('Hand in the fix')}</button>
            </div>
          )}
          {fixLink.trim() ? after(tx('The new version goes back to be checked again.')) : notYet(tx('Paste the link first. Then the button appears.'))}
        </>
      ))
      case 'move':
      case 'publish': return box(tx('Your step now'), (
        <>
          {/* T-07: the questions the move is missing are asked in a sheet over the
              window, never inline — the time rows wrapped to four rows of three
              here. The button is the move; the sheet asks only what the server
              names, and moves at once when nothing is missing. */}
          <div className="co-btns">
            <button type="button" className="co-btn co-btn-p" onClick={() => setStepping(true)}>{act.kind === 'publish' ? tx('Publish') : tx(act.verb)}<ArrowRight size={18} aria-hidden="true" /></button>
          </div>
          {after(afterWords(t, act.to, act.verb, {}, nameOf))}
          {stepping && (
            <NextStep key={`${t.id}:${act.to.id}`} item={t} to={act.to} verb={act.verb} seat={seatAt(t, pipe, makingFor(t), act.to)}
              onDone={(u) => { setStepping(false); apply(u) }} onCancel={() => setStepping(false)} />
          )}
        </>
      ))
      case 'seat': {
        // A making stop with nobody in the seat (the role play, 24 Oct 2026):
        // the step is to name the person, here, without a trip through Edit.
        // The server takes the seat the way the sheet gives it (PATCH).
        const W = act.wait
        const forKind = { shoot: 'shoot', cut: 'edit', artwork: 'design' }[W]
        const role = { shoot: 'operator', cut: 'editor', artwork: 'designer' }[W]
        const does = tx('Nobody yet')
        const hats = team.filter((u) => (u.crew_roles || []).includes(role))
        const people = (hats.length ? hats : team.filter((u) => u.role !== 'ambassador')).filter((u) => u.id !== 0)
        const give = async (id) => {
          if (busy || !id) return
          setBusy(true); setErr('')
          try { apply(await api.patch(`/content/${t.id}`, { [act.seat]: id })); toast(tx('Named — they see it on their day now')) }
          catch (e) { setErr(e.message) } finally { setBusy(false) }
        }
        return box(canEditIt ? tx('Your step now') : tx('Not your step now'), (
          <>
            {holderRow(null, does, '')}
            {canEditIt
              ? <FacePicker label={W === 'shoot' ? tx('Who films it?') : W === 'cut' ? tx('Who edits it?') : tx('Who designs it?')} Icon={KIND[forKind].Icon} people={people} value={null} onChange={give} />
              : nothing(tx('Whoever runs the piece names the person.'))}
            {canEditIt && after(tx('They see it on their day at once, and are told.'))}
          </>
        ))
      }
      case 'waiting': {
        // A seat that is held is never "nobody", even before its name has loaded.
        const known = nameOf(act.holder)
        const name = known || (act.holder ? tx('Someone') : '')
        const W = act.wait
        const does = name || tx('Nobody yet')
        const forKind = { shoot: 'shoot', cut: 'edit', artwork: 'design' }[W]
        const day = W === 'shoot' ? t.recording_date : W === 'cut' ? (editDue(t) || reviewDue(t)) : W === 'artwork' ? (t.design_ready_date || reviewDue(t)) : W === 'review' ? reviewDue(t) : null
        const late = day && day < today ? daysBetween(day, today) : 0
        const sub = !day ? '' : W === 'shoot' ? shootWhen : dayShort(day)
        const mark = late ? <Badge tone="late">{lateWords(late)}</Badge>
          : W === 'shoot' && act.holder ? (t.shoot_ack === 'yes' ? <Badge tone="good" icon="check">{tx('{name} is coming', { name })}</Badge>
            : t.shoot_ack === 'no' ? <Badge tone="late">{tx('{name} can’t come', { name })}</Badge> : <Badge tone="wait">{tx('No answer yet')}</Badge>)
            : act.holder ? <Badge tone="good">{tx('On time')}</Badge> : null
        return box(act.didMine ? tx('Finished') : tx('Not your step now'), (
          <>
            {act.didMine && <div><Badge tone="good" icon="check">{tx('Done')}</Badge></div>}
            {!act.didMine && <div className="tw-wait-who">{holderRow(act.holder, does, sub)}</div>}
            {!act.didMine && !late && mark && <div>{mark}</div>}
            {!act.didMine && nothing(!act.holder ? (canEditIt ? tx('Name a person in the plan.') : '')
              : late ? (runs && known ? tx('It is late. You can remind {name}.', { name: known }) : tx('It is late.'))
                : W === 'shoot' && t.shoot_ack === 'no' ? (canEditIt ? tx('Name another person, or move the shoot to a new day, in the plan.') : '')
                  : W === 'review' ? tx('{name} posts it when it is checked.', { name })
                    : tx('It comes back to you when {name} hands it in.', { name }))}
            <div className="co-btns tw-wait-btns">
              {!act.didMine && act.holder && forKind && adminOn(user, t.channels) && !forThem && (
                <button type="button" className="co-btn co-btn-s" onClick={() => setForThem(true)}><UploadCloud size={18} aria-hidden="true" />{tx('Upload for {name}', { name })}</button>
              )}
              {runs && !act.didMine && act.holder && <RemindButton user={user} taskId={t.id} person={person(act.holder)} today={today} onSent={addComment} />}
              {(acted || act.didMine) && nextBtn}
            </div>
            {!act.didMine && act.holder && forKind && adminOn(user, t.channels) && forThem && (
              <HandIn inline local={DEMO} key={`for:${t.id}:${forKind}`} item={t} kind={forKind} label={tx('Hand in for: {name}', { name })}
                onDone={(u) => { setForThem(false); apply(u) }} />
            )}
          </>
        ))
      }
      case 'out': return box(tx('Finished'), (
        <>
          {acted && nextBtn && <div className="co-btns">{nextBtn}</div>}
        </>
      ))
      default: return box(tx('Not your step now'), (
        <>
          {act.didMine && <div><Badge tone="good" icon="check">{tx('Done')}</Badge></div>}
          {nothing(at < 0 ? tx('This task was deleted.') : '')}
          {acted && nextBtn && <div className="co-btns">{nextBtn}</div>}
        </>
      ))
    }
  }

  // ---- the maker's colour (r11) ----
  const maker = person(ownerIdOf(t))
  const pcNow = colorIndexOf(t, maker, today)
  const canColor = (maker?.color_mode || 'own') === 'own' && (owners.includes(user.id) || user.role === 'admin') && at >= 0
  const [pcOpen, setPcOpen] = useState(false)
  // The pop-up by the title is worked by keyboard (the a11y audit, 10 Nov 2026): the
  // keyboard lands on the chosen swatch when it opens; Esc shuts the pop-up alone and
  // gives the dot the focus back — it used to close the whole window.
  const pcDot = useRef(null)
  const pcBox = useRef(null)
  useEffect(() => { if (pcOpen) (pcBox.current?.querySelector('.pc-swatch[aria-pressed="true"]') || pcBox.current?.querySelector('.pc-swatch'))?.focus() }, [pcOpen])
  const shutColors = () => { setPcOpen(false); setTimeout(() => pcDot.current?.focus({ preventScroll: true }), 0) }
  const pickColor = async (i) => {
    try { apply(await api.post(`/content/${t.id}/color`, { color: i })); shutColors() } catch (e) { toast(e.message, 'err') }
  }

  const K = KIND[doneHat ? doneHat.kind : kind] || KIND.idea
  // ---- round 14: the one window, as the owner picked it (16 Oct 2026) ----
  // "The task view is complicated", "the edit form does not match the task view":
  // a header that says what it is and whose; then two columns on a desk —
  // what to do and what to make it from (your step with its drop box, the brief
  // open, the reference, the files, the talk), and beside it the plan, pressed
  // to change by whoever may edit the piece (TaskPlan). One column on a phone.
  const chanWords = (t.channels || []).map((c) => byKey[c]?.label || c).join(', ')
  const crumb = [typeLabel(t.type), chanWords, owner === user.id ? tx('yours') : nameOf(owner) ? tx('for {name}', { name: nameOf(owner) }) : ''].filter(Boolean).join(' · ')
  const activity = t.activity || []
  // Who may change which value (the server's gates, mirrored — lib/mayChange.js); read only once the task is loaded.
  const stage = stageOf(t, pipe)
  const may = (field) => (loaded ? mayChange(user, t, field, stage, { filmed: !!makingFor(t)?.filmed }) : false)
  const planBlock = (
    <section className={'co-blk tw-plan-blk' + shutCls('plan')} data-field="plan" id="tw-sec-plan">
      {fold('plan', CalendarDays, tx('Plan'))}
      <TaskPlan t={t} label={at >= 0 ? pipe.live[at].label : ''} making={makingFor(t)} team={team} today={today} byKey={byKey} only={crewOnly ? mySeats : null}
        may={may} askField={askFor?.field || ''} onPatch={(body, field) => patchField(body, field)} isAdmin={adminOn(user, t.channels)} runsName={nameOf(owner)}
        onAnswered={(u) => {
          // An ask to move a day (AskDay, still open on its row while it answers) is the third way of changing a value.
          const row = panel.current?.querySelector('.tw-askmove')?.closest('[data-row]')?.dataset.row
          if (row) trackAct('task.edit', { task: item.id, f: { shoot: 'recording_date', edit: 'edit_ready_date', design: 'design_ready_date', out: 'release_date' }[row] || row, how: 'ask' })
          if (u?.id) apply(u, { undoable: false }); else load()
        }} />
    </section>
  )
  // The "…" menu in the header: All fields (the full sheet), Duplicate, Delete — each only for whoever may.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtn = useRef(null)
  const delBtn = useRef(null)
  const menuBox = useRef(null)
  const [sure, setSure] = useState(false)
  useEffect(() => {
    if (!menuOpen) return undefined
    if (!sure) menuBox.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true })   // the confirmation puts the keyboard on Cancel (below)
    const away = (e) => { if (!menuBox.current?.contains(e.target) && !menuBtn.current?.contains(e.target) && !delBtn.current?.contains(e.target)) { setMenuOpen(false); setSure(false) } }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [menuOpen])
  // The Delete confirmation takes the place of the items: the keyboard goes to its first button, and back to Delete
  // when it is cancelled (it fell to the page body, where Esc closed the whole window and Tab left it).
  const wasSure = useRef(false)
  useEffect(() => {
    if (!menuOpen) { wasSure.current = false; return }
    // Cancel first, never the destructive button: a held Enter on the Delete icon must not delete the task.
    if (sure) menuBox.current?.querySelector('.tw-sure .co-btn-q')?.focus({ preventScroll: true })
    else if (wasSure.current) (menuBox.current?.querySelector('[data-key="del"]') || menuBox.current?.querySelector('[role="menuitem"]'))?.focus({ preventScroll: true })
    wasSure.current = sure
  }, [sure, menuOpen])
  const shutMenu = () => { const back = sure ? delBtn : menuBtn; setMenuOpen(false); setSure(false); setTimeout(() => (back.current || menuBtn.current)?.focus({ preventScroll: true }), 0) }
  const duplicate = async () => {
    try { const copy = await api.post(`/content/${t.id}/duplicate`); toast(tx('Duplicated as {name}', { name: copy.title })); setMenuOpen(false); onClose(copy) }
    catch (e) { toast(e.message, 'err') }
  }
  const remove = async () => {
    try { if (onDeleted) await onDeleted(t); else await api.del(`/content/${t.id}`); toast(tx('Task deleted')); setMenuOpen(false); close(true) }
    catch (e) { toast(e.message, 'err') }
  }
  const menuItems = [
    (edit || editIn) && canEditIt && { key: 'all', Icon: LayoutList, label: tx('All fields'), on: () => { setMenuOpen(false); goOut('full') } },
    // The copy takes this window's place, so it asks over unsent words first, as every other way out does.
    may('duplicate') && at >= 0 && { key: 'dup', Icon: CopyPlus, label: tx('Duplicate'), on: () => { setMenuOpen(false); menuBtn.current?.focus({ preventScroll: true }); goOut('dup') } },
    // A phone has one icon, More: Copy link and Delete are its items there.
    phone && at >= 0 && { key: 'link', Icon: Link2, label: tx('Copy link'), on: () => { shutMenu(); copyLink() } },
    phone && may('delete') && at >= 0 && { key: 'del', Icon: Trash2, label: tx('Delete task'), on: () => setSure(true) },
  ].filter(Boolean)
  // Copy link and Delete are the header's own icons (12 Nov 2026, the owner: "instead of More details, just a delete
  // icon and link copy"); the menu keeps the rest. Delete opens the same "cannot be undone" question under it.
  const canDel = may('delete') && at >= 0
  const copyLink = () => {
    const url = `${window.location.origin}/brief?task=${t.id}`
    navigator.clipboard?.writeText(url).then(() => toast(tx('Link copied — paste it anywhere')), () => toast(url, 'err'))
  }
  const menuKeys = (e) => {
    const all = [...menuBox.current.querySelectorAll('[role="menuitem"]')]
    const i = all.indexOf(document.activeElement)
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key]
    // Esc in the Delete confirmation takes back the confirmation, not the menu or the window.
    // On a phone the question sits inside More, so Esc goes back to its items; on a desk it is Delete's own, so Esc shuts it and the keyboard returns to the Delete icon.
    if (e.key === 'Escape' && sure) { e.preventDefault(); e.stopPropagation(); if (phone) setSure(false); else shutMenu(); return }
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); shutMenu(); return }
    if (to == null) return
    e.preventDefault(); all[(to + all.length) % all.length]?.focus()
  }
  // The kind, the channel (a one-channel piece) and the Telegram type, as chips under the title.
  const firstChan = byKey[(t.channels || [])[0]]
  const typedChan = !!firstChan && ['text', 'short'].includes(firstChan.format)
  const kindOptions = KINDS.filter((k) => !typedChan || k.key === 'post').map((k) => ({ value: k.key, label: typeLabel(k.key), icon: typeInfo(k.key).icon }))
  const chanOptions = Object.values(byKey).filter((c) => c?.key && (adminOn(user, [c.key]) || (user.departments || []).includes(c.key))).sort((a, b) => String(a.label).localeCompare(String(b.label)))
    .map((c) => ({ value: c.key, label: c.label, icon: iconFor(c.icon) }))
  const textChan = (t.channels || []).some((k) => byKey[k]?.format === 'text')
  // Whom a seat outside the plan (whose piece, who checks it) can be given to: the team, not the ambassadors.
  const pickable = team.filter((u) => u.id && u.role !== 'ambassador')
  const reviewers = listed(t.reviewers, t.reviewer_id)
  return (
    <div className={'co-win' + (closing ? ' out' : '')}>
      <div className="co-scrim" onMouseDown={() => close()} />
      <aside className={`co-panel r14-tw ${K.cls}`} role="dialog" aria-modal="true" aria-labelledby="co-win-t" ref={panel} onKeyDown={trap} data-task={item.id}
        onInput={(e) => { if (e.target.matches?.('input:not([type=file]):not([type=radio]):not([type=checkbox]), textarea')) typed.current.add(e.target) }}>
        <header className="co-p-head r14-tw-h" ref={headRef}>
          {/* P-03: on a phone the way out is "Back" at the top left (the OS convention); a desk keeps the × top right. */}
          <button type="button" className="co-back" onClick={() => close()} aria-label={tx('Back')}><ChevronLeft size={22} aria-hidden="true" /></button>
          {/* 12 Nov 2026, the owner: no channel tile beside the title — the channel is the first word of the line under it. */}
          <div className="r14-tw-tt">
            {editing === 'sheet' ? <h2 id="co-win-t">{tx('All fields')}</h2> : (<>
            {/* The maker's colour is the dot by the title; its owner presses the dot
                to pick one (no second row under the title — the owner, 13 Oct). */}
            <h2 id="co-win-t" tabIndex={-1} className={(titleOpen ? 'open' : '') + (may('title') ? ' tw-h-may' : '')} onClick={may('title') ? undefined : () => setTitleOpen((v) => !v)}>
              {canColor ? (
                <button type="button" className="co-pc-dot" ref={pcDot} aria-expanded={pcOpen} aria-haspopup="true" onClick={(e) => { e.stopPropagation(); setPcOpen((v) => !v) }} aria-label={tx('Colour of this piece')}>
                  <i className="pc-dot pc-dot-lg" style={pcNow != null ? colorStyle(pcNow) : { '--pc': 'var(--hairline-strong)' }} aria-hidden="true" />
                </button>
              ) : pcNow != null && <i className="pc-dot pc-dot-lg" style={colorStyle(pcNow)} aria-hidden="true" />}
              {/* The words in their own box: the dot stands beside the first line and a second line starts under the first, not under the dot. */}
              <span className="tw-tt" data-field="title">
                <LineField value={t.title} label={tx('Name')} may={may('title')} required className="tw-title-f" onCommit={(v) => patchField({ title: v }, 'title')} />
              </span>
            </h2>
            {canColor && pcOpen && (
              <div className="co-pc" ref={pcBox} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); shutColors() } }}>
                <span className="pc-filter co-pc-pick" role="group" aria-label={tx('Colour of this piece')}>
                  {[...Array(PALETTE)].map((_, i) => (
                    <button key={i} type="button" className="pc-swatch" style={colorStyle(i)} aria-pressed={t.color === i}
                      aria-label={tx('Colour {n}', { n: i + 1 })} onClick={() => pickColor(t.color === i ? null : i)} />
                  ))}
                </span>
              </div>
            )}
            {/* 9 Nov 2026 (the owner's drawing): the title in focus, and under it only whose
                task it is. No stops line, no chips — the stage is the job block's word, the
                day and how late are its head. */}
            {/* 12 Nov 2026, the owner: the title, then one quiet line — the channel · whose piece · the kind. */}
            <div className="tw-meta tw-meta-line">
              {at >= 0 && (t.channels || []).length === 1 && <span data-field="channels"><ChipField value={t.channels[0]} label={tx('Channel')} may={may('channels')} options={chanOptions} icon={iconFor(firstChan?.icon)} display={firstChan?.label || t.channels[0]} onCommit={(v) => patchField({ channels: [v] }, 'channels')} /></span>}
              {(t.channels || []).length > 1 && <span className="tw-ro tw-chip-ro tw-chans" title={t.channels.map((c) => byKey[c]?.label || c).join(', ')}>{t.channels.map((c) => byKey[c]?.label || c).join(', ')}</span>}
              {/* "Runs it" is a seat (§2.2): a picker for whoever may reassign (the admin on it), the face and name for the rest. */}
              {may('owners') ? (
                <span className="tw-owner tw-seat-f" data-field="owners">
                  <PersonPick value={owner} label={tx('Whose piece')} first={pickable} empty={tx('Assign')}
                    onChange={(id) => { if (id !== owner) patchField({ assignee_ids: [id, ...owners.filter((x) => x !== id && x !== owner)] }, 'owners', { before: { assignee_ids: owners } }).catch((e) => toast(e.message, 'err')) }} />
                </span>
              ) : person(owner) && <div className="tw-owner"><Face person={person(owner)} size="sm" /><span>{owner === user.id ? tx('You') : nameOf(owner)}</span></div>}
              {at >= 0 && !typedChan && <span data-field="type"><ChipField value={t.type} label={tx('Kind')} may={may('type')} options={kindOptions} icon={typeInfo(t.type).icon} display={typeLabel(t.type)} onCommit={(v) => patchField({ type: v }, 'type')} /></span>}
              {at >= 0 && textChan && <span data-field="telegram_type"><ChipField value={t.telegram_type || ''} label="Telegram" may={may('telegram_type')} options={TELEGRAM_TYPES.map((x) => ({ value: x.key, label: tx(x.label) }))} display={t.telegram_type ? tx(telegramTypeLabel(t.telegram_type)) : tx('Telegram type')} onCommit={(v) => patchField({ telegram_type: v }, 'telegram_type')} /></span>}
            </div>
            </>)}
          </div>
          {/* 12 Nov 2026, the owner: read from the corner inward — × · Delete · Copy link · More; one row, never wrapped.
              The menu (More's items, or Delete's confirmation) hangs under the whole row, at its right edge. */}
          <div className="co-p-acts tw-acts">
            {menuItems.length > 0 && !editing && <button type="button" className="co-x tw-ib tw-more-btn" ref={menuBtn} aria-haspopup="menu" aria-expanded={menuOpen && (phone || !sure)} aria-label={tx('More')} title={tx('More')} onClick={() => { setSure(false); setMenuOpen((v) => !v || sure) }}><MoreHorizontal size={18} aria-hidden="true" /></button>}
            {!editing && !phone && at >= 0 && (
              <button type="button" className="co-x tw-ib" onClick={copyLink} aria-label={tx('Copy link')} title={tx('Copy link')}><Link2 size={18} aria-hidden="true" /></button>
            )}
            {canDel && !editing && !phone && <button type="button" className="co-x tw-ib tw-del-ib" ref={delBtn} aria-haspopup="true" aria-expanded={menuOpen && sure} onClick={() => { if (menuOpen && sure) { shutMenu() } else { setSure(true); setMenuOpen(true) } }} aria-label={tx('Delete task')} title={tx('Delete task')}><Trash2 size={18} aria-hidden="true" /></button>}
            {(menuItems.length > 0 || canDel) && !editing && (
              <span className="tw-more-menu">
                {menuOpen && (
                  <span className="tw-menu" role="menu" aria-label={sure ? tx('Delete this task?') : tx('More')} ref={menuBox} onKeyDown={menuKeys}>
                    {!sure ? menuItems.map((m) => (
                      <button key={m.key} type="button" role="menuitem" tabIndex={-1} className="tw-mi" data-key={m.key} onClick={m.on}><m.Icon size={16} aria-hidden="true" /><span>{m.label}</span></button>
                    )) : (
                      <span className="tw-sure" role="group" aria-label={tx('Delete this task?')}>
                        <b>{tx('Delete «{title}»?', { title: t.title.length > 40 ? `${t.title.slice(0, 38)}…` : t.title })}</b>
                        <span>{tx('Its files, comments and history go with it. This cannot be undone.')}</span>
                        <button type="button" role="menuitem" tabIndex={-1} className="co-btn co-btn-sm tw-del" onClick={remove}><Trash2 size={16} aria-hidden="true" />{tx('Delete task')}</button>
                        <button type="button" role="menuitem" tabIndex={-1} className="co-btn co-btn-q co-btn-sm" onClick={() => { if (phone) setSure(false); else shutMenu() }}>{tx('Cancel')}</button>
                      </span>
                    )}
                  </span>
                )}
              </span>
            )}
            <button type="button" className="co-x tw-close" ref={closeBtn} onClick={() => close()} aria-label={editing ? tx('Cancel') : tx('Close the task')}><X size={18} aria-hidden="true" /></button>
          </div>
          {leaving && (
            <div className="co-note co-n-wait co-leave" role="alertdialog" aria-label={tx('You wrote something and did not send it.')}>
              {draftOnly()
                ? <span><b>{tx('Your words are not saved.')}</b> {tx('A draft is kept for when you open it again.')}</span>
                : <span><b>{tx('You wrote something and did not send it.')}</b> {tx('If you close now, it is lost.')}</span>}
              <span className="co-btns">
                <button type="button" className="co-btn co-btn-s co-btn-sm" autoFocus onClick={keepWriting}>{tx('Keep writing')}</button>
                <button type="button" className="co-btn co-btn-s co-btn-sm" onClick={() => leave(leaving)}>{tx('Close anyway')}</button>
              </span>
            </div>
          )}
        </header>

        {editing === 'builder' && editIn && editIn(t, {
          step: editStep,
          cancel: () => setEditing(null),
          saved: (u) => { setEditing(null); if (u?.id) apply(u, { undoable: false }); else load() },
          full: edit ? () => setEditing('sheet') : null,
        })}
        {editing === 'sheet' && edit ? edit(t, {
          closeRef: editOut,
          done: () => { setEditing(null); load() },
          leave: (nextTask) => onClose(nextTask),
        }) : (
        <div className={'co-p-body r14-tw-b tw-b' + (act.kind === 'check' ? ' solo' : '')}>
          <div className="tw-top">
            <DayAsks t={t} user={user} onChanged={heard} />
            {/* The job: the one block, its drop zone, the one button. */}
            {actBox()}
            {undo > 0 && (
              <div className="co-note co-n-wait co-undo" role="status">
                <span><b>{tx('Pressed by mistake?')}</b> {tx('You can take it back for {n} more seconds.', { n: left })}</span>
                <span className="co-btns">
                  <button type="button" className="co-btn co-btn-s co-btn-sm" disabled={undoing} onClick={takeBack}><Undo2 size={16} aria-hidden="true" />{tx('Undo')}</button>
                </span>
              </div>
            )}
            {fieldUndo && (
              // Not a live region: the change is said once in the status region under it; the seconds are for the eye.
              <div className="co-note co-n-wait co-undo tw-fundo">
                <span><b>{tx('«{field}» changed', { field: fieldWord(fieldUndo.field) })}</b> <span aria-hidden="true">{tx('You can take it back for {n} more seconds.', { n: fieldLeft })}</span></span>
                <span className="co-btns"><button type="button" className="co-btn co-btn-s co-btn-sm" onClick={takeFieldBack}><Undo2 size={16} aria-hidden="true" />{tx('Undo')}</button></span>
              </div>
            )}
            <span className="sr-only" role="status" aria-live="polite">{statusMsg}</span>
            {err && <div className="form-error" role="alert">{err}</div>}
          </div>

          <div className="tw-right">
            {/* What to make, open and whole (the owner's pick: "by default it must be
                the brief"): the ТЗ for whoever edits or draws, the script first for
                whoever films, the brief for the piece's owner. */}
            {at >= 0 && planBlock}
            {(() => {
              const mk = makingFor(t)
              const parts = crewOnly ? (mySeats.includes('shoot') ? ['script'] : mySeats.includes('edit') ? ['tz', 'script'] : ['tz']) : [!mk?.written && 'tz', mk?.filmed && 'script', 'description'].filter(Boolean)
              if (hat?.kind === 'shoot') parts.sort((a, b) => (a === 'script' ? -1 : b === 'script' ? 1 : 0))
              const shown = parts.filter((k) => may(k) || String(t[k] || '').replace(URL_RE, '').trim())
              const HOLD = { tz: () => tx('Write the ТЗ — what the editor is asked to make of the footage'), script: () => tx('Write the script — the words and shots the crew films by'), description: () => tx('What the post says') }
              return (
                <section className={`co-blk r14-brief co-main-${hat?.kind || doneHat?.kind || 'brief'}` + shutCls('brief')} hidden={act.kind === 'check'} id="tw-sec-brief">
                  {fold('brief', FileText, tx('Brief'))}
                  {shown.length === 0 ? (
                    <div className="co-brief-empty">
                      {hat && owner && owner !== user.id && <RemindButton user={user} taskId={t.id} person={person(owner)} today={today} onSent={addComment} />}
                    </div>
                  ) : (
                    <div className="r14-brief-box">
                      {shown.map((k) => (
                        <div key={k} className="co-main-part tw-part" data-field={k}>
                          <span className="co-main-lbl">{(() => { const I = BRIEF_ICON[k]; return I ? <I size={16} aria-hidden="true" /> : null })()}{BRIEF[k]()}</span>
                          <LongField taskId={t.id} userId={user.id} field={k} value={t[k]} label={BRIEF[k]()} may={may(k) === true} placeholder={HOLD[k]()} version={t.updated_at || null} opened={loaded && openField === k}
                            onCommit={(v, o) => patchField({ [k]: v }, k, { since: o?.since })}
                            extra={k === 'description' && String(t[k] || '').trim() ? <CharCount text={t[k]} channels={t.channels} /> : null} />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )
            })()}
            {activity.length > 0 && (
              <section className={'co-blk tw-hist' + shutCls('hist') + (allLog ? ' is-more' : '')} id="tw-sec-hist">
                {fold('hist', History, tx('History'))}
                <ol className="tw-log">
                  {(allLog ? activity.slice(0, 12) : activity.slice(0, 3)).map((a) => (
                    <li key={a.id}>
                      <Face person={person(a.user_id) || { name: a.user_name || '?' }} size="xs" />
                      <span><b>{nameOf(a.user_id) || (a.user_name || '?').split(' ')[0]}</b> {activityLine(a)}</span>
                      <time dateTime={a.created_at}>{dayShort(tashkentDay(a.created_at))} · {new Date(a.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })}</time>
                      {/* §2.7: a long text's line opens the version before, to copy from */}
                      {['tz', 'script', 'description'].includes(a.field) && a.old_value && (
                        <details className="tw-prev">
                          <summary>{tx('The version before')}</summary>
                          <p className="tw-long-txt">{a.old_value}</p>
                          <button type="button" className="co-btn co-btn-q co-btn-sm" onClick={() => { navigator.clipboard?.writeText(a.old_value).then(() => toast(tx('Copied')), () => {}) }}><Copy size={16} aria-hidden="true" />{tx('Copy')}</button>
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
                {activity.length > 3 && (
                  <button type="button" className="co-link tw-hist-more" aria-expanded={allLog} aria-controls="tw-sec-hist" onClick={() => setAllLog((v) => !v)}>
                    {allLog ? tx('Show less') : tx('Show more')}
                  </button>
                )}
              </section>
            )}
          </div>

          <div className="tw-left">
            {/* What was made, playing (9 Nov 2026): the footage, the edit, the cover. */}
            {DEMO && loaded && <Material t={t} person={person} show={matShow} />}
            {mayRef && ((!hasRef && !refOpen) || (nFiles === 0 && !fileOpen && drive?.connected)) && (
              <div className="co-add-line">
                {!hasRef && !refOpen && <button type="button" className="co-link" onClick={() => setRefOpen(true)}><Plus size={14} aria-hidden="true" />{tx('Add a reference')}</button>}
                {nFiles === 0 && !fileOpen && drive?.connected && <button type="button" className="co-link" onClick={() => setFileOpen(true)}><Plus size={14} aria-hidden="true" />{tx('Add a file')}</button>}
              </div>
            )}
            <section className={'co-blk co-ref' + shutCls('ref')} hidden={!(hasRef || refOpen) || act.kind === 'check'} id="tw-sec-ref">
              {fold('ref', Link2, tx('Reference'))}
              {/* The owner, 9 Nov 2026: a link that is a video plays here, with its words under it. */}
              {(() => {
                const FILE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i
                const vids = refLinks.filter((u) => FILE.test(u) || (embedOf(u) && !embedOf(u).page && /youtube|instagram|drive/.test(embedOf(u).src)))
                const rest = refLinks.filter((u) => !vids.includes(u))
                return (
                  <div className="tw-refcard">
                    {vids.map((u) => (FILE.test(u)
                      ? <video key={u} className="tw-refvid" src={u} controls playsInline preload="metadata" aria-label={tx('Reference')} />
                      : <iframe key={u} className={'tw-refvid' + (embedOf(u).tall ? ' tall' : '')} src={embedOf(u).src} title={tx('Reference')} loading="lazy" allowFullScreen />))}
                    {/* §2.2: whoever may change the reference changes its words in place (a long text: they may hold lines)… */}
                    {may('reference_text') === true
                      ? <div className="co-ref-txt" data-field="reference_text"><LongField taskId={t.id} userId={user.id} field="reference_text" value={t.reference_text} label={tx('Reference')} may
                        placeholder={tx('Paste a link or write how it should look…')} onCommit={(v) => patchField({ reference_text: v || null }, 'reference_text')} /></div>
                      : refWords && <p className="co-ref-txt"><LinkText text={refWords} /></p>}
                    {/* Any other link as a preview; pressed, it opens in the middle of the page. */}
                    {rest.length > 0 && <div className="lp-row">{rest.map((u) => <LinkPreview key={u} url={u} onOpen={setLinkOpen} />)}</div>}
                    {/* …and each of its links: the address and a quiet pencil, a line in the same place on press; emptied, the link goes. */}
                    {may('reference_links') === true && refList.length > 0 && (
                      <div className="tw-ref-links" data-field="reference_links">
                        {refList.map((u, i) => (
                          <LineField key={i} value={u} label={tx('Reference')} may className="tw-pen-f"
                            display={<><Pencil size={14} aria-hidden="true" />{hostOf(u)}</>}
                            onCommit={(v) => patchField({ reference_links: v ? refList.map((x, j) => (j === i ? v : x)) : refList.filter((_, j) => j !== i) }, 'reference_links')} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
              <RefMedia task={t} user={user} plans={reach && can(user, 'manage_content')} onHeld={setRefHeld} adds={mayRef && refOpen} catchAll={mayRef}
                onOther={drive && !drive.connected ? null : (fs) => {
                  // The Drive box is the door for every file that is not a photo — also
                  // before the window knows whether Drive is on, and before the box has
                  // mounted (24 Oct 2026: a video dropped in that second became a
                  // reference). Not there yet: say so, and keep the video out of the references.
                  if (!boxAdd.current) { toast(tx('Still loading — drop it again in a moment')); return true }
                  setFileOpen(true)
                  return boxAdd.current(fs)
                }}
                legacy={Array.isArray(t.reference_photos) ? t.reference_photos : []}
                onRemoveLegacy={reach && can(user, 'manage_content') ? async (i) => {
                  try {
                    const u = await api.patch(`/content/${t.id}`, { reference_photos: t.reference_photos.filter((_, j) => j !== i) })
                    setT((old) => ({ ...old, ...u, reference_photos: old.reference_photos.filter((_, j) => j !== i) }))
                  } catch (e) { toast(e.message, 'err') }
                } : null} />
              {mayRef && hasRef && !refOpen && (
                <button type="button" className="co-link co-add-more" onClick={() => setRefOpen(true)}><Plus size={14} aria-hidden="true" />{tx('Add to the reference')}</button>
              )}
              {mayRef && refOpen && (
                <div className="co-ref-add">
                  <input className="input" ref={refInput} value={refDraft} placeholder={tx('Paste a link or write how it should look…')} aria-label={tx('Paste a link or write how it should look…')}
                    onChange={(e) => setRefDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRef() } }} />
                  <button type="button" className="co-btn co-btn-s co-btn-sm" disabled={!refDraft.trim() || refBusy} onClick={addRef}><Plus size={16} aria-hidden="true" />{tx('Add')}</button>
                </div>
              )}
            </section>

            <section className={'co-blk co-files-blk' + shutCls('files')} hidden={nFiles === 0 && !fileOpen} id="tw-sec-files">
              {fold('files', FileText, tx('Files'))}
              {files.length + docs.length > 0 && (
                <div className="co-files">
                  {!DEMO && files.map((m) => (
                    <span key={m.label + m.href} className="tw-file-ln" data-field={m.field}>
                      <button type="button" className="co-file" onClick={() => setLinkOpen(m.href)} title={m.href}><ExternalLink size={16} aria-hidden="true" />{m.label}</button>
                      {/* §2.2: a delivery link is changed in place by whoever may set it — a quiet pencil, a line on press. */}
                      {may(m.field) === true && <LineField value={t[m.field] || ''} label={m.label} may className="tw-pen-f" display={<Pencil size={14} aria-hidden="true" />}
                        onCommit={(v) => patchField({ [m.field]: v || null }, m.field)} />}
                    </span>
                  ))}
                  {docs.map((d) => (
                    <button key={d.id} type="button" className="co-file" onClick={() => openDoc(d)}><FileText size={16} aria-hidden="true" />{d.name}</button>
                  ))}
                </div>
              )}
              {/* Every Drive file the task points at — dropped, uploaded, or an old
                  link — to play and download here; then the drop box that sends the
                  next one to the team's Drive (server/taskfiles.js, server/dropin.js). */}
              <TaskFiles taskId={t.id} onList={setDrive} />
              {/* Mounted for the owner even while folded, so a file dropped on the task lands in it. */}
              {loaded && drive?.connected && mayRef && <div hidden={!fileOpen}><DriveBox task={t} folder={t.drop?.folder_name} register={registerBox} /></div>}
              {loaded && drive?.connected && mayRef && nFiles > 0 && !fileOpen && (
                <button type="button" className="co-link co-add-more" onClick={() => setFileOpen(true)}><Plus size={14} aria-hidden="true" />{tx('Add a file')}</button>
              )}
            </section>
            {linkOpen && <LinkViewer url={linkOpen} onClose={() => setLinkOpen(null)} />}

            {/* Out on Instagram: what it got, and where the number came from. */}
            {t.done_at && onInstagram(t, byKey) && <IgNumbers t={t} />}
            {/* T-03: no "Details" block — the stage is in the stages line, the
                type and the channel in the meta line; the rest of the facts are
                under More details, with where it goes, the deadlines, the history
                and the links. One fold (round 9) for what is rarely needed. */}
          </div>

          {/* The owner, 9 Nov 2026: the plan, the history and the details are folds,
              shut by default, that slide open — across the window, under both columns. */}
          {/* 12 Nov 2026, the owner: no "More details" fold (its TikTok/Shorts ticks, facts and links). Copy link and
              Delete are the header's icons; the history is a short preview under the brief in the right column. */}
        </div>
        )}
      </aside>
    </div>
  )
}

// ---- a late job's two answers ---------------------------------------------------------
// Ask for a new day, or say what is in the way — the same two answers the
// crew's page has always folded under a late row (components/CrewDay.jsx,
// which keeps its own copy for the previous look and goes when that look
// does), sent to the same two routes. Offered only where the SERVER has the
// job as late, so what is asked is filed against the deadline that actually
// slipped; an admin answers a new day, and asking moves nothing by itself.
function LateHelp({ taskId, phase, today, onMoved }) {
  const [info, setInfo] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)   // { kind: 'day' | 'why', to, reason }
  const [busy, setBusy] = useState(false)
  const loadLate = useCallback(() => api.get('/content/late/mine')
    .then((rows) => setInfo((Array.isArray(rows) ? rows : []).find((r) => r.content_id === taskId && r.phase === phase) || null))
    .catch(() => {}), [taskId, phase])
  useEffect(() => { loadLate() }, [loadLate])
  if (!info) return null
  if (info.asked || info.flagged) {
    return (
      <span className="co-help">
        {info.asked ? <><CalendarClock size={13} aria-hidden="true" /> {tx('New day asked for — waiting on an admin')}</>
          : <><Hand size={13} aria-hidden="true" /> {tx('The planners know this one is late')}</>}
      </span>
    )
  }
  const send = async () => {
    if (busy || !form || !isSentence(form.reason)) return
    setBusy(true)
    try {
      if (form.kind === 'day') {
        // Your own late job's day now moves at once (r11); anything else is still an ask.
        const out = await api.post(`/content/${taskId}/date-requests`, { field: info.field, to_date: form.to, reason: form.reason.trim() })
        toast(out?.task ? tx('Day moved — the others on it are told') : tx('Asked — an admin will answer, and you will hear it'))
        if (out?.task) onMoved?.(out.task)
      } else {
        await api.post(`/content/${taskId}/flags`, { kind: 'at_risk', reason: form.reason.trim() })
        toast(tx('Sent — they know what is in the way'))
      }
      setForm(null); setOpen(false)
      loadLate()
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  if (!open) return <div><button type="button" className="co-link" onClick={() => setOpen(true)}>{tx('Can’t make it?')}</button></div>
  if (!form) {
    return (
      <div className="co-btns">
        <button type="button" className="co-btn co-btn-s co-btn-sm" onClick={() => setForm({ kind: 'day', to: '', reason: '' })}><CalendarClock size={16} aria-hidden="true" />{tx('Move to a new day')}</button>
        <button type="button" className="co-btn co-btn-s co-btn-sm" onClick={() => setForm({ kind: 'why', to: '', reason: '' })}><Hand size={16} aria-hidden="true" />{tx('Say what is in the way')}</button>
        <button type="button" className="co-link" onClick={() => setOpen(false)}>{tx('Never mind')}</button>
      </div>
    )
  }
  return (
    <div className="co-late-form">
      {form.kind === 'day' && (
        <label className="co-lbl">{tx('New day')}
          <DayPick value={form.to} min={today} label={tx('New day')} onChange={(d) => setForm({ ...form, to: d })} />
        </label>
      )}
      <textarea className="input" rows={2} autoFocus value={form.reason}
        placeholder={form.kind === 'day' ? tx('What happened — e.g. “the footage came in late”') : tx('What is in the way — e.g. “waiting for the music”')}
        onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      <span className="co-help">{form.kind === 'day' ? (form.to ? tx('It moves at once. Everyone else on the piece is told. No admin needed.') : tx('Pick the new day.')) : tx('The planners hear it straight away.')}</span>
      <div className="co-btns">
        {/* A new day is a day: sent empty, it cleared the deadline (the bug hunt, 14 Oct 2026). */}
        <button type="button" className="co-btn co-btn-s co-btn-sm" disabled={busy || !isSentence(form.reason) || (form.kind === 'day' && !/^\d{4}-\d{2}-\d{2}$/.test(form.to))} onClick={send}>{form.kind === 'day' ? tx('Move it') : tx('Send')}</button>
        <button type="button" className="co-btn co-btn-s co-btn-sm" onClick={() => { setForm(null); setOpen(false) }}>{tx('Cancel')}</button>
      </div>
    </div>
  )
}
