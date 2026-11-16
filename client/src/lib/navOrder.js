// ---- the sidebar’s channels: their groups, their order and what is folded
// (the S2 sidebar, November 2026; finding a channel is Quick find’s since round 2) ----
//
// Whose order is whose. The board's order is the server's (`sort` on each
// channel, GET /channels; an admin's drag is saved there with POST
// /channels/reorder and everybody reads it). A personal order is this
// browser's, per person, kept here over the board's — anybody but an admin
// (an admin's drag is always the board's; round 3 took the switch away). A channel the personal order
// has never heard of (a new one) keeps the board's place at the end of its
// group; nothing is ever lost by reordering.

export const GROUPS = [
  { key: 'core', label: 'Core Channels' },
  { key: 'programs', label: 'Programs & Special' },
]

// Which group a channel is in. The server's `nav_group`, when a channel has
// one; else the format says it: a written channel (X, LinkedIn, Threads) and
// a repost channel (TikTok, Shorts) are the programmes, the social feeds and
// the ads are the core.
export const groupOf = (c) => {
  const g = String(c?.nav_group || '').toLowerCase()
  if (g === 'core' || g === 'programs') return g
  return c?.format === 'short' || c?.format === 'repost' ? 'programs' : 'core'
}

// The person's channels by group, in the board's order, keeping only the
// groups that have something in them. A person whose channels all fall in one
// group sees one group simply called "Channels".
export function groupChannels(list) {
  const out = GROUPS.map((g) => ({ ...g, channels: list.filter((c) => groupOf(c) === g.key) })).filter((g) => g.channels.length)
  if (out.length === 1) return [{ ...out[0], label: 'Channels', only: true }]
  return out
}

// ---- the personal order ----
const ORDER_KEY = (uid) => `satashkent_nav_order_${uid}`
const FOLD_KEY = (uid) => `satashkent_nav_fold_${uid}`
const readJSON = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? fallback } catch { return fallback } }
const writeJSON = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)) } catch { /* a private window keeps the board's */ } }

export const readPersonalOrder = (uid) => { const o = readJSON(ORDER_KEY(uid), {}); return o && typeof o === 'object' && !Array.isArray(o) ? o : {} }
export const writePersonalOrder = (uid, order) => writeJSON(ORDER_KEY(uid), order && Object.keys(order).length ? order : null)
export const hasPersonalOrder = (uid) => Object.values(readPersonalOrder(uid)).some((l) => Array.isArray(l) && l.length)


// The group's rows in the order to draw: the saved keys first, in their order,
// then whatever the saved list never named, in the board's order.
export function orderWithin(channels, savedKeys) {
  if (!Array.isArray(savedKeys) || !savedKeys.length) return channels
  const pos = new Map(savedKeys.map((k, i) => [k, i]))
  return [...channels].sort((a, b) => (pos.has(a.key) ? pos.get(a.key) : 1e9 + channels.indexOf(a)) - (pos.has(b.key) ? pos.get(b.key) : 1e9 + channels.indexOf(b)))
}

// The whole board's ids with one group's members in a new order — what an
// admin's drag sends to the server. The members keep the slots their group
// held, so the other group is untouched and the groups do not interleave.
export function boardIdsWith(all, groupKey, orderedKeys) {
  const members = new Map(all.filter((c) => groupOf(c) === groupKey).map((c) => [c.key, c]))
  const queue = orderedKeys.filter((k) => members.has(k)).map((k) => members.get(k))
  // Members the drag never named (a channel this person cannot see) keep their relative order after the named ones.
  const named = new Set(orderedKeys)
  for (const c of all) if (members.has(c.key) && !named.has(c.key)) queue.push(c)
  let i = 0
  return all.map((c) => (members.has(c.key) ? queue[i++] : c)).map((c) => c.id)
}

// ---- folding ----
export const readFolded = (uid) => { const a = readJSON(FOLD_KEY(uid), []); return new Set(Array.isArray(a) ? a : []) }
export const writeFolded = (uid, set) => writeJSON(FOLD_KEY(uid), [...set])

// ---- the hold hint: "Hold a channel to move it", once per person, until dismissed ----
const HINT_KEY = (uid) => `satashkent_hint_hold_${uid}`
export const readHoldHint = (uid) => { try { return localStorage.getItem(HINT_KEY(uid)) !== 'done' } catch { return false } }
export const doneHoldHint = (uid) => { try { localStorage.setItem(HINT_KEY(uid), 'done') } catch { /* a private window shows it again */ } }

// ======================================================================
// Round 6: the channels' LAYOUT — a list of items, not an order.
// An item is a channel standing alone ({ t: 'c', key }; Design is one too,
// key 'design') or a folder ({ t: 'f', id, name, icon, seed?, items: [key…] }).
// The board's layout is one setting on the server (GET/PUT /channels/layout,
// an admin's change); anybody else's is their own, in this browser, over the
// board's. Every function below is pure: it takes a layout and returns a new
// one, never touching the one it was given.
// The owner's rules (§8 of design-variants/sidebar-tz-r6.md, 12 Nov 2026),
// pinned case by case in design-variants/nav-layout.test.mjs (L1–L30):
// – My Day and Calendar are fixed; the first free slot is right under
//   Calendar (top-level index 0), and a channel standing alone lives there.
// – One gesture, not two: a channel leaves a folder and lands in one move.
// – A folder always holds two or more: a move that leaves one dissolves it,
//   its last item standing where the folder was. Read for a person, a saved
//   folder holding fewer than two of their channels is drawn as lone cards
//   (derived on read — never written back to the board).
// – The default layout: a group of 3 or more channels is a folder; 1 or 2
//   stand alone under Calendar, before the folders. Design goes with Core's
//   items but does not count toward the 3 (the matrix: Design + 2 is three
//   lone cards, Design + 3 a folder).
// – No nesting: a folder moves among the cards and never into a folder.
// ======================================================================
export const SEEDS = { core: 'Core Channels', programs: 'Programs & Special' }
export const FOLDER_ICONS = ['stack', 'folder', 'star', 'sparkles', 'megaphone', 'film', 'camera', 'clapperboard', 'mic', 'pen-line', 'image', 'globe', 'map-pin', 'flag', 'graduation-cap', 'book-open', 'users', 'heart', 'zap', 'target', 'trophy', 'calendar', 'briefcase', 'layers']
export const NAME_MAX = 24
export const MIN_FOLDER = 2      // a folder always holds two or more
export const AUTO_FOLDER = 3     // the default layout folds a group of this many channels or more
const clone = (layout) => layout.map((it) => (it.t === 'f' ? { ...it, items: [...it.items] } : { ...it }))
const solo = (key) => ({ t: 'c', key })
const clamp = (i, n) => Math.max(0, Math.min(i, n))
const MARK = 'm'                  // a slot kept while things move (makeFolder, folderWith)

// The default layout of a person: the board's two groups run through their channels — a group of 3+ channels a folder,
// 1–2 lone cards right under Calendar, in the group's order, before the folders.
export function defaultLayout(channels, { design = true } = {}) {
  const core = channels.filter((c) => groupOf(c) === 'core').map((c) => c.key)
  const prog = channels.filter((c) => groupOf(c) === 'programs').map((c) => c.key)
  const groups = [
    { seed: 'core', items: [...(design ? ['design'] : []), ...core], count: core.length },
    { seed: 'programs', items: prog, count: prog.length },
  ]
  const alone = []; const folders = []
  for (const g of groups) {
    if (!g.items.length) continue
    if (g.count >= AUTO_FOLDER) folders.push({ t: 'f', id: g.seed, seed: g.seed, name: null, icon: null, items: g.items })
    else alone.push(...g.items.map(solo))
  }
  return [...alone, ...folders]
}

// The layout as a person reads it, for their keys (Design first when they have it, then their channels): a key they do
// not have is left out; a folder left with fewer than two of theirs is drawn as lone cards where it was; a key the layout
// never named (a channel the board added later) stands at the end.
export function reconcile(layout, keys) {
  const allow = new Set(keys); const placed = new Set(); const out = []
  for (const it of layout || []) {
    if (it.t === 'c') { if (allow.has(it.key) && !placed.has(it.key)) { placed.add(it.key); out.push(solo(it.key)) } }
    else if (it.t === 'f') {
      const items = (it.items || []).filter((k) => allow.has(k) && !placed.has(k))
      items.forEach((k) => placed.add(k))
      if (items.length >= MIN_FOLDER) out.push({ ...it, items })
      else out.push(...items.map(solo))
    }
  }
  for (const k of keys) if (!placed.has(k)) out.push(solo(k))
  return out
}
// Whose layout a person reads: their own, else the board's, else the default — always through `reconcile`.
export function layoutFor({ personal = null, board = null, channels = [], design = false } = {}) {
  const keys = [...(design ? ['design'] : []), ...channels.map((c) => c.key)]
  const source = Array.isArray(personal) ? personal : Array.isArray(board) ? board : defaultLayout(channels, { design })
  return reconcile(source, keys)
}
// What is drawn (a reconciled layout already is; kept for the rail and old callers).
export const shownItems = (layout) => layout.filter((it) => it.t === 'c' || it.items.length >= MIN_FOLDER)
// The layout as stored.
export const stored = (layout) => layout.map((it) => (it.t === 'f' ? { t: 'f', id: it.id, name: it.name ?? null, icon: it.icon ?? null, ...(it.seed ? { seed: it.seed } : {}), items: [...it.items] } : { t: 'c', key: it.key }))

// Where a key stands: { folder: id | null, index, top } (index within its folder, or in the top-level list).
export function find(layout, key) {
  for (let i = 0; i < layout.length; i++) {
    const it = layout[i]
    if (it.t === 'c' && it.key === key) return { folder: null, index: i, top: i }
    if (it.t === 'f') { const j = it.items.indexOf(key); if (j >= 0) return { folder: it.id, index: j, top: i } }
  }
  return null
}
export const topIndexOf = (layout, folderId) => layout.findIndex((it) => it.t === 'f' && it.id === folderId)
export const folderOf = (layout, folderId) => layout.find((it) => it.t === 'f' && it.id === folderId) || null
export const flatten = (layout) => layout.flatMap((it) => (it.t === 'f' ? it.items : it.t === 'c' ? [it.key] : []))
// The folders above and below a top-level index (the neighbours a row can go into).
export function foldersBeside(layout, topIndex) {
  const up = layout[topIndex - 1]; const down = layout[topIndex + 1]
  return [up?.t === 'f' ? up : null, down?.t === 'f' ? down : null].filter(Boolean)
}

// Take a key out (a copy). Its folder, left with fewer than two, dissolves in place — its last item stands where it was —
// unless it is `keep` (the folder the key is going back into).
function take(layout, key, keep = null) {
  const at = find(layout, key)
  if (!at) return null
  const out = clone(layout)
  if (at.folder == null) out.splice(at.index, 1)
  else {
    const f = folderOf(out, at.folder); f.items.splice(at.index, 1)
    if (f.id !== keep && f.items.length < MIN_FOLDER) out.splice(out.indexOf(f), 1, ...f.items.map(solo))
  }
  return out
}

// Move a key to { folder: id | null, index }, in one move. The index is read in the layout AFTER the key was taken out
// (a folder it leaves with one is then already that one card — the top-level count does not change).
export function moveItem(layout, key, to) {
  const out = take(layout, key, to.folder)
  if (!out) return layout
  if (to.folder == null) { out.splice(clamp(to.index ?? out.length, out.length), 0, solo(key)); return out }
  const f = folderOf(out, to.folder)
  if (!f) return layout
  f.items.splice(clamp(to.index ?? f.items.length, f.items.length), 0, key)
  return out
}
// Into a folder (at its end unless an index is given).
export const intoFolder = (layout, key, folderId, index) => moveItem(layout, key, { folder: folderId, index: index ?? (folderOf(layout, folderId)?.items.filter((k) => k !== key).length ?? 0) })
// Out of its folder, to stand alone — right under Calendar unless a top-level index is given.
export function outOfFolder(layout, key, index = 0) {
  const at = find(layout, key)
  if (!at || at.folder == null) return layout
  return moveItem(layout, key, { folder: null, index })
}

// A new folder in a kept slot: the slot marked, the keys taken out (their folders dissolving as they must), the folder put in.
const fill = (out, folder) => { const i = out.findIndex((it) => it.t === MARK); out.splice(i, 1, folder); return out }
// `a` (the one dragged) dropped on `b` standing alone: a folder {b, a}, where b stood.
export function makeFolder(layout, a, b, { id, name = null, icon = null } = {}) {
  const atA = find(layout, a); const atB = find(layout, b)
  if (a === b || !atA || !atB || atB.folder != null) return layout
  const out = clone(layout)
  out.splice(atB.index, 1, { t: MARK })
  return fill(take(out, a), { t: 'f', id, name, icon, items: [b, a] })
}
// The move bar's "New folder with…": a folder {a, b} where a stood (a in a folder: right after that folder).
export function folderWith(layout, a, b, { id, name = null, icon = null } = {}) {
  const atA = find(layout, a); const atB = find(layout, b)
  if (a === b || !atA || !atB) return layout
  let out
  if (atA.folder == null) { out = clone(layout); out.splice(atA.index, 1, { t: MARK }) }
  else { out = take(layout, a); out.splice(atA.top + 1, 0, { t: MARK }) }
  return fill(take(out, b), { t: 'f', id, name, icon, items: [a, b] })
}
// What dropping `a` on the channel `b` does: nothing (itself), a reorder (the same folder), join (b's folder), make (b alone).
export function dropKind(layout, a, b) {
  const atA = find(layout, a); const atB = find(layout, b)
  if (a === b || !atA || !atB) return 'none'
  if (atB.folder == null) return 'make'
  return atA.folder === atB.folder ? 'reorder' : 'join'
}
// …and the layout after it: a right after b in b's folder, or a new folder {b, a} where b stood.
export function dropOn(layout, a, b, opts = {}) {
  const kind = dropKind(layout, a, b)
  if (kind === 'none') return layout
  if (kind === 'make') return makeFolder(layout, a, b, opts)
  const g = find(layout, b).folder
  const rest = folderOf(take(layout, a, g), g).items
  return moveItem(layout, a, { folder: g, index: rest.indexOf(b) + 1 })
}
// A folder among the cards (never into a folder): to a top-level index, read after it was taken out.
export function moveFolder(layout, id, index) {
  const i = topIndexOf(layout, id)
  if (i < 0) return layout
  const out = clone(layout)
  const [f] = out.splice(i, 1)
  out.splice(clamp(index, out.length), 0, f)
  return out
}
// A name: trimmed, at most 24; empty is no name ("Folder" is drawn — a seeded folder loses its seed's name with it, L19).
// The same name is the same layout (no save, no toast).
export function renameFolder(layout, id, name) {
  const f = folderOf(layout, id)
  if (!f) return layout
  const next = String(name ?? '').trim().slice(0, NAME_MAX) || null
  if (next === (f.name ?? null) && !(next === null && f.seed)) return layout
  return layout.map((it) => {
    if (it !== f) return it
    const { seed, ...rest } = it
    return { ...rest, ...(next === null ? {} : seed ? { seed } : {}), items: [...it.items], name: next }
  })
}
// An icon: one of the 24; "stack" (the first two channels' marks) or anything else is no icon.
export function setIcon(layout, id, icon) {
  const f = folderOf(layout, id)
  if (!f) return layout
  const next = icon && icon !== 'stack' && FOLDER_ICONS.includes(icon) ? icon : null
  if (next === (f.icon ?? null)) return layout
  return layout.map((it) => (it === f ? { ...it, items: [...it.items], icon: next } : it))
}
// Ungroup: the folder's channels stand on their own where it was.
export function dissolve(layout, id) {
  const i = topIndexOf(layout, id)
  if (i < 0) return layout
  const out = clone(layout)
  return [...out.slice(0, i), ...layout[i].items.map(solo), ...out.slice(i + 1)]
}
// Where a drag may land — the one table the column asks (the probe drives the same cases on the page).
//   drag:   { type: 'channel', from: folderId | null } | { type: 'folder' }
//   target: { type: 'row', folder: id | null, zone: 'before' | 'middle' | 'after' } | { type: 'header', folder }
//           | { type: 'gap' } (between cards, or right under Calendar) | { type: 'fixed' } (My Day, Calendar, above them)
//           | { type: 'manage' } (Management, Settings)
//   →       'line' (stand alone there / the folder moves there) | 'make' | 'join' | 'into' | 'reorder' | 'none'
export function landing(drag, target) {
  if (!drag || !target || target.type === 'fixed' || target.type === 'manage') return 'none'
  if (target.type === 'gap') return 'line'
  if (drag.type === 'folder') return 'none'
  if (target.type === 'header') return target.folder === drag.from ? 'none' : 'into'
  if (target.type === 'row') {
    if (target.folder == null) return target.zone === 'middle' ? 'make' : 'line'
    if (target.folder === drag.from) return target.zone === 'middle' ? 'none' : 'reorder'
    return 'join'
  }
  return 'none'
}

// ---- the personal layout (this browser, per person); round 3's personal order is dropped (not migrated: it was an order
// within the two groups, which the board's layout now carries) ----
const LAYOUT_KEY = (uid) => `satashkent_nav_layout_${uid}`
export const readPersonalLayout = (uid) => {
  try { localStorage.removeItem(ORDER_KEY(uid)) } catch { /* fine */ }
  const l = readJSON(LAYOUT_KEY(uid), null)
  return Array.isArray(l) ? l : null
}
export const writePersonalLayout = (uid, layout) => writeJSON(LAYOUT_KEY(uid), layout ? stored(layout) : null)
