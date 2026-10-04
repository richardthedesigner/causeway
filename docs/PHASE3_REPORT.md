# Phase 3 report: live data and the other cities

Date: 2026-10-04. Coverage: [coverage/](coverage/). Decisions: D-019 to D-021.

## What shipped

- **Newcastle and Gateshead**: Grey Street and the Monument to the Quayside, across to BALTIC and the Gateshead bank top. Environment Agency 1 m LiDAR comes through its public WCS, alongside the Scottish tiles (one `ChunkSource` interface for both).
- **London**: Westminster and Canary Wharf street zones joined by the Jubilee line and DLR, modelled inside the graph (D-020). TfL lift outages close only the platforms the message names, affect only step-free users, and expire unless refreshed.
- **Movable bridges** (D-021): the Gateshead Millennium Bridge (tilt) and the Swing Bridge are identified from OSM bridge outlines, and routes that cross them say so.
- **Weather** (Open-Meteo, on the device) and **TfL lift status** (on the device, every 5 minutes) feed the router before every plan.
- **App**: three cities, a city switcher, and train legs and lift status in route cards.
- **Pavement honesty fix**: for roads without separately mapped pavements, the carriageway surface is no longer presented as the pavement's. OSM `sidewalk:*` surface and width are used where tagged; otherwise the road surface is marked inferred. Roads tagged with no pavement say "shared with traffic".

## Acceptance journeys

| Journey | Result |
|---|---|
| **Grey Street to BALTIC** (the origin journey) | Manual wheelchair (8%): 52 min, 2.9 km. Avoids Dean Street (9.6% average, 11.6% steepest), Side (up to 17%), Castle Stairs and Akenside Hill. Crosses the Gateshead Millennium Bridge (level; deck gradient from the abutments, never the river bed) and says it's a tilting bridge with no timetable available. Powerchair (12%): 24 min over the Tyne Bridge and down Church Street (9.4%). |
| **Parliament Square to Canada Square** | No outages: Jubilee line, Westminster to Canary Wharf, 29 min. With the lift outages TfL reported on 2026-10-04 (Canary Wharf, Jubilee line, faulty lift): rerouted to the Jubilee line to Canning Town, then the DLR to Canary Wharf, 47 min. "Avoids Canary Wharf, Jubilee line (lift out of service). Adds 20 minutes.", with TfL's message and the fact that TfL doesn't confirm step-free access at Canning Town's Jubilee platforms. Someone walking is not rerouted. |
| **Live variants** | `CAUSEWAY_LIVE=1`: Edinburgh rebuilt from today's OSM, and London planned against TfL's lift status right now. Both pass. |

## Coverage (by length of footway network)

| Area | Network | Gradient | Surface | Width | Pavement mapped | Crossings: kerbs mapped / inferred |
|---|---|---|---|---|---|---|
| Central Edinburgh | 1,051 km | 94% | 77% | 7% | 44% | 3% / 18% |
| Newcastle Quayside and Gateshead | 179 km | 89% | 61% | 1% | 47% | 9% / 11% |
| London zones | 87 km | 78% | 74% | 0% | 80% | 4% / 6% |

Router performance (p95, 200 random journeys): Edinburgh 143 ms, Newcastle 26 ms, London 10 ms.

## What is still unknown

- **No lift status for the Tyne and Wear Metro** (Nexus publishes none). Routes say "We have no live lift status here, so check before you set off" whenever they use a lift.
- **Gateshead Millennium Bridge tilt times**: not open data.
- **TfL step-free status gaps**: 18 of 27 Jubilee line stations have no step-free information in StopPoint; we treat them as unknown, never as step-free.
- **Ride times are approximate** (distance-based); there are no timetables until OpenTripPlanner (D-003).
- **Street-level width** is near zero everywhere outside Edinburgh.

## Decisions needing Richard

1. **Nexus and Gateshead Council**: lift status and bridge tilt times only come through a partnership or a data request.
2. **Whole-city builds** need a worker with normal network access (D-010). London especially: the OSM API is fine for zones, not for Greater London.
