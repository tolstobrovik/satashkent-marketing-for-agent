import { locale } from './i18n.jsx'

// "3 hours ago", "yesterday" — in the reader's language, from the browser's own
// words for it (Intl), so no phrase book carries every number.
const STEPS = [[60, 'second'], [60, 'minute'], [24, 'hour'], [30, 'day'], [12, 'month'], [Infinity, 'year']]
export function ago(iso) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  let n = (t - Date.now()) / 1000
  if (Math.abs(n) < 45) n = 0
  let unit = 'second'
  for (const [size, u] of STEPS) {
    unit = u
    if (Math.abs(n) < size) break
    n /= size
  }
  try {
    return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(Math.round(n), unit)
  } catch {
    return new Date(t).toLocaleString()
  }
}
