import { useEffect, useRef, useState } from 'react'
import { Plus, X, Clock, Mic } from 'lucide-react'
import PravkaBox from './PravkaBox.jsx'
import { VoiceRecorder } from './VoiceNote.jsx'
import { clock } from '../lib/demoMedia.js'
import { tr as tx } from '../lib/i18n.jsx'

// ---- the changes asked, as a list (the owner, 9 Nov 2026) -----------------------------
//
// One bar per change, read left to right the way the change is made:
//
//   №  ·  ⏱ the moment (optional, stamped off the player first)  ·  📎 the words  ·  🎤
//
// A change is words OR a voice note. Pressing the mic turns the whole line
// into a recording: the words give way to the recorder, then to the clip.
// The server keeps one clip a round, so once a line is a voice note the other
// lines offer no mic. Under the last line a half-tone next line asks for one
// more. Every control sits on the bar's centre, however tall the bar.
//
// items: [{ id, text, from, to, voice }] — the moment in seconds or null; voice
// = { data, secs } once recorded. The list goes to the server as the round's
// note, one numbered line per change, the moment first:
// "1. 0:14–0:16 — the music is too loud" · "2. 0:40 — voice note".

let seq = 0
export const newItem = (text = '') => ({ id: `c${Date.now()}-${seq++}`, text, from: null, to: null, voice: null })

const stampOf = (it) => (it.from == null ? '' : it.to != null && it.to > it.from ? `${clock(it.from)}–${clock(it.to)}` : clock(it.from))
const lineOf = (it) => (it.voice ? `🎤 ${tx('Voice note')}` : it.text.trim())
export const noteOf = (items) => items
  .filter((it) => it.voice || it.text.trim())
  .map((it, i) => `${i + 1}. ${stampOf(it) ? `${stampOf(it)} — ` : ''}${lineOf(it)}`)
  .join('\n')

export default function ChangeList({ taskId, items, onChange, phone = false, disabled = false, onError, onUploading, voice = false, onVoice = null, timeOf = null }) {
  const [focusId, setFocusId] = useState(null)
  const [recState, setRecState] = useState({})   // id → idle | recording | ready | denied
  const root = useRef(null)
  // What changed, said once for a screen reader (the a11y audit, 10 Nov 2026): a moment
  // stamped or cleared, a line added or removed, a recording started, kept or thrown away.
  // Nothing in the list was announced — the stamp only changed its own name.
  const [said, setSaid] = useState('')
  const say = (s) => { setSaid(''); setTimeout(() => setSaid(s), 30) }
  const patch = (id, f) => onChange(items.map((it) => (it.id === id ? { ...it, ...f(it) } : it)))
  const set = (id, v) => patch(id, (it) => ({ text: typeof v === 'function' ? v(it.text) : v }))
  const add = () => { const it = newItem(); onChange([...items, it]); setFocusId(it.id); say(tx('Change {n}', { n: items.length + 1 })) }
  const drop = (id) => {
    const i = items.findIndex((it) => it.id === id)
    onChange(items.length > 1 ? items.filter((it) => it.id !== id) : [newItem()])
    say(tx('Removed'))
    // the keyboard goes to the line before, else to "Add a change" (the × it was on is gone)
    setTimeout(() => { const rows = root.current?.querySelectorAll('.tw-item:not(.tw-ghost) textarea, .tw-item:not(.tw-ghost) .vn-clip-btn'); (rows?.[Math.max(0, i - 1)] || root.current?.querySelector('.tw-ghost-b'))?.focus() }, 0)
  }
  // One press marks the player's moment; a second, later press makes it a range; a third clears it.
  const stamp = (id) => {
    const now = timeOf?.()
    if (now == null || Number.isNaN(now)) return
    const t = Math.floor(now)
    patch(id, (it) => (it.from == null ? { from: t, to: null } : (it.to == null && t > it.from) ? { to: t } : { from: null, to: null }))
    const it = items.find((x) => x.id === id)
    say(it?.from == null ? tx('Moment: {at}', { at: clock(t) }) : (it.to == null && t > it.from) ? tx('Moment: {at}', { at: `${clock(it.from)}–${clock(t)}` }) : tx('Moment cleared'))
  }
  const recSaid = (s, secs) => say(s === 'recording' ? tx('Recording…') : s === 'ready' ? tx('Voice note, {n} s', { n: secs || 0 }) : s === 'idle' ? tx('Recording discarded') : '')
  const hasVoice = items.some((it) => it.voice || ['recording', 'ready'].includes(recState[it.id]))
  const voiceClip = items.find((it) => it.voice)?.voice || null
  useEffect(() => { onVoice?.(voiceClip) }, [voiceClip]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focusId || !root.current) return
    root.current.querySelector(`[data-item="${focusId}"] textarea`)?.focus()
    setFocusId(null)
  }, [focusId, items.length])
  return (
    <>
    <span className="sr-only" role="status" aria-live="polite">{said}</span>
    <ol className="tw-list" ref={root} aria-label={tx('What must change')}>
      {items.map((it, i) => {
        const isVoice = !!it.voice || ['recording', 'ready'].includes(recState[it.id])
        return (
          <li key={it.id} className="tw-item" data-item={it.id}>
            <span className="tw-item-n" aria-hidden="true"><i>{i + 1}</i></span>
            <div className={'tw-bar' + (isVoice ? ' is-voice' : '')}>
              {timeOf && (
                <button type="button" className={'tw-stamp' + (it.from != null ? ' set' : '')} disabled={disabled} onClick={() => stamp(it.id)}
                  aria-label={it.from == null ? tx('Mark the moment in the video') : tx('Moment: {at}. Press again for the end, or to clear', { at: stampOf(it) })}
                  title={it.from == null ? tx('Mark the moment in the video') : it.to == null ? tx('Press again for the end') : tx('Press to clear')}>
                  <Clock size={16} aria-hidden="true" /><span>{stampOf(it) || '0:00'}</span>
                </button>
              )}
              {!isVoice && (
                <PravkaBox taskId={taskId} value={it.text} phone={phone} disabled={disabled}
                  onChange={(v) => set(it.id, v)} onError={onError} onUploading={onUploading} label={tx('Change {n}', { n: i + 1 })}
                  placeholder={i === 0 ? tx('The music is too loud at 0:40') : tx('The title is too small')} />
              )}
              {isVoice && <span className="tw-voice-lb" role="img" aria-label={tx('Voice note')} title={tx('Voice note')}><Mic size={18} aria-hidden="true" /></span>}
              {/* The mic: this line's, while no other line is a voice note. */}
              {voice && (isVoice || !hasVoice) && (
                <VoiceRecorder disabled={disabled} onState={(s, secs) => setRecState((m) => { if (m[it.id] === s) return m; if (m[it.id]) recSaid(s, secs); return { ...m, [it.id]: s } })}
                  onClip={(clip) => patch(it.id, () => ({ voice: clip ? { data: clip.data, secs: clip.secs } : null }))} />
              )}
            </div>
            <button type="button" className="co-ib tw-item-x" onClick={() => drop(it.id)} disabled={disabled} aria-label={tx('Remove')} title={tx('Remove')}><X size={16} aria-hidden="true" /></button>
          </li>
        )
      })}
      {/* The next line, half there: pressed or tabbed to, it becomes a real one. */}
      <li className="tw-item tw-ghost">
        <button type="button" className="tw-ghost-b" onClick={add} disabled={disabled}>
          <span className="tw-item-n" aria-hidden="true"><Plus size={18} /></span>
          <span>{tx('Add a change')}</span>
        </button>
      </li>
    </ol>
    </>
  )
}
