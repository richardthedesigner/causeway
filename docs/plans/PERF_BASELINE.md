# Performance baseline

Measured 2026-10-05 on main with the overnight build's honesty fixes and presets ported (D-051 to D-053), so later ports can be checked against it. The rules are in [D-054](../DECISIONS.md#d-054-a-speed-budget-the-tests-enforce).

- **Download:** the data a city downloads beside its street graph, search index, buses and base map (the council layer, park gates, OpenStreetMap notes, the Toilet Map, flood areas, pavement works) comes to at most 400 KB compressed.
- **Routing work:** routing the acceptance journeys settles at most 10% more nodes than the baseline.
- **Route time:** routing the acceptance journeys, and route plus trade-offs for the rest presets, get at most 10% slower. On CI the timings are printed and fail only past 50%.

`scripts/perf-budget.test.ts` enforces all of it in `pnpm test`. `pnpm perf:baseline` prints these tables; `pnpm perf:baseline --write` also rewrites `scripts/perf-baseline.json`. Re-baseline only on purpose (a faster router, a new journey, a data refresh that changes the graphs), never to let a slower change pass, and say so in the commit.

## How it's measured

- **Files:** every file the app downloads for a city, as `apps/web/scripts/copy-graphs.mjs` copies them. "Over the wire" is the file itself when it's already compressed (`.gz`, `.pmtiles`), and gzip at level 9 otherwise, which is close to what the host sends.
- **Route time:** what the app does for each plan, `Router.alternatives` (up to three routes), on the graph as the router worker loads it: graph, buses, Edinburgh's council footways, London's station data and ride refs. No live data (works, floods, lifts, disruptions), so the figures don't depend on the day. Every acceptance journey (`scripts/journeys.ts`) with three presets that exercise different costs: walking, manual wheelchair (steps, kerbs, slopes) and visual impairment (crossings). A Monday at 13:00 UK time, dry, daylight.
- **Rest presets:** rollator and fatigue also search for "More benches" (and fatigue for "Past more toilets") before the worker posts the verdict, which `alternatives` never does. So route plus trade-offs is timed for them on every journey (`measurePlans`). Walking stick and crutches use the same search with a shorter interval.
- **Nodes settled:** how many nodes the searches took off the heap (`Router.settled`). The same on every machine, so the test holds it to 10% exactly.
- **Wall time:** the fastest of 3 runs per journey, after a warm-up pass, divided by a fixed yardstick (a Dijkstra over a seeded 250 by 250 grid that shares no code with the router), so a slower machine doesn't read as a slower router. The baseline is the median of 5 rounds, which ran from 25.98 to 28.90 (route time) and from 63.60 to 68.66 (rest presets) on the machine that set it.

The machine: 4 cores, 15 GB, Node 22, a cloud session container.

## Download per city

### Edinburgh (`edinburgh-central`)

| File | On disk | Over the wire |
|---|---:|---:|
| Street graph | 3791 KB | 3791 KB |
| Search index | 1268 KB | 1268 KB |
| Buses, trams and Metro | 900 KB | 85 KB |
| Base map | 8804 KB | 8804 KB |
| Council footways | 502 KB | 110 KB |
| Park gates | 34 KB | 9 KB |
| OpenStreetMap notes | 7 KB | 3 KB |
| Toilet Map | 13 KB | 3 KB |
| **Total** | | **14074 KB** (5269 KB without the base map; 125 KB beside the graph, the budgeted part) |

### Newcastle and Gateshead (`newcastle-gateshead`)

| File | On disk | Over the wire |
|---|---:|---:|
| Street graph | 643 KB | 643 KB |
| Search index | 205 KB | 205 KB |
| Buses, trams and Metro | 186 KB | 19 KB |
| Base map | 2265 KB | 2265 KB |
| Park gates | 3 KB | 1 KB |
| OpenStreetMap notes | 0 KB | 0 KB |
| Toilet Map | 5 KB | 1 KB |
| Flood areas | 9 KB | 2 KB |
| Pavement works | 27 KB | 4 KB |
| **Total** | | **3142 KB** (877 KB without the base map; 9 KB beside the graph, the budgeted part) |

### London (`london-jubilee`)

| File | On disk | Over the wire |
|---|---:|---:|
| Street graph | 402 KB | 402 KB |
| Search index | 110 KB | 110 KB |
| Buses, trams and Metro | 48 KB | 6 KB |
| Base map | 5904 KB | 5904 KB |
| Park gates | 16 KB | 4 KB |
| OpenStreetMap notes | 5 KB | 2 KB |
| Toilet Map | 17 KB | 4 KB |
| Flood areas | 270 KB | 64 KB |
| Pavement works | 8 KB | 2 KB |
| Rail network (lifts, station data) | 170 KB | 15 KB |
| **Total** | | **6513 KB** (609 KB without the base map; 76 KB beside the graph, the budgeted part) |

## Route time

After a warm-up pass, the median of 5 rounds; each timing is the fastest of 3 runs. Calibration workload: 100.9 ms. All cities: 2780 ms, normalised 27.56.

| City | Load and index | Route time (all journeys) | Nodes settled |
|---|---:|---:|---:|
| edinburgh-central | 1469 ms | 2283 ms | 224,919 |
| newcastle-gateshead | 189 ms | 295 ms | 36,774 |
| london-jubilee | 105 ms | 202 ms | 34,696 |

| Journey | Preset | Routes | Time | Nodes settled |
|---|---|---:|---:|---:|
| waverley-grassmarket | walking | 3 | 79.1 ms | 11,532 |
| waverley-grassmarket | manual-wheelchair | 3 | 498.8 ms | 47,386 |
| waverley-grassmarket | visual-impairment | 3 | 181.4 ms | 16,087 |
| royal-mile-victoria-street | walking | 3 | 9.0 ms | 2,396 |
| royal-mile-victoria-street | manual-wheelchair | 1 | 317.3 ms | 33,201 |
| royal-mile-victoria-street | visual-impairment | 2 | 8.7 ms | 2,279 |
| market-street-high-street | walking | 3 | 1.9 ms | 675 |
| market-street-high-street | manual-wheelchair | 2 | 38.4 ms | 4,576 |
| market-street-high-street | visual-impairment | 2 | 6.8 ms | 1,455 |
| causewayside-museum | walking | 3 | 123.0 ms | 11,594 |
| causewayside-museum | manual-wheelchair | 3 | 237.8 ms | 17,784 |
| causewayside-museum | visual-impairment | 3 | 146.6 ms | 16,639 |
| causewayside-waverley | walking | 3 | 220.3 ms | 18,137 |
| causewayside-waverley | manual-wheelchair | 3 | 266.8 ms | 25,493 |
| causewayside-waverley | visual-impairment | 3 | 147.4 ms | 15,685 |
| grey-street-baltic | walking | 3 | 89.5 ms | 12,638 |
| grey-street-baltic | manual-wheelchair | 2 | 114.9 ms | 13,286 |
| grey-street-baltic | visual-impairment | 1 | 90.9 ms | 10,850 |
| parliament-square-canada-square | walking | 1 | 67.2 ms | 13,545 |
| parliament-square-canada-square | manual-wheelchair | 1 | 67.9 ms | 9,728 |
| parliament-square-canada-square | visual-impairment | 1 | 66.6 ms | 11,423 |

### Rest presets: route plus trade-offs (D-053)

Median of 5 rounds. Calibration workload: 96.7 ms. All cities: 6357 ms, normalised 65.75.

| City | Journey | Preset | Routes and options | Time |
|---|---|---|---:|---:|
| edinburgh-central | waverley-grassmarket | rollator | 3 | 1705.4 ms |
| edinburgh-central | waverley-grassmarket | fatigue | 3 | 1152.1 ms |
| edinburgh-central | royal-mile-victoria-street | rollator | 1 | 495.0 ms |
| edinburgh-central | royal-mile-victoria-street | fatigue | 1 | 539.2 ms |
| edinburgh-central | market-street-high-street | rollator | 2 | 92.6 ms |
| edinburgh-central | market-street-high-street | fatigue | 2 | 113.7 ms |
| edinburgh-central | causewayside-museum | rollator | 1 | 607.4 ms |
| edinburgh-central | causewayside-museum | fatigue | 1 | 785.2 ms |
| edinburgh-central | causewayside-waverley | rollator | 2 | 254.8 ms |
| edinburgh-central | causewayside-waverley | fatigue | 2 | 308.9 ms |
| newcastle-gateshead | grey-street-baltic | rollator | 1 | 53.7 ms |
| newcastle-gateshead | grey-street-baltic | fatigue | 1 | 128.5 ms |
| london-jubilee | parliament-square-canada-square | rollator | 2 | 42.7 ms |
| london-jubilee | parliament-square-canada-square | fatigue | 2 | 77.8 ms |

## What this tells us

- **Edinburgh is the heavy city.** Its street graph (3.8 MB) and search index (1.3 MB) are 7 to 10 times London's, and it takes about 1.5 seconds to load and index. Its council layer (110 KB) is most of what the download budget holds.
- **Wheelchair routes are the slow ones.** Waverley to the Grassmarket for a manual wheelchair settles 47,000 nodes and takes about half a second for three routes, because the steep, stepped Old Town forces long detours. That journey is the one to watch.
- **"More benches" is the slowest thing the router does.** Waverley to the Grassmarket by rollator takes 1.7 seconds with its trade-offs, against 0.08 to 0.5 seconds for the three plain presets.
- **The base map is most of every download** (63% to 92%). It is cached by the service worker after the first visit.
