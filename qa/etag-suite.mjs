// Cheap 304s for the polls (24 Oct 2026): the board asks /content, the
// sidebar /content/counts, the Pravki lane /content/revisions/mine and the
// bell /notifications every few seconds, each with the ETag it was last
// given (client/src/lib/api.js conditionalGet). The server answers "nothing
// changed" BEFORE a single query — the tag is the data's write counter
// (db.js dataRev), whose reading, the day and the question — and a write
// anywhere turns it over.
//
//   node qa/etag-suite.mjs            (expects a server on :4090)
const BASE = process.env.BASE || 'http://localhost:4090'
let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }

const login = async (u, p) => (await (await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: u, password: p }),
})).json()).token
const T = await login('admin', 'admin123')
const req = async (p, m = 'GET', b, t = T, headers = {}) => {
  const r = await fetch(BASE + '/api' + p, {
    method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...headers },
    body: b ? JSON.stringify(b) : undefined,
  })
  const text = await r.text()
  let data = {}
  try { data = JSON.parse(text) } catch { /* a 304 has no body */ }
  return { status: r.status, data, etag: r.headers.get('etag'), length: text.length }
}
// The poll the way the browser makes it: If-None-Match and its own
// Cache-Control, so the "no-cache" the browser would otherwise add does not
// spoil the match.
const poll = (p, etag, t = T) => req(p, 'GET', undefined, t, { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' })

const POLLED = ['/content', '/content?department=instagram_main', '/content/counts', '/content/revisions/mine', '/notifications']

// ---- 1. every polled route carries a tag, and the tag answers 304 ----------
const tags = {}
for (const p of POLLED) {
  const first = await req(p)
  ok(`${p} answers 200 with an ETag`, first.status === 200 && !!first.etag, `${first.status} ${first.etag || 'no tag'}`)
  tags[p] = first.etag
  const again = await poll(p, first.etag)
  ok(`  …and 304 with no body to the same tag`, again.status === 304 && again.length === 0, `${again.status}, ${again.length} bytes`)
}

// ---- 2. two questions are two tags; two people are two tags -----------------
ok('the board and one channel of it are different tags', tags['/content'] !== tags['/content?department=instagram_main'])
const suffix = Date.now().toString(36).slice(-5)
const made = await req('/users', 'POST', {
  name: 'Etag Member', username: 'etag' + suffix, password: 'pw123456', role: 'member',
  departments: ['instagram_main'], permissions: {},
})
ok('a second person exists', made.status === 201 || made.status === 200, String(made.status))
const T2 = await login('etag' + suffix, 'pw123456')
const theirs = await req('/content/counts', 'GET', undefined, T2)
ok('their /content/counts is not the admin’s tag', theirs.status === 200 && theirs.etag && theirs.etag !== tags['/content/counts'])
const crossed = await poll('/content/counts', theirs.etag)
ok('  and the admin cannot be answered 304 with it', crossed.status === 200, String(crossed.status))

// ---- 3. a write anywhere turns every tag over -------------------------------
// Making that user was itself a write, so the tags from §1 are already stale:
// the counter is one for the whole database, not one per table.
for (const p of POLLED) {
  const after = await poll(p, tags[p])
  ok(`${p}: a write elsewhere means 200 and a new tag`, after.status === 200 && after.etag && after.etag !== tags[p], `${after.status} ${after.etag}`)
  tags[p] = after.etag
}
const task = await req('/content', 'POST', { title: 'Etag ' + suffix, channels: ['instagram_main'], type: 'post' })
ok('a task is made', task.status === 201 || task.status === 200, String(task.status))
const list = await poll('/content', tags['/content'])
ok('the board poll sees it: 200 and the task in the body', list.status === 200 && Array.isArray(list.data) && list.data.some((t) => t.title === 'Etag ' + suffix))
const bell = await poll('/notifications', tags['/notifications'])
ok('the bell turns over too', bell.status === 200 && bell.etag !== tags['/notifications'])
// A quiet board stays 304 again from the new tag.
const quiet = await poll('/content', list.etag)
ok('and settles back to 304 once nothing moves', quiet.status === 304, String(quiet.status))

// ---- 4. a plain GET without a tag is never 304 ------------------------------
const bare = await req('/content/counts')
ok('a first ask (no If-None-Match) is 200', bare.status === 200 && !!bare.data.channels)

if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1) }
console.log('\nAll etag checks passed')
