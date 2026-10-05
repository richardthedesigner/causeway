/**
 * Park gates (DATA-08): a route to a park ends at one of its gates, nearest the
 * way you're coming, instead of the middle of the grass. Gates come from OS Open
 * Greenspace (scripts/build-greenspace.ts), which draws parks as sites with
 * access points; The Meadows, for one, is "West Meadow Park" and "East Meadow Park".
 */
import { haversine } from "@causeway/graph";

export interface GreenspaceFile {
  area: string;
  source: string;
  licence: string;
  /** bbox [minLon, minLat, maxLon, maxLat]; gates [lon, lat, 0 pedestrian | 1 also vehicles]. */
  sites: { name: string; function: string; bbox: [number, number, number, number]; gates: [number, number, 0 | 1][] }[];
}

export interface ParkGate {
  park: string;
  lon: number;
  lat: number;
}

/** About 20 m, in degrees, so a park's own point just outside OS's outline still counts. */
const PAD = 0.0002;
const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").trim();

/**
 * Gates for a destination, nearest `from` first, or none when it isn't a park
 * we know. A destination counts if it's a park or garden in our search and sits
 * in an OS greenspace (the smallest one, so a garden inside a park wins), or
 * shares a name with one nearby.
 */
export function parkGates(file: GreenspaceFile | null, to: { name: string; kind: string; lon: number; lat: number }, from: { lon: number; lat: number }, max = 3): ParkGate[] {
  if (!file) return [];
  const kind = to.kind.split(" / ")[0];
  const isPark = kind === "Park" || kind === "Garden";
  const inBox = (b: [number, number, number, number]) => to.lon >= b[0] - PAD && to.lon <= b[2] + PAD && to.lat >= b[1] - PAD && to.lat <= b[3] + PAD;
  const named = (s: GreenspaceFile["sites"][number]) => norm(s.name) === norm(to.name) && haversine([to.lon, to.lat], [(s.bbox[0] + s.bbox[2]) / 2, (s.bbox[1] + s.bbox[3]) / 2]) < 600;
  const size = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
  const site = file.sites.filter((s) => (isPark && inBox(s.bbox)) || named(s)).sort((a, b) => Number(named(b)) - Number(named(a)) || size(a.bbox) - size(b.bbox))[0];
  if (!site) return [];
  return site.gates
    .map(([lon, lat]) => ({ park: site.name, lon, lat, d: haversine([from.lon, from.lat], [lon, lat]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map(({ d: _d, ...g }) => g);
}
