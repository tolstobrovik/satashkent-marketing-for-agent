// Light / Dark / System theme, remembered per device and applied before the
// first paint (main.jsx) so there is never a white flash at night.
const KEY = 'satashkent_theme'
export const THEMES = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
]

const media = () => window.matchMedia?.('(prefers-color-scheme: dark)')

export function getTheme() {
  const k = localStorage.getItem(KEY)
  return THEMES.some((t) => t.key === k) ? k : 'light'
}
export function resolvedTheme(k = getTheme()) {
  return k === 'system' ? (media()?.matches ? 'dark' : 'light') : k
}
export function applyTheme(key = getTheme()) {
  localStorage.setItem(KEY, key)
  document.documentElement.dataset.theme = resolvedTheme(key)
}

// The Dark mode switch (the S2 sidebar): on is dark, off is light — a person
// on "system" reads as whatever that resolves to, and their first press makes
// it explicit. The swap happens with every transition held for one frame, so
// the colours change at once instead of smearing across the screen.
export function setDark(on) {
  const root = document.documentElement
  root.classList.add('theme-swap')
  applyTheme(on ? 'dark' : 'light')
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-swap')))
}

// Follow the OS while in System mode.
media()?.addEventListener?.('change', () => {
  if (getTheme() === 'system') applyTheme('system')
})
