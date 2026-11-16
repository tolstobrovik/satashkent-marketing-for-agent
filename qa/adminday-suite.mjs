// An admin's My Day, two tabs since round 1 (GET /content/day/team, CoachAdminDay.jsx): My Day = seatless,
// Start here, asks, Today, Overdue; Team = the schedule, Free, Housekeeping, the deadlines below (folded).
//
// THE DEADLINES. Overdue now (every step past its day, whose, how late), due
// today (with the hour), and needs editing ASAP (footage in, the cut late or
// due within a day — a cut is said there and only there).
//
// THE TIMELINE. For a chosen day, one row per person with something on it: a
// shoot on the row of everyone in it, an editor's cut due, a maker's post going
// out, and their study timetable as busy time.
//
// Only an admin sees the team this way; everybody else keeps their own day.
//
//   node qa/adminday-suite.mjs           (expects a server on :4090)
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const BASE = process.env.BASE || 'http://localhost:4090'
const ROOT = process.env.DASHB_ROOT || '/home/user/dashb'
let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }
const login = async (u, p) => (await (await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }),
})).json()).token
const T = await login('admin', 'admin123')
const req = async (p, m = 'GET', b, t = T) => {
  const r = await fetch(BASE + '/api' + p, {
    method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: b ? JSON.stringify(b) : undefined,
  })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}
const day = (off = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(Date.now() + off * 86400000))
const statuses = (await req('/statuses')).data
const sid = (l) => statuses.find((s) => s.label.toLowerCase() === l)?.id

const sfx = Date.now().toString(36).slice(-5)
const ch = 'instagram_main'
const maker = (await req('/users', 'POST', { name: 'Mila Maker', username: 'am' + sfx, password: 'pw123456', role: 'member', departments: [ch] })).data
const op = (await req('/users', 'POST', { name: 'Otabek Operator', username: 'ao' + sfx, password: 'pw123456', role: 'operator', departments: [ch] })).data
const ed = (await req('/users', 'POST', { name: 'Elya Editor', username: 'ae' + sfx, password: 'pw123456', role: 'editor', departments: [ch] })).data
const face = (await req('/users', 'POST', { name: 'Farid Face', username: 'af' + sfx, password: 'pw123456', role: 'member', departments: [ch] })).data
const MT = await login('am' + sfx, 'pw123456')
const weekday = new Date(`${day(0)}T12:00:00Z`).getUTCDay()
await req(`/users/${op.id}`, 'PATCH', { study_blocks: [{ d: weekday, from: '09:00', to: '11:00', label: 'Lecture' }] })

const mk = (b) => req('/content', 'POST', { channels: [ch], assignee_ids: [maker.id], force: true, ...b })
// late: a shoot two days ago that never happened
const late = (await mk({ title: 'AD: late shoot', type: 'reel', status_id: sid('to shoot'), operator_id: op.id, recording_date: day(-2), recording_time: '10:00', release_date: day(3) })).data
// today: a shoot at 14:00 with somebody in it, and a post at 18:00
const shoot = (await mk({ title: 'AD: shoot today', type: 'reel', status_id: sid('to shoot'), operator_id: op.id, recording_date: day(0), recording_time: '14:00', recording_end: '15:00', face_ids: [face.id], release_date: day(4) })).data
const post = (await mk({ title: 'AD: post today', type: 'post', status_id: sid('ready'), release_date: day(0), release_time: '18:00' })).data
// edit ASAP: filmed, the cut due today
const cut = (await mk({ title: 'AD: cut due today', type: 'reel', status_id: sid('editing'), operator_id: op.id, editor_id: ed.id, recording_date: day(-1), edit_ready_date: day(0), release_date: day(2), shot_link: 'https://drive.google.com/file/d/adcut0000000/view' })).data
ok('(four tasks set up)', [late, shoot, post, cut].every((t) => t?.id), JSON.stringify([late, shoot, post, cut].map((t) => t?.id || t?.error)))

ok('a member does not get the team view', (await req('/content/day/team', 'GET', null, MT)).status === 403)
const d = (await req('/content/day/team')).data
const has = (list, id) => (list || []).find((x) => x.content_id === id)

const o = has(d.overdue, late.id)
ok('a shoot two days past its day is overdue, the operator\'s, two days late', o && o.phase === 'shoot' && o.owners.includes(op.id) && o.days_late === 2, JSON.stringify(o))
const t1 = has(d.dueToday, shoot.id)
ok('today\'s shoot is due today, with its hour', t1 && t1.phase === 'shoot' && t1.time === '14:00', JSON.stringify(t1))
const t2 = has(d.dueToday, post.id)
ok('today\'s post is due today, the maker\'s, at its hour', t2 && t2.phase === 'release' && t2.owners.includes(maker.id) && t2.time === '18:00', JSON.stringify(t2))
const e = has(d.editAsap, cut.id)
ok('a filmed piece whose cut is due today needs editing ASAP, the editor\'s', e && e.owners.includes(ed.id) && e.days_late === 0, JSON.stringify(e))
ok('…and a cut is said only there', ![...d.overdue, ...d.dueToday].some((x) => x.content_id === cut.id && x.phase === 'edit'))

const row = (uid) => d.timeline.find((p) => p.id === uid)
const opRow = row(op.id)
ok('the operator\'s row has today\'s shoot at its hours', opRow?.items.some((i) => i.kind === 'shoot' && i.content_id === shoot.id && i.from === '14:00' && i.to === '15:00'), JSON.stringify(opRow?.items))
ok('…and their lecture as busy time', opRow?.busy.some((b) => b.from === '09:00' && b.to === '11:00'), JSON.stringify(opRow?.busy))
ok('the same shoot is on the maker\'s row and on the row of whoever is in it',
  row(maker.id)?.items.some((i) => i.content_id === shoot.id) && row(face.id)?.items.some((i) => i.content_id === shoot.id))
ok('the maker\'s post goes out on their row at 18:00', row(maker.id)?.items.some((i) => i.kind === 'post' && i.content_id === post.id && i.from === '18:00'))
ok('the editor\'s cut due today is on their row', row(ed.id)?.items.some((i) => i.kind === 'cut' && i.content_id === cut.id))
// Round 14 (the admin's schedule, after Float): everyone=1 is a row for every
// member, the free ones too, each saying whether they film or edit.
const free = (await req('/users', 'POST', { name: 'Fay Free', username: 'ax' + sfx, password: 'pw123456', role: 'member', departments: [ch] })).data
const all1 = (await req(`/content/day/team?date=${day(1)}&everyone=1`)).data
ok('everyone=1 has a row for a member with nothing on, and none without it',
  all1.timeline.some((p) => p.id === free.id && p.items.length === 0)
    && !(await req(`/content/day/team?date=${day(1)}`)).data.timeline.some((p) => p.id === free.id))
ok('…and every row says the person\'s role', all1.timeline.every((p) => typeof p.role === 'string' && Array.isArray(p.crew_roles)))
const tomorrow = (await req(`/content/day/team?date=${day(1)}`)).data
ok('another day moves the timeline, not the deadlines', tomorrow.day === day(1) && !tomorrow.timeline.some((p) => p.items.some((i) => i.content_id === shoot.id))
  && tomorrow.dueToday.some((x) => x.content_id === shoot.id))

// ---- the page, read from the source ----
const src = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const brief = src('client/src/pages/Brief.jsx')
ok('an admin\'s My Day is the team\'s', /user\.role === 'admin' \? \(/.test(brief) && /<CoachAdminDay /.test(brief))
const ad = src('client/src/components/CoachAdminDay.jsx')
// My Day round 1 (design-variants/myday-tz.md §2.1.2, §3.4 — these pins moved
// with the screen, reviewed): the page is two tabs, My Day · Team, as the
// handbook names them (kept in the address, Team mounted when first chosen;
// TABS = false is the one-column fallback in the same order). MY DAY:
// "Nobody holds these" first (round 19, never folded, unchanged), then the
// start-here card read by adminFirst (lib/coach.js) — never a piece Monday's
// archive takes, so it is given the summary's archive_days and candidates —
// then the asks as open rows (AdminAsks: Move it tonal, Keep it the quiet
// ghost, three then "Show all", no ruby strip), Today read by atRisk, Overdue
// read by teamOverdue (one row a piece, five then "Show all", Remind only for
// the step that can move, what the archive takes one quiet line). "Stuck" and
// "Holds up {n}" are gone; the word is Overdue (round 17). TEAM: "Who does
// what today" over the timetable (open, never folded — the owner, 23 Oct
// 2026), who is free now, Housekeeping, and the three deadline groups of
// before, folded.
ok('the admin’s first card is adminFirst’s — given the archive’s own list, so never a piece the archive takes',
  /const first = adminFirst\(teamF, \{ archiveDays, asks: asksF, candidates, today \}\)/.test(ad) && /api\.get\('\/content\/housekeeping\/summary'\)/.test(ad)
    && /const candidates = hk \? hk\.candidates : null/.test(ad) && /<RemindButton primary user=\{user\} taskId=\{first\.content_id\}/.test(ad)
    && /risk\.rows\.filter\(\(x\) => x\.content_id !== heroId\)/.test(ad) && /od\.rows\.filter\(\(r\) => r\.content_id !== heroId\)/.test(ad))
const asksSrc = existsSync(join(ROOT, 'client/src/components/AdminAsks.jsx')) ? src('client/src/components/AdminAsks.jsx') : ''
ok('…then the asks as open rows, Today from atRisk, Overdue from teamOverdue: one row a piece, five and “Show all”, Remind for the holder only',
  /const FIRST = 5\b/.test(ad) && /const od = teamOverdue\(teamF, \{ archiveDays, asks: asksF, candidates \}\)/.test(ad) && /const risk = atRisk\(teamF\)/.test(ad)
    && /label=\{tx\('Overdue'\)\}/.test(ad) && /action=\{!r\.ask && who && who\.id !== user\.id \? <RemindButton small/.test(ad)
    && /tx\('\{n\} more are over \{d\} days late · Review them'/.test(ad)
    && !/tx\('Stuck'\)|Holds up \{n\}/.test(ad)
    && /const FIRST = 3\b/.test(asksSrc) && /className="co-btn co-btn-t co-btn-sm"[^\n]*\n[^\n]*\{tx\('Move it'\)\}/.test(asksSrc)
    && /className="co-btn co-btn-g co-btn-sm"[^\n]*\n[^\n]*\{tx\('Keep it'\)\}/.test(asksSrc) && !/co-btn-p/.test(asksSrc))
const myDayAt = ad.indexOf('const myDay = ('), teamAt = ad.indexOf('const teamPart = (')
const myDaySrc = ad.slice(myDayAt, teamAt), teamSrc = ad.slice(teamAt, ad.indexOf('const tabKey'))
const ttSrc = ad.slice(ad.indexOf('const timetable = ('), ad.indexOf('const freeNow'))
const inOrder = (txt, keys) => keys.every((k, i) => txt.indexOf(k) >= 0 && (i === 0 || txt.indexOf(keys[i - 1]) < txt.indexOf(k)))
ok('My Day: nobody-holds-these first, then the card, the asks, Today, Overdue; Team: the timetable open under “Who does what today”, Free, Housekeeping, the three deadline groups folded',
  myDayAt > 0 && inOrder(myDaySrc, ['{seatlessCard}', '{hero()}', '<AdminAsks ', '{todayCard}', '{overdueCard}'])
    && inOrder(teamSrc, ['{timetable}', '{freeLine}', '{deadlines}']) && /\{housekeeping\}\s*\{GROUPS\.slice\(1\)\.map\(/.test(ad)   // 15 Nov 2026: the archive card lives inside the record's fold
    && /className="co-ad" role="table"/.test(ad) && ttSrc.indexOf('co-ad-tt-h') >= 0 && ttSrc.indexOf('co-ad-tt-h') < ttSrc.indexOf('{narrow ? phoneList : deskTable}') && !/<details[^>]*co-ad-tt\b/.test(ad)
    && ad.indexOf("tx('Overdue now')") < ad.indexOf("tx('Due today')") && ad.indexOf("tx('Due today')") < ad.indexOf("tx('Needs editing ASAP')")
    && ad.indexOf('co-ad-dl') < ad.indexOf('{GROUPS.slice(1).map(') && /<details className="co-card sd-fold co-ad-dl co-ad-record"/.test(ad)
    && /api\.get\(`\/content\/day\/team\?date=\$\{day\}&everyone=1`\)/.test(ad)
    && /\.co-admin \.co-ad-who \{ position: sticky; left: 0;/.test(src('client/src/styles.css')))
ok('…as two tabs, My Day · Team: a tablist kept in the address (?tab=team), Team mounted when first chosen; TABS = false is one column in the same order',
  /const TABS = (true|false)\b/.test(ad) && /role="tablist"/.test(ad) && /n\.set\('tab', 'team'\)/.test(ad) && /\(teamSeen \|\| tab === 'team'\) && \(/.test(ad)
    && /role="tabpanel" id="co-ad-p-day"/.test(ad) && /\{myDay\}\s*\{teamPart\}/.test(ad))
ok('the timetable is a table: a named, focusable scroll region; names are row headers; one "Due and overdue" column header (15 Nov 2026); "{n} overdue · {d} d" for who holds what',
  /role="region" tabIndex=\{0\} aria-label=\{tx\('Timetable, scrolls sideways'\)\}/.test(ad) && /role="table" aria-label=\{tx\('Timetable'\)\}/.test(ad)
    && /role="rowheader"/.test(ad) && /role="columnheader">\{tx\('Due and overdue'\)\}/.test(ad) && /tx\('\{n\} overdue · \{d\} d'/.test(ad))
ok('channel tabs narrow all of it', /const on = \(x\) => chan === 'all' \|\| \(x\.channels \|\| \[\]\)\.includes\(chan\)/.test(ad))
ok('Overview is no longer in the menu', !/key: 'overview', to: '\/overview'/.test(src('client/src/components/Sidebar.jsx')))
// N-07: and no longer a page at all — its address lands on Numbers (N-02).
ok('…nor a page: /overview lands on Numbers', !existsSync(join(ROOT, 'client/src/pages/Overview.jsx')) && /path="\/overview" element=\{<Navigate to="\/numbers" replace \/>\}/.test(src('client/src/App.jsx')))

for (const t of [late, shoot, post, cut]) if (t?.id) await req(`/content/${t.id}`, 'DELETE')
for (const u of [maker, op, ed, face, free]) await req(`/users/${u.id}`, 'DELETE')
console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
