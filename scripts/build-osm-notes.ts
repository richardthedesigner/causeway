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

const ROOT = join(import.meta.dirname, "..");
/** Notes about the ground people walk and wheel on. Shop hours and house numbers are left out. */
// "Closed" alone is mostly shops, so it has to come with something you walk on ("bridge now closed").
export const ABOUT_THE_GROUND = /\b(path|paths|footpath|footway|pavement|sidewalk|steps?|stairs?|kerbs?|curbs?|ramps?|gate|barrier|bollards?|crossing|lift|elevator|surface|cobbles?|setts|wheelchair|step-free|bridge|underpass|subway)\b/i;
/** StreetComplete's own "can't answer" notes are questions for mappers, not reports. */
const QUESTION = /^(Can't answer|Unable to answer|In overlay)/i;

for (const a of Object.values(AREAS)) {
  const [x0, y0, x1, y1] = a.bbox;
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/notes.json?bbox=${x0},${y0},${x1},${y1}&limit=10000&closed=0`, { headers: { "User-Agent": "Causewayside/0.1 (accessibility routing; weekly build)" } });
  if (!res.ok) throw new Error(`OSM notes: HTTP ${res.status}`);
  const d = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: { id: number; date_created: string; comments: { text: string; date: string }[] } }[] };
  const notes = d.features
    .map((f) => ({ id: f.properties.id, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], opened: f.properties.date_created.slice(0, 10), text: (f.properties.comments[0]?.text ?? "").replace(/\s+/g, " ").trim() }))
    .filter((n) => n.text && !QUESTION.test(n.text) && ABOUT_THE_GROUND.test(n.text))
    .map((n) => ({ ...n, text: n.text.length > 240 ? `${n.text.slice(0, 237)}…` : n.text }));
  writeFileSync(join(ROOT, "data/places", `${a.name}.osm-notes.json`), JSON.stringify({ area: a.name, source: "OpenStreetMap notes (open)", licence: "ODbL. © OpenStreetMap contributors", fetchedAt: new Date().toISOString().slice(0, 10), notes }));
  console.log(`${a.name}: ${d.features.length} open notes, ${notes.length} about the ground`);
}
