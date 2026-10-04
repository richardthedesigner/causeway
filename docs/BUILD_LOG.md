# Build log

A running record of what was built, newest first. Each entry links the decision (DECISIONS.md) and any GitHub issue that follows it up. Commit messages carry the detail; this is the map.

## 2026-10-04 (late night)

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
