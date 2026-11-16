// A promised day while the piece is being made (mayChange → 'ask'): the same place the strip opens in, "Ask to move ·
// reason" — POST /content/:id/date-requests. The server moves the holder's own day at once and files the rest for an
// admin. (Moved from the edit form's AskDay.)
import { useEffect, useId, useRef, useState } from 'react'
import DayPick from '../DayPick.jsx'
import { dayShort } from '../CoachParts.jsx'
import { api } from '../../lib/api.js'
import { isSentence } from '../../lib/text.js'
import { toast } from '../../lib/toast.js'
import { tr as tx } from '../../lib/i18n.jsx'

export default function AskDay({ t, field, today, label, onMoved, onClose }) {
  const [form, setForm] = useState({ to: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const uid = useId()
  const box = useRef(null)
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(form.to) && form.to !== t[field] && isSentence(form.reason)
  useEffect(() => { box.current?.querySelector('.co-dp-b')?.focus({ preventScroll: true }) }, [])
  const send = async () => {
    if (!ok || busy) return
    setBusy(true); setErr('')
    try {
      const out = await api.post(`/content/${t.id}/date-requests`, { field, to_date: form.to, reason: form.reason.trim() })
      if (out?.task) { toast(tx('Day moved to {day} — the others on it are told', { day: dayShort(form.to) })); onMoved?.(out.task) }
      else { toast(tx('Asked — an admin will answer, and you will hear it')); onMoved?.(null) }
      onClose?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div ref={box} className="tw-askmove" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }}>
      <DayPick value={form.to} min={today} label={tx('{label}: new day', { label })} placeholder={tx('New day')} onChange={(d) => setForm({ ...form, to: d || '' })} disabled={busy} />
      <input id={`${uid}-why`} className="input" value={form.reason} placeholder={tx('Why, in one line')} aria-label={tx('Why, in one line')} disabled={busy}
        onChange={(e) => setForm({ ...form, reason: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }} />
      {err && <p className="tw-f-err" role="alert">{err}</p>}
      <div className="tw-askmove-b">
        <button type="button" className="co-btn co-btn-t co-btn-sm" disabled={!ok || busy} onClick={send}>{tx('Ask to move')}</button>
        <button type="button" className="co-btn co-btn-q co-btn-sm" disabled={busy} onClick={onClose}>{tx('Cancel')}</button>
      </div>
    </div>
  )
}
