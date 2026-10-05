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

1. **STAB-06**: fail the weekly data refresh if counts drop too far.
2. **SEC-06**: export and delete everything about me, in one place.
3. **SMALL-01**: opening hours that know bank holidays.
4. **STAB-13**: the city name at the top of the map at 200% text.
5. **STAB-07**: the routing worker recovers if it crashes, and says so.

The rest of the pilot-city data (DATA-12 to DATA-20) is blocked on access, licences or keys. Research (RES) needs Richard and testers.

## Data and coverage

Fix and fill the pilot cities. DATA-01 to DATA-10 are in order of value per day of work (survey §8).

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| DATA-01 | Remove scraped Changing Places records (29) from the search indexes, and filter them in the Overture build | S | now | done (2026-10-04) | Claude | D-028. `scrapedOnly()` in the Overture merge; 53 records stripped from the indexes (29 Changing Places, 24 GP, dentist, hospital and pharmacy) |
| DATA-02 | Scottish Road Works Register adapter for Edinburgh: footway works, café tables, scaffolding, hoardings, events | M | now | done (2026-10-05) | Claude | §2 #1. D-057. `pnpm build:srwr`, weekly in the data refresh: 456 entries from the export of 2026-10-05, in our own words. Advance notices left out. [#10](https://github.com/richardthedesigner/causeway/issues/10) |
| DATA-03 | TfL station data: platform step and gap, which areas each lift connects, toilets. Join lift outages on `LiftUniqueId` | M | now | done (2026-10-04) | Claude | D-020. `scripts/tfl-station-access.ts`; `applyStationAccess` and `stepFreeLines`. 10 northern Jubilee stations now known not step-free |
| DATA-04 | TfL station and line disruptions on transit edges | M | now | done (2026-10-04) | Claude | D-020. `packages/live/src/tfl-disruptions.ts`, refreshed with the lifts. Rides get refs at load (`refRides`) |
| DATA-05 | Street Manager activity archive: skips, scaffolding, hoardings | S | now | done (2026-10-04) | Claude | D-027. Activity archive in `pnpm build:works`: 9 in Newcastle, 5 in London, all "on the pavement". 2026-10-05: six monthly archives (a bad month skipped), a five-week horizon, multi-part shapes split, closed only on the activity's own words (D-027 update, from PR #36) |
| DATA-06 | Edinburgh Adopted Roads: footway surface and width as a separate layer | M | next | done (2026-10-04) | Claude | D-046. `pnpm build:footways`, `data/council/`. Widths on pavement edges 1,731 to 8,707 |
| DATA-07 | Weather warnings, floods and gritted footways: prefer gritted pavements in ice, flag riverside paths in floods | M | now | done (2026-10-04) | Claude | D-047. Edinburgh gritting routes in the council layer (1,130 edges); EA flood warnings live (`pnpm build:floods`). Met Office warnings still wait on a key (DATA-17); Scotland floods are DATA-25 |
| DATA-08 | Park entrances (OS Open Greenspace) and OSM Notes | M | now | done (2026-10-04) | Claude | D-048. `pnpm build:greenspace` (648 gates in Edinburgh); `pnpm build:osm-notes` (28 in Edinburgh, 23 in London), shown only |
| DATA-09 | Toilet Map daily export with verified dates, accessible and RADAR flags | S | now | done (2026-10-04) | Claude | D-049. `pnpm build:toilets`; merged at load, OSM first. Edinburgh 62, Newcastle 22, London 73 |
| DATA-10 | Presets on Inclusive Mobility values: rest intervals, kerb tolerance | S | now | done (2026-10-04) | Claude | D-013. Walking stick and crutches 50 m, fatigue 100 m. Kerbs unchanged (IM 6 mm is a build tolerance) |
| DATA-11 | Rebuild the street graphs on the weekly refresh too, not only timetables, works and search | M | now | done (2026-10-04) | Claude | D-033. The refresh rebuilds graphs, then footways, floods, gates, notes and toilets. Newcastle took 37 s here. Richard still runs it once by hand first |
| DATA-12 | Edinburgh council data: kerb heights, dropped kerbs and tactile paving, steps, widths, setted streets | L | next | blocked | Richard, Claude | Waits on Richard's licence email. §3, §7 |
| DATA-13 | Glasgow council data: kerbs, steps with ramps, bus stops, gritting, pavement parking | L | later | blocked | Richard, Claude | Waits on a licence. The richest council data in the UK. §3, §7 |
| DATA-14 | London borough data: Islington and Southwark (condition, widths, crossings), Westminster (Blue Badge bays), Kensington and Chelsea (tables and chairs) | M | later | blocked | Richard, Claude | Waits on licences. §3, §7 |
| DATA-15 | Canal & River Trust towpath gates and steps, Sustrans path barriers | M | later | blocked | Richard, Claude | Waits on licences. §3, §7 |
| DATA-16 | NHS Service Search, Spatial Hub and Edinburgh Festivals data | M | later | blocked | Richard, Claude | Waits on keys with long lead times. §7 |
| DATA-17 | Met Office DataHub for production weather | S | later | blocked | Richard, Claude | D-011. Waits on a key ([#9](https://github.com/richardthedesigner/causeway/issues/9)) |
| DATA-18 | Live Street Manager feed for England | M | later | blocked | Richard, Claude | Waits on Richard's application. [#10](https://github.com/richardthedesigner/causeway/issues/10) |
| DATA-19 | Tyne and Wear Metro lift status | M | later | blocked | Richard, Claude | Waits on Nexus. [#13](https://github.com/richardthedesigner/causeway/issues/13) |
| DATA-20 | Live bus and tram departures in Edinburgh and Newcastle | M | later | blocked | Claude | [#8](https://github.com/richardthedesigner/causeway/issues/8). Lothian 403, Transport for Edinburgh 522, Nexus needs a key |
| DATA-22 | Should the council's pavement surface win over OSM on streets drawn as one line? | S | next | blocked | Richard, Claude | D-046. They disagree on 2,822 of 6,341 edges; OSM wins today. A decision, then a one-line change |
| DATA-23 | TfL station toilets in the toilet layer and search (65 at our stations, with RADAR and accessible flags) | S | now | done (2026-10-05) | Claude | PR #33. One place per station (24 stations, 65 toilets); toilets past the gates are for customers and aren't offered as stops |
| DATA-24 | Rebuild the council footway layer on the weekly refresh | S | later | done (2026-10-04) | Claude | Done by DATA-11 |
| DATA-25 | Scotland's flood warnings (SEPA) for the Water of Leith walkway | M | later | todo | Claude | D-047. No open feed matching the EA's found yet; look again |
| DATA-26 | Pavement gritting routes for Newcastle and London | S | later | todo | Claude | D-047. None open found; City of London has priority pavements (survey §2 #10) |
| DATA-27 | Do the 348 places that come only from AllThePlaces break the no-scraping rule (DATA_SOURCES rule 5)? | S | next | blocked | Richard, Claude | D-028. Mostly chain stores, parcel lockers and scout halls. Overture doesn't say which spider a record came from. Richard decides; then filter in `scrapedOnly` or leave as is |
| DATA-28 | Presets on Inclusive Mobility values: manual wheelchair kerb 6 mm, unmeasured dropped kerbs at 6 mm, kerb text in mm, "More benches" ladder and speed | S | now | done (2026-10-05) | Claude | D-054, D-055. Ported from PR #36. Rollator keeps 300 m (Richard). Outcomes for all 91 journey and preset pairs in D-054 |
| DATA-29 | TfL station data on the platforms: a lift out that leaves some platforms step-free counts as unknown, and the step and gap to the train against each person's limits, with level-access doors | M | now | done (2026-10-05) | Claude | D-058, D-060. Ported from PR #36. No gap-limit setting yet (OPEN_ITEMS) |
| DATA-21 | Map York Place and the western way into the Grassmarket in OSM (about 1.1 km) | M | later | todo | Richard | [DEVICES.md](plans/DEVICES.md). Turns unknowns into known ground |

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
| RES-10 | Ask road scooter riders whether they want routes on roads, and whether to avoid busy ones | S | next | todo | Richard | D-051: routes now move onto roads at 8 mph |

## Features

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| FEAT-01 | Battery range per device (`maxRangeKm`), with a warning on long routes | M | next | done (2026-10-04) | Claude | D-043. Range engine from PR #26, and "Warn me about battery range" in the device editor |
| FEAT-02 | Separate road and pavement speeds for road scooters | M | later | done (2026-10-05) | Claude | D-051. Road speed setting is FEAT-18 |
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
| FEAT-18 | Road speed setting for road scooters in the device editor | S | later | done (2026-10-05) | Claude | D-051. 4 to 8 mph, and a per-device mph or km/h choice for speeds |

## Small features

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SMALL-01 | Opening hours that know bank holidays | S | now | todo | Claude | D-039 says "may differ on bank holidays" today |
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
| SMALL-12 | A favicon and app icons (every page load asks for `/favicon.ico` and gets a 404) | S | later | todo | Claude | Found doing SEC-04 |

## Security and privacy

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SEC-01 | Security headers and a Content Security Policy in `apps/web/vercel.json` (a static export can't set them in Next) | S | now | done (2026-10-04) | Claude | D-041. `apps/web/vercel.json`. `pnpm a11y` and `pnpm e2e` serve the build with the same headers and fail on anything the policy blocks |
| SEC-02 | `SECURITY.md`: how to report a vulnerability | S | next | done (2026-10-04) | Claude | `SECURITY.md`. Private reporting has to be turned on (SEC-14) |
| SEC-03 | Pin GitHub Actions to commit SHAs and give each workflow the least permissions it needs | S | next | done (2026-10-04) | Claude | Pinned to the latest release in each major, version in a comment. CI has `contents: read` |
| SEC-04 | `pnpm audit` in CI, failing on high severity | S | now | done (2026-10-05) | Claude | PR #33, D-050. Found a critical MapLibre hole and two high PostCSS ones; fixed by MapLibre 6.12 and a PostCSS override |
| SEC-05 | Check nothing leaks the profile (logs, URLs, error messages) | S | now | done (2026-10-05) | Claude | PR #33, D-009. No leak found. `pnpm e2e` now fails if any request carries the device's name, type or limits |
| SEC-06 | Export and delete everything about me, in one place | M | now | todo | Claude | UK GDPR. Needed with or without accounts |
| SEC-07 | Review row-level security and storage bucket rules against a threat model | M | later | todo | Claude | `db/migrations`, `scripts/test-db.sh` |
| SEC-08 | Harden `/review`: sign-in rate limits, session length | S | later | todo | Claude | |
| SEC-09 | Cloudflare Turnstile on anonymous sign-up, before any publicity | S | later | blocked | Richard, Claude | D-030 |
| SEC-10 | Data protection impact assessment (DPIA), before wider launch | M | later | blocked | Richard | D-030 |
| SEC-12 | Check the headers are live on production (`curl -I`), and score them on securityheaders.com | S | next | todo | Claude | D-041. Production has Vercel login protection on its `vercel.app` URLs, which may need Richard |
| SEC-13 | Drop `'unsafe-inline'` from the CSP's `script-src`: hashes for Next's inline scripts at build time | S | later | todo | Claude | D-041. They change every build |
| SEC-14 | Turn on private vulnerability reporting (Settings, then Code security) | S | next | blocked | Richard | `SECURITY.md` points people to it |
| SEC-11 | Name the weekly reviewer for flags, photos and reports | S | later | blocked | Richard | [BACKEND.md](BACKEND.md). Only once sharing is on |

## Stability and testing

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| STAB-01 | End-to-end test in the built app: search, route, start, end | M | next | done (2026-10-04) | Claude | `pnpm e2e` in CI, one journey per city. Found STAB-09 on its first run |
| STAB-02 | Screenshot tests for the main screens, light and dark, 320 px and 200% text | M | next | todo | Claude | Replaces hand-checked screenshots |
| STAB-03 | Version the on-device stores (devices, notes, recents) and migrate old data | S | next | done (2026-10-04) | Claude | D-044. `lib/stored.ts` for devices, notes and reports: version in the key, old keys never rewritten, anything unreadable backed up |
| STAB-04 | Router fuzz test: many random start and end points per city, no crashes, no impossible routes | M | next | todo | Claude | |
| STAB-05 | Timeouts and fallbacks for every live adapter | S | now | done (2026-10-05) | Claude | D-052. `getJson` in `packages/live/src/http.ts`: 10 s for feeds, 6 s for live search. `pnpm e2e` hangs every feed in London and checks the fallbacks |
| STAB-06 | Data refresh guard: fail the weekly PR if counts drop by more than a set amount | S | now | todo | Claude | D-033 |
| STAB-07 | The routing worker recovers if it crashes, and says so | S | now | todo | Claude | `router.worker.ts` |
| STAB-09 | A city opened from last time started from Edinburgh's Causewayside, 537 km from London | S | next | done (2026-10-04) | Claude | Found by STAB-01. `page.tsx` sets the saved city's start |
| STAB-10 | End-to-end journeys for the device switcher, notes and Leaving later | S | now | done (2026-10-05) | Claude | PR #33. Two devices and a switch, leaving in an hour, a route and a note. Found and fixed the drawer's last 6% being unreachable |
| STAB-11 | The device editor's header fills a 320 by 640 screen at 200% text | S | now | done (2026-10-05) | Claude | PR #33. Description scrolls with the content; bars, icon buttons and switches in pixels. `pnpm a11y` checks it |
| STAB-12 | 200% text at 320 px on the other screens: route panel, navigation, search, note and report sheets | S | now | done (2026-10-05) | Claude | `pnpm a11y` checks six more screens. Grids hold their width, chip rows and section headings wrap, navigation's two panels take half the screen each and scroll |
| STAB-13 | The city name at the top of the map is cut off at 200% text on a 320 px phone ("Edinbur", under the layers button) | S | now | todo | Claude | Found doing STAB-12. `MapChrome.tsx`. Not caught by `pnpm a11y`: it's clipped, not off the side |
| STAB-14 | Time limits for the sharing and review calls to Supabase | S | later | todo | Claude | Found doing STAB-05. `lib/sync.ts`, `lib/review.ts`. Sharing is off today (D-030), so nothing waits on them yet |
| STAB-08 | Offline test: load a city, cut the network, route | S | later | todo | Claude | D-023 |

## Speed

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SPEED-01 | Measure first load, city load and time to first route on a mid-range phone | S | next | todo | Claude | Numbers first, then targets |
| SPEED-02 | Router benchmark in CI, failing if a journey gets much slower | S | next | done (2026-10-05) | Claude | D-056, [PERF_BASELINE](plans/PERF_BASELINE.md). Ported from PR #36. `scripts/perf-budget.test.ts` in `pnpm test`; `pnpm perf:baseline` |
| SPEED-03 | Bundle-size and Lighthouse budgets in CI | S | later | todo | Claude | |
| SPEED-04 | Load the `/review` page's code only for reviewers | S | later | todo | Claude | |
| SPEED-05 | Smaller search index per city | S | later | todo | Claude | `data/places` |
| SPEED-06 | A compact binary graph format instead of gzipped JSON | L | later | todo | Claude | Only if SPEED-01 shows graph load matters |
| SPEED-07 | Speed budget follow-ups: a CI wall-time baseline from a few weeks of printed figures, and a re-baseline when the weekly refresh changes the graphs | S | later | todo | Claude | D-056. Settled nodes depend on the graph, so a refresh PR can trip the 10% check |

## Bloat reduction

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| BLOAT-01 | Move the four `step2-*.png` screenshots out of the repo root (about 760 KB) | S | next | done (2026-10-04) | Richard, Claude | Moved to `docs/ux/devices/` and linked from DEVICES.md. Delete them if they aren't wanted |
| BLOAT-02 | Find unused files, exports and dependencies (`knip`) | S | next | todo | Claude | |
| BLOAT-03 | Split `page.tsx` and `RoutePanel.tsx`, the two largest components | M | next | todo | Claude | About 600 lines each |
| BLOAT-04 | Retire the Phase 0 scripts (`build-snapshot`, `build-edinburgh`, `spike-edinburgh`) if `build-area` covers them | S | later | todo | Claude | Keep the acceptance snapshot working |
| BLOAT-05 | Keep the 18 MB base map out of git history (release assets or LFS) | M | later | todo | Richard, Claude | `.git` is 52 MB and grows with every refresh |
| BLOAT-06 | Archive UX screenshots in `docs/ux` that no doc links to | S | later | todo | Claude | |

## Updates

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| UPD-01 | Dependabot for npm and GitHub Actions, grouped weekly | S | now | done (2026-10-04) | Claude | `.github/dependabot.yml`. MapLibre and Next.js majors left to UPD-02 and UPD-03 |
| UPD-02 | MapLibre GL 4.7 to 5 | M | next | done (2026-10-05) | Claude | PR #33, with SEC-04: straight to 6.12 for a critical fix. The worker is now a module file in `public/maplibre/` |
| UPD-03 | Next.js to the current major | M | later | todo | Claude | Static export must keep working |
| UPD-04 | Keep Node in CI on the current LTS | S | later | todo | Claude | `engines` says 22 |

## Deployment and release

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| DEP-01 | Make `main` the default and production branch, and retire the mirror workflow | S | next | blocked | Richard | GitHub and Vercel settings. See `mirror-production.yml` |
| DEP-02 | Stay under Vercel's free limit of 100 deployments a day | S | next | done (2026-10-04) | Claude | `apps/web/vercel.json` turns off `claude/*` previews (3decc02) |
| DEP-03 | Skip Vercel builds for docs-only changes on `main` | S | later | done (2026-10-04) | Claude | D-042. `ignoreCommand` in `apps/web/vercel.json`: also skips `main`, which mirrors production |
| DEP-04 | A service worker update prompt, so nobody is stuck on an old build | S | next | done (2026-10-04) | Claude | D-045. `UpdatePrompt`: Reload or Later, never during navigation |
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

- 2026-10-05: DATA-29 done: the step and gap to the train held to each person's limits, with level-access doors in the spoken route (D-060).
- 2026-10-05: Added DATA-29 (TfL station data on the platforms, ported from PR #36). A lift out that leaves some platforms step-free now counts as unknown, not closed (D-058).
- 2026-10-05: DATA-05 extended: six monthly activity archives, closure words and a five-week horizon (D-027 update, ported from PR #36).
- 2026-10-05: DATA-02 done: Edinburgh's works from the Scottish Road Works Register (D-057, ported from PR #36).
- 2026-10-05: SPEED-02 done (speed budget, ported from PR #36). Added SPEED-07.
- 2026-10-05: Added DATA-28 (presets on Inclusive Mobility values, ported from PR #36) and marked it done.
- 2026-10-05: FEAT-18 done: "Speed on the road" for road scooters (4 to 8 mph), and "Show speeds in: mph or km/h" per device (D-051).
- 2026-10-05: STAB-05 done (D-052). Added STAB-14. Promoted STAB-07. Now: STAB-06, SEC-06, SMALL-01, STAB-13, STAB-07.
- 2026-10-05: FEAT-02 done: road scooters go at road speed on roads, and pace learning skips road stretches (D-051). Added FEAT-18 (road speed setting) and RES-10 (ask riders about road routes).
- 2026-10-05: STAB-12 done. Added STAB-13. Now: STAB-05, STAB-06, SEC-06, SMALL-01, STAB-13.
- 2026-10-05: Added DATA-27 (the remaining AllThePlaces-only places), found doing DATA-01 in a parallel session (closed PR #37).
- 2026-10-05: DATA-23, SEC-04, SEC-05, STAB-10, STAB-11 done in PR #33, and UPD-02 with SEC-04. Added STAB-12, SMALL-12. Now: STAB-12, STAB-05, STAB-06, SEC-06, SMALL-01.
- 2026-10-04: DATA-07 to DATA-11 done in PR #33, and DATA-24 with them. Added DATA-25, DATA-26. Now: DATA-23, SEC-04, SEC-05, STAB-10, STAB-11.
- 2026-10-04: DATA-01, DATA-03, DATA-04, DATA-05 and DATA-06 done in PR #33. DATA-02 blocked (SRWR unreachable from the cloud). Added DATA-22 to DATA-24. Now: DATA-07 to DATA-11.
- 2026-10-04: SEC-01, SEC-02, SEC-03, STAB-01, STAB-03, STAB-09, UPD-01, FEAT-01, DEP-03, DEP-04 and BLOAT-01 done in PR #33 (branch `claude/clever-fermat-ij543q`), carried over from the earlier roadmap's IDs. Added SEC-12 to SEC-14, STAB-10, STAB-11. Now: DATA-01 to DATA-05.
- 2026-10-04: Merged the two roadmaps (#31 and #34) into this one. Kept #34's order, phases and Drive copy; added IDs, sizes and owners across every area. Gateshead walking (#7) and Overture duplicates (#15) were already closed.
- 2026-10-04: DEP-02 done: Vercel no longer builds `claude/*` branches (3decc02).
- 2026-10-04: Roadmap created (#34), from the UK data survey.
