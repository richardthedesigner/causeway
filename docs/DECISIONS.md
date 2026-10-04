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

## D-010 Heavy jobs: GitHub Actions for Phase 0 and 1, then Fly.io or Cloud Run workers

**Decided.** Graph builds, LiDAR sampling and imagery inference do not run in Vercel functions. Phase 0 and Phase 1 run builds as scheduled GitHub Actions jobs, which is enough for three cities rebuilt nightly. Minutely OSM diffs and Mapillary inference move to a container worker (Fly.io Machines or Cloud Run jobs) writing to Supabase PostGIS. Reconsider at Phase 3.

## D-011 Weather: Open-Meteo in development, Met Office DataHub for production

**Decided.** Open-Meteo's free API is non-commercial only. If Causewayside is a product (Q4), production uses Met Office DataHub (site-specific) or a paid Open-Meteo plan. The cost model already takes `wet` and `ice` conditions.

## D-012 Phase 0 snapshot data source: OSM API `/map`

**Decided**, temporary. Overpass and Geofabrik were unreachable from the build container. The OSM API is fine for a small bbox but must not be used for city builds (OSMF API usage policy).

**Update 2026-10-04 (Phase 1):** city builds read the weekly BBBike Edinburgh extract (PBF). `scripts/osm-extract.py` (pyosmium) cuts a pedestrian-relevant bbox to OSM XML, and all tag interpretation stays in TypeScript. Geofabrik plus minutely diffs from a worker replaces this when the worker exists (D-010).

## D-013 Unknown-risk weights and preset thresholds are placeholders

**Decided**, explicitly provisional. The presets cite Inclusive Mobility (2021) where it applies (5% preferred, 8% absolute over short distances; cross-fall 2.5%) and are otherwise judgement. The unknown-risk weights (60 s per 100 m for unknown gradient, 120 s per unmapped kerb at a crossing) are guesses. Both are calibrated in Phase 2 with disabled testers in each city. Every number lives in one place (`packages/profile`, `packages/router/src/cost.ts`).

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

## D-021 Movable bridges

**Decided.** 2026-10-04. OSM puts `bridge:movable` on the bridge outline (`man_made=bridge`), not on the decks. Decks inside a movable outline inherit it. Routes that cross one say so: "Crosses Millenium Bridge, a tilting bridge. It closes for a few minutes while it moves for boats. We don't have its timetable yet." (The deck's own OSM name is used as tagged, misspelling included.) Gateshead Millennium Bridge tilt times are not available as open data that we have found; adding them is a Richard-led request to Gateshead Council.

## D-022 Reports stay on the device until there's a backend decision

**Superseded by D-030** (2026-10-04): Richard decided to share notes and send reports. **Decided** (interim). 2026-10-04. Problem reports (kind, location, time, optional note and photo) are saved on the device. Sending them anywhere means storing location data from members of the public and running moderation and corroboration, so that waits for Richard's call on the backend (Supabase, D-009 privacy rules). Reports never include the mobility profile. The data shape (`apps/web/src/lib/reports.ts`) matches the `report` table in `db/migrations/0001_graph.sql`.

## D-023 Offline on the web

**Decided.** 2026-10-04. A service worker caches the app and every city graph it has loaded. Because routing runs on the device (D-017), a loaded city keeps working with no signal. It is registered only on https and not inside embedded previews. The native app (D-004) will ship city packs as downloads instead.

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

Next adapters, in order of value: Overture places (more venues and addresses; release 2026-09-23.1 is on S3), National Rail Knowledgebase stations (step-free access and staffing; needs a free key), Met Office DataHub (warnings; key), Mapillary (kerb and surface detections; key), accessibility.cloud (venue accessibility; key, and its own sources' licences). Keys stay server-side once there is a backend; until then these run in the build.

## D-028 Overture fills search gaps; OSM stays the source of access facts

**Decided.** 2026-10-04. OSM has the access tags but misses many venues (Newcastle: 2,214 OSM places against 5,376 in Overture). Overture places are added to each city's search index when they are confident (0.7 and over), open, somewhere people go, and not already in OSM under a similar name within 75 m (word overlap, "&" read as "and", and spelling variants within 40 m). They show with their category and address and no access line, and an "accessible" search never lists them, because nothing says they are. When names tie, OSM ranks first.

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
