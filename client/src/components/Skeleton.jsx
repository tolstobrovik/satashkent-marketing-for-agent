import { useEffect, useRef, useState } from 'react'
import { longDayLabel, todayISO } from '../lib/constants.js'
import { tr as tx } from '../lib/i18n.jsx'

// ---- My Day while it loads (My Day round 1, myday-tz §2.1.1, R25) --------------
//
// The handbook named this piece and it did not exist: My Day showed a lone
// spinner for one to eight seconds, said nothing to a screen reader, and the
// page jumped when the day landed. Now the page draws its own frame at once —
// the real head (the date and "{name}, start here."), then one card holding a
// 160 px block where the start-here card lands and three 56 px bars where the
// rows land. Static: no shimmer, nothing moves.
//
// It appears only after 150 ms, so a fast load never flashes grey. The status
// region is in the page from the first frame (a region created with its words
// is often not announced), and <main> is aria-busy until the day lands.
//
//   kind   'crew' | 'maker' | 'admin' — whose day it is ("Loading the team's
//          day" for an admin, "Loading your day" for everybody else)
//   name   the first name in the headline
//   today  the day in the head (defaults to today in Tashkent)
//   delay  ms before anything is drawn (150)
//
// Coach look only: the previous look keeps its spinner (Brief.jsx chooses).
export default function Skeleton({ kind = 'maker', name = '', today = null, delay = 150 }) {
  const [shown, setShown] = useState(delay <= 0)
  const ref = useRef(null)
  useEffect(() => {
    if (shown) return undefined
    const id = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(id)
  }, [delay, shown])
  // The page is busy until this leaves: the frame belongs to <main>, which is
  // the layout's, so it is marked from here and unmarked on the way out.
  useEffect(() => {
    const main = ref.current?.closest('main') || document.querySelector('main')
    if (!main) return undefined
    main.setAttribute('aria-busy', 'true')
    return () => main.removeAttribute('aria-busy')
  }, [])
  const words = kind === 'admin' ? tx('Loading the team’s day') : tx('Loading your day')
  return (
    <div ref={ref} className="co co-skel" role="status">
      <span className="sr-only">{shown ? words : ''}</span>
      {shown && (
        <>
          <header className="co-head" aria-hidden="true">
            <p className="co-date">{longDayLabel(today || todayISO())}</p>
            <p className="co-title">{name ? tx('{name}, start here.', { name }) : ' '}</p>
          </header>
          <div className="co-skel-card" aria-hidden="true">
            <i className="co-skel-hero" />
            <i className="co-skel-row" />
            <i className="co-skel-row" />
            <i className="co-skel-row" />
          </div>
        </>
      )}
    </div>
  )
}
