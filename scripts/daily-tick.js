// The nightly tick, fired by pm2 (ecosystem.config.cjs → cron_restart) on a
// server where no platform cron exists. It just calls the app's own endpoint
// over loopback — the work itself lives in server/app.js and is idempotent.
const port = process.env.PORT || 5003
const secret = process.env.CRON_SECRET

const res = await fetch(`http://127.0.0.1:${port}/api/cron/daily`, {
  headers: secret ? { authorization: `Bearer ${secret}` } : {},
}).catch((e) => { console.error('daily tick: cannot reach the app —', e.message); process.exit(1) })

const body = await res.text()
console.log(`daily tick: ${res.status} ${body.slice(0, 500)}`)
// A non-zero exit puts the failure in `pm2 status` as an errored run instead
// of a silent success nobody looks at again.
process.exit(res.ok ? 0 : 1)
