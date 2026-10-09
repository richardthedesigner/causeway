/**
 * Sample content (FEAT-49): a few community reports from a made-up user, so
 * the map shows how reports look while there are few real ones.
 *
 * Kept apart from real data: it lives only in this file, is never written to
 * storage, never sent to the server, can't be voted on or flagged, and never
 * reaches the router. Every item says "Sample" on the map and in its sheet.
 * "Show sample content" in Map layers turns it off; the choice is kept per
 * phone. Richard decides when it goes off by default or goes (OPEN_ITEMS).
 */
import type { CommunityCategory, CommunityReport } from "@causeway/graph";

/** Who sample content is "by". Never a real person's name. */
export const SAMPLE_AUTHOR = "Sample user";
/** Every sample id starts with this, so nothing can mistake one for a real report. */
export const SAMPLE_PREFIX = "sample-";
/** On until Richard says otherwise, while the app has little real content. */
export const SAMPLES_ON_BY_DEFAULT = true;

const KEY = "causewayside.sample-content.v1";

interface Seed {
  id: string;
  category: CommunityCategory;
  lon: number;
  lat: number;
  text: string | null;
  /** Days ago it was seen. */
  seen: number;
  /** Days ago each made-up person agreed. */
  agreed: number[];
  /** Days ago each made-up person disagreed. */
  disagreed?: number[];
}

// Around Causewayside, the Southside and the Old Town: the app's default area. Positions are approximate and the
// words are invented. None of it was seen by anyone.
const EDINBURGH: Seed[] = [
  { id: "dropped-kerb-causewayside", category: "dropped-kerb", lon: -3.1809, lat: 55.9391, text: "Example review: the kerb drops flush at this crossing.", seen: 3, agreed: [2, 1] },
  { id: "no-dropped-kerb-buccleuch", category: "no-dropped-kerb", lon: -3.1863, lat: 55.9421, text: "Example review: a high kerb on this corner, no drop.", seen: 6, agreed: [4] },
  { id: "blocked-pavement-clerk", category: "blocked-pavement", lon: -3.1829, lat: 55.9431, text: "Example review: café tables leave a narrow gap.", seen: 1, agreed: [] },
  { id: "seat-meadows", category: "seat", lon: -3.1921, lat: 55.9409, text: "Example review: benches every hundred metres or so along the path.", seen: 10, agreed: [8, 5, 2] },
  { id: "smooth-pavement-meadow-walk", category: "smooth-pavement", lon: -3.1913, lat: 55.9431, text: null, seen: 20, agreed: [12, 3] },
  { id: "steep-victoria", category: "steep", lon: -3.1937, lat: 55.9484, text: "Example review: steep and curving, hard going uphill.", seen: 30, agreed: [25, 9, 4] },
  { id: "rough-surface-grassmarket", category: "rough-surface", lon: -3.1953, lat: 55.9475, text: "Example review: bumpy setts, slow on small wheels.", seen: 14, agreed: [7], disagreed: [3] },
  { id: "steps-close", category: "steps", lon: -3.1914, lat: 55.9502, text: "Example review: a long flight of steps, no ramp.", seen: 40, agreed: [21, 6] },
  { id: "big-lift-station", category: "big-lift", lon: -3.1893, lat: 55.9518, text: "Example review: room for a large scooter and a companion.", seen: 5, agreed: [2] },
  { id: "accessible-toilet-chambers", category: "accessible-toilet", lon: -3.1899, lat: 55.9467, text: null, seen: 12, agreed: [6, 1] },
];

const SEEDS: Record<string, Seed[]> = { edinburgh: EDINBURGH };

const ago = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

/** The sample reports for a city, dated from `now` so they stay fresh. */
export function sampleReports(city: string, now: Date = new Date()): CommunityReport[] {
  return (SEEDS[city] ?? []).map((s) => ({
    id: `${SAMPLE_PREFIX}${s.id}`,
    city,
    category: s.category,
    lon: s.lon,
    lat: s.lat,
    text: s.text,
    photo: null,
    at: ago(now, s.seen),
    votes: [...s.agreed.map((d) => ({ kind: "agree" as const, at: ago(now, d) })), ...(s.disagreed ?? []).map((d) => ({ kind: "disagree" as const, at: ago(now, d) }))],
    shared: false,
    sample: true,
  }));
}

export const isSample = (r: Pick<CommunityReport, "id" | "sample">): boolean => r.sample === true || r.id.startsWith(SAMPLE_PREFIX);

/** Real reports only: for routes, counts and anything sent anywhere. */
export const realOnly = <T extends Pick<CommunityReport, "id" | "sample">>(reports: readonly T[]): T[] => reports.filter((r) => !isSample(r));

/** Is "Show sample content" on for this phone? A convenience: fine if storage is blocked. */
export function loadShowSamples(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? SAMPLES_ON_BY_DEFAULT : v === "on";
  } catch {
    return SAMPLES_ON_BY_DEFAULT;
  }
}
export function saveShowSamples(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* not remembered: fine */
  }
}
