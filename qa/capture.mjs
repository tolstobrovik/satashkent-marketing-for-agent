// Photographs every screen of a running board, as each kind of person sees
// it, into a board of its own (design-overview/index.html): the demo copy's
// design-overview/capture.mjs, carried here so the crowded-screens workflow
// (Q-03) does not depend on the demo repository.
//
//   DEMO_WEB=http://localhost:4097 node qa/capture.mjs
//
// Needs a board with the demo team signed up on it (scripts/demo-data.mjs,
// with --crowded for the forty-late-pieces day), served by one API. The
// browser is Playwright's Chromium; PW_CHANNEL=chrome uses the Chrome you
// have instead (as the other browser suites do).
//
//   CAPTURE_LANG=ru …     Russian (en is the default, uz works too)
//   ONLY=maker …          one person only (admin, maker, copywriter,
//                          operator, editor, designer, crew)
//   CAPTURE_OUT=dir …     where the board goes (default: design-overview/)
//
// Nothing here fails on pixels: the pictures are for a reviewer's eyes, and
// the one way this exits red is a board it cannot reach or sign in to.
import { chromium } from 'playwright'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const WEB = process.env.DEMO_WEB || 'http://localhost:5173'
const LANG = process.env.CAPTURE_LANG || process.env.LANG_UI || (/^(en|ru|uz)$/.test(process.env.LANG || '') ? process.env.LANG : 'en')
const ONLY = process.env.ONLY
const PASSWORD = process.env.DEMO_PASSWORD || 'demo-team-2026'
const MAX_H = 2800 // a very long page is cut here; the board is for the shape, not every row
const BOARD = process.env.CAPTURE_OUT || join(root, 'design-overview')
const OUT = join(BOARD, 'screens')

// The "What changed" note shows once per release; mark the current one seen.
const NEWS = readFileSync(join(root, 'client/src/components/CoachParts.jsx'), 'utf8').match(/const NEWS = \{\s*id: '([^']+)'/)?.[1] || ''

const PEOPLE = [
  { role: 'admin', user: 'admin', label: 'Admin — sees everything' },
  { role: 'maker', user: 'dilnoza', label: 'Content maker (SMM) — Dilnoza' },
  { role: 'copywriter', user: 'malika', label: 'Copywriter, text channels — Malika' },
  { role: 'operator', user: 'otabek', label: 'Operator, films — Otabek' },
  { role: 'editor', user: 'eldor', label: 'Editor — Eldor' },
  { role: 'designer', user: 'nigora', label: 'Designer — Nigora' },
  { role: 'crew', user: 'aziz', label: 'Operator & editor — Aziz' },
]

// The admin's pages that are not all in the menu at once: the other lenses
// of Numbers and Team, a project, a campaign, the Drive pages and the four
// groups of Settings (the structure of 28 October 2026).
const ADMIN_EXTRA = [
  ['/numbers?tab=people', 'Numbers · People'], ['/numbers?tab=pay', 'Numbers · Pay'],
  ['/team?tab=workload', 'Team · Workload'], ['/team?tab=access', 'Team · Access'],
  ['/projects/1', 'A project'], ['/campaigns/1', 'A campaign'], ['/uploads', 'Uploads'], ['/drops', 'Lost files'],
  ...['board', 'team', 'integrations', 'records'].map((t) => [`/admin?tab=${t}`, `Settings · ${t}`]),
]

const login = async (username) => {
  const r = await fetch(`${WEB}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`Could not sign in as ${username} (${r.status}) — is the demo team on this board (scripts/demo-data.mjs)?`)
  return r.json()
}

async function browser() {
  if (process.env.PW_CHANNEL) return chromium.launch({ channel: process.env.PW_CHANNEL })
  try { return await chromium.launch() } catch { /* no downloaded Chromium: try an installed browser */ }
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel }) } catch { /* try the next one */ }
  }
  throw new Error('No browser: `npx playwright install chromium`, or set PW_CHANNEL=chrome')
}

const settle = async (page) => {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(700)
}

const shots = []
// A page is photographed whole: the window is made as tall as the page,
// so the sidebar and any backdrop reach the bottom.
// A window over a page (`still`) is photographed at the usual size.
async function shoot(page, { role, id, title, group, mobile, still }) {
  await settle(page)
  const base = page.viewportSize()
  let cut = false
  if (!still) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight)
    const max = mobile ? 1800 : MAX_H
    cut = h > max
    await page.setViewportSize({ width: page.viewportSize().width, height: Math.min(Math.max(h, base.height), max) })
    await page.waitForTimeout(500)
  }
  const vp = page.viewportSize()
  const file = `${role}-${String(shots.length + 1).padStart(2, '0')}-${id}.png`
  await page.screenshot({ path: join(OUT, file) })
  shots.push({ role, title, group, file, w: vp.width, h: vp.height, cut, path: new URL(page.url()).pathname + new URL(page.url()).search, mobile: !!mobile })
  await page.setViewportSize(base)
  console.log(`  ✔ ${file}`)
}

const slug = (s) => s.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'home'

// The links in the sidebar, the "More" menu opened.
async function menu(page) {
  const more = page.locator('aside button', { hasText: /^(More|Ещё|Yana)/ }).first()
  const toggle = async () => { if (await more.count()) { await more.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(300) } }
  await toggle()
  const links = await page.evaluate(() => {
    const seen = new Set()
    return [...document.querySelectorAll('aside a[href]')]
      .map((a) => [a.getAttribute('href'), a.textContent.replace(/\d+$/, '').trim()])
      .filter(([href, text]) => href.startsWith('/') && href !== '/' && text && !seen.has(href) && seen.add(href))
  })
  await toggle() // shut again, as a person finds it
  return links
}

// Signed in, in the language asked for, light theme, the tour and the
// release note already seen — the same for the desk and the phone.
const signedIn = ({ token, id, lang, news }) => {
  localStorage.setItem('satashkent_token', token)
  localStorage.setItem('satashkent_lang', lang)
  localStorage.setItem('satashkent_theme', 'light')
  localStorage.setItem(`satashkent_tour_done_${id}`, '1')
  if (news) localStorage.setItem('satashkent_news', news)
}

async function person(b, p) {
  const { token, user } = await login(p.user)
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: LANG })
  await ctx.addInitScript(signedIn, { token, id: user.id, lang: LANG, news: NEWS })
  const page = await ctx.newPage()
  const at = (path) => page.goto(WEB + path)

  console.log(`→ ${p.label}`)
  await at('/brief')
  await shoot(page, { role: p.role, id: 'my-day', title: 'My Day', group: 'Home' })

  // The task window, opened from the first row of My Day — or, where My Day
  // has no rows (the admin's is a schedule), from the first card on a board.
  let row = page.locator('.co-row-b:visible').first()
  let from = 'My Day'
  if (!(await row.count())) row = page.getByText(/^(Open the task|Открыть задачу|Vazifani ochish)$/).first()
  if (!(await row.count())) {
    const ch = await page.locator('aside a[href^="/dept/"]').first().getAttribute('href').catch(() => null)
    if (ch) { await at(ch); await settle(page); row = page.locator('.tcard:visible').first(); from = 'a board card' }
  }
  if (await row.count()) {
    try {
      await row.click({ timeout: 4000 })
      await page.locator('.co-panel').first().waitFor({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(700)
      await shoot(page, { role: p.role, id: 'task-window', title: `Task window (from ${from})`, group: 'Home', still: true })
    } catch (e) { console.log(`  · no task window: ${e.message.split('\n')[0]}`) }
    await page.keyboard.press('Escape')
  }

  // The new task form, where this person has one.
  await at('/brief')
  await settle(page)
  const add = page.locator('aside button, aside a', { hasText: /New task|Новая задача|Yangi vazifa/ }).first()
  if (await add.count()) {
    await add.click({ timeout: 4000 })
    await page.waitForTimeout(800)
    await shoot(page, { role: p.role, id: 'new-task', title: 'New task', group: 'Home', still: true })
    await page.keyboard.press('Escape')
  }

  // Everything in this person's menu. Channels: the first two are enough.
  await at('/brief')
  await settle(page)
  let channels = 0
  for (const [href, text] of await menu(page)) {
    if (href === '/brief' || href === '/profile' || (p.role === 'admin' && href === '/admin')) continue
    if (href.startsWith('/dept/') && ++channels > 2) continue
    await at(href)
    await shoot(page, { role: p.role, id: slug(href), title: text, group: href.startsWith('/dept/') ? 'Channels' : 'Pages' })
  }
  if (p.role === 'admin') {
    for (const [href, text] of ADMIN_EXTRA) {
      await at(href)
      await shoot(page, { role: p.role, id: slug(href), title: text, group: href.startsWith('/admin') ? 'Settings' : 'More pages' })
    }
  }
  await at('/profile')
  await shoot(page, { role: p.role, id: 'profile', title: 'Profile', group: 'Pages' })
  await ctx.close()

  // On a phone: My Day and the task window.
  if (['maker', 'operator', 'editor'].includes(p.role)) {
    const phone = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: LANG })
    await phone.addInitScript(signedIn, { token, id: user.id, lang: LANG, news: NEWS })
    const m = await phone.newPage()
    await m.goto(WEB + '/brief')
    await shoot(m, { role: p.role, id: 'phone-my-day', title: 'My Day · phone', group: 'Phone', mobile: true })
    const r = m.locator('.co-row-b:visible').first()
    if (await r.count()) {
      await r.click({ timeout: 4000 })
      await m.waitForTimeout(900)
      await shoot(m, { role: p.role, id: 'phone-task', title: 'Task window · phone', group: 'Phone', mobile: true, still: true })
    }
    await phone.close()
  }
}

const ping = await fetch(`${WEB}/api/health`).catch(() => null)
if (!ping?.ok) { console.error(`✖ Nothing answers at ${WEB} — start the board first (qa/crowded.sh does all of it)`); process.exit(1) }

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const b = await browser()
for (const p of PEOPLE.filter((x) => !ONLY || x.role === ONLY)) await person(b, p)
await b.close()

const roles = PEOPLE.filter((x) => shots.some((s) => s.role === x.role)).map(({ role, user, label }) => ({ role, user, label }))
writeFileSync(join(BOARD, 'screens.js'),
  `// Written by qa/capture.mjs on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} (${LANG}). Do not edit by hand.\n` +
  `window.OVERVIEW = ${JSON.stringify({ taken: new Date().toISOString(), lang: LANG, roles, shots }, null, 1)}\n`)
copyFileSync(join(here, 'capture-board.html'), join(BOARD, 'index.html'))
console.log(`\n✔ ${shots.length} screens → ${OUT}. Open ${join(BOARD, 'index.html')}`)
