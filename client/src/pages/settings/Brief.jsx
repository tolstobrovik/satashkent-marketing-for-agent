// The brief (12 Nov 2026, design-variants/admin-tz.md §2.1): what a task asks
// for, and who it needs. Was "The task form" and "Who must be on a task" in
// the Admin panel's Board group (pages/Admin.jsx SettingsTab) — the same
// /fields config, the same rules, one page a question now:
//   /admin/brief             the fields and the people, a row each
//   /admin/brief/:field      Off · Optional · Required, the kinds, the choices
//   /admin/brief/crew/:hat   the kinds a task needs that person on
// Every press saves at once (the server answers the effective config) with
// "Saved" and Undo.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AlignLeft, Clapperboard, ClipboardList, Images, LayoutTemplate, Palette, Scissors, ScrollText, Tag, X } from 'lucide-react'
import { toast } from '../../lib/toast.js'
import { tr as tx } from '../../lib/i18n.jsx'
import { CONTENT_TYPES, typeLabel } from '../../lib/constants.js'
import { Group, Line, Page, Row, SwitchRow, useFields } from './parts.jsx'

// The three states a field can be in (Admin.jsx RULES).
const RULES = [
  { key: 'off', label: 'Off' },
  { key: 'optional', label: 'Optional' },
  { key: 'required', label: 'Required' },
]
// The brief fields an admin can tune (Admin.jsx TASK_FIELD_DEFS); Format and
// Rubrika carry the choices their dropdowns offer.
const FIELDS = [
  { key: 'format', label: 'Format', hint: 'talking head, split screen…', icon: LayoutTemplate },
  { key: 'rubrika', label: 'Rubrika', hint: 'the recurring column it belongs to', icon: Tag },
  { key: 'script', label: 'Script', hint: 'the words and shots the crew films by', icon: ScrollText },
  { key: 'tz', label: 'ТЗ', hint: 'what the editor is asked to make of the footage', icon: ClipboardList },
  { key: 'reference', label: 'Reference', hint: 'examples, mood, style — the brief', icon: Images },
  { key: 'description', label: 'Description', hint: 'free notes on the task', icon: AlignLeft },
]
// The people a task of a kind must carry (fields.crew) — what the task counts
// as missing, and what the stage walls refuse a move over.
const HATS = [
  { key: 'operator', label: 'Operator', hint: 'who films it', icon: Clapperboard },
  { key: 'editor', label: 'Editor', hint: 'who edits it', icon: Scissors },
  { key: 'designer', label: 'Designer', hint: 'who draws the artwork', icon: Palette },
]

// "Reel, Video" in the board's order; every kind is said as such; none is null.
const kindsOf = (types = []) => {
  if (!types.length) return null
  if (CONTENT_TYPES.every((t) => types.includes(t.key))) return tx('Every kind')
  return CONTENT_TYPES.filter((t) => types.includes(t.key)).map((t) => typeLabel(t.key)).join(', ')
}
const ruleWord = (state) => tx((RULES.find((r) => r.key === state) || RULES[1]).label)
const fieldValue = (cfg) => (cfg.state === 'off' ? tx('Off') : `${ruleWord(cfg.state)} · ${kindsOf(cfg.types) || tx('No kind')}`)

export default function Brief() {
  // One load for the three pages, so going in and out of a field reads no twice.
  const f = useFields()
  return (
    <Routes>
      <Route index element={<Fields {...f} />} />
      <Route path="crew/:hat" element={<Crew {...f} />} />
      <Route path=":field" element={<Field {...f} />} />
      <Route path="*" element={<Navigate to="/admin/brief" replace />} />
    </Routes>
  )
}

// The page's sub line: a hint, its first letter raised (the phrase books keep
// the hints lower-case, as they sit mid-sentence elsewhere).
const Hint = ({ children }) => <span className="co-st-hint">{children}</span>

// Back from a sub-page, the row that was pressed takes the focus (Row does it
// as it mounts) — but Page then moves it to the headline, as on any arrival.
// Remember the row in a layout effect and hand the focus back after Page's
// effect has run (a parent's effects run after its children's).
function useRowFocusBack() {
  const row = useRef(null)
  useLayoutEffect(() => { const a = document.activeElement; if (a?.classList?.contains('co-st-row')) row.current = a }, [])
  useEffect(() => { row.current?.focus({ preventScroll: false }) }, [])
}

function Fields({ fields }) {
  useRowFocusBack()
  return (
    <Page title={tx('The brief')}>
      {fields && (
        <>
          <Group title={tx('Fields')}>
            {FIELDS.filter((d) => fields[d.key]).map((d) => (
              <Row key={d.key} id={`brief-${d.key}`} to={`/admin/brief/${d.key}`} icon={d.icon} label={tx(d.label)} value={fieldValue(fields[d.key])} />
            ))}
          </Group>
          {fields.crew && (
            <Group title={tx('People a task needs')} note={tx('Required fields must be filled before a task of that kind is saved.')}>
              {HATS.map((h) => (
                <Row key={h.key} id={`brief-crew-${h.key}`} to={`/admin/brief/crew/${h.key}`} icon={h.icon} label={tx(h.label)} value={kindsOf(fields.crew[h.key]) || tx('Nobody')} />
              ))}
            </Group>
          )}
        </>
      )}
    </Page>
  )
}

// Off · Optional · Required: a radio group, one tab stop, the arrows move the
// choice (and save it, as a press does).
function RuleSeg({ value, label, onChange }) {
  const refs = useRef([])
  const onKey = (e, i) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    let j = null
    if (step) j = (i + step + RULES.length) % RULES.length
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = RULES.length - 1
    if (j === null) return
    e.preventDefault()
    refs.current[j]?.focus()
    if (RULES[j].key !== value) onChange(RULES[j].key)
  }
  return (
    <div className="co-st-rule">
      <div className="co-st-seg" role="radiogroup" aria-label={label}>
        {RULES.map((r, i) => (
          <button key={r.key} ref={(el) => { refs.current[i] = el }} type="button" role="radio"
            aria-checked={value === r.key} tabIndex={value === r.key ? 0 : -1}
            onClick={() => { if (value !== r.key) onChange(r.key) }} onKeyDown={(e) => onKey(e, i)}>
            {tx(r.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

// The kinds as switches (no tile: the kind's name is the row).
function Kinds({ types, onToggle }) {
  return (
    <Group title={tx('For these kinds')}>
      {CONTENT_TYPES.map((t) => (
        <SwitchRow key={t.key} tile={false} label={typeLabel(t.key)} on={types.includes(t.key)} onChange={() => onToggle(t.key)} />
      ))}
    </Group>
  )
}
const flip = (list = [], k) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k])

function Field({ fields, save }) {
  const { field } = useParams()
  const def = FIELDS.find((d) => d.key === field)
  if (!def) return <Navigate to="/admin/brief" replace />
  const cfg = fields?.[def.key]
  if (fields && !cfg) return <Navigate to="/admin/brief" replace />
  const patch = (part) => save({ ...fields, [def.key]: { ...cfg, ...part } }, fields)
  return (
    <Page title={tx(def.label)} back="/admin/brief" sub={<Hint>{tx(def.hint)}</Hint>}>
      {cfg && (
        <>
          <RuleSeg value={cfg.state} label={tx('Rule for {name}', { name: tx(def.label) })} onChange={(state) => patch({ state })} />
          <Kinds types={cfg.types || []} onToggle={(k) => patch({ types: flip(cfg.types, k) })} />
          {cfg.options !== undefined && <Choices options={cfg.options || []} onChange={(options) => patch({ options })} />}
        </>
      )}
    </Page>
  )
}

// The choices a dropdown offers: a row each with its remove button, and an add
// row at the end of the card. The server trims, de-duplicates and keeps 40.
function Choices({ options, onChange }) {
  const [draft, setDraft] = useState('')
  const card = useRef(null)
  const input = useRef(null)
  const hid = useId()
  const add = (e) => {
    e.preventDefault()
    const v = draft.trim()
    if (!v) { input.current?.focus(); return }
    const had = options.find((o) => o.toLowerCase() === v.toLowerCase())
    if (had) { toast(tx('Already there: {name}', { name: had }), 'err'); return }
    setDraft('')
    onChange([...options, v])
  }
  const remove = (i) => {
    onChange(options.filter((_, j) => j !== i))
    // The pressed button is gone: focus the one that took its place, else the field.
    setTimeout(() => {
      const left = card.current?.querySelectorAll('.co-st-ib') || []
      ;(left[i] || left[i - 1] || input.current)?.focus()
    }, 0)
  }
  return (
    <section className="co-st-grp" aria-labelledby={hid}>
      <h2 className="co-st-gh" id={hid}>{tx('Choices')}</h2>
      <div className="co-st-card" ref={card}>
        {options.length === 0 && <p className="co-st-empty">{tx('No choices yet.')}</p>}
        {options.map((o, i) => (
          <Line key={o} tile={false} label={o}>
            <button type="button" className="co-st-ib" aria-label={tx('Remove {choice}', { choice: o })} onClick={() => remove(i)}>
              <X size={18} aria-hidden="true" />
            </button>
          </Line>
        ))}
        <form className="co-st-add" onSubmit={add}>
          <input ref={input} className="input" value={draft} maxLength={80} placeholder={tx('New choice')} aria-label={tx('New choice')}
            onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="co-btn co-btn-t co-btn-sm">{tx('Add')}</button>
        </form>
      </div>
    </section>
  )
}

function Crew({ fields, save }) {
  const { hat } = useParams()
  const def = HATS.find((h) => h.key === hat)
  if (!def) return <Navigate to="/admin/brief" replace />
  const types = fields?.crew?.[def.key] || []
  return (
    <Page title={tx(def.label)} back="/admin/brief" sub={<Hint>{tx(def.hint)}</Hint>}>
      {fields?.crew && (
        <Kinds types={types} onToggle={(k) => save({ ...fields, crew: { ...fields.crew, [def.key]: flip(types, k) } }, fields)} />
      )}
    </Page>
  )
}
