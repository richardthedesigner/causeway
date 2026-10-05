/**
 * The Great British Public Toilet Map's daily export (Public Convenience Ltd, CC BY 4.0;
 * DATA-09, survey §2 #9), cut to each area. The app merges it into the search index
 * (apps/web/src/lib/toiletmap.ts): it fills accessibility and RADAR facts OSM lacks,
 * adds toilets OSM hasn't mapped, and says when each was last checked.
 *   pnpm build:toilets
 * Writes data/places/<area>.toiletmap.json.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AREAS } from "./areas.js";

const ROOT = join(import.meta.dirname, "..");
const PAGE = "https://www.toiletmap.org.uk/dataset";

interface Loo {
  id: string;
  name: string | null;
  active: boolean | null;
  accessible: boolean | null;
  radar: boolean | null;
  no_payment: boolean | null;
  baby_change: boolean | null;
  verified_at: string | null;
  updated_at: string | null;
  opening_times: ([string, string] | [])[] | null;
  location: { coordinates: [number, number] };
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
/** Seven [open, close] pairs (Monday first, [] closed) as OSM opening_hours: "Mo-Fr 09:00-17:00; Sa,Su off". */
export function osmHours(times: Loo["opening_times"]): string | undefined {
  if (!times || times.length !== 7) return undefined;
  const day = (t: [string, string] | []) => (t.length !== 2 ? "off" : t[0] === "00:00" && (t[1] === "00:00" || t[1] === "24:00") ? "00:00-24:00" : `${t[0]}-${t[1]}`);
  const v = times.map(day);
  if (v.every((x) => x === "00:00-24:00")) return "24/7";
  const runs: string[] = [];
  for (let i = 0; i < 7; ) {
    let j = i;
    while (j + 1 < 7 && v[j + 1] === v[i]) j++;
    runs.push(`${j === i ? DAYS[i] : `${DAYS[i]}-${DAYS[j]}`} ${v[i]}`);
    i = j + 1;
  }
  return runs.join("; ");
}

const html = await (await fetch(PAGE)).text();
const url = html.match(/https:\/\/[^"]+\.json\?download=1/)?.[0]?.replace(/&amp;/g, "&");
if (!url) throw new Error("Toilet Map: no JSON export link on the dataset page");
const exportedAt = decodeURIComponent(url).match(/toilets-(\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().slice(0, 10);
const loos = (await (await fetch(url)).json()) as Loo[];

for (const a of Object.values(AREAS)) {
  const [x0, y0, x1, y1] = a.bbox;
  const toilets = loos
    .filter((l) => l.active !== false)
    .filter((l) => {
      const [x, y] = l.location.coordinates;
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    })
    .map((l) => ({
      id: l.id,
      x: Math.round(l.location.coordinates[0] * 1e6) / 1e6,
      y: Math.round(l.location.coordinates[1] * 1e6) / 1e6,
      name: l.name?.trim() || null,
      accessible: l.accessible,
      radar: l.radar,
      free: l.no_payment,
      babyChange: l.baby_change,
      hours: osmHours(l.opening_times),
      // Verified by someone on the ground; otherwise last updated.
      checked: (l.verified_at ?? l.updated_at)?.slice(0, 10) ?? null,
      verified: !!l.verified_at,
    }));
  writeFileSync(join(ROOT, "data/places", `${a.name}.toiletmap.json`), JSON.stringify({ area: a.name, source: "Great British Public Toilet Map", licence: "CC BY 4.0. Public Convenience Ltd", exportedAt, toilets }));
  console.log(`${a.name}: ${toilets.length} toilets (${toilets.filter((t) => t.accessible).length} accessible, ${toilets.filter((t) => t.radar).length} RADAR)`);
}
