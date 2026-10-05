/**
 * On-device search over a city's places, addresses, postcodes and streets.
 * Understands category questions ("accessible toilet", "step-free café") as
 * a category plus an access filter. Access facts are OpenStreetMap's own
 * tags, shown with their date and never turned into a verdict.
 */
import { getJson, LiveHttpError } from "@causeway/live";
import type { Place } from "./plan-types";

export interface PlacesFile {
  area: string;
  source: string;
  builtAt: string;
  zones: [number, number, number, number][];
  places: { n: string; c: string; x: number; y: number; a?: Record<string, string>; ad?: string; d?: string; dk?: 1; id: string; /** "overture" when the place came from Overture Maps, not OSM. */ src?: string }[];
  addresses: { n: string; pc: string | null; x: number; y: number }[];
  postcodes: { n: string; x: number; y: number }[];
}

export interface Entry {
  place: Place;
  /** Category tag, "amenity=cafe". Absent for streets, addresses and postcodes. */
  cat?: string;
  access?: Record<string, string>;
  rank: number;
  words: string[];
  /** The name's words run together, so "grass market" finds "Grassmarket" and the other way round. */
  joined: string;
  /** OSM and the Toilet Map disagree about whether this toilet is accessible: shown with both views, never counted on routes (D-065). */
  disputed?: boolean;
}

export interface Index {
  entries: Entry[];
  postcodes: Map<string, Place>;
  zones: [number, number, number, number][];
}

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const LABELS: Record<string, string> = {
  "amenity=cafe": "Café",
  "amenity=fast_food": "Takeaway",
  "amenity=toilets": "Toilets",
  "amenity=pub": "Pub",
  "amenity=bar": "Bar",
  "amenity=restaurant": "Restaurant",
  "amenity=pharmacy": "Pharmacy",
  "amenity=atm": "Cash machine",
  "amenity=bank": "Bank",
  "amenity=place_of_worship": "Place of worship",
  "amenity=doctors": "GP surgery",
  "amenity=dentist": "Dentist",
  "amenity=hospital": "Hospital",
  "amenity=library": "Library",
  "amenity=post_office": "Post office",
  "amenity=cinema": "Cinema",
  "amenity=theatre": "Theatre",
  "amenity=arts_centre": "Arts centre",
  "amenity=community_centre": "Community centre",
  "amenity=social_facility": "Social care",
  "amenity=car_sharing": "Car club",
  "amenity=parking": "Car park",
  "amenity=taxi": "Taxi rank",
  "highway=bus_stop": "Bus stop",
  "railway=station": "Station",
  "railway=halt": "Station",
  "railway=subway_entrance": "Station entrance",
  "railway=tram_stop": "Tram stop",
  "shop=supermarket": "Supermarket",
  "shop=convenience": "Corner shop",
  "shop=hairdresser": "Hairdresser",
  "shop=clothes": "Clothes shop",
  "tourism=hotel": "Hotel",
  "tourism=guest_house": "Guest house",
  "tourism=museum": "Museum",
  "tourism=gallery": "Gallery",
  "tourism=attraction": "Attraction",
  "tourism=information": "Information",
  "tourism=artwork": "Artwork",
  "leisure=park": "Park",
  "leisure=garden": "Garden",
  "leisure=fitness_centre": "Gym",
  "leisure=pitch": "Sports pitch",
  "historic=memorial": "Memorial",
  "office=company": "Office",
};

export function categoryLabel(cat: string): string {
  const l = LABELS[cat];
  if (l) return l;
  const v = cat.split("=")[1] ?? cat;
  const s = v.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Words people type for a category, matched against whole query words. */
const INTENTS: { words: string[]; cats: string[] }[] = [
  { words: ["toilet", "toilets", "loo", "loos", "wc", "lavatory"], cats: ["amenity=toilets"] },
  { words: ["cafe", "cafes", "coffee"], cats: ["amenity=cafe"] },
  { words: ["pub", "pubs"], cats: ["amenity=pub", "amenity=bar"] },
  { words: ["bar", "bars"], cats: ["amenity=bar", "amenity=pub"] },
  { words: ["restaurant", "restaurants", "food", "eat", "lunch", "dinner"], cats: ["amenity=restaurant", "amenity=cafe", "amenity=fast_food"] },
  { words: ["takeaway", "takeaways"], cats: ["amenity=fast_food"] },
  { words: ["pharmacy", "pharmacies", "chemist", "chemists"], cats: ["amenity=pharmacy", "shop=chemist"] },
  { words: ["cash", "atm", "cashpoint"], cats: ["amenity=atm", "amenity=bank"] },
  { words: ["bank", "banks"], cats: ["amenity=bank"] },
  { words: ["hotel", "hotels"], cats: ["tourism=hotel", "tourism=guest_house"] },
  { words: ["museum", "museums"], cats: ["tourism=museum"] },
  { words: ["gallery", "galleries"], cats: ["tourism=gallery", "amenity=arts_centre"] },
  { words: ["library", "libraries"], cats: ["amenity=library"] },
  { words: ["hospital"], cats: ["amenity=hospital"] },
  { words: ["gp", "doctor", "doctors", "surgery"], cats: ["amenity=doctors"] },
  { words: ["dentist"], cats: ["amenity=dentist"] },
  { words: ["supermarket", "groceries", "shop", "shops"], cats: ["shop=supermarket", "shop=convenience"] },
  { words: ["station", "stations", "train", "trains"], cats: ["railway=station", "railway=halt", "railway=subway_entrance"] },
  { words: ["bus"], cats: ["highway=bus_stop"] },
  { words: ["park", "parks", "garden", "gardens"], cats: ["leisure=park", "leisure=garden"] },
  { words: ["cinema"], cats: ["amenity=cinema"] },
  { words: ["theatre", "theatres"], cats: ["amenity=theatre"] },
  { words: ["church", "mosque", "synagogue", "temple", "gurdwara"], cats: ["amenity=place_of_worship"] },
  { words: ["post"], cats: ["amenity=post_office"] },
];

/** Words that ask for somewhere mapped as wheelchair accessible. "Step-free" is the user's word; the filter is OSM's wheelchair tag. */
const ACCESS_WORDS = new Set(["accessible", "wheelchair", "stepfree", "step", "free", "disabled", "disability", "access", "radar", "level"]);
const FILLER = new Set(["a", "an", "the", "near", "nearby", "me", "with", "in", "for", "and", "nearest", "closest", "find", "no", "steps", "entrance"]);

const POSTCODE_FULL = /^([a-z]{1,2}\d[a-z\d]?)\s*(\d[a-z]{2})$/i;
const POSTCODE_START = /^[a-z]{1,2}\d[a-z\d]?(\s*\d[a-z]{0,2})?$/i;

export const formatPostcode = (q: string) => {
  const m = q.trim().match(POSTCODE_FULL);
  return m ? `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}` : null;
};

/** Mapped as wheelchair accessible (or an accessible toilet, for toilets). */
export function accessibleMapped(e: Pick<Entry, "cat" | "access">): boolean {
  const a = e.access ?? {};
  if (e.cat === "amenity=toilets") return a.wheelchair === "yes" || a.wheelchair === "designated";
  return a.wheelchair === "yes" || a.wheelchair === "designated" || a["toilets:wheelchair"] === "yes";
}

const monthYear = (d?: string) => {
  if (!d) return null;
  const [y, m] = d.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return m ? `${months[Number(m) - 1] ?? ""} ${y}`.trim() : y ?? null;
};

/** Plain-English access facts, in the order someone deciding whether to go would want them. */
export function accessFacts(a: Record<string, string> | undefined, cat?: string): string[] {
  if (!a) return [];
  const out: string[] = [];
  const w = a.wheelchair;
  const toilet = cat === "amenity=toilets";
  if (w === "yes" || w === "designated") out.push(toilet ? "Mapped as a wheelchair accessible toilet" : "Mapped as wheelchair accessible");
  else if (w === "limited") out.push("Mapped as partly wheelchair accessible");
  else if (w === "no") out.push(toilet ? "Mapped as not wheelchair accessible" : "Mapped as not wheelchair accessible");
  if (a["toilets:wheelchair"] === "yes") out.push("Accessible toilet");
  else if (a["toilets:wheelchair"] === "no") out.push("No accessible toilet");
  else if (a.toilets === "yes" && !toilet) out.push("Toilets");
  const steps = Number(a.step_count);
  if (Number.isFinite(steps) && a.step_count !== undefined) out.push(steps === 0 ? "No steps at the entrance" : `${steps} step${steps === 1 ? "" : "s"} at the entrance`);
  if (a.automatic_door && a.automatic_door !== "no") out.push("Automatic door");
  if (a.hearing_loop === "yes") out.push("Hearing loop");
  if (a.changing_table === "yes") out.push("Baby changing");
  if (a["wheelchair:description"]) out.push(`“${a["wheelchair:description"]}”`);
  return out;
}

/** A search entry for a place: its words, run-together name and rank (lower first). */
export const makeEntry = (place: Place, rank: number, extraWords = "", cat?: string, access?: Record<string, string>): Entry => ({
  place,
  rank,
  cat,
  access,
  words: norm(`${place.name} ${extraWords}`).split(" "),
  joined: norm(place.name).replace(/ /g, ""),
});

export function buildIndex(file: PlacesFile | null, extra: Place[]): Index {
  const entries: Entry[] = [];
  const add = (place: Place, rank: number, extraWords = "", cat?: string, access?: Record<string, string>) => entries.push(makeEntry(place, rank, extraWords, cat, access));

  for (const p of extra) add(p, p.kind === "Street" ? 1 : 0, p.kind);
  const postcodes = new Map<string, Place>();
  if (file) {
    for (const p of file.places) {
      const label = categoryLabel(p.c);
      const facts = accessFacts(p.a, p.c);
      const name = p.n || (p.ad ? `${label}, ${p.ad.split(",")[0]}` : label);
      const place: Place = {
        id: p.src === "overture" ? `overture:${p.id}` : `osm:${p.id}`,
        name,
        kind: [label, p.ad].filter(Boolean).join(" / "),
        lon: p.x,
        lat: p.y,
        venue: p.c !== "highway=bus_stop",
        facts: facts.length ? facts : undefined,
        factsSource: facts.length ? `OpenStreetMap, ${p.dk ? "checked" : "edited"} ${monthYear(p.d) ?? "date unknown"}` : undefined,
        hours: p.a?.opening_hours,
      };
      // OSM first when names tie: it is the source with access tags.
      add(place, p.c === "highway=bus_stop" ? 3 : p.src === "overture" ? 2.5 : 2, p.ad ?? "", p.c, p.a);
    }
    for (const a of file.addresses) add({ id: `addr:${a.n}:${a.x}`, name: a.n, kind: a.pc ? `Address / ${a.pc}` : "Address", lon: a.x, lat: a.y, venue: true }, 4, a.pc ?? "");
    for (const pc of file.postcodes) postcodes.set(pc.n.replace(/\s/g, ""), { id: `pc:${pc.n}`, name: pc.n, kind: "Postcode", lon: pc.x, lat: pc.y });
  }
  return { entries, postcodes, zones: file?.zones ?? [] };
}

const dist = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * k, a.lat - b.lat) * 111_320;
};

export interface Query {
  /** Name words left after category and access words are taken out. */
  terms: string[];
  cats: string[] | null;
  accessible: boolean;
  postcode: string | null;
}

export function parseQuery(q: string): Query {
  const words = norm(q.replace(/step[\s-]*free/gi, "stepfree")).split(" ").filter(Boolean);
  const postcode = POSTCODE_START.test(q.trim()) ? q.trim().toUpperCase().replace(/\s+/g, " ") : null;
  let cats: string[] | null = null;
  let accessible = false;
  const terms: string[] = [];
  for (const w of words) {
    const intent = INTENTS.find((i) => i.words.includes(w));
    if (intent && !cats) cats = intent.cats;
    else if (ACCESS_WORDS.has(w)) accessible = true;
    else if (!FILLER.has(w)) terms.push(w);
  }
  return { terms, cats, accessible, postcode };
}

export interface Hit {
  place: Place;
  cat?: string;
  access?: Record<string, string>;
  metres: number;
}

/**
 * Search the index. Name matches need every typed word to start a word in the
 * name or address, or the typed words run together to start the name run
 * together (spaces don't count: "grass market" finds "Grassmarket"). Category questions list that category nearest first; with
 * an access word, only places mapped as wheelchair accessible.
 */
export function search(index: Index, q: string, near: { lon: number; lat: number }, limit = 25): { hits: Hit[]; query: Query; hiddenNotMapped: number } {
  const query = parseQuery(q);
  const hits: (Hit & { score: number })[] = [];
  let hiddenNotMapped = 0;
  const raw = norm(q);
  if (!raw) return { hits: [], query, hiddenNotMapped };

  if (query.postcode) {
    const key = query.postcode.replace(/\s/g, "");
    for (const [k, p] of index.postcodes) if (k.startsWith(key)) hits.push({ place: p, metres: dist(p, near), score: k === key ? -2 : -1 });
  }

  // Name words: everything typed except filler and access words. A category word can also be part of a name ("Bank Street").
  const nameTerms = norm(q.replace(/step[\s-]*free/gi, "stepfree"))
    .split(" ")
    .filter((w) => w && !FILLER.has(w) && !ACCESS_WORDS.has(w));
  const byName = !query.cats || query.terms.length > 0;
  const joinedTerms = nameTerms.join("");
  const rawJoined = raw.replace(/ /g, "");
  for (const e of index.entries) {
    if (query.cats && e.cat && query.cats.includes(e.cat)) {
      if (!e.cat || !query.cats.includes(e.cat)) continue;
      if (query.terms.length && !query.terms.every((t) => e.words.some((w) => w.startsWith(t)))) continue;
      if (query.accessible && !accessibleMapped(e)) {
        hiddenNotMapped++;
        continue;
      }
      const m = dist(e.place, near);
      hits.push({ place: e.place, cat: e.cat, access: e.access, metres: m, score: query.terms.length ? 5 + m / 1000 : m / 100 });
      continue;
    }
    if (!byName || !nameTerms.length) continue;
    if (!nameTerms.every((t) => e.words.some((w) => w.startsWith(t))) && !e.joined.startsWith(joinedTerms)) continue;
    if (query.accessible && e.cat && !accessibleMapped(e)) {
      hiddenNotMapped++;
      continue;
    }
    const m = dist(e.place, near);
    const match = e.joined === rawJoined ? 0 : e.joined.startsWith(rawJoined) ? 1 : 2;
    hits.push({ place: e.place, cat: e.cat, access: e.access, metres: m, score: match * 10 + e.rank * 2 + Math.min(m / 1000, 5) });
  }
  hits.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const h of hits) {
    const key = `${h.place.name}|${Math.round(h.place.lon * 2000)}|${Math.round(h.place.lat * 2000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ place: h.place, cat: h.cat, access: h.access, metres: h.metres });
    if (out.length >= limit) break;
  }
  return { hits: out, query, hiddenNotMapped };
}

/** Inside the area the router has a network for. */
export const inZones = (index: Index, p: { lon: number; lat: number }) => !index.zones.length || index.zones.some((z) => z[0] <= p.lon && p.lon <= z[2] && z[1] <= p.lat && p.lat <= z[3]);

/** How long a live search lookup gets. Someone is waiting on the list, so it's shorter than the feeds' limit. */
const SEARCH_TIMEOUT_MS = 6_000;

/** A full postcode the local index doesn't have, from postcodes.io (Open Government Licence; ONS and Royal Mail data). */
export async function lookupPostcode(pc: string, signal?: AbortSignal): Promise<Place | null> {
  type Found = { result?: { postcode: string; longitude: number | null; latitude: number | null; admin_ward?: string } };
  // A live lookup gets a few seconds; past that the local results stand (STAB-05). Unknown postcodes are a 404.
  const j = await getJson<Found>(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, "postcodes.io", { signal, timeoutMs: SEARCH_TIMEOUT_MS }).catch((e: unknown) => {
    if (e instanceof LiveHttpError) return null;
    throw e;
  });
  if (!j) return null;
  const r = j.result;
  if (!r || r.longitude == null || r.latitude == null) return null;
  return { id: `pc:${r.postcode}`, name: r.postcode, kind: r.admin_ward ? `Postcode / ${r.admin_ward}` : "Postcode", lon: r.longitude, lat: r.latitude };
}

/** Live search from Photon (OpenStreetMap data, komoot's public instance) for anything the bundled index misses. */
export async function photon(q: string, near: { lon: number; lat: number }, bbox: [number, number, number, number], signal?: AbortSignal): Promise<Place[]> {
  const u = new URL("https://photon.komoot.io/api/");
  u.searchParams.set("q", q);
  u.searchParams.set("lat", String(near.lat));
  u.searchParams.set("lon", String(near.lon));
  u.searchParams.set("limit", "8");
  u.searchParams.set("lang", "en");
  u.searchParams.set("bbox", bbox.join(","));
  type Found = { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[] };
  const j = await getJson<Found>(u.toString(), "Photon", { signal, timeoutMs: SEARCH_TIMEOUT_MS }).catch((e: unknown) => {
    if (e instanceof LiveHttpError) return null;
    throw e;
  });
  if (!j) return [];
  return j.features.map((f) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const name = p.name ?? street ?? "Unnamed place";
    const kind = [p.osm_value ? categoryLabel(`${p.osm_key}=${p.osm_value}`) : null, p.name ? street : null, p.postcode].filter(Boolean).join(" / ");
    const [lon, lat] = f.geometry.coordinates;
    return { id: `photon:${p.osm_type}${p.osm_id}`, name, kind: kind || "Place", lon, lat, venue: p.osm_key !== "highway" && p.osm_key !== "place" };
  });
}
