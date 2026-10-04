/**
 * What a crossing is and which non-visual cues it has, and whether a path is
 * shared with cycles: the facts a blind or partially sighted person plans
 * around. From OSM tags on the crossing node (where UK mappers put them) and
 * on the path's way. Unknown stays unknown: a crossing with lights but no
 * sound tag is not assumed silent or audible.
 */
import { attr, unknownAttr, type Attr } from "./attribute.js";
import type { CrossingInfo, Graph } from "./schema.js";

type Tags = Record<string, string | undefined>;

const yesNo = (v: string | undefined, ts: string | null, method: string): Attr<boolean> =>
  v === "yes" ? attr(true, "reported", "osm", ts, method) : v === "no" ? attr(false, "reported", "osm", ts, method) : unknownAttr();

export function crossingFromTags(t: Tags, ts: string | null): CrossingInfo | undefined {
  if (t["highway"] !== "crossing" && t["railway"] !== "crossing") return undefined;
  const c = t["crossing"];
  const markings = t["crossing:markings"];
  const control: CrossingInfo["control"] =
    c === "traffic_signals" || t["crossing_ref"] === "pelican" || t["crossing_ref"] === "puffin" || t["crossing_ref"] === "toucan" || t["crossing_ref"] === "pegasus"
      ? attr("signals", "reported", "osm", ts, "OSM crossing tag")
      : c === "zebra" || t["crossing_ref"] === "zebra" || markings === "zebra"
        ? attr("zebra", "reported", "osm", ts, "OSM crossing tag")
        : c === "uncontrolled" || c === "marked"
          ? attr("marked", "reported", "osm", ts, "OSM crossing tag")
          : c === "unmarked" || c === "no"
            ? attr("uncontrolled", "reported", "osm", ts, "OSM crossing tag")
            : unknownAttr();
  return {
    control,
    sound: yesNo(t["traffic_signals:sound"], ts, "OSM traffic_signals:sound tag"),
    vibration: yesNo(t["traffic_signals:vibration"], ts, "OSM traffic_signals:vibration tag"),
    tactilePaving: yesNo(t["tactile_paving"], ts, "OSM tactile_paving tag"),
    island: yesNo(t["crossing:island"], ts, "OSM crossing:island tag"),
  };
}

/** Shared with cycles: bicycle=designated or yes on a footpath, unless segregated=yes. */
export function sharedWithCyclesFromTags(t: Tags, ts: string | null): Attr<boolean> | undefined {
  const bikes = t["bicycle"] === "designated" || t["bicycle"] === "yes" || t["highway"] === "cycleway";
  if (!bikes) return undefined;
  if (t["segregated"] === "yes") return attr(false, "reported", "osm", ts, "OSM segregated=yes");
  if (t["segregated"] === "no") return attr(true, "reported", "osm", ts, "OSM segregated=no");
  return attr(true, "inferred", "derived", ts, "cycles allowed, segregation not mapped");
}

/**
 * Add crossing and shared-path facts to a built graph from OSM tags (for snapshots built before these
 * existed). Nodes match on OSM id, edges on OSM way id. Returns how many of each were set.
 */
export function addCrossingInfo(g: Graph, nodeTags: Map<number, { tags: Tags; timestamp: string }>, wayTags: Map<number, { tags: Tags; timestamp: string }>): { crossings: number; shared: number } {
  let crossings = 0,
    shared = 0;
  for (const n of g.nodes) {
    const src = n.osmId !== undefined ? nodeTags.get(n.osmId) : undefined;
    const info = src ? crossingFromTags(src.tags, src.timestamp) : undefined;
    if (info) {
      n.crossing = info;
      crossings++;
    }
  }
  for (const e of g.edges) {
    if (e.osmWayId === undefined || !["footway", "pedestrian", "sidewalk", "ramp"].includes(e.kind)) continue;
    const src = wayTags.get(e.osmWayId);
    const s = src ? sharedWithCyclesFromTags(src.tags, src.timestamp) : undefined;
    if (s) {
      e.sharedWithCycles = s;
      shared++;
    }
  }
  return { crossings, shared };
}
