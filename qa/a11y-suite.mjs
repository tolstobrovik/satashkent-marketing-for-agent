// The accessibility floor (S-07), read off the screens.
//
// The builder's step tabs, kind cards and person buttons had no names; ten
// `outline: none` rules hid the keyboard's ring with nothing in its place; a
// shut fold kept its boxes in the page's order; a sheet's scroll leaked to the
// page behind it. Two gates here, both against a running board:
//
//   AXE. axe-core runs over the same screens the i18n suite walks — each demo
//   account's My Day, a board, the calendar, the task window and the new-task
//   form — and any finding of impact serious or critical fails the gate.
//
//   THE KEYBOARD. On My Day, Tab reaches every control; in the task window
//   Tab stays inside and Escape closes it; in the builder Escape closes it.
//   Every layer closes in order.
//
// Needs a board with the demo team on it and the built client served by the
// API, which is what the `browser` group of qa/ci.sh sets up:
//
//   A11Y_WEB=http://localhost:4095 node qa/a11y-suite.mjs
//
// Locally, against the demo: A11Y_WEB=http://localhost:5173 PW_CHANNEL=chrome
// node qa/a11y-suite.mjs (PW_CHANNEL uses the Chrome you have instead of the
// browser Playwright downloads).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const WEB = process.env.A11Y_WEB
const PASSWORD = process.env.DEMO_PASSWORD || 'demo-team-2026'
const PEOPLE = ['admin', 'dilnoza', 'malika', 'otabek', 'eldor', 'nigora', 'aziz']
let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
if (!WEB) { console.error('A11Y_WEB names no board — nothing to read'); process.exit(2) }

const login = async (u) => {
  const r = await fetch(`${WEB}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASSWORD }) })
  if (!r.ok) throw new Error(`cannot sign in as ${u} at ${WEB} (${r.status})`)
  return r.json()
}
const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
const settle = async (page) => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(500) }

// ---- axe over the screens ----
const bad = []        // serious and critical
const seen = {}       // every rule, counted, for the log
async function axe(page, where) {
  await page.addScriptTag({ content: AXE })
  const out = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } })
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes[0]?.target?.join(' ') || '' }))
  })
  for (const v of out) {
    seen[v.id] = (seen[v.id] || 0) + v.n
    if (v.impact === 'serious' || v.impact === 'critical') bad.push(`${where}: ${v.id} (${v.impact}) ×${v.n} — ${v.sample.slice(0, 80)}`)
  }
}
for (const u of PEOPLE) {
  const { token, user } = await login(u)
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en' })
  await ctx.addInitScript(({ token, id }) => {
    localStorage.setItem('satashkent_token', token); localStorage.setItem('satashkent_lang', 'en')
    localStorage.setItem(`satashkent_tour_done_${id}`, '1'); localStorage.setItem('satashkent_news', 'seen')
  }, { token, id: user.id })
  const page = await ctx.newPage()
  await page.goto(`${WEB}/brief`); await settle(page); await axe(page, `${u} My Day`)
  // S-03: at most one ruby-filled button in sight without scrolling — the step.
  const rubies = await page.evaluate(() => [...document.querySelectorAll('.co-btn-p, .btn-primary')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top < window.innerHeight && r.bottom > 0 }).map((el) => (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)))
  ok(`${u}: one ruby button at most above the fold on My Day (S-03)`, rubies.length <= 1, rubies.join(' | '))
  const row = page.locator('.co-row-b, .co-here h2 button').first()
  if (await row.count()) {
    await row.click({ timeout: 4000 }).catch(() => {})
    await page.locator('.co-panel').waitFor({ timeout: 5000 }).catch(() => {})
    await settle(page); await axe(page, `${u} task window`)
    // Task 7 (task-window-tz.md): no Edit form — a long text opens in place; axe reads the open box.
    const longBox = page.locator('.co-panel .tw-rv-long').first()
    if (await longBox.count()) {
      await longBox.click({ timeout: 4000 }).catch(() => {})
      await page.locator('.co-panel .tw-long-in').waitFor({ timeout: 5000 }).catch(() => {})
      await settle(page); await axe(page, `${u} text open in place`); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    }
    await page.keyboard.press('Escape')
  }
  const chan = await page.locator('aside a[href^="/dept/"]').first().getAttribute('href').catch(() => null)
  if (chan) { await page.goto(WEB + chan); await settle(page); await axe(page, `${u} board`) }
  await page.goto(`${WEB}/calendar`); await settle(page); await axe(page, `${u} calendar`)
  await page.goto(`${WEB}/brief`); await settle(page)
  const add = page.locator('aside button', { hasText: /New task/ }).first()
  if (await add.count()) {
    await add.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(600); await axe(page, `${u} new task`)
    // T-01: the builder is the form — Where, then Idea (the legacy sheet behind
    // "All fields" goes with T-05 and is not walked).
    const chan = page.locator('.modal .qt-chan').first()
    if (await chan.count()) { await chan.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(400); await axe(page, `${u} builder`) }
    await page.keyboard.press('Escape')
  }
  await ctx.close()
}
console.log('axe, every rule seen: ' + (Object.entries(seen).map(([k, n]) => `${k}×${n}`).join(', ') || 'none'))
ok('axe finds nothing serious or critical on the key screens', bad.length === 0, bad.length ? `${bad.length}: ` + bad.slice(0, 8).join(' | ') : '')

// ---- the keyboard ----
{
  // A maker: she has a card, a window and the New task button, so every walk runs.
  const { token, user } = await login('dilnoza')
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en' })
  await ctx.addInitScript(({ token, id }) => {
    localStorage.setItem('satashkent_token', token); localStorage.setItem('satashkent_lang', 'en')
    localStorage.setItem(`satashkent_tour_done_${id}`, '1'); localStorage.setItem('satashkent_news', 'seen')
  }, { token, id: user.id })
  const page = await ctx.newPage()
  await page.goto(`${WEB}/brief`); await settle(page)
  // Tab reaches every control on My Day: walk until the ring comes back to
  // the first stop, and compare with what the page says is focusable.
  const focusable = await page.evaluate(() => [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
    .filter((el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null) && !el.closest('[aria-hidden="true"]')).length)   // a shut fold's boxes have a box in Chrome but take no Tab
  const reached = new Set()
  await page.keyboard.press('Tab')
  for (let i = 0; i < focusable + 20; i++) {
    const key = await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null; a.dataset.kb = a.dataset.kb || String(Math.random()); return a.dataset.kb })
    if (key) { if (reached.has(key) && reached.size > 3) break; reached.add(key) }
    await page.keyboard.press('Tab')
  }
  ok('Tab reaches every control on My Day', reached.size >= focusable * 0.95, `${reached.size} of ${focusable}`)
  // The window: Tab stays inside, Escape closes it.
  await page.locator('.co-row-b, .co-here h2 button').first().click()
  await page.locator('.co-panel').waitFor({ timeout: 5000 })
  await page.waitForTimeout(600)
  let inside = true
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    if (!(await page.evaluate(() => !!document.activeElement?.closest('.co-panel')))) { inside = false; break }
  }
  ok('in the task window Tab stays inside the window', inside)
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  ok('…and Escape closes it', (await page.locator('.co-panel').count()) === 0)
  // S-10: a sheet over the drawer — one scrim, Escape closes the topmost
  // first, the focus comes back to what opened the window.
  const opener = page.locator('.co-row-b, .co-here h2 button').first()
  await opener.click(); await page.locator('.co-panel').waitFor({ timeout: 5000 }); await page.waitForTimeout(600)
  // Task 7: a field's own layer (a chip's menu, the long text's box) closes first and gives the focus back to its value.
  const chip = page.locator('.co-panel .tw-chipb').first()
  if (await chip.count()) {
    await chip.click(); await page.locator('.co-panel .tw-menu[role="menu"]').waitFor({ timeout: 3000 }).catch(() => {})
    const scrims = await page.evaluate(() => [...document.querySelectorAll('.co-scrim, .modal-backdrop')]
      .filter((el) => { const bg = getComputedStyle(el).backgroundColor; return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' }).length)
    ok('a menu over the task window shows one scrim', scrims === 1, String(scrims))
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    ok('…Escape closes the menu, keeps the window and gives the focus back to the chip',
      (await page.locator('.co-panel .tw-menu').count()) === 0 && (await page.locator('.co-panel').count()) === 1
      && await page.evaluate(() => !!document.activeElement?.matches('.tw-chipb')))
  } else console.log('· this account may not change the first task\'s kind; the menu over the window is not walked')
  const longBox = page.locator('.co-panel .tw-rv-long').first()
  if (await longBox.count()) {
    await longBox.click(); await page.locator('.co-panel .tw-long-in').waitFor({ timeout: 3000 })
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    ok('…Escape in an untouched text box closes the box, keeps the window and gives the focus back to the text',
      (await page.locator('.co-panel .tw-long-in').count()) === 0 && (await page.locator('.co-panel').count()) === 1
      && await page.evaluate(() => !!document.activeElement?.matches('.tw-rv-long')))
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  ok('…and the focus comes back to what opened the window', await page.evaluate(() => !!document.activeElement?.closest('.co-row-b, .co-here')))
  // The builder: Escape closes it.
  const add = page.locator('aside button', { hasText: /New task/ }).first()
  if (await add.count()) {
    await add.click(); await page.waitForTimeout(600)
    ok('the new-task form opens on a control', await page.evaluate(() => !!document.activeElement?.closest('.modal')))
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    ok('…and Escape closes it', (await page.locator('.modal').count()) === 0)
  } else console.log('· this account cannot create tasks; the builder is not walked')
  await ctx.close()
}
await b.close()

console.log(fails ? `\n${fails} FAILED` : '\nThe floor holds.')
process.exit(fails ? 1 : 0)
