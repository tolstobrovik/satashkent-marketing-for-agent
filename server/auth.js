import jwt from 'jsonwebtoken'
import { createHash } from 'crypto'
import { get, publicUser, resyncStorage, storageSecret, dataRev, dayISO } from './db.js'

// Prefer an explicit JWT_SECRET. Without one, derive a stable secret from
// whatever credential the storage uses (Postgres URL, Turso token, or the
// GitHub storage token) — it's secret, identical on every instance, and
// survives deploys, so sessions never break and there is nothing to
// configure. The dev default only applies with no credential at all.
//
// The credential comes from db.js, which resolves it ONE way: environment
// first, and never a placeholder. Working it out separately here was a real
// hole — a deployment that keeps its token in the host's environment (the
// safe place for it) leaves the unfilled default in config.js, and this file
// used to reach past the environment and hash THAT. The placeholder is
// published in the repository, so the session secret would have been public
// and anyone could have signed themselves in as anybody.
const dbSecret = storageSecret()
export const JWT_SECRET = process.env.JWT_SECRET ||
  (dbSecret ? createHash('sha256').update(`satashkent:${dbSecret}`).digest('hex') : 'satashkent-dev-secret-change-me')
// A deployment signing sessions with the built-in dev string is one nobody
// should be logging into. Say so at boot, where it can still be fixed.
if (!process.env.JWT_SECRET && !dbSecret && process.env.NODE_ENV === 'production')
  console.error('SECURITY: no storage credential and no JWT_SECRET — sessions are signed with the public dev secret. Set JWT_SECRET.')

// "Remember me" keeps the session for a week; without it the token is short
// and the client keeps it only until the browser closes.
export function signToken(user, remember = true) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: remember ? '7d' : '12h' })
}

// Express 4 doesn't catch async errors — route handlers wrap themselves in
// this so a rejected promise lands in the error middleware, not nowhere.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// ---- the ambassador gate -----------------------------------------------------
// An ambassador is a student with a login to exactly one page. Everything else
// in this dashboard — the boards, the schedule, the money, other people's
// names — is not theirs to see, and "the sidebar does not show it" is not a
// rule, it is decoration. So the refusal lives HERE, at the one place every
// authenticated request already passes through, rather than in each router
// where a new endpoint could be written tomorrow and quietly forget it.
//
// Two prefixes are open to them: the session itself, and their own page.
const AMBASSADOR_OPEN = ['/api/auth', '/api/ambassadors']
const underPrefix = (url, base) => {
  const path = String(url || '').split('?')[0]
  return path === base || path.startsWith(base + '/')
}

// An access key (routes/keys.js) — "sat_" and 43 characters — is the person
// who made it, for as long as it is not revoked: Claude acting as them, with
// exactly their reach. Only its hash is stored, so the lookup hashes too.
export const KEY_PREFIX = 'sat_'
export const keyHash = (key) => createHash('sha256').update(String(key)).digest('hex')
async function userOfKey(key) {
  const k = await get('SELECT user_id FROM access_keys WHERE hash = ? AND revoked_at IS NULL', keyHash(key))
  return k ? { id: k.user_id } : null
}

// The signed-in user, remembered for five seconds. Every request read the
// whole users row — `SELECT *`, with the avatar's data URL in it, up to
// 300 KB — and copied it out of SQLite to learn a role and a few lists; on a
// board that polls every few seconds that was the hottest query there was
// (24 Oct 2026). The avatar has to stay in the object (/api/auth/me sends
// req.user whole), so it is read once and kept, not re-read. A change to the
// person clears them (routes/users.js: forgetUser), so the staleness is five
// seconds at most, and only for a change made on another instance.
const USER_TTL = 5000
const users = new Map() // id → { at, user }
export function forgetUser(id) {
  if (id === undefined) users.clear()
  else users.delete(Number(id))
}
async function userById(id) {
  const hit = users.get(id)
  if (hit && Date.now() - hit.at < USER_TTL) return hit.user
  let row = await get('SELECT * FROM users WHERE id = ?', id)
  if (!row) {
    // The account may have been created seconds ago on another server —
    // pull the freshest data once before declaring the user gone.
    await resyncStorage().catch(() => {})
    row = await get('SELECT * FROM users WHERE id = ?', id)
  }
  // A removed ambassador keeps a row (routes/ambassadors.js renames the login
  // to removed_…) so their finished cards still carry a name. The session
  // they already hold has to die with the login: it is good for a week.
  if (!row || String(row.username || '').startsWith('removed_')) return null
  const user = publicUser(row)
  users.set(id, { at: Date.now(), user })
  return user
}

// The ETag of a polled, per-person reading of the data: the data's revision
// (db.js dataRev — bumped by every write and every copy pulled from GitHub),
// whose reading, which day it is (the deadline routes change at midnight with
// nothing written) and the question asked. A route sets it and asks
// `req.fresh` BEFORE any query: the client polls with If-None-Match
// (client/src/lib/api.js conditionalGet), so an unchanged board is a 304 that
// cost nothing. Express would have answered 304 anyway — after running the
// whole route.
export const revTag = (req) =>
  `W/"${dataRev()}-${req.user?.id}-${dayISO()}-${encodeURIComponent(String(req.originalUrl || '').split('?')[1] || '')}"`

// Verify the bearer token and attach the current user to the request.
export async function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const viaKey = token.startsWith(KEY_PREFIX)
    const payload = viaKey ? await userOfKey(token) : jwt.verify(token, JWT_SECRET)
    if (!payload) return res.status(401).json({ error: 'This access key was revoked or never existed' })
    const user = await userById(payload.id)
    if (!user) return res.status(401).json({ error: 'User not found' })
    req.user = user
    // A session in use renews itself. A sign-in used to end on day 7 (12 hours
    // without "remember me") in the middle of somebody's work: the page kept
    // drawing what it had, every request after it came back "Not
    // authenticated", and the hand-in lost its upload box (31 Oct 2026). Once
    // the token is half a day old (a short one: half its life), the answer
    // carries a fresh one of the same length (X-Session-Token, read by
    // lib/api.js); not opening the board for its whole length still ends it.
    // Keys are not sessions and are never renewed.
    if (!viaKey && payload.iat && payload.exp) {
      const life = payload.exp - payload.iat
      if (Date.now() / 1000 - payload.iat > Math.min(12 * 3600, life / 2))
        res.set('X-Session-Token', signToken(user, life > 86400))
    }
    // A key can do what its person can — except make or see more keys.
    req.viaKey = viaKey
    if (req.user.role === 'ambassador'
        && !AMBASSADOR_OPEN.some((base) => underPrefix(req.originalUrl, base))) {
      return res.status(403).json({ error: 'This is not part of your page' })
    }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }
}

// ---- how far an admin's writ runs -------------------------------------------
// An admin used to be an admin everywhere, which is the wrong shape for a team
// where one person runs YouTube and another runs the Instagram accounts:
// giving the YouTube lead the power to move a promised Instagram date was the
// only way to let them run their own channel.
//
// `admin_channels` scopes it. EMPTY means everywhere — which is what every
// admin was before this existed, so nobody's reach changed when the column
// appeared, and the person who sets these up keeps theirs by leaving it empty.
export const adminChannelsOf = (user) => (Array.isArray(user?.admin_channels) ? user.admin_channels : [])
// Runs the whole board: the person who makes accounts and sets the rules.
export const isFullAdmin = (user) => user?.role === 'admin' && adminChannelsOf(user).length === 0
// Runs THIS work: a full admin, or a channel admin on one of these channels.
// `chans` is the channel keys the thing in question lives on.
export function isAdminOn(user, chans) {
  if (user?.role !== 'admin') return false
  const mine = adminChannelsOf(user)
  if (mine.length === 0) return true
  const list = Array.isArray(chans) ? chans : [chans].filter(Boolean)
  return list.some((ch) => mine.includes(ch))
}

// The structural things — accounts, channels, the pipeline rules, hiring —
// belong to whoever runs the whole board. A CHANNEL admin runs the content on
// their channels; they do not reshape the organisation around it.
export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' })
  if (!isFullAdmin(req.user))
    return res.status(403).json({ error: 'This is for an admin of the whole board — you run particular channels' })
  next()
}

// Reads and writes the people board — the monthly record of how each person's
// work went. A rank of its own, above admin and held by very few.
//
// It is a COLUMN on users, not one of DEFAULT_PERMS, and that is the whole
// point: `can()` below grants every admin every permission, so a permission
// spelled "may read the reviews" would have been held by all of them on the
// day it shipped. This is held by whoever was handed it and nobody else.
export const isSuperadmin = (user) => !!user?.superadmin

export function superadminOnly(req, res, next) {
  // Deliberately the same sentence for an admin as for anybody else. The
  // board's contents are none of a non-superadmin's business, and neither is
  // the fact that they exist.
  if (!isSuperadmin(req.user)) return res.status(403).json({ error: 'This part of the board isn’t yours' })
  next()
}

// A member may only touch data for channels they belong to. A full admin sees
// everything; a channel admin sees their channels, whether or not anybody
// remembered to also list those channels as their departments.
export function canAccessDept(user, dept) {
  if (isFullAdmin(user)) return true
  return (user.departments || []).includes(dept) || adminChannelsOf(user).includes(dept)
}

// Telegram-style granular rights: admins can do everything; members only what
// the admin has switched on for them (defaults in db.js DEFAULT_PERMS).
export function can(user, perm) {
  return user.role === 'admin' || !!(user.permissions && user.permissions[perm])
}

export function requirePerm(perm) {
  return (req, res, next) => {
    if (!can(req.user, perm)) return res.status(403).json({ error: 'You don’t have permission for this — ask an admin' })
    next()
  }
}
