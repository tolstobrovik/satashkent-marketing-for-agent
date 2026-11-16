// Advanced settings → one channel (12 Nov 2026, design-variants/admin-tz.md
// §2.1): /admin/channels/:key and /admin/channels/new. What was the Admin
// panel's channel window (Admin.jsx, ChannelsTab) is a page in the TaskEdit
// manner: the fields on cards, "{n} changes · Cancel · Save" stuck to the
// bottom of the column, and, apart below, "Delete channel" behind a sheet that
// says what the server does to its tasks. The same calls and the same body as
// the old save(); the server is unchanged.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { api } from '../../lib/api.js'
import { toast } from '../../lib/toast.js'
import { tr as tx } from '../../lib/i18n.jsx'
import { useChannels } from '../../lib/channels.jsx'
import { useAuth } from '../../lib/auth.jsx'
import { CHANNEL_ICONS } from '../../lib/constants.js'
import Modal from '../../components/Modal.jsx'
import PersonPick from '../../components/PersonPick.jsx'
import { Group, Page, SwitchRow, remember } from './parts.jsx'

const LIST = '/admin/channels'

// The form as the old window held it; `same` reads two of them the way the
// server will store them, so a space typed and taken away is not a change.
const formOf = (c, me) => (c
  ? { label: c.label || '', icon: c.icon || 'star', format: c.format || 'social', video: !!c.video, head_id: c.head_id ?? null, drive_url: c.drive_url || '', daily_ad_cap: c.daily_ad_cap || 0 }
  : { label: '', icon: 'instagram', format: 'social', video: false, head_id: me?.id ?? null, drive_url: '', daily_ad_cap: 0 })
const FIELDS = {
  label: (v) => String(v ?? '').trim(),
  icon: (v) => v,
  format: (v) => v || 'social',
  video: (v) => !!v,
  head_id: (v) => (v == null || v === '' ? null : String(v)),
  drive_url: (v) => String(v ?? '').trim(),
  daily_ad_cap: (v) => Number(v) || 0,
}
const changed = (a, b) => (a && b ? Object.keys(FIELDS).filter((k) => FIELDS[k](a[k]) !== FIELDS[k](b[k])).length : 0)
// The body the old save() sent, word for word.
const bodyOf = (f) => ({ label: f.label.trim(), icon: f.icon, head_id: f.head_id ?? null, drive_url: (f.drive_url ?? '').trim(), daily_ad_cap: Number(f.daily_ad_cap) || 0, format: f.format ?? 'social', video: !!f.video })

// Arrow keys walk a radio group and choose as they go (WAI-ARIA radio group).
function arrows(e, keys, current, choose) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
  const edge = e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : null
  if (!step && edge == null) return
  e.preventDefault()
  const at = Math.max(0, keys.indexOf(current))
  const next = edge != null ? edge : (at + step + keys.length) % keys.length
  choose(keys[next])
  e.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus()
}

export default function Channel() {
  const { key } = useParams()
  const isNew = key === 'new'
  const { channels, reload, failed, retry } = useChannels()
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const ch = isNew ? null : channels.find((c) => c.key === key) || null
  const [base, setBase] = useState(null)
  const [form, setForm] = useState(null)
  const [formats, setFormats] = useState(null)
  const [team, setTeam] = useState([])
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const leaving = useRef(false)
  const made = useRef(null)
  const ids = { name: useId(), icon: useId(), owner: useId(), drive: useId(), ads: useId() }

  useEffect(() => {
    api.get('/fields').then((f) => setFormats(f?.channel_formats || {})).catch((e) => toast(e.message, 'err'))
    api.get('/users').then((u) => setTeam(Array.isArray(u) ? u : [])).catch(() => {})
  }, [])
  // The form is filled once a channel: a reload behind it (another tab, the
  // menu's drag) never wipes what is being typed.
  useEffect(() => {
    if (made.current === key) return
    if (!isNew && !ch) return
    made.current = key
    leaving.current = false   // a new channel's own page after a refused follow-up: the guard is on again
    const f = formOf(ch, me)
    setBase(f); setForm(f)
  }, [key, isNew, ch, me])

  const n = changed(form, base)
  const named = !!form?.label.trim()
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Leaving with changes not saved asks first: a link anywhere on the page
  // (the way back, the menu) and closing the tab. Cancel is the way to drop them.
  useEffect(() => {
    if (!n) return undefined
    const unload = (e) => { if (leaving.current) return; e.preventDefault(); e.returnValue = '' }
    const click = (e) => {
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target.closest?.('a[href]')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      if (!window.confirm(tx('Leave without saving what you entered?'))) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true) }
  }, [n])

  const away = useCallback((to = LIST) => { leaving.current = true; navigate(to) }, [navigate])

  const save = async () => {
    if (!named || busy) return
    setBusy(true)
    const body = bodyOf(form)
    try {
      if (ch) {
        const prev = bodyOf(base)
        await api.patch(`/channels/${ch.id}`, body)
        reload()
        remember(`ch-${ch.key}`)
        toast(tx('Saved'), 'ok', {
          label: tx('Undo'),
          onClick: () => api.patch(`/channels/${ch.id}`, prev).then(() => { reload(); toast(tx('Put back'), 'ok') }).catch((e) => toast(e.message, 'err')),
        })
        away()
        return
      }
      // POST takes the name, icon, owner, kind and the video switch; the
      // folder and the ads a day are the channel's PATCH (server/routes/channels.js),
      // so they follow at once rather than being dropped.
      const out = await api.post('/channels', body)
      if (body.drive_url || body.daily_ad_cap) {
        try { await api.patch(`/channels/${out.id}`, { drive_url: body.drive_url, daily_ad_cap: body.daily_ad_cap }) } catch (e) {
          reload(); toast(e.message, 'err')
          made.current = null; leaving.current = true
          navigate(`${LIST}/${encodeURIComponent(out.key)}`, { replace: true })
          return
        }
      }
      reload()
      remember(`ch-${out.key}`)
      toast(tx('Channel «{name}» added', { name: out.label }), 'ok')
      away()
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  const del = async () => {
    if (!ch || busy) return
    setBusy(true)
    try {
      await api.del(`/channels/${ch.id}`)
      setAsking(false)
      reload()
      remember('channels')
      toast(tx('Channel «{name}» deleted', { name: ch.label }), 'ok')
      leaving.current = true
      navigate(LIST, { replace: true })
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  const kinds = useMemo(() => Object.entries(formats || {}), [formats])
  const icons = Object.keys(CHANNEL_ICONS)

  // An address no channel answers to (deleted, or a key typed by hand).
  if (!isNew && !ch && channels.length) {
    return (
      <Page title={tx('Channels')} back={LIST}>
        <Group><p className="co-st-empty">{tx('No channel at this address. It may have been deleted.')}</p></Group>
      </Page>
    )
  }
  // The list did not arrive yet (the server was away): said, not a blank page.
  if (!isNew && !ch && failed) {
    return (
      <Page title={tx('Channels')} back={LIST}>
        <Group>
          <p className="co-st-empty" role="status">
            {tx('Channels did not load. Retrying…')}{' '}
            <button type="button" className="co-link" onClick={retry}>{tx('Retry now')}</button>
          </p>
        </Group>
      </Page>
    )
  }
  if (!form) return <div className="co co-st" aria-busy="true" />

  return (
    <Page title={isNew ? tx('New channel') : ch.label} back={LIST}>
      <form className="co-st-form" onSubmit={(e) => { e.preventDefault(); save() }} noValidate>
        <Group>
          <div className="co-st-field">
            <label htmlFor={ids.name}>{tx('Name')}</label>
            <input id={ids.name} className="input" value={form.label} maxLength={80} autoComplete="off"
              placeholder={tx('e.g. Instagram Kids')} aria-invalid={!named && n > 0 ? true : undefined}
              onChange={(e) => set('label', e.target.value)} />
          </div>
          <div className="co-st-field">
            <span className="co-st-fl" id={ids.icon}>{tx('Icon')}</span>
            <div className="co-st-icons" role="radiogroup" aria-labelledby={ids.icon}
              onKeyDown={(e) => arrows(e, icons, form.icon, (v) => set('icon', v))}>
              {icons.map((name, i) => {
                const Icon = CHANNEL_ICONS[name]
                const on = form.icon === name
                const first = !icons.includes(form.icon) && i === 0
                return (
                  <button key={name} type="button" role="radio" aria-checked={on} aria-label={name} title={name}
                    tabIndex={on || first ? 0 : -1} onClick={() => set('icon', name)}>
                    <Icon size={18} aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          </div>
        </Group>

        <Group title={tx('Kind')}>
          <div role="radiogroup" aria-label={tx('Kind')}
            onKeyDown={(e) => arrows(e, kinds.map(([k]) => k), form.format, (v) => set('format', v))}>
            {kinds.map(([k, f], i) => {
              const on = form.format === k
              const first = !kinds.some(([x]) => x === form.format) && i === 0
              return (
                <button key={k} type="button" role="radio" aria-checked={on} tabIndex={on || first ? 0 : -1}
                  className="co-st-row co-st-kind" onClick={() => set('format', k)}>
                  <span className="co-st-t">{tx(f.label)}<small>{tx(f.hint)}</small></span>
                  <Check className="co-st-ok" size={18} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </Group>

        <Group>
          <SwitchRow tile={false} label={tx('Its videos can also go to TikTok and Shorts')}
            sub={form.video
              ? tx('A video here gets two ticks, TikTok and Shorts. Ticked, publishing it gives somebody a task to post it there too.')
              : tx('Off: a video here goes out on this channel only.')}
            on={form.video} onChange={(v) => set('video', v)} />
        </Group>

        <Group>
          <div className="co-st-field">
            <label htmlFor={ids.owner}>{tx('Owner')}</label>
            <PersonPick id={ids.owner} value={form.head_id} first={team} label={tx('Owner')} empty={tx('Nobody yet')}
              onChange={(v) => set('head_id', v)} />
          </div>
          <div className="co-st-field">
            <label htmlFor={ids.drive}>{tx('Shared Drive folder')} <small>{tx('(optional)')}</small></label>
            <input id={ids.drive} className="input" type="url" inputMode="url" autoComplete="off" spellCheck={false}
              value={form.drive_url} placeholder="https://drive.google.com/drive/folders/…" aria-describedby={`${ids.drive}-h`}
              onChange={(e) => set('drive_url', e.target.value)} />
            <small id={`${ids.drive}-h`}>{form.drive_url.trim()
              ? tx('Set. The crew now name the file — “1-3”, “reel 14” — instead of pasting this address on every task. Naming one is still required.')
              : tx('With a folder here, the crew name the file instead of pasting a full link every time. Without one they paste the whole address, as now.')}</small>
          </div>
          <div className="co-st-field">
            <label htmlFor={ids.ads}>{tx('Video ads a day')}</label>
            <input id={ids.ads} className="input co-st-num" type="number" inputMode="numeric" min="0" max="50" step="1"
              value={form.daily_ad_cap} aria-describedby={`${ids.ads}-h`} onChange={(e) => set('daily_ad_cap', e.target.value)} />
            <small id={`${ids.ads}-h`}>{Number(form.daily_ad_cap) > 0
              ? tx('At most {n} Target pieces going out on one day for this channel — a further one is refused while it can still be moved.', { n: Number(form.daily_ad_cap) })
              : tx('No limit, which is what every channel was before this existed. Set a number and a day that is already full refuses the next ad instead of quietly running it.')}</small>
          </div>
        </Group>

        <div className="co-st-foot">
          <span className="co-st-n" role="status" aria-live="polite">
            {!named ? tx('Give the channel a name first.') : n ? tx('{n} changes', { n }) : tx('Nothing changed yet')}
          </span>
          <button type="button" className="co-btn co-btn-q co-btn-sm" onClick={() => away()} disabled={busy}>{tx('Cancel')}</button>
          <button type="submit" className="co-btn co-btn-p co-btn-sm" disabled={busy || !named || (!isNew && !n)}>
            {busy ? tx('Saving…') : isNew ? tx('Add channel') : tx('Save')}
          </button>
        </div>
      </form>

      {!isNew && (
        <div className="co-st-apart">
          <button type="button" className="co-btn co-btn-q co-btn-sm co-st-danger" aria-haspopup="dialog" onClick={() => setAsking(true)} disabled={busy}>
            {tx('Delete channel')}
          </button>
        </div>
      )}

      {asking && ch && (
        <Modal title={tx('Delete channel')} onClose={() => !busy && setAsking(false)}
          footer={<>
            <button type="button" className="co-btn co-btn-q" onClick={() => setAsking(false)} disabled={busy}>{tx('Cancel')}</button>
            <button type="button" className="co-btn co-btn-t co-st-danger" onClick={del} disabled={busy}>{busy ? tx('Deleting…') : tx('Delete channel')}</button>
          </>}>
          <p className="co-st-ask">{tx('Delete «{name}»? Its tasks and numbers are removed too. This can’t be undone.', { name: ch.label })}</p>
          <p className="co-st-ask co-st-ask-sub">{tx('A task that is also on another channel stays there.')}</p>
        </Modal>
      )}
    </Page>
  )
}
