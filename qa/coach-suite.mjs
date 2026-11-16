// The Coach look: My Day for the crew and for content makers, the task window
// that slides in, and the maker's calendar.
//
// The look makes three promises a wrong reading would break in front of a new
// person on their first morning:
//
//   START HERE is the right task. The big card and the numbers under it are an
//   instruction — do this, then this. A card that names a cut whose footage
//   has not come in, or a list numbered in an order nobody would work in, is
//   worse than no guidance at all.
//
//   A PIECE SITS IN ONE GROUP. A maker's five groups are a priority order
//   (filming today, pravka, late, your move, ready to publish). A piece shown
//   twice is counted twice; a piece shown nowhere is lost.
//
//   THE BUTTON IS THE PERSON'S OWN STEP. What the window offers — hand in,
//   answer, accept, publish, or "not your step now" — is read off the same
//   stages the server reads, for the person looking.
//
// So the reading lives in one plain module (client/src/lib/coach.js), and this
// pins it on one worked day: Saturday 3 October 2026, one maker, an operator,
// an editor and a designer, thirteen pieces. The second half reads the pages
// from the source, the way crewday-suite does, for the promises a browser
// suite on CI does not exist to keep.
//
// Pure Node, no server and no data directory.
//
//   node qa/coach-suite.mjs
import { pathToFileURL } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.DASHB_ROOT || new URL('../', import.meta.url)
const ROOT = typeof DIR === 'string' ? pathToFileURL(DIR.replace(/[\\/]?$/, '/')) : DIR
const from = (p) => new URL(p, ROOT).href
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8')
const has = (p) => existsSync(new URL(p, ROOT))
const { pipelineOf, nextStepOf } = await import(from('client/src/lib/nextStep.js'))
const {
  crewEntries, crewDay, makerDay, actOf, dayEvents, wayOf, monthCells, weekCells, dayOf, fixUntil, seatAt,
} = await import(from('client/src/lib/coach.js'))

let fails = 0
const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘ FAIL'} ${n}${x ? ` — ${x}` : ''}`) }

// ===================== one worked day =====================
const TODAY = '2026-10-03'
const STAGES = [
  { id: 1, label: 'Idea', sort: 1 }, { id: 2, label: 'To shoot', sort: 2 }, { id: 3, label: 'Editing', sort: 3 },
  { id: 4, label: 'Ready', sort: 4 }, { id: 5, label: 'Published', sort: 5, is_final: 1 }, { id: 6, label: 'Deleted', sort: 6 },
]
const byId = Object.fromEntries(STAGES.map((s) => [s.id, s]))
const pipe = pipelineOf(STAGES)
const JAS = 2, EDI = 5, OPA = 6, DES = 7
const piece = (id, title, more) => ({ id, title, channels: ['instagram_main'], type: 'reel', assignee_id: JAS, assignees: [JAS], ...more })
const P = [
  // Filmed today, and the operator said yes.
  piece(1, 'Open day teaser', { status_id: 2, operator_id: OPA, editor_id: EDI, recording_date: TODAY, recording_time: '11:00', recording_end: '11:40', shoot_ack: 'yes', edit_ready_date: '2026-10-05', release_date: '2026-10-07' }),
  // Filmed today, and nobody has answered yet.
  piece(2, 'Games and challenges', { status_id: 2, operator_id: OPA, editor_id: EDI, recording_date: TODAY, recording_time: '14:00', release_date: '2026-10-06' }),
  // A cut a week late: the footage is in, the editor has it.
  piece(3, 'Why I said no to Yonsei', { type: 'video', status_id: 3, operator_id: OPA, editor_id: EDI, shot_at: '2026-09-25T06:00:00.000Z', shot_link: 'https://drive.google.com/a', recording_date: '2026-09-25', edit_ready_date: '2026-09-26', release_date: '2026-10-01' }),
  // A cut handed in this morning, waiting for the maker's answer.
  piece(4, 'Student story: Aziza', { status_id: 4, editor_id: EDI, shot_at: '2026-09-30T06:00:00.000Z', ready_link: 'https://drive.google.com/b', ready_at: '2026-10-03T04:40:00.000Z', edited_at: '2026-10-03T04:40:00.000Z', edit_ready_date: '2026-10-03', release_date: '2026-10-08' }),
  // Artwork sent back: round 2, the designer is fixing it.
  piece(5, 'Five mistakes in the SAT essay', { type: 'post', status_id: 3, designer_id: DES, design_link: 'https://drive.google.com/c', ready_at: '2026-10-01T06:00:00.000Z', open_round: 2, open_for: 'designer', design_ready_date: '2026-10-05', release_date: '2026-10-07' }),
  // An idea the designer cannot start: the maker's words are missing.
  piece(6, 'Scholarship checklist', { type: 'post', status_id: 1, designer_id: DES, release_date: '2026-10-09' }),
  // Accepted yesterday: it only needs posting.
  piece(7, 'Campus tour: Webster', { status_id: 4, editor_id: EDI, shot_at: '2026-09-29T06:00:00.000Z', ready_link: 'https://drive.google.com/d', ready_at: '2026-10-02T06:00:00.000Z', approved_at: '2026-10-02T09:00:00.000Z', release_date: TODAY }),
  // A shoot next week.
  piece(8, 'A day in the life', { status_id: 2, operator_id: OPA, editor_id: EDI, recording_date: '2026-10-06', recording_time: '15:00', shoot_ack: 'yes', release_date: '2026-10-12' }),
  // Out on Thursday.
  piece(9, 'Scholarship deadline', { type: 'post', status_id: 5, done_at: '2026-10-01T07:00:00.000Z', ready_at: '2026-09-30T07:00:00.000Z', release_date: '2026-10-01' }),
  // Somebody else films it today; the editor's cut is due today too.
  piece(10, 'Open day teaser, part two', { status_id: 2, operator_id: 99, editor_id: EDI, recording_date: TODAY, recording_time: '12:00', edit_ready_date: TODAY, edit_ack: 'yes', release_date: '2026-10-05' }),
  // Killed. It is nobody's work any more.
  piece(11, 'Killed after the shoot was booked', { status_id: 6, operator_id: OPA, editor_id: EDI, recording_date: TODAY, release_date: '2026-10-07' }),
  // A shoot five days late.
  piece(12, 'AP interview', { status_id: 2, operator_id: OPA, recording_date: '2026-09-28', recording_time: '10:00', shoot_ack: 'yes' }),
  // A cut due today, footage in.
  piece(13, 'SAT math trick', { status_id: 3, editor_id: EDI, shot_at: '2026-10-02T06:00:00.000Z', shot_link: 'https://drive.google.com/e', edit_ready_date: TODAY, edit_ack: 'yes', release_date: '2026-10-04' }),
]
const get = (id) => P.find((t) => t.id === id)
const ids = (rows) => rows.map((r) => r.t.id)

// ---- the crew: an operator's day ------------------------------------------------
// The bookings waiting on a yes or no are the page's (Brief.jsx works them out
// for both looks); here they are given.
const day = (userId, asks = [], fixes = []) => crewDay({ entries: crewEntries(P, userId, byId, pipe), today: TODAY, asks, fixes })
let d = day(OPA, [{ t: get(2), which: 'shoot' }])
ok('an operator’s list: the late shoot, today’s two, then next week’s', ids(d.rows).join() === '12,2,1,8', ids(d.rows).join())
ok('…in bands: late, today, coming up', d.rows.map((r) => r.band).join() === 'late,today,today,soon', d.rows.map((r) => r.band).join())
ok('the oldest late task is Start here, and number 1', d.first?.t.id === 12 && d.first.n === 1 && d.first.late === 5, JSON.stringify({ id: d.first?.t.id, n: d.first?.n, late: d.first?.late }))
ok('an answer somebody is waiting for comes before the day’s own work', d.rows[1].state === 'ask' && d.rows[1].n === 2 && d.rows[2].state === 'go' && d.rows[2].n === 3)
ok('a shoot that is days away is listed, and not numbered — it cannot be done yet', d.rows[3].state === 'wait' && d.rows[3].n === null)
ok('a killed piece is on nobody’s list', !ids(d.rows).includes(11))
ok('a shoot filmed last week is not “done today”', !ids(d.rows).includes(3))
ok('the three numbers on the bar are the three bands', d.counts.late === 1 && d.counts.today === 2 && d.counts.done === 0 && d.total === 3, JSON.stringify(d.counts))

// ---- the crew: an editor's day ---------------------------------------------------
d = day(EDI)
ok('an editor’s list: the late cut, today’s cut, then the one waiting for footage', ids(d.rows).slice(0, 3).join() === '3,13,10', ids(d.rows).join())
ok('a cut whose footage is not in is in Today, says it is waiting, and has no number',
  d.rows[2].band === 'today' && d.rows[2].state === 'blocked' && d.rows[2].n === null)
ok('Start here is never a task that cannot be started', d.first?.t.id === 3 && d.rows.filter((r) => r.n).every((r) => ['go', 'ask', 'fix'].includes(r.state)))
ok('the numbers run 1, 2, 3… down the page with no gaps', d.rows.filter((r) => r.n).map((r) => r.n).join() === '1,2', d.rows.map((r) => r.n).join())
ok('a cut handed in this morning is under Done today', d.rows.some((r) => r.t.id === 4 && r.band === 'done') && d.counts.done === 1)
ok('…and one handed in yesterday is not', !d.rows.some((r) => r.t.id === 7))
ok('progress is done out of what the day held: late, today and done', d.total === 4 && d.counts.done === 1, `${d.counts.done} of ${d.total}`)

// ---- the crew: changes sent back ---------------------------------------------------
// The artwork was handed in on Thursday, so by its stamps the job is done; the
// open round is what puts it back on the designer's desk.
const round = { id: 31, content_id: 5, round: 2, target: 'designer', title: get(5).title, channels: get(5).channels, note: 'Slide 3: the title is too small.' }
d = day(DES, [], [round])
ok('a change sent back is on the designer’s list again, under Today', d.rows[0].t.id === 5 && d.rows[0].state === 'fix' && d.rows[0].band === 'today')
ok('…as Start here: somebody is waiting for it', d.first?.t.id === 5)
ok('…with the piece’s own facts, not a stub', d.rows[0].t.design_ready_date === '2026-10-05')
// "Scholarship checklist" is still at Idea: the maker has not written the
// words or pressed "Send to the designer" — on the maker's page it is "Your
// move". The first draft numbered it 2 on the designer's list, and with no
// round open it would have been Start here. A job on an idea is not given.
ok('artwork on a piece still at Idea is listed, not numbered: it is not sent to the designer yet',
  d.rows[1]?.t.id === 6 && d.rows[1].state === 'early' && d.rows[1].n === null, JSON.stringify({ id: d.rows[1]?.t.id, state: d.rows[1]?.state, n: d.rows[1]?.n }))
d = day(DES)
ok('…and with nothing else on the desk it is still not Start here', d.rows.length === 1 && d.rows[0].state === 'early' && d.first === null)
{
  const IDEAS = [
    piece(40, 'Idea with a shoot today', { status_id: 1, operator_id: OPA, recording_date: TODAY, recording_time: '09:00', shoot_ack: 'yes' }),
    piece(41, 'Idea with a late design day', { type: 'post', status_id: 1, designer_id: DES, design_ready_date: '2026-09-30' }),
    piece(42, 'Idea with a question', { status_id: 1, operator_id: OPA, recording_date: '2026-10-05' }),
    piece(43, 'Sent to the designer', { type: 'post', status_id: 3, designer_id: DES, design_ready_date: '2026-10-06' }),
    piece(45, 'Idea with a shoot today, said no', { status_id: 1, operator_id: OPA, recording_date: TODAY, recording_time: '16:00', shoot_ack: 'no' }),
  ]
  const on = (uid, asks = []) => crewDay({ entries: crewEntries(IDEAS, uid, byId, pipe), today: TODAY, asks })
  let e = on(OPA, [{ t: IDEAS[2], which: 'shoot' }])
  // The operator said yes, but the maker never pressed "Send": it is not his
  // task yet (the owner's call) — listed with a clock, never numbered.
  ok('a shoot today the operator said YES to is still not a task to do while the piece is at Idea',
    e.rows.find((r) => r.t.id === 40).state === 'early' && e.rows.find((r) => r.t.id === 40).n === null, JSON.stringify(e.rows.map((r) => [r.t.id, r.state, r.n])))
  ok('…and its window says “not sent to you yet”, not the hand-in',
    actOf(IDEAS[0], { userId: OPA, pipe, step: null, today: TODAY }).kind === 'early')
  // A NO is the maker's step, at any stage. The operator answered; until the
  // maker moves the day or names somebody else there is nothing for him to
  // start — least of all at the hour he said he cannot come. (It used to stay
  // a numbered shoot with "Shoot is done" awake once the piece had been sent
  // to the shoot, while the maker's page said "Otabek can’t come".)
  ok('a shoot the operator said NO to is not a task to start — on a piece still at Idea',
    e.rows.find((r) => r.t.id === 45).state === 'declined' && e.rows.find((r) => r.t.id === 45).n === null
    && actOf(IDEAS[4], { userId: OPA, pipe, step: null, today: TODAY }).kind === 'declined')
  {
    const yes = piece(46, 'Sent to the shoot, said yes', { status_id: 2, operator_id: OPA, recording_date: TODAY, recording_time: '12:00', shoot_ack: 'yes' })
    const no = piece(47, 'Sent to the shoot, said no', { status_id: 2, operator_id: OPA, recording_date: TODAY, recording_time: '15:00', shoot_ack: 'no', shoot_ack_note: 'at the dentist' })
    const d = crewDay({ entries: crewEntries([yes, no], OPA, byId, pipe), today: TODAY })
    const row = d.rows.find((r) => r.t.id === 47)
    ok('…nor on a piece already sent to the shoot: no number, never “Start here”, and the window offers no hand-in',
      row.state === 'declined' && row.n === null && d.first.t.id === 46 && d.rows.find((r) => r.t.id === 46).n === 1
      && actOf(no, { userId: OPA, pipe, step: null, today: TODAY }).kind === 'declined', JSON.stringify(d.rows.map((r) => [r.t.id, r.state, r.n])))
    const alone = crewDay({ entries: crewEntries([no], OPA, byId, pipe), today: TODAY })
    ok('…and alone on the list it is not the big card', alone.first === null)
    const mm = makerDay({ pieces: [no], today: TODAY, userId: JAS, pipe, stepOf: (t) => nextStepOf(t, pipe, { written: false, filmed: true, designed: false }, { move: true, publish: true }), canReviewOf: () => true })
    ok('…and the maker’s page says the same of it: he can’t come', mm.rows[0].state === 'cant', mm.rows[0].state)
    const cut = piece(48, 'A cut the editor said no to', { status_id: 3, editor_id: EDI, shot_link: 'https://x', edit_ready_date: '2026-10-05', edit_ack: 'no' })
    ok('…and a cut the editor said no to reads the same way', crewDay({ entries: crewEntries([cut], EDI, byId, pipe), today: TODAY }).rows[0].state === 'declined'
      && actOf(cut, { userId: EDI, pipe, step: null, today: TODAY }).kind === 'declined')
  }
  {
    const PLAIN = { written: false, filmed: false, designed: false }
    const story = piece(50, 'A story an editor cuts', { type: 'story', status_id: 3, editor_id: EDI })
    const a = actOf(story, { userId: JAS, pipe, step: nextStepOf(story, pipe, PLAIN, { move: true, publish: true }), today: TODAY })
    ok('a piece that is not filmed and has an editor is waited for from the editor, by name', a.kind === 'waiting' && a.wait === 'cut' && a.holder === EDI, JSON.stringify(a))
  }
  // The seat a move must fill: the stop it lands on, and only that one.
  {
    const FILM = { written: false, filmed: true, designed: false }, DRAW = { written: false, filmed: false, designed: true }
    const PLAIN = { written: false, filmed: false, designed: false }, TEXT = { written: true, filmed: false, designed: false }
    const idea = (more) => piece(49, 'An idea', { status_id: 1, ...more })
    ok('a move must name whoever holds the stage it lands on: the operator for the shoot',
      seatAt(idea({}), pipe, FILM, STAGES[1]) === 'operator_id' && seatAt(idea({ operator_id: OPA }), pipe, FILM, STAGES[1]) === null)
    ok('…the editor for a piece that starts in Editing with nobody to make it',
      seatAt(idea({ type: 'story' }), pipe, PLAIN, STAGES[2]) === 'editor_id' && seatAt(idea({ type: 'story', editor_id: EDI }), pipe, PLAIN, STAGES[2]) === null)
    ok('…the designer for a poster — and never its shoot, which it only passes',
      seatAt(idea({ type: 'post' }), pipe, DRAW, STAGES[2]) === 'designer_id' && seatAt(idea({ type: 'post', designer_id: DES }), pipe, DRAW, STAGES[2]) === null)
    ok('…and nobody for a written piece, the check or the way out: those are its owner’s',
      seatAt(idea({}), pipe, TEXT, STAGES[2]) === null && seatAt(idea({}), pipe, FILM, STAGES[3]) === null && seatAt(idea({}), pipe, FILM, STAGES[4]) === null)
  }
  {
    const mm = makerDay({ pieces: [IDEAS[0]], today: TODAY, userId: JAS, pipe, stepOf: (t) => nextStepOf(t, pipe, { written: false, filmed: true, designed: false }, { move: true, publish: true }), canReviewOf: () => true })
    ok('…and the maker’s page says the same: not sent to the shoot yet, and the piece is theirs to send',
      mm.rows[0].group === 'film' && mm.rows[0].state === 'unsent' && mm.rows[0].actionable, JSON.stringify([mm.rows[0].group, mm.rows[0].state, mm.rows[0].actionable]))
  }
  ok('…but a booking question on an idea is still answered: somebody is waiting', e.rows.find((r) => r.t.id === 42).state === 'ask' && e.first?.t.id === 42)
  e = on(DES)
  ok('late artwork never sent on is listed under Overdue with no number; the piece that WAS sent is Start here',
    e.rows[0].t.id === 41 && e.rows[0].band === 'late' && e.rows[0].n === null && e.first?.t.id === 43 && e.first.n === 1, JSON.stringify(e.rows.map((r) => [r.t.id, r.state, r.n])))
  ok('no numbered task is ever one that is not given, blocked or still ahead',
    [on(OPA), on(DES), day(OPA), day(EDI), day(DES)].every((x) => x.rows.filter((r) => r.n).every((r) => ['go', 'ask', 'fix'].includes(r.state))))
  ok('without the board’s stages (the previous look) the reading is as it was', crewDay({ entries: crewEntries(IDEAS, DES, byId), today: TODAY }).first?.t.id === 41)
}
{
  // The ordinary pravka: a cut due 30 Sep, handed in on time, changes asked
  // on 3 Oct (the server puts the piece back in Editing). Its own day is behind it by then — and that is nobody's lateness.
  const cut = (release) => piece(50, 'Cut sent back', { status_id: 3, editor_id: EDI, shot_at: '2026-09-28T06:00:00.000Z', ready_link: 'https://drive.google.com/f',
    ready_at: '2026-09-30T06:00:00.000Z', edited_at: '2026-09-30T06:00:00.000Z', edit_ready_date: '2026-09-30', release_date: release, open_round: 1, open_for: 'editor' })
  const fx = { id: 40, content_id: 50, round: 1, target: 'editor', title: 'Cut sent back', channels: ['instagram_main'] }
  const crew = (t) => crewDay({ entries: crewEntries([t], EDI, byId, pipe), today: TODAY, fixes: [fx] })
  const maker = (t) => makerDay({ pieces: [t], today: TODAY, userId: JAS, pipe, stepOf: (x) => nextStepOf(x, pipe, { written: false, filmed: true, designed: false }, { move: true, publish: true }), roundsOf: () => 1, canReviewOf: () => true }).rows[0]
  let c = crew(cut('2026-10-07'))
  ok('a change sent back after an on-time delivery is for today, not “3 days late”',
    c.rows[0].state === 'fix' && c.rows[0].band === 'today' && c.rows[0].late === 0 && c.counts.late === 0 && c.first?.t.id === 50, JSON.stringify([c.rows[0].band, c.rows[0].late, c.counts]))
  ok('…its day is the next one the piece is promised for — never a day already gone', c.rows[0].due === '2026-10-07' && fixUntil(cut('2026-10-07'), 'editor', TODAY) === '2026-10-07')
  let r = maker(cut('2026-10-07'))
  ok('…and the maker’s “Being fixed” row names the same day, with the round', r.group === 'fix' && r.until === '2026-10-07' && r.late === 0 && r.act.round === 1, JSON.stringify([r.group, r.until, r.late]))
  c = crew(cut('2026-10-01'))
  r = maker(cut('2026-10-01'))
  ok('with no promised day left there is no “until”: the crew’s row has no day, the maker’s is late by the release day — and keeps its round',
    c.rows[0].due === null && c.rows[0].late === 0 && r.group === 'fix' && r.until === null && r.late === 2 && r.act.round === 1, JSON.stringify([c.rows[0].due, r.until, r.late]))
  ok('a seat’s own day that is still ahead is the “until”', fixUntil(get(5), 'designer', TODAY) === '2026-10-05' && fixUntil({}, 'editor', TODAY) === null)
}
{
  // What is late and cannot be started. The bar counts it as overdue, so the
  // big card may not say "nothing is late".
  const LATE = [
    piece(60, 'Late, no footage', { status_id: 2, operator_id: 99, editor_id: EDI, recording_date: '2026-09-30', edit_ready_date: '2026-10-01', edit_ack: 'yes' }),
    piece(61, 'Today cut', { status_id: 3, editor_id: EDI, shot_at: '2026-10-02T06:00:00.000Z', shot_link: 'https://drive.google.com/g', edit_ready_date: TODAY, edit_ack: 'yes' }),
    piece(62, 'Late idea', { type: 'post', status_id: 1, designer_id: DES, design_ready_date: '2026-09-30' }),
    piece(63, 'Artwork for today', { type: 'post', status_id: 3, designer_id: DES, design_ready_date: TODAY }),
  ]
  const on = (uid) => crewDay({ entries: crewEntries(LATE, uid, byId, pipe), today: TODAY })
  let h = on(EDI)
  ok('a late cut with no footage is counted overdue, has no number — and the day says what is held, and why',
    h.counts.late === 1 && h.rows[0].n === null && h.first?.t.id === 61 && h.held?.n === 1 && h.held.why === 'blocked', JSON.stringify([h.counts, h.held]))
  h = on(DES)
  ok('…the same for late work never sent on', h.first?.t.id === 63 && h.held?.n === 1 && h.held.why === 'early', JSON.stringify(h.held))
  ok('…and nothing is “held” on a day whose late work can be started', day(OPA, [{ t: get(2), which: 'shoot' }]).held === null && day(EDI).held === null)
}
{
  // A piece put back on the making stage. The server stamps ready_at the first
  // time a piece reaches Ready and keeps it for good — it is the clock of the
  // first delivery. Read as "handed in", that stamp took a card dragged back to
  // Editing (or re-shot, or given a new editor) off its editor's day for good:
  // the owner's "Mr Asadbek 1", 13 October 2026 — on Editing, an editor named,
  // on no list of his, and "not done yet".
  const FILM = { written: false, filmed: true, designed: false }
  const win = (t, uid) => actOf(t, { userId: uid, pipe, step: nextStepOf(t, pipe, FILM, { move: false, publish: false }), today: TODAY }).kind
  const crew = (t, uid) => crewDay({ entries: crewEntries([t], uid, byId, pipe), today: TODAY })
  const back = piece(70, 'Back on Editing', { status_id: 3, operator_id: OPA, editor_id: EDI, ready_at: '2026-10-01T06:00:00.000Z', edited_at: '2026-10-01T06:00:00.000Z', release_date: '2026-10-07' })
  const b = crew(back, EDI)
  ok('a piece put back on Editing is its editor’s to do again, whatever stamp an earlier move to Ready left',
    b.rows.length === 1 && b.rows[0].state === 'go' && b.rows[0].band === 'soon' && b.first?.t.id === 70 && win(back, EDI) === 'handin',
    `${JSON.stringify(b.rows.map((r) => [r.band, r.state]))} window=${win(back, EDI)}`)
  ok('…in the previous look too, which reads without the board’s stages', crewDay({ entries: crewEntries([back], EDI, byId), today: TODAY }).rows[0]?.state === 'go')
  ok('…and the same for artwork', crew(piece(71, 'Post back on Editing', { type: 'post', status_id: 3, designer_id: DES, ready_at: '2026-10-01T06:00:00.000Z', release_date: '2026-10-07' }), DES).rows[0]?.state === 'go')
  // What stays as it was.
  const theirs = { ...back, id: 72, designer_id: DES, open_round: 1, open_for: 'designer' }
  ok('a change asked of the designer does not reopen the editor’s cut', crew(theirs, EDI).rows.length === 0 && win(theirs, EDI) !== 'handin', win(theirs, EDI))
  ok('a cut handed in and standing on Ready is still off the list', crew({ ...back, id: 73, status_id: 4 }, EDI).rows.length === 0 && win({ ...back, id: 73, status_id: 4 }, EDI) === 'waiting')
  ok('a finished piece is finished on any stage', crew({ ...back, id: 74, done_at: '2026-10-02T06:00:00.000Z' }, EDI).rows.length === 0)
  // The review of that fix, the same day.
  const reel = { ...back, id: 75, designer_id: DES, ready_link: 'https://drive.google.com/cut', design_link: 'https://drive.google.com/art' }
  ok('on a reel put back only the edit is open again — a designer who was asked nothing keeps their hand-in',
    crew(reel, EDI).rows[0]?.state === 'go' && crew(reel, DES).rows.length === 0 && win(reel, DES) === 'waiting',
    `${JSON.stringify(crew(reel, DES).rows.map((r) => r.state))} window=${win(reel, DES)}`)
  const met = { ...back, id: 76, edit_ready_date: '2026-09-28' }   // its edit day was met, days ago
  const o = crew(met, EDI).rows[0]
  ok('a piece put back is not late by the day of the delivery it already met — its day is the next one still promised',
    o?.band === 'soon' && o.late === 0 && o.due === '2026-10-07', JSON.stringify([o?.band, o?.late, o?.due]))
  const none = crew({ ...met, id: 77, release_date: '2026-10-01' }, EDI).rows[0]
  ok('…and with no day still ahead it is for today, not “days late”', none?.band === 'today' && none.due === TODAY && none.late === 0 && none.state === 'go', JSON.stringify([none?.band, none?.due, none?.late, none?.state]))
  const two = crewDay({ entries: crewEntries([piece(78, 'Aardvark edit', { status_id: 3, editor_id: EDI, shot_link: 'https://drive.google.com/a', release_date: '2026-10-05' }), back], EDI, byId, pipe), today: TODAY })
  ok('…and it comes first in its band, as a change sent back does', ids(two.rows).join() === '70,78', ids(two.rows).join())
  // The stage half of the reading: only the making stage, by any of its names.
  ok('a card dragged back to To shoot is its maker’s to send on, not the editor’s to start', crew({ ...back, id: 79, status_id: 2 }, EDI).rows.length === 0)
  const BOARD = [{ id: 1, label: 'Idea', sort: 1 }, { id: 2, label: 'Syomka', sort: 2 }, { id: 3, label: 'Montajda', sort: 3 },
    { id: 4, label: 'Ready', sort: 4 }, { id: 7, label: 'Scheduled', sort: 5 }, { id: 5, label: 'Published', sort: 6, is_final: 1 }]
  const crew2 = (t) => crewDay({ entries: crewEntries([t], EDI, Object.fromEntries(BOARD.map((s) => [s.id, s])), pipelineOf(BOARD)), today: TODAY })
  ok('a making stage named in Uzbek reopens it too', crew2({ ...back, id: 80 }).rows[0]?.state === 'go')
  ok('a cut handed in and standing on a later stage of the admin’s own is still handed in', crew2({ ...back, id: 81, status_id: 7 }).rows.length === 0)
}
d = crewDay({ entries: [], today: TODAY, fixes: [{ id: 32, content_id: 77, round: 1, target: 'editor', title: 'Gone from the list', channels: ['youtube'] }] })
ok('a change on a piece that is not in the list at all still gets a row', d.rows.length === 1 && d.rows[0].t.title === 'Gone from the list' && d.rows[0].kind === 'edit')
d = day(404)
ok('somebody with no work has an empty day, not a crash', d.rows.length === 0 && d.first === null && d.total === 0)

// ---- the maker: five groups, one piece in each -------------------------------------
const making = (t) => ({ written: false, filmed: ['reel', 'video'].includes(t.type), designed: t.type === 'post' })
const ALL = { move: true, publish: true }
const stepOf = (t) => nextStepOf(t, pipe, making(t), ALL)
const mk = (over = {}) => makerDay({ pieces: P, today: TODAY, userId: JAS, pipe, stepOf, roundsOf: () => 0, maxRounds: 2, canReviewOf: () => true, ...over })
let m = mk()
const inGroup = (g) => m.rows.filter((r) => r.group === g).map((r) => r.t.id).join()
ok('Filming today: by the clock', inGroup('film') === '1,10,2', inGroup('film'))
ok('…with the operator’s answer on each', m.rows.filter((r) => r.group === 'film').map((r) => r.state).join() === 'coming,noanswer,noanswer')
ok('Pravka · Check it: the cut that came in', inGroup('check') === '4', inGroup('check'))
ok('Pravka · Being fixed: the artwork sent back, with who has it and which round',
  inGroup('fix') === '5' && m.rows.find((r) => r.t.id === 5).holder === DES && m.rows.find((r) => r.t.id === 5).act.round === 2)
ok('Late: oldest first', inGroup('late') === '3,12', inGroup('late'))
ok('…each with the days it is late and who has it',
  m.rows.find((r) => r.t.id === 3).late === 7 && m.rows.find((r) => r.t.id === 3).holder === EDI
  && m.rows.find((r) => r.t.id === 12).late === 5 && m.rows.find((r) => r.t.id === 12).holder === OPA)
ok('Your move: the idea that needs the maker’s words', inGroup('move') === '6', inGroup('move'))
ok('Ready to publish: the accepted cut', inGroup('ready') === '7', inGroup('ready'))
ok('on time and in somebody else’s hands is in none of the five', inGroup('plan') === '13,8', inGroup('plan'))
ok('what went out is counted, not listed', inGroup('out') === '9' && m.month.out === 1, JSON.stringify(m.month))
ok('the month’s bar counts pieces with a day in this month', m.month.total === 11, String(m.month.total))
ok('a killed piece is in no group', !m.rows.some((r) => r.t.id === 11))
ok('every piece is in exactly one group', m.rows.length === new Set(ids(m.rows)).size && m.rows.length === P.length - 1)
ok('the groups come in the owner’s order',
  [...new Set(m.rows.map((r) => r.group))].join() === 'film,check,fix,late,move,ready,plan,out', [...new Set(m.rows.map((r) => r.group))].join())
ok('Start here is the first piece the maker can act on: the cut to check', m.first?.t.id === 4)
ok('…never one that is in somebody else’s hands', m.rows.filter((r) => r.actionable).map((r) => r.t.id).join() === '4,6,7', m.rows.filter((r) => r.actionable).map((r) => r.t.id).join())

// The third delivery is approved as it stands (Pravka 2.0): it is not asked about again.
m = mk({ roundsOf: (t) => (t.id === 4 ? 2 : 0) })
ok('after the last round a delivered cut is Ready to publish, not “Check it”', inGroup('check') === '' && inGroup('ready') === '7,4', `${inGroup('check')} | ${inGroup('ready')}`)
// Somebody who may not review is not asked to.
m = mk({ canReviewOf: () => false })
ok('a cut is only “Check it” for whoever may accept it', inGroup('check') === '')
// A shoot day on an idea: planned, and not sent.
m = mk({ pieces: [piece(20, 'Pencilled in', { status_id: 1, operator_id: OPA, recording_date: TODAY, recording_time: '09:00' })] })
ok('a shoot planned for today on a piece still at Idea is under Filming today, and is the maker’s to send',
  m.rows[0].group === 'film' && m.rows[0].state === 'unsent' && m.rows[0].actionable && m.first?.t.id === 20)
// A piece late AND the maker's own step: under Late, with their button.
m = mk({ pieces: [piece(21, 'Late and ready', { status_id: 4, ready_link: 'x', approved_at: 'y', ready_at: '2026-09-28T06:00:00.000Z', release_date: '2026-09-30' })] })
ok('a piece past its day that waits on the maker is under Late — and is Start here', m.rows[0].group === 'late' && m.rows[0].actionable && m.rows[0].act.kind === 'publish' && m.first?.t.id === 21)
// A change asked on a written post: nobody holds a seat, so the fix is the maker's own.
m = mk({ pieces: [piece(22, 'Rewrite the first line', { type: 'post', status_id: 3, open_round: 1, open_for: 'editor', release_date: '2026-10-09' })] })
ok('a change nobody else holds is the maker’s own move', m.rows[0].group === 'move' && m.rows[0].act.kind === 'ownfix')
// A2 (the My Day ТЗ, 12 Nov 2026): Overdue opened with three "Remind" rows
// about other people's steps; her own late Publish was row 6 of 7. The late
// group is a stable partition — her steps first, then the rest, each part
// oldest first. The groups' order, and Start here, do not move.
{
  const own = (id, title, release) => piece(id, title, { status_id: 4, ready_link: 'x', approved_at: 'y', ready_at: '2026-09-27T06:00:00.000Z', release_date: release })
  const LATE2 = [...P, own(23, 'Late and ready, the newer', '2026-09-30'), own(24, 'Late and ready, the older', '2026-09-29')]
  m = mk({ pieces: LATE2 })
  ok('A2: Overdue puts the maker’s own steps first — oldest first among them — then the rest, oldest first',
    inGroup('late') === '24,23,3,12', inGroup('late'))
  ok('A2: …the rows she can press are exactly the first part', m.rows.filter((r) => r.group === 'late').map((r) => r.actionable).join() === 'true,true,false,false')
  ok('A2: …the groups keep the owner’s order, and Start here is still the cut to check',
    [...new Set(m.rows.map((r) => r.group))].join() === 'film,check,fix,late,move,ready,plan,out' && m.first?.t.id === 4, `${[...new Set(m.rows.map((r) => r.group))].join()} first=${m.first?.t.id}`)
  m = mk({ pieces: LATE2.filter((t) => [3, 12, 23, 24].includes(t.id)) })
  ok('A2: …and with only late pieces, Start here is her oldest own step, as before', m.first?.t.id === 24 && inGroup('late') === '24,23,3,12', `${m.first?.t.id} ${inGroup('late')}`)
  m = mk()
  ok('A2: …a late group with none of her steps keeps its order', inGroup('late') === '3,12', inGroup('late'))
  m = mk({ pieces: [get(1), piece(25, 'Pencilled in, later', { status_id: 1, operator_id: OPA, recording_date: TODAY, recording_time: '13:00' })] })
  ok('A2: …and only inside Overdue: Filming today stays by the hour, her unsent 13:00 after the 11:00 she waits on',
    inGroup('film') === '1,25' && m.rows.map((r) => r.actionable).join() === 'false,true', inGroup('film'))
}

// ---- the admin: one worked team day ------------------------------------------------
// GET /content/day/team as the server sends it (server/routes/content.js,
// /day/team): `overdue` and `dueToday` one item per step (shoot, design,
// release — the edit only in `editAsap`, with no phase, days_late 0 = today,
// −1 = tomorrow), `timeline` for the chosen day. The admin's three readings
// (the My Day ТЗ, §2.1.2) are pinned on it.
{
  const { LATE_PHASE, teamOverdue, atRisk, adminFirst, addDays } = await import(from('client/src/lib/coach.js'))
  const server = src('server/routes/content.js')
  const block = (server.match(/const LATE_PHASE = \{([\s\S]*?)\n\}/) || [])[1] || ''
  const keys = [...block.matchAll(/^\s*(\w+):\s*\{/gm)].map((x) => x[1])
  ok('LATE_PHASE mirrors the server’s order of a piece’s steps, key for key', keys.length === 4 && keys.join() === LATE_PHASE.join(), `server ${keys.join()} · coach ${LATE_PHASE.join()}`)
  ok('…and the server still lists the edit only in editAsap, and the archive still measures a piece by its release day, “more than” the setting',
    /if \(phase === 'edit'\) continue/.test(server) && /editAsap\.push\(/.test(server)
    && /const day = String\(r\.release_date \|\| r\.recording_date/.test(server) && /rows\.filter\(\(r\) => r\.late > s\.archive_days/.test(server))

  const step = (content_id, title, phase, due, owners, more = {}) => ({ content_id, title, type: 'reel', channels: ['instagram_main'], phase, what: phase, due, owners, time: null, ...more })
  const late = (content_id, title, phase, days, owners, more = {}) => step(content_id, title, phase, addDays(TODAY, -days), owners, { days_late: days, ...more })
  const edit = (content_id, title, days, owners) => ({ content_id, title, type: 'reel', channels: ['instagram_main'], due: addDays(TODAY, -days), owners, days_late: days })
  const TEAM = {
    today: TODAY, day: TODAY,
    overdue: [
      late(201, 'Old open day', 'shoot', 30, [OPA], { time: '10:00' }), late(201, 'Old open day', 'release', 26, [JAS]),
      late(203, 'AP interview, again', 'shoot', 5, [OPA]), late(203, 'AP interview, again', 'release', 2, [JAS]),
      late(204, 'Banner for the fair', 'design', 4, [DES]),
      late(205, 'Asked to move', 'release', 3, [JAS]),
      late(206, 'Nobody films it', 'shoot', 2, []),
      late(202, 'Fourteen days', 'release', 14, [JAS]),
    ].sort((a, b) => b.days_late - a.days_late),
    dueToday: [
      step(213, 'Shoot with nobody', 'shoot', TODAY, [], { time: '10:00' }),
      step(209, 'Goes out at noon', 'release', TODAY, [JAS], { time: '12:00' }),
      step(207, 'Not filmed yet', 'shoot', TODAY, [OPA], { time: '15:00' }),
      step(207, 'Not filmed yet', 'release', TODAY, [JAS], { time: '18:00' }),
      step(208, 'Edit not in', 'release', TODAY, [JAS], { time: '20:00' }),
      step(210, 'Artwork due today', 'design', TODAY, [DES]),
    ],
    editAsap: [edit(202, 'Fourteen days', 15, [EDI]), edit(208, 'Edit not in', 1, [EDI]), edit(211, 'An edit due today', 0, [EDI]), edit(212, 'An edit due tomorrow', -1, [EDI])],
    seatless: [],
    timeline: [
      { id: OPA, name: 'Otabek', items: [{ kind: 'shoot', content_id: 207, title: 'Not filmed yet', from: '15:00', operator_id: OPA, owners: [JAS], done: false }] },
      { id: JAS, name: 'Jasmina', items: [
        { kind: 'shoot', content_id: 214, title: 'Filmed this morning', from: '09:00', operator_id: null, owners: [JAS], done: true },
        { kind: 'shoot', content_id: 213, title: 'Shoot with nobody', from: '10:00', operator_id: null, owners: [JAS], done: false },
      ] },
      { id: 4, name: 'Malika', items: [{ kind: 'shoot', content_id: 213, title: 'Shoot with nobody', from: '10:00', operator_id: null, owners: [JAS], done: false }] },
    ],
  }
  const ASKS = [{ id: 9, content_id: 205, field: 'release_date', from_date: addDays(TODAY, -3), to_date: addDays(TODAY, 4), reason: 'The footage came in late', asked_name: 'Jasmina Karimova', title: 'Asked to move' }]
  const frozen = JSON.stringify(TEAM)
  const row = (o, id) => o.rows.find((r) => r.content_id === id)

  // ---- teamOverdue ----
  let o = teamOverdue(TEAM, { archiveDays: 14, asks: ASKS })
  ok('Overdue is one row per piece, the most late first — the archive’s pieces are not rows',
    o.rows.map((r) => r.content_id).join() === '202,203,204,205,206,208' && new Set(o.rows.map((r) => r.content_id)).size === o.rows.length, o.rows.map((r) => `${r.content_id}:${r.days_late}`).join())
  ok('…a piece whose release is more than archiveDays late is counted, not drawn: archived 1, and the heading’s one number is 7 pieces',
    o.archived === 1 && o.archivedIds.join() === '201' && o.total === 7, JSON.stringify([o.archived, o.archivedIds, o.total]))
  ok('…exactly archiveDays late is not taken (the server takes “more than”), even with an edit a day older',
    !!row(o, 202) && row(o, 202).phase === 'edit' && row(o, 202).days_late === 15)
  ok('…the row is the EARLIEST late step — the one that can move — and its holder; the later ones wait on it',
    row(o, 203).phase === 'shoot' && row(o, 203).holder === OPA && row(o, 203).then.length === 1 && row(o, 203).then[0].phase === 'release' && row(o, 203).then[0].owners.join() === String(JAS)
    && row(o, 202).holder === EDI && row(o, 202).then.map((t) => `${t.phase}:${t.days_late}`).join() === 'release:14', JSON.stringify(row(o, 203)))
  ok('…so “Remind” never goes to somebody downstream who cannot start', o.rows.every((r) => r.holder === (r.owners[0] || null)) && row(o, 203).holder !== JAS)
  ok('…a late edit is read from editAsap as the step “edit”', row(o, 208).phase === 'edit' && row(o, 208).days_late === 1 && row(o, 208).holder === EDI)
  ok('…a piece with an open day move carries the ask; the rest carry none', row(o, 205).ask?.id === 9 && o.rows.filter((r) => r.ask).length === 1)
  ok('…a step with nobody on it has no holder', row(o, 206).holder === null)
  o = teamOverdue(TEAM, { archiveDays: null })
  ok('when the archive could not be checked (archiveDays null) nothing is capped, and nothing is counted archived',
    o.rows[0].content_id === 201 && o.rows[0].phase === 'shoot' && o.rows[0].days_late === 30 && o.archived === 0 && o.total === 7, JSON.stringify([o.rows[0].content_id, o.archived, o.total]))
  ok('…and the archive switched off (0) reads the same', teamOverdue(TEAM, { archiveDays: 0 }).archived === 0 && teamOverdue(TEAM, { archiveDays: 0 }).rows.length === 7)

  // ---- atRisk ----
  const t = atRisk(TEAM)
  ok('Today: every step due today, at risk first, then by the hour',
    t.rows.map((r) => `${r.content_id}:${r.phase}`).join() === '207:release,208:release,213:shoot,209:release,207:shoot,211:edit,210:design', t.rows.map((r) => `${r.content_id}:${r.phase}@${r.time || '-'}`).join())
  ok('…a release is at risk when an earlier step of the same piece is due today (not filmed yet) or late (edit not in)',
    t.risky.map((r) => r.content_id).join() === '207,208' && t.rows[0].risk.phase === 'shoot' && t.rows[0].risk.days_late === 0 && t.rows[0].risk.owners.join() === String(OPA)
    && t.rows[1].risk.phase === 'edit' && t.rows[1].risk.days_late === 1, JSON.stringify(t.risky.map((r) => r.risk)))
  ok('…a release with nothing before it outstanding is safe; a step that is not a release is never “at risk”',
    t.rows.find((r) => r.content_id === 209).risk === null && t.rows.filter((r) => r.phase !== 'release').every((r) => r.risk === null))
  ok('…an edit due today is a Today row; an edit due tomorrow is in no list', t.rows.some((r) => r.content_id === 211 && r.phase === 'edit') && !t.rows.some((r) => r.content_id === 212)
    && !teamOverdue(TEAM, {}).rows.some((r) => r.content_id === 212))
  {
    const designFirst = { ...TEAM, overdue: [], editAsap: [], dueToday: [step(215, 'Cover not in', 'design', TODAY, [DES]), step(215, 'Cover not in', 'release', TODAY, [JAS], { time: '19:00' })] }
    ok('…artwork due today holds a release up too (“Artwork not in”)', atRisk(designFirst).risky[0]?.risk.phase === 'design')
  }

  // ---- adminFirst ----
  let f = adminFirst(TEAM, { archiveDays: 14, asks: ASKS, today: TODAY })
  ok('Start here, 1: a shoot today with nobody to film it — the one on two people’s rows; a filmed one is not',
    f?.kind === 'nobody' && f.content_id === 213 && f.time === '10:00' && f.holder === null, JSON.stringify(f && { kind: f.kind, id: f.content_id }))
  f = adminFirst({ ...TEAM, day: addDays(TODAY, 1) }, { archiveDays: 14, asks: ASKS, today: TODAY })
  ok('…only when the timeline is today’s; else 2: the day move waiting on the admin', f?.kind === 'ask' && f.content_id === 205 && f.ask.id === 9, f?.kind)
  const noNobody = { ...TEAM, timeline: [] }
  f = adminFirst(noNobody, { archiveDays: 14, asks: [], today: TODAY })
  ok('…else 3: the release at risk that goes out soonest, and Remind goes to whoever holds the step in its way',
    f?.kind === 'risk' && f.content_id === 207 && f.holder === OPA && f.risk.phase === 'shoot' && f.time === '18:00', JSON.stringify(f && { kind: f.kind, id: f.content_id, holder: f.holder }))
  const quiet = { ...noNobody, dueToday: TEAM.dueToday.filter((x) => x.phase !== 'release') }
  f = adminFirst(quiet, { archiveDays: 14, asks: [], today: TODAY })
  ok('…else 4: the first Overdue row — never a piece the archive takes on Monday',
    f?.kind === 'late' && f.content_id === 202 && f.content_id === teamOverdue(quiet, { archiveDays: 14 }).rows[0].content_id && f.holder === EDI && f.phase === 'edit'
    && !teamOverdue(quiet, { archiveDays: 14 }).archivedIds.includes(f.content_id), JSON.stringify(f && { id: f.content_id, holder: f.holder }))
  f = adminFirst(quiet, { archiveDays: null, asks: [], today: TODAY })
  ok('…with the archive unchecked (null) there is no cap: the most late step on the board', f?.kind === 'late' && f.content_id === 201 && f.holder === OPA && f.days_late === 30)
  ok('…and a day with nothing open has no Start here', adminFirst({ today: TODAY, day: TODAY, overdue: [], dueToday: [], editAsap: [], seatless: [], timeline: [] }, { today: TODAY }) === null && adminFirst(null) === null)
  ok('the readings change nothing they are given', JSON.stringify(TEAM) === frozen)

  // ---- the edges, each on a day of its own (TEAM above is left as it is) ----
  o = teamOverdue({ ...TEAM, overdue: [...TEAM.overdue, late(216, 'Shoot slipped, out next week', 'shoot', 16, [OPA])] }, { archiveDays: 14 })
  ok('a shoot more than archiveDays late on a piece whose release is still ahead is a row, never archived',
    row(o, 216)?.days_late === 16 && o.archivedIds.join() === '201', JSON.stringify([row(o, 216)?.days_late, o.archivedIds]))
  o = teamOverdue(TEAM, { archiveDays: 14, asks: [{ ...ASKS[0], id: 12, reason: 'Asked again' }, ...ASKS] })
  ok('…two asks on one piece: the row carries the oldest', row(o, 205).ask?.id === 9, String(row(o, 205).ask?.id))
  // The summary's own list, when the screen has it, is the archive: a piece
  // kept (not a candidate) is a row however late; a candidate is not, even
  // when its release reads under the cap here (a re-promised day).
  o = teamOverdue(TEAM, { archiveDays: 14, candidates: [{ id: 202, title: 'Fourteen days' }, { id: 999 }] })
  ok('with the summary’s candidates: they are the archive — a kept piece is a row, a candidate under the cap here is not, one not late here is not counted',
    !row(o, 202) && row(o, 201)?.days_late === 30 && o.archivedIds.join() === '202' && o.total === 7, JSON.stringify([o.rows.map((r) => r.content_id), o.archivedIds, o.total]))
  ok('…bare ids read the same, and with archiveDays null the list is not used (no cap)',
    teamOverdue(TEAM, { archiveDays: 14, candidates: [202] }).archivedIds.join() === '202' && teamOverdue(TEAM, { archiveDays: null, candidates: [202] }).archived === 0)
  f = adminFirst(quiet, { archiveDays: 14, candidates: [{ id: 202 }], today: TODAY })
  ok('…and Start here takes the same list: the kept piece, 30 days late, is the hero; the candidate never is',
    f?.kind === 'late' && f.content_id === 201 && f.holder === OPA, JSON.stringify(f && { id: f.content_id }))
  {
    const twoInTheWay = { ...TEAM, timeline: [], overdue: [late(218, 'Two in the way', 'shoot', 1, [OPA])], editAsap: [],
      dueToday: [step(218, 'Two in the way', 'design', TODAY, [DES]), step(218, 'Two in the way', 'release', TODAY, [JAS], { time: '19:00' })] }
    ok('…a release with two steps in its way names the earliest (the shoot), not the artwork', atRisk(twoInTheWay).risky[0]?.risk.phase === 'shoot', atRisk(twoInTheWay).risky[0]?.risk.phase)
    const coverToday = { ...TEAM, timeline: [], overdue: [late(217, 'Shot late, cover today', 'shoot', 2, [OPA])], editAsap: [],
      dueToday: [step(217, 'Shot late, cover today', 'design', TODAY, [DES])] }
    ok('…a step that is not a release is never at risk, even with an earlier step late', atRisk(coverToday).rows[0]?.risk === null && atRisk(coverToday).risky.length === 0)
    const twoNobody = { ...TEAM, timeline: [...TEAM.timeline, { id: 4, name: 'Malika', items: [{ kind: 'shoot', content_id: 219, title: 'Nobody, earlier', from: '08:00', operator_id: null, owners: [4], done: false }] }] }
    f = adminFirst(twoNobody, { archiveDays: 14, asks: ASKS, today: TODAY })
    ok('…two shoots today with nobody: the earlier is Start here', f?.kind === 'nobody' && f.content_id === 219, String(f?.content_id))
    f = adminFirst({ ...TEAM, day: addDays(TODAY, 1) }, { archiveDays: 14, asks: [{ ...ASKS[0], id: 12, content_id: 203, title: 'AP interview, again' }, ...ASKS], today: TODAY })
    ok('…two asks: Start here is the oldest', f?.kind === 'ask' && f.ask.id === 9 && f.content_id === 205, String(f?.ask?.id))
  }
}

// ---- the window: your step now -------------------------------------------------------
const act = (t, userId, more = {}) => actOf(t, { userId, pipe, step: userId === JAS ? stepOf(t) : nextStepOf(t, pipe, making(t), { move: false, publish: false }), today: TODAY, rounds: 0, maxRounds: 2, canReview: userId === JAS, ...more })
ok('the operator, on the day: hand in the shoot', act(get(1), OPA).kind === 'handin' && act(get(1), OPA).hat.kind === 'shoot')
ok('…asked about a time and not answered yet: answer first', act(get(2), OPA).kind === 'ask' && act(get(2), OPA).which === 'shoot')
ok('…days before the shoot: not yet', act(get(8), OPA).kind === 'notyet')
ok('the editor with footage in: hand in the cut', act(get(3), EDI).kind === 'handin' && act(get(3), EDI).hat.kind === 'edit')
ok('…with no footage: cannot start yet', act(get(10), EDI).kind === 'blocked')
ok('…after handing in: their part is done, and it says who has it', act(get(4), EDI).kind === 'waiting' && act(get(4), EDI).didMine === true && act(get(4), EDI).holder === JAS)
ok('the designer with a round open: fix it', act(get(5), DES).kind === 'fix' && act(get(5), DES).hat.kind === 'design')
ok('the maker on a delivered cut: accept, or ask for changes', act(get(4), JAS).kind === 'check' && act(get(4), JAS).what === 'cut' && act(get(4), JAS).maker === EDI)
ok('…on a piece being fixed: not their step', act(get(5), JAS).kind === 'fixing' && act(get(5), JAS).holder === DES)
ok('…on a piece being filmed: not their step', act(get(1), JAS).kind === 'waiting' && act(get(1), JAS).holder === OPA && act(get(1), JAS).wait === 'shoot')
ok('…on their idea: the move', act(get(6), JAS).kind === 'move' && act(get(6), JAS).verb === 'Send to the designer')
// The same piece, from the designer's chair: the two pages agree.
ok('the designer on that idea: not sent to them yet, and it names who has it', act(get(6), DES).kind === 'early' && act(get(6), DES).holder === JAS)
{
  // A maker who also holds the camera on their own idea: sending it on is the step, not filming it.
  const own = piece(44, 'My own shoot', { status_id: 1, operator_id: JAS, recording_date: TODAY, shoot_ack: 'yes' })
  ok('whoever can send an idea on is offered that, not the job on it', act(own, JAS).kind === 'move' && !act(own, JAS).didMine)
}
ok('…on an accepted cut: publish', act(get(7), JAS).kind === 'publish')
ok('a piece that is out has nothing left to press', act(get(9), JAS).kind === 'out')
ok('a killed piece has nothing to press either', act(get(11), OPA).kind === 'none')
// One person, two hats: the window opens on the job the row was about.
const two = piece(30, 'Films and cuts it', { status_id: 2, operator_id: 8, editor_id: 8, recording_date: TODAY, shoot_ack: 'yes', edit_ready_date: '2026-10-05', edit_ack: 'yes' })
ok('somebody who films and cuts a piece gets the shoot first', act(two, 8).hat.kind === 'shoot')
ok('…and the cut when that is the row they pressed', act(two, 8, { prefer: 'edit' }).hat.kind === 'edit' && act(two, 8, { prefer: 'edit' }).kind === 'blocked')

// ---- the week strip and the calendar ---------------------------------------------------
let ev = dayEvents(P, TODAY, TODAY, pipe)
ok('today: three shoots by the clock, then the release', ev.map((e) => `${e.k}${e.t.id}`).join() === 'shoot1,shoot10,shoot2,rel7', ev.map((e) => `${e.k}${e.t.id}`).join())
ev = dayEvents(P, '2026-10-01', TODAY, pipe)
ok('a release day that passed without the piece going out is “missed”; one that went out is “out”',
  ev.map((e) => `${e.k}${e.t.id}`).sort().join() === 'miss3,out9', ev.map((e) => `${e.k}${e.t.id}`).join())
ok('a killed piece is on no day', !dayEvents(P, TODAY, TODAY, pipe).some((e) => e.t.id === 11))
ok('a filmed shoot stays on its day, marked as filmed', dayEvents(P, '2026-09-25', TODAY, pipe)[0]?.filmed === true)
const cells = monthCells('2026-10')
ok('the month grid starts on a Monday and holds whole weeks', cells[0] === '2026-09-28' && cells.length === 35 && cells[34] === '2026-11-01', `${cells[0]} ${cells.length}`)
ok('…six rows when the month needs them', monthCells('2026-08').length === 42 && monthCells('2026-08')[0] === '2026-07-27')
ok('a week is Monday to Sunday around the chosen day', weekCells(TODAY).join() === '2026-09-28,2026-09-29,2026-09-30,2026-10-01,2026-10-02,2026-10-03,2026-10-04')
ok('a stamp is read as the Tashkent day', dayOf('2026-10-02T20:30:00.000Z') === '2026-10-03')

// ---- the way of a task -------------------------------------------------------------------
let w = wayOf(get(3), pipe, making(get(3)))
ok('the way of a video: five stops, who does each, and where it is now',
  w.map((s) => `${s.role}:${s.cls}:${s.who ?? '-'}:${s.verb}`).join(' ') === `idea:done:${JAS}:plan shoot:done:${OPA}:film edit:on:${EDI}:cut review::${JAS}:check final::-:out`,
  w.map((s) => `${s.role}:${s.cls}:${s.who ?? '-'}:${s.verb}`).join(' '))
w = wayOf(get(6), pipe, making(get(6)))
ok('a post skips the shoot, and the designer draws it', w[1].cls === 'skip' && w[2].who === DES && w[2].verb === 'draw' && w[0].cls === 'on')
w = wayOf(get(9), pipe, making(get(9)))
ok('once it is out, every stop is behind it', w.filter((s) => s.cls !== 'skip').every((s) => s.cls === 'done'))
ok('the Deleted stage is not a stop on the way', w.length === 5)
// A written piece — Telegram, and X, Threads and LinkedIn (format 'short') —
// is planned, written and out: its channel page draws those three columns
// (WRITING_STAGES), and the window draws the same three stops.
{
  const { makingOf } = await import(from('client/src/lib/nextStep.js'))
  const asked = (formats) => ({ formats, crew: (hat) => formats.some((f) => ({ social: ['operator', 'editor', 'designer'] }[f] || []).includes(hat)) })
  const CREW = { operator: ['reel', 'video'], editor: ['reel', 'video'], designer: ['post'] }
  const xPost = makingOf({ type: 'post' }, CREW, asked(['short']))
  const xReel = makingOf({ type: 'reel' }, CREW, asked(['short']))
  ok('a post or a reel on X is written: nobody films or designs it', xPost.written && xReel.written && !xReel.filmed && !xPost.designed)
  // with_media arrives as 'social' (channelFormat.js askedOf): the type rules are back.
  const xVideo = makingOf({ type: 'reel' }, CREW, asked(['social']))
  ok('…until it carries a video: then it is filmed and cut, as on Instagram', !xVideo.written && xVideo.filmed)
  const tw = (status_id) => wayOf(piece(60, 'A post for X', { channels: ['x_twitter'], type: 'post', status_id }), pipe, xPost)
  w = tw(3)
  ok('the way of a written piece: plan, write, out — no shoot, no edit, no check',
    w.map((s) => `${s.role}:${s.verb}`).join(' ') === 'idea:plan edit:write final:out', w.map((s) => `${s.role}:${s.verb}`).join(' '))
  ok('…the making stop is called Writing, and its owner writes it', w[1].label === 'Writing' && w[1].who === JAS && w[1].cls === 'on')
  ok('…and a written piece left on Ready is still being written', tw(4)[1].cls === 'on' && tw(4).every((s) => s.role !== 'review'))
  ok('…nobody is a seat to fill on the way to Writing', seatAt(piece(61, 'x', { type: 'post', status_id: 1 }), pipe, xPost, STAGES[2]) === null)
}
// A repost — TikTok, YouTube Shorts (format 'repost') — is a finished video
// posted again: it arrives on Ready, made, and its one step is out.
{
  const { makingOf } = await import(from('client/src/lib/nextStep.js'))
  const asked = (formats) => ({ formats, crew: (hat) => formats.some((f) => ({ social: ['operator', 'editor', 'designer'] }[f] || []).includes(hat)) })
  const CREW = { operator: ['reel', 'video'], editor: ['reel', 'video'], designer: ['post'] }
  const tik = makingOf({ type: 'reel' }, CREW, asked(['repost']))
  ok('a reel on TikTok is a repost: nobody films, cuts or designs it', tik.repost && !tik.filmed && !tik.designed && !tik.written)
  const rep = piece(62, 'Admissions reel (from Main)', { channels: ['tiktok'], status_id: 4 })
  w = wayOf(rep, pipe, tik)
  ok('the way of a repost: the last look, then out — nothing before Ready',
    w.map((s) => `${s.role}:${s.verb}`).join(' ') === 'review:check final:out' && w[0].cls === 'on' && w[0].who === JAS,
    w.map((s) => `${s.role}:${s.verb}:${s.cls}`).join(' '))
  const st = nextStepOf(rep, pipe, tik, { move: true, publish: true })
  ok('…and its one step is Publish, for whoever posts it', st?.verb === 'Publish' && st.to.id === 5, JSON.stringify(st))
  // The server makes it with the source's cut ACCEPTED (server/reposts.js), so
  // the window offers the post, never "accept the cut" on a video already out.
  const act = actOf({ ...rep, ready_link: 'https://drive.google.com/x', approved_at: '2026-10-03T08:00:00Z' },
    { userId: JAS, pipe, step: st, today: TODAY, rounds: 0, maxRounds: 2, canReview: true })
  ok('…the window offers the post, not a check of the cut', act.kind === 'publish', act.kind)
  const reposts = src('client/src/components/Reposts.jsx')
  // 12 Nov 2026, the owner: the window's "More details" fold (its TikTok / Shorts ticks among it) is gone;
  // the reposts stay the server's (no rule of the client's own) wherever they are drawn again.
  ok('the window no longer carries More details (its repost ticks), and the reposts keep no rule of their own',
    !/<Reposts /.test(src('client/src/components/CoachTask.jsx')) && !/title=\{tx\('More details'\)\}/.test(src('client/src/components/CoachTask.jsx'))
    && !/<Reposts/.test(src('client/src/components/ContentModal.jsx'))
    && /api\.put\(`\/content\/\$\{taskId\}\/reposts`/.test(reposts) && !/instagram_main|tiktok|youtube_shorts/.test(reposts))
  ok('…and says what happens after the tick, and why an empty place is empty',
    /tx\('When it is published: \{name\} gets a task/.test(reposts) && /tx\('Not ticked: it goes out on this channel only\.'\)/.test(reposts)
    && /tx\('It went out on this channel only — nothing was ticked before it was published\.'\)/.test(reposts))
}

// ===================== the pages, from the source =====================
const css = src('client/src/styles.css')
const i18n = src('client/src/lib/i18n.jsx') + src('client/src/lib/i18n.ru.js') + src('client/src/lib/i18n.uz.js') // the keys, then the two books
const brief = src('client/src/pages/Brief.jsx')
const dept = src('client/src/pages/Department.jsx')
const cboard = src('client/src/components/ContentBoard.jsx')
const win = src('client/src/components/CoachTask.jsx')
const crewPage = src('client/src/components/CoachCrewDay.jsx')
const makerPage = src('client/src/components/CoachMakerDay.jsx')
const calPage = src('client/src/components/CoachCalendar.jsx')

// Two looks, not three.
ok('the pages the Coach look replaced are gone', !has('client/src/components/CrewTask.jsx') && !has('client/src/components/MakerTask.jsx') && !has('client/src/components/MakerDay.jsx'))
// 13 October 2026, the owner: the previous look goes with the one task window.
ok('…and nobody can switch back to the previous look', /export const isSimple = \(\) => true/.test(src('client/src/lib/look.js'))
  && !/setSimple\(user, false\)|onClassic=/.test(brief) && !/tx\('Bring back the previous look'\)/.test(src('client/src/components/Sidebar.jsx')))

// One window, for everybody, from both pages that open tasks.
// 13 October 2026, the owner: "make one universal task view". Every page goes
// through ContentModal's door, which opens a task that exists in the task window.
const sheet = src('client/src/components/ContentModal.jsx')
ok('every page opens a task through one door, and the door opens the task window',
  /<ContentModal\b/.test(brief) && /<ContentModal\b/.test(dept) && !/<CoachTask\b/.test(brief + dept)
  && /return <TaskWindow \{\.\.\.props\} \/>/.test(sheet) && /<CoachTask key=\{item\.id\}/.test(sheet))
// Task 7 (12 Nov 2026, design-variants/task-window-tz.md): the window is the editor — no Edit button, no form;
// every value is its own small form in place, and the full sheet is "All fields" in the "…" menu.
ok('…which has no Edit button: every value changes in place, and the full sheet is “All fields” in the “…” menu',
  !/co-edit-btn|EDIT_FORMS|editVariant|TaskEdit/.test(win) && /key: 'all', Icon: LayoutList, label: tx\('All fields'\)/.test(win)
  && /editing === 'sheet' && edit \? edit\(t, \{/.test(win) && /<LineField value=\{t\.title\}/.test(win))
ok('…and the form has no tabs: the days, the reference, the files, then the brief, as the window reads',
  !/className="cm-pages"|const SECTIONS|cm-page-tab|crewViewer|asCrew/.test(sheet)
  && ['{daysBlock}', '{refRow}', '{filesRow}', '{tzRow}'].every((k, i, a) => i === 0 || sheet.indexOf(k, sheet.indexOf('const body = (')) > sheet.indexOf(a[i - 1], sheet.indexOf('const body = ('))))
ok('a pen in the window only for whoever may write to the piece (the server’s canTouch)',
  /const reach = reachOf\(user, t\)/.test(win) && /plans=\{reach && can\(user, 'manage_content'\)\}/.test(win) && /const reach = creating \|\| reachOf\(user, item\)/.test(sheet))
ok('the window is a dialog that closes on Esc and on a click outside',
  /role="dialog"/.test(win) && /aria-modal="true"/.test(win) && /e\.key === 'Escape'/.test(win) && /className="co-scrim"[^>]*onMouseDown=\{\(\) => close\(\)\}/.test(win))
// ---- what the first draft told people wrongly ----
ok('closing over words typed and not sent asks first', /const unsent = \(\) =>/.test(win) && /sure !== true && unsent\(\)/.test(win) && /tx\('Keep writing'\)/.test(win) && /tx\('Close anyway'\)/.test(win))
// 10 Nov 2026 (the a11y audit, T-M3): the ask goes through askLeave, which keeps where the
// keyboard was so "Keep writing" can put it back; it still holds the way out in `leaving`.
ok('…and so does every other way out of the window: All fields and “Next”',
  /goOut\('full'\)/.test(win) && /onClick=\{\(\) => goOut\('next'\)\}/.test(win) && !/onClick=\{onOpenFull\}/.test(win) && !/onClick=\{onNext\}/.test(win)
  && /const goOut = \(how\) => \{ if \(unsent\(\)\) askLeave\(how\); else leave\(how\) \}/.test(win)
  && /const askLeave = \(how\) => \{ leaveFrom\.current = document\.activeElement; setLeaving\(how\) \}/.test(win)
  && /const keepWriting = \(\) => \{ setLeaving\(null\); const el = leaveFrom\.current/.test(win))
ok('a press that moved the piece can be taken back: the server’s own undo, offered for less than its ten seconds',
  /api\.post\(`\/content\/\$\{t\.id\}\/undo`\)/.test(win) && /u\.status_id !== t\.status_id\) setUndo/.test(win) && /const UNDO_MS = 9000/.test(win) && /tx\('Undo'\)/.test(win)
  && /const UNDO_SECONDS = 10/.test(src('server/routes/content.js')))
ok('the hand-in box tells the window when its button is awake', /onReady=\{\(ok\) => setAwake\(ok\)\}/.test(win) && /onReady\?\.\(ready, filled\)/.test(src('client/src/components/HandIn.jsx')))
// D-04: hand-in happens in the window, not on the day. The card's button opens
// the window with the step in focus; the card holds no input and, while the
// file is still missing, says only where to drop it. No numbered list anywhere:
// the window's three-step lists and their ticks are gone with it.
ok('D-04: the start-here card has no input, and says where to drop the file while it is missing',
  !/<HandIn|<UploadField|hi-drop|<input/.test(crewPage) && /open\(r, 'step'\)/.test(crewPage) && /tx\('Drop the file in the task, then press Send\.'\)/.test(crewPage))
ok('…and no numbered steps anywhere: the window keeps no step list and no ticks', !/jobSteps|readTicks|writeTicks|hi-steps|const steps = act\.kind/.test(win) && !/hi-steps/.test(src('client/src/components/HandIn.jsx')))
// Round 8: the owner's task view draws no numbered steps ("too much guidance") —
// the person's one step is the first thing in the words column.
ok('round 8: no numbered steps in the window; “Your step now” leads its column', /\{actBox\(\)\}/.test(win) && !/listOf\(/.test(win) && !/tx\('The way of this task'\)/.test(win))
// 9 Nov 2026 (the owner's drawing, design-variants/task-window-variants.md: "labels only …
// no sentence anywhere"): the holder's row says "Not sent yet", and the quiet link is
// "Hand it in" — it still opens the same hand-in box (the server takes it at any stage).
ok('a job not sent yet says so, and can still be handed in',
  /case 'early'/.test(win) && /holderRow\(act\.holder, name, tx\('Not sent yet'\)\)/.test(win)
  && /onClick=\{\(\) => setAnyway\(true\)\}>\{tx\('Hand it in'\)\}/.test(win)
  && /const act = read\.kind === 'early' && anyway \? \{ kind: 'handin', hat: read\.hat \} : read/.test(win))
ok('“Being fixed” rows say until when — a day ahead, or that the planned day has passed', /r\.until \? tx\('until \{day\}', \{ day: dayInLine\(r\.until, today\) \}\) : release\(t\)/.test(src('client/src/components/CoachMakerDay.jsx')))
ok('…and the round is on the row whether or not the piece is late',
  (() => { const p = src('client/src/components/CoachParts.jsx'); const mb = p.slice(p.indexOf('export function MakerBadge')); return mb.indexOf("if (act.kind === 'fixing') return") > 0 && mb.indexOf("if (act.kind === 'fixing') return") < mb.indexOf('if (row.late) return') })())
{
  const parts = src('client/src/components/CoachParts.jsx')
  ok('a reminder is in the reader’s language, once a day by the thread, and says who sees it',
/phraseIn\(person\.lang/.test(parts) && /tashkentDay\(c\.created_at\) === today && lines\.includes\(String\(c\.text \|\| ''\)\.trim\(\)\)/.test(parts) && !/includes\(`@\$\{person\.name\}`\)/.test(parts) && /data-tip=\{sent \? undefined : remindHelp\(\)\}/.test(parts))
// (The window no longer repeats it under the button — the owner, 13 Oct, "a lot of unnecessary things": the button's own tip says it.)
}
const rule = (sel) => (css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*\\}`)) || [''])[0]
ok('…slides in from the right, on the drawer curve', /right: 0/.test(rule('.co-panel')) && /animation: co-slide [0-9.]+s var\(--ease-drawer\)/.test(rule('.co-panel')) && /@keyframes co-slide \{ from \{ transform: translateX\(100%\)/.test(css))
ok('…a panel on a desk, the whole screen on a phone', /width: min\(1180px, 100vw\)/.test(rule('.co-panel')))
ok('…and fades instead for people who asked for less motion', /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.co-panel[^}]*animation-name: co-fade/.test(css))
ok('the window asks the server what a move is missing — no rule of its own', /<NextStep key=/.test(win) && /<HandIn inline/.test(win) && !/needs_link|\.missing\b|e\.data\b/.test(win))
// Round 18 (23 Oct 2026) drew the stages line over the window for everybody; the owner's
// drawing of 9 Nov 2026 took it out (design-variants/patch-task-window-4.mjs: "no stops line
// and no chips by the title"). The stage is the job block's own head — its tile, its word,
// whose turn it is (a face, never the reader's) — for everybody, and the plan is a fold
// for everybody (the admin's own "Plan", anybody else's under "More details").
ok('…the stages line is gone from the window (9 Nov); the job block’s head says the stage and whose turn, for everybody',
  !/<Capsule\b/.test(win) && /const box = \(title, body, opts = \{\}\) => \(/.test(win)
  && /<KindTile kind=\{jobKind\}[^>]*\/>\s*<h3>\{jobWord \|\| title\}<\/h3>/.test(win)
  && /const holder = stop\?\.who && stop\.who !== user\.id \? person\(stop\.who\) : null/.test(win) && /className="co-strip-who"><Face person=\{holder\}/.test(win)
  // Task 7: the plan is one block, always open, for everybody, first in the right column (task-window-tz.md §2.3)
  && /\{at >= 0 && planBlock\}/.test(win) && !/<Fold icon=\{CalendarDays\} title=\{tx\('Plan'\)\}>/.test(win))
// T-07 (the TZ of 19 October 2026): the move's questions are one sheet — 520 px in the
// middle of a desk, from the bottom of a phone — from the board and from the window alike,
// never inline in the window and never a panel at the card; the dots are drawn only
// when there is more than one question (the one ruby dot was the TZ's stray red dot).
{
  const ns = src('client/src/components/NextStep.jsx')
  ok('the move’s questions are a sheet, from the board and from the window alike (T-07)',
    /<Modal kind="sheet"/.test(ns) && !/\binline = false|anchor = null/.test(ns) && /setStepping\(true\)/.test(win) && !/<NextStep inline/.test(win)
    && !/anchor=/.test(src('client/src/pages/Department.jsx')) && /data-layer="sheet"/.test(src('client/src/components/Modal.jsx')))
  ok('…with the dots only past one question, and what happens after the press under the button',
    /steps\.length > 1 && \(\s*<span className="co-ask-dots"/.test(ns) && /afterWords\(item, to, verb, values, nameOf\)/.test(ns) && /after\(afterWords\(t, act\.to, act\.verb/.test(win))
  const tb = src('client/src/components/TimeBand.jsx')
  ok('…the day is three buttons and a person’s row is the three nearest free starts, a busy one struck through',
    /const NEAR = 3/.test(tb) && /quick = \[addDaysISO\(today, 1\), addDaysISO\(today, 2\)\]/.test(tb) && /<DayPick value=\{otherDay \? day : ''\}/.test(tb)
    && /'r14-bk-tm' \+ \(c \? ' busy' : ''\)/.test(tb) && /tx\('More…'\)/.test(tb) && /\.r14-bk-tm\.busy \{[^}]*line-through/.test(css))
}
// 9 Nov 2026 (the owner, design-variants/task-window-variants.md): "After you press…" is gone
// from the window — "no sentence anywhere". What happens after a hand-in is the button's own
// words: it names who gets the work (T-08), the footage to the editor, the rest to the owner.
ok('every button says what happens after it',
  !/className="co-after/.test(win) && /<HandIn inline [^>]*label=\{button\}/.test(win)
  && /hat\?\.kind === 'shoot' && act\.kind !== 'fix' && nameOf\(t\.editor_id\) && t\.editor_id !== user\.id \? tx\('Send to \{name\}', \{ name: nameOf\(t\.editor_id\) \}\)/.test(win)
  && /hat && hat\.kind !== 'shoot' && sendTo && owner !== user\.id && !coverFirst \? tx\('Send to \{name\}', \{ name: sendTo \}\)/.test(win))

// The crew's day.
// Round 9 ("too complex"): the rows carry no numbers any more; the order is still the reading's, top to bottom.
ok('the crew’s list is the reading’s own order, drawn band by band', /crewDay\(/.test(brief) && /const \{ rows, first, held \} = model/.test(crewPage) && /rows\.filter\(\(r\) => r\.band === b\.key/.test(crewPage) && !/\{r\.n \|\|/.test(crewPage))
{
  // "Why this one first" is true in every state: somebody waiting is said
  // before lateness, and "nothing is late" only when nothing late is held.
  const why = crewPage.slice(crewPage.indexOf('const why ='), crewPage.indexOf('const button ='))
  const at = (x) => why.indexOf(x)
  ok('the big card never says “nothing is late” over a late row that cannot be started',
    at("r.state === 'fix'") >= 0 && at("r.state === 'fix'") < at("r.state === 'ask'") && at("r.state === 'ask'") < at('r.late ?') && at('r.late ?') < at('held ?') && at('held ?') < at("tx('Nothing is late."),
    why.slice(0, 80))
}
ok('…with the summary bar: three counts that filter, and the day’s progress', /role="progressbar"/.test(src('client/src/components/CoachParts.jsx')) && /aria-pressed/.test(src('client/src/components/CoachParts.jsx')))
ok('the first-days hint can be closed, and “?” brings it back', /closeHint\(/.test(src('client/src/components/CoachParts.jsx')) && /openHint\(/.test(src('client/src/components/CoachParts.jsx')))
// r11 (the owner, 12 Oct 2026: "remove More" on the crew's page): nothing is taken
// away — the calendar is a page in the menu on the left. Round 14 (the owner's
// Jobber pick, 15 Oct): the strip of hours is the square beside Now — today's
// shoots in order for whoever films, today's edits for an editor.
ok('nothing is taken away: today is the square beside Now, the calendar is in the menu',
  /className=\{'co-sq'/.test(crewPage) && /tx\('Today’s shoots'\)/.test(crewPage) && /tx\('Today’s edits'\)/.test(crewPage) && /crewSeat/.test(src('client/src/components/CoachNav.jsx')) && /to: '\/brief\/calendar'/.test(src('client/src/components/CoachNav.jsx'))
  && !/tx\('Bring back the previous look'\)/.test(src('client/src/components/Sidebar.jsx')))

// N-01 (the TZ of 19 Oct 2026): one Calendar row for everybody — no Shoots
// row, no Shoots slot on the phone — and the crew's month is the Mine button
// of the one calendar frame (round 15), beside Shooting and Releasing.
ok('one Calendar row: no Shoots row, and Mine is a button of the frame',
  !/const shoots = /.test(src('client/src/components/Sidebar.jsx')) && /key: 'mycal', to: '\/brief\/calendar', label: tx\('Calendar'\)/.test(src('client/src/components/CoachNav.jsx'))
  && !/key: 'recordings', to: '\/recordings'/.test(src('client/src/components/Layout.jsx'))
  && /<CalendarViews active="mine" \/>/.test(src('client/src/pages/Brief.jsx')) && /<CalendarViews active=\{M\.master \? 'release' : 'recording'\} go=\{go\} \/>/.test(src('client/src/pages/Schedule.jsx'))
  && /key: 'mine', label: tx\('Mine'\)/.test(src('client/src/components/CalendarViews.jsx')))
// B-08 (the TZ of 19 Oct 2026): Sprints is in no menu — not the sidebar, not
// the phone bar's candidates, not the one-channel top bar — while its pages
// stay by their address with the banner that says when they go.
ok('Sprints is in no menu, and its pages carry the retiring banner',
  !/key: 'sprints'/.test(src('client/src/components/Sidebar.jsx')) && !/key: 'sprints'|to="\/sprints"/.test(src('client/src/components/Layout.jsx'))
  && /<RetiringBanner \/>/.test(src('client/src/pages/Sprints.jsx')) && /SPRINTS_RETIRE = '2026-11-03'/.test(src('client/src/pages/Sprints.jsx'))
  && /records\/sprint-backlog/.test(src('server/routes/fields.js')))

// N-03: Team is one door — People, Workload and Access as tabs; Post
// Production and Admin → Team are not in any menu, and Hiring and Candidates
// are gone with their routes.
ok('Team is one door: no Post Production, no Hiring, no Candidates',
  !/key: 'crew'/.test(src('client/src/components/Sidebar.jsx')) && !/Post Production/.test(src('client/src/components/QuickFind.jsx'))
  && !/\/hiring|\/candidates|CandidateModal|setNeeds/.test(src('client/src/components/team/People.jsx')) && !/\/api\/hiring|\/api\/candidates/.test(src('server/app.js'))
  && /tab === 'workload' && <Workload \/>/.test(src('client/src/pages/Team.jsx')))

// Advanced settings (12 Nov 2026, design-variants/admin-tz.md §0, the owner's
// grill): one list, no tabs, five groups, a page a setting under /admin/…;
// every old ?tab= address lands on the page that holds it now.
{
  const st = src('client/src/pages/Settings.jsx')
  ok('Advanced settings is one list of five groups, a page a setting, the old addresses kept',
    ['Platform', 'Team', 'Pay', 'Connections', 'History'].every((g) => st.includes(`<Group title={tx('${g}')}`))
    && /path="channels\/:key"/.test(st) && /path="roles\/\*"/.test(st) && /path="pay\/:which"/.test(st)
    && /drive: '\/admin'/.test(st) && /whiteboard: '\/admin\/structure'/.test(st) && /records: '\/admin\/history'/.test(st)
    && !/className="tabs"/.test(st) && /path="\/admin\/\*"/.test(src('client/src/App.jsx'))
    && /'nav\.admin': 'Settings'/.test(src('client/src/lib/i18n.jsx')))
}

// D-06: "What changed" is the bell's first item, with a badge until the bell
// is opened; My Day carries nothing above the start-here card but the date
// and the headline.
ok('What changed lives in the bell, not on My Day',
  /<WhatsNew onClose=/.test(src('client/src/components/NotificationsBell.jsx')) && /\(news \? 1 : 0\)/.test(src('client/src/components/NotificationsBell.jsx'))
  && !/<WhatsNew/.test(crewPage) && !/<WhatsNew/.test(src('client/src/components/CoachMakerDay.jsx')) && !/<WhatsNew/.test(src('client/src/components/CoachAdminDay.jsx')))

// 13 October 2026, the owner: "the task is not shown on the platform list". A
// task fourth in its band was behind "Show all", and an editor with only
// waiting work saw one shut line. Round 14 (the owner's Planner pick, 15 Oct:
// "3 rows per band") cuts every band at three again, with its count on the
// band and the rest one press away.
ok('the crew’s bands show three and “N more”, each with its count, and “Waiting for others” starts open',
  /const CUT = 3\b/.test(crewPage) && /b\.rows\.slice\(0, cut\)/.test(crewPage) && /<span>\{b\.rows\.length\}<\/span>/.test(crewPage) && /tx\('\{n\} more', \{ n: b\.rows\.length - CUT \}\)/.test(crewPage)
  && /<details open className="co-card sd-fold co-parked">/.test(crewPage))
ok('…with every waiting row in it, and no second cut anywhere on the page',
  /\{parked\.map\(row\)\}/.test(crewPage) && !/parked\.slice\(|rows\.slice\(0, \d|\.map\(row\)\.slice\(|CUT\.\w+ =/.test(crewPage))
ok('the crew’s calendar reads “handed in” the way My Day does, seat by seat',
  /const made = \(t, seat\) => makeDone\(/.test(brief) && (brief.match(/!made\(t, '(?:editor|designer)'\)/g) || []).length === 4 && !/!t\.ready_at\)? (?:&& reviewDue\(t\)\) )?push/.test(brief))
ok('a piece put back opens with an empty hand-in box and no lateness of its first delivery in the window',
  /fixing \|\| \(kind !== 'shoot' && item\.ready_at\) \? ''/.test(src('client/src/components/HandIn.jsx'))
  && /again \? \(fixUntil\(t, hat\.name, today\) \|\| today\)/.test(src('client/src/components/CoachTask.jsx')))

// The maker's day and calendar.
ok('the maker’s five groups, in the owner’s order, each with why it comes there',
  ["'film'", "'pravka'", "'late'", "'move'", "'ready'"].every((k, i, a) => i === 0 || makerPage.indexOf(`key: ${k}`) > makerPage.indexOf(`key: ${a[i - 1]}`)) && /makerDay\(/.test(brief))
ok('…Pravka in two: “Check it” and “Being fixed”', /tx\('Check it'\)/.test(makerPage) && /tx\('Being fixed'\)/.test(makerPage))
// D-03: a row carries one trailing element — a button or a badge, never both;
// a late row with a button says how late in its grey line.
ok('a row carries one trailing element: the button wins, and how late goes into the line (D-03)',
  /action=\{action\} badge=\{action \? null : badge\}/.test(makerPage) && /: <MakerBadge row=\{r\} today=\{today\} nameOf=\{nameOf\} \/>/.test(makerPage) && /const lineOf = \(r, action\)/.test(makerPage) && /sayLate \? \[lateWords\(r\.late\), facts\]/.test(makerPage)
  && !/\(!action \|\| r\.late > 0\) && <MakerBadge/.test(makerPage)
  && /if \(act\.kind === 'fixing'\) return <Badge>\{tx\('round \{n\}'/.test(src('client/src/components/CoachParts.jsx')))
// The strip of hours leaves a maker's My Day (round 11; their week is the Calendar's,
// read the same way). Whoever films has today's shoots in the square beside Now (round 14).
ok('…a maker’s My Day has no strip; the week and the other days are the calendar’s',
  !/CoachDayLine|eventsOn\(/.test(makerPage) && /dayEvents\(pieces, day, today, pipe\)/.test(calPage))
ok('the calendar is a screen of its own, with Month and Week', /path="\/brief\/calendar"/.test(src('client/src/App.jsx')) && /tx\('Month'\)/.test(calPage) && /tx\('Week'\)/.test(calPage) && /monthCells\(/.test(calPage) && /weekCells\(/.test(calPage))

// A colour is a token, with a value for the light and for the dark theme.
const light = css.slice(css.indexOf(':root {'), css.indexOf('[data-theme="dark"] {'))
const dark = css.slice(css.indexOf('[data-theme="dark"] {'), css.indexOf('* { box-sizing: border-box; }'))
const hex = (block, name) => (new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block) || [])[1]
const KINDS = ['kind-shoot', 'kind-cut', 'kind-art']
ok('the colours for a kind of work are tokens, in both themes', KINDS.every((k) => hex(light, k) && hex(dark, k)), KINDS.map((k) => `${hex(light, k)}/${hex(dark, k)}`).join(' '))
// Read as text on its own tint (13% over the card), like the icon tile and the calendar pill.
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const mix = (a, b, p) => a.map((v, i) => Math.round(v * p + b[i] * (1 - p)))
const onTint = (fg, card) => contrast(rgb(fg), mix(rgb(fg), rgb(card), 0.13))
const worst = Math.min(...KINDS.flatMap((k) => [onTint(hex(light, k), '#FFFFFF'), onTint(hex(dark, k), '#262626')]))
ok('…each readable on its own tint, light and dark (4.5:1)', worst >= 4.5, worst.toFixed(2))
const coach = css.slice(css.indexOf('The Coach look'))
ok('no colour is written into a Coach rule', coach.length > 500 && !/#[0-9A-Fa-f]{3,8}\b/.test(coach.replace(/\/\*[\s\S]*?\*\//g, '')))
ok('…and nothing in it is heavier than Bold', !/font-weight:\s*(800|900)/.test(coach))

// What the last review found, kept found.
const ns = src('client/src/components/NextStep.jsx')
ok('the move’s form demands the landing seat whatever the dry run says, and both callers pass it',
  /if \(seat\) demanded\.add\(seat\)/.test(ns) && /if \(seat\) add\(\{ field: seat \}\)/.test(ns)
  && /seat=\{seatAt\(t, pipe, makingFor\(t\), act\.to\)\}/.test(win)
  && /seat=\{seatAt\(stepping\.item, step\.pipe, step\.makingFor\(stepping\.item\), stepping\.to\)\}/.test(src('client/src/pages/Department.jsx')))
ok('a booking they said no to shows the answer and a way to change it, and no hand-in', /case 'declined':/.test(win)
  && /case 'declined': \{[\s\S]{0,900}<Booking item=\{t\}/.test(win) && !/case 'declined': \{[\s\S]{0,900}<HandIn/.test(win))
const topRule = (sel) => (css.match(new RegExp(`\\n${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`)) || [])[1] || ''
ok('the summary bar wraps by its own width — the greeting keeps 280px and never breaks inside a word',
  /display: flex/.test(topRule('.co-sum')) && /flex-wrap: wrap/.test(topRule('.co-sum')) && /min-width: min\(280px, 100%\)/.test(topRule('.co-hello'))
  && !/overflow-wrap: anywhere/.test(topRule('.co-hello h2')) && !/grid-template-columns/.test(topRule('.co-sum')))
ok('…and so does the first-days hint: a step keeps 200px or goes under the others',
  /flex-wrap: wrap/.test(topRule('.co-hint')) && /flex: 1 1 200px/.test(topRule('.co-hint p')))

// Three languages, in plain words.
const said = (en, ru, uz) => i18n.includes(`"${en}": "${ru}"`) && i18n.includes(`"${en}": "${uz}"`)
// B-01: the channel board — four columns that fit, the finished and the deleted
// folded at the edge, a card of one grey line and one tonal button with the type
// as its left rule, the filter a popover of chips with its summary under the headline.
ok('B-01: the simple board folds Published and Deleted at the edge, and a card is one line and one tonal button',
  /className="board-folds"/.test(cboard) && /const folded = simple && !phone \? statuses\.filter\(\(st\) => st\.is_final \|\| isDeletedLabel\(st\.label\) \|\| userFolds\.has\(st\.id\)\)/.test(cboard)
  && /tcard-b01/.test(cboard) && /'co-btn co-btn-sm tcard-step ' \+ \(step\.verb === 'Publish' \? 'co-btn-p' : 'co-btn-t'\)/.test(cboard) && !/<DayChip/.test(cboard)
  && !/<Timeline size="row"/.test(cboard)   // 15 Nov 2026, the owner: no line of stops on a card
  && /<FilterSummary /.test(dept) && /<ContentFilters popover/.test(dept) && /co-btn co-btn-t co-btn-sm ws-new-idea/.test(dept) && /className=\{simple \? 'co-dept-meta' : 'dept-head-row'\}/.test(dept))
// S-09: three button kinds and one shape; four chips. The files the structure
// PRs rewrite (Crew, Team, Admin, Schedule) take the vocabulary once they land.
ok('S-09: one button shape and no outlined or text button left in the Coach look',
  /html\[data-look="coach"\] \.co-btn \{ border-radius: var\(--radius-sm\); \}/.test(css) && /\.co-status::before/.test(css) && /\.co-badge\.co-b-good::before/.test(css)
  && !/co-btn-o\b|co-btn-x\b/.test(win + crewPage + makerPage + ns + src('client/src/components/CoachBits.jsx').replace(/\/\/.*$/gm, '') + src('client/src/components/Housekeeping.jsx')))
// S-10: three layers. The sheet is one width; Escape closes the topmost sheet
// only; a sheet over the drawer adds no second scrim; the focus goes back.
ok('S-10: the sheet is one width, Escape closes the topmost layer, one scrim over the drawer',
  /max-width: min\(520px, calc\(100vw - 32px\)\);/.test(css) && /body:has\(\.co-win\) \.modal-backdrop \{ background: transparent; \}/.test(css)
  && /const stack = \[\]/.test(src('client/src/components/Modal.jsx')) && /stack\[stack\.length - 1\] === token/.test(src('client/src/components/Modal.jsx'))
  && /data-layer="sheet"/.test(src('client/src/components/Modal.jsx')) && /filterBtn\.current\?\.focus\(\)/.test(dept))
// P-02, as myday-tz R30 (12 Nov 2026) left it: on a phone (≤ 700 px, where the
// shared row flips) a maker's verb that only opens the task is no button — the
// row is the one door and its grey line says "Your step: …"; Accept, Publish and
// Remind stay buttons; no chevron that does what the row does. A group shows four.
ok('P-02 · R30: on a phone a verb that only opens the task is the row’s line, not a second door; a group shows four',
  /const PHONE_Q = '\(max-width: 700px\)'/.test(makerPage)
  && /const opensOnly = \(r\) => r\.actionable && r\.act\.kind !== 'check' && r\.act\.kind !== 'publish'/.test(makerPage)
  && /if \(phone && opensOnly\(r\)\) return null/.test(makerPage) && /tx\('Your step: \{verb\}', \{ verb: verbOf\(r\.act\) \}\)/.test(makerPage)
  && !/co-row-act-c/.test(makerPage) && /const FIRST = 4/.test(makerPage) && /shown\.slice\(0, FIRST\)/.test(makerPage)
  && /\.co-row-r \.co-row-act\.long \{ width: 44px;/.test(css) && /grid-column: 2; grid-row: 1; justify-content: flex-end;/.test(css))
// myday-tz §2.1.3 (R14, R21): the maker's card never makes Accept the loud
// button over an edit nobody watched, every Accept can be taken back, the group
// is "Fixes" (key `pravka`), and a group or sub whose only row is the card's
// piece is not drawn — no "The one here is the big card at the top."
ok('R14 · R21: “Watch the edit” is the one ruby button until a preview drew; Accept toasts with Undo; hero-only groups are not drawn',
  /const seen = act\.kind === 'check' && preview\[t\.id\] === true/.test(makerPage) && /onList=\{\(l\) => setPreview/.test(makerPage)
  && /tx\('Watch the edit'\)/.test(makerPage) && /acceptBtn\('co-btn-t'\)/.test(makerPage) && /acceptBtn\('co-btn-p'\)/.test(makerPage)
  && /toast\(tx\('Accepted — it is ready to publish'\), 'ok', \{ label: tx\('Undo'\), onClick: \(\) => takeBack\(r\.t\) \}\)/.test(makerPage)
  && /api\.post\(`\/content\/\$\{t\.id\}\/undo`\)/.test(makerPage)
  && /key: 'pravka', label: \(\) => tx\('Fixes'\)/.test(makerPage) && !/tx\('Pravka'\)/.test(makerPage)
  && /filter\(\(r\) => !\(showHero && r\.t\.id === heroId\)\)/.test(makerPage) && !/The one here is the big card at the top/.test(makerPage))
// P-03: on a phone the window reads in one column with a short title and Back at the top left.
// The owner's drawing of 9 Nov 2026 changed the column: no talk in the window ("remove the
// comments from everywhere", design-variants/patch-task-window-3.mjs) and the plan is a fold
// (patch-task-window-5.mjs). So the order is the step, the material, the reference, the
// brief, the files, then the folds (Plan, History, More details) last — read off the live
// tw-* rules; the r14-tw-main/-side rules this pin read before draw nothing now.
{
  const at = css.indexOf('@media (max-width: 640px) {\n  .r14-tw-b.co-p-body.tw-b {')
  const phoneCol = at < 0 ? '' : css.slice(at, css.indexOf('\n}', at))
  const ord = (sel) => Number((phoneCol.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{ order: (\\d+); \\}`)) || [])[1] ?? NaN)
  const o = ['.tw-top > .co-act', '.tw-left > .co-ref', '.tw-right > .r14-brief', '.tw-left > .co-files-blk'].map(ord)
  ok('P-03: the window on a phone — Back top left, one column: the step, the reference, the brief, the files, the folds last',
    /className="co-back"/.test(win) && /\.r14-tw \.r14-tw-h \.co-back \{ display: grid;/.test(css) && /\.r14-tw \.r14-tw-h \.co-x \{ display: none; \}/.test(css)
    && /\.tw-top, \.tw-left, \.tw-right \{ display: contents; \}/.test(phoneCol)
    && o.every((n, i) => Number.isFinite(n) && (i === 0 || n > o[i - 1]))
    // 12 Nov 2026 (the skeptic's probe at 375, tasks 7/8/23): "+ Add a reference" had no order
    // and stood above the step. It sits after the step, with the reference (it is earlier in the DOM).
    && ord('.tw-left > .co-add-line') > o[0] && ord('.tw-left > .co-add-line') <= o[1]
    && win.indexOf('<div className="co-add-line">') > win.indexOf('<div className="tw-left">') && win.indexOf('<div className="co-add-line">') < win.search(/className=\{?["']co-blk co-ref/) // the class is an expression since the sections fold (12 Nov 2026)
    // 12 Nov 2026, the owner: the folds row is gone (no More details); the history is a short preview in the
    // right column, under the plan and the brief, so on a phone it follows the brief.
    && !/<div className="tw-folds">/.test(win) && /co-blk co-files-blk/.test(win)
    && win.indexOf("'co-blk tw-hist'") > win.indexOf('r14-brief') && win.indexOf("'co-blk tw-hist'") < win.indexOf('<div className="tw-left">')
    && /\.r14-tw \.co-p-head h2 > \.tw-tt \{ display: -webkit-box; -webkit-line-clamp: 2;/.test(css), o.join(' < '))
}
// P-06: on a phone the sheet's rows are full width and the move is the one button in the sticky footer.
ok('P-06: the question on a phone — full-width rows, the button in the sticky footer',
  /\.modal-sheet \.r14-bk-tms \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/.test(css) && /\.modal-foot > \.co-btn-p\.st-go, \.modal-foot > \.co-btn\.st-go \{ flex: 1 1 auto;/.test(css)
  && /\.modal-head::before \{/.test(css) && /position: sticky; bottom: 0;/.test(css))
// B-02: the card's "…" menu — Open, Move to… (the stages, in the same menu behind
// "Back"), Edit, Give to, Duplicate, Copy link, Pin, Done; Delete last, apart, asking by name.
const ctxMenu = src('client/src/components/ContextMenu.jsx')
ok('B-02: the card menu is in the order people use it, with the stages behind “Move to…” and Delete last asking by name',
  /items:\s*stagesFor\(item\)\.map/.test(dept) && /tx\('Move to…'\)/.test(dept) && /tx\('Copy link'\)/.test(dept) && /\/brief\?task=\$\{item\.id\}/.test(dept)
  && /tx\('Delete «\{title\}»\? It is removed for good, with its files and comments\.', \{ title: item\.title \}\)/.test(dept)
  && dept.indexOf("tx('Move to…')") < dept.indexOf("tx('Edit'), icon: PenLine") && dept.indexOf("tx('Copy link')") < dept.indexOf("tx('Delete'), icon: Trash2, danger: true")
  && /label: tx\('Back'\), icon: ChevronLeft, back: true/.test(ctxMenu) && /aria-haspopup=\{opens \? 'menu' : undefined\}/.test(ctxMenu)
  && /startEdit=\{openEdit \? true : false\}/.test(src('client/src/pages/Department.jsx')) && /setEditing\(edit \? 'sheet' : 'builder'\)/.test(win))
// B-03: the List lens — Board · List at the head, a table of the board's own
// rows (filtered the same way) sorted by any column, every row with the card's menu.
const blist = src('client/src/components/BoardList.jsx')
ok('B-03 (15 Nov 2026, the owner): the channel page opens on its own calendar — the Schedule frame for that channel, people left, stages right — with the board second and no List lens',
  /<Schedule mode="release" fixedChannel=\{key\} \/>/.test(dept) && /\{ key: 'calendar', label: tx\('Calendar'\), Icon: CalendarRange \}, \{ key: 'board', label: tx\('Board'\), Icon: KanbanSquare \}/.test(dept)
  && !/<BoardList /.test(dept) && /fixedChannel = null/.test(src('client/src/pages/Schedule.jsx')) && /p\.n > 0 \|\| p\.mine/.test(src('client/src/pages/Schedule.jsx')))
// B-04: the release calendar — no eyebrow or "?" on the frame, the overdue work
// one line with the list behind "Show", a card its title and one grey line with
// the stage's colour as the left rule only, a month day three cards and "+N more".
const sched = src('client/src/pages/Schedule.jsx')
const ccal = src('client/src/components/ContentCalendar.jsx')
ok('B-04: the calendar frame carries no eyebrow, the late work is one line with its list behind “Show”, a card is a title and one line',
  !/sch-lead|<PageGuide/.test(sched) && /className="sch-late-say"/.test(sched) && /tx\('\{n\} overdue', \{ n: late\.length \}\)/.test(sched) && /className="sch-late-pop" role="dialog"/.test(sched)
  && /className="sch-rail-hint"/.test(sched) && !/mcal-hint/.test(sched)
  && /className="wk-line"/.test(ccal) && !/st-tint/.test(ccal) && /dayItems\.slice\(0, 3\)\.map/.test(ccal) && /className="cal-more"/.test(ccal)
  && /html\[data-look="coach"\] \.wk-num\.on \{ color: var\(--primary-ink\);/.test(css))
// B-05: the crew's calendar is the one frame — the channels as the admin's
// flat rail on the left, the kinds on the right, the month in one line at the
// top; the drag hint is a toast once, not a sentence.
ok('B-05: the crew’s calendar is the one frame — rails, one line for the month, the drag hint said once',
  /className="card sch-frame sch-mine cc14"/.test(brief) && /className="sch-rail sch-rail-l" aria-label=\{tx\('Channels'\)\}/.test(brief) && /className="sch-rail sch-rail-r" aria-label=\{tx\('Kind'\)\}/.test(brief)
  && /tx\('\{what\} this month', \{ what \}\)/.test(brief) && !/cc-drag-help|cc14-kb|cc14-rail|byNetwork/.test(brief) && /satashkent_cc_dragged/.test(brief)
  && /crewCalendarWith\(<CalendarViews active="mine" \/>\)/.test(brief))
// B-07: projects and campaigns say what is true — "On track" only with a deadline,
// "No owner" quietly, the next campaign's day; an empty board is one quiet line
// with "Add"; a campaign's "0 / 0" meter waits for a target; no "→" in link text.
const projs = src('client/src/pages/Projects.jsx'), pdet = src('client/src/pages/ProjectDetail.jsx'), cdet = src('client/src/pages/CampaignDetail.jsx'), pbits = src('client/src/components/ProjectBits.jsx')
ok('B-07: a project row says what is true, an empty board is one quiet line, a campaign’s meter waits for a target',
  /\(p\.status !== 'in_progress' \|\| p\.deadline\) && <StatusBadge/.test(projs) && /tx\('No owner'\)/.test(projs) && /tx\('Next campaign \{day\}'/.test(projs) && !/tx\('no deadline'\)/.test(projs)
  && /tx\('Add numbers'\)/.test(pdet) && /tx\('Add criteria'\)/.test(pdet) && !/→'\)/.test(pdet) && !/nobody — assign one/.test(pdet)
  && /!\(c\.target > 0\) \? \(canWrite \?/.test(cdet) && /tx\('Add a target'\)/.test(cdet) && !/pc-red/.test(cdet)
  && !/pc-red'\}>\{tx\('no (?:owner|project|dates yet)'\)/.test(pbits) && /: !\(c\.target > 0\) \? null : \(/.test(pbits))   // a checklist item past its day keeps its red: it blocks
// P-01: the phone bar — the crew's middle button is "Hand in" while My Day has
// a step for them (lib/startHere.js), opening the task on its step from any
// page; labels at --fs-xs; a channel slot is its short name.
const layoutSrc = src('client/src/components/Layout.jsx'), mobTabs = src('client/src/components/MobileTabs.jsx')
ok('P-01: the crew’s middle button is “Hand in” when they have a step, the bar’s labels are the small token, a channel slot is short',
  /useStartHere\(\)/.test(layoutSrc) && /label: tx\('Hand in'\), onClick: \(\) => navigate\(`\/brief\?task=\$\{startHere\.id\}&focus=step/.test(layoutSrc) && /middle=\{handIn\}/.test(layoutSrc)
  && /const SHORT_NET = \{ instagram: 'Insta'/.test(layoutSrc) && /label: shortName\(soloChannel\)/.test(layoutSrc)
  && /className="mob-new mob-hand"/.test(mobTabs) && /setStartHere\(f \? \{ id: f\.t\.id, kind: f\.kind \} : null\)/.test(brief)
  && /focus: params\.get\('focus'\) \|\| undefined/.test(brief) && /color: var\(--muted\); font-size: var\(--fs-xs\); font-weight: 600; line-height: 1\.1;/.test(css))
// P-04: the board on a phone — the stage chips one row to swipe, the active one
// near-black, no person line, Filter an icon with a count badge when active.
ok('P-04: on a phone the board’s chips are one row to swipe, the person line is gone, Filter is an icon with a count',
  /const filterN = \['person', 'type', 'stage'\]\.filter\(\(k\) => filter\[k\]\)\.length/.test(dept) && /className="ws-filter-n"/.test(dept) && /className="ws-filter-word"/.test(dept)
  && /\.bp-stages \{ flex-wrap: nowrap; overflow-x: auto; \}/.test(css) && /\.co-dept-meta \{ display: none; \}/.test(css) && /\.ws-filter-word \{ display: none; \}/.test(css))
// P-05: the calendar on a phone — under the strip the day's rows, then "Later
// this week" grouped by day; "Today" a quiet word beside the month, only when away.
ok('P-05: on a phone the week is the strip, the day, then “Later this week”; “Today” is a quiet word beside the month',
  /className="wk-later"/.test(ccal) && /tx\('Later this week'\)/.test(ccal) && /wkDays\.filter\(\(d\) => d > pickedDay && \(byDate\[d\] \|\| \[\]\)\.length\)/.test(ccal)
  && /className="co-link cal-today-q"/.test(ccal) && /\.wk-later-h \{/.test(css))
// N-05: names match doors — one headline a page, in the body (Nekst), saying
// what the sidebar says; the top bar's h1 only on pages without their own.
ok('N-05: one headline a page, in the body, the top bar’s only where a page has none',
  /\{!bodyHeadline && <h1>\{title\}<\/h1>\}/.test(layoutSrc) && /title = t\('nav\.projects'\)/.test(layoutSrc) && !/nav\.projectspage/.test(layoutSrc)
  && /<h1 className="co-title">\{tx\('Calendar'\)\}<\/h1>/.test(sched) && /<h1 className="co-title">\{tx\('Calendar'\)\}<\/h1>/.test(brief)
  && /<header className="co-head co-page-head">\s*<h1 className="co-title">\{dept\.label\}<\/h1>\s*<\/header>/.test(dept)   // 16 Nov 2026, the owner: no eyebrow and no "Head of" line over the channel's name
  && /<h1 className="co-title">\{tx\('Design'\)\}<\/h1>/.test(src('client/src/pages/Design.jsx')) && /<h1 className="co-title">\{tx\('Projects'\)\}<\/h1>/.test(projs)
  && !/<h2 className="up-title">/.test(src('client/src/pages/Uploads.jsx')) && (src('client/src/pages/Uploads.jsx').match(/<h1 className="co-title up-title">/g) || []).length === 2)
// G-02: the previous look's My Day and board carry the door's word as their
// h1 too (the bar's is gone on both routes), and /kit draws its own.
ok('G-02 · N-05: the previous look’s My Day and board have one headline each, and /kit its own',
  /<h1 className="co-title">\{t\('nav\.brief'\)\}<\/h1>/.test(src('client/src/components/CrewDay.jsx'))
  && /\) : \(\s*<header className="co-head co-page-head"><h1 className="co-title">\{dept\.label\}<\/h1><\/header>\s*\)\}/.test(dept)
  && /\/\^\\\/kit\//.test(layoutSrc))
// D-07: the maker's More fold names what is inside, with counts.
ok('D-07: the maker’s More fold says what is inside, with counts',
  /<More note=\{\[/.test(makerPage) && /`\$\{tx\('On its way'\)\} \$\{onWay\.length\}`/.test(makerPage)
  && /moreNote=\{\[doneRows\.length > 0 && `\$\{tx\('What you’ve done'\)\} \$\{doneRows\.length\}`/.test(brief))
// myday-tz §5 A1: the pieces carried over from an earlier month left More — a
// group on the page after Ready to publish, named by the EARLIEST month among
// them, with its count, four rows and "Show all".
ok('A1: carried-over pieces are a group on the page after Ready to publish, named by the earliest month, not inside More',
  !/tx\('Carried over'\)/.test(makerPage) && !/className="sd-fold"[^]*list\('carried'/.test(makerPage.slice(makerPage.indexOf('<More note')))
  && /const fromMonth = carriedMonths\[0\] \|\| ''/.test(makerPage) && /\.filter\(\(m\) => \/\^\\d\{4\}-\\d\{2\}\$\/\.test\(m\)\)\.sort\(\)/.test(makerPage)
  && /label=\{tx\('Carried over from \{month\}', \{ month: monthLongOf\(fromMonth\) \}\)\} n=\{nCarried\}/.test(makerPage)
  && makerPage.indexOf("{groups.slice(0, at).map(section)}") < makerPage.indexOf('id="co-mk-h-carried"')
  && makerPage.indexOf('id="co-mk-h-carried"') < makerPage.indexOf('<More note')
  && /const afterReady = groups\.findIndex\(\(g\) => g\.key === 'ready'\)/.test(makerPage))
// S-04: the spacing scale — from the Coach look's header to the end of the
// sheet, every padding, margin and gap is a token (0 and 1 px stay; a value
// inside calc()/env() and a layout offset of 64 px or more are not rhythm).
{
  // The slice starts where brand-suite's Coach gate starts (`coachAt`): the
  // header block, tokenised by G-01, is in it.
  const mark = css.indexOf('.sd-more { padding: 0; overflow: hidden; }')
  const coachCss = css.slice(mark).replace(/\/\*[\s\S]*?\*\//g, '')
  const raw = []
  for (const m of coachCss.matchAll(/(?:^|[;{\s])((?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap)\s*:\s*([^;}]*)/g)) {
    if (/calc\(|env\(|min\(|max\(|clamp\(/.test(m[2])) continue
    for (const px of m[2].matchAll(/-?(\d+(?:\.\d+)?)px/g)) { const n = Number(px[1]); if (n > 1 && n < 64) raw.push(`${m[1]}: ${m[2].trim()}`) }
  }
  ok('S-04: every padding, margin and gap in the Coach look is a token of the scale', raw.length === 0 && /--sp-1: 4px;/.test(css) && /--sp-12: 48px;/.test(css), raw.slice(0, 5).join(' | '))
  ok('…and the rhythm: sections 32 apart on a desk, 24 on a phone, the gutter 32 and 16',
    /\n\.co \{ gap: var\(--sp-8\); \}/.test(css) && /\.co \{ gap: var\(--sp-6\); \}/.test(css) && /html\[data-look="coach"\] \.content \{ padding: var\(--sp-6\) var\(--sp-8\)/.test(css) && /html\[data-look="coach"\] \.content \{ padding: var\(--sp-4\) var\(--sp-4\)/.test(css))
}
// T-10 drew a reminder in the window's thread as a system line (a grey dot, no face). The
// owner, 9 Nov 2026: "remove the comments from everywhere" (design-variants/
// patch-task-window-3.mjs) — no page draws a thread now, the window included. What T-10
// stood on stays true: Remind still posts the one line, in the reader's language, that the
// once-a-day rule and isRemindLine read off the line itself (in any of the three languages),
// so a thread drawn again later can still tell a reminder from a person's comment.
{
  const parts = src('client/src/components/CoachParts.jsx')
  ok('T-10: no thread in the window (the owner, 9 Nov); a reminder is still the one line, read off the line itself in three languages',
    !/className="co-cmt|co-blk co-talk|comments\.map\(/.test(win)
    && /export const isRemindLine = \(text\) => typeof text === 'string' && text\.startsWith\('@'\)\s*&& \['en', 'ru', 'uz'\]\.some\(\(l\) => text\.endsWith\(` — \$\{phraseIn\(l, REMIND_LINE\)\}`\)\)/.test(parts)
    && /api\.post\(`\/content\/\$\{taskId\}\/comments`, \{ text: `@\$\{person\.name\} — \$\{phraseIn\(person\.lang, REMIND_LINE\)\}`, remind: true \}\)/.test(parts)
    && /<RemindButton user=\{user\} taskId=\{t\.id\}/.test(win))
}
// G-01 (the audit of 31 Oct 2026): the gaps in merged tasks.
{
  const tldsOutside = [...src('client/src/components/StageGate.jsx').matchAll(/type="date"|type="time"/g)].length + [...src('client/src/components/BulkMove.jsx').matchAll(/type="date"|type="time"/g)].length
  ok('G-01 · S-06: no native date or time input is reachable from the board or the calendar; the pickers are the board’s',
    tldsOutside === 0 && /<DayPick /.test(src('client/src/components/StageGate.jsx')) && /<DayPick /.test(src('client/src/components/BulkMove.jsx')) && /<TimePick /.test(src('client/src/components/BulkMove.jsx')))
  // Every toLocaleDateString goes through constants' sayDate; the pay pages
  // are the admin chain's and SprintBacklog retires on 3 Nov, so they wait.
  const direct = src('client/src/components/Chart.jsx') + src('client/src/components/CoachParts.jsx') + src('client/src/components/DeliveryReport.jsx') + src('client/src/components/ProgramsTimeline.jsx')
    + src('client/src/components/Timetable.jsx') + src('client/src/components/AmbassadorTasks.jsx') + brief + src('client/src/pages/Design.jsx') + src('client/src/lib/month.js') + src('client/src/lib/planMonth.js') + src('client/src/pages/Ambassadors.jsx')
  ok('G-01 · S-06: the screens ask constants’ sayDate for a date’s words, never the browser', !/toLocaleDateString/.test(direct) && /export function sayDate\(iso, opts = \{\}\)/.test(src('client/src/lib/constants.js')))
  ok('G-01 · S-08: the builder says why there is nowhere to put a task, and the page rules and the colours are asked again on a widening wait',
    /className="tb-restored tb-nochan" role="status"/.test(src('client/src/components/builder/TaskBuilder.jsx')) && /tx\('Retry now'\)/.test(src('client/src/components/builder/TaskBuilder.jsx'))
    && /const BACKOFF = \[1000, 3000, 10000\]/.test(src('client/src/lib/pages.jsx')) && /failed,\s*retry,/.test(src('client/src/lib/pages.jsx')) && /const BACKOFF = \[1000, 3000, 10000\]/.test(src('client/src/lib/pieceColor.js'))
    && /pagesFailed && !chansFailed/.test(src('client/src/components/CoachNav.jsx')))
  // G-02: the S-06 debt — the pay pages and SprintBacklog say a date through
  // constants too, and the last native date and time boxes outside the full
  // sheet, the previous look's My Day and the retiring Sprints are the board's
  // pickers (DayPick with `past` where a day gone by is the point).
  const late = src('client/src/components/numbers/Pay.jsx') + src('client/src/components/PayHistory.jsx') + src('client/src/pages/SprintBacklog.jsx')
  const lastBoxes = ['client/src/components/CampaignForm.jsx', 'client/src/components/numbers/Pay.jsx', 'client/src/components/ProgramsGantt.jsx', 'client/src/components/ProjectBits.jsx',
    'client/src/components/StatsReport.jsx', 'client/src/components/team/People.jsx', 'client/src/components/team/Workload.jsx', 'client/src/pages/Settings.jsx', 'client/src/pages/settings/Channel.jsx', 'client/src/pages/settings/Pay.jsx', 'client/src/pages/Ambassadors.jsx', 'client/src/pages/Projects.jsx']
    .filter((f) => /type="date"|type="time"/.test(src(f)))
  ok('G-02 · S-06: the pay pages and SprintBacklog say a date through constants, and the last native date and time boxes are the board’s pickers',
    !/toLocaleDateString/.test(late) && lastBoxes.length === 0 && /past = false/.test(src('client/src/components/builder/MiniCalendar.jsx')) && /<DayPick past /.test(src('client/src/components/StatsReport.jsx')), lastBoxes.join(' '))
  ok('G-01 · D-05: the admin’s tour starts with what is stuck', /at: '\.co-ad-seatless, \.co-ad-bands', title: \(\) => tx\('Stuck comes first'\)/.test(src('client/src/components/CoachTour.jsx')))
  ok('G-01 · S-09: the Design board and Workload wear the Coach look’s chips',
    !/className="chip/.test(src('client/src/components/DesignBoard.jsx')) && /<Badge tone="late" icon=\{RotateCcw\}>/.test(src('client/src/components/DesignBoard.jsx')) && /className="co-tag co-tag-face"/.test(src('client/src/components/DesignBoard.jsx'))
    && !/className="chip chip-muted"|chip chip-danger/.test(src('client/src/components/team/Workload.jsx')) && /co-badge co-b-late crew-who-chip/.test(src('client/src/components/team/Workload.jsx')))
  ok('G-01 · S-01: the brand gate starts at the Coach look’s first rule, the fold at the foot of My Day', /cssCode\.indexOf\('\.sd-more \{ padding: 0; overflow: hidden; \}'\)/.test(src('qa/brand-suite.mjs')))
  // The audit of A-01 to A-10 (31 Oct 2026), and N-04's last item.
  // 12 Nov 2026: the panel is Advanced settings (pages/Settings.jsx); History is Settings → Changes.
  const admin = src('client/src/pages/Settings.jsx')
  const changes = src('client/src/pages/settings/Changes.jsx')
  ok('G-01 · N-04: the Tasks list left Settings → Records for the board’s List lens; ?tab=tasks lands there',
    !/key: 'tasks'/.test(admin) && !/function TasksTab/.test(admin) && /get\('tab'\) === 'tasks'/.test(admin) && /\?lens=list/.test(admin))
  ok('G-01 · A-05: History reads in the reader’s language, the task’s name after a colon',
    /return tx\('created the task'\)/.test(src('client/src/lib/activity.js')) && /tx\('changed the \{what\}: \{was\} → \{to\}'/.test(src('client/src/lib/activity.js')) && /\{activityLine\(a\)\}.*: «\{a\.content_title/.test(changes) && !/\{activityLine\(a\)\} on\{' '\}/.test(changes))
  ok('G-01 · A-08: the KPI document under My pay is one row for everybody, opened and replaced from the row',
    /if \(row\) \{/.test(src('client/src/components/KpiDocument.jsx')) && /className="co-link kpi-row-open"/.test(src('client/src/components/KpiDocument.jsx')) && /kpi-row-up/.test(src('client/src/components/KpiDocument.jsx')))
  // G-02: the row is drawn while the list is on its way, and older versions are a press away.
  ok('G-02: the KPI row is drawn while loading, and opens the older versions',
    /docs === null\s*\? <span className="stat-sub" aria-live="polite">…<\/span>/.test(src('client/src/components/KpiDocument.jsx'))
    && /className="co-link kpi-row-older"/.test(src('client/src/components/KpiDocument.jsx')) && /<Modal title=\{tx\('Older versions'\)\}/.test(src('client/src/components/KpiDocument.jsx')))
  ok('G-01 · A-02 / A-09: the Channels row, its modal and the Team labels go through tx',
    // 12 Nov 2026: the channel's window is its own page (Settings → Channels), the choices are The brief's.
    /tx\('Delete «\{name\}»\? Its tasks and numbers are removed too\. This can’t be undone\.'/.test(src('client/src/pages/settings/Channel.jsx')) && /tx\('New channel'\)/.test(src('client/src/pages/settings/Channel.jsx'))
    && /tx\('Settings: \{name\}'/.test(src('client/src/pages/settings/Channels.jsx')) && /tx\('Remove \{choice\}'/.test(src('client/src/pages/settings/Brief.jsx'))
    && /tx\('Copy phone number'\)/.test(src('client/src/components/team/People.jsx')) && /tx\('Admins'\)/.test(src('client/src/components/team/People.jsx')) && /tx\('\{n\} of \{of\} phones set'/.test(src('client/src/components/team/People.jsx')))
  ok('G-01 · the dead role-colour rules and the team card’s ruby rule are gone', !/\.role-badge|\.rb-admin|\.rb-crew/.test(css) && !/\.team-card \{[^}]*border-top: 4px solid var\(--brand-500\)/.test(css))
  ok('G-01 · N-05 cross-check: Profile and Lost files have one headline each', /<h1 className="co-title">\{tx\('Profile'\)\}<\/h1>/.test(src('client/src/pages/Profile.jsx')) && /<h1 className="co-title">\{tx\('Lost files'\)\}<\/h1>/.test(src('client/src/pages/Drops.jsx')) && /\/\^\\\/profile\/, \/\^\\\/drops\//.test(layoutSrc))
}
ok('the Coach’s words, in all three languages',
  said('Start here', 'Начните отсюда', 'Shu yerdan boshlang')
  && said('Your step now', 'Ваш шаг сейчас', 'Hozir sizning qadamingiz')
  && said('After you press:', 'После нажатия:', 'Bosganingizdan keyin:')
  && said('Filming today', 'Снимаем сегодня', 'Bugun suratga olinadi')
  && said('Ready to publish', 'Готово к публикации', 'Nashrga tayyor')
  && said('You said you can’t', 'Вы отказались', 'Siz rad etdingiz'))

// The description of the look is kept true.
// the demo repository ships without CLAUDE.md (the working notes stay with the team's repository)
const guide = existsSync(ROOT + '/CLAUDE.md') ? src('CLAUDE.md') : null
if (guide) ok('CLAUDE.md describes the Coach look and names its parts', /## The Coach look/.test(guide) && /lib\/coach\.js/.test(guide) && /CoachTask/.test(guide) && /qa\/coach-suite\.mjs/.test(guide))
ok('the deploy gate runs this suite', /run coach-suite/.test(src('qa/ci.sh')))

// Round 20 (3 Nov 2026): the brief is changed where it is read, and Edit is the
// full form again. The owner: "press the box with the script and change it, not
// Edit and then another window — where is the simplification?"
const css20 = src('client/src/styles.css')
// Task 7 (12 Nov 2026, design-variants/task-window-tz.md, the owner's hint: "an admin's click on the script
// starts editing it at once with nothing else in the window changing"): the brief is a field in place.
const field7 = src('client/src/components/edit/Field.jsx')
const tcss7 = src('client/src/styles-task.css')
ok('T7: a press on the ТЗ, the script or the post copy is a textarea in the same box, the caret where the press was',
  /caretPositionFromPoint/.test(field7) && /caretRangeFromPoint/.test(field7) && /className="tw-long-in"/.test(field7)
  && /<LongField taskId=\{t\.id\}[^>]*\bfield=\{k\}/.test(win) && !/co-can-edit|co-brief-pen|startBrief/.test(win))
ok('T7: Esc closes the box and not the window, Ctrl+Enter saves, typed words ask “Keep the draft / Discard”, and the draft is kept per task',
  /e\.key === 'Enter' && \(e\.metaKey \|\| e\.ctrlKey\)/.test(field7) && /e\.key === 'Escape'\) \{\s*e\.preventDefault\(\); e\.stopPropagation\(\)/.test(field7)
  && /tx\('Keep the draft'\)/.test(field7) && /tx\('Discard'\)/.test(field7) && /satashkent_draft_\$\{task\}_\$\{field\}/.test(field7))
ok('T7: only whoever may change a value gets a button (lib/mayChange.js mirrors the server); everybody else reads text',
  /import \{ mayChange, stageOf \} from '\.\.\/lib\/mayChange\.js'/.test(win) && /mayChange\(user, t, field, stage[,)]/.test(win)
  && /if \(!may\) return <Tag className=\{`tw-ro/.test(field7))
ok('T7: one PATCH per commit with an Undo line; the long text carries its version and the server refuses a stale one (409)',
  /const patchField = async \(body, field, opts = \{\}\) =>/.test(win) && /if_updated_at: opts\.since/.test(win) && /setFieldUndo\(\{ field, before, until: Date\.now\(\) \+ UNDO_MS \}\)/.test(win)
  && /error: 'Changed while you typed', conflict: true/.test(src('server/routes/content.js')))
ok('T7: the plan rows save in place, each value its own field',
  /<TaskPlan t=\{t\}/.test(win) && /onPatch=\{\(body, field\) => patchField\(body, field\)\}/.test(win))
ok('T7: the read view wears tokens only; on touch it is 44 px with a dashed underline, never hover-only',
  /@media \(pointer: coarse\)/.test(tcss7) && /text-decoration: underline dashed var\(--hairline-strong\)/.test(tcss7) && !/#[0-9a-fA-F]{3,8}\b/.test(tcss7))

// The full form is what Edit opens, so it keeps the accessibility floor (S-07): every date and
// time box and the campaign list say what they are, and a past day in the timetable is
// dimmed without opacity, which cut its text to 2:1.
const cm20 = src('client/src/components/ContentModal.jsx')
ok('R20: the edit form’s date, start, end and campaign boxes are named, and the timetable and the booking’s Yes read at 4.5:1',
  /type="date" disabled=\{disabled \|\| shut\} value=\{form\[dateKey\]\} aria-label=\{tx\(label\)\}/.test(cm20)
  && /aria-label=\{`\$\{tx\(label\)\}: \$\{endKey \? tx\('From'\) : tx\('Time'\)\}`\}/.test(cm20)
  && /data-tip=\{tx\('To'\)\} step=\{1800\} aria-label=\{`\$\{tx\(label\)\}: \$\{tx\('To'\)\}`\}/.test(cm20)
  && /aria-label=\{tx\('Campaign'\)\}/.test(cm20)
  && /\.tt-past \{ filter: saturate\(\.35\); \}/.test(css20) && !/\.tt-past \{ opacity/.test(css20)
  && /\.bk-said\.bk-yes \{ color: color-mix\(in srgb, var\(--ok, #1D9E75\) 70%, var\(--near-black\)\); \}/.test(css20))

// 12 Nov 2026 (the owner): the task window's head is the title and one quiet line; the icons read from the corner
// inward (More · Copy link · Delete · ×); a phone keeps Copy link and Delete inside More; folds open by default again;
// one file alone has no name-and-size line; folded on a desk the menu leaves and the bar's three lines + logo bring it back.
{
  const ct = src('client/src/components/CoachTask.jsx'), lay = src('client/src/components/Layout.jsx'), mg = src('client/src/components/MediaGrid.jsx')
  const tcss = src('client/src/styles-task.css'), css = src('client/src/styles.css')
  const at = (re) => { const m = re.exec(ct); return m ? m.index : -1 }
  const more = at(/className="co-x tw-ib tw-more-btn"/), link = at(/onClick=\{copyLink\} aria-label=\{tx\('Copy link'\)\}/), del = at(/className="co-x tw-ib tw-del-ib"/), x = at(/className="co-x tw-close"/)
  ok('The head: no channel tile, one quiet line under the title; the icons More · Copy link · Delete · × in one row',
    !/r14-tw-kt co-kic tw-chan/.test(ct) && /className="tw-meta tw-meta-line"/.test(ct) && more > 0 && more < link && link < del && del < x
    && /\.r14-tw \.r14-tw-h \{ grid-template-columns: minmax\(0, 1fr\) auto;/.test(css) && !/\.r14-tw \.r14-tw-h \{ align-items: center; \}/.test(css))
  ok('A phone: Copy link and Delete are items of More; the menu is a sheet at the bottom, never off the screen',
    /phone && at >= 0 && \{ key: 'link'/.test(ct) && /phone && may\('delete'\) && at >= 0 && \{ key: 'del'/.test(ct)
    && /\.r14-tw \.r14-tw-h \.tw-acts \.tw-menu \{ left: var\(--sp-3\); right: var\(--sp-3\); top: auto; bottom:/.test(tcss))
  ok('Delete’s question: Cancel takes the keyboard first; Esc and Cancel give it back to the Delete icon on a desk',
    /\.tw-sure \.co-btn-q'\)\?\.focus/.test(ct) && /if \(phone\) setSure\(false\); else shutMenu\(\)/.test(ct) && /aria-label=\{sure \? tx\('Delete this task\?'\) : tx\('More'\)\}/.test(ct))
  ok('Plan, Brief, the files open by default (a new key lets the old folds go); one file has no name-and-size line',
    /const SHUT_KEY = 'satashkent_tw_shut2'/.test(ct) && !/tw-facts/.test(mg) && !/tw-facts/.test(css) && /if \(n === 1\) return \{ single: true \}/.test(mg)
    && /\.tw-grid\.tw-single \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css))
  ok('Folded on a desk the menu leaves; the bar’s three lines and the logo (home) bring it back, and the keyboard follows',
    /const rail = simple && sideOff && desk/.test(lay) && /!\(simple && phone\) && !rail && \(/.test(lay) && /className="side-toggle co-side-open"/.test(lay)
    && /className="logo-link co-side-logo"[^\n]*<LogoLockup/.test(lay) && /requestAnimationFrame\(\(\) => document\.querySelector\('\.co-side-open, \.co-nv-foldbtn'\)\?\.focus/.test(lay))
}

console.log(fails ? `\n${fails} FAILED` : '\nThe Coach look holds.')
process.exit(fails ? 1 : 0)
