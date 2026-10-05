/**
 * Council footway data as a separate layer (DATA-06, D-008): keyed by
 * "<osm way>:<from node>:<to node>", joined when the city loads, never written
 * into the OSM-derived snapshot. It only fills what OSM doesn't know: OSM's own
 * surface and width always come first.
 */
import { attr, isKnown } from "./attribute.js";
import type { Graph, Surface } from "./schema.js";

export interface CouncilFootways {
  area: string;
  source: string;
  licence: string;
  /** Where the gritting routes came from, if the layer has them (DATA-07). */
  gritting?: string;
  /** YYYY-MM-DD. */
  fetchedAt: string;
  /** [our surface, width in metres, 1 if it's the pavement alongside a street drawn as one line, 1 if on a priority gritting route]. */
  edges: Record<string, [Surface | null, number | null, 0 | 1, (0 | 1)?]>;
}

/** Edinburgh's surface names to ours. "Other", "Unknown" and "Hard Landscaping" say nothing useful. */
export function councilSurface(s: string | null | undefined): Surface | null {
  const v = (s ?? "").toLowerCase();
  if (v === "setts") return "sett";
  if (/flags|block paving/.test(v)) return "paving_stones";
  if (v === "concrete") return "concrete";
  if (/^hra|^dbm|surface dressing|^sma/.test(v)) return "asphalt";
  return null;
}

/** Fill unknown surfaces and widths from the council layer. Returns how many edges gained something. */
/** Edges people walk or wheel along outside, where gritting applies. */
const PAVEMENT = new Set(["footway", "sidewalk", "pedestrian", "street_proxy", "ramp"]);

export function applyCouncilFootways(g: Graph, layer: CouncilFootways): number {
  let n = 0;
  for (const e of g.edges) {
    if (!e.osmWayId) continue;
    const hit = layer.edges[`${e.osmWayId}:${e.from}:${e.to}`];
    // With gritting data, every pavement is known to be on a route or not.
    if (layer.gritting && PAVEMENT.has(e.kind)) e.attrs.gritted = attr(!!hit?.[3], "reported", "council", layer.fetchedAt, layer.gritting);
    if (!hit) continue;
    const [surface, width, alongside] = hit;
    const how = `${layer.source}${alongside ? ", the footway alongside (narrowest and roughest if two)" : ""}`;
    let changed = false;
    if (surface && !isKnown(e.attrs.surface)) {
      e.attrs.surface = attr(surface, "reported", "council", layer.fetchedAt, how);
      changed = true;
    }
    if (width !== null && !isKnown(e.attrs.width)) {
      e.attrs.width = attr(width, "reported", "council", layer.fetchedAt, how);
      changed = true;
    }
    if (changed) n++;
  }
  return n;
}
