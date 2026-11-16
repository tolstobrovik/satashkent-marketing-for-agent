import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Instagram, CheckCircle2, AlertCircle, RefreshCw, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { tr as tx } from '../lib/i18n.jsx'
import { dateLabel } from '../lib/constants.js'
import { ago } from '../lib/ago.js'
import Fold from './Fold.jsx'

// Instagram (server/instagram.js): one access token per Instagram channel,
// pasted here by an admin of the whole board. The server keeps it in a file of
// its own — never in the database, never sent back (only its last four
// characters) — and reads every published piece's views, and a reel's skip
// rate, once a day. "Read now" does it at once. Under it: the published pieces
// Instagram has no numbers for, and why.
export const REASONS = {
  no_link: () => tx('No Instagram link on the card'),
  not_instagram: () => tx('The link is not an Instagram post'),
  story: () => tx('A story — Instagram does not give its views, so they are typed by hand'),
  twin: () => tx('This link is on more than one card'),
  foreign: () => tx('Posted from an Instagram account we cannot read — a collab, or another account'),
  no_token: () => tx('This Instagram account is not connected yet'),
  error: () => tx('Instagram did not give the numbers'),
  pending: () => tx('Not read yet — press Read now'),
}

export default function InstagramSettings() {
  const [st, setSt] = useState(null)
  const [msg, setMsg] = useState('')
  const [un, setUn] = useState(null)
  const poll = useRef(null)
  const load = () => api.get('/instagram').then((s) => { setSt(s); return s }).catch((e) => setMsg(e.message))
  const loadUn = () => api.get('/instagram/unmatched').then(setUn).catch(() => setUn({ channels: [] }))
  useEffect(() => {
    load(); loadUn()
    return () => clearTimeout(poll.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    setMsg('')
    try { await api.post('/instagram/refresh', {}); setSt((s) => ({ ...s, running: true })); watch() } catch (e) { setMsg(e.message) }
  }

  if (!st) return <div className="card card-pad"><div className="stat-sub">{msg || tx('Checking Instagram…')}</div></div>
  const any = st.channels.some((c) => c.connected)
  const last = st.last
  return (
    <>
      <div className="section-head"><h2>{tx('Instagram')}</h2></div>
      <div className="card card-pad gd-card">
        <div className="stat-sub">{tx('Paste each account’s access token. Every published piece then gets its views, and a reel its skip rate, from Instagram once a day — nobody types them in.')}</div>
        <div className="stat-sub">{tx('The tokens only read. Nothing is ever posted, commented, sent or changed on the accounts, and Instagram is asked gently: one question a second, only about pieces whose numbers can still change, and the reading stops at once if Instagram asks to slow down.')}</div>
        {st.paused_until && <div className="form-error">{tx('Instagram asked us to slow down — reading again tomorrow')}</div>}
        {st.channels.length === 0 && <div className="stat-sub">{tx('No Instagram channel on the board yet.')}</div>}
        {st.channels.map((c) => <Account key={c.key} c={c} onSaved={(s) => { setSt(s); loadUn() }} />)}
        {any && (
          <div className="gd-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={readNow} disabled={st.running}>
              <RefreshCw size={14} aria-hidden="true" /> {st.running ? tx('Reading…') : tx('Read now')}
            </button>
            {last && !st.running && (
              <span className="stat-sub">
                {tx('Last read {when}: {read} pieces read, {unmatched} without numbers', { when: ago(last.at), read: last.read, unmatched: last.unmatched })}
                {last.note && !st.paused_until ? ` · ${tx(last.note)}` : ''}
              </span>
            )}
          </div>
        )}
        <Fold id="ig-token-howto" title={tx('Where to get a token')} shut>
          <ol className="gd-steps">
            <li>{tx('Each account must be a Business or Creator account, connected to a Facebook Page.')}</li>
            <li>{tx('In Meta for Developers, the team’s app → Graph API Explorer: choose the Page, tick')} <code>{'instagram_basic'}</code>, <code>{'instagram_manage_insights'}</code>, <code>{'pages_read_engagement'}</code>, <code>{'pages_show_list'}</code>, {tx('and make a Page token.')}</li>
            <li>{tx('Tick only those four, all of them read permissions. Never give the token a permission that publishes, comments, sends messages or runs ads — the dashboard does not need one.')}</li>
            <li>{tx('Make it long-lived (Access Token Debugger → Extend), so it does not stop in an hour. An Instagram Login token (it starts with IG) works too.')}</li>
          </ol>
        </Fold>
        {msg && <div className="form-error">{msg}</div>}
      </div>
      <Unmatched un={un} />
    </>
  )
}

function Account({ c, onSaved }) {
  const [open, setOpen] = useState(!c.connected)
  const [token, setToken] = useState('')
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (!c.connected) setOpen(true) }, [c.connected])
  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const s = await api.put(`/instagram/${c.key}`, { token: token.trim(), account: account.trim() })
      setToken(''); setAccount(''); setOpen(false); onSaved(s)
    } catch (er) { setErr(er.message) } finally { setBusy(false) }
  }
  const forget = async () => {
    if (!confirm(tx('Disconnect {name}? The views already read stay; new ones wait until a token is pasted again.', { name: c.label }))) return
    setBusy(true); setErr('')
    try { onSaved(await api.del(`/instagram/${c.key}`)) } catch (er) { setErr(er.message) } finally { setBusy(false) }
  }
  const good = c.connected && !c.error
  const Mark = good ? CheckCircle2 : c.error ? AlertCircle : Instagram
  const who = c.username ? `@${c.username}` : tx('Connected')
  const how = [
    c.via === 'instagram' ? tx('Instagram Login') : tx('Facebook Page'),
    c.tail,
    c.saved_at && dateLabel(String(c.saved_at).slice(0, 10)),
    c.from === 'environment' && tx('from the server’s settings'),
  ].filter(Boolean).join(' · ')
  return (
    <div className="ig-acc" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, marginTop: 12 }}>
      <div className={'gd-state' + (good ? ' on' : '')}>
        <Mark size={18} aria-hidden="true" />
        <span>
          <b>{c.label}</b>{' · '}
          {c.connected && who}
          {c.connected && <span className="stat-sub">{` · ${how}`}</span>}
          {!c.connected && tx('Not connected yet.')}
        </span>
      </div>
      {c.error && <div className="form-error">{tx(c.error)}</div>}
      {c.stopped && <div className="stat-sub">{tx('This token is not used again until a new one is pasted.')}</div>}
      {c.connected && c.skip === 'no' && <div className="stat-sub">{tx('Instagram does not give this account’s skip rate through its API, so the skip rate stays typed by hand.')}</div>}
      {c.connected && !open && c.from === 'settings' && (
        <div className="gd-row">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} disabled={busy}>{tx('Paste a new token')}</button>
          <button type="button" className="btn btn-sm" onClick={forget} disabled={busy}><Trash2 size={14} aria-hidden="true" /> {tx('Disconnect')}</button>
        </div>
      )}
      {open && (
        <form onSubmit={save} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <input className="input" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)}
            placeholder={tx('Access token')} aria-label={tx('Access token for {name}', { name: c.label })} style={{ flex: '2 1 260px', minWidth: 0, fontFamily: 'monospace' }} />
          <input className="input" value={account} onChange={(e) => setAccount(e.target.value)}
            placeholder={tx('@username — only if the token reaches several accounts')} aria-label={tx('Which account')} style={{ flex: '1 1 200px', minWidth: 0 }} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || token.trim().length < 20}>{busy ? tx('Checking…') : tx('Save')}</button>
          {c.connected && <button type="button" className="btn btn-sm" onClick={() => { setOpen(false); setErr('') }} disabled={busy}>{tx('Cancel')}</button>}
        </form>
      )}
      {err && <div className="form-error">{err}</div>}
    </div>
  )
}

// The published pieces of this month and the last with no numbers from
// Instagram, per channel, each with the one thing to fix.
function Unmatched({ un }) {
  if (!un) return null
  const groups = un.channels.filter((c) => c.rows.length > 0)
  return (
    <div className="card card-pad" style={{ marginTop: 12 }}>
      <h3 style={{ margin: 0 }}>{tx('Unmatched')}</h3>
      {groups.length === 0
        ? <div className="stat-sub">{tx('Every published Instagram piece of this month and the last has its numbers.')}</div>
        : <div className="stat-sub">{tx('Published, and Instagram has no numbers for them. Fix the link on the card; the next read picks it up.')}</div>}
      {groups.map((g) => (
        <section key={g.key} style={{ marginTop: 12 }}>
          <h4 style={{ margin: '0 0 6px' }}>{g.label}</h4>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.rows.map((r) => (
              <li key={r.id}>
                <Link to={`/brief?task=${r.id}`}><b>{r.title}</b> #{r.id}</Link>
                <span className="stat-sub">{' · '}{[r.maker, dateLabel(r.day)].filter(Boolean).join(' · ')}</span>
                <div className="stat-sub">
                  {(REASONS[r.state] || REASONS.error)()}
                  {r.state === 'twin' && r.twins.length > 0 && <>{': '}{r.twins.map((id, i) => <span key={id}>{i ? ', ' : ''}<Link to={`/brief?task=${id}`}>#{id}</Link></span>)}</>}
                  {r.state === 'error' && r.detail ? `: ${r.detail}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
