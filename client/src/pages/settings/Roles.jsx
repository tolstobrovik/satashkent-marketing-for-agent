// Roles (12 Nov 2026, design-variants/admin-tz.md §0 #5 and #10, §2.1): the
// Admin panel's Pages table and its Stage rules table, read by role. A role's
// page holds the pages in its menu and the stages it may move a task on from,
// a switch each, saved at once with Undo. Nothing new is stored: the switches
// write the same /fields `pages` + `page_audience` and the same
// /statuses/rules cells the two tables wrote.
//   /admin/roles         Members · Editors · Operators · Designers
//   /admin/roles/:role   one role (member, editor, operator, designer)
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Clapperboard, Palette, Scissors, User } from 'lucide-react'
import { api } from '../../lib/api.js'
import { toast } from '../../lib/toast.js'
import { tr as tx } from '../../lib/i18n.jsx'
import { Group, Page, Row, SwitchRow, useFields } from './parts.jsx'

// The four kinds of account a page can be aimed at (Admin.jsx AUDIENCE_DEFS
// minus "Only admins": admins have every page and move every task). The keys
// are the audience words and the stage rules' actors (STAGE_ACTORS) alike.
const ROLES = [
  { key: 'member', label: 'Members', icon: User },
  { key: 'editor', label: 'Editors', icon: Scissors },
  { key: 'operator', label: 'Operators', icon: Clapperboard },
  { key: 'designer', label: 'Designers', icon: Palette },
]
const ROLE_KEYS = ROLES.map((r) => r.key)
// The server's order of audience words (PAGE_AUDIENCES), so what is kept here
// is byte for byte what the server answers back.
const AUDIENCE_ORDER = ['admin', ...ROLE_KEYS]

// Every page an admin can switch off (Admin.jsx PAGE_DEFS), Sprints left out:
// it is in no menu and retiring.
const PAGES = [
  { key: 'releases', label: 'Master Calendar', hint: 'everything going out, every channel' },
  { key: 'recordings', label: 'Recordings', hint: 'what is being filmed, every channel' },
  { key: 'missed', label: 'Numbers', hint: 'the month, who is late, and the pay — one page with three tabs' },
  { key: 'design', label: 'Design', hint: 'the designer’s own board' },
  { key: 'docs', label: 'My pay', hint: 'what the month is worth to each person, with the KPI document, under their profile' },
  { key: 'projects', label: 'Projects', hint: 'projects and the campaigns under them' },
  { key: 'team', label: 'Team', hint: 'the people, their workload and their access — one page with three tabs' },
]

// A page is in a role's menu when it is on at all and its audience is empty
// (everybody) or names the role. An audience of only "admin" names no role.
function pageOn(fields, page, role) {
  if ((fields.pages || {})[page] === false) return false
  const aud = (fields.page_audience || {})[page] || []
  return aud.length === 0 || aud.includes(role)
}

// The ТЗ's mapping, both ways, onto the stored pair.
//  on:  a page off for everybody comes back for this role alone; an aimed page
//       adds the role ("Only admins" gives way to it); four roles ticked is
//       everybody again, the state the page was in before it was aimed.
//  off: a page for everybody is aimed at the other three; an aimed page loses
//       the role, and with nobody left it is switched off.
function withPage(fields, page, role, on) {
  const pages = { ...(fields.pages || {}) }
  const auds = { ...(fields.page_audience || {}) }
  let aud = auds[page] || []
  if (on) {
    if (pages[page] === false) { pages[page] = true; aud = [role] }
    else if (aud.length) {
      aud = [...aud.filter((a) => a !== 'admin' && a !== role), role]
      if (ROLE_KEYS.every((r) => aud.includes(r))) aud = []
    }
  } else if (pages[page] !== false) {
    if (!aud.length) aud = ROLE_KEYS.filter((r) => r !== role)
    else {
      aud = aud.filter((a) => a !== role)
      if (!aud.length) pages[page] = false
    }
  }
  auds[page] = AUDIENCE_ORDER.filter((a) => aud.includes(a))
  return { ...fields, pages, page_audience: auds }
}

const countOn = (fields, role) => PAGES.filter((p) => pageOn(fields, p.key, role)).length
// Back from a sub-page, the row that was pressed takes the focus (Row does it
// as it mounts) — but Page then moves it to the headline, as on any arrival.
// Remember the row in a layout effect and hand the focus back after Page's
// effect has run (a parent's effects run after its children's).
function useRowFocusBack() {
  const row = useRef(null)
  useLayoutEffect(() => { const a = document.activeElement; if (a?.classList?.contains('co-st-row')) row.current = a }, [])
  useEffect(() => { row.current?.focus({ preventScroll: false }) }, [])
}

const pagesWord = (n) => (n === 1 ? tx('1 page') : tx('{n} pages', { n }))

export default function Roles() {
  const f = useFields()
  return (
    <Routes>
      <Route index element={<List fields={f.fields} />} />
      <Route path=":role" element={<Role {...f} />} />
      <Route path="*" element={<Navigate to="/admin/roles" replace />} />
    </Routes>
  )
}

function List({ fields }) {
  useRowFocusBack()
  return (
    <Page title={tx('Roles')} sub={tx('Admins see every page and may move every task.')}>
      <Group>
        {ROLES.map((r) => (
          <Row key={r.key} id={`role-${r.key}`} to={`/admin/roles/${r.key}`} icon={r.icon} label={tx(r.label)}
            value={fields ? pagesWord(countOn(fields, r.key)) : ''} />
        ))}
      </Group>
    </Page>
  )
}

// The stages and who may move a task out of each (GET /statuses/rules answers
// the effective matrix; POST stores the whole matrix, as the table did).
function useStageRules() {
  const [stages, setStages] = useState(null)
  const [rules, setRules] = useState(null)
  const load = useCallback(() => Promise.all([
    api.get('/statuses').then(setStages),
    api.get('/statuses/rules').then(setRules),
  ]).catch((e) => toast(e.message, 'err')), [])
  useEffect(() => { load() }, [load])
  const save = useCallback(async (next, prev, said = tx('Saved')) => {
    setRules(next)
    try {
      await api.post('/statuses/rules', next)
      toast(said, 'ok', prev ? { label: tx('Undo'), onClick: () => save(prev, null, tx('Put back')) } : null)
    } catch (e) { toast(e.message, 'err'); load() }
  }, [load])
  return { stages, rules, save }
}

function Role({ fields, save }) {
  const { role } = useParams()
  const def = ROLES.find((r) => r.key === role)
  const st = useStageRules()
  if (!def) return <Navigate to="/admin/roles" replace />
  const moveOut = (sid) => {
    const cur = st.rules[def.key] || {}
    st.save({ ...st.rules, [def.key]: { ...cur, [sid]: !cur[sid] } }, st.rules)
  }
  const open = (st.stages || []).filter((s) => !s.is_final)
  return (
    <Page title={tx(def.label)} back="/admin/roles">
      {fields && (
        <div className="co-st-roomy">
          <Group title={tx('In their menu')}>
            {PAGES.map((p) => (
              <SwitchRow key={p.key} tile={false} label={tx(p.label)} sub={tx(p.hint)} on={pageOn(fields, p.key, def.key)}
                onChange={(v) => save(withPage(fields, p.key, def.key, v), fields)} />
            ))}
          </Group>
        </div>
      )}
      {st.rules && open.length > 0 && (
        <Group title={tx('Can move a task on from')}>
          {open.map((s) => (
            <SwitchRow key={s.id} tile={false} label={tx(s.label)} on={!!st.rules[def.key]?.[s.id]} onChange={() => moveOut(s.id)} />
          ))}
        </Group>
      )}
    </Page>
  )
}
