// Heartbeats are added up in memory and written down later (routes/usage.js):
// the panel sees them at once, the database only after USAGE_DRAIN_MS, and a
// stop writes what is still in hand. Every write is an upload of the whole
// database in GitHub mode, and a beat a minute per open tab was the board's
// most frequent write (21 October 2026).
import { spawn } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createClient } from '@libsql/client'

const ROOT = process.env.DASHB_ROOT || process.cwd()
const PORT = 4186
let fails = 0
const ok = (name, cond, extra = '') => {
  if (!cond) fails++
  console.log(`${cond ? '✔' : '✘ FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const dir = mkdtempSync(join(tmpdir(), 'usage-batch-'))
const child = spawn(process.execPath, [join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, GITHUB_DATA_FORCE: '', NICE: '0', USAGE_DRAIN_MS: '2000' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let said = ''
child.stdout.on('data', (d) => { said += d })
child.stderr.on('data', (d) => { said += d })
const exited = new Promise((r) => child.on('exit', r))

const api = `http://localhost:${PORT}/api`
let up = false
for (let i = 0; i < 80 && !up; i++) {
  try { up = (await fetch(`${api}/health`)).ok } catch { /* not yet */ }
  if (!up) await wait(250)
}
ok('the server comes up', up)
const { token } = await (await fetch(`${api}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})).json()
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
const beat = (body) => fetch(`${api}/usage/beat`, { method: 'POST', headers: H, body: JSON.stringify(body) })

const file = join(dir, 'dashboard.db')
const seconds = async () => {
  const db = createClient({ url: `file:${file}` })
  try { return (await db.execute('SELECT seconds FROM usage_day')).rows.map((r) => Number(r.seconds)) } finally { db.close() }
}
const taps = async () => {
  const db = createClient({ url: `file:${file}` })
  try {
    return (await db.execute('SELECT kind, action, n FROM usage_tap')).rows.map((r) => `${r.kind}:${r.action}=${r.n}`).sort().join(',')
  } finally { db.close() }
}

for (let i = 0; i < 3; i++) {
  const r = await beat({ seconds: 60, taps: { Save: 2 }, pages: { '/brief': 1 } })
  ok(`beat ${i + 1} is taken`, r.status === 200, String(r.status))
}
ok('nothing reaches the database on the beat itself', (await seconds()).length === 0, JSON.stringify(await seconds()))

const panel = await (await fetch(`${api}/usage`, { headers: H })).json()
const me = (panel.rows || []).find((p) => p.name === 'Admin') || {}
ok('the panel already counts the three minutes', me.seconds === 180, JSON.stringify(me))
ok('…and opening it wrote them down', JSON.stringify(await seconds()) === '[180]', JSON.stringify(await seconds()))

await beat({ seconds: 30 })
ok('a later beat waits in memory', JSON.stringify(await seconds()) === '[180]', JSON.stringify(await seconds()))
await wait(3500)
ok('…and is written down by itself after USAGE_DRAIN_MS', JSON.stringify(await seconds()) === '[210]', JSON.stringify(await seconds()))
ok('taps and pages were added up, not written one by one', (await taps()) === 'page:/brief=3,tap:Save=6', await taps())

child.kill()
await exited

// A stop the process chooses itself — the memory guard's — writes what is
// still in hand before the port closes. A second server whose line is set
// below anything it could run in stops on the guard's first look (5 s);
// a beat sent before that is on disk after it. (Not a signal: on Windows a
// signal to a child is a kill, and the suite runs there too.)
const dirB = mkdtempSync(join(tmpdir(), 'usage-batch-'))
const childB = spawn(process.execPath, [join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(PORT + 1), DATA_DIR: dirB, GITHUB_DATA_FORCE: '', NICE: '0', MEM_SOFT_MB: '1', MEM_HARD_MB: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let saidB = ''
childB.stdout.on('data', (d) => { saidB += d })
childB.stderr.on('data', (d) => { saidB += d })
const exitedB = new Promise((r) => childB.on('exit', r))
const apiB = `http://localhost:${PORT + 1}/api`
up = false
for (let i = 0; i < 80 && !up; i++) {
  try { up = (await fetch(`${apiB}/health`)).ok } catch { /* not yet */ }
  if (!up) await wait(100)
}
const loginB = await (await fetch(`${apiB}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})).json()
const r = await fetch(`${apiB}/usage/beat`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginB.token}` },
  body: JSON.stringify({ seconds: 15 }),
})
ok('a beat lands on the second server before its guard looks', r.status === 200, String(r.status))
const code = await Promise.race([exitedB, wait(20000).then(() => 'still up')])
ok('the memory guard stops it', code !== 'still up' && /memory limit — shutting down/.test(saidB), String(code))
const dbB = createClient({ url: `file:${join(dirB, 'dashboard.db')}` })
const afterB = (await dbB.execute('SELECT seconds FROM usage_day')).rows.map((r) => Number(r.seconds))
dbB.close()
ok('…and what was still in memory is on disk', JSON.stringify(afterB) === '[15]', JSON.stringify(afterB))

if (fails) console.log(said.slice(-3000), saidB.slice(-3000))
for (const d of [dir, dirB]) { try { rmSync(d, { recursive: true, force: true }) } catch { /* Windows lets the file go a moment later */ } }
console.log(fails ? `\n${fails} failed` : '\nall good')
process.exit(fails ? 1 : 0)
