// Access keys: a person lets Claude act as them on the board — create, read,
// change and delete tasks with exactly their own reach, through the same
// routes the page calls (mcp/satashkent.mjs is the connector that uses one).
//
// A key is made under Profile and shown ONCE; only its hash is kept
// (auth.js), with its last four characters so the list can tell keys apart.
// Revoking is immediate. A key cannot make, list or revoke keys: whoever holds
// one should not be able to hand out more of the account than they were given.
import { Router } from 'express'
import { randomBytes } from 'crypto'
import { all, get, run } from '../db.js'
import { authRequired, wrap, keyHash, KEY_PREFIX } from '../auth.js'

const router = Router()
router.use(authRequired)
router.use((req, res, next) => {
  if (req.viaKey) return res.status(403).json({ error: 'An access key cannot manage access keys' })
  if (req.user.role === 'ambassador') return res.status(403).json({ error: 'Access keys are for the team' })
  next()
})

// My keys, newest first — never the keys themselves.
router.get('/', wrap(async (req, res) => {
  res.json(await all('SELECT id, name, tail, created_at FROM access_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC', req.user.id))
}))

// A new key, shown this once.
router.post('/', wrap(async (req, res) => {
  const name = String(req.body?.name || 'Claude').trim().slice(0, 60) || 'Claude'
  const live = await get('SELECT COUNT(*) AS n FROM access_keys WHERE user_id = ? AND revoked_at IS NULL', req.user.id)
  if ((live?.n || 0) >= 5) return res.status(409).json({ error: 'Five keys at most — revoke one first' })
  const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`
  const info = await run('INSERT INTO access_keys (user_id, name, hash, tail, created_at) VALUES (?, ?, ?, ?, ?)',
    req.user.id, name, keyHash(key), key.slice(-4), new Date().toISOString())
  res.status(201).json({ id: info.lastInsertRowid, name, tail: key.slice(-4), key })
}))

// Revoke one of mine; it stops working at once.
router.delete('/:id', wrap(async (req, res) => {
  const k = await get('SELECT id FROM access_keys WHERE id = ? AND user_id = ? AND revoked_at IS NULL', req.params.id, req.user.id)
  if (!k) return res.status(404).json({ error: 'Not found' })
  await run('UPDATE access_keys SET revoked_at = ? WHERE id = ?', new Date().toISOString(), k.id)
  res.json({ ok: true })
}))

export default router
