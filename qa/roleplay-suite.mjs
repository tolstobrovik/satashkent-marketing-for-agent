// The role play (24 Oct 2026): sign in as every demo user and read their
// My Day the way the client reads it (lib/coach.js, lib/nextStep.js — pure
// modules), then ask the owner's question of every open task: is it on
// SOMEBODY's screen, and on the screen of everybody it is assigned to?
//
// "There was something and it was not assigned, I didn't see this, it didn't
// show up on my screen." This suite is that sentence, asked of the demo board
// (scripts/demo-data.mjs) after every change.
//
//   BASE=http://localhost:4095 node qa/roleplay-suite.mjs   (the browser group)
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const BASE = process.env.BASE || process.env.DEMO_API || 'http://localhost:4095'
const ROOT = process.env.DASHB_ROOT || process.cwd()
const from = (p) => pathToFileURL(join(ROOT, p)).href
const { crewEntries, crewDay, makerDay, ownersOf } = await import(from('client/src/lib/coach.js'))
const { pipelineOf, makingOf, nextStepOf } = await import(from('client/src/lib/nextStep.js'))
const { askedOf } = await import(from('client/src/lib/channelFormat.js'))

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }

async function call(token, method, path, body) {
  const r = await fetch(`${BASE}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(`${method} ${path} → ${r.status}: ${data?.error || ''}`), { status: r.status })
  return data
}
const login = async (u, p) => (await call(null, 'POST', '/auth/login', { username: u, password: p })).token
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())

// scripts/demo-data.mjs gives the admin the demo password at its end (so the
// weak-password warning is not drawn over every screen), as a11y-suite and
// i18n-suite already know.
const admin = await login('admin', process.env.ADMIN_PASSWORD || process.env.DEMO_PASSWORD || 'demo-team-2026')
const users = (await call(admin, 'GET', '/users')).filter((u) => u.role !== 'ambassador')
const statuses = await call(admin, 'GET', '/statuses')
const fields = await call(admin, 'GET', '/fields')
const channels = await call(admin, 'GET', '/channels')
const byKey = Object.fromEntries(channels.map((c) => [c.key, c]))
const statusesById = Object.fromEntries(statuses.map((s) => [s.id, s]))
const pipe = pipelineOf(statuses)
const all = await call(admin, 'GET', '/content')
const open = all.filter((t) => !t.done_at && !/deleted/i.test(statusesById[t.status_id]?.label || ''))
ok('the demo board has open work to play with', open.length >= 10, `${open.length} open of ${all.length}`)

// What the admin's day puts first: steps with nobody in the seat.
const team = await call(admin, 'GET', `/content/day/team?date=${today}&everyone=1`)
const seatless = new Set((team.seatless || []).map((x) => x.content_id))

const CREW = ['editor', 'operator', 'designer', 'crew']
const seen = new Map()   // task id → who lists it
const note = (id, who) => { if (!seen.has(id)) seen.set(id, new Set()); seen.get(id).add(who) }
const gaps = []
for (const u of users) {
  // The same password the admin's line above reads (a local demo signs everybody in with DEMO_PASSWORD).
  const tok = u.username === 'admin' ? admin : await login(u.username, process.env.DEMO_PASSWORD || 'demo-team-2026').catch(() => null)
  // An account another suite made with its own password is not a demo user:
  // skipped, not a gap.
  if (!tok) { console.log(`  (could not sign in as ${u.username} — skipped)`); continue }
  const content = await call(tok, 'GET', '/content')
  const visible = new Set(content.map((t) => t.id))
  const makingFor = (t) => makingOf(t, fields?.crew, askedOf(fields?.channel_formats, t.channels, byKey, !!t.with_media))
  const stepOf = (t) => nextStepOf(t, pipe, makingFor(t), { move: true, publish: u.role === 'admin' })
  const doneSeat = new Set()
  if (CREW.includes(u.role)) {
    const entries = crewEntries(content, u.id, statusesById, pipe)
    for (const e of entries) if (e.done) doneSeat.add(e.t.id)
    const fixes = await call(tok, 'GET', '/content/revisions/mine').catch(() => [])
    const asks = content.filter((t) => t.operator_id === u.id && t.recording_date >= today && !t.shoot_ack && !t.done_at).map((t) => ({ t, which: 'shoot' }))
    for (const r of crewDay({ entries, today, asks, fixes: Array.isArray(fixes) ? fixes : [] }).rows) note(r.t.id, u.name)
  } else {
    const mine = content.filter((t) => ownersOf(t).includes(u.id) || t.operator_id === u.id || t.editor_id === u.id || t.designer_id === u.id)
    for (const r of makerDay({ pieces: mine, today, userId: u.id, pipe, stepOf }).rows) note(r.t.id, u.name)
  }
  for (const t of open) {
    const seat = t.operator_id === u.id ? 'operator' : t.editor_id === u.id ? 'editor' : t.designer_id === u.id ? 'designer' : ownersOf(t).includes(u.id) ? 'owner' : null
    if (!seat) continue
    if (!visible.has(t.id)) { gaps.push(`${u.name} is ${seat} of #${t.id} and GET /content hides it`); continue }
    // A job already done leaves the day; everything else they hold is on it.
    if (u.role === 'admin' || doneSeat.has(t.id)) continue
    if (!seen.get(t.id)?.has(u.name)) gaps.push(`${u.name} (${u.role}) is ${seat} of #${t.id} "${t.title}" [${statusesById[t.status_id]?.label}] and it is not on their My Day`)
  }
}
ok('everything a person is assigned to is on their My Day', gaps.length === 0, gaps.slice(0, 6).join('; '))

const orphans = open.filter((t) => !seen.has(t.id) && !seatless.has(t.id))
ok('no open task is on nobody\'s screen', orphans.length === 0,
  orphans.slice(0, 5).map((t) => `#${t.id} "${t.title}" [${statusesById[t.status_id]?.label}] owner=${ownersOf(t).join(',') || '—'}`).join('; '))
ok('every open task has an owner', open.every((t) => ownersOf(t).length > 0), open.filter((t) => !ownersOf(t).length).map((t) => `#${t.id}`).join(' '))
ok('every open task has a release day', open.every((t) => !!t.release_date), open.filter((t) => !t.release_date).map((t) => `#${t.id}`).join(' '))
const odd = open.filter((t) => (t.recording_date && t.release_date && t.recording_date > t.release_date)
  || (t.edit_ready_date && t.release_date && t.edit_ready_date > t.release_date)
  || (t.design_ready_date && t.release_date && t.design_ready_date > t.release_date))
ok('nothing goes out before it is made', odd.length === 0, odd.map((t) => `#${t.id} shoot=${t.recording_date} edit=${t.edit_ready_date} out=${t.release_date}`).join('; '))

// The server's own walls, as the role play found them wanting (24 Oct 2026).
const probe = async (body) => { try { const t = await call(admin, 'POST', '/content', body); return { t } } catch (e) { return { e } } }
const base = { title: 'Role play probe', channels: ['instagram_main'], type: 'reel' }
const made = []
{
  const { t } = await probe({ ...base, assignee_ids: [], release_date: null })
  made.push(t?.id)
  ok('a task given no owner belongs to whoever made it', t && ownersOf(t).length === 1, t ? `owners=${ownersOf(t)}` : 'refused')
  ok('…and a task given no day is born on today', t && t.release_date === today, t ? `release=${t.release_date}` : 'refused')
}
{
  const { e } = await probe({ ...base, recording_date: '2030-01-20', release_date: '2030-01-01' })
  ok('a piece cannot go out before it is filmed', e?.status === 400, e ? e.message : 'accepted')
}
{
  const { e } = await probe({ ...base, recording_date: '2030-01-10', edit_ready_date: '2030-01-05', release_date: '2030-01-15' })
  ok('an edit is not due before the shoot on the way in', e?.status === 400, e ? e.message : 'accepted')
}
{
  const { t } = await probe({ ...base, recording_date: '2030-01-10', edit_ready_date: '2030-01-12', release_date: '2030-01-15' })
  made.push(t?.id)
  let r = null
  try { await call(admin, 'PATCH', `/content/${t.id}`, { release_date: '2030-01-05' }) } catch (e) { r = e }
  ok('…nor can a change put the release before the shoot', r?.status === 400, r ? r.message : 'accepted')
  r = null
  try { await call(admin, 'PATCH', `/content/${t.id}`, { assignee_ids: [] }) } catch (e) { r = e }
  ok('…nor empty the owners', r?.status === 400, r ? r.message : 'accepted')
}
for (const id of made.filter(Boolean)) await call(admin, 'DELETE', `/content/${id}`).catch(() => {})

console.log(fails ? `\n${fails} FAILED` : '\nEverybody sees what is theirs.')
process.exit(fails ? 1 : 0)
