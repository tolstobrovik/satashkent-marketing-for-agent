import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, Scissors, X } from 'lucide-react'
import { tr as tx, LANGS, loadBook, phraseIn } from '../lib/i18n.jsx'

// ---- The kit (Q-04) --------------------------------------------------------------------
//
// Every token and every piece of the Coach look on one page, each labelled
// with its token or class name, in light and in dark, in the three languages:
// the reference a pull request is read against, and what qa/brand-suite.mjs
// photographs (BRAND_WEB). Admins only (App.jsx); no door in the sidebar: /kit.
//
// Nothing here is a reading of its own. A colour is the token as the browser
// resolves it, read back off the swatch; a piece is the look's own classes
// with the look's own words. What floats — the sheet, the drawer — is held
// still by .kit-still so both can be read at once.

const COLOURS = [
  ['Brand', ['--ruby', '--bright-red', '--near-black', '--mid-grey', '--light-grey', '--white', '--on-ruby']],
  ['Ground and rules', ['--page', '--surface', '--surface-2', '--track', '--hairline', '--hairline-strong']],
  ['Ink', ['--ink', '--ink-2', '--muted']],
  ['The one button, and what is late', ['--brand-500', '--primary-soft', '--on-primary-soft', '--danger-bg', '--critical']],
  ['Kinds of work', ['--kind-shoot', '--kind-cut', '--kind-art']],
  ['Stages', ['--st-idea-bg', '--st-shoot-bg', '--st-edit-bg', '--st-ready-bg', '--st-done-bg', '--st-late-bg']],
  ['Status', ['--good-ink', '--warn-ink', '--warning', '--serious']],
  ['Types', ['--type-reel', '--type-story', '--type-video', '--type-target', '--type-other']],
]
const SIZES = ['--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-2xl', '--fs-display']
const RADII = ['--radius-xs', '--radius-sm', '--radius', '--radius-pill']
const SPACES = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--gap-field', '--gap-group', '--gap-section']
// A piece's title is what a person typed, never translated: one per language.
const TITLE = {
  en: 'Five SAT Math mistakes that cost 100 points',
  ru: '5 ошибок на SAT Math, которые стоят 100 баллов',
  uz: 'SAT Math boʻyicha 100 ball turadigan 5 ta xato',
}

// rgb(…) and color(srgb …) as the six-digit hex the brand book writes.
const hex = (s) => {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s)
  if (m) return '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
  const c = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s)
  if (c) return '#' + c.slice(1, 4).map((n) => Math.round(Number(n) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
  return s
}

// A colour token: the swatch, the name, the colour the browser gave it.
function Swatch({ name }) {
  const ref = useRef(null)
  const [v, setV] = useState('')
  useEffect(() => { setV(hex(getComputedStyle(ref.current).backgroundColor)) }, [])
  return <div className="kit-sw"><i ref={ref} style={{ background: `var(${name})` }} aria-hidden="true" /><code>{name}</code><small>{v}</small></div>
}
// A token's value, read where it is used (the dark half has its own).
function Val({ name }) {
  const ref = useRef(null)
  const [v, setV] = useState('')
  useEffect(() => { setV(getComputedStyle(ref.current).getPropertyValue(name).trim()) }, [name])
  return <small ref={ref}>{v}</small>
}

function Tokens() {
  return (
    <>
      <h3>{tx('Colours')}</h3>
      {COLOURS.map(([group, names]) => (
        <div key={group} className="kit-group">
          <h4>{tx(group)}</h4>
          <div className="kit-grid">{names.map((n) => <Swatch key={n} name={n} />)}</div>
        </div>
      ))}
      <h3>{tx('Type scale')}</h3>
      <div className="kit-type">
        <div><span style={{ font: `700 var(--fs-display)/1.15 var(--font-display)` }}>{tx('Start here')}</span><code>{'--font-display · .co-title'}</code><Val name="--font-display" /></div>
        {SIZES.map((n) => <div key={n}><span style={{ fontSize: `var(${n})` }}>{tx('Open the task')}</span><code>{n}</code><Val name={n} /></div>)}
      </div>
      <h3>{tx('Corners')}</h3>
      <div className="kit-rad">{RADII.map((n) => <div key={n}><i style={{ borderRadius: `var(${n})` }} aria-hidden="true" /><code>{n}</code><Val name={n} /></div>)}</div>
      <h3>{tx('Spacing')}</h3>
      <div className="kit-sp">{SPACES.map((n) => <div key={n}><code>{n}</code><i style={{ width: `var(${n})` }} aria-hidden="true" /><Val name={n} /></div>)}</div>
    </>
  )
}

// The pieces, in one language: what the look's classes draw with its words.
function Pieces({ code }) {
  const t = (key) => phraseIn(code, key)
  const title = TITLE[code]
  const L = ({ names }) => <p className="kit-l">{names.map((n) => <code key={n}>{n}</code>)}</p>
  return (
    <>
      <div className="kit-piece">
        <h5>{tx('Buttons')}</h5>
        <div className="co-btns">
          <button type="button" className="co-btn co-btn-p">{t('Hand in')}</button>
          <button type="button" className="co-btn co-btn-t">{t('Open the task')}</button>
          <button type="button" className="co-btn co-btn-q">{t('Not now')}</button>
        </div>
        <L names={['.co-btn-p', '.co-btn-t', '.co-btn-q']} />
        <div className="co-btns">
          <button type="button" className="co-btn co-btn-t co-btn-sm">{t('Yes')}</button>
          <button type="button" className="co-btn co-btn-t co-btn-lg">{t('Send to editing')}</button>
          <button type="button" className="co-btn co-btn-p" disabled>{t('Hand in')}</button>
        </div>
        <L names={['.co-btn-sm', '.co-btn-lg', ':disabled']} />
      </div>

      <div className="kit-piece">
        <h5>{tx('Chips')}</h5>
        <div className="kit-chips">
          <span className="co-tag">Instagram Main</span>
          <span className="co-chip">{t('Today')}</span>
          <button type="button" className="co-chip">{t('Tomorrow')}</button>
          <button type="button" className="co-chip sel">{t('Another day')}</button>
        </div>
        <L names={['.co-tag', '.co-chip', 'button.co-chip', '.co-chip.sel']} />
        <div className="kit-chips">
          <span className="co-stage co-s-edit"><Scissors size={14} aria-hidden="true" />{t('Editing')}</span>
          <span className="co-badge co-b-late"><CalendarDays size={12} aria-hidden="true" />{t('Late')}</span>
          <span className="co-badge co-b-wait">{t('Waiting for others')}</span>
          <span className="co-badge co-b-good">{t('Done')}</span>
          <span className="co-cnt">3</span>
          <span className="co-cnt late">12</span>
        </div>
        <L names={['.co-stage.co-s-edit', '.co-badge.co-b-late', '.co-b-wait', '.co-b-good', '.co-cnt', '.co-cnt.late']} />
      </div>

      <div className="kit-piece">
        <h5>{tx('A row')}</h5>
        <div className="co-card">
          <div className="co-band-h"><b>{t('Today')}</b><span>{t('Start here')}</span></div>
          <div className="co-row co-k-cut">
            <span className="co-n">1</span>
            <span className="co-tile co-s-edit"><i aria-hidden="true"><Scissors size={14} /></i></span>
            <button type="button" className="co-row-b"><span className="co-row-t">{title}</span><span className="co-row-f">{t('Not sent to you yet')}</span></button>
            <span className="co-row-r"><span className="co-badge co-b-late"><CalendarDays size={12} aria-hidden="true" />{t('Late')}</span></span>
          </div>
        </div>
        <L names={['.co-card', '.co-band-h', '.co-row', '.co-n', '.co-tile', '.co-row-b', '.co-row-t', '.co-row-f', '.co-row-r']} />
      </div>

      <div className="kit-piece">
        <h5>{tx('A card')}</h5>
        <section className="co-here own co-k-cut" aria-label={t('Now')}>
          <p className="co-here-l"><span className="co-here-w">{t('Now')}</span><span>{t('Your step now')}</span></p>
          <h2><button type="button">{title}</button></h2>
          <p className="co-why">{t('Not sent to you yet')}</p>
          <div className="co-btns">
            <button type="button" className="co-btn co-btn-p">{t('Hand in')}</button>
            <button type="button" className="co-btn co-btn-q">{t('Open the task')}</button>
          </div>
        </section>
        <L names={['.co-here', '.co-here.own', '.co-here-l', '.co-here-w', '.co-why']} />
      </div>

      <div className="kit-piece kit-still">
        <h5>{tx('A sheet')}</h5>
        <div className="co-ask mid" role="group" aria-label={t('Send to editing')}>
          <header className="co-ask-h">
            <div><b>{title}</b><small>{t('Send to editing')}</small></div>
            <button type="button" className="co-btn co-btn-i" aria-label={t('Close')}><X size={18} aria-hidden="true" /></button>
          </header>
          <div className="ns co-ask-b">
            <span className="ns-q">{t('Who edits?')}</span>
            <span className="co-ask-days">
              <button type="button" className="co-chip co-ask-day" aria-pressed="true">{t('Today')}</button>
              <button type="button" className="co-chip co-ask-day" aria-pressed="false">{t('Tomorrow')}</button>
              <button type="button" className="co-chip co-ask-day" aria-pressed="false">{t('Another day')}</button>
            </span>
          </div>
          <footer className="co-ask-f">
            <span className="co-ask-dots" aria-hidden="true"><i className="on" /><i /></span>
            <button type="button" className="co-btn co-btn-p">{t('Next')}</button>
          </footer>
        </div>
        <L names={['.co-ask', '.co-ask-h', '.co-ask-b', '.ns-q', '.co-ask-days', '.co-ask-f', '.co-ask-dots']} />
      </div>

      <div className="kit-piece kit-still">
        <h5>{tx('A drawer')}</h5>
        <div className="co-panel" role="group" aria-label={title}>
          <header className="co-p-head">
            <span className="co-eyebrow co-k-cut">{t('Editing')}</span>
            <button type="button" className="co-x" aria-label={t('Close')}><X size={18} aria-hidden="true" /></button>
            <h2>{title}</h2>
            <p className="co-p-meta"><span className="co-badge co-b-late"><CalendarDays size={12} aria-hidden="true" />{t('Late')}</span><span>Instagram Main</span></p>
          </header>
          <div className="co-p-body">
            <div className="co-blk">
              <h3>{t('Your step now')}</h3>
              <div className="co-btns">
                <button type="button" className="co-btn co-btn-p">{t('Hand in')}</button>
                <button type="button" className="co-btn co-btn-q">{t('Remind')}</button>
              </div>
            </div>
            <div className="co-blk">
              <h3>{t('Comments')}</h3>
              <p className="co-help">{t('Nothing is waiting for you. New work shows up here the moment someone gives it to you.')}</p>
            </div>
          </div>
        </div>
        <L names={['.co-panel', '.co-p-head', '.co-eyebrow', '.co-x', '.co-p-meta', '.co-p-body', '.co-blk', '.co-help']} />
      </div>
    </>
  )
}

export default function Kit() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  // All three books, so each column is in its own language at once.
  useEffect(() => { Promise.all(LANGS.map((l) => loadBook(l.key))).then(() => setReady(true)) }, [])
  // The page sits on the light ground whatever the reader's own theme is —
  // the dark half carries data-theme itself. The reader's theme is put back
  // on leaving; their choice in storage is never touched.
  useEffect(() => {
    const el = document.documentElement
    const was = el.dataset.theme
    el.dataset.theme = 'light'
    return () => { if (was) el.dataset.theme = was; else delete el.dataset.theme }
  }, [])
  return (
    <div className={'co kit' + (ready ? ' kit-ready' : '')}>
      <button type="button" className="co-link pc-back" onClick={() => navigate(-1)}><ChevronLeft size={16} aria-hidden="true" />{tx('Back')}</button>
      <h1 className="co-title">{tx('The kit')}</h1>
      <p className="co-help">{tx('Every token and every piece of the look, in light and in dark, in the three languages, each with its name. The reference for every change.')}</p>
      {[['light', tx('Light')], ['dark', tx('Dark')]].map(([theme, word]) => (
        <section key={theme} className="kit-theme" data-theme={theme === 'dark' ? 'dark' : undefined} aria-label={word}>
          <h2>{word}</h2>
          <Tokens />
          <div className="kit-langs">
            {LANGS.map((l) => (
              <div key={l.key} className="kit-lang" lang={l.key}>
                <h4>{l.native}</h4>
                <Pieces code={l.key} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
