# Build log

A running record of what was built, newest first. Each entry links the decision (DECISIONS.md) and any GitHub issue that follows it up. Commit messages carry the detail; this is the map. What's still outstanding is in [OPEN_ITEMS.md](OPEN_ITEMS.md).

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
