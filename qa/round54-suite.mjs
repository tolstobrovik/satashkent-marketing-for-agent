// Where the app lives. Defaults to the sandbox path these suites were
// written in, so nothing changes there; set DASHB_ROOT to run them on a
// laptop or in CI, where the checkout is somewhere else entirely.
const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
// Round 54: the session secret follows the REAL credential.
//
// Sessions are signed with a secret derived from the deployment's storage
// credential — good, because it is secret and identical on every serverless
// instance. But the derivation used to read the token straight out of
// config.js, ignoring the environment. Move the token to the host's
// environment (the safe place: it can be rotated without a commit) and
// config.js is left holding `REPLACE_WITH_YOUR_GITHUB_TOKEN` — a string
// published in the repository. The secret became public, and anyone could
// sign a token for user id 1 and be an admin.
//
// Both halves are pinned here: a forged session must be refused, and a real
// session must still be honoured by a SECOND instance holding the same
// environment token (that is the serverless case, and it is what breaks if
// the two sides ever disagree about which credential to use).
// Self-contained: two stacks on 4107/4108 against a GitHub mock on 9987.
import { spawn } from 'child_process'
import { createHash, createHmac } from 'crypto'
import { fileURLToPath } from 'url'

// HS256 by hand — this suite runs outside the app's node_modules, and forging
// a token is exactly four lines. That it is this easy is the whole point.
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
const sign = (payload, secret, ttl = 3600) => {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...payload, iat: Math.floor(Date.now() / 1e3), exp: Math.floor(Date.now() / 1e3) + ttl })}`
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}
const jwt = { sign: (payload, secret, opts = {}) => sign(payload, secret, /^(\d+)h$/.test(opts.expiresIn || '') ? Number(RegExp.$1) * 3600 : 604800) }

// fileURLToPath, not .pathname: on Windows .pathname keeps the URL's leading
// slash — "/C:/…/qa/" — and nothing can spawn or mkdir that. Byte-identical
// on Linux, so CI reads exactly the same string it always did.
const SP = fileURLToPath(new URL('.', import.meta.url))
const MOCK = 'http://localhost:9987'
const A = 'http://localhost:4107/api'
const B = 'http://localhost:4108/api'
const ENV_TOKEN = 'r54-token-that-lives-in-the-environment'
const PLACEHOLDER = 'REPLACE_WITH_YOUR_GITHUB_TOKEN'
const secretFrom = (s) => createHash('sha256').update(`satashkent:${s}`).digest('hex')

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const procs = []
// 12 Nov 2026: this checkout is the DEMO COPY, where server/config.js says
// `export const GITHUB_DATA = null` on purpose (the demo can never reach the
// team's real data), so db.js stayed on the local file whatever the
// environment said: storage "file", no storage credential, and sessions
// signed with the built-in dev secret — three checks red. auth.js and db.js
// did not regress. So the instances boot through a loader hook that gives
// config.js, inside these processes only and only where the demo's null is
// present, what a real deployment's config.js holds: the repository and the
// UNFILLED PLACEHOLDER token, with the real token in the environment. That is
// this suite's premise, and it is what lets "forged from the placeholder" go
// red if the session secret ever reads config.js again (qa/gh-config-hook.mjs,
// which round55 and round57 share, writes no token at all, so under it that
// pin could not fail; it is left as it is). On a checkout whose config.js is
// real the hook changes nothing. Every check runs on the shipped auth.js and
// db.js.
const NULL_LINE = /export\s+const\s+GITHUB_DATA\s*=\s*null\b/
const CONFIG_LINE = `export const GITHUB_DATA = ${JSON.stringify({ repo: 'probe/r54', branch: 'appdata', path: 'data/dashboard.db', token: PLACEHOLDER })}`
const CONFIG_JS = /\/server\/config\.js$/i
const HOOKS = `
const NULL_LINE = ${NULL_LINE}
const CONFIG_JS = ${CONFIG_JS}
const CONFIG_LINE = ${JSON.stringify(CONFIG_LINE)}
const rewrite = (url, r) => {
  if (process.env.GITHUB_DATA_FORCE !== '1' || r.source == null || !CONFIG_JS.test(String(url).split('?')[0])) return r
  const s = String(r.source)
  return NULL_LINE.test(s) ? { ...r, source: s.replace(NULL_LINE, CONFIG_LINE), shortCircuit: true } : r
}`
// Node 22.15+ runs the hook on the main thread; older Node off-thread.
const PRELOAD = 'data:text/javascript,' + encodeURIComponent(`import * as mod from 'node:module'
${HOOKS}
if (typeof mod.registerHooks === 'function') mod.registerHooks({ load: (url, c, next) => rewrite(url, next(url, c)) })
else mod.register('data:text/javascript,' + encodeURIComponent(${JSON.stringify(HOOKS + '\nexport async function load(url, c, next) { return rewrite(url, await next(url, c)) }')}))`)
const boot = (env) => { const p = spawn(process.execPath, ['--import', PRELOAD, ROOT + '/server/index.js'], { env: { ...process.env, ...env }, stdio: 'ignore' }); procs.push(p); return p }
const stop = () => { for (const p of procs) { try { p.kill('SIGKILL') } catch { /* gone */ } } }
process.on('exit', stop)

procs.push(spawn(process.execPath, [SP + 'mock-gh.mjs'], { env: { ...process.env, MOCK_PORT: '9987' }, stdio: 'ignore' }))
const up = async (url) => {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) return true } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
await up(MOCK + '/')
  .catch(() => {})

// Two instances, exactly as a serverless host would run them: the token in
// the ENVIRONMENT, config.js left holding its placeholder, one shared store.
const ghEnv = {
  GITHUB_API_BASE: MOCK, GITHUB_DATA_FORCE: '1',
  GITHUB_DATA_TOKEN: ENV_TOKEN, GITHUB_DATA_REPO: 'probe/r54', GITHUB_DATA_BRANCH: 'appdata',
}
boot({ ...ghEnv, DATA_DIR: SP + 'r54a-' + Date.now(), PORT: '4107' })
ok('an instance with its token in the environment comes up', await up(A + '/health'))

const conf = await (await fetch(A + '/health')).json()
ok('…and it really is running on the environment token',
  conf.storage === 'github' || conf.config?.token_from === 'environment' || conf.token_from === 'environment',
  JSON.stringify(conf).slice(0, 200))

const login = async (base, u, p) => (await (await fetch(base + '/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }),
})).json())
const me = async (base, token) => {
  const r = await fetch(base + '/auth/me', { headers: { Authorization: `Bearer ${token}` } })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}

const real = await login(A, 'admin', 'admin123')
ok('a real login still works', !!real.token && real.user?.role === 'admin', JSON.stringify(real).slice(0, 120))
ok('…and the session is honoured', (await me(A, real.token)).status === 200)

// ---- the hole: a token signed with the PUBLISHED placeholder ----
const forged = jwt.sign({ id: 1 }, secretFrom(PLACEHOLDER), { expiresIn: '7d' })
let r = await me(A, forged)
ok('a session forged from the repository’s placeholder is REFUSED', r.status === 401, `${r.status} ${JSON.stringify(r.data)}`)
// and the same forgery against the plainest possible target
const forgedDev = jwt.sign({ id: 1 }, 'satashkent-dev-secret-change-me', { expiresIn: '7d' })
r = await me(A, forgedDev)
ok('…so is one forged from the built-in dev secret', r.status === 401, `${r.status}`)
r = await me(A, jwt.sign({ id: 1 }, secretFrom('some-other-token'), { expiresIn: '7d' }))
ok('…and one signed with any other credential', r.status === 401, `${r.status}`)

// ---- the secret really is the ENVIRONMENT token's ----
const byEnv = jwt.sign({ id: 1 }, secretFrom(ENV_TOKEN), { expiresIn: '1h' })
r = await me(A, byEnv)
ok('a session signed with the environment token’s secret IS accepted',
  r.status === 200 && r.data.user?.username === 'admin', `${r.status} ${JSON.stringify(r.data).slice(0, 90)}`)

// ---- a second instance must agree, or serverless logins flap ----
boot({ ...ghEnv, DATA_DIR: SP + 'r54b-' + Date.now(), PORT: '4108' })
ok('a second instance comes up on the same environment token', await up(B + '/health'))
r = await me(B, real.token)
ok('a session opened on one instance is honoured by the other', r.status === 200, `${r.status} ${JSON.stringify(r.data).slice(0, 90)}`)
r = await me(B, forged)
ok('…and the forgery is refused there too', r.status === 401, `${r.status}`)

// ---- an explicit JWT_SECRET still wins over everything ----
boot({ ...ghEnv, JWT_SECRET: 'r54-explicit', DATA_DIR: SP + 'r54c-' + Date.now(), PORT: '4109' })
const C = 'http://localhost:4109/api'
ok('an instance with an explicit JWT_SECRET comes up', await up(C + '/health'))
r = await me(C, jwt.sign({ id: 1 }, 'r54-explicit', { expiresIn: '1h' }))
ok('JWT_SECRET still overrides the derived one', r.status === 200, `${r.status}`)
r = await me(C, byEnv)
ok('…and the derived secret no longer opens that door', r.status === 401, `${r.status}`)

stop()
await new Promise((r2) => setTimeout(r2, 300))
console.log(fails === 0 ? '\nRound-54 suite clean.' : `\n${fails} PROBLEMS`)
process.exit(fails ? 1 : 0)
