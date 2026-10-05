/**
 * The Great British Public Toilet Map (CC BY 4.0; DATA-09) merged into a city's
 * search index. A toilet OSM already has gains the facts OSM is missing
 * (accessible, RADAR key, hours); one OSM hasn't mapped is added. Either way the
 * place says where the facts came from and when they were last checked.
 *
 * Where OSM and the Toilet Map disagree on whether the toilet is accessible, the
 * first fact says so before anything else ("Sources differ: OpenStreetMap says
 * accessible, the Toilet Map says not accessible"), and the toilet is never
 * counted on routes. A record last checked over 2 years ago says it may be out
 * of date, after any dispute, and an added one ranks a little lower in search
 * (D-065, from PR #36).
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
/** Older than this, a Toilet Map record may be out of date (D-065). */
export const TOILET_MAP_STALE_MS = 2 * 365.25 * 86_400_000;
/** Search rank of a toilet OSM hasn't mapped (lower first), and of one whose record is old. */
const RANK = 2.6,
  RANK_OLD = 3.1;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "date unknown");

/** OSM's wheelchair tag on a toilet, comparable with the Toilet Map's yes or no. */
const osmAccessible = (w: string | undefined): boolean | "limited" | null => (w === "yes" || w === "designated" ? true : w === "no" ? false : w === "limited" ? "limited" : null);
const said = (v: boolean | "limited") => (v === "limited" ? "partly accessible" : v ? "accessible" : "not accessible");

/** The first fact leads with a dispute, then any warning that the record is old, then what it was. */
function firstFact(facts: string[], lead: string[]): string[] {
  if (!lead.length) return facts;
  const head = lead.join(". ");
  return facts.length ? [`${head}. ${facts[0]}`, ...facts.slice(1)] : [head];
}

/** Adds and fills in place. Returns how many toilets were added, how many OSM toilets gained facts, and how many disagree on access. */
export function mergeToiletMap(index: Index, file: ToiletMapFile | null, now = new Date()): { added: number; filled: number; disputed: number } {
  if (!file) return { added: 0, filled: 0, disputed: 0 };
  const osm = index.entries.filter((e) => e.cat === "amenity=toilets");
  let added = 0,
    filled = 0,
    disputed = 0;
  for (const t of file.toilets) {
    const tm: Record<string, string> = {};
    if (t.accessible !== null) tm.wheelchair = t.accessible ? "yes" : "no";
    if (t.radar) tm.centralkey = "yes";
    if (t.free !== null) tm.fee = t.free ? "no" : "yes";
    if (t.babyChange) tm.changing_table = "yes";
    if (t.hours) tm.opening_hours = t.hours;
    const when = `${t.verified ? "checked" : "updated"} ${monthYear(t.checked)}`;
    const old = !!t.checked && now.getTime() - Date.parse(t.checked) > TOILET_MAP_STALE_MS;
    const source = `Great British Public Toilet Map, ${when}${old ? ", over 2 years ago" : ""}`;
    const oldNote = `Toilet Map last ${when}, may be out of date`;
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
      const ov = osmAccessible(same.access?.wheelchair);
      const dispute = ov !== null && t.accessible !== null && ov !== t.accessible;
      if (!gained && !dispute) continue;
      same.access = access;
      const lead = dispute ? [`Sources differ: OpenStreetMap says ${said(ov)}, the Toilet Map says ${said(t.accessible!)}`] : [];
      if (old) lead.push(oldNote);
      same.place = { ...same.place, facts: firstFact(accessFacts(access, same.cat), lead), factsSource: [same.place.factsSource, source].filter(Boolean).join("; "), hours: access.opening_hours };
      if (same.place.facts?.length === 0) same.place = { ...same.place, facts: undefined };
      if (dispute) (same.disputed = true), disputed++;
      if (gained) filled++;
      continue;
    }
    const facts = firstFact(accessFacts(tm, "amenity=toilets"), old ? [oldNote] : []);
    index.entries.push(
      makeEntry(
        { id: `toiletmap:${t.id}`, name: t.name ?? "Public toilet", kind: "Toilets", lon: t.x, lat: t.y, venue: true, facts: facts.length ? facts : undefined, factsSource: source, hours: t.hours },
        old ? RANK_OLD : RANK,
        "toilet toilets loo",
        "amenity=toilets",
        tm,
      ),
    );
    added++;
  }
  return { added, filled, disputed };
}
