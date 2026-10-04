# Roadmap

Where Causewayside is going next, and in what order. This file is the master copy. A read-only copy for sharing and comments lives in Google Drive: [Causewayside roadmap](https://docs.google.com/document/d/1T-RPq188B09LBahJIWPg_Hapm6m_vYbHB88pUzxJXV4/edit). Change this file, then update the Doc to match. Edits made only in the Doc are lost.

Last updated: 2026-10-04.

- What's waiting on Richard, blocked, or a guess: [OPEN_ITEMS.md](OPEN_ITEMS.md)
- What shipped and when: [BUILD_LOG.md](BUILD_LOG.md) and the phase reports
- Every data source we could use, with verdicts: the UK data survey, `DATA_SURVEY_UK.md` ([pull request #32](https://github.com/richardthedesigner/causeway/pull/32), not merged yet). Section numbers below (§) refer to it.

## Where we are

| Phase | What | State |
|---|---|---|
| 0 | Foundations: data model, honest graph builder, own router, Edinburgh acceptance tests | Done ([report](PHASE0_REPORT.md)) |
| 1 | The honest graph for central Edinburgh: city-scale OSM and LiDAR, kerb inference, inspector | Done ([report](PHASE1_REPORT.md)) |
| 2 | App shells and user research | Web app done. Native app, user research and real-device accessibility testing not started |
| 3 | Live data and the other cities: Newcastle and Gateshead, London zones, weather, TfL lifts | Done ([report](PHASE3_REPORT.md)) |
| 4 | Navigation and the loop: turn-by-turn, report a problem, offline | First pass done ([report](PHASE4_REPORT.md)) |

## Now: fix and fill the pilot cities

No permission needed. In order of value per day of work (survey §8).

| # | Work | Why | Source |
|---|---|---|---|
| 1 | **Remove scraped Changing Places records** from the search indexes (29 places) and filter them in the Overture build | Breaks our own no-scraping rule today | §9, D-028 |
| 2 | **Scottish Road Works Register adapter** for Edinburgh: footway works, café tables, scaffolding, hoardings, events | Edinburgh has no roadworks data at all. SRWR turns out to be open (OGL) | §2 #1, [#10](https://github.com/richardthedesigner/causeway/issues/10) |
| 3 | **TfL station data**: platform step and gap, which areas each lift connects, toilets. Join lift outages on `LiftUniqueId` | Lift outages close exactly the right edges, with no text parsing | §2 #2 and #3, D-020 |
| 4 | **TfL station and line disruptions** on transit edges | Closures and planned step-free losses are invisible today | §2 #4 |
| 5 | **Street Manager activity archive**: skips, scaffolding, hoardings | Same bucket we already read; more pavement obstructions in England | §2 #6, D-027 |
| 6 | **Edinburgh Adopted Roads**: footway surface and width as a separate layer | Width is known on only 8% of Edinburgh's network | §2 #5, D-008 |
| 7 | **Weather warnings, floods, gritted footways** | Prefer gritted pavements in ice; flag riverside paths in floods | §2 #7, #8, #10 |
| 8 | **Park entrances** (OS Open Greenspace) and OSM Notes | Routes end at a gate, not the middle of a park | §2 #11 |
| 9 | **Toilet Map daily export** with verified dates | Fresher toilets, accessible and RADAR flags | §2 #9 |
| 10 | **Presets on Inclusive Mobility values**: rest intervals, kerb tolerance | Replaces some placeholder numbers | §8, D-013 |

Also: fix walking out of Gateshead Interchange ([#7](https://github.com/richardthedesigner/causeway/issues/7)), clean up Overture duplicates ([#15](https://github.com/richardthedesigner/causeway/issues/15)), and get the weekly data refresh running ([#14](https://github.com/richardthedesigner/causeway/issues/14)).

## Next: check our guesses with real people (Phase 2 research)

Routes are shaped by numbers we estimated. These need disabled testers in each city before launch.

- **Calibrate costs**: gradient limits, unknown-data risk, crossings, unlit streets, bus waits ([#12](https://github.com/richardthedesigner/causeway/issues/12), D-013, D-037, D-038).
- **Check inferred kerbs** at controlled crossings against what's really there (D-015).
- **Measure gradients on the ground**: an inclinometer walk in each city to validate the LiDAR figures.
- **Accessibility testing on real devices**: VoiceOver, TalkBack, Switch Control, Voice Control ([UX_ASSESSMENT.md](UX_ASSESSMENT.md)).
- **Benchmark** every acceptance journey against openrouteservice's wheelchair profile (D-003).

## Next: get the data only councils hold

The biggest prize in the survey: kerbs, widths and steps that OSM lacks. Each one is a short email from Richard asking for an open licence (survey §3 and §7).

1. **City of Edinburgh Council**: kerb heights, crossings with dropped kerbs and tactile paving, steps, pavement widths, setted streets.
2. **Glasgow City Council**: kerbs, steps with alternative ramps, bus stops, gritting, pavement parking. The richest data found in the UK.
3. **Islington and Southwark**: footway condition, widths, crossings.
4. **Westminster** (Blue Badge bays) and **Kensington and Chelsea** (tables and chairs).
5. **Canal & River Trust** (towpath gates and steps) and **Sustrans** (path barriers).
6. **Free keys**: NHS Service Search, Spatial Hub, Edinburgh Festivals, plus the five in [#9](https://github.com/richardthedesigner/causeway/issues/9).

Partnerships Richard leads: Nexus for Metro lifts ([#13](https://github.com/richardthedesigner/causeway/issues/13)), live bus departures ([#8](https://github.com/richardthedesigner/causeway/issues/8)), DfT, TfL, SEPA.

## Later: the native app and the loop

Deferred by Richard for now, and each needs a decision from him first ([PHASE4_REPORT.md](PHASE4_REPORT.md)).

- **Native app** (Expo, D-004): lock-screen progress, background location, haptics. Needs Apple and Google developer accounts.
- **Reports backend** (Supabase): store and moderate public reports, and decide whether they feed back into OSM (D-022, D-008).
- **Street-level imagery** for complex junctions (Mapillary, once licensing is settled).
- **ETA from the user's own speed**, and opt-in surface sensing.

## Later: beyond the pilot cities

What each nation offers is in survey §5.

- **Glasgow first**, once its council data is licensed.
- **Wales**: national LiDAR, national toilet map, buses. No open roadworks.
- **Whole-city builds** need a worker with normal network access (D-010).
- **Choose where to go next** with census disability data, Blue Badge statistics and station usage.

## Not now, on purpose

A phone app, whole cities, a reports backend and app accounts are deferred until Richard says otherwise. See [OPEN_ITEMS.md](OPEN_ITEMS.md#deferred-by-richard).
