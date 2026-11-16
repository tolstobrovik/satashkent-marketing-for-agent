import { useId, useState } from 'react'
import { Clapperboard, Scissors, Palette, Lightbulb, Send, Check, Clock, Inbox, ChevronDown, Bell, Video, AlertCircle } from 'lucide-react'
import Avatar from './Avatar.jsx'
import Timeline, { stateOf } from './Timeline.jsx'
import { api } from '../lib/api.js'
import { iconFor, fixMonth, fmtDay, sayDate, serverNow, longDayLabel, tashkentDay, isWritingChannel } from '../lib/constants.js'
import { addDays, wayOf } from '../lib/coach.js'
import { monthTone, monthShortOf, monthLongOf } from '../lib/planMonth.js'
import { hintOpen, closeHint, openHint } from '../lib/look.js'
import { toast } from '../lib/toast.js'
import { tr as tx, locale, lang, phraseIn } from '../lib/i18n.jsx'

// ---- the Coach look's small parts ------------------------------------------------
//
// The owner asked for a page the eye can sort without reading: a colour and an
// icon for the kind of work, the channel as a mark, the step as dots, a face
// for the person, and a badge for what is urgent. Each of those is one small
// piece here, drawn the same on the crew's day, the maker's day, the calendar
// and the task window (components/CoachCrewDay.jsx, CoachMakerDay.jsx,
// CoachCalendar.jsx, CoachTask.jsx) — so a cut is the same violet scissors
// wherever it turns up.
//
// The colours are tokens (the --kind-* block at the top of styles.css), each
// with a light and a dark value; nothing here names a colour.

// What a row is about. `shoot`, `edit` and `design` are the three kinds of
// crew work; the other three are a maker's states that are nobody's craft: an
// idea waiting for words, a finished piece waiting to go out, a piece that is
// out. The word is looked up where it is drawn, so a language switch moves it.
export const KIND = {
  shoot: { Icon: Clapperboard, cls: 'co-k-shoot', word: () => tx('Shoot') },
  edit: { Icon: Scissors, cls: 'co-k-cut', word: () => tx('Editing') },
  design: { Icon: Palette, cls: 'co-k-art', word: () => tx('Artwork') },
  idea: { Icon: Lightbulb, cls: 'co-k-idea', word: () => tx('Idea') },
  send: { Icon: Send, cls: 'co-k-good', word: () => tx('Ready to publish') },
  out: { Icon: Check, cls: 'co-k-good', word: () => tx('Published') },
}

export function KindTile({ kind, done = false, size = 18 }) {
  const K = KIND[kind] || KIND.idea
  const Icon = done ? Check : K.Icon
  return <span className={`co-kic ${done ? 'co-k-good' : K.cls}`} aria-hidden="true"><Icon size={size} /></span>
}

// A board stage as one of the same marks (round 17, 23 Oct 2026 — the owner:
// "too vague"; one vocabulary of marks, the same on every screen). The stage
// is matched by its label the way statusIcon in lib/constants.js matches it,
// so a renamed or custom stage still lands on a mark; a stage nothing matches
// is drawn as a thought.
export const stageKindOf = (label) => {
  const l = String(label || '').toLowerCase()
  if (/idea|g[ʻ'`]?oya|иде/.test(l)) return 'idea'
  if (/shoot|s[yj]omka|съ[её]м|suratga/.test(l)) return 'shoot'
  if (/edit|montaj|монтаж|writ/.test(l)) return 'edit'
  if (/design|art|dizayn|дизайн/.test(l)) return 'design'
  if (/ready|review|approv|tayyor|провер|tekshir/.test(l)) return 'send'
  if (/publish|post|done|live|chiq|опубл|вышл/.test(l)) return 'out'
  return 'idea'
}
export function StageMark({ status, size = 13, text = true, className = '' }) {
  if (!status) return null
  const K = KIND[stageKindOf(status.label)]
  const name = tx(status.label || '')
  return (
    <span className={`co-stage ${K.cls}${className ? ` ${className}` : ''}`} title={name}>
      <K.Icon size={size} aria-hidden="true" />{text && <span>{name}</span>}
    </span>
  )
}

// Whose shoot and whose edit, as one mark (r11, the editor's and operator's
// feedback): the camera for the shoot, the scissors for the edit (the owner's
// pick, over the film strip). A piece
// whose shoot AND edit are both this person's is one tile cut on the
// diagonal — the camera top left, the scissors on the right. The colours
// are the calendar's: green both, a deep yellow the shoot, a light yellow
// the edit (design reads as the making half, like the edit).
export function KindMark({ shoot = false, edit = false, design = false, size = 18 }) {
  const style = { '--km': `${size}px` }
  if (shoot && edit) {
    return (
      <span className="km km-both" style={style} aria-hidden="true">
        <i className="km-a"><Video size={Math.round(size * 0.5)} strokeWidth={2.4} /></i>
        <i className="km-b"><Scissors size={Math.round(size * 0.5)} strokeWidth={2.4} /></i>
      </span>
    )
  }
  // a designer's job is the palette on the art colour, not the editor's scissors (the fourth look, 16 Nov 2026)
  const Icon = shoot ? Video : design ? Palette : Scissors
  return <span className={`km ${shoot ? 'km-shoot' : design ? 'km-art' : 'km-edit'}`} style={style} aria-hidden="true"><Icon size={Math.round(size * 0.66)} /></span>
}
// `edit` is the editor's or the designer's seat (the month chips' colour reads it); `design` is the designer's alone,
// `edit` then only the editor's when both are read together
export const ownOf = (t, userId) => ({ shoot: t.operator_id === userId, edit: t.editor_id === userId || t.designer_id === userId, design: t.designer_id === userId && t.editor_id !== userId })
export const ownClass = (o) => (o.shoot && o.edit ? 'both' : o.shoot ? 'shoot' : 'edit')

// The channels a piece goes to, as marks: the channel's own icon and name.
export function Chans({ keys = [], byKey }) {
  return keys.map((c) => {
    const Icon = iconFor(byKey[c]?.icon)
    return <span key={c} className="co-chan"><Icon size={13} aria-hidden="true" />{byKey[c]?.label || c}</span>
  })
}

// Where the piece is on the way from an idea to out: one dot a stage, the
// stage it is on named beside them. Read off the board's own stages.
//
// A written piece — every channel it goes to is written (Telegram, X, Threads,
// LinkedIn) and it carries no video or picture — has three stops, not five:
// planned, written, out. With `byKey` the dots are read off wayOf's written
// way, so an X post never says "Editing".
export function Dots({ t, pipe, byKey = null }) {
  const at = pipe.live.findIndex((s) => s.id === t.status_id)
  if (at < 0) return null
  const keys = t.channels || []
  const written = !!byKey && keys.length > 0 && keys.every((k) => isWritingChannel(byKey[k]))
    && !(t.with_media && keys.some((k) => byKey[k]?.format === 'short'))
  // …and a repost (TikTok, YouTube Shorts) has two: Ready, and out.
  const repost = !!byKey && keys.length > 0 && keys.every((k) => byKey[k]?.format === 'repost')
  const stops = written || repost
    ? wayOf(t, pipe, { written, repost }).map((s) => ({ id: s.id, label: s.label, cls: s.cls === 'done' ? 'f' : s.cls === 'on' ? 'c' : '' }))
    : pipe.live.map((s, i) => ({ id: s.id, label: s.label, cls: t.done_at || i < at ? 'f' : i === at ? 'c' : '' }))
  const on = stops.findIndex((s) => s.cls === 'c')
  const name = tx((on >= 0 ? stops[on].label : pipe.live[at].label) || '')
  return (
    <span className="co-dots" title={tx('Step {n} of {of}: {stage}', { n: (on >= 0 ? on : at) + 1, of: stops.length, stage: name })}>
      {stops.map((s) => <i key={s.id} className={s.cls} />)}
      <em>{name}</em>
    </span>
  )
}

// What is urgent about a row, in one or two words. Ruby is for late and for
// nothing else; amber says somebody is waiting; green says it is done.
//   id   lets a row point its aria-describedby at the badge (myday-tz §2.5).
export function Badge({ tone = '', icon = null, id = undefined, children }) {
  const Icon = icon === 'clock' ? Clock : icon === 'check' ? Check : null
  return <span id={id} className={'co-badge' + (tone ? ` co-b-${tone}` : '')}>{Icon && <Icon size={12} aria-hidden="true" />}{children}</span>
}

// A person, as a face: their photo, or their initials on their own colour.
export function Face({ person, size = 'xs' }) {
  if (!person) return null
  return <Avatar name={person.name || '?'} color={person.color || undefined} src={person.avatar || null} size={size} />
}
export const firstName = (person) => String(person?.name || '').split(' ')[0]

// ---- days, in the reader's language --------------------------------------------
// Chromium carries no Latin-Uzbek calendar names (it answers "M10" for October
// and English for the weekdays — see fixMonth in lib/constants.js), so the
// Uzbek weekday is the board's own word and the month goes through fixMonth.
const UZ_DAYS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan']   // Sunday first, like getUTCDay()
const at = (iso) => new Date(`${iso}T12:00:00Z`)
export const weekdayShort = (iso) => (lang() === 'uz' ? UZ_DAYS[at(iso).getUTCDay()]
  : sayDate(iso, { weekday: 'short' }))
export const dayMonth = (iso) => fmtDay(iso, { weekday: false })
// "Fri 6 Nov", for a label (the one format of S-06); and the same day in the middle of a line.
export const dayShort = (iso) => fmtDay(iso)
export function dayInLine(iso, today) {
  if (iso === today) return tx('today')
  if (iso === addDays(today, 1)) return tx('tomorrow')
  if (iso === addDays(today, -1)) return tx('yesterday')
  return dayShort(iso)
}
export const hoursOf = (t) => (t.recording_time ? `${t.recording_time.slice(0, 5)}${t.recording_end ? `–${t.recording_end.slice(0, 5)}` : ''}` : '')
export const lateWords = (n) => (n === 1 ? tx('1 day late') : tx('{n} days late', { n }))

// The hour of the day in Tashkent picks the greeting — the team's clock, like
// every "today" on the board.
function greeting(name) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(serverNow()))
  return h >= 5 && h < 12 ? tx('Good morning, {name}', { name })
    : h >= 12 && h < 18 ? tx('Good afternoon, {name}', { name }) : tx('Good evening, {name}', { name })
}

// ---- the first-days hint ---------------------------------------------------------
// Three short steps that say how the page works, shown until "Got it" and
// brought back by the "?" beside the counts. State for one page, by name.
export function useHint(user, name) {
  const [open, setOpen] = useState(() => hintOpen(user, name))
  return {
    open,
    close: () => { closeHint(user, name); setOpen(false) },
    reopen: () => { openHint(user, name); setOpen(true) },
  }
}
export function Hint({ hint, steps }) {
  if (!hint.open) return null
  return (
    <aside className="co-hint" aria-label={tx('How this page works')}>
      <b>{tx('How this page works')}</b>
      {steps.map((s, i) => <p key={i}><i>{i + 1}</i><span>{s}</span></p>)}
      <button type="button" className="co-btn co-btn-s co-btn-sm" onClick={hint.close}>{tx('Got it')}</button>
    </aside>
  )
}

// ---- the summary bar ----------------------------------------------------------------
// The day in one line: who, the counts — each a button that shows only that
// part of the list, pressed again to show everything — and how far the day
// has got.
//
//   segs      [{ key, n, label, late? }]
//   progress  { text, done, total }
export function Summary({ today, name, segs, filter, onFilter, progress, hint, children = null }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <section className="co-sum">
      <div className="co-hello">
        <div className="co-date">{longDayLabel(today)}</div>
        <h2>{greeting(name)}</h2>
      </div>
      <div className="co-segs" role="group" aria-label={tx('Show only')}>
        {segs.map((s) => (
          <button key={s.key} type="button" className={'co-seg' + (s.late && s.n > 0 ? ' co-seg-late' : '')}
            aria-pressed={filter === s.key} onClick={() => onFilter(filter === s.key ? 'all' : s.key)}>
            <b>{s.n}</b>{s.label}
          </button>
        ))}
        {hint && !hint.open && (
          <button type="button" className="co-q" onClick={hint.reopen} aria-label={tx('How this page works')} data-tip={tx('How this page works')} data-tip-left="">?</button>
        )}
        {children}
      </div>
      <div className="co-prog">
        <span>{progress.text}</span>
        <div className="co-prog-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}
          aria-label={progress.text}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </section>
  )
}

// ---- the big card: start here (D-02) ---------------------------------------------------
// One card for every role — a maker, an operator, an editor, a designer — with
// different words. White, a 4 px left rule in the kind's colour (ruby when the
// step is the maker's own), "Start here" in sentence case, the title, one
// plain sentence and the buttons. Never a form: the drop box and the questions
// are the window's (the button opens it with the step in focus). Round 8 had a
// ruby-tinted card for the maker and a blue one for the crew, differing in
// colour, layout and content for the same job.
//
// My Day round 1 (myday-tz §2.1.1): the title is the one door to the task
// window — "Open the task" is gone (it was a third door to the same place);
// nothing moves on load or on the poll; the page's ONE ruby fill is the
// `.co-btn-p` the caller passes in `buttons` (at most one tonal `.co-btn-t`
// and one quiet `.co-btn-q` beside it).
//
//   label    what this card is now ("Start here", "Now", "Filming now", "Picked")
//   line     what rides beside the label: ONE badge (lateness in words, or the hour)
//   mark     a tile before the title (the crew's camera/scissors)
//   why      the one sentence — what to do, never the badge again
//   extra    under the reason: the timeline (Capsule) or the preview
//   buttons  the step's button(s): one .co-btn-p, at most one tonal, one quiet
//   after    the quiet line under the buttons ("After you press: …"), true to the press
//   id       the title's id (the card is labelled by it)
export function StartHere({ kind, own = false, label = null, line = null, mark = null, title, onOpen, why, buttons, extra = null, after = null, id = 'co-here-t' }) {
  const K = KIND[kind] || KIND.idea
  return (
    <section className={`co-here ${K.cls}${own ? ' own' : ''}`} aria-labelledby={id}>
      <p className="co-here-l"><span className="co-here-w">{label ?? tx('Start here')}</span>{line}</p>
      <div className="co-here-t">
        {mark}
        <div>
          <h2 id={id}><button type="button" onClick={onOpen}>{title}</button></h2>
          {why && <p className="co-why">{why}</p>}
        </div>
      </div>
      {extra}
      {buttons && <div className="co-btns">{buttons}</div>}
      {after && <p className="co-here-ln">{after}</p>}
    </section>
  )
}

// ---- what is urgent about a row ---------------------------------------------------
// One definition for the list and for the window's head, so a task never says
// one thing in the list and another once it is opened.
export function CrewBadge({ row, today }) {
  if (row.state === 'done') return <Badge tone="good" icon="check">{tx('Done')}</Badge>
  if (row.state === 'ask') return <Badge tone="wait">{tx('Answer needed')}</Badge>
  if (row.state === 'fix') return <Badge tone="wait">{tx('Changes asked')}</Badge>
  // Before "late" too: they answered, and the next move is the maker's.
  if (row.state === 'declined') return <Badge tone="wait">{tx('You said you can’t')}</Badge>
  // Before "late": a piece that was never sent on is not this person's lateness.
  if (row.state === 'early') return <Badge tone="wait">{tx('Not sent to you yet')}</Badge>
  if (row.late) return <Badge tone="late">{lateWords(row.late)}</Badge>
  if (row.state === 'blocked') return <Badge tone="wait">{tx('Waiting for footage')}</Badge>
  const hours = row.kind === 'shoot' ? hoursOf(row.t) : ''
  if (row.due === today) return <Badge icon="clock">{hours || tx('Today')}</Badge>
  return <Badge icon="clock">{row.due ? `${dayShort(row.due)}${hours ? ` ${hours}` : ''}` : tx('No date')}</Badge>
}
export function MakerBadge({ row, today, nameOf }) {
  const { act, t } = row
  if (act.kind === 'out') return <Badge tone="good" icon="check">{tx('Out')}</Badge>
  if (row.group === 'film') {
    const name = nameOf(t.operator_id) || tx('Operator')
    if (row.state === 'unsent') return <Badge tone="wait">{tx('Not sent to the shoot yet')}</Badge>
    if (row.state === 'coming') return <Badge tone="good" icon="check">{tx('{name} is coming', { name })}</Badge>
    if (row.state === 'cant') return <Badge tone="late">{tx('{name} can’t come', { name })}</Badge>
    return <Badge tone="wait">{tx('No answer yet')}</Badge>
  }
  // Being fixed: who and until when are in the row's line of facts, and so is
  // how late (D-03: one badge a row); the round is here — each said once, and
  // the round ALWAYS, also on a piece that is late.
  if (act.kind === 'fixing') return <Badge>{tx('round {n}', { n: act.round })}</Badge>
  if (row.late) return <Badge tone="late">{lateWords(row.late)}</Badge>
  if (act.kind === 'check' || act.kind === 'ownfix' || act.kind === 'move') return <Badge tone="wait">{tx('Waits for you')}</Badge>
  const day = row.due || null
  return <Badge icon="clock">{!day ? tx('No date') : day === today ? tx('Today') : dayShort(day)}</Badge>
}

// ---- a reminder --------------------------------------------------------------------
// "Remind Eldor" is a line in the task's own thread that names him. Naming
// somebody in a thread already reaches them — the bell, and Telegram — by the
// server's own rule for comments (routes/content.js, mentionedIds), so a
// reminder needs no rule of its own and leaves a record everybody on the task
// can see.
//
// A comment rings the bell of everybody on the task; a reminder is sent with
// `remind: true`, which rings only the person it names (bell and Telegram).
// The line still stays in the thread, and the button says so before it is
// pressed (its tip, and the helper line in the window). It is kept to once a day
// per person per task by the THREAD, not by this browser: before writing, it
// reads the task and, if somebody already named this person there today, it
// writes nothing. The browser's own note only saves that read on a second
// look. The line is written in the language of the person being reminded
// (users.lang, the one they chose), not the presser's.
//
// "Already reminded today" is read off the thread as exactly that: a comment
// of today that IS the reminder line for this person, in any of the three
// languages. Not "their name appears" — a morning comment "@Eldor please use
// the new logo" is not a reminder, and must not swallow the one pressed at
// five; and not a substring, or "@Ali" would be found in "@Alisher".
export const remindHelp = () => tx('Remind writes a line in this task’s comments. Only the person you remind gets a bell.')
// Asked for by name here so the phrase books are checked to hold it
// (qa/round74-suite.mjs reads the tx() calls): tx('a reminder: this task is waiting for you.')
const REMIND_LINE = 'a reminder: this task is waiting for you.'
// T-10: the thread draws a reminder as a system line (a grey dot, no face),
// read the way "already reminded today" is read — the line itself, in any of
// the three languages, never a mention of a name.
export const isRemindLine = (text) => typeof text === 'string' && text.startsWith('@')
  && ['en', 'ru', 'uz'].some((l) => text.endsWith(` — ${phraseIn(l, REMIND_LINE)}`))
const REMINDED = (uid) => `satashkent_reminded_${uid}`
const sentToday = (user, today) => {
  try {
    const all = JSON.parse(localStorage.getItem(REMINDED(user?.id)) || '{}')
    return Object.fromEntries(Object.entries(all).filter(([, day]) => day === today))
  } catch { return {} }
}
//   small    on a row: the quiet ghost, "Remind" (myday-tz §2.1.1 — never tonal
//            or ruby on a row, R20)
//   primary  the start-here card's one ruby fill ("Remind {name}")
//   title    the task's title, for a row button's name: "{name}: remind about
//            «{title}»" (R28). After sending, the name is "Reminded today: {name}".
//   Neither small nor primary: the tonal button it always was.
export function RemindButton({ user, taskId, person, today, small = false, primary = false, title = '', onSent = null }) {
  const key = `${taskId}:${person?.id}`
  const [sent, setSent] = useState(() => !!sentToday(user, today)[key])
  const [busy, setBusy] = useState(false)
  if (!person || person.id === user.id) return null
  const send = async (e) => {
    e.stopPropagation()
    if (busy || sent) return
    setBusy(true)
    try {
      const remember = () => { try { localStorage.setItem(REMINDED(user?.id), JSON.stringify({ ...sentToday(user, today), [key]: today })) } catch { /* the thread is asked again, which is fine */ } }
      const thread = (await api.get(`/content/${taskId}`)).comments || []
      const lines = ['en', 'ru', 'uz'].map((l) => `@${person.name} — ${phraseIn(l, REMIND_LINE)}`)
      if (thread.some((c) => c.created_at && tashkentDay(c.created_at) === today && lines.includes(String(c.text || '').trim()))) {
        remember(); setSent(true)
        toast(tx('{name} was already reminded today', { name: firstName(person) }))
        return
      }
      const c = await api.post(`/content/${taskId}/comments`, { text: `@${person.name} — ${phraseIn(person.lang, REMIND_LINE)}`, remind: true })
      remember(); setSent(true)
      toast(tx('{name} got a reminder', { name: firstName(person) }))
      onSent?.(c)
    } catch (err) { toast(err.message, 'err') } finally { setBusy(false) }
  }
  const who = firstName(person)
  // The name holds the words on the button (WCAG 2.5.3): the row's "Remind"
  // grows the person and the task; the card's "Remind {name}" is its own name.
  const name = sent ? tx('Reminded today: {name}', { name: who })
    : small && title ? tx('{name}: remind about «{title}»', { name: who, title }) : tx('Remind {name}', { name: who })
  const cls = primary ? 'co-btn co-btn-p' : small ? 'co-btn co-btn-g co-btn-sm' : 'co-btn co-btn-t co-btn-tm'
  return (
    // r11 (the owner: "remind — it is big"): small everywhere; in a list it is
    // just "Remind", because the row already says whose it is.
    // aria-disabled, not disabled: a disabled button drops the keyboard's focus to <body>
    // the moment it is pressed; send() already ignores a second press.
    <button type="button" className={cls} aria-disabled={busy || sent || undefined} onClick={send}
      data-tip={sent ? undefined : remindHelp()} aria-label={name}>
      {sent ? <Check size={small ? 16 : 14} aria-hidden="true" /> : <Bell size={small ? 16 : 14} aria-hidden="true" />}
      {sent ? tx('Reminded') : small ? tx('Remind') : tx('Remind {name}', { name: who })}
    </button>
  )
}

// An empty place says why it is empty and what will fill it.
export function Empty({ title, why, good = false, children = null }) {
  return (
    <div className="co-empty">
      <span className={`co-kic ${good ? 'co-k-good' : 'co-k-idea'}`} aria-hidden="true">{good ? <Check size={26} /> : <Inbox size={26} />}</span>
      <b>{title}</b>
      <p>{why}</p>
      {children}
    </div>
  )
}

// ---- My Day round 1 (myday-tz §2.1.1): the pieces every My Day draws ----------
// One shape for the admin's, a maker's and the crew's day, so a row, a
// heading, "Show all", a fold and a failed load look and read the same on all
// three. The styles are the "My Day round 1 (myday-tz) — shared" section at
// the end of styles.css, scoped to the page frame `.co-myday` (Brief.jsx wraps
// every My Day in it).
//
//   <DayHead today title>{controls}</DayHead>
//       The date (--fs-sm, muted), 8 px, then the page's one Nekst headline
//       "{name}, start here.". `children` sit on the head's right x (the
//       admin's day arrows and channel menu).
//
//   <Rows id label?>{<Row …/>…}</Rows>
//       The list: a <ul class="co-rows">. Give it an id when a "Show all"
//       (MoreRows) controls it.
//
//   <Row kind title onOpen line sub stops late youId said badge action lead id className />
//       One li.co-row. The button is the row's one door and one tab stop; its
//       name is the TITLE (aria-labelledby), and the grey line, the badge and
//       an sr-only state sentence describe it (aria-describedby).
//         kind     KIND key: the colour of the kind of work (--k)
//         title    the piece's title — two lines at most, then the window has it
//         line     the grey line: the verb or whose it is (one line, ellipsis)
//         sub      an optional second grey line at --fs-xs ("Waits on it: Dilnoza")
//         stops    timelineOf(...) — drawn BESIDE the button, aria-hidden, as spans
//         late     days late, for the sr-only sentence ("… 14 days late.") — only
//                  on a row with no badge: a badge says the lateness itself
//         youId    the viewer's id ("You" in the sentence)
//         said     the sr-only sentence, when the caller words it itself
//         badge    ONE badge (<Badge>, <CrewBadge>, <MakerBadge>) — or
//         action   ONE control (.co-btn-sm: tonal for the person's own in-place
//                  act; <RemindButton small> / .co-btn-g for Remind, No, Keep it).
//                  A row has one or the other, never both.
//         lead     something before the title inside it (the piece's colour dot)
//
//   <SecHead id label n above tone focusable />
//       h2.co-sec-h: a band's, a group's or a section's head, with its count
//       after a real space and an sr-only ", {n} pieces". `above` adds
//       "{n} above" (rows of this band drawn higher up, e.g. in the Now card).
//       `tone="late"` draws the 8 px Overdue dot. tabIndex -1 (unless
//       `focusable={false}`), so focus can land here after a row leaves.
//
//   <Section id label n above tone none className>{<Rows …/>, <MoreRows …/>}</Section>
//       section.co-sec — the page's card (--surface, a hairline inside,
//       --radius), labelled by its SecHead. With no children it writes `none`
//       ("Nothing is late.") as one quiet line.
//
//   <MoreRows open onToggle controls n more less />
//       button.co-more: "Show all {n}" / "Show fewer" (or your own words in
//       `more` / `less`, e.g. "{n} more"), aria-expanded, aria-controls = the
//       Rows' id.
//
//   <Fold label n open className>{…}</Fold>
//       details.co-fold whose summary holds an h2.co-sec-h and a caret
//       ("Waiting for others" starts open, "Done today" shut).
//
//   <DayNote kind text cause at onRetry />
//       kind 'error' — the first load failed: a card, the cause in plain words
//       and a quiet "Try again" (onRetry re-runs the load);
//       kind 'stale' — a refresh failed: one quiet line, "Not up to date · last
//       loaded {at} · Try again", above the first card, the data kept;
//       kind 'side'  — a side block (asks, housekeeping) failed: `text` and
//       "Try again", one quiet line where the block was.

export function DayHead({ today, title, children = null }) {
  return (
    <header className="co-head">
      <p className="co-date">{longDayLabel(today)}</p>
      <h1 className="co-title">{title}</h1>
      {children}
    </header>
  )
}

export function Rows({ id = undefined, label = undefined, children }) {
  return <ul className="co-rows" id={id} aria-label={label}>{children}</ul>
}

export function Row({
  kind = 'idea', title, onOpen, line = '', sub = '', stops = null, late = 0, youId = null, said = '',
  badge = null, action = null, lead = null, id = undefined, className = '', mark = true,
}) {
  const uid = useId()
  const ids = { t: `${uid}t`, f: `${uid}f`, x: `${uid}x`, b: `${uid}b`, s: `${uid}s` }
  // A described badge already says the lateness in words (or says on purpose
  // that it is not this person's — "Not sent to you yet"), so the sentence
  // carries it only when there is no badge: nothing is read out twice.
  const told = !action && !!badge
  const lateSaid = told ? 0 : late
  const sentence = said || (stops ? stateOf(stops, { late: lateSaid, youId }) : lateSaid > 0 ? lateWords(lateSaid) : '')
  const describedBy = [line && ids.f, sub && ids.x, !action && badge && ids.b, sentence && ids.s].filter(Boolean).join(' ')
  return (
    <li id={id} className={`co-row ${(KIND[kind] || KIND.idea).cls}${mark ? ' has-tl has-km' : ''}${className ? ` ${className}` : ''}`}>
      {/* the owner (15 Nov 2026): no line of stops on a row — one mark of the kind of work, or none for the crew, whose work is one kind */}
      {mark && (() => { const K = KIND[kind] || KIND.idea; return <span className="co-row-tl"><span className={`co-kic co-row-km ${K.cls}`} aria-hidden="true"><K.Icon size={14} /></span></span> })()}
      <button type="button" className="co-row-b" aria-labelledby={ids.t} aria-describedby={describedBy || undefined} onClick={onOpen}>
        <span className="co-row-t" id={ids.t}>{lead}{title}</span>
        {line && <span className="co-row-f" id={ids.f}>{line}</span>}
        {sub && <span className="co-row-f2" id={ids.x}>{sub}</span>}
        {sentence && <span className="sr-only" id={ids.s}>{sentence}</span>}
      </button>
      {(action || badge) && <span className="co-row-r">{action || <span className="co-row-bd" id={ids.b}>{badge}</span>}</span>}
    </li>
  )
}

// `unit`: what the count counts, said to a screen reader — pieces (the default) or steps (the admin's Today).
export function SecHead({ id = undefined, label, n = null, above = 0, tone = '', focusable = true, unit = 'piece' }) {
  return (
    <h2 className="co-sec-h" id={id} tabIndex={focusable ? -1 : undefined}>
      {tone && <i className={`co-sec-dot co-sec-dot-${tone}`} aria-hidden="true" />}
      <span className="co-sec-l">{label}</span>
      {/* The visible count is for the eye; the reader hears it once, in words
          ("Overdue, 3 pieces, 1 above" — never "Overdue 3, 3 pieces"). */}
      {n != null && <>{' '}<span className="co-cnt" aria-hidden="true">{n}</span><span className="sr-only">{unit === 'step' ? (n === 1 ? tx(', 1 step') : tx(', {n} steps', { n })) : (n === 1 ? tx(', 1 piece') : tx(', {n} pieces', { n }))}</span></>}
      {above > 0 && <span className="co-above"><span aria-hidden="true">{' '}· </span><span className="sr-only">, </span>{tx('{n} above', { n: above })}</span>}
    </h2>
  )
}

// A card of the page with its head: section.co-sec labelled by its h2. An
// empty one writes its one line (`none`) — never a tinted empty box (R47).
export function Section({ id = undefined, label, n = null, above = 0, tone = '', none = '', className = '', children = null, unit = 'piece' }) {
  const uid = useId()
  const hid = id || `${uid}h`
  const empty = children == null || children === false || (Array.isArray(children) && children.every((c) => c == null || c === false))
  return (
    <section className={`co-sec${className ? ` ${className}` : ''}`} aria-labelledby={hid}>
      <SecHead id={hid} label={label} n={n} above={above} tone={tone} unit={unit} />
      {empty ? (none ? <p className="co-sec-none">{none}</p> : null) : children}
    </section>
  )
}

export function MoreRows({ open = false, onToggle, controls = undefined, n = 0, more = null, less = null }) {
  return (
    <button type="button" className="co-more" aria-expanded={!!open} aria-controls={controls} onClick={onToggle}>
      <ChevronDown size={16} aria-hidden="true" />
      {open ? (less ?? tx('Show fewer')) : (more ?? tx('Show all {n}', { n }))}
    </button>
  )
}

export function Fold({ label, n = null, open = false, className = '', children }) {
  return (
    <details className={`co-fold${className ? ` ${className}` : ''}`} open={open || undefined}>
      <summary><SecHead label={label} n={n} focusable={false} /><ChevronDown size={16} className="co-fold-c" aria-hidden="true" /></summary>
      {children}
    </details>
  )
}

export function DayNote({ kind = 'error', text = '', cause = '', at = '', onRetry = null }) {
  if (kind === 'error') {
    return (
      <div className="co-note co-n-err">
        <AlertCircle size={16} aria-hidden="true" />
        <p><b>{text}</b>{cause ? ` ${cause}` : ''}</p>
        {onRetry && <button type="button" className="co-btn co-btn-g co-btn-sm" onClick={onRetry}>{tx('Try again')}</button>}
      </div>
    )
  }
  return (
    <p className={`co-note co-n-${kind === 'stale' ? 'stale' : 'side'}`}>
      <span>{kind === 'stale' ? tx('Not up to date · last loaded {time}', { time: at }) : text}</span>
      {onRetry && <>{' '}<span aria-hidden="true">·</span>{' '}<button type="button" className="co-link co-note-b" onClick={onRetry}>{tx('Try again')}</button></>}
    </p>
  )
}

// The month of the plan a piece belongs to (lib/planMonth.js), as a small tag
// in that month's colour. This month's pieces carry none — a row says one
// thing — so the tag is there only when it tells the piece apart: last
// month's in amber, older in grey, next month's in quiet blue.
export function MonthTag({ ym, today }) {
  const tone = monthTone(ym, today)
  if (tone === 'now' || !ym) return null
  return <span className={`co-month co-month-${tone}`} title={tx('Planned for {month}', { month: monthLongOf(ym) })}>{monthShortOf(ym)}</span>
}

// "All · October plan · September plan": the day split by the month a piece
// was planned for. Shown only where something was carried over.
export function MonthFilter({ value, onChange, today, from }) {
  const cur = String(today).slice(0, 7)
  const opts = [['all', tx('All')], ['now', tx('{month} plan', { month: monthLongOf(cur) })], ['carried', tx('Carried over from {month}', { month: monthLongOf(from) })]]
  return (
    <div className="co-segs co-monthf" role="group" aria-label={tx('Which month')}>
      {opts.map(([k, label]) => (
        <button key={k} type="button" className={'co-seg' + (k === 'carried' ? ' co-seg-old' : '')} aria-pressed={value === k} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  )
}

// Everything that is not the day itself, folded: what is hidden is one press
// away, not gone.
export function More({ children, note = '' }) {
  return (
    <details className="card sd-more">
      <summary>{tx('More')}{note && <span className="count">· {note}</span>} <ChevronDown size={14} className="cd-done-caret" /></summary>
      <div className="sd-more-body">{children}</div>
    </details>
  )
}

// ---- what changed, said once --------------------------------------------------------
// The team's own words in the survey: "updates too often" — and unannounced.
// So a release that changes how something is done says so in a few lines —
// the first item of the bell, with a badge until the bell is opened, and
// gone once it has been (D-06, the TZ of 19 October 2026: the card on My Day
// pushed the start-here card below the fold on a 900 px screen). One id a
// release; the lines are that release's. track-suite pins the line about
// what the board records.
const NEWS = {
  id: 'menus-2026-11',
  lines: () => [
    tx('The menu is one list in groups: you, your day, your channels, Management (Team, Numbers, Projects), then Language, Dark mode and Sound at the end. Press a group’s name to fold it.'),
    tx('Channels stand on their own or sit in folders: drag one onto another to make a folder (on a phone, hold it). A folder’s “…” renames it or changes its icon. An admin’s layout is everybody’s; yours is your own, and “Back to the board’s layout” puts it back.'),
    tx('Dark mode and Sound are switches at the end of the menu, filled when on.'),
    tx('On a phone, Channels and More are tabs at the bottom; New task is the first row in More.'),
    tx('Sign out is on your profile, beside your photo. The first-day tour is there too, under Appearance.'),
    // The team is told, every release, that the board records where people struggle (r13; track-suite pins it).
    tx('To make the board easier, it now records which pages you open and what you press — never what you type.'),
    // 12 Nov 2026 (Settings → How the board is used): a press just beside a button is recorded too.
    tx('A press that lands just beside a button is recorded with that button’s name, so small buttons can be made bigger.'),
  ],
}
export const newsSeen = () => { try { return localStorage.getItem('satashkent_news') === NEWS.id } catch { return true } }
export const markNewsSeen = () => { try { localStorage.setItem('satashkent_news', NEWS.id) } catch { /* private window */ } }
// The release's lines, drawn by the bell (NotificationsBell.jsx) as its
// first item while the person has not opened it since the release.
export function WhatsNew({ onClose }) {
  return (
    <section className="notif-news" aria-label={tx('What changed')}>
      <b>{tx('What changed')}</b>
      <ul>{NEWS.lines().map((line) => <li key={line}>{line}</li>)}</ul>
      <button type="button" className="btn btn-sm" onClick={onClose}>{tx('Got it')}</button>
    </section>
  )
}
