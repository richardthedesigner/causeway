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

## D-010 Heavy jobs: GitHub Actions for Phase 0 and 1, then Fly.io or Cloud Run workers

**Decided.** Graph builds, LiDAR sampling and imagery inference do not run in Vercel functions. Phase 0 and Phase 1 run builds as scheduled GitHub Actions jobs, which is enough for three cities rebuilt nightly. Minutely OSM diffs and Mapillary inference move to a container worker (Fly.io Machines or Cloud Run jobs) writing to Supabase PostGIS. Reconsider at Phase 3.

## D-011 Weather: Open-Meteo in development, Met Office DataHub for production

**Decided.** Open-Meteo's free API is non-commercial only. If Causewayside is a product (Q4), production uses Met Office DataHub (site-specific) or a paid Open-Meteo plan. The cost model already takes `wet` and `ice` conditions.

## D-012 Phase 0 snapshot data source: OSM API `/map`

**Decided**, temporary. Overpass and Geofabrik were unreachable from the build container. The OSM API is fine for a small bbox but must not be used for city builds (OSMF API usage policy).

**Update 2026-10-04 (Phase 1):** city builds read the weekly BBBike Edinburgh extract (PBF). `scripts/osm-extract.py` (pyosmium) cuts a pedestrian-relevant bbox to OSM XML, and all tag interpretation stays in TypeScript. Geofabrik plus minutely diffs from a worker replaces this when the worker exists (D-010).

## D-013 Unknown-risk weights and preset thresholds are placeholders

**Decided**, explicitly provisional. The presets cite Inclusive Mobility (2021) where it applies (5% preferred, 8% absolute over short distances; cross-fall 2.5%) and are otherwise judgement.

Update (DATA-10): rest distances now follow Inclusive Mobility (2021) section 3.4, "Recommended distance limit without a rest": walking stick and crutches 50 m (were 500 and 400), fatigue or chronic illness 100 m, IM's figure for people with a mobility impairment and no stick (was 250). IM's 150 m for wheelchair users and people with a vision impairment isn't used: they can stop anywhere, so a bench isn't the point. The rollator keeps 300 m: it has a seat (confirmed by Richard, 2026-10-05, D-053). Mapped benches rarely come every 50 m, so "More benches" also tries half and seven-tenths of the route's longest gap, and offers the best it finds with the real figure. *Since D-053 and D-054 it starts from the loosest of these and makes at most two searches.*
- Kerbs stay as they were. IM's "flush, with a maximum 6 mm tolerance" is how a dropped kerb should be built, not what someone can manage, and real lowered kerbs often aren't. So an OSM `lowered` kerb with no height still counts as 2 cm. *Superseded by D-053: Richard decided to apply IM's 6 mm to the manual wheelchair, and an unmeasured dropped kerb now counts as 6 mm.*
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
- **Lift outages** are joined on `LiftUniqueId`: a line is closed only if the lifts out cut every step-free route to its platforms. A lift outage on the District line at Westminster no longer touches the Jubilee line. Stations without TfL station data fall back to reading the message, as before. Every lift out at a station counts together, even when TfL sends them as separate messages (D-052).
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

First use: pavement works. Street Manager (England, OGL) permits that close the footway close those pavement edges for everyone until the works' end date; works on the footway that don't close it, including a temporary walkway in the road, are "degraded" and counted as unknown; carriageway-only works are left out. In London TfL street disruptions that mention the pavement top this up live every 5 minutes. The build reads Street Manager's monthly archive (`pnpm build:works`, 1 GB, about a minute); production should subscribe to Street Manager's live notifications (free, needs registering an endpoint) through the same adapter. Scotland's register (SRWR) has no open feed: Edinburgh says "No open roadworks feed here yet" rather than implying there are none.

Update (DATA-05): the build also reads Street Manager's activity archive (`activity/YYYY/MM.zip`, about 12 MB a month, same bucket, OGL): skips, scaffolding, hoardings, cranes and mobile platforms, events and other non-works licences. Only those on the footway or a footpath are kept. The archive doesn't say whether the pavement is closed, so each one is "on the pavement" and counted as unknown, never closed. With no end time given, an activity runs to the end of its last day. September 2026 added 9 in Newcastle and 5 in London.

Update (D-052): activities are described in our own words and the street name only ("Scaffolding on the pavement"). The record's free-text details can name addresses, businesses and people, so they are never shown. The committed London file had three "(Impact Area)" and "(Bridge maintenance works)" endings; they were removed. TfL's street comments close a pavement only when no word around the closure phrase denies it (`saysClosed`).

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

When there is nothing to compare with, it builds. Once DEP-01 makes `main` the production branch, the `main` rule goes and the mirror branch gets it instead.

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

Update (D-052): the council's surface and width are now written as inferred, not reported. The council records the whole footway polygon, matched to our edge by shape, and its width is the full width, not the clear width past bins and posts. As reported values, narrow council widths closed pavements outright for wheelchair users (231 edges under 0.9 m, 700 under 1.2 m). As inferred values they cost time and say "about", and never close a pavement on their own.


## D-047 Ice, gritting and floods

**Decided.** 2026-10-04 (DATA-07). Two kinds of weather danger the ground itself can't show: an icy pavement nobody has gritted, and a riverside path under a flood warning.

**Gritting (Edinburgh).** The council's priority-1 pavement gritting routes (OGL, 55 km in the central area) go into the council layer (D-046): 1,130 pavement edges are on a route. With that data, every pavement is known to be on a route or not (`gritted`). In ice, a pavement off the routes costs 100% more time for wheelchair users and 50% more for everyone else, and a route on them says "on a gritting route". The steep and sett exclusions in ice stay as they were. Both figures are guesses for testing (RES-01). Newcastle and London have no open pavement gritting data yet, so nothing changes there.

**Floods (England).** `pnpm build:floods` maps each Environment Agency flood area (OGL) to the walking edges inside it: 4 areas over our Newcastle paths, 9 in London, where the tidal Thames areas cover whole districts. The app fetches the warnings in force every 10 minutes (`/flood-monitoring/id/floods`, keyless):
- **Severe Flood Warning:** the paths inside are closed.
- **Flood Warning:** they count as unknown ("may be flooded").
- **Flood Alert:** named in the route panel only. Alerts are common on the tidal Thames, and flagging whole districts would bury the routes in unknowns.
- A flood state never weakens one already there (works closing a pavement stay closed), and each refresh replaces the last, so a lifted warning lifts.

**Not yet.** Met Office weather warnings need a key (DATA-17). Scotland's flood warnings come from SEPA, which has no matching open feed we've found (DATA-25).

## D-048 Park gates and OpenStreetMap notes

**Decided.** 2026-10-04 (DATA-08).

**Park gates.** A route to a park used to end at the park's middle, which might be a pond or the far side of a fence. OS Open Greenspace (OGL) draws parks as sites with access points (`pnpm build:greenspace`: 153 named sites and 648 pedestrian gates in central Edinburgh, 12 and 73 in Newcastle, 73 and 299 in London). When the destination is a park or garden in our search and sits inside a site (the smallest, so a garden inside a park wins), or shares its name with one nearby, the route ends at the gate nearest the way you're coming, trying up to three, and says which park. OS splits some parks (The Meadows is "West Meadow Park" and "East Meadow Park"), so position matters more than name. A door that fits (D-018) still comes first.

**OpenStreetMap notes.** Open notes are people saying a path is blocked or steps have appeared, but also shop closures and StreetComplete's questions. `pnpm build:osm-notes` keeps those about the ground (paths, steps, kerbs, gates, bridges and so on: 28 in Edinburgh, 23 in London), at build time, so no route's area is sent to a third party (D-009). Up to three within 20 m of the best route are shown with it, dated and marked "Not checked by us". They never change the route: anyone can write a note, and many are stale.

## D-049 The Toilet Map fills OSM's gaps

**Decided.** 2026-10-04 (DATA-09). OSM knows many public toilets but often not whether they're accessible, need a RADAR key, or when they open. The Great British Public Toilet Map (CC BY 4.0) is exported daily with those facts and the date each was last checked.

**What we do.** `pnpm build:toilets` cuts the export to each city (Edinburgh 62 toilets, 44 accessible; Newcastle 22; London 73). The app merges it into the search index when a city loads (`mergeToiletMap`):
- **Same toilet** (an OSM toilet within 30 m): OSM's own tags win; the Toilet Map only fills what OSM lacks. The place then names both sources.
- **A toilet OSM hasn't mapped** is added, and an accessible one counts for "Accessible toilet at least every…" like any other.
- Each place says "checked" (someone verified it on the ground) or "updated", with the month, so an old record looks old.
- Weekly opening times become OSM opening hours, so "open when you pass" works for them too.
- Credit in each city line: "Toilets: Great British Public Toilet Map, Public Convenience Ltd (CC BY 4.0)".

## D-050 Dependency audit in CI, and MapLibre 6

**Decided.** 2026-10-05 (SEC-04). CI runs `pnpm audit --audit-level high` after install: a known high or critical hole in any dependency fails the build. Moderate and low ones are left to Dependabot.

**What the first run found.** A critical hole in MapLibre GL 4.7.1 (its HTML sanitiser could be bypassed, GHSA for versions up to 6.4.0) and two high ones in the PostCSS that Next 15 pins (8.4.31: reading files through source map comments).
- **MapLibre** goes straight to 6.12.0, which also does UPD-02. Version 6 runs its worker as a separate module file, so `copy-graphs.mjs` copies `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` into `public/maplibre/<version>/` and `basemap.ts` points MapLibre at it. Each version has its own folder, so a cached old worker never meets new code. The CSP already allows workers from our own origin.
- MapLibre 6 types its events, so the map's own "refresh" event became a ref holding the latest draw function.
- **PostCSS**: a pnpm override (`next>postcss`) lifts Next's copy to 8.5.28. Next only uses it at build time. Drop the override when Next's own pin passes 8.5.23.
- The local check server serves `.mjs` as JavaScript, as Vercel does; a module worker is refused otherwise.

## D-052 Honesty fixes from the overnight build

**Decided.** 2026-10-05. Ported by hand from the overnight build (PR #36) onto main. Each one stops the app saying more than its data supports. Code: `packages/graph/src/council.ts`, `packages/live/src/works.ts`, `packages/live/src/tfl.ts`, `apps/web/src/components/PlaceSearch.tsx`.

- **Council widths and surfaces are inferred** (amends D-046). They cost time and never close a pavement on their own. OSM's own reported width still closes one. On the 91 acceptance journey and preset pairs (`scripts/preset-outcomes.ts`), three Edinburgh routes changed, all by scooter: Causewayside to the museum by road scooter (17.0 to 18.4 minutes, now with no unknowns), and Causewayside to Waverley by scooter (29.5 to 23.4 minutes) and road scooter (29.7 to 25.2 minutes), through pavements that had been closed by a council width.
- **Denied closures don't close.** TfL's street disruption comments are free text. "No footway closed" or "footway closed: not required" used to match the closure words and close the pavement. Now a closure phrase counts only when the words just before and after it don't deny it (`saysClosed`). One plain closure anywhere in the text still closes.
- **Street Manager activities without their free text** (amends D-027). The details field can name addresses, businesses and people. We show the activity type in our own words and the street.
- **Lift outages grouped by station.** TfL can report two lifts at one station on two messages. Each message was checked alone, so two lifts that between them cut off a line closed nothing. At Canning Town, lifts 1 and 3 are the two ways from the street to the ticket hall: either alone leaves a way, both out cut off the Jubilee line. Now every lift out at a station goes into one search, and the reason quotes each message once.
- **A search result's first fact may take two lines.** On a 390 px phone one line is about 40 characters, so the first fact was often cut off mid-word. It now wraps to two lines before it is cut. Every row, not only long ones, so the list is easy to scan; not three, so the list stays short on a phone.

**Conservative calls.**
- An inferred council surface still counts in full, as an inferred OSM surface does: council setts or flags in ice still close the pavement for wheeled users. Only the width is softened. No preset refuses outright any surface the council layer can name. Every other reader of surface and width (the route's surface mix, the setts warning in navigation, "relax a limit" suggestions) still needs checking against inferred council values; that's a follow-up.
- The committed London works file was edited in place rather than rebuilt: rebuilding would also have moved every other date in it.

## D-053 Presets on Inclusive Mobility values: kerbs, credit and "More benches"

**Decided.** 2026-10-05. Richard decided to apply these values (overnight build, PR #36, ported by hand). Updates D-013. Source: DfT, Inclusive Mobility, December 2021, Open Government Licence v3.0: the dropped kerbs paragraph ("preferably flush with the road, but with a maximum 6mm tolerance") and section 3.4. Code: `packages/profile/src/index.ts`, `LOWERED_KERB_CM` in `packages/router/src/cost.ts`, `tradeoffs` in `packages/router/src/router.ts`, `DeviceEditor.tsx`, `DeviceSetup.tsx`.

**What changed.**
- **Manual wheelchair: highest kerb 2 cm to 6 mm**, IM's flush band. Other wheeled presets keep their limits: 6 mm is how a kerb should be built, not what a powerchair or scooter can climb.
- **An unmeasured dropped kerb counts as 6 mm**, not 2 cm (`LOWERED_KERB_CM`). Without this the 6 mm limit shuts out nearly every inferred dropped kerb (D-015): measured on main, the manual wheelchair then had no route on 3 of 7 journeys (Waverley to the Grassmarket, Causewayside to the museum, Parliament Square to Canada Square), and Causewayside to Waverley went from 32 to 63 minutes. "Flush only" (0) still avoids such kerbs. A measured kerb is always held to its measured height. Recorded so the two changes are never split.
- **Kerb limits under 1 cm read in millimetres** ("6 mm"). The plus and minus buttons step to whole centimetres (6 mm goes to 1 cm or to flush).
- **Rest intervals stay as D-013 set them**: walking stick and crutches 50 m, fatigue 100 m, **rollator 300 m**. The overnight build had the rollator at 50 m; Richard confirmed on 2026-10-05 that it keeps 300 m because it has a seat.
- **"More benches" starts from the loosest interval worth offering and tightens once.** The candidates are 8, 6, 4, 3, 2, 1.5 and 1 times the user's interval, and seven-tenths and half of the route's own worst gap, all clearly shorter than that gap (under 85%). It searches the loosest, then the next, at most two searches, and stops early when a search finds nothing. Each search gives up past double the chosen route's cost or 15 minutes more (D-054). The best result is offered.
- **The credits name Inclusive Mobility**, in every city's line.

**Before and after.** All 7 acceptance journeys with all 13 presets, 91 pairs, recorded with `scripts/preset-outcomes.ts` (Monday lunchtime, dry, daylight; each city loaded as the worker loads it, without live data). "Before" is main with D-052.
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

## D-054 "More benches" kept off the verdict's time

**Decided.** 2026-10-05 (overnight build, PR #36, ported by hand). The router worker runs the trade-offs before it posts the verdict, so their time is the verdict's time. Code: `routeWithRests` and `tradeoffs` in `packages/router/src/router.ts`.

**What changed.**
- `routeWithRests` keys its states by number, not by string, and costs each edge and node once per search, not once for every gap bucket that reaches it. It finds the same routes: with this and D-053 together, `scripts/preset-outcomes.ts` gives the same verdict, time, distance and route for all 91 pairs. The "Past more toilets" search shares the code and gains too.
- It takes a cost limit (`maxCost`). "More benches" passes double the chosen route's cost or 15 minutes more, so a search that can't succeed stops instead of exhausting the graph. The overnight build measured 1.25, 1.5 and 2 times and found no speed difference: failing searches run out of reachable benches first.
- At most two searches per plan (D-053).

**Conservative calls.**
- The search stays in the plan reply, not after it. Moving it later would change the worker's messages and the route screen.
- The cost limit is not lowered: that would offer fewer routes for no measurable gain.
- The speed budget's measure of route plus trade-offs for rest presets is SPEED-02's (D-055).

## D-055 A speed budget the tests enforce

**Decided.** 2026-10-05 (SPEED-02, ported from the overnight build, PR #36, by hand). Baseline: [plans/PERF_BASELINE.md](plans/PERF_BASELINE.md), measured on this branch after D-052 to D-054. Test: `scripts/perf-budget.test.ts`, in `pnpm test`. Shared code: `scripts/perf.ts`. Re-measure with `pnpm perf:baseline --write`.

- **Download:** the data a city downloads beside its street graph, search index, buses and base map comes to at most 400 KB compressed. Today: Edinburgh 125 KB (110 KB of it the council layer), London 76 KB, Newcastle 9 KB.
- **Routing work:** nodes settled on the acceptance journeys, with walking, manual wheelchair and visual impairment, may rise at most 10% over the stored baseline. This is exact and the same on every machine. It needed a counter on the router (`Router.settled`): one increment per node, no measurable cost.
- **Wall time:** route time over a fixed yardstick workload may rise at most 10% over the stored baseline, best of four attempts.
- **Rest presets:** route plus trade-offs for rollator and fatigue ("More benches", "Past more toilets"), on the same terms. The worker runs these before it posts the verdict, and `alternatives` never does (D-054).
- **Baseline:** route time normalised 27.56 (rounds 25.98 to 28.90); rest presets 65.75 (63.60 to 68.66); 224,919 nodes settled in Edinburgh, 36,774 in Newcastle, 34,696 in London.

**Conservative calls.**
- Wall time on one machine against a baseline set on another is noisy, and a check that fails at random would teach people to ignore it. So on CI runners (`CI` set) both timing checks print their figure and fail only past 50%. The download and settled-node checks, which don't depend on the machine, hold their line everywhere. A CI baseline from a few weeks of printed figures is SPEED-07.
- The overnight build's check that attribute layers slow routing by at most 10% isn't ported. Main writes the council's values onto the edges when the city loads (D-046), so a search makes no per-edge layer lookup, and there is nothing separate to switch off and time.
- The download budget covers the data beside the graph, not the graph, search index or base map. Those change with every refresh and are already as small as their content allows; the budget is for new sources. Each city's full download is printed in PERF_BASELINE.md.
- Live data (works, floods, lifts, disruptions) is left out of the timed graph, so the figures don't depend on the day the test runs.
- Settled nodes depend on the graph, so a weekly data refresh that rebuilds a graph can trip the 10% check. Then re-baseline on purpose in that pull request, and say so (SPEED-07).

