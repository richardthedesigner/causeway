# Roadmap

The one list of work for Causewayside: what's next, in what order, how big it is and what state it's in. Every task, human or Claude, starts here and writes back here.

This file is the master copy. A read-only copy for sharing and comments lives in Google Drive: [Causewayside roadmap](https://docs.google.com/document/d/1T-RPq188B09LBahJIWPg_Hapm6m_vYbHB88pUzxJXV4/edit). Change this file, then update the Doc to match. Edits made only in the Doc are lost.

Last updated: 2026-10-05.

- What's waiting on Richard, blocked, or a guess: [OPEN_ITEMS.md](OPEN_ITEMS.md)
- What shipped and when: [BUILD_LOG.md](BUILD_LOG.md) and the phase reports
- Why: [DECISIONS.md](DECISIONS.md)
- Every data source we could use, with verdicts: the [UK data survey](DATA_SURVEY_UK.md). Section numbers (§) refer to it.

## How to use this file

**Before you start any task**
1. Read **Now** and the section your task belongs to.
2. If your task is here, use its ID in commit messages and the PR title (for example `SEC-01: security headers`).
3. If it isn't, add a row in the right section first, with the next free ID.
4. Set its status to `doing` and put the date and your branch in Notes.

**When you finish**
1. Set the status to `done (YYYY-MM-DD)` in the same pull request. Leave the row where it is, so IDs stay findable.
2. Add one line to the **Log** at the bottom.
3. Anything you found but didn't do: add it as a new row. Don't leave it only in a PR or a chat.
4. If **Now** has fewer than five open items, promote the next most useful ones.
5. Update the Google Doc copy (see `CLAUDE.md`).

**Fields**
- **Size:** `S` an hour or two. `M` about a day. `L` several days. `XL` a project of its own, which needs a plan in `docs/plans/` first.
- **Priority:** `now`, `next`, `later`.
- **Status:** `todo`, `doing`, `blocked`, `done`. A blocked row says what it waits on.
- **Who:** `Claude` (can be done in a session), `Richard` (needs an account, a key, a decision, money or a person), or both. Anything waiting on Richard also has a line in [OPEN_ITEMS.md](OPEN_ITEMS.md).

Keep rows to one line. Detail goes in an issue, a plan, a decision or the Notes column.

## Where we are

| Phase | What | State |
|---|---|---|
| 0 | Foundations: data model, honest graph builder, own router, Edinburgh acceptance tests | Done ([report](PHASE0_REPORT.md)) |
| 1 | The honest graph for central Edinburgh: city-scale OSM and LiDAR, kerb inference, inspector | Done ([report](PHASE1_REPORT.md)) |
| 2 | App shells and user research | Web app done. Native app, user research and real-device accessibility testing not started |
| 3 | Live data and the other cities: Newcastle and Gateshead, London zones, weather, TfL lifts | Done ([report](PHASE3_REPORT.md)) |
| 4 | Navigation and the loop: turn-by-turn, report a problem, offline | First pass done ([report](PHASE4_REPORT.md)) |

The current direction: **fix and fill the pilot cities** with open data that needs no permission, then **check our guesses with real people**. A phone app, whole cities, a reports backend and accounts are deferred by Richard (see **Deferred by Richard**).

## Now

The next five things to pick up, in order.

1. **DATA-02**: Scottish Road Works Register adapter for Edinburgh.
2. **DATA-03**: TfL station data, with lift outages joined on `LiftUniqueId`.
3. **SEC-01**: security headers and a Content Security Policy.
4. **UPD-01**: Dependabot for npm and GitHub Actions.
5. **DATA-22**: check the remaining AllThePlaces-only places against the no-scraping rule.

## Data and coverage

Fix and fill the pilot cities. DATA-01 to DATA-10 are in order of value per day of work (survey §8).

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| DATA-01 | Remove scraped Changing Places records (29) from the search indexes, and filter them in the Overture build | S | now | done (2026-10-05) | Claude | §9, D-028. Also removed 20 GP, dental and hospital records likely from AllThePlaces' NHS spiders: 49 in all |
| DATA-02 | Scottish Road Works Register adapter for Edinburgh: footway works, café tables, scaffolding, hoardings, events | M | now | todo | Claude | §2 #1. SRWR is open (OGL), no application needed. [#10](https://github.com/richardthedesigner/causeway/issues/10) |
| DATA-03 | TfL station data: platform step and gap, which areas each lift connects, toilets. Join lift outages on `LiftUniqueId` | M | now | todo | Claude | §2 #2 and #3, D-020 |
| DATA-04 | TfL station and line disruptions on transit edges | M | next | todo | Claude | §2 #4. Closures and planned step-free losses are invisible today |
| DATA-05 | Street Manager activity archive: skips, scaffolding, hoardings | S | next | todo | Claude | §2 #6, D-027. Same bucket we already read |
| DATA-06 | Edinburgh Adopted Roads: footway surface and width as a separate layer | M | next | todo | Claude | §2 #5, D-008. Width is known on only 8% of Edinburgh's network |
| DATA-07 | Weather warnings, floods and gritted footways: prefer gritted pavements in ice, flag riverside paths in floods | M | next | todo | Claude | §2 #7, #8, #10 |
| DATA-08 | Park entrances (OS Open Greenspace) and OSM Notes | M | next | todo | Claude | §2 #11. Routes end at a gate, not the middle of a park |
| DATA-09 | Toilet Map daily export with verified dates, accessible and RADAR flags | S | next | todo | Claude | §2 #9 |
| DATA-10 | Presets on Inclusive Mobility values: rest intervals, kerb tolerance | S | next | todo | Claude | §8, D-013 |
| DATA-11 | Rebuild the street graphs on the weekly refresh too, not only timetables, works and search | M | next | todo | Claude | [#14](https://github.com/richardthedesigner/causeway/issues/14), D-033. Richard runs the refresh once by hand first (OPEN_ITEMS) |
| DATA-12 | Edinburgh council data: kerb heights, dropped kerbs and tactile paving, steps, widths, setted streets | L | next | blocked | Richard, Claude | Waits on Richard's licence email. §3, §7 |
| DATA-13 | Glasgow council data: kerbs, steps with ramps, bus stops, gritting, pavement parking | L | later | blocked | Richard, Claude | Waits on a licence. The richest council data in the UK. §3, §7 |
| DATA-14 | London borough data: Islington and Southwark (condition, widths, crossings), Westminster (Blue Badge bays), Kensington and Chelsea (tables and chairs) | M | later | blocked | Richard, Claude | Waits on licences. §3, §7 |
| DATA-15 | Canal & River Trust towpath gates and steps, Sustrans path barriers | M | later | blocked | Richard, Claude | Waits on licences. §3, §7 |
| DATA-16 | NHS Service Search, Spatial Hub and Edinburgh Festivals data | M | later | blocked | Richard, Claude | Waits on keys with long lead times. §7 |
| DATA-17 | Met Office DataHub for production weather | S | later | blocked | Richard, Claude | D-011. Waits on a key ([#9](https://github.com/richardthedesigner/causeway/issues/9)) |
| DATA-18 | Live Street Manager feed for England | M | later | blocked | Richard, Claude | Waits on Richard's application. [#10](https://github.com/richardthedesigner/causeway/issues/10) |
| DATA-19 | Tyne and Wear Metro lift status | M | later | blocked | Richard, Claude | Waits on Nexus. [#13](https://github.com/richardthedesigner/causeway/issues/13) |
| DATA-20 | Live bus and tram departures in Edinburgh and Newcastle | M | later | blocked | Claude | [#8](https://github.com/richardthedesigner/causeway/issues/8). Lothian 403, Transport for Edinburgh 522, Nexus needs a key |
| DATA-21 | Map York Place and the western way into the Grassmarket in OSM (about 1.1 km) | M | later | todo | Richard | [DEVICES.md](plans/DEVICES.md). Turns unknowns into known ground |
| DATA-22 | Check the 352 remaining AllThePlaces-only places against the no-scraping rule (DATA_SOURCES rule 5) | S | now | todo | Richard, Claude | Mostly chain stores, parcel lockers and scout halls. Overture doesn't say which spider a record came from. Richard decides whether chain-store sites count |

## Research: check our guesses with real people

Routes are shaped by numbers we estimated. These need disabled testers in each city before launch (Phase 2).

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| RES-01 | Calibrate costs: gradient limits, unknown-data risk, crossings, unlit streets, bus waits | L | next | todo | Richard, Claude | [#12](https://github.com/richardthedesigner/causeway/issues/12), D-013, D-037, D-038 |
| RES-02 | Testing with five or more wheelchair and scooter users | L | next | todo | Richard | Feeds RES-01 and the preset numbers |
| RES-03 | Testing with blind and partially sighted users (crossings, lighting) | L | next | todo | Richard | D-037, D-038 |
| RES-04 | Follow up with the tester who uses Cherry and Lulu on the device switcher | S | next | todo | Richard | [DEVICES.md](plans/DEVICES.md) |
| RES-05 | Check inferred kerbs at controlled crossings against what's really there | M | next | todo | Richard | D-015 |
| RES-06 | Measure gradients on the ground in each city, starting with West Bow and Victoria Terrace | M | next | todo | Richard | Validates LiDAR. Those two decide Cherry's Grassmarket route |
| RES-07 | Accessibility testing on real devices: VoiceOver, TalkBack, Switch Control, Voice Control | M | next | todo | Richard, Claude | [UX_ASSESSMENT.md](UX_ASSESSMENT.md). axe catches about a third of WCAG issues |
| RES-08 | Benchmark every acceptance journey against openrouteservice's wheelchair profile | M | later | todo | Claude | D-003 |
| RES-09 | Choose where to go next with census disability data, Blue Badge statistics and station usage | M | later | todo | Claude | §5 |

## Features

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| FEAT-01 | Battery range per device (`maxRangeKm`), with a warning on long routes | M | next | todo | Claude | [DEVICES.md](plans/DEVICES.md) follow-ups |
| FEAT-02 | Separate road and pavement speeds for road scooters | M | later | todo | Claude | Only if pace learning shows it matters |
| FEAT-03 | "Report what's there" from "What we don't know" on a route | M | next | todo | Claude | UX_ASSESSMENT open finding. Reports stay on the device until the backend is back on |
| FEAT-04 | Saved places (home, work, a friend's) | M | next | todo | Claude | On the device, like devices (D-009) |
| FEAT-05 | Arrive by a time, as well as leave at one | M | later | todo | Claude | D-040 built "Leaving later" |
| FEAT-06 | Changing Places toilets as their own search and route option | M | later | blocked | Claude | Needs a licensed source first (DATA-01, §9) |
| FEAT-07 | Rest points on the route for people with a rest limit (benches, seats) | M | later | todo | Claude | D-018 |
| FEAT-08 | Offline city packs: download a city once, with its size shown | L | later | todo | Claude | D-023 caches what's been loaded |
| FEAT-09 | Step-free routes across all of London's Underground, not only the Jubilee line and DLR | L | later | todo | Claude | Builds on DATA-03 |
| FEAT-10 | National Rail stations with Passenger Assist details | M | later | todo | Claude | Live trains wait on a key ([#9](https://github.com/richardthedesigner/causeway/issues/9)) |
| FEAT-11 | Shareable route links | M | later | todo | Claude | |
| FEAT-12 | Companion page: a live arrival link for someone meeting you | L | later | todo | Claude | D-004 web scope. Destination and time only, never the profile |
| FEAT-13 | ETA from the user's own speed over time | M | later | todo | Claude | Pace learning exists per device (D-036) |
| FEAT-14 | Multi-stop trips (shop, then toilet, then home) | L | later | todo | Claude | |
| FEAT-15 | Street-level imagery for complex junctions (Mapillary) | L | later | blocked | Richard, Claude | Licence (D-008) and a key ([#9](https://github.com/richardthedesigner/causeway/issues/9)) |
| FEAT-16 | Welsh and Scottish Gaelic, with one place for all copy | L | later | todo | Claude | |
| FEAT-17 | Indoor and station routing (lifts, platforms, step-free interchanges) | XL | later | todo | Claude | Start with one big station |

## Small features

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SMALL-01 | Opening hours that know bank holidays | S | next | todo | Claude | D-039 says "may differ on bank holidays" today |
| SMALL-02 | Miles or kilometres setting | S | next | todo | Claude | |
| SMALL-03 | Choose how often navigation speaks (every turn, hazards only, off) | S | next | todo | Claude | |
| SMALL-04 | Copy the route as text, for a carer or a message | S | next | todo | Claude | `describeSegments` already writes it |
| SMALL-05 | A high-contrast map style | S | next | todo | Claude | For the low-vision profile |
| SMALL-06 | A clear "no signal" state that says what still works offline | S | next | todo | Claude | |
| SMALL-07 | Print-friendly route | S | later | todo | Claude | |
| SMALL-08 | Keyboard shortcuts on desktop (search, swap ends, start) | S | later | todo | Claude | |
| SMALL-09 | "Why this way?" one tap from the navigation screen | S | later | todo | Claude | |
| SMALL-10 | Recent journeys, not just recent places | S | later | todo | Claude | `recents.ts` |
| SMALL-11 | Weather for trips more than 48 hours ahead | S | later | todo | Claude | D-040 falls back to today's |

## Security and privacy

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SEC-01 | Security headers and a Content Security Policy in `apps/web/vercel.json` (a static export can't set them in Next) | S | now | todo | Claude | |
| SEC-02 | `SECURITY.md`: how to report a vulnerability | S | next | todo | Claude | |
| SEC-03 | Pin GitHub Actions to commit SHAs and give each workflow the least permissions it needs | S | next | todo | Claude | |
| SEC-04 | `pnpm audit` in CI, failing on high severity | S | next | todo | Claude | |
| SEC-05 | Check nothing leaks the profile (logs, URLs, error messages) | S | next | todo | Claude | D-009 |
| SEC-06 | Export and delete everything about me, in one place | M | next | todo | Claude | UK GDPR. Needed with or without accounts |
| SEC-07 | Review row-level security and storage bucket rules against a threat model | M | later | todo | Claude | `db/migrations`, `scripts/test-db.sh` |
| SEC-08 | Harden `/review`: sign-in rate limits, session length | S | later | todo | Claude | |
| SEC-09 | Cloudflare Turnstile on anonymous sign-up, before any publicity | S | later | blocked | Richard, Claude | D-030 |
| SEC-10 | Data protection impact assessment (DPIA), before wider launch | M | later | blocked | Richard | D-030 |
| SEC-11 | Name the weekly reviewer for flags, photos and reports | S | later | blocked | Richard | [BACKEND.md](BACKEND.md). Only once sharing is on |

## Stability and testing

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| STAB-01 | End-to-end test in the built app: search, route, start, end | M | next | todo | Claude | Playwright already runs in CI for `pnpm a11y` |
| STAB-02 | Screenshot tests for the main screens, light and dark, 320 px and 200% text | M | next | todo | Claude | Replaces hand-checked screenshots |
| STAB-03 | Version the on-device stores (devices, notes, recents) and migrate old data | S | next | todo | Claude | A bad migration loses someone's devices |
| STAB-04 | Router fuzz test: many random start and end points per city, no crashes, no impossible routes | M | next | todo | Claude | |
| STAB-05 | Timeouts and fallbacks for every live adapter | S | next | todo | Claude | `packages/live` |
| STAB-06 | Data refresh guard: fail the weekly PR if counts drop by more than a set amount | S | next | todo | Claude | D-033 |
| STAB-07 | The routing worker recovers if it crashes, and says so | S | later | todo | Claude | `router.worker.ts` |
| STAB-08 | Offline test: load a city, cut the network, route | S | later | todo | Claude | D-023 |

## Speed

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SPEED-01 | Measure first load, city load and time to first route on a mid-range phone | S | next | todo | Claude | Numbers first, then targets |
| SPEED-02 | Router benchmark in CI, failing if a journey gets much slower | S | next | todo | Claude | Uses the acceptance journeys |
| SPEED-03 | Bundle-size and Lighthouse budgets in CI | S | later | todo | Claude | |
| SPEED-04 | Load the `/review` page's code only for reviewers | S | later | todo | Claude | |
| SPEED-05 | Smaller search index per city | S | later | todo | Claude | `data/places` |
| SPEED-06 | A compact binary graph format instead of gzipped JSON | L | later | todo | Claude | Only if SPEED-01 shows graph load matters |

## Bloat reduction

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| BLOAT-01 | Move the four `step2-*.png` screenshots out of the repo root (about 760 KB) | S | next | blocked | Richard, Claude | Waits on Richard: move to `docs/ux/` or delete (OPEN_ITEMS) |
| BLOAT-02 | Find unused files, exports and dependencies (`knip`) | S | next | todo | Claude | |
| BLOAT-03 | Split `page.tsx` and `RoutePanel.tsx`, the two largest components | M | next | todo | Claude | About 600 lines each |
| BLOAT-04 | Retire the Phase 0 scripts (`build-snapshot`, `build-edinburgh`, `spike-edinburgh`) if `build-area` covers them | S | later | todo | Claude | Keep the acceptance snapshot working |
| BLOAT-05 | Keep the 18 MB base map out of git history (release assets or LFS) | M | later | todo | Richard, Claude | `.git` is 52 MB and grows with every refresh |
| BLOAT-06 | Archive UX screenshots in `docs/ux` that no doc links to | S | later | todo | Claude | |

## Updates

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| UPD-01 | Dependabot for npm and GitHub Actions, grouped weekly | S | now | todo | Claude | |
| UPD-02 | MapLibre GL 4.7 to 5 | M | next | todo | Claude | Pinned at 4.7.1. Check the Protomaps style still renders |
| UPD-03 | Next.js to the current major | M | later | todo | Claude | Static export must keep working |
| UPD-04 | Keep Node in CI on the current LTS | S | later | todo | Claude | `engines` says 22 |

## Deployment and release

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| DEP-01 | Make `main` the default and production branch, and retire the mirror workflow | S | next | blocked | Richard | GitHub and Vercel settings. See `mirror-production.yml` |
| DEP-02 | Stay under Vercel's free limit of 100 deployments a day | S | next | done (2026-10-04) | Claude | `apps/web/vercel.json` turns off `claude/*` previews (3decc02) |
| DEP-03 | Skip Vercel builds for docs-only changes on `main` | S | later | todo | Claude | An `ignoreCommand`. Follows DEP-02 |
| DEP-04 | A service worker update prompt, so nobody is stuck on an old build | S | next | todo | Claude | D-023 |
| DEP-05 | Privacy-safe error reporting (no locations, no profile) | M | later | todo | Richard, Claude | Choose a tool and record it in DECISIONS |
| DEP-06 | Release notes and version numbers users can see | S | later | todo | Claude | The build log is internal |
| DEP-07 | A custom domain | S | later | blocked | Richard | Needs a name and payment |

## Reviews

Repeat on the cadence shown. When one is done, set it back to `todo` with the next date in Notes, and log what it found.

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| REV-01 | Docs freshness: README status line, UX_ASSESSMENT, OPEN_ITEMS, this file | S | next | todo | Claude | Monthly |
| REV-02 | Security review of the whole repo | M | next | todo | Claude | Quarterly |
| REV-03 | Code review of the largest and most-changed files | S | next | todo | Claude | Monthly |
| REV-04 | Decisions review: anything marked as a guess or "reconsider" (D-010, D-013, D-037, D-038) | S | later | todo | Richard, Claude | Quarterly |
| REV-05 | Data licence and attribution review | S | later | todo | Claude | Each new source, and yearly. [DATA_SOURCES.md](DATA_SOURCES.md) |
| REV-06 | Dependency review: what we pull in and why | S | later | todo | Claude | Quarterly |

## Deferred by Richard

Not now, on purpose, until Richard says otherwise. Each needs a decision from him first ([OPEN_ITEMS.md](OPEN_ITEMS.md#deferred-by-richard)).

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| DEF-01 | Native app (Expo): lock-screen progress, background location, haptics | XL | later | blocked | Richard, Claude | D-004. Needs Apple and Google developer accounts |
| DEF-02 | Whole cities, starting with all of Edinburgh | L | later | blocked | Richard, Claude | D-014. Needs a build worker (DEF-03) |
| DEF-03 | Graph builds on a worker (Fly.io or Cloud Run) with normal network access | M | later | blocked | Richard, Claude | D-010 |
| DEF-04 | Reports backend: store and moderate public reports | L | later | blocked | Richard, Claude | D-022, D-030 |
| DEF-05 | Send fixes back to OpenStreetMap from reports and notes | L | later | blocked | Richard, Claude | D-008. Needs DEF-04 |
| DEF-06 | Crowd verification: several people confirming the same note | L | later | blocked | Claude | Needs DEF-04 |
| DEF-07 | Optional accounts: sync devices and saved places between phones, encrypted on the device, sign in with a passkey or email code | L | later | blocked | Richard, Claude | Health data makes this a privacy decision first (D-009) |
| DEF-08 | Opt-in surface sensing from the accelerometer | L | later | blocked | Claude | Needs DEF-01 and a privacy review |
| DEF-09 | Beyond the pilot cities: Glasgow first (once DATA-13 is licensed), then Wales | XL | later | blocked | Richard, Claude | §5 |

## Log

Newest first. One line per change: date, ID, what happened, link.

- 2026-10-05: DATA-01 done. 49 AllThePlaces-only records out of the search indexes (29 Changing Places, 20 NHS services) and `scrapedOnly` filters them in future builds. Added DATA-22.
- 2026-10-04: Merged the two roadmaps (#31 and #34) into this one. Kept #34's order, phases and Drive copy; added IDs, sizes and owners across every area. Gateshead walking (#7) and Overture duplicates (#15) were already closed.
- 2026-10-04: DEP-02 done: Vercel no longer builds `claude/*` branches (3decc02).
- 2026-10-04: Roadmap created (#34), from the UK data survey.
