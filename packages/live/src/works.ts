/**
 * Street works that affect pavements, from any source, as one shape the
 * router can use. Each feed has a small adapter that turns its records into
 * WorksObservations; worksStates() then puts them on the graph's footway
 * edges as dated LiveStates. Adding a source means writing one adapter.
 *
 * Honesty rules: a works record that says the footway is closed closes it
 * for everyone until the works end. Works on the footway that don't close
 * it are "degraded" (counted as unknown, not as passable). Works only in the
 * carriageway are left out: they rarely change a pavement route.
 */
import type { LiveState } from "@causeway/graph";
import { getJson, type LiveOptions } from "./http.js";

export interface WorksObservation {
  /** Unique per observation. One works in several parts shares the id before "#". */
  id: string;
  /** "Street Manager", "TfL road disruptions", "Scottish Road Works Register". */
  source: string;
  /** Short plain words for lists, in our own words: "Café tables on the pavement". */
  headline?: string;
  /** [lon, lat] points: a line along the works, or a single point. */
  geometry: [number, number][];
  footway: "closed" | "affected";
  description: string;
  street: string | null;
  /** ISO 8601. */
  start: string;
  end: string;
  /** When the source last said this. */
  observedAt: string;
}

/** A Street Manager permit event, reduced by scripts/streetmanager-extract.py. */
export interface StreetManagerPermit {
  ref: string;
  event_time: string;
  event_type: string;
  geom: string;
  street: string | null;
  town: string | null;
  promoter: string | null;
  activity: string | null;
  location_type: string | null;
  close_footway: string | null;
  status: string | null;
  permit_status: string | null;
  start: string | null;
  end: string | null;
  proposed_end: string | null;
}

// Capitals after a space or hyphen only, so "STOREY'S GATE" reads "Storey's Gate".
const title = (s: string | null) => (s ? s.toLowerCase().replace(/(^|[\s-])[a-z]/g, (c) => c.toUpperCase()).replace(/\s+\(.*\)$/, "") : null);

/** Parse WKT POINT / LINESTRING / POLYGON coordinates (any CRS) into pairs. */
export function wktPoints(wkt: string): [number, number][] {
  const nums = (wkt.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
  return out;
}

/**
 * Street Manager permits to observations. Keeps works that close or sit on
 * the footway, aren't finished or cancelled, and haven't ended by `now`.
 * `fromOsgb` converts British National Grid to [lon, lat].
 */
export function streetManagerObservations(permits: StreetManagerPermit[], fromOsgb: (e: number, n: number) => [number, number], now: Date): WorksObservation[] {
  const out: WorksObservation[] = [];
  for (const p of permits) {
    if (p.status === "completed" || p.event_type === "WORK_STOP") continue;
    if (p.permit_status && /cancel|refus|revok/i.test(p.permit_status)) continue;
    // close_footway_ref: "no", "yes_provide_alternative_route" (a diversion) or "yes_provide_pedestrian_walkway" (a temporary path, often in the road).
    const cf = (p.close_footway ?? "").toLowerCase();
    const walkway = cf.includes("walkway");
    const closes = cf.startsWith("yes") && !walkway;
    const onFootway = walkway || (!!p.location_type && /foot/i.test(p.location_type));
    if (!closes && !onFootway) continue;
    const end = p.end ?? p.proposed_end;
    if (!p.start || !end || Date.parse(end) <= now.getTime()) continue;
    const pts = wktPoints(p.geom).map(([e, n]) => fromOsgb(e, n));
    if (!pts.length) continue;
    const what = [p.activity, p.promoter ? `by ${p.promoter}` : null].filter(Boolean).join(" ");
    out.push({
      id: `sm:${p.ref}`,
      source: "Street Manager",
      geometry: pts.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]),
      footway: closes ? "closed" : "affected",
      description: `${closes ? "Pavement closed for works, with a signed diversion" : walkway ? "Pavement closed, temporary walkway alongside" : "Works on the pavement"}${what ? ` (${what})` : ""}`,
      street: title(p.street),
      start: p.start,
      end,
      observedAt: p.event_time,
    });
  }
  return out;
}

/** A Street Manager activity event (skips, scaffolding, hoardings), reduced by scripts/streetmanager-extract.py. */
export interface StreetManagerActivity {
  ref: string;
  event_time: string;
  event_type: string;
  geom: string;
  street: string | null;
  activity: string | null;
  /** Free text: read for closure words only, never shown (D-053). */
  details: string | null;
  name?: string | null;
  location_description?: string | null;
  location_type: string | null;
  cancelled: string | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
}

const ACTIVITY: Record<string, string> = {
  skips: "A skip",
  scaffolding: "Scaffolding",
  hoarding: "A hoarding",
  crane_mobile_platform: "A crane or mobile platform",
  compound: "A works compound",
  event: "An event",
  section50: "Private works under licence",
  section58: "Works",
};

/** A date, with its time if given; with no end time, the end is the end of that day. */
const at = (date: string | null, time: string | null, end: boolean): string | null => {
  if (!date) return null;
  const day = date.slice(0, 10);
  if (time) {
    const t = /T(\d\d:\d\d)/.exec(time)?.[1] ?? /^(\d\d:\d\d)/.exec(time)?.[1];
    if (t) return new Date(`${day}T${t}:00Z`).toISOString();
  }
  return new Date(Date.parse(`${day}T00:00:00Z`) + (end ? 86_400_000 - 1000 : 0)).toISOString();
};

/**
 * Street Manager activities (DATA-05): skips, scaffolding, hoardings, cranes,
 * events and the like. Only those on the footway or a footpath are kept. The
 * archive has no footway-closed field, so each one is "on the pavement"
 * (counted as unknown, D-027) unless its own words say the footway is closed,
 * read with the same plain-words rule as the Scottish register (D-057). The
 * description is in our own words and the street name: the record's free text
 * can name addresses, businesses and people, so it is never shown. Cancelled
 * and ended activities, and ones starting more than `horizonDays` after `now`,
 * are left out. A shape in several parts becomes one observation per part.
 */
export function streetManagerActivityObservations(acts: StreetManagerActivity[], fromOsgb: (e: number, n: number) => [number, number], now: Date, horizonDays = 35): WorksObservation[] {
  const out: WorksObservation[] = [];
  const t = now.getTime();
  for (const a of acts) {
    if (a.event_type === "ACTIVITY_CANCELLED" || /^yes$/i.test(a.cancelled ?? "")) continue;
    if (!a.location_type || !/foot/i.test(a.location_type)) continue;
    const start = at(a.start_date, a.start_time, false);
    const end = at(a.end_date, a.end_time, true);
    if (!start || !end || Date.parse(end) <= t || Date.parse(start) > t + horizonDays * 86_400_000) continue;
    // Footway is the pavement beside a road; a footpath alone is a path of its own.
    const where = /footway/i.test(a.location_type) ? "pavement" : "path";
    const closed = saysClosed(FOOTWAY_CLOSED, `${a.name ?? ""} ${a.details ?? ""} ${a.location_description ?? ""}`);
    // Our own words only: the free text names addresses, businesses and people (D-053).
    const headline = `${ACTIVITY[a.activity ?? ""] ?? "An obstruction"} on the ${where}`;
    const parts = partsLonLat(a.geom, fromOsgb);
    parts.forEach((geometry, i) =>
      out.push({
        id: `sma:${a.ref}${parts.length > 1 ? `#${i}` : ""}`,
        source: "Street Manager",
        headline,
        geometry,
        footway: closed ? "closed" : "affected",
        description: closed ? `${where === "pavement" ? "Pavement" : "Path"} closed` : headline,
        street: title(a.street),
        start,
        end,
        observedAt: a.event_time,
      }),
    );
  }
  return out;
}

/** A TfL /Road/all/Street/Disruption segment. */
export interface TflStreetSegment {
  distruptedStreetId: string;
  streetName: string;
  lineString: string;
  closure: string;
  category: string;
  subCategory?: string;
  comments?: string;
  startDateTime: string;
  endDateTime: string;
}

/**
 * TfL street disruptions to observations. TfL describes the carriageway, so
 * only segments whose description mentions the footway, pavement or
 * pedestrians are kept.
 */
export function tflStreetObservations(segs: TflStreetSegment[], now: Date, fetchedAt = now.toISOString()): WorksObservation[] {
  const out: WorksObservation[] = [];
  for (const s of segs) {
    const text = `${s.comments ?? ""}`.toLowerCase();
    if (!/footway|pavement|footpath|pedestrian/.test(text)) continue;
    if (Date.parse(s.endDateTime) <= now.getTime()) continue;
    let pts: [number, number][];
    try {
      pts = JSON.parse(s.lineString) as [number, number][];
    } catch {
      continue;
    }
    const closed = saysClosed(TFL_FOOTWAY_CLOSED, text);
    out.push({
      id: `tfl:${s.distruptedStreetId}`,
      source: "TfL road disruptions",
      geometry: pts,
      footway: closed ? "closed" : "affected",
      description: closed ? "Pavement closed" : "Works affecting the pavement",
      street: title(s.streetName),
      start: s.startDateTime,
      end: s.endDateTime,
      observedAt: fetchedAt,
    });
  }
  return out;
}

/** TfL's street disruption comments say the footway itself is shut. */
export const TFL_FOOTWAY_CLOSED = /(footway|pavement|footpath)s?\s+(will be\s+|is\s+|are\s+)?closed|pedestrians?\s+(will be\s+)?(diverted|closed)|closed to pedestrians/gi;
/** Words just before a closure phrase that deny it: "no footway closed", "without pedestrians diverted". */
const NEGATED_BEFORE = /\b(no|not|without|nor|never|avoid(s|ing)?|excluding|except)\b[\s\w/-]{0,12}$/i;
/** Words just after it: "pavement closed: not required", "footway closed: N/A". */
const NEGATED_AFTER = /^[\s:.,-]*((is|are|will|shall|be)\s+)*(not|(is|are|was|wo|shan)n't|n\/a|none|nil)\b/i;

/**
 * Whether free text says the footway is closed. A closure phrase counts
 * unless the words around it deny it, so "no pavement closed" or "footway
 * closed: not required" don't close a pavement. One plain closure anywhere
 * in the text is enough.
 */
export function saysClosed(pattern: RegExp, text: string): boolean {
  for (const m of text.matchAll(pattern)) {
    const i = m.index ?? 0;
    const before = text.slice(Math.max(0, i - 24), i);
    const after = text.slice(i + m[0].length, i + m[0].length + 24);
    if (NEGATED_BEFORE.test(before) || NEGATED_AFTER.test(after)) continue;
    return true;
  }
  return false;
}

/**
 * A row of the Scottish Road Works Register disruptions export
 * (CurrentActivities.csv), reduced by scripts/srwr-extract.py.
 */
export interface SrwrActivity {
  /** ActivityReference and phase. */
  ref: string;
  category: string;
  licence: string;
  traffic: string;
  status: string;
  /** The register's free text: read for closure words, never shown. */
  location: string;
  description: string;
  street: string | null;
  start: string;
  end: string;
  updated: string | null;
  /** GeometryFull: British National Grid WKT. */
  geom: string;
}

/**
 * WKT to its parts: each ring, line or point on its own, so a multi-part
 * works is never joined up across the gap between its parts.
 */
export function wktParts(wkt: string): [number, number][][] {
  if (/POINT/i.test(wkt)) return wktPoints(wkt).map((p) => [p]);
  const groups = wkt.match(/\(([^()]+)\)/g) ?? [];
  return groups.map(wktPoints).filter((g) => g.length > 0);
}

/** Drop points closer than `tolM` to the line between their neighbours (Douglas-Peucker, [lon, lat] in). */
export function simplifyLine(line: [number, number][], tolM = 1): [number, number][] {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1,
      at = -1;
    for (let k = i + 1; k < j; k++) {
      const d = distToLine(line[k]!, [line[i]!, line[j]!]);
      if (d > best) [best, at] = [d, k];
    }
    if (best > tolM) {
      keep[at] = 1;
      stack.push([i, at], [at, j]);
    }
  }
  return line.filter((_, k) => keep[k]);
}

/** Every part of a BNG WKT shape as [lon, lat] lines, rounded to about 10 cm and simplified. */
const partsLonLat = (wkt: string, fromOsgb: (e: number, n: number) => [number, number]) =>
  wktParts(wkt)
    .map((p) => simplifyLine(p.map(([e, n]) => fromOsgb(e, n)).map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6] as [number, number])))
    .filter((p) => p.length);

const FOOTWAY_WORDS = /\b(foot ?ways?|foot ?paths?|f\/ ?w(ay)?|pavements?|pedestrians?)\b/i;
/** The register (or a Street Manager activity) says the footway itself is shut, not just that works are on it. */
export const FOOTWAY_CLOSED =
  /\b(foot ?ways?|foot ?paths?|f\/ ?w(ay)?|pavements?)\s+(will\s+(remain|be)\s+|is\s+|are\s+)?clos(ed|ure)\b|including foot ?(ways?|paths?)|\b(foot ?path|foot ?way) diversion|closed to pedestrians|pedestrians?\s+(will be\s+)?diverted/gi;

/** Site licences on the footway, in our own words. */
const SITE_LICENCES: Record<string, string> = {
  Scaffolding: "Scaffolding on the pavement",
  Hoarding: "Hoarding on the pavement",
  "Containers/Cabins/Storage": "Site cabins or containers on the pavement",
  Skip: "Skip on the pavement",
  Materials: "Building materials on the pavement",
  "General Road Occupation": "Building site on the pavement",
};
/**
 * Statuses that are only an early notice, without firm dates: "Potential", and
 * "Advance Planning", the months-ahead notice of major works. Edinburgh's
 * "Find and Fix" pavement repairs are one Advance Planning entry per street,
 * each covering the whole street from 15 October 2026 to June 2027, though each
 * street's repair takes days. Counted, they made every acceptance journey
 * unsure from 15 October (D-057). The works come back with firm dates as
 * "Proposed" before they start.
 */
const NOT_YET = new Set(["Potential", "Advance Planning"]);

/**
 * SRWR activities to observations, for the rows that matter on foot (D-057):
 * - works entirely on the footway (closed only when the text says the footway is closed);
 * - road closures whose text mentions the footway;
 * - street café permits: tables narrow the pavement, they never close it;
 * - scaffolding, hoardings, cabins, skips and materials on the footway;
 * - public events on the footway.
 * Early notices, works that have ended, and anything starting more than
 * `horizonDays` after `now`, are left out. Descriptions are our
 * own words and the street name: the register's free text and promoter are
 * read for closure words only, never shown.
 */
export function srwrObservations(
  rows: SrwrActivity[],
  fromOsgb: (e: number, n: number) => [number, number],
  now: Date,
  horizonDays = 35,
): WorksObservation[] {
  const out: WorksObservation[] = [];
  const t = now.getTime();
  for (const r of rows) {
    if (NOT_YET.has(r.status)) continue;
    if (!r.start || !r.end || Date.parse(r.end) <= t || Date.parse(r.start) > t + horizonDays * 86_400_000) continue;
    const text = `${r.location} ${r.description}`;
    const onFootway = r.traffic === "Works Entirely On The Footway" || /\b(on|o\/s)?\s*f\/ ?w(ay)?\b/i.test(r.location);
    const shut = saysClosed(FOOTWAY_CLOSED, text);
    let headline: string;
    let footway: WorksObservation["footway"] = "affected";
    if (r.licence === "Street Café") {
      headline = "Café tables on the pavement";
    } else if (r.licence in SITE_LICENCES) {
      if (!onFootway) continue;
      headline = SITE_LICENCES[r.licence]!;
      footway = shut ? "closed" : "affected";
    } else if (r.licence === "Public Event" || r.category === "Event") {
      if (!(onFootway || FOOTWAY_WORDS.test(text)) || r.licence === "Seasonal Embargo") continue;
      headline = "Event on the pavement";
      footway = shut ? "closed" : "affected";
    } else if (r.traffic === "Works Entirely On The Footway") {
      footway = shut ? "closed" : "affected";
      headline = footway === "closed" ? "Pavement closed" : "Works on the pavement";
    } else if (r.traffic === "Road Closure") {
      if (!FOOTWAY_WORDS.test(text)) continue;
      footway = shut ? "closed" : "affected";
      headline = footway === "closed" ? "Road and pavement closed" : "Road closed, works on the pavement";
    } else continue;
    const description = footway === "closed" && !/closed/.test(headline) ? "Pavement closed" : headline;
    const parts = partsLonLat(r.geom, fromOsgb);
    parts.forEach((geometry, i) =>
      out.push({
        id: `srwr:${r.ref}${parts.length > 1 ? `#${i}` : ""}`,
        source: "Scottish Road Works Register",
        headline,
        geometry,
        footway,
        description,
        street: r.street ? r.street.replace(/\s*\(plus \d+ more\)$/, "") : null,
        start: r.start,
        end: r.end,
        observedAt: r.updated ?? r.start,
      }),
    );
  }
  return out;
}

const PAVEMENT_KINDS = new Set(["sidewalk", "footway", "pedestrian", "street_proxy", "ramp"]);

const metresBetween = (a: [number, number], b: [number, number]) => {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111_320;
};

/** Distance from p to the polyline (or point), in metres. */
function distToLine(p: [number, number], line: [number, number][]): number {
  if (line.length === 1) return metresBetween(p, line[0]!);
  const k = Math.cos((p[1] * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!,
      b = line[i + 1]!;
    const ax = (a[0] - p[0]) * k,
      ay = a[1] - p[1],
      bx = (b[0] - p[0]) * k,
      by = b[1] - p[1];
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy) * 111_320);
  }
  return best;
}

/**
 * Put works on the pavement edges they touch. An edge is affected when its
 * middle lies within `radiusM` of the works (a point works gets a slightly
 * bigger radius, since its extent is unknown). Returns edge id to LiveState.
 */
export function worksStates(
  obs: WorksObservation[],
  edges: { id: number; kind: string; geometry: [number, number][] }[],
  now: Date,
  radiusM = 8,
): Map<number, LiveState> {
  const out = new Map<number, LiveState>();
  const t = now.getTime();
  const live = obs.filter((o) => Date.parse(o.end) > t && o.geometry.length);
  if (!live.length) return out;
  // Pavement edge middles in a grid of ~100 m cells, so each works only looks at edges near it.
  const CELL = 0.001;
  const grid = new Map<string, { id: number; mid: [number, number] }[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  for (const e of edges) {
    if (!PAVEMENT_KINDS.has(e.kind)) continue;
    const mid = e.geometry[Math.floor(e.geometry.length / 2)]!;
    const k = key(Math.floor(mid[0] / CELL), Math.floor(mid[1] / CELL));
    (grid.get(k) ?? grid.set(k, []).get(k)!).push({ id: e.id, mid });
  }
  for (const o of live) {
    const r = o.geometry.length === 1 ? radiusM * 1.5 : radiusM;
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of o.geometry) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
    const pad = r / 111_320 / Math.cos((y0 * Math.PI) / 180);
    [x0, x1, y0, y1] = [x0 - pad, x1 + pad, y0 - r / 111_320, y1 + r / 111_320];
    const state: LiveState = {
      status: o.footway === "closed" ? "closed" : "degraded",
      ...(o.headline ? { headline: o.headline } : {}),
      reason: `${o.description}${o.street ? ` on ${o.street}` : ""} until ${o.end.slice(0, 10)}`,
      source: o.source,
      validFrom: o.start,
      validUntil: o.end,
    };
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        for (const { id, mid } of grid.get(key(cx, cy)) ?? []) {
          if (mid[0] < x0 || mid[0] > x1 || mid[1] < y0 || mid[1] > y1) continue;
          if (distToLine(mid, o.geometry) > r) continue;
          const prev = out.get(id);
          if (prev?.status === "closed" && state.status !== "closed") continue;
          out.set(id, state);
        }
      }
    }
  }
  return out;
}

/** Apply edge-id keyed states, replacing earlier works states (lift states are keyed by ref and left alone). */
export function applyEdgeStates(g: { edges: { id: number; live?: LiveState }[] }, states: Map<number, LiveState>, sources: string[]): number {
  let n = 0;
  for (const e of g.edges) {
    if (e.live && sources.includes(e.live.source)) delete e.live;
    const s = states.get(e.id);
    if (s && !e.live) {
      e.live = s;
      n++;
    }
  }
  return n;
}

/** Today's TfL street disruptions that mention the pavement, as observations. */
export async function fetchTflStreetWorks(now = new Date(), signal?: AbortSignal, opts: Omit<LiveOptions, "signal"> = {}): Promise<WorksObservation[]> {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://api.tfl.gov.uk/Road/all/Street/Disruption?startDate=${day(now)}&endDate=${day(new Date(now.getTime() + 86_400_000))}`;
  return tflStreetObservations(await getJson<TflStreetSegment[]>(url, "TfL street disruptions", { ...opts, signal }), now);
}
