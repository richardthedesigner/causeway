# Causewayside

Accessibility-first wayfinding. It gets a wheelchair user from A to B on a route they can actually complete, by modelling every footway's gradient, camber, surface, width, kerbs, steps and live state, scoring it against the user's own limits, and saying so when it doesn't know.

**Status: Phase 1 (the honest graph, central Edinburgh).** No product UI yet. Start with [docs/PHASE1_REPORT.md](docs/PHASE1_REPORT.md), then [docs/PHASE0_REPORT.md](docs/PHASE0_REPORT.md).

## Layout

| Path | What |
|---|---|
| `packages/graph` | Graph schema, attribute and confidence model, OSM ingest, LiDAR terrain, snapshots |
| `packages/profile` | User profile and presets (health data: on device by default) |
| `packages/router` | Per-user cost, routing, alternatives, trade-offs, "Why this way?", entrances |
| `packages/live` | Live data adapters: weather (Open-Meteo), TfL lift disruptions |
| `apps/web` | The app: map, search, mode and limits, routes (router runs on the device) |
| `scripts/` | Graph build, Edinburgh spike, acceptance journeys |
| `data/snapshots/` | Frozen graphs for reproducible acceptance tests |
| `db/migrations/` | PostGIS source of truth |
| `docs/` | Data sources, decisions, data model, platform, spike reports |

## Commands

```sh
pnpm install
pnpm test                    # unit + acceptance tests on the committed snapshot
CAUSEWAY_LIVE=1 pnpm test    # also rebuild from today's OSM and re-run the journeys
pnpm build:snapshot          # rebuild data/snapshots/edinburgh-old-town.graph.json.gz
pnpm spike                   # regenerate docs/spikes/phase0-edinburgh.{md,geojson}
pnpm web:dev                 # the app at http://localhost:3000 (central Edinburgh)
pnpm web:build               # static export in apps/web/out

# Phase 1: central Edinburgh (needs pip install osmium)
curl -o .data-cache/Edinburgh.osm.pbf https://download.bbbike.org/osm/bbbike/Edinburgh/Edinburgh.osm.pbf
python3 scripts/osm-extract.py .data-cache/Edinburgh.osm.pbf .data-cache/edinburgh-central.osm -3.25 55.92 -3.15 55.975
pnpm build:central           # OSM + LiDAR (range reads) -> data/snapshots/edinburgh-central.graph.json.gz
pnpm report:central          # docs/PHASE1_COVERAGE.md + docs/debug/edinburgh-central.json (inspector data)
```

## Data and attribution

Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL). The graph snapshots in `data/snapshots/` are derived from OSM and are ODbL. Terrain contains public sector information licensed under the Open Government Licence v3.0 (LiDAR for Scotland). Coordinate transformation uses OS OSTN15. Full catalogue: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
