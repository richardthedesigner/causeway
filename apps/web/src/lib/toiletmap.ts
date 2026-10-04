/**
 * The Great British Public Toilet Map (CC BY 4.0; DATA-09) merged into a city's
 * search index. A toilet OSM already has gains the facts OSM is missing
 * (accessible, RADAR key, hours); one OSM hasn't mapped is added. Either way the
 * place says where the facts came from and when they were last checked.
 */
import type { Index } from "./search";
import { accessFacts, makeEntry } from "./search";

export interface ToiletMapFile {
  area: string;
  source: string;
  licence: string;
  exportedAt: string;
  toilets: {
    id: string;
    x: number;
    y: number;
    name: string | null;
    accessible: boolean | null;
    radar: boolean | null;
    free: boolean | null;
    babyChange: boolean | null;
    /** OSM opening_hours, converted from the Toilet Map's weekly times. */
    hours?: string;
    checked: string | null;
    /** Checked by someone on the ground, not just edited. */
    verified: boolean;
  }[];
}

/** An OSM toilet this close is taken to be the same toilet. */
const SAME_M = 30;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "date unknown");

/** Adds and fills in place. Returns how many toilets were added and how many OSM toilets gained facts. */
export function mergeToiletMap(index: Index, file: ToiletMapFile | null): { added: number; filled: number } {
  if (!file) return { added: 0, filled: 0 };
  const osm = index.entries.filter((e) => e.cat === "amenity=toilets");
  let added = 0,
    filled = 0;
  for (const t of file.toilets) {
    const tm: Record<string, string> = {};
    if (t.accessible !== null) tm.wheelchair = t.accessible ? "yes" : "no";
    if (t.radar) tm.centralkey = "yes";
    if (t.free !== null) tm.fee = t.free ? "no" : "yes";
    if (t.babyChange) tm.changing_table = "yes";
    if (t.hours) tm.opening_hours = t.hours;
    const source = `Great British Public Toilet Map, ${t.verified ? "checked" : "updated"} ${monthYear(t.checked)}`;
    const k = Math.cos((t.y * Math.PI) / 180);
    const same = osm
      .map((e) => ({ e, d: Math.hypot((e.place.lon - t.x) * k, e.place.lat - t.y) * 111_320 }))
      .filter((x) => x.d <= SAME_M)
      .sort((a, b) => a.d - b.d)[0]?.e;
    if (same) {
      // OSM's own tags win; the Toilet Map only fills gaps.
      const access = { ...same.access };
      let gained = false;
      for (const [key, v] of Object.entries(tm)) if (access[key] === undefined) (access[key] = v), (gained = true);
      if (!gained) continue;
      same.access = access;
      const facts = accessFacts(access, same.cat);
      same.place = { ...same.place, facts: facts.length ? facts : undefined, factsSource: [same.place.factsSource, source].filter(Boolean).join("; "), hours: access.opening_hours };
      filled++;
      continue;
    }
    const facts = accessFacts(tm, "amenity=toilets");
    index.entries.push(
      makeEntry(
        { id: `toiletmap:${t.id}`, name: t.name ?? "Public toilet", kind: "Toilets", lon: t.x, lat: t.y, venue: true, facts: facts.length ? facts : undefined, factsSource: source, hours: t.hours },
        2.6,
        "toilet toilets loo",
        "amenity=toilets",
        tm,
      ),
    );
    added++;
  }
  return { added, filled };
}
