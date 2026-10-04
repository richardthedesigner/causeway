# Phase 0 report

Date: 2026-10-04. Scope: foundations, with no product UI.

## What shipped

- **Repo and stack**: TypeScript monorepo (pnpm), core packages `graph`, `profile` and `router`, Vitest, CI (typecheck, tests, migrations on PostGIS). D-001.
- **Data model**: OpenSidewalks-style footway graph, attributes with value, source, date and confidence, a confidence decay model, live state, user profile with nine presets. [DATA_MODEL.md](DATA_MODEL.md). PostGIS schema in `db/migrations/0001_graph.sql` (applied cleanly on PostgreSQL 16 + PostGIS 3).
- **Honest graph builder**: OSM to footway graph (kerbs, crossings, lifts split by level, borrowed street names flagged), LiDAR terrain at 0.5 m via OSTN15, with bridge/indoor handling and a discontinuity rule that marks unknowns rather than inventing gradients. D-005.
- **Routing spike**: own A* router with per-user cost, hard vs soft constraints, uncertainty penalty, alternatives, profile trade-offs ("Avoid setts", "Keep under 6%"), "Why this way?" explanations, elevation profile, spoken segment list. Report: [spikes/phase0-edinburgh.md](spikes/phase0-edinburgh.md); routes as GeoJSON with a MapLibre viewer.
- **Acceptance tests**: the Edinburgh journeys as automated tests on a committed graph snapshot (32 tests), plus an opt-in live-data variant (`CAUSEWAY_LIVE=1`) that rebuilds from today's OSM. Both pass.
- **Docs**: [DATA_SOURCES.md](DATA_SOURCES.md) (8 groups, licence and coverage per city, 41 open verification tasks), [DECISIONS.md](DECISIONS.md) (13 entries), [PLATFORM.md](PLATFORM.md).

## The spike result

Waverley to the Grassmarket, same graph, different people:

| Profile | Time | Distance | Steepest | Steps | Route |
|---|---|---|---|---|---|
| Walking | 14 min | 0.9 km | 25% (Victoria Terrace) | 6 flights | News Steps, Lawnmarket, Victoria Street, West Bow |
| Manual wheelchair (8% limit) | 47 min | 2.5 km | 7.9% | 0 | North Ramp out of Waverley, Princes Street, Lothian Road, King's Stables Road, West Port |
| Powerchair (12%) | 32 min | 2.4 km | 8.8% | 0 | Same corridor |

"Why this way?" for the manual chair: *"Avoids West Bow (12.4% downhill) and The News Steps (124 steps). Adds 32 minutes."* Every way into the Grassmarket from the Old Town side exceeds 8% or has steps (West Bow 12.4%, Victoria Terrace 10.2%, Candlemaker Row over 8%), so the long way round is the honest answer for that limit. Changing the limit changes the route; that is the product.

Other acceptance checks:

- **Cockburn Street**: LiDAR gives a 7.9% average and 9.6% steepest, on setts. It is excluded in both directions for an 8% profile. From Market Street to the High Street, the manual chair uses the three Waverley lifts and North Bridge instead.
- **Royal Mile to Victoria Street**: the route shows 219 m of setts and 7.3% downhill explicitly, and the trade-off check says plainly *"Every way there that fits your settings has setts."*

## Coverage (spike area: 74 km of footway network, Old Town and Princes Street)

| Attribute | Known, by length |
|---|---|
| Incline | 65% |
| Cross-slope | 58% |
| Surface | 76% |
| Width | **2%** |
| Separately mapped pavement | 72% |
| Crossings with both kerbs known | **1% of 207** |

## What is still unknown

- **Kerbs are the gap.** OSM has kerb data on 86 nodes in the area; `kerb:height` appears nowhere in the three pilot cities. Every manual-wheelchair route here carries unknown crossings. Council dropped-kerb inventories and Mapillary `curb-cut` detections are the Phase 1 priority.
- **Width is essentially absent.** OS NGD has it, but it is premium, licensed data (needs Richard: paid source).
- **Cross-slope from 0.5 m LiDAR is near its noise floor.** It is used as a soft penalty only, never an exclusion, until ground-truth calibration.
- **The incline figures are not yet validated.** The values look right on known streets (Cockburn Street, Victoria Street, West Bow), but there are no measured ground-truth samples yet. Phase 1 needs an inclinometer walk in each city.
- **Waverley's interior** depends on OSM indoor tagging; 8 of the 9 lift nodes are tagged with a single level, so they work as pass-through points rather than explicit level changes.
- **Preset thresholds and unknown-risk weights are placeholders** (D-013).
- **LiDAR Phase 5 flight date is not yet confirmed**; the snapshot uses the publication date (2022-07-06).

## Decisions needing Richard

1. **Platform (D-004)**: decided 2026-10-04 (delegated): shared core + Expo app + Next.js web, with react-native-reusables as the shadcn equivalent on native.
2. **ODbL strategy (D-008)**: publish the enriched footway graph under ODbL; keep partner and licensed data in separate layers. Depends on question 4 below.
3. **Routing engine (D-003)**: own router over PostGIS, OpenTripPlanner for transit, GraphHopper as the fallback. Not blocking, but he should know.
4. **Paid data**: OS NGD pavement widths (premium), Met Office DataHub for production weather.

## Open questions for Richard

1. Where did v1 live (Lovable, another repo, a local folder)? Is any of it worth recovering?
2. Does "PFL announcements" mean TfL lift and step-free announcements? (Working assumption. TfL's lift disruptions API is live and keyless: 18 entries today.)
3. What did v1 get wrong that this rebuild must fix?
4. Product, charity tool, open-data project or portfolio piece? This changes D-008, D-011 and the Mapillary question (its terms limit commercial use).
5. Euan's Guide: does he want to explore a data partnership, and how should the board relationship be handled? (Nothing has been done; DATA_SOURCES.md marks it partnership-only.)
6. Branding: keep the name Causewayside? Any visual identity yet?
7. Who are the first testers in each city, and is there a budget for paid research with disabled participants?

## Next (Phase 1, Edinburgh)

Geofabrik PBF + diffs into PostGIS from a worker. Whole-city LiDAR enrichment. Ingest the Edinburgh council dropped-kerb and footway datasets (portal unreachable from this container; to verify). Mapillary curb-cut trial. Coverage report per ward. Debug map. Router performance gate at city scale (D-003).
