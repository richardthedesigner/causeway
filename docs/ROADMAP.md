# Roadmap

The one list of work for Causewayside: what's next, in what order, how big it is and what state it's in. Every task, human or Claude, starts here and writes back here.

This file is the master copy. A read-only copy for sharing and comments lives in Google Drive: [Causewayside roadmap](https://docs.google.com/document/d/1T-RPq188B09LBahJIWPg_Hapm6m_vYbHB88pUzxJXV4/edit). Change this file, then update the Doc to match. Edits made only in the Doc are lost.

Last updated: 2026-10-06.

- What's waiting on Richard, blocked, or a guess: [OPEN_ITEMS.md](OPEN_ITEMS.md)
- What shipped and when: [BUILD_LOG.md](BUILD_LOG.md) and the phase reports
- Why: [DECISIONS.md](DECISIONS.md)
- Every data source we could use, with verdicts: the [UK data survey](DATA_SURVEY_UK.md). Section numbers (§) refer to it.

## How to use this file

**Before you start any task**
1. Read **Now** and the section your task belongs to.
2. If your task is here, use its ID in commit messages and the PR title (for example `SEC-01: security headers`).
3. If it isn't, add a row in the right section first, with the next free ID.
4. Check the open pull requests too. A task can be taken without showing here yet, because a row only changes on `main` when its PR merges.
5. Claim it: set its status to `doing`, put the date and your branch in Notes, push that, and open a draft PR titled with the ID before doing the work.

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

1. **SPEED-08**: load the graph and search index before the base map.
2. **FEAT-03**: "Report what's there" from "What we don't know".
3. **SMALL-13**: saved places on the map, and as a start as well as a destination.
4. **STAB-18**: the route panel leaves too little of the sheet in view at 320 px with 200% text.
5. **SMALL-18**: distances to places in search, in miles when the device is set to miles.

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
| DATA-22 | Should the council's pavement surface win over OSM on streets drawn as one line? | S | next | done (2026-10-05) | Richard, Claude | D-063. Richard said yes for streets whose OSM surface is only the carriageway's: the council's surface replaces it on 7,812 edges, a different value on 3,044 |
| DATA-23 | TfL station toilets in the toilet layer and search (65 at our stations, with RADAR and accessible flags) | S | now | done (2026-10-05) | Claude | PR #33. One place per station (24 stations, 65 toilets); toilets past the gates are for customers and aren't offered as stops |
| DATA-24 | Rebuild the council footway layer on the weekly refresh | S | later | done (2026-10-04) | Claude | Done by DATA-11 |
| DATA-25 | Scotland's flood warnings (SEPA) for the Water of Leith walkway | M | later | todo | Claude | D-047. Partly done (2026-10-05, D-066): SEPA's live level at Murrayfield is said on routes using the walkway from 1.05 m. Flood warnings themselves still have no open feed; look again |
| DATA-26 | Pavement gritting routes for Newcastle and London | S | later | todo | Claude | D-047. None open found; City of London has priority pavements (survey §2 #10) |
| DATA-27 | Do the 348 places that come only from AllThePlaces break the no-scraping rule (DATA_SOURCES rule 5)? | S | next | blocked | Richard, Claude | D-028. Mostly chain stores, parcel lockers and scout halls. Overture doesn't say which spider a record came from. Richard decides; then filter in `scrapedOnly` or leave as is |
| DATA-28 | Presets on Inclusive Mobility values: manual wheelchair kerb 6 mm, unmeasured dropped kerbs at 6 mm, kerb text in mm, "More benches" ladder and speed | S | now | done (2026-10-05) | Claude | D-054, D-055. Ported from PR #36. Rollator keeps 300 m (Richard). Outcomes for all 91 journey and preset pairs in D-054 |
| DATA-29 | TfL station data on the platforms: a lift out that leaves some platforms step-free counts as unknown, and the step and gap to the train against each person's limits, with level-access doors | M | now | done (2026-10-05) | Claude | D-058, D-068. Ported from PR #36. No gap-limit setting yet (OPEN_ITEMS) |
| DATA-30 | When TfL's disruption feeds fail: each feed apart, the last good answer kept for 15 minutes, the route card says which couldn't be checked, and "nothing fits" names the closure in the way | S | now | done (2026-10-05) | Claude | D-061. Ported from PR #36. Builds on D-052 (STAB-05) |
| DATA-31 | Council footways and gritting matched along each edge, not at its middle: surface and width from points every 5 m, gritting only where the route runs the same way, each with the council's own published date | S | now | done (2026-10-05) | Claude | D-062, D-064. Ported from PR #36. In British National Grid: the server's WGS84 was tens of metres out. Council surfaces 2,556 to 12,182 edges, widths 6,976 to 12,069, gritted 1,130 to 1,648 from the council's licensed layer (2021) |
| DATA-32 | Weather and health extras: UKHSA heat and cold alerts (England), gusts on exposed bridges, air quality, pollen and UV when high | M | now | done (2026-10-05) | Claude | D-066. Ported from PR #36. Alerts count only in season and before their end; Open-Meteo times now read as UTC on every phone. Lines in "On this route" since FEAT-19 (D-067) |
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
| RES-09 | Choose where to go next with census disability data, Blue Badge statistics and station usage | M | later | done (2026-10-05) | Claude | §5. [where-next.md](research/where-next.md): Glasgow, then Leeds. Wales scores last. Richard chose Glasgow, then Leeds (D-072) |
| RES-10 | Ask road scooter riders whether they want routes on roads, and whether to avoid busy ones | S | next | todo | Richard | D-051: routes now move onto roads at 8 mph |
| RES-11 | Scottish council-level census disability and Blue Badge figures for Scotland and Wales; a proper data pass on Birmingham and Liverpool; then rerun the RES-09 scores | S | later | todo | Claude | [where-next.md](research/where-next.md), \"What the sources do not give us\". Scotland's UV303 tables need a browser download |

## Features

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| FEAT-01 | Battery range per device (`maxRangeKm`), with a warning on long routes | M | next | done (2026-10-04) | Claude | D-043. Range engine from PR #26, and "Warn me about battery range" in the device editor |
| FEAT-02 | Separate road and pavement speeds for road scooters | M | later | done (2026-10-05) | Claude | D-051. Road speed setting is FEAT-18 |
| FEAT-03 | "Report what's there" from "What we don't know" on a route | M | now | doing | Claude | 2026-10-06, `claude/feat-03-report-whats-there`. UX_ASSESSMENT open finding. Reports stay on the device until the backend is back on |
| FEAT-04 | Saved places (home, work, a friend's) | M | now | done (2026-10-05) | Claude | PR #42. D-060. "Save this place" on a route; saved places come first in search, with a verdict. On the phone only, in Your data |
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
| FEAT-19 | "On this route": what a route went round, what may slow you and what's worth knowing, in one grouped list, each with its label, source and date; the route card says only what changed the route or needs doing | M | now | done (2026-10-05) | Claude | D-067. Ported from PR #36 (its D-041). Blocked from the explanation and one closure-blind search per plan, only when something is closed. TfL's informational station messages, the weather and health lines and mappers' notes moved into it |
| FEAT-20 | Destination first: one "Where to?" search, then From prefilled with "Your location", asking for location only then | M | now | done (2026-10-06) | Claude | D-073. PR #57. Fallbacks say why (location off, no fix, outside the city) and ask "Where are you starting from?" with the city's start suggested. Photon no longer gets your position. `pnpm e2e` fails if a request carries it |

## Small features

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SMALL-01 | Opening hours that know bank holidays | S | now | done (2026-10-05) | Claude | PR #42, D-039. GOV.UK bank holidays for each city's nation, refreshed weekly. PH rules apply on the day |
| SMALL-02 | Miles or kilometres setting | S | now | done (2026-10-06) | Claude | D-074. Distances follow the per-device "Show speeds and distances in" (D-051); one formatter, yards for short distances in miles mode |
| SMALL-03 | Choose how often navigation speaks (every turn, hazards only, off) | S | now | done (2026-10-05) | Claude | PR #42. One button cycles them, kept on the phone. Hazards only still says arrive, get off and off route |
| SMALL-04 | Copy the route as text, for a carer or a message | S | now | done (2026-10-05) | Claude | PR #42. "Copy the route as text" in Route in words, never the device. Keyboard focus now opens the drawer fully (WCAG 2.4.11) |
| SMALL-05 | A high-contrast map style | S | now | done (2026-10-05) | Claude | PR #42. In the layers menu. On by itself for the low-vision device or when the phone asks for more contrast |
| SMALL-06 | A clear "no signal" state that says what still works offline | S | now | done (2026-10-05) | Claude | PR #42. A "No signal" notice on the sheet and in navigation, saying what still works and what's paused |
| SMALL-07 | Print-friendly route | S | later | todo | Claude | |
| SMALL-08 | Keyboard shortcuts on desktop (search, swap ends, start) | S | later | todo | Claude | |
| SMALL-09 | "Why this way?" one tap from the navigation screen | S | later | todo | Claude | |
| SMALL-10 | Recent journeys, not just recent places | S | later | todo | Claude | `recents.ts` |
| SMALL-11 | Weather for trips more than 48 hours ahead | S | later | todo | Claude | D-040 falls back to today's |
| SMALL-12 | A favicon and app icons (every page load asks for `/favicon.ico` and gets a 404) | S | now | done (2026-10-06) | Claude | PR #59. One mark (a route ending in a dot), `scripts/make-icons.mjs`. Found SMALL-16 |
| SMALL-13 | Saved places on the map, and as a start as well as a destination from the route screen | S | now | todo | Claude | Found doing FEAT-04. Today they show in search, and as starts in "Starting from?" |
| SMALL-14 | Toilet Map: say when OSM and the Toilet Map disagree, keep disputed toilets off routes, and say when a record is over 2 years old | S | now | done (2026-10-05) | Claude | D-065. Ported from PR #36. 5 disputes in Edinburgh, 1 in Newcastle |
| SMALL-15 | Parks and OpenStreetMap notes: a park found by name ends at its gate, not a nearby building's door; old notes and business questions left out; "N more places a mapper flagged" | S | now | done (2026-10-05) | Claude | D-048 update. Ported from PR #36. 26 of 119 named Edinburgh parks with gates had a fitting door within 50 m |
| SMALL-16 | Pick the 404 and offline pages' look to match the app (`404.html` is Next's default) | S | later | todo | Claude | Found doing SMALL-12 |
| SMALL-17 | Recent places as starts in "Where are you starting from?" | S | later | todo | Claude | Found doing FEAT-20 (D-073). Today it suggests the city's start, saved places and the city's places |
| SMALL-18 | Search results and the "Where are you starting from?" suggestions show distance in metres or km only: follow the device's miles or kilometres (D-074) | S | now | todo | Claude | Left out of SMALL-02 because FEAT-20 was changing the search flow. `metres()` in `PlaceSearch.tsx` |
| SMALL-19 | Gusts ("up to 50 km/h") follow the device's speed unit, and say mph for people who read mph | S | later | todo | Claude | Found doing SMALL-02. Weather text in `cost.ts`, `on-route.ts`, `area-status.ts`. Heights and climbs stay in metres (D-074) |

## Security and privacy

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SEC-01 | Security headers and a Content Security Policy in `apps/web/vercel.json` (a static export can't set them in Next) | S | now | done (2026-10-04) | Claude | D-041. `apps/web/vercel.json`. `pnpm a11y` and `pnpm e2e` serve the build with the same headers and fail on anything the policy blocks |
| SEC-02 | `SECURITY.md`: how to report a vulnerability | S | next | done (2026-10-04) | Claude | `SECURITY.md`. Private reporting has to be turned on (SEC-14) |
| SEC-03 | Pin GitHub Actions to commit SHAs and give each workflow the least permissions it needs | S | next | done (2026-10-04) | Claude | Pinned to the latest release in each major, version in a comment. CI has `contents: read` |
| SEC-04 | `pnpm audit` in CI, failing on high severity | S | now | done (2026-10-05) | Claude | PR #33, D-050. Found a critical MapLibre hole and two high PostCSS ones; fixed by MapLibre 6.12 and a PostCSS override |
| SEC-05 | Check nothing leaks the profile (logs, URLs, error messages) | S | now | done (2026-10-05) | Claude | PR #33, D-009. No leak found. `pnpm e2e` now fails if any request carries the device's name, type or limits |
| SEC-06 | Export and delete everything about me, in one place | M | now | done (2026-10-05) | Claude | PR #42, D-059. "Your data": what's kept, a copy as a file, and delete everything, shared notes, reports, flags and photos included. Migration 0006 |
| SEC-07 | Review row-level security and storage bucket rules against a threat model | M | later | done (2026-10-05) | Claude | [Security review](reviews/security-2026-10.md). One critical, one high, four medium, five low. SEC-16 to SEC-23 |
| SEC-08 | Harden `/review`: sign-in rate limits, session length | S | later | todo | Claude | |
| SEC-09 | Cloudflare Turnstile on anonymous sign-up, before sharing goes live | S | later | blocked | Richard, Claude | D-030. Two scripted accounts can hide any note ([review](reviews/security-2026-10.md) M4) |
| SEC-10 | Data protection impact assessment (DPIA), before wider launch | M | later | blocked | Richard | D-030 |
| SEC-12 | Check the headers are live on production (`curl -I`) | S | next | done (2026-10-05) | Claude | D-041. Confirmed live on production by REL-01 and again after #54. Scoring them is SEC-25 |
| SEC-13 | Drop `'unsafe-inline'` from the CSP's `script-src`: hashes for Next's inline scripts at build time | S | later | todo | Claude | D-041. They change every build |
| SEC-14 | Turn on private vulnerability reporting (Settings, then Code security) | S | next | blocked | Richard | `SECURITY.md` points people to it |
| SEC-15 | Remove a deleted note's approved photo from the public bucket | S | later | todo | Claude | D-059. Hidden once the note's gone, but the copy stays. A reviewer step or a server job, once sharing is on |
| SEC-16 | Before the migrations run on Supabase: revoke Supabase's default grants, row-level security on every `public` table, and CI that tests with Supabase's grants | S | now | done (2026-10-05) | Claude | [Review](reviews/security-2026-10.md) C1, H1. `0007_supabase_grants.sql`, [D-070](DECISIONS.md#d-070-every-grant-by-name-row-level-security-on-every-table). CI applies Supabase's default grants before the migrations |
| SEC-17 | Server sets the fields the client shouldn't: note `created_at` and `photo_path`, report `status` and `verified_by` | S | next | todo | Claude | [Review](reviews/security-2026-10.md) M1, L1. A backdated `created_at` skips the 30-a-day limit |
| SEC-18 | Stop shared notes linking one person: a per-target `author_key`, and approved photos stored by note id, not user id | S | next | todo | Claude | [Review](reviews/security-2026-10.md) M2, L2. D-009 |
| SEC-19 | Data refresh: `persist-credentials: false` on checkout and pinned pip packages | S | now | done (2026-10-05) | Claude | [Review](reviews/security-2026-10.md) M3. `scripts/requirements.txt` with hashes. Branch protection is still SEC-23 |
| SEC-20 | Size and file type limits on the photo buckets | S | later | todo | Claude | [Review](reviews/security-2026-10.md) L3. `0004_storage.sql` |
| SEC-21 | Name the one Supabase host in the CSP instead of `*.supabase.co` | S | later | todo | Claude | [Review](reviews/security-2026-10.md) L4. Once the project exists. With SEC-13 |
| SEC-22 | `BACKEND.md`: add `0006`, fix who can do what, add running Supabase's Security Advisor | S | next | todo | Claude | [Review](reviews/security-2026-10.md) L5 |
| SEC-23 | Check branch protection on `main` and the production branch blocks direct pushes | S | next | done (2026-10-05) | Richard | [Review](reviews/security-2026-10.md) M3. Richard turned on rulesets on 2026-10-05. `main`: no deletion, no force push, PR required, `check` and `migrations` required. Production branch: no deletion, no force push. It can't require PRs until DEP-01, because the mirror pushes to it |
| SEC-24 | Create PostGIS in the `extensions` schema in the migrations, as Supabase does, not in `public` | S | later | todo | Claude | Found in SEC-16. `0001_graph.sql` creates PostGIS in `public` when it isn't there; `0007` makes its tables read only, but Supabase's Security Advisor will still flag `spatial_ref_sys` |
| SEC-25 | Score the headers on securityheaders.com | S | later | todo | Richard | Split from SEC-12. Unblocked by DEP-07: score `causeway.richardthedesigner.com`. The scorer refuses cloud sessions (403), so it needs a browser. All six headers it grades are sent |
| SEC-11 | Name the weekly reviewer for flags, photos and reports | S | later | blocked | Richard | [BACKEND.md](BACKEND.md). Only once sharing is on |

## Stability and testing

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| STAB-01 | End-to-end test in the built app: search, route, start, end | M | next | done (2026-10-04) | Claude | `pnpm e2e` in CI, one journey per city. Found STAB-09 on its first run |
| STAB-02 | Screenshot tests for the main screens, light and dark, 320 px and 200% text | M | next | done (2026-10-05) | Claude | `pnpm screenshots` in CI: 10 screens, 40 pictures, 2.7 MB in `tests/screenshots/`: phone and 320 px in light, 320 px at 200% text in light and dark. `--update` rewrites them |
| STAB-03 | Version the on-device stores (devices, notes, recents) and migrate old data | S | next | done (2026-10-04) | Claude | D-044. `lib/stored.ts` for devices, notes and reports: version in the key, old keys never rewritten, anything unreadable backed up |
| STAB-04 | Router fuzz test: many random start and end points per city, no crashes, no impossible routes | M | now | done (2026-10-05) | Claude | PR #42. `packages/router/test/fuzz.test.ts`: 60 seeded journeys per city, 4 people, dry, wet and icy. About 14 s |
| STAB-05 | Timeouts and fallbacks for every live adapter | S | now | done (2026-10-05) | Claude | D-052. `getJson` in `packages/live/src/http.ts`: 10 s for feeds, 6 s for live search. `pnpm e2e` hangs every feed in London and checks the fallbacks |
| STAB-06 | Data refresh guard: fail the weekly PR if counts drop by more than a set amount | S | now | done (2026-10-05) | Claude | PR #42, D-033. Per-row limits on falls; past one, the refresh PR opens as a draft that says not to merge, and the run fails |
| STAB-07 | The routing worker recovers if it crashes, and says so | S | now | done (2026-10-05) | Claude | PR #42. A crash or a 60 s silence starts a fresh worker with the last plan; the sheet says so. Three crashes in two minutes offers a reload. `pnpm e2e` crashes the worker |
| STAB-09 | A city opened from last time started from Edinburgh's Causewayside, 537 km from London | S | next | done (2026-10-04) | Claude | Found by STAB-01. `page.tsx` sets the saved city's start |
| STAB-10 | End-to-end journeys for the device switcher, notes and Leaving later | S | now | done (2026-10-05) | Claude | PR #33. Two devices and a switch, leaving in an hour, a route and a note. Found and fixed the drawer's last 6% being unreachable |
| STAB-11 | The device editor's header fills a 320 by 640 screen at 200% text | S | now | done (2026-10-05) | Claude | PR #33. Description scrolls with the content; bars, icon buttons and switches in pixels. `pnpm a11y` checks it |
| STAB-12 | 200% text at 320 px on the other screens: route panel, navigation, search, note and report sheets | S | now | done (2026-10-05) | Claude | `pnpm a11y` checks six more screens. Grids hold their width, chip rows and section headings wrap, navigation's two panels take half the screen each and scroll |
| STAB-13 | The city name at the top of the map is cut off at 200% text on a 320 px phone ("Edinbur", under the layers button) | S | now | done (2026-10-05) | Claude | PR #42. The bar over the map is sized in pixels. `pnpm a11y` checks the name neither spills nor runs under the layers button |
| STAB-14 | Time limits for the sharing and review calls to Supabase | S | now | done (2026-10-05) | Claude | PR #42. `lib/timed-fetch.ts`: 15 s, 30 s for a photo upload, with the same timeout error as the live feeds |
| STAB-15 | The e2e preview walk runs at a fixed speed, so a slower runner can miss the 2-minute arrival limit (Edinburgh took 2 min 44 s on a 4-core box) | S | now | done (2026-10-06) | Claude | PR #58. The e2e runs the preview's ticks in batches of about 500 m, so the page draws a dozen times, not hundreds (drawing was the cost, not the walk). Edinburgh arrives in 3 s, 10 s with the CPU slowed six times (`E2E_CPU=6`). `E2E_ARRIVE_MS` stays as an override |
| STAB-16 | `pnpm a11y` checks the high-contrast map and the open "Save this place" form | S | later | todo | Claude | Found doing SMALL-05 and FEAT-04. Both were checked by hand at 320 px, light and dark |
| STAB-18 | At 320 px with 200% text the route panel leaves about 145 px of the sheet in view above the Start bar, so the route cards can barely be read without dragging | S | next | todo | Claude | Found doing STAB-02 (`route.*.w320-200.png`). Check the sheet's resting height and whether the bar can shrink |
| STAB-19 | Toilet labels ("WC") stack on top of each other along a route, unreadable at the zoom the route fits to | S | later | todo | Claude | Found doing STAB-02 (`navigation.*.phone.png`). Hide or cluster labels that collide |
| STAB-20 | Screenshot baselines are Linux Chromium only; refresh them once after UPD-03 and UPD-04 (Next.js and Node) land, and whenever Playwright's Chromium changes | S | later | todo | Claude | STAB-02. `pnpm screenshots --update`, then look at the diffs |
| STAB-21 | `pnpm e2e` fails on any 4xx, including from outside services (an Open-Meteo 429 failed a run during FEAT-20). Fail only on the app's own requests; log outside ones | S | next | todo | Claude | Found reviewing FEAT-20. Added by SMALL-12. Risks red CI that isn't ours |
| STAB-17 | The sheet trapped keyboard focus and hid the map from screen readers: Tab never reached the city, layers or location buttons | S | now | done (2026-10-05) | Claude | D-069. Found doing STAB-13. vaul 1.1.2 never passed `modal={false}` on, so a `pnpm patch` does; Radix also looped Tab inside the sheet. The map menus open above the sheet, take focus and give it back. `pnpm a11y` checks it |
| STAB-08 | Offline test: load a city, cut the network, route | S | now | done (2026-10-05) | Claude | PR #42, with SMALL-06. `pnpm e2e` loads Edinburgh, cuts the network and routes. A reload offline (the service worker) isn't covered |

## Speed

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| SPEED-01 | Measure first load, city load and time to first route on a mid-range phone | S | now | done (2026-10-06) | Claude | `pnpm perf:web`, [numbers and targets](perf/2026-10.md). Download is the cost: the whole base map races the graph. Worker is not slowed by the CPU throttle, and the GPU is software, so see SPEED-12 |
| SPEED-02 | Router benchmark in CI, failing if a journey gets much slower | S | now | done (2026-10-05) | Claude | D-056, [PERF_BASELINE](plans/PERF_BASELINE.md). Ported from PR #36. `scripts/perf-budget.test.ts` in `pnpm test`; `pnpm perf:baseline` |
| SPEED-03 | Bundle-size and Lighthouse budgets in CI | S | later | todo | Claude | Start from the targets in [perf/2026-10.md](perf/2026-10.md). `perf:web` is too slow and noisy to gate CI as it is: budget bytes, not seconds |
| SPEED-04 | Load the `/review` page's code only for reviewers | S | later | todo | Claude | |
| SPEED-05 | Smaller search index per city | S | later | todo | Claude | `data/places`. SPEED-01: 1.3 to 1.5 MB, as big as the graph in Newcastle and London. Target 600 KB or less |
| SPEED-06 | A compact binary graph format instead of gzipped JSON | L | later | todo | Claude | SPEED-01 says not yet: the graph is 5 to 25% of the download. Revisit after SPEED-08 and SPEED-09 if Edinburgh's worker setup (2.6 s, unslowed) is over 5 s on a real phone |
| SPEED-07 | Speed budget follow-ups: a CI wall-time baseline from a few weeks of printed figures, and a re-baseline when the weekly refresh changes the graphs | S | later | todo | Claude | D-056. Settled nodes depend on the graph, so a refresh PR can trip the 10% check |
| SPEED-08 | Load the graph and search index before the base map, so "Where to?" doesn't wait for tiles | S | now | todo | Claude | SPEED-01. Edinburgh 15.6 s to ready on Fast 4G with 4x CPU; target 6 s or less |
| SPEED-09 | Read the base map in byte ranges, not whole, and fill the rest in the background for offline | M | next | todo | Claude | SPEED-01. Tiles are 49 to 71% of bytes. Target 2 MB or less before the map draws. Check the offline decisions first |
| SPEED-10 | Cut the main-thread work after a route returns | S | next | todo | Claude | SPEED-01. Edinburgh 5.4 s at 4x against 3.4 s on desktop. Target 3 s or less. Trace first |
| SPEED-11 | Trim JavaScript: see what is in the 650 to 680 KB and load later what the first screen doesn't need | M | later | todo | Claude | SPEED-01. MapLibre is the largest chunk. Pairs with SPEED-04 |
| SPEED-12 | Measure on a real mid-range Android and a real CDN, plus repeat visits and city switching | S | next | todo | Richard and Claude | SPEED-01 limits: unslowed worker, software GPU, local server. Needs a phone or WebPageTest |

## Bloat reduction

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| BLOAT-01 | Move the four `step2-*.png` screenshots out of the repo root (about 760 KB) | S | next | done (2026-10-04) | Richard, Claude | Moved to `docs/ux/devices/` and linked from DEVICES.md. Delete them if they aren't wanted |
| BLOAT-02 | Find unused files, exports and dependencies (`knip`) | S | now | done (2026-10-05) | Claude | PR #42. `pnpm knip` in CI, clean. Removed a component, three packages and twelve stray exports; declared workspace dependencies |
| BLOAT-03 | Split `page.tsx` and `RoutePanel.tsx`, the two largest components | M | next | todo | Claude | About 600 lines each |
| BLOAT-04 | Retire the Phase 0 scripts (`build-snapshot`, `build-edinburgh`, `spike-edinburgh`) if `build-area` covers them | S | later | todo | Claude | Keep the acceptance snapshot working |
| BLOAT-05 | Keep the 18 MB base map out of git history (release assets or LFS) | M | later | todo | Richard, Claude | `.git` is 52 MB and grows with every refresh |
| BLOAT-06 | Archive UX screenshots in `docs/ux` that no doc links to | S | later | todo | Claude | |

## Updates

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| UPD-01 | Dependabot for npm and GitHub Actions, grouped weekly | S | now | done (2026-10-04) | Claude | `.github/dependabot.yml`. MapLibre and Next.js majors left to UPD-02 and UPD-03 |
| UPD-02 | MapLibre GL 4.7 to 5 | M | next | done (2026-10-05) | Claude | PR #33, with SEC-04: straight to 6.12 for a critical fix. The worker is now a module file in `public/maplibre/` |
| UPD-03 | Next.js to the current major | M | later | done (2026-10-05) | Claude | PR #54: Next 16.3 on webpack (`--webpack`). Static export unchanged (D-071) |
| UPD-04 | Keep Node in CI on the current LTS | S | later | done (2026-10-05) | Claude | PR #54: CI and `engines` on Node 24 (D-071). Node 26 becomes LTS late October 2026 |
| UPD-05 | Build with Turbopack | M | later | todo | Claude | Next 16's default. Needs the workspace packages' `.js` import specifiers to resolve to `.ts` (D-071) |
| UPD-06 | Re-baseline the speed budget under Node 24 | S | next | todo | Claude | Routing is 15% to 25% slower against the yardstick on Node 24, so the local check fails there. Re-baseline on a quiet machine (D-071) |
| UPD-07 | Data refresh workflow on Node 24 | S | later | todo | Claude | `.github/workflows/data-refresh.yml` still pins 22 |

## Deployment and release

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| DEP-01 | Make `main` the default and production branch, and retire the mirror workflow | S | next | blocked | Richard | GitHub and Vercel settings. See `mirror-production.yml` |
| DEP-02 | Stay under Vercel's free limit of 100 deployments a day | S | next | done (2026-10-04) | Claude | `apps/web/vercel.json` turns off `claude/*` previews (3decc02) |
| DEP-03 | Skip Vercel builds for docs-only changes on `main` | S | later | done (2026-10-04) | Claude | D-042. `ignoreCommand` in `apps/web/vercel.json`: also skips `main`, which mirrors production |
| DEP-04 | A service worker update prompt, so nobody is stuck on an old build | S | next | done (2026-10-04) | Claude | D-045. `UpdatePrompt`: Reload or Later, never during navigation |
| DEP-05 | Privacy-safe error reporting (no locations, no profile) | M | later | todo | Richard, Claude | Choose a tool and record it in DECISIONS |
| DEP-06 | Release notes and version numbers users can see | S | later | todo | Claude | The build log is internal |
| DEP-07 | A custom domain | S | later | done (2026-10-06) | Richard, Claude | `causeway.richardthedesigner.com`, added to the Vercel project (the `richardthedesigner.com` zone is on Vercel DNS, so no purchase). The custom domain skips Vercel login protection, so the app is now public. The `vercel.app` addresses still need a login |
| DEP-08 | Merge PR #44 on top of PR #42: conflicts, D-numbers and task IDs (PORT-44) | S | now | done (2026-10-05) | Claude | Merge commits only. No numbers collided. CSP checked for #44's new feeds |
| REL-01 | Release check and runbook for 2026-10-05 | S | now | done (2026-10-05) | Claude | PR #48, [release check](releases/2026-10-05.md). #38, #42 and #44 released and checked on production |

## Reviews

Repeat on the cadence shown. When one is done, set it back to `todo` with the next date in Notes, and log what it found.

| ID | Task | Size | Priority | Status | Who | Notes |
|---|---|---|---|---|---|---|
| REV-01 | Docs freshness: README status line, UX_ASSESSMENT, OPEN_ITEMS, this file | S | next | todo | Claude | Monthly. Next: 2026-11-05 |
| REV-02 | Security review of the whole repo | M | next | todo | Claude | Quarterly. Next: January 2027. Last: 2026-10-05, [report](reviews/security-2026-10.md) |
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
| DEF-09 | Beyond the pilot cities: Glasgow first (once DATA-13 is licensed), then Leeds, then by city size (D-072) | XL | later | blocked | Richard, Claude | §5 |
| DEF-10 | Leeds as the second expansion city: pull its open crossing, rights-of-way and café-licence data and run the England stack on it | XL | later | blocked | Claude | RES-09 ranks Leeds second. Richard chose Leeds second (D-072). Needs a plan in `docs/plans/` |

## Log

Newest first. One line per change: date, ID, what happened, link.

- 2026-10-06: DEP-07 done: `causeway.richardthedesigner.com` serves production and is public. SEC-25 unblocked (needs a browser). Added STAB-21. Batch 2 merged FEAT-20, SMALL-02, SMALL-12, STAB-15 and SPEED-01 (#56 to #61).
- 2026-10-06: SMALL-02 done in PR #56: distances follow the per-device mph or km/h choice through one formatter, yards for short distances in miles mode (D-074). Added SMALL-18, SMALL-19. Now: SPEED-08, FEAT-03, SMALL-13, STAB-18, SMALL-18.
- 2026-10-06: FEAT-20 done: destination first. "Where to?" alone, then From as "Your location", with location asked for only then; plain-words fallbacks ask where you're starting from (D-073). Added SMALL-17.
- 2026-10-06: SMALL-12 done in PR #59: favicon.ico, SVG icon (follows dark mode), apple-touch-icon and manifest icons (standard and maskable), all from one mark. e2e now fails on any 4xx and checks the icons are served as images. Added SMALL-16.
- 2026-10-06: STAB-15 done (PR #58): the e2e walk runs in 500 m batches, so arrival no longer depends on machine speed. STAB-18 joins Now.
- 2026-10-06: SPEED-01 done: `pnpm perf:web` and [the numbers](perf/2026-10.md). Download is the cost (Edinburgh 15.3 MB, graph ready in 15.6 s on Fast 4G with 4x CPU; the base map is 49 to 71% of bytes and races the graph). SPEED-06 not yet worth it. Added SPEED-08 to SPEED-12; SPEED-08 joins Now.
- 2026-10-05: REV-01 sweep after the release (#42, #44, #38, #48, #49, #50, #55, #51, #54, #53). SEC-12 and SEC-23 done; SEC-25 added (score the headers, blocked on DEP-07); REL-01 recorded; REV-01 next 2026-11-05. Richard chose Glasgow, then Leeds, then cities by size (D-072, DEF-09, DEF-10).
- 2026-10-05: STAB-02 done: `pnpm screenshots` captures 10 screens (40 pictures, 2.7 MB in `tests/screenshots/`): 390 px and 320 px in light, 320 px at 200% text in light and dark. CI runs it and uploads diffs on failure. Found STAB-18 to STAB-20.
- 2026-10-05: UPD-03 and UPD-04 done in PR #54: Next.js 16.3 on webpack, Node 24 in CI and `engines`, static export unchanged (D-071). Added UPD-05 to UPD-07.
- 2026-10-05: RES-09 done: 14 UK cities scored on Census 2021 and 2022, Blue Badge and station usage, open data, licences and code reuse. Glasgow first, then Leeds, then Sheffield; Cardiff and Swansea last, so DEF-09's "then Wales" isn't supported. Follow-ups RES-11 and DEF-10 added ([report](research/where-next.md)).
- 2026-10-05: SEC-16 and SEC-19 done. `0007_supabase_grants.sql` takes back Supabase's default grants: `note_public` is read only, the graph tables have row-level security and no grants, and new objects in `public` start with none ([D-070](DECISIONS.md#d-070-every-grant-by-name-row-level-security-on-every-table)). CI and `scripts/test-db.sh` apply Supabase's grants first, with 13 new checks. The data refresh no longer leaves its token on disk, and installs pinned pip packages with hashes. BACKEND.md now lists `0006` and `0007` (part of SEC-22). Added SEC-24.
- 2026-10-05: STAB-17 done: Tab leaves the sheet for the map controls, and the map menus open above the sheet (D-069). Now unchanged.
- 2026-10-05: SEC-07 done and REV-02 run: [security review](reviews/security-2026-10.md). One critical and one high, both before sharing goes live: Supabase's default grants let anyone delete notes through `note_public` and write the graph tables. Added SEC-16 to SEC-23. REV-02 next due January 2027.
- 2026-10-05: DEP-08 (PORT-44) done: PR #44 merged with PR #42. No D-number or task ID collided: #42 holds D-059 and D-060, #44 D-053 to D-058 and D-061 to D-068. SPEED-02 was done in #44, so SPEED-01 joins Now in its place.
- 2026-10-05: FEAT-19 done: "On this route" under the route card, grouped Blocked, Slower and Worth knowing, each fact labelled live, static data or reported by people with its source and date; the route card keeps only failed feeds, a count of closures gone round and a flood area on the route (D-067, ported from PR #36).
- 2026-10-05: DATA-32 done: UKHSA heat and cold alerts (only in season and before their end), gusts on exposed bridges, and air quality, pollen and UV when high; Open-Meteo times read as UTC (D-066). DATA-25 in part: SEPA's Water of Leith level on routes using the walkway.
- 2026-10-05: SMALL-15 done: a park found by name ends at its gate, not a neighbouring building's door; OpenStreetMap notes over 3 years old and business questions left out, the rest past three counted (D-048 update).
- 2026-10-05: SMALL-14 done: where OSM and the Toilet Map disagree on access the toilet says so first and stays off routes; old records say they may be out of date (D-065).
- 2026-10-05: DATA-31 done: council footways and gritting matched along each edge in British National Grid, with the council's own dates; gritting from its licensed layer (D-062, D-064). DATA-22 done: on streets drawn as one line, the council's pavement surface beats the carriageway's (Richard, D-063).
- 2026-10-05: DATA-30 done: TfL's lift, line and station feeds fetched apart, a failed feed's last answer held 15 minutes, the route card says which couldn't be checked, and "nothing fits" names the closure (D-061). Follows STAB-05.
- 2026-10-05: DATA-29 done: the step and gap to the train held to each person's limits, with level-access doors in the spoken route (D-068).
- 2026-10-05: Added DATA-29 (TfL station data on the platforms, ported from PR #36). A lift out that leaves some platforms step-free now counts as unknown, not closed (D-058).
- 2026-10-05: DATA-05 extended: six monthly activity archives, closure words and a five-week horizon (D-027 update, ported from PR #36).
- 2026-10-05: DATA-02 done: Edinburgh's works from the Scottish Road Works Register (D-057, ported from PR #36).
- 2026-10-05: SPEED-02 done (speed budget, ported from PR #36). Added SPEED-07.
- 2026-10-05: Added DATA-28 (presets on Inclusive Mobility values, ported from PR #36) and marked it done.
- 2026-10-05: STAB-07, STAB-14, SMALL-03, SMALL-05 and FEAT-04 done in PR #42 (D-060). Added SMALL-13, STAB-16. Now: STAB-15, SMALL-02, SPEED-02, FEAT-03, SMALL-12.
- 2026-10-05: STAB-13, STAB-04, SMALL-04, SMALL-06 and BLOAT-02 done in PR #42, and STAB-08 with SMALL-06. Now: STAB-07, STAB-14, SMALL-03, SMALL-05, FEAT-04.
- 2026-10-05: STAB-06, SEC-06 and SMALL-01 done in PR #42 (STAB-12 was done in PR #41 alongside). Added STAB-15 (was STAB-14 here), SEC-15. Now: STAB-13, STAB-04, SMALL-04, SMALL-06, BLOAT-02.
- 2026-10-05: Rule added to CLAUDE.md and this file: check open PRs before taking a task, and claim it with a draft PR first. STAB-05 was done twice in parallel (#42 and #43), as DATA-01 was (#33 and #37).
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
