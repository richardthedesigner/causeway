/**
 * Open OpenStreetMap notes about the ground (DATA-08, survey §2 #11): someone saying a
 * path is blocked, a kerb is missing, steps have appeared. Fetched at build time, so the
 * app never sends a route's area to a third party (D-009).
 *   pnpm build:osm-notes
 * Writes data/places/<area>.osm-notes.json. Notes are part of OSM (ODbL).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AREAS } from "./areas.js";
import { keepNote } from "./osm-notes-lib.js";

const ROOT = join(import.meta.dirname, "..");
const now = new Date();

for (const a of Object.values(AREAS)) {
  const [x0, y0, x1, y1] = a.bbox;
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/notes.json?bbox=${x0},${y0},${x1},${y1}&limit=10000&closed=0`, { headers: { "User-Agent": "Causewayside/0.1 (accessibility routing; weekly build)" } });
  if (!res.ok) throw new Error(`OSM notes: HTTP ${res.status}`);
  const d = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: { id: number; date_created: string; comments: { text: string; date: string }[] } }[] };
  // Kept: about the ground, not a question about a business, and opened or commented on within three years (D-048).
  const notes = d.features
    .map((f) => ({ id: f.properties.id, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], opened: f.properties.date_created, comments: f.properties.comments.slice(1).map((c) => c.date), text: (f.properties.comments[0]?.text ?? "").replace(/\s+/g, " ").trim() }))
    .filter((n) => keepNote(n, now))
    .map(({ comments: _c, ...n }) => ({ ...n, opened: n.opened.slice(0, 10), text: n.text.length > 240 ? `${n.text.slice(0, 237)}…` : n.text }));
  writeFileSync(join(ROOT, "data/places", `${a.name}.osm-notes.json`), JSON.stringify({ area: a.name, source: "OpenStreetMap notes (open)", licence: "ODbL. © OpenStreetMap contributors", fetchedAt: new Date().toISOString().slice(0, 10), notes }));
  console.log(`${a.name}: ${d.features.length} open notes, ${notes.length} about the ground`);
}
