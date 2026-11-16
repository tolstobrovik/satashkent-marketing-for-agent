// Jarvis on the page (jarvis.js): ask it, and read what it last spotted.
// Full admins only — it reads the whole team.
import { Router } from 'express'
import { get } from '../db.js'
import { authRequired, wrap } from '../auth.js'
import { geminiReady } from '../gemini.js'
import { jarvisFor, jarvisAsk, jarvisAlerts, jarvisDaily } from '../jarvis.js'

const router = Router()
router.use(authRequired)
const boss = (req, res) => {
  if (jarvisFor(req.user)) return false
  res.status(403).json({ error: 'Jarvis is for the admins who run the whole team' })
  return true
}
const langOf = async (req) => {
  const l = String(req.body?.lang || req.query.lang || '')
  if (['en', 'ru', 'uz'].includes(l)) return l
  return (await get('SELECT lang FROM users WHERE id = ?', req.user.id))?.lang || 'en'
}

// Whether there is a Jarvis to talk to, for whoever is asking.
router.get('/status', wrap(async (req, res) => {
  res.json({ can: jarvisFor(req.user), ready: geminiReady() })
}))

// A question, with the task in view when there is one.
router.post('/ask', wrap(async (req, res) => {
  if (boss(req, res)) return
  if (!geminiReady()) return res.status(503).json({ error: 'Jarvis wakes up when the Gemini key is set' })
  const q = String(req.body?.q || '').trim()
  if (!q) return res.status(400).json({ error: 'Ask Jarvis something' })
  const task = Number(req.body?.task) || null
  try {
    res.json(await jarvisAsk(req.user, q, { lang: await langOf(req), task }))
  } catch (e) {
    res.status(e.later ? 503 : 502).json({ error: e.message })
  }
}))

// Look at the board now, not at ten: what is new is told, as at ten.
router.post('/look', wrap(async (req, res) => {
  if (boss(req, res)) return
  if (!geminiReady()) return res.status(503).json({ error: 'Jarvis wakes up when the Gemini key is set' })
  res.json({ told: await jarvisDaily({ force: true }) })
}))

// What it spotted lately, newest first.
router.get('/alerts', wrap(async (req, res) => {
  if (boss(req, res)) return
  res.json(await jarvisAlerts(await langOf(req)))
}))

export default router
