import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LogOut, Home, CalendarDays, ChevronDown, Search, X, Menu, GripVertical, Moon, Sun, Languages, Volume2, VolumeX, LayoutGrid, MoreHorizontal, Check, Scissors, Star, Sparkles, Palette, RotateCcw, ArrowUp, ArrowDown, Plus, Briefcase, Settings, Settings2, Folder, Megaphone, Film, Camera, Clapperboard, Mic, PenLine, Image as ImageIcon, Globe, MapPin, Flag, GraduationCap, BookOpen, Users, Heart, Zap, Target, Trophy, Calendar, Layers } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import Logo, { LogoLockup } from './Logo.jsx'
import Avatar from './Avatar.jsx'
import { ChanMark } from './CoachBits.jsx'
import { useChannels, useChannelCounts } from '../lib/channels.jsx'
import { usePages } from '../lib/pages.jsx'
import { useT, tr as tx, LANGS } from '../lib/i18n.jsx'
import { api } from '../lib/api.js'
import { toast } from '../lib/toast.js'
import { act } from '../lib/track.js'
import { soundsOn, setSounds } from '../lib/sound.js'
import { resolvedTheme, setDark } from '../lib/theme.js'
import { readFolded, writeFolded, readHoldHint, doneHoldHint, layoutFor, shownItems, stored, find, flatten, foldersBeside, moveItem, intoFolder, outOfFolder, makeFolder, folderWith, moveFolder, renameFolder, setIcon, dissolve, folderOf, topIndexOf, landing, readPersonalLayout, writePersonalLayout, SEEDS, FOLDER_ICONS, NAME_MAX } from '../lib/navOrder.js'
import '../styles-nav.css'

// ---- the Coach look's menus (S2, 11 November 2026; the owner's review, round 2) ----
//
// The desk: a 320 px column of cards on the light-grey ground, read top to
// bottom as the person (avatar, name, job — it opens the profile), My Day ·
// Calendar, the channels in their groups (Design first among the core ones),
// and one card at the foot: Language, Dark mode, Sound, the doors this person
// has (Team, Numbers, Projects, Ambassadors…) and Settings last. A row is its
// tile and its name — no arrow, no line between rows; the one disclosure is a
// group's header. Searching is Quick find (Ctrl/⌘+K), not a field here.
// Signing out is on the profile page. Channels are dragged into order — an
// admin's drag is the board's (the server's `sort`), anybody else's their own.
//
// Folded, the column is a 56 px rail of 40 px tiles: the mark, the person,
// the day, the calendar, the channels, the doors — icons alone, no counts
// drawn (each tile's name still says what is late).
//
// The phone (under 640 px): a tab bar My Day · Calendar · Channels · Find ·
// More; Channels and More come up as sheets from the bottom, in the same order.
//
// Every class starts co-nv; the styles are styles-nav.css, tokens only.

// What a person is, in plain words. The account's `role` is the server's word
// ("member", "crew"), not something anybody calls themselves.
const JOBS = { editor: 'Editor', operator: 'Operator', designer: 'Designer' }
export const jobOf = (user) => {
  if (user.role === 'admin') return tx('Administrator')
  if (user.role === 'member') return tx('Content maker')
  const jobs = (user.crew_roles || []).length ? user.crew_roles : [user.role]
  return jobs.filter((j) => JOBS[j]).map((j) => tx(JOBS[j])).join(' · ')
}

const Tile = ({ children }) => <span className="co-nv-tile">{children}</span>
const icon = (I) => <I size={18} strokeWidth={1.75} aria-hidden="true" />

// The doors this person has, read off the same `groups` the previous look
// draws (Sidebar.jsx): the day, one Calendar, Design (drawn with the
// channels), then Team, Numbers, Projects and whatever else their account
// opens, Settings last.
export function useNavDoors(user, groups) {
  return useMemo(() => {
    const all = [...groups.work, ...groups.numbers, ...groups.people]
    const pick = (key) => all.find((it) => it.key === key)
    const day = { ...pick('brief'), icon: Home, end: true }
    const crewSeat = ['editor', 'operator', 'designer', 'crew'].includes(user.role)
    const master = pick('releases') || pick('recordings')
    const cal = crewSeat
      ? { key: 'mycal', to: '/brief/calendar', label: tx('Calendar'), icon: CalendarDays }
      : master && { ...master, label: tx('Calendar'), icon: CalendarDays }
    // Design is a board of everyone's: whoever can open it (the page switch, `shows('design')`) sees it among the channels.
    const design = pick('design') ? { ...pick('design'), icon: Palette } : null
    const below = [pick('team'), pick('numbers'), pick('projects'), pick('ambassadors')].filter(Boolean)
    const drawn = new Set(['brief', 'releases', 'recordings', 'design', 'admin', ...below.map((it) => it.key)])
    const rest = all.filter((it) => !drawn.has(it.key))
    // Settings (the admin panel) is a gear at the foot of the menu, not the shield of a door.
    const settings = pick('admin') ? { ...pick('admin'), icon: Settings2 } : null
    // Management: the four doors a person has, then whatever else their account opens (Uploads with its badge…).
    return { day, cal, design, manage: [...below, ...rest], settings }
  }, [user, groups])
}

const useHere = () => {
  const { pathname } = useLocation()
  const at = (to) => pathname === to || pathname.startsWith(`${to}/`)
  const here = (it) => (it.end ? pathname === it.to : at(it.to) || (it.also || []).some(at))
  return { pathname, at, here }
}

// ---- a row that leads somewhere: its tile and its name ----
function DoorRow({ it, on, onNavigate, extra = null }) {
  return (
    <Link to={it.to} className={'co-nv-row' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={onNavigate}>
      <Tile>{icon(it.icon)}</Tile>
      <span className="co-nv-t">{it.label}</span>
      {extra}
    </Link>
  )
}

const stillMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }
const fingers = () => { try { return matchMedia('(pointer: coarse)').matches } catch { return false } }

// ---- a card, and the one selection pill it holds ----
// The chosen row's ruby fill is not the row's own background but one pill per
// card (`.co-nv-ind`), so a change of page within a card moves it: FLIP — it is
// where it was, then slides to the new row (transform, 200 ms). A pill arriving
// from another card fades in (120 ms); nothing animates on first paint; under
// reduced motion it jumps. The rows only change their ink and weight.
export function Card({ className = '', cardRef = null, children, ...rest }) {
  const box = useRef(null)
  const pill = useRef(null)
  const was = useRef(null)          // { top, h } the pill was drawn at, or null
  const painted = useRef(false)
  const measure = () => {
    const card = box.current; const p = pill.current
    if (!card || !p) return
    // A card that is not laid out (its group folded, `hidden`) is measured when it is shown again (the observer below):
    // a row of 0 × 0 is no place for the pill.
    if (!card.offsetHeight) return
    const on = [...card.querySelectorAll('.co-nv-row.on')].find((r) => r.closest('.co-nv-card') === card) || null
    if (!on) {
      if (was.current) { p.style.transition = painted.current && !stillMotion() ? 'opacity 120ms var(--ease-out)' : 'none'; p.style.opacity = '0' }
      was.current = null; painted.current = true
      return
    }
    const top = on.offsetTop; const h = on.offsetHeight
    if (!h) return
    if (was.current && was.current.top === top && was.current.h === h) return
    p.style.height = `${h}px`
    if (was.current && painted.current && !stillMotion()) {
      p.style.transition = 'transform 200ms var(--ease-out)'      // slides from its old row
    } else if (!was.current && painted.current && !stillMotion()) {
      p.style.transition = 'opacity 120ms var(--ease-out)'        // arrives from another card
      p.style.transform = `translateY(${top}px)`; p.style.opacity = '0'
      void p.offsetHeight
    } else p.style.transition = 'none'                             // first paint, or reduced motion: no motion
    p.style.transform = `translateY(${top}px)`
    p.style.opacity = '1'
    was.current = { top, h }; painted.current = true
  }
  useLayoutEffect(measure)
  // A card shown again (its group opened) or resized does not re-render: measure on its size changing.
  useEffect(() => {
    const card = box.current
    if (!card || typeof ResizeObserver !== 'function') return undefined
    const ro = new ResizeObserver(() => measure())
    ro.observe(card)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const setRef = (el) => { box.current = el; if (typeof cardRef === 'function') cardRef(el); else if (cardRef) cardRef.current = el }
  return (
    <section className={`co-nv-card ${className}`.trim()} ref={setRef} {...rest}>
      <span className="co-nv-ind" ref={pill} aria-hidden="true" />
      {children}
    </section>
  )
}

// ---- folding without a jump: grid rows 1fr → 0fr (200 ms), then `hidden` ----
// While shut or shutting the rows are `inert` (out of the tab order at once);
// `hidden` follows the transition. Reduced motion: no height change, at once.
export function Collapse({ open, id, className = '', children }) {
  const [mounted, setMounted] = useState(open)
  const [shut, setShut] = useState(!open)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return undefined }
    if (open) {
      setMounted(true)
      if (stillMotion()) { setShut(false); return undefined }
      // drawn shut first (hidden lifted), then opened: two frames so the 0fr is painted before the 1fr
      let b = 0
      const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setShut(false)) })
      return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
    }
    setShut(true)
    if (stillMotion()) { setMounted(false); return undefined }
    const t = setTimeout(() => setMounted(false), 220)
    return () => clearTimeout(t)
  }, [open])
  return (
    <div id={id} className={`co-nv-fw${shut ? ' shut' : ''} ${className}`.trim()} hidden={!mounted} inert={shut ? '' : undefined}>
      <div className="co-nv-fi">{children}</div>
    </div>
  )
}

// Opening a folded group puts the light on it (the owner, 15 Nov 2026: "focus on that folder only"): the other
// groups fall back — dimmed and a touch blurred — for a moment, then return. A class on the column, cleared by a
// timer; the motion is the look's spring, and reduced motion keeps only the dimming.
// The fog (the owner, 16 Nov 2026: "the blur should stay until I close the folder; My Day and the calendar in it
// too; a press on the fog closes the folder, not the page"): opening a folded group dims and blurs everything else
// in the column — the top, the person, My Day and the calendar, the other groups — until that group is folded
// again, by its own header or by a press anywhere on the fog (that press goes nowhere else).
function clearSpot(col) {
  col.classList.remove('is-spot')
  for (const el of col.querySelectorAll('.is-dim')) el.classList.remove('is-dim')
  for (const el of col.querySelectorAll('.is-spot-grp')) el.classList.remove('is-spot-grp')
  if (col._spotOff) { col.removeEventListener('click', col._spotOff, true); col._spotOff = null }
}
function spotlight(btn) {
  const col = btn.closest('.co-nv-col, .co-nv-sheetbody'); const grp = btn.closest('.co-nv-grp')
  if (!col || !grp) return
  clearSpot(col)
  grp.classList.add('is-spot-grp')
  for (const el of col.querySelectorAll('.co-nv-top, .co-nv-nav > *, .co-nv-grp, .co-nv-card')) {
    if (el !== grp && !el.contains(grp) && !grp.contains(el)) el.classList.add('is-dim')
  }
  col.classList.add('is-spot')
  const off = (e) => {
    if (grp.contains(e.target)) return   // inside the lit folder: the rows work as ever
    e.preventDefault(); e.stopPropagation()
    clearSpot(col)
    grp.querySelector('.co-nv-fold')?.click()   // the folder folds; its header's own handler sees it closing and clears nothing twice
  }
  col._spotOff = off
  col.addEventListener('click', off, true)
}
// ---- a group: its header (the fold) over its card ----
// Open, the header is a quiet heading; folded, a row of its own on My Day's grid
// (the group's tile, its name, the arrow turned right). One <button aria-expanded>.
// The folds are kept per person (navOrder.js); every group reads and writes the
// stored set afresh, so the channels and Management never overwrite each other.
export function useFolds(uid) {
  const [folded, setFolded] = useState(() => readFolded(uid))
  const toggle = (key) => {
    const next = readFolded(uid)
    if (next.has(key)) next.delete(key); else next.add(key)
    writeFolded(uid, next); setFolded(new Set(next))
  }
  return [folded, toggle]
}
// Every group folds, the one you are in too (the owner, 11 Nov). Folded while it holds the page you are on, its row
// takes the selection — the ruby fill, `aria-current="location"`; opened again, the selection is back on the row.
// A folder of the channels (round 6) adds to it: its own folded tile (its icon, or the stack of its first two marks),
// a name field in place of the name while it is named, a "…" menu at the header's end, and attributes the drag
// reads (`data-folder` on the card, `data-fhead` on the header). Management and Settings use none of them.
function Group({ gkey, name, Icon, folded, onToggle, current = false, sheet = false, cardRef = null, cardClass = '', children,
  tile = null, editing = null, menu = null, headProps = {}, ringed = false, folder = null, lifted = false, foldProps = {} }) {
  const id = `co-nv-g-${gkey}${sheet ? '-s' : ''}`
  const isFolded = folded && !editing
  const holds = isFolded && current
  const foldedTile = tile || <Tile>{icon(Icon)}</Tile>
  return (
    <div className={'co-nv-grp' + (isFolded ? ' folded' : '') + (menu ? ' has-menu' : '') + (lifted ? ' is-lifted' : '')} data-g={gkey} {...(folder ? { 'data-top': folder } : {})}>
      <div className="co-nv-hd" {...(folder ? { 'data-fhead': folder } : {})} {...headProps}>
        {editing ? (
          <div className="co-nv-fold co-nv-fold-edit">{editing}</div>
        ) : (
          <button type="button" className={'co-nv-fold' + (holds ? ' on' : '')} aria-expanded={!isFolded} aria-controls={id}
            aria-current={holds ? 'location' : undefined} onClick={(e) => { const col = e.currentTarget.closest('.co-nv-col, .co-nv-sheetbody'); if (isFolded) spotlight(e.currentTarget); else if (col) clearSpot(col); onToggle() }} {...foldProps}>
            {(isFolded || folder) && foldedTile}
            <span className="co-nv-n">{name}</span>
            <span className="co-nv-fc" aria-hidden="true"><ChevronDown size={isFolded ? 18 : 16} strokeWidth={2} /></span>
          </button>
        )}
        {menu}
      </div>
      <Collapse open={!isFolded} id={id}>
        <Card className={`co-nv-rows ${cardClass}${ringed ? ' is-ringed' : ''}`.trim()} cardRef={cardRef} {...(folder ? { 'data-folder': folder } : {})}>{children}</Card>
      </Collapse>
    </div>
  )
}

// ---- Management: Team · Numbers · Projects · Ambassadors, then the rest; a group like the channels' ----
export function ManageGroup({ user, items = [], upBadge = 0, onNavigate, sheet = false, folds = null }) {
  const own = useFolds(user.id)
  const [folded, toggle] = folds || own
  const { here } = useHere()
  if (!items.length) return null
  // one door is no group (the owner, 15 Nov 2026): it stands as a plain row
  if (items.length === 1) return <Card><DoorRow it={items[0]} on={here(items[0])} onNavigate={onNavigate} extra={items[0].key === 'uploads' && upBadge ? <span className="co-nv-cnt q">{upBadge}</span> : null} /></Card>
  return (
    <Group gkey="manage" name={tx('Management')} Icon={Briefcase} folded={folded.has('manage')} onToggle={() => toggle('manage')}
      current={items.some((it) => here(it))} sheet={sheet}>
      {items.map((it) => <DoorRow key={it.key} it={it} on={here(it)} onNavigate={onNavigate}
        extra={it.key === 'uploads' && upBadge ? <span className="co-nv-cnt q">{upBadge}</span> : null} />)}
    </Group>
  )
}

// ---- the person: the avatar, the name and the job, leading to the profile ----
// Nothing said twice: an account named after its role ("Admin", the admin)
// draws the job alone, in the name's place.
const sameWord = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
export function PersonCard({ user, onNavigate }) {
  const { t } = useT()
  const { at } = useHere()
  const job = jobOf(user)
  const once = sameWord(user.name, job) || sameWord(user.name, user.role) || (!!job && job.toLowerCase().startsWith(String(user.name || '').trim().toLowerCase()))
  const title = once ? job : user.name
  return (
    <Card>
      <Link to="/profile" className={'co-nv-row co-nv-me' + (at('/profile') ? ' on' : '')} aria-current={at('/profile') ? 'page' : undefined}
        onClick={onNavigate} title={t('nav.myprofile')} aria-label={`${title} — ${t('nav.myprofile')}`}>
        <Avatar name={user.name} color={user.color} src={user.avatar} size="lg" />
        <span className="co-nv-who"><b>{title}</b>{!once && job && <small>{job}</small>}</span>
      </Link>
    </Card>
  )
}

// ---- the foot: Language, Dark mode, Sound, Settings, Log out — plain rows on the ground, set once a month ----
// Log out (the owner, 15 Nov 2026): the last row of the group, on every screen; the app's own sign-out.
function LogoutRow() {
  const { logout } = useAuth()
  return (
    <button type="button" className="co-nv-row co-nv-logout" onClick={logout}>
      <Tile><LogOut size={20} strokeWidth={1.75} aria-hidden="true" /></Tile>
      <span className="co-nv-t">{tx('Log out')}</span>
    </button>
  )
}
function SwitchRow({ ic, label, on, onToggle }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="co-nv-row co-nv-swrow" onClick={onToggle}>
      <Tile>{ic}</Tile>
      <span className="co-nv-t">{label}</span>
      <span className="co-nv-sw" aria-hidden="true"><i /></span>
    </button>
  )
}
// ---- Settings: a group like Management, open on a first visit, folded and remembered per person ----
// Language (opens its three rows in place) · Dark mode · Sound · and, for an admin, "Advanced settings" (the gear, the
// admin panel). Folded while the page you are on is /admin, its row takes the selection like any group's.
export function SettingsGroup({ user, settings = null, onNavigate, sheet = false }) {
  const [folded, toggle] = useFolds(user.id)
  const { lang, setLang } = useT()
  const { here } = useHere()
  const advanced = settings ? { ...settings, label: tx('Advanced settings'), icon: Settings2 } : null
  const [dark, setDarkOn] = useState(() => resolvedTheme() === 'dark')
  const [sound, setSound] = useState(soundsOn)
  const [langOpen, setLangOpen] = useState(false)
  const langBtn = useRef(null)
  // The Profile page may change the theme while this card is drawn: read it again when the theme changes.
  useEffect(() => {
    const read = () => setDarkOn(resolvedTheme() === 'dark')
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  const flip = () => { const next = !dark; setDark(next); setDarkOn(next) }
  const native = LANGS.find((l) => l.key === lang)?.native || lang
  // A language picked closes the three rows; focus goes back to the row that opened them (it would be lost on a removed button).
  const pickLang = (key) => { setLangOpen(false); if (key !== lang) setLang(key); requestAnimationFrame(() => langBtn.current?.focus({ preventScroll: true })) }
  // The three rows are one radio group: ↑ ↓ move between them (roving tabindex), Home and End to the ends, Esc closes.
  const radios = useRef(null)
  const rove = (e) => {
    const all = [...(radios.current?.querySelectorAll('[role="radio"]') || [])]
    const i = all.indexOf(document.activeElement)
    const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: all.length - 1 }[e.key]
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setLangOpen(false); langBtn.current?.focus({ preventScroll: true }); return }
    if (to == null || !all.length) return
    e.preventDefault()
    all[(to + all.length) % all.length].focus()
  }
  return (
    <Group gkey="settings" name={tx('Settings')} Icon={Settings} folded={folded.has('settings')} onToggle={() => toggle('settings')}
      current={!!advanced && here(advanced)} sheet={sheet} cardClass="co-nv-set">
      <button type="button" ref={langBtn} className={'co-nv-row' + (langOpen ? ' open' : '')} aria-expanded={langOpen} aria-controls="co-nv-langs" onClick={() => setLangOpen((v) => !v)}
        aria-label={tx('Language, {name}', { name: native })}>
        <Tile>{icon(Languages)}</Tile>
        <span className="co-nv-t">{tx('Language')}</span>
        <span className="co-nv-v">{native}</span>
      </button>
      <Collapse open={langOpen} id="co-nv-langs">
        <div className="co-nv-langs" role="radiogroup" aria-label={tx('Language')} ref={radios} onKeyDown={rove}>
          {LANGS.map((l) => (
            <button key={l.key} type="button" role="radio" aria-checked={lang === l.key} tabIndex={lang === l.key ? 0 : -1}
              className={'co-nv-row co-nv-lang' + (lang === l.key ? ' picked' : '')} onClick={() => pickLang(l.key)}>
              <span className="co-nv-code">{l.key.toUpperCase()}</span>
              <span className="co-nv-t">{l.native}</span>
              {lang === l.key && <Check size={18} strokeWidth={2.25} aria-hidden="true" className="co-nv-tick" />}
            </button>
          ))}
        </div>
      </Collapse>
      <SwitchRow ic={icon(dark ? Moon : Sun)} label={tx('Dark mode')} on={dark} onToggle={flip} />
      <SwitchRow ic={icon(sound ? Volume2 : VolumeX)} label={tx('Sound')} on={sound} onToggle={() => { setSounds(!sound); setSound(!sound) }} />
      <LogoutRow />
      {advanced && <DoorRow it={advanced} on={here(advanced)} onNavigate={onNavigate} />}
    </Group>
  )
}

// ---- the channels: a layout of cards and folders (round 6) ----
//
// A channel stands alone as a card (like My Day) or sits in a folder (a group
// card the person names and gives an icon, as on a phone's home screen or in
// Telegram's folders). Moving a channel: on a desk by its grip (10 px before
// the drag commits), under a finger by holding it 350 ms; it follows the
// pointer 1:1. Where it lands:
//   – on another channel's row, held still 400 ms: a folder of the two is made,
//     its name field open at once;
//   – on a folder's header, or between the rows of another folder: into it;
//   – between cards (the gap, above the first, below the last): it stands alone
//     there; the last channel taken out of a folder removes the folder;
//   – within its own folder: its rows part around it, as before.
// The keyboard: Alt+↑/↓ moves it within its list, Alt+→ into the folder
// beside it, Alt+← out of its folder; the move bar (the grip pressed without
// moving, or a held row let go) carries the same moves. Every change is said
// aloud and comes with Undo; an admin's is the board's (PUT /channels/layout),
// anybody else's their own, in this browser.
const HOLD_MS = 350
const MAKE_MS = 400        // a still hover this long over a row makes a folder
const STILL_PX = 6         // …"still" meaning within this many pixels
const COMMIT_PX = 10       // the grip's drag commits past this many pixels
const GROUP_ICON = { core: Star, programs: Sparkles }
const ICONS = { folder: Folder, star: Star, sparkles: Sparkles, megaphone: Megaphone, film: Film, camera: Camera, clapperboard: Clapperboard, mic: Mic, 'pen-line': PenLine, image: ImageIcon, globe: Globe, 'map-pin': MapPin, flag: Flag, 'graduation-cap': GraduationCap, 'book-open': BookOpen, users: Users, heart: Heart, zap: Zap, target: Target, trophy: Trophy, calendar: Calendar, briefcase: Briefcase, layers: Layers }
const ICON_NAMES = { stack: 'Stack', folder: 'Folder', star: 'Star', sparkles: 'Sparkles', megaphone: 'Megaphone', film: 'Film', camera: 'Camera', clapperboard: 'Clapperboard', mic: 'Microphone', 'pen-line': 'Pen', image: 'Picture', globe: 'Globe', 'map-pin': 'Map pin', flag: 'Flag', 'graduation-cap': 'Graduation cap', 'book-open': 'Open book', users: 'People', heart: 'Heart', zap: 'Lightning', target: 'Bullseye', trophy: 'Trophy', calendar: 'Calendar', briefcase: 'Briefcase', layers: 'Layers' }
const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

// The board's layout: one value for everybody, read once and shared by every list on the page (the column and the sheet).
let boardCache = { v: undefined, at: 0 }
const boardSubs = new Set()
const setBoardCache = (v) => { boardCache = { v, at: Date.now() }; for (const f of boardSubs) f(v) }
export function useBoardLayout() {
  const [v, setV] = useState(boardCache.v)
  useEffect(() => {
    boardSubs.add(setV)
    if (boardCache.v === undefined || Date.now() - boardCache.at > 30000) {
      api.get('/channels/layout').then((r) => setBoardCache(Array.isArray(r?.layout) ? r.layout : null)).catch(() => { if (boardCache.v === undefined) setBoardCache(null) })
    }
    return () => { boardSubs.delete(setV) }
  }, [])
  return [v, setBoardCache]
}

// A folder's name field: born focused with its text selected; Enter or a press elsewhere saves, Esc keeps what it had.
function NameField({ initial, onDone }) {
  const ref = useRef(null)
  const done = useRef(false)
  const end = (value, keep) => { if (done.current) return; done.current = true; onDone(value, keep) }
  useEffect(() => { const el = ref.current; if (el) { el.focus({ preventScroll: false }); el.select() } }, [])
  return (
    <input ref={ref} className="co-nv-name" type="text" maxLength={NAME_MAX} defaultValue={initial} spellCheck={false} autoComplete="off"
      placeholder={tx('Folder name')} aria-label={tx('Folder name')}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); end(ev.currentTarget.value, false) }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end('', true) }
      }}
      onPointerDown={(ev) => ev.stopPropagation()}
      onBlur={(ev) => end(ev.currentTarget.value, false)} />
  )
}

// A folder's folded tile: its icon, or — with none chosen — the stack, its first two channels' marks side by side.
function FolderTile({ f, markOf }) {
  const I = f.icon ? ICONS[f.icon] : f.seed && !f.icon ? GROUP_ICON[f.seed] : null
  // 13 Nov 2026, the owner: a folder with no icon chosen is a plain folder glyph — not the stack of its channels' marks
  return <Tile>{icon(I || Folder)}</Tile>
}

// The icon picker: a radio group of 24 tiles (the stack, then 23 marks), ← → ↑ ↓ to move, Enter to pick, Esc to close.
function IconPicker({ f, markOf, onPick, onClose }) {
  const box = useRef(null)
  const cur = f.icon || 'stack'
  useEffect(() => { box.current?.querySelector('[aria-checked="true"]')?.focus({ preventScroll: false }) }, [])
  const keys = (e) => {
    const all = [...box.current.querySelectorAll('[role="radio"]')]
    const i = all.indexOf(document.activeElement)
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + 6, ArrowUp: i - 6, Home: 0, End: all.length - 1 }[e.key]
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); onClose(); return }
    if (to == null) return
    e.preventDefault()
    all[Math.max(0, Math.min(all.length - 1, to))].focus()
  }
  return (
    <div className="co-nv-pop co-nv-icons" role="radiogroup" aria-label={tx('Folder icon')} ref={box} onKeyDown={keys}>
      {FOLDER_ICONS.map((k) => {
        const I = ICONS[k]
        return (
          <button key={k} type="button" role="radio" aria-checked={cur === k} tabIndex={cur === k ? 0 : -1} className={'co-nv-ic' + (cur === k ? ' on' : '')}
            aria-label={tx(ICON_NAMES[k])} title={tx(ICON_NAMES[k])} onClick={() => onPick(k)}>
            {I ? <I size={18} strokeWidth={1.75} aria-hidden="true" /> : <span className="co-nv-stack" aria-hidden="true">{f.items.slice(0, 2).map((key) => <span key={key} className="co-nv-stack-m">{markOf(key, 12)}</span>)}</span>}
          </button>
        )
      })}
    </div>
  )
}

// A folder's menu: Rename · Change icon · New folder · Ungroup — ↑ ↓ to move, Enter to choose, Esc to close.
function FolderMenu({ name, onRename, onIcon, onUngroup, onClose, onUp = null, onDown = null }) {
  const box = useRef(null)
  useEffect(() => { box.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: false }) }, [])
  const keys = (e) => {
    const all = [...box.current.querySelectorAll('[role="menuitem"]')]
    const i = all.indexOf(document.activeElement)
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key]
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); onClose(); return }
    if (to == null) return
    e.preventDefault(); all[(to + all.length) % all.length].focus()
  }
  const item = (label, fn) => (fn ? <button type="button" role="menuitem" tabIndex={-1} className="co-nv-mi" onClick={fn}>{label}</button> : null)
  // No "New folder" here (§8: a folder always holds two or more — an empty one cannot be made); a folder is made by a drop
  // or by the move bar's "New folder with…".
  return (
    <div className="co-nv-pop co-nv-menu" role="menu" aria-label={name} ref={box} onKeyDown={keys}>
      {item(tx('Rename'), onRename)}
      {item(tx('Change icon'), onIcon)}
      {item(tx('Move up'), onUp)}
      {item(tx('Move down'), onDown)}
      {item(tx('Ungroup'), onUngroup)}
    </div>
  )
}

export function ChannelGroups({ user, visible, counts, design = null, onNavigate, sheet = false }) {
  const { at, here } = useHere()
  const { failed: chansFailed, retry: retryChans } = useChannels()
  const { failed: pagesFailed, retry: retryPages } = usePages()
  const isAdmin = user.role === 'admin'
  const [board] = useBoardLayout()
  const [personal, setPersonal] = useState(() => (isAdmin ? null : readPersonalLayout(user.id)))
  const [folded, toggleFolded] = useFolds(user.id)
  const [draft, setDraft] = useState(null)            // a layout while a drag reorders within one folder, or a folder being named
  const [dragging, setDragging] = useState(null)      // the key of a lifted channel, or the id of a lifted folder
  const [land, setLand] = useState(null)              // where a drop would land: { kind: 'line'|'ring'|'join'|'make', … }
  const [editing, setEditing] = useState(null)        // { id, mode: 'make'|'rename', a, b, order }
  const [menuFor, setMenuFor] = useState(null)        // a folder id whose menu is open
  const [iconsFor, setIconsFor] = useState(null)      // a folder id whose icon picker is open
  const [said, setSaid] = useState('')
  const [moving, setMoving] = useState(null)          // { key, before } — the move bar under a row
  const [withPick, setWithPick] = useState(false)     // the move bar's "New folder with…" list open
  const [hintOwed] = useState(() => fingers() && readHoldHint(user.id))
  const [hintGone, setHintGone] = useState(false)
  const holdHint = hintOwed && !hintGone && visible.length > 1
  const dragRef = useRef(null)
  const holdRef = useRef(null)
  const heldAt = useRef(0)                            // when a finger last let go of a held row
  const swallow = useRef(false)                       // the click that ends a folder's drag, its long press or a cancelled drag
  const chans = useRef(null)
  const flipFrom = useRef(null)                       // row tops before a structural change: they slide to their new places
  const uid = useRef(Math.random().toString(36).slice(2, 8)).current
  const hintId = `co-nv-hint-${uid}`; const folderHintId = `co-nv-fhint-${uid}`
  const hideHint = () => { setHintGone(true); doneHoldHint(user.id) }
  useEffect(() => { if (holdHint) doneHoldHint(user.id) }, [holdHint]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the layout: the person's own, else the board's, else the default — read for the channels this person has ----
  const chanOf = useMemo(() => Object.fromEntries(visible.map((c) => [c.key, c])), [visible])
  const live = useMemo(() => layoutFor({ personal, board: Array.isArray(board) ? board : null, channels: visible, design: !!design }), [personal, board, visible, design])
  const layout = draft || live
  const view = shownItems(layout)
  const labelOf = (k) => (k === 'design' ? design?.label : chanOf[k]?.label) || k
  const markOf = (k, size = 18) => (k === 'design' ? <Palette size={size} strokeWidth={1.75} aria-hidden="true" /> : chanOf[k] ? <ChanMark channel={chanOf[k]} size={size} /> : null)
  const nameOf = (f) => f.name || (f.seed ? tx(SEEDS[f.seed]) : tx('Folder'))

  // ---- the counts beside a channel: what is late (tonal), else a quiet number in editing ----
  const sumOf = (key) => ({ late: Number(counts?.[key]?.late) || 0, editing: Number(counts?.[key]?.editing) || 0 })
  const saidOf = (n) => (n.late ? tx('{n} late', { n: n.late }) : n.editing ? tx('{n} in editing', { n: n.editing }) : '')
  const Count = ({ n }) => (n.late
    ? <span className="co-nv-cnt late" title={saidOf(n)}>{n.late}</span>
    : n.editing ? <span className="co-nv-cnt q" title={saidOf(n)}><Scissors size={12} aria-hidden="true" />{n.editing}</span> : null)

  // ---- saving a change: an admin's for everybody (the server), anybody else's for them; every change has Undo ----
  const rowTops = () => new Map([...(chans.current?.querySelectorAll('.co-nv-ch[data-key], .co-nv-chans > .co-nv-grp[data-top]') || [])].map((r) => [r.dataset.key || `f:${r.dataset.top}`, r.getBoundingClientRect().top]))
  const save = async (next, { how, say, sayAll }) => {
    flipFrom.current = rowTops()
    const clean = stored(shownItems(next))
    const prevPersonal = personal; const prevBoard = board ?? null
    setDraft(null)
    if (isAdmin) {
      setBoardCache(clean)
      try { await api.put('/channels/layout', { layout: clean }) } catch (e) { setBoardCache(prevBoard); toast(e.message || tx('Could not save the layout'), 'err'); return }
    } else { setPersonal(clean); writePersonalLayout(user.id, clean) }
    act('nav.folder', { how, w: isAdmin ? 1 : undefined })
    toast(isAdmin ? sayAll : say, 'ok', {
      label: tx('Undo'),
      onClick: async () => {
        flipFrom.current = rowTops()
        if (isAdmin) { setBoardCache(prevBoard); try { await api.put('/channels/layout', { layout: prevBoard }) } catch (e) { toast(e.message || tx('Could not put the layout back'), 'err') } }
        else { setPersonal(prevPersonal); writePersonalLayout(user.id, prevPersonal) }
        setSaid(tx('Put back as it was'))
      },
    })
  }
  const backToBoard = () => { flipFrom.current = rowTops(); setPersonal(null); writePersonalLayout(user.id, null); toast(tx('Back to the board’s layout')) }
  const W = (s, v) => ({ say: tx(s, v), sayAll: tx(`${s} for everyone`, v) })
  const same = (a, b) => JSON.stringify(stored(a)) === JSON.stringify(stored(b))
  // a change that moved one channel: the words for it (a folder it left with one is "removed", its other channel on its own)
  const sayMove = (key, before, next) => {
    const from = find(before, key); const to = find(next, key)
    const name = labelOf(key)
    const src = from?.folder ? folderOf(before, from.folder) : null
    if (src && !folderOf(next, src.id)) {
      const v = { name: nameOf(src), other: labelOf(src.items.find((k) => k !== key)) }
      setSaid(tx('Folder «{name}» removed — {other} stands on its own', v))
      return { how: 'remove', ...W('Folder «{name}» removed — {other} stands on its own', v) }
    }
    if (to?.folder && to.folder !== from?.folder) { const folder = nameOf(folderOf(next, to.folder)); setSaid(tx('{name} moved into {folder}', { name, folder })); return { how: 'into', ...W('{name} → «{folder}»', { name, folder }) } }
    if (!to?.folder && from?.folder) { setSaid(tx('{name} now on its own', { name })); return { how: 'out', ...W('{name} now on its own', { name }) } }
    return { how: 'order', say: tx('Order saved for you'), sayAll: tx('Order saved for everyone') }
  }
  const moveTo = (key, next) => { if (next !== live && stored(next).length && !same(next, live)) save(next, sayMove(key, live, next)) }
  // a folder among the cards (never into one): Alt+↑/↓ on its header, or its header dragged to a gap
  const moveFolderTo = (id, index) => {
    const next = moveFolder(live, id, index)
    if (next === live || same(next, live)) return
    const i = topIndexOf(next, id); const was = topIndexOf(live, id); const name = nameOf(folderOf(live, id))
    setSaid(i < was ? tx('{name} moved up, now {i} of {n}', { name, i: i + 1, n: next.length }) : tx('{name} moved down, now {i} of {n}', { name, i: i + 1, n: next.length }))
    save(next, { how: 'order', say: tx('Order saved for you'), sayAll: tx('Order saved for everyone') })
  }

  // ---- after a structural change, the rows and folders slide from where they were (FLIP, 200 ms); reduced motion, they jump ----
  useLayoutEffect(() => {
    const was = flipFrom.current
    if (!was || stillMotion()) { flipFrom.current = null; return }
    flipFrom.current = null
    for (const r of chans.current?.querySelectorAll('.co-nv-ch[data-key], .co-nv-chans > .co-nv-grp[data-top]') || []) {
      const y0 = was.get(r.dataset.key || `f:${r.dataset.top}`); if (y0 == null) continue
      // a folder slides whole; its rows then need no slide of their own
      if (r.dataset.key && r.closest('.co-nv-grp[data-top]')?.dataset.flipped) continue
      const dy = y0 - r.getBoundingClientRect().top
      if (Math.abs(dy) < 1) continue
      if (!r.dataset.key) r.dataset.flipped = '1'
      r.style.transition = 'none'; r.style.translate = `0 ${dy}px`
      void r.offsetHeight
      r.style.transition = 'translate 200ms var(--ease-out)'; r.style.translate = ''
    }
    for (const g of chans.current?.querySelectorAll('[data-flipped]') || []) delete g.dataset.flipped
  }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- making a folder: it is born with its name field open; Enter or a press elsewhere saves, Esc keeps "New folder" ----
  // order 'ba' (a drop: the dragged one after the target, where the target stood) or 'ab' (the move bar: where a stood)
  const startMake = (a, b, order = 'ba') => {
    const id = newId()
    const next = order === 'ba' ? makeFolder(live, a, b, { id }) : folderWith(live, a, b, { id })
    if (next === live) return
    flipFrom.current = rowTops()
    setDraft(next)
    setEditing({ id, mode: 'make', a, b, order })
    const [x, y] = order === 'ba' ? [b, a] : [a, b]
    setSaid(tx('Folder {name} made with {a} and {b}', { name: tx('New folder'), a: labelOf(x), b: labelOf(y) }))
  }
  const finishName = (value, keep = false) => {
    const e = editing; if (!e) return
    setEditing(null)
    if (e.mode === 'make') {
      const name = String(keep ? tx('New folder') : value || tx('New folder')).trim().slice(0, NAME_MAX) || tx('New folder')
      const [x, y] = e.order === 'ba' ? [e.b, e.a] : [e.a, e.b]
      save(renameFolder(draft || live, e.id, name), { how: 'make', ...W('Folder «{name}» made', { name }) })
      setSaid(tx('Folder {name} made with {a} and {b}', { name, a: labelOf(x), b: labelOf(y) }))
    } else if (!keep) {
      const f = folderOf(live, e.id)
      const name = String(value || '').trim().slice(0, NAME_MAX)
      // the same name (a seeded folder's drawn name too) is no change: nothing saved, no toast
      if (f && name !== nameOf(f)) {
        const next = renameFolder(live, e.id, name)
        if (next !== live) save(next, { how: 'rename', ...W('Renamed to «{name}»', { name: nameOf(folderOf(next, e.id)) }) })
      }
    }
    requestAnimationFrame(() => chans.current?.querySelector(`[data-fhead="${e.id}"] .co-nv-fold`)?.focus({ preventScroll: true }))
  }

  // ---- the folder menu and the icon picker ----
  const closePops = (back = null) => { setMenuFor(null); setIconsFor(null); if (back) requestAnimationFrame(() => chans.current?.querySelector(`[data-fhead="${back}"] .co-nv-more`)?.focus({ preventScroll: true })) }
  useEffect(() => {
    if (!menuFor && !iconsFor) return undefined
    const away = (e) => { if (!e.target.closest('.co-nv-pop, .co-nv-more')) closePops() }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [menuFor, iconsFor]) // eslint-disable-line react-hooks/exhaustive-deps
  const menuOf = (f) => (
    <>
      <button type="button" className="co-nv-more" aria-haspopup="menu" aria-expanded={menuFor === f.id}
        aria-label={tx('More for «{name}»', { name: nameOf(f) })} title={tx('More for «{name}»', { name: nameOf(f) })}
        onClick={(e) => { e.stopPropagation(); setIconsFor(null); setMenuFor(menuFor === f.id ? null : f.id) }}>
        <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {menuFor === f.id && (
        <FolderMenu name={nameOf(f)} onClose={() => closePops(f.id)}
          onRename={() => { closePops(); if (folded.has(f.id)) toggleFolded(f.id); setEditing({ id: f.id, mode: 'rename' }) }}
          onIcon={() => { setMenuFor(null); setIconsFor(f.id) }}
          onUp={topIndexOf(live, f.id) > 0 ? () => { closePops(f.id); moveFolderTo(f.id, topIndexOf(live, f.id) - 1) } : null}
          onDown={topIndexOf(live, f.id) < live.length - 1 ? () => { closePops(f.id); moveFolderTo(f.id, topIndexOf(live, f.id) + 1) } : null}
          onUngroup={() => {
            closePops(); setSaid(tx('«{name}» ungrouped', { name: nameOf(f) })); save(dissolve(live, f.id), { how: 'ungroup', ...W('«{name}» ungrouped', { name: nameOf(f) }) })
            // the focus on its first channel, standing where the folder was
            requestAnimationFrame(() => chans.current?.querySelector(`.co-nv-ch[data-key="${f.items[0]}"]`)?.focus({ preventScroll: false }))
          }} />
      )}
      {iconsFor === f.id && (
        <IconPicker f={f} markOf={markOf} onClose={() => closePops(f.id)}
          onPick={(k) => { closePops(f.id); const next = setIcon(live, f.id, k); if (next !== live) save(next, { how: 'icon', ...W('Icon changed for «{name}»', { name: nameOf(f) }) }) }} />
      )}
    </>
  )

  // ---- the drag: a channel by its grip (a desk) or a hold (a finger); a folder by its header, the same two ways ----
  const slideOf = (r) => { const m = String(getComputedStyle(r).translate || '').match(/-?[\d.]+/g); return m && m.length > 1 ? Number(m[1]) : 0 }
  const liftedOf = (d) => (d.kind === 'folder' ? chans.current?.querySelector(`:scope > [data-top="${d.key}"]`) : chans.current?.querySelector(`.co-nv-ch[data-key="${d.key}"]`))
  const settle = () => {
    for (const r of chans.current?.querySelectorAll('.co-nv-ch[data-key], .co-nv-chans > [data-top]') || []) {
      if (!r.style.translate) continue
      r.style.transition = stillMotion() ? 'none' : `translate ${r.classList.contains('lifted') || r.classList.contains('is-lifted') ? 180 : 150}ms var(--ease-out)`
      r.style.translate = ''
    }
  }
  // The lifted row (or folder) follows the pointer 1:1, kept inside the channel area.
  const place = () => {
    const d = dragRef.current
    if (!d?.committed || d.y == null) return
    const el = liftedOf(d)
    if (!el) return
    el.style.transition = 'none'
    const slot = el.getBoundingClientRect().top - slideOf(el)
    const area = chans.current.getBoundingClientRect()
    const top = Math.min(Math.max(d.y - d.grab, area.top - 8), area.bottom - Math.min(el.offsetHeight, 44) + 8)
    el.style.translate = `0 ${Math.round(top - slot)}px`
  }
  // Within its own folder the rows part around it (FLIP, 150 ms).
  useLayoutEffect(() => {
    const d = dragRef.current
    if (!d || !d.tops) return
    if (!stillMotion()) {
      for (const r of chans.current?.querySelectorAll(`[data-folder="${d.from.folder}"] .co-nv-ch[data-key]`) || []) {
        if (r.dataset.key === d.key) continue
        const was = d.tops.get(r.dataset.key)
        r.style.transition = 'none'; r.style.translate = ''
        const delta = was == null ? 0 : was - r.getBoundingClientRect().top
        if (!delta) continue
        r.style.translate = `0 ${delta}px`; void r.offsetHeight
        r.style.transition = 'translate 150ms var(--ease-out)'; r.style.translate = ''
      }
    }
    d.tops = null
    place()
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  // Where the pointer is, asked of the one table (`landing` in navOrder.js): a row (its top or bottom fifth: beside it; its
  // middle: onto it), a folder's header, a gap between the cards (or right under Calendar). Anywhere else — My Day,
  // Calendar, above them, Management, Settings — takes nothing.
  const landingAt = (x, y) => {
    const d = dragRef.current
    const area = chans.current; if (!area) return null
    const ar = area.getBoundingClientRect()
    const drag = d.kind === 'folder' ? { type: 'folder' } : { type: 'channel', from: d.from.folder }
    const lifted = d.kind === 'folder' ? liftedOf(d) : null
    for (const r of area.querySelectorAll('.co-nv-ch[data-key]')) {
      if (r.dataset.key === d.key || !r.offsetParent || (lifted && lifted.contains(r))) continue
      const top = r.getBoundingClientRect().top - slideOf(r); const h = r.offsetHeight
      if (y < top || y > top + h) continue
      const rel = (y - top) / h
      const folder = r.closest('[data-folder]')?.dataset.folder || null
      const zone = rel < 0.2 ? 'before' : rel > 0.8 ? 'after' : 'middle'
      const kind = landing(drag, { type: 'row', folder, zone })
      if (kind === 'make') return { kind: 'over', target: r.dataset.key }
      if (kind === 'reorder') return { kind: 'reorder', target: r.dataset.key, before: zone === 'before' }
      if (kind === 'join') return { kind: 'join', target: r.dataset.key, folder, before: zone === 'before' }
      if (kind === 'line') {
        const ti = live.findIndex((it) => it.t === 'c' && it.key === r.dataset.key) + (zone === 'after' ? 1 : 0)
        return { kind: 'line', y: (zone === 'before' ? top - 8 : top + h + 8) - ar.top, x, to: { folder: null, index: ti } }
      }
      return null
    }
    for (const hd of area.querySelectorAll('[data-fhead]')) {
      if (lifted && lifted.contains(hd)) continue
      const b = hd.getBoundingClientRect()
      if (y < b.top || y > b.bottom) continue
      return landing(drag, { type: 'header', folder: hd.dataset.fhead }) === 'into' ? { kind: 'ring', folder: hd.dataset.fhead, to: { folder: hd.dataset.fhead } } : null
    }
    // the gaps between the top-level cards: above the first (right under Calendar), between two, below the last
    const tops = [...area.querySelectorAll(':scope > [data-top]')].filter((el) => el !== lifted)
      .map((el) => { const b = el.getBoundingClientRect(); const s = slideOf(el); return { id: el.dataset.top, top: b.top - s, bottom: b.bottom - s } })
    for (let i = 0; i <= tops.length; i++) {
      const above = tops[i - 1]; const below = tops[i]
      const lo = above ? above.bottom : ar.top - 12; const hi = below ? below.top : (above ? Math.min(above.bottom + 24, ar.bottom + 8) : ar.bottom)
      if (y < lo - 1 || y > hi + 1) continue
      if (landing(drag, { type: 'gap' }) !== 'line') return null
      const ti = i < tops.length ? live.findIndex((it) => (it.t === 'f' ? it.id : it.key) === tops[i].id) : live.length
      return { kind: 'line', y: (above && below ? (above.bottom + below.top) / 2 : above ? above.bottom + 8 : below.top - 8) - ar.top, x, to: { folder: null, index: ti < 0 ? live.length : ti } }
    }
    return null
  }
  // A top-level index as the person saw it (before the move) → as the model reads it (after the moved thing was taken out).
  const afterTake = (index, d) => {
    const was = d.kind === 'folder' ? topIndexOf(live, d.key) : find(live, d.key)?.folder == null ? find(live, d.key).index : -1
    return was >= 0 && was < index ? index - 1 : index
  }
  const track = (x, y) => {
    const d = dragRef.current
    const l = landingAt(x, y)
    // still over a lone channel's middle for 400 ms: "drop to make a folder"
    if (l?.kind === 'over') {
      const s = d.still
      if (!s || s.target !== l.target || Math.hypot(x - s.x, y - s.y) > STILL_PX) {
        clearTimeout(s?.t)
        d.still = { target: l.target, x, y, t: setTimeout(() => {
          if (dragRef.current !== d) return
          d.landing = { kind: 'make', target: l.target }
          setLand({ kind: 'make', target: l.target })
          setSaid(tx('Drop to make a folder with {name}', { name: labelOf(l.target) }))
        }, MAKE_MS) }
      }
      if (d.landing?.kind !== 'make' || d.landing.target !== l.target) { d.landing = null; setLand(null) }
      return
    }
    if (d.still) { clearTimeout(d.still.t); d.still = null }
    if (l?.kind === 'reorder') {
      // its own folder: the rows part around it
      d.landing = null; setLand(null)
      const f = folderOf(d.base, d.from.folder)
      const keysNow = [...(d.keys || f.items)]
      const a = keysNow.indexOf(d.key); if (a < 0) return
      keysNow.splice(a, 1)
      const to = keysNow.indexOf(l.target) + (l.before ? 0 : 1)
      keysNow.splice(to, 0, d.key)
      if (keysNow.join('|') === (d.keys || f.items).join('|')) return
      d.tops = new Map([...chans.current.querySelectorAll(`[data-folder="${d.from.folder}"] .co-nv-ch[data-key]`)].map((r) => [r.dataset.key, r.getBoundingClientRect().top]))
      d.keys = keysNow; d.moved = true
      setDraft(d.base.map((it) => (it.t === 'f' && it.id === d.from.folder ? { ...it, items: keysNow } : it)))
      return
    }
    // somewhere else to land (a line, a ring, another folder): its own folder's rows close up again. Over nothing — its own
    // new slot — the reorder stands.
    if (d.keys && l) {
      d.tops = new Map([...chans.current.querySelectorAll(`[data-folder="${d.from.folder}"] .co-nv-ch[data-key]`)].map((r) => [r.dataset.key, r.getBoundingClientRect().top]))
      d.keys = null; d.moved = false; setDraft(null)
    }
    d.landing = l
    setLand(l ? { ...l } : null)
  }
  const begin = (kind, key, y, el, pointer) => {
    const from = kind === 'folder' ? { folder: null, top: topIndexOf(live, key) } : find(live, key)
    dragRef.current = { kind, key, from, base: live, y, x: 0, sy: y, grab: el ? y - el.getBoundingClientRect().top : 0, pointer, committed: false, moved: false }
  }
  const commitDrag = () => { const d = dragRef.current; d.committed = true; setDragging(d.key); setMoving(null); setMenuFor(null); setIconsFor(null) }
  const finish = () => {
    const d = dragRef.current
    dragRef.current = null
    unguard(); unlisten()
    if (!d) return
    if (d.still) clearTimeout(d.still.t)
    if (d.scrolling) cancelAnimationFrame(d.scrolling)
    setDragging(null); setLand(null)
    settle()
    if (!d.committed) { setDraft(null); if (d.kind === 'channel') openMove(d.key); return }     // pressed and let go: the move bar (a folder's header: the click folds it)
    const l = d.landing
    if (d.kind === 'folder') { swallow.current = true; setDraft(null); if (l?.kind === 'line') moveFolderTo(d.key, afterTake(l.to.index, d)); return }
    if (l?.kind === 'make') { setDraft(null); startMake(d.key, l.target); return }
    if (l?.kind === 'join') { setDraft(null); const rest = folderOf(live, l.folder).items; moveTo(d.key, moveItem(live, d.key, { folder: l.folder, index: rest.indexOf(l.target) + (l.before ? 0 : 1) })); return }
    if (l?.kind === 'ring') { setDraft(null); moveTo(d.key, intoFolder(live, d.key, l.folder)); return }
    if (l?.kind === 'line') { setDraft(null); moveTo(d.key, moveItem(live, d.key, { folder: null, index: afterTake(l.to.index, d) })); return }
    if (d.moved && d.keys) { const next = d.base.map((it) => (it.t === 'f' && it.id === d.from.folder ? { ...it, items: d.keys } : it)); setDraft(null); moveTo(d.key, next); return }
    setDraft(null)
  }
  // Esc during a drag: cancelled, nothing moved, the focus on what was dragged.
  const cancelDrag = () => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    unguard(); unlisten()
    if (d.still) clearTimeout(d.still.t)
    if (d.scrolling) cancelAnimationFrame(d.scrolling)
    holdRef.current = null
    if (d.kind === 'folder') swallow.current = true
    setDraft(null); setDragging(null); setLand(null); settle()
    setSaid(tx('Move cancelled'))
    requestAnimationFrame(() => (d.kind === 'folder' ? chans.current?.querySelector(`[data-fhead="${d.key}"] .co-nv-fold`) : chans.current?.querySelector(`.co-nv-ch[data-key="${d.key}"]`))?.focus({ preventScroll: true }))
  }
  // The channel area scrolls with the column: a drag near the column's edge scrolls it.
  const EDGE = 32
  const scroller = () => chans.current?.closest('.co-nv-col, .co-nv-sheetbody') || null
  const autoScroll = () => {
    const d = dragRef.current
    if (!d?.committed || d.y == null) return
    const s = scroller(); if (!s) return
    const b = s.getBoundingClientRect()
    const step = d.y < b.top + EDGE + 40 ? -Math.ceil((b.top + EDGE + 40 - d.y) / 4) : d.y > b.bottom - EDGE ? Math.ceil((d.y - (b.bottom - EDGE)) / 4) : 0
    if (!step) { d.scrolling = 0; return }
    const before = s.scrollTop; s.scrollTop += step
    if (s.scrollTop !== before) { track(d.x, d.y); place() }
    d.scrolling = requestAnimationFrame(autoScroll)
  }
  // A drag listens on the window, not on the element pressed: a row that changes place mid-drag is a DOM node moved, and the
  // browser drops pointer capture from a node taken out and put back — the drag would never hear its release.
  const handlers = useRef(null)
  const onWin = useRef(null)
  const listen = () => {
    if (onWin.current) return
    const mv = (e) => handlers.current.move(e); const up = (e) => handlers.current.up(e)
    const key = (e) => { if (e.key === 'Escape' && dragRef.current) { e.preventDefault(); e.stopPropagation(); handlers.current.cancel() } }
    onWin.current = { mv, up, key }
    window.addEventListener('pointermove', mv, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', key, true)
  }
  const unlisten = () => {
    const w = onWin.current; if (!w) return
    onWin.current = null
    window.removeEventListener('pointermove', w.mv)
    window.removeEventListener('pointerup', w.up)
    window.removeEventListener('pointercancel', w.up)
    window.removeEventListener('keydown', w.key, true)
  }
  useEffect(() => unlisten, [])
  // while a folder is being named, a press elsewhere is the "press elsewhere" that saves the name — it starts no drag (the
  // drag would build on a layout without the folder still in its draft)
  const naming = () => { if (!editing) return false; chans.current?.querySelector('.co-nv-name')?.blur(); return true }
  const pointerStart = (e, kind, key, el) => {
    if (naming()) return
    begin(kind, key, e.clientY, el, e.pointerId)
    dragRef.current.x = e.clientX
    // a channel's grip captures the pointer (no text selection, no hover elsewhere); a folder's header must not — its press
    // without a move is the fold button's click, and a captured release would send that click to the header instead
    if (kind === 'channel') { try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* fine: the window listens anyway */ } }
    listen()
  }
  const pointerMove = (e) => {
    const d = dragRef.current
    if (!d || d.pointer !== e.pointerId) return
    if (!d.committed) { if (Math.abs(e.clientY - d.sy) < COMMIT_PX && Math.abs(e.clientX - d.x) < COMMIT_PX) return; commitDrag() }
    e.preventDefault()
    d.travel = Math.max(d.travel || 0, Math.abs(e.clientY - d.sy))
    d.y = e.clientY; d.x = e.clientX
    track(e.clientX, e.clientY)
    place()
    if (!d.scrolling) d.scrolling = requestAnimationFrame(autoScroll)
  }
  const pointerEnd = (e) => {
    const d = dragRef.current
    if (!d || d.pointer !== e.pointerId) return
    if (d.hold) {
      // the click a finger's release sends may come a moment later: it is swallowed for 700 ms after a hold
      heldAt.current = Date.now(); holdRef.current = null
      // held and let go where it was: a channel's move bar, a folder's menu
      if ((d.travel || 0) < COMMIT_PX && !d.landing && !d.moved) {
        dragRef.current = null; unguard(); unlisten(); if (d.still) clearTimeout(d.still.t)
        setDragging(null); setLand(null); settle()
        if (d.kind === 'folder') { swallow.current = true; setMenuFor(d.key) } else openMove(d.key)
        return
      }
    }
    finish()
  }
  handlers.current = { move: pointerMove, up: pointerEnd, cancel: cancelDrag }
  // a finger: hold 350 ms to lift; moving first is a scroll
  const guardRef = useRef(null)
  const unguard = () => { if (guardRef.current) { document.removeEventListener('touchmove', guardRef.current); guardRef.current = null } }
  const guard = () => {
    if (guardRef.current) return
    guardRef.current = (ev) => { if (holdRef.current?.held || dragRef.current?.committed) ev.preventDefault() }
    document.addEventListener('touchmove', guardRef.current, { passive: false })
  }
  useEffect(() => unguard, [])
  const holdStart = (e, kind, key, el) => {
    if (naming()) return
    guard()
    const id = e.pointerId; const y = e.clientY; const x = e.clientX
    holdRef.current = { y, timer: setTimeout(() => {
      holdRef.current = { held: true }
      begin(kind, key, y, el, id); dragRef.current.x = x; dragRef.current.hold = true; commitDrag()
      try { el.setPointerCapture(id) } catch { /* fine */ }
      listen()
      if (holdHint) hideHint()
    }, HOLD_MS) }
  }
  // before the hold: moving first is a scroll, and lets go of the timer (after it, the window has the drag)
  const holdMove = (e) => {
    const h = holdRef.current
    if (h?.timer && Math.abs(e.clientY - h.y) > 8) { clearTimeout(h.timer); holdRef.current = null; unguard() }
  }
  const holdEnd = () => {
    const h = holdRef.current
    if (h?.timer) { clearTimeout(h.timer); holdRef.current = null; unguard() }
  }
  // A folder's header: a mouse drags it (10 px, then it lifts; a press without moving folds it as before); a finger holds it
  // (350 ms — moved, it is dragged; let go where it was, its menu opens). Alt+↑/↓ on it moves it among the cards.
  const headProps = (f) => ({
    onPointerDown: (e) => {
      swallow.current = false
      if (editing?.id === f.id || e.target.closest('.co-nv-more, .co-nv-pop, input')) return
      const el = e.currentTarget.closest('[data-top]')
      if (e.pointerType === 'touch') { holdStart(e, 'folder', f.id, el); return }
      if (e.button !== 0) return
      pointerStart(e, 'folder', f.id, el)
    },
    onPointerMove: holdMove, onPointerUp: holdEnd, onPointerCancel: holdEnd,
    onClickCapture: (e) => { if (swallow.current) { swallow.current = false; e.preventDefault(); e.stopPropagation() } },
    onContextMenu: (e) => { if (fingers()) e.preventDefault() },
    onKeyDown: (e) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !e.target.classList.contains('co-nv-fold')) return
      e.preventDefault()
      const i = topIndexOf(live, f.id)
      moveFolderTo(f.id, i + (e.key === 'ArrowUp' ? -1 : 1))
      requestAnimationFrame(() => chans.current?.querySelector(`[data-fhead="${f.id}"] .co-nv-fold`)?.focus({ preventScroll: false }))
    },
  })

  // ---- the keyboard: Alt+↑/↓ within its list, Alt+→ into the folder beside it (its first item), Alt+← out, under Calendar ----
  const keyMove = (key, dir) => {
    const at = find(live, key); if (!at) return
    const list = at.folder ? folderOf(live, at.folder).items : live
    const j = at.index + dir
    if (j < 0 || j >= list.length) return
    setSaid(dir < 0 ? tx('{name} moved up, now {i} of {n}', { name: labelOf(key), i: j + 1, n: list.length }) : tx('{name} moved down, now {i} of {n}', { name: labelOf(key), i: j + 1, n: list.length }))
    moveTo(key, moveItem(live, key, { folder: at.folder, index: j }))
  }
  const besideOf = (key, base = live) => { const at = find(base, key); return at ? foldersBeside(base, at.top).filter((f) => f.id !== at.folder) : [] }
  const keyInto = (key) => {
    const at = find(live, key)
    const up = live[at.top - 1]?.t === 'f' ? live[at.top - 1] : null
    const down = live[at.top + 1]?.t === 'f' ? live[at.top + 1] : null
    if (!up && !down) { setSaid(tx('No folder beside {name}', { name: labelOf(key) })); return }
    // standing alone: the folder above (else below); in a folder: the nearer end decides
    const own = at.folder ? folderOf(live, at.folder).items.length : 1
    const f = up && down ? (at.folder && at.index >= own / 2 ? down : up) : up || down
    if (folded.has(f.id)) toggleFolded(f.id)    // a folded folder opens, so the row (and the focus) is seen in it
    moveTo(key, intoFolder(live, key, f.id, 0))
  }
  const keyOut = (key) => { const at = find(live, key); if (!at?.folder) return; moveTo(key, outOfFolder(live, key)) }
  const rowKeys = (e, key) => {
    if ((e.altKey && e.key === 'Enter') || (e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); openMove(key); return }
    if (!e.altKey) return
    const map = { ArrowUp: () => keyMove(key, -1), ArrowDown: () => keyMove(key, 1), ArrowRight: () => keyInto(key), ArrowLeft: () => keyOut(key) }
    if (map[e.key]) { e.preventDefault(); map[e.key](); requestAnimationFrame(() => requestAnimationFrame(() => chans.current?.querySelector(`.co-nv-ch[data-key="${key}"]`)?.focus({ preventScroll: false }))) }
  }

  // ---- the move bar: Move up · Move down · Into «…» · Out of the folder · New folder with… · Done ----
  const moveBar = useRef(null)
  const doneRef = useRef(null)
  const openMove = (key) => { setWithPick(false); setMoving({ key, before: live }) }
  const doneMove = (refocus = true) => {
    if (!moving) return
    const { key } = moving
    setMoving(null); setWithPick(false)
    if (draft) { const next = draft; setDraft(null); moveTo(key, next) }
    if (refocus) requestAnimationFrame(() => chans.current?.querySelector(`.co-nv-ch[data-key="${key}"]`)?.focus({ preventScroll: false }))
  }
  doneRef.current = doneMove
  const stepMove = (dir) => {
    if (!moving) return
    const base = draft || live; const at = find(base, moving.key); if (!at) return
    const list = at.folder ? folderOf(base, at.folder).items : base
    const j = at.index + dir
    if (j < 0 || j >= list.length) return
    setDraft(moveItem(base, moving.key, { folder: at.folder, index: j }))
    setSaid(dir < 0 ? tx('{name} moved up, now {i} of {n}', { name: labelOf(moving.key), i: j + 1, n: list.length }) : tx('{name} moved down, now {i} of {n}', { name: labelOf(moving.key), i: j + 1, n: list.length }))
  }
  useEffect(() => {
    if (!moving) return undefined
    moveBar.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: false })
    const away = (e) => { if (!moveBar.current?.contains(e.target)) doneRef.current(false) }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [moving]) // eslint-disable-line react-hooks/exhaustive-deps
  const moveRow = (key) => {
    const base = draft || live; const at = find(base, key)
    const list = at.folder ? folderOf(base, at.folder).items : base
    // "New folder with…": the others of its folder, or the other lone channels; with neither, every other channel
    const near = at.folder ? folderOf(base, at.folder).items.filter((k) => k !== key) : base.filter((it) => it.t === 'c' && it.key !== key).map((it) => it.key)
    const others = near.length ? near : flatten(base).filter((k) => k !== key)
    const act1 = (fn, refocus = false) => () => {
      const k = key; setMoving(null); setWithPick(false); setDraft(null); fn(k, base)
      if (refocus) requestAnimationFrame(() => requestAnimationFrame(() => chans.current?.querySelector(`.co-nv-ch[data-key="${k}"]`)?.focus({ preventScroll: false })))
    }
    return (
      <div key={`${key}-move`} className="co-nv-movebar" role="group" aria-label={labelOf(key)} ref={moveBar}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); doneMove() } }}>
        <button type="button" className="co-nv-mv" disabled={at.index <= 0} onClick={() => stepMove(-1)}><ArrowUp size={18} strokeWidth={1.75} aria-hidden="true" /> {tx('Move up')}</button>
        <button type="button" className="co-nv-mv" disabled={at.index >= list.length - 1} onClick={() => stepMove(1)}><ArrowDown size={18} strokeWidth={1.75} aria-hidden="true" /> {tx('Move down')}</button>
        {besideOf(key, base).map((f) => <button key={f.id} type="button" className="co-nv-mv" onClick={act1((k, b) => { if (folded.has(f.id)) toggleFolded(f.id); moveTo(k, intoFolder(b, k, f.id)) }, true)}>{tx('Into «{folder}»', { folder: nameOf(f) })}</button>)}
        {at.folder && <button type="button" className="co-nv-mv" onClick={act1((k, b) => moveTo(k, outOfFolder(b, k)), true)}>{tx('Out of the folder')}</button>}
        {others.length > 0 && <button type="button" className="co-nv-mv" aria-expanded={withPick} onClick={() => setWithPick(!withPick)}>{tx('New folder with…')}</button>}
        <button type="button" className="co-nv-mv co-nv-mvdone" onClick={() => doneMove()}>{tx('Done')}</button>
        {withPick && (
          <div className="co-nv-with" role="group" aria-label={tx('New folder with…')}>
            {others.map((k) => <button key={k} type="button" className="co-nv-mv" onClick={act1((a) => startMake(a, k, 'ab'))}>{markOf(k, 16)} {labelOf(k)}</button>)}
          </div>
        )}
      </div>
    )
  }

  // ---- a channel's row (Design is one too) ----
  const row = (key) => {
    const isDesign = key === 'design'
    const c = chanOf[key]
    const to = isDesign ? design.to : `/dept/${key}`
    const on = isDesign ? here(design) : at(to)
    const n = isDesign ? sumOf('design') : sumOf(key)
    const label = labelOf(key)
    const name = saidOf(n) ? `${label}, ${saidOf(n)}` : label
    const making = land?.kind === 'make' && land.target === key && dragging
    return (
      <Link key={key} to={to} data-key={key}
        className={'co-nv-row co-nv-ch' + (isDesign ? ' co-nv-design' : '') + (on ? ' on' : '') + (dragging === key ? ' lifted' : '') + (making ? ' is-make' : '')}
        aria-current={on ? 'page' : undefined} aria-label={name} aria-describedby={hintId} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Enter Shift+F10"
        onPointerDown={(e) => { if (e.pointerType === 'touch' && !e.target.closest('.co-nv-grip')) holdStart(e, 'channel', key, e.currentTarget) }}
        onPointerMove={holdMove} onPointerUp={holdEnd} onPointerCancel={holdEnd}
        onKeyDown={(e) => rowKeys(e, key)}
        onContextMenu={(e) => { if (fingers()) e.preventDefault() }}
        onClick={(e) => { if (holdRef.current?.held || Date.now() - heldAt.current < 700 || dragRef.current || moving) { e.preventDefault(); return } onNavigate?.() }}>
        {making
          ? <span className="co-nv-tile co-nv-tile-make" aria-hidden="true"><span className="co-nv-stack-m">{markOf(key, 14)}</span><span className="co-nv-stack-m">{markOf(dragging, 14)}</span></span>
          : <Tile>{isDesign ? icon(Palette) : c ? <ChanMark channel={c} size={18} /> : null}</Tile>}
        <span className="co-nv-t" title={name}>{label}</span>
        <Count n={n} />
        <span className="co-nv-grip" aria-hidden="true" title={tx('Drag to move; press for more ways to move')}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); pointerStart(e, 'channel', key, e.currentTarget.closest('[data-key]')) }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
          <GripVertical size={18} strokeWidth={1.75} />
        </span>
      </Link>
    )
  }
  const rows = (keysIn) => keysIn.flatMap((k) => (moving?.key === k ? [row(k), moveRow(k)] : [row(k)]))

  return (
    // no native drag here: a link dragged by the browser cancels the pointer stream (pointercancel) under a folder's drag
    <div className={'co-nv-chans' + (land?.kind === 'make' ? ' is-making' : land?.kind === 'line' ? ' is-lining' : '')} ref={chans} onDragStart={(e) => e.preventDefault()}>
      <span id={hintId} className="sr-only">{tx('Alt with the arrows moves this channel: up and down, right into the folder beside it, left out of its folder. Alt with Enter opens more ways to move it.')}</span>
      <span id={folderHintId} className="sr-only">{tx('Alt with the up or down arrow moves this folder among the cards.')}</span>
      <span className="sr-only" role="status" aria-live="polite">{said}</span>
      {view.map((it) => {
        if (it.t === 'c') {
          return (
            <Card key={it.key} className="co-nv-solo" data-top={it.key}>
              {rows([it.key])}
            </Card>
          )
        }
        const f = it
        const current = f.items.some((k) => (k === 'design' ? design && here(design) : at(`/dept/${k}`)))
        const isEditing = editing?.id === f.id
        return (
          <Group key={f.id} gkey={f.id} folder={f.id} name={nameOf(f)} Icon={GROUP_ICON[f.seed] || Folder}
            folded={folded.has(f.id)} onToggle={() => toggleFolded(f.id)} current={current} sheet={sheet} lifted={dragging === f.id}
            tile={<FolderTile f={f} markOf={markOf} />} editing={isEditing ? <><FolderTile f={f} markOf={markOf} /><NameField key={f.id} initial={editing.mode === 'make' ? tx('New folder') : nameOf(f)} onDone={finishName} /></> : null}
            menu={isEditing ? null : menuOf(f)} headProps={headProps(f)}
            foldProps={{ 'aria-describedby': folderHintId, 'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown' }}
            ringed={(land?.kind === 'ring' || land?.kind === 'join') && land.folder === f.id}>
            {rows(f.items)}
          </Group>
        )
      })}
      {land?.kind === 'line' && <span className={'co-nv-dropline' + (land.x < (chans.current?.getBoundingClientRect().left || 0) + 160 ? ' from-left' : ' from-right')} style={{ top: `${land.y - 1}px` }} aria-hidden="true" />}
      {/* A personal layout is undone from its own row, under the last card. */}
      {personal && (
        <button type="button" className="co-nv-row co-nv-back" onClick={() => {
          backToBoard()
          requestAnimationFrame(() => chans.current?.querySelector('[data-key]')?.focus({ preventScroll: true }))
        }}>
          <Tile>{icon(RotateCcw)}</Tile>
          <span className="co-nv-t">{tx('Back to the board’s layout')}</span>
        </button>
      )}
      {holdHint && <p className="co-nv-note co-nv-hint">{tx('Hold a channel to move it')}</p>}
      {visible.length === 0 && chansFailed && (
        <p className="co-nv-note" role="status">
          {tx('Channels did not load. Retrying…')}{' '}
          <button type="button" className="co-link" onClick={retryChans}>{tx('Retry now')}</button>
        </p>
      )}
      {pagesFailed && !chansFailed && (
        <p className="co-nv-note" role="status">
          {tx('The page settings did not load. Retrying…')}{' '}
          <button type="button" className="co-link" onClick={retryPages}>{tx('Retry now')}</button>
        </p>
      )}
    </div>
  )
}

// Design sits with the channels when there are channels to sit with; a person with none has it under Management.
const placeDesign = (design, visible, manage) => (design && !visible.length ? { design: null, manage: [design, ...manage] } : { design, manage })

// ---- the desk: the S2 column, the drawer under 821 px, and the folded rail ----
export default function CoachSideS2({ user, groups, visible, upBadge, onNavigate, onFold, rail = false, drawer = false }) {
  const { t } = useT()
  const counts = useChannelCounts()
  const doorsOf = useNavDoors(user, groups)
  const { day, cal, settings } = doorsOf
  const { design, manage } = placeDesign(doorsOf.design, visible, doorsOf.manage)
  const { here, pathname } = useHere()
  const foldWord = drawer ? tx('Close the menu') : rail ? tx('Open the menu') : tx('Fold the menu')
  const column = useRef(null)
  // A channel far down the list is brought into sight when you land on it.
  useEffect(() => {
    if (!drawer) column.current?.querySelector('.co-nv-fold.on, .co-nv-ch.on, .co-nv-design.on')?.scrollIntoView({ block: 'nearest' })
  }, [pathname, drawer])
  // The column is one scrolling list; once it has scrolled, the sticky logo row gets its fade (`is-scrolled`).
  useEffect(() => {
    const el = column.current
    if (!el) return undefined
    const mark = () => el.classList.toggle('is-scrolled', el.scrollTop > 1)
    mark()
    el.addEventListener('scroll', mark, { passive: true })
    return () => el.removeEventListener('scroll', mark)
  }, [rail])

  if (rail) return <Rail user={user} day={day} cal={cal} design={design} doors={[...manage, settings].filter(Boolean)} visible={visible} counts={counts} onNavigate={onNavigate} onFold={onFold} foldWord={foldWord} />

  // One list, by what things are: the person, the day, the channels' groups, Management, then the settings as
  // plain rows on the ground. Only the logo row stays put.
  return (
    <div className="co-nv co-nv-col" ref={column}>
      <div className="co-nv-top">
        <Link to="/" className="logo-link" onClick={onNavigate} title={t('nav.home')} aria-label={t('nav.home')}>
          <LogoLockup height={28} />
        </Link>
        <button type="button" className="co-nv-ib co-nv-foldbtn" onClick={onFold} title={foldWord} aria-label={foldWord} aria-expanded={drawer ? undefined : true}>
          {drawer ? <X size={20} strokeWidth={2} aria-hidden="true" /> : <Menu size={20} strokeWidth={2} aria-hidden="true" />}
        </button>
      </div>
      <nav className="co-sb-nav co-nv-nav" aria-label={tx('Main')}>
        <PersonCard user={user} onNavigate={onNavigate} />
        {/* My Day and Calendar: a card each, 8 px apart — every door a card, every group a card */}
        <div className="co-nv-days">
          <Card><DoorRow it={day} on={here(day)} onNavigate={onNavigate} /></Card>
          {cal && <Card><DoorRow it={cal} on={here(cal)} onNavigate={onNavigate} /></Card>}
        </div>
        <ChannelGroups user={user} visible={visible} counts={counts} design={design} onNavigate={onNavigate} />
        <ManageGroup user={user} items={manage} upBadge={upBadge} onNavigate={onNavigate} />
        <SettingsGroup user={user} settings={settings} onNavigate={onNavigate} />
      </nav>
    </div>
  )
}

// Folded: a rail of 40 px tiles — icons alone. A count is never drawn here;
// a tile's name still says what is late.
function Rail({ user, day, cal, design, doors, visible, counts, onNavigate, onFold, foldWord }) {
  const { t } = useT()
  const { here, at } = useHere()
  const [dark, setDarkOn] = useState(() => resolvedTheme() === 'dark')
  const late = (c) => Number(counts?.[c.key]?.late) || 0
  // the channels in the order of the column's layout (the person's own, else the board's), Design where the layout puts it
  const [board] = useBoardLayout()
  const order = useMemo(() => {
    return flatten(layoutFor({ personal: user.role === 'admin' ? null : readPersonalLayout(user.id), board: Array.isArray(board) ? board : null, channels: visible, design: !!design }))
  }, [board, visible, design, user.id, user.role])
  const byKey = Object.fromEntries(visible.map((c) => [c.key, c]))
  const item = (it, on, inner, brk = false) => (
    <Link key={it.key} to={it.to} className={'co-nv-ri' + (on ? ' on' : '') + (brk ? ' brk' : '')} aria-current={on ? 'page' : undefined} aria-label={it.label} title={it.label} onClick={onNavigate}>
      {inner}
    </Link>
  )
  const ic = (I) => <I size={20} strokeWidth={2} aria-hidden="true" />
  return (
    <div className="co-nv co-nv-rail">
      <Link to="/" className="co-nv-ri co-nv-rmark" onClick={onNavigate} title={t('nav.home')} aria-label={t('nav.home')}>
        <Logo size={24} />
      </Link>
      <button type="button" className="co-nv-ri" onClick={onFold} title={foldWord} aria-label={foldWord} aria-expanded={false}>{ic(Menu)}</button>
      <nav className="co-sb-nav co-nv-nav" aria-label={tx('Main')}>
        <Link to="/profile" className={'co-nv-ri co-nv-rme brk' + (at('/profile') ? ' on' : '')} aria-current={at('/profile') ? 'page' : undefined} aria-label={`${user.name} — ${t('nav.myprofile')}`} title={user.name} onClick={onNavigate}>
          <Avatar name={user.name} color={user.color} src={user.avatar} size="sm" />
        </Link>
        {item(day, here(day), ic(Home), true)}
        {cal && item(cal, here(cal), ic(CalendarDays))}
        {order.map((k, i) => {
          if (k === 'design') return item(design, here(design), ic(Palette), i === 0)
          const c = byKey[k]; if (!c) return null
          return item({ key: c.key, to: `/dept/${c.key}`, label: late(c) ? `${c.label}, ${tx('{n} late', { n: late(c) })}` : c.label }, at(`/dept/${c.key}`), <ChanMark channel={c} size={20} />, i === 0)
        })}
        {doors.map((it, i) => item(it, here(it), ic(it.icon), i === 0))}
      </nav>
      <div className="co-nv-rfoot">
        <button type="button" role="switch" aria-checked={dark} className="co-nv-ri" title={tx('Dark mode')} aria-label={tx('Dark mode')}
          onClick={() => { setDark(!dark); setDarkOn(!dark) }}>{ic(dark ? Moon : Sun)}</button>
      </div>
    </div>
  )
}

// ---- the phone: the tab bar and its two sheets (direction D) ----
const OUT_MS = 180
function Sheet({ label, head = null, onClose, closing, children, returnTo }) {
  const box = useRef(null)
  useEffect(() => {
    const first = box.current?.querySelector('input, button, a[href], [tabindex]:not([tabindex="-1"])')
    ;(first || box.current)?.focus({ preventScroll: true })
    document.documentElement.classList.add('co-nv-lock')
    const onKey = (e) => {
      // a folder's menu, its icon picker, a name being typed and the move bar each close themselves on Esc — not the sheet
      if (e.key === 'Escape' && e.target.closest?.('.co-nv-pop, .co-nv-name, .co-nv-movebar')) return
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab' || !box.current) return
      const all = [...box.current.querySelectorAll('input, button, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hidden && el.offsetParent !== null)
      if (!all.length) return
      const a = all[0]; const z = all[all.length - 1]
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.documentElement.classList.remove('co-nv-lock')
      returnTo?.current?.focus?.({ preventScroll: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'co-nv co-nv-sheetwrap' + (closing ? ' closing' : '')}>
      <div className="co-nv-scrim" onClick={onClose} />
      <div className="co-nv-sheet" role="dialog" aria-modal="true" aria-label={label} ref={box} tabIndex={-1}>
        <div className="co-nv-grab" aria-hidden="true" />
        {head}
        <div className="co-nv-sheetbody">{children}</div>
      </div>
    </div>
  )
}

export function CoachPhoneNav({ user, groups, visible, upBadge, onFind, onGive = null, handIn = null }) {
  const { t } = useT()
  const { pathname } = useLocation()
  const counts = useChannelCounts()
  const doorsOf = useNavDoors(user, groups)
  const { day, cal, settings } = doorsOf
  const { design, manage } = placeDesign(doorsOf.design, visible, doorsOf.manage)
  const [sheet, setSheet] = useState(null)      // 'channels' | 'more'
  const [closing, setClosing] = useState(false)
  const timer = useRef(0)
  const chanBtn = useRef(null)
  const moreBtn = useRef(null)
  const close = () => {
    if (!sheet || closing) return
    setClosing(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setSheet(null); setClosing(false) }, OUT_MS)
  }
  const open = (which) => { clearTimeout(timer.current); setClosing(false); setSheet(which) }
  const toggle = (which) => (sheet === which && !closing ? close() : open(which))
  // A route change closes the sheet: it is a place you leave.
  useEffect(() => { if (sheet) close() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), [])
  const lateAll = visible.reduce((a, c) => a + (Number(counts?.[c.key]?.late) || 0), 0)
  const onSheet = sheet && !closing
  return (
    <>
      <nav className="co-nv co-nv-tabbar" aria-label={tx('Main')}>
        <NavLink to={day.to} end className={({ isActive }) => 'co-nv-tab' + (isActive && !onSheet ? ' on' : '')} onClick={close}>
          <Home size={26} aria-hidden="true" /><span>{t('nav.brief')}</span>
        </NavLink>
        {cal && (
          <NavLink to={cal.to} className={({ isActive }) => 'co-nv-tab' + (isActive && !onSheet ? ' on' : '')} onClick={close}>
            <CalendarDays size={26} aria-hidden="true" /><span>{cal.label}</span>
          </NavLink>
        )}
        <button type="button" ref={chanBtn} className={'co-nv-tab' + (onSheet && sheet === 'channels' ? ' on' : '')} aria-haspopup="dialog" aria-expanded={onSheet && sheet === 'channels'}
          onClick={() => toggle('channels')} aria-label={lateAll ? `${t('nav.channels')}, ${tx('{n} late', { n: lateAll })}` : t('nav.channels')}>
          <LayoutGrid size={26} aria-hidden="true" /><span>{t('nav.channels')}</span>
          {/* A dot, not a number: the sum of everything late everywhere is not one thing to act on. The name still says it. */}
          {lateAll > 0 && <span className="co-nv-tabdot" aria-hidden="true" />}
        </button>
        <button type="button" className="co-nv-tab" onClick={() => { close(); onFind() }} title={t('nav.quickfind')}>
          <Search size={26} aria-hidden="true" /><span>{tx('Find')}</span>
        </button>
        <button type="button" ref={moreBtn} className={'co-nv-tab' + (onSheet && sheet === 'more' ? ' on' : '')} aria-haspopup="dialog" aria-expanded={onSheet && sheet === 'more'}
          onClick={() => toggle('more')}>
          <MoreHorizontal size={26} aria-hidden="true" /><span>{tx('More')}</span>
        </button>
      </nav>
      {sheet === 'channels' && (
        <Sheet label={t('nav.channels')} onClose={close} closing={closing} returnTo={chanBtn}
          head={<h2 className="co-nv-sheet-h">{t('nav.channels')}</h2>}>
          <ChannelGroups user={user} visible={visible} counts={counts} design={design} onNavigate={close} sheet />
        </Sheet>
      )}
      {sheet === 'more' && (
        <Sheet label={tx('More')} onClose={close} closing={closing} returnTo={moreBtn}>
          {/* The phone's top bar is the bell alone: starting a task, and the crew's "Hand in", come first here. */}
          {(onGive || handIn) && (
            <Card>
              {handIn && (
                <button type="button" className="co-nv-row co-nv-act" onClick={() => { close(); handIn.onClick() }}>
                  <Tile>{icon(handIn.Icon)}</Tile><span className="co-nv-t">{handIn.label}</span>
                </button>
              )}
              {onGive && (
                <button type="button" className="co-nv-row co-nv-act" onClick={() => { close(); onGive() }}>
                  <Tile>{icon(Plus)}</Tile><span className="co-nv-t">{tx('New task')}</span>
                </button>
              )}
            </Card>
          )}
          <PersonCard user={user} onNavigate={close} />
          <ManageGroup user={user} items={manage} upBadge={upBadge} onNavigate={close} sheet />
          <SettingsGroup user={user} settings={settings} onNavigate={close} sheet />
        </Sheet>
      )}
    </>
  )
}
