// The dashboard's own API, called by the server as one of its people.
//
// The Telegram buttons (tgactions.js) and Jarvis (jarvis.js) act and read as
// a person — the one who pressed, the admin who asked — through the same
// routes the page calls. So every rule, and every limit on what a person may
// see, stays the route's: nothing here decides it. A session is minted for
// the one call, on this process's own port.
import { signToken } from './auth.js'

export async function asPerson(user, method, path, body) {
  const port = process.env.PORT || 4000
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken(user, false)}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    })
    return { status: r.status, data: await r.json().catch(() => ({})) }
  } catch (e) {
    return { status: 0, data: { error: e.message } }
  }
}
