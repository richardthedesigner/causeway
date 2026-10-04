# Data model

The graph is the product. This spec covers the pedestrian graph, the attribute and confidence model, live state, and the user profile. TypeScript types: `packages/graph/src/schema.ts`, `packages/graph/src/attribute.ts`, `packages/profile/src/index.ts`. Canonical storage: `db/migrations/0001_graph.sql` (PostGIS).

## 1. Graph shape

Reference model: OpenSidewalks (UW TCAT), mapped to OSM tagging.

### Edges

| Kind | OSM source | Notes |
|---|---|---|
| `sidewalk` | `highway=footway` + `footway=sidewalk` | One edge per side of the street. |
| `footway` | `highway=footway`, `path`, untagged `cycleway`, `track`, platforms | |
| `pedestrian` | `highway=pedestrian`, `living_street` | |
| `crossing` | `footway=crossing` | Kerbs are on its end nodes. |
| `steps` | `highway=steps` | `step_count`, `handrail`. Never DTM-sampled. |
| `ramp` | `footway` + `ramp=yes` | |
| `elevator` | lift node between levels, or `highway=elevator` way | Explicit vertical edge with its own live state. |
| `escalator` | `conveying=*` | Directional. |
| `corridor` | `highway=corridor` | Indoor (stations, malls). |
| `street_proxy` | road with no separately mapped pavement | Stand-in for the pavements; always carries an unknown. See D-002. |

Roads with `sidewalk*=separate` are dropped: their pavements are already edges. Ways are split at every shared node and at every meaningful node (kerb, crossing, lift, entrance), so the router can reason about each one.

Every edge has `level` (OSM `level`), `layer`, `bridge`, `bidirectional`, a geometry from `from` to `to`, and a length.

### Nodes

`junction`, `kerb`, `crossing`, `entrance`, `elevator`, `endpoint`. Kerb nodes carry `KerbInfo { type, heightCm, tactilePaving }`. Every node has an elevation `ele` (an attribute like any other).

### Multi-level

Edinburgh's bridges and Waverley are the test cases. A street on a bridge deck and the street underneath are different edges on different layers that never share a node unless a stair or lift joins them. A lift that OSM maps as a single node shared by ways on several levels is split into one node per level, joined by `elevator` edges.

## 2. Attributes

Every fact is an `Attr<T>`:

```ts
{ value: T | null, state: "verified" | "inferred" | "reported" | "unknown",
  source: SourceId, observedAt: ISO8601 | null, method?: string, corroborations?: number }
```

| Attribute | Unit | Primary source | Fallback |
|---|---|---|---|
| `incline` (mean, signed from→to) | % | LiDAR DTM along the footway line | OSM `incline` |
| `inclineMax` (steepest 10 m, signed) | % | LiDAR DTM | OSM `incline` |
| `crossSlope` (p75 camber) | % | LiDAR, ±1 m perpendicular | Survey / crowd |
| `surface` | enum | OSM `surface` | Mapillary detections, council surveys |
| `smoothness` | enum | OSM `smoothness` | Passive accelerometer (Phase 4) |
| `width` (usable) | m | OSM `width`, OS NGD (licensed) | Imagery |
| `stepCount`, `handrail` | n, bool | OSM | |
| `lit`, `covered` | bool | OSM | |
| `wheelchair` | yes/limited/no | OSM | |
| Kerb `type`, `heightCm`, `tactilePaving` | enum, cm, bool | OSM `kerb`, `kerb:height` | Council dropped-kerb data, Mapillary `curb-cut`, crowd |

Rules:

- **No bare values.** Absence is `unknown`, never a default. A kerb of unknown type is not assumed lowered.
- **Terrain is never trusted across a structure.** Off-ground edges (bridge, layer not 0, level not 0, indoor, covered) never sample the DTM, and discontinuities make an edge `unknown`. See D-005.
- **Every access fact shown on screen has a source and a date** (`source`, `observedAt`, `method`).

## 3. Confidence

`confidence(attr, now) ∈ [0, 1]`:

- Base by state: verified 0.95, inferred 0.7, reported 0.6, unknown 0.
- Corroboration lifts a crowd report by 0.1 each, capped at 0.9 (never equal to verified).
- Exponential decay with age. Half-life by state: verified 3 years, inferred 5 years, reported 2 years. Terrain sources (LiDAR) decay 4 times slower.
- Live states always carry `validUntil` and expire on their own.

All numbers are placeholders until Phase 1 calibration against ground-truth samples (D-013).

### How the router uses it

`cost = travel_time(speed × gradient factor) + Σ penalties + Σ risk(unknown)`

- **Hard exclusions** (cost = ∞): steps over the user's limit, escalators if not allowed, a kerb above the user's limit, steepest window above the user's limit (direction-aware), a surface the user marks "never", a known width below the minimum, a live closure, `wheelchair=no` for wheeled profiles.
- **Soft penalties**: gradient above the comfort level (quadratic up to the limit), cross-slope above the limit (scaled by confidence; DTM camber never hard-excludes), surface tolerance (times wet sensitivity in rain), widths below the minimum that were only inferred.
- **Risk for unknowns**: a per-attribute weight × (1 − `uncertaintyTolerance`). An unmapped kerb at a crossing costs 120 s for a fully cautious user; unknown gradient costs 60 s per 100 m.
- **Verdict**: a route with any unknown on it is `passable-with-unknowns`, never "step-free". This is the trust contract.

## 4. Live state

`LiveState { status: open | closed | restricted | degraded, reason, source, validFrom, validUntil }` on edges (and on lift edges and nodes). It is applied as an overlay at request time, with no graph rebuild. Carriageway works from Street Manager, SRWR and TfL are projected onto the adjacent footway edges as `degraded` unless the source says the footway is closed (Phase 3).

## 5. User profile

See `packages/profile`. Thresholds: incline up and down, comfort incline, cross-slope, kerb height, width, steps, escalators, per-surface tolerance, wet sensitivity, rest interval, toilet interval, speed, uncertainty tolerance, companion mode. Presets: walking, manual wheelchair (self-propelled and pushed), powerchair, mobility scooter, rollator, crutches, pram, fatigue, visual impairment. Presets are starting points; the user owns every number.

**Privacy.** Mobility profiles are special-category health data under UK GDPR.

- Stored on the device by default.
- Sent per request, never persisted or logged server-side (D-009).
- No analytics on profile contents.
- Server-side sync only with explicit consent and after a DPIA. **Stop-and-ask: Richard.**

## 6. Storage and licensing layers

PostGIS (Supabase) is the source of truth; see `db/migrations/0001_graph.sql`.

- `graph_node`, `graph_edge`: geometry, kind, level, layer.
- `edge_attribute`, `node_attribute`: one row per (element, attribute, source) observation. Multiple sources coexist; a resolver view picks the winner by confidence.
- `live_state`: overlays with validity windows.
- `source`: licence, attribution, share-alike flag, refresh cadence.
- `partner_*`: licensed or partner data keyed by our own location IDs, never written into the ODbL graph (D-008).

Exports: a per-city compact graph (the JSON snapshot today; a binary format later) for the router on server and device.
