// Advanced settings → Channels (12 Nov 2026, design-variants/admin-tz.md §2.1).
// The owner: "tile, name and a settings button" a row, and Add channel leads —
// it is the main reason to come here. One card, the board's order; the whole
// row is the link to the channel's page (one tab stop a channel), and the gear
// is only its visible cue. The order is the menu's own drag, so it is not set
// here twice: no kind, no owner, no numbers, no Report, no drag.
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Settings2 } from 'lucide-react'
import { tr as tx } from '../../lib/i18n.jsx'
import { useChannels } from '../../lib/channels.jsx'
import { ChanMark } from '../../components/CoachBits.jsx'
import { Group, Page, remember } from './parts.jsx'

const LAST = 'satashkent_settings_from'   // parts.jsx's key: the row that was pressed to leave
const lastIs = (id) => { try { return sessionStorage.getItem(LAST) === id } catch { return false } }

export default function Channels() {
  const { channels, failed, retry } = useChannels()
  const add = useRef(null)
  // Back from the new channel's page without making one: the focus is on Add
  // channel again, and the next way back lands on the index's Channels row.
  useEffect(() => {
    if (!lastIs('ch-new')) return undefined
    const f = requestAnimationFrame(() => { add.current?.focus({ preventScroll: false }); remember('channels') })
    return () => cancelAnimationFrame(f)
  }, [])
  return (
    <Page
      title={tx('Channels')}
      action={(
        <Link ref={add} className="co-btn co-btn-p co-st-addch" to="/admin/channels/new" onClick={() => remember('ch-new')}>
          <Plus size={18} aria-hidden="true" />{tx('Add channel')}
        </Link>
      )}
    >
      <Group note={tx('The order is the menu’s: hold a channel there to move it.')}>
        {channels.length
          ? channels.map((c) => <ChannelRow key={c.id} c={c} />)
          : failed
            ? (
              <p className="co-st-empty" role="status">
                {tx('Channels did not load. Retrying…')}{' '}
                <button type="button" className="co-link" onClick={retry}>{tx('Retry now')}</button>
              </p>
            )
            : <p className="co-st-empty">{tx('No channels yet. Add the first one.')}</p>}
      </Group>
    </Page>
  )
}

// A channel: its tile (the menu's own mark for it), its name, the gear. Coming
// back from its page lands the focus on it, and the list's own row on the
// index is remembered again, so the next way back lands there too.
function ChannelRow({ c }) {
  const ref = useRef(null)
  const id = `ch-${c.key}`
  // After the page has put the focus on its headline (Page's own effect runs
  // after this one), so the row is where it ends.
  useEffect(() => {
    if (!lastIs(id)) return undefined
    const f = requestAnimationFrame(() => { ref.current?.focus({ preventScroll: false }); remember('channels') })
    return () => cancelAnimationFrame(f)
  }, [id])
  return (
    <Link ref={ref} className="co-st-row co-st-chrow" to={`/admin/channels/${encodeURIComponent(c.key)}`}
      aria-label={tx('Settings: {name}', { name: c.label })} onClick={() => remember(id)}>
      <span className="co-st-tile" aria-hidden="true"><ChanMark channel={c} size={18} /></span>
      <span className="co-st-t">{c.label}</span>
      <span className="co-st-ib" aria-hidden="true"><Settings2 size={18} /></span>
    </Link>
  )
}
