// Settings (12 Nov 2026, design-variants/admin-tz.md): the pieces every page of
// it is made of. The rows copy the menus' Settings group (CoachNav.jsx,
// styles-nav.css): 44 px, a 30 px grey tile, the name, a value on the right and
// a chevron — one list, a row a setting, a press opens its own page. Every
// class is co-st-… (styles-settings.css), under the Coach look.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, HelpCircle, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { toast } from '../../lib/toast.js'
import { tr as tx } from '../../lib/i18n.jsx'

// The row that was pressed to leave the list, so coming back lands on it.
const LAST = 'satashkent_settings_from'
export const remember = (key) => { try { sessionStorage.setItem(LAST, key) } catch { /* private window */ } }

// A page of Settings: the way back, the one headline (Nekst), an action on its
// right, then the cards. Focus goes to the headline on arrival, so a screen
// reader hears where it is; the list's own page has no way back.
// The way back names the page it goes to (a field's page goes back to The brief, not to the list).
const BACK = { '/admin': 'Advanced settings', '/admin/brief': 'The brief', '/admin/roles': 'Roles', '/admin/channels': 'Channels' }
export function Page({ title, back = '/admin', action = null, wide = false, children, sub = null }) {
  const h = useRef(null)
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    if (!back) return undefined
    // A row that opened the page we came back from takes the focus first (Row, or a list's own
    // effect); only when nothing holds it does the headline, so a screen reader hears where it is.
    const f = requestAnimationFrame(() => { const a = document.activeElement; if (!a || a === document.body) h.current?.focus({ preventScroll: true }) })
    return () => cancelAnimationFrame(f)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'co co-st' + (wide ? ' co-st-wide' : '')}>
      {back && (
        <Link className="co-st-back" to={back}>
          <ChevronLeft size={16} aria-hidden="true" />{tx(BACK[back] || 'Advanced settings')}
        </Link>
      )}
      <header className="co-st-head">
        <h1 className="co-title" ref={h} tabIndex={-1}>{title}</h1>
        {action}
      </header>
      {sub && <p className="co-st-sub">{sub}</p>}
      {children}
    </div>
  )
}

// A group: its name on the ground, its rows on one card.
export function Group({ title, children, note = null, id }) {
  const hid = useId()
  return (
    <section className="co-st-grp" aria-labelledby={title ? hid : undefined} id={id}>
      {title && <h2 className="co-st-gh" id={hid}>{title}</h2>}
      <div className="co-st-card">{children}</div>
      {note && <p className="co-st-note">{note}</p>}
    </section>
  )
}

// A row that opens a page: tile · name · value · chevron, the whole row the link.
export function Row({ to, icon: Icon, label, value = null, sub = null, id, tile = true }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    let from = null
    try { from = sessionStorage.getItem(LAST) } catch { /* ok */ }
    if (id && from === id) { ref.current?.focus({ preventScroll: false }); try { sessionStorage.removeItem(LAST) } catch { /* ok */ } }
  }, [id])
  return (
    <Link ref={ref} className="co-st-row" to={to} onClick={() => id && remember(id)}>
      {tile && <span className="co-st-tile" aria-hidden="true">{Icon && <Icon size={18} />}</span>}
      <span className="co-st-t">{label}{sub && <small>{sub}</small>}</span>
      {value != null && value !== '' && <span className="co-st-v">{value}</span>}
      <ChevronRight className="co-st-chev" size={16} aria-hidden="true" />
    </Link>
  )
}

// A row that is itself the setting: the house switch, saved at once.
export function SwitchRow({ icon: Icon, label, sub = null, on, onChange, disabled = false, tile = true }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} className="co-st-row co-st-swrow" disabled={disabled} onClick={() => onChange(!on)}>
      {tile && <span className="co-st-tile" aria-hidden="true">{Icon && <Icon size={18} />}</span>}
      <span className="co-st-t">{label}{sub && <small>{sub}</small>}</span>
      <span className="co-st-sw" aria-hidden="true"><i /></span>
    </button>
  )
}

// A row that holds something other than a link or a switch on its right.
export function Line({ icon: Icon, label, sub = null, children, tile = true }) {
  return (
    <div className="co-st-row co-st-line">
      {tile && <span className="co-st-tile" aria-hidden="true">{Icon && <Icon size={18} />}</span>}
      <span className="co-st-t">{label}{sub && <small>{sub}</small>}</span>
      {children}
    </div>
  )
}

// "?" — a small card of help that opens from the button's edge and closes on
// Escape, a press outside, or the button again.
export function Help({ label, children }) {
  const [open, setOpen] = useState(false)
  const btn = useRef(null)
  const pop = useRef(null)
  const id = useId()
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <span className="co-st-help">
      <button ref={btn} type="button" className="co-st-ib" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <HelpCircle size={18} aria-hidden="true" />
      </button>
      {open && (
        <div ref={pop} id={id} className="co-st-pop" role="dialog" aria-label={label}>
          <button type="button" className="co-st-ib co-st-pop-x" aria-label={tx('Close')} onClick={() => { setOpen(false); btn.current?.focus() }}><X size={16} aria-hidden="true" /></button>
          {children}
        </div>
      )}
    </span>
  )
}

// The board's settings (/fields): one load, one save a change, the server's
// effective answer kept, and Undo for nine seconds — a setting is a slip-prone
// press. Errors are said in a toast with the server's words, never alert().
export function useFields() {
  const [fields, setFields] = useState(null)
  const now = useRef(null)
  now.current = fields
  const load = useCallback(() => api.get('/fields').then(setFields).catch((e) => toast(e.message, 'err')), [])
  useEffect(() => { load() }, [load])
  const save = useCallback(async (next, prev, said = tx('Saved')) => {
    setFields(next)
    try {
      const eff = await api.post('/fields', next)
      setFields((f) => ({ ...f, ...eff }))
      // Undo puts back only what this press changed, onto the settings as they are by then —
      // an older toast's Undo never takes a newer change with it.
      const keys = prev ? Object.keys({ ...prev, ...next }).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k])) : []
      const undo = () => { const back = { ...now.current }; for (const k of keys) back[k] = prev[k]; save(back, null, tx('Put back')) }
      toast(said, 'ok', keys.length ? { label: tx('Undo'), onClick: undo } : null)
    } catch (e) { toast(e.message, 'err'); load() }
  }, [load])
  return { fields, setFields, save, load }
}

export const spell = (n, one, many) => (n === 1 ? one : many)
