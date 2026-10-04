# Causewayside

Accessibility-first wayfinding. It gets a wheelchair user from A to B on a route they can actually complete, by modelling every footway's gradient, camber, surface, width, kerbs, steps and live state, scoring it against the user's own limits, and saying so when it doesn't know.

**Status: Phase 4 (a working web app for central Edinburgh, Newcastle and Gateshead, and two London zones).** Routing on the device for each person's limits. Walking, buses, trams, the Tyne and Wear Metro, and step-free Jubilee line and DLR, with live lift and roadworks data where it's open. Search, a base map, navigation and access notes are all in.

- What changed and when: [docs/BUILD_LOG.md](docs/BUILD_LOG.md)
- Why: [docs/DECISIONS.md](docs/DECISIONS.md)
- Where the data comes from: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)
- What's open, including actions for Richard: [GitHub issues](https://github.com/richardthedesigner/causeway/issues)

## Layout

| Path | What |
|---|---|
| `packages/graph` | Graph schema, attribute and confidence model, OSM ingest, LiDAR terrain, snapshots |
| `packages/profile` | User profile and presets (health data: on device by default) |
| `packages/router` | Per-user cost, routing, alternatives, trade-offs, "Why this way?", entrances |
| `packages/live` | Live data adapters: weather (Open-Meteo), TfL lifts, street disruptions and bus arrivals, Street Manager works |
| `apps/web` | The app: map, search, mode and limits, routes (router runs on the device) |
| `scripts/` | Data builds (graph, places, buses, works, base map), acceptance journeys, preview build |
| `data/snapshots/` | Frozen graphs for reproducible acceptance tests |
| `data/places/`, `data/transit/`, `data/live/`, `data/basemap/` | Search index, bus, tram and Metro timetables, pavement works, base map tiles |
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

# Every area (edinburgh-central, newcastle-gateshead, london-jubilee); pip install osmium duckdb
pnpm build:area <area>       # street graph
pnpm build:places <area>     # search index: OSM places, addresses, postcodes, plus Overture
pnpm build:bus               # buses, trams, Metro from Bus Open Data Service GTFS (no key)
pnpm build:works             # pavement works from Street Manager's monthly archive
python3 scripts/basemap-extract.py <area> minlon minlat maxlon maxlat   # Protomaps base map
bash scripts/build-preview.sh   # the private artifact preview
```

## Data and attribution

Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL). The graph snapshots in `data/snapshots/` are derived from OSM and are ODbL. Terrain contains public sector information licensed under the Open Government Licence v3.0 (LiDAR for Scotland). Coordinate transformation uses OS OSTN15. Base map © OpenStreetMap contributors, Protomaps. Extra places © Overture Maps Foundation (CDLA Permissive 2.0). Bus, tram and Metro timetables: Bus Open Data Service (OGL). Pavement works: Street Manager (OGL) and TfL. Full catalogue: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
