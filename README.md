# Marketing Dashboard — demo

A content-team dashboard for a marketing department: every person lands on
**My Day** (what to do first, in the order to do it), the admin sees the whole
team's day, and every piece of content is a line of stops — Idea → Shoot →
Edit → Out — with one button for the next step. Calendars for shoots and
releases, a board per channel, a new-task sheet that plans a whole shoot
(several tasks from one filming), and a task window that shows each person
only their own step.

This repository is the demo: it ships with a seeded team of twelve people, a
month of pieces across eleven channels, and sample media. Nothing here talks
to a real server.

## Run it

```bash
npm install
npm run demo
```

The first run makes a local database in `data/` and fills it with the demo
team. The API starts on `http://localhost:4000` and the page on
`http://localhost:5173`. `npm run demo:reset` makes a fresh board whose days
line up with today.

Sign in as anybody on the sign-in page (one press; the password for every
demo account is `1234`):

| Account | Who | What they see |
|---|---|---|
| `admin` | Administrator | the team's day, every channel, Settings, Numbers |
| `dilnoza`, `sardor` | Content makers | their channels' pieces, the board, the calendars |
| `malika` | Copywriter | the written channels |
| `javohir` | Targetologist | the Target channel |
| `otabek`, `bekzod` | Operators | their shoots, a calendar of shoots, their own month |
| `eldor`, `kamola` | Editors | their edits, their own month |
| `nigora`, `shahzoda` | Designers | their artwork, the Design board |
| `aziz` | Operator and editor | both seats |

Three languages: English, Russian, Uzbek — switch in the sidebar. Light and
dark. Works on a phone.

## What is in here

```
client/      React + Vite — the pages, the Coach look (My Day, the task window, the sheet)
server/      Express + SQLite — the API, the rules of a piece's life, the nightly job
scripts/     demo.mjs (starts everything), demo-data.mjs (the seeded team and pieces)
qa/          the suites: API-level checks of every rule, run by .github/workflows/checks.yml
mcp/         the board as tools for an AI assistant (an MCP server over stdio)
docs/        the product spec this build follows
```

## Checks

```bash
bash qa/ci.sh client      # the build and the suites that need no server
bash qa/ci.sh api         # the API suites on a scratch database
```

## Stack

Node.js 20+, Express, SQLite through `@libsql/client`, React 18, Vite. One process
serves the API and the built client; the demo runs the two side by side.
