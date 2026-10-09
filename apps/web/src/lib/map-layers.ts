/**
 * What the map shows (FEAT-49): the layers menu's switches, their defaults for
 * each kind of mobility, and how the graph's own facts become map features.
 * Until you change a switch the map suits the profile you're routing for;
 * once you do, your choice is kept on this phone. Proposal: docs/plans/MAP_LAYERS.md.
 */
import { isKnown, type Amenity, type GraphEdge, type GraphNode, type Surface } from "@causeway/graph";
import type { MobilityPreset } from "@causeway/profile";

export interface MapLayers {
  /** Every street coloured by its steepest stretch. */
  slopes: boolean;
  steps: boolean;
  /** Setts, cobbles, gravel and grass, or a surface mapped as bad. */
  rough: boolean;
  /** Paths with a known width under NARROW_M. */
  narrow: boolean;
  /** Kerbs mapped at crossings: dropped or flush, and raised. */
  kerbs: boolean;
  /** Toilets mapped as wheelchair accessible, from OSM, the Toilet Map and TfL. */
  toilets: boolean;
  /** Benches and seats mapped in OSM. */
  benches: boolean;
}

export type LayerId = keyof MapLayers;

/**
 * Narrower than this is "narrow" on the map. Between Inclusive Mobility's
 * normal 2 m and its 1 m absolute minimum at obstacles (survey §4.1).
 */
export const NARROW_M = 1.5;

const ROUGH: ReadonlySet<Surface> = new Set(["sett", "cobblestone", "gravel", "grass"]);
const BAD = new Set(["bad", "very_bad", "horrible"]);

const RESTS: ReadonlySet<MobilityPreset> = new Set(["walking", "walking-stick", "crutches", "fatigue", "rollator"]);
const WHEELS: ReadonlySet<MobilityPreset> = new Set(["manual-wheelchair", "manual-wheelchair-companion", "powerchair", "powerchair-light", "mobility-scooter", "mobility-scooter-road", "rollator", "pram"]);

/**
 * What suits each kind of mobility, before you choose. Steps matter to
 * everyone. On wheels, kerbs, rough ground and narrow paths are what stop you;
 * walking, rough ground trips you; with low vision, kerbs and their tactile
 * paving are how you find a crossing. Accessible toilets help everyone; benches
 * help those who need to rest. Slopes colour every street, which is busy, so they
 * stay off until asked for.
 */
export function layersFor(preset: MobilityPreset): MapLayers {
  const benches = RESTS.has(preset);
  if (WHEELS.has(preset)) return { slopes: false, steps: true, rough: true, narrow: true, kerbs: true, toilets: true, benches };
  if (preset === "visual-impairment") return { slopes: false, steps: true, rough: false, narrow: false, kerbs: true, toilets: true, benches };
  return { slopes: false, steps: true, rough: true, narrow: false, kerbs: false, toilets: true, benches };
}

export const sameLayers = (a: MapLayers, b: MapLayers) => (Object.keys(a) as LayerId[]).every((k) => a[k] === b[k]);

const KEY = "causewayside.map-layers.v1";
const IDS: LayerId[] = ["slopes", "steps", "rough", "narrow", "kerbs", "toilets", "benches"];

/** Your choice, or null if you haven't made one (the map then suits the profile). */
export function loadMapLayers(): MapLayers | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, unknown> | null;
    if (!v || typeof v !== "object" || !IDS.every((k) => typeof v[k] === "boolean")) return null;
    return Object.fromEntries(IDS.map((k) => [k, v[k]])) as unknown as MapLayers;
  } catch {
    return null;
  }
}

/** Null forgets the choice, so the map suits the profile again. */
export function saveMapLayers(l: MapLayers | null) {
  try {
    if (l) localStorage.setItem(KEY, JSON.stringify(l));
    else localStorage.removeItem(KEY);
  } catch {
    /* Private mode: it lasts until the page closes. */
  }
}

/** A way's surface is rough: setts, cobbles, gravel or grass, or mapped as bad going. */
export function isRough(e: Pick<GraphEdge, "attrs">): boolean {
  const s = e.attrs.surface;
  const sm = e.attrs.smoothness;
  return (isKnown(s) && ROUGH.has(s.value)) || (isKnown(sm) && BAD.has(sm.value));
}

/** A way's known width is under NARROW_M. Unknown width is not narrow: we don't say what we don't know. */
export function isNarrow(e: Pick<GraphEdge, "attrs">): boolean {
  const w = e.attrs.width;
  return isKnown(w) && w.value < NARROW_M;
}

export interface MapKerb {
  lon: number;
  lat: number;
  /** Raised or rolled; otherwise dropped or flush. */
  raised: boolean;
}

/** Kerbs whose type is mapped. Unmapped kerbs are left off, not guessed. */
export function mapKerbs(nodes: readonly Pick<GraphNode, "lon" | "lat" | "kerb">[]): MapKerb[] {
  const out: MapKerb[] = [];
  for (const n of nodes) {
    const t = n.kerb?.type;
    if (!t || !isKnown(t)) continue;
    out.push({ lon: n.lon, lat: n.lat, raised: t.value === "raised" || t.value === "rolled" });
  }
  return out;
}

/** Benches and seats from the graph's amenities, as [lon, lat]. */
export const mapBenches = (amenities: readonly Pick<Amenity, "lon" | "lat" | "kind">[] = []): [number, number][] => amenities.filter((a) => a.kind === "bench").map((a) => [a.lon, a.lat]);
