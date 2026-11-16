// The brand book, as checks. SATashkent BRAND BOOK v1 (August 2026) is the
// source; every rule below is one of its rules, read from the code rather
// than remembered in review.
//
//   six colours     ruby #A22036, bright red #CB3351, near black #262626,
//                   mid grey #B6B6B7, light grey #E9E9E9, white — one red
//                   variable, and none of the reds the book lists as escaped
//   no gradients    anywhere in the identity
//   type            the page headline is Nekst (--font-display), everything
//                   else Inter — the owner confirmed Nekst's web licence on
//                   7 October 2026; nothing heavier than Bold (Thin and Black
//                   are not used), none of the retired faces
//   the sidebar     neutral in the Coach look, ruby in the previous one
//   mid grey        is never text
//   the logo        is the book's artwork, never redrawn or re-typeset
//   Uzbek           oʻ/gʻ with U+02BB and the tutuq belgisi with U+02BC
//
//   node qa/brand-suite.mjs            (reads the source; no server needed)
//   BRAND_WEB=http://localhost:4095 node qa/brand-suite.mjs
//                                      (…and reads and photographs /kit, Q-04)
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const p = `${dir}/${f}`
  return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p]
})
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const css = read('client/src/styles.css')
const cssCode = noComments(css)
const code = walk('client/src').filter((p) => /\.(jsx?|css)$/.test(p))
  .map((p) => ({ p, s: noComments(read(p)) }))
  .concat(['server/db.js', 'server/routes/users.js', 'server/routes/boards.js'].map((p) => ({ p, s: noComments(read(p)) })))

// ---- colour ----
const tok = (name) => (new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css) || [])[1]?.toUpperCase()
ok('ruby is #A22036', tok('ruby') === '#A22036', tok('ruby'))
ok('bright red is #CB3351', tok('bright-red') === '#CB3351', tok('bright-red'))
ok('near black is #262626', tok('near-black') === '#262626', tok('near-black'))
ok('mid grey is #B6B6B7', tok('mid-grey') === '#B6B6B7', tok('mid-grey'))
ok('light grey is #E9E9E9', tok('light-grey') === '#E9E9E9', tok('light-grey'))
ok('type on ruby is light grey, not white', tok('on-ruby') === '#E9E9E9', tok('on-ruby'))

// The reds the book names as escaped or retired, and the ones this board had
// grown on its own. None of them may be written anywhere.
const RETIRED = ['8D1D2C', 'C1272D', '8B1A2E', 'C4243F', 'C0392B', '8F171C',
  'A32234', 'A32D2D', 'B5324A', 'D03B3B', '8C1D2C', 'C44A60', '711523', '8C2438', 'C2185B']
const hits = []
for (const { p, s } of code) {
  for (const h of RETIRED) if (new RegExp(`#${h}\\b`, 'i').test(s)) hits.push(`${p}: #${h}`)
}
ok('no retired or escaped red is used anywhere', hits.length === 0, hits.slice(0, 6).join(', '))

// Any red at all outside the token block has to come from the tokens.
const tokenBlockEnd = cssCode.indexOf('* { box-sizing: border-box; }')
const body = cssCode.slice(tokenBlockEnd)
// A red is a saturated colour whose hue sits within a few degrees of red —
// orange file icons and amber warnings are not reds.
const hexRed = ([r, g, b]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max < 110 || (max - min) / max < 0.45) return false
  let h = max === r ? 60 * (((g - b) / (max - min)) % 6) : max === g ? 60 * ((b - r) / (max - min) + 2) : 60 * ((r - g) / (max - min) + 4)
  if (h < 0) h += 360
  return h <= 12 || h >= 335
}
const strayReds = [...body.matchAll(/#([0-9A-Fa-f]{6})\b/g)]
  .map((m) => m[1]).filter((h) => hexRed([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))))
  .filter((h) => !['A22036', 'CB3351'].includes(h.toUpperCase()))
ok('every red in the stylesheet is a token', strayReds.length === 0, [...new Set(strayReds)].slice(0, 8).join(' '))

// ---- no gradients ----
// What is left are patterns and fades that carry no colour of their own:
// hairline grids, stripes, masks. A gradient between two colours is gone.
const grads = [...body.matchAll(/(linear|radial|conic)-gradient\(([^;]*)/g)].map((m) => m[2])
const colourful = grads.filter((g) => /var\(--(brand|ruby|bright-red|near-black|surface|page)/.test(g)
  || /#(?!000\b)[0-9A-Fa-f]{3,6}\b/.test(g))
ok('no gradient carries a colour', colourful.length === 0, colourful.slice(0, 3).join(' | '))
// Two looks, two sidebars: the previous look's is flat ruby; in the Coach look
// ruby is the one strong colour, so the sidebar steps down to the soft ground.
ok('the sidebar is flat ruby in the previous look', /\.sidebar \{[^}]*background: var\(--ruby\);/.test(body))
ok('…and neutral in the Coach look', /html\[data-look="coach"\] \.sidebar \{[^}]*background: var\(--soft\);/.test(body))

// ---- type ----
// The owner confirmed the web licence for Nekst on 7 October 2026. It is the
// page's one headline and a large number; everything else is Inter, which also
// stands behind it in the stack for the Uzbek ʻ ʼ Nekst cannot set.
ok('the page headline is Nekst, with Inter behind it', /--font-display: 'Nekst', 'Inter'/.test(css))
ok('the interface is Inter', /--font: 'Inter'/.test(css))
const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1])
ok('Nekst is served from this board, in the two weights a headline uses, and never blocks the text',
  faces.length === 2 && faces.every((f) => /font-family: 'Nekst'/.test(f) && /font-display: swap/.test(f) && /url\('\/fonts\/Nekst-(SemiBold|Bold)\.ttf'\)/.test(f))
  && /font-weight: 600/.test(faces[0]) && /font-weight: 700/.test(faces[1])
  && ['SemiBold', 'Bold'].every((w) => { try { return statSync(join(ROOT, `client/public/fonts/Nekst-${w}.ttf`)).size > 50000 } catch { return false } }))
// In the Coach look the display face is the headline's alone: what wore it as
// Georgia — a window's title, a question, a group's heading — is Inter.
ok('…and in the Coach look only the headline wears it',
  /html\[data-look="coach"\] :where\([^)]*\.modal-head h3[^)]*\.tb-ask[^)]*\.sp-head h2[^)]*\) \{ font-family: var\(--font\);/.test(css)
  && /html\[data-look="coach"\] :where\([^)]*\.co-title\) \{ font-family: var\(--font-display\);/.test(css))
const heavy = code.filter(({ s }) => /font-weight:\s*(800|900)|fontWeight:\s*['"]?(800|900)/.test(s)).map(({ p }) => p)
ok('nothing heavier than Bold — Thin and Black are not used', heavy.length === 0, heavy.join(', '))
const retiredFaces = code.filter(({ s }) => /Golos|Poppins|Calibri|Lora\b|Myriad|Space Grotesk|['"]Arial/i.test(s)).map(({ p }) => p)
ok('none of the retired faces is named', retiredFaces.length === 0, retiredFaces.join(', '))
const html = read('client/index.html')
ok('Inter is the only face fetched from outside; the bold Nekst is preloaded from this board',
  /family=Inter/.test(html) && !/Golos/.test(html) && !/css2\?family=(?!Inter)/.test(html)
  && /<link rel="preload" href="\/fonts\/Nekst-Bold\.ttf" as="font" type="font\/ttf" crossorigin \/>/.test(html))

// ---- mid grey is never text ----
ok('mid grey is never a text colour', !/(^|[;\s{])color:\s*(var\(--mid-grey\)|#B6B6B7)/i.test(body))

// ---- the logo ----
const logo = read('client/src/components/Logo.jsx')
ok('the logo is the brand book\'s artwork, not a drawing or a font', /\/brand\/mark\.png/.test(logo) && !/<path\b/.test(logo) && !/logo-word|logo-sat/.test(logo))
ok('on ruby it is light grey', /reversed \? 'var\(--on-ruby\)'/.test(logo))
const login = read('client/src/pages/Login.jsx')
ok('the sign-in page shows the stacked lockup, not a typed wordmark', /<LogoStacked/.test(login) && !/login-word/.test(login))

// ---- Uzbek apostrophes ----
const i18n = read('client/src/lib/i18n.jsx').replace(/\r\n/g, '\n')
// The dotted keys (UZ) in i18n.jsx, and the phrase book in its own file
// (i18n.uz.js, loaded on demand since round 19).
const uzText = i18n.slice(i18n.indexOf('const UZ = {'), i18n.indexOf('\n}', i18n.indexOf('const UZ = {')))
  + read('client/src/lib/i18n.uz.js').replace(/\r\n/g, '\n')
const uzValues = [...uzText.matchAll(/:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)].map((m) => m[1].slice(1, -1))
const wrong = uzValues.filter((v) => /[A-Za-z][‘’'`][A-Za-z]/.test(v))
ok('Uzbek uses ʻ (U+02BB) and ʼ (U+02BC), not quotes, for its apostrophes', wrong.length === 0, wrong.slice(0, 4).join(' | '))
ok('…and oʻ/gʻ take the turned comma', /[oOgG]ʻ/.test(uzText) && !/[oOgG]ʼ[a-z]/.test(uzText))

// ---- the Coach look is tokens (S-01, S-02, Q-01) ----
// From the Coach look's header to the end of the sheet, a size is one of the
// seven of the scale, a corner one of four radii, a gradient only a mask, and
// a shadow only on what floats. The previous look's sections are left alone.
const coachAt = cssCode.indexOf('.sd-more { padding: 0; overflow: hidden; }')   // the look's first rule — the fold at the foot of My Day (G-01 moved the gate up from .co-k-shoot); its header is a comment, stripped above
ok('the Coach look starts where this suite reads from', coachAt > 0)
const coach = cssCode.slice(coachAt)
const rawFs = [...coach.matchAll(/font(?:-size)?:[^;{}]*?\b([1-9][0-9.]*)px/g)].map((m) => m[0].trim())
ok('every font size in the Coach look is a token of the scale (S-01)', rawFs.length === 0, rawFs.slice(0, 6).join(' | '))
for (const t of ['fs-xs', 'fs-sm', 'fs-md', 'fs-lg', 'fs-xl', 'fs-2xl', 'fs-display']) ok(`…and --${t} is defined`, new RegExp(`--${t}:\\s*\\d+px`).test(css))
const rawRad = [...coach.matchAll(/border-(?:[a-z-]*-)?radius:[^;{}]*?\b([1-9][0-9.]*)px/g)].map((m) => m[0].trim())
ok('every corner in the Coach look is one of four radii (S-02)', rawRad.length === 0, rawRad.slice(0, 6).join(' | '))
ok('no uppercase tracked label in the Coach look (S-01)', !/text-transform:\s*uppercase/.test(coach))
ok('…and the look\'s own radii are 6, 10 and 14', /html\[data-look="coach"\] \{\s*--radius: 14px;\s*--radius-sm: 10px;\s*--radius-xs: 6px;/.test(cssCode))
const rulesOf = (text) => [...text.matchAll(/([^{}]*)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim().split('\n').pop().trim(), body: m[2] }))
const gradRules = rulesOf(coach).filter((r) => /gradient\(/.test(r.body) && !/mask(?:-image)?:/.test(r.body))
ok('no gradient in the Coach look outside a mask (S-02)', gradRules.length === 0, gradRules.map((r) => r.sel).slice(0, 4).join(' | '))
const gradElsewhere = rulesOf(cssCode.slice(tokenBlockEnd, coachAt)).filter((r) => /gradient\(/.test(r.body) && !/mask(?:-image)?:/.test(r.body))
ok('…and none in the previous look\'s sections either (S-02)', gradElsewhere.length === 0, gradElsewhere.map((r) => r.sel).join(', '))
// What floats: the window, the question panel, the pickers, the uploads
// dock, Jarvis's button and card, the heatmap bar, the undo toast, the day
// card, the tour, the board's filter popover (B-01). A hover that lifts is a state, not a rest.
const FLOATS = /^(?:\.co-panel|\.co-ask|\.co-dp-pop|\.r14-pp\b|\.ud\b|\.co-jv\b|\.hm-bar|\.co-am-undo|\.co-tour|\.toast|\.co-pc\b|\.r14-bk\b|\.lang-menu|\.co-sb \.lang-menu|\.qf-|\.cf-pop\b|\.sch-late-pop\b)/
const shadowRules = rulesOf(coach).filter((r) => /box-shadow:\s*(?:var\(--shadow|[0-9.]+px\s+[0-9.]+px\s+[1-9])/.test(r.body))
const strayShadows = shadowRules.filter((r) => !FLOATS.test(r.sel) && !/:hover|:focus|@keyframes/.test(r.sel)).map((r) => r.sel)
ok('only what floats casts a shadow in the Coach look (S-02)', strayShadows.length === 0, strayShadows.slice(0, 6).join(' | '))
// Raw hex outside the token blocks: counted, as a warning that becomes a gate
// when it reaches zero (Q-01). Move them to tokens as each section is touched.
const hexes = [...cssCode.slice(tokenBlockEnd).matchAll(/#[0-9A-Fa-f]{3,6}\b/g)].length
console.log(`· ${hexes} raw hex colours outside the token blocks (Q-01: a warning until it reaches zero, then a gate)`)
if (hexes === 0) ok('no raw hex outside the token blocks (Q-01)', true)

// ---- the kit (Q-04): photographed, and read ----
// With BRAND_WEB naming a board the demo team is on (the browser group of
// qa/ci.sh), /kit is opened as the admin, read and photographed — qa/kit-desk.png
// and qa/kit-phone.png, uploaded by the checks workflow — and a member is
// shown the door. Without it the kit is not read (the client group).
if (process.env.BRAND_WEB) {
  const WEB = process.env.BRAND_WEB
  const { chromium } = await import('playwright')
  const PASSWORD = process.env.DEMO_PASSWORD || 'demo-team-2026'
  const signIn = async (u) => {
    const r = await fetch(`${WEB}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASSWORD }) })
    if (!r.ok) throw new Error(`cannot sign in as ${u} at ${WEB} (${r.status})`)
    return r.json()
  }
  const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
  // Signed in with the DARK theme chosen: the kit has to sit on the light
  // ground whatever the reader chose, and put the choice back on leaving.
  const open = async (u, viewport) => {
    const { token, user } = await signIn(u)
    const ctx = await b.newContext({ viewport, locale: 'en' })
    await ctx.addInitScript(({ token, id }) => {
      localStorage.setItem('satashkent_token', token); localStorage.setItem('satashkent_lang', 'en'); localStorage.setItem('satashkent_theme', 'dark')
      localStorage.setItem(`satashkent_tour_done_${id}`, '1'); localStorage.setItem('satashkent_news', 'seen')
    }, { token, id: user.id })
    const page = await ctx.newPage()
    await page.goto(`${WEB}/kit`)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.locator('.kit-ready').waitFor({ timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(600)
    return { page, ctx }
  }
  try {
    const { page, ctx } = await open('admin', { width: 1440, height: 900 })
    ok('the kit opens for an admin', /\/kit$/.test(page.url()), page.url())
    ok('…with the three books in', (await page.locator('.kit-ready').count()) === 1)
    const read = await page.evaluate(() => {
      const all = [...document.querySelectorAll('.kit *')]
      const text = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      return {
        swatches: document.querySelectorAll('.kit-sw').length,
        empty: [...document.querySelectorAll('.kit-sw > i')].filter((i) => getComputedStyle(i).backgroundColor === 'rgba(0, 0, 0, 0)').length,
        langs: document.querySelectorAll('.kit-lang').length,
        heavy: all.filter((el) => parseInt(getComputedStyle(el).fontWeight, 10) > 700).length,
        midGrey: all.filter((el) => text(el) && getComputedStyle(el).color === 'rgb(182, 182, 183)').length,
        title: getComputedStyle(document.querySelector('.kit .co-title')).fontFamily,
        ground: document.documentElement.dataset.theme,
        darkHalf: getComputedStyle(document.querySelector('.kit-theme[data-theme="dark"]')).backgroundColor,
        lightHalf: getComputedStyle(document.querySelector('.kit-theme:not([data-theme])')).backgroundColor,
      }
    })
    ok('…every colour token drawn twice, light and dark', read.swatches >= 70, String(read.swatches))
    ok('…and every one of them resolves to a colour', read.empty === 0, String(read.empty))
    ok('…the three languages in both halves', read.langs === 6, String(read.langs))
    ok('…nothing on it heavier than Bold', read.heavy === 0, String(read.heavy))
    ok('…mid grey is never text on it', read.midGrey === 0, String(read.midGrey))
    ok('…the headline is Nekst', /Nekst/.test(read.title), read.title)
    ok('…it sits on the light ground whatever the reader chose', read.ground === 'light', String(read.ground))
    ok('…and the two halves are two grounds', read.darkHalf !== read.lightHalf, `${read.lightHalf} / ${read.darkHalf}`)
    await page.screenshot({ path: join(ROOT, 'qa/kit-desk.png'), fullPage: true })
    await page.goto(`${WEB}/brief`)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    ok('…and the reader\'s own theme is back on leaving', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark')
    await ctx.close()
    const phone = await open('admin', { width: 390, height: 844 })
    await phone.page.screenshot({ path: join(ROOT, 'qa/kit-phone.png'), fullPage: true })
    await phone.ctx.close()
    console.log('· photographed: qa/kit-desk.png, qa/kit-phone.png')
    const member = await open('dilnoza', { width: 1440, height: 900 })
    ok('…a member is sent away from it', !/\/kit/.test(member.page.url()), member.page.url())
    await member.ctx.close()
  } finally { await b.close() }
}

console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
