# Map layers

FEAT-49, 2026-10-09. Richard: "I think we should allow users to toggle more controls of what's shown on the map. Slopes is good, but what else can we give them?"

This plan lists what a mobility-impaired user would want to switch on, what data we have or can get for each, and how the layers menu works. The first version of the menu is built (see **What's built**). The rest is in the roadmap, in the order below. Decision: D-086.

Section numbers (§) refer to the [UK data survey](../DATA_SURVEY_UK.md). Counts for our graphs are from the committed snapshots in `data/snapshots/` on 2026-10-09; Edinburgh's widths and setts also come from the council footway layer, joined when the city loads (DATA-06).

## Candidate layers

Cost: **S** an hour or two, **M** about a day, **L** several days. Value is for the people Causewayside is for: wheelchair, scooter and pram users, people who walk with an aid or tire, and people with low vision.

| Layer | Source | UK coverage and quality | Cost | Value | Verdict |
|---|---|---|---|---|---|
| **Slopes** | LiDAR (SRSP Phase 5, EA 1 m), our own build (§1) | Gradient known on 92% of Edinburgh's network by length, 89% Newcastle, 78% London | Built | High | Built (was the only layer) |
| **Steps and stairs** | OSM `highway=steps`, `step_count` (39,143 GB ways tagged with a count, §11) | Good: 1,735 flights in central Edinburgh, 238 Newcastle, 259 London | Built | High | Built: now a switch, was always on |
| **Rough surfaces** (setts, cobbles, gravel, grass) | OSM `surface`, `smoothness` (142,150 GB ways, §11); Edinburgh council footways: 2,639 setts and flags (§2 #5) | Surface known on 77% of Edinburgh by length, 62% Newcastle, 75% London. 165 km rough in Edinburgh. Caveat: some setts are the carriageway's, and the pavement beside may be smoother (the graph says so) | Built | High | Built |
| **Narrow pavements** | Edinburgh council footway widths (§2 #5); OSM `width` (120,538 GB, §11) | **Thin.** Width known on 7% of Edinburgh's network by length (17 km under 1.5 m), about 1% Newcastle, none in our London zone. Southwark, LBHF and RBKC widths need permission (§3, DATA-14) | Built | Medium now, high once widths arrive | Built, labelled "where the width is mapped" |
| **Dropped kerbs, and raised ones** | OSM `kerb` nodes (154,597 in GB but only 345 with a height, §11) | 1,107 kerbs typed in central Edinburgh (867 lowered, 169 flush, 41 raised), 246 Newcastle, 312 London. Most crossings have no kerb mapped. No open dropped-kerb register anywhere (§10); RBKC has 4,040 but no licence (§11); Edinburgh's 39,642 kerb lines need permission (§3, DATA-12) | Built | High | Built, labelled "where they're mapped" |
| **Missing dropped kerbs** | Community reports, "No dropped kerb" (FEAT-35) | As many as people report. Confirmed ones already close edges | Built | High | In the reports layer already |
| **Accessible toilets** | OSM, Toilet Map daily export (6,656 accessible in UK, DATA-09), TfL station toilets (DATA-23) | Good: 62 in Edinburgh, 22 Newcastle, 73 London from the Toilet Map alone | Built | High | Built: city-wide; before, only along a route |
| **Changing Places** | No licensed source in the pilots (§9). OSM's `changing_places` is used once in GB (§11). Open elsewhere: Wales national toilet map (50), Sport England (1,430 sites), Bristol, Leeds (§2, §4.4) | **None we can use in the pilots** | M (after a source) | High | Blocked: FEAT-06 |
| **Benches and rest spots** | OSM `amenity=bench`; OpenBenches (CC BY-SA, Edinburgh 918, §4.4); York seats with arms and backs; Spatial Hub street furniture (free key) | 1,401 benches in central Edinburgh's graph, 350 Newcastle, 274 London. Arms and back mostly unmapped | Built | High for rest limits | Built. Seat details: FEAT-57 |
| **Step-free stations, lifts and lift outages** | TfL station data and live lift outages (DATA-03, D-020); Waverley lifts by hand (§4.3); Metro lifts wait on Nexus (DATA-19) | London: good and live. Edinburgh: one station, by hand. Newcastle: no lift data | M | High | **FEAT-50** |
| **Works on the pavement** (roadworks, scaffolding, café tables, skips) | SRWR (Edinburgh, daily, 456 entries); Street Manager archive (England, monthly); TfL street disruptions (live) (DATA-02, DATA-05) | Edinburgh good. Newcastle and London thin from the archive (9 and 5 on the pavement); London topped up live | S | High | **FEAT-51** |
| **Crossings with tactile paving, beeping signals or cones** | OSM `crossing`, `tactile_paving` (377,997 GB), `traffic_signals:sound` (18,726) (§11); Edinburgh council crossing flags need permission (§3) | Edinburgh 1,279 crossings: 809 with tactile paving, 254 that beep. Newcastle 348 (272, 69). London 263 (132, 37) | S | High for low vision | **FEAT-52** |
| **Where we don't know** | Our own graph: unknown slope, surface, width | Already drawn dashed when slopes are on | S | Medium: honesty, and where to report | **FEAT-53** |
| **Lit streets** | OSM `lit` (D-038), Edinburgh lamp columns in OSM (§12, FEAT-43) | `lit` known on 44% of Edinburgh's edges, 38% Newcastle, 60% London | S | Medium, after dark | **FEAT-54** |
| **Gritted pavements and flooded paths** | Edinburgh gritting routes (1,130 edges, DATA-07); EA flood warnings | Edinburgh only for gritting; England for floods | S | Medium, in season | **FEAT-55**: shown by itself when the ground is icy or a warning is on |
| **Blue Badge parking** | OSM disabled parking (coverage not measured in the survey); Westminster bays (452, ask, DATA-14); Fife, Dundee, Renfrewshire bays (ask); Nottingham orders (OGL, outside the pilots) (§3, §4.1) | **Unknown for the pilots.** Nothing open from a pilot council | M | Medium: drop-off near a destination | **FEAT-56**: measure OSM first |
| **Community reports** | Our own (FEAT-35, D-084) | As many as people add | Built | High | Built (moved into the new menu) |

**Not recommended now:** noise and quiet streets (§4.5) and crowding (§4.3), useful for autistic and sensory users but a different audience; crime (no, D-085); dockless bikes and scooters (no open feed in any pilot, §4.2).

## Recommendation, in order

1. **Lifts and step-free stations** (FEAT-50). The difference between a trip and no trip, and London's data is live and already loaded.
2. **Works on the pavement** (FEAT-51). Temporary blockers people can't see on any other map. Already loaded for routing.
3. **Crossings with cues** (FEAT-52). The graph has them; for low vision this is the layer.
4. **Where we don't know** (FEAT-53). Says plainly where the map is thin, and invites a report.
5. **Lit streets** (FEAT-54), then **gritted and flooded** (FEAT-55), **Blue Badge parking** (FEAT-56), **seat details** (FEAT-57).

The data to make kerbs and widths good enough is the council data that waits on permission (DATA-12, DATA-14). Those rows matter more than any new layer.

## The menu

### Where it lives

The layers button on the map (top right, under the city chip on a phone). One menu, in groups, with a heading each:

- **The ground:** slopes, steps, rough ground, narrow paths.
- **Kerbs:** kerbs at crossings.
- **Places:** accessible toilets, benches and seats.
- **Reports:** community reports, problems, good things, by category (FEAT-35).
- **Display:** high contrast map, and "Back to what suits {profile}" once you've changed anything.

New layers join a group: lifts and stations, works and crossings go under their own headings ("Getting through", "Crossings") when built.

### Defaults by mobility

Until you change a switch, the map suits the profile you're routing for, and follows it when you switch profile. Once you change one, your choice is kept on this phone until you press "Back to what suits".

| | Slopes | Steps | Rough | Narrow | Kerbs | Toilets | Benches |
|---|---|---|---|---|---|---|---|
| Wheelchair, powerchair, scooter, pram | off | on | on | on | on | on | off |
| Rollator | off | on | on | on | on | on | on |
| Walking, stick, crutches, fatigue | off | on | on | off | off | on | on |
| Low vision | off | on | off | off | on | on | off |

Slopes stay off by default because they colour every street. That was the behaviour before, and the route card shows the route's own gradient anyway.

### Keys that don't rely on colour

Each layer has its own shape, and the menu shows each key beside its switch, drawn as it looks on the map:

- **Slopes:** colour ramp, with the percentage beside each colour in the key, and "Not known" dashed.
- **Steps:** a dotted line.
- **Rough ground:** a wide dash.
- **Narrow paths:** two close parallel lines.
- **Kerbs:** dropped or flush is a small filled dot; raised is a ring.
- **Toilets:** "WC" in a dark label, as on a route.
- **Benches:** a square with a seat in it.
- **Reports:** a triangle for a problem, a circle for something good (FEAT-35).

Narrow paths, kerbs and benches appear only from street level (zoom 15), so the city view isn't a rash of dots. The menu says "Zoom in to see them".

### Keyboard and screen readers

- The button is "Map layers". Enter opens the menu and moves focus to its first switch. Up and Down move through it; Escape or Tab closes it and returns focus to the button (STAB-13).
- Each switch is a `menuitemcheckbox` with its state, and its name includes the hint ("Narrow paths, under 1.5 m wide, where the width is mapped. Zoom in to see them"). Each group is labelled ("The ground", "Kerbs").
- The map itself is a canvas: a screen reader can't read a kerb dot. The same facts are in words where they matter: on a route, in "On this route" and the route details. Saved places and reports are buttons. Making layer items reachable by keyboard is FEAT-58.

### 320 px and 200% text

The menu is no wider than the screen less 12 px each side and scrolls if it's taller than the space below its button. Each key sits in the line of text, not in a column of its own, so at 200% text on a 320 px phone it wraps above the words instead of pushing the switch off the side. `pnpm a11y` now checks the menu with every key open at 320 px and 200% text.

## What's built

In this PR (FEAT-49):

- `apps/web/src/lib/map-layers.ts`: the switches, defaults by preset (`layersFor`), the stored choice, and which edges and nodes count as rough, narrow or a kerb. Unknown is never drawn as fine or as a problem: an unknown width is not narrow, an unmapped kerb is left off.
- The router worker sends rough and narrow flags with each street, plus kerbs and benches, with the base network.
- `MapView` draws the new layers; `MapChrome` has the grouped menu with keys.
- Tests in `apps/web/test/map-layers.test.ts`; the a11y check covers the menu with every key open, light, dark and at 320 px with 200% text.
