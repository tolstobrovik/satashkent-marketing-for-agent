import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronRight, ChevronUp, ChevronDown, Clapperboard, Scissors, Palette, Send, Plus, UserPlus, ClipboardList, Film, Link2, Paperclip } from 'lucide-react'
import DayStrip from './edit/DayStrip.jsx'
import { useSlots, dayOf, loadWords, hh, toMin, toHH, WEEK, cascade } from './edit/slots.js'
import { ChipField } from './edit/Field.jsx'
import { KINDS } from './builder/StepType.jsx'
import { useClash } from './ClashDialog.jsx'
import { Face } from './CoachParts.jsx'
import { api } from '../lib/api.js'
import { useAuth, adminOn } from '../lib/auth.jsx'
import { useChannels } from '../lib/channels.jsx'
import { useNextStep } from '../lib/useNextStep.js'
import { useIsPhone } from '../lib/usePhone.js'
import { todayISO, typeLabel, typeInfo, iconFor, TELEGRAM_TYPES, telegramTypeLabel } from '../lib/constants.js'
import { URL_RE, hasSubstance } from '../lib/text.js'
import { editDue } from '../lib/due.js'
import { bumpPick } from '../lib/picks.js'
import { toast } from '../lib/toast.js'
import { act } from '../lib/track.js'
import { tr as tx } from '../lib/i18n.jsx'
import '../styles-task.css'

// ---- a new task: the call sheet form (task-create-tz.md §3 C, the owner's pick of 13 Nov 2026) ----
//
// One screen over the dimmed board, the picture the owner chose: the name and the kind on one line; the channel
// and, for an admin, whose task it is; then the plan as stops SIDE BY SIDE with their strips open — Shoot (who films,
// the week shaded by that person's load, the hours and the free windows of the day), Edit (who edits, the day),
// Goes out (the day, the hour); a dashed "Cover" line that opens the artwork stop; the brief's boxes in a row; a foot
// that says what the press does, Cancel, and the one ruby button. Nothing is sent until Create task: one POST, the
// builder's body; the server says where it landed, in the toast, with Undo (a delete) for ten seconds; the sheet
// closes and the card is on the board behind. The strips, hours and roster are the edit form's own pieces
// (components/edit/*), the chips edit/Field.jsx's. A written channel: the day it goes out and the Telegram type only.
//
// Its own file beside the task window (the ТЗ: "complete at once; but a second component"). The concept-1 window
// it replaces is kept at design-variants/retired-draft-window/. Where this departs from the picture: the foot names
// the person, day and hour from the draft but no stage before the press — where a piece lands is the server's rule
// (CLAUDE.md), the API has no dry run and is not reloaded here, so the stage is said once the server answers;
// "Also TikTok / Shorts", the Files clip, the channel's-posts shading and "the channel's usual hour" have no data
// behind them and are not drawn; a day's shading needs a person on the stop, so the empty form shows plain days.
// the boxes, by kind (the owner, 13 Nov): a reel, a short or a video asks the ТЗ, the script and the reference; a
// target only the script; a post, a carousel or a story the ТЗ and the reference; a poster or a print what to make,
// the design reference and the sources (the photos and files to use); a written channel the reference alone
const BOX = {
  tz: { Icon: ClipboardList, label: () => 'ТЗ', hold: () => tx('What to make: the length, the pace, the captions') },
  tzDesign: { k: 'tz', Icon: ClipboardList, label: () => 'ТЗ', hold: () => tx('What to make, and what it says') },
  script: { Icon: Film, label: () => tx('Script'), hold: () => tx('What is said and shown') },
  reference: { Icon: Link2, label: () => tx('Reference'), hold: () => tx('A link, or how it should look') },
  refDesign: { k: 'reference', Icon: Link2, label: () => tx('Design reference'), hold: () => tx('A link, or how it should look') },
  sources: { Icon: Paperclip, label: () => tx('Sources'), hold: () => tx('Links to the photos and files to use') },
  cover: { Icon: Palette, label: () => tx('Cover'), hold: () => tx('How the cover should look') },
}
const BRIEF_OF = (kind, written) => written ? ['reference']
  : ['reel', 'short', 'video'].includes(kind) ? ['tz', 'script', 'reference']
    : kind === 'target' ? ['script']
      : ['poster', 'print'].includes(kind) ? ['tzDesign', 'refDesign', 'sources']
        : ['tz', 'reference']
// the kinds, by channel: its format, or the Design board's door
const KINDS_OF = (format, designDoor) => designDoor ? ['poster', 'print', 'post']
  : format === 'social' ? ['reel', 'post', 'carousel', 'story']
    : format === 'video' ? ['video', 'short']
      : format === 'ads' ? ['target']
        : format === 'repost' ? ['short', 'reel']
          : ['post']
// The shoot's hours (the owner, 15 Nov 2026, picking C of the three mock-ups): two fields, Starts and Ends, each
// with a stepper of five minutes; typed as "10", "930", "10.05" or "10:05" and read on the five-minute grid. No
// length to choose and no windows offered — "just this". The end is kept at least five minutes after the start: a
// start typed into an empty box gives it start + 5 at once, and a start moved onto the end pushes the end along.
const STEP = 5
const DAY_END = 23 * 60 + 55
const on5 = (m) => Math.max(0, Math.min(DAY_END, Math.round(m / STEP) * STEP))
const readTime = (raw) => {
  const d = String(raw || '').replace(/\D/g, '')
  if (!d) return null
  const h = d.length <= 2 ? Number(d) : Number(d.slice(0, -2)), m = d.length <= 2 ? 0 : Number(d.slice(-2))
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null
  return toHH(on5(h * 60 + m))
}
function TimeFields({ start, end, onChange }) {
  const s = hh(start) || '', e = hh(end) || ''
  const [typed, setTyped] = useState({ s: null, e: null })   // what is being typed, until it is left
  const settle = (from, to) => {   // the end at least five minutes after the start
    const sm = from ? toMin(from) : null
    let em = to ? toMin(to) : (sm != null ? sm + STEP : null)
    if (sm != null && em != null && em < sm + STEP) em = sm + STEP
    onChange({ recording_time: from || null, recording_end: em != null ? toHH(Math.min(em, DAY_END)) : null })
  }
  const commit = (which, raw) => {
    setTyped((t) => ({ ...t, [which]: null }))
    const v = readTime(raw)
    if (which === 's') { if (v) settle(v, e); else if (!String(raw).trim()) settle('', '') }
    else if (v) settle(s, v)
  }
  const step = (which, dir, base) => {
    if (which === 's') settle(toHH(on5(toMin(base || s || '10:00') + dir * STEP)), e)
    else settle(s, toHH(on5(toMin(base || e || (s ? toHH(toMin(s) + STEP) : '10:05')) + dir * STEP)))
  }
  const field = (which, label, val) => (
    <span className="tw-tf-f">
      <input className="tw-tf-in" inputMode="numeric" placeholder="–:–" aria-label={label} value={typed[which] ?? val}
        onChange={(ev) => setTyped((t) => ({ ...t, [which]: ev.target.value }))}
        onBlur={(ev) => commit(which, ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); setTyped((t) => ({ ...t, [which]: null })); step(which, ev.key === 'ArrowUp' ? 1 : -1, readTime(typed[which]) || null) }
          else if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); ev.stopPropagation(); ev.currentTarget.blur() }
        }} />
      <span className="tw-tf-st">
        <button type="button" tabIndex={-1} aria-label={`${label}: ${tx('5 minutes later')}`} onClick={() => step(which, 1, readTime(typed[which]) || null)}><ChevronUp size={12} aria-hidden="true" /></button>
        <button type="button" tabIndex={-1} aria-label={`${label}: ${tx('5 minutes earlier')}`} onClick={() => step(which, -1, readTime(typed[which]) || null)}><ChevronDown size={12} aria-hidden="true" /></button>
      </span>
    </span>
  )
  return (
    <div className={'tw-hours tw-c-hours tw-tf' + (s ? '' : ' is-empty')} role="group" aria-label={tx('Hours')}>
      {field('s', tx('Starts'), s)}
      <span className="tw-tf-arrow" aria-hidden="true">→</span>
      {field('e', tx('Ends'), e)}
    </div>
  )
}
const LAST_KEY = 'satashkent_builder_last'   // the builder's memory of the last kind per channel: read, never written here
const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const firstName = (u) => (u?.name || '').split(' ')[0]

export default function DraftTask({ statuses, defaults = {}, onClose, onCreate, onMore = null, onDelete = null }) {
  const { user } = useAuth()
  const { byKey, visible } = useChannels()
  const step = useNextStep(user, statuses, byKey)
  const phone = useIsPhone()
  const today = todayISO()
  const isAdmin = user?.role === 'admin'
  const design = !!defaults.design   // the Design board's door: a picture, the kind kept, written channels out (as the builder did)

  // where it may go: the channels this person runs or is on (the window's own reading)
  const chanOptions = useMemo(() => (Array.isArray(visible) && visible.length ? visible : Object.values(byKey)).filter((c) => c?.key && (adminOn(user, [c.key]) || (user.departments || []).includes(c.key)) && (!design || !['text', 'short', 'repost'].includes(c.format))), [byKey, visible, user, design])
  const writtenChan = (k) => ['text', 'short'].includes(byKey[k]?.format)
  // the channel's usual kind: a written channel is a post; else what this person last gave it; else a reel
  const kindsOf = (k) => KINDS_OF(byKey[k]?.format, design)
  const kindFor = (k) => { const ks = kindsOf(k); const last = (readJSON(LAST_KEY)?.types || {})[k]; return ks.includes(last) ? last : ks[0] }
  // the page's channel; else this person's first (a maker on one channel starts on it)
  const startChannel = defaults.channels?.[0] || chanOptions[0]?.key || ''

  // the draft: the form's values in the task's own names, so the edit pieces read it as a task
  const [d, setD] = useState(() => ({
    title: defaults.title || '', channel: startChannel, type: !design && defaults.type ? defaults.type : (startChannel ? kindFor(startChannel) : 'reel'),
    telegram_type: defaults.telegram_type || '', owner_id: defaults.assignee_id || user.id,
    operator_id: defaults.operator_id ?? null, recording_date: defaults.recording_date || '', recording_time: defaults.recording_time || '', recording_end: defaults.recording_end || '',
    editor_id: defaults.editor_id ?? null, edit_ready_date: '', designer_id: defaults.designer_id ?? null, design_ready_date: '',
    release_date: defaults.release_date || '',
    script: defaults.script || '', tz: defaults.tz || '', description: defaults.description || '', reference: defaults.reference_text || '', sources: '', cover: '', face_ids: [], face1: null,
  }))
  const set = (patch) => setD((old) => ({ ...old, ...patch }))
  const dRef = useRef(d); dRef.current = d   // the draft as it stands at the press, not as the render that drew the button knew it
  const t = useMemo(() => ({
    title: d.title, channels: d.channel ? [d.channel] : [], type: d.type, telegram_type: d.telegram_type || null,
    assignee_id: d.owner_id, assignees: [d.owner_id], status_id: defaults.status_id ?? null,
    operator_id: d.operator_id, recording_date: d.recording_date || null, recording_time: d.recording_time || null, recording_end: d.recording_end || null,
    editor_id: d.editor_id, edit_ready_date: d.edit_ready_date || null, designer_id: d.designer_id, design_ready_date: d.design_ready_date || null,
    release_date: d.release_date || null, release_time: null, with_media: !!defaults.design,
  }), [d, defaults.status_id, defaults.design])
  const making = step.makingFor(t)
  const [coverOpen, setCoverOpen] = useState(() => !!(defaults.designer_id))   // the artwork stop, behind the dashed line until wanted
  // tasks from one shoot (the owner, 15 Nov 2026): the sheet itself is Task 1; "Add a task" adds Task 2, Task 3 … as
  // blocks under the brief — each its own script (needed), its own ТЗ (optional, else the shared one) and its own
  // face; the channel, kind, reference, crew, day and hours are shared. `pieces` are the added tasks.
  const [pieces, setPieces] = useState([])
  const series = pieces.length >= 1
  const setPiece = (i, patch) => setPieces((ps) => ps.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const [coverBox, setCoverBox] = useState(() => !!(defaults.designer_id))     // the Cover box in the brief, behind a dashed tile until wanted (the owner, 15 Nov)

  const [team, setTeam] = useState([])
  useEffect(() => { let stop = false; api.cached('/users').then((u) => { if (!stop) setTeam(Array.isArray(u) ? u : []) }).catch(() => {}); return () => { stop = true } }, [])
  const person = (id) => team.find((u) => u.id === id) || null
  // a seat's options: the crew of that role first, then everybody else, then Nobody
  const seatOptions = (role) => {
    const crew = team.filter((u) => (u.crew_roles || []).includes(role))
    const rest = team.filter((u) => !(u.crew_roles || []).includes(role) && u.role !== 'ambassador' && u.id)
    return [...crew, ...rest].map((u) => ({ value: String(u.id), label: u.name })).concat([{ value: 'none', label: tx('Nobody') }])
  }

  // the loads under the strips (the edit form's reading of each person's week), and the free windows of the shoot's day
  const len = d.recording_time && d.recording_end ? toMin(hh(d.recording_end)) - toMin(hh(d.recording_time)) : 60
  const opA = useSlots(making?.filmed ? d.operator_id : null, today, WEEK + 1, len, undefined)
  const editFrom = d.recording_date && d.recording_date > today ? d.recording_date : today
  const edA = useSlots(d.editor_id, editFrom, WEEK + 1, 60, undefined)

  // ---- the shell: the page held, Esc, Tab inside, the ask over typed words ----
  const sheet = useRef(null)
  const titleIn = useRef(null)
  const [closing, setClosing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')          // the server's sentence, or "A name is needed"
  const [errAt, setErrAt] = useState('')      // the field it is about
  const dirty = () => !!(pieces.some((pc) => pc.script.trim() || (pc.tz || '').trim()) || d.title.trim() || d.script.trim() || d.tz.trim() || d.reference.trim() || d.sources.trim() || d.cover.trim()
    || d.operator_id || d.editor_id || d.designer_id || d.recording_date || d.edit_ready_date || d.design_ready_date || d.release_date)
  const close = (sure) => {
    if (busy) return
    if (sure !== true && dirty()) { setLeaving(true); return }
    setClosing(true)
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setTimeout(onClose, calm ? 0 : 160)
  }
  useEffect(() => {
    const opener = document.activeElement
    document.body.classList.add('co-held')
    titleIn.current?.focus({ preventScroll: true })
    return () => { document.body.classList.remove('co-held'); if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true }) }
  }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop') && !sheet.current?.querySelector('.tw-menu')) { if (leaving) setLeaving(false); else close() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const trap = (e) => {
    if (e.key !== 'Tab' || !sheet.current) return
    const stops = [...sheet.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')]
      .filter((el) => (el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0) && !el.closest('[hidden], [aria-hidden="true"], [inert]'))
    if (!stops.length) return
    const first = stops[0], last = stops[stops.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // ---- the one press: Create task ----
  const ideaStage = (statuses || []).find((s) => /^idea$|^ideas$|g'oya|идея/i.test(String(s.label || '')))
    || (statuses || []).find((s) => !/^deleted$/i.test(String(s.label || '')))
  const [clashUi, askClash] = useClash((k) => byKey[k]?.label || k)   // the clash window names the channels of the other booking
  const payloadOf = () => {
    const d = dRef.current
    const refAll = [d.reference.trim(), d.sources.trim() ? `${tx('Sources')}: ${d.sources.trim()}` : '', d.cover.trim() ? `${tx('Cover')}: ${d.cover.trim()}` : ''].filter(Boolean).join('\n')
    const links = [...new Set((refAll.match(URL_RE) || []).map((u) => u.trim()))]
    const refWords = refAll.replace(URL_RE, ' ').replace(/\s+/g, ' ').trim()
    const film = !!making?.filmed
    const ad = d.type === 'target'   // no Goes out on the sheet: a day picked under another kind does not ride along
    const bornDay = (!ad && d.release_date) || [defaults.release_date, today, d.recording_date, d.edit_ready_date, d.design_ready_date].filter(Boolean).sort().pop()
    return {
      title: d.title.trim(),
      channels: [d.channel],
      type: d.type,
      status_id: defaults.status_id ?? ideaStage?.id ?? null,
      auto_stage: true,                         // the server puts a shoot booked in full on «To shoot»; the rest is an idea
      release_date: bornDay,
      release_born: ad || !d.release_date,
      recording_date: d.recording_date || null,
      recording_time: film && d.operator_id && d.recording_date && d.recording_time ? d.recording_time : null,
      recording_end: film && d.operator_id && d.recording_date && d.recording_end ? d.recording_end : null,
      edit_ready_date: d.edit_ready_date || null,
      design_ready_date: !ad && (coverOpen || making?.designed) ? d.design_ready_date || null : null,
      description: '',
      reference_text: hasSubstance(refWords) ? refWords : null,
      reference_links: links,
      script: d.script.trim() || null,
      tz: d.tz.trim() || null,
      operator_id: film ? d.operator_id : null,
      editor_id: d.editor_id,
      designer_id: !ad && (coverOpen || making?.designed) ? d.designer_id : null,
      face_ids: d.type === 'target' ? d.face_ids : series && d.face1 ? [d.face1] : [],
      ...(writtenChan(d.channel) ? { telegram_type: d.telegram_type || null, is_guiding: false } : {}),
      campaign_id: defaults.campaign_id ?? null,
      ...(isAdmin ? { assignee_ids: [d.owner_id || user.id] } : {}),
    }
  }
  const inFlight = useRef(false)   // read at once by a second press in the same event (the state lags a render)
  const seriesMade = useRef([])    // the pieces of a series already made, so a Create pressed again after a clash makes the rest only
  const madeRows = useRef([])
  const create = async (force = false) => {
    if (busy || inFlight.current) return
    // hours picked a moment ago: the time box reports a pick when the focus leaves it — so it is left first
    if (document.activeElement?.closest?.('.tw-hours')) { document.activeElement.blur(); await new Promise((r) => setTimeout(r, 120)) }
    const now = dRef.current
    if (!now.title.trim()) { setErr(tx('A name is needed')); setErrAt('title'); titleIn.current?.focus(); return }
    if (!now.channel) { setErr(tx('Pick where it goes')); setErrAt('channels'); return }
    const bare = pieces.findIndex((pc) => !pc.script.trim())
    if (bare >= 0) { setErr(tx('Task {n} needs a script', { n: bare + 2 })); setErrAt(`piece-${bare}`); document.getElementById(`tw-draft-piece-${bare}`)?.focus(); return }
    inFlight.current = true
    setBusy(true); setErr(''); setErrAt('')
    const base = { ...payloadOf(), ...(force ? { force: true } : {}) }
    try {
      let c
      if (series) {
        // Task 1 is the sheet; then one task per block: "Name · 1", "Name · 2" …, the block's script, its ТЗ (else the
        // shared one) and its face; the same everything else. The first is judged for a clash like any shoot; the rest
        // are the same session, so they go with force. A task already made on an earlier press (a clash answered) is
        // not made twice.
        const rows = seriesMade.current
        const all = [{ script: base.script, tz: base.tz, face: null, first: true }, ...pieces]
        for (let i = 0; i < all.length; i++) {
          if (rows[i]) continue
          const pc = all[i]
          const body = { ...base, title: `${base.title} · ${i + 1}`, ...(pc.first ? {} : { script: pc.script.trim() || null, tz: (pc.tz || '').trim() || base.tz, face_ids: pc.face ? [pc.face] : base.face_ids }), ...(i > 0 || rows.length ? { force: true } : {}) }
          rows[i] = await onCreate(body)
        }
        c = rows[0]
        madeRows.current = rows.filter(Boolean)
        seriesMade.current = []
      } else {
        c = await onCreate(base)
      }
      const payload = base
      act('task.create', { how: series ? 'sheet-series' : 'sheet', n: series ? pieces.length : 1 })
      bumpPick(payload.operator_id, payload.editor_id, payload.designer_id, ...(payload.assignee_ids || []))
      // Where it landed — the server's answer, never a reading of its own. Undo is a delete, for whoever presses it in time.
      const gate = c?.status_id && c.status_id !== ideaStage?.id ? (statuses || []).find((st) => st.id === c.status_id) : null
      const allMade = series ? madeRows.current : [c]
      const said = series
        ? (gate ? tx('{n} tasks added — on «{stage}»', { n: pieces.length + 1, stage: tx(gate.label) }) : tx('{n} tasks added — synced', { n: pieces.length + 1 }))
        : (gate ? tx('Task added — on «{stage}»', { stage: tx(gate.label) }) : tx('Task added — synced'))
      toast(said, 'ok', c?.id ? {
        label: tx('Undo'),
        onClick: async () => { try { for (const r of allMade) await (onDelete ? onDelete(r) : api.del(`/content/${r.id}`)); toast(tx('Change taken back')) } catch (e) { toast(e.message, 'err') } },
      } : null)
      setClosing(true)
      setTimeout(() => onClose(c), window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 160)
      return   // the guard stays held: the sheet is still drawn while it fades
    } catch (e) {
      if (!askClash(e, () => create(true))) {
        setErr(e.message || tx('Not saved'))
        setErrAt(e.data?.field || '')
        if (e.data?.field === 'title') titleIn.current?.focus()
      }
    } finally { inFlight.current = false; setBusy(false) }
  }
  const onKeys = (e) => {
    trap(e)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); create() }
  }

  // ---- what the sheet draws ----
  const firstChan = byKey[d.channel]
  const typedChan = !!firstChan && writtenChan(d.channel)
  const kindOptions = (d.channel ? kindsOf(d.channel) : KINDS.map((k) => k.key)).filter((k) => !typedChan || k === 'post').map((k) => ({ value: k, label: typeLabel(k), icon: typeInfo(k).icon }))
  const chanOpts = chanOptions.map((c) => ({ value: c.key, label: c.label, icon: iconFor(c.icon) }))
  const textChan = !!firstChan && firstChan.format === 'text'
  const written = !!making?.written
  const filmed = !!making?.filmed
  const withEdit = !!making && !written && !making.repost && (filmed || !making.designed || d.editor_id)
  const isAd = d.type === 'target'
  const withArt = !!making && !written && !making.repost && !isAd && (making.designed || coverOpen)   // an ad has no cover: a line opened under a reel does not follow
  const brief = BRIEF_OF(d.type, written).concat(filmed && !isAd && coverBox ? ['cover'] : []).map((key) => ({ key, k: BOX[key].k || key, ...BOX[key] }))
  // a seat: the crew of that role as a row of faces, one press each; everybody else behind one quiet chip
  const seatRow = (role, field, empty) => {
    const crew = team.filter((u) => (u.crew_roles || []).includes(role))
    const u = person(d[field])
    return (
      <div className="tw-c-faces" role="radiogroup" aria-label={empty} data-field={field}>
        {crew.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={c.id === d[field]} className={'tw-c-face' + (c.id === d[field] ? ' on' : '')}
            onClick={() => set({ [field]: c.id === d[field] ? null : c.id })} aria-label={c.name}>
            <Face person={c} size="sm" /><span>{firstName(c)}</span>
          </button>
        ))}
        {!crew.length && (
          <span className="tw-c-seat">
            <ChipField value={u ? String(u.id) : ''} label={empty} may options={seatOptions(role)}
              display={u ? <><Face person={u} size="xs" />{firstName(u)}</> : <><UserPlus size={14} aria-hidden="true" />{empty}</>}
              onCommit={(v) => set({ [field]: v && v !== 'none' ? Number(v) : null })} />
          </span>
        )}
      </div>
    )
  }
  // an ad: who is in it — the team's faces, any number
  const cast = team.filter((u) => u.id && u.role !== 'ambassador')
  const castRow = (
    <div className="tw-c-faces tw-c-cast" role="group" aria-label={tx('Who is in it?')} data-field="face_ids">
      {cast.map((c) => (
        <button key={c.id} type="button" role="checkbox" aria-checked={d.face_ids.includes(c.id)} className={'tw-c-face' + (d.face_ids.includes(c.id) ? ' on' : '')}
          onClick={() => set({ face_ids: d.face_ids.includes(c.id) ? d.face_ids.filter((x) => x !== c.id) : [...d.face_ids, c.id] })} aria-label={c.name}>
          <Face person={c} size="sm" /><span>{firstName(c)}</span>
        </button>
      ))}
    </div>
  )
  const piecesRow = series && (
    <div className="tw-c-series" data-field="pieces">
      <div className="tw-c-series-h">
        <b>{tx('Tasks from this shoot')}</b>
        <span>{tx('Task 1 is the one above. Each one has its script and its face.')}</span>
      </div>
      {!isAd && (
        <div className="tw-c-piece tw-c-bx tw-c-piece-first" data-field="face1" data-piece={1}>
          <div className="tw-c-piece-h"><span className="co-main-lbl"><Film size={16} aria-hidden="true" />{tx('Task 1 · who is in it?')}</span></div>
          <div className="tw-c-faces tw-c-piece-faces" role="radiogroup" aria-label={tx('Task 1 · who is in it?')}>
            {cast.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={d.face1 === c.id} className={'tw-c-face' + (d.face1 === c.id ? ' on' : '')}
                onClick={() => set({ face1: d.face1 === c.id ? null : c.id })} aria-label={c.name}>
                <Face person={c} size="sm" /><span>{firstName(c)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {pieces.map((pc, i) => (
        <div key={i} className={'tw-c-piece tw-c-bx' + (errAt === `piece-${i}` ? ' tw-f-bad' : '')} data-field="script" data-piece={i + 2}>
          <div className="tw-c-piece-h">
            <span className="co-main-lbl"><Film size={16} aria-hidden="true" />{tx('Task {n}', { n: i + 2 })}</span>
            <button type="button" className="tw-c-bx-x" aria-label={tx('Remove task {n}', { n: i + 2 })} disabled={busy}
              onClick={() => setPieces((ps) => ps.filter((_, k) => k !== i))}><X size={14} aria-hidden="true" /></button>
          </div>
          <label className="tw-c-piece-f">
            <span className="tw-c-piece-lb">{tx('Script')}</span>
            <textarea id={`tw-draft-piece-${i}`} className="tw-long-in tw-c-ta" value={pc.script} placeholder={BOX.script.hold()} disabled={busy} rows={3}
              onChange={(e) => { setPiece(i, { script: e.target.value }); if (errAt === `piece-${i}`) { setErr(''); setErrAt('') } }} />
          </label>
          <label className="tw-c-piece-f">
            <span className="tw-c-piece-lb">ТЗ <small>{tx('optional — else the one above')}</small></span>
            <textarea id={`tw-draft-piece-tz-${i}`} className="tw-long-in tw-c-ta" value={pc.tz || ''} placeholder={BOX.tz.hold()} disabled={busy} rows={3}
              onChange={(e) => setPiece(i, { tz: e.target.value })} />
          </label>
          <div className="tw-c-faces tw-c-piece-faces" role="radiogroup" aria-label={tx('Who is in it?')}>
            {cast.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={pc.face === c.id} className={'tw-c-face' + (pc.face === c.id ? ' on' : '')}
                onClick={() => setPiece(i, { face: pc.face === c.id ? null : c.id })} aria-label={c.name}>
                <Face person={c} size="sm" /><span>{firstName(c)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="tw-c-dash tw-c-addpiece" disabled={busy || pieces.length >= 11} onClick={() => setPieces((ps) => [...ps, { script: '', tz: '', face: null }])}>
        <Plus size={16} aria-hidden="true" /><b>{tx('Add a task')}</b><span>{tx('Task {n}', { n: pieces.length + 2 })}</span>
      </button>
    </div>
  )
  const briefRow = (
    <>
      <div className="tw-c-brief">
        {brief.map((b) => (
          <div key={b.key} className={'tw-c-bx tw-part' + (errAt === b.k ? ' tw-f-bad' : '')} data-field={b.k} data-box={b.key}>
            <div className="tw-c-bx-h">
              <label className="co-main-lbl" htmlFor={`tw-draft-${b.key}`}><b.Icon size={16} aria-hidden="true" />{b.label()}</label>
              {b.key === 'cover' && (
                <button type="button" className="tw-c-bx-x" aria-label={tx('No cover')} disabled={busy} onClick={() => { setCoverBox(false); setCoverOpen(false); set({ cover: '', designer_id: null, design_ready_date: '' }) }}><X size={14} aria-hidden="true" /></button>
              )}
            </div>
            <textarea id={`tw-draft-${b.key}`} className="tw-long-in tw-c-ta" value={d[b.k]} placeholder={b.hold()} disabled={busy} rows={3}
              onChange={(e) => { set({ [b.k]: e.target.value }); if (errAt === b.k) { setErr(''); setErrAt('') } }} />
          </div>
        ))}
        {filmed && !isAd && !coverBox && (
          <button type="button" className="tw-c-bx tw-c-addbox" data-box="add-cover" disabled={busy} onClick={() => { setCoverBox(true); setCoverOpen(true) }}>
            <Plus size={16} aria-hidden="true" /><b>{tx('Cover')}</b><span>{tx('Add a cover')}</span>
          </button>
        )}
      </div>
      {piecesRow}
      {filmed && !series && (
        <button type="button" className="tw-c-dash tw-c-series-line" disabled={busy} onClick={() => setPieces([{ script: '', tz: '', face: null }])}>
          <Plus size={16} aria-hidden="true" /><b>{tx('Add a task from the same shoot')}</b><span>{tx('The same crew and hours; its own script and face')}</span>
        </button>
      )}
    </>
  )
  return (
    <div className={'co-win tw-c-win' + (closing ? ' out' : '')}>
      <div className="co-scrim" onMouseDown={() => close()} />
      <section className="tw-c" role="dialog" aria-modal="true" aria-label={tx('New task')} ref={sheet} onKeyDown={onKeys} data-draft="1">
        {/* the head is the name (the owner, 15 Nov 2026: the title row and the name "merged into one"): one line,
            "New task" its placeholder, the way out at its end */}
        <div className="tw-c-top tw-c-headline">
          <span className={'tw-f tw-f-open tw-c-name' + (errAt === 'title' ? ' tw-f-bad' : '')} data-field="title">
            <input ref={titleIn} className="tw-line-in tw-c-name-in" value={d.title} aria-label={tx('Name')} placeholder={tx('New task')} disabled={busy} maxLength={200}
              aria-invalid={errAt === 'title' || undefined} aria-describedby={errAt === 'title' ? 'tw-c-err' : undefined}
              onChange={(e) => { set({ title: e.target.value }); if (errAt === 'title') { setErr(''); setErrAt('') } }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); create() } }} />
          </span>
          <button type="button" className="co-x tw-c-close" onClick={() => close()} aria-label={tx('Close the task')}><X size={18} aria-hidden="true" /></button>
        </div>
        {/* where it goes: this person's channels in the board's order, on ONE line that scrolls under a hidden bar */}
        <div className={'tw-c-chans' + (errAt === 'channels' ? ' tw-f-bad' : '')} role="radiogroup" aria-label={tx('Channel')} data-field="channels">
          {chanOpts.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={d.channel === c.value} className={'tw-c-chanb' + (d.channel === c.value ? ' on' : '')}
              onClick={() => { set({ channel: c.value, type: design ? d.type : kindFor(c.value), operator_id: null, editor_id: null, designer_id: null }); if (errAt === 'channels') { setErr(''); setErrAt('') } }}>
              <c.icon size={18} aria-hidden="true" /><span>{c.label}</span>
            </button>
          ))}
        </div>
        {/* the kinds the channel allows, as tabs; one kind alone (a target) is nothing to choose */}
        {!typedChan && kindOptions.length > 1 && (
          <div className="tw-c-kinds" role="tablist" aria-label={tx('Kind')} data-field="type">
            {kindOptions.map((k) => (
              <button key={k.value} type="button" role="tab" aria-selected={d.type === k.value} className={'tw-c-kindb' + (d.type === k.value ? ' on' : '')} onClick={() => set({ type: k.value })}>
                <k.icon size={20} aria-hidden="true" /><span>{k.label}</span>
              </button>
            ))}
          </div>
        )}
        {textChan && (
          <div className="tw-c-kinds tw-c-tgtypes" role="tablist" aria-label="Telegram" data-field="telegram_type">
            {TELEGRAM_TYPES.map((x) => (
              <button key={x.key} type="button" role="tab" aria-selected={d.telegram_type === x.key} className={'tw-c-kindb' + (d.telegram_type === x.key ? ' on' : '')} onClick={() => set({ telegram_type: x.key })}>
                <span>{tx(x.label)}</span>
              </button>
            ))}
          </div>
        )}
        {leaving && (
          <div className="co-note co-n-wait co-leave tw-c-leave" role="alertdialog" aria-label={tx('You wrote something and did not send it.')}>
            <span><b>{tx('You wrote something and did not send it.')}</b> {tx('If you close now, it is lost.')}</span>
            <span className="co-btns">
              <button type="button" className="co-btn co-btn-s co-btn-sm" autoFocus onClick={() => setLeaving(false)}>{tx('Keep writing')}</button>
              <button type="button" className="co-btn co-btn-s co-btn-sm" onClick={() => { setLeaving(false); close(true) }}>{tx('Close anyway')}</button>
            </span>
          </div>
        )}

        {/* the brief first (the owner, 14 Nov): the ТЗ and the script, then the reference */}
        {step.ready && briefRow}

        {/* then the stops, side by side, their strips open; nothing is sent until Create */}
        {step.ready && <div className="tw-c-plan" data-field="plan">
          {filmed && (
            <div className="tw-c-stop tw-c-shoot" data-row="shoot">
              <div className="tw-c-stop-h"><span className="co-kic co-k-shoot" aria-hidden="true"><Clapperboard size={16} /></span><b>{tx('Shoot')}</b></div>
              {seatRow('operator', 'operator_id', tx('Who films it?'))}
              <DayStrip value={d.recording_date} today={today} allowPast label={tx('Shoot')} f="recording_date"
                load={d.operator_id ? (day) => loadWords(dayOf(opA, day), 'shoot') : null}
                onChange={(day) => set(Object.fromEntries(Object.entries(cascade(t, 'recording_date', day)).map(([k, v]) => [k, v ?? ''])))} />
              <TimeFields start={d.recording_time} end={d.recording_end} onChange={(body) => set(body)} />
            </div>
          )}
          {withEdit && (
            <div className="tw-c-stop tw-c-edit" data-row="edit">
              <div className="tw-c-stop-h"><span className="co-kic co-k-cut" aria-hidden="true"><Scissors size={16} /></span><b>{tx('Edit')}</b></div>
              {seatRow('editor', 'editor_id', tx('Who edits it?'))}
              <DayStrip value={d.edit_ready_date} today={today} allowPast label={tx('Edit')} f="edit_ready_date" from={d.recording_date || ''} film={d.recording_date || ''}
                load={d.editor_id ? (day) => loadWords(dayOf(edA, day), 'edit') : null}
                onChange={(day) => set(Object.fromEntries(Object.entries(cascade(t, 'edit_ready_date', day)).map(([k, v]) => [k, v ?? ''])))} />
              <span className="tw-c-rowgap" aria-hidden="true" />
            </div>
          )}
          {withArt && (
            <div className="tw-c-stop tw-c-art" data-row="design">
              <div className="tw-c-stop-h"><span className="co-kic co-k-art" aria-hidden="true"><Palette size={16} /></span><b>{filmed ? tx('Cover') : tx('Artwork')}</b></div>
              {seatRow('designer', 'designer_id', filmed ? tx('Who makes the cover?') : tx('Who makes the artwork?'))}
              <DayStrip value={d.design_ready_date} today={today} allowPast label={filmed ? tx('Cover') : tx('Artwork')} f="design_ready_date" from={d.recording_date || ''} film={d.recording_date || ''}
                onChange={(day) => set(Object.fromEntries(Object.entries(cascade(t, 'design_ready_date', day)).map(([k, v]) => [k, v ?? ''])))} />
              <span className="tw-c-rowgap" aria-hidden="true" />
            </div>
          )}
          {isAd ? (
            <div className="tw-c-stop tw-c-castst" data-row="cast">
              <div className="tw-c-stop-h"><span className="co-kic co-k-good" aria-hidden="true"><UserPlus size={16} /></span><b>{tx('Who is in it?')}</b></div>
              {castRow}
              <span className="tw-c-rowgap" aria-hidden="true" />
              <span className="tw-c-rowgap" aria-hidden="true" />
            </div>
          ) : isAd ? null : (
            <div className="tw-c-stop tw-c-out" data-row="out">
              <div className="tw-c-stop-h"><span className="co-kic co-k-good" aria-hidden="true"><Send size={16} /></span><b>{tx('Goes out')}</b><span className="tw-c-chanlbl">{firstChan?.label || '—'}</span></div>
              <span className="tw-c-rowgap" aria-hidden="true" />
              <DayStrip value={d.release_date} today={today} allowPast label={tx('Goes out')} f="release_date"
                from={[d.recording_date, editDue(t), d.design_ready_date].filter(Boolean).sort().pop() || ''} film={d.recording_date || ''}
                onChange={(day) => set({ release_date: day })} />
              <span className="tw-c-rowgap" aria-hidden="true" />
            </div>
          )}
        </div>}

        {/* the foot: a refusal, when there is one; Cancel; the one ruby button */}
        <div className="tw-c-foot">
          <div className="tw-c-say">{err && <span className="tw-f-err" id="tw-c-err" role="alert">{err}</span>}</div>
          <button type="button" className="co-btn co-btn-q" onClick={() => close()} disabled={busy}>{tx('Cancel')}</button>
          <button type="button" className="co-btn co-btn-p tw-draft-go" onClick={() => create()} aria-disabled={busy || undefined}>{series ? tx('Create {n} tasks', { n: pieces.length + 1 }) : tx('Create task')}</button>
        </div>
        {clashUi}
      </section>
    </div>
  )
}

// what "All fields" (the full sheet) and "More" (the builder) carry over from the draft, in their own names
const carriedOf = (d) => Object.fromEntries(Object.entries({
  title: d.title, channels: d.channel ? [d.channel] : undefined, type: d.type, telegram_type: d.telegram_type, assignee_id: d.owner_id,
  operator_id: d.operator_id, recording_date: d.recording_date, recording_time: d.recording_time, recording_end: d.recording_end,
  editor_id: d.editor_id, edit_ready_date: d.edit_ready_date, designer_id: d.designer_id, design_ready_date: d.design_ready_date,
  release_date: d.release_date, face_ids: d.type === 'target' && d.face_ids?.length ? d.face_ids : undefined, script: d.script, tz: d.tz, reference_text: [d.reference, d.sources, d.cover].filter(Boolean).join('\n'),
}).filter(([, v]) => v != null && v !== ''))
