import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSimpleLook } from '../lib/look.js'
import { replayTour } from '../components/CoachTour.jsx'
import { Camera, Check, AlertCircle, Trash2, Eye, EyeOff, KeyRound, UserRound, Type, Clock, Send, BookOpen, Plus, Wallet, ChevronRight, LogOut, HelpCircle } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import Fold from '../components/Fold.jsx'
import Avatar from '../components/Avatar.jsx'
import CalendarSync from '../components/CalendarSync.jsx'
import ClaudeAccess from '../components/ClaudeAccess.jsx'
import MyPay from '../components/MyPay.jsx'
import DeliveryReport from '../components/DeliveryReport.jsx'
import KpiDocument from '../components/KpiDocument.jsx'
import { TimePick } from '../components/DayPick.jsx'
import ColoursPanel from '../components/ColoursPanel.jsx'
import { usePages } from '../lib/pages.jsx'
import { WORK_DAYS, can } from '../lib/constants.js'
import { TEXT_SIZES, getTextSize, applyTextSize } from '../lib/textSize.js'
import { THEMES, getTheme, applyTheme } from '../lib/theme.js'
import { LANGS, useT } from '../lib/i18n.jsx'
import { soundsOn, setSounds, playDone } from '../lib/sound.js'
import { Moon, Languages, Palette } from 'lucide-react'
import { tr as tx } from '../lib/i18n.jsx'

// Distinct hues, not seven shades of brand red — avatars and chips must be
// tellable apart at a glance.
const SWATCHES = ['#A22036', '#2a78d6', '#1D9E75', '#BA7517', '#7b5ad6', '#0e8f8f', '#d6499b', '#5a6b7a']

// A-06 (the TZ of 19 October 2026): two columns on a desk — the profile and
// the password on the left; the hours, Telegram, the calendar and Claude on
// the right — one Save on the profile card, the hours on the Coach look's
// own pickers (the seven day chips, a start and an end on the half hour),
// the Telegram card one plain line a role, the calendar button tonal, and
// Appearance folded but also reachable from the sidebar's foot
// (/profile#appearance opens the fold).
export default function Profile() {
  const { user, setUser, logout } = useAuth()
  const coach = useSimpleLook(user)
  const navigate = useNavigate()
  // My pay (N-02): the Payment page, under the person it is about. /docs
  // lands on /profile#pay, and the hash brings the section into view.
  const { shows } = usePages()
  const { hash } = useLocation()
  const payHere = shows('docs')
  const runsEverything = user.role === 'admin' && !(user.admin_channels || []).length
  useEffect(() => {
    if (hash === '#pay' || hash === '#appearance') requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }))
  }, [hash])
  const [name, setName] = useState(user.name)
  const [color, setColor] = useState(user.color)
  const [avatar, setAvatar] = useState(user.avatar)
  const [phone, setPhone] = useState(user.phone || '')
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Working schedule — shoots can only be booked inside these hours.
  const [wStart, setWStart] = useState(user.work_start || '')
  const [wEnd, setWEnd] = useState(user.work_end || '')
  const [wDays, setWDays] = useState(() => (Array.isArray(user.work_days) ? user.work_days : []))
  const [schedSaved, setSchedSaved] = useState(false)
  const [schedErr, setSchedErr] = useState('')
  // When you are NOT available, on a repeating week. Working hours say when
  // somebody is at work; they do not say the operator is in lectures every
  // Tuesday afternoon, and half this team are students. A planner who cannot
  // see that books a shoot into a seminar and finds out on the day.
  const [study, setStudy] = useState(() => (Array.isArray(user.study_blocks) ? user.study_blocks : []))
  const addStudy = () => setStudy((prev) => [...prev, { d: 1, from: '14:00', to: '16:00', label: '' }])
  const setStudyAt = (i, patch) => setStudy((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const dropStudy = (i) => setStudy((prev) => prev.filter((_, j) => j !== i))
  // A block that ends before it starts is not a block, and saving one would
  // silently drop it on the way through — so it is said here instead.
  const studyBad = study.some((b) => !b.from || !b.to || b.from >= b.to)
  const toggleDay = (d) =>
    setWDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))
  const saveSchedule = async () => {
    setSchedErr(''); setSchedSaved(false)
    try {
      const updated = await api.patch('/users/me', {
        work_start: wStart || null, work_end: wEnd || null,
        work_days: wDays.length ? wDays : null,
        study_blocks: study,
      })
      setUser(updated)
      setSchedSaved(true)
      setTimeout(() => setSchedSaved(false), 2500)
    } catch (e) { setSchedErr(e.message) }
  }
  const { lang, setLang, t } = useT()
  const [textSize, setTextSize] = useState(getTextSize())
  const [theme, setTheme] = useState(getTheme())
  const [snd, setSnd] = useState(soundsOn())

  // The Telegram bridge — the bell, mirrored to your pocket. Connect mints a
  // one-time deep link; pressing Start in Telegram completes it, and the page
  // notices on its own.
  const [tg, setTg] = useState(null) // { enabled, linked, bot }
  const [tgLink, setTgLinkState] = useState(null) // { url, bot } while waiting for Start
  const [tgMsg, setTgMsg] = useState('')
  // One press = one request: every bridge button locks while its call runs,
  // so an eager thumb can't send five test lines. The lock lives in a ref —
  // synchronous on purpose; a burst of clicks outruns any state re-render.
  const [tgBusy, setTgBusy] = useState(false)
  const tgLock = useRef(false)
  useEffect(() => { api.get('/telegram/status').then(setTg).catch(() => setTg({ enabled: false })) }, [])
  useEffect(() => {
    if (!tgLink || tg?.linked) return
    const id = setInterval(() => api.get('/telegram/status').then((s) => {
      setTg(s)
      if (s.linked) setTgLinkState(null)
    }).catch(() => {}), 3000)
    return () => clearInterval(id)
  }, [tgLink, tg?.linked])
  const tgCall = async (fn) => {
    if (tgLock.current) return
    tgLock.current = true
    setTgBusy(true); setTgMsg('')
    try { await fn() } catch (e) { setTgMsg(e.message) }
    // The lock outlives the request by a second — a burst of eager clicks
    // becomes one action, not one per round-trip.
    setTimeout(() => { tgLock.current = false; setTgBusy(false) }, 1000)
  }
  const tgConnect = () => tgCall(async () => {
    const l = await api.post('/telegram/link', {})
    setTgLinkState(l)
    if (l.url) window.open(l.url, '_blank', 'noopener')
  })
  const tgDisconnect = () => tgCall(async () => {
    await api.post('/telegram/unlink', {})
    setTg((s) => ({ ...s, linked: false })); setTgLinkState(null)
  })
  const tgActivate = () => tgCall(async () => {
    const out = await api.post('/telegram/set-webhook', {})
    setTgMsg(out.ok ? tx('Webhook set: {url}', { url: out.url }) : tx('Telegram refused the webhook — check the token and try again'))
  })
  const tgTest = () => tgCall(async () => {
    await api.post('/telegram/test', {})
    setTgMsg(tx('Sent — check Telegram'))
  })

  // password form
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [repPw, setRepPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwMsg, setPwMsg] = useState(null) // { ok, text }

  const pickAvatar = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { setErr(tx('Image is too large — keep it under 15 MB')); return }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        // Square crop from the center. 128px is plenty for the largest place
        // an avatar renders, and keeps every payload it travels in small.
        const side = Math.min(img.width, img.height)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = Math.min(128, side)
        canvas.getContext('2d').drawImage(
          img,
          (img.width - side) / 2, (img.height - side) / 2, side, side,
          0, 0, canvas.width, canvas.height,
        )
        setAvatar(canvas.toDataURL('image/jpeg', 0.82))
        setErr('')
      } catch { setErr(tx('Could not read that image')) } finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { setErr(tx('Could not read that image')); URL.revokeObjectURL(url) }
    img.src = url
    e.target.value = '' // same file can be picked again
  }

  const saveProfile = async () => {
    setErr(''); setSaved(false); setBusy(true)
    try {
      const updated = await api.patch('/users/me', { name: name.trim(), color, avatar: avatar || null, phone: phone.trim() || null })
      setUser(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const changePassword = async () => {
    setPwMsg(null)
    if (newPw !== repPw) { setPwMsg({ ok: false, text: tx('New passwords don’t match') }); return }
    try {
      // The answer carries weak_password: 0 — without it the "your password is
      // the one this app ships with" banner stays up until the next reload.
      setUser(await api.patch('/users/me', { current_password: curPw, new_password: newPw }))
      setPwMsg({ ok: true, text: tx('Password changed — use it on your next sign-in') })
      setCurPw(''); setNewPw(''); setRepPw('')
    } catch (e) { setPwMsg({ ok: false, text: e.message }) }
  }

  // The Telegram card says one plain line a role (A-06). An admin's line
  // says what to do and where; a member's says whom to ask.
  const tgLine = () => {
    if (!tg) return <div className="stat-sub">{tx('Checking…')}</div>
    if (!tg.enabled) {
      return (
        <div className="stat-sub">
          {runsEverything
            ? <>{tx('The bot is not set up yet. Put its token in the repository secret TELEGRAM_BOT_TOKEN, redeploy, then press Activate here.')} <Link to="/admin?tab=team#telegram">{tx('Settings → Team')}</Link></>
            : tx('Not connected. Ask the admin.')}
        </div>
      )
    }
    if (tg.linked) {
      return (
        <>
          <div className="stat-sub" style={{ marginBottom: 10 }}>
            <Check size={14} style={{ verticalAlign: -2, color: 'var(--ok, #1D9E75)' }} /> {tg.bot ? tx('Connected to @{bot} — new work, pravkas, work to review and @-mentions land in Telegram, with buttons to answer there.', { bot: tg.bot }) : tx('Connected — new work, pravkas, work to review and @-mentions land in Telegram, with buttons to answer there.')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-sm" onClick={tgTest} disabled={tgBusy}>{tx('Send a test')}</button>
            <button className="btn btn-sm" onClick={tgDisconnect} disabled={tgBusy}>{tx('Disconnect')}</button>
          </div>
        </>
      )
    }
    return (
      <>
        <div className="stat-sub" style={{ marginBottom: 10 }}>
          {tx('Only what you have to act on: new work, a pravka, work to review, an @-mention. Quiet from 23:00 to 08:00.')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={tgConnect} disabled={tgBusy}><Send size={14} /> {tx('Connect Telegram')}</button>
          {tgLink && (
            <span className="stat-sub">
              {tx('Press Start in the chat that opened — this page will notice by itself.')}{tgLink.url ? <> (<a href={tgLink.url} target="_blank" rel="noreferrer">@{tgLink.bot}</a>)</> : null}
            </span>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="pf">
      <div className="section-head co-page-head"><h1 className="co-title">{tx('Profile')}</h1></div>
      <div className="pf-cols">
      <div className="pf-col">
      <div className="card card-pad">
        {err && <div className="form-error"><AlertCircle size={16} /> {err}</div>}

        <div className="profile-top">
          <Avatar name={name || user.name} color={color} src={avatar} size="lg" />
          <div className="profile-photo-btns">
            <label className="btn btn-sm">
              <Camera size={14} /> {avatar ? tx('Change photo') : tx('Add photo')}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={pickAvatar} />
            </label>
            {avatar && (
              <button className="btn btn-sm" onClick={() => setAvatar(null)}>
                <Trash2 size={14} /> {tx('Remove')}
              </button>
            )}
          </div>
          {/* The way out, where it is seen: the menus no longer carry it (round 3 of the Coach menus, 11 Nov 2026).
              No confirm — signing in again undoes it. */}
          <button type="button" className="co-nv-pfout" onClick={logout} aria-label={t('nav.signout')}>
            <LogOut size={18} strokeWidth={2} aria-hidden="true" /> {t('nav.signout')}
          </button>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="pf-name">{tx('Display name')}</label>
          <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="pf-phone">{tx('Phone')} <span className="stat-sub">{tx('(shown to the team)')}</span></label>
          <input id="pf-phone" className="input" type="tel" value={phone} placeholder="+998 90 123 45 67"
            onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="field">
          <label>{tx('Accent color')} <span className="stat-sub">{tx('(used for your initials and chips)')}</span></label>
          <div className="swatch-row">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={'swatch' + (color === c ? ' on' : '')}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
              >
                {color === c && <Check size={13} strokeWidth={3.5} color="#fff" />}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-primary" onClick={saveProfile} disabled={busy || !name.trim()}>
            {busy ? tx('Saving…') : tx('Save')}
          </button>
          {saved && <span className="save-ok"><Check size={15} /> {tx('Saved')}</span>}
        </div>
      </div>

      <div className="section-head"><h2><KeyRound size={16} style={{ verticalAlign: -2 }} /> {tx('Change password')}</h2></div>
      <div className="card card-pad">
        {pwMsg && (
          <div className={pwMsg.ok ? 'form-ok' : 'form-error'}>
            {pwMsg.ok ? <Check size={16} /> : <AlertCircle size={16} />} {pwMsg.text}
          </div>
        )}
        <div className="field">
          <label htmlFor="pf-pw-cur">{tx('Current password')}</label>
          <div className="pw-wrap">
            <input id="pf-pw-cur" className="input" type={showPw ? 'text' : 'password'} value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
            <button type="button" className="pw-eye" onClick={() => setShowPw(!showPw)} data-tip={showPw ? tx('Hide password') : tx('Show password')} data-tip-left="" aria-label={showPw ? tx('Hide password') : tx('Show password')} aria-pressed={showPw}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="pf-pw-new">{tx('New password')}</label>
          <input id="pf-pw-new" className="input" type={showPw ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="pf-pw-rep">{tx('Repeat new password')}</label>
          <input id="pf-pw-rep" className="input" type={showPw ? 'text' : 'password'} value={repPw} onChange={(e) => setRepPw(e.target.value)} autoComplete="new-password" />
        </div>
        <button className="btn btn-primary" onClick={changePassword} disabled={!curPw || !newPw}>
          {tx('Change password')}
        </button>
      </div>
      </div>

      <div className="pf-col">
      <div className="section-head"><h2><Clock size={16} style={{ verticalAlign: -2 }} /> {tx('My working hours')}</h2></div>
      <div className="card card-pad">
        {schedErr && <div className="form-error"><AlertCircle size={16} /> {schedErr}</div>}
        <div className="stat-sub" style={{ marginBottom: 10 }}>
          {tx('The days and hours you can be booked for. The board offers only these when somebody plans a shoot with you.')}
        </div>
        <div className="wd-row" role="group" aria-label={tx('Working days')}>
          {WORK_DAYS.map((d) => (
            <button key={d.n} type="button" className={'wd-chip' + (wDays.includes(d.n) ? ' on' : '')} aria-pressed={wDays.includes(d.n)}
              onClick={() => toggleDay(d.n)}>
              {tx(d.label)}
            </button>
          ))}
        </div>
        <div className="sched-hours">
          <label className="sched-field" htmlFor="pf-from">{tx('From')}</label>
          <TimePick id="pf-from" value={wStart} onChange={setWStart} label={tx('From')} />
          <label className="sched-field" htmlFor="pf-to">{tx('To')}</label>
          <TimePick id="pf-to" value={wEnd} onChange={setWEnd} label={tx('To')} />
        </div>
        {/* …and when you are NOT free inside them. Lectures, a second job,
            anything that repeats. It sits in the same card as the hours
            because it answers the same question, and splitting them across
            two screens is how one of them never gets filled in. */}
        <div className="study-head">
          <BookOpen size={14} />
          <b>{tx('When you study')}</b>
          <span className="stat-sub">{tx('lectures and anything else that repeats weekly')}</span>
        </div>
        <div className="stat-sub" style={{ marginBottom: 8 }}>
          {tx('Nobody can book a shoot over these. They are drawn on your week in amber so a planner can see them.')}
        </div>
        {study.map((b, i) => (
          <div className="study-row" key={i}>
            <select className="select" value={b.d} aria-label={tx('Day')} onChange={(e) => setStudyAt(i, { d: Number(e.target.value) })}>
              {WORK_DAYS.map((d) => <option key={d.n} value={d.n}>{tx(d.label)}</option>)}
            </select>
            <TimePick value={b.from} onChange={(v) => setStudyAt(i, { from: v })} label={tx('From')} />
            <span className="stat-sub">–</span>
            <TimePick value={b.to} onChange={(v) => setStudyAt(i, { to: v })} label={tx('To')} />
            <input className="input study-what" value={b.label || ''} maxLength={40}
              placeholder={tx('e.g. University')} aria-label={tx('What it is')}
              onChange={(e) => setStudyAt(i, { label: e.target.value })} />
            <button type="button" className="icon-btn" aria-label={tx('Remove')} onClick={() => dropStudy(i)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={addStudy}><Plus size={14} /> {tx('Add a study time')}</button>
        {studyBad && (
          <div className="form-error" style={{ marginTop: 10 }}>
            <AlertCircle size={16} /> {tx('One of these ends before it starts.')}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <button className="btn btn-primary" onClick={saveSchedule} disabled={studyBad}>{tx('Save')}</button>
          {schedSaved && <span className="save-ok"><Check size={15} /> {tx('Saved')}</span>}
        </div>
      </div>

      <div className="section-head"><h2><Send size={16} style={{ verticalAlign: -2 }} /> Telegram</h2></div>
      <div className="card card-pad">
        {tgLine()}
        {tg?.enabled && runsEverything && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={tgActivate} disabled={tgBusy}>{tx('Activate webhook')}</button>
            <span className="stat-sub">{tx('Admin, once after the token lands or the domain changes.')}</span>
          </div>
        )}
        {tgMsg && <div className="stat-sub" style={{ marginTop: 8 }}>{tgMsg}</div>}
      </div>

      {user.role !== 'ambassador' && <CalendarSync />}

      {user.role !== 'ambassador' && <ClaudeAccess />}
      </div>
      </div>

      {/* What the month is worth so far, the deliveries it rests on and the
          KPI document it is measured against — money first, the reference
          under it. An admin finds the whole team's payroll under Numbers → Pay. */}
      {payHere && (
        <section id="pay" className="profile-pay" aria-label={tx('My pay')}>
          <div className="section-head" style={{ marginTop: 22 }}><h2><Wallet size={16} style={{ verticalAlign: -2 }} /> {tx('My pay')}</h2></div>
          {/* A-08: one headline (this one), the month picker, the groups as a
              list with counts, the KPI document as a row. */}
          <MyPay startOpen />
          <DeliveryReport />
          {runsEverything && (
            <Link className="card card-pad pay-jump" to="/numbers?tab=pay">
              <Wallet size={17} />
              <span>
                <b>{tx('The whole team’s payroll')}</b>
                <span className="stat-sub">{tx('Everybody’s month, the rates behind it, and recording it as paid')}</span>
              </span>
              <ChevronRight size={16} />
            </Link>
          )}
          <KpiDocument row />
        </section>
      )}

      {/* Round 10: theme and language are also at the foot of the sidebar; these
          three are set once, so they wait shut — unless the foot sent the
          person here (#appearance), in which case the fold is open. */}
      <section id="appearance">
      <Fold shut forceOpen={hash === '#appearance'} id="profile-look" title={tx('Appearance')}>
      <div className="section-head" style={{ marginTop: 22 }}><h2><Moon size={16} style={{ verticalAlign: -2 }} /> {tx('Appearance')}</h2></div>
      <div className="card card-pad">
        <div className="stat-sub" style={{ marginBottom: 10 }}>{tx('Dark is easy on the eyes at night. System follows your device.')}</div>
        <div className="seg">
          {THEMES.map((t) => (
            <button key={t.key} type="button"
              className={'seg-btn' + (theme === t.key ? ' on' : '')}
              onClick={() => { applyTheme(t.key); setTheme(t.key) }}>
              {tx(t.label)}
            </button>
          ))}
        </div>
        <div className="stat-sub" style={{ margin: '14px 0 10px' }}>{tx('Soft sounds when tasks complete and programs launch.')}</div>
        <div className="seg">
          <button type="button" className={'seg-btn' + (snd ? ' on' : '')}
            onClick={() => { setSounds(true); setSnd(true); playDone() }}>{tx('Sounds on')}</button>
          <button type="button" className={'seg-btn' + (!snd ? ' on' : '')}
            onClick={() => { setSounds(false); setSnd(false) }}>{tx('Off')}</button>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 22 }}><h2><Languages size={16} style={{ verticalAlign: -2 }} /> {t('common.language')}</h2></div>
      <div className="card card-pad">
        <div className="stat-sub" style={{ marginBottom: 10 }}>
          {tx('The buttons, menus and headings on this device. What you and everybody else TYPE — titles, scripts, comments — is never translated.')}
        </div>
        <div className="seg">
          {LANGS.map((l) => (
            <button key={l.key} type="button"
              className={'seg-btn' + (lang === l.key ? ' on' : '')}
              onClick={() => setLang(l.key)}>
              {l.native}
            </button>
          ))}
        </div>
      </div>

      {/* A-07: whoever makes pieces chooses what their ten colours mean —
          here, beside the theme and the language, not on a page of its own. */}
      {can(user, 'manage_content') && (
        <>
          <div className="section-head" style={{ marginTop: 22 }}><h2><Palette size={16} style={{ verticalAlign: -2 }} /> {tx('My colours')}</h2></div>
          <ColoursPanel />
        </>
      )}

      <div className="section-head" style={{ marginTop: 22 }}><h2><Type size={16} style={{ verticalAlign: -2 }} /> {tx('Text size')}</h2></div>
      <div className="card card-pad">
        <div className="stat-sub" style={{ marginBottom: 10 }}>{tx('Scales the whole site on this device.')}</div>
        <div className="seg">
          {TEXT_SIZES.map((s) => (
            <button key={s.key} type="button"
              className={'seg-btn' + (textSize === s.key ? ' on' : '')}
              style={{ fontSize: s.key === 'small' ? 12 : s.key === 'large' ? 15 : 13 }}
              onClick={() => { applyTextSize(s.key); setTextSize(s.key) }}>
              {tx(s.label)}
            </button>
          ))}
        </div>
      </div>

      {/* The first-day tour's one door since the menus lost theirs (round 4 of the Coach menus): it starts on My Day,
          where its steps are, as the old menu item did. The tour belongs to the Coach look. */}
      {coach && (
        <div className="card card-pad co-pf-tour">
          <button type="button" className="co-pf-tourbtn" onClick={() => { navigate('/brief'); setTimeout(replayTour, 400) }}>
            <HelpCircle size={18} strokeWidth={1.75} aria-hidden="true" /> {tx('Replay the first-day tour')}
          </button>
        </div>
      )}

      </Fold>
      </section>
    </div>
  )
}
