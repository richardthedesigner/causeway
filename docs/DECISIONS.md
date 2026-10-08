# Decision log

Running log. Each entry: the decision, options considered, why, and whether it needs Richard. Newest decisions are appended; superseded ones are marked, never deleted.

Status key: **Decided** (reversible, logged per "high autonomy"), **Proposed** (needs Richard's sign-off before work depends on it), **Open**.

---

## D-001 Repository shape: TypeScript monorepo, pnpm workspaces

**Decided.** 2026-10-04.

- `packages/graph`: schema, attribute/confidence model, OSM ingest, terrain enrichment, snapshots.
- `packages/profile`: user profile and presets.
- `packages/router`: cost model, routing, summaries, explanations, trade-offs.
- `scripts/`: data builds and the spike. `db/migrations/`: PostGIS source of truth.
- App packages (`apps/mobile`, `apps/web`) arrive in Phase 2 (D-004).

The core packages have no DOM, Node-only or React dependencies on their hot path, so the same router can run on a server, in a worker, or on the phone (see D-003, D-004). Node 22, TypeScript strict, Vitest.

## D-002 Graph model: OpenSidewalks-style footway graph, with an explicit stand-in for unmapped pavements

**Decided.** 2026-10-04. Spec: [DATA_MODEL.md](DATA_MODEL.md).

- Footways, sidewalks (one edge per side), crossings, steps, ramps, lifts, escalators and corridors are edges. Kerbs, crossings, lifts and entrances are nodes. Lifts between levels become explicit vertical edges with their own state.
- Every attribute is `{ value, state, source, observedAt, method }`. No bare values.
- **Where OSM has no separately mapped pavement, we route on the road centreline as a `street_proxy` edge.** The alternative (refuse to route) leaves 28% of the Edinburgh spike network unreachable. The proxy is never presented as known: the router marks it `unknown` (pavement existence, width, side-road kerbs) and charges the uncertainty penalty. Phase 1 replaces proxies with synthesised per-side edges from OS MasterMap / NGD pavement polygons where licensed, and from `sidewalk:*` tags otherwise.

## D-003 Routing engine

**Proposed** (reversible, but it shapes Phase 2, so flagging it). 2026-10-04.

Hard requirements from the brief, scored:

| Requirement | Valhalla | openrouteservice (wheelchair) | GraphHopper custom models | pgRouting over PostGIS | Own router (TS, spike) |
|---|---|---|---|---|---|
| Per-request user thresholds | Partial: pedestrian `type=wheelchair`, `max_grade`, step penalty. No kerb height, cross-slope, width | Yes for incline, kerb height, surface, smoothness. No cross-slope, width minimum is coarse | Yes, on any encoded value, via request-time expressions | Yes, cost is SQL per request | Yes, any attribute |
| Hard exclusions vs soft penalties | Partial | Partial | Yes (priority 0 vs multipliers) | Yes | Yes |
| Custom attributes (cross-slope, confidence, kerb cm) | Fork the C++ tile builder | Fork the Java build | Java import plugin + new encoded values | Native (columns) | Native |
| Live state without rebuild | Traffic tiles are speed-only; closures need per-request exclude polygons | Per-request `avoid_polygons` | Per-request areas in the custom model | Native (update a row) | Native (overlay map) |
| Uncertainty penalty | No | No | Expressible if confidence is encoded, coarse | Yes | Yes |
| Alternatives | Yes | Yes | Yes | Weak (`pgr_KSP`) | Yes (penalty method), plus profile trade-offs |
| Elevation profile | Yes | Yes | Yes | Build ourselves | Yes |
| "Why this way?" explanation | No | No | Partial (path details) | Build ourselves | Yes, native |
| Runs on device offline | Yes (mobile builds, heavy) | No | Android only | No | Yes, same code |
| Transit | No | No | Limited | No | No: OpenTripPlanner 2 for transit legs |
| Maturity | High | High | High | High | New (about 600 lines) |

**Proposal:**

1. **PostGIS is the source of truth** for the enriched graph (boring, proven, as the brief asks).
2. **Walking and wheeling legs use our own router** (`packages/router`): per-city compact graph exported from PostGIS, held in memory on the server and on the device. It is the only option that does all of: per-user cost over our own attributes, an uncertainty penalty, explanation, and offline on the phone with the *same* cost function. The spike routes Waverley to the Grassmarket in about 5.5 ms on a 3,000-edge graph. A whole city (estimated 300k to 500k edges) is the Phase 1 performance gate. If it misses (target: p95 under 150 ms on the server), we add contraction or landmarks (ALT) rather than switch engines.
3. **OpenTripPlanner 2 for transit legs.** Our router plans station entrance to street; OTP plans between stops, with its wheelchair-accessible trip filtering. Station interiors (step-free paths, lifts) live in our graph, so lift outages hit our edges directly.
4. **GraphHopper custom models are the fallback** if the own-router performance gate fails. Its request-time expressions are the closest match to our cost model.
5. **openrouteservice's wheelchair profile is the external benchmark.** Phase 2 runs every acceptance journey through it and records where we differ and why.

**Risk:** owning a router is novelty on the infrastructure side, which the brief warns against. The mitigation is that it is small, pure and heavily tested, its storage underneath is PostGIS, and the fallback is named. **Needs Richard:** no, unless he wants a mainstream engine for credibility reasons.

## D-004 Platform

**Decided.** 2026-10-04. Richard delegated the call ("you decide"). Full write-up: [PLATFORM.md](PLATFORM.md).

Recommendation: a **shared TypeScript core** (graph, profile, router) used by **an Expo (React Native) app as the primary product** and **a Next.js web app** for share links, place pages, desktop planning and the debug map. The deciding criteria are background location, Live Activities on the lock screen, haptics and offline storage. A PWA cannot meet the brief's navigation bar on iOS. The cost: shadcn survives fully on web, and on native only through react-native-reusables (the shadcn port for NativeWind). That is a partial deviation from "shadcn for all UI chrome", accepted as part of this decision.

## D-005 Terrain: LiDAR for Scotland Phase 5 + OSTN15

**Decided.** 2026-10-04.

- Phase 3 NT27SE does **not** cover central Edinburgh (checked: data only in the south-east corner of the tile). Phase 5 NT27SE and NT27SW (50 cm DTM, Open Government Licence) cover the spike area. Read with HTTP range requests from the public bucket, so there are no multi-hundred-MB downloads.
- WGS84 to British National Grid uses the **OSTN15** grid (PROJ CDN GeoTIFF), not the 7-parameter Helmert. Helmert is out by up to about 5 m, which at 0.5 m resolution samples the wrong side of a retaining wall.
- Incline is sampled every 1 m along the footway line; the router excludes on the steepest 10 m window; edges under 5 m use a centred 5 m baseline.
- **Bridges, levels other than 0, indoor and covered edges never sample the DTM**: bare earth under North Bridge is Waverley's tracks. They interpolate between abutments, or stay unknown.
- **Discontinuity rule:** a jump of over 0.6 m between 1 m samples, or any gradient over 35%, means the line crosses a wall or an unmapped structure. The edge becomes `unknown` with that reason; we never trust it. 138 edges in the spike area.
- England: Environment Agency National LiDAR Programme 1 m DTM (Phase 3 cities).

## D-006 Geocoder: self-hosted Photon, plus OS Open Names and postcodes

**Decided** (not built yet). The public Nominatim service forbids autocomplete and limits use to 1 request per second; Photon is designed for type-ahead. Index OSM + OS Open Names + Overture places (with a per-record licence). Postcodes from the ONS Postcode Directory (three attribution lines; excludes BT postcodes).

## D-007 Map tiles: Protomaps PMTiles self-hosted, our own style

**Decided** (not built yet). One PMTiles file per pilot region on object storage behind a CDN. No per-request vendor cost and no vendor lock-in, and it works offline as a single downloadable file per city, which matters for D-004. OpenFreeMap is the zero-effort fallback for development. Accessibility overlay as a separate vector source generated from our graph (ODbL produced work, attributed). Terrain/hillshade from DEM tiles derived from the same LiDAR (Open Government Licence).

## D-008 ODbL strategy: the enriched graph is an ODbL derivative database, and we publish it

**Proposed** (licensing strategy; touches Q4). 2026-10-04.

Attaching LiDAR gradients and our surveys to OSM-derived footway geometry makes the enriched graph a derivative database under ODbL (the Collective Database Guideline only keeps layers separate if they never cross-reference). Trying to avoid that would mean keying our attributes to non-OSM geometry everywhere, which costs a lot and gains little.

Proposal: **accept it, and publish the enriched footway graph under ODbL.** It fits an accessibility mission, it makes crowd verification feed back into OSM (via the OSM editing route Mapillary explicitly permits), and it is a credible open-data story. Licensed or partner data (OS NGD widths, AccessAble, Euan's Guide, Mapillary-derived attributes if their terms don't allow it) stays in **separate layers keyed by our own location IDs**, joined only at query time, and is never written back into the ODbL graph. **Needs Richard:** yes, because it depends on whether this is a product, a charity tool or an open-data project (Q4).

## D-009 Profile data stays on the device

**Decided** (it is the brief's default). The profile is sent with each routing request and never persisted or logged server-side. No analytics on profile contents. Server-side sync only with explicit consent and after a DPIA, and that is a stop-and-ask item for Richard. Routing requests are logged without the profile, and with origin and destination truncated to 3 decimal places (about 100 m).

Update (SEC-05, 2026-10-05): checked. The app logs nothing; its only URL parameter is the demo switch; shared notes carry the opt-in mobility label only (D-030); reports, the share text and router errors carry no profile. `pnpm e2e` now watches every request in every journey and fails if one carries the device's name, type or limits.

Update (FEAT-20, 2026-10-06): your position is held to the same rule. Before, live search was biased towards "Your location" once you'd used it, which sent your position to Photon; it now uses the city's start. `pnpm e2e` fails if a request carries the position it shares (D-073).

## D-010 Heavy jobs: GitHub Actions for Phase 0 and 1, then Fly.io or Cloud Run workers

**Decided.** Graph builds, LiDAR sampling and imagery inference do not run in Vercel functions. Phase 0 and Phase 1 run builds as scheduled GitHub Actions jobs, which is enough for three cities rebuilt nightly. Minutely OSM diffs and Mapillary inference move to a container worker (Fly.io Machines or Cloud Run jobs) writing to Supabase PostGIS. Reconsider at Phase 3.

## D-011 Weather: Open-Meteo in development, Met Office DataHub for production

**Decided.** Open-Meteo's free API is non-commercial only. If Causewayside is a product (Q4), production uses Met Office DataHub (site-specific) or a paid Open-Meteo plan. The cost model already takes `wet` and `ice` conditions.

## D-012 Phase 0 snapshot data source: OSM API `/map`

**Decided**, temporary. Overpass and Geofabrik were unreachable from the build container. The OSM API is fine for a small bbox but must not be used for city builds (OSMF API usage policy).

**Update 2026-10-04 (Phase 1):** city builds read the weekly BBBike Edinburgh extract (PBF). `scripts/osm-extract.py` (pyosmium) cuts a pedestrian-relevant bbox to OSM XML, and all tag interpretation stays in TypeScript. Geofabrik plus minutely diffs from a worker replaces this when the worker exists (D-010).

## D-013 Unknown-risk weights and preset thresholds are placeholders

**Decided**, explicitly provisional. The presets cite Inclusive Mobility (2021) where it applies (5% preferred, 8% absolute over short distances; cross-fall 2.5%) and are otherwise judgement.

Update (DATA-10): rest distances now follow Inclusive Mobility (2021) section 3.4, "Recommended distance limit without a rest": walking stick and crutches 50 m (were 500 and 400), fatigue or chronic illness 100 m, IM's figure for people with a mobility impairment and no stick (was 250). IM's 150 m for wheelchair users and people with a vision impairment isn't used: they can stop anywhere, so a bench isn't the point. The rollator keeps 300 m: it has a seat (confirmed by Richard, 2026-10-05, D-054). Mapped benches rarely come every 50 m, so "More benches" also tries half and seven-tenths of the route's longest gap, and offers the best it finds with the real figure. *Since D-054 and D-055 it starts from the loosest of these and makes at most two searches.*
- Kerbs stay as they were. IM's "flush, with a maximum 6 mm tolerance" is how a dropped kerb should be built, not what someone can manage, and real lowered kerbs often aren't. So an OSM `lowered` kerb with no height still counts as 2 cm. *Superseded by D-054: Richard decided to apply IM's 6 mm to the manual wheelchair, and an unmeasured dropped kerb now counts as 6 mm.*
- Gradients and cross-fall already cite IM (above). Users can change every figure, and Phase 2 testing (RES-01, RES-02) replaces them. The unknown-risk weights (60 s per 100 m for unknown gradient, 120 s per unmapped kerb at a crossing) are guesses. Both are calibrated in Phase 2 with disabled testers in each city. Every number lives in one place (`packages/profile`, `packages/router/src/cost.ts`).

## D-014 Phase 1 area: central Edinburgh first, whole city with the worker

**Decided.** 2026-10-04. Phase 1 builds the bbox -3.25, 55.92 to -3.15, 55.975: Haymarket to Abbeyhill, Canonmills to the Grange. That covers the Old and New Towns, Southside including Causewayside, Stockbridge, Bruntsfield, Marchmont and the foot of Leith Walk. It needs four 5 km LiDAR tiles, read as 500 m chunks over HTTP range requests (`packages/graph/src/dtm-tiles.ts`). The rest of the city follows once builds move to a worker (D-010); the code is not area-specific.

## D-015 Infer dropped kerbs at UK controlled crossings

**Decided.** 2026-10-04. OSM records a kerb at about 1% of crossings, so without this nearly every manual-wheelchair route carries unknown crossings. UK guidance (DfT tactile paving guidance 2021; Inclusive Mobility 2021) requires dropped kerbs with blister paving at signal-controlled and zebra crossings. So where OSM says a crossing is controlled, or has tactile paving, and says nothing about the kerb, we set the kerb to `lowered` with state **inferred**, source `derived`, height unknown and the rule as its method. Uncontrolled crossings without tactile paving get nothing. A mapped kerb always wins. The router lets an inferred dropped kerb through but charges a cautious user a small risk penalty (30 s at zero tolerance), and the inspector shows it as inferred. Risk: old or substandard crossings. Phase 2 user testing and council dropped-kerb data are the check.

## D-016 Build order: web shell first, Expo second

**Decided.** 2026-10-04. D-004 stands (Expo is the primary product). The first app screen is built in `apps/web` (Next.js, static export) because it can be built, tested (axe, Playwright) and shown from this environment, and because the web shell is needed anyway for share links and planning. All logic lives in the shared packages, so the Expo app reuses the router, profile and live adapters unchanged.

## D-017 Routing runs on the device

**Decided.** 2026-10-04. The web app loads the city graph (3.4 MB gzip for central Edinburgh) into a Web Worker and routes there. The profile, which is health data, never leaves the device: no server sees it, which satisfies D-009 by construction. It also works offline once loaded, and costs nothing to host. Server-side routing (for whole cities and transit, D-003) is added when the graph outgrows the phone.

## D-018 Entrances, doors and rest points

**Decided.** 2026-10-04. Entrances (`entrance`, `door`, `automatic_door`, `door:width`, `step_count`, `wheelchair`, `ramp`), benches and toilets are extracted from OSM. Entrances on the footway network can exclude a route (a manual revolving door, steps over the user's limit, a door narrower than their minimum width). Every entrance near a venue destination gets a verdict for this user under "Getting in". An entrance is never called accessible when the step is unknown. Coverage is very thin (1 of 963 Old Town entrances has an `automatic_door` tag), so this is a crowd-verification and partner-data priority (Euan's Guide, AccessAble: Richard's call).

**Update 2026-10-04:** a building destination now routes to the best entrance that fits this person (the first with a "yes" verdict within 50 m), and the route screen says which. If none fits, or none is reachable, the route ends at the building's centre as before and "Getting in" says what is known.

## D-019 Live weather and TfL lift outages (adapters)

**Decided.** 2026-10-04. `packages/live`:
- **Weather**: Open-Meteo, fetched by the user's browser (unreachable from the build container). It decides `wet` (rain now or over 0.2 mm in 3 hours) and `ice` (snow, freezing rain, or at or below 1°C after precipitation in 12 hours). The user can always override, and the app says where the setting came from. Non-commercial terms apply (D-011).
- **TfL lift disruptions**: parsed and tested against a real response recorded 2026-10-04 (18 outages). Outages become `closed` live states on lift edges, expiring after 15 minutes unless refreshed, so a stale closure never outlives its feed. Mapping TfL lift IDs to graph edges needs the London station graph (Phase 3).

## D-020 Transit lite: rail inside the pedestrian graph

**Decided.** 2026-10-04. For Phase 3, step-free rail is modelled in our own graph rather than OpenTripPlanner. Each station is a street-level node linked to nearby street nodes (street level only; indoor OSM station mapping never stands in for the street). Each line gets a platform node per station. `board` edges carry TfL's step-free fact and any lift outage; `transit` edges are rides; `interchange` edges join stations of one hub within 150 m. Farther pairs, like Canary Wharf's Jubilee and DLR stations 200 m apart, connect through the street graph, as they do in reality.

- This gives one cost model, one "Why this way?" and reroute-before-commit for lift outages, with no extra server.
- Ride times are distance-based (about 30 km/h including dwell) plus a 4-minute boarding allowance. There are no timetables yet: OpenTripPlanner replaces the ride layer when departure times matter (D-003).
- Step-free status: TfL StopPoint `AccessViaLift = Yes` means step-free. Otherwise it is unknown, except on the DLR, which TfL describes as step-free throughout by lift or ramp (marked reported, verify per station). `AccessViaLift = No` is *not* treated as "has steps"; on the DLR it usually means ramp access.
- Lift outages close only the edges the message supports: the named line's platforms ("to the Jubilee line"), the street link ("between the street and the ticket hall"), or every platform at the station if the message names neither. They affect only step-free users (`affects: "step-free"`), and they expire after 15 minutes unless refreshed.

Update (DATA-03): TfL's station data (`tfl-stationdata-detailed.zip`, TfL open data) maps each station's areas and the level paths, ramps and lifts between them. `scripts/transit-london.ts` adds it to `network.json` for all 72 stations, and the app puts it on the board edges when London loads (`applyStationAccess`), per line:
- **Step-free** means every platform of that line can be reached from "Outside" by level paths, ramps and lifts. Some platforms only (one direction) stays unknown. None, where TfL has mapped the routes, now means not step-free: 10 Jubilee line stations north of Baker Street, which wheelchair users are routed around. Canada Water and Canning Town's Jubilee platforms are now confirmed step-free.
- **Lift outages** are joined on `LiftUniqueId`: a line is closed only if the lifts out cut every step-free route to its platforms. A lift outage on the District line at Westminster no longer touches the Jubilee line. Stations without TfL station data fall back to reading the message, as before. Every lift out at a station counts together, even when TfL sends them as separate messages (D-053).
- The platform-to-train step and gap (and level-boarding doors, and manual ramps) are kept with the fact and shown with it.

Update (DATA-04): TfL line status and station disruptions now act on the rail graph too (`packages/live/src/tfl-disruptions.ts`), refreshed with the lifts.
- **Line closures** come from `/Line/{ids}/Status?detail=true`, which lists the stations a closure affects. A part closure closes only the rides between those stations, for everyone, with TfL's own start and end times, so "Leaving later" sees planned closures. A closure naming no stations closes the whole line. Rides get refs (`ride:<line>:<a>:<b>`) when the city loads, so no rebuild was needed.
- **Station messages** are free text, so only three plain cases act: the station is closed, trains don't call, or there's no step-free access. If the message is about part of the station (an entrance, one direction, a footbridge), it is flagged as unknown rather than closed. A message naming only lines we don't model is ignored, and "step-free access is still available" never closes anything.
- Where a lift outage and a disruption land on one edge, the stronger wins: closed for everyone, then closed for step-free, then flagged.
- The route panel names any line closure in force.

## D-021 Movable bridges

**Decided.** 2026-10-04. OSM puts `bridge:movable` on the bridge outline (`man_made=bridge`), not on the decks. Decks inside a movable outline inherit it. Routes that cross one say so: "Crosses Millenium Bridge, a tilting bridge. It closes for a few minutes while it moves for boats. We don't have its timetable yet." (The deck's own OSM name is used as tagged, misspelling included.) Gateshead Millennium Bridge tilt times are not available as open data that we have found; adding them is a Richard-led request to Gateshead Council.

## D-022 Reports stay on the device until there's a backend decision

**Superseded by D-030** (2026-10-04): Richard decided to share notes and send reports. **Decided** (interim). 2026-10-04. Problem reports (kind, location, time, optional note and photo) are saved on the device. Sending them anywhere means storing location data from members of the public and running moderation and corroboration, so that waits for Richard's call on the backend (Supabase, D-009 privacy rules). Reports never include the mobility profile. The data shape (`apps/web/src/lib/reports.ts`) matches the `report` table in `db/migrations/0001_graph.sql`.

## D-023 Offline on the web

**Decided.** 2026-10-04. A service worker caches the app and every city graph it has loaded. Because routing runs on the device (D-017), a loaded city keeps working with no signal. It is registered only on https and not inside embedded previews. The native app (D-004) will ship city packs as downloads instead.


Update 2026-10-04: city data (graph, bus timetables, search index, base map, fonts) is now stale-while-revalidate. The cached copy is shown at once and a fresh one is fetched in the background, so the weekly data refresh (D-033) reaches people instead of the first download being kept for ever. Pavement works stay network-first, and hashed app code stays cache-first. The cache is renamed `causewayside-v2`, which clears v1. Checked in a browser: everything cached, then a route planned with the network off.
## D-024 Base map: Protomaps vector tiles, bundled per city

**Decided.** 2026-10-04. The map under the routes is OpenStreetMap drawn from a Protomaps daily build (20261004), cut to each city's bounding box with `scripts/basemap-extract.py` (HTTP range reads, no full planet download) and shipped as one `.pmtiles` file per city (2 to 9 MB) alongside the graph. Styling uses `@protomaps/basemaps` with a quiet Causewayside flavour so the route and accessibility colours stay the loudest thing on screen; shops and other points of interest are hidden. Fonts are bundled glyphs, so the map needs no tile server, no API key and works offline with the rest of the city (D-023). No Google or Apple map data is used. Credit: "© OpenStreetMap contributors, Protomaps". For whole-country coverage later, the same files can be served from object storage with range requests instead of bundling.

## D-025 Search runs on the device, with live lookups as a top-up

**Decided.** 2026-10-04. Each city ships a search index cut from OpenStreetMap (`scripts/build-places.ts`, `data/places/<area>.json.gz`): named places with their category and any access tags, street addresses and postcode centroids. Edinburgh's is 0.9 MB compressed. Search works offline and never sends what someone is looking for (which can reveal health needs) to a server unless the bundled index comes up short; then Photon is asked for names and postcodes.io for full postcodes. Live results outside the routed area are counted, not shown.

Questions like "accessible toilet" or "step-free café" become a category plus an access filter. The filter is OSM's `wheelchair` tag, shown as "Mapped as wheelchair accessible" with "OpenStreetMap, checked/edited <month year>". We never say "step-free" about a venue: the person's word is used to search, the source's word is shown. Places with no access tags are counted ("37 more have no or different access information"), not hidden silently.

**For Richard:** this repeats OSM's own published access tags for named venues, attributed and dated, in a private preview. It is not our assessment. If you read the brief's "publishing data about named venues' accessibility" as covering this too, it is one flag (`facts`) to switch off before any public launch.

## D-026 User access notes: experience, not faults, in their own layer

**Decided** (interim on storage, like D-022). 2026-10-04. Code: `packages/graph/src/notes.ts`, `apps/web/src/components/NoteSheet.tsx`, `db/migrations/0002_notes.sql`.

Problem reports (D-022) are for faults. Notes are experience: "Step-free side entrance on Chambers Street, staff very helpful", "Setts are fine in the dry with a powerchair, lethal when wet".

- **What a note is.** A place (the destination: venue, station or pin) or a named stretch of the route, a point, good / mixed / bad, up to 280 characters, an optional photo, the date, and, only if the person switches it on for that note, a coarse label such as "manual wheelchair". The label comes from the preset id, never from the profile's numbers or its user-chosen name, so no threshold can reach a note (D-009).
- **Trust.** A note is always `reported` from source `notes`, and uses the same confidence function as any crowd report: 0.6 to start, a two-year half-life, plus 0.1 for each *different* author who said the same thing about the same place, capped at 0.9 so it never equals verified. Your own repeat notes don't corroborate each other.
- **Shown as people's words.** On "Getting in", in "Why this way?", and under the matching street in "What we don't know", always with the date and "A Causewayside user, using a manual wheelchair" (or "You" for your own), and the line "Their own experience, not checked by us." Notes over a year old say things may have changed.
- **Routing: soft signals only, through `evaluateEdge`.** Each edge gets a score from its notes, weighted by confidence and by how close the author's label is to this user (same 1, none 0.6, different 0.4). Bad experience adds a penalty of at most half the edge's travel time. Good experience takes at most half off the *unknown-risk* penalty, never off travel time, so cost never falls below travel time and A* stays admissible. Notes never exclude a street, never lift an exclusion, and never change a verdict: a good note can't make an unknown known (the trust contract). Place notes don't affect routing.
- **Separate layer (D-008).** Notes point at OSM way ids (stable across rebuilds) plus edge ids for the build they were written on, and are joined to edges in the router per request (`Router.noteSignals`). They are never written into the graph, and the `note` table has no foreign keys into it. Licence: our own content, not ODbL.
- **Storage.** On the device (`localStorage`, `causewayside.notes.v1`) with a random per-device author id that is only used to count different people. The `note` table matches the shape for when Richard decides on a backend (D-022): moderation, abuse handling and the public display of other people's notes all wait for that.
- **Three taps plus typing.** From "Getting in", a street chip under "Why this way?", or "Add a note" while navigating (the nearest stretch of the route): open, how was it, Save.

Open: whether notes should carry the conditions ("when wet") as a field rather than in the words; moderation before notes are shared; per-entrance notes once routing goes to a chosen entrance.

## D-027 Live and third-party data come in through adapters

**Decided.** 2026-10-04. Every outside feed gets a small adapter in `packages/live` that turns its records into one of our shapes (`LiftOutage`, `WorksObservation`, weather `Conditions`), and one function that puts those shapes on the graph as dated `LiveState`s (`liftOutageStates`, `worksStates`). The router never knows which feed a state came from, so adding a city or a source is an adapter plus a test, not a router change.

First use: pavement works. Street Manager (England, OGL) permits that close the footway close those pavement edges for everyone until the works' end date; works on the footway that don't close it, including a temporary walkway in the road, are "degraded" and counted as unknown; carriageway-only works are left out. In London TfL street disruptions that mention the pavement top this up live every 5 minutes. The build reads Street Manager's monthly archive (`pnpm build:works`, 1 GB, about a minute); production should subscribe to Street Manager's live notifications (free, needs registering an endpoint) through the same adapter. Scotland's register (SRWR) has no open feed: Edinburgh says "No open roadworks feed here yet" rather than implying there are none. *Superseded for Scotland by D-057: the register is open data, and Edinburgh's works now come from it.*

Update (DATA-05): the build also reads Street Manager's activity archive (`activity/YYYY/MM.zip`, about 12 MB a month, same bucket, OGL): skips, scaffolding, hoardings, cranes and mobile platforms, events and other non-works licences. Only those on the footway or a footpath are kept. The archive doesn't say whether the pavement is closed, so each one is "on the pavement" and counted as unknown, never closed. With no end time given, an activity runs to the end of its last day. September 2026 added 9 in Newcastle and 5 in London.

Update (D-053): activities are described in our own words and the street name only ("Scaffolding on the pavement"). The record's free-text details can name addresses, businesses and people, so they are never shown. The committed London file had three "(Impact Area)" and "(Bridge maintenance works)" endings; they were removed. TfL's street comments close a pavement only when no word around the closure phrase denies it (`saysClosed`).

Update (2026-10-05, ported from the overnight build, PR #36): the build reads the last six monthly activity archives, not one: a scaffold licensed in May can still stand in October, and an activity only appears in the months it was created or changed. The latest event per activity wins. A month that fails to download, isn't a zip or breaks part way through is skipped whole with a warning, and the file's source line names it; the June 2026 archive is published truncated, so today's files read April, May, July, August and September. Activities starting more than five weeks after the build are left out, as in D-057. A shape in several parts becomes one entry per part. An activity closes the pavement only when its own name, type details or location description say so, read with D-057's plain-words rule and denial check (`saysClosed`); none did in this build. A footpath on its own is "the path", not "the pavement". The type list stays as it was (skips, scaffolding, hoardings, cranes, compounds, events, section 50 and 58 licences, and "An obstruction" for the rest), all in our own words. Rebuilt 2026-10-05: Newcastle 51 works (38 closing a pavement) and 9 activities (7 cranes); the London zones 17 works (5 closing) and 6 activities (2 cranes).

Next adapters, in order of value: Overture places (more venues and addresses; release 2026-09-23.1 is on S3), National Rail Knowledgebase stations (step-free access and staffing; needs a free key), Met Office DataHub (warnings; key), Mapillary (kerb and surface detections; key), accessibility.cloud (venue accessibility; key, and its own sources' licences). Keys stay server-side once there is a backend; until then these run in the build.

## D-028 Overture fills search gaps; OSM stays the source of access facts

**Decided.** 2026-10-04. OSM has the access tags but misses many venues (Newcastle: 2,214 OSM places against 5,376 in Overture). Overture places are added to each city's search index when they are confident (0.7 and over), open, somewhere people go, and not already in OSM under a similar name within 75 m (word overlap, "&" read as "and", and spelling variants within 40 m). They show with their category and address and no access line, and an "accessible" search never lists them, because nothing says they are. When names tie, OSM ranks first.

Update (DATA-01, survey §9): AllThePlaces labels its output CC0, but some of its spiders scrape sites with no open licence (Changing Places, NHS inform, nhs.uk), which breaks rule 5 in DATA_SOURCES.md. Its records don't say which spider made them, so an Overture place whose only source is AllThePlaces is left out when it's a toilet, a pharmacy or a health service (`scrapedOnly` in `scripts/overture-merge.ts`). The same place from another source, or mapped in OSM with `changing_places=yes`, stays. This removed 29 "Changing Places" records and 24 GP, dentist, hospital and pharmacy records from the committed indexes.

Update (issue #15): an Overture place is also a duplicate when an OSM place within 40 m has the same house number and street and either shares a name word or is the same kind of place. An address alone isn't enough, because one building can hold many businesses. This removed 409 more duplicates in Edinburgh, 58 in Newcastle and 16 in London.

## D-029 Buses: frequency-based, built from open timetables, honest about the wheelchair space

**Decided.** 2026-10-04. Buses come from the Bus Open Data Service GTFS downloads (England and Scotland, no key, OGL; `pnpm build:bus`). For each route direction we keep the stops inside the area, the typical ride time between stops and how many buses leave each stop in each hour on a typical weekday, Saturday and Sunday. The app adds them to the graph when a city loads (`addBus`), so timetables refresh without rebuilding streets.

The wait is half the gap between buses at that hour (UK time), or until the next hour's first bus; with nothing within 30 minutes, the route isn't offered. Every UK local bus is low-floor with a ramp and one wheelchair space (PSVAR 2000), so boarding counts as step-free, but the space can be taken: wheelchair users' routes carry the expected extra wait for the next bus (15% chance, a working guess until reports exist). Mobility scooters are left off buses unless the user says they have an operator's permit, because most operators only carry small scooters that way. Buses can be turned off in settings.

Stops carry OSM's shelter, seat, tactile paving and kerb facts, joined on the NaPTAN code (Edinburgh 815 of 842 stops, Newcastle 147 of 159). Waiting more than three minutes with no seat costs extra for anyone with a rest limit (and an unmapped seat counts as unknown); no shelter costs extra in the rain; a mapped lowered or flush kerb adds a minute for wheelchair users (the ramp is steeper). Directions name what's there: "from Bernard Terrace (shelter and seat)". Kerbs at stops are almost never mapped, so that rule rarely fires.

The route panel lists each bus leg with how often it runs now (timetable) and, in London, the next three live departures from TfL every 30 seconds, labelled as live. Next: live times for Lothian and Go North East (feeds to check), and "space taken" reports.

## D-030 Sharing notes and sending reports: Supabase, anonymous, post-moderated

**Decided** by Richard, 2026-10-04 ("yes, turn sharing on"). Supersedes D-022 and the storage half of D-026. Setup and upkeep: [BACKEND.md](BACKEND.md). Code: `db/migrations/0003_sharing.sql`, `0004_storage.sql`, `apps/web/src/lib/sync.ts`.

- **Where.** Supabase (Postgres + PostGIS), London region, which DATA_MODEL already names as the source of truth. No SDK in the app: plain fetch against its REST endpoints. The build turns sharing on with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; without them everything stays on the device.
- **No accounts.** Anonymous sign-in, only when you first save something. Reading shared notes needs no sign-in. The anonymous id lets you delete your own notes and lets us count different people; it is never shown. Others' notes carry a salted per-person pseudonym (for corroboration), never the id.
- **Notes show straight away, and come down fast** (post-moderation). Anyone can flag a note as wrong, unkind or about a person; two different people flagging hides it until someone looks. Pre-moderating every note would leave notes invisible for days at this scale, and notes are already framed as "not checked by us".
- **Photos are pre-moderated.** They go to a private bucket and nobody else sees them until a person has checked them (faces, number plates) and copied them to the public bucket.
- **Reports are write-only.** They go to triage, not on the map.
- **Limits, enforced by the database, not the app.** 30 notes a day per person, 1 to 280 characters, row-level security on every table. `scripts/test-db.sh` checks 14 rules on Postgres + PostGIS, in CI.
- **Privacy.** No profile, ever (D-009). The mobility label is the only health-related fact: opt-in per note, explained on the switch, with a preview of exactly what others will see. That is explicit consent for special category data. A DPIA is still owed before wider launch. Notes keep exact points (they are about places); reports keep the device's accuracy.
- **Your notes, your call.** "Delete my note" removes it from the server too.

**Update 2026-10-04: review page.** `/review` lets invited reviewers work through flagged notes, photos and reports. They sign in as themselves with an email code; row-level security (`0005_review.sql`) decides what they can do, they can only change review fields, and `review_log` records every decision with who made it. The page never holds the service key.

**Owed by people, not code:** a CAPTCHA (Cloudflare Turnstile) on anonymous sign-up before any publicity, someone named to check flags and photos weekly, and the DPIA.

## D-031 Trams and the Tyne and Wear Metro come in with the buses

**Decided.** 2026-10-04. The same open timetables carry Edinburgh Trams (GTFS route type 0) and, for Newcastle, the Metro (type 1, Green and Yellow lines), so they use the bus layer with a `mode`: wait from trains per hour, ride times from the timetable. London's Underground and DLR stay with TfL (D-020), which has live lift status.

- **Trams:** level boarding at every Edinburgh stop and two wheelchair spaces (5% chance taken, against 15% for buses). Turning buses off leaves trams on.
- **Metro:** Monument, Central Station, Gateshead, Haymarket, St James and Manors are below street level and step-free only by lift. Nexus publishes no open lift status, so for anyone who needs step-free access those stations count as unknown, never as step-free. Two spaces per train.
- **Scooters:** tram and Metro operators have size rules we haven't encoded, so for scooter users these legs count as unknown with "check the operator's size rules", rather than allowed or banned.
- Seat and shelter rules (D-029) stay bus-only: tram stops and Metro stations aren't mapped stop by stop.

Found while testing: walking from Gateshead Interchange to Jackson Street (about 100 m) costs about 30 minutes in the Newcastle graph, so the footways there need checking. Logged as a GitHub issue.

## D-032 Join footway islands across short gaps, and say they're unknown

**Decided.** 2026-10-04 (fixes issue #7). OSM often ends a footway at a crossing on a road we drop, such as a bus-only road in an interchange (`access=no`). The pavements beyond become an island a few metres from the street, so routes couldn't leave Gateshead Interchange.

`bridgeIslands` (`packages/graph/src/islands.ts`) runs in `build-area` after terrain. It joins each island of up to 500 nodes to the main network at its closest point within 15 m, preferring a mapped crossing. The connector is a crossing when either end is one; every attribute is unknown, so kerbs and surface count as unknown; it carries a `gap:` ref.

It leaves alone:
- railway platforms (reached through the station, not across the tracks);
- bridges and tunnels;
- pairs whose known ground heights differ by more than 2 m (a wall, not a gap).

Bridged: Edinburgh 172 of 446 islands, Newcastle 9 of 24, London 23 of 48. `scripts/bridge-islands.ts` applied it to the committed snapshots without a full rebuild. Central Station to Jackson Street now takes the Metro (about 10 minutes against 24 on foot), with a test.

## D-033 Weekly data refresh as a pull request

**Decided.** 2026-10-04 (issue #14). `.github/workflows/data-refresh.yml` runs on Mondays at 04:17 UTC, or by hand.
- **Rebuilds:** the search index (fresh OSM, the pinned Overture release), the bus, tram and Metro timetables (BODS GTFS, sampling the next Tuesday, Saturday and Sunday), and pavement works (last month's Street Manager archive).
- **Checks:** runs the typecheck and the full test suite against the new data.
- **Opens a pull request into `main`** with a before-and-after count table (`scripts/data-summary.ts`). Nothing reaches production until someone merges it; the mirror then copies it to the production branch.
- **Fails softly:** each source is a separate step, so one feed being down doesn't block the rest. The PR body asks the reviewer to check for sudden drops, which mean an outage rather than real change.

**Stay manual:** street graphs and base maps. They need LiDAR and a reviewed Protomaps build, and they change slowly.

Update (DATA-11): the street graphs join the weekly refresh. They read the same OSM the search index has just fetched and the same LiDAR, and take about a minute each (Newcastle: 37 seconds here). The layers keyed to graph edges follow them (council footways, flood areas), and so do park gates, OSM notes and the Toilet Map. The summary table now counts graph edges, edges with a known gradient and each layer, so a broken build shows as a sudden drop, and the acceptance journeys run against the new graphs before the pull request opens. Base maps stay manual.

**Known limit:** pull requests opened with the workflow token don't trigger CI themselves; the workflow runs the tests before opening one.

Update (STAB-06, 2026-10-05): each row of the count table has a limit on how far it may fall (graph edges 5%, places 10%, stops and park gates 20%, flood paths and Toilet Map toilets 30%; works and OSM notes none, as they come and go). Past a limit, or a file that had counts and vanished, the pull request opens as a draft that lists the drops and says not to merge, and the run fails. The refresh also fetches UK bank holidays (D-039).

## D-034 Powered devices in four classes, and saved named devices

**Decided.** 2026-10-04, from tester feedback. Plan and UI spec: [plans/DEVICES.md](plans/DEVICES.md).
- **Classes:** lightweight and heavy duty powerchairs, pavement (class 2) and road (class 3) scooters. Each is a preset, so the router stays one engine with per-user numbers (D-002); nothing special-cases a device.
- **Keys kept:** `powerchair` and `mobility-scooter` keep their keys and numbers and become the heavy duty and pavement classes. Two new keys: `powerchair-light`, `mobility-scooter-road`.
- **Road scooters** carry `roadLegal`: no penalty for a street without a pavement, no unknown for an unmapped one, and no buses.
- **Devices** are named profiles (`SavedDevice`), stored on the device only, like the profile (D-009). The name is the profile's label.
- **Demo seed:** Cherry (lightweight powerchair, no setts or cobbles) and Lulu (pavement scooter), both favourites, until onboarding creates real devices.

## D-035 The app answers "can I get there?" first

**Decided** by Richard, 2026-10-04 ("this is strong enough to replace all existing UI"). Compared with Google Maps and Apple Maps, then redesigned from scratch. The full system: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

- **The profile is the travel mode.** It sits in the search bar on every screen, where Google and Apple put car, walk and transit.
- **Verdict before time** on every route and every recent place: Fits, Unsure or Doesn't fit. A quick route you can't finish is worth nothing.
- **The route strip.** One bar coloured by slope, with climbs, setts, unmapped kerbs, lifts and rides pinned on it, matching the coloured line on the map.
- **Never a dead end.** When nothing fits, the router (`diagnose`) names the obstacles past the last point you can reach, finds that point, and finds the smallest change to your limits that gives a way, trying one limit at a time first. A change is for this journey only, shown in a banner with Undo, and never saved (D-009 still holds: the profile stays on the device and unchanged).
- **Hazards ahead, not at the spot.** Navigation shows the next hazard up to 300 m ahead; it still announces at 60 m.
- **Thumb reach.** Search at the bottom; on phones Start is pinned to the bottom of the screen at any sheet height.
- Recent places live on the device only, like the profile.

## D-036 Switch device from the search bar, at the bottom

**Decided.** 2026-10-04. Build plan: [plans/DEVICES.md](plans/DEVICES.md#build-plan-the-device-switcher-d-036).
- The device button stays inside the search bar (D-035), in the bottom drawer. No control a user must tap sits at the top of the screen: it's out of reach one-handed and from a chair-mounted phone.
- A named device shows its name; an unnamed type shows its icon and type. The list of devices opens upwards from the button.
- "Just this trip" switching, and a confirm step before switching mid-journey, are both in.
- Rejected: a separate switcher at the top of the map (out of reach), and names written on the type tiles (two devices of one type collide).


## D-037 Crossings for people who cross by sound and touch

**Decided.** 2026-10-04. The visual-impairment profile used to route exactly like walking. Graph nodes at crossings now carry what OSM says about them (`packages/graph/src/crossing-info.ts`):
- control: lights, zebra, marked, or none;
- whether the lights beep (`traffic_signals:sound`) or have a rotating cone (`traffic_signals:vibration`);
- tactile paving;
- a refuge island.

Footpaths carry whether they're shared with cycles.

**Counts.** Edinburgh: 1,279 crossings (611 with lights, 254 known to beep) and 2,215 shared stretches. Newcastle: 348 crossings. London zones: 263.

**Profile costs** (`crossingCues`, `sharedPathPer100mS`), in seconds of detour worth taking to avoid each:

| What | Seconds |
|---|---|
| Crossing with no lights or zebra | 240 |
| Zebra (nothing tells you traffic has stopped) | 60 |
| Lights with no beep or cone | 120 |
| No tactile paving | 45 |
| Shared path, per 100 m | 60 (halved when segregation isn't mapped) |

**Rules**
- Unmapped cues are unknown, never assumed, so a crossing with lights and no sound tag is "not known if the lights beep".
- The visual-impairment preset sets these costs, and a settings toggle lets anyone turn them on.
- Directions name the cue: "Cross West Preston Street at the lights, which beep and have a rotating cone."

**Example:** Causewayside to Grassmarket. Walking: 3 crossings with no lights or zebra. Visual-impairment route: none, 12 of 13 crossings beep, 9 minutes longer. A test covers three trips.

The numbers are starting points, like the rest of the presets, for Phase 2 research with RNIB and Guide Dogs users.

Snapshots were enriched with `scripts/enrich-crossings.ts`; new builds get the facts directly.

## D-038 Lit streets after dark

**Decided.** 2026-10-04. The graph already carried OSM's `lit` tag on every footway, but routing ignored it. Many people with low vision see far less at night, and an unlit path is harder for everyone to trust.

**How dark is worked out.** On the device, from the clock and the city's position (`packages/router/src/sun.ts`, NOAA's simplified solar position). Dark means the sun is more than 6 degrees below the horizon, the end of civil twilight. No weather or sunset API, so it works offline.

**Cost.** A new profile field, `litAfterDarkPer100mS`: seconds per 100 m worth taking to avoid a stretch that isn't lit.
- Mapped as unlit: the full amount.
- Lighting not mapped: a share, by how much this person minds not knowing (`0.5 × (1 − uncertaintyTolerance)`), and named "lighting not mapped", never "unlit".
- Indoors, covered, and riding a bus: nothing.
- It's a preference, not a verdict: it never makes a route "unknown" or "no".

The visual-impairment preset sets 60 s per 100 m; anyone can turn it on with "After dark, prefer streets that are lit" in the device settings. The route explanation says how much of the route isn't lit, or isn't mapped.

**Coverage.** Edinburgh: 13,155 stretches lit, 2,010 unlit, 19,224 not mapped. Newcastle: 2,301, 124, 3,882.

**Example.** Stockbridge to Dean Village for the visual-impairment profile: by day, 714 m of 1,134 m is on the unlit Water of Leith walkway; after dark, 10 m of 1,563 m.

**To revisit.** The 60 s figure is a guess, like the crossing weights (#12). Ask low-vision users in Phase 2. Planning a trip for later tonight needs a departure time, which the app doesn't have yet.

## D-039 Open when you get there

**Decided.** 2026-10-04. 2,757 places in our three cities have OpenStreetMap `opening_hours`. We showed the raw string at best ("Hours: Mo-Sa 10:00-18:00; Su 11:00-17:00"), which is hard to read and harder to work out against the clock.

**What we do.** `apps/web/src/lib/opening-hours.ts` reads the common forms (day ranges, several time spans, past midnight, "off", "24/7", later rules overriding earlier ones) in UK local time. It reads 2,665 of the 2,757 (97%).
- **Destination:** under the route time, "When you arrive: closed, opens tomorrow 09:00", in bold when shut. Arrival is now plus the route's time.
- **Accessible toilets on the route:** each says whether it's open when you'd pass it ("Open until 17:00 when you pass", "Shut when you pass, opens tomorrow 09:00"). A shut toilet doesn't count toward the longest stretch without one, and venues shut now aren't offered to "Past more toilets".

**Honesty.** Anything we can't read fully (months, sunrise, comments, "open end") shows the hours as mapped, never a guess. We don't know bank holidays, so a rule for them adds "(may differ on bank holidays)". Hours are volunteer-mapped and can be stale; the line says they're from OpenStreetMap.

**Later.** With a departure time (not built yet), "when you arrive" should use it.

Update (SMALL-01, 2026-10-05): bank holidays. GOV.UK's dates (OGL) for England and Wales and for Scotland are bundled with the app and refreshed weekly; each city names its nation. On a bank holiday a place's `PH` rule applies ("Open until 16:00 (Christmas Day)", or closed until the next working day). A place without one says "may differ today: Christmas Day" on that day only, not every day. Past GOV.UK's published dates the old general warning returns.

## D-040 Leaving later

**Decided.** 2026-10-04. Routes assumed you leave now. Bus waits, the after-dark check (D-038), opening hours (D-039), works and lift closures all depend on the time, so planning tonight's trip in the afternoon gave the afternoon's answer.

**What we do.** A "Leaving" row in This trip: Now, In 30 min, In 1 hour, or At a time (the next time the clock reads it, so 08:30 in the evening means tomorrow). The chosen time becomes the router's clock (`Conditions.now`), so everything time-dependent follows it.
- **Weather:** more than 45 minutes ahead, the ground comes from Open-Meteo's hourly forecast (same request, now asking 48 hours ahead), using the same rules as now over the hours before you leave. It says "Forecast wet at 19:30". Beyond the forecast, it falls back to now. Setting the ground by hand still wins until the time changes.
- **Route panel:** "Leaving 18:30, arriving about 18:52", and opening hours for that arrival.
- **Toilets:** open or shut when you'd pass, from the leaving time.
- **Live bus times** are hidden when leaving later: they're for now. The timetable frequency is for the leaving time.

**Not stored.** The leaving time lasts for the visit; it isn't saved, so a stale "tomorrow 08:30" can't surprise anyone next week. A time that has passed counts as now.

## D-041 Security headers and a Content Security Policy

**Decided.** 2026-10-04. A static export can't set response headers, so they go in `apps/web/vercel.json` (the Vercel project's root directory is `apps/web`).

**What we send.** A Content Security Policy that allows only our own origin plus what the app really calls: Supabase (`*.supabase.co`, for sharing and review photos), Open-Meteo, postcodes.io, Photon, TfL and the Environment Agency, and Google Fonts for the typeface. No framing (`frame-ancestors 'none'`), no plugins, forms only to ourselves. Also HSTS, `nosniff`, a strict referrer policy, `Cross-Origin-Opener-Policy`, and a permissions policy that allows location for this site only and turns off camera, microphone and payment.

**Two compromises.** `script-src` keeps `'unsafe-inline'`: Next's static export writes inline scripts whose hashes change every build (SEC-13 is the follow-up). `style-src` keeps `'unsafe-inline'`: MapLibre, Radix and our own components set inline styles.

**How we know it doesn't break anything.** The accessibility check and the end-to-end journeys serve the build with the same headers (`scripts/serve-out.mjs`) and fail on anything the policy blocks. A new live data source has to be added to `connect-src`, or those checks fail.

## D-042 Fewer Vercel builds

**Decided.** 2026-10-04. The free plan allows 100 deployments a day, and on 2026-10-04 we hit it. `ignoreCommand` in `apps/web/vercel.json` runs `apps/web/scripts/vercel-ignore.sh`, which skips a build when:
- the branch is `main`, which the mirror workflow keeps equal to the production branch, so the same commit was already built there; or
- nothing changed since the last deployed commit except docs, Markdown, workflows or database migrations.

When there is nothing to compare with, it builds.

**Updated 2026-10-08 (DEP-01).** `main` is now the production branch and the mirror workflow is gone, so the `main` rule is removed. The old production branch, `claude/sleepy-johnson-mavbrs`, falls under the `claude/*` rule and no longer builds.

## D-043 Battery range is a warning, set by the user

**Decided.** 2026-10-04. From tester feedback: lightweight chairs have small batteries.
- A device can carry `maxRangeKm`, its range on one charge on the flat. It is unset by default, and with no range there is no warning: we never guess someone's battery. The demo Cherry (`?demo=devices`) has 12 km.
- Battery use is the route's distance on wheels plus each metre climbed counted as 30 m of flat (`CLIMB_FLAT_EQUIVALENT_M`, from a rolling resistance of about 0.03). Train and bus legs don't count. The figure is a starting point; user testing replaces it.
- Warn only. Over half the range: "you may need to charge before the way back". Over the whole range: "it may not fit on one charge". Both say "about" and "counting the climbs". The router never changes or refuses a route because of range.
- Rejected: range as a hard limit (a wrong figure would block routes the device can do), and favouring shorter routes near the limit (hard to explain why a route was picked).
- **In the editor** (FEAT-01): powered chairs and scooters get "Warn me about battery range" in Your limits. It is off by default, 15 km when first turned on, and 3 to 60 km. The range is the person's own figure, not a limit the type sets, so it carries over to another powered type and on "Reset", and goes for a type with no battery.

## D-044 What's on the phone can't be lost to a change of shape

**Decided.** 2026-10-04 (STAB-03). Devices, notes and reports live only in the browser's storage (D-009). A bad migration, or an older build still cached by the service worker, could wipe someone's devices with one save.

**What we do** (`apps/web/src/lib/stored.ts`):
- **The version is in the key** (`causewayside.devices.v1`). A new shape gets a new key and reads the old one once. Old keys are read, never rewritten or deleted, so an older build keeps working and going back a version loses nothing. The single profile from before devices is read this way.
- **Nothing unreadable is overwritten.** Bad JSON, a reader that throws, or items a reader has to drop (such as a device type from a newer build) are copied to `<key>.backup` before the next save. It can be recovered by hand.
- Rejected: a version number inside the stored value, because older builds would read the new shape as empty and save over it.

## D-045 Saying when a new version is ready

**Decided.** 2026-10-04 (DEP-04). The service worker (D-023) takes over as soon as a new build is installed, but a page that's already open keeps running the old code until it's reloaded. People keep a map open for days.

**What we do.** The app looks for a new version when it comes back to the front and every hour. When one takes over, a card says "A new version of Causewayside is ready" with **Reload** and **Later**. It never reloads by itself, and waits while navigating, since a reload mid-journey would drop the route. It is rendered outside `<main>`, which the bottom sheet hides from screen readers.

## D-046 Council footway data as a separate layer

**Decided.** 2026-10-04 (DATA-06). Edinburgh's Adopted Roads layer (OGL v3) has a surface and width for each adopted footway polygon. OSM has a width on only about 5% of central Edinburgh's pavement edges.

**What we do.** `pnpm build:footways` matches each pavement edge to the footway polygon its middle sits in. A street drawn as one line in OSM (a street proxy) takes the footways within 12 m of its middle, the narrowest width and the roughest surface. The result is a separate file keyed by `<osm way>:<from node>:<to node>`, joined when Edinburgh loads (`applyCouncilFootways`) and never written into the snapshot, as D-008 proposes for non-OSM data.
- **OSM first.** The layer only fills a surface or width OSM doesn't have. Widths on pavement edges went from 1,731 to 8,707; surfaces from 22,085 to 24,641 of 31,750.
- **Where both know, they often disagree** (2,822 of 6,341 edges), mostly OSM "asphalt" against council flags, and OSM "sett" against council flags or asphalt. Many are probably street proxies carrying the carriageway's surface, not the pavement's. OSM still wins. Whether the council should win on street proxies is a question for Richard (DATA-22).
- Widths outside 0.5 to 10 m are ignored; a few large polygons carry area-like figures.
- Credit: "Pavement surfaces and widths: City of Edinburgh Council, Open Government Licence v3.0", in the city credit line.

Update (D-053): the council's surface and width are now written as inferred, not reported. The council records the whole footway polygon, matched to our edge by shape, and its width is the full width, not the clear width past bins and posts. As reported values, narrow council widths closed pavements outright for wheelchair users (231 edges under 0.9 m, 700 under 1.2 m). As inferred values they cost time and say "about", and never close a pavement on their own.

Update (D-062, D-063): matched along each edge in British National Grid, not at its middle from the server's WGS84 (which was tens of metres out); width the 20th percentile across both sides; setts on a quarter of the points; "Surface Dressing" unknown; dated with the council's published date. On a street proxy whose OSM surface is only the carriageway's, the council's pavement surface now wins (Richard, DATA-22).


## D-047 Ice, gritting and floods

**Decided.** 2026-10-04 (DATA-07). Two kinds of weather danger the ground itself can't show: an icy pavement nobody has gritted, and a riverside path under a flood warning.

**Gritting (Edinburgh).** The council's priority-1 pavement gritting routes (OGL, 55 km in the central area) go into the council layer (D-046): 1,130 pavement edges are on a route. With that data, every pavement is known to be on a route or not (`gritted`). In ice, a pavement off the routes costs 100% more time for wheelchair users and 50% more for everyone else, and a route on them says "on a gritting route". The steep and sett exclusions in ice stay as they were. Both figures are guesses for testing (RES-01). Newcastle and London have no open pavement gritting data yet, so nothing changes there.

**Floods (England).** `pnpm build:floods` maps each Environment Agency flood area (OGL) to the walking edges inside it: 4 areas over our Newcastle paths, 9 in London, where the tidal Thames areas cover whole districts. The app fetches the warnings in force every 10 minutes (`/flood-monitoring/id/floods`, keyless):
- **Severe Flood Warning:** the paths inside are closed.
- **Flood Warning:** they count as unknown ("may be flooded").
- **Flood Alert:** named in the route panel only. Alerts are common on the tidal Thames, and flagging whole districts would bury the routes in unknowns.
- A flood state never weakens one already there (works closing a pavement stay closed), and each refresh replaces the last, so a lifted warning lifts.

**Not yet.** Met Office weather warnings need a key (DATA-17). Scotland's flood warnings come from SEPA, which has no matching open feed we've found (DATA-25).

Update (D-064): the gritting routes now come from the council's "Gritting Routes" layer, which its DCAT feed lists under OGL v3 (published 2021-05-27), matched by direction along each edge: 1,648 pavement edges. Main's layer had no published licence and came back about 90 m off the streets. The reason gives the routes' year. The ice costs are unchanged.

Update (D-066): four more feeds sit beside these, none of which closes anything: UKHSA heat and cold health alerts (England), gusts on exposed bridges, air quality, pollen and UV, and the Water of Leith level from SEPA (a partial answer to DATA-25: a level, not a flood warning).

## D-048 Park gates and OpenStreetMap notes

**Decided.** 2026-10-04 (DATA-08).

**Park gates.** A route to a park used to end at the park's middle, which might be a pond or the far side of a fence. OS Open Greenspace (OGL) draws parks as sites with access points (`pnpm build:greenspace`: 153 named sites and 648 pedestrian gates in central Edinburgh, 12 and 73 in Newcastle, 73 and 299 in London). When the destination is a park or garden in our search and sits inside a site (the smallest, so a garden inside a park wins), or shares its name with one nearby, the route ends at the gate nearest the way you're coming, trying up to three, and says which park. OS splits some parks (The Meadows is "West Meadow Park" and "East Meadow Park"), so position matters more than name. A door that fits (D-018) still comes first.

**OpenStreetMap notes.** Open notes are people saying a path is blocked or steps have appeared, but also shop closures and StreetComplete's questions. `pnpm build:osm-notes` keeps those about the ground (paths, steps, kerbs, gates, bridges and so on: 28 in Edinburgh, 23 in London), at build time, so no route's area is sent to a third party (D-009). Up to three within 20 m of the best route are shown with it, dated and marked "Not checked by us". They never change the route: anyone can write a note, and many are stale.

Update (2026-10-05, SMALL-15, ported from the overnight build, PR #36):
- **A park's gate beats a neighbour's door.** The worker tried a building door that fits first for every venue, and every search result except a bus stop is a venue, so a park found by name could end at the door of a building across the road. Of 119 named Edinburgh parks with OS gates, 26 had a door within 50 m that fits a walker, a manual wheelchair or a powerchair (London 7 of 16, Newcastle 0 of 5). Now a park or garden we have gates for skips the door step and ends at its gate (`doorFirst` in `apps/web/src/lib/destination.ts`). Pins and other venues, a café in a park among them, keep door-first. `pnpm a11y` checks the route to a park.
- **Fewer, fresher notes.** A note opened over 3 years ago with no comment since is left out, and so are StreetComplete's questions about a business ("What are the opening hours?", "Is this place still here?") (`scripts/osm-notes-lib.ts`). Rebuilt 2026-10-05: Edinburgh 27 kept, London 21, Newcastle none: one note in each city dropped for its age, and in London a business's own submission (onosm.org) too.
- **The rest counted.** Past the three notes listed with a route, one line counts the others: "2 more places a mapper flagged on this route in OpenStreetMap. Not checked by us."

## D-049 The Toilet Map fills OSM's gaps

**Decided.** 2026-10-04 (DATA-09). OSM knows many public toilets but often not whether they're accessible, need a RADAR key, or when they open. The Great British Public Toilet Map (CC BY 4.0) is exported daily with those facts and the date each was last checked.

**What we do.** `pnpm build:toilets` cuts the export to each city (Edinburgh 62 toilets, 44 accessible; Newcastle 22; London 73). The app merges it into the search index when a city loads (`mergeToiletMap`):
- **Same toilet** (an OSM toilet within 30 m): OSM's own tags win; the Toilet Map only fills what OSM lacks. The place then names both sources.
- **A toilet OSM hasn't mapped** is added, and an accessible one counts for "Accessible toilet at least every…" like any other.
- Each place says "checked" (someone verified it on the ground) or "updated", with the month, so an old record looks old.
- Weekly opening times become OSM opening hours, so "open when you pass" works for them too.
- Credit in each city line: "Toilets: Great British Public Toilet Map, Public Convenience Ltd (CC BY 4.0)".

Update (D-065): where OSM and the Toilet Map disagree on access, the first fact says so before anything else and the toilet doesn't count on routes. A record over 2 years old says it may be out of date, and an added one ranks a little lower in search.

## D-050 Dependency audit in CI, and MapLibre 6

**Decided.** 2026-10-05 (SEC-04). CI runs `pnpm audit --audit-level high` after install: a known high or critical hole in any dependency fails the build. Moderate and low ones are left to Dependabot.

**What the first run found.** A critical hole in MapLibre GL 4.7.1 (its HTML sanitiser could be bypassed, GHSA for versions up to 6.4.0) and two high ones in the PostCSS that Next 15 pins (8.4.31: reading files through source map comments).
- **MapLibre** goes straight to 6.12.0, which also does UPD-02. Version 6 runs its worker as a separate module file, so `copy-graphs.mjs` copies `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` into `public/maplibre/<version>/` and `basemap.ts` points MapLibre at it. Each version has its own folder, so a cached old worker never meets new code. The CSP already allows workers from our own origin.
- MapLibre 6 types its events, so the map's own "refresh" event became a ref holding the latest draw function.
- **PostCSS**: a pnpm override (`next>postcss`) lifts Next's copy to 8.5.28. Next only uses it at build time. Drop the override when Next's own pin passes 8.5.23.
- The local check server serves `.mjs` as JavaScript, as Vercel does; a module worker is refused otherwise.

Update (BLOAT-02, 2026-10-05): CI also runs `pnpm knip` for unused files, exports and dependencies. `knip.json` names the entry points it can't see (build scripts, the service worker). knip 6, not 5: 5 depends on a `braces` with a high advisory and no fix, which the audit would fail.

## D-051 Road scooters go at road speed on roads

**Decided.** 2026-10-05. Tester feedback: a road scooter (class 3) does 8 mph on the road but 4 mph on pavements, and the router used one pace for both.
- A road-legal profile carries `roadSpeedMps`, its carriageway speed: 3.576 m/s (8 mph, the legal limit for class 3) by default. `speedMps` stays the pavement pace, capped by law at 4 mph.
- Road speed applies on street proxies (`street_proxy`), the roads with no separately mapped pavement, which a road scooter drives along. Footways, pavements, pedestrian streets and crossings stay at the pavement pace. Gradient slows both the same way.
- Pace learning learns only the pavement pace: stretches driven at road speed (`NavPlan.roads`) don't count. Time left while navigating uses both speeds.
- **Effect.** Central Edinburgh journeys get 20 to 45% quicker, and routes move onto roads. Marchmont to Leith Walk went from 48% to 91% on roads, with only 7% of the route kept. That fits the law, but some riders keep to pavements or avoid busy roads. Ask them (RES-10) before adding a "prefer pavements" or "avoid busy roads" option.
- **In the editor** (FEAT-18, 2026-10-05): road scooters get "Speed on the road", 4 to 8 mph in half-mph steps. Below 4 mph the road isn't worth using (that's the pavement limit), and 8 mph is the legal top speed.
- **Speed units** (FEAT-18): each device has "Show speeds in: mph or km/h" (`speedUnit`), used for pace and road speed. Scooters default to mph, the unit they're sold and regulated in; everyone else to km/h, as before. Distances follow the same choice (D-074).

## D-052 Live feeds get a time limit

**Decided.** 2026-10-05 (ROADMAP STAB-05). Every live feed already had a fallback for a failure: lifts say "Couldn't get live lift status from TfL", works and floods keep what they had, bus times say they're unavailable, the weather assumes dry and says so. But a feed that hangs never fails, so the fallback never came. "Checking lifts with TfL…" could stay for good, and each refresh added another request that never ended.

- **What we do.** Every live call goes through `getJson` (`packages/live/src/http.ts`): TfL lifts, line and station disruptions, street works and bus arrivals, Environment Agency floods, Open-Meteo, Photon and postcodes.io. It aborts the request when time runs out, counts reading the body against the limit, and holds even for a fetch that ignores its signal.
- **Limits.** 10 s for the feeds (`LIVE_TIMEOUT_MS`): they refresh every few minutes, so a slow answer is better than none, but 10 s is already longer than anyone will watch "Checking…". 6 s for live search, where someone is waiting on the list and the bundled results are already showing.
- **A cancel isn't a failure.** The weather check restarts when the city or leaving time changes. The cancelled check used to land in the same handler as a failure, so "Couldn't check the weather" flashed on every app start in a remembered city. It now waits for a real failure or the limit.
- **Tested.** `getJson` unit tests (`packages/live/test/http.test.ts`), and a `pnpm e2e` journey in London where TfL, Open-Meteo and the Environment Agency never answer: the route still comes, and the weather and lift lines fall back.
- **Not covered.** The Supabase calls for sharing and review (STAB-14). Sharing is off today.

## D-053 Honesty fixes from the overnight build

**Decided.** 2026-10-05. Ported by hand from the overnight build (PR #36) onto main. Each one stops the app saying more than its data supports. Code: `packages/graph/src/council.ts`, `packages/live/src/works.ts`, `packages/live/src/tfl.ts`, `apps/web/src/components/PlaceSearch.tsx`.

- **Council widths and surfaces are inferred** (amends D-046). They cost time and never close a pavement on their own. OSM's own reported width still closes one. On the 91 acceptance journey and preset pairs (`scripts/preset-outcomes.ts`), three Edinburgh routes changed, all by scooter: Causewayside to the museum by road scooter (17.0 to 18.4 minutes, now with no unknowns), and Causewayside to Waverley by scooter (29.5 to 23.4 minutes) and road scooter (29.7 to 25.2 minutes), through pavements that had been closed by a council width.
- **Denied closures don't close.** TfL's street disruption comments are free text. "No footway closed" or "footway closed: not required" used to match the closure words and close the pavement. Now a closure phrase counts only when the words just before and after it don't deny it (`saysClosed`). One plain closure anywhere in the text still closes.
- **Street Manager activities without their free text** (amends D-027). The details field can name addresses, businesses and people. We show the activity type in our own words and the street. Since D-057 the free text is still read, but only for closure words, and the same rule covers the Scottish register.
- **Lift outages grouped by station.** TfL can report two lifts at one station on two messages. Each message was checked alone, so two lifts that between them cut off a line closed nothing. At Canning Town, lifts 1 and 3 are the two ways from the street to the ticket hall: either alone leaves a way, both out cut off the Jubilee line. Now every lift out at a station goes into one search, and the reason quotes each message once.
- **A search result's first fact may take two lines.** On a 390 px phone one line is about 40 characters, so the first fact was often cut off mid-word. It now wraps to two lines before it is cut. Every row, not only long ones, so the list is easy to scan; not three, so the list stays short on a phone.

**Conservative calls.**
- An inferred council surface still counts in full, as an inferred OSM surface does: council setts or flags in ice still close the pavement for wheeled users. Only the width is softened. No preset refuses outright any surface the council layer can name. Every other reader of surface and width (the route's surface mix, the setts warning in navigation, "relax a limit" suggestions) still needs checking against inferred council values; that's a follow-up. Checked in D-062: they all read the edge's attributes, so they see council values as they see OSM's.
- The committed London works file was edited in place rather than rebuilt: rebuilding would also have moved every other date in it.
- The figures here and in D-054 were measured before D-051 (road speed for road scooters) reached this branch. D-051 since changed all six road scooter journeys outside London (Causewayside to the museum now 9.5 minutes); no other preset's outcome moved, and the speed budget's settled nodes are the same.

## D-054 Presets on Inclusive Mobility values: kerbs, credit and "More benches"

**Decided.** 2026-10-05. Richard decided to apply these values (overnight build, PR #36, ported by hand). Updates D-013. Source: DfT, Inclusive Mobility, December 2021, Open Government Licence v3.0: the dropped kerbs paragraph ("preferably flush with the road, but with a maximum 6mm tolerance") and section 3.4. Code: `packages/profile/src/index.ts`, `LOWERED_KERB_CM` in `packages/router/src/cost.ts`, `tradeoffs` in `packages/router/src/router.ts`, `DeviceEditor.tsx`, `DeviceSetup.tsx`.

**What changed.**
- **Manual wheelchair: highest kerb 2 cm to 6 mm**, IM's flush band. Other wheeled presets keep their limits: 6 mm is how a kerb should be built, not what a powerchair or scooter can climb.
- **An unmeasured dropped kerb counts as 6 mm**, not 2 cm (`LOWERED_KERB_CM`). Without this the 6 mm limit shuts out nearly every inferred dropped kerb (D-015): measured on main, the manual wheelchair then had no route on 3 of 7 journeys (Waverley to the Grassmarket, Causewayside to the museum, Parliament Square to Canada Square), and Causewayside to Waverley went from 32 to 63 minutes. "Flush only" (0) still avoids such kerbs. A measured kerb is always held to its measured height. Recorded so the two changes are never split.
- **Kerb limits under 1 cm read in millimetres** ("6 mm"). The plus and minus buttons step to whole centimetres (6 mm goes to 1 cm or to flush).
- **Rest intervals stay as D-013 set them**: walking stick and crutches 50 m, fatigue 100 m, **rollator 300 m**. The overnight build had the rollator at 50 m; Richard confirmed on 2026-10-05 that it keeps 300 m because it has a seat.
- **"More benches" starts from the loosest interval worth offering and tightens once.** The candidates are 8, 6, 4, 3, 2, 1.5 and 1 times the user's interval, and seven-tenths and half of the route's own worst gap, all clearly shorter than that gap (under 85%). It searches the loosest, then the next, at most two searches, and stops early when a search finds nothing. Each search gives up past double the chosen route's cost or 15 minutes more (D-055). The best result is offered.
- **The credits name Inclusive Mobility**, in every city's line.

**Before and after.** All 7 acceptance journeys with all 13 presets, 91 pairs, recorded with `scripts/preset-outcomes.ts` (Monday lunchtime, dry, daylight; each city loaded as the worker loads it, without live data). "Before" is main with D-053.
- **Verdict, time, distance and route:** no change in any of the 91.
- **"More benches":** two changes, both Waverley to the Grassmarket.
  - Walking stick: before, "No way there has mapped benches closer together than this". Now a route whose longest stretch without a bench is 470 m instead of 890 m, 4 minutes longer.
  - Crutches: before, 860 m instead of 1,260 m, 10 minutes longer. Now 890 m instead of 1,260 m, no longer than the chosen route.
- The other 25 rest-preset pairs say "No way there has mapped benches closer together than this", before and after.
- **Speed** (route plus trade-offs for the four rest presets, 28 pairs, three runs each on a busy machine): 13.5 to 15.4 s before, 12.2 to 12.6 s after. Waverley to the Grassmarket by rollator is slower, 1.5 to 1.7 s to 1.7 to 2.2 s, because it now makes two searches where it used to stop at the first success.

**Conservative calls.**
- The overnight build's ladder (8 down to 1 times the interval) alone lost the crutches offer above, and stopped when the looser search found nothing better. So the route's own seven-tenths and half rungs from D-013 stay in the ladder, and a search that finds nothing better moves on to the second rung instead of stopping. Still at most two searches.
- Saved devices keep the numbers they were saved with. Presets are starting points, and nobody's own settings change under them.
- Treating an unmeasured dropped kerb as 6 mm is no more permissive than before for any preset with a limit of 2 cm or more. It is more permissive only for someone who sets 1 cm by hand.

## D-055 "More benches" kept off the verdict's time

**Decided.** 2026-10-05 (overnight build, PR #36, ported by hand). The router worker runs the trade-offs before it posts the verdict, so their time is the verdict's time. Code: `routeWithRests` and `tradeoffs` in `packages/router/src/router.ts`.

**What changed.**
- `routeWithRests` keys its states by number, not by string, and costs each edge and node once per search, not once for every gap bucket that reaches it. It finds the same routes: with this and D-054 together, `scripts/preset-outcomes.ts` gives the same verdict, time, distance and route for all 91 pairs. The "Past more toilets" search shares the code and gains too.
- It takes a cost limit (`maxCost`). "More benches" passes double the chosen route's cost or 15 minutes more, so a search that can't succeed stops instead of exhausting the graph. The overnight build measured 1.25, 1.5 and 2 times and found no speed difference: failing searches run out of reachable benches first.
- At most two searches per plan (D-054).

**Conservative calls.**
- The search stays in the plan reply, not after it. Moving it later would change the worker's messages and the route screen.
- The cost limit is not lowered: that would offer fewer routes for no measurable gain.
- The speed budget's measure of route plus trade-offs for rest presets is SPEED-02's (D-056).

## D-056 A speed budget the tests enforce

**Decided.** 2026-10-05 (SPEED-02, ported from the overnight build, PR #36, by hand). Baseline: [plans/PERF_BASELINE.md](plans/PERF_BASELINE.md), measured on this branch after D-053 to D-055. Test: `scripts/perf-budget.test.ts`, in `pnpm test`. Shared code: `scripts/perf.ts`. Re-measure with `pnpm perf:baseline --write`.

- **Download:** the data a city downloads beside its street graph, search index, buses and base map comes to at most 400 KB compressed. Today: Edinburgh 125 KB (110 KB of it the council layer), London 76 KB, Newcastle 9 KB.
- **Routing work:** nodes settled on the acceptance journeys, with walking, manual wheelchair and visual impairment, may rise at most 10% over the stored baseline. This is exact and the same on every machine. It needed a counter on the router (`Router.settled`): one increment per node, no measurable cost.
- **Wall time:** route time over a fixed yardstick workload may rise at most 10% over the stored baseline, best of four attempts.
- **Rest presets:** route plus trade-offs for rollator and fatigue ("More benches", "Past more toilets"), on the same terms. The worker runs these before it posts the verdict, and `alternatives` never does (D-055).
- **Baseline:** route time normalised 27.56 (rounds 25.98 to 28.90); rest presets 65.75 (63.60 to 68.66); 224,919 nodes settled in Edinburgh, 36,774 in Newcastle, 34,696 in London.

**Conservative calls.**
- Wall time on one machine against a baseline set on another is noisy, and a check that fails at random would teach people to ignore it. So on CI runners (`CI` set) both timing checks print their figure and fail only past 50%. The download and settled-node checks, which don't depend on the machine, hold their line everywhere. A CI baseline from a few weeks of printed figures is SPEED-07.
- The overnight build's check that attribute layers slow routing by at most 10% isn't ported. Main writes the council's values onto the edges when the city loads (D-046), so a search makes no per-edge layer lookup, and there is nothing separate to switch off and time.
- The download budget covers the data beside the graph, not the graph, search index or base map. Those change with every refresh and are already as small as their content allows; the budget is for new sources. Each city's full download is printed in PERF_BASELINE.md.
- Live data (works, floods, lifts, disruptions) is left out of the timed graph, so the figures don't depend on the day the test runs.
- Settled nodes depend on the graph, so a weekly data refresh that rebuilds a graph can trip the 10% check. Then re-baseline on purpose in that pull request, and say so (SPEED-07).

## D-057 Edinburgh's works from the Scottish Road Works Register

**Decided.** 2026-10-05 (DATA-02, ported from the overnight build, PR #36, by hand). Source: [DATA_SURVEY_UK §2 #1](DATA_SURVEY_UK.md). Supersedes the Scotland part of D-027 ("Scotland's register has no open feed"; the overnight build numbered it D-026). Code: `srwrObservations` and `worksStates` in `packages/live/src/works.ts`, `scripts/build-srwr.ts`, `scripts/srwr-extract.py`.

The register's daily disruptions export (OGL v3, no key) is Edinburgh's works source. `pnpm build:srwr` downloads it once (it redirects to a dated zip), keeps City of Edinburgh rows in the area, and writes `data/live/edinburgh-central.works.json` in the same shape as Street Manager's file. The router and the worker use it with no new code path. The weekly data refresh runs it.

What is kept, each as works on the pavement (counted as unknown) unless the register says the footway is closed:
- works entirely on the footway;
- road closures whose words mention the footway, pavement or pedestrians;
- street café permits, picked by licence type, because they are coded "No Obstruction On C/W Or F/W";
- scaffolding, hoardings, cabins, skips, materials and building sites on the footway;
- public events on the footway.

**Our own words only.** Each entry says what it is in our words and the street ("Café tables on the pavement on Grassmarket until 2026-12-30", "Road closed, works on the pavement on North Bridge"). The register's description, its location text and the promoter are read for the closure words and never shown or stored: they name businesses (every café permit is the café's name), addresses and permit numbers. The same rule as Street Manager activities (D-053).

**Conservative calls.**
- Café tables narrow the pavement; they never close it.
- A closure is read only from plain words, with the same denial check as TfL's comments (`saysClosed`): "footway closed", "footway closure", "including footpaths", "footpath diversion", "closed to pedestrians". "Full width" and "C/Way & F/Way" say where the works are, not that people are shut out, so they count as works on the pavement. North Bridge, a road closure since 2018 with "full width, footways and carriageway", is the case in point: Richard confirmed on 2026-10-05 that North Bridge is passable on foot. It stays as works on the pavement (unknown), not closed.
- Early notices are left out: "Potential", and "Advance Planning", the months-ahead notice of major works without firm dates. In the export of 2026-10-05 the area has 360 Advance Planning rows; 259 are the council's "Find and Fix" pavement repairs, one entry per street, each covering the full length of the street from 15 October 2026 to June 2027, though each street's repair takes days. Counted, they made every one of the 65 acceptance journey and preset pairs unsure from 15 October (17 fit today without works). The works come back with firm dates as "Proposed" before they start, and the weekly build picks them up.
- Short jobs stay in. 69 of the 456 entries last a day or less. Leaving them out changed no verdict on the acceptance journeys on 10, 20 October or 1 November, so there is nothing to gain from dropping real works.
- Anything starting more than five weeks after the build is left out; the next weekly build picks it up.
- Multi-part shapes are split into their parts, so works in two places never join up across the streets between them. The app counts each works once.
- The export date comes from the redirect's file name. No date, no build: never the build day in its place.

**What it found** (export of 2026-10-05). 999 rows of the kinds above in the area; 456 entries kept: 307 café footprints, 63 events, 41 road closures with works on the pavement, 31 works on the pavement, 7 building sites, 3 scaffolds, a hoarding, a site cabin, and 2 closing the pavement (both one cycle track, Warriston to Powderhall). On the 65 acceptance pairs (`EDINBURGH_CENTRAL_JOURNEYS`, all 13 presets, dry, midday), 17 fit with no works and 11 with them: the 6 that change are walking (4) and visual impairment (2), past café tables on Grassmarket, West Bow, Cockburn Street, the High Street and Hope Park Terrace, or over North Bridge. In the built app (Playwright at phone size, walking and visual impairment, Waverley to the Grassmarket, St Giles' to Victoria Street, the Grassmarket and Causewayside to the museum), every route already says Unsure without works, from unmapped stretches and entrances. With the file, unknown metres rise by up to 160 m, mostly café tables; with the advance notices counted, as on 16 October, by a further 110 to 260 m.

**Speed.** Matching works to edges now uses a grid of pavement edge middles, so each works looks only at edges near it. On the Edinburgh graph with this file it takes 77 ms instead of 1.5 s, with the same states (checked on all three cities). The file is 27 KB compressed; Edinburgh's data beside the graph comes to 155 KB of the 400 KB budget (D-056).

**Still open.** The register is daily but the refresh is weekly, so new works can be up to a week late (OPEN_ITEMS).

## D-058 A lift out that leaves some platforms step-free counts as unknown, not closed

**Decided.** 2026-10-05 (DATA-29, ported from the overnight build, PR #36, by hand). Amends D-020 and D-053's lift grouping. Code: `liftOutageStates` in `packages/live/src/tfl.ts`, `evaluateEdgeBase` in `packages/router/src/cost.ts`, `explain` in `packages/router/src/router.ts`.

TfL's station layout (DATA-03) tells us, for every lift out at a station, which of a line's platforms can still be reached without steps. Main closed a line's board edge for step-free users whenever any of its platforms was cut off. But a board edge stands for all of the line's platforms at that station, and it can't tell which way you're going: with one lift out, the westbound platform may be fine and the eastbound not.

- **Every platform cut off: closed**, as before.
- **Some platforms only: restricted.** The state says "Lift out of service: step-free to some platforms only" and quotes TfL's message.
- **For someone who needs step-free access, a restricted board edge or street link costs what a station we can't confirm costs**: 15 minutes times (1 minus their uncertainty tolerance), and the route is unknown there, not a fit. Before, a restricted state on these edges cost nothing extra, so a cautious user was sent through it as freely as an open platform. The same now applies to TfL's station disruptions that main already marked restricted ("no step-free access" naming one platform or entrance).
- People who can use stairs or escalators pay nothing.
- An edge already unconfirmed (no step-free data) is charged once, not twice.
- "Why this way?" says it: "North Greenwich, Jubilee line: Lift out of service: step-free to some platforms only: … (TfL, live). Check before you travel." The route card's sources line counts these lines separately from closed platforms. An avoided unknown is no longer called "closed" in the reasons list.

**What it changes.** Of the 76 single lifts in TfL's layout for our 72 stations whose loss changes a line, 46 leave some of its platforms step-free (all the two-lift DLR stations, North Greenwich lifts 1 and 2, Wembley Park, Kingsbury) and now restrict instead of closing; 30 still close. The recorded outages of 2026-10-04 (Canary Wharf, Jubilee line) still close, and the acceptance routes don't change.

**Conservative calls.**
- Restricted, not open: we don't know the direction, so we don't say it fits.
- A line that was already step-free to some platforms only and loses the rest is closed.
- Outages we can't place from the layout still go by TfL's message and close what it names, as before.

## D-059 Your data: a copy, and delete everything

**Decided.** 2026-10-05 (SEC-06, UK GDPR). "Your data", under the trip settings, says what's kept on the phone, gives a copy as one JSON file, and deletes everything in one step.
- **The copy** holds every `causewayside.` key on the phone, backups included. The sign-in tokens are left out: they're credentials, not information about the person.
- **Delete everything** first removes what was shared, by the anonymous id the server knows (photos in the private bucket, flags, reports, notes), then every `causewayside.` key on the phone, then starts the app afresh. If the server can't be reached, nothing is deleted on the phone either, because the sign-in there is the only key to the shared data. It says so and offers to try again.
- **Database:** migration `0006_my_data.sql` lets people read back and delete their own reports and flags, and read and delete their own photos. `db/test/my-data.test.sql` checks someone can delete all of theirs and nobody else's.
- **Not covered:** a photo a reviewer approved is copied to the public bucket. Deleting the note hides it, but the copy stays until a reviewer removes it (OPEN_ITEMS).

## D-060 Saved places stay on the phone

**Decided.** 2026-10-05 (FEAT-04). Home, work or a friend's address says where someone lives and who they visit. Saved places are kept in this phone's storage only, one list per city, like devices (D-009). They are never shared, synced or sent with a note or report. They show in Your data, go in its copy, and go with "Delete everything". Home comes first, then work, then the rest. Saving a place or a name again replaces the old one.

**To revisit** if accounts come back (deferred by Richard): syncing them would need consent, like the profile.

## D-061 When TfL's disruption feeds fail, and when a closure is what's in the way

**Decided.** 2026-10-05 (DATA-30, ported from the overnight build, PR #36, by hand). Builds on D-052 (time limits) and DATA-04. Code: `fetchTflDisruptions`, `holdDisruptions` and `readStationMessage` in `packages/live/src/tfl-disruptions.ts`, the worker's `live` handler, `liveFailedLine` in `apps/web/src/lib/live-status.ts`, `diagnose` in `packages/router/src/router.ts`.

Main fetched line status and station disruptions together and dropped both silently if either failed (`.catch(() => undefined)`), and the worker then cleared every disruption state. So a feed that blinked opened every closed line and station, and nobody was told. A lift feed failure also threw the disruptions away.

- **Each feed on its own.** Lifts, line status and station disruptions are fetched separately, each with D-052's 10-second limit. One failing leaves the others.
- **A failed feed keeps its last good answer for 15 minutes** after that fetch (`DISRUPTION_HOLD_MINUTES`), then it is dropped. A station that had no step-free access five minutes ago doesn't open up because the feed blinked; an answer older than a refresh or two isn't trusted. A failed lift feed leaves the last outages, whose states already expire 15 minutes after their fetch (D-019).
- **The route card says so** when the route rides a train: "Couldn't get live station disruptions from TfL. Check before you travel." (or "line status", or "station and line disruptions"), and with the lift feed, "Couldn't get live lift status or station and line disruptions from TfL." Lift status counts for every route, as before. It says so whenever this refresh failed, held answer or not.
- **"Nothing fits" names the closure.** When a closure cuts the only way (our two London zones are joined only by the Jubilee line), the unconstrained route didn't exist either, so "In the way" was empty and the app said the start and destination "aren't joined up in our map data". Now `diagnose` looks again with `Conditions.ignoreClosures`, which only it uses, and names what's closed in its own few words: "No way there right now. In the way: no service on Jubilee line." When every blocker is a closure the heading is "No way there right now", not "No way there fits your limits": it's today, not their settings.
- **Short words for closures.** TfL's states carry a headline: "No service", "Station closed", "Trains don't stop here", "No step-free access". A loss of step-free access from TfL's feeds says "no step-free access" in "Why this way?" and "In the way", not "lift out of service".
- **Another way in named.** A station message that says there's no step-free access but names another way ("use the entrance on Bank Street", "use Bar station instead") restricts the platforms rather than closing them: unknown, at the unknown-station cost (D-058). "Step-free access is still available" still does nothing, as before.

**Kept from main.** TfL's structured affected stops for line closures, TfL's own validity dates, `mergeLiveStates`, ride refs. Not ported: the overnight build's own reading of line closure text, and its 15-minute cap on TfL's end dates.

**Conservative calls.**
- Held answers expire; a closure from a feed that keeps failing is dropped after 15 minutes, and the card says we couldn't check, rather than keep a closure that may have ended.
- `ignoreClosures` never plans a route we offer; it only finds what to name.
- Escalator notes for everyone, which the overnight build listed under "On this route", waited for that list. Since D-067 TfL's informational station messages are listed under Worth knowing on routes through the station.

## D-062 Council footways matched along each edge, on the British National Grid

**Decided.** 2026-10-05 (DATA-31, ported from the overnight build, PR #36, by hand into main's council layer). Amends D-046. Code: `scripts/council-footways-lib.ts`, `scripts/build-council-footways.ts`, `packages/graph/src/council.ts`.

**What was wrong.** Main asked the council's ArcGIS service for its Adopted Roads polygons in WGS84 and let the server reproject them. Its transformation put them tens of metres off our streets: only 18% of our drawn pavements' points lay within a metre of a council footway polygon. So D-046 matched many edges to a neighbour's footway or a side street's. It also judged each edge by its middle alone, took the narrowest width and roughest surface within 12 m of a street proxy's middle, and dated the layer with the day of the build.

**What we do now.**
- **British National Grid.** The layer comes in BNG and our edges are projected with OSTN15, as the LiDAR is. Now 91% of our drawn pavements' points lie within a metre of a footway polygon.
- **Points along the edge.** Every 5 m, kept 5 m clear of the junctions at its ends (the middle alone for a short edge). A path or pavement drawn as its own line takes the polygon it lies in, or the nearest within 3 m. A street proxy takes the nearest footway polygon within 15 m on each side.
- **Width:** the 20th percentile of the widths found, across both sides, so a narrow stretch or side counts without one sliver deciding. Widths under 0.6 m (drawing slivers at corners) and over 10 m (area-like figures) are dropped.
- **Surface:** setts when they cover a quarter of the points, so a setted stretch isn't outvoted; otherwise the commonest surface when it covers half. "Surface Dressing" (chippings rolled into tar) is now unknown, not asphalt.
- **Under half the points matched gets nothing.**
- **The council's date.** Each layer's date is the one the council publishes in its DCAT feed (Adopted Roads: 2026-10-01), never the build's. A layer missing from the feed, without Open Government Licence v3 there, or without a date stops the build.
- **Credit** now carries the attribution the council's licence asks for: "Copyright City of Edinburgh Council, contains Ordnance Survey data © Crown copyright and database right 2021 and 2026".

**Numbers** (central Edinburgh, 31,750 pavement edges; before is main with D-053):
- Council surfaces on pavement edges: 2,556 before, 12,182 now. 4,370 fill a surface OSM didn't have; 7,812 replace a street proxy's carriageway surface (D-063). 158 are setts.
- Council widths: 6,976 before, 12,069 now; 302 under 0.9 m, 1,060 under 1.2 m. Widths stay inferred (D-053): they cost time and never close a pavement.
- On the 91 acceptance journey and preset pairs (`scripts/preset-outcomes.ts`, with D-063 and D-064 together), every verdict is the same and nine routes moved. Waverley to the Grassmarket: crutches 34.0 to 29.5 minutes, road scooter 19.3 to 18.7, manual wheelchair with a companion 36.1 to 36.3 and pram 25.3 to 25.6 (both with fewer unknown metres), fatigue the same time by other streets. Causewayside to Waverley: scooter 23.4 to 23.1, manual wheelchair with a companion 29.9 to 30.1, pram 28.9 to 29.1. Causewayside to the museum by road scooter 9.6 to 9.8.

**Every reader checked.** Council values are written into the edge's attributes when the city loads, so the route's surface mix, navigation's setts warning, "Avoid setts" and "relax a limit" all see them, as they see OSM's (`packages/router/test/council-readers.test.ts`). A council width never closes a pavement, so it is never offered as a limit to relax. Council "Grass" stays unknown: on a footway polygon it is most likely a verge, and as a surface it would close the pavement for anyone who avoids grass.

**Conservative calls.**
- Council setts still count as setts, inferred or not, as an inferred OSM surface does: a device set to avoid setts won't take them.
- Not ported: the overnight build's general "fill" layer rows and its per-edge layer facts. Main's keyed council file stays.

## D-063 On a street drawn as one line, the council's pavement surface beats the carriageway's

**Decided.** 2026-10-05 by Richard (DATA-22). Amends D-046. Code: `carriagewayOnly` and `applyCouncilFootways` in `packages/graph/src/council.ts`.

Where OSM draws a street as one line (a street proxy), our builder reads the pavement's surface from `sidewalk:*:surface` when it is tagged, and otherwise from the street's own `surface` tag, marked inferred, "carriageway surface; the pavement may differ". That tag describes the road. A setted street with flagged pavements read as setts; a tarmac road with slabbed pavements read as tarmac.

**What we do.** On a street proxy whose OSM surface is only that carriageway guess, the council's pavement surface wins. OSM's `sidewalk:*:surface` still wins over the council, and so does any surface on a pavement or path drawn as its own line. The council's value stays inferred, and the method says what it replaced ("OSM's sett is the carriageway's").

**Numbers.** 10,151 street proxy edges carry only the carriageway's surface; the council replaces it on 7,812, with a different value on 3,044. The commonest: tarmac to paving slabs (1,330), setts to paving slabs (498), setts to tarmac (411), tarmac to concrete (267), setts to concrete (139). 44 tarmac streets become setts.

**What it changes.** People who avoid setts now get the setted Old Town streets whose pavements are flagged or tarmac, and lose the 44 whose pavements are setted. The acceptance routes' changes are counted with D-062's.

## D-064 Gritting routes from the council's licensed layer, matched by direction, dated 2021

**Decided.** 2026-10-05 (DATA-31, ported from the overnight build, PR #36). Amends D-047. Code: `onGrittingRoute` in `scripts/council-footways-lib.ts`, `scripts/build-council-footways.ts`, `applyCouncilFootways`, the gritting reason in `packages/router/src/cost.ts`. Keeps D-047's ice costs.

**The layer.** Main read "Pavement gritting routes (priority 1)" from the council's Transport service (layer 3). That layer isn't in the council's DCAT feed, so it has no published licence, and asked for in WGS84 it came back about 90 m west of the streets: only 22% of its points lay within 3 m of one of our streets. The same 429 lines are in "Gritting Routes" (`Misc/INSPIRE/MapServer/9`, footway priority 1), which the feed lists under Open Government Licence v3, published 2021-05-27. We use that one, in British National Grid (D-062). The build stops if the feed stops listing it as OGL v3 or gives no date.

**Matching.** An edge is on a route when at least 60% of its points (every 5 m, clear of its ends) lie near a route line running the same way, within 30 degrees: within 6 m for a street proxy or a pedestrian street, whose line follows the middle of the street as the council's does, and within 12 m for a pavement or path drawn as its own line, which runs beside it. So a side street or a path crossing the route at a corner doesn't count. Steps and crossings are never marked: steps are rarely gritted, and a crossing is the road.

**Date.** The gritted state carries the routes' own date, and the reason says it: "on a gritting route (council routes from 2021)", "not on a gritting route (council routes from 2021), so it may be icy". Never the build date.

**Numbers.** 1,648 pavement edges (64 km) are on a route, against 1,130 (32 km) before; only 264 are in both, since main's were matched against lines 90 m out. Routes in ice weren't part of the acceptance runs; dry routes don't change.

**Conservative calls.** The council's routes are from 2021 and may have changed. The penalty stays the same either way: a 2021 route is still better evidence than none, and the reason says how old it is.

## D-065 When OSM and the Toilet Map disagree, and when a record is old

**Decided.** 2026-10-05 (SMALL-14, ported from the overnight build, PR #36, by hand into main's `mergeToiletMap`). Amends D-049. Code: `apps/web/src/lib/toiletmap.ts`, `toiletsAlong` in `apps/web/src/lib/toilets.ts`, `Router.addToilets`, `apps/web/src/app/page.tsx`.

Main merged a Toilet Map record into the OSM toilet within 30 m and let OSM's tags win, silently. Where OSM said accessible and the Toilet Map said not, or the other way round, nobody was told, and the route counted OSM's word.

- **Disputes said first.** Where OSM's `wheelchair` tag and the Toilet Map's accessible flag disagree, the toilet's first fact starts "Sources differ: OpenStreetMap says accessible, the Toilet Map says not accessible." It goes first because the search list shows only the first fact (two lines, D-053). The facts after it are still OSM's. "Partly accessible" in OSM against either answer counts as a dispute.
- **Disputed toilets stay off routes.** They aren't sent to the router as stops, and the graph's own toilet within 30 m of one stops counting as accessible, so "Past more toilets" and "an accessible toilet at least every…" don't lean on it. The route's toilet list still shows it, with "Sources differ on access" first, and it doesn't close a gap there either.
- **Old records.** A Toilet Map record last checked or updated over 2 years ago says so in the first fact, after any dispute: "Toilet Map last checked Sep 2021, may be out of date". Only where the record added something; an OSM toilet the Toilet Map adds nothing to says nothing about it. A toilet only the Toilet Map has ranks a little lower in name search when its record is old (3.1 against 2.6, lower first).

**Numbers** (export of 2026-10-04, today's date): Edinburgh 5 disputes (three where OSM says accessible or partly and the Toilet Map disagrees), Newcastle 1, London none. Old records shown as such: Edinburgh 49, Newcastle 15, London 28.

**Conservative calls.**
- Neither source wins a dispute: the toilet counts as unknown on routes, and both views are shown.
- Old Toilet Map toilets still count on routes, as before; only the words and the search order change. Whether an old record should count less on routes is a question for research (OPEN_ITEMS).

## D-066 Heat and cold alerts, gusts, air quality and the Water of Leith

**Decided.** 2026-10-05 (DATA-32, DATA-25 in part; ported from the overnight build, PR #36, by hand into main's structures). Amends D-047. Code: `packages/live/src/health-alerts.ts`, `packages/live/src/sepa.ts`, `packages/live/src/weather.ts`, `weatherCosts` in `packages/router/src/cost.ts`, `explain` in `packages/router/src/router.ts`, `apps/web/src/lib/use-planner.ts`, `apps/web/src/lib/area-status.ts`.

Four open feeds, none needing a key, all open to browsers. Each is fetched with D-052's time limit, in parallel, and never holds up a route: a failure is said quietly in "Where this comes from" ("Couldn't get … from …") and changes nothing else. Every line says its source and time. None of them closes anything.

**UKHSA heat and cold health alerts (England).** From `https://ukhsa-dashboard.data.gov.uk/api/proxy/alerts/v1/heat` and `/cold` (OGL v3), pinned by a test, for the city's region (`ukhsaRegion` in `cities.ts`: London E12000007, North East E12000001; Edinburgh has none, as UKHSA covers England only). Green and yellow change nothing. Amber and red:
- are said on every route, to everyone, with UKHSA's end date: "Amber heat health alert for London until 20 Jul, 08:00 UTC (UKHSA, updated 18 Jul, 08:00 UTC)." The end comes from the region's own record, which also has the last word on the status.
- nudge routes for presets with a rest limit: a stretch with no bench costs a quarter more of its rest cost, and in heat, uncovered ground costs 5% more of its time. A nudge, never a closure.
- count only while in force (the overnight build's follow-up #4): never at or past the end date UKHSA gives, and never outside the season (heat 1 June to 30 September, cold 1 November to 31 March, by the UK date). The list keeps a region's last status for months: on 2026-10-05 the cold list still showed February's. Out of season the app doesn't ask at all. Leaving later, the alert must still be in force when you leave.

**Gusts on exposed bridges.** Open-Meteo's `wind_gusts_10m`: the stronger of now and the next hour, or the forecast hour when leaving later. From 50 km/h (`GUST_BRIDGE_KMH`, about 31 mph), an exposed bridge (15 m or longer, not covered) costs as much again for the presets a gust can push sideways: scooters, manual wheelchairs and lightweight powerchairs (`windSensitive`). A route that still crosses one says "Strong gusts on exposed bridges: up to 62 km/h (Open-Meteo, 5 Oct, 01:00 UTC)." The gust stays when you set the ground yourself.

**Open-Meteo times are UTC.** Asked for UTC, Open-Meteo gives times with no zone ("2026-10-05T01:00"), and `Date.parse` read them as the phone's local time: an hour out in British Summer Time, so a forecast hour could count as rain already fallen. Every time now goes through `utcIso` first, with a test that runs in Europe/London time.

**Air quality, pollen and UV.** From `air-quality-api.open-meteo.com`, which serves the Copernicus Atmosphere Monitoring Service (CAMS) forecast; credited in each city's credit and on each line. Lines only when high: European AQI 60 or more (poor), grass pollen 50 or more, birch or alder 80 or more grains per cubic metre, UV index 6 or more. Area-wide, after the route's own lines; never in routing.

**The Water of Leith (Edinburgh).** SEPA's KiWIS service (OGL v3) gives the level at Murrayfield every 15 minutes. SEPA publishes no level at which the walkway floods, so a line goes on a route only when it uses the Water of Leith Walkway or Path and the level is 1.05 m or above, the lowest peak in SEPA's peaks-over-threshold record for the station since 2015 (a typical level is about 0.5 m). It says it's worth knowing, not a warning. SEPA's flood warnings still have no open feed, so DATA-25 stays open.

**Where the lines go.** Main's route notes ("Why this way?") at first. Since D-067 they are in the "On this route" list, under Worth knowing, with their source and time.

**Conservative calls.** An alert outside its season doesn't count even if UKHSA issued it: UKHSA can issue alerts outside the core seasons, and we would miss those (OPEN_ITEMS). A region's record that doesn't answer leaves an in-season alert counting, with no end date shown. The thresholds (50 km/h, a quarter, 5%, 1.05 m) are guesses to check.

**CSP.** `connect-src` gains `https://ukhsa-dashboard.data.gov.uk`, `https://air-quality-api.open-meteo.com` and `https://timeseries.sepa.org.uk` (D-041). The a11y and e2e servers take their headers from `vercel.json`.

## D-067 More data, same calm

**Decided.** 2026-10-05 (FEAT-19; ported from the overnight build, PR #36, where it was its D-041, by hand into main's structures). Builds on D-035; amends where D-061 and D-066 put their lines. Code: `packages/router/src/on-route.ts`, `stationInfoNotes` in `packages/live/src/tfl-disruptions.ts`, the worker's `plan`, `apps/web/src/lib/on-route.ts`, `apps/web/src/components/OnThisRoute.tsx`, `RoutePanel.tsx`.

The app now knows about works, lift outages, line and station disruptions, floods, council surfaces and widths, gritting, mappers' notes, health alerts, gusts, air quality and the Water of Leith. Shown naively, every route would carry a dozen warnings. The app should know more and look the same.

**Principles**
- **The verdict comes first** (D-035): Fits, Unsure or Doesn't fit, then the time.
- **New data mostly acts through route cost.** A closure closes edges; works on the pavement cost time. The person sees a better route, not a warning.
- **The route card says only what changed the route or needs doing.** A failed live feed ("Couldn't get live lift status from TfL. Check before you travel.") stays there (D-061). A closure the route went round is one line with a count: "Goes round a closure on the way. See On this route." A flood warning area this route passes through is one line too. Nothing else.
- **Everything else goes in one grouped list, "On this route"**, the first of the sections you open, under the route card and Start:
  - **Blocked**: closed for you, so the route went round it;
  - **Slower**: on the route, and may slow you down: works on the pavement (café tables, scaffolding), a station we can't confirm, a flood warning area, and the council's setts or narrow pavement where they add a fifth or more to that stretch's time for this person (setts for a wheelchair, not for someone walking);
  - **Worth knowing**: unmapped stretches, lighting after dark (only for people whose settings avoid unlit streets, D-038), TfL's informational station messages for everyone (a reduced escalator service), boarding with the staff ramp, gritting in ice, OpenStreetMap notes (three, then "N more places a mapper flagged on this route", D-048), and the area lines: a UKHSA alert, gusts on an exposed bridge the route crosses, air quality, pollen and UV when high, the Water of Leith on routes using the walkway (D-066).
- **Every fact is labelled** "Live", "Static data" or "Reported by people", with its source and date, and an end date when the source gives one: "Static data, Scottish Road Works Register, dated 5 Oct 2026, until 31 Mar 2027"; "Live, TfL, at 14:58".
- **Map layers stay off by default.**
- **WCAG 2.2 AA.** A details section whose summary row counts what's inside ("1 blocked, 6 worth knowing", or "Nothing known"); a heading per group with its count for screen readers; a list for the facts; words wherever the eye gets an icon. It opens by itself when something is blocked or slower.

**Blocked comes from two places.** What the explanation says the route avoided, when that was a closure; and one search as if nothing were closed (`closureBlind`, using `Conditions.ignoreClosures`), whose closed edges this route doesn't use. A closure that only sits next to the route is never listed: the route never needed it, so it did not change the route. (The overnight build first listed every closed edge touching the route, which would have put "Goes round a closure" on most routes once a city has a works feed; its fix, 8d9a917, is kept, with a test that closes side edges one at a time.)

**Speed.** The closure-blind search is made at most once per plan, and only when something is closed for this person somewhere in the area (a scan of live states, no search). Every route on show is compared with that one search; none makes its own. The speed budget's "route plus trade-offs" workload now also builds the list, as the worker does; with no live data in it the extra search never runs there, so it times the scan and the list. A unit test counts the searches: none when nothing is closed, one when something is.

**Dates.** A works file's items are dated by the file's export (the register's or Street Manager's), not the build; live feeds by the time they were read. Works carry their end. TfL's line and station disruptions carry an end only when TfL gave a period. Lift outages and flood warnings show none: they last until the next refresh, and that time isn't an end anyone set. An end over a year away is a placeholder and isn't shown.

**What moved out of "Why this way?"** Live closures gone round, a station we can't confirm, health alerts, gusts, air quality, the river and mappers' notes are now only in the list. **What stays in both**: lighting after dark ("Why this way?" also says when every stretch is lit), how much isn't fully mapped (it says it's dashed on the map; the list gives the streets; both use the route summary's measure, so the numbers agree), and boarding with the staff ramp or an unpublished step ("Why this way?" says to check before you travel). Benches, toilets, lifts, moving bridges, setts in total, the steepest part and battery range stay in "Why this way?" only.

**The area's counts** (lifts out across London, line closures, every flood warning over the city, pavement closures nearby) left the route card. They stay under "Where this comes from".

**Not ported.** The overnight build's attribute layers (its D-042) and its per-edge layer facts. Council values come from main's council layer, read off the edge's attributes (D-062); main's live states feed the rest.

**Conservative calls**
- Toilet Map disagreements (D-065) stay in "Accessible toilets", not in the list: they're about stops, not the way.
- An informational TfL message is listed for routes boarding, leaving or passing through that station's entrances, even when it names a platform the route doesn't use: we don't read which platform. Messages naming only lines we don't route are left out.
- Station messages are listed for everyone, with no step-free filter: an escalator note matters to people who don't count as step-free.

## D-068 Boarding the train against each person's limits

**Decided.** 2026-10-05 (DATA-29, ported from the overnight build, PR #36, by hand). Builds on DATA-03. Code: `boardingOf` in `scripts/tfl-station-access.ts`, `PlatformBoarding` in `packages/graph/src/schema.ts`, `applyStationAccess` in `packages/graph/src/transit.ts`, `platformFit` and `boardingReason` in `packages/router/src/cost.ts`, `levelAccessAdvice` in `packages/router/src/boarding.ts`, `describeSegments` and `explain` in `packages/router/src/router.ts`.

Main read the step and gap from platform to train into words only (the largest across a line's platforms), shown in a board edge's source. TfL publishes them per platform in figures, so we can hold them to each person's limits.

- **The data.** For each platform of each line at our 72 stations: the step and the gap in millimetres, smallest and largest along the platform (`MinStep`, `MaxStep`, `MinGap`, `MaxGap`), whether staff put a manual ramp down (`LevelAccessByManualRamp`), where the designated level access is (`LocationOfLevelAccess`, only where `DesignatedLevelAccessPoint` is true), and the direction (`DirectionTowards`, the platform's `FriendlyName`). They sit beside the words in `network.json` (`lines[line].boarding`) and go onto the board edges when the city loads, so a refreshed `network.json` needs no graph rebuild. A figure TfL leaves blank stays blank: **unknown, never level.**
- **The level band.** TfL counts a step of up to 50 mm and a gap of up to 85 mm as level access (`LEVEL_STEP_MM`, `LEVEL_GAP_MM`). Within it a platform fits everyone.
- **Beyond it, against the person.** The largest step is held to the kerb they can manage (never less than the band); the largest gap to their gap limit (`maxGapMm` on the profile, the band when unset). A platform that fits somewhere along its length counts when TfL names its level-access doors. Otherwise the staff ramp is the way on, if TfL lists one, at a cost of 3 minutes (`STAFF_RAMP_S`, a guess) and a note: "Kilburn, Jubilee line: board with the staff ramp, so ask staff (TfL station data)." No figures and no ramp: unknown.
- **All the line's platforms together.** A board edge stands for every platform of its line, and can't tell which way you're going. If every platform is out of reach, the edge closes for that person ("step up to 173 mm, gap up to 100 mm between platform and train"). If some are, or any has no figures, it is unknown and costs what a station we can't confirm costs (15 minutes times (1 minus uncertainty tolerance)), with a note naming the platform.
- **Only for step-free users.** People who can use stairs or escalators aren't judged on the step to the train.
- **Doors in the spoken route.** For someone who needs step-free access, a train leg in the non-visual route says where TfL's level-access doors are, picking the platform by the ride's direction: "Take the Jubilee line from Kingsbury to Canons Park, 2 stops. For level access, board at the 2 centre doors on cars 5 and 6." It also says where to be on the train to get off level, when TfL says.

**What it changes** (feed of 2026-08-03, on the 62 board edges where TfL's layout says the line is step-free to every platform). Westminster, Canary Wharf, Canning Town and North Greenwich's Jubilee platforms are within the band: no change. Three need the staff ramp for every wheeled preset: Kilburn (step up to 140 mm), Stanmore (147 to 173 mm) and Bond Street, whose southbound platform has no figures but a ramp listed. Finchley Road (step up to 163 mm, ramp listed) has no step-free route from the street, so it stays closed to step-free users before the train comes into it. No edge closes or turns unknown on today's data. The acceptance routes and the speed budget's settled nodes don't change. `network.json` grows from 15 KB to 17 KB compressed.

**Conservative calls.**
- Blank figures are unknown even though most such platforms sit where trains are level: TfL didn't measure, so we don't say.
- A location of level access that TfL doesn't mark as designated isn't offered as a door.
- No setting for the gap limit yet: the band holds for everyone until research says what people want to set (OPEN_ITEMS).
- Door advice is in the spoken route only; the visual route card shows the ride, not the doors (OPEN_ITEMS).

## D-069 The sheet lets keyboard focus go

**Date:** 2026-10-05. **Roadmap:** STAB-17, found doing STAB-13.

The bottom sheet is meant to be non-modal (`modal={false}`), so the map stays usable behind it. vaul 1.1.2 takes the prop but never passes it to Radix, so Radix treated the sheet as modal: it trapped focus and hid `<main>` from screen readers. A keyboard or switch user could never reach the city, layers or location buttons.

- `patches/vaul@1.1.2.patch` passes `modal` on to Radix. It's applied by `pnpm install`. Drop it when vaul fixes this upstream.
- Radix still loops Tab inside a non-modal dialog, so `DrawerContent` stops Tab reaching that loop. Tab now runs from the sheet to the map controls and back, in page order.
- The city and layers menus are drawn at the end of the page, above the sheet. Inside the map they opened behind it. They take focus when they open; Escape, Tab or a choice gives it back to their button.
- `pnpm a11y` checks that Tab reaches all three map controls, that `<main>` isn't hidden, and that both menus take and return focus.

## D-070 Every grant by name, row-level security on every table

**Decided.** 2026-10-05 (SEC-16, SEC-19). Fixes [security review](reviews/security-2026-10.md) C1, H1 and M3. Code: `db/migrations/0007_supabase_grants.sql`, `db/test/supabase-stub.sql`, `db/test/grants.test.sql`, `scripts/requirements.txt`, `.github/workflows/data-refresh.yml`.

A new Supabase project grants everything in `public` to `anon` and `authenticated` in full. Our migrations were written and tested on a plain Postgres, where nothing is granted, so they never took those grants back.

- **Grants are explicit.** `anon` and `authenticated` hold only what a migration grants by name. `0007` revokes the rest, and alters the default privileges so new tables, views, sequences and functions in `public` start with nothing. A new table needs its grants written in its own migration, or the app can't see it.
- **Row-level security on every table in `public`.** The graph tables (`source`, `area`, `graph_node`, `graph_edge`, `edge_attribute`, `node_attribute`, `live_state`, `partner_venue_access`) get it with no policies and no grants. The app routes from JSON files and reads none of them, so nobody but the owner and the service role reads or writes them. When routing or live state reads from Supabase, add a `select` policy and grant then, never insert, update or delete.
- **Views run as their owner,** so row-level security on the table underneath doesn't protect them. `note_public` is select only; `edge_attribute_resolved` has no grants.
- **Tests see what production sees.** `scripts/test-db.sh` and CI's `migrations` job apply Supabase's default grants before the migrations. A test checks that every table in `public` has row-level security on, outside extensions.
- **PostGIS's tables.** Supabase puts PostGIS in the `extensions` schema. Where it lands in `public` (CI, or a manual install), `0007` makes its tables read only. Moving it out of `public` in the migrations is SEC-24.
- **The data refresh** checks out without keeping its token (`persist-credentials: false`). `create-pull-request` is given the token itself. Its pip packages are pinned to exact versions with hashes, so a changed package fails the install.

**Conservative calls.**
- The graph tables get no `select` for the public, though the data is open: the app doesn't need it, and a grant is easy to add later.
- The trigger functions lose `execute` for everyone. Triggers still fire; nothing calls them directly.

## D-071 Next.js 16 on webpack, Node 24 in CI

**Decided.** 2026-10-05 (UPD-03, UPD-04). Code: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next-env.d.ts`, `package.json`, `.github/workflows/ci.yml`.

- **Next.js 15.5 to 16.3.** React 19.3 already meets Next 16's minimum, so it stays. `output: "export"`, the service worker, the MapLibre worker in `public/maplibre/` and the routing worker are unchanged.
- **Webpack, not Turbopack.** Next 16 builds with Turbopack by default and refuses a `webpack` config without a flag. Turbopack can't resolve our workspace packages' `.js` import specifiers to their `.ts` files (148 "Module not found" errors), which `extensionAlias` does for webpack. So `next build --webpack` and `next dev --webpack`. Options considered: rewrite every package import without the extension (touches the node scripts that need NodeNext), or a Turbopack alias per file (fragile). Moving to Turbopack is UPD-05.
- **tsconfig.** Next 16 sets `jsx` to `react-jsx` and adds `.next/dev/types`; `next-env.d.ts` now imports the route types. Both written by `next build`.
- **The export.** Same three routes, all static. New files: Next 16's segment prefetch payloads (`__next.*.txt` beside each page) and `_not-found.html`. Webpack chunks renamed; client JavaScript grows from 2.38 MB to 2.46 MB (684 KB to 709 KB gzipped), from Next's own runtime. The service worker registration script is byte for byte the same. Next's own inline flight scripts change shape, as they do every build; the CSP already allows them (`'unsafe-inline'`, until SEC-13). No CSP change.
- **Node 24.** The current Active LTS (Node 26 becomes LTS later in October 2026). CI runs 24 and `engines` says `>=24`. Not strict, so a Node 22 session still installs. The data refresh workflow stays on 22 for now (UPD-07).
- **The speed budget under Node 24.** Routing is 15% to 25% slower against the fixed yardstick under Node 24 than under 22 on the same container, so the local 10% check in `scripts/perf-budget.test.ts` fails on Node 24 and passes on 22. CI only fails past 50%, so it passes. Nodes settled are identical on both. The app routes in the browser's engine, not Node's, so this doesn't touch users. Not re-baselined here: this container's rounds varied by a quarter, too noisy to set a bar. UPD-06.

## D-072 Which city next

**Decided.** 2026-10-05 (DEF-09, DEF-10). Richard chose Glasgow, then Leeds. After those, cities are chosen by size without asking him again: built-up area population, ONS (Census 2021) for England and Wales and NRS for Scotland, largest first, skipping cities already covered (Edinburgh, Newcastle and Gateshead, London).

**The order after Leeds.** ONS built-up area populations, Census 2021:

| Next | City | Built-up area population | Source |
|---|---|---|---|
| 1 | Birmingham | 1,121,375 | [ONS, Towns and cities: characteristics of built-up areas](https://www.ons.gov.uk/peoplepopulationandcommunity/housing/articles/townsandcitiescharacteristicsofbuiltupareasenglandandwales/census2021) |
| 2 | Liverpool | 506,565 | [ONS dataset](https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/townsandcitiescharacteristicsofbuiltupareasenglandandwalescensus2021), as listed in [Wikipedia's table of ONS built-up areas](https://en.wikipedia.org/wiki/List_of_ONS_built-up_areas_in_England_by_population) |
| 3 | Sheffield | 500,535 | Same |
| 4 | Manchester | 470,405 | Same |
| 5 | Bristol | 425,215 | Same |

For comparison, Leeds is 536,280 and Newcastle upon Tyne 286,445. Scotland has nothing in this range: the largest Scottish settlements after Glasgow and Edinburgh are Aberdeen (220,690) and Dundee (158,820), NRS mid-2020 estimates ([NRS](https://nrscotland.gov.uk/publications/population-estimates-for-settlements-and-localities-in-scotland-mid-2020)), both below Bristol.

**What is checked and what isn't.** Birmingham's figure is stated on the ONS page. The others come from Wikipedia's transcription of the ONS dataset, which is a 28 MB spreadsheet this session could not open. Check them against it before work starts on a city. The order has a wide gap after Birmingham and a tight one from Liverpool to Sheffield (6,000 people), so a small correction could swap those two.

**Size, not score.** RES-09's weighted score ([where-next.md](research/where-next.md)) put Sheffield third, but Richard's rule is size, so size decides.

## D-073 Destination first, starting from where you are

**Decided.** 2026-10-06 (FEAT-20). Richard tried production and found the "Starting from?" step odd. Apple Maps and Google Maps ask where you're going first and assume you start where you are. We do the same.

- **First screen.** One "Where to?" search. No From field and no start until a destination is picked. Recents and saved places show a verdict only once the start is known, since a verdict from a start nobody chose would mislead.
- **Then From.** Picking a destination shows From as "Your location" and asks the phone where you are. That is the only time the app asks, apart from the map's "Start from your location" button. It never asks on page load. Keyboard and screen reader focus moves to From. While the phone answers, the route screen says "Finding where you are…" with a way to choose a start instead, because some browsers wait for ever on an unanswered prompt.
- **From stays editable.** Tapping it opens "Where are you starting from?", with the city's start suggested first, then saved places and the city's places, and "Use my location". A start picked by hand stays for the next destination; your location is asked again each time, so it is fresh. Swap works once the start is known.
- **When the phone can't help**, the app says why in plain words and asks "Where are you starting from?": location turned off, no fix in time, a browser with no location, or a position outside the part of the city we have routes for. The city's start is only a suggestion there.
- **Privacy (D-009).** The position stays on the phone: routing runs on the device (D-017), and live search (Photon) is biased towards the city's start, never towards you. `pnpm e2e` shares a location a few tens of metres from each city's start and fails if any request carries it, as it does for the profile.

## D-074 Distances follow the per-device speed choice

**Decided.** 2026-10-06 (ROADMAP SMALL-02). Updates D-051.

A person who reads speeds in mph reads distances in miles, and a person who reads speeds in km/h reads them in kilometres. So there is no second setting: the one per-device choice (`speedUnit`) now covers both, and the editor's control reads "Show speeds and distances in: Miles, mph or Kilometres, km/h". Two settings would let someone pick "mph" and "km", and nobody asked for that. A device that wants a mix can be made later if testers say so (RES).

**One formatter.** `formatDistance(metres, unit, { long?, precise? })` in `@causeway/profile` is the only place a distance becomes text. Everything that shows or says a distance uses it.
- **Kilometres mode.** Metres to the nearest 10 under 1 km ("50 m", never less than 10 m), then "1.4 km", with one decimal under 10 km and none from 10. A whole metre when `precise` (the route in words, "Path, 27 m").
- **Miles mode.** Yards under a quarter of a mile ("110 yd"), then "0.3 miles", "1 mile", "4.3 miles", "12 miles". Yards are to the nearest 10. Miles never show metres or kilometres.
- **Spoken.** `long` gives "50 metres", "110 yards", "1.2 kilometres", "0.4 miles". Hazard text is built once with the short form ("for 30 yd") and `speakableDistances` expands it before it is said.
- **Where it applies.** The route card, the route strip's words, the "not fully mapped" and setts lines, "Closest you can get", the elevation chart's distances along the route, battery range, rest and toilet intervals (setting buttons, route notes and "More benches" or "Past more toilets" trade-offs), "On this route" lines, navigation (distance to the next turn, remaining, "in 50 yards"), hazard warnings, the distance beside each search result (SMALL-18), and the copy-as-text route. The navigation plan carries its unit (`NavPlan.unit`), so the screen and the voice agree.
- **What stays metric.** Heights and climbs ("6 m up overall", "12 m above sea level"), widths ("1.2 m wide"), kerb heights (cm and mm). These are measures of the ground, not journey lengths, and mixing feet in would be a bigger change.
- **Stored values stay as they are.** Rest and toilet intervals are kept in metres and battery range in km. In miles mode they are converted for display (an interval of 500 m reads "0.3 miles"), and the battery range steps in whole miles and is stored as km to a tenth. Nothing about routing changes.
- **Defaults** are D-051's: scooters mph, everyone else km/h. Existing devices keep what they had.

## D-075 Saved places on the map

**Decided.** 2026-10-06 (SMALL-13). Builds on D-060 (saved places stay on the phone) and D-073 (destination first).

- **Real buttons, not map layers.** Each saved place is a DOM marker: a `button` named "Home, saved place", so Tab reaches it and a screen reader reads it. A canvas layer can do neither. The list is at most 12 (D-060), so the cost is small.
- **Always labelled.** The name is shown, with a star, edged in ink on the surface colour. It follows the page's light, dark and high-contrast colours and doesn't depend on colour alone. The label is cut with an ellipsis; the full name is in the button's name.
- **Tapping opens a card in the sheet, not a pin.** "Go here" makes it the destination, with the same flow as any destination (D-073: your location is asked for only then). "Start from here" makes it the start, as a start picked by hand, and keeps any destination. Cancel, or Escape, closes it and returns focus to the marker. The card names the place and, if it differs, the address. Only the action that applies shows: no "Go here" on the destination, no "Start from here" on the start.
- **Left off where the route marks it.** The destination's and a chosen start's own markers are used; the saved marker would sit under them.
- **Not shown while navigating.**
- **Privacy unchanged (D-009, D-060).** Saved places are read from this phone's storage and drawn locally. Nothing is sent.
- **Not done (SMALL-21):** saving a chosen start as a place. Markers under the half-open sheet are D-081.

## D-076 Report what's there: one question per gap, kept on the phone

**Decided.** 2026-10-06 (FEAT-03). The UX assessment left "What we don't know" with no way to say what's actually there.

- **Where.** Each street under "What we don't know" has a "Report what's there" button. Its name says which street, for screen readers ("Report what's there on Eyre Place").
- **Prefilled.** The sheet already knows the street, a point on it (the middle of the first stretch we lack data for) and what's missing. The router's unknowns now carry that point and each missing attribute with its words.
- **One question per gap.** Kerbs, pavement, surface, width, steepness, steps, step-free stations and bus stop seats each get a short question with three or four plain answers. "Kerbs at side roads not mapped" is asked as a kerb question. Live lift status and an operator's scooter rules get no question: nobody can see them from the street. Where no question fits, the note is the answer. One answer is enough to save.
- **Same list as problem reports.** Saved as a report of kind `whats-there`, with the street and each question and answer. So it is in Your data (counted on its own line), in the copy and in Delete everything with no new storage. If sharing is ever on, it goes to triage like any report, with the answers in the detail line (D-030). It never carries the profile (D-009).
- **On the phone only for now.** There is no Causewayside backend yet (DEF-04), so nothing is sent. The answers don't change routes yet: that waits until they can be checked by more than one person (DEF-06).

## D-077 Load order: the graph first, then the search index, then the base map

**Decided.** 2026-10-06 (SPEED-08). On a cold visit everything used to download at once, so the city graph shared the line with 2.7 to 9.2 MB of base map and "Where to?" waited for tiles. Now the order is set:

1. **The graph and the files that join it.** The worker fetches the graph, buses, council footways, OSM notes, greenspace gates, flood areas and the rail network together, then joins them in the same order as before. They used to download one after another once the graph was in, which cost Edinburgh about 2 s of round trips.
2. **The search index**, with the Toilet Map and TfL station toilets, once the graph is ready. Fetching it alongside the graph was measured and was slower: Edinburgh's graph was ready at 9.4 s against 7.5 s, because unzipping the index on the main thread held up the page. Until the index lands, the search box says "Loading places…" and makes no live lookups, as D-025 requires.
3. **The base map**, once the search index is built, or at once if the graph fails, so the map still draws. Once released for a city it stays on.

The trade: the map draws later on a cold visit (Edinburgh 18 s to about 23 s on Fast 4G with 4x CPU, in software). SPEED-09 (range reads) is the fix for that, not a change back. Caching is unchanged (D-023): the service worker still stores every file, and a repeat visit reads them from the cache in this order too. Nothing about routing changes.

## D-079 The base map in byte ranges, filled in whole for offline

**Decided.** 2026-10-07 (SPEED-09). Code: `apps/web/src/lib/basemap-source.ts`, `apps/web/public/sw.js`.

Since D-077 the base map loads last, so on a cold visit the map waited for the whole city file (2.3 to 8.8 MB) after everything else. Now it is read in byte ranges, as PMTiles is designed to be: the header, the directories and the tiles in view, 234 to 430 KB before the map draws. Once the map has drawn and settled, the whole file is fetched in the background and kept in memory, and later reads come from there.

- **Offline is unchanged (D-023).** The background fetch of the whole file is what the service worker caches. A range request is answered from that cached file as a `206` when it is there, offline too, and otherwise goes to the network uncached, since a partial response can't be stored.
- **Fallbacks.** A host that ignores Range (a `200` with the whole file), a range read that fails, and the base64 preview host all use the whole file, as before.
- **A data refresh mid-visit.** Reads carry the file's ETag; if it changes, PMTiles reads the header again rather than mixing two versions.
- **Hosting.** Vercel serves static files in ranges with a strong ETag (checked on the production deployment), so nothing changes there. D-024's "object storage with range requests" for whole-country coverage now needs only a different address.
- **Order (D-077) is unchanged**: graph, then search index, then base map.

The trade: a visit downloads the ranges read first and then the whole file, about 0.2 to 0.4 MB more in all. Edinburgh's map now draws at 20 s, not 27 s, on Fast 4G with 4x CPU; what is left is main-thread work, not download ([numbers](perf/2026-10-07-speed-09.md), SPEED-14).

## D-081 Saved places are framed above the half-open sheet

**Decided.** 2026-10-07 (SMALL-20). Follows D-075: a saved place's marker could sit under the half-open sheet, where a finger can't tap it. Keyboard and screen reader users were never affected.

- **Pan the map, don't list the places.** The two options were framing the map or listing saved places on the home sheet. Framing is the simpler and more robust: it is one small effect in `MapView`, needs no new screen or copy, and fixes the marker itself, which is what the person is looking for. A list would repeat what search already shows under "Saved" and leave the markers unreachable.
- **When.** On a phone only (under 768 px wide), on the home screen only (no route, destination, dropped pin, position or locate focus). It runs when the saved places load, and again when the base map swaps in, because that resets the view to the city's start.
- **What it does.** If any saved place is under the sheet or off the screen, the map fits them all into the top 48% of the screen. It never zooms in, and zooms out at most two steps, so a place far away may still need a pan. Where the places already show, nothing moves.
- **Reduced motion.** With `prefers-reduced-motion` the move is instant.
- **Wide screens.** The sheet is a side panel and covers no marker, so nothing moves.
- **Not done.** Re-framing when the sheet is dragged to another height, or after the person has panned. It only frames when the places load or the city changes.

## D-082 The route screen says who it's for, and shows the facts that matter

**Decided.** 2026-10-08 (FEAT-21, FEAT-22, FEAT-23). From Richard's feedback: with a destination set, nothing showed the mobility mode, nothing said it was a saved, named profile, and nine identical folded rows hid the route's facts. Plan: [ROUTE_PANEL_PROFILES.md](plans/ROUTE_PANEL_PROFILES.md).

- **Who it's for.** Under the destination, a full-width line: "Routes are for **Cherry** · Powerchair, lightweight", the limits that shape a route most (kerbs, slopes, steps) and "Change". It is the same device menu as D-036, so switching, Edit and "Add a device" work as before, and switching re-plans and says what changed. The small button in the destination bar goes on the route screen: one control, not two. In the wide-screen side panel the list opens downwards, so it isn't cut off; on a phone it still opens upwards.
- **Saved profiles are the saved devices (D-034).** No new model or storage: they already had names and their own limits, on the phone only (D-009). An unnamed one shows its type, and its menu offers "Edit and name". On a first visit, before anything is saved, the line still says who the route is for ("Routes are for Manual wheelchair"), and its button reads "Set up" and opens setup. The words say "Routes are for", which is also the start of the button's name, so voice control finds it.
- **At a glance.** After Start, up to five tiles: On this route, Getting in (venues), Steepest, Accessible toilets and Not known. Each has an icon, a label and a value, never colour alone, and opens its section below.
- **Open, not folded.** Getting in, Route in words (first five steps, then "Show all"), Hills (the chart) and Accessible toilets (first three) are shown open, with real headings. "On this route" keeps D-067's rule (opens itself when something is blocked or slower). Still folded: What we don't know (long, with report buttons), Why this way? and Where this comes from.
- **"Unsure" says why.** When the chosen route is Unsure, the card says how much isn't fully mapped and links to What we don't know. When only another way is Unsure, one line under the list explains the word. The "not fully mapped" item left the card's extras line, since this says it.

The trade: the route sheet is longer, because more is shown. The tiles at the top let people jump past it. To check with testers (FEAT-24).


## D-083 User accounts: Supabase Auth, upgraded in place, optional forever

**Proposed.** 2026-10-08 (FEAT-25). Plan only: [plans/USER_ACCOUNTS.md](plans/USER_ACCOUNTS.md). Accounts stay deferred (DEF-07) until Richard says go and answers the plan's open questions.

- **Never required.** Routing, profiles, saved places, reports, notes and votes all keep working without an account. An account adds sync, weight for contributions, and carer sharing. Many disabled people use shared phones or find sign-in hard (D-009's promise stands).
- **Supabase Auth.** We already use it (D-030). Signing up upgrades the anonymous user in place, so the id stays the same and everything done anonymously is already the account's, with no migration. Row-level security keeps working on `auth.uid()`, data stays in London, and there's no new processor. Clerk (best passkeys, but a second user store, a US transfer and heavier first-screen JavaScript) and Auth.js (needs a server; the site is a static export) were weighed and not chosen.
- **Email code first, then passkeys.** A 6-digit code with paste and one-time-code autofill meets WCAG 2.2 SC 3.3.8 for everyone; a passkey is offered straight after and becomes the way back in. The code email also carries a link. No passwords. No CAPTCHA puzzles: Turnstile only in its invisible mode, falling back to the email code. Sign in with Apple and Google only if testers ask (FEAT-33).
- **Sync is encrypted on the phone.** Profiles, saved places, saved routes and any sensitive preference (safe spaces) are encrypted with a per-account key before upload. A passkey with the PRF extension unlocks it; otherwise a recovery key saved as a file or in a password manager. The server can't read health data. Each kind needs its own consent (Art. 9(2)(a) explicit consent for special category data).
- **Pseudonymous by default.** Generated handles, no public profiles or histories, no messaging. Public items show no handle unless the person opts in, and never as a list. Times shown by the day.
- **The contributor id is the Supabase user id,** anonymous or not. Community reports should use it, so upgrading carries reports and votes with it. Weight comes from one function, `contributor_weight()`: anonymous 0.25, verified 0.5, established 1.0, trusted 1.5 at most, earned from independent agreement, not volume.
- **Build-time flags** (`NEXT_PUBLIC_ACCOUNTS` off, invite or on, and one per later phase), backed by a database allow list during the invite stage. Nothing goes live before the DPIA (SEC-10).
