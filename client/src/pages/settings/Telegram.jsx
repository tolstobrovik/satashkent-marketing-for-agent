// Telegram (/admin/telegram, 12 Nov 2026 — design-variants/admin-tz.md §0 q9,
// §2.1): the bot in one line, then only the people who are not connected yet,
// each with "Stop asking" (no more prompt to connect). Those not asked and
// those connected wait under two folds. With the bot on: "Message everyone"
// (the broadcast — the page's one ruby button) and the ready-made reminders
// under a fold. The routes are the Admin panel's (pages/Admin.jsx,
// TelegramTab and Reminders) plus POST /telegram/admin/ask.
import { useCallback, useEffect, useId, useState } from 'react'
import { BellRing, Bot, ChevronDown, Plus, Send } from 'lucide-react'
import { api } from '../../lib/api.js'
import { toast } from '../../lib/toast.js'
import { tr as tx } from '../../lib/i18n.jsx'
import Avatar from '../../components/Avatar.jsx'
import Modal from '../../components/Modal.jsx'
import { Group, Help, Line, Page, SwitchRow } from './parts.jsx'

// After a row leaves its list, the keyboard lands on the next row's button (or
// the one before it), else on the fold the person went to — never on <body>.
const focusAfter = (list, i, ...fallbacks) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const btns = document.querySelectorAll(`[data-tg="${list}"] .co-btn`)
  ;(btns[i] || btns[i - 1] || fallbacks.map((s) => document.querySelector(s)).find(Boolean))?.focus()
}))

export default function Telegram() {
  const [st, setSt] = useState(null)
  const [faces, setFaces] = useState({})
  const [busy, setBusy] = useState(false)
  const [cast, setCast] = useState('')
  const load = useCallback(() => api.get('/telegram/admin').then(setSt).catch((e) => toast(e.message, 'err')), [])
  useEffect(() => {
    load()
    // GET /telegram/admin carries no colour or photo; the faces come from /users.
    api.get('/users').then((us) => setFaces(Object.fromEntries((us || []).map((u) => [u.id, u])))).catch(() => {})
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  const setAsked = async (m, ask, undoable = true) => {
    setSt((s) => ({ ...s, members: s.members.map((x) => (x.id === m.id ? { ...x, asked: ask } : x)) }))
    try {
      await api.post('/telegram/admin/ask', { user_id: m.id, ask })
      toast(ask ? tx('Asking again: {name}', { name: m.name }) : tx('Stopped asking: {name}', { name: m.name }), 'ok',
        undoable ? { label: tx('Undo'), onClick: () => setAsked(m, !ask, false) } : null)
    } catch (e) { toast(e.message, 'err'); load() }
  }
  const unlink = async (m) => {
    if (!confirm(tx('Unlink «{name}» from the bot?', { name: m.name }))) return
    try {
      await api.post('/telegram/admin/unlink', { user_id: m.id })
      toast(tx('Unlinked: {name}', { name: m.name }), 'ok')
      await load()
    } catch (e) { toast(e.message, 'err') }
  }
  const turnOn = async () => {
    setBusy(true)
    try {
      const out = await api.post('/telegram/set-webhook', {})
      if (out.ok) toast(tx('The bot is on'), 'ok')
      else toast(tx('Telegram refused — check the token on the server'), 'err')
      await load()
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  const broadcast = async () => {
    const text = cast.trim()
    if (!text) return
    setBusy(true)
    try {
      const out = await api.post('/telegram/broadcast', { text })
      toast(tx('Sent to {n}', { n: out.sent }), 'ok')
      setCast('')
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  if (!st) return <Page title={tx('Telegram')}><div aria-busy="true" /></Page>
  const waiting = st.members.filter((m) => !m.linked && m.asked !== false)
  const notAsked = st.members.filter((m) => !m.linked && m.asked === false)
  const linked = st.members.filter((m) => m.linked)
  // The server says only where the webhook points and its last error: no
  // address, or an error that still holds, is a bot that does not answer.
  // Telegram keeps the last error after it has passed (every deploy leaves a
  // 502 behind), so an error counts only while updates wait, or for ten
  // minutes after it; an error with no date is taken as it is.
  const wh = st.webhook || {}
  const errNow = !!wh.last_error_message && (!wh.last_error_date || wh.pending_update_count > 0 || Date.now() / 1000 - wh.last_error_date < 600)
  const deaf = st.enabled && (!wh.url || errNow)

  return (
    <Page title={tx('Telegram')}>
      <div className="co-st-tg">
        <Group>
          {!st.enabled ? (
            <Line icon={Bot} label={tx('The bot')}>
              <span className="co-st-v">{tx('Off')}</span>
              <Help label={tx('How to turn on the bot')}>
                <p>{tx('The bot needs a token on the server. Ask whoever runs the server to add it, then press Turn on again here.')}</p>
              </Help>
            </Line>
          ) : deaf ? (
            <Line icon={Bot} label={tx('The bot')} sub={<>{tx('Not answering')}{errNow ? ` · ${wh.last_error_message}` : ''}</>}>
              <button type="button" className="co-btn co-btn-t co-btn-sm" onClick={turnOn} disabled={busy}>{tx('Turn on again')}</button>
            </Line>
          ) : (
            <Line icon={Bot} label={tx('The bot')}>
              <span className="co-st-v">{st.bot ? `@${st.bot} · ` : ''}{tx('Working')}</span>
            </Line>
          )}
        </Group>

        {/* "Everyone is connected." only when it is true: people no longer
            asked are not connected either, and wait under their own fold. */}
        {(waiting.length > 0 || notAsked.length === 0) && <Group title={tx('Not connected yet')}>
          <div data-tg="waiting">
            {waiting.length === 0 && <p className="co-st-empty">{tx('Everyone is connected.')}</p>}
            {waiting.map((m, i) => (
              <Person key={m.id} m={m} face={faces[m.id]}>
                <button type="button" className="co-btn co-btn-t co-btn-sm" data-id={m.id} aria-label={tx('Stop asking: {name}', { name: m.name })}
                  onClick={() => { setAsked(m, false); focusAfter('waiting', i, '#tg-fold-asked') }}>{tx('Stop asking')}</button>
              </Person>
            ))}
          </div>
        </Group>}

        {notAsked.length > 0 && (
          <Fold id="tg-fold-asked" title={tx('Not asked ({n})', { n: notAsked.length })} list="asked">
            {notAsked.map((m, i) => (
              <Person key={m.id} m={m} face={faces[m.id]}>
                <button type="button" className="co-btn co-btn-t co-btn-sm" aria-label={tx('Ask again: {name}', { name: m.name })}
                  onClick={() => { setAsked(m, true); focusAfter('asked', i, '#tg-fold-asked', `[data-tg="waiting"] [data-id="${m.id}"]`) }}>{tx('Ask again')}</button>
              </Person>
            ))}
          </Fold>
        )}

        {linked.length > 0 && (
          <Fold id="tg-fold-linked" title={tx('{n} connected', { n: linked.length })} list="linked">
            {linked.map((m) => (
              <Person key={m.id} m={m} face={faces[m.id]}>
                <button type="button" className="co-btn co-btn-q co-btn-sm" aria-label={tx('Unlink: {name}', { name: m.name })} onClick={() => unlink(m)}>{tx('Unlink')}</button>
              </Person>
            ))}
          </Fold>
        )}

        {st.enabled && (
          <>
            <Group title={tx('Message everyone')}>
              <form className="co-st-add co-st-cast" onSubmit={(e) => { e.preventDefault(); broadcast() }}>
                <input className="input" value={cast} onChange={(e) => setCast(e.target.value)} aria-label={tx('Message everyone')} placeholder={tx('Write the announcement…')} />
                <button type="submit" className="co-btn co-btn-p co-btn-sm" disabled={busy || !cast.trim() || linked.length === 0}>
                  <Send size={16} aria-hidden="true" />{tx('Send to {n}', { n: linked.length })}
                </button>
              </form>
            </Group>
            <Reminders linked={linked} />
          </>
        )}
      </div>
    </Page>
  )
}

// A person: their face where a tile would be, the name, one button.
function Person({ m, face, children }) {
  return (
    <div className="co-st-row co-st-line">
      <span className="co-st-face" aria-hidden="true"><Avatar name={m.name} color={face?.color || undefined} src={face?.avatar || null} size="sm" /></span>
      <span className="co-st-t">{m.name}</span>
      {children}
    </div>
  )
}

// A quiet fold on the ground: a button that says what is under it and opens it.
function Fold({ id, title, list, children, start = false }) {
  const [open, setOpen] = useState(start)
  const body = useId()
  return (
    <section className="co-st-grp">
      <button type="button" id={id} className="co-st-fold" aria-expanded={open} aria-controls={body} onClick={() => setOpen((v) => !v)}>
        {title}<ChevronDown size={16} aria-hidden="true" />
      </button>
      <div id={body} hidden={!open}>
        {open && <div className="co-st-card" data-tg={list}>{children}</div>}
      </div>
    </section>
  )
}

/* ---- the ready-made reminders (Admin.jsx's Reminders, kept, drawn as rows) ----
   A nudge worth repeating, written once: sent on the spot to chosen people, or
   left to arrive by itself on chosen weekdays at a chosen hour (Tashkent). */
const WEEK = [{ d: 1, l: 'Mon' }, { d: 2, l: 'Tue' }, { d: 3, l: 'Wed' }, { d: 4, l: 'Thu' }, { d: 5, l: 'Fri' }, { d: 6, l: 'Sat' }, { d: 0, l: 'Sun' }]
const BLANK = { title: '', text: '', audience: 'linked', days: [], hour: 9, enabled: true }
const AUDIENCES = [['linked', 'Everyone connected'], ['role:member', 'Members'], ['role:editor', 'Editors'], ['role:operator', 'Operators'], ['role:designer', 'Designers'], ['role:admin', 'Admins']]
const hh = (h) => `${String(h).padStart(2, '0')}:00`
const whoReads = (a) => { const hit = AUDIENCES.find(([k]) => k === a); return hit ? tx(hit[1]) : a.startsWith('channel:') ? a.slice(8) : tx('Chosen people') }
const when = (t) => (t.days.length && t.enabled
  ? `${t.days.map((d) => tx(WEEK.find((w) => w.d === d)?.l || '')).join(', ')} · ${hh(t.hour)}`
  : tx('Sent by hand'))

function Reminders({ linked }) {
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [pick, setPick] = useState(null) // { tpl, ids }
  const [busy, setBusy] = useState(false)
  const load = () => api.get('/telegram/templates').then(setList).catch(() => setList([]))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!edit.title.trim() || !edit.text.trim()) return
    setBusy(true)
    try {
      if (edit.id) await api.patch(`/telegram/templates/${edit.id}`, edit)
      else await api.post('/telegram/templates', edit)
      setEdit(null); await load(); toast(tx('Saved'), 'ok')
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  const remove = async (t) => {
    if (!confirm(tx('Delete the reminder «{name}»?', { name: t.title }))) return
    try { await api.del(`/telegram/templates/${t.id}`); setEdit(null); await load(); toast(tx('Deleted'), 'ok') } catch (e) { toast(e.message, 'err') }
  }
  const sendNow = async () => {
    setBusy(true)
    try {
      const out = await api.post(`/telegram/templates/${pick.tpl.id}/send`, { user_ids: pick.ids })
      if (out.sent) toast(tx('Sent to {n}', { n: out.sent }), 'ok')
      else toast(tx('Nobody in that audience is connected yet'), 'err')
      setPick(null)
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  if (!list) return null
  return (
    <>
      <Fold id="tg-fold-rem" title={tx('Ready-made reminders ({n})', { n: list.length })} list="reminders">
        {list.map((t) => (
          <div key={t.id} className="co-st-row co-st-line">
            <span className="co-st-tile" aria-hidden="true"><BellRing size={18} /></span>
            <button type="button" className="co-st-t co-st-rem" aria-haspopup="dialog" onClick={() => setEdit({ ...t })}>
              {t.title}<small>{when(t)} · {whoReads(t.audience)}</small>
            </button>
            <button type="button" className="co-btn co-btn-t co-btn-sm" aria-haspopup="dialog" aria-label={tx('Send: {name}', { name: t.title })}
              disabled={busy || linked.length === 0} onClick={() => setPick({ tpl: t, ids: linked.map((m) => m.id) })}>{tx('Send')}</button>
          </div>
        ))}
        <button type="button" className="co-st-row" aria-haspopup="dialog" onClick={() => setEdit({ ...BLANK })}>
          <span className="co-st-tile" aria-hidden="true"><Plus size={18} /></span>
          <span className="co-st-t">{tx('New reminder')}</span>
        </button>
      </Fold>

      {edit && (
        <Modal title={edit.id ? list.find((x) => x.id === edit.id)?.title || tx('Reminder') : tx('New reminder')} onClose={() => setEdit(null)} bodyClass="co-st-sheet"
          footer={<>
            {edit.id && <button type="button" className="co-btn co-btn-q co-btn-sm" onClick={() => remove(edit)}>{tx('Delete')}</button>}
            <button type="button" className="co-btn co-btn-q co-btn-sm co-st-push" onClick={() => setEdit(null)}>{tx('Cancel')}</button>
            <button type="button" className="co-btn co-btn-t co-btn-sm" onClick={save} disabled={busy || !edit.title.trim() || !edit.text.trim()}>{tx('Save')}</button>
          </>}>
          <div className="co-st-field"><label htmlFor="tg-r-name">{tx('Name — for you, not for them')}</label>
            <input id="tg-r-name" className="input" value={edit.title} placeholder={tx('e.g. Is the week planned?')} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          </div>
          <div className="co-st-field"><label htmlFor="tg-r-text">{tx('The message')}</label>
            <textarea id="tg-r-text" className="input" rows={4} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
          </div>
          <div className="co-st-field"><label htmlFor="tg-r-who">{tx('Who hears it')}</label>
            <select id="tg-r-who" className="select" value={edit.audience} onChange={(e) => setEdit({ ...edit, audience: e.target.value })}>
              {AUDIENCES.map(([k, l]) => <option key={k} value={k}>{tx(l)}</option>)}
              {!AUDIENCES.some(([k]) => k === edit.audience) && <option value={edit.audience}>{whoReads(edit.audience)}</option>}
            </select>
          </div>
          <div className="co-st-card">
            <SwitchRow tile={false} label={tx('Arrives by itself')} on={edit.enabled} onChange={(v) => setEdit({ ...edit, enabled: v })} />
          </div>
          {edit.enabled && (
            <div className="co-st-field">
              <span className="co-st-fl" id="tg-r-days">{tx('When it arrives by itself')}</span>
              <div className="co-st-seg" role="group" aria-labelledby="tg-r-days">
                {WEEK.map((w) => (
                  <button key={w.d} type="button" aria-pressed={edit.days.includes(w.d)}
                    onClick={() => setEdit({ ...edit, days: edit.days.includes(w.d) ? edit.days.filter((x) => x !== w.d) : [...edit.days, w.d] })}>{tx(w.l)}</button>
                ))}
              </div>
              <select className="select" aria-label={tx('at')} value={edit.hour} style={{ maxWidth: 120 }} onChange={(e) => setEdit({ ...edit, hour: Number(e.target.value) })}>
                {[...Array(24)].map((_, h) => <option key={h} value={h}>{hh(h)}</option>)}
              </select>
            </div>
          )}
        </Modal>
      )}

      {pick && (
        <Modal title={tx('Send: {name}', { name: pick.tpl.title })} onClose={() => setPick(null)} bodyClass="co-st-sheet"
          footer={<>
            <button type="button" className="co-btn co-btn-q co-btn-sm" onClick={() => setPick(null)}>{tx('Cancel')}</button>
            <button type="button" className="co-btn co-btn-t co-btn-sm" disabled={busy || pick.ids.length === 0} onClick={sendNow}>
              <Send size={16} aria-hidden="true" />{tx('Send to {n}', { n: pick.ids.length })}
            </button>
          </>}>
          <div className="co-st-card">
            {linked.map((m) => (
              <SwitchRow key={m.id} tile={false} label={m.name} on={pick.ids.includes(m.id)}
                onChange={(v) => setPick({ ...pick, ids: v ? [...pick.ids, m.id] : pick.ids.filter((x) => x !== m.id) })} />
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
