/**
 * "On this route" (D-067): the facts about a route that don't change the
 * verdict, grouped so more data stays calm. Three groups, in this order:
 * - blocked: closed for you, so the route went round it;
 * - slower: on the route, and may slow you down (works on the pavement, a
 *   narrowed path, the council's setts or a narrow pavement where they add a
 *   fifth or more to a stretch's time for this person);
 * - info: worth knowing (unmapped stretches, lighting after dark for people
 *   who asked, TfL's station messages, gusts, a health alert, gritting in ice).
 * Every item says whether it's live, from a dated file (static) or reported
 * by people, with its source and date, and its end date when it has one.
 * Items from outside the graph (OpenStreetMap Notes, air quality, the river)
 * are added by the app with the same shape.
 */
import { isKnown, type GraphEdge, type GraphNode, type LiveState } from "@causeway/graph";
import type { Profile } from "@causeway/profile";
import { darkCost, needsStepFree, type Conditions } from "./cost.js";
import { placeName, type Avoided, type Route, type Router } from "./router.js";

export type OnRouteGroup = "blocked" | "slower" | "info";
/** Live: read from a feed just now. Static: from a dated file. Reported: what people told a map or us. */
export type OnRouteLabel = "live" | "static" | "reported";

export interface OnRouteItem {
  group: OnRouteGroup;
  /** Plain words: "Lift out of service", "Café tables on the pavement". */
  text: string;
  /** Streets or places it's on, in route order. Empty when it's the whole route or the area. */
  where: string[];
  label: OnRouteLabel;
  source: string;
  /** ISO 8601: when it was observed or fetched. Null when the source has no date. */
  date: string | null;
  /** ISO 8601: when it ends, if the source says. */
  until: string | null;
}

export const ON_ROUTE_GROUPS: readonly OnRouteGroup[] = ["blocked", "slower", "info"];

/** A TfL station message that changes nothing for routing ("reduced escalator service"), for routes through that station. */
export interface StationNote {
  message: string;
  /** ISO 8601: when the feed was read. */
  at: string;
  validFrom: string;
  validUntil: string;
}

export interface OnRouteOptions {
  /** The explanation's list (`explain`): things on the direct way this route went round. */
  avoided?: readonly Avoided[];
  /**
   * The route as if nothing were closed (`closureBlind`): closures it uses
   * that this route doesn't are what this route went round. Search for it
   * once per plan, and only when something is closed somewhere.
   */
  blind?: Route | null;
  /** When each live source was last read, by source name: a works file's build date, a feed's fetch time. */
  readAt?: Readonly<Record<string, string>>;
  /** TfL's informational station messages, by our station id (the 940G code in `board:` and `link:` refs). */
  stationNotes?: ReadonlyMap<string, readonly StationNote[]>;
}

/** Works files built from a register are dated data, not a live feed. */
const STATIC_SOURCES = /^(Street Manager|Scottish Road Works Register)$/;
const liveLabel = (s: LiveState): OnRouteLabel => (STATIC_SOURCES.test(s.source) ? "static" : "live");
const liveSource = (s: LiveState) => (/^TfL (Unified API lift|line status|station disruptions)/.test(s.source) ? "TfL" : /^Environment Agency/.test(s.source) ? "Environment Agency" : s.source);
const active = (s: { validFrom: string; validUntil: string }, now: Date) => Date.parse(s.validFrom) <= now.getTime() && Date.parse(s.validUntil) > now.getTime();
const liveActive = active;
const liveApplies = (s: LiveState, p: Profile) => s.affects !== "step-free" || needsStepFree(p);
/** Works carry their own end; TfL's disruptions only when TfL gave a period (ours is 30 minutes from the fetch). Lifts and floods last until the next refresh, so they show none. */
const DEFAULT_TFL_PERIOD_MS = 30 * 60_000;
function liveUntil(s: LiveState): string | null {
  if (/^(Street Manager|Scottish Road Works Register|TfL road disruptions)$/.test(s.source)) return s.validUntil;
  if (/^TfL (line status|station disruptions)$/.test(s.source) && Date.parse(s.validUntil) - Date.parse(s.validFrom) !== DEFAULT_TFL_PERIOD_MS) return s.validUntil;
  return null;
}
/** A live state's short words: its headline, or what kind of thing it is. */
function liveText(s: LiveState): string {
  const head = s.headline ?? (s.source.startsWith("Environment Agency") ? (s.status === "closed" ? "Severe flood warning: paths closed" : "Flood warning: paths may be flooded") : s.affects === "step-free" ? "Lift out of service" : s.status === "closed" ? "Closed" : "Works on the pavement");
  // The source's own words, without the end date (it's in the item's meta) or our prefixes.
  const detail = s.reason.replace(/ until \d{4}-\d\d-\d\d$/, "").trim();
  // Our works descriptions often repeat the headline and add the street, which the item's "where" already says.
  const same = !detail || head.toLowerCase().includes(detail.toLowerCase()) || detail.toLowerCase().startsWith(head.toLowerCase());
  return same ? head : `${head}: ${detail}`;
}

const round10 = (m: number) => Math.round(m / 10) * 10;

/** Ground a gritting route covers: pavements and paths, not steps, crossings or stations. */
const GROUND = new Set<GraphEdge["kind"]>(["sidewalk", "footway", "pedestrian", "ramp", "street_proxy"]);
/** Train legs aren't footway: their unknowns are said per station, not by track length (as in `summarise`). */
const RAIL = new Set<GraphEdge["kind"]>(["transit", "board", "interchange"]);
/** Kinds whose station id ends their ref: "board:<line>:<station>", "link:<station>". */
const stationOf = (e: GraphEdge): string | null => (e.ref && (e.kind === "board" || e.kind === "station_link") && !e.ref.startsWith("board:bus:") ? (e.ref.split(":").pop() ?? null) : null);

/** The council's setts or width is listed when it adds at least this share of the stretch's time for this person: setts for a wheelchair, not for someone walking. */
export const COUNCIL_LIST_SHARE = 0.2;

/** The council layer's name, from the attribute's method ("City of Edinburgh Council, Adopted Roads (...), the footways alongside"). */
const councilName = (method: string | undefined) => (method ?? "the council").split(/, the footways|;/)[0]!;

/** Is anything closed right now, anywhere in the area, for this person? Then the closure-blind search is worth its time. */
export function anythingClosed(router: Router, p: Profile, c: Conditions): boolean {
  for (const e of router.graph.edges) if (e.live && e.live.status === "closed" && liveActive(e.live, c.now) && liveApplies(e.live, p)) return true;
  return false;
}

/**
 * The route this person would take if nothing were closed: one extra search,
 * made only when something is closed somewhere (else null, at no cost). The
 * app makes it once per plan and compares every route on show against it.
 */
export function closureBlind(router: Router, from: GraphNode, to: GraphNode, p: Profile, c: Conditions): Route | null {
  if (!anythingClosed(router, p, c)) return null;
  return router.route(from, to, p, { ...c, ignoreClosures: true });
}

/**
 * Build the list for one route. Blocked: closures the route went round, from
 * the explanation's avoided list and from the closure-blind route. A closure
 * that only sits beside the route, which the route never needed, is not
 * listed: it did not change the route.
 */
export function onRoute(router: Router, r: Route, p: Profile, c: Conditions, opts: OnRouteOptions = {}): OnRouteItem[] {
  const items = new Map<string, OnRouteItem>();
  const add = (it: Omit<OnRouteItem, "where">, where: string | null) => {
    const key = `${it.group}|${it.text}|${it.source}`;
    const cur = items.get(key) ?? items.set(key, { ...it, where: [] }).get(key)!;
    if (where && !cur.where.includes(where)) cur.where.push(where);
    if (it.until && (!cur.until || it.until > cur.until)) cur.until = it.until;
  };
  const readAt = opts.readAt ?? {};
  const fromLive = (group: OnRouteGroup, s: LiveState, where: string | null) =>
    add({ group, text: liveText(s), label: liveLabel(s), source: liveSource(s), date: readAt[s.source] ?? s.validFrom, until: liveUntil(s) }, where);
  const onIds = new Set(r.steps.map((s) => s.edge.id));
  const closedFor = (e: GraphEdge) => !!e.live && e.live.status === "closed" && liveActive(e.live, c.now) && liveApplies(e.live, p) && !onIds.has(e.id);

  // Blocked: what the route went round. First the explanation's own list, then what the closure-blind route used.
  const live = (opts.avoided ?? []).filter((a) => a.edgeId !== undefined && a.reason.attr === "live");
  if (live.length) {
    const ids = new Set(live.map((a) => a.edgeId));
    for (const e of router.graph.edges) if (ids.has(e.id) && closedFor(e)) fromLive("blocked", e.live!, live.find((a) => a.edgeId === e.id)!.name);
  }
  for (const s of opts.blind?.steps ?? []) if (closedFor(s.edge)) fromLive("blocked", s.edge.live!, placeName(s.edge));

  // Slower and worth knowing: what's on the route itself.
  let unlit = 0,
    unmapped = 0,
    unknownM = 0,
    groundM = 0,
    grittedM = 0;
  let gritting: { source: string; at: string | null } | null = null;
  const unknownNames = new Set<string>();
  const stations = new Set<string>();
  for (const s of r.steps) {
    const e = s.edge;
    const where = placeName(e);
    // Works on the pavement, a flood warning, a station we can't confirm: in force, for this person, not closed.
    if (e.live && e.live.status !== "closed" && e.live.status !== "open" && liveActive(e.live, c.now) && liveApplies(e.live, p)) fromLive("slower", e.live, where);
    // The council's setts or narrow pavement (D-062), where it slows this person by a fifth or more.
    for (const x of s.eval.reasons) {
      if (x.kind !== "penalty" || x.seconds < s.eval.seconds * COUNCIL_LIST_SHARE || x.seconds <= 0) continue;
      const a = x.attr === "surface" ? e.attrs.surface : x.attr === "width" ? e.attrs.width : null;
      if (!a || a.source !== "council") continue;
      const text = x.attr === "width" ? "Narrow pavement" : e.attrs.surface.value === "sett" ? "Setts on the pavement" : e.attrs.surface.value === "cobblestone" ? "Cobbles on the pavement" : null;
      if (text) add({ group: "slower", text, label: "static", source: councilName(a.method), date: a.observedAt, until: null }, where);
    }
    const st = stationOf(e);
    if (st) stations.add(st);
    // Platform to train (TfL station data, D-060): a staff ramp to ask for, or a step and gap TfL doesn't publish.
    if (e.kind === "board" && e.boarding && s.forward) {
      const b = s.eval.reasons.find((x) => x.attr === "boarding" || x.attr === "ramp");
      if (b) add({ group: "info", text: b.attr === "ramp" ? "Board with the staff ramp: ask staff" : b.detail.charAt(0).toUpperCase() + b.detail.slice(1), label: "static", source: "TfL station data", date: /\((\d{4}-\d\d-\d\d)\)/.exec(e.boarding.source)?.[1] ?? null, until: null }, e.name ?? where);
    }
    // Icy, with the council's gritting routes known: how much of the route is on them.
    if (c.ice && GROUND.has(e.kind) && isKnown(e.attrs.gritted) && e.attrs.covered.value !== true) {
      groundM += e.lengthM;
      if (e.attrs.gritted.value) grittedM += e.lengthM;
      gritting ??= { source: e.attrs.gritted.method ?? "the council's gritting routes", at: e.attrs.gritted.observedAt };
    }
    if (c.gust && s.eval.reasons.some((x) => x.attr === "gust")) add({ group: "info", text: `Strong gusts on exposed bridges: up to ${Math.round(c.gust.kmh)} km/h`, label: "live", source: c.gust.source, date: c.gust.at, until: null }, where);
    // The same measure as the route card's "not fully mapped" (summarise), so the two agree.
    if (!RAIL.has(e.kind) && (s.eval.passable === "unknown" || s.nodeEval.passable === "unknown")) {
      unknownM += e.lengthM;
      unknownNames.add(where);
    }
    const dark = darkCost(e, p, c);
    if (dark?.detail === "not lit") unlit += e.lengthM;
    else if (dark) unmapped += e.lengthM;
  }
  // TfL's informational station messages, for everyone (escalators, a platform gap): never a reason to route.
  for (const st of stations) for (const n of opts.stationNotes?.get(st) ?? []) if (active(n, c.now)) add({ group: "info", text: n.message, label: "live", source: "TfL", date: n.at, until: n.validUntil && Date.parse(n.validUntil) - Date.parse(n.validFrom) !== DEFAULT_TFL_PERIOD_MS ? n.validUntil : null }, null);
  const builtAt = router.graph.meta.builtAt;
  if (round10(unknownM) >= 10) {
    const n = unknownNames.size;
    add({ group: "info", text: `${round10(unknownM)} m not fully mapped, on ${n} ${n === 1 ? "street or path" : "streets and paths"}`, label: "static", source: "OpenStreetMap", date: builtAt, until: null }, null);
  }
  // Lighting after dark, only for people whose settings avoid unlit streets (D-038).
  if (round10(unlit) || round10(unmapped)) {
    const parts = [round10(unlit) ? `${round10(unlit)} m not lit` : null, round10(unmapped) ? `lighting not mapped for ${round10(unmapped)} m` : null].filter(Boolean);
    add({ group: "info", text: `After dark: ${parts.join(", ")}`, label: "static", source: "OpenStreetMap", date: builtAt, until: null }, null);
  }
  if (gritting && round10(groundM) >= 10) {
    const g: { source: string; at: string | null } = gritting;
    const share = grittedM / groundM;
    const text = grittedM < 10 ? "Icy: none of this route is on the council's first gritting routes for pavements" : share >= 0.95 ? "Icy: this route keeps to the council's first gritting routes for pavements" : `Icy: ${round10(grittedM)} m of this route is on the council's first gritting routes for pavements`;
    add({ group: "info", text, label: "static", source: g.source, date: g.at, until: null }, null);
  }
  if (c.healthAlert) {
    const h = c.healthAlert;
    add({ group: "info", text: `${h.level === "red" ? "Red" : "Amber"} ${h.kind} health alert for ${h.region}${p.maxRestIntervalM ? ": we've favoured places to rest" : ""}`, label: "live", source: "UKHSA", date: h.at, until: h.until ?? null }, null);
  }
  const order = { blocked: 0, slower: 1, info: 2 } as const;
  return [...items.values()].sort((a, b) => order[a.group] - order[b.group]);
}
