// Who may change which field of a task, in one place (task-merge-tz.md §2; task-window-tz.md §2.6): the window draws a
// read-view button only where this says true or 'ask', and plain text everywhere else. Mirrored from the server's PATCH
// gates in server/routes/content.js (read, not invented — the citations are the server's lines); the server stays the
// judge, and a refusal is shown at the field in its words. Pure: no React, so design-variants/mayChange.test.mjs runs it.
//
//   mayChange(user, task, field, stage, { filmed }) → true | false | 'ask'
//   stage: 'idea' | 'frozen' (To shoot … Editing: datesFrozenAt) | 'after' (review, ready) | 'done' | 'deleted'
//   filmed: makingOf(task).filmed (the server's filmedPiece) — only a filmed piece's empty day to post is filled late.
//   stageOf(task, pipe) reads it the way the window does (pipe.live, pipe.shoot, pipe.review, pipe.dead).

// canTouch (content.js:325-331): an admin over one of its channels, anybody on one of its channels, an owner, its crew.
export const adminOnIt = (user, t) => {
  if (user?.role !== 'admin') return false
  const runs = user.admin_channels || []
  return runs.length === 0 || (t.channels || []).some((c) => runs.includes(c))
}
export const ownersOfIt = (t) => (t.assignees?.length ? t.assignees : [t.assignee_id]).filter((x) => x != null)
const seatsOf = (user, t) => ['operator_id', 'editor_id', 'designer_id'].filter((k) => t[k] != null && t[k] === user?.id)
export const reaches = (user, t) => !!user && (adminOnIt(user, t)
  || (t.channels || []).some((c) => (user.departments || []).includes(c))
  || ownersOfIt(t).includes(user.id)
  || seatsOf(user, t).length > 0)
// can(user, perm) (auth.js:201-203): every admin; a member by their permissions (all on by default); crew never.
const perm = (user, p) => user?.role === 'admin' || !!(user?.permissions && user.permissions[p])
// canAccessDept (auth.js:194-197): a full admin, else the channel is one of theirs or one they run.
const opensChan = (user, c) => (user?.role === 'admin' && !(user.admin_channels || []).length)
  || (user?.departments || []).includes(c) || (user?.role === 'admin' && (user.admin_channels || []).includes(c))
// An accepted booking (BOOKINGS :507-518, the gate :4141-4152): once its holder said yes, only the admin over the
// channels moves its seat, day or hours.
const BOOKED = [
  { ack: 'shoot_ack', day: 'recording_date', fields: ['operator_id', 'recording_date', 'recording_time', 'recording_end'] },
  { ack: 'edit_ack', day: 'edit_ready_date', fields: ['editor_id', 'edit_ready_date'] },
]

const TEXT = new Set(['title', 'type', 'description', 'script', 'tz', 'format', 'rubrika', 'reference_text', 'reference_links',
  'recording_time', 'recording_end', 'release_time', 'channels', 'telegram_type', 'faces', 'campaign_id'])
const SEATS = new Set(['operator_id', 'editor_id', 'designer_id', 'reviewer_id', 'reviewers'])
export const DAYS = ['recording_date', 'edit_ready_date', 'design_ready_date', 'release_date']   // LOCKED_DATES
const DAY_SEAT = { recording_date: 'operator_id', edit_ready_date: 'editor_id', design_ready_date: 'designer_id' }

export function mayChange(user, t, field, stage, { filmed = false } = {}) {
  if (!user || !t || stage === 'deleted' || !reaches(user, t)) return false
  const here = adminOnIt(user, t)
  const owner = ownersOfIt(t).includes(user.id)
  const seats = seatsOf(user, t)
  // date-requests :3220-3221: the holder of a seat's day may ask; for the release day only the two rights count (the
  // owner's word moves it at once, ownDay :3229, but only once past that gate)
  const mayAsk = (DAY_SEAT[field] && t[DAY_SEAT[field]] === user.id) || perm(user, 'manage_content') || perm(user, 'move_tasks')
  if (!here) {
    const b = BOOKED.find((x) => t[x.ack] === 'yes' && x.fields.includes(field))
    if (b) return field === b.day && t[field] && mayAsk ? 'ask' : false                         // 409 "has already agreed"
  }
  if (TEXT.has(field)) return perm(user, 'manage_content')                                     // :3817-3821, :3766-3814
  if (SEATS.has(field)) return perm(user, 'manage_content')                                    // :4082, :4094-4107
  if (DAYS.includes(field)) {
    if (here) return true                                                                       // adminHere moves any day
    const mayMove = perm(user, 'manage_content') || perm(user, 'move_tasks')                   // :4037-4038
    if (stage === 'idea') return true                                                          // any canTouch on an idea
    const empty = !t[field] || (field === 'release_date' && !!t.release_born)
    if (stage === 'frozen') {
      // the frozen band: nobody but the admin sets a day; a filmed piece's empty or born release day may be filled
      // (askedLate :4041 needs filmedPiece) — anything else that holds a day is asked for
      if (field === 'release_date' && empty && filmed && mayMove) return true
      return t[field] && mayAsk ? 'ask' : false                                                 // :4043-4050
    }
    // past the band: an empty day may be filled by whoever may move dates; a promised one is asked for (:4051-4058)
    if (empty) return mayMove
    return mayAsk ? 'ask' : false
  }
  if (field === 'shot_link') return seats.includes('operator_id') || perm(user, 'manage_content') || perm(user, 'deliver_work')   // :3688-3699
  if (field === 'design_link') return seats.includes('designer_id') || perm(user, 'manage_content') || perm(user, 'deliver_work')
  if (field === 'ready_link') return seats.length > 0 || perm(user, 'manage_content')         // :3674-3682 (deliver_work not accepted)
  if (field === 'post_link') return true                                                       // any canTouch :3715-3728
  if (field === 'checklist') return perm(user, 'manage_content') || owner                     // :4057-4062
  if (field === 'views' || field === 'skip_rate') return here || owner                         // :3579-3617
  if (field === 'with_media') return perm(user, 'manage_content') || owner                    // :3953-3966
  if (field === 'owners') return here                                                          // :4212-4234
  if (field === 'duplicate') return perm(user, 'manage_content')                              // POST /:id/duplicate :1749-1755:
    && (t.channels || []).every((c) => opensChan(user, c))                                    // every channel of it, not one
  if (field === 'delete') return here || perm(user, 'manage_content')                         // DELETE /:id :5293 (reach checked above)
  return false
}

// The stage as mayChange reads it, off the board's pipeline (lib/coach.js's `pipe`): the idea ends at the shoot gate
// (else the first column); the frozen band is the shoot gate up to (not including) the review gate. Only a killed
// piece (pipe.dead) is 'deleted': no stage, or one the board lost, is an idea to the server (isIdeaStage :1320-1324).
export function stageOf(t, pipe) {
  if ((pipe?.dead || []).includes(t.status_id)) return 'deleted'
  if (t.done_at) return 'done'
  const at = (pipe?.live || []).findIndex((s) => s.id === t.status_id)
  if (at < 0) return 'idea'
  const ideaEnd = pipe.shoot >= 0 ? pipe.shoot : 1
  if (at < ideaEnd) return 'idea'
  if (pipe.shoot >= 0 && at >= pipe.shoot && (pipe.review < 0 || at < pipe.review)) return 'frozen'
  return 'after'
}
