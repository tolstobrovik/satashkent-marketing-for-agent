#!/usr/bin/env node
// The board, as tools for Claude (an MCP server over stdio, no dependencies).
//
// Claude acts as the person whose access key this is (Profile → Claude access,
// routes/keys.js): it finds, reads, creates, changes, moves, comments on and
// deletes tasks through the board's own API, so every rule and every limit on
// reach is the server's, exactly as on the page.
//
// WHERE THE KEY COMES FROM: SATASHKENT_KEY in the environment, else the file
// ~/.satashkent/claude-key (one line). The board is SATASHKENT_URL, else
// https://marketing.satashkent.uz.
//
// Add it to Claude Code once:
//   claude mcp add --scope user satashkent -- node <repo>/mcp/satashkent.mjs
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import readline from 'readline'

const BASE = (process.env.SATASHKENT_URL || 'https://marketing.satashkent.uz').replace(/\/+$/, '')
const keyOf = () => {
  if (process.env.SATASHKENT_KEY) return process.env.SATASHKENT_KEY.trim()
  try { return readFileSync(join(homedir(), '.satashkent', 'claude-key'), 'utf8').trim() } catch { return '' }
}

async function api(method, path, body) {
  const key = keyOf()
  if (!key) throw new Error('No access key: make one under Profile → Claude access and save it to ~/.satashkent/claude-key')
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `The board answered ${r.status}`)
  return data
}

// ---- names → ids ------------------------------------------------------------
// Claude speaks in names ("Instagram Main", "Bekzod", "Editing"); the board in
// ids and keys. Read once a call, matched loosely, and refused when unclear.
async function lookup() {
  const [channels, statuses, people] = await Promise.all([api('GET', '/channels'), api('GET', '/statuses'), api('GET', '/users')])
  return {
    channels: channels.map((c) => ({ key: c.key, name: c.name || c.label || c.key, format: c.format })),
    stages: statuses.map((s) => ({ id: s.id, name: s.label })),
    people: people.filter((p) => !String(p.username || '').startsWith('removed_')).map((p) => ({ id: p.id, name: p.name, role: p.role })),
  }
}
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
function pick(list, wanted, what, label = (x) => x.name) {
  if (wanted == null || wanted === '') return null
  if (typeof wanted === 'number' || /^\d+$/.test(String(wanted))) {
    const hit = list.find((x) => String(x.id) === String(wanted))
    if (hit) return hit
  }
  const w = fold(wanted)
  const exact = list.filter((x) => fold(label(x)) === w || fold(x.key) === w)
  if (exact.length === 1) return exact[0]
  const part = list.filter((x) => fold(label(x)).split(' ').some((word) => word.startsWith(w)) || fold(label(x)).includes(w))
  if (part.length === 1) return part[0]
  const names = (part.length ? part : list).slice(0, 12).map(label).join(', ')
  throw new Error(part.length ? `“${wanted}” could be several ${what}: ${names} — say which` : `No ${what} called “${wanted}”. Known: ${names}`)
}

// The fields Claude may set, in names, turned into the board's own body.
async function bodyOf(args, l) {
  const b = {}
  const person = (v) => (v == null ? undefined : v === '' ? null : pick(l.people, v, 'person').id)
  if (args.title !== undefined) b.title = args.title
  if (args.type !== undefined) b.type = args.type
  if (args.channel !== undefined) b.channels = [pick(l.channels, args.channel, 'channel').key]
  if (args.stage !== undefined) b.status_id = pick(l.stages, args.stage, 'stage').id
  for (const f of ['release_date', 'recording_date', 'recording_time', 'recording_end', 'edit_ready_date', 'design_ready_date', 'script', 'tz', 'description', 'reference_text']) {
    if (args[f] !== undefined) b[f] = args[f]
  }
  if (args.reference_links !== undefined) b.reference_links = args.reference_links
  for (const [arg, field] of [['operator', 'operator_id'], ['editor', 'editor_id'], ['designer', 'designer_id']]) {
    const v = person(args[arg])
    if (v !== undefined) b[field] = v
  }
  if (args.owners !== undefined) b.assignee_ids = args.owners.map((o) => pick(l.people, o, 'person').id)
  if (args.reviewers !== undefined) b.reviewer_ids = args.reviewers.map((o) => pick(l.people, o, 'person').id)
  return b
}

// A task as Claude needs to read it: names, not ids; no pictures.
function brief(t, l) {
  const who = (id) => l.people.find((p) => p.id === id)?.name || null
  const ids = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return [] } }
  return {
    id: t.id, title: t.title, type: t.type,
    channel: ids(t.channels).map((k) => l.channels.find((c) => c.key === k)?.name || k).join(', '),
    stage: l.stages.find((s) => s.id === t.status_id)?.name || null,
    owners: ids(t.assignees ?? t.assignee_ids).map(who).filter(Boolean),
    operator: who(t.operator_id), editor: who(t.editor_id), designer: who(t.designer_id),
    release_date: t.release_date || null, recording_date: t.recording_date || null,
    recording_time: t.recording_time || null, edit_ready_date: t.edit_ready_date || null,
    design_ready_date: t.design_ready_date || null, done: !!t.done_at,
    link: `${BASE}/brief?task=${t.id}`,
  }
}

// ---- the tools ----------------------------------------------------------------
const FIELDS = {
  title: { type: 'string', description: 'What the piece is called' },
  channel: { type: 'string', description: 'Channel name or key, e.g. "Instagram Main"' },
  type: { type: 'string', description: 'Kind of piece, e.g. reel, video, post, story (the channel decides what fits)' },
  stage: { type: 'string', description: 'Stage name or id, e.g. "Idea", "To shoot", "Editing"' },
  release_date: { type: 'string', description: 'Day it goes out, YYYY-MM-DD' },
  recording_date: { type: 'string', description: 'Shoot day, YYYY-MM-DD' },
  recording_time: { type: 'string', description: 'Shoot start, HH:MM' },
  recording_end: { type: 'string', description: 'Shoot end, HH:MM' },
  edit_ready_date: { type: 'string', description: 'Day the edit is due, YYYY-MM-DD' },
  design_ready_date: { type: 'string', description: 'Day the artwork is due, YYYY-MM-DD' },
  operator: { type: 'string', description: 'Who films (a name); empty string to clear' },
  editor: { type: 'string', description: 'Who edits (a name); empty string to clear' },
  designer: { type: 'string', description: 'Who designs (a name); empty string to clear' },
  owners: { type: 'array', items: { type: 'string' }, description: 'Whose task it is (names)' },
  reviewers: { type: 'array', items: { type: 'string' }, description: 'Who checks the work (names)' },
  script: { type: 'string', description: 'The script' },
  tz: { type: 'string', description: 'The ТЗ — what the editor or designer must make' },
  description: { type: 'string', description: 'The idea, in a few lines' },
  reference_text: { type: 'string', description: 'A reference in words' },
  reference_links: { type: 'array', items: { type: 'string' }, description: 'Reference links' },
}
const TOOLS = [
  {
    name: 'board_lookup',
    description: 'The board’s channels, stages and people (names and ids). Read it before creating or changing tasks to use the right names.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => lookup(),
  },
  {
    name: 'find_tasks',
    description: 'Find tasks on the board. Filters are optional; with none, the open tasks you can see.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Words in the title' },
        channel: { type: 'string', description: 'Channel name or key' },
        person: { type: 'string', description: 'Anyone on the task (name)' },
        from: { type: 'string', description: 'With a day on or after, YYYY-MM-DD' },
        to: { type: 'string', description: 'With a day on or before, YYYY-MM-DD' },
        include_done: { type: 'boolean', description: 'Also finished tasks' },
        limit: { type: 'number', description: 'At most this many (default 30)' },
      },
    },
    run: async (a) => {
      const l = await lookup()
      const q = new URLSearchParams()
      if (a.channel) q.set('department', pick(l.channels, a.channel, 'channel').key)
      if (a.from) q.set('from', a.from)
      if (a.to) q.set('to', a.to)
      let rows = (await api('GET', `/content${q.toString() ? `?${q}` : ''}`)).map((t) => brief(t, l))
      if (!a.include_done) rows = rows.filter((t) => !t.done)
      if (a.text) rows = rows.filter((t) => fold(t.title).includes(fold(a.text)))
      if (a.person) {
        const p = pick(l.people, a.person, 'person').name
        rows = rows.filter((t) => [t.operator, t.editor, t.designer, ...t.owners].includes(p))
      }
      return { count: rows.length, tasks: rows.slice(0, Number(a.limit) || 30) }
    },
  },
  {
    name: 'get_task',
    description: 'One task in full: who, days, stage, brief, and its link.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    run: async (a) => {
      const [l, t] = await Promise.all([lookup(), api('GET', `/content/${a.id}`)])
      return { ...brief(t, l), script: t.script || '', tz: t.tz || '', description: t.description || '', reference_links: t.reference_links || [] }
    },
  },
  {
    name: 'create_task',
    description: 'Create a task on the board, as the key’s owner. Title and channel are needed; the rest as known. The board refuses what breaks its rules and says why.',
    inputSchema: { type: 'object', properties: FIELDS, required: ['title', 'channel'] },
    run: async (a) => {
      const l = await lookup()
      const t = await api('POST', '/content', await bodyOf(a, l))
      return { created: brief(t, l) }
    },
  },
  {
    name: 'update_task',
    description: 'Change a task: only the fields given change (days, people, brief, stage, title…).',
    inputSchema: { type: 'object', properties: { id: { type: 'number' }, ...FIELDS }, required: ['id'] },
    run: async (a) => {
      const l = await lookup()
      const { id, ...rest } = a
      const t = await api('PATCH', `/content/${id}`, await bodyOf(rest, l))
      return { updated: brief(t, l) }
    },
  },
  {
    name: 'comment_on_task',
    description: 'Write in a task’s talk. Naming somebody with @Name tells them.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' }, text: { type: 'string' } }, required: ['id', 'text'] },
    run: async (a) => { await api('POST', `/content/${a.id}/comments`, { text: a.text }); return { ok: true } },
  },
  {
    name: 'delete_task',
    description: 'Delete a task for good, with everything on it. Only when the person clearly asked for that task to be deleted; pass confirm: true.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' }, confirm: { type: 'boolean' } }, required: ['id', 'confirm'] },
    run: async (a) => {
      if (a.confirm !== true) throw new Error('Not deleted: pass confirm: true once the person has said to delete it')
      await api('DELETE', `/content/${a.id}`)
      return { deleted: a.id }
    },
  },
]

// ---- the protocol (JSON-RPC 2.0, a message a line) -----------------------------
const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`)
async function handle(m) {
  if (m.method === 'initialize') {
    return send({ id: m.id, result: {
      protocolVersion: m.params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'satashkent', version: '1.0.0' },
      instructions: `The SATashkent marketing board (${BASE}). Read board_lookup before creating or changing tasks. Dates are YYYY-MM-DD, Tashkent.`,
    } })
  }
  if (m.method === 'ping') return send({ id: m.id, result: {} })
  if (m.method === 'tools/list') {
    return send({ id: m.id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } })
  }
  if (m.method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === m.params?.name)
    if (!tool) return send({ id: m.id, error: { code: -32602, message: `Unknown tool: ${m.params?.name}` } })
    try {
      const out = await tool.run(m.params?.arguments || {})
      return send({ id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }] } })
    } catch (e) {
      return send({ id: m.id, result: { content: [{ type: 'text', text: e.message }], isError: true } })
    }
  }
  if (m.id !== undefined) send({ id: m.id, error: { code: -32601, message: `Unknown method: ${m.method}` } })
}
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return
  let m
  try { m = JSON.parse(line) } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }) }
  handle(m).catch((e) => send({ id: m.id ?? null, error: { code: -32603, message: e.message } }))
})
