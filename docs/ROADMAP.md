# Roadmap

The one list of work for Causewayside. Every task, human or Claude, starts here and writes back here. Started 2026-10-04.

- **Why** a choice was made: [DECISIONS.md](DECISIONS.md). **What** shipped: [BUILD_LOG.md](BUILD_LOG.md). **Detail** for a single item: the linked GitHub issue or plan.
- This file says what's next, how big it is, and what state it's in.

## How to use this file

**Before you start any task**
1. Read **Now** and the section your task belongs to.
2. If your task is already here, use its ID in your branch, commit messages and PR title (for example `SEC-02: security headers`).
3. If it isn't here, add it in the right section before you start, with a new ID.
4. Set its status to `doing` and put the date and your branch in Notes.

**When you finish**
1. Set the status to `done (YYYY-MM-DD)`. Leave the row where it is, so IDs stay findable.
2. Add one line to the **Log** at the bottom.
3. Anything you found but didn't do: add it as a new row. Don't leave it only in a PR or a chat.
4. If **Now** has fewer than five open items, promote the next most useful ones.

**Fields**
- **Size:** `S` under an hour or two. `M` a day or so. `L` several days. `XL` a project of its own, which needs a plan in `docs/plans/` first.
- **Priority:** `now`, `next`, `later`.
- **Status:** `todo`, `doing`, `blocked`, `done`. Blocked names what it waits on.
- **Who:** `Claude` (can be done in a session), `Richard` (needs an account, a decision, money or a person), or both.

Keep rows to one line. Detail goes in an issue, a plan or the Notes column.

## Now

The next five things to pick up, in order. Each points to its row below.

1. **BLOAT-01**: move the four `step2-*.png` screenshots out of the repo root.
2. **SEC-01**: security headers and a Content Security Policy on Vercel.
3. **UPD-01**: Dependabot (or Renovate) for npm and GitHub Actions.
4. **STAB-01**: an end-to-end journey test in the built app.
5. **FEAT-01**: battery range per device.

## Big features

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| BIG-01 | Native app (Expo) with background location, lock-screen progress and haptics | XL | next | blocked | Richard, Claude | D-004. Waits on Apple and Google developer accounts (HUM-05) |
| BIG-02 | The whole of Edinburgh, not just the centre | L | next | todo | Claude | D-014. Needs the graph build to run outside a laptop (DEP-06) |
| BIG-03 | A fourth city (Glasgow, Manchester or Bristol) | L | later | todo | Richard, Claude | Richard picks the city. Check LiDAR or terrain coverage first |
| BIG-04 | Offline city packs: download a city once, route with no signal | L | next | todo | Claude | D-023 caches what's been loaded. This makes it a choice with a size shown |
| BIG-05 | Companion page: a live arrival link for someone meeting you | L | later | todo | Claude | D-004 web scope. Destination and time only, never the profile |
| BIG-06 | Send fixes back to OpenStreetMap from reports and notes | L | later | todo | Richard, Claude | D-008. Needs an OSM account flow and a review step |
| BIG-07 | Crowd verification: several people confirming the same note | L | later | todo | Claude | Phase 4 "not yet". Builds on D-030 pseudonyms |
| BIG-08 | Indoor and station routing (lifts, platforms, step-free interchanges) | XL | later | todo | Claude | Start with one big station |
| BIG-09 | Street-level imagery for complex junctions (Mapillary) | L | later | todo | Claude | Phase 4 "not yet". Licence check under D-008 first |
| BIG-10 | Multi-stop trips (shop, then toilet, then home) | L | later | todo | Claude | Router already does single A to B |

## Features

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| FEAT-01 | Battery range per device (`maxRangeKm`), with a warning on long routes | M | now | todo | Claude | DEVICES.md follow-ups |
| FEAT-02 | Separate road and pavement speeds for road scooters | M | next | todo | Claude | DEVICES.md follow-ups. Only if pace learning shows it matters |
| FEAT-03 | Live bus and tram departures in Edinburgh and Newcastle | M | next | blocked | Richard, Claude | #8. Waits on API keys (HUM-01) |
| FEAT-04 | "Report what's there" from "What we don't know" on a route | M | next | todo | Claude | UX_ASSESSMENT open finding |
| FEAT-05 | Saved places (home, work, a friend's) | M | next | todo | Claude | On the device, like devices (D-009) |
| FEAT-06 | Leave at / arrive by for journeys with buses, trams and the Metro | M | later | todo | Claude | D-029 is frequency-based today |
| FEAT-07 | Changing Places toilets as their own search and route option | M | next | todo | Claude | Check the Changing Places data licence |
| FEAT-08 | Rest points on the route for people with a rest limit (benches, seats) | M | later | todo | Claude | D-018 has the data side |
| FEAT-09 | Ice and gritting warnings in winter | M | later | todo | Claude | Weather feed plus council gritting routes where open |
| FEAT-10 | Step-free routes across all of London's Underground, not only the Jubilee line and DLR | L | later | todo | Claude | TfL step-free data. Area size is the limit |
| FEAT-11 | National Rail stations with Passenger Assist details | M | later | todo | Claude | |
| FEAT-12 | Shareable route links (open a route someone sent you) | M | later | todo | Claude | D-030 built sharing for notes only |
| FEAT-13 | Welsh and Scottish Gaelic, with a translation set-up for later languages | L | later | todo | Claude | All copy goes through one place first |

## Small features

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SMALL-01 | Miles or kilometres setting | S | next | todo | Claude | |
| SMALL-02 | Choose how often navigation speaks (every turn, hazards only, off) | S | next | todo | Claude | |
| SMALL-03 | Copy the route as text (for a carer or a message) | S | next | todo | Claude | `describeSegments` already writes it |
| SMALL-04 | Print-friendly route | S | later | todo | Claude | |
| SMALL-05 | A high-contrast map style | S | next | todo | Claude | For the low-vision profile |
| SMALL-06 | Clear "no signal" state, with what still works offline | S | next | todo | Claude | |
| SMALL-07 | Keyboard shortcuts on desktop (search, swap ends, start) | S | later | todo | Claude | |
| SMALL-08 | "Why this way?" one tap from the navigation screen | S | later | todo | Claude | |
| SMALL-09 | Recent journeys, not just recent places | S | later | todo | Claude | `recents.ts` |

## Data and coverage

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| DATA-01 | Rebuild the street graphs automatically, not only timetables, works and search | M | next | todo | Claude | #14. D-033 covers the rest. Close #14 when done |
| DATA-02 | Replace the guessed numbers in the transit cost model | M | next | todo | Claude | #12 |
| DATA-03 | Check the West Bow and Victoria Terrace gradients on the ground | S | next | todo | Richard | DEVICES.md: these two decide Cherry's Grassmarket route |
| DATA-04 | Map York Place and the western way into the Grassmarket in OSM (about 1.1 km) | M | later | todo | Richard | DEVICES.md. Turns unknowns into known ground |
| DATA-05 | Met Office DataHub for production weather | S | later | blocked | Richard | D-011. Waits on a key (HUM-01) |
| DATA-06 | Tyne and Wear Metro lift status | M | later | blocked | Richard | #13. Partnership with Nexus |
| DATA-07 | Live Street Manager, and Scotland's roadworks register | M | later | blocked | Richard | #10 |
| DATA-08 | Placeholder unknown-risk weights replaced from user testing | M | later | todo | Richard, Claude | D-013. Needs TEST-01 |

## Accounts and sync

Today there are no accounts: profiles and devices stay on the phone (D-009), and sharing uses anonymous sign-in (D-030).

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| ACC-01 | Decide whether to offer optional accounts at all | S | next | todo | Richard | Needs a decision record. Health data makes this a privacy call, not just a feature |
| ACC-02 | Optional account to sync devices and saved places between phones, encrypted on the device | L | later | blocked | Claude | Waits on ACC-01. The server should never read the profile |
| ACC-03 | Sign in with a passkey or an email code, no passwords | M | later | blocked | Claude | Waits on ACC-01 |
| ACC-04 | Keep your anonymous notes when you create an account | S | later | blocked | Claude | Waits on ACC-02 |
| ACC-05 | Export and delete everything about me, in one place | M | next | todo | Claude | Needed with or without accounts (UK GDPR) |

## Deployment and release

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| DEP-01 | Make `main` the default branch and retire the mirror workflow | S | next | blocked | Richard | GitHub settings, then Vercel's production branch. See `mirror-production.yml` |
| DEP-02 | Preview deploy for every pull request, linked on the PR | S | next | todo | Richard, Claude | Vercel's Git integration may already do this. Confirm |
| DEP-03 | A custom domain | S | later | blocked | Richard | Needs a name and payment |
| DEP-04 | Release notes and version numbers users can see | S | later | todo | Claude | Build log is internal |
| DEP-05 | Service worker update prompt, so people aren't stuck on an old build | S | next | todo | Claude | D-023 offline cache |
| DEP-06 | Graph builds on a worker (Fly.io or Cloud Run), not a laptop | M | later | todo | Richard, Claude | D-010, "reconsider at Phase 3" |
| DEP-07 | Privacy-safe error reporting (no locations, no profile) | M | next | todo | Richard, Claude | Choose a tool, decide what's sent, write it in DECISIONS |
| DEP-08 | Production Supabase set up and checked against BACKEND.md | S | next | todo | Richard | Confirm it's live, migrations 0001 to 0005 applied |

## Security and privacy

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SEC-01 | Security headers and a Content Security Policy (`vercel.json`, since a static export can't set them) | S | now | todo | Claude | |
| SEC-02 | Cloudflare Turnstile on anonymous sign-up | S | next | blocked | Richard | D-030. Before any publicity |
| SEC-03 | Data protection impact assessment (DPIA) | M | next | blocked | Richard | D-030. Before wider launch |
| SEC-04 | `SECURITY.md`: how to report a vulnerability | S | next | todo | Claude | |
| SEC-05 | Pin GitHub Actions to commit SHAs and give each workflow the least permissions it needs | S | next | todo | Claude | |
| SEC-06 | `pnpm audit` in CI, failing on high severity | S | next | todo | Claude | |
| SEC-07 | Review row-level security and storage bucket rules against the threat model | M | next | todo | Claude | `db/migrations`, `scripts/test-db.sh` |
| SEC-08 | Harden `/review`: sign-in rate limits, session length, audit of who can see what | S | later | todo | Claude | |
| SEC-09 | Check nothing on the device leaks the profile (logs, URLs, error messages, analytics) | S | next | todo | Claude | D-009 |
| SEC-10 | Name the weekly reviewer for flags, photos and reports | S | next | blocked | Richard | BACKEND.md |

## Stability and testing

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| STAB-01 | End-to-end test in the built app: search, route, start, end | M | now | todo | Claude | Playwright is already in CI for `pnpm a11y` |
| STAB-02 | Screenshot tests for the main screens, light and dark, 320 px and 200% text | M | next | todo | Claude | Replaces hand-checked screenshots |
| STAB-03 | Version the on-device stores (devices, notes, recents) and migrate old data | S | next | todo | Claude | A bad migration loses someone's devices |
| STAB-04 | Router fuzz test: many random start and end points per city, no crashes, no impossible routes | M | next | todo | Claude | |
| STAB-05 | Timeouts and fallbacks for every live adapter | S | next | todo | Claude | `packages/live` |
| STAB-06 | Data refresh guard: fail the weekly PR if counts drop by more than a set amount | S | next | todo | Claude | D-033 |
| STAB-07 | Routing worker recovers if it crashes, and says so | S | later | todo | Claude | `router.worker.ts` |
| STAB-08 | Offline test: load a city, cut the network, route | S | later | todo | Claude | D-023 |

## Speed

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SPEED-01 | Measure: first load, city load, time to first route, on a mid-range phone | S | next | todo | Claude | Numbers first, then targets |
| SPEED-02 | Router benchmark in CI, failing if a journey gets much slower | S | next | todo | Claude | Uses the acceptance journeys |
| SPEED-03 | A compact binary graph format instead of gzipped JSON | L | later | todo | Claude | Only if SPEED-01 shows graph load matters |
| SPEED-04 | Load the `/review` page and admin code only for reviewers | S | later | todo | Claude | |
| SPEED-05 | Bundle-size and Lighthouse budgets in CI | S | later | todo | Claude | |
| SPEED-06 | Smaller search index per city | S | later | todo | Claude | `data/places` |

## Bloat reduction

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| BLOAT-01 | Move the four `step2-*.png` screenshots out of the repo root | S | now | todo | Claude | About 760 KB of review screenshots |
| BLOAT-02 | Unused files, exports and dependencies (run `knip`) | S | next | todo | Claude | |
| BLOAT-03 | Split `page.tsx` (608 lines) and `RoutePanel.tsx` (592 lines) | M | next | todo | Claude | |
| BLOAT-04 | Retire superseded scripts (Phase 0 `build-snapshot`, `build-edinburgh`, `spike-edinburgh`) if `build-area` covers them | S | later | todo | Claude | Keep the acceptance snapshot working |
| BLOAT-05 | Keep the 18 MB base map out of git history (release assets or LFS) | M | later | todo | Richard, Claude | `.git` is 52 MB and grows with every refresh |
| BLOAT-06 | Archive old UX screenshots in `docs/ux` that no doc links to | S | later | todo | Claude | |

## Updates

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| UPD-01 | Dependabot (or Renovate) for npm and GitHub Actions, grouped weekly | S | now | todo | Claude | |
| UPD-02 | MapLibre GL 4.7 to 5 | M | next | todo | Claude | Pinned at 4.7.1. Check the Protomaps style still renders |
| UPD-03 | Next.js to the current major | M | later | todo | Claude | Static export must keep working |
| UPD-04 | Keep Node in CI on the current LTS | S | later | todo | Claude | `engines` says 22 |

## Reviews

Repeat on the cadence shown. When one is done, set it back to `todo` with the next date in Notes, and log what it found.

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| REV-01 | Accessibility review with real VoiceOver and TalkBack, not just axe | M | next | todo | Richard, Claude | Monthly |
| REV-02 | Security review of the whole repo | M | next | todo | Claude | Quarterly |
| REV-03 | Code review of the largest and most-changed files | S | next | todo | Claude | Monthly |
| REV-04 | Decisions review: anything marked placeholder or "reconsider" (D-010, D-013) | S | later | todo | Richard, Claude | Quarterly |
| REV-05 | Data licence and attribution review | S | later | todo | Claude | Each new source, and yearly. DATA_SOURCES.md |
| REV-06 | Docs freshness: README status line, UX_ASSESSMENT open findings, this file | S | next | todo | Claude | Monthly. Some UX_ASSESSMENT rows are already fixed |
| REV-07 | Dependency review: what we pull in and why | S | later | todo | Claude | Quarterly |

## User testing and research

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| TEST-01 | A round of testing with five or more wheelchair and scooter users | L | next | todo | Richard | Feeds DATA-08 and the preset numbers |
| TEST-02 | Testing with blind and partially sighted users (D-037 crossings, D-038 lighting) | L | next | todo | Richard | |
| TEST-03 | Follow up with the tester who uses Cherry and Lulu on the device switcher | S | next | todo | Richard | DEVICES.md |

## Waiting on Richard

Decisions and accounts only Richard can give. Each one unblocks rows above.

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| HUM-01 | Free API keys for the next data adapters | S | next | todo | Richard | #9. Unblocks FEAT-03, DATA-05 |
| HUM-02 | Venue access tags at public launch | S | next | todo | Richard | #11 |
| HUM-03 | Scotland's roadworks register (SRWR) request | S | later | todo | Richard | #10. Unblocks DATA-07 |
| HUM-04 | Nexus lift status | S | later | todo | Richard | #13. Unblocks DATA-06 |
| HUM-05 | Apple and Google developer accounts | S | next | todo | Richard | Unblocks BIG-01 |

## Log

Newest first. One line per change: date, ID, what happened, link.

- 2026-10-04: Roadmap created from the build log, decisions, plans and open issues.
