import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, Download, Trash2, X, ChevronDown, Check, Maximize2 } from 'lucide-react'
import { PanZoom } from './Zoom.jsx'
import { clock } from '../lib/demoMedia.js'
import { tr as tx } from '../lib/i18n.jsx'

// ---- files as an even grid (the owner, 9 Nov 2026) ----------------------------------
//
// "The first file is too big, the second too short": a strip of clips under one
// big player read as scattered. So every set of files is one grid whose shape
// follows how many there are and which way they were filmed:
//
//   vertical (9:16)    1 → the clip and its facts side by side · 2, 3, 4 → one row
//                      (four vertical clips in a square would stand ~950 px tall) ·
//                      5, 6 → rows of three · more → rows of four
//   landscape (16:9)   1 → full width · 2 → stacked, both full width · 3 → one wide
//                      and two under it · 4 → a square · 5 → one wide and a square
//                      under it · more → rows of three
//
// A last row that is short is centred. The way a clip was filmed is read off
// the file when it loads (videoWidth/videoHeight), else off the seed.
//
// Each clip: pointed at or focused, Play in the middle and its own Download;
// a tick to choose some; Download all (or "Download 3" once some are ticked)
// in the block's head. Pressed, it plays in the middle of the page.

export const orientOf = (files, seen) => {
  const o = files.map((f) => seen[f.id] || f.orient || 'v')
  return o.filter((x) => x === 'h').length > o.length / 2 ? 'h' : 'v'
}

function layout(n, o) {
  if (n === 1) return { single: true }   // one file is one file, upright or wide (12 Nov 2026)
  if (o === 'v') {
    const per = n <= 4 ? n : n <= 6 ? 3 : 4
    return { per, hero: 0 }
  }
  if (n === 2) return { per: 1, hero: 0 }
  if (n === 3) return { per: 2, hero: 1 }
  if (n === 4) return { per: 2, hero: 0 }
  if (n === 5) return { per: 2, hero: 1 }
  return { per: 3, hero: 0 }
}

const save = (f) => {
  const a = document.createElement('a'); a.href = f.url; a.download = f.name; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
}
const saveAll = (list) => list.forEach((f, i) => setTimeout(() => save(f), i * 400))

export default function MediaGrid({ files, head = null, onRemove = null, allLabel = null, compact = false }) {
  const [seen, setSeen] = useState({})       // id → 'v' | 'h', read off the file
  const [len, setLen] = useState({})         // id → seconds
  const [picked, setPicked] = useState([])   // ids ticked
  const [watch, setWatch] = useState(null)
  if (!files.length) return head ? <div className="tw-bh">{head}</div> : null
  const o = orientOf(files, seen)
  const L = compact ? { per: files.length, hero: 0 } : layout(files.length, o)
  const cols = L.single ? 2 : L.per * 2
  const rest = files.length - (L.hero || 0)
  const rem = L.per ? rest % L.per : 0
  const lastStart = rem ? files.length - rem : -1
  const chosen = files.filter((f) => picked.includes(f.id))
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const isPic = (f) => /^image\//.test(f.type || '')

  const tile = (f, i) => {
    const span = compact || L.single ? undefined : i < (L.hero || 0) ? `1 / -1` : i === lastStart ? `${1 + (L.per - rem)} / span 2` : 'span 2'
    const on = picked.includes(f.id)
    return (
      <div key={f.id} className={`tw-tile tw-${seen[f.id] || f.orient || o}${on ? ' sel' : ''}`} style={{ gridColumn: span }}>
        {/* the picture or the frame is the tile's face; the Play button beside it carries the name */}
        {isPic(f) ? <img src={f.url} alt="" /> : (
          <video src={`${f.url}#t=0.5`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              setLen((m) => ({ ...m, [f.id]: v.duration }))
              if (v.videoWidth && v.videoHeight) setSeen((m) => (m[f.id] ? m : { ...m, [f.id]: v.videoWidth >= v.videoHeight ? 'h' : 'v' }))
            }} />
        )}
        <button type="button" className="tw-tile-play" onClick={() => setWatch(f)} aria-label={`${isPic(f) ? tx('View') : tx('Play')}: ${f.name}`} title={f.name}>
          <span>{isPic(f) ? <Maximize2 size={20} aria-hidden="true" /> : <Play size={22} aria-hidden="true" />}</span>
        </button>
        <label className="tw-tile-tick" title={tx('Choose')}>
          <input type="checkbox" checked={on} onChange={() => toggle(f.id)} aria-label={`${tx('Choose')}: ${f.name}`} />
          <span aria-hidden="true"><Check size={14} /></span>
        </label>
        <span className="tw-tile-acts">
          <button type="button" className="tw-tile-btn" onClick={() => save(f)} aria-label={`${tx('Download')}: ${f.name}`} title={tx('Download')}><Download size={16} aria-hidden="true" /></button>
          {onRemove && f.local && <button type="button" className="tw-tile-btn" onClick={() => onRemove(f)} aria-label={`${tx('Delete')}: ${f.name}`} title={tx('Delete')}><Trash2 size={16} aria-hidden="true" /></button>}
        </span>
        {f.version != null && <span className="tw-ver">V{f.version}</span>}
        {len[f.id] != null && <span className="tw-tc">{clock(len[f.id])}</span>}
      </div>
    )
  }

  return (
    <>
      {head && (
        <div className="tw-bh">
          {head}
          <span className="tw-sp">
            {chosen.length > 0 ? (
              <>
                <button type="button" className="co-btn co-btn-sm tw-dl" onClick={() => saveAll(chosen)}><Download size={16} aria-hidden="true" />{tx('Download {n}', { n: chosen.length })}</button>
                <button type="button" className="co-ib" onClick={() => setPicked([])} aria-label={tx('Clear the choice')} title={tx('Clear the choice')}><X size={16} aria-hidden="true" /></button>
              </>
            ) : files.length > 1 ? (
              <button type="button" className="co-btn co-btn-sm tw-dl" onClick={() => saveAll(files)}><Download size={16} aria-hidden="true" />{allLabel || tx('Download all')}</button>
            ) : (
              <button type="button" className="co-btn co-btn-sm tw-dl" onClick={() => save(files[0])}><Download size={16} aria-hidden="true" />{tx('Download')}</button>
            )}
          </span>
        </div>
      )}
      <div className={`tw-grid${L.single ? ' tw-single' : ''}${picked.length ? ' picking' : ''}${compact ? ' tw-compact' : ''}`} style={{ '--cols': cols }}>
        {files.map(tile)}
        {/* 12 Nov 2026, the owner: no file name and size under a single file — the picture says what it is; the length is on the tile. */}
      </div>
      {watch && (
        <MediaDialog name={watch.name} onClose={() => setWatch(null)}>
          {isPic(watch) ? <PanZoom src={watch.url} alt={watch.name} /> : <video src={watch.url} controls autoPlay playsInline aria-label={watch.name} />}
          <p className="co-player-name">{watch.name}</p>
        </MediaDialog>
      )}
    </>
  )
}

// ---- a file played in the middle of the page, as a dialog (the a11y audit, 10 Nov 2026) ----
// DriveFiles' FullScreen draws the same backdrop but is not a dialog: it has no
// role or name, the keyboard stays on the tile behind it and Tab walks the
// window under the dimmed page. This one is role="dialog", named after the
// file, puts the keyboard on the player, keeps Tab inside, shuts on Esc or a
// press on the backdrop, and gives the focus back to whatever opened it.
export function MediaDialog({ name, onClose, children }) {
  const box = useRef(null)
  const shut = useRef(onClose)
  shut.current = onClose
  useEffect(() => {
    const opener = document.activeElement
    const first = box.current?.querySelector('video, .pz, .zoom-close')
    ;(first || box.current)?.focus({ preventScroll: true })
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement) { e.stopPropagation(); shut.current(); return }
      if (e.key !== 'Tab' || !box.current) return
      const stops = [...box.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])')]
      if (!stops.length) { e.preventDefault(); return }
      const a = stops[0], z = stops[stops.length - 1]
      if (e.shiftKey && (document.activeElement === a || !box.current.contains(document.activeElement))) { e.preventDefault(); z.focus() }
      else if (!e.shiftKey && (document.activeElement === z || !box.current.contains(document.activeElement))) { e.preventDefault(); a.focus() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true }) }
  }, [])
  return createPortal(
    <div ref={box} className="zoom-back co-player-back" role="dialog" aria-modal="true" aria-label={name} tabIndex={-1}
      onMouseDown={onClose} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button type="button" className="zoom-close" aria-label={tx('Close')} onMouseDown={(e) => e.stopPropagation()} onClick={onClose}><X size={20} aria-hidden="true" /></button>
      <div className="co-player" onMouseDown={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  )
}

// ---- a fold that slides open (the owner, 9 Nov 2026: the admin's plan, history
// and details shut by default, opening with a little motion) ----
export function Fold({ icon: Icon, title, count = null, open: start = false, children }) {
  const [open, setOpen] = useState(start)
  const id = useId()
  return (
    <section className={'tw-fold' + (open ? ' open' : '')}>
      <button type="button" className="tw-fold-h" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {Icon && <Icon size={20} aria-hidden="true" />}
        <b>{title}</b>
        {count != null && <span className="tw-n">{count}</span>}
        <ChevronDown size={18} className="tw-fold-chev" aria-hidden="true" />
      </button>
      <div className="tw-fold-b" id={id} {...(open ? {} : { inert: '' })}>
        <div className="tw-fold-in"><div className="tw-fold-pad">{children}</div></div>
      </div>
    </section>
  )
}
