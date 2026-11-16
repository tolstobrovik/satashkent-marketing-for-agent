// The task window's fields (task-window-tz.md §2.2, the owner's 12 Nov 2026 hint: "an admin who clicks the script is
// editing it at once, with nothing else in the window moving"). Every changeable value is a READ-VIEW BUTTON at rest
// and its own small form on press, in place, in the same box:
//   LineField  — the title, a link: an input in the same box, ✓ ✕; Enter, ✓ or the focus leaving commits; Esc restores
//   LongField  — ТЗ, Script, Post copy: a <button> around the paragraph → a textarea of the same font, size, line height
//                and padding, the caret where the press was; ✓ lights once typing starts; ✓ or Ctrl/⌘+Enter commits;
//                a press elsewhere neither saves nor discards; Esc with text typed asks "Keep the draft / Discard";
//                what is typed and not sent is a draft per person per task (localStorage); a stale version is refused
//                (409) with "Changed while you typed: {name}" — See theirs · Keep mine
//   ChipField  — kind, channel, Telegram type: the value as a chip; a menu grown from it; the choice commits
// Whoever may not change a value reads it as plain text: no button, no hover, not focusable (§2.6).
// The parent does the PATCH: `onCommit(value, opts)` resolves on success, throws the server's error on a refusal.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, X, ChevronDown } from 'lucide-react'
import { LinkText } from '../LinkView.jsx'
import { URL_RE } from '../../lib/text.js'
import { tr as tx } from '../../lib/i18n.jsx'
import { useAuth } from '../../lib/auth.jsx'

// ---- the draft of a long text, kept in this browser per person per task per field ----
// The person is in the key: on a shared computer one person's words are never offered to the next (§2.2).
// The value is { text, since } — `since` the version the words were typed against, so a draft restored the next day
// is still refused (409) when somebody changed the text after it; a plain string (the first format) reads as text.
const draftKey = (user, task, field) => `satashkent_draft_${task}_${field}_${user ?? 'anon'}`
export const readDraft = (user, task, field) => {
  try {
    const raw = localStorage.getItem(draftKey(user, task, field))
    if (raw == null) return null
    try { const d = JSON.parse(raw); if (d && typeof d.text === 'string') return { text: d.text, since: d.since || null } } catch { /* the plain string */ }
    return { text: raw, since: null }
  } catch { return null }
}
const writeDraft = (user, task, field, v, since = null) => { try { if (v == null) localStorage.removeItem(draftKey(user, task, field)); else localStorage.setItem(draftKey(user, task, field), JSON.stringify({ text: v, since })) } catch { /* a private window: the box keeps it */ } }

// The caret where the press landed: the offset of the press point in the paragraph's text (its one text node).
// caretPositionFromPoint (Firefox) or caretRangeFromPoint (Chrome, Safari); else the end.
function offsetAt(el, x, y) {
  try {
    let node = null; let off = 0
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset } }
    else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset } }
    if (!node || !el.contains(node)) return null
    // sum the text before the node inside the paragraph
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n = 0
    for (let t = walk.nextNode(); t; t = walk.nextNode()) { if (t === node) return n + off; n += t.data.length }
    return null
  } catch { return null }
}

// The press handlers of a field's own ✓ ✕: the focus stays where the typing is.
// The press is a time, not a flag: one let go elsewhere (no click) stops counting within a second.
const held = (at) => ({
  onMouseDown: (e) => e.preventDefault(),
  onPointerDown: () => { at.current = Date.now() },
})
const pressed = (at) => Date.now() - at.current < 1000

// ---- a single line: the title, a link ----
export function LineField({ value, label, may, onCommit, display = null, className = '', inputClass = '', placeholder = '', required = false, emptyWord = '', tag: Tag = 'span' }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const btn = useRef(null)
  const box = useRef(null)
  const input = useRef(null)
  const back = useRef(false)
  const pressing = useRef(0)                            // when a press on ✓ or ✕ is on its way: the blur it causes is not a commit
  const uid = useId()
  useEffect(() => { if (!open) setDraft(value || '') }, [value, open])
  useEffect(() => { if (open) { const el = input.current; el?.focus({ preventScroll: true }); try { el?.setSelectionRange(el.value.length, el.value.length) } catch { /* fine */ } } else if (back.current) { back.current = false; btn.current?.focus({ preventScroll: true }) } }, [open])
  const shown = display ?? (value || <span className="tw-rv-empty">{emptyWord || placeholder}</span>)
  if (!may) return <Tag className={`tw-ro ${className}`}>{shown}</Tag>
  const close = () => { back.current = true; setOpen(false); setErr('') }
  const commit = async () => {
    if (busy) return
    const v = draft.trim()
    if (v === String(value || '').trim()) { close(); return }
    if (required && !v) { setErr(tx('A name is needed')); return }
    setBusy(true); setErr('')
    try { await onCommit(v); close() } catch (e) { setErr(e.message || tx('Not saved')) } finally { setBusy(false) }
  }
  if (!open) {
    return (
      <Tag className={`tw-f ${className}`}>
        <button type="button" ref={btn} className="tw-rv tw-rv-line" aria-label={`${label}: ${value || emptyWord || tx('not set')}`} onClick={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); setOpen(true) } }}>{shown}</button>
      </Tag>
    )
  }
  return (
    <Tag className={`tw-f tw-f-open ${className}${err ? ' tw-f-bad' : ''}${busy ? ' is-busy' : ''}`} ref={box}
      onBlur={(e) => { if (!pressed(pressing) && !box.current?.contains(e.relatedTarget) && !busy) commit() }}>
      <span className="tw-line-ed">
        <input ref={input} className={`tw-line-in ${inputClass}`} value={draft} aria-label={label} placeholder={placeholder} disabled={busy}
          aria-invalid={!!err || undefined} aria-describedby={err ? `${uid}-e` : undefined}
          onChange={(e) => { setDraft(e.target.value); setErr('') }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(value || ''); close() }
          }} />
        {/* Safari and Firefox on a Mac do not focus a pressed button, so the input's blur came with no relatedTarget and
            saved before ✕ was read: the press keeps the focus in the input (mousedown) and marks itself (pointerdown, touch) */}
        <button type="button" className="tw-ok" aria-label={tx('Save: {label}', { label })} disabled={busy} {...held(pressing)} onClick={() => { pressing.current = 0; commit() }}><Check size={16} aria-hidden="true" /></button>
        <button type="button" className="tw-cx" aria-label={tx('Cancel')} disabled={busy} {...held(pressing)} onClick={() => { pressing.current = 0; setDraft(value || ''); close() }}><X size={16} aria-hidden="true" /></button>
      </span>
      {err && <span className="tw-f-err" id={`${uid}-e`} role="alert">{err}</span>}
    </Tag>
  )
}

// ---- the long text: ТЗ, Script, Post copy ----
// `version`: the row's updated_at the box opened with (sent as if_updated_at). `nameOf(id)`: a person's first name.
// `userId`: whose draft it is; read off the signed-in person when the window does not pass it.
export function LongField({ taskId, field, value, label, may, onCommit, placeholder = '', version = null, extra = null, onOpen = null, opened = false, userId = undefined }) {
  const me = useAuth()?.user?.id
  const who = userId ?? me
  const saved = String(value || '')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [asking, setAsking] = useState(false)          // Esc over typed text: Keep the draft / Discard
  const [clash, setClash] = useState(null)             // { name, theirs } — changed while you typed
  const [seeTheirs, setSeeTheirs] = useState(false)
  const started = useRef(null)                          // the version the box opened with
  const caret = useRef(null)
  const btn = useRef(null)
  const para = useRef(null)
  const ta = useRef(null)
  const back = useRef(false)
  const uid = useId()
  const typed = open && draft !== saved
  // A draft from before (the window closed with words in the box) comes back when the box opens again.
  const openAt = (offset = null) => {
    const k = readDraft(who, taskId, field)
    const kept = k && k.text !== saved ? k : null
    setDraft(kept ? kept.text : saved)
    caret.current = kept ? null : offset
    // a kept draft is sent with the version it was typed against, so a change made since is still a 409
    started.current = (kept && kept.since) || version
    setErr(''); setAsking(false); setClash(null); setSeeTheirs(false)
    setOpen(true)
    onOpen?.()
  }
  useEffect(() => { if (opened && may && !open) openAt(null) }, [opened]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!open) { if (back.current) { back.current = false; btn.current?.focus({ preventScroll: true }) } return }
    const el = ta.current
    if (!el) return
    fit(el)
    el.focus({ preventScroll: true })
    const at = caret.current == null ? el.value.length : Math.min(caret.current, el.value.length)
    try { el.setSelectionRange(at, at) } catch { /* fine */ }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const fit = (el) => { if (!CSS.supports?.('field-sizing', 'content')) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` } }
  const close = () => { back.current = true; setOpen(false); setAsking(false); setClash(null); setSeeTheirs(false) }
  const commit = async (force = false) => {
    if (busy) return
    if (draft === saved) { writeDraft(who, taskId, field, null); close(); return }
    setBusy(true); setErr('')
    try {
      await onCommit(draft.trim(), { since: force ? null : started.current })
      writeDraft(who, taskId, field, null)
      close()
    } catch (e) {
      if (e.status === 409 || e.data?.conflict) {
        setClash({ name: e.data?.by_name || '', theirs: e.data?.theirs ?? null, at: e.data?.updated_at || null })
        if (e.data?.updated_at) started.current = e.data.updated_at
      } else setErr(e.message || tx('Not saved'))
    } finally { setBusy(false) }
  }
  const words = saved.trim()
  if (!may) {
    if (!words) return null
    return <div className="tw-long tw-ro"><p className="tw-long-txt"><LinkText text={words} /></p>{extra}</div>
  }
  if (!open) {
    const links = [...words.matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:!?)\]»"']+$/, ''))
    return (
      <div className="tw-long">
        <button type="button" ref={btn} className={'tw-rv tw-rv-long' + (words ? '' : ' is-empty')}
          aria-label={`${label}: ${words || tx('empty')}`}
          onClick={(e) => openAt(para.current ? offsetAt(para.current, e.clientX, e.clientY) : null)}
          onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); openAt(null) } }}>
          <span ref={para} className="tw-long-txt">{words || placeholder}</span>
        </button>
        {/* links stay links: a <button> cannot hold one, so they are listed under the text */}
        {links.length > 0 && <p className="tw-long-links"><LinkText text={links.join('  ')} /></p>}
        {(readDraft(who, taskId, field)?.text ?? saved) !== saved && <span className="tw-draft-note">{tx('A draft is kept — press to go on')}</span>}
        {extra}
      </div>
    )
  }
  return (
    <div className={'tw-long tw-f-open' + (err || clash ? ' tw-f-bad' : '') + (busy ? ' is-busy' : '')}>
      {clash && seeTheirs && clash.theirs != null && (
        <div className="tw-theirs"><span className="tw-theirs-lb">{tx('Theirs')}</span><p className="tw-long-txt">{clash.theirs || '—'}</p></div>
      )}
      <textarea ref={ta} className="tw-long-in" value={draft} aria-label={label} placeholder={placeholder} disabled={busy}
        aria-invalid={!!(err || clash) || undefined} aria-describedby={`${uid}-h`}
        onChange={(e) => { setDraft(e.target.value); setErr(''); setAsking(false); writeDraft(who, taskId, field, e.target.value === saved ? null : e.target.value, started.current); fit(e.target) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
          else if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation()
            if (draft === saved) { writeDraft(who, taskId, field, null); close() } else setAsking(true)
          }
        }} />
      <div className="tw-long-bar">
        <span className="tw-long-hint" id={`${uid}-h`}>{tx('Ctrl+Enter saves · Esc puts it back')}</span>
        <button type="button" className={'tw-ok' + (typed ? ' lit' : '')} aria-label={tx('Save: {label}', { label })} disabled={busy} onClick={() => commit()}><Check size={18} aria-hidden="true" /></button>
        <button type="button" className="tw-cx" aria-label={tx('Cancel')} disabled={busy} onClick={() => { if (draft === saved) { writeDraft(who, taskId, field, null); close() } else setAsking(true) }}><X size={18} aria-hidden="true" /></button>
      </div>
      {/* a second Esc is "never mind": back to the words, not up to the window's own "not saved" question */}
      {asking && (
        <div className="tw-keep" role="alertdialog" aria-label={tx('Your words are not saved')}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAsking(false); ta.current?.focus({ preventScroll: true }) } }}>
          <span>{tx('Your words are not saved.')}</span>
          <button type="button" className="co-btn co-btn-t co-btn-sm" autoFocus onClick={() => { writeDraft(who, taskId, field, draft, started.current); close() }}>{tx('Keep the draft')}</button>
          <button type="button" className="co-btn co-btn-q co-btn-sm" onClick={() => { writeDraft(who, taskId, field, null); setDraft(saved); close() }}>{tx('Discard')}</button>
        </div>
      )}
      {clash && (
        <div className="tw-clash" role="alert">
          <span>{clash.name ? tx('Changed while you typed: {name}', { name: clash.name }) : tx('Changed while you typed')}</span>
          {clash.theirs != null && <button type="button" className="co-btn co-btn-q co-btn-sm" onClick={() => setSeeTheirs((v) => !v)}>{tx('See theirs')}</button>}
          {/* sent again with the version the 409 named: a third person's change after it is a new 409, never overwritten */}
          <button type="button" className="co-btn co-btn-t co-btn-sm" onClick={() => commit(!clash.at)}>{tx('Keep mine')}</button>
        </div>
      )}
      {err && <span className="tw-f-err" role="alert">{err}</span>}
    </div>
  )
}

// ---- a choice: the kind, the channel, the Telegram type ----
export function ChipField({ value, label, may, options, onCommit, display = null, icon: Icon = null }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(null)          // the choice in flight, drawn at half strength until the server answers
  const btn = useRef(null)
  const box = useRef(null)
  const cur = options.find((o) => o.value === value)
  const shown = busy && pending != null ? (options.find((o) => o.value === pending)?.label ?? pending) : display ?? (cur ? cur.label : value || '—')
  useEffect(() => {
    if (!open) return undefined
    box.current?.querySelector('[role="menuitemradio"][aria-checked="true"], [role="menuitemradio"]')?.focus({ preventScroll: true })
    const away = (e) => { if (!box.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])
  if (!may) return <span className="tw-ro tw-chip-ro">{Icon && <Icon size={16} aria-hidden="true" />}{shown}</span>
  const shut = () => { setOpen(false); setTimeout(() => btn.current?.focus({ preventScroll: true }), 0) }
  const pick = async (v) => {
    if (busy) return
    if (v === value) { shut(); return }
    // the menu goes and the keyboard is back on the chip at once (a disabled item would drop the focus to the page);
    // a refusal puts the old value back and says why under the chip
    setOpen(false); btn.current?.focus({ preventScroll: true })
    setPending(v); setBusy(true); setErr('')
    try { await onCommit(v) } catch (e) { setErr(e.message || tx('Not saved')) } finally { setBusy(false); setPending(null) }
  }
  const keys = (e) => {
    const all = [...box.current.querySelectorAll('[role="menuitemradio"]')]
    const i = all.indexOf(document.activeElement)
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key]
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); shut(); return }
    if (to == null) return
    e.preventDefault(); all[(to + all.length) % all.length]?.focus()
  }
  return (
    <span className={'tw-f tw-chipf' + (err ? ' tw-f-bad' : '') + (busy ? ' is-busy' : '')}>
      <button type="button" ref={btn} className="tw-rv tw-chipb" aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${cur ? cur.label : value || tx('not set')}`}
        onClick={() => setOpen((v) => !v)} onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); setOpen(true) } }}>{Icon && <Icon size={16} aria-hidden="true" />}<span>{shown}</span><ChevronDown size={14} aria-hidden="true" className="tw-chip-c" /></button>
      {open && (
        <span className="tw-menu" role="menu" aria-label={label} ref={box} onKeyDown={keys}>
          {options.map((o) => (
            <button key={o.value} type="button" role="menuitemradio" aria-checked={o.value === value} tabIndex={-1} className="tw-mi" disabled={busy} onClick={() => pick(o.value)}>
              {o.icon && <o.icon size={16} aria-hidden="true" />}<span>{o.label}</span>{o.value === value && <Check size={16} aria-hidden="true" className="tw-mi-on" />}
            </button>
          ))}
        </span>
      )}
      {err && <span className="tw-f-err" role="alert">{err}</span>}
    </span>
  )
}
