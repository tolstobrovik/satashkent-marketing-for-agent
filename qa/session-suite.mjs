// A session in use does not end mid-work, and the upload box does not vanish
// (31 Oct 2026). An editor's sign-in ran out on day 7 with the board open: the
// page kept drawing what it had, every request after it came back "Not
// authenticated", the Drive check failed with them, and every hand-in on the
// board became a bare link box with no way to upload.
//
//   renewal      a token half a day old (a short one: half its life) is
//                answered with a fresh one of the same length (X-Session-Token); a fresh token is not; an
//                access key is never renewed; an expired token is refused
//   signed out   a 401 to a request that carried a token tells the app, which
//                signs the person out to the sign-in and back to the page
//   the box      HandIn and UploadField hide the upload only when the server
//                SAYS Drive is off, never because the check failed; the full
//                task sheet and the stage gate offer it too
//
// Self-contained: API :4148. JWT_SECRET is the suite's own.
//   DASHB_ROOT=$PWD node qa/session-suite.mjs
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
const BASE = 'http://localhost:4148'
const SECRET = `session-suite-${Date.now()}`
const jwt = createRequire(join(ROOT, 'package.json'))('jsonwebtoken')

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const procs = []
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL') } catch { /* gone */ } } })
procs.push(spawn(process.execPath, [join(ROOT, 'server/index.js')], {
  env: { ...process.env, DATA_DIR: join(tmpdir(), `session-${Date.now()}`), PORT: '4148', JWT_SECRET: SECRET,
    GITHUB_DATA_TOKEN: '', GH_DATA_TOKEN: '', DATABASE_URL: '', CRON_SECRET: '', TELEGRAM_BOT_TOKEN: '', GEMINI_API_KEY: '' },
  stdio: 'ignore',
}))
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500))
}
const me = (tok) => fetch(BASE + '/api/auth/me', { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
const login = await (await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123', remember: true }),
})).json()
ok('the API is up and the admin signs in', !!login.token)
const id = jwt.verify(login.token, SECRET).id
const now = Math.floor(Date.now() / 1000)

// ---- renewal ----------------------------------------------------------------
let r = await me(login.token)
ok('a fresh session is not renewed', r.ok && !r.headers.get('x-session-token'))
const week = jwt.sign({ id, iat: now - 13 * 3600, exp: now - 13 * 3600 + 7 * 86400 }, SECRET)
r = await me(week)
const fresh = r.headers.get('x-session-token')
ok('a week-long session half a day old is answered with a fresh one', r.ok && !!fresh)
const f = fresh ? jwt.verify(fresh, SECRET) : {}
ok('…for the same person, a week long again', f.id === id && f.exp - f.iat === 7 * 86400, JSON.stringify(f))
ok('…and the fresh one works', (await me(fresh)).ok)
const short = jwt.sign({ id, iat: now - 7 * 3600, exp: now + 5 * 3600 }, SECRET) // 12 hours, past half
const s2 = (await me(short)).headers.get('x-session-token')
ok('a session without "remember me" is renewed past half its life, and stays short', !!s2 && (() => { const x = jwt.verify(s2, SECRET); return x.exp - x.iat === 12 * 3600 })())
const gone = jwt.sign({ id, iat: now - 8 * 86400, exp: now - 86400 }, SECRET)
r = await me(gone)
ok('an expired session is refused, not renewed', r.status === 401 && !r.headers.get('x-session-token'))
r = await me(null)
ok('no token at all is "Not authenticated"', r.status === 401 && (await r.json()).error === 'Not authenticated')
const key = await (await fetch(BASE + '/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` }, body: JSON.stringify({ name: 'suite' }) })).json()
if (key.key) {
  r = await me(key.key)
  ok('an access key is never renewed into a session', r.ok && !r.headers.get('x-session-token'))
}

// ---- the client, read as source ----------------------------------------------
const src = (p) => readFileSync(join(ROOT, p), 'utf8')
const api = src('client/src/lib/api.js')
ok('the client keeps a renewed token where the old one was', /x-session-token/.test(api) && /renew\(res\)/.test(api))
ok('…every fetch path renews and notices an ended session — the calls, the pictures and the live-sync polls',
  (api.match(/renew\(res\)/g) || []).length >= 2 && (api.match(/signedOut\(had\)/g) || []).length >= 3 && (api.match(/const had = !!getToken\(\)/g) || []).length >= 3)
ok('a 401 to a request that carried a token signs the person out of the app', /satashkent:signed-out/.test(api) && /signedOut\(had\)/.test(api))
ok('…and the app listens, so Protected sends them to the sign-in and back', /satashkent:signed-out/.test(src('client/src/lib/auth.jsx')))
const status = src('client/src/lib/driveStatus.js')
ok('a Drive check that failed is "unknown", never "off"', /setOn\('unknown'\)/.test(status) && !/catch\([^)]*\)\s*=>\s*setOn\('off'\)/.test(status))
for (const f2 of ['client/src/components/HandIn.jsx', 'client/src/components/UploadField.jsx']) {
  const s = src(f2)
  ok(`${f2.split('/').pop()}: the upload is hidden only when the server says Drive is off`,
    /useDriveOn\(\)/.test(s) && /!== 'off'/.test(s) && !/api\.cached\('\/drive\/status'\)/.test(s))
}
ok('the full task sheet offers the upload beside each delivery link', /<UploadField dropOnly/.test(src('client/src/components/ContentModal.jsx')))
ok('…and so does the stage gate', /<UploadField dropOnly/.test(src('client/src/components/StageGate.jsx')))

console.log(fails ? `\n${fails} CHECKS FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
