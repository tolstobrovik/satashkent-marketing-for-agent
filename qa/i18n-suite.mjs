// The words a person reads are in their language (S-05).
//
// "To shoot" on the Russian phone calendar, "— pick a format —" in the edit
// sheet, an English hint under a Russian field: every one of them was a JSX
// text node or an attribute written straight into the source instead of
// through tx(). Two gates here:
//
//   THE SOURCE. Every file of the client is read, and every text node and
//   every title / aria-label / placeholder / alt that carries Latin words
//   outside a {…} expression is a failure — unless it is a name the board
//   does not translate (Drive, Telegram, KPI, SAT…). It reads one line at a
//   time and never inside {…}: a constant, a ternary or a sentence broken
//   over lines is not seen. I18N_SCOPE=coach reads the Coach look alone.
//
//   THE SCREENS (when I18N_WEB names a running demo, as the browser group of
//   CI does): each demo account's My Day, a board, the calendar, the task
//   window and the new-task form are rendered in Russian and in Uzbek with
//   Playwright, and a visible English word from a short list — "shoot",
//   "edit", "pick", "format", "ready", "published", "today" and their kin —
//   fails the gate. What people typed (titles, comments) is their own and is
//   not read: the walk looks at the chrome, not at the pieces.
//
//   node qa/i18n-suite.mjs                      (the source; no server needed)
//   I18N_WEB=http://localhost:5173 node qa/i18n-suite.mjs   (…and the screens)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.env.DASHB_ROOT || process.cwd()
let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const p = `${dir}/${f}`
  return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p]
})

// ===================== the source =====================
// Every file of the client. The Coach look's own files went first (the list
// below — the window's forms, the pickers, the shell), then the four S-05
// sweeps of 20 October 2026 reached the rest: the admin panel, projects and
// campaigns, the whiteboard and the Gantt, the reports. The previous look is
// read too: a word there is still a word somebody reads.
const COACH = [
  /^client\/src\/components\/Coach[A-Z]\w*\.jsx$/,
  /^client\/src\/components\/(NextStep|HandIn|TimeBand|Booking|QuickTask|TaskPlan|TaskMore|DayPick|Sidebar|Layout|MobileTabs|LinkView|UploadsDock|Toasts|Fold|Modal|PersonPick|RefMedia|Zoom|HeatmapOverlay|VoiceNote|PravkaBox|PravkaNote|BriefCheck|QuickFind|NotificationsBell)\.jsx$/,
  /^client\/src\/components\/builder\/\w+\.jsx$/,
]
const files = walk('client/src').filter((p) => p.endsWith('.jsx') && (process.env.I18N_SCOPE !== 'coach' || COACH.some((re) => re.test(p))))
ok('the client has files to read', files.length > 20, String(files.length))

// Words that are names, not words: never translated, so never a finding.
const NAMES = /^(?:Drive|Google|Telegram|Instagram|YouTube|TikTok|LinkedIn|Threads|Shorts|KPI|SAT|IELTS|ТЗ|Ctrl|K|Esc|Enter|Tab|Shift|px|URL|ID|JSON|CSV|PDF|MP4|Zoom|Reel|Reels|Post|Story|Stories|Target|Video|Other|Main|Uzb|OK|Satashkent|SATashkent|Nekst|Inter|Figma|iPad|Apple|Android|Chrome|Safari|Esse|Lorem|GitHub|Vercel|Render|Playwright|Markdown|Head|Team|Edit|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Mo|Tu|We|Th|Fr|Sa|Su|https?|www|com|College|Prep|Community|UZS|USD|mln|B)$/
const latin = (s) => /[A-Za-z]{2,}/.test(s)
const onlyNames = (s) => s.replace(/[^A-Za-z]+/g, ' ').trim().split(/\s+/).every((w) => NAMES.test(w) || w.length < 2)
const strip = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')          // {/* jsx comments */}
  .replace(/^\s*\/\/.*$/gm, '')                    // // line comments
  .replace(/\/\*[\s\S]*?\*\//g, '')                // /* block comments */

const findings = []
for (const f of files) {
  const src = strip(read(f))
  // Text nodes: what sits between a closing > and the next < or {, inside JSX.
  // A line of plain JS never has a > … < pair with words in it that is not a
  // comparison, so the shape is a good enough JSX detector here.
  // The > must end a tag and the < must start one; a line of JavaScript
  // comparing two numbers ("a > b && c < d") is not a text node.
  for (const m of src.matchAll(/(?<=[\w"'`}\]/)])>([^<>{}\n]*?)<(?=\/?[A-Za-z])/g)) {
    const text = m[1].replace(/&\w+;|&#\d+;/g, ' ').trim()
    if (!text || !latin(text) || onlyNames(text)) continue
    if (/^[\s·•—–\-:,.()|/+×%]*$/.test(text)) continue
    if (/&&|\|\||===|!==|=>|\?\.|[;()=]|^\./.test(text)) continue
    // 12 Nov 2026: a chained ternary between two elements — `<A /> : x[k] ? <B />`
    // (CoachNav's markOf) — is JavaScript, not a text node. Both ends must be a
    // ternary's operator with ONE expression token between them, so
    // "</b>: Late today<" and "</b> : Late today ?<" are still read as words.
    if (/^[?:]\s+[\w$.[\]'"!]+\s+[?:]$/.test(text)) continue
    // 12 Nov 2026: a snake_case token wrapped in <code>…</code> (Meta's
    // permission names, "instagram_basic") is an identifier the person copies
    // verbatim; both phrase books keep these names untranslated. Only inside
    // <code>: a raw key on screen ("<span>in_progress</span>") still counts,
    // and so do words with a space ("<code>read only</code>").
    if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(text)
      && src.slice(m.index - 5, m.index) === '<code' && src.startsWith('/code>', m.index + m[0].length)) continue
    findings.push(`${f}: text "${text.slice(0, 60)}"`)
  }
  // Attributes a person hears or reads, written as a plain string.
  for (const m of src.matchAll(/\b(title|aria-label|placeholder|alt|data-tip|aria-description)="([^"]*)"/g)) {
    // 12 Nov 2026: a link is not a language (lib/text.js says the same), so an
    // address such as "https://drive.google.com/…" is taken out before the
    // words are read; the words around it ("Paste https://… here") still count.
    const text = m[2].replace(/https?:\/\/\S+/g, ' ').trim()
    if (!text || !latin(text) || onlyNames(text)) continue
    findings.push(`${f}: ${m[1]}="${m[2].trim().slice(0, 60)}"`)
  }
}
ok('no English is written straight into a page — every word goes through tx()', findings.length === 0,
  findings.length ? `${findings.length}: ` + findings.slice(0, 12).join(' | ') : '')
if (process.env.I18N_LIST) console.log(findings.filter((f) => f.includes(process.env.I18N_LIST)).join('\n'))
if (findings.length) {
  const per = {}
  for (const f of findings) per[f.split(':')[0]] = (per[f.split(':')[0]] || 0) + 1
  console.log(Object.entries(per).sort((a, b) => b[1] - a[1]).map(([f, n]) => `  ${String(n).padStart(3)}  ${f.replace('client/src/', '')}`).join('\n'))
}

// ===================== the screens =====================
const WEB = process.env.I18N_WEB
if (!WEB) {
  console.log('· the screens are not walked (set I18N_WEB to a running demo to walk them)')
} else {
  const { chromium } = await import('playwright')
  const PASSWORD = process.env.DEMO_PASSWORD || 'demo-team-2026'
  const PEOPLE = ['admin', 'dilnoza', 'malika', 'otabek', 'eldor', 'nigora', 'aziz']
  // Known English, as whole words, that must not be on a Russian or Uzbek screen.
  const ENGLISH = /\b(?:shoot|to shoot|editing|edit|pick|format|lectures|ready|published|today|tomorrow|yesterday|overdue|waiting|done|cancel|save|delete|close|open|send|accept|remind|idea|calendar|board|settings|more|new task|open the task|start here|your step)\b/i
  // What people typed is theirs: titles, comments, briefs, names.
  const THEIRS = '.co-row-t, .co-here h2, .tcard-title, .tcard h4, .co-main-txt, .co-ref-txt, .co-cm-b, .co-quote, .r14-tw-tt h2, .wk-card b, .rel-ev b, .co-ad-bar, .co-ad-du, .co-ad-busy, .co-sb-who, .r14-pp li, .qt-chan b, [data-user-text]'
  const login = async (u) => {
    const r = await fetch(`${WEB}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASSWORD }) })
    if (!r.ok) throw new Error(`cannot sign in as ${u} at ${WEB} (${r.status})`)
    return r.json()
  }
  const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
  const seen = []
  for (const code of ['ru', 'uz']) {
    for (const u of PEOPLE) {
      const { token, user } = await login(u)
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: code })
      await ctx.addInitScript(({ token, id, code }) => {
        localStorage.setItem('satashkent_token', token); localStorage.setItem('satashkent_lang', code)
        localStorage.setItem(`satashkent_tour_done_${id}`, '1'); localStorage.setItem('satashkent_news', 'seen')
      }, { token, id: user.id, code })
      const page = await ctx.newPage()
      const look = async (where) => {
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(500)
        const text = await page.evaluate((theirs) => {
          const clone = document.body.cloneNode(true)
          for (const el of clone.querySelectorAll(theirs + ', script, style, [aria-hidden="true"]')) el.remove()
          return clone.innerText
        }, THEIRS)
        const hits = [...new Set((text.match(new RegExp(ENGLISH.source, 'gi')) || []).map((w) => w.toLowerCase()))]
        if (hits.length) seen.push(`${code} ${u} ${where}: ${hits.join(', ')}`)
      }
      await page.goto(`${WEB}/brief`); await look('My Day')
      const row = page.locator('.co-row-b, .co-here h2 button').first()
      if (await row.count()) {
        await row.click({ timeout: 4000 }).catch(() => {}); await page.locator('.co-panel').waitFor({ timeout: 5000 }).catch(() => {}); await look('task window')
        // Task 7 (task-window-tz.md): no Edit form — a long text opens in place, with its hint and buttons.
        const longBox = page.locator('.co-panel .tw-rv-long').first()
        if (await longBox.count()) {
          await longBox.click({ timeout: 4000 }).catch(() => {}); await page.locator('.co-panel .tw-long-in').waitFor({ timeout: 5000 }).catch(() => {})
          await look('text open in place'); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
        }
        await page.keyboard.press('Escape')
      }
      const chan = await page.locator('aside a[href^="/dept/"]').first().getAttribute('href').catch(() => null)
      if (chan) { await page.goto(WEB + chan); await look('board') }
      await page.goto(`${WEB}/calendar`); await look('calendar')
      await page.goto(`${WEB}/brief`)
      const add = page.locator('aside button', { hasText: /New task|Новая задача|Yangi vazifa/ }).first()
      if (await add.count()) {
        await add.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(600); await look('new task')
        // T-01: the builder is the form — Where, then Idea (the legacy sheet
        // behind "All fields" goes with T-05 and is not walked).
        const chan = page.locator('.modal .qt-chan').first()
        if (await chan.count()) { await chan.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(400); await look('builder') }
        await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.keyboard.press('Escape')
      }
      await ctx.close()
    }
  }
  await b.close()
  ok('no English word is on a Russian or Uzbek screen', seen.length === 0, seen.slice(0, 10).join(' | '))
}

console.log(fails ? `\n${fails} FAILED` : '\nEvery word is in the reader’s language.')
process.exit(fails ? 1 : 0)
