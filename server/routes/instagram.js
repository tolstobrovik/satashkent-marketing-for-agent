// Instagram (server/instagram.js): the keys an admin pastes, the run they can
// start by hand, the list of published pieces Instagram has no numbers for,
// and one task's reading for its window.
//
// The keys are a whole-board admin's: one token reads every number of an
// account. A token is never sent back — only its last four characters.
import { Router } from 'express'
import { get } from '../db.js'
import { authRequired, wrap, isFullAdmin, isAdminOn } from '../auth.js'
import { igStatus, saveAccount, forgetAccount, igRefresh, igChannels, unmatched, taskReading, runState, handRefusal } from '../instagram.js'

const router = Router()
router.use(authRequired)

const fullAdmin = (req, res, next) => (isFullAdmin(req.user) ? next()
  : res.status(403).json({ error: 'Only an admin of the whole board can connect Instagram' }))

router.get('/', fullAdmin, wrap(async (req, res) => res.json(await igStatus())))

router.put('/:channel', fullAdmin, wrap(async (req, res) => {
  const key = String(req.params.channel)
  if (!(await igChannels()).some((c) => c.key === key))
    return res.status(404).json({ error: 'That is not an Instagram channel' })
  const token = String(req.body?.token || '').trim()
  if (!token || /\s/.test(token) || token.length < 20 || token.length > 1000)
    return res.status(400).json({ error: 'Paste the whole access token — one long word, no spaces' })
  try {
    await saveAccount(key, token, req.body?.account, req.user.id)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
  res.json(await igStatus())
}))

router.delete('/:channel', fullAdmin, wrap(async (req, res) => {
  forgetAccount(String(req.params.channel))
  res.json(await igStatus())
}))

// "Read now": starts a run and answers at once; the page asks how it went
// (GET /) every few seconds while it runs. One run at a time.
// At most once every half hour, and never while Instagram has asked for a pause.
router.post('/refresh', fullAdmin, wrap(async (req, res) => {
  const no = await handRefusal()
  if (no) return res.status(429).json({ error: no })
  const already = runState().running
  igRefresh({ why: 'by hand' }).catch((e) => console.error('instagram read failed:', e.message))
  res.status(202).json({ running: true, already })
}))

// Any admin, for the channels they run: the pieces of this month and the last
// with no numbers from Instagram yet.
router.get('/unmatched', wrap(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' })
  const all = await unmatched()
  res.json({ channels: all.channels.filter((c) => isAdminOn(req.user, [c.key])) })
}))

// Anybody who can see the task: what Instagram said about it.
router.get('/task/:id', wrap(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || !(await get('SELECT id FROM content WHERE id = ?', id))) return res.status(404).json({ error: 'Not found' })
  res.json(await taskReading(id))
}))

export default router
