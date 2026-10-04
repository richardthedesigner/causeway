# Phase 1 report: the honest graph (central Edinburgh)

Date: 2026-10-04. Full numbers: [PHASE1_COVERAGE.md](PHASE1_COVERAGE.md). Inspector map: published as a private Claude artifact (source in `docs/debug/`).

## What shipped

- **City-scale OSM ingest.** The weekly BBBike Edinburgh extract (OSM data to 2026-10-02) is cut to a pedestrian bbox with pyosmium (`scripts/osm-extract.py`); all tag interpretation stays in TypeScript. D-012.
- **Central Edinburgh graph.** Haymarket to Abbeyhill, Canonmills to the Grange, including Causewayside: 28,492 nodes, 34,217 edges, about 1,050 km of walkable network. D-014.
- **City-scale LiDAR.** 204 chunks of 500 m read from the public Scottish LiDAR bucket by HTTP range request, all from Phase 5 (no gaps), with fallback to other phases built in. Build time is about 3.5 minutes. 30,202 edges have a gradient and camber from the DTM; 936 are marked unknown because the line crosses a wall or an unmapped structure.
- **Kerb inference at UK controlled crossings.** Dropped kerbs are inferred at signal and zebra crossings and wherever tactile paving is tagged, always as *inferred*, never verified. D-015.
- **Confidence everywhere.** Every value in the inspector shows its state (verified, reported, inferred or unknown), source, date and method.
- **Coverage report** for the whole area and per OS 1 km square, plus a router performance test: `pnpm report:central`.
- **Graph inspector.** A map of every footway coloured by gradient, camber, surface, width or confidence. Unknown segments are dashed, steps are hatched and inferred kerbs are hollow, so nothing depends on colour alone. Tap any segment or kerb to see its facts.
- **Tests.** 45 passing, including all Edinburgh journeys on the central graph plus two from Causewayside, the demo address.

## Coverage (central Edinburgh, by length)

| | Known | Notes |
|---|---|---|
| Gradient | 94% | LiDAR, inferred. Unknown where the line crosses a wall or a structure. |
| Camber | 90% | LiDAR at 0.5 m is near its noise floor: used as a soft penalty only. |
| Surface | 77% | OSM tags. |
| Width | 8% | OSM tags. The biggest data gap after kerbs. |
| Pavement mapped separately | 44% | The other 56% is roads where we route on the centreline and say so. |
| Crossings with both kerbs mapped / inferred | 3% / 18% | 79% of crossings still have no kerb information. |

Kerb nodes: 623 mapped in OSM, 454 inferred. Only 172 have a measured height.

## Demo journeys from Causewayside (manual wheelchair, 8% limit)

| Journey | Walking | Manual wheelchair | Why this way? |
|---|---|---|---|
| To the National Museum of Scotland | 19 min / 1.4 km, 1 flight of steps, 12.2% at worst | 28 min / 1.5 km, 8% at worst, 261 m unknown | Avoids a path by Potterrow (12.2% uphill) and the steps off Potterrow. Adds 4 minutes. |
| To Waverley Station | 24 min / 1.8 km, 4 flights | 49 min / 2.6 km, uses 3 lifts, 1,637 m unknown | Avoids the Scotsman Steps and other steps. Adds 19 minutes. |

The Waverley route is long and mostly unknown because the step-free way into the station runs along streets whose pavements are not mapped separately. That is the honest output, and the clearest case for the data work below.

## Router at area scale

200 random journeys, manual wheelchair: p50 29 ms, p95 135 ms, max 215 ms. That meets the D-003 gate (p95 under 150 ms) for this area. The whole city is about 4 times larger, so it will need landmarks (ALT) or contraction to stay under the gate. 145 of 200 random pairs had a step-free route within the 8% limit.

## What is still unknown

- **Kerbs**: 79% of crossings. Also, kerbs at side-road junctions along unmapped pavements are not modelled at all yet.
- **Width**: 92% of the network.
- **Gradient accuracy is unvalidated.** Only 5 edges carry a numeric OSM incline tag, which is too few to compare against. Ground truth has to come from a field survey.
- **City of Edinburgh Council data** (dropped kerbs, footway condition, tables and chairs permits): the council's open data portals were unreachable from this build environment, so they are still uncatalogued.
- **Mapillary** curb-cut detections: the API was unreachable from here, and the commercial terms need a read (Q4).

## Decisions needing Richard

None are blocking. Three would move coverage most:

1. **A field survey day in Edinburgh**: an inclinometer and tape measure on about 100 sampled segments and 50 crossings, chosen from the inspector. This validates the LiDAR and calibrates the confidence numbers. It needs a person on the ground, ideally with a wheelchair user.
2. **OS NGD pavement widths** (premium OS data; paid, so his call).
3. **FOI or a data request to City of Edinburgh Council** for the dropped-kerb inventory and footway condition survey. This needs someone to send it; I can draft it.

## Next

- Phase 1 close-out once the network allows: council datasets, a Mapillary curb-cut trial, Geofabrik plus minutely diffs from a worker, then the whole city.
- Synthesise per-side pavement edges from `sidewalk:*` tags so that roads without mapped pavements stop being a single unknown centreline.
- Phase 2: the app shells (D-004), routing UI and the Edinburgh acceptance journeys at Google and Apple Maps polish.
