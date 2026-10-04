# Build log

A running record of what was built, newest first. Each entry links the decision (DECISIONS.md) and any GitHub issue that follows it up. Commit messages carry the detail; this is the map.

## 2026-10-04 (evening)

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
