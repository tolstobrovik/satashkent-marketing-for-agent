// Instagram (/admin/instagram, 12 Nov 2026 — design-variants/admin-tz.md §0
// q12, §2.1): only what is needed. A row per Instagram channel says whether it
// is connected; pressing it opens a sheet with the access token. The pieces
// Instagram has no numbers for are one row that opens their list, with
// "Read now". The routes and the reasons are components/InstagramSettings.jsx's
// (server/instagram.js keeps the token in a file of its own, never sends it back).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Eye, EyeOff, FileQuestion, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api.js'
import { toast } from '../../lib/toast.js'
import { tr as tx } from '../../lib/i18n.jsx'
import { iconFor, dateLabel } from '../../lib/constants.js'
import { ago } from '../../lib/ago.js'
import { useChannels } from '../../lib/channels.jsx'
import Modal from '../../components/Modal.jsx'
import { REASONS } from '../../components/InstagramSettings.jsx'
import { Group, Help, Page } from './parts.jsx'

export default function InstagramPage() {
  const { byKey } = useChannels()
  const [st, setSt] = useState(null)
  const [un, setUn] = useState(null)
  const [acc, setAcc] = useState(null) // the channel whose sheet is open
  const [list, setList] = useState(false)
  const poll = useRef(null)
  const load = useCallback(() => api.get('/instagram').then((s) => { setSt(s); return s }).catch((e) => { toast(e.message, 'err'); return null }), [])
  const loadUn = useCallback(() => api.get('/instagram/unmatched').then(setUn).catch(() => setUn({ channels: [] })), [])
  useEffect(() => {
    load(); loadUn()
    return () => clearTimeout(poll.current)
  }, [load, loadUn])

  // While a run is going: every four seconds, and the list again when it ends.
  const watch = () => {
    clearTimeout(poll.current)
    poll.current = setTimeout(async () => {
      const s = await load()
      if (s?.running) watch()
      else loadUn()
    }, 4000)
  }
  const readNow = async () => {
    try { await api.post('/instagram/refresh', {}); setSt((s) => ({ ...s, running: true })); watch() } catch (e) { toast(e.message, 'err') }
  }

  const rows = (un?.channels || []).flatMap((g) => g.rows.map((r) => ({ ...r, label: g.label })))
  const any = !!st?.channels.some((c) => c.connected)
  // Why a piece has no numbers. "Not read yet" is not said on every row: Read
  // now in the footer says it, and an account not connected says so on its row.
  const why = (r) => (r.state === 'pending' ? null : (REASONS[r.state] || REASONS.error)())
  const open = acc && st?.channels.find((c) => c.key === acc)

  return (
    <Page title={tx('Instagram')} sub={tx('Views and skip rates arrive from Instagram once a day.')}
      action={<Help label={tx('Where to get a token')}><HowTo /></Help>}>
      <div className="co-st-ig">
      {!st ? <div aria-busy="true" /> : (
        <>
          <Group>
            {st.channels.length === 0 && <p className="co-st-empty">{tx('No Instagram channel on the board yet.')}</p>}
            {st.channels.map((c) => {
              const Icon = iconFor(byKey[c.key]?.icon)
              const good = c.connected && !c.error
              return (
                <button key={c.key} type="button" className="co-st-row" aria-haspopup="dialog" onClick={() => setAcc(c.key)}>
                  <span className="co-st-tile" aria-hidden="true"><Icon size={18} /></span>
                  <span className="co-st-t">{c.label}</span>
                  {good
                    ? <span className="co-st-v on">{tx('Connected')}<Check size={16} aria-hidden="true" /></span>
                    : <span className="co-st-v">{c.connected ? tx('Not answering') : tx('Not connected')}</span>}
                  <ChevronRight className="co-st-chev" size={16} aria-hidden="true" />
                </button>
              )
            })}
          </Group>
          <Group>
            <button type="button" className="co-st-row" aria-haspopup="dialog" onClick={() => setList(true)} disabled={!un}>
              <span className="co-st-tile" aria-hidden="true"><FileQuestion size={18} /></span>
              <span className="co-st-t">{tx('Pieces without numbers')}</span>
              <span className="co-st-v">{un ? (rows.length || tx('None')) : ''}</span>
              <ChevronRight className="co-st-chev" size={16} aria-hidden="true" />
            </button>
          </Group>
        </>
      )}

      {open && <Account c={open} onClose={() => setAcc(null)} onSaved={(s) => { setSt(s); loadUn() }} />}

      {list && (
        <Modal title={tx('Pieces without numbers')} onClose={() => setList(false)} bodyClass="co-st-sheet"
          footer={any ? <>
            {st.last && !st.running && <span className="co-st-n">{tx('Last read {when}', { when: ago(st.last.at) })}</span>}
            <button type="button" className="co-btn co-btn-t co-btn-sm" onClick={readNow} disabled={st.running || !!st.paused_until}>
              <RefreshCw size={16} aria-hidden="true" />{st.running ? tx('Reading…') : tx('Read now')}
            </button>
          </> : null}>
          {st.paused_until && <p className="co-st-ig-who" role="status">{tx('Instagram asked us to slow down — reading again tomorrow')}</p>}
          {rows.length === 0
            ? <p className="co-st-empty">{tx('Every published Instagram piece of this month and the last has its numbers.')}</p>
            : (
              <div className="co-st-card">
                {rows.map((r) => (
                  <Link key={r.id} className="co-st-row co-st-piece" to={`/brief?task=${r.id}`}>
                    <span className="co-st-t">
                      <span className="co-st-1l" title={r.title}>{r.title}</span>
                      <small>
                        {[r.label, r.day && dateLabel(r.day), why(r)].filter(Boolean).join(' · ')}
                        {r.state === 'twin' && r.twins?.length > 0 && `: ${r.twins.map((id) => `#${id}`).join(', ')}`}
                        {r.state === 'error' && r.detail ? `: ${r.detail}` : ''}
                      </small>
                    </span>
                  </Link>
                ))}
              </div>
            )}
        </Modal>
      )}
      </div>
    </Page>
  )
}

// The four steps of InstagramSettings.jsx, in plain words.
function HowTo() {
  return (
    <ol>
      <li>{tx('The account must be a Business or Creator account, linked to a Facebook Page.')}</li>
      <li>{tx('In Meta for Developers, open the team’s app → Graph API Explorer, choose the Page and make a Page token.')}</li>
      <li>{tx('Tick only these four, all read-only:')} <code>instagram_basic</code>, <code>instagram_manage_insights</code>, <code>pages_read_engagement</code>, <code>pages_show_list</code>.</li>
      <li>{tx('Make it long-lived: Access Token Debugger → Extend. A token that starts with IG works too.')}</li>
    </ol>
  )
}

// One account's sheet: the token (hidden, with show/hide), the account only
// when the server said the token reaches several, Save, and Disconnect.
function Account({ c, onClose, onSaved }) {
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  const [account, setAccount] = useState('')
  const [several, setSeveral] = useState('') // the server's words when the token reaches several accounts
  const [busy, setBusy] = useState(false)
  const accRef = useRef(null)
  // A token from the server's own settings is changed there, not here.
  const editable = !c.connected || c.from === 'settings'
  const fid = `ig-form-${c.key}`
  const save = async (e) => {
    e.preventDefault()
    if (token.trim().length < 20) return
    setBusy(true)
    try {
      const s = await api.put(`/instagram/${c.key}`, { token: token.trim(), account: account.trim() })
      toast(tx('Connected: {name}', { name: c.label }), 'ok')
      onSaved(s); onClose()
    } catch (er) {
      // "This token reaches @a, @b — type which one beside it": ask which.
      // Said once, under the box it asks for, and the keyboard goes there.
      if (er.status === 400 && /@\w/.test(er.message)) {
        setSeveral(er.message)
        requestAnimationFrame(() => accRef.current?.focus())
      } else toast(er.message, 'err')
    } finally { setBusy(false) }
  }
  const forget = async () => {
    if (!confirm(tx('Disconnect {name}? The views already read stay; new ones wait until a token is pasted again.', { name: c.label }))) return
    setBusy(true)
    try { onSaved(await api.del(`/instagram/${c.key}`)); toast(tx('Disconnected: {name}', { name: c.label }), 'ok'); onClose() } catch (er) { toast(er.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title={c.label} onClose={onClose} bodyClass="co-st-sheet"
      footer={editable ? <>
        {c.connected && <button type="button" className="co-btn co-btn-q co-btn-sm" onClick={forget} disabled={busy}>{tx('Disconnect')}</button>}
        <button type="submit" form={fid} className="co-btn co-btn-p co-btn-sm co-st-push" disabled={busy || token.trim().length < 20}>{busy ? tx('Checking…') : tx('Save')}</button>
      </> : null}>
      {c.connected && (
        <p className="co-st-ig-who">
          {c.username ? `@${c.username}` : tx('Connected')}
          {c.from === 'environment' ? ` · ${tx('from the server’s settings')}` : ''}
        </p>
      )}
      {c.error && <p className="co-st-err">{tx(c.error)}</p>}
      {c.stopped && <p className="co-st-ig-who">{tx('This token is not used again until a new one is pasted.')}</p>}
      {editable && (
        <form id={fid} onSubmit={save}>
          <div className="co-st-field">
            <label htmlFor={`${fid}-t`}>{c.connected ? tx('New access token') : tx('Access token')}</label>
            <span className="co-st-pw">
              <input id={`${fid}-t`} className="input" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} autoCapitalize="off" autoCorrect="off"
                value={token} onChange={(e) => setToken(e.target.value)} />
              <button type="button" className="co-st-ib" aria-label={show ? tx('Hide the token') : tx('Show the token')} onClick={() => setShow((v) => !v)}>
                {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </span>
          </div>
          {(several || account) && (
            <div className="co-st-field">
              <label htmlFor={`${fid}-a`}>{tx('Account')}</label>
              <input id={`${fid}-a`} ref={accRef} className="input" value={account} placeholder={tx('@username')} autoComplete="off" spellCheck={false} autoCapitalize="off"
                onChange={(e) => setAccount(e.target.value)} aria-describedby={several ? `${fid}-ah` : undefined} />
              {several && <small id={`${fid}-ah`}>{several}</small>}
            </div>
          )}
        </form>
      )}
    </Modal>
  )
}
