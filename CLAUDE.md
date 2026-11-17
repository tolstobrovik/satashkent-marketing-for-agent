# SATashkent Marketing Dashboard — Path Router & Windows 11 Guardrails
## 1. ENVIRONMENT (WINDOWS 11 POWERSHELL)
- Project root: D:\claude\marketing-demo-draft
- OS & Shell: Windows 11 PowerShell. Do NOT use bash-only syntax (&&, bash qa/ci.sh).
- Run QA suites directly via Node on Windows:
node qa/brand-suite.mjs
node qa/coach-suite.mjs
npm --prefix client run build
## 2. NEVER READ (Context Blacklist)
- client/src/styles.css (848 KB monolith — NEVER read or grep)
- client/src/components/ContentModal.jsx (legacy wrapper — active task view is CoachTask.jsx)
- docs/ux-tz-2026-10-19.md (superseded spec)
- client/src/lib/i18n.jsx, i18n.ru.js, i18n.uz.js (only edit during final translation sync in Step
7)
## 3. Active Coach UI File Map (Only Read the Module You Are Assigned)
- Design Tokens & Kit: client/src/pages/Kit.jsx, client/src/lib/look.js, client/src/lib/theme.js
- Sidebar & Nav: client/src/components/CoachNav.jsx, client/src/lib/navOrder.js,
client/src/lib/pages.jsx, client/src/styles-nav.css
- Task View Window: client/src/components/CoachTask.jsx, TaskPlan.jsx, TaskMore.jsx, CoachBits.jsx,
client/src/components/edit/*, client/src/lib/coach.js, nextStep.js, mayChange.js,
client/src/styles-task.css
- Task Creation Modal: client/src/components/NewTask.jsx,
client/src/components/builder/TaskBuilder.jsx, StepWhere.jsx, StepTitle.jsx, StepType.jsx,
StepPlan.jsx, StepMore.jsx, FacePicker.jsx, MiniCalendar.jsx, client/src/lib/formState.js
- My Day (/brief): client/src/components/CoachAdminDay.jsx, CoachMakerDay.jsx, CoachCrewDay.jsx,
PersonPicker.jsx, client/src/lib/startHere.js, due.js, client/src/styles-myday-admin.css
- Boards & Calendar: client/src/components/ContentBoard.jsx, ContentFilters.jsx,
client/src/pages/Department.jsx, Schedule.jsx, ContentCalendar.jsx, client/src/lib/finish.js,
schedFilter.js
## 4. Mandatory QA Rules
- Wrap all user-facing strings and title/placeholder/aria-label in tx('...').
- Use only 'Nekst' (600/700) and 'Inter' (max weight 700).
- In Coach CSS: use CSS variables only (--ruby, --bright-red, --near-black, --surface, --page, --
ink, --hairline, --fs-*, --radius-*); zero raw hexes, zero colored gradients, zero text-transform:
uppercase.
- At ~60% context or module completion, update HANDOFF.md and start a fresh chat.
