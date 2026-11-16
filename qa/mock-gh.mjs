// Mock GitHub API for testing the GitHub-as-database driver offline.
// Speaks the exact subset ghstore.js uses: ref read/create/update/delete,
// contents GET (object media type with ETag/304 + raw), contents PUT with sha
// CAS, blob raw GET and create, tree and commit create (the squash). Counts
// calls per category so tests can assert how many requests an operation
// costs. Control endpoints: GET /__calls, POST /__reset.
import http from 'http'
import { createHash } from 'crypto'

const PORT = Number(process.env.MOCK_PORT || 9977)
const sha1 = (buf) => createHash('sha1').update(buf).digest('hex')

// state
let branches = { main: { head: 'commit-main-0' } } // name -> { head }
let file = null      // { bytes, blobSha } on the appdata branch
let blobs = {}       // sha -> bytes, created through the git data API
let trees = {}       // sha -> [{ path, sha }]
let commits = {}     // sha -> { tree }
let commitN = 0
let etagN = 0
let currentEtag = null // etag of the current contents state
let calls = {}
let outage = false
let requireToken = null
let rateLimit = { left: 0, status: 403, after: 1, words: true }
let slowPut = 0  // ms to hold a contents PUT open, so a write can land mid-upload
let failing = null // { path, n, status }: the next n requests whose path has `path` in it fail
const count = (k) => { calls[k] = (calls[k] || 0) + 1 }
const bumpEtag = () => { currentEtag = `"etag-${++etagN}"` }
bumpEtag()

const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
    const url = new URL(req.url, 'http://x')
    const p = url.pathname
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
      res.end(data === undefined ? '' : (Buffer.isBuffer(data) ? data : JSON.stringify(data)))
    }

    // --- control ---
    if (p === '/__calls') return send(200, calls)
    if (p === '/__reset' && req.method === 'POST') { calls = {}; return send(200, { ok: true }) }
    // Simulate a GitHub outage: every API request answers 500 while on.
    if (p === '/__outage' && req.method === 'POST') { outage = !!body?.on; return send(200, { outage }) }
    // Refuse every token but this one — an expired credential, the one storage
    // failure that never heals on its own.
    if (p === '/__require' && req.method === 'POST') { requireToken = body?.token || null; return send(200, { requireToken }) }
    // Rate-limit the next N calls the way GitHub really does: a 403 (or 429)
    // carrying Retry-After and an exhausted budget. `n: -1` never lets up.
    // Hold uploads open for a while — long enough for another write to land
    // while one is in the air, which is where concurrency bugs live.
    if (p === '/__slow' && req.method === 'POST') { slowPut = Number(body?.ms || 0); return send(200, { slowPut }) }
    // Overwrite everything after the first page of the stored database with
    // junk, as a new commit — the header still says SQLite, the pages do not.
    if (p === '/__damage' && req.method === 'POST') {
      if (!file) return send(409, { message: 'no file to damage' })
      const bytes = Buffer.from(file.bytes)
      bytes.fill(0x55, 4096)
      file = { bytes, blobSha: sha1(bytes) }
      branches.appdata = { head: `commit-${++commitN}` }
      bumpEtag()
      return send(200, { blobSha: file.blobSha })
    }
    if (p === '/__file' && req.method === 'GET') return send(200, { blobSha: file?.blobSha || null, size: file?.bytes.length || 0, head: branches.appdata?.head || null })
    // Fail the next N requests of one kind — `path` is a substring of the
    // request path, say "git/blobs" — with a status (500 unless told). What
    // the squash does when its upload, and only its upload, fails.
    if (p === '/__fail' && req.method === 'POST') {
      failing = body?.n ? { path: String(body.path || ''), n: Number(body.n), status: Number(body.status || 500) } : null
      return send(200, { failing })
    }
    if (failing && failing.n > 0 && p.includes(failing.path)) {
      failing.n--
      count('failed-' + failing.status)
      return send(failing.status, { message: `simulated failure on ${failing.path}` })
    }
    if (p === '/__ratelimit' && req.method === 'POST') {
      rateLimit = { left: body?.n ?? 0, status: body?.status || 403, after: body?.after ?? 1, words: body?.words !== false }
      return send(200, { rateLimit })
    }
    if (rateLimit.left !== 0) {
      if (rateLimit.left > 0) rateLimit.left--
      count('ratelimited')
      return send(rateLimit.status, { message: rateLimit.words ? 'You have exceeded a secondary rate limit' : 'Forbidden' },
        { 'Retry-After': String(rateLimit.after), 'X-RateLimit-Remaining': '0' })
    }
    if (outage) { count('outage-500'); return send(500, { message: 'Server Error (simulated outage)' }) }
    if (requireToken && !(req.headers.authorization || '').includes(requireToken)) {
      count('unauthorized-401')
      return send(401, { message: 'Bad credentials' })
    }

    // --- refs ---
    let m = p.match(/^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/)
    if (m && req.method === 'GET') {
      count('ref-get')
      const b = branches[m[1]]
      return b ? send(200, { object: { sha: b.head } }) : send(404, { message: 'Not Found' })
    }
    m = p.match(/^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/)
    if (m && req.method === 'DELETE') {
      count('ref-delete')
      delete branches[m[1]]
      if (m[1] !== 'main') { file = null; bumpEtag() }
      return send(204)
    }
    m = p.match(/^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/)
    if (m && req.method === 'PATCH') {
      count('ref-update')
      const b = branches[m[1]]
      if (!b) return send(422, { message: 'Reference does not exist' })
      const c = commits[body.sha]
      if (!c) return send(422, { message: 'Object does not exist' })
      // Not a fast-forward unless forced — a root commit never is.
      if (!body.force && body.sha !== b.head) return send(422, { message: 'Update is not a fast forward' })
      b.head = body.sha
      if (m[1] !== 'main') {
        const entry = (trees[c.tree] || []).find((e) => e.path === 'data/dashboard.db')
        file = entry && blobs[entry.sha] ? { bytes: blobs[entry.sha], blobSha: entry.sha } : null
        bumpEtag()
      }
      return send(200, { object: { sha: b.head } })
    }
    if (p.match(/^\/repos\/[^/]+\/[^/]+\/git\/refs$/) && req.method === 'POST') {
      count('ref-create')
      const name = body.ref.replace('refs/heads/', '')
      if (branches[name]) return send(422, { message: 'Reference already exists' })
      branches[name] = { head: body.sha }
      return send(201, { object: { sha: body.sha } })
    }

    // --- repo meta ---
    if (p.match(/^\/repos\/[^/]+\/[^/]+$/) && req.method === 'GET') {
      count('repo-get')
      return send(200, { default_branch: 'main' })
    }

    // --- trees (legacy path, kept for completeness) ---
    m = p.match(/^\/repos\/[^/]+\/[^/]+\/git\/trees\/(.+)$/)
    if (m && req.method === 'GET') {
      count('tree-get')
      return send(200, { tree: file ? [{ path: 'data/dashboard.db', sha: file.blobSha }] : [] })
    }

    // --- the git data API: blob, tree, commit (the squash) ---
    if (p.match(/^\/repos\/[^/]+\/[^/]+\/git\/blobs$/) && req.method === 'POST') {
      count('blob-create')
      const bytes = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8')
      const sha = sha1(bytes)
      blobs[sha] = bytes
      return send(201, { sha })
    }
    if (p.match(/^\/repos\/[^/]+\/[^/]+\/git\/trees$/) && req.method === 'POST') {
      count('tree-create')
      const entries = (body.tree || []).map((e) => ({ path: e.path, sha: e.sha }))
      for (const e of entries) if (!blobs[e.sha]) return send(422, { message: `tree entry points at no blob: ${e.path}` })
      const sha = sha1(Buffer.from(JSON.stringify(entries) + (body.base_tree || '')))
      trees[sha] = entries
      return send(201, { sha })
    }
    if (p.match(/^\/repos\/[^/]+\/[^/]+\/git\/commits$/) && req.method === 'POST') {
      count('commit-create')
      if (!trees[body.tree]) return send(422, { message: 'Tree SHA does not exist' })
      const sha = `commit-${++commitN}`
      commits[sha] = { tree: body.tree, parents: body.parents || [] }
      return send(201, { sha })
    }

    // --- blobs (the >1MB fallback) ---
    m = p.match(/^\/repos\/[^/]+\/[^/]+\/git\/blobs\/(.+)$/)
    if (m && req.method === 'GET') {
      count('blob-get')
      if (file && file.blobSha === m[1]) return send(200, file.bytes, { 'Content-Type': 'application/octet-stream' })
      if (blobs[m[1]]) return send(200, blobs[m[1]], { 'Content-Type': 'application/octet-stream' })
      return send(404, { message: 'Not Found' })
    }

    // --- contents ---
    m = p.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/)
    if (m && req.method === 'GET') {
      count('contents-get')
      const branch = url.searchParams.get('ref') || 'main'
      if (!branches[branch] || !file) return send(404, { message: 'Not Found' })
      const inm = req.headers['if-none-match']
      if (inm && inm === currentEtag) return send(304, undefined, { ETag: currentEtag })
      const accept = req.headers.accept || ''
      if (accept.includes('raw')) return send(200, file.bytes, { 'Content-Type': 'application/octet-stream', ETag: currentEtag })
      const big = file.bytes.length > 1024 * 1024
      return send(200, {
        sha: file.blobSha,
        size: file.bytes.length,
        encoding: big ? 'none' : 'base64',
        content: big ? '' : file.bytes.toString('base64'),
      }, { ETag: currentEtag })
    }
    if (m && req.method === 'PUT') {
      count('contents-put')
      const branch = body.branch
      if (!branches[branch]) return send(404, { message: 'Branch not found' })
      // compare-and-swap on the blob sha
      if (file && body.sha !== file.blobSha) return send(409, { message: 'sha mismatch' })
      if (!file && body.sha) return send(422, { message: 'sha provided but file does not exist' })
      const bytes = Buffer.from(body.content, 'base64')
      const land = () => {
        file = { bytes, blobSha: sha1(bytes) }
        branches[branch].head = `commit-${++commitN}`
        bumpEtag()
        send(body.sha ? 200 : 201, { content: { sha: file.blobSha }, commit: { sha: branches[branch].head } })
      }
      if (slowPut > 0) { setTimeout(land, slowPut); return }
      return land()
    }

    send(404, { message: `unhandled ${req.method} ${p}` })
  })
})

server.listen(PORT, () => console.log(`mock github on :${PORT}`))
