import { useEffect, useRef, useState } from 'react'
import { Languages, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LANGS, useT, tr as tx } from '../lib/i18n.jsx'

// The language sits next to the theme switch in the sidebar foot, where a
// person looks for "how do I change the look of this thing". Three languages
// is small enough to show them all at once rather than hide them behind a
// settings page — and each is written in its OWN language, because somebody
// who reads no English cannot find "Russian" in a list.
//
// `more` (A-06): the menu's last row leads to Profile → Appearance, where the
// text size, the theme and the sounds are — the foot is where people look for
// them. The sign-in page has no profile and passes nothing.
export default function LangToggle({ className = 'icon-btn', more = false }) {
  const { lang, setLang, t } = useT()
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div className="lang-wrap" ref={box}>
      <button className={className} onClick={() => setOpen((o) => !o)}
        data-tip={t('common.language')} data-tip-left="" title={t('common.language')}
        aria-label={t('common.language')} aria-expanded={open}>
        <Languages size={16} />
      </button>
      {open && (
        <div className="lang-menu" role="menu">
          {LANGS.map((l) => (
            <button key={l.key} role="menuitemradio" aria-checked={lang === l.key}
              className={'lang-opt' + (lang === l.key ? ' on' : '')}
              onClick={() => { setLang(l.key); setOpen(false) }}>
              <span className="lang-code">{l.key.toUpperCase()}</span> {l.native}
            </button>
          ))}
          {more && (
            <Link to="/profile#appearance" role="menuitem" className="lang-opt lang-more" onClick={() => setOpen(false)}>
              <SlidersHorizontal size={14} aria-hidden="true" /> {tx('Text size and more…')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
