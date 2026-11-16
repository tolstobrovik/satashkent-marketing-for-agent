// Where the app lives. Defaults to the sandbox path these suites were
// written in, so nothing changes there; set DASHB_ROOT to run them on a
// laptop or in CI, where the checkout is somewhere else entirely.
const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
// GitHub-storage test suite against the mock GitHub API. Verifies the
// optimized driver end-to-end: cold-start call count, ETag 304 polling,
// no-op flush skipping, two-instance conflict healing, and squash.
import { spawn } from 'child_process'
import { rmSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

// MOCK_PORT moves the suite off :9977 when another run holds it (12 Nov 2026);
// ci.sh starts the mock on 9977 and passes nothing, so CI is unchanged.
const MOCK = `http://localhost:${process.env.MOCK_PORT || 9977}`
const REPO = process.env.REPO_DIR || ROOT
// The server, started the way pm2 starts it.
const SERVER = REPO + '/server/index.js'

// The scratch DATA_DIRs these instances stand on. os.tmpdir() rather than the
// literal "/tmp", which on Windows is a path on whichever drive happens to be
// current — and the `rm -rf` that used to clear them went through cmd.exe,
// which has never heard of `rm`. It threw on the first line, so the suite
// never got as far as booting anything. On Linux os.tmpdir() is /tmp unless
// TMPDIR says otherwise, so CI keeps the directories it always had.
const TMP = (name) => join(tmpdir(), name)
const wipe = (...names) => { for (const n of names) rmSync(TMP(n), { recursive: true, force: true }) }
let fails = 0
const ok = (name, cond, extra = '') => {
  if (!cond) fails++
  console.log(`${cond ? '✔' : '✘ FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
}
const calls = async () => (await fetch(`${MOCK}/__calls`)).json()
const resetCalls = () => fetch(`${MOCK}/__reset`, { method: 'POST' })
const sum = (c) => Object.values(c).reduce((a, b) => a + b, 0)

// 12 Nov 2026: since 24 Oct 2026 every running instance pulls the branch on
// its own 4 s clock (startTicker in server/db.js: "watched by the clock, not
// by the requests"); before, it pulled only when a request came in. The checks
// below that measure what ONE new instance does — its cold-start cost, and
// that it uploads nothing over a damaged copy — were written in the earlier
// world, and counted the other instances' ticks with it: "{"contents-get":3}"
// for a two-call boot, and a running instance putting a whole copy back over
// the damaged one while the fresh one was still being watched. `alone` has the
// mock refuse every token but the new instance's for that measurement (the
// others' polls come back 401 and are counted apart, as unauthorized-401), and
// `own` reads the calls without those refusals. A new instance that is refused
// itself makes no counted call, so `own` cannot pass on nothing. Each such
// instance has a token of its own (B, C and E below), so a later one is never
// let through with an earlier one beside it.
const solo = (who) => `gh-suite-solo-${who}`
const alone = (who) => fetch(`${MOCK}/__require`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: who ? solo(who) : null }),
})
const own = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'unauthorized-401'))

// Start an app "instance" (a fresh server process)
// on a port, with its own DATA_DIR (its own /tmp).
const instances = []
// 12 Nov 2026: a copy whose server/config.js says GITHUB_DATA = null (the demo
// copy) runs on a local file whatever the environment says, and every check
// below read storage "file" ("first boot healthy" and all that follow). The
// hook (qa/gh-config-hook.mjs, shared with round54/55/57) hands such a copy a
// repository description, and the token below switches GitHub mode on, as the
// REPLACE_WITH placeholder in a real config.js does; where config.js names a
// data branch the hook changes nothing. The first check still demands
// storage === 'github', so a copy that stays on the file cannot pass.
const HOOK = new URL('./gh-config-hook.mjs', import.meta.url).href
// PORT_SHIFT moves every instance by that many ports, for a run beside another
// that holds 4091–4104 (12 Nov 2026: gh500-suite shares 4096–4103). CI sets
// nothing and keeps these ports.
const PORT_SHIFT = Number(process.env.GH_SUITE_PORT_SHIFT || 0)
const START_LIMIT = 60000
async function startInstance(port, dir, env = {}) {
  port += PORT_SHIFT
  const child = spawn('node', ['--import', HOOK, SERVER], {
    env: {
      ...process.env,
      GITHUB_API_BASE: MOCK,
      GITHUB_DATA_FORCE: '1',
      GITHUB_DATA_TOKEN: 'gh-suite-mock-token', GITHUB_DATA_REPO: 'x/y', GITHUB_DATA_BRANCH: 'appdata',
      DATA_DIR: dir, PORT: String(port),
      PATH: process.env.PATH,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  instances.push(child)
  // "instance exited 1" is what this said when somebody else's server was on
  // the port, which sent a whole gate run looking for a bug in the storage
  // layer. The regression gate's boot_api had refused to run against a stranger's
  // server for two rounds now, for exactly this reason; this block spawns its
  // own instance and never learned. A port already answering is named as that
  // before anything is started, and a death is reported with what the process
  // actually said.
  try {
    const held = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1500) })
    if (held.ok) throw new Error(`PORT ${port} IS ALREADY HELD — something else is answering there, so this suite would have tested somebody else's server`)
  } catch (e) {
    if (String(e.message).startsWith('PORT ')) throw e   // ours; anything else means the port is free
  }
  let said = ''
  child.stdout.on('data', (d) => { said += d.toString() })
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { if (d.toString().includes('API listening')) resolve() })
    child.on('exit', (c) => reject(new Error(
      `instance exited ${c}${said.trim() ? ` — it said: ${said.trim().slice(-300)}` : ' with nothing on stdout'}`)))
    // 12 Nov 2026: once, on a Windows machine at 100% CPU (some forty node
    // processes from parallel runs), the twins of section 10 had not said
    // "API listening" after 15 s and every check after them never ran. The
    // same boots measured 1.3–1.9 s at 72% CPU, so load is the inferred cause.
    // The server listens before it boots the database (index.js), so this
    // waits on node starting, not on GitHub. The limit is a ceiling, not a
    // check, and the error names the port and the wait.
    setTimeout(() => reject(new Error(`instance start timeout — no "API listening" from :${port} after ${START_LIMIT / 1000} s`)), START_LIMIT)
  })
  return {
    req: async (path, { method = 'GET', body, token } = {}) => {
      const res = await fetch(`http://localhost:${port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      let data = {}
      try { data = await res.json() } catch { /* empty */ }
      return { status: res.status, data }
    },
  }
}

wipe('ghtest-a', 'ghtest-b', 'ghtest-c')

// === 0. A database that has lost itself is never uploaded ===
// 9 October 2026: two copies of the app restarted together on one data
// directory; one read the file half-written, seeded a fresh database and
// uploaded it over the team's. These hold the three things that now stand in
// the way, and the deploy that starts one copy.
{
  const { pagesOf, lostItself } = await import(pathToFileURL(REPO + '/server/ghstore.js').href)
  const image = (pages, length = pages * 4096) => {
    const b = Buffer.alloc(Math.max(length, 100))
    b.write('SQLite format 3\0', 0, 'latin1')
    b.writeUInt16BE(4096, 16); b.writeUInt32BE(7, 24); b.writeUInt32BE(pages, 28); b.writeUInt32BE(7, 92)
    return b
  }
  ok('a database image says how many pages it holds', pagesOf(image(3561)) === 3561)
  ok('…by its own header, not its length: the wiped one was 131 pages in a 14 MB file', pagesOf(image(131, 3561 * 4096)) === 131)
  ok('…and what is not a database holds none', pagesOf(Buffer.from('not a database')) === 0 && pagesOf(null) === 0)
  ok('3,561 pages becoming 131 is another database, not an edit', lostItself(3561, 131) === true)
  ok('…a vacuum that drops a few free pages is an edit', lostItself(3561, 3466) === false)
  ok('…and a small database may do as it likes', lostItself(131, 20) === false)
  const db = readFileSync(REPO + '/server/db.js', 'utf8').replace(/\r\n/g, '\n')
  const push = db.slice(db.indexOf('const pushOnce = async'), db.indexOf('let inFlight = null'))
  // The upload streams a copy of the file (`snap`) and reads its page count
  // off the copy's first hundred bytes — the question is asked of that copy,
  // before a byte of it is sent (23 Oct 2026).
  const asks = push.indexOf('lostItself(cleanPages, sentPages)')
  ok('the upload asks that question before it sends anything', asks > 0 && asks < push.indexOf('store.push(snap)'))
  ok('…and takes the stored copy back instead', /store\.forget\(\)\s+await sync\(\)/.test(push))
  ok('…the squash, which rewrites the whole branch, asks it too',
    /squash: async \(\) => \{[\s\S]*?lostItself\(cleanPages, pages\)[\s\S]*?store\.squash\(snap\)/.test(db))
  // 23–26 Oct 2026: with every upload refused, the flush's join gave up after
  // four rounds and started a second pushOnce beside the first; both used one
  // snapshot and each removed it under the other (thousands of ENOENT lines).
  const flushFn = db.slice(db.indexOf('const flush = async'), db.indexOf('return {', db.indexOf('const flush = async')))
  ok('a flush never starts an upload beside one in the air', !/for \(let i = 0/.test(flushFn) && /if \(!inFlight\) \{[\s\S]*?occupy\(pushOnce\)/.test(flushFn))
  ok('…and the squash takes the same slot', /while \(inFlight\) await inFlight[\s\S]*?await occupy\(async/.test(db.slice(db.indexOf('squash: async () => {'))))
  const gh = readFileSync(REPO + '/server/ghstore.js', 'utf8').replace(/\r\n/g, '\n')
  const sq = gh.slice(gh.indexOf('async squash(src)'))
  ok('the squash never deletes the data branch', !/DELETE/.test(sq) && !/ensureBranch/.test(sq))
  ok('…it uploads the file, makes the commit, and moves the branch last',
    sq.indexOf('git/blobs') < sq.indexOf('git/trees') && sq.indexOf('git/trees') < sq.indexOf('git/commits') && sq.indexOf('git/commits') < sq.indexOf("'PATCH'"))
  ok('the file is never written half-way at start: beside its name, under this process’s own, then renamed',
    db.includes('const tmp = `${file}.${process.pid}.tmp`') && /writeFileSync\(tmp, bytes\)/.test(db) && /else renameSync\(tmp, file\)/.test(db))
  ok('…and what is open must be what was downloaded', /PRAGMA page_count/.test(db) && /seen !== cleanPages/.test(db))
  ok('a copy with no users is never seeded over stored data', /heldData\?\.\(\)\) throw new Error\('refusing to seed/.test(db))
  // the demo repository has no deploy.sh (it deploys nowhere); the pin applies where there is one
  if (existsSync(REPO + '/deploy.sh')) {
  const sh = readFileSync(REPO + '/deploy.sh', 'utf8')
  ok('the deploy starts exactly one copy', sh.includes('pm2 delete marketing-dashboard') && sh.indexOf('pm2 delete marketing-dashboard') < sh.indexOf('pm2 startOrReload'))
  }
}

// === 1. Very first boot ever: branch created, seed uploaded ===
await resetCalls()
const A = await startInstance(4091, TMP('ghtest-a'))
let r = await A.req('/health')
ok('first boot healthy', r.status === 200 && r.data.storage === 'github')
const loginA = await A.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
ok('admin login on first boot', loginA.status === 200 && !!loginA.data.token)
const TA = loginA.data.token
// Let the post-response flush land. 12 Nov 2026: a fixed 300 ms was not
// enough on a busy Windows machine (the upload copies and hashes the file
// first): the put came after the check, and B then booted onto a branch with
// no database and seeded a second copy of the board. The wait is for the
// upload, never longer than 10 s, and the check is the same.
for (let i = 0; i < 50 && !((await calls())['contents-put'] > 0); i++) await new Promise((r2) => setTimeout(r2, 200))
await new Promise((r2) => setTimeout(r2, 300))
let c = await calls()
ok('seed flushed to repo', (c['contents-put'] || 0) >= 1, JSON.stringify(c))
const seedBytes = Buffer.from(await (await fetch(`${MOCK}/repos/x/y/contents/data/dashboard.db?ref=appdata`,
  { headers: { Accept: 'application/vnd.github.raw+json' } })).arrayBuffer())

// === 2. Warm cold start: a second instance boots from existing data ===
await alone('b') // A's clock keeps polling; only B's calls are counted
await resetCalls()
const B = await startInstance(4092, TMP('ghtest-b'), { GITHUB_DATA_TOKEN: solo('b') })
await B.req('/health') // forces the lazy init to complete
await new Promise((r2) => setTimeout(r2, 300))
c = own(await calls())
await alone(null)
ok('cold start costs ≤2 GitHub calls', sum(c) >= 1 && sum(c) <= 2, JSON.stringify(c))
ok('cold start needs no branch/tree calls', !c['ref-get'] && !c['tree-get'], JSON.stringify(c))
const loginB = await B.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
ok('login works on second instance', loginB.status === 200)
const TB = loginB.data.token

// === 3. Read-only traffic causes zero uploads and 304 polls ===
await resetCalls()
await new Promise((r2) => setTimeout(r2, 4200)) // let the sync TTL lapse
await B.req('/channels', { token: TB })
await new Promise((r2) => setTimeout(r2, 300))
c = await calls()
ok('read-only request uploads nothing', !c['contents-put'], JSON.stringify(c))

// === 4. Cross-instance sync: A writes, B sees it after TTL ===
const task = await A.req('/content', { method: 'POST', token: TA, body: { title: 'Optimize everything', channels: ['youtube'], type: 'post' } })
ok('A creates task', task.status === 201 || task.status === 200, String(task.status))
await new Promise((r2) => setTimeout(r2, 4500)) // flush + B's sync TTL
const bView = await B.req('/content', { token: TB })
ok('B sees A\'s task after one sync interval', !!bView.data.find?.((t) => t.title === 'Optimize everything'))

// === 5. Two-instance write conflict heals via journal replay ===
// B is now fresh; write on B and on A back-to-back without letting the other pull.
const tB = await B.req('/content', { method: 'POST', token: TB, body: { title: 'From B', channels: ['youtube'], type: 'post' } })
await new Promise((r2) => setTimeout(r2, 300))
const tA = await A.req('/content', { method: 'POST', token: TA, body: { title: 'From A', channels: ['youtube'], type: 'post' } })
ok('both writes accepted', tB.status === 201 && tA.status === 201, `${tB.status}/${tA.status}`)
await new Promise((r2) => setTimeout(r2, 4500))
const merged = await B.req('/content', { token: TB })
const titles = (merged.data || []).map((t) => t.title)
ok('conflict merged: both tasks in one copy', titles.includes('From A') && titles.includes('From B'), titles.join(', '))

// === 6. No-op writes do not create commits (hash skip) ===
await resetCalls()
const h = await A.req('/health') // triggers ready→initSchema only on fresh boot; use a real no-op instead:
await A.req('/cron/daily') // snapshots — may write; so measure a pure GET after
await new Promise((r2) => setTimeout(r2, 300))
c = await calls()
const putsAfterCron = c['contents-put'] || 0
await resetCalls()
await A.req('/channels', { token: TA })
await new Promise((r2) => setTimeout(r2, 300))
c = await calls()
ok('plain GET after cron flushes nothing', !c['contents-put'], JSON.stringify(c))
ok('health stayed ok', h.status === 200)

// === 7. Fresh instance after squash still boots clean ===
await A.req('/cron/daily') // includes squash
await new Promise((r2) => setTimeout(r2, 500))
await alone('c') // A's and B's clocks keep polling; only C's calls are counted
await resetCalls()
const C = await startInstance(4093, TMP('ghtest-c'), { GITHUB_DATA_TOKEN: solo('c') })
await C.req('/health')
await new Promise((r2) => setTimeout(r2, 300))
c = own(await calls())
await alone(null)
ok('post-squash cold start ≤2 calls', sum(c) >= 1 && sum(c) <= 2, JSON.stringify(c))
const loginC = await C.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
ok('login works after squash on new instance', loginC.status === 200)
const cView = await C.req('/content', { token: loginC.data.token })
const cTitles = (cView.data || []).map((t) => t.title)
ok('data intact after squash', cTitles.includes('From A') && cTitles.includes('From B'), cTitles.join(', '))

// === 8. A boot beside a dead process's journal (12 Oct 2026) ===
// The process was killed mid-write and left dashboard.db-journal behind. The
// next boot downloads a fresh copy over dashboard.db; SQLite must not take the
// old journal for this file's own and roll a different database's pages into
// it ("malformed", then "no such table: main.users"). The journal here is a
// real one, taken from an open transaction on another database.
{
  const { createClient } = await import('@libsql/client')
  wipe('ghtest-d', 'ghtest-other')
  mkdirSync(TMP('ghtest-d'), { recursive: true })
  mkdirSync(TMP('ghtest-other'), { recursive: true })
  const other = join(TMP('ghtest-other'), 'other.db')
  const oc = createClient({ url: `file:${other}` })
  await oc.executeMultiple(`CREATE TABLE stuff (id INTEGER PRIMARY KEY, b BLOB);
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2000)
    INSERT INTO stuff (b) SELECT randomblob(400) FROM n;`)
  await oc.execute('PRAGMA cache_size = 10') // small, so the transaction spills and its journal is synced
  const tx = await oc.transaction('write')
  await tx.execute('UPDATE stuff SET b = randomblob(400)')
  const journal = `${other}-journal`
  const built = existsSync(journal) && statSync(journal).size > 4096
  ok('a hot journal was built for the test', built, built ? `${statSync(journal).size} bytes` : 'no journal on disk')
  copyFileSync(join(TMP('ghtest-a'), 'dashboard.db'), join(TMP('ghtest-d'), 'dashboard.db'))
  if (built) copyFileSync(journal, join(TMP('ghtest-d'), 'dashboard.db-journal'))
  tx.close()
  oc.close()

  const D = await startInstance(4094, TMP('ghtest-d'))
  r = await D.req('/health')
  ok('boot beside a stale journal is healthy', r.status === 200, String(r.status))
  const loginD = await D.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
  ok('login works after it', loginD.status === 200, String(loginD.status))
  const dView = await D.req('/content', { token: loginD.data.token })
  const dTitles = (dView.data || []).map?.((t) => t.title) || []
  ok('the downloaded data, not the journal’s', dTitles.includes('From A') && dTitles.includes('From B'), dTitles.join(', '))
}

// === 9. A damaged copy on the branch stops at the door ===
// A fresh instance with nothing of its own refuses it — and above all does not
// boot onto an empty database and upload the seed over the team's data. A
// running instance keeps its own copy and puts a whole one back.
{
  const fileNow = async () => (await fetch(`${MOCK}/__file`)).json()
  // 12 Nov 2026: the running instances (A–D) pull on their own 4 s clock and
  // put a whole copy back within a tick of the damage, while E — slow to boot
  // on Windows — was still being watched; the two checks below then read
  // their upload as E's (2 runs in 3 red). E is the only one let through
  // until its checks are done; the healing is the second half, below.
  await alone('e')
  const { blobSha: damaged } = await (await fetch(`${MOCK}/__damage`, { method: 'POST' })).json()
  await resetCalls()
  wipe('ghtest-e')
  const E = await startInstance(4104, TMP('ghtest-e'), { GITHUB_DATA_TOKEN: solo('e') }) // 12 Nov 2026: was 4095, the port ci.sh's browser group serves on
  r = await E.req('/health')
  await new Promise((r2) => setTimeout(r2, 500))
  c = own(await calls())
  // …and E did read the branch: a refused E would upload nothing too.
  ok('a fresh instance uploads nothing over a damaged copy', !c['contents-put'] && (c['contents-get'] || 0) >= 1, JSON.stringify(c))
  ok('the damaged copy is still the one on the branch', (await fileNow()).blobSha === damaged)
  const loginE = await E.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
  ok('and it does not sign anybody in to a seeded database', loginE.status !== 200, String(loginE.status))
  await alone(null)

  await new Promise((r2) => setTimeout(r2, 4200)) // A's clock comes round and pulls the damaged copy
  const aView = await A.req('/content', { token: TA })
  const aTitles = (aView.data || []).map?.((t) => t.title) || []
  ok('a running instance keeps serving its own copy', aView.status === 200 && aTitles.includes('From A'), String(aView.status))
  await new Promise((r2) => setTimeout(r2, 1500))
  const healed = await fileNow()
  ok('and puts a whole copy back on the branch', !!healed.blobSha && healed.blobSha !== damaged)

  wipe('ghtest-f')
  const F = await startInstance(4096, TMP('ghtest-f'))
  const loginF = await F.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
  const fView = await F.req('/content', { token: loginF.data?.token })
  const fTitles = (fView.data || []).map?.((t) => t.title) || []
  ok('a fresh instance boots from the healed copy', loginF.status === 200 && fTitles.includes('From A'), fTitles.join(', '))
}

// === 10. Two copies starting in the same second on ONE data directory ===
// What the server did on 9 October 2026: pm2 held two copies of the app, and a
// deploy reloads both at once. Whatever each of them makes of the file they
// share, the stored database must come out of it with the team's work in it.
wipe('ghtest-twin', 'ghtest-g')
const [D1, D2] = await Promise.all([startInstance(4097, TMP('ghtest-twin')), startInstance(4098, TMP('ghtest-twin'))])
// Each is asked to sign in at once: the boot, the seed check and the first
// flush all happen here. A boot that refuses a file it cannot trust is retried.
const signIn = async (inst) => {
  for (let i = 0; i < 8; i++) {
    const res = await inst.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
    if (res.status === 200) return res.data.token
    await new Promise((r2) => setTimeout(r2, 500))
  }
  return null
}
const up = (await Promise.all([signIn(D1), signIn(D2)])).filter(Boolean).length
await new Promise((r2) => setTimeout(r2, 1500))
// How many of the two came up is not the promise: sharing one file, a copy
// may refuse to start on what it finds there (and on Windows, where the file
// cannot be renamed into place, one usually does). The promise is what a
// third, on a directory of its own, then reads back from the store.
const G = await startInstance(4099, TMP('ghtest-g'))
const loginG = await G.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
const eTitles = ((await G.req('/content', { token: loginG.data.token })).data || []).map((t) => t.title)
ok('two copies starting at once on one data directory leave the stored database with the team’s work in it',
  loginG.status === 200 && eTitles.includes('From A') && eTitles.includes('From B'), `${up} of 2 came up · ${eTitles.join(', ').slice(0, 90)}`)

// === 11. A squash whose upload fails leaves the branch exactly as it was ===
// 24 Oct 2026, 05:05: the nightly squash deleted `appdata`, recreated it from
// main and could not upload (307, the repository had moved). GitHub held no
// database, and the next boot seeded a blank one over the team's day. The
// squash now goes blob → tree → commit → move the branch, so a failure
// anywhere before the last step touches nothing.
const fileNow = async () => (await fetch(`${MOCK}/__file`)).json()
const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
{
  await fetch(`${MOCK}/__fail`, json({ path: 'git/blobs', n: 5 }))
  await resetCalls()
  const night = await A.req('/cron/daily')
  c = await calls()
  const now = await fileNow()
  ok('the nightly job says the squash did not land', night.status === 200 && night.data.squashed === false, JSON.stringify(night.data))
  // The night's own writes (the KPI stamps) go up as an ordinary flush first,
  // so the head may move by a contents-put. What must not happen: the branch
  // deleted, recreated or moved, or left with no database on it.
  ok('a squash whose upload fails leaves the branch holding the database', !!now.blobSha && !!now.head, JSON.stringify(now))
  ok('…and never deletes, recreates or moves the branch', !c['ref-delete'] && !c['ref-create'] && !c['ref-update'], JSON.stringify(c))
  wipe('ghtest-h0')
  const H0 = await startInstance(4100, TMP('ghtest-h0'))
  const loginH0 = await H0.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
  const t0 = ((await H0.req('/content', { token: loginH0.data?.token })).data || []).map?.((t) => t.title) || []
  ok('a fresh instance still boots with the team’s work in it', loginH0.status === 200 && t0.includes('From A') && t0.includes('From B'), t0.join(', ').slice(0, 90))
  await fetch(`${MOCK}/__fail`, json({ n: 0 }))
  await resetCalls()
  const night2 = await A.req('/cron/daily')
  c = await calls()
  const after = await fileNow()
  ok('the next night’s squash lands', night2.data.squashed === true && after.head !== now.head && !!after.blobSha, JSON.stringify(night2.data))
  ok('…as one blob, one tree, one commit and one move of the branch — no delete',
    c['blob-create'] === 1 && c['tree-create'] === 1 && c['commit-create'] === 1 && c['ref-update'] === 1 && !c['ref-delete'], JSON.stringify(c))
  wipe('ghtest-h1')
  const H1 = await startInstance(4103, TMP('ghtest-h1'))
  const loginH1 = await H1.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
  const t1 = ((await H1.req('/content', { token: loginH1.data?.token })).data || []).map?.((t) => t.title) || []
  ok('a fresh instance boots from the squashed branch with the team’s work in it', loginH1.status === 200 && t1.includes('From A') && t1.includes('From B'), t1.join(', ').slice(0, 90))
}

// === 12. GitHub holds no database and this machine does: it is kept, and goes up ===
// 24 Oct 2026, 11:58: the restart found no file on the branch, removed the
// local file that held twenty hours of the team's writes as "stale leftovers",
// and seeded a blank one.
const { pagesOf: pagesOfImage } = await import(pathToFileURL(REPO + '/server/ghstore.js').href)
let H = null
{
  wipe('ghtest-h')
  mkdirSync(TMP('ghtest-h'), { recursive: true })
  copyFileSync(join(TMP('ghtest-a'), 'dashboard.db'), join(TMP('ghtest-h'), 'dashboard.db'))
  const localPages = pagesOfImage(readFileSync(join(TMP('ghtest-h'), 'dashboard.db')))
  // The branch goes — what the old squash did first, and what a failed upload
  // then left behind.
  await fetch(`${MOCK}/repos/x/y/git/refs/heads/appdata`, { method: 'DELETE' })
  ok('the branch holds nothing', (await fileNow()).blobSha === null)
  await resetCalls()
  H = await startInstance(4101, TMP('ghtest-h'))
  const hHealth = await H.req('/health')
  const loginH = await H.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
  const hTitles = ((await H.req('/content', { token: loginH.data?.token })).data || []).map?.((t) => t.title) || []
  ok('a boot that finds no database on GitHub keeps this machine’s', loginH.status === 200 && hTitles.includes('From A') && hTitles.includes('From B'), hTitles.join(', ').slice(0, 90))
  ok('…every page of it', hHealth.status === 200 && hHealth.data.pages === localPages, `${hHealth.data.pages} of ${localPages}`)
  await new Promise((r2) => setTimeout(r2, 1500))
  c = await calls()
  const stored = await fileNow()
  ok('…and uploads it to the empty branch', !!stored.blobSha && (c['contents-put'] || 0) >= 1, JSON.stringify(c))
  wipe('ghtest-i')
  const I = await startInstance(4102, TMP('ghtest-i'))
  const loginI = await I.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
  const iTitles = ((await I.req('/content', { token: loginI.data?.token })).data || []).map?.((t) => t.title) || []
  ok('a fresh instance boots from what it uploaded', loginI.status === 200 && iTitles.includes('From A'), iTitles.join(', ').slice(0, 90))
}

// === 13. A pulled copy with fewer pages leaves a dated copy beside the file ===
// 26 Oct 2026, 12:21: the sync pulled the stored copy (three days old) over the
// local file that held two more days of writes. The file is still replaced —
// the stored copy is the one every instance agrees on — but a copy of it is
// kept first, dashboard.db.<time>.kept, and the newest two stay.
{
  const dir = TMP('ghtest-h')
  const keptIn = () => readdirSync(dir).filter((n) => /^dashboard\.db\..+\.kept$/.test(n)).sort()
  const loginH = await H.req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
  // Enough work for the file to grow: forty tasks with a long brief each.
  for (let i = 0; i < 40; i++) {
    await H.req('/content', { method: 'POST', token: loginH.data.token,
      body: { title: `Day ${i}`, channels: ['youtube'], type: 'post', description: `brief ${i} `.repeat(1200) } })
  }
  await new Promise((r2) => setTimeout(r2, 1500))
  const before = (await H.req('/health')).data.pages
  // Two kept copies from "earlier", so the pruning shows.
  writeFileSync(join(dir, 'dashboard.db.2026-01-01T00-00-00.000Z.kept'), 'old')
  writeFileSync(join(dir, 'dashboard.db.2026-01-02T00-00-00.000Z.kept'), 'old')
  const { blobSha } = await fileNow()
  const older = pagesOfImage(seedBytes)
  ok('the file has grown past the seed', before > older, `${before} pages now, the seed ${older}`)
  const put = await fetch(`${MOCK}/repos/x/y/contents/data/dashboard.db`, { ...json({ message: 'the older copy', branch: 'appdata', sha: blobSha, content: seedBytes.toString('base64') }), method: 'PUT' })
  ok('the older, smaller copy is put on the branch', put.status === 200, String(put.status))
  await new Promise((r2) => setTimeout(r2, 4500)) // H's sync TTL lapses
  const pulled = await H.req('/channels', { token: loginH.data.token }) // the sync pulls it
  const health = await H.req('/health')
  const kept = keptIn()
  const newest = kept[kept.length - 1] || ''
  ok('the file as it was is kept beside it, dated', pulled.status === 200 && newest > 'dashboard.db.2026-01-02', kept.join(', '))
  ok('…whole, with every page the file had', !!newest && pagesOfImage(readFileSync(join(dir, newest))) === before, newest ? String(pagesOfImage(readFileSync(join(dir, newest)))) : 'no copy')
  ok('…and only the newest two stay', kept.length === 2, kept.join(', '))
  ok('the health line names it', Array.isArray(health.data.kept) && health.data.kept.includes(newest), JSON.stringify(health.data.kept))
  ok('the pulled copy is what is served now', health.data.pages === older, `${health.data.pages} pages`)
}

console.log(fails === 0 ? '\nAll storage checks passed.' : `\n${fails} CHECKS FAILED`)
for (const i of instances) i.kill()
process.exit(fails === 0 ? 0 : 1)
