// Pay (12 Nov 2026, design-variants/admin-tz.md §2.1 "Pay"): the two ladders
// that were LadderEditor's table in the Admin panel's Board group — what a
// published piece pays by its skip band (meta skip_tiers) and how many pieces
// a month earn which grade (meta maker_grades). A rung is a row; pressing it
// opens a sheet with its fields, Save and Delete; "Add a tier" at the end of
// the card opens the same sheet blank. Saved as the whole ladder through
// POST /fields, as LadderEditor's onSave did, with Undo for nine seconds.
//
// The sheet says what is wrong before saving, because the server drops a rung
// it cannot keep without a word (server/routes/fields.js): a tier with no name
// or a band that ends before it starts, a grade with no name or no pieces,
// anything past twelve rungs, and a name past twelve letters is cut.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { tr as tx, locale } from '../../lib/i18n.jsx'
import Modal from '../../components/Modal.jsx'
import { Page, useFields } from './parts.jsx'

const MAX_ROWS = 12      // the server keeps twelve rungs
const MAX_NAME = 12      // and cuts a name at twelve letters

const money = (n) => Number(n || 0).toLocaleString(locale())

const KINDS = {
  pieces: {
    key: 'skip_tiers',
    title: () => tx('What a piece pays'),
    sub: () => tx('What a published piece pays, by how much of it was watched. A piece with no numbers yet pays nothing.'),
    empty: () => tx('No tiers yet.'),
    add: () => tx('Add a tier'),
    del: () => tx('Delete tier'),
    blank: { name: '', min: '0', max: '100', per_film: '0', per_edit: '0' },
    head: (r) => tx('Tier {name}', { name: r.name }),
  },
  grades: {
    key: 'maker_grades',
    title: () => tx('Grades'),
    sub: () => tx('Everybody sees which grade they are on and what the next one takes. Nothing delivered is not a grade.'),
    empty: () => tx('No grades yet.'),
    add: () => tx('Add a grade'),
    del: () => tx('Delete grade'),
    blank: { name: '', pieces: '' },
    head: (r) => r.name,
  },
}

export default function Pay() {
  const { which } = useParams()
  const kind = KINDS[which]
  const { fields, save } = useFields()
  // { at: index in the stored list, or -1 for a new rung }
  const [open, setOpen] = useState(null)
  if (!kind) return <Navigate to="/admin" replace />

  const rows = fields?.[kind.key] || []
  const full = rows.length >= MAX_ROWS

  // The whole ladder goes up at once; the one before is the Undo.
  const write = (list, said) => save({ ...fields, [kind.key]: list }, fields, said)
  const onSave = (row) => {
    const at = open.at
    setOpen(null)
    write(at < 0 ? [...rows, row] : rows.map((r, i) => (i === at ? row : r)))
  }
  const onDelete = () => {
    const at = open.at
    setOpen(null)
    write(rows.filter((_, i) => i !== at), tx('Deleted'))
  }

  return (
    <Page title={kind.title()} sub={kind.sub()}>
      {fields && (
        <section className="co-st-grp">
          <div className="co-st-card">
            {rows.length === 0 && <p className="co-st-empty">{kind.empty()}</p>}
            {rows.map((r, i) => (
              <button key={`${r.name}-${i}`} type="button" className={'co-st-row' + (which === 'pieces' ? ' co-st-rung' : '')} aria-haspopup="dialog" onClick={() => setOpen({ at: i })}>
                {which === 'pieces' ? (
                  <>
                    <span className="co-st-t">{tx('Tier {name}', { name: r.name })}<small>{tx('Skips {min}–{max}%', { min: r.min, max: r.max })}</small></span>
                    <span className="co-st-amt">
                      <span>{tx('{n} for filming', { n: money(r.per_film) })}</span>
                      <span>{tx('{n} for the edit', { n: money(r.per_edit) })}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="co-st-t">{r.name}</span>
                    <span className="co-st-v">{tx('{n} pieces a month', { n: r.pieces })}</span>
                  </>
                )}
              </button>
            ))}
            {/* aria-disabled, not disabled: at twelve the row stays in the tab order, so the keyboard reaches its reason */}
            <button type="button" className="co-st-row" aria-haspopup={full ? undefined : 'dialog'} aria-disabled={full || undefined} onClick={() => { if (!full) setOpen({ at: -1 }) }}>
              <span className="co-st-tile" aria-hidden="true"><Plus size={18} /></span>
              <span className="co-st-t">{kind.add()}{full && <small>{tx('Twelve at most. Delete one to add another.')}</small>}</span>
            </button>
          </div>
        </section>
      )}
      {/* On the body, not in the page: under 641 px the page's push is a
          transform, which would make it the sheet's frame instead of the screen. */}
      {open && (open.at < 0 || rows[open.at]) && createPortal(
        <RungSheet which={which} kind={kind} rows={rows} at={open.at}
          onClose={() => setOpen(null)} onSave={onSave} onDelete={onDelete} />,
        document.body,
      )}
    </Page>
  )
}

// One rung's sheet. Numbers stay text while typed — an emptied box is empty,
// not a nought — and become numbers only on Save.
function RungSheet({ which, kind, rows, at, onClose, onSave, onDelete }) {
  const start = at < 0 ? kind.blank : Object.fromEntries(Object.entries(rows[at]).map(([k, v]) => [k, String(v)]))
  const [d, setD] = useState(start)
  const [tried, setTried] = useState(false)
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }))

  const errs = check(which, d, rows, at)
  const shown = tried ? errs : {}
  const submit = (e) => {
    e?.preventDefault()
    setTried(true)
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0]
      requestAnimationFrame(() => document.getElementById(`rung-${first}`)?.focus())
      return
    }
    const name = d.name.trim().slice(0, MAX_NAME)
    onSave(which === 'pieces'
      ? { name, min: Number(d.min), max: Number(d.max), per_film: Number(d.per_film), per_edit: Number(d.per_edit) }
      : { name, pieces: Number(d.pieces) })
  }

  const field = (k, label, opts = {}) => (
    <div className="co-st-field">
      <label htmlFor={`rung-${k}`}>{label}</label>
      <input id={`rung-${k}`} className="input" value={d[k]} onChange={set(k)}
        {...(opts.text
          ? { type: 'text', maxLength: MAX_NAME, autoComplete: 'off', placeholder: opts.hint }
          : { type: 'number', inputMode: opts.whole ? 'numeric' : 'decimal', min: 0, max: opts.max, step: opts.whole ? 1 : 'any' })}
        aria-invalid={shown[k] ? 'true' : undefined} aria-describedby={shown[k] ? `rung-${k}-err` : undefined} />
      {shown[k] && <small id={`rung-${k}-err`} className="co-st-ferr">{shown[k]}</small>}
    </div>
  )

  return (
    <Modal title={at < 0 ? kind.add() : kind.head(rows[at])} onClose={onClose}
      footer={(
        <>
          {/* Quiet ink, not --critical: Save is the sheet's one red, and the delete has Undo (ТЗ §2.2). */}
          {at >= 0 && <button type="button" className="co-btn co-btn-q co-btn-sm co-st-fbtn co-st-footl" onClick={onDelete}>{kind.del()}</button>}
          <button type="submit" form="rung-form" className="co-btn co-btn-p co-btn-sm co-st-fbtn">{tx('Save')}</button>
        </>
      )}>
      <form id="rung-form" className="co-st-rungform" onSubmit={submit} noValidate>
        {which === 'pieces' ? (
          <>
            {field('name', tx('Tier'), { text: true, hint: 'A' })}
            <div className="co-st-pair">
              {field('min', tx('Skip from, %'), { max: 100 })}
              {field('max', tx('Skip to, %'), { max: 100 })}
            </div>
            <div className="co-st-pair">
              {field('per_film', tx('For filming'))}
              {field('per_edit', tx('For the edit'))}
            </div>
          </>
        ) : (
          <>
            {field('name', tx('Grade'), { text: true, hint: 'A+' })}
            {field('pieces', tx('Pieces a month'), { whole: true })}
          </>
        )}
      </form>
    </Modal>
  )
}

// What is wrong, by field — said under the field. Mirrors what the server
// would otherwise drop without a word.
function check(which, d, rows, at) {
  const e = {}
  const name = d.name.trim()
  if (!name) e.name = tx('Give it a name.')
  else if (rows.some((r, i) => i !== at && r.name.trim().toLowerCase() === name.toLowerCase())) e.name = tx('Another one already has this name.')
  const num = (k, { max, whole } = {}) => {
    const s = String(d[k]).trim()
    const v = Number(s)
    if (s === '' || !Number.isFinite(v)) e[k] = tx('Write a number.')
    else if (v < 0) e[k] = tx('0 or more.')
    else if (max != null && v > max) e[k] = tx('{n} at most.', { n: max })
    else if (whole && !Number.isInteger(v)) e[k] = tx('A whole number.')
    return e[k] ? null : v
  }
  if (which === 'pieces') {
    const lo = num('min', { max: 100 })
    const hi = num('max', { max: 100 })
    if (lo != null && hi != null && hi <= lo) e.max = tx('More than where it starts ({n}%).', { n: lo })
    num('per_film')
    num('per_edit')
  } else {
    const p = num('pieces', { whole: true })
    if (p != null && p < 1) e.pieces = tx('At least 1 — a grade for nothing delivered is not kept.')
  }
  return e
}
