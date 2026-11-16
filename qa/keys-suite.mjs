// Access keys and the board's tools for Claude (routes/keys.js, auth.js,
// mcp/satashkent.mjs).
//
// A person makes a key under Profile; with it, Claude is that person on the
// board — no more, no less — until the key is revoked. A key cannot make more
// keys. The connector speaks MCP over stdio and turns names into ids: told
// "Instagram, Bekzod edits, out on Friday" it makes that task, finds it,
// changes it and deletes it, and the board's own refusals come back as words.
//
// Self-contained: API :4145.
//   DASHB_ROOT=$PWD node qa/keys-suite.mjs
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import readline from 'readline'

const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
const BASE = 'http://localhost:4145'

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const procs = []
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL') } catch { /* gone */ } } })
procs.push(spawn(process.execPath, [join(ROOT, 'server/index.js')], {
  env: { ...process.env, DATA_DIR: join(tmpdir(), `keys-${Date.now()}`), PORT: '4145', GITHUB_DATA_TOKEN: '', GH_DATA_TOKEN: '', DATABASE_URL: '', CRON_SECRET: '', TELEGRAM_BOT_TOKEN: '', GEMINI_API_KEY: '' },
  stdio: 'ignore',
}))
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500))
}

const login = async (u, p) => (await (await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }),
})).json()).token
const req = async (p, m = 'GET', b, t) => {
  const r = await fetch(BASE + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: b ? JSON.stringify(b) : undefined })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}
const T = await login('admin', 'admin123')
const chKey = (await req('/channels', 'GET', null, T)).data.find((c) => c.format === 'social')?.key
const chName = (await req('/channels', 'GET', null, T)).data.find((c) => c.key === chKey)?.label
await req('/users', 'POST', { name: 'Bekzod Editor', username: 'k_ed', password: 'probe1234', role: 'editor', departments: [] }, T)
const mem = (await req('/users', 'POST', { name: 'Malika Member', username: 'k_mem', password: 'probe1234', role: 'member', departments: [chKey] }, T)).data
const TM = await login('k_mem', 'probe1234')

// ===================== the key =====================
let r = await req('/keys', 'POST', { name: 'Claude on my PC' }, T)
const KEY = r.data.key
ok('a key is made and shown once', r.status === 201 && /^sat_[A-Za-z0-9_-]{43}$/.test(KEY || '') && r.data.tail === KEY.slice(-4), JSON.stringify({ s: r.status, tail: r.data.tail }))
r = await req('/keys', 'GET', null, T)
ok('…the list shows its name and last four, never the key', r.data.length === 1 && r.data[0].tail === KEY.slice(-4) && !JSON.stringify(r.data).includes(KEY))
r = await req('/auth/me', 'GET', null, KEY)
ok('with the key, Claude is the person who made it', r.status === 200 && (r.data.user?.username || r.data.username) === 'admin', JSON.stringify(r.data).slice(0, 120))
ok('a key cannot make more keys', (await req('/keys', 'POST', {}, KEY)).status === 403 && (await req('/keys', 'GET', null, KEY)).status === 403)
const MK = (await req('/keys', 'POST', {}, TM)).data.key
ok('a member’s key has a member’s reach — no admin pages', (await req('/telegram/admin', 'GET', null, MK)).status === 403)
ok('a made-up key is refused', (await req('/content', 'GET', null, 'sat_' + 'x'.repeat(43))).status === 401)

// ===================== the connector =====================
const mcp = spawn(process.execPath, [join(ROOT, 'mcp/satashkent.mjs')], { env: { ...process.env, SATASHKENT_URL: BASE, SATASHKENT_KEY: KEY }, stdio: ['pipe', 'pipe', 'ignore'] })
procs.push(mcp)
const waiting = new Map()
readline.createInterface({ input: mcp.stdout }).on('line', (l) => { const m = JSON.parse(l); waiting.get(m.id)?.(m); waiting.delete(m.id) })
let n = 0
const rpc = (method, params) => new Promise((res) => { const id = ++n; waiting.set(id, res); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n') })
const call = async (name, args = {}) => {
  const m = await rpc('tools/call', { name, arguments: args })
  const text = m.result?.content?.[0]?.text || ''
  let json = null
  try { json = JSON.parse(text) } catch { json = null }
  return { error: !!m.result?.isError, text, json }
}

let m = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'suite', version: '1' } })
ok('the connector introduces itself as the board', m.result?.serverInfo?.name === 'satashkent' && !!m.result.capabilities?.tools)
m = await rpc('tools/list', {})
const names = (m.result?.tools || []).map((t) => t.name)
ok('…and offers the task tools', ['board_lookup', 'find_tasks', 'get_task', 'create_task', 'update_task', 'comment_on_task', 'delete_task'].every((x) => names.includes(x)), names.join(', '))
let c = await call('board_lookup')
ok('it reads channels, stages and people by name', c.json?.people?.some((p) => p.name === 'Bekzod Editor') && c.json.stages.length > 2 && c.json.channels.length > 0)

const friday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(Date.now() + 4 * 864e5))
c = await call('create_task', { title: 'Claude: the open-day reel', channel: chName, type: 'video', editor: 'Bekzod', owners: ['Malika'], release_date: friday, description: 'Students walk through the building' })
ok('told in words, it creates the task — names turned into the right people', !c.error && c.json?.created?.editor === 'Bekzod Editor' && c.json.created.owners.includes('Malika Member') && c.json.created.release_date === friday, c.text.slice(0, 200))
const id = c.json?.created?.id
r = await req(`/content/${id}`, 'GET', null, T)
ok('…it is on the board, as a task like any other', r.status === 200 && r.data.title === 'Claude: the open-day reel')
c = await call('find_tasks', { text: 'open-day' })
ok('it finds it again by words in the title', c.json?.tasks?.some((t) => t.id === id))
c = await call('update_task', { id, title: 'Claude: the open-day reel (v2)', tz: 'Cut to 30 s, captions in Uzbek' })
ok('it changes only what it is told', !c.error && c.json?.updated?.title === 'Claude: the open-day reel (v2)' && c.json.updated.editor === 'Bekzod Editor', c.text.slice(0, 160))
c = await call('get_task', { id })
ok('…and reads it back in full', c.json?.tz === 'Cut to 30 s, captions in Uzbek' && /\/brief\?task=/.test(c.json.link))
c = await call('comment_on_task', { id, text: 'Made by Claude for the owner.' })
ok('it can write in the task’s talk', !c.error)
c = await call('create_task', { title: 'Who?', channel: chName, editor: 'Nobody Atall' })
ok('a person the board does not know is refused, with the names it knows', c.error && /No person called “Nobody Atall”/.test(c.text), c.text)
c = await call('create_task', { title: 'No channel at all' })
ok('the board’s own rules still decide, and say why', c.error && /platform/i.test(c.text), c.text)
c = await call('delete_task', { id })
ok('deleting needs confirm: true', c.error && /confirm/.test(c.text))
c = await call('delete_task', { id, confirm: true })
ok('…then it is gone', !c.error && (await req(`/content/${id}`, 'GET', null, T)).status === 404)

// ===================== revoked =====================
const kid = (await req('/keys', 'GET', null, T)).data[0].id
ok('revoking takes one press', (await req(`/keys/${kid}`, 'DELETE', null, T)).status === 200)
ok('…and the key stops at once', (await req('/content', 'GET', null, KEY)).status === 401)
c = await call('find_tasks')
ok('…the connector says so plainly', c.error && /revoked/.test(c.text), c.text)
void mem

console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
