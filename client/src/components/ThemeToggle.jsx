import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, resolvedTheme } from '../lib/theme.js'
import { tr as tx } from '../lib/i18n.jsx'

// One-tap light/dark flip for late nights. The full Light/Dark/System choice
// lives in Profile → Appearance; this just toggles what's on screen right
// now. The button is named on hover (A-06): the foot of the sidebar is where
// people look for "how do I change the look of this thing".
export default function ThemeToggle({ className = 'icon-btn' }) {
  const [mode, setMode] = useState(resolvedTheme())
  const flip = () => {
    const next = mode === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setMode(next)
  }
  const word = mode === 'dark' ? tx('Switch to light mode') : tx('Switch to dark mode')
  return (
    <button className={className} onClick={flip}
      data-tip={word} data-tip-left="" title={word}
      aria-label={tx('Toggle dark mode')}>
      {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
