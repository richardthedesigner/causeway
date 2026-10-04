/**
 * Accessible toilets along a route: public toilets mapped as wheelchair
 * accessible, and venues mapped as having an accessible toilet (usually for
 * customers). Facts are OSM's, with what matters on arrival: RADAR key,
 * Changing Places, fee, hours, customers only.
 */
import type { Entry, Index } from "./search";

export interface RouteToilet {
  name: string;
  lon: number;
  lat: number;
  /** Metres along the route to the nearest point, and how far off it the toilet is. */
  at: number;
  offM: number;
  /** A public toilet, or one inside a venue. */
  public: boolean;
  facts: string[];
}

const RADAR = /^(yes|radar)$/i;

function factsOf(a: Record<string, string>, isPublic: boolean): string[] {
  const out: string[] = [];
  if (a.changing_places === "yes") out.push("Changing Places");
  if (a.centralkey && RADAR.test(a.centralkey)) out.push("RADAR key");
  if (!isPublic || a.access === "customers") out.push("Customers");
  if (a.fee === "yes") out.push("Fee");
  else if (a.fee === "no") out.push("Free");
  if (a.opening_hours) out.push(a.opening_hours === "24/7" ? "Open 24 hours" : `Hours: ${a.opening_hours}`);
  if (a.changing_table === "yes") out.push("Baby changing");
  return out;
}

const accessibleToilet = (e: Entry): boolean | null => {
  const a = e.access ?? {};
  if (e.cat === "amenity=toilets") return a.wheelchair === "yes" || a.wheelchair === "designated" ? true : null;
  return a["toilets:wheelchair"] === "yes" ? false : null;
};

export function toiletsAlong(index: Index, coords: [number, number][], withinM = 80): { toilets: RouteToilet[]; longestGapM: number } {
  if (coords.length < 2) return { toilets: [], longestGapM: 0 };
  const cum = [0];
  const k = Math.cos((coords[0]![1] * Math.PI) / 180);
  const dist = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111_320;
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1]! + dist(coords[i - 1]!, coords[i]!));
  const pad = withinM / 111_320;
  const xs = coords.map((c) => c[0]),
    ys = coords.map((c) => c[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - pad / k, Math.max(...xs) + pad / k, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const out: RouteToilet[] = [];
  for (const e of index.entries) {
    const isPublic = accessibleToilet(e);
    if (isPublic === null) continue;
    const { lon, lat } = e.place;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    let best: { d: number; at: number } | null = null;
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]!,
        b = coords[i + 1]!;
      const ax = (a[0] - lon) * k,
        ay = a[1] - lat,
        bx = (b[0] - lon) * k,
        by = b[1] - lat;
      const dx = bx - ax,
        dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy) * 111_320;
      if (d <= withinM && (!best || d < best.d)) best = { d, at: cum[i]! + t * (cum[i + 1]! - cum[i]!) };
    }
    if (!best) continue;
    out.push({ name: e.place.name, lon, lat, at: Math.round(best.at), offM: Math.round(best.d), public: isPublic, facts: factsOf(e.access ?? {}, isPublic) });
  }
  out.sort((a, b) => a.at - b.at);
  const stops = [0, ...out.map((t) => t.at), cum[cum.length - 1]!];
  let gap = 0;
  for (let i = 1; i < stops.length; i++) gap = Math.max(gap, stops[i]! - stops[i - 1]!);
  return { toilets: out, longestGapM: Math.round(gap) };
}
