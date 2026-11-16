import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { tr as tx } from '../lib/i18n.jsx'
import { ago } from '../lib/ago.js'
import { REASONS } from './InstagramSettings.jsx'

// What a published Instagram piece got, in the task window: its views and, for a
// reel, its skip rate, each saying where it came from and how fresh it is — or,
// when Instagram has no numbers for it, the one reason why (server/instagram.js).
export const onInstagram = (t, byKey = {}) =>
  (t.channels || []).some((k) => byKey[k]?.icon === 'instagram' || /instagram/i.test(k))

export default function IgNumbers({ t }) {
  const [reading, setReading] = useState(null)
  useEffect(() => {
    let live = true
    api.get(`/instagram/task/${t.id}`).then((r) => { if (live) setReading(r) }).catch(() => {})
    return () => { live = false }
  }, [t.id, t.post_link, t.views_at])
  const fromIg = t.views_by === 'instagram_api'
  const reel = reading?.media_kind === 'REELS' || t.type === 'reel'
  const unmatched = reading && reading.state !== 'ok'
  const rows = [
    [tx('Views'), t.views == null ? tx('Not counted yet') : Number(t.views).toLocaleString(),
      t.views == null ? '' : fromIg ? tx('from Instagram, updated {when}', { when: ago(t.views_at) }) : tx('typed by hand')],
    reel && [tx('Skip rate'), t.skip_rate == null ? tx('Not measured yet') : `${t.skip_rate}%`,
      reading?.skip_refused ? tx('Instagram does not give it — typed by hand')
        : t.skip_rate == null ? '' : reading?.skip_from_api && t.skip_rate_at ? tx('from Instagram, updated {when}', { when: ago(t.skip_rate_at) }) : tx('typed by hand')],
  ].filter(Boolean)
  return (
    <section className="r14-tw-sec">
      <h3>{tx('Instagram')}</h3>
      <dl className="co-facts r14-dets">
        {rows.map(([k, v, note]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{v}{note && <span className="stat-sub">{' · '}{note}</span>}</dd>
          </div>
        ))}
      </dl>
      {unmatched && (
        <p className="co-help">
          {(REASONS[reading.state] || REASONS.error)()}
          {reading.state === 'error' && reading.detail ? `: ${reading.detail}` : ''}
        </p>
      )}
      {reading?.frozen_month && <p className="co-help">{tx('The views are frozen for the month’s pay.')}</p>}
    </section>
  )
}
