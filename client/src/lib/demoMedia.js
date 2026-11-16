// ---- the demo's material: footage, edits and covers that play --------------------
//
// The real board keeps a piece's files on the team's Google Drive
// (server/taskfiles.js) and the task window plays them from there. The demo
// has no Drive, so every piece looked empty: a link field and nothing to
// watch. This is the demo's stand-in, frontend only (the owner, 9 Nov 2026:
// "fill data with random tasks data"):
//
//   seededOf(t)   what a piece carries by where it stands — footage once it is
//                 filmed (2–4 clips), an edit once one was handed in, a cover
//                 once drawn — drawn from a few generated videos under
//                 /demo-media (scripts: ffmpeg, see design-variants/).
//   addLocal()    what is dropped on a hand-in box in THIS browser, kept in
//                 IndexedDB so it is still there after a reload and plays back
//                 from a blob URL. Nothing leaves the computer.
//
// Only under VITE_DEMO (npm run demo). The real dashboard never imports a
// seeded file: useMaterial returns what the server gives, nothing more.
import { useEffect, useState } from 'react'

export const DEMO = import.meta.env.VITE_DEMO === '1'

// ---- IndexedDB, as small as it gets ----
const DB = 'satashkent-demo-media'
const STORE = 'files'
let dbp = null
const open = () => dbp ||= new Promise((ok, fail) => {
  if (typeof indexedDB === 'undefined') { fail(new Error('no storage')); return }
  const r = indexedDB.open(DB, 1)
  r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('task', 'taskId') }
  r.onsuccess = () => ok(r.result)
  r.onerror = () => fail(r.error)
})
const inStore = (mode, fn) => open().then((db) => new Promise((ok, fail) => {
  const t = db.transaction(STORE, mode)
  const out = fn(t.objectStore(STORE))
  t.oncomplete = () => ok(out?.result !== undefined ? out.result : out)
  t.onerror = () => fail(t.error)
}))
const listeners = new Set()
const emit = (taskId) => { for (const f of listeners) f(taskId) }
export const onLocalChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

// kind: 'footage' | 'edit' | 'cover'
export async function addLocal(taskId, kind, files, by = null) {
  const list = [...files].filter(Boolean)
  if (!list.length) return []
  const rows = list.map((f, i) => ({
    id: `local-${taskId}-${kind}-${Date.now()}-${i}`, taskId: Number(taskId), kind,
    name: f.name, size: f.size, type: f.type || '', blob: f, by, at: new Date().toISOString(),
  }))
  await inStore('readwrite', (s) => { rows.forEach((r) => s.put(r)) })
  emit(Number(taskId))
  return rows
}
export async function removeLocal(id) {
  const row = await inStore('readonly', (s) => s.get(id))
  await inStore('readwrite', (s) => s.delete(id))
  if (row) emit(row.taskId)
}
export const listLocal = (taskId) => inStore('readonly', (s) => s.index('task').getAll(Number(taskId))).catch(() => [])

// The files dropped in this browser for one task, each with a URL that plays.
export function useLocalMedia(taskId) {
  const [items, setItems] = useState([])
  useEffect(() => {
    if (!DEMO || !taskId) return undefined
    let live = true, urls = []
    const load = () => listLocal(taskId).then((rows) => {
      if (!live) return
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls = rows.map((r) => URL.createObjectURL(r.blob))
      setItems(rows.map((r, i) => ({ ...r, url: urls[i], local: true })).sort((a, b) => a.at.localeCompare(b.at)))
    })
    load()
    const off = onLocalChange((id) => { if (id === Number(taskId)) load() })
    return () => { live = false; off(); urls.forEach((u) => URL.revokeObjectURL(u)) }
  }, [taskId])
  return items
}

// ---- what the demo seeds, by where the piece stands ----
const slug = (s) => String(s || 'piece').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 28) || 'piece'
export function seededOf(t) {
  if (!DEMO || !t?.id) return { footage: [], edit: [], cover: [] }
  const filmed = !!(t.shot_link || t.shot_at || t.ready_link || t.done_at)
  // A long video is filmed landscape; a reel, a story and an ad are vertical.
  const wide = t.type === 'video'
  const orient = wide ? 'h' : 'v'
  const n = filmed ? 2 + (t.id % 3) : 0
  const footage = Array.from({ length: n }, (_, i) => ({
    id: `seed-${t.id}-f${i}`, kind: 'footage', name: `IMG_${4120 + t.id * 3 + i}.MOV`, type: 'video/mp4',
    url: `/demo-media/clip-${wide ? 'h' : ''}${((t.id + i) % 4) + 1}.mp4`, orient, size: 148e6 + ((t.id * 7 + i * 31) % 90) * 1e6,
    by: t.operator_id || null, at: t.shot_at || (t.recording_date ? `${t.recording_date}T17:40:00` : ''),
  }))
  const edit = t.ready_link || t.done_at ? [{
    id: `seed-${t.id}-e1`, kind: 'edit', name: `${slug(t.title)}_v1.mp4`, type: 'video/mp4', url: wide ? '/demo-media/edit-h.mp4' : '/demo-media/edit-v1.mp4', orient,
    size: 48e6 + (t.id % 20) * 1e6, by: t.editor_id || null, at: t.edited_at || t.ready_at || '', version: 1,
  }] : []
  const cover = t.design_link ? [{
    id: `seed-${t.id}-c1`, kind: 'cover', name: `${slug(t.title)}_cover.jpg`, type: 'image/jpeg', url: '/demo-media/cover.jpg', orient: 'v',
    size: 1.2e6, by: t.designer_id || null, at: t.ready_at || '',
  }] : []
  return { footage, edit, cover }
}

// Everything a piece has to show, grouped and in order; edits numbered V1, V2…
export function useMaterial(t) {
  const local = useLocalMedia(t?.id)
  const seed = seededOf(t)
  const group = (k) => [...seed[k], ...local.filter((x) => x.kind === k)]
  const edit = group('edit').map((x, i) => ({ ...x, version: i + 1 }))
  return { footage: group('footage'), edit, cover: group('cover') }
}

export const sizeOf = (n) => (!n ? '' : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.round(n / 1e3)} KB`)
export const clock = (s) => (!s && s !== 0 ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`)
