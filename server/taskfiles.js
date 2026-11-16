// ---- every Google Drive file a task points at ---------------------------------
//
// The task window's Files list, so nobody has to go looking: what arrived
// through drop-in or the task's Drive box (drive_drops), what was uploaded into
// the task's own folder ("Upload to Google Drive"), and the Drive links pasted
// on it before either existed — the footage, the cut, the artwork. Each one is
// read with the team account's key, so the board can show it, play it and hand
// it over as a download (routes/drive.js); none of it is copied anywhere.
//
// An old link is somebody's Drive file shared by link. Whether the team account
// can read it is Google's answer, asked when the task is opened and kept in
// drive_links: a good answer for six hours, a "no" for ten minutes — so a link
// shared with the team later starts working by itself.
//
// But the team account reads far more than the board: everything in its own
// Drive, everything ever shared with it. Reading a pasted link with its key
// handed all of that to whoever could paste one — a member who wrote
// drive.google.com/drive/folders/root on a task got the account's own files
// to play and download. So a link is read only when it points inside the
// board's own folders (insideBoard): the team folder, drop-in's folders, a
// channel's shared folder an admin set. Anything else stays the plain link it
// was, and opens in Drive with the reader's own account, where Google decides.
import { all, get, run } from './db.js'
import { metaOf, parentsOf, folderFiles, shapeDrop, readConnection, FOLDER_MIME } from './drive.js'
import { dropsOf, dropFolders } from './dropin.js'

// Where a task keeps its deliveries, in the order the window lists them.
export const LINK_FIELDS = ['ready_link', 'shot_link', 'design_link']
const SEP = ' · '   // a delivery can be "<folder> · <which file>" (routes/content.js deliveryValue)
const FRESH = { ok: 6 * 3600e3, unshared: 10 * 60e3, outside: 10 * 60e3 }
const MAX_CHILDREN = 100
const MAX_DEPTH = 12

// A Drive or Docs address → what it points at, or null for any other link.
//   /file/d/<id>, /document/d/<id> …   a file
//   /drive/folders/<id>                a folder
//   open?id=<id>, uc?id=<id>           either — Google says which
export function driveRef(value) {
  const raw = String(value || '').trim()
  const at = raw.indexOf(SEP)
  const url = (at < 0 ? raw : raw.slice(0, at)).trim()
  const label = at < 0 ? '' : raw.slice(at + SEP.length).trim()
  let u
  try { u = new URL(url) } catch { return null }
  if (!/^(drive|docs)\.google\.com$/.test(u.hostname)) return null
  const key = u.searchParams.get('resourcekey') || null
  // "root" is Google's name for the top of the account's own Drive: never a
  // delivery, always the team account's private files.
  const pick =(id) => (id && /^[\w-]+$/.test(id) && id.toLowerCase() !== 'root' ? { id, key, url, label } : null)
  let m = /\/folders\/([\w-]+)/.exec(u.pathname)
  if (m) return pick(m[1])
  m = /\/d\/([\w-]+)/.exec(u.pathname)
  if (m) return pick(m[1])
  return pick(u.searchParams.get('id'))
}

// The folders the board answers for: the team folder the connection made,
// drop-in's folders (and the one they sit in), and each channel's shared
// folder — set by an admin, never by whoever pastes a link.
async function boardFolders() {
  const ids = new Set()
  const c = readConnection()
  if (c?.root_folder_id) ids.add(c.root_folder_id)
  for (const f of Object.values((await dropFolders()) || {})) if (f?.id) ids.add(f.id)
  for (const ch of await all("SELECT drive_url FROM channels WHERE drive_url IS NOT NULL AND drive_url <> ''")) {
    const ref = driveRef(ch.drive_url)
    if (ref) ids.add(ref.id)
  }
  return ids
}

// Is this file (its parents as Google gave them) inside one of those folders?
// Walked up a level at a time. A folder Google will not show the team account
// ends that branch; any other failure is thrown, so a Google blip is not
// written down as "outside".
async function insideBoard(id, parents) {
  const roots = await boardFolders()
  if (roots.has(id)) return true
  const seen = new Set([id])
  let level = parents || []
  for (let depth = 0; depth < MAX_DEPTH && level.length; depth++) {
    const next = []
    for (const p of level) {
      if (roots.has(p)) return true
      if (seen.has(p)) continue
      seen.add(p)
      try { next.push(...(await parentsOf(p))) } catch (e) { if (e.gstatus !== 403 && e.gstatus !== 404) throw e }
    }
    level = next
  }
  return false
}

// What Google says about one id, from the cache while it is fresh. A row from
// before the board checked where a file lives (`inside` is NULL) is asked again.
async function resolve(ref) {
  const was = await get('SELECT * FROM drive_links WHERE drive_id = ?', ref.id)
  if (was && (was.state !== 'ok' || was.inside != null) && Date.now() - Date.parse(was.checked_at) < (FRESH[was.state] ?? 0)) return was
  let next
  try {
    const f = await metaOf(ref.id, ref.key)
    if (f.trashed) next = { state: 'unshared' }
    else if (!(await insideBoard(f.id || ref.id, f.parents))) next = { state: 'outside' }
    else if (f.mimeType === FOLDER_MIME) {
      next = { state: 'ok', is_folder: 1, name: f.name || '', mime: f.mimeType, link: f.webViewLink || ref.url,
        children: JSON.stringify((await folderFiles(ref.id)).slice(0, MAX_CHILDREN)) }
    } else {
      const d = shapeDrop(f)
      next = { state: 'ok', is_folder: 0, name: d.name, mime: d.mime, size: d.size, duration_ms: d.duration_ms, has_thumb: d.has_thumb, link: d.link }
    }
  } catch (e) {
    // Google's "no": not shared with the team account, or no such file.
    if (e.gstatus === 403 || e.gstatus === 404) next = { state: 'unshared' }
    // Google or the connection is down: say what was last known, keep nothing.
    else return was || { state: 'error' }
  }
  const row = { drive_id: ref.id, state: next.state, is_folder: next.is_folder || 0, name: next.name || '', mime: next.mime || '',
    size: next.size || 0, duration_ms: next.duration_ms ?? null, has_thumb: next.has_thumb || 0, link: next.link || '',
    children: next.children ?? null, inside: next.state === 'ok' ? 1 : 0, checked_at: new Date().toISOString() }
  // Two server copies may ask at once: the second write is the same answer.
  await run(`INSERT INTO drive_links (drive_id, state, is_folder, name, mime, size, duration_ms, has_thumb, link, children, inside, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(drive_id) DO UPDATE SET state = excluded.state, is_folder = excluded.is_folder, name = excluded.name, mime = excluded.mime,
      size = excluded.size, duration_ms = excluded.duration_ms, has_thumb = excluded.has_thumb, link = excluded.link,
      children = excluded.children, inside = excluded.inside, checked_at = excluded.checked_at`,
  row.drive_id, row.state, row.is_folder, row.name, row.mime, row.size, row.duration_ms, row.has_thumb, row.link, row.children, row.inside, row.checked_at)
  return row
}

const fileEntry = (f, extra) => ({
  id: f.id, name: f.name || '', mime: f.mime || '', size: Number(f.size) || 0, duration_ms: f.duration_ms ?? null,
  has_thumb: f.has_thumb ? 1 : 0, link: f.link || `https://drive.google.com/file/d/${f.id}/view`, state: 'ok', ...extra,
})

// The list, for one task. `ownFolder` is what the task's own Drive folder holds
// (routes/drive.js keeps that listing warm). `handled` names the link fields
// shown here, so the window does not draw them a second time as plain links.
export async function taskFiles(row, ownFolder = []) {
  const files = []
  const seen = new Set()
  const add = (e) => { if (e.state !== 'ok' || !seen.has(e.id)) { if (e.state === 'ok') seen.add(e.id); files.push(e) } }
  const handled = []
  // A box can point at a file the board itself put on the Drive (the hand-in
  // writes the upload's link there): that one is still ours — to delete, too.
  const drops = await dropsOf(row.id)
  const ours = new Set([...drops.map((d) => d.file_id), ...ownFolder.map((f) => f.id)])
  for (const field of LINK_FIELDS) {
    const ref = driveRef(row[field])
    if (!ref) continue
    const r = await resolve(ref)
    // Nothing known yet, or a file outside the board's folders: the plain link
    // stays, and opens in Drive as whoever presses it.
    if (r.state === 'error' || r.state === 'outside') continue
    handled.push(field)
    if (r.state === 'unshared') { add({ id: ref.id, state: 'unshared', source: 'link', field, url: ref.url, name: '' }); continue }
    if (!r.is_folder) { add(fileEntry({ ...r, id: ref.id }, { source: 'link', field, key: ref.key, ...(ours.has(ref.id) ? { ours: true } : {}) })); continue }
    // A folder link: its files — the ones the label names, when it names any.
    let kids = []
    try { kids = JSON.parse(r.children || '[]') } catch { kids = [] }
    const want = ref.label.toLowerCase()
    const named = want ? kids.filter((k) => String(k.name).toLowerCase().includes(want)) : []
    const list = named.length ? named : kids
    if (!list.length) add({ id: ref.id, state: 'empty', source: 'link', field, url: ref.url, name: r.name })
    for (const k of list) add(fileEntry(k, { source: 'link', field, folder_name: r.name }))
  }
  for (const d of drops) add(fileEntry({ ...d, id: d.file_id }, { source: 'drop', kind: d.kind, folder_name: d.folder_name, at: d.attached_at }))
  for (const f of ownFolder) add(fileEntry(f, { source: 'upload', at: f.at }))
  return { files, handled }
}

// The files of a task that may be shown, played or downloaded: only what the
// list above put there, never an id somebody typed into an address.
export const mayOpen = (list, id) => list.files.find((f) => f.id === id && f.state === 'ok') || null
