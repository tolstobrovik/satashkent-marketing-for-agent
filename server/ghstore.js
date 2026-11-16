// GitHub-as-storage: keeps the SQLite database file on a branch of the app's
// own repository, synced through the GitHub Contents API. This gives a small
// team durable data with zero external services — the repo IS the database.
//
// Consistency model: optimistic concurrency on the file's blob sha. Every
// flush uploads the whole database file with the sha we last saw; if another
// instance got there first GitHub answers 409/422, we download the fresh
// copy, replay our unflushed statements on top of it, and try again.
//
// Read model: one conditional GET per pull. The ETag from the last download
// makes the no-change case a 304 — which GitHub serves fast and does NOT
// count against the API rate limit — and the changed case returns blob sha
// and content together in a single response (files ≤ 1 MB; bigger databases
// fall back to one extra blob download).
import { createReadStream, statSync } from 'fs'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'

const API = process.env.GITHUB_API_BASE || 'https://api.github.com'

// GitHub says "403" for two completely different things: a credential it will
// not accept, and a deployment it wants to slow down. Telling them apart is
// the difference between "issue a new token" (an afternoon of work, and the
// old token was fine) and "wait a moment" (which the app can do by itself).
// A rate limit announces itself: Retry-After, an exhausted budget, or plain
// words in the body.
const isRateLimit = (res, bodyText = '') =>
  (res.status === 403 || res.status === 429) && (
    Number(res.headers.get('retry-after')) > 0 ||
    res.headers.get('x-ratelimit-remaining') === '0' ||
    /rate limit|secondary|abuse/i.test(bodyText))

// Name the failure where anyone will read it — in the logs, in /api/health,
// and in the 503 the browser shows. The wording is load-bearing: the
// server (server/index.js) marks a *token* refusal as NOT retryable (retrying cannot
// help) while everything else, rate limits included, stays retryable.
const hintFor = (res, bodyText = '') => {
  if (isRateLimit(res, bodyText)) {
    const after = Number(res.headers.get('retry-after')) || 0
    return ` — GitHub is rate-limiting this deployment${after ? ` (asked to wait ${after}s)` : ''}. The token is fine; the dashboard is writing faster than GitHub allows. It backs off and retries by itself.`
  }
  if (res.status === 401 || res.status === 403)
    return ' — GitHub refused the storage token (expired, revoked or lacking Contents write). Issue a new one and set GITHUB_DATA_TOKEN in the deployment’s environment.'
  return ''
}
const authHint = (res) => (typeof res === 'number' ? '' : hintFor(res))

// ---- is this still the same database? ------------------------------------------------
// 9 October 2026: two copies of the app were restarted in the same second on
// one data directory. One read the file while the other was rewriting it, took
// it for empty, seeded a fresh database and uploaded it over the team's — 131
// pages where there had been 3,561. Compare-and-swap could not object: the sha
// it carried was right. So the upload now asks one more question first.
//   pagesOf(bytes)        how many pages a SQLite image holds, by its own
//                         header — NOT by its length: the wiped file kept the
//                         old one's 14 MB, which is why nobody saw it sooner
//   lostItself(was, now)  most of a database of any size is gone. An edit
//                         never does that; another database does.
// `bytes` may be the first hundred bytes of a file rather than the whole of
// it (pagesOfFile in db.js); `length` then says how long the file really is.
export const pagesOf = (bytes, length = bytes?.length ?? 0) => {
  if (!bytes || bytes.length < 100 || bytes.toString('latin1', 0, 15) !== 'SQLite format 3') return 0
  const size = bytes.readUInt16BE(16) === 1 ? 65536 : bytes.readUInt16BE(16) || 4096
  const said = bytes.readUInt32BE(28)
  // The header's count is the truth only when it was written with the last
  // change (offsets 92 and 24 agree); otherwise the length is all there is.
  return said > 0 && bytes.readUInt32BE(92) === bytes.readUInt32BE(24) ? said : Math.floor(length / size)
}
export const lostItself = (was, now, floor = 250) => was >= floor && now < was * 0.4

// A request whose JSON body wraps a file as base64, written to the socket as
// the file is read — SLICE bytes at a time, each a multiple of three so the
// base64 of the pieces is the base64 of the whole. Content-Length is known up
// front (the file's size says it), the connection is this request's own and
// is closed with the answer. `src` is a file path or a Buffer. Resolves to
// { status, headers, text } — the shape hintFor() and isRateLimit() read.
// The Contents API PUTs it; the git data API POSTs it (a blob, see squash).
const SLICE = 3 * 262144 // 768 KB
function streamSend(method, url, headers, head, src) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const bytes = Buffer.isBuffer(src) ? src : null
    const size = bytes ? bytes.length : statSync(src).size
    const headBuf = Buffer.from(head, 'utf8')
    const tail = Buffer.from('"}', 'utf8')
    const length = headBuf.length + Math.ceil(size / 3) * 4 + tail.length
    const make = u.protocol === 'https:' ? httpsRequest : httpRequest
    const req = make(u, { method, headers: { ...headers, 'Content-Length': length }, agent: false }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (d) => { text += d })
      res.on('end', () => resolve({ status: res.statusCode, headers: { get: (k) => res.headers[String(k).toLowerCase()] ?? null }, text }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.write(headBuf)
    if (bytes) {
      for (let off = 0; off < size; off += SLICE) req.write(bytes.subarray(off, off + SLICE).toString('base64'), 'latin1')
      req.end(tail)
      return
    }
    // A regular file hands out full slices up to the last one, so every slice
    // but the last is a multiple of three. Backpressure: wait for the socket
    // to drain before reading more.
    const stream = createReadStream(src, { highWaterMark: SLICE })
    stream.on('data', (chunk) => {
      if (!req.write(chunk.toString('base64'), 'latin1')) {
        stream.pause()
        req.once('drain', () => stream.resume())
      }
    })
    stream.on('end', () => req.end(tail))
    stream.on('error', (e) => { req.destroy(e); reject(e) })
  })
}

export function createGhStore({ token, repo, branch, path }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'satashkent-dashboard',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  let fileSha = null // blob sha of the database file at our last sync
  let etag = null    // ETag of the last contents download → free 304 checks
  // Is the repository still called that? On 23 October 2026 it was moved to
  // another owner. GitHub keeps the old name as a redirect: a 301 on a GET,
  // which fetch follows by itself, and a 307 on the upload, which the
  // streamed request did not — so every save failed for three days and the
  // writes of that time were lost (#128 renamed the configuration; this
  // asks). The current name is asked for once, before the first request
  // that matters, and used from then on. A name GitHub cannot be asked for
  // (an outage, a refused token) is left as configured and asked for again.
  // Asked only once a redirect has been met (fetch says `redirected`; the
  // streamed send sees the 307): a cold start that was never moved costs
  // nothing more than it did.
  let named = false
  const resolveRepo = async () => {
    if (named) return
    named = true
    try {
      const res = await gh('GET', `/repos/${repo}`)
      if (!res.ok) { named = false; return }
      const now = (await readJson(res)).full_name
      if (now && now !== repo) {
        console.error(`GitHub data repository ${repo} is now ${now} — using that name`)
        repo = now
      }
    } catch {
      named = false
    }
  }

  // A request that fails on a hiccup — a 5xx, a rate-limit pause, a dropped
  // connection — is worth asking again before anyone hears about it.
  //
  // WRITES retry too, and that is safe here precisely because the upload is a
  // compare-and-swap on the file's blob sha: if the first attempt actually
  // landed and only its answer was lost, the repeat carries the now-stale sha
  // and GitHub refuses it as a conflict, which the caller already knows how to
  // handle (re-pull, replay the journal, push again). Not retrying was the
  // gap: one rate-limited PUT lost the whole flush, and the team was told
  // their token had died.
  const TRANSIENT = new Set([408, 429, 500, 502, 503, 504])
  const worthRetrying = (res) => TRANSIENT.has(res.status) || isRateLimit(res)
  // Every call has a clock on it. Until 24 Oct 2026 none did, and a GitHub
  // stall held the pull — then on the request path — open for as long as the
  // socket lived. A metadata call is answered in well under a second or not at
  // all: 8 s. The blob download of a 15 MB database gets a minute (the signal
  // covers reading the body, not only the headers). A call that runs out is
  // thrown like any other failed call and handled where the pull is handled.
  const META_TIMEOUT = 8000
  const BLOB_TIMEOUT = 60000
  const gh = async (method, url, body, accept = 'application/vnd.github+json', extra, timeout = META_TIMEOUT) => {
    const send = () => fetch(`${API}${url}`, {
      method,
      headers: {
        ...headers,
        Accept: accept,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(extra || {}),
      },
      // A Buffer goes as it is: push() below builds the upload's JSON as one
      // Buffer precisely so that no 20 MB string ever exists.
      body: body ? (Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(timeout),
    })
    let last = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await send()
        if (res.redirected && !named) await resolveRepo()
        if (!worthRetrying(res) || attempt === 2) return res
        last = res
        // GitHub says when to come back after a rate-limit pause; otherwise
        // wait a beat longer each time (with jitter, so instances don't
        // stampede the API in lockstep).
        const after = Number(res.headers.get('retry-after'))
        await new Promise((r) => setTimeout(r, after > 0 ? Math.min(after, 5) * 1000 : 200 * 2 ** attempt + Math.random() * 120))
      } catch (e) {
        if (attempt === 2) throw e
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt + Math.random() * 120))
      }
    }
    return last
  }

  // The streamed upload, with the same retries as gh() — a 5xx, a rate-limit
  // pause, a dropped connection — and the same reasons it is safe to retry.
  const sendFile = async (method, url, head, src) => {
    const h = { ...headers, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
    let res = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await streamSend(method, url, h, head, src)
        // A moved repository answers a PUT or POST with 307 and where to go.
        // fetch would follow that on its own; a hand-written request has to.
        // Once — a second redirect is an answer, not a path.
        const moved = (res.status === 301 || res.status === 307 || res.status === 308) && res.headers.get('location')
        if (moved) {
          res = await streamSend(method, new URL(moved, API).href, h, head, src)
          if (!named) await resolveRepo()
        }
        if (!worthRetrying(res) || attempt === 2) break
        const after = Number(res.headers.get('retry-after'))
        await new Promise((r) => setTimeout(r, after > 0 ? Math.min(after, 5) * 1000 : 200 * 2 ** attempt + Math.random() * 120))
      } catch (e) {
        if (attempt === 2) throw e
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt + Math.random() * 120))
      }
    }
    return res
  }

  const readJson = async (res) => {
    try { return await res.json() } catch { return {} }
  }

  // Current head of the data branch, or null if the branch doesn't exist yet.
  async function branchHead() {
    const res = await gh('GET', `/repos/${repo}/git/ref/heads/${branch}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`ref read failed (${res.status})${authHint(res)}`)
    return (await readJson(res)).object?.sha || null
  }

  return {
    // → { changed, bytes, exists } — bytes only when the remote moved since
    // last sync. One request in every case that matters: 304 when nothing
    // changed, sha + base64 content in the same response when it did.
    async pull() {
      const res = await gh('GET', `/repos/${repo}/contents/${path}?ref=${branch}`, null,
        'application/vnd.github.object+json', etag ? { 'If-None-Match': etag } : undefined)
      if (res.status === 304) return { changed: false, bytes: null, exists: true }
      if (res.status === 404) {
        etag = null
        return { changed: false, bytes: null, exists: false }
      }
      if (!res.ok) throw new Error(`data download failed (${res.status})${authHint(res)}`)
      const json = await readJson(res)
      const freshEtag = res.headers.get('etag')
      if (json.sha && json.sha === fileSha) {
        // Same blob as our working copy (typically right after our own push,
        // when the old ETag no longer matches) — nothing to apply.
        etag = freshEtag || etag
        return { changed: false, bytes: null, exists: true }
      }
      let bytes
      if (json.encoding === 'base64' && json.content) {
        bytes = Buffer.from(json.content, 'base64')
      } else {
        // Databases over 1 MB come back without inline content — fetch the
        // blob directly (works up to 100 MB).
        const raw = await gh('GET', `/repos/${repo}/git/blobs/${json.sha}`, null, 'application/vnd.github.raw+json', undefined, BLOB_TIMEOUT)
        if (!raw.ok) throw new Error(`blob download failed (${raw.status})${authHint(raw)}`)
        bytes = Buffer.from(await raw.arrayBuffer())
      }
      fileSha = json.sha
      etag = freshEtag
      return { changed: true, bytes, exists: true }
    },

    // Upload the current database file. Returns true on success, 'conflict'
    // when someone else wrote in between (caller re-pulls, replays, retries).
    // Upload the database — a FILE PATH, streamed; a Buffer still works for
    // the suites. Nothing the size of the database is ever in memory here.
    //
    // It used to be fetch() with the whole body built first: a 20 MB base64
    // of the 15 MB file, a JSON holding it, fetch's own copy of that. On
    // 20–21 October 2026 the garbage of two such uploads put the process over
    // its memory line 215 times in two days — a few seconds of 502 each. Built
    // as one Buffer instead (21 Oct) the process still stood 60 MB higher for
    // up to an hour after every upload, and a forced collection gave back
    // nothing: Node 18's fetch copies a Buffer body and keeps it until the
    // keep-alive socket to GitHub drops, which is minutes. So the body is
    // written to the socket in 768 KB slices as it is read from the file,
    // on a connection of its own that is closed when the answer arrives
    // (agent: false). Peak memory per upload: one slice and its base64.
    async push(src) {
      const meta = JSON.stringify({ message: 'satashkent data update', branch, ...(fileSha ? { sha: fileSha } : {}) })
      const head = `${meta.slice(0, -1)},"content":"`
      const res = await sendFile('PUT', `${API}/repos/${repo}/contents/${path}`, head, src)
      if (res.status === 409 || res.status === 422) return 'conflict'
      if (res.status < 200 || res.status >= 300) {
        const detail = res.text.slice(0, 200)
        throw new Error(`data upload failed (${res.status})${hintFor(res, detail)}: ${detail}`)
      }
      let out = {}
      try { out = JSON.parse(res.text) } catch { /* an answer that is not JSON still landed */ }
      fileSha = out.content?.sha || fileSha
      return true
    },

    // Make sure the data branch exists (created from the default branch).
    async ensureBranch() {
      if (await branchHead()) return
      const repoRes = await gh('GET', `/repos/${repo}`)
      const defaultBranch = (await readJson(repoRes)).default_branch || 'main'
      const mainRes = await gh('GET', `/repos/${repo}/git/ref/heads/${defaultBranch}`)
      if (!mainRes.ok) throw new Error(`cannot read default branch (${mainRes.status})${authHint(mainRes)}`)
      const sha = (await readJson(mainRes)).object.sha
      const mk = await gh('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha })
      if (!mk.ok && mk.status !== 422) throw new Error(`cannot create data branch (${mk.status})`)
    },

    // The repository's name as GitHub last gave it (the configured one until
    // it has been asked).
    name() { return repo },

    // Drop the caches so the next pull re-reads everything.
    invalidate() { etag = null },

    // Forget the working copy altogether: the next pull downloads the stored
    // file whatever it is. For a machine whose own copy can no longer be
    // trusted (see lostItself).
    forget() { etag = null; fileSha = null },

    // Rewrite the data branch as ONE commit holding the database (the nightly
    // cron calls this), so the repository never accumulates a commit per
    // write. Through the git data API, in this order: the file goes up as a
    // blob, a tree and a root commit are made of it, and only then is the
    // branch pointed at that commit, in one step. The old head stands until
    // the new one is whole; a failure anywhere before the last step leaves
    // the branch exactly as it was, and the last step either lands or does
    // not. (It used to DELETE the branch, recreate it from main and upload
    // into that: on 24 Oct 2026 the upload failed — 307, the repository had
    // moved — and GitHub was left holding no database for the next boot to
    // find, which then threw the local file away and seeded a blank one.)
    //
    // After the first squash the data branch carries nothing but the
    // database: no source tree, so no workflow file for a data write to run.
    // A write that lands on the old head between the blob and the switch
    // would be dropped with that head, so the head is read before and after:
    // moved means 'conflict', and the caller tries another night.
    async squash(src) {
      const before = await branchHead()
      const blob = await sendFile('POST', `${API}/repos/${repo}/git/blobs`, '{"encoding":"base64","content":"', src)
      if (blob.status < 200 || blob.status >= 300) {
        const detail = blob.text.slice(0, 200)
        throw new Error(`squash upload failed (${blob.status})${hintFor(blob, detail)}: ${detail}`)
      }
      let blobSha = null
      try { blobSha = JSON.parse(blob.text).sha } catch { /* read below */ }
      if (!blobSha) throw new Error('squash upload failed: GitHub returned no blob sha')
      const tree = await gh('POST', `/repos/${repo}/git/trees`, { tree: [{ path, mode: '100644', type: 'blob', sha: blobSha }] })
      if (!tree.ok) throw new Error(`squash tree failed (${tree.status})${authHint(tree)}`)
      const treeSha = (await readJson(tree)).sha
      const commit = await gh('POST', `/repos/${repo}/git/commits`, { message: 'satashkent data squash', tree: treeSha, parents: [] })
      if (!commit.ok) throw new Error(`squash commit failed (${commit.status})${authHint(commit)}`)
      const commitSha = (await readJson(commit)).sha
      if ((await branchHead()) !== before) return 'conflict'
      let ref = await gh('PATCH', `/repos/${repo}/git/refs/heads/${branch}`, { sha: commitSha, force: true })
      if (ref.status === 404 || ref.status === 422) {
        // No such branch yet (the first squash of a fresh deployment).
        ref = await gh('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commitSha })
      }
      if (!ref.ok) throw new Error(`squash could not move the data branch (${ref.status})${authHint(ref)}`)
      fileSha = blobSha
      etag = null
      return true
    },
  }
}
