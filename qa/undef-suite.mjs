// Nothing the client uses may be undefined.
//
// A name used without being declared or imported builds fine (Vite does not
// check) and then throws "x is not defined" the first time that line runs,
// which draws the board's "This part of the page could not be drawn" for
// whoever reached it. On 1 November 2026 it happened three times in a day:
// CampaignGantt called tx() without importing it (#176), Admin.jsx left slug
// and colorFor behind when the table moved to Team (#177), and two files
// called the new sayDate() without importing it, which broke My Day and the
// admin's timetable for everybody who does not read Uzbek.
//
// This parses every file under client/src and lists each name that resolves
// to nothing: no import, no declaration, no parameter, no known browser
// global. It needs no server and no browser, so it sits in the client group.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(process.env.DASHB_ROOT || path.join(here, '..'), 'client', 'src')

let bad = 0
const ok = (name, cond, saw) => {
  if (cond) console.log(`  ok   ${name}`)
  else { console.log(`  FAIL ${name}${saw === undefined ? '' : ` — ${saw}`}`); bad++ }
}

// What a browser (or the language) gives every module for free.
const GLOBALS = new Set((
  'window document navigator console location history localStorage sessionStorage fetch URL URLSearchParams ' +
  'Promise Math JSON Date Object Array String Number Boolean Map Set WeakMap WeakSet Symbol Error TypeError RangeError ' +
  'setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback ' +
  'parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI undefined NaN Infinity ' +
  'Intl Blob File FileReader FormData Headers Request Response AbortController Event CustomEvent MouseEvent KeyboardEvent ' +
  'Image Audio Notification ResizeObserver IntersectionObserver MutationObserver matchMedia getComputedStyle NodeFilter ' +
  'atob btoa structuredClone crypto performance screen alert confirm prompt open close ' +
  'HTMLElement Element Node DOMParser XMLHttpRequest WebSocket EventSource Worker MediaRecorder MediaStream ' +
  'RegExp Uint8Array Uint16Array Uint32Array Float32Array ArrayBuffer DataView TextEncoder TextDecoder ' +
  'queueMicrotask Reflect Proxy BigInt globalThis self top parent arguments ' +
  'SpeechRecognition webkitSpeechRecognition AudioContext webkitAudioContext DataTransfer ClipboardItem ' +
  'innerWidth innerHeight scrollTo scrollY scrollX devicePixelRatio visualViewport ' +
  'CSS PointerEvent TouchEvent ClipboardEvent DragEvent FocusEvent InputEvent ErrorEvent PromiseRejectionEvent StorageEvent ' +
  'BroadcastChannel MessageChannel Range Selection DocumentFragment SVGElement indexedDB caches WebAssembly OffscreenCanvas'
).split(/\s+/))

// Vite's compile-time constants (vite.config.js `define`), written __NAME__.
const isDefine = (n) => /^__[A-Z0-9_]+__$/.test(n)

// The names in `code` that resolve to nothing, as [name, line].
function undefinedIn(code) {
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true })
  const found = new Map()
  traverse(ast, {
    Program(p) {
      for (const name of Object.keys(p.scope.globals)) {
        if (GLOBALS.has(name) || isDefine(name)) continue
        const n = p.scope.globals[name]
        found.set(name, n.loc ? n.loc.start.line : 0)
      }
    },
    // <Thing /> is a reference to Thing; Babel does not list it among the globals.
    JSXOpeningElement(p) {
      const n = p.node.name
      if (n.type === 'JSXIdentifier' && /^[A-Z]/.test(n.name) && !p.scope.hasBinding(n.name) && !GLOBALS.has(n.name)) {
        found.set(n.name, p.node.loc.start.line)
      }
    },
  })
  return [...found]
}

console.log('undef: the scan itself')
ok('a name used but never imported is found',
  JSON.stringify(undefinedIn("import { a } from './a.js'\nexport const f = (x) => sayDate(x, { a })\n")) === '[["sayDate",2]]',
  JSON.stringify(undefinedIn("import { a } from './a.js'\nexport const f = (x) => sayDate(x, { a })\n")))
ok('a component used but never imported is found',
  undefinedIn("export const F = () => <Thing />\n").some(([n]) => n === 'Thing'))
ok('imports, parameters, locals and browser globals are not',
  undefinedIn("import { s } from './s.js'\nexport function f(a, { b }) { const c = s(a) + b; return window.x + fetch(c) + __BUILD__ }\n").length === 0,
  JSON.stringify(undefinedIn("import { s } from './s.js'\nexport function f(a, { b }) { const c = s(a) + b; return window.x + fetch(c) + __BUILD__ }\n")))

console.log('undef: every file under client/src')
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}
const files = walk(SRC, [])
ok(`found the client's files (${files.length})`, files.length > 100, files.length)

const problems = []
for (const file of files) {
  let found
  try { found = undefinedIn(fs.readFileSync(file, 'utf8')) }
  catch (e) { problems.push(`${path.relative(SRC, file)} does not parse: ${e.message}`); continue }
  for (const [name, line] of found) problems.push(`${path.relative(SRC, file).replace(/\\/g, '/')}:${line} uses ${name}, which is never defined or imported`)
}
ok('no file uses a name that is not defined', problems.length === 0, problems.join('; '))

console.log(bad ? `\n${bad} FAILED` : '\nEvery name the client uses is defined.')
process.exit(bad ? 1 : 0)
