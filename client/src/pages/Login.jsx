import { useState } from 'react'
import { AlertCircle, LogIn, Eye, EyeOff } from 'lucide-react'
import { LogoStacked } from '../components/Logo.jsx'
import { useT, tr as tx } from '../lib/i18n.jsx'
import LangToggle from '../components/LangToggle.jsx'
import { useAuth } from '../lib/auth.jsx'
import { getCookie, setCookie } from '../lib/api.js'

// The demo's accounts, one press each (demo only: `npm run demo` sets VITE_DEMO;
// the real dashboard has no such flag, so it never draws this list).
const DEMO = import.meta.env.VITE_DEMO === '1'
const DEMO_PASSWORD = '1234'
const DEMO_ACCOUNTS = [
  ['admin', 'Admin', 'Admin'],
  ['dilnoza', 'Dilnoza', 'Content maker'], ['sardor', 'Sardor', 'Content maker'],
  ['malika', 'Malika', 'Copywriter'], ['javohir', 'Javohir', 'Targetologist'],
  ['otabek', 'Otabek', 'Operator'], ['bekzod', 'Bekzod', 'Operator'],
  ['eldor', 'Eldor', 'Editor'], ['kamola', 'Kamola', 'Editor'],
  ['nigora', 'Nigora', 'Designer'], ['shahzoda', 'Shahzoda', 'Designer'],
  ['aziz', 'Aziz', 'Operator & editor'],
]

export default function Login() {
  const { login } = useAuth()
  const { t } = useT()
  // Comfort cookies: the last username comes prefilled, and the remember-me
  // choice is kept the way you left it.
  const [username, setUsername] = useState(() => getCookie('satashkent_login') || '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => getCookie('satashkent_remember') !== '0')
  const [error, setError] = useState(null) // { text, code } — the line in plain words, the number small (A-10)
  // Sent here because the session ended mid-work (lib/auth.jsx): said once.
  const [ended] = useState(() => {
    try { const was = sessionStorage.getItem('satashkent_session_ended') === '1'; sessionStorage.removeItem('satashkent_session_ended'); return was } catch { return false }
  })
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const signIn = async (name, pw) => {
    setError(null)
    setBusy(true)
    try {
      await login(name, pw, remember)
      setCookie('satashkent_login', name.trim().toLowerCase(), 30)
      setCookie('satashkent_remember', remember ? '1' : '0', 30)
    } catch (err) {
      setError({ text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(username, password, remember)
      setCookie('satashkent_login', username.trim().toLowerCase(), 30)
      setCookie('satashkent_remember', remember ? '1' : '0', 30)
    } catch (err) {
      // A refusal the board made (a wrong password) is said in its own words.
      // Anything else — the board down, nginx answering for it, no network —
      // is one plain sentence, with the code small and grey for whoever asks
      // the admin what happened.
      const said = err?.data && typeof err.data.error === 'string' && err.data.error
      setError(said ? { text: err.message } : { text: tx('The board did not answer. Try again.'), code: err?.status || null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <LogoStacked width={176} />
        </div>

        <h2>{t('login.signin')}</h2>
        <div className="lc-sub">{t('login.sub')}</div>

        <form className="login-form" onSubmit={submit}>
          {ended && !error && (
            <div className="stat-sub login-ended" role="status">{tx('Your session ended — sign in again and you are back where you were.')}</div>
          )}
          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" /> <span>{error.text}</span>
              {error.code ? <small className="login-code">{error.code}</small> : null}
            </div>
          )}
          <div className="field">
            <label>{t('login.username')}</label>
            <input
              className="input"
              type="text"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label>{t('login.password')}</label>
            <div className="pw-wrap">
              {/* autoCapitalize matters here: with the eye toggle on, this is a
                  plain text input and phones would upper-case the first letter. */}
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button type="button" className="pw-eye" onClick={() => setShowPw(!showPw)} aria-label={showPw ? t('login.hidepw') : t('login.showpw')}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <label className="remember-row">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>{t('login.remember')}</span>
            <span className="stat-sub">{t('login.rememberoff')}</span>
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: 'center', padding: 11, marginTop: 2 }}>
            <LogIn size={17} /> {busy ? t('login.signingin') : t('login.signin')}
          </button>
        </form>

        {DEMO && (
          <section className="co-demo-accts" aria-labelledby="co-demo-accts-h">
            <h3 id="co-demo-accts-h">{tx('Demo: sign in as')}</h3>
            <p className="co-help">{tx('Every account’s password is {pw}.', { pw: DEMO_PASSWORD })}</p>
            <div className="co-demo-grid">
              {DEMO_ACCOUNTS.map(([key, name, role]) => (
                <button key={key} type="button" className="co-demo-acct" disabled={busy} onClick={() => signIn(key, DEMO_PASSWORD)}>
                  <b>{name}</b><span>{tx(role)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Before signing in is exactly when somebody needs this: the person
            who cannot read the form is the person who has to change it. */}
        <div className="login-lang"><LangToggle className="btn btn-sm" /></div>
        {/* A plain link, not a route: the policy is the server's own page,
            readable without signing in (server/privacy.js). */}
        <a className="login-privacy" href="/privacy">{tx('Privacy')}</a>
      </div>
    </div>
  )
}
