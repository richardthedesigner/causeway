/**
 * Council footway data as a separate layer (DATA-06, D-008): keyed by
 * "<osm way>:<from node>:<to node>", joined when the city loads, never written
 * into the OSM-derived snapshot. It fills what OSM doesn't know. OSM's own
 * surface and width come first, except a street proxy's surface that OSM only
 * has from the carriageway: there the council's pavement surface wins (DATA-22).
 */
import { attr, isKnown } from "./attribute.js";
import type { Graph, Surface } from "./schema.js";

export interface CouncilFootways {
  area: string;
  source: string;
  licence: string;
  /** Where the gritting routes came from, if the layer has them (DATA-07). */
  gritting?: string;
  /** YYYY-MM-DD: when the council published the footway layer (its DCAT feed), never the build date. */
  observedAt: string;
  /** YYYY-MM-DD: when the council published the gritting routes. */
  grittingObservedAt?: string;
  /** [our surface, width in metres, 1 if it's the pavement alongside a street drawn as one line, 1 if on a priority gritting route]. */
  edges: Record<string, [Surface | null, number | null, 0 | 1, (0 | 1)?]>;
}

/**
 * Edinburgh's surface names to ours. "Other", "Unknown" and "Hard Landscaping" say nothing
 * useful. "Surface Dressing" is chippings rolled into tar: neither smooth asphalt nor a
 * surface we have a word for, so it stays unknown. "Grass" stays unknown too: on a footway
 * polygon it is most likely a verge beside the path, and as a surface it would close the
 * pavement for anyone who avoids grass (D-062).
 */
export function councilSurface(s: string | null | undefined): Surface | null {
  const v = (s ?? "").toLowerCase();
  if (v === "setts") return "sett";
  if (/flags|block paving/.test(v)) return "paving_stones";
  if (v === "concrete") return "concrete";
  if (/^hra|^dbm|^sma/.test(v)) return "asphalt";
  return null;
}

/** A street proxy's surface that OSM only read from the carriageway's tag (packages/graph/src/osm.ts). */
export const carriagewayOnly = (e: { kind: string; attrs: { surface: { state: string; source: string; method?: string } } }) =>
  e.kind === "street_proxy" && e.attrs.surface.state === "inferred" && e.attrs.surface.source === "osm" && /^carriageway surface/.test(e.attrs.surface.method ?? "");

/** Edges people walk or wheel along outside, where gritting applies. */
const PAVEMENT = new Set(["footway", "sidewalk", "pedestrian", "street_proxy", "ramp"]);

/**
 * Fill unknown surfaces and widths from the council layer. Returns how many edges gained something.
 * Both are written as inferred (D-046): the council records the whole footway, matched to our
 * edge by shape, and its width is the full width, not the clear width past bins and posts. So a
 * narrow council width costs time and never closes a pavement on its own.
 * On a street proxy whose OSM surface is only the carriageway's, the council's pavement surface
 * replaces it (DATA-22, D-063): it describes the pavement, OSM's describes the road.
 */
export function applyCouncilFootways(g: Graph, layer: CouncilFootways): number {
  let n = 0;
  // A copy cached on the phone before D-062 has "fetchedAt" (the build date) instead.
  const at = layer.observedAt ?? (layer as { fetchedAt?: string }).fetchedAt ?? null;
  for (const e of g.edges) {
    if (!e.osmWayId) continue;
    const hit = layer.edges[`${e.osmWayId}:${e.from}:${e.to}`];
    // With gritting data, every pavement is known to be on a route or not.
    // The date is the council's for the routes (2021 for Edinburgh), so an old route looks old.
    if (layer.gritting && PAVEMENT.has(e.kind)) e.attrs.gritted = attr(!!hit?.[3], "reported", "council", layer.grittingObservedAt ?? at, layer.gritting);
    if (!hit) continue;
    const [surface, width, alongside] = hit;
    const how = `${layer.source}${alongside ? ", the footways alongside (a narrow stretch or side counts)" : ""}`;
    let changed = false;
    if (surface && (!isKnown(e.attrs.surface) || carriagewayOnly(e))) {
      const over = isKnown(e.attrs.surface) ? `; OSM's ${e.attrs.surface.value} is the carriageway's` : "";
      e.attrs.surface = attr(surface, "inferred", "council", at, `${how}${over}`);
      changed = true;
    }
    if (width !== null && !isKnown(e.attrs.width)) {
      e.attrs.width = attr(width, "inferred", "council", at, how);
      changed = true;
    }
    if (changed) n++;
  }
  return n;
}
