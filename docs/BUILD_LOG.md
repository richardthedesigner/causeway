# Build log

A running record of what was built, newest first. Each entry links the decision (DECISIONS.md) and any GitHub issue that follows it up. Commit messages carry the detail; this is the map. What's still outstanding is in [OPEN_ITEMS.md](OPEN_ITEMS.md).

## 2026-10-06 (favicon and app icons)

SMALL-12.
- Every page load asked for `/favicon.ico` and got a 404. There is now one mark, a route ending in a dot, white on the accent blue.
- `apps/web/public/`: `favicon.ico` (16, 32, 48), `icon.svg` (dark mode swaps to the dark accent), `apple-touch-icon.png` (180), `icon-192/512.png` and `icon-maskable-192/512.png`. All under 13 KB. The manifest lists them.
- The maskable icons fill the square and keep the mark inside the central 80%. Redraw them with `node scripts/make-icons.mjs`.
- The CSP needed no change: icons are same-origin (`img-src 'self'`, `manifest-src 'self'`).
- `pnpm e2e` now fails on any 4xx response in a journey and checks each icon is served as an image.

## 2026-10-06 (the e2e walk by distance)

STAB-15: `scripts/e2e.mjs` only. No app code changed.
- The test runs the preview's half-second ticks in batches of 180 (about 500 m of route), where it ran ten every 50 ms. Drawing the page, not walking, was the cost: Edinburgh drew about 70 times at 400 ms each. It now draws about a dozen times.
- Edinburgh arrives in 3.4 s (it took 2 min 44 s on a 4-core box), and in 9.5 s with the CPU slowed six times (`E2E_CPU=6`, Chrome's CPU throttling). The journey prints how long the walk took.
- `E2E_ARRIVE_MS` stays as an override of the 2-minute limit.

## 2026-10-05 (the release and the docs sweep)

REV-01, docs only.
- Shipped and live on production today: #38 (Actions bumps), #42 and #44 (the release, checked in [the release check](releases/2026-10-05.md), REL-01), #48 (release check), #49 (security review), #50 (STAB-17), #55 (SEC-16, SEC-19), #51 (RES-09), #54 (Next 16, Node 24), #53 (STAB-02 screenshot tests).
- Headers confirmed live (SEC-12 done); scoring them is SEC-25, blocked on a custom domain. Branch rulesets are on (SEC-23 done).
- D-072: Glasgow, then Leeds, then cities by built-up area population (Birmingham, Liverpool, Sheffield, Manchester, Bristol).
- OPEN_ITEMS: the city question, branch protection and the MapLibre worker guess are Done; the Supabase line says no project exists yet.

## 2026-10-05 (screenshot tests)

STAB-02: `pnpm screenshots` (`scripts/screenshots.mjs`) replaces hand-checked screenshots.
- Ten screens (map, Your data, search, route, note, navigation, report, setup, device list, device editor) at 390 by 844 and 320 by 640 in light, and at 320 by 640 with text at 200% in light and dark: 40 pictures, 2.7 MB, in `tests/screenshots/`. Kept small because each change to a screen adds its picture to git history again: the map is hidden except in `map` and `route`, and the sections-open variants were dropped (they were identical, the sections sit below the fold).
- Steady by construction: every outside request is cut off so each screen shows its fallback, the clock is fixed, animations are off, navigation's preview walk is held still, the city is Edinburgh. Two runs in a row differ by at most 0.04% of pixels.
- A pixel counts as changed past 24 of 255 on any channel; a screen fails past 0.2% changed (2% for the bare map, which WebGL draws). Comparing happens in the browser, so no new dependency. `--update` rewrites the baselines; `--only=route` checks some.
- It serves and launches the browser through `scripts/serve-out.mjs`, as `pnpm a11y` and `pnpm e2e` do. CI runs it as its own step after e2e and uploads `tests/screenshots/diff/` on failure.

## 2026-10-05 (Next.js 16 and Node 24)

UPD-03 and UPD-04 (D-071), PR #54.
- Next.js 15.5.27 to 16.3.8. React stays on 19.3. Built with webpack (`--webpack`), since Turbopack can't resolve the workspace packages' `.js` specifiers. Turbopack is UPD-05.
- The export keeps its three static routes. Next 16 adds segment prefetch files (`__next.*.txt`) and `_not-found.html`. Client JavaScript is 709 KB gzipped, up from 684 KB. The CSP needs no change.
- CI and `engines` on Node 24, the current LTS. The data refresh stays on 22 (UPD-07).
- Under Node 24 the local speed budget check fails: routing is 15% to 25% slower against the yardstick. CI passes (50% limit). Re-baseline is UPD-06.

## 2026-10-05 (RES-09: where next)

Research only. No code, data or workflow changes.
- Scored 14 UK cities on reach (Census 2021 TS038 for England and Wales, Scotland's Census 2022), need, rail station usage (ORR 2024-25), open accessibility data, licence and code reuse. Report and scores: [where-next.md](research/where-next.md) and [where-next-scores.csv](research/where-next-scores.csv).
- Result: Glasgow, then Leeds, then Sheffield. Bristol, Manchester and Birmingham are within a point of Sheffield. Cardiff and Swansea score last, so DEF-09's "then Wales" isn't supported.
- Gaps: Scotland's council-level disability tables sit behind a bot check at the UK Data Service, so Dundee and Aberdeen use an estimate; Blue Badges by council exist for England only. Both are in RES-11.
- DEF-10 (Leeds) added. DEF-09 is unchanged until Richard decides (OPEN_ITEMS).

## 2026-10-05 (Supabase grants and data-refresh token)

SEC-16 and SEC-19: the critical and high findings of the [security review](reviews/security-2026-10.md), and its data-refresh token finding ([D-070](DECISIONS.md#d-070-every-grant-by-name-row-level-security-on-every-table)).
- `0007_supabase_grants.sql`: `note_public` is select only; row-level security, and no grants, on the eight graph tables; no grants on `edge_attribute_resolved` or the sequences; new objects in `public` start with no grants for `anon` and `authenticated`.
- `scripts/test-db.sh` and CI apply Supabase's default grants before the migrations (`db/test/supabase-stub.sql`). `db/test/grants.test.sql` adds 13 checks: nobody can delete or write through `note_public`, nobody can write a graph table, every table in `public` has row-level security on, new tables aren't granted. The 38 earlier checks still pass.
- The review's probes, signed out as `anon` with Supabase's grants: before, `delete from note_public` gave `DELETE 1`, `insert into area` `INSERT 0 1`, `delete from source where id = 'crowd'` `DELETE 1`, and eight tables had no row-level security. After, all three are `permission denied` and every table has it.
- Data refresh: `persist-credentials: false` on checkout, the token passed to `create-pull-request` itself, and `pip install --require-hashes -r scripts/requirements.txt` (osmium 4.3.1, duckdb 1.5.6, pyshp 3.1.6, the same versions it fetched unpinned).
- BACKEND.md: migrations up to `0007`, PostGIS in the `extensions` schema, who can do what.

## 2026-10-05 (late night)

**The map controls by keyboard** (STAB-17, D-069)
- The sheet trapped keyboard focus and hid the map from screen readers, so Tab never reached the city, layers or location buttons. vaul never passed `modal={false}` on to Radix; a pnpm patch fixes that, and the sheet no longer loops Tab inside itself.
- The city and layers menus opened behind the sheet. They now open above it, take focus, and give it back to their button.
- `pnpm a11y` checks the map controls by keyboard. Opening `<details>` in the script is now one call, which fixes a race.

## 2026-10-05 (security review)

SEC-07 and REV-02: [security review](reviews/security-2026-10.md), with a threat model. Read-only: no code changed.
- Critical, before sharing goes live: Supabase grants everything in `public` to `anon` by default, and the migrations never take it back. Signed out, anyone could delete any note through `note_public`, and write the graph tables. Shown on a local Postgres with Supabase's grants; CI's plain Postgres can't see it. SEC-16.
- Medium: a backdated `created_at` skips the 30-a-day limit, and reports can arrive already "fixed" (SEC-17); `author_key` links one person's notes across a city (SEC-18); the data refresh leaves a write token on disk while running third-party code (SEC-19, SEC-23).
- Low: photo paths, photo bucket limits, the CSP's Supabase wildcard, BACKEND.md out of date (SEC-17, SEC-18, SEC-20 to SEC-22).
- Fine: the row-level security on notes, flags, reports and the review log (all 38 database checks pass), reviewer powers, storage folders, headers, workflow pinning, `pnpm audit`, and the profile still never leaves the phone.

## 2026-10-05 (merging PR #42 into PR #44)

DEP-08: PR #44 merged with PR #42 so it lands cleanly after it. No D-number or task ID collided.
- The planner keeps both sides: #42's worker that restarts after a crash (STAB-07), and #44's UKHSA, air and river feeds (D-066) and per-feed TfL status (D-061). The area feeds run once per city, outside the worker, so a restart doesn't refetch them.
- The "Routing hit a problem and was started again" notice stayed under a second: re-planning the same journey when the new worker was ready, or when the weather came in, cleared it. Now only a different journey (from, to or device) clears it. `pnpm e2e` caught it on this branch only because the window was shorter.
- Four constants in `on-route.ts`, `osm-notes.ts` and `toiletmap.ts` are no longer exported, for #42's knip check.

## 2026-10-05 (porting the overnight build)

Richard chose main as the base; the overnight build's extras (PR #36) are ported by hand, smallest and safest first.

**On this route** (D-067, FEAT-19)
- One section under the route card, the first you can open: Blocked (closed for you, so the route went round it), Slower (works on the pavement, a station we can't confirm, a flood area, the council's setts or a narrow pavement where it adds a fifth or more for this person) and Worth knowing (unmapped stretches, lighting after dark for people who asked, TfL's station messages such as a reduced escalator service, the staff ramp, gritting in ice, mappers' notes, alerts, gusts, air, the river). Every fact says Live, Static data or Reported by people, with its source, date and end.
- Blocked comes only from what the route went round: the explanation's closures and one search as if nothing were closed, made once per plan and only when something is closed somewhere. A closure beside the route isn't listed (the overnight build's fix 8d9a917).
- The route card says only what changed the route or needs doing: a failed feed, "Goes round a closure on the way. See On this route.", or a flood area on the route. London's lift outages and the city's flood warnings are counted under "Where this comes from" only.
- It opens by itself when something is blocked or slower; the summary row says "1 blocked, 6 worth knowing" or "Nothing known". Headings per group with counts for screen readers. `pnpm a11y` checks a London route round a lift out (TfL's recorded feeds), light, dark and at 320 px with 200% text; `pnpm e2e` checks the card line, the list and the escalator message.
- "Why this way?" no longer repeats live closures, alerts, gusts, air, the river or mappers' notes. Lighting after dark, unmapped metres and boarding notes stay in both.

**Weather and health extras** (D-066, DATA-32, DATA-25 in part)
- UKHSA heat and cold alerts for London and the North East. Amber and red are said on every route with UKHSA's end date, and nudge routes for presets with a rest limit towards benches (and cover, in heat). An alert counts only in its season and before its end: the feed still lists February's cold status in October.
- Gusts from Open-Meteo, now and next hour or at the hour you leave. From 50 km/h an exposed bridge costs as much again for scooters, manual wheelchairs and lightweight powerchairs, and a route over one says so.
- Open-Meteo's times are read as UTC on every phone. They were read as local time, an hour out in summer, so a forecast hour of rain could count as already fallen.
- Air quality, pollen and UV from CAMS via Open-Meteo, only when high, area-wide.
- The Water of Leith at Murrayfield from SEPA: a line on routes using the walkway from 1.05 m. Not a flood warning.
- All fetched in parallel with the live-feed time limit; a failure is said quietly under "Where this comes from". The CSP allows the three new hosts.

**Parks and notes** (D-048 update, SMALL-15)
- A park found by name ends at its gate, not at the door of a building nearby: 26 of 119 named Edinburgh parks with gates had a fitting door within 50 m. `pnpm a11y` checks a route to The Meadows.
- OpenStreetMap notes over 3 years old with no comment, and StreetComplete's business questions, are left out (Edinburgh 27 kept, London 21). Past three, a route counts the rest: "2 more places a mapper flagged on this route".

**Toilet Map disputes and old records** (D-065, SMALL-14)
- Where OSM and the Toilet Map disagree on whether a toilet is accessible, its first fact starts "Sources differ: OpenStreetMap says accessible, the Toilet Map says not accessible", and it no longer counts on routes. 5 in Edinburgh, 1 in Newcastle.
- A record over 2 years old says "may be out of date" after any dispute, and a toilet only the Toilet Map has ranks a little lower in search when its record is old.

**Council footways and gritting** (D-062, D-063, D-064, DATA-31, DATA-22)
- `pnpm build:footways` reads both council layers in British National Grid. Asked for in WGS84, the council's server put them tens of metres off our streets (the gritting lines about 90 m west), so main's matches were often a neighbour's footway.
- Footways matched along each edge every 5 m: width the 20th percentile across both sides, setts on a quarter of the points, nothing under half the points matched. Council surfaces on pavement edges 2,556 to 12,182, widths 6,976 to 12,069.
- On streets drawn as one line, the council's pavement surface replaces OSM's carriageway surface (Richard): 7,812 edges, a different value on 3,044.
- Gritting from the council's "Gritting Routes" layer, the one its DCAT feed licenses (OGL v3, published 2021-05-27), matched only where the route runs the same way: 1,648 pavement edges (64 km). The reason in ice says "council routes from 2021".
- Both layers are dated with the council's published date; the build stops without an OGL listing or a date. The city credit carries the council's attribution.
- Every verdict on the 91 journey and preset pairs is the same; nine routes moved, the most Waverley to the Grassmarket on crutches (34.0 to 29.5 minutes).

**When TfL's feeds fail** (D-061, DATA-30)
- Lifts, line status and station disruptions are fetched apart. One failing leaves the others, and a failed feed's last good answer counts for 15 minutes after it was fetched. Before, a failure in either disruption feed dropped both and opened every closed line and station without a word.
- The route card says which couldn't be checked when the route rides a train: "Couldn't get live station disruptions from TfL. Check before you travel."
- When a closure cuts the only way, "nothing fits" names it: "No way there right now. In the way: no service on Jubilee line." It used to say the start and destination weren't joined up.
- A station message naming another step-free way in now makes the platforms unknown rather than closing them.

**Platforms and lifts** (D-058, D-068, DATA-29)
- A lift out that leaves some of a line's platforms step-free makes that line unknown, not closed, and costs a step-free user as much as a station we can't confirm. 46 of the 76 lifts whose loss changes a line are like this.
- TfL's step and gap from platform to train, per platform and in figures, are held to each person's limits: within TfL's level band (50 mm step, 85 mm gap) for everyone, beyond it against their kerb limit and a gap limit (no setting yet). Missing figures are unknown. The staff ramp costs 3 minutes and says to ask. Kilburn, Stanmore and Bond Street need the ramp for wheeled presets; nothing else changes on today's data.
- The spoken route says where TfL's level-access doors are, for step-free users ("For level access, board at the 2 centre doors on cars 5 and 6").
- `data/transit/london/network.json` rebuilt from the same feed (2026-08-03): 15 KB to 17 KB compressed.

**Honesty fixes** (D-053)
- Edinburgh council widths and surfaces are inferred: a narrow council width costs time and no longer closes a pavement.
- TfL street comments that deny a closure ("no footway closed") no longer close the pavement.
- Street Manager activities show our own words and the street, never the record's free text. Three London entries lost their "(Impact Area)"-style endings.
- Lift outages at one station count together: Canning Town lifts 1 and 3 out now cut off the Jubilee line.
- A search result's first fact may take two lines before it is cut off.

**Presets on Inclusive Mobility values** (D-054, D-055, DATA-28)
- Manual wheelchair kerb limit 2 cm to 6 mm; a dropped kerb with no measured height counts as 6 mm. Kerb limits under 1 cm read in millimetres. The rollator keeps 300 m between rests (Richard).
- "More benches" starts loosest and makes at most two searches, each with a cost limit; its search is quicker. Waverley to the Grassmarket with a walking stick now gets an offer (470 m instead of 890 m).
- `scripts/preset-outcomes.ts` records verdict, time, route and "More benches" for every journey and preset. No verdict, time or route changed.

**A speed budget** (D-056, SPEED-02)
- `pnpm test` fails if routing the acceptance journeys settles 10% more nodes, or gets 10% slower over a fixed yardstick (on CI, printed and failing only past 50%). Rest presets' "More benches" searches are timed too.
- Each city's data beside the graph stays under 400 KB compressed. Baseline and sizes: [PERF_BASELINE](plans/PERF_BASELINE.md). Re-measure with `pnpm perf:baseline`.

**Edinburgh's roadworks** (D-057, DATA-02)
- `pnpm build:srwr` reads the Scottish Road Works Register's daily export (OGL v3) and writes Edinburgh's works file; the weekly data refresh runs it. Export of 2026-10-05: 456 entries, most of them café tables (307), all in our own words and the street, never the register's text or the promoter.
- Advance notices are left out: the council's "Find and Fix" pavement repairs cover the full length of 259 streets from 15 October to June, and counted they made every acceptance journey unsure.
- Matching works to the graph uses a grid: 77 ms instead of 1.5 s on Edinburgh. Works on several parts count once in the works line.
- A live closure avoided in "Why this way?" names its source; it said "TfL, live" for every source.

**Skips, scaffolding and cranes from six months** (D-027, DATA-05)
- `pnpm build:works` reads the last six monthly activity archives and skips a month it can't read, naming it in the file's source line. The June 2026 archive is published truncated and is skipped.
- Activities starting more than five weeks ahead are left out; shapes in several parts are split; an activity closes the pavement only when its own words say so (none did). A footpath on its own is "the path".
- Rebuilt: Newcastle 51 works and 9 activities, the London zones 17 works and 6 activities.

## 2026-10-05 (night)

Recovery, time limits, speech, contrast and saved places, from the roadmap's Now list.

**The routing worker recovers** (STAB-07)
- If routing crashes or goes silent for 60 s, a fresh worker starts with the last plan, and the sheet says so. After three crashes in two minutes it offers a reload. `pnpm e2e` crashes it on purpose.

**Time limits for sharing and review** (STAB-14)
- Calls to Supabase give up after 15 s (30 s for a photo upload), with the same error as the live feeds.

**How often navigation speaks** (SMALL-03)
- Off, hazards only, or every turn. Hazards only still says when you arrive, get off or leave the route. Kept on the phone.

**A high-contrast map** (SMALL-05)
- Plain ground, roads edged in ink, black or white labels and a wider route. On by itself for the low-vision device or when the phone asks for more contrast. A switch in the layers menu.

**Saved places** (FEAT-04, D-060)
- "Save this place" on a route: home, work, or a name of your own. Saved places come first in search with a verdict, and in "Starting from?". On the phone only, and in Your data.

## 2026-10-05 (evening)

Large text, tests, copying a route, no signal and dead code, from the roadmap's Now list.

**The city name at 200% text** (STAB-13)
- The bar over the map is sized in pixels, so the city name no longer slides under the map buttons. `pnpm a11y` checks it.

**Router fuzz test** (STAB-04)
- 60 seeded random journeys per city, for four people in three kinds of weather. Every route must join up, avoid anything the person can't use, and come back the same twice.

**Copy the route as text** (SMALL-04)
- "Route in words" can be copied for a message: what it's like, what isn't known, and the steps. Never the device.
- Keyboard focus moving into the half-open sheet now opens it fully, so focus is never under the screen's edge.

**No signal** (SMALL-06, STAB-08)
- Offline, the sheet and navigation say what still works and what's paused. `pnpm e2e` cuts the network and still routes.

**Dead code** (BLOAT-02)
- `pnpm knip` runs in CI. Removed an unused component, three packages and twelve stray exports, and declared the workspace dependencies we use.

## 2026-10-05 (late afternoon)

Privacy, a refresh guard and bank holidays, from the roadmap's Now list.

**A guard on the weekly refresh** (D-033, STAB-06)
- Each count has a limit on how far it may fall. Past one, the refresh pull request opens as a draft that lists the drops, and the run fails.

**Bank holidays** (D-039, SMALL-01)
- GOV.UK's dates for England and Wales and for Scotland, bundled and refreshed weekly. On a bank holiday a place's holiday hours apply; without any, it says the hours may differ that day only.

**Your data** (D-059, SEC-06)
- One sheet says what the phone keeps, downloads it as a file, and deletes everything, including what was shared. Migration 0006 lets people delete their own reports, flags and photos.
- `pnpm e2e` downloads a copy and deletes it all; `pnpm a11y` checks the sheet, including at 200% text.

## 2026-10-05 (afternoon)

**Live feeds give up after 10 seconds** (D-052, STAB-05)
- A hung feed never failed, so its fallback never showed: "Checking lifts with TfL…" could stay for good. Every live call now has a time limit: 10 s for TfL, the Environment Agency and Open-Meteo, 6 s for live search.
- Fixed on the way: "Couldn't check the weather" flashed on every start in a remembered city, because a cancelled check was treated as a failed one.
- `pnpm e2e` now runs a London journey with every live feed hanging. The route comes, and the weather and lift lines fall back in about 11 and 13 seconds.

## 2026-10-05 (midday)

**Road speed in the device editor** (D-051, FEAT-18)
- Road scooters: "Speed on the road", 4 to 8 mph in half-mph steps. The "Your limits" row says "8 mph on roads".
- Every device: "Show speeds in: mph or km/h", for pace and road speed. Scooters start in mph, everyone else in km/h.
- `pnpm a11y` checks a road scooter's settings in both units, and at 200% text on a 320 px phone.

## 2026-10-05 (later)

**Road speed for road scooters** (D-051, FEAT-02)
- A road scooter goes at 8 mph on roads without mapped pavements, and at its own pavement pace elsewhere. Pace learning learns only the pavement pace.
- Central Edinburgh journeys get 20 to 45% quicker, and routes move onto roads (Marchmont to Leith Walk: 48% to 91% on roads).

## 2026-10-05 (late morning)

**200% text on a small phone, everywhere else** (STAB-12)
- At 320 by 640 with text at 200%, "This trip", the route's chips and sections, the start bar, navigation and the report sheet ran off the right edge. In navigation, the journey panel also covered the next instruction.
- The cause, mostly: a grid grows to fit its widest child unless told otherwise, so one long chip row stretched a whole sheet. Grids now hold their width, chip rows and section headings wrap, and fieldsets can shrink.
- Navigation's instruction and journey panel take at most half the screen each and scroll past that. Padding and icons that hold no text are in pixels, as in STAB-11.
- `pnpm a11y` now checks start, search, a route with every section open, the note sheet, navigation and the report sheet at that size, and fails if anything runs off the side or the two navigation panels overlap. It caught a list in "Why this way?" the first time it ran.
- Normal text at 390 px looks the same as before.

## 2026-10-05 (morning)

Security and stability, from the roadmap's Now list.

**TfL station toilets** (DATA-23)
- London's search and toilet layer gain the toilets TfL lists at 24 of our stations, from the station data we already load. Those past the ticket gates are marked for customers and aren't offered as stops on the way.

**Dependency audit** (D-050, SEC-04, UPD-02)
- CI fails on any high or critical advisory. The first run found a critical MapLibre hole and two high PostCSS ones.
- MapLibre 4.7.1 to 6.12.0, with its worker served from `public/maplibre/`. PostCSS lifted by an override.

**The profile never leaves the phone** (D-009, SEC-05)
- Reviewed logs, URLs, errors, sharing, notes and reports: no leak. `pnpm e2e` now fails if any request carries the device's name, type or limits.

**More end-to-end journeys** (STAB-10)
- Two devices and a switch, leaving in an hour, a route, and a note kept on the phone.
- It found a real bug: fully open, the drawer sits 6% of the screen below the bottom edge, so the last things in it (the trip settings, on a phone this size) could never scroll into view. The drawer's list now has that much padding, and scroll padding for keyboard focus.

**Large text on a small phone** (STAB-11)
- Sheets keep only the title and Close at the top; the description scrolls. Bars, icon buttons and switches are sized in pixels. The device type chips drop to one column when the text is large.
- `pnpm a11y` checks setup and the device settings at 320 by 640 with 200% text.

## 2026-10-05 (small hours)

More pilot-city data, from the roadmap's Now list.

**Ice and floods** (D-047, DATA-07)
- In ice, Edinburgh routes prefer the council's priority gritting routes and say so.
- Environment Agency flood warnings, live: a severe warning closes the paths in its area, a warning flags them, an alert is named.

**Park gates and OSM notes** (D-048, DATA-08)
- A route to a park ends at the gate nearest your way in (OS Open Greenspace), not the middle of the grass.
- Open OpenStreetMap notes about the ground near a route are shown, dated and unchecked.

**The Toilet Map** (D-049, DATA-09)
- Accessible, RADAR and opening-hours facts OSM lacks, and toilets it hasn't mapped, with when each was last checked.

**Inclusive Mobility rest distances** (D-013, DATA-10)
- Walking stick and crutches 50 m, fatigue 100 m. "More benches" still finds something useful.

**Weekly graphs** (D-033, DATA-11)
- The data refresh now rebuilds the street graphs and every layer keyed to them, and counts them in its summary.

## 2026-10-04 (late night)

Data for the pilot cities, from the roadmap's Now list.

**No scraped records** (D-028, DATA-01)
- AllThePlaces-only toilets and health services left out of the Overture merge; 29 "Changing Places" and 24 GP, dentist, hospital and pharmacy records removed from the search indexes.

**London stations, line by line** (D-020, DATA-03, DATA-04)
- TfL's station data says which lines are step-free from the street, the platform-to-train step and gap, and which lift serves what. A lift outage now closes only the lines it really cuts off.
- Line closures (by station, with TfL's dates) and plain station messages (closed, not calling, no step-free access) act on the rail graph. The route panel names a closure in force.

**Skips, scaffolding and hoardings** (D-027, DATA-05)
- Street Manager's activity archive adds obstructions on English pavements, counted as unknown.

**Edinburgh pavement widths and surfaces** (D-046, DATA-06)
- The council's Adopted Roads footways, as a separate layer joined at load. Widths known on 8,707 pavement edges, up from 1,731.

## 2026-10-04 (night)

The roadmap's next five.

**Battery range in the device editor** (D-043, FEAT-01)
- Powered chairs and scooters: "Warn me about battery range", 3 to 60 km. The route warns when a trip uses over half of it.

**Nothing on the phone lost to a change of shape** (D-044, STAB-03)
- Devices, notes and reports read through `lib/stored.ts`. Old keys are never rewritten; anything unreadable is backed up first.

**A new version is ready** (D-045, DEP-04)
- A card with Reload and Later when a new build takes over an open page. Never mid-journey.

**Security housekeeping** (SEC-02, SEC-03)
- `SECURITY.md`: report vulnerabilities privately.
- GitHub Actions pinned to commit SHAs; CI can only read the code.

## 2026-10-04 (late evening)

From the roadmap's Now list.

**Security headers** (D-041, SEC-01)
- A Content Security Policy, HSTS, no framing, a strict referrer policy and a permissions policy, from `apps/web/vercel.json`.
- The accessibility check and the new end-to-end test serve the build with the same headers and fail on anything the policy blocks.

**End-to-end journeys** (STAB-01)
- `pnpm e2e`, in CI: in each city, search, route, start, arrive and end in the built app.
- Its first run found that a city opened from last time started from Causewayside in Edinburgh. Fixed (STAB-09).

**Dependabot** (UPD-01): npm and GitHub Actions, weekly, minor and patch updates grouped.

**Fewer Vercel builds** (D-042, DEP-03): `main` and docs-only changes no longer build.

**Tidy** (BLOAT-01): the step 2 review screenshots moved from the repo root to `docs/ux/devices/`.

## 2026-10-04 (evening)

**One roadmap** (`docs/ROADMAP.md`, #31 merged with #34)
- Keeps #34's order: fill the pilot cities from the data survey, then check our guesses with real people. Keeps the read-only Google Doc copy.
- Every task now has an ID, size, priority, status and owner, across data, research, features, small features, security, stability, speed, bloat, updates, deployment, reviews and work Richard has deferred.
- `CLAUDE.md` tells every session to read it first, mark its row, and write back to it in the same pull request.

## 2026-10-04 (after midnight)

**Leaving later** (D-040)
- "Leaving" in This trip: now, in 30 min, in 1 hour, or at a time. Routes, bus waits, after dark, opening hours and the weather forecast follow it.
- Open-Meteo's hourly forecast gives the ground for a later trip, labelled as a forecast.

**Open when you get there** (D-039)
- Opening hours are read, not just shown: the destination says whether it's open when you arrive, and each accessible toilet whether it's open when you pass.
- Reads 97% of the 2,757 mapped hours; the rest are shown as mapped. A shut toilet doesn't count toward the toilet interval.

**Lit streets after dark** (D-038)
- The router now knows when it's dark, from the sun's position worked out on the device.
- After dark, the visual-impairment profile (and anyone who turns on "After dark, prefer streets that are lit") steers off unlit paths. Unmapped lighting costs a little and is named as not mapped.
- Stockbridge to Dean Village: 714 m unlit by day, 10 m after dark. The route explanation says how much isn't lit.

## 2026-10-04 (late night)

**"This trip" at the bottom; the ground leaves the top of the map** (D-036 step 8)
- Swiping the sheet up shows "This trip": getting around as, ground (Dry / Wet / Icy with the weather source), use buses, and accessible toilet spacing.
- The ground chip is gone from the top of the map; the route has the same three chips beside "Worked out for wet ground". Only the city picker and the map's own buttons stay at the top.
- That completes the device switcher plan.

**Switching device while navigating** (D-036 step 7)
- With more than one device, the navigation bar has a device button beside the arrival time. It asks "Switch device mid-journey?" (Switch to Lulu / Keep Cherry) rather than opening the list, so a mis-tap doesn't re-plan.
- Switching re-plans the rest of the journey from your location and keeps navigating.
- Fixed: pace learned on a journey went to the active device even when the route was for a device borrowed for this trip.

**Routes say who they're for, and offer another device** (D-036 step 6)
- Routes carry a "For Cherry" tag once there's more than one device (or the device is named).
- After switching device with a route on screen, the route says what changed: "9 min quicker than Cherry's route", or "Cherry had no route here."
- When nothing fits, the heading says "No route for Cherry", and the routing worker checks the other saved devices. Each one that fits gets "Lulu can do this one: 24 min · Use Lulu for this trip".
- "This trip" isn't saved: the button reads "Lulu, this trip", and it goes back to Cherry when navigation ends, the journey changes or another device is picked. Checked on Castle Esplanade, where Cherry is stopped by 10.2% on Victoria Terrace.

**First visit and Add a device** (D-036 step 5)
- With nothing saved, the device button reads "Set up" and one line above the bar says why. Routes still work meanwhile, as a manual wheelchair.
- Setup is three screens, each skippable: what do you use (the six wheeled types with a line each, everything else one tap away), what do you call it (with favourite), and the key limits. "Add a device" uses the same screens.
- After the first save, a one-time tip points at the button until "Got it".
- Cherry and Lulu no longer load by default. `?demo=devices` still starts with them when nothing is saved.
- The accessibility check now walks setup too: 0 violations, light and dark.

**Edit a device** (D-036 step 4)
- "Edit Cherry" opens a full-screen editor on a phone (a side panel on wide screens): name, favourite, type, limits, and remove.
- A blank name goes back to calling the device by its type. Changing type keeps the name.
- The four powered types each get a line saying how they differ ("Small wheels. Struggles with kerbs, setts and hills").
- Remove asks first, in the page, and isn't offered for the last device.

**One bar for search and route** (D-036 step 3)
- With a route on screen, the destination and the device button share the same bar as search, with no magnifier. The separate "Routes are for … Change" row is gone; a quiet line says what ground the routes were worked out for.
- When the field or destination would get narrower than 150 px beside the button, the bar splits: the field keeps the first line and the button goes full width under it. Checked at 320 px and 390 px with "Cherry" and with the longest label, "Manual chair + help".
- Padding: a 4 px inset all round the button, so its 12 px corners sit inside the bar's 16 px ones.

**Device button and list** (D-036 step 2)
- The chip in the search bar opens a list of saved devices, upwards: favourites first, a tick on the one in use, then Edit and Add a device. One tap switches and re-plans; "Now using Lulu" shows briefly and is read out.
- A named device's button shows its name only; an unnamed one keeps its icon and type.
- The list is drawn on the sheet's outer layer, because the sheet's scrolling body clipped it. Arrow keys, Enter and Escape work; the search list underneath no longer takes those keys.
- Edit opens today's mode sheet and Add makes an unnamed manual wheelchair, until steps 4 and 5.

**Devices behind the profile** (D-036 step 1)
- The app now routes for the active saved device; changing limits changes that device. A named device keeps its name when its type or limits change.
- Someone with settings from before devices keeps them as one unnamed device. The old profile key is still written, so an older build reads the active device.
- No visible change yet, except that the chip now says "Manual chair + help" correctly (it missed the pushed preset's new label).

**Device switcher designed and planned** (D-036, [plan](plans/DEVICES.md#build-plan-the-device-switcher-d-036))
- Search and the device button share one bar at the bottom. A named device shows its name; an unnamed type keeps its icon.
- Eight steps, each its own pull request, from devices behind the profile to a "This trip" section in the drawer. The demo seed goes when first-visit setup ships.

## 2026-10-04 (night)

**New app UI: "can I get there?" first** (D-035, commit `e2c2a1d`)
- Replaces every screen. Profile in the search bar, verdict before time, a route strip coloured by slope, the map line to match.
- Nothing fits now offers the closest point you can reach and a one-journey change to one limit (`diagnose` in the router, tested on Castle Wynd South).
- Recent places with a verdict from where you start. Navigation warns up to 300 m ahead.
- axe clean on four screens, no overflow at 200% text, light and dark. The design system: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); screens in [ux/v2/](ux/v2/).

**Powerchairs and scooters in two classes each, and named devices** (D-034, [plan](plans/DEVICES.md))
- From tester feedback: a lightweight powerchair manages far less than a heavy duty one, and road scooters differ from pavement scooters.
- New presets: "Powerchair, lightweight" (8% uphill, 3 cm kerbs, never cobbles) and "Mobility scooter, road" (class 3: uses streets without a pavement, no buses).
- Saved, named devices with favourites. The app starts with Cherry (lightweight powerchair, no setts or cobbles) and Lulu (pavement scooter) as a demo seed.
- The device switcher and naming screens wait for the UI update; the spec is in the plan.

## 2026-10-04 (evening)

**Crossings for blind and partially sighted people** (D-037; first committed as a second D-034)
- Crossing type, beeping lights, rotating cones, tactile paving and shared cycle paths now shape routes for the visual-impairment profile, and for anyone who turns on the new toggle.
- Directions name the cue at each crossing.
- Causewayside to Grassmarket goes from 3 uncontrolled crossings to none.

**Offline keeps up with the data** (D-023 update)
- The service worker used to cache city data permanently on first fetch, so timetables would never update. It also re-downloaded the search index and base map on every visit.
- City data is now stale-while-revalidate.
- Checked in a browser: graph, timetables, search, base map and fonts cached, then a route planned with the network off.

**Accessibility check in CI**
- `pnpm a11y` (`scripts/a11y-check.mjs`) runs axe-core against WCAG 2.2 AA in light and dark on four screens: start, search results, a route with every section open (buses, toilets, notes), and the settings sheet.
- No violations today. CI runs it on every push and pull request, so a regression fails the build.
- Axe catches about a third of WCAG issues. Screen reader and switch-access testing with real users is still needed (Phase 2 research).

**Accessible toilets on the way**
- The route lists accessible toilets within about 80 m: public toilets mapped as wheelchair accessible, and venues mapped with an accessible toilet (marked "Customers").
- Each shows Changing Places, RADAR key, fee and opening hours where mapped, and they appear as WC labels on the map.
- New setting: "Accessible toilet at least every" (don't mind, 500 m, 1 km, 2 km). The route says when its longest gap is longer than that.
- The search index now keeps the `centralkey`, `changing_places`, `fee`, `opening_hours` and `access` tags.
- Steering: when the longest gap is over your setting, a "Past more toilets" option is offered. It uses the same constrained search as benches (D-019): a toilet counts within 80 m of the path, and venue toilets from search are passed to the router. Closes #17.

**Navigation on buses and trams**
- During a ride, the off-route limit widens from 25 m to 150 m. The ride is drawn stop to stop in straight lines, but the bus follows the road, so riders were being told they were off route mid-ride.
- 350 m before your stop: "Get ready to get off. Your stop is Dean Bridge."
- Back on foot, the 25 m limit returns. Covered by a test.

**Rides drawn apart from walking:** bus, tram, Metro and train legs are dotted on the map, labelled where you board ("37", "Tram", "Metro", "Jubilee"). Walking stays a solid line, so you can see at a glance how much you push or walk. The labels follow theme changes.

**Fewer Overture duplicates** (D-028 update, #15)
- Same address plus a shared name word or the same kind of place counts as one venue.
- 483 fewer duplicates across the three cities.
- Overture categories now come from its taxonomy ("Bakery", not "Casual eatery"), mapped to OSM tags through the hierarchy.
- #15 closed.

**CI on the production branch**: CI now runs on pushes to the production branch too. Before, only `main` was tested, and the mirror's pushes don't trigger workflows.

**Weekly data refresh** (D-033, #14)
- A GitHub Actions workflow rebuilds timetables, works and the search index.
- It tests the result and opens a PR with a count table.
- The bus and works builds now work out their sample days and archive month from today's date (they were hard-coded).

**Footway islands joined** (D-032, closes #7)
- `bridgeIslands` joins small islands of footway to the street across gaps of up to 15 m, with unknown attributes.
- It skips platforms, bridges and height steps.
- 204 connectors across the three areas. Gateshead Interchange is reachable, so the Metro is useful there.

**Trams and the Tyne and Wear Metro** (D-031, commit `b3a4bf8`)
- Edinburgh Trams and the Metro come from the same open timetables as the buses, each line tagged with its mode.
- Metro stations below street level count as unknown for step-free users: Nexus has no open lift status (#13).
- Bug found while testing: walking out of Gateshead Interchange is badly connected (#7).

**Bus stops and live departures** (D-029, commit `7a2171e`)
- Shelter, seat and kerb from OSM, joined on the NaPTAN code: 815 of 842 Edinburgh stops, 147 of 159 Newcastle.
- Waits cost more without a seat (people with a rest limit) or a shelter (in rain).
- The route screen shows each bus leg's frequency and, in London, live TfL departures. Live times elsewhere: #8.

**Buses** (D-029, commit `202586b`)
- Bus Open Data Service GTFS, no key. Stops, ride times and departures per hour by day type.
- Added to the graph when a city loads.
- Wheelchair-space and scooter-permit rules, and a "Use buses" setting. The guessed numbers are tracked in #12.

**Theme switch restyles the map live** (commit `a93095e`)

**Overture places in search** (D-028, commit `6d9bbf6`)
- 7,966 Edinburgh, 2,378 Newcastle and 1,298 London places that OSM lacks.
- Never shown as accessible: they carry no access tags.
- Remaining duplicates and wrong categories: #15.

**Pavement works** (D-027, commit `900c041`)
- Street Manager monthly archive for England; TfL street disruptions live in London.
- No open feed in Scotland. Live Street Manager and the Scottish register (SRWR): #10.

**Search** (D-025, commit `7d4597e`)
- On-device index of places, addresses and postcodes, with category and access questions ("accessible toilet").
- Photon and postcodes.io top it up live.
- Whether to show OSM access tags for named venues at launch: #11.

**Base map** (D-024, commit `c5e25b5`): Protomaps extracts and fonts bundled per city, so it works offline.

**From the parallel session:** user access notes (D-026), sharing built but switched off (D-030), and screen polish. See its commits and pull requests #1, #5 and #6.

**Open actions for Richard:** free API keys (#9), Nexus lift status (#13), the SRWR request (#10), the venue access decision (#11).

**Keeping the data fresh:** every build is manual for now. Automating it is #14.

## Earlier

Phases 0 to 4 are in [PHASE0_REPORT.md](PHASE0_REPORT.md), [PHASE1_REPORT.md](PHASE1_REPORT.md), [PHASE3_REPORT.md](PHASE3_REPORT.md) and [PHASE4_REPORT.md](PHASE4_REPORT.md), and in DECISIONS D-001 to D-023.
