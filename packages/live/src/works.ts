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
  id: string;
  /** "Street Manager", "TfL road disruptions". */
  source: string;
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
  details: string | null;
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
 * archive doesn't say whether the pavement is closed, so each one is "on the
 * pavement" (counted as unknown, D-027), never "closed". The description is
 * in our own words and the street name: the record's free text can name
 * addresses, businesses and people, so it is never shown.
 */
export function streetManagerActivityObservations(acts: StreetManagerActivity[], fromOsgb: (e: number, n: number) => [number, number], now: Date): WorksObservation[] {
  const out: WorksObservation[] = [];
  for (const a of acts) {
    if (a.event_type === "ACTIVITY_CANCELLED" || /^yes$/i.test(a.cancelled ?? "")) continue;
    if (!a.location_type || !/foot/i.test(a.location_type)) continue;
    const start = at(a.start_date, a.start_time, false);
    const end = at(a.end_date, a.end_time, true);
    if (!start || !end || Date.parse(end) <= now.getTime()) continue;
    const pts = wktPoints(a.geom).map(([e, n]) => fromOsgb(e, n));
    if (!pts.length) continue;
    // Our own words only: the free-text details name addresses, businesses and people (D-027).
    const what = ACTIVITY[a.activity ?? ""] ?? "An obstruction";
    out.push({
      id: `sma:${a.ref}`,
      source: "Street Manager",
      geometry: pts.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]),
      footway: "affected",
      description: `${what} on the pavement`,
      street: title(a.street),
      start,
      end,
      observedAt: a.event_time,
    });
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
  for (const o of obs) {
    if (Date.parse(o.end) <= t) continue;
    const r = o.geometry.length === 1 ? radiusM * 1.5 : radiusM;
    const lons = o.geometry.map((p) => p[0]),
      lats = o.geometry.map((p) => p[1]);
    const pad = r / 111_320 / Math.cos((lats[0]! * Math.PI) / 180);
    const [x0, x1, y0, y1] = [Math.min(...lons) - pad, Math.max(...lons) + pad, Math.min(...lats) - r / 111_320, Math.max(...lats) + r / 111_320];
    const state: LiveState = {
      status: o.footway === "closed" ? "closed" : "degraded",
      reason: `${o.description}${o.street ? ` on ${o.street}` : ""} until ${o.end.slice(0, 10)}`,
      source: o.source,
      validFrom: o.start,
      validUntil: o.end,
    };
    for (const e of edges) {
      if (!PAVEMENT_KINDS.has(e.kind)) continue;
      const mid = e.geometry[Math.floor(e.geometry.length / 2)]!;
      if (mid[0] < x0 || mid[0] > x1 || mid[1] < y0 || mid[1] > y1) continue;
      if (distToLine(mid, o.geometry) > r) continue;
      const prev = out.get(e.id);
      if (prev?.status === "closed" && state.status !== "closed") continue;
      out.set(e.id, state);
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
