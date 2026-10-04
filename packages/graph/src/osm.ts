/**
 * OSM XML → pedestrian graph. Tagging follows the OSM wiki conventions that
 * OpenSidewalks maps onto: footway=sidewalk|crossing, sidewalk:*=separate,
 * kerb=*, kerb:height, incline, surface, smoothness, width, step_count,
 * handrail, level, layer, bridge.
 *
 * Phase 0 reads the XML from the OSM API (/api/0.6/map). Phase 1 swaps this
 * for Geofabrik PBF + minutely diffs into PostGIS; the tag interpretation
 * here is the part that carries over.
 */
import { XMLParser } from "fast-xml-parser";
import { attr, unknownAttr, type Attr } from "./attribute.js";
import type {
  Amenity,
  AutomaticDoor,
  DoorType,
  Entrance,
  EntranceInfo,
  EdgeAttrs,
  EdgeKind,
  Graph,
  GraphEdge,
  GraphNode,
  KerbInfo,
  KerbType,
  Smoothness,
  Surface,
} from "./schema.js";
import { haversine, lineLength } from "./geo.js";

type Tags = Record<string, string>;

export interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags: Tags;
  timestamp: string;
}
export interface OsmWay {
  id: number;
  nodes: number[];
  tags: Tags;
  timestamp: string;
}
export interface OsmData {
  nodes: Map<number, OsmNode>;
  ways: Map<number, OsmWay>;
}

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function parseOsmXml(xml: string, into?: OsmData): OsmData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    isArray: (name) => ["node", "way", "nd", "tag", "relation", "member"].includes(name),
  });
  const doc = parser.parse(xml) as {
    osm: {
      node?: { id: string; lat: string; lon: string; timestamp: string; tag?: { k: string; v: string }[] }[];
      way?: { id: string; timestamp: string; nd?: { ref: string }[]; tag?: { k: string; v: string }[] }[];
    };
  };
  const out: OsmData = into ?? { nodes: new Map(), ways: new Map() };
  const tagsOf = (t?: { k: string; v: string }[]): Tags =>
    Object.fromEntries(asArray(t).map((x) => [x.k, String(x.v)]));
  for (const n of asArray(doc.osm.node)) {
    out.nodes.set(Number(n.id), {
      id: Number(n.id),
      lat: Number(n.lat),
      lon: Number(n.lon),
      tags: tagsOf(n.tag),
      timestamp: n.timestamp,
    });
  }
  for (const w of asArray(doc.osm.way)) {
    out.ways.set(Number(w.id), {
      id: Number(w.id),
      nodes: asArray(w.nd).map((x) => Number(x.ref)),
      tags: tagsOf(w.tag),
      timestamp: w.timestamp,
    });
  }
  return out;
}

const ROAD_HIGHWAYS = new Set([
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "service",
  "living_street",
]);

const NO_ACCESS = new Set(["no", "private"]);

/** Does this road have its pavements mapped as separate ways? Then the centreline is not for walking. */
function sidewalksSeparate(t: Tags): boolean {
  const s = [t["sidewalk"], t["sidewalk:both"], t["sidewalk:left"], t["sidewalk:right"]];
  return s.some((v) => v === "separate");
}

/** Classify an OSM way for pedestrian routing, or null if not routable. */
export function classifyWay(t: Tags): EdgeKind | null {
  if (NO_ACCESS.has(t["foot"] ?? "") || (NO_ACCESS.has(t["access"] ?? "") && !["yes", "designated", "permissive"].includes(t["foot"] ?? ""))) {
    return null;
  }
  if (t["railway"] === "platform" || t["public_transport"] === "platform") {
    return t["highway"] === "steps" ? "steps" : "footway";
  }
  const hw = t["highway"];
  if (!hw) return null;
  switch (hw) {
    case "steps":
      return "steps";
    case "elevator":
      return "elevator";
    case "corridor":
      return "corridor";
    case "pedestrian":
      return "pedestrian";
    case "footway":
      if (t["footway"] === "sidewalk") return "sidewalk";
      if (t["footway"] === "crossing") return "crossing";
      if (t["conveying"] && t["conveying"] !== "no") return "escalator";
      if (t["ramp"] === "yes") return "ramp";
      return "footway";
    case "path":
    case "cycleway":
    case "bridleway":
    case "track":
      if (hw !== "path" && !["yes", "designated", "permissive"].includes(t["foot"] ?? "")) {
        // cycleways in the UK are commonly shared; treat untagged as walkable but unknown
        if (hw === "cycleway" && t["foot"] === undefined) return "footway";
        if (hw === "track") return "footway";
        return null;
      }
      return "footway";
    case "living_street":
      return "pedestrian";
  }
  if (ROAD_HIGHWAYS.has(hw)) {
    if (sidewalksSeparate(t)) return null;
    if ((t["sidewalk"] === "no" || t["sidewalk"] === "none") && ["trunk", "primary", "secondary"].includes(hw)) return null;
    return "street_proxy";
  }
  return null;
}

const SURFACES: Record<string, Surface> = {
  asphalt: "asphalt",
  concrete: "concrete",
  "concrete:plates": "concrete",
  "concrete:lanes": "concrete",
  paved: "paving_stones",
  paving_stones: "paving_stones",
  "paving_stones:30": "paving_stones",
  sett: "sett",
  unhewn_cobblestone: "cobblestone",
  cobblestone: "cobblestone",
  "cobblestone:flattened": "sett",
  compacted: "compacted",
  fine_gravel: "fine_gravel",
  gravel: "gravel",
  pebblestone: "gravel",
  unpaved: "gravel",
  dirt: "grass",
  ground: "grass",
  earth: "grass",
  grass: "grass",
  wood: "wood",
  metal: "metal",
  rubber: "asphalt",
  tartan: "asphalt",
  bricks: "paving_stones",
  brick: "paving_stones",
  stone: "paving_stones",
};

const SMOOTHNESS: ReadonlySet<string> = new Set(["excellent", "good", "intermediate", "bad", "very_bad", "horrible"]);

export function parseIncline(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(%|°)?\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2] === "°") return Math.tan((n * Math.PI) / 180) * 100;
  return n;
}

export function parseMetres(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(m|cm)?\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "cm" ? n / 100 : n;
}

export function parseKerbHeightCm(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(m|cm|mm)?\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2] === "cm") return n;
  if (m[2] === "mm") return n / 10;
  // Bare numbers: OSM default unit is metres, but kerb:height=3 clearly means cm.
  return n < 1 ? n * 100 : n;
}

const yesNo = (v: string | undefined): boolean | null =>
  v === undefined ? null : ["yes", "true", "1"].includes(v) ? true : ["no", "false", "0"].includes(v) ? false : null;

function osmAttr<T>(v: T | null, ts: string, method: string): Attr<T> {
  return v === null ? unknownAttr<T>() : attr(v, "reported", "osm", ts, method);
}

export function edgeAttrsFromTags(t: Tags, ts: string, kind: EdgeKind): EdgeAttrs {
  const inc = parseIncline(t["incline"]);
  const surface = t["surface"] ? (SURFACES[t["surface"]] ?? "other") : null;
  const smooth = t["smoothness"] && SMOOTHNESS.has(t["smoothness"]) ? (t["smoothness"] as Smoothness) : null;
  const width = parseMetres(t["width"] ?? t["est_width"]);
  const steps = t["step_count"] ? Number(t["step_count"]) : null;
  const handrail =
    yesNo(t["handrail"]) ??
    (["handrail:left", "handrail:right", "handrail:center"].some((k) => t[k] === "yes") ? true : null);
  const wc = t["wheelchair"];
  if (kind === "street_proxy") return streetProxyAttrs(t, ts, inc, smooth, steps, handrail, wc);
  return {
    incline: osmAttr(inc, ts, "OSM incline tag"),
    inclineMax: osmAttr(inc, ts, "OSM incline tag"),
    crossSlope: unknownAttr(),
    surface: osmAttr(surface, ts, "OSM surface tag"),
    smoothness: osmAttr(smooth, ts, "OSM smoothness tag"),
    width: osmAttr(width, ts, "OSM width tag"),
    stepCount: kind === "steps" ? osmAttr(Number.isFinite(steps) ? steps : null, ts, "OSM step_count") : attr(0, "inferred", "derived", null, "not steps"),
    handrail: osmAttr(handrail, ts, "OSM handrail tag"),
    lit: osmAttr(yesNo(t["lit"]), ts, "OSM lit tag"),
    covered: osmAttr(yesNo(t["covered"]) ?? (t["indoor"] === "yes" || t["tunnel"] === "building_passage" ? true : null), ts, "OSM covered/indoor"),
    wheelchair: osmAttr(wc === "yes" || wc === "limited" || wc === "no" ? wc : null, ts, "OSM wheelchair tag"),
  };
}

/**
 * A road standing in for its pavements. The road's own surface and width
 * describe the carriageway, not the pavement, so they are never reported as
 * pavement facts: OSM sidewalk:* tags are used where present, and the road
 * surface otherwise, marked inferred.
 */
function streetProxyAttrs(
  t: Tags,
  ts: string,
  inc: number | null,
  smooth: Smoothness | null,
  _steps: number | null,
  handrail: boolean | null,
  wc: string | undefined,
): EdgeAttrs {
  const sw = t["sidewalk"] ?? t["sidewalk:both"] ?? (t["sidewalk:left"] && t["sidewalk:left"] !== "no" ? "left" : t["sidewalk:right"] && t["sidewalk:right"] !== "no" ? "right" : undefined);
  const pav = sw === "both" || sw === "yes" ? "both" : sw === "left" || sw === "right" ? sw : sw === "no" || sw === "none" ? "no" : null;
  const side = pav === "left" ? "left" : pav === "right" ? "right" : "both";
  const pick = (k: string) => t[`sidewalk:${side}:${k}`] ?? t[`sidewalk:${k}`] ?? (side === "both" ? (t[`sidewalk:left:${k}`] ?? t[`sidewalk:right:${k}`]) : undefined);
  const swSurface = pick("surface");
  const surfaceAttr: Attr<Surface> = swSurface
    ? attr(SURFACES[swSurface] ?? "other", "reported", "osm", ts, `OSM sidewalk:${side}:surface`)
    : t["surface"]
      ? attr(SURFACES[t["surface"]] ?? "other", "inferred", "osm", ts, "carriageway surface (OSM surface); the pavement may differ")
      : unknownAttr();
  const width = parseMetres(pick("width"));
  return {
    incline: osmAttr(inc, ts, "OSM incline tag"),
    inclineMax: osmAttr(inc, ts, "OSM incline tag"),
    crossSlope: unknownAttr(),
    surface: surfaceAttr,
    smoothness: osmAttr(smooth, ts, "OSM smoothness tag"),
    width: osmAttr(width, ts, `OSM sidewalk:${side}:width`),
    stepCount: attr(0, "inferred", "derived", null, "not steps"),
    handrail: osmAttr(handrail, ts, "OSM handrail tag"),
    lit: osmAttr(yesNo(t["lit"]), ts, "OSM lit tag"),
    covered: osmAttr(yesNo(t["covered"]), ts, "OSM covered"),
    wheelchair: osmAttr(wc === "yes" || wc === "limited" || wc === "no" ? wc : null, ts, "OSM wheelchair tag"),
    pavement: osmAttr(pav, ts, "OSM sidewalk tag"),
  };
}

function kerbFromTags(t: Tags, ts: string): KerbInfo | undefined {
  const k = t["kerb"];
  const isKerb = t["barrier"] === "kerb" || k !== undefined || t["kerb:height"] !== undefined;
  if (!isKerb) return undefined;
  const type: KerbType | null =
    k === "raised" || k === "lowered" || k === "flush" || k === "rolled" ? k : k === "no" ? "flush" : null;
  let h = parseKerbHeightCm(t["kerb:height"]);
  // Where only the type is known we leave height unknown rather than guess a number;
  // the cost model reasons about type directly.
  if (h === null && type === "flush") h = 0;
  return {
    type: osmAttr(type, ts, "OSM kerb tag"),
    heightCm: osmAttr(h, ts, "OSM kerb:height tag"),
    tactilePaving: osmAttr(yesNo(t["tactile_paving"]), ts, "OSM tactile_paving tag"),
  };
}

const levelOf = (t: Tags): number => {
  const l = t["level"];
  if (!l) return 0;
  const n = Number(l.split(";")[0]);
  return Number.isFinite(n) ? n : 0;
};

const DOORS: ReadonlySet<string> = new Set(["hinged", "sliding", "revolving", "swinging", "folding", "overhead", "no"]);
const AUTO: ReadonlySet<string> = new Set(["yes", "no", "button", "motion", "floor", "continuous", "slowdown_button"]);

export function entranceFromTags(t: Tags, ts: string): EntranceInfo | undefined {
  if (!t["entrance"] && !t["door"] && !t["automatic_door"] && t["railway"] !== "subway_entrance") return undefined;
  const door = t["door"] ? (DOORS.has(t["door"]) ? (t["door"] as DoorType) : "other") : null;
  const auto = t["automatic_door"] && AUTO.has(t["automatic_door"]) ? (t["automatic_door"] as AutomaticDoor) : null;
  const wc = t["wheelchair"];
  const steps = t["step_count"] !== undefined ? Number(t["step_count"]) : null;
  return {
    entrance: osmAttr(t["entrance"] ?? (t["railway"] === "subway_entrance" ? "subway" : null), ts, "OSM entrance tag"),
    door: osmAttr(door, ts, "OSM door tag"),
    automatic: osmAttr(auto, ts, "OSM automatic_door tag"),
    widthM: osmAttr(parseMetres(t["door:width"] ?? t["width"]), ts, "OSM door:width tag"),
    stepCount: osmAttr(Number.isFinite(steps) ? steps : null, ts, "OSM step_count tag"),
    wheelchair: osmAttr(wc === "yes" || wc === "limited" || wc === "no" ? wc : null, ts, "OSM wheelchair tag"),
    ramp: osmAttr(yesNo(t["ramp"]) ?? yesNo(t["ramp:wheelchair"]), ts, "OSM ramp tag"),
  };
}

function amenityFromNode(n: OsmNode): Amenity | undefined {
  const t = n.tags;
  const kind = t["amenity"] === "bench" || t["leisure"] === "picnic_table" ? "bench" : t["amenity"] === "toilets" ? (t["changing_places"] === "yes" ? "changing_places" : "toilets") : null;
  if (!kind) return undefined;
  const wc = t["wheelchair"] ?? t["toilets:wheelchair"];
  const details: Record<string, Attr<string>> = {};
  for (const k of ["backrest", "armrest", "changing_table", "toilets:wheelchair", "centralkey", "fee", "opening_hours", "access"]) {
    if (t[k]) details[k] = attr(t[k], "reported", "osm", n.timestamp, `OSM ${k} tag`);
  }
  return {
    id: n.id,
    lon: n.lon,
    lat: n.lat,
    kind,
    wheelchair: osmAttr(wc === "yes" || wc === "limited" || wc === "no" ? wc : null, n.timestamp, "OSM wheelchair tag"),
    details,
    osmId: n.id,
  };
}

export interface BuildOptions {
  name: string;
  bbox: [number, number, number, number];
  snapshot: string;
  /** Infer dropped kerbs at UK controlled crossings (default true). See inferUkCrossingKerb. */
  inferUkKerbs?: boolean;
}

const CONTROLLED_REFS = new Set(["zebra", "pelican", "puffin", "toucan", "pegasus", "equestrian", "tiger"]);

/**
 * UK rule: signal-controlled and zebra crossings are built with dropped
 * kerbs and blister tactile paving (DfT Guidance on the Use of Tactile Paving
 * Surfaces, 2021; Inclusive Mobility, 2021). Tactile paving tagged at a
 * crossing implies the same. So where OSM says a crossing is controlled, or
 * has tactile paving, but says nothing about the kerb, we infer "lowered".
 *
 * This is an inference, never a verification: state "inferred", source
 * "derived", height unknown. Uncontrolled crossings without tactile paving
 * get nothing; old or substandard installations are why it stays inferred.
 */
export function inferUkCrossingKerb(way: OsmWay, osm: OsmData): KerbInfo | undefined {
  const tagsets = [way.tags, ...way.nodes.map((id) => osm.nodes.get(id)?.tags ?? {})];
  let controlled = false;
  let tactile = false;
  for (const t of tagsets) {
    const c = t["crossing"];
    if (c === "traffic_signals" || c === "zebra" || (c === "marked" && t["crossing:markings"] === "zebra")) controlled = true;
    if (t["crossing:signals"] === "yes" || CONTROLLED_REFS.has(t["crossing_ref"] ?? "")) controlled = true;
    if (t["tactile_paving"] === "yes") tactile = true;
  }
  if (!controlled && !tactile) return undefined;
  const why = controlled
    ? "UK controlled crossing: dropped kerb required (DfT tactile paving guidance 2021, Inclusive Mobility 2021)"
    : "tactile paving tagged at crossing: implies dropped kerb";
  return {
    type: attr("lowered", "inferred", "derived", way.timestamp, why),
    heightCm: unknownAttr(),
    tactilePaving: tactile ? attr(true, "reported", "osm", way.timestamp, "OSM tactile_paving tag") : attr(true, "inferred", "derived", way.timestamp, why),
  };
}

/**
 * Build the pedestrian graph. Ways are split at every shared node and at
 * every node that carries pedestrian meaning (kerbs, crossings, lifts,
 * entrances) so the router can reason about them individually.
 */
export function buildGraphFromOsm(osm: OsmData, opts: BuildOptions): Graph {
  const routable: { way: OsmWay; kind: EdgeKind }[] = [];
  for (const way of osm.ways.values()) {
    const kind = classifyWay(way.tags);
    if (!kind) continue;
    if (way.nodes.some((n) => !osm.nodes.has(n))) {
      // Clipped at the bbox edge: keep the part we have.
      way.nodes = way.nodes.filter((n) => osm.nodes.has(n));
    }
    if (way.nodes.length < 2) continue;
    routable.push({ way, kind });
  }

  const use = new Map<number, number>();
  for (const { way } of routable) {
    // A closed way visits its first node twice; count distinct visits only.
    const seen = new Set<number>();
    for (const n of way.nodes) {
      if (seen.has(n)) continue;
      seen.add(n);
      use.set(n, (use.get(n) ?? 0) + 1);
    }
  }
  const meaningful = (n: OsmNode) =>
    !!n.tags["barrier"] ||
    !!n.tags["kerb"] ||
    n.tags["highway"] === "crossing" ||
    n.tags["highway"] === "elevator" ||
    !!n.tags["entrance"] ||
    n.tags["railway"] === "subway_entrance";

  const nodes = new Map<number, GraphNode>();
  const nodeFor = (osmId: number, level: number): number => {
    // Same OSM node at different levels becomes distinct graph nodes only for lifts (see below).
    const existing = nodes.get(osmId);
    if (existing) return existing.id;
    const n = osm.nodes.get(osmId)!;
    const kerb = kerbFromTags(n.tags, n.timestamp);
    const entrance = entranceFromTags(n.tags, n.timestamp);
    const kind: GraphNode["kind"] =
      n.tags["highway"] === "elevator"
        ? "elevator"
        : kerb
          ? "kerb"
          : n.tags["highway"] === "crossing"
            ? "crossing"
            : n.tags["entrance"] || n.tags["railway"] === "subway_entrance"
              ? "entrance"
              : "junction";
    nodes.set(osmId, {
      id: osmId,
      lon: n.lon,
      lat: n.lat,
      ele: unknownAttr(),
      level,
      kind,
      ...(kerb ? { kerb } : {}),
      ...(entrance ? { entrance } : {}),
      osmId,
    });
    return osmId;
  };

  const edges: GraphEdge[] = [];
  let edgeId = 1;
  for (const { way, kind } of routable) {
    const t = way.tags;
    const level = levelOf(t);
    const layer = Number(t["layer"] ?? 0) || 0;
    const bridge = !!t["bridge"] && t["bridge"] !== "no";
    const movable = t["bridge:movable"] ?? (t["bridge"] === "movable" ? "movable" : undefined);
    const attrs = edgeAttrsFromTags(t, way.timestamp, kind);
    const oneway = kind === "escalator" || t["oneway:foot"] === "yes" || (kind !== "street_proxy" && t["oneway"] === "yes" && kind !== "steps");
    // A crossing way tagged kerb=lowered applies to both ends.
    const crossingKerb = kind === "crossing" ? kerbFromTags({ kerb: t["kerb"] ?? "", "kerb:height": t["kerb:height"] ?? "", tactile_paving: t["tactile_paving"] ?? "" }, way.timestamp) : undefined;

    let start = 0;
    for (let i = 1; i < way.nodes.length; i++) {
      const id = way.nodes[i]!;
      const n = osm.nodes.get(id)!;
      const last = i === way.nodes.length - 1;
      if (!last && (use.get(id) ?? 0) < 2 && !meaningful(n)) continue;
      const slice = way.nodes.slice(start, i + 1);
      const geometry = slice.map((nid) => {
        const nn = osm.nodes.get(nid)!;
        return [nn.lon, nn.lat] as [number, number];
      });
      const from = nodeFor(slice[0]!, level);
      const to = nodeFor(slice[slice.length - 1]!, level);
      if (from !== to || geometry.length > 2) {
        edges.push({
          id: edgeId++,
          from,
          to,
          kind,
          geometry,
          lengthM: lineLength(geometry),
          name: t["name"] ?? null,
          level,
          layer,
          bridge,
          ...(movable ? { movable } : {}),
          bidirectional: !oneway,
          attrs: structuredClone(attrs),
          osmWayId: way.id,
        });
      }
      start = i;
    }
    if (crossingKerb && crossingKerb.type.state !== "unknown") {
      for (const end of [way.nodes[0]!, way.nodes[way.nodes.length - 1]!]) {
        const gn = nodes.get(end);
        if (gn && !gn.kerb) gn.kerb = crossingKerb;
      }
    } else if (kind === "crossing" && opts.inferUkKerbs !== false) {
      const inferred = inferUkCrossingKerb(way, osm);
      if (inferred) {
        for (const end of [way.nodes[0]!, way.nodes[way.nodes.length - 1]!]) {
          const gn = nodes.get(end);
          if (gn && (!gn.kerb || gn.kerb.type.state === "unknown")) {
            gn.kerb = inferred;
            if (gn.kind === "junction") gn.kind = "kerb";
          }
        }
      }
    }
  }

  splitLiftsByLevel(nodes, edges, () => edgeId++);
  inferNames(edges, osm);
  applyBridgeOutlines(edges, osm);

  const [minLon, minLat, maxLon, maxLat] = opts.bbox;
  const inBox = (n: OsmNode) => n.lon >= minLon && n.lon <= maxLon && n.lat >= minLat && n.lat <= maxLat;
  const entrances: Entrance[] = [];
  const amenities: Amenity[] = [];
  for (const n of osm.nodes.values()) {
    if (!inBox(n)) continue;
    const info = entranceFromTags(n.tags, n.timestamp);
    if (info) entrances.push({ ...info, id: n.id, lon: n.lon, lat: n.lat, level: levelOf(n.tags), name: n.tags["name"] ?? n.tags["ref"] ?? null, osmId: n.id });
    const a = amenityFromNode(n);
    if (a) amenities.push(a);
  }

  return {
    meta: {
      name: opts.name,
      bbox: opts.bbox,
      builtAt: new Date().toISOString(),
      sources: [
        {
          id: "osm",
          licence: "ODbL-1.0",
          attribution: "© OpenStreetMap contributors",
          snapshot: opts.snapshot,
        },
      ],
    },
    nodes: [...nodes.values()],
    edges,
    entrances,
    amenities,
  };
}

/**
 * OSM maps a lift as a single node shared by ways on different levels. We
 * turn it into explicit vertical edges between per-level copies of the node
 * so a lift can carry its own state (in service / out of service) and cost.
 * Where every connected way is on the same level (common tagging shortcut),
 * the node stays as is with kind "elevator" and the router treats passing
 * through it as using the lift.
 */
function splitLiftsByLevel(nodes: Map<number, GraphNode>, edges: GraphEdge[], nextId: () => number) {
  for (const node of [...nodes.values()]) {
    if (node.kind !== "elevator") continue;
    const incident = edges.filter((e) => e.from === node.id || e.to === node.id);
    const levels = [...new Set(incident.map((e) => e.level))].sort((a, b) => a - b);
    if (levels.length < 2) continue;
    const perLevel = new Map<number, number>();
    for (const lvl of levels) {
      const id = -(node.id * 10 + (levels.indexOf(lvl) + 1));
      nodes.set(id, { ...node, id, level: lvl, kind: "elevator" });
      perLevel.set(lvl, id);
    }
    for (const e of incident) {
      const nid = perLevel.get(e.level)!;
      if (e.from === node.id) e.from = nid;
      if (e.to === node.id) e.to = nid;
    }
    for (let i = 0; i < levels.length; i++) {
      for (let j = i + 1; j < levels.length; j++) {
        edges.push({
          id: nextId(),
          from: perLevel.get(levels[i]!)!,
          to: perLevel.get(levels[j]!)!,
          kind: "elevator",
          geometry: [
            [node.lon, node.lat],
            [node.lon, node.lat],
          ],
          lengthM: 0,
          name: null,
          level: levels[i]!,
          layer: 0,
          bridge: false,
          bidirectional: true,
          attrs: {
            incline: attr(0, "inferred", "derived", null, "lift"),
            inclineMax: attr(0, "inferred", "derived", null, "lift"),
            crossSlope: attr(0, "inferred", "derived", null, "lift"),
            surface: unknownAttr(),
            smoothness: unknownAttr(),
            width: unknownAttr(),
            stepCount: attr(0, "inferred", "derived", null, "lift"),
            handrail: unknownAttr(),
            lit: unknownAttr(),
            covered: attr(true, "inferred", "derived", null, "lift"),
            wheelchair: unknownAttr(),
          },
          osmWayId: node.osmId,
        });
      }
    }
    nodes.delete(node.id);
  }
}

/**
 * OSM records a bridge's structure on its outline (man_made=bridge), not on
 * the decks that cross it. Decks inside a movable outline inherit
 * `movable`, and unnamed or misspelt decks get the structure's name.
 */
function applyBridgeOutlines(edges: GraphEdge[], osm: OsmData) {
  const outlines: { ring: [number, number][]; name: string | null; movable: string | null }[] = [];
  for (const w of osm.ways.values()) {
    if (w.tags["man_made"] !== "bridge" || w.nodes[0] !== w.nodes[w.nodes.length - 1]) continue;
    const ring = w.nodes.map((id) => osm.nodes.get(id)).filter((n): n is OsmNode => !!n).map((n) => [n.lon, n.lat] as [number, number]);
    if (ring.length < 4) continue;
    outlines.push({ ring, name: w.tags["name"] ?? null, movable: w.tags["bridge:movable"] ?? null });
  }
  if (!outlines.length) return;
  for (const e of edges) {
    if (!e.bridge) continue;
    const mid = e.geometry[Math.floor(e.geometry.length / 2)]!;
    const o = outlines.find((x) => pointInRing(mid, x.ring));
    if (!o) continue;
    if (o.movable && !e.movable) e.movable = o.movable;
    if (o.name && (!e.name || e.nameInferred)) {
      e.name = o.name;
      e.nameInferred = false;
    }
  }
}

function pointInRing([x, y]: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!,
      [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Sidewalks and crossings are rarely named in OSM. Borrow the name of the
 * nearest roughly parallel named street so explanations can say
 * "Cockburn Street" rather than "an unnamed footway".
 */
function inferNames(edges: GraphEdge[], osm: OsmData) {
  const named: { name: string; a: [number, number]; b: [number, number] }[] = [];
  for (const w of osm.ways.values()) {
    const name = w.tags["name"];
    // Only streets lend their names: a footway borrowing "Granny's Green Steps" would be a lie.
    const hw = w.tags["highway"] ?? "";
    if (!name || !(ROAD_HIGHWAYS.has(hw) || hw === "pedestrian")) continue;
    for (let i = 1; i < w.nodes.length; i++) {
      const a = osm.nodes.get(w.nodes[i - 1]!);
      const b = osm.nodes.get(w.nodes[i]!);
      if (a && b) named.push({ name, a: [a.lon, a.lat], b: [b.lon, b.lat] });
    }
  }
  const CELL = 0.0005;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
  named.forEach((s, i) => {
    const mx = (s.a[0] + s.b[0]) / 2;
    const my = (s.a[1] + s.b[1]) / 2;
    const k = key(mx, my);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  for (const e of edges) {
    if (e.name || e.kind === "elevator") continue;
    const mid = e.geometry[Math.floor(e.geometry.length / 2)]!;
    const cx = Math.floor(mid[0] / CELL);
    const cy = Math.floor(mid[1] / CELL);
    let best: { name: string; d: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const s = named[i]!;
          const d = distToSegment(mid, s.a, s.b);
          if (d < 20 && (!best || d < best.d)) best = { name: s.name, d };
        }
      }
    }
    if (best) {
      e.name = best.name;
      e.nameInferred = true;
    }
  }
}

function distToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const kx = Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * kx,
    ay = a[1] - p[1],
    bx = (b[0] - p[0]) * kx,
    by = b[1] - p[1];
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const x = ax + t * dx,
    y = ay + t * dy;
  return haversine([p[0], p[1]], [p[0] + x / kx, p[1] + y]);
}
