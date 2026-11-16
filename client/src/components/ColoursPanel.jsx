import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { useChannels } from '../lib/channels.jsx'
import { toast } from '../lib/toast.js'
import { tr as tx } from '../lib/i18n.jsx'
import { typeLabel } from '../lib/constants.js'
import { PALETTE, DEFAULT_MAP, colorStyle } from '../lib/pieceColor.js'

// ---- My colours (r11), inside Profile → Appearance (A-07) --------------------------
//
// The research report found people asking for colours; the owner decided the
// content makers choose what they mean. Ten colours, no names anywhere — a
// maker picks one for each piece, or lets the pieces take one by themselves
// from their stage, their kind, their month or their channel. The crew sees
// the maker's pieces in the maker's colours. Red is not among the ten: it
// stays for the one button to press and for what is late.
//
// It was a page of its own (/colours) — a door too many for one preference
// (the TZ of 19 October 2026, A-07). The six meanings are a radio list and
// the ten swatches one row, beside the theme, the language and the text
// size; /colours lands here.

const MODES = [
  ['own', () => tx('I pick them'), () => tx('You pick one of the ten colours for each piece.')],
  ['stage', () => tx('Stage'), () => tx('Idea, To shoot, Editing… each stage gets its colour by itself.')],
  ['type', () => tx('Type of piece'), () => tx('Reel, post, story, video, each in its own colour.')],
  ['month', () => tx('Month'), () => tx('This month and last month never look the same.')],
  ['channel', () => tx('Channel'), () => tx('Each of your channels in its own colour.')],
  ['none', () => tx('No colours'), () => tx('Everything stays plain.')],
]

export default function ColoursPanel() {
  const { user, setUser } = useAuth()
  const { visible } = useChannels()
  const [mode, setMode] = useState(user.color_mode || 'own')
  const [map, setMap] = useState(() => ({ ...DEFAULT_MAP, ...Object.fromEntries(Object.entries(user.color_map || {}).map(([k, v]) => [k, { ...DEFAULT_MAP[k], ...v }])) }))
  const [statuses, setStatuses] = useState([])
  useEffect(() => {
    api.cached('/statuses').then((s) => setStatuses(Array.isArray(s) ? s : [])).catch(() => {})
  }, [])

  const save = async (nextMode, nextMap) => {
    try {
      const u = await api.patch('/users/me', { color_mode: nextMode, color_map: nextMap })
      setUser?.({ ...user, ...u })
      window.dispatchEvent(new Event('pc-colors'))
    } catch (e) { toast(e.message, 'err') }
  }
  const pickMode = (m) => { setMode(m); save(m, map) }
  const pickFor = (m, key, i) => { const next = { ...map, [m]: { ...map[m], [key]: i } }; setMap(next); save(mode, next) }

  const values = useMemo(() => ({
    stage: statuses.filter((s) => !/deleted/i.test(s.label)).map((s) => [String(s.id), tx(s.label)]),
    type: ['reel', 'post', 'story', 'video'].map((k) => [k, typeLabel(k)]),
    month: [['last', tx('Earlier months')], ['this', tx('This month')], ['next', tx('Later months')]],
    channel: visible.map((c) => [c.key, c.label]),
  }), [statuses, visible])

  return (
    <div className="card card-pad pc-panel-card">
      <div className="stat-sub" style={{ marginBottom: 10 }}>{tx('You have ten colours. Use them however you like. Everyone who works on your pieces sees the same colours.')}</div>
      <div className="pc-filter" aria-hidden="true">{[...Array(PALETTE)].map((_, i) => <span key={i} className="pc-swatch pc-still" style={colorStyle(i)} />)}</div>
      <div className="pc-radios" role="radiogroup" aria-label={tx('What should your colours mean?')}>
        {MODES.map(([k, name, line]) => (
          <label key={k} className={'pc-radio' + (mode === k ? ' on' : '')}>
            <input type="radio" name="pc-mode" value={k} checked={mode === k} onChange={() => pickMode(k)} />
            <span><b>{name()}</b><small>{line()}</small></span>
          </label>
        ))}
      </div>
      {mode === 'own' && <p className="co-help">{tx('Pick one for a piece in its task window, or when you create it.')}</p>}
      {['stage', 'type', 'month', 'channel'].includes(mode) && (
        <div className="pc-rows">
          {values[mode].map(([key, label]) => (
            <div key={key} className="pc-row">
              <b>{label}</b>
              <span className="pc-filter" role="group" aria-label={label}>
                {[...Array(PALETTE)].map((_, i) => (
                  <button key={i} type="button" className="pc-swatch" style={colorStyle(i)} aria-pressed={map[mode]?.[key] === i}
                    aria-label={`${label}: ${tx('Colour {n}', { n: i + 1 })}`} onClick={() => pickFor(mode, key, i)} />
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      {mode === 'none' && <p className="co-help">{tx('Your pieces stay plain. The stage and who has it are still written on every piece.')}</p>}
      <p className="co-help">{tx('Red is not one of the ten: it stays for the button to press and for what is late.')}</p>
    </div>
  )
}
