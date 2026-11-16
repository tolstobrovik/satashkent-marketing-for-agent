// Advanced settings (12 Nov 2026, the owner's decisions in
// design-variants/admin-tz.md §0): one list, no tabs; a row a setting, and a
// press opens that setting's own page under /admin/…, with a way back. What
// was the Admin panel's four groups of long sections (pages/Admin.jsx) is
// this list now; the server's routes are the same.
import { Suspense, lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { Activity, Archive, Award, Banknote, BellRing, Check, ChevronRight, FileText, HardDrive, History, Instagram, LayoutGrid, Network, Send, Users } from 'lucide-react'
import { api } from '../lib/api.js'
import { toast } from '../lib/toast.js'
import { tr as tx } from '../lib/i18n.jsx'
import { useChannels } from '../lib/channels.jsx'
import { useAuth } from '../lib/auth.jsx'
import { lastBoardChannel } from '../lib/boardChannel.js'
import Modal from '../components/Modal.jsx'
import { Group, Help, Line, Page, Row, SwitchRow, useFields } from './settings/parts.jsx'
import '../styles-settings.css'

const Channels = lazy(() => import('./settings/Channels.jsx'))
const Channel = lazy(() => import('./settings/Channel.jsx'))
const Brief = lazy(() => import('./settings/Brief.jsx'))
const Roles = lazy(() => import('./settings/Roles.jsx'))
const Telegram = lazy(() => import('./settings/Telegram.jsx'))
const Structure = lazy(() => import('./settings/Structure.jsx'))
const Pay = lazy(() => import('./settings/Pay.jsx'))
const InstagramPage = lazy(() => import('./settings/Instagram.jsx'))
const Changes = lazy(() => import('./settings/Changes.jsx'))
const Usage = lazy(() => import('./settings/Usage.jsx'))

// Every address the Admin panel ever had lands on the page that holds it now.
const OLD = {
  board: '/admin', settings: '/admin/brief', channels: '/admin/channels', pipeline: '/admin', notice: '/admin',
  team: '/admin/roles', pages: '/admin/roles', telegram: '/admin/telegram',
  integrations: '/admin', drive: '/admin', ai: '/admin', instagram: '/admin/instagram',
  records: '/admin/history', history: '/admin/history', usage: '/admin/usage', whiteboard: '/admin/structure',
}

export default function Settings() {
  const [params] = useSearchParams()
  const { hash } = useLocation()
  const { user: me } = useAuth()
  const { visible: boards } = useChannels()
  const tab = params.get('tab') || (hash ? hash.slice(1) : '')
  // Retired addresses that already lead elsewhere keep doing so.
  if (params.get('tab') === 'tasks') return <Navigate to={boards.length ? `/dept/${lastBoardChannel(me.id, boards)}?lens=list` : '/brief'} replace />
  if (params.get('tab') === 'reports' || params.get('tab') === 'pay') return <Navigate to={`/numbers?tab=${params.get('tab') === 'pay' ? 'pay' : 'month'}`} replace />
  if (tab && OLD[tab] && OLD[tab] !== '/admin') return <Navigate to={OLD[tab]} replace />
  return (
    <Suspense fallback={<div className="co co-st" aria-busy="true" />}>
      <Routes>
        <Route index element={<Index />} />
        <Route path="channels" element={<Channels />} />
        <Route path="channels/:key" element={<Channel />} />
        <Route path="brief/*" element={<Brief />} />
        <Route path="roles/*" element={<Roles />} />
        <Route path="telegram" element={<Telegram />} />
        <Route path="structure" element={<Structure />} />
        <Route path="pay/:which" element={<Pay />} />
        <Route path="instagram" element={<InstagramPage />} />
        <Route path="history" element={<Changes />} />
        <Route path="usage" element={<Usage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Suspense>
  )
}

const CLEAR = [7, 14, 30, 0]
const clearWords = (d) => (d ? tx('{n} days', { n: d }) : tx('Never'))

function Index() {
  const { channels } = useChannels()
  const { fields } = useFields()
  const [hk, setHk] = useState(null)
  const [tg, setTg] = useState(null)
  const [drive, setDrive] = useState(null)
  const [ig, setIg] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    api.get('/content/housekeeping/summary').then(setHk).catch(() => {})
    api.get('/telegram/admin').then(setTg).catch(() => {})
    api.get('/drive/status').then(setDrive).catch(() => setDrive({ error: true }))
    api.get('/instagram').then(setIg).catch(() => {})
  }, [])
  // Back from Google's sign-in (server/routes/drive.js sends /admin?tab=drive&drive=…): say how it went, once.
  useEffect(() => {
    const said = params.get('drive'), bad = params.get('drive_error')
    if (!said && !bad && !params.get('tab')) return
    if (said === 'connected') toast(tx('Google Drive connected'), 'ok')
    else if (said || bad) toast(bad || (said === 'cancelled' ? tx('Connecting was cancelled on Google’s page.') : tx('Only an admin of the whole board can connect Google Drive.')), 'err')
    setParams(new URLSearchParams(), { replace: true })
    if (params.get('tab') === 'drive' || said || bad) setTimeout(() => document.getElementById('st-drive')?.querySelector('button, a')?.focus(), 300)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setHouse = async (patch, prev) => {
    setHk((x) => ({ ...x, ...patch }))
    try {
      const out = await api.post('/content/housekeeping/settings', patch)
      setHk((x) => ({ ...x, ...out }))
      toast(tx('Saved'), 'ok', prev ? { label: tx('Undo'), onClick: () => setHouse(prev, null) } : null)
    } catch (e) { toast(e.message, 'err') }
  }

  const waiting = tg?.enabled ? tg.members.filter((m) => !m.linked && m.asked !== false).length : 0
  const tgValue = !tg ? '' : !tg.enabled ? tx('Off') : waiting ? tx('{n} not yet', { n: waiting }) : tx('Everyone')
  const tiers = fields?.skip_tiers?.length || 0
  const grades = fields?.maker_grades?.length || 0
  const igOn = ig?.channels?.filter((c) => c.connected).length || 0

  return (
    <Page title={tx('Advanced settings')} back={null}>
      <Group title={tx('Platform')}>
        <Row id="channels" to="/admin/channels" icon={LayoutGrid} label={tx('Channels')} value={channels.length || ''} />
        <Row id="brief" to="/admin/brief" icon={FileText} label={tx('The brief')} />
        <SwitchRow icon={BellRing} label={tx('Remind editors before an edit')} sub={tx('The evening before (18:00) and that morning (9:00)')}
          on={!!hk?.edit_reminders} disabled={!hk} onChange={(v) => setHouse({ edit_reminders: v }, { edit_reminders: !v })} />
        <button type="button" className="co-st-row" onClick={() => setClearing(true)} disabled={!hk} aria-haspopup="dialog">
          <span className="co-st-tile" aria-hidden="true"><Archive size={18} /></span>
          <span className="co-st-t">{tx('Clear late pieces after')}</span>
          <span className="co-st-v">{hk ? clearWords(hk.archive_days) : ''}</span>
          <ChevronRight className="co-st-chev" size={16} aria-hidden="true" />
        </button>
      </Group>

      <Group title={tx('Team')}>
        <Row id="roles" to="/admin/roles" icon={Users} label={tx('Roles')} />
        <Row id="telegram" to="/admin/telegram" icon={Send} label={tx('Telegram')} value={tgValue} />
        <Row id="structure" to="/admin/structure" icon={Network} label={tx('Team structure')} />
      </Group>

      <Group title={tx('Pay')}>
        <Row id="pieces" to="/admin/pay/pieces" icon={Banknote} label={tx('What a piece pays')} value={fields ? (tiers ? tx('{n} tiers', { n: tiers }) : tx('Not set')) : ''} />
        <Row id="grades" to="/admin/pay/grades" icon={Award} label={tx('Grades')} value={fields ? (grades ? tx('{n} grades', { n: grades }) : tx('Not set')) : ''} />
      </Group>

      <Group title={tx('Connections')} id="st-drive">
        <DriveRow st={drive} />
        <Row id="instagram" to="/admin/instagram" icon={Instagram} label={tx('Instagram')} value={ig ? tx('{c} of {n}', { c: igOn, n: ig.channels.length }) : ''} />
      </Group>

      <Group title={tx('History')}>
        <Row id="history" to="/admin/history" icon={History} label={tx('Changes')} />
        <Row id="usage" to="/admin/usage" icon={Activity} label={tx('How the board is used')} />
      </Group>

      {clearing && hk && (
        <Modal title={tx('Clear late pieces after')} onClose={() => setClearing(false)}>
          <p className="co-st-sub" style={{ margin: '0 0 var(--sp-2)' }}>{tx('Every Monday, pieces this late go to the archive. Anyone can bring one back from the Deleted stage on its board.')}</p>
          <div className="co-st-card" role="radiogroup" aria-label={tx('Clear late pieces after')}>
            {CLEAR.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={hk.archive_days === d} className="co-st-row"
                onClick={() => { const prev = hk.archive_days; setClearing(false); if (d !== prev) setHouse({ archive_days: d }, { archive_days: prev }) }}>
                <span className="co-st-t">{clearWords(d)}</span>
                {hk.archive_days === d && <Check size={18} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </Page>
  )
}

// Google Drive: on the real server it is connected, and the owner wants only
// "Google Drive" and a tick. Everything else is one press away behind "?".
function DriveRow({ st }) {
  const [busy, setBusy] = useState(false)
  const connect = async () => {
    setBusy(true)
    try { window.location.assign((await api.post('/drive/connect', {})).url) } catch (e) { toast(e.message, 'err'); setBusy(false) }
  }
  const disconnect = async () => {
    if (!confirm(tx('Disconnect Google Drive? Files already uploaded stay in Drive; nobody can upload new ones until it is connected again.'))) return
    try { await api.post('/drive/disconnect', {}); window.location.reload() } catch (e) { toast(e.message, 'err') }
  }
  const reconnect = st?.connected && ['reconnect', 'folders'].includes(st?.drop?.reason)
  let right = null
  if (!st) right = <span className="co-st-v" />
  else if (st.error) right = <span className="co-st-v">{tx('Not answering')}</span>
  else if (st.connected && !reconnect) right = <span className="co-st-v on" aria-label={tx('Connected')} title={tx('Connected')}><Check size={18} aria-hidden="true" /></span>
  else if (reconnect) right = <button type="button" className="co-btn co-btn-t co-btn-sm" onClick={connect} disabled={busy}>{tx('Reconnect')}</button>
  else if (st.configured) right = <button type="button" className="co-btn co-btn-t co-btn-sm" onClick={connect} disabled={busy}>{tx('Connect')}</button>
  else right = <span className="co-st-v">{tx('Off')}</span>
  return (
    <Line icon={HardDrive} label={tx('Google Drive')}>
      {right}
      {st && !st.error && (
        <Help label={tx('About Google Drive')}>
          {st.connected ? (
            <>
              <p>{tx('Connected to {email}', { email: st.email || '—' })}. {tx('Hand-ins upload to a folder per task.')}</p>
              {reconnect && <p>{tx('Reconnect and leave every box ticked on Google’s page, so files dropped in the three drop folders find their task.')}</p>}
              <p>
                {st.folder_url && <><a href={st.folder_url} target="_blank" rel="noreferrer">{tx('Open the folder')}</a>{' · '}</>}
                <button type="button" className="co-btn co-btn-q co-btn-sm co-st-danger" onClick={disconnect}>{tx('Disconnect')}</button>
              </p>
            </>
          ) : st.configured ? (
            <p>{tx('Press Connect and sign in to the team’s Google account on Google’s own page. The board writes only the files it creates.')}</p>
          ) : (
            <>
              <p>{tx('Google Drive is not set up on this server. Whoever runs the server does it once:')}</p>
              <ol>
                <li>{tx('In Google Cloud, turn on the Google Drive API for the team’s account.')}</li>
                <li>{tx('Make a web sign-in (OAuth) for it with this return address:')} <code>{st.redirect_uri}</code></li>
                <li>{tx('Put its client ID and secret on the server, and deploy.')}</li>
                <li>{tx('Come back here and press Connect.')}</li>
              </ol>
            </>
          )}
        </Help>
      )}
    </Line>
  )
}
