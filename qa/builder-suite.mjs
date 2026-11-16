// The task builder: four small questions instead of a form, and the quieter
// board around it.
//
// WHAT IT SENDS. The builder writes a new task through the same route the
// full sheet used, at the same stage (the idea), so everything here is the
// server agreeing with the exact shape the builder posts: a name, a kind, a
// day, the crew as faces, notes whose links become the reference, pictures as
// the reference album — and files hung on the task once it exists.
//
// WHERE A REFUSAL POINTS. The builder takes a person back to the question a
// refusal is about. It can only do that because the server names the field:
// a crew seat on the wrong channel carries `crew_field`, and a description the
// admin demands says «Description».
//
// THE PAGE. Read from the source: every new task goes through the builder, the
// four steps are four components, Enter and Ctrl+Enter do what they say, the
// window keeps one height, motion respects the system setting, and the board
// card shows faces and a one-press move instead of a chip per hat.
//
//   node qa/builder-suite.mjs           (expects a server on :4090)
import { readFileSync } from 'fs'
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
const day = (off = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' })
  .format(new Date(Date.now() + off * 86400000))
const statuses = (await req('/statuses')).data
const idea = statuses.find((s) => /^idea$/i.test(s.label)) || statuses[0]
const CH = 'instagram_main'

const sfx = Date.now().toString(36).slice(-5)
const smm = (await req('/users', 'POST', {
  name: 'Sara Smm', username: 'bs' + sfx, password: 'pw123456', role: 'member',
  departments: [CH], permissions: { manage_content: true, move_tasks: true },
})).data
const op = (await req('/users', 'POST', { name: 'Otabek Films', username: 'bo' + sfx, password: 'pw123456', role: 'operator' })).data
const ed = (await req('/users', 'POST', { name: 'Elyor Cuts', username: 'be' + sfx, password: 'pw123456', role: 'editor' })).data
const far = (await req('/users', 'POST', {
  name: 'Farrux Elsewhere', username: 'bf' + sfx, password: 'pw123456', role: 'crew', crew_roles: ['operator'], crew_channels: ['youtube'],
})).data
const ST = await login('bs' + sfx, 'pw123456')

// Exactly what TaskBuilder.payloadOf() builds.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const shape = (over = {}) => ({
  title: 'Builder: SAT results reel', channels: [CH], type: 'reel', status_id: idea?.id ?? null,
  release_date: day(1), recording_date: null,
  description: 'Top five scores, like this one https://www.instagram.com/reel/builder1',
  reference_links: ['https://www.instagram.com/reel/builder1'],
  reference_photos: [{ photo: PNG, thumb: PNG }], photo: PNG, photo_thumb: PNG,
  operator_id: op.id, editor_id: ed.id, campaign_id: null, ...over,
})
const made = []

// ===================== what it sends =====================
const a = await req('/content', 'POST', shape(), ST)
ok('an SMM makes a task with exactly what the builder sends', a.status === 201, `${a.status} ${a.data?.error || ''}`)
if (a.data?.id) made.push(a.data.id)
const full = (await req(`/content/${a.data.id}`, 'GET', null, ST)).data
ok('…born an idea', full.status_id === idea?.id, String(full.status_id))
ok('…a reel on the one channel', full.type === 'reel' && JSON.stringify(full.channels) === JSON.stringify([CH]))
ok('…going out on the day picked', full.release_date === day(1), full.release_date)
ok('…with the faces picked for filming and cutting', full.operator_id === op.id && full.editor_id === ed.id,
  `${full.operator_id}/${full.editor_id}`)
ok('…the notes as its description, and their link as its reference',
  /Top five scores/.test(full.description || '') && (full.reference_links || []).includes('https://www.instagram.com/reel/builder1'))
ok('…the picture as its reference album', (full.reference_photos || []).length === 1 && !!full.photo)
ok('…and it is the SMM\'s own task', full.assignee_id === smm.id, String(full.assignee_id))

const bare = await req('/content', 'POST', shape({
  title: 'Builder: just a name and a kind', release_date: null, description: '', reference_links: [],
  reference_photos: [], photo: null, photo_thumb: null, operator_id: null, editor_id: null,
}), ST)
ok('a name and a kind are enough — "Create now" on the second step', bare.status === 201, `${bare.status} ${bare.data?.error || ''}`)
if (bare.data?.id) made.push(bare.data.id)

const file = await req(`/content/${a.data.id}/files`, 'POST', { name: 'brief.txt', data: 'data:text/plain;base64,aGVsbG8=' }, ST)
ok('a dropped file is hung on the task once it exists', file.status === 201 || file.status === 200, `${file.status} ${file.data?.error || ''}`)

const byAdmin = await req('/content', 'POST', shape({ title: 'Builder: given by an admin', assignee_ids: [smm.id] }))
ok('an admin\'s "Whose task is it?" face makes it that person\'s', byAdmin.status === 201 && byAdmin.data.assignee_id === smm.id,
  `${byAdmin.status} ${byAdmin.data?.assignee_id}`)
if (byAdmin.data?.id) made.push(byAdmin.data.id)

// ===================== where a refusal points =====================
const wrong = await req('/content', 'POST', shape({ title: 'Builder: wrong channel shooter', operator_id: far.id }), ST)
ok('somebody who does not work on the channel cannot be picked to film', wrong.status === 400, String(wrong.status))
ok('…and the refusal names the seat, so the builder goes back to "Who films it?"', wrong.data?.crew_field === 'operator_id',
  JSON.stringify(wrong.data).slice(0, 120))

const before = (await req('/fields')).data
const keep = {}
for (const k of ['format', 'rubrika', 'script', 'tz', 'reference', 'description']) if (before[k]) keep[k] = { state: before[k].state, types: before[k].types, ...(before[k].options ? { options: before[k].options } : {}) }
await req('/fields', 'POST', { ...keep, description: { state: 'required', types: ['reel'] } })
const noDesc = await req('/content', 'POST', shape({ title: 'Builder: no description', description: '', reference_links: [] }), ST)
ok('when an admin demands a description, an idea without one is refused', noDesc.status === 400, `${noDesc.status}`)
ok('…in words the builder can send them back to step four with', /Description/i.test(noDesc.data?.error || ''), noDesc.data?.error)
const withDesc = await req('/content', 'POST', shape({ title: 'Builder: with description' }), ST)
ok('…and one with a description goes through', withDesc.status === 201, `${withDesc.status} ${withDesc.data?.error || ''}`)
if (withDesc.data?.id) made.push(withDesc.data.id)
await req('/fields', 'POST', keep)
const after = (await req('/fields')).data
ok('(the admin\'s rules are put back as they were)', after.description?.state === before.description?.state, after.description?.state)

for (const id of made) await req(`/content/${id}`, 'DELETE')

// ===================== the page, from the source =====================
const src = (p) => readFileSync(join(ROOT, p), 'utf8')
const modal = src('client/src/components/ContentModal.jsx')
ok('every new task opens in the builder, whichever page asked for it',
  /export default function ContentModal\(props\)/.test(modal) && /!props\.item && !full/.test(modal) && /<TaskBuilder/.test(modal))
ok('…and "All fields" hands every answer to the full sheet', /startFull/.test(modal) && /defaults\.title/.test(modal) && /defaults\.operator_id/.test(modal))

const builder = src('client/src/components/builder/TaskBuilder.jsx')
// One door (23 Oct 2026): Where → Idea → Plan → Brief (round 18 folded When and Who into Plan), each its own
// component; the kinds are pills on the Idea step (StepType's KindPills).
// 12 Nov 2026: series shoots (10 Nov) made TaskBuilder import helpers beside StepPlan
// (`import StepPlan, { seriesN, seriesMins, seriesPlan } from './StepPlan.jsx'`); the step is
// still the file's default-export component, so named imports may ride along with the default one.
ok('four steps, each its own component',
  ['StepWhere', 'StepTitle', 'StepPlan', 'StepMore'].every((c) => new RegExp(`import ${c}(?:, \\{[^}]*\\})? from './${c}.jsx'`).test(builder)
    && new RegExp(`export default function ${c}\\(`).test(src(`client/src/components/builder/${c}.jsx`)))
    && /import \{ KindPills \} from '.\/StepType.jsx'/.test(src('client/src/components/builder/StepTitle.jsx')))
ok('Ctrl/⌘+Enter makes the task from any step', /e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\)/.test(builder))
ok('Create is offered before the last step', /tb-now/.test(builder))
ok('what was typed survives closing the window', /satashkent_builder_\$\{user\.id\}/.test(builder) && /writeJSON\(DRAFT/.test(builder))
ok('a refusal about a crew seat goes back to the step that holds that seat',
  /e\.data\?\.crew_field\) goTo\(SEAT_STEP\[e\.data\.crew_field\]\)/.test(builder)
    && /operator_id: 'plan', editor_id: 'plan', designer_id: 'plan'/.test(builder))
const title = src('client/src/components/builder/StepTitle.jsx')
ok('the name box is focused and Enter moves on', /ref\.current\?\.focus\(\)/.test(title) && /e\.key === 'Enter'/.test(title))
const type = src('client/src/components/builder/StepType.jsx')
ok('a kind is one press, and reels come first', /onClick=\{\(\) => onPick\(k\.key\)\}/.test(type) && /KINDS = \[\s*\{ key: 'reel'/.test(type))
// Each kind of channel and work has its own face in the form, read off what
// the team actually gives (the live board's last 120 days).
ok('the channel\'s usual kinds are the big tiles; the rest one small row under them',
  /social: \['reel', 'post', 'story'\]/.test(type) && /ads: \['reel', 'target', 'post'\]/.test(type) && /text: \['post'\]/.test(type)
    && /tx\('Something else'\)/.test(type))
// …when the page's channel may be used: a design given on a written channel
// asks where it goes instead (the check of the review, 14 Oct 2026).
ok('a Telegram channel opened from its page asks no kind — it is a post',
  /const givenOk = !!editTask \|\| \(!!defaults\.channels\?\.\[0\] && canUse\(defaults\.channels\[0\]\)\)/.test(builder)
    && /const skipKind = \(format === 'text' \|\| !!defaults\.design\) && givenOk/.test(builder)
    && /if \(byKey\[ch\]\?\.format === 'text'\) return 'post'/.test(builder))
ok('the header says what is being given, in that kind\'s colour, and so does the progress',
  /className="tb-head"/.test(builder) && /'--tb-accent': ACCENT\[d\.type\]/.test(builder)
    && /\.tb-dot\.on \.tb-dot-bar \{ background: var\(--tb-accent/.test(src('client/src/styles.css')))
ok('the main button names the step it goes to', /tx\('Next: \{step\}', \{ step: tx\(steps\[at \+ 1\]\.label\) \}\)/.test(builder))
ok('the last step asks what this kind of work needs', /What should they film\?/.test(builder) && /What should it look like\?/.test(builder)
  && /What goes in the post\?/.test(builder))
ok('the usual distances out are one press on the release step', /QUICK = \{ text: \[0, 1, 2\]/.test(builder)
  && /tb-quick/.test(src('client/src/components/builder/StepPlan.jsx')))
const when = src('client/src/components/builder/StepPlan.jsx')
ok('the day is pressed on a card of weeks, not typed into the browser\'s own picker',
  /<MiniCalendar /.test(when) && !/type="date"/.test(when))

const css = src('client/src/styles.css')
ok('the builder keeps one height from step to step', /\.modal-body\.tb-body \{ height:/.test(css))
ok('…and slides only for people who have not asked for less motion', /prefers-reduced-motion: reduce\) \{ \.tb-stage \{ animation: none/.test(css))
ok('the card\'s moves wait for the pointer on a desk and are simply there on touch',
  /@media \(hover: hover\) \{\s*\.tcard-acts/.test(css) && /@media \(hover: none\) \{\s*\.tcard-acts/.test(css))

const board = src('client/src/components/ContentBoard.jsx')
ok('a card shows its people as faces, once each', /tcard-people/.test(board) && /<Avatar/.test(board) && !/Operator — films it/.test(board))
ok('…and moves on with one press, through the same door a drop uses', /onMove\(item, nextOf\(item\)\.id\)/.test(board))
// 13 Oct 2026: the history is the task window's record (TaskMore) now.
// T-01 (decided): the builder is the one task form. Edit opens it in edit
// mode at the step pressed and saves the steps changed as one PATCH; on a desk
// the steps are a column with their answers; the sheet waits behind "All
// fields". Creating then editing never shows the browser's own date box.
{
  const win = src('client/src/components/CoachTask.jsx')
  const door = src('client/src/components/ContentModal.jsx')
  // Task 7 (12 Nov 2026): the window has no Edit button — every value changes in place, and "All fields" in "…"
  // opens the full sheet (or, where a door gives none, the builder in edit mode).
  ok('The builder in edit mode is still the door’s editIn, behind “All fields”',
    /editIn=\{\(t, out\) => \(\s*<TaskBuilder edit=\{t\} startAt=\{out\.step\}/.test(door) && /goOut\('full'\)/.test(win) && /setEditing\(edit \? 'sheet' : 'builder'\)/.test(win)
    && /if \(editTask && startAt\) goTo\(START\[startAt\] \|\| 'plan'\)/.test(builder) && /const askWhere = !editTask && !givenOk/.test(builder))
  ok('…loaded from the piece, never from a draft', /if \(editTask\) return null/.test(builder) && /if \(editTask \|\| !d\.title\.trim\(\)\) return/.test(builder))
  ok('…saving the steps changed as one PATCH of their fields', /const STEP_FIELDS = \{/.test(builder) && /api\.patch\(`\/content\/\$\{editTask\.id\}`, \{ \.\.\.stepBody\(k\)/.test(builder)
    && /touched\.current\.add\(stepKey\.current\)/.test(builder) && /tx\('Save'\)/.test(builder))
  ok('…the steps as a column with their answers on a desk, the dots on a phone', /className="tb-side"/.test(builder) && /answerOf\(s\.key\)/.test(builder)
    && /\.tb-side \{ display: none; \}/.test(src('client/src/styles.css')) && /\.tb-edit \.tb-progress \{ visibility: hidden; \}/.test(src('client/src/styles.css')))
  ok('the sheet waits behind All fields', /full: edit \? \(\) => setEditing\('sheet'\) : null/.test(win) && /onClick=\{editTask \? \(\) => onFull\?\.\(\) : openFull\}/.test(builder))
  ok('a clash met while saving a step settles that step', /setClash\(\{ \.\.\.e\.data, step: k \}\)/.test(builder) && /clash\?\.step \? saveStep\(clash\.step, true, true\)/.test(builder))
  // 31 Oct 2026: Save "did nothing" for a content maker — the server's refusal
  // ("That script is already on…") was painted over by the Brief step, which
  // was taller than its `minmax(0, 1fr)` row. The row grows with its step and
  // the message is pinned to the bottom edge of what is on screen.
  {
    const css = src('client/src/styles.css')
    const grid = /\.tb-edit \{[^}]*grid-template-rows: ([^;]+);/.exec(css)?.[1] || ''
    ok('a step taller than the sheet never covers the refusal under it: no fixed row in the edit grid', grid && !/1fr|minmax/.test(grid), grid)
    ok('…and the refusal stays on the bottom edge of what is on screen', /\.tb-edit > \.tb-err \{[^}]*position: sticky; bottom: 0;/.test(css))
    ok('…a refused save says so in the sheet, on the step it belongs to', /setErr\(e\.message\)/.test(builder) && /\{err && <div className="form-error tb-err" role="alert" ref=\{errBox\}>/.test(builder))
  }
  const forms = ['builder/TaskBuilder.jsx', 'builder/StepPlan.jsx', 'builder/StepMore.jsx', 'builder/StepTitle.jsx', 'TimeBand.jsx', 'DayPick.jsx', 'TaskPlan.jsx']
    .map((f) => src(`client/src/components/${f}`)).join('\n').replace(/^\s*\/\/.*$/gm, '')
  ok('creating then editing a task never shows a native date box', !/<input(?![^>]*aria-hidden="true")[^>]*type="date"/.test(forms))
}
// T-02 remainder: the brief's lines stand as skeletons until the field rules
// arrive, and the maker's colour is the brief's last, optional row.
const stepMore = src('client/src/components/builder/StepMore.jsx')
ok('the brief is never blank: skeletons until the rules say which lines it has', /loading=\{!rules\}/.test(builder) && /tb-skel/.test(stepMore) && /aria-busy=\{loading/.test(stepMore))
ok('the colour is the brief’s last row, written on the piece’s own colour route', /tb-colour/.test(stepMore) && /pc-swatch/.test(stepMore) && /api\.post\(`\/content\/\$\{created\.id\}\/color`/.test(builder))
const more = src('client/src/components/TaskMore.jsx')
ok('the history log is folded to one line until asked for', !/activity\.slice\(0, 3\)/.test(more) && /Show the \{n\} changes/.test(more))
// T-02's acceptance (G-01): a reel on Instagram in six presses or fewer from
// "New task" — the page says the channel (no Where step), the channel's usual
// kind is already chosen on Idea, the Plan step holds the day, who films and the
// hour, and "Save for now" stands on every step from Idea: name, Next, day,
// operator, hour, Save.
ok('a reel on Instagram is made in six presses or fewer: four steps at most, Where only when the page did not say, the kind pre-chosen',
  /const askWhere = !editTask && !givenOk && pickable\.length > 1/.test(builder)
  && /askWhere && \{ key: 'where'/.test(builder) && /\{ key: 'idea'/.test(builder) && /\{ key: 'plan'/.test(builder) && /\{ key: 'more'/.test(builder)
  && (builder.match(/\{ key: '(?:where|idea|plan|more)'/g) || []).length === 4
  && /const kindFor = \(ch\) =>/.test(builder) && /type: defaults\.design \? d\.type : kindFor\(k\)/.test(builder))

console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
