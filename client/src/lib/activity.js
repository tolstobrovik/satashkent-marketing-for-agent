import { tr as tx } from './i18n.jsx'

// Turning an activity row into a sentence: "changed the shoot start: 10:00 →
// 11:00". The server writes names and stage labels down at the moment of the
// change, so rendering needs no lookups — old rows keep reading correctly
// after people leave or stages get renamed. Every word goes through tx
// (G-01, the audit of A-05): History read English under every language.
const WORDS = {
  stage: 'stage', title: 'title', type: 'type', platforms: 'platforms', owners: 'owners',
  operator: 'operator', editor: 'editor', designer: 'designer',
  recording_date: 'shoot day', recording_time: 'shoot start', recording_end: 'shoot end',
  edit_ready_date: 'edit deadline', design_ready_date: 'design deadline',
  release_date: 'release day', release_time: 'release time',
  description: 'description', format: 'format', rubrika: 'rubrika', script: 'script',
  reference: 'reference', photo: 'cover photo', checklist: 'checklist',
  ready_link: 'ready link', shot_link: 'footage link', design_link: 'design link',
  telegram_type: 'Telegram item type',
  // the keys logPatch writes that had no word, read raw in every language ("обновил(а) tz")
  tz: 'ТЗ', reviewer: 'reviewer', post_link: 'post link', reference_text: 'reference', reference_links: 'reference',
  edit_due_revised: 'revised edit deadline', review_due_revised: 'revised review deadline',
}

export function activityLine(a) {
  if (a.kind === 'created') return tx('created the task')
  if (a.kind === 'deleted') return tx('deleted the task')
  const f = a.field
  if (f === 'done') return a.new_value === 'yes' ? tx('marked it done') : tx('reopened it')
  if (f === 'pinned') return a.new_value === 'yes' ? tx('pinned it') : tx('unpinned it')
  if (f === 'pravki') return a.new_value ? tx('sent it back for pravki ({what})', { what: a.new_value }) : tx('sent it back for pravki')
  if (f === 'approved') return tx('approved the edit')
  if (f === 'guiding') return a.new_value === 'yes' ? tx('marked it a guiding post') : tx('unmarked it as a guiding post')
  if (f === 'reposts') return a.new_value ? tx('set it to go on to {where} too', { where: a.new_value }) : tx('took TikTok and Shorts off it')
  if (f === 'with_media') return a.new_value === 'yes' ? tx('said the post has a video or a picture') : tx('said the post is text only')
  if (f === 'pravka_override') return tx('forced a pravka past the lock (admin override)')
  // Paperwork reads as an act, not a field change: "attached ТЗ.docx".
  if (f === 'document') return a.new_value ? tx('attached {file}', { file: a.new_value }) : tx('removed {file}', { file: a.old_value })
  const w = WORDS[f] ? tx(WORDS[f]) : f
  // a stage's name is a phrase of the board (Idea, To shoot, Editing, Ready, Published): read in the reader's language,
  // like everywhere else it is drawn (the i18n gate, 16 Nov 2026: "Ready → Editing" on a Russian screen)
  const val = (v) => (f === 'stage' && v != null ? tx(String(v)) : v)
  // a long text: its line may hold the version before (to copy from, in the task's History) — never quoted here
  if (a.old_value == null && a.new_value == null || ['description', 'script', 'tz'].includes(f)) return tx('updated the {what}', { what: w })
  if (a.old_value == null) return tx('set the {what} to {to}', { what: w, to: val(a.new_value) })
  if (a.new_value == null) return tx('cleared the {what} (was {was})', { what: w, was: val(a.old_value) })
  return tx('changed the {what}: {was} → {to}', { what: w, was: val(a.old_value), to: val(a.new_value) })
}
