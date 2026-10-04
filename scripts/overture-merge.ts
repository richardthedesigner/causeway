/** Merging Overture places into the OSM search index (scripts/build-places.ts). */
/** Overture basic categories that mean the same as an OSM tag we already label and search by. */
const OVERTURE_TO_OSM: Record<string, string> = {
  cafe: "amenity=cafe",
  coffee_shop: "amenity=cafe",
  restaurant: "amenity=restaurant",
  casual_eatery: "amenity=restaurant",
  fast_food_restaurant: "amenity=fast_food",
  bar: "amenity=bar",
  pub: "amenity=pub",
  pharmacy: "amenity=pharmacy",
  hotel: "tourism=hotel",
  museum: "tourism=museum",
  art_gallery: "tourism=gallery",
  library: "amenity=library",
  hospital: "amenity=hospital",
  doctor: "amenity=doctors",
  dentist: "amenity=dentist",
  bank: "amenity=bank",
  atm: "amenity=atm",
  supermarket: "shop=supermarket",
  grocery_store: "shop=supermarket",
  convenience_store: "shop=convenience",
  cinema: "amenity=cinema",
  theatre: "amenity=theatre",
  post_office: "amenity=post_office",
  place_of_worship: "amenity=place_of_worship",
};

const STOP = new Set(["the", "and", "ltd", "limited", "of", "edinburgh", "newcastle", "london", "co", "uk", "plc", "cafe", "bar", "restaurant", "shop", "store"]);
/** Name words for matching: "&" reads as "and", accents and punctuation go, filler words go. */
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/&/g, " and ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1 && !STOP.has(w))
      .map((w) => (w === "saint" ? "st" : w.length > 4 ? w.replace(/s$/, "") : w)),
  );

/** Edit-distance similarity of two strings, 0 to 1. */
function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length]! / Math.max(a.length, b.length);
}

/** Same place: close, and names that share most of their words (or one contains the other). */
function sameName(a: Set<string>, b: Set<string>, metres: number): boolean {
  if (!a.size || !b.size) return false;
  // Spelling variants next door to each other ("Edward & Irwyn", "Edward and Irwin"; "Town House", "Townhouse").
  const ca = [...a].join(""),
    cb = [...b].join("");
  if (metres < 40 && (ca.includes(cb) || cb.includes(ca) || similarity(ca, cb) >= 0.8)) return true;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  if (!shared) return false;
  if (shared === Math.min(a.size, b.size)) return metres < 75;
  return shared / (a.size + b.size - shared) >= 0.5 && metres < 75;
}

/** Things nobody walks to: services that come to you, and uncategorised records. */
const NOT_VISITABLE = new Set(["home_service", "b2b_office_and_professional_service", "corporate_or_business_office", "media_service", "technical_service", "design_service", "event_or_party_service"]);

/**
 * Overture places worth adding: confident (0.7 and over), somewhere people go, and not
 * already in OSM under a similar name within 75 m. Category kept as "overture=<basic_category>" unless it maps
 * to an OSM tag, so category searches find both.
 */
export function mergeOverture(osm: { n: string; x: number; y: number }[], ov: { id: string; n: string; c: string | null; x: number; y: number; ad: string | null; conf: number | null }[]) {
  const cell = (x: number, y: number) => `${Math.round(x * 500)}:${Math.round(y * 500)}`;
  const grid = new Map<string, { n: string; x: number; y: number }[]>();
  for (const p of osm) {
    if (!p.n) continue;
    const k = cell(p.x, p.y);
    grid.set(k, [...(grid.get(k) ?? []), p]);
  }
  const near = (x: number, y: number) => {
    const out: { n: string; x: number; y: number }[] = [];
    const [cx, cy] = [Math.round(x * 500), Math.round(y * 500)];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(grid.get(`${cx + i}:${cy + j}`) ?? []));
    return out;
  };
  const metres = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot((a.x - b.x) * Math.cos((a.y * Math.PI) / 180), a.y - b.y) * 111_320;
  const added: { n: string; c: string; x: number; y: number; ad?: string; id: string; src: "overture" }[] = [];
  for (const o of ov) {
    if ((o.conf ?? 0) < 0.7 || !o.n || !o.c || NOT_VISITABLE.has(o.c)) continue;
    const n = tokens(o.n);
    if (!n.size) continue;
    const dup = near(o.x, o.y).some((p) => sameName(n, tokens(p.n), metres(o, p)));
    if (dup) continue;
    added.push({ n: o.n, c: (o.c && OVERTURE_TO_OSM[o.c]) ?? `overture=${o.c ?? "place"}`, x: o.x, y: o.y, ad: o.ad ?? undefined, id: `ov${o.id}`, src: "overture" });
  }
  return added;
}
