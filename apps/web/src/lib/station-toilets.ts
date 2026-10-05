/**
 * Toilets TfL lists at its stations (DATA-23), from the station data already in
 * the rail network file (DATA-03). One place per station, in search and in the
 * toilet layer. A toilet inside the ticket gates needs a ticket, so it's marked
 * for customers and the router doesn't offer it as a stop on the way.
 */
import type { TransitStation } from "@causeway/graph";
import type { Index } from "./search";
import { accessFacts, makeEntry } from "./search";

export interface NetworkFile {
  fetchedAt?: string;
  stations: Record<string, TransitStation>;
}

/** An OSM toilet this close is taken to be the station's own. */
const SAME_M = 50;
const SOURCE = "TfL station data";

/** Adds and fills in place. Returns how many stations were added and how many OSM toilets gained facts. */
export function mergeStationToilets(index: Index, file: NetworkFile | null): { added: number; filled: number } {
  if (!file) return { added: 0, filled: 0 };
  const osm = index.entries.filter((e) => e.cat === "amenity=toilets");
  let added = 0,
    filled = 0;
  for (const s of Object.values(file.stations)) {
    const loos = s.access?.toilets ?? [];
    if (!loos.length) continue;
    // The one that matters most: accessible, and then outside the gates.
    const best = [...loos].sort((a, b) => Number(b.accessible) - Number(a.accessible) || Number(a.insideGate) - Number(b.insideGate))[0]!;
    const tags: Record<string, string> = { wheelchair: best.accessible ? "yes" : "no" };
    if (loos.some((t) => t.radar)) tags.centralkey = "yes";
    if (best.insideGate) tags.access = "customers";
    const notes = [best.insideGate ? "Inside the ticket gates" : "Outside the ticket gates", best.location].filter((x): x is string => !!x);
    const k = Math.cos((s.lat * Math.PI) / 180);
    const same = osm
      .map((e) => ({ e, d: Math.hypot((e.place.lon - s.lon) * k, e.place.lat - s.lat) * 111_320 }))
      .filter((x) => x.d <= SAME_M)
      .sort((a, b) => a.d - b.d)[0]?.e;
    if (same) {
      // OSM's own tags win; TfL only fills gaps.
      const access = { ...same.access };
      let gained = false;
      for (const [key, v] of Object.entries(tags)) if (access[key] === undefined) (access[key] = v), (gained = true);
      if (!gained) continue;
      same.access = access;
      same.place = { ...same.place, facts: [...accessFacts(access, same.cat), ...notes], factsSource: [same.place.factsSource, SOURCE].filter(Boolean).join("; ") };
      filled++;
      continue;
    }
    index.entries.push(
      makeEntry(
        { id: `tfl-toilet:${s.id}`, name: `Toilets at ${s.name} station`, kind: "Toilets", lon: s.lon, lat: s.lat, venue: true, facts: [...accessFacts(tags, "amenity=toilets"), ...notes], factsSource: SOURCE },
        2.6,
        `toilet toilets loo ${s.name}`,
        "amenity=toilets",
        tags,
      ),
    );
    added++;
  }
  return { added, filled };
}
