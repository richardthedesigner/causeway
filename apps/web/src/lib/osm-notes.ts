/**
 * Open OpenStreetMap notes about the ground near a route (DATA-08): soft signals,
 * shown with the route and never used to change it. They come from the build
 * (scripts/build-osm-notes.ts), so no route leaves the device.
 */
import { haversine } from "@causeway/graph";
import type { OnRouteItem } from "@causeway/router";

export interface OsmNotesFile {
  area: string;
  source: string;
  licence: string;
  fetchedAt: string;
  notes: { id: number; lon: number; lat: number; opened: string; text: string }[];
}

/** Where the list says they're from (D-067). */
const NOTES_SOURCE = "OpenStreetMap Notes";
/** At most this many are listed; one line counts the rest (D-048). */
const NOTES_LISTED = 3;

/**
 * Notes within `withinM` of the route's line, in order along it, as "On this
 * route" items: worth knowing, reported by people, dated when the note was
 * opened. Past `max`, one line counts the rest.
 */
export function osmNoteItems(file: OsmNotesFile | null, coords: [number, number][], withinM = 20, max = NOTES_LISTED): OnRouteItem[] {
  if (!file?.notes.length || coords.length < 2) return [];
  const xs = coords.map((c) => c[0]),
    ys = coords.map((c) => c[1]);
  const pad = 0.0005;
  const [x0, y0, x1, y1] = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  const hits: { at: number; text: string; opened: string }[] = [];
  for (const n of file.notes) {
    if (n.lon < x0 || n.lon > x1 || n.lat < y0 || n.lat > y1) continue;
    const k = Math.cos((n.lat * Math.PI) / 180);
    let best = { d: Infinity, at: 0 };
    let along = 0;
    for (let i = 1; i < coords.length; i++) {
      const [a, b] = [coords[i - 1]!, coords[i]!];
      const [vx, vy] = [(b[0] - a[0]) * k, b[1] - a[1]];
      const t = Math.max(0, Math.min(1, ((n.lon - a[0]) * k * vx + (n.lat - a[1]) * vy) / (vx * vx + vy * vy || 1)));
      const p: [number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const d = haversine([n.lon, n.lat], p);
      if (d < best.d) best = { d, at: along + t * haversine(a, b) };
      along += haversine(a, b);
    }
    if (best.d <= withinM) hits.push({ at: best.at, text: n.text, opened: n.opened });
  }
  hits.sort((a, b) => a.at - b.at);
  const item = (text: string, date: string | null): OnRouteItem => ({ group: "info", text, where: [], label: "reported", source: NOTES_SOURCE, date, until: null });
  const out = hits.slice(0, max).map((h) => item(`A mapper wrote: “${h.text}” Not checked by us`, h.opened));
  const rest = hits.slice(max);
  if (rest.length) out.push(item(`${rest.length} more ${rest.length === 1 ? "place" : "places"} a mapper flagged on this route`, rest.map((h) => h.opened).sort().at(-1)!));
  return out;
}
