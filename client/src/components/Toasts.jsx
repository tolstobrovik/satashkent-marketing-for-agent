import { useEffect, useState } from 'react'
import { Check, AlertCircle } from 'lucide-react'
import { registerToasts } from '../lib/toast.js'

// The toast rack: solid little confirmations, bottom-right, self-dismissing.
// At most three at once — old ones make room for new. A toast can carry one
// action (Undo, mostly); those stay up longer and dismiss on use.
//
// An action toast counts itself down out loud. The server gives a move ten
// seconds to be taken back, and a button that quietly stops working is worse
// than no button — so the number on it is the number of seconds actually left.
const ACTION_MS = 10000
const PLAIN_MS = 2600
const OUT_MS = 160 // the .toast.out fade in styles.css

export default function Toasts() {
  const [list, setList] = useState([])
  const [, tick] = useState(0)

  useEffect(() => {
    registerToasts((text, kind, action, sticky) => {
      // A sticky toast is a STATE, not an event — "the data on screen is old"
      // stays true until it is not, and a warning about that which dismisses
      // itself after 2.6 seconds is a board that looks healthy again while
      // still showing yesterday. It carries its own id, so three pages failing
      // at once raise it once, and it leaves only when it is taken down.
      if (sticky) {
        setList((prev) => (prev.some((t) => t.id === sticky)
          ? prev
          : [...prev.slice(-2), { id: sticky, text, kind, action, sticky: true }]))
        return
      }
      const id = `${Date.now()}-${Math.random()}`
      const life = action ? ACTION_MS : PLAIN_MS
      setList((prev) => [...prev.slice(-2), { id, text, kind, action, until: Date.now() + life }])
      // It fades out where it stands first (.toast.out), then leaves the rack.
      setTimeout(() => setList((prev) => prev.map((t) => (t.id === id ? { ...t, out: true } : t))), life)
      setTimeout(() => setList((prev) => prev.filter((t) => t.id !== id)), life + OUT_MS)
    }, (id) => setList((prev) => prev.filter((t) => t.id !== id)))
    return () => registerToasts(null)
  }, [])

  // Only run a clock while something is actually counting down.
  const counting = list.some((t) => t.action)
  useEffect(() => {
    if (!counting) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [counting])

  // My Day round 1 (myday-tz §2.1.1, R38): the live regions are always in the
  // page, empty or not. A region that is created together with its first
  // message is often not announced at all, so the rack is mounted once
  // (main.jsx) and only its contents come and go. A "no" goes to its own
  // always-mounted alert region; everything else is polite. Both sit in the
  // one rack, so the toasts still stack in one corner. An empty region draws
  // nothing (.toasts-rack:empty in styles.css never boxes).
  const use = (t) => {
    setList((prev) => prev.filter((x) => x.id !== t.id))
    t.action.onClick()
  }
  const draw = (t) => {
    const left = t.action ? Math.max(0, Math.ceil((t.until - Date.now()) / 1000)) : 0
    return (
      <div key={t.id} className={'toast' + (t.kind === 'err' ? ' err' : '') + (t.out ? ' out' : '')}>
        {t.kind === 'err' ? <AlertCircle size={14} aria-hidden="true" /> : <Check size={14} strokeWidth={3} aria-hidden="true" />}
        {t.text}
        {t.action && (
          <button type="button" className="toast-act" onClick={() => use(t)}>
            {/* The seconds tick in a region that is always live: hidden from the
                reader, or every tick is read out ("9", "8", …). */}
            {t.action.label} <span className="toast-count" aria-hidden="true">{left}</span>
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="toasts">
      <div className="toasts-rack" role="status" aria-live="polite">{list.filter((t) => t.kind !== 'err').map(draw)}</div>
      <div className="toasts-rack" role="alert">{list.filter((t) => t.kind === 'err').map(draw)}</div>
    </div>
  )
}
