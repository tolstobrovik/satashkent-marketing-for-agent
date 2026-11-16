// Loaded with `node --import <this file's URL>` by the suites that boot the
// server on GitHub storage (round57 for now).
//
// 12 Nov 2026: this checkout is the DEMO COPY. server/config.js says
// `export const GITHUB_DATA = null` on purpose, so the app can never reach
// the team's real data, and db.js then runs on the local file whatever the
// environment says. That is why every storage check went red here: the
// GitHub path was never switched on, so nothing reached the mock. The code
// under test (db.js, ghstore.js) did not regress.
//
// This hook changes only the deployment's CONFIGURATION, only inside the
// process that loads it: where config.js holds the demo's `null`, it is
// given a repository description instead. The repo and branch come from the
// GITHUB_DATA_* environment the suite sets, and the path is the one the mock
// serves (qa/mock-gh.mjs, data/dashboard.db). db.js, ghstore.js and the
// server run exactly as shipped. The source is rewritten, not replaced,
// because ai.js imports config.js as a whole namespace and every other
// export has to survive.
//
// It does nothing at all unless GITHUB_DATA_FORCE=1 is set and the null line
// is present. On a checkout with a real config it leaves the file alone, so
// CI and production copies behave exactly as before. The demo on :4000
// never loads it.
import * as mod from 'module'

const NULL_LINE = /export\s+const\s+GITHUB_DATA\s*=\s*null\b/
const isConfig = (url) => /\/server\/config\.js$/i.test(String(url).split('?')[0].replace(/\\/g, '/'))
const replacement = () => `export const GITHUB_DATA = ${JSON.stringify({
  repo: process.env.GITHUB_DATA_REPO || 'probe/demo',
  branch: process.env.GITHUB_DATA_BRANCH || 'appdata',
  path: process.env.GITHUB_DATA_PATH || 'data/dashboard.db',
})}`

const rewrite = (url, result) => {
  if (process.env.GITHUB_DATA_FORCE !== '1' || !isConfig(url) || result.source == null) return result
  const src = String(result.source)
  if (!NULL_LINE.test(src)) return result
  return { ...result, source: src.replace(NULL_LINE, replacement()), shortCircuit: true }
}

if (typeof mod.registerHooks === 'function') {
  // Node 22.15+ / 23.5+: synchronous, on this thread.
  mod.registerHooks({ load: (url, context, next) => rewrite(url, next(url, context)) })
} else {
  // Older Node: the same rewrite, as an off-thread hooks module.
  const hooks = `
    const NULL_LINE = ${NULL_LINE}
    const isConfig = ${isConfig}
    const replacement = () => ${JSON.stringify(replacement())}
    const rewrite = ${rewrite}
    export async function load(url, context, next) { return rewrite(url, await next(url, context)) }`
  mod.register('data:text/javascript,' + encodeURIComponent(hooks))
}
