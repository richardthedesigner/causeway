/**
 * Per-user edge cost. One function, driven entirely by the profile.
 *
 * Cost is in seconds: travel time at the user's speed, plus penalties
 * expressed as "how many seconds of detour would you trade to avoid this".
 * Hard exclusions return Infinity. Unknown attributes add a risk penalty
 * scaled by (1 - uncertaintyTolerance): a cautious user pays more to avoid
 * the unknown, an adventurous one barely notices it.
 */
import { confidence, isKnown, type EntranceInfo, type GraphEdge, type GraphNode, type NoteSignal, type PlatformBoarding, type Surface } from "@causeway/graph";
import { isPowerchair, isScooter, type Profile } from "@causeway/profile";

export interface Conditions {
  now: Date;
  /** Recent or current rain: setts, painted lines and metal covers get slippery. */
  wet: boolean;
  /** Ice or snow: steep and sett sections close for wheeled users. */
  ice: boolean;
  /** After civil twilight: unlit stretches cost those who asked to avoid them. Absent means daylight. */
  dark?: boolean;
  /** Treat live closures as open: only to find what a closure cuts off, for "In the way" (D-061). Never for a route we offer. */
  ignoreClosures?: boolean;
  /** The strongest gust now, or at the hour you leave, with its source and time (D-066). */
  gust?: { kmh: number; at: string; source: string };
  /** A UKHSA heat or cold health alert at amber or red, in force where the route is (England only, D-066). */
  healthAlert?: HealthAlert;
}

/** A UKHSA weather-health alert in force for the area (D-066). */
export interface HealthAlert {
  kind: "heat" | "cold";
  level: "amber" | "red";
  /** The UKHSA region: "London", "North East". */
  region: string;
  /** ISO 8601: when UKHSA last updated it. */
  at: string;
  /** ISO 8601: when the alert period ends, if UKHSA said. */
  until?: string;
}

/** Gusts at or above this make exposed bridges cost more for scooters and light chairs (D-066). About 31 mph. */
export const GUST_BRIDGE_KMH = 50;
/** Bridges shorter than this are culverts and short spans, not exposed crossings. */
export const GUST_BRIDGE_MIN_M = 15;
/** In an amber or red health alert, people who need rests pay this share more of the rest cost on stretches with no bench (D-066). */
const ALERT_REST_SHARE = 0.25;
/** And, in heat, this share of the time on uncovered ground. */
const ALERT_SUN_SHARE = 0.05;

/** Scooters, manual wheelchairs and lightweight powerchairs: the ones a gust can push sideways on an open bridge. */
export const windSensitive = (p: Profile) => isScooter(p) || p.preset === "manual-wheelchair" || p.preset === "manual-wheelchair-companion" || p.preset === "powerchair-light";

/** Outdoor ground you walk or wheel along: not crossings (the road), stations or rides. */
const OUTDOOR_GROUND = new Set<GraphEdge["kind"]>(["sidewalk", "footway", "pedestrian", "steps", "ramp", "street_proxy"]);

export const DRY: Conditions = { now: new Date("2026-10-04T12:00:00Z"), wet: false, ice: false };

export type ReasonKind = "excluded" | "penalty" | "unknown";

export interface Reason {
  kind: ReasonKind;
  /** Machine key, e.g. "incline", "steps", "surface". */
  attr: string;
  /** Plain-language fact, e.g. "9.6% incline". */
  detail: string;
  /** Penalty seconds added (Infinity for exclusions). */
  seconds: number;
}

export interface Evaluation {
  passable: "yes" | "no" | "unknown";
  /** Travel time in seconds, before penalties. */
  seconds: number;
  /** Routing cost: seconds plus penalties. Infinity if excluded. */
  cost: number;
  reasons: Reason[];
}

const WHEELED = (p: Profile) => p.maxSteps === 0;
/** In ice, extra time on a pavement that isn't gritted, as a share of its time: wheels and everyone else. A guess (D-047). */
const ICE_UNGRITTED_WHEELED = 1;
const ICE_UNGRITTED = 0.5;

/** Getting off a bus: the ramp, and a moment to get clear of the stop. */
const BUS_ALIGHT_S = 30;
/** Longest wait we'll quote: beyond this the timetable, not an average, is what matters. */
const BUS_MAX_WAIT_S = 30 * 60;
/** Chance the wheelchair space is taken when the vehicle arrives (working guesses until reports exist): buses have one, trams and Metro trains two or more. */
const SPACE_TAKEN = { bus: 0.15, tram: 0.05, metro: 0.05 } as const;
/** Metro stations below street level: step-free only while their lifts work, and Nexus has no open lift feed. */
const METRO_LIFT_STATIONS = new Set(["Monument", "Central Station", "Gateshead", "Haymarket", "St James", "Manors"]);

const UK_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short" });

/** UK local hour, minute and day type for a moment. */
export function ukClock(d: Date): { hour: number; minute: number; day: "wd" | "sa" | "su" } {
  const parts = Object.fromEntries(UK_TIME.formatToParts(d).map((x) => [x.type, x.value]));
  const day = parts.weekday === "Sat" ? "sa" : parts.weekday === "Sun" ? "su" : "wd";
  return { hour: Number(parts.hour) % 24, minute: Number(parts.minute), day };
}

/** Expected wait for a bus from departures per hour: half the gap now, or until the first one next hour. */
export function busWait(perHour: { wd: number[]; sa: number[]; su: number[] } | undefined, now: Date): { seconds: number; perHour: number } | null {
  if (!perHour) return null;
  const { hour, minute, day } = ukClock(now);
  const n = perHour[day][hour] ?? 0;
  if (n > 0) return { seconds: Math.max(60, 3600 / (2 * n)), perHour: n };
  const next = perHour[day][(hour + 1) % 24] ?? 0;
  if (next > 0) return { seconds: (60 - minute) * 60 + 3600 / (2 * next), perHour: next };
  return null;
}

/** Uses the bus's wheelchair space: one per bus, first come. */
const needsWheelchairSpace = (p: Profile) => p.preset === "manual-wheelchair" || p.preset === "manual-wheelchair-companion" || isPowerchair(p);

function evaluateBus(e: GraphEdge, forward: boolean, p: Profile, c: Conditions, reasons: Reason[], unknownCritical: boolean): Evaluation {
  const s = e.service!;
  const passable = unknownCritical ? "unknown" : "yes";
  const exclude = (detail: string): Evaluation => ({ passable: "no", seconds: Infinity, cost: Infinity, reasons: [...reasons, { kind: "excluded", attr: "bus", detail, seconds: Infinity }] });
  const vehicle = s.mode === "bus" ? "bus" : s.mode === "tram" ? "tram" : "train";
  if (p.buses === false && s.mode === "bus") return exclude("buses are turned off in your settings");
  if (e.kind === "transit") {
    const seconds = s.runS ?? e.lengthM / 5;
    return { passable, seconds, cost: seconds, reasons: [...reasons, { kind: "penalty", attr: "transit", detail: e.name ?? "bus", seconds: 0 }] };
  }
  if (e.kind !== "board") return { passable, seconds: 0, cost: 0, reasons };
  if (!forward) return { passable, seconds: BUS_ALIGHT_S, cost: BUS_ALIGHT_S, reasons };
  if (s.mode === "bus" && p.preset === "mobility-scooter-road") return exclude("road scooters are too big for buses");
  if (s.mode === "bus" && p.preset === "mobility-scooter" && !p.busScooterPermit) return exclude("most buses only take small scooters, with a permit from the operator");
  const wait = busWait(s.perHour, c.now);
  if (!wait || wait.seconds > BUS_MAX_WAIT_S) return exclude(`no ${s.mode === "bus" ? `${s.route} bus` : vehicle} from here at this time`);
  const out: Reason[] = [...reasons, { kind: "penalty", attr: "bus-wait", detail: `about ${wait.perHour} an hour`, seconds: 0 }];
  let cost = wait.seconds;
  let passableHere: Evaluation["passable"] = passable;
  if (s.mode !== "bus" && isScooter(p)) {
    const pen = Math.round(UNKNOWN_STATION_S * 0.5 * (1 - p.uncertaintyTolerance));
    out.push({ kind: "unknown", attr: "scooter", detail: `check the operator's size rules for scooters on the ${vehicle}`, seconds: pen });
    cost += pen;
    passableHere = "unknown";
  }
  const station = (e.name ?? "").split(", ")[0]!;
  if (s.mode === "metro" && needsStepFree(p) && METRO_LIFT_STATIONS.has(station)) {
    // Never step-free while a lift we can't see could be out (the trust contract).
    const pen = Math.round(UNKNOWN_STATION_S * 0.5 * (1 - p.uncertaintyTolerance));
    out.push({ kind: "unknown", attr: "station", detail: `${station} Metro is step-free only by lift, and there's no live lift status`, seconds: pen });
    cost += pen;
    passableHere = "unknown";
  }
  const stop = s.stop ?? {};
  // Waiting with nowhere to sit: costly for anyone who needs rests.
  // Tram stops and Metro stations aren't mapped stop by stop like bus stops, so these apply to buses.
  if (s.mode === "bus" && p.maxRestIntervalM !== null && wait.seconds > 180) {
    if (stop.bench === false) {
      const pen = Math.round(wait.seconds * 0.5);
      out.push({ kind: "penalty", attr: "bus-seat", detail: "no seat at the stop", seconds: pen });
      cost += pen;
    } else if (stop.bench === undefined) {
      const pen = Math.round(wait.seconds * 0.2 * (1 - p.uncertaintyTolerance));
      out.push({ kind: "unknown", attr: "bus-seat", detail: "not known if the stop has a seat", seconds: pen });
      cost += pen;
    }
  }
  // Rain and no shelter.
  if (s.mode === "bus" && c.wet && stop.shelter === false && wait.seconds > 180) {
    const pen = Math.round(wait.seconds * 0.3);
    out.push({ kind: "penalty", attr: "bus-shelter", detail: "no shelter at the stop", seconds: pen });
    cost += pen;
  }
  // A mapped low or flush kerb makes the ramp steep for a wheelchair.
  if (needsWheelchairSpace(p) && (stop.kerb === "lowered" || stop.kerb === "flush" || stop.kerb === "no")) {
    out.push({ kind: "penalty", attr: "bus-kerb", detail: `${stop.kerb} kerb at the stop, so the ramp is steeper`, seconds: 60 });
    cost += 60;
  }
  if (needsWheelchairSpace(p)) {
    // If the space is taken you wait for the next one: priced as the expected extra wait.
    const extra = Math.round(SPACE_TAKEN[s.mode] * (3600 / wait.perHour));
    out.push({ kind: "penalty", attr: "bus-space", detail: `the wheelchair space may be in use, so you might need the next ${vehicle}`, seconds: extra });
    cost += extra;
  }
  return { passable: passableHere, seconds: wait.seconds, cost, reasons: out };
}

/** Seconds of detour a fully cautious user would accept to avoid one unknown, per 100 m. */
const UNKNOWN_RISK_PER_100M: Record<string, number> = {
  incline: 60,
  surface: 25,
  width: 20,
  crossSlope: 10,
};
/** Unknown kerb at a crossing is the classic strand point: a flat cost per crossing. */
const UNKNOWN_KERB_S = 120;
/** A dropped kerb with no measured height, centimetres: the top of Inclusive Mobility's flush band, 6 mm (D-054). */
export const LOWERED_KERB_CM = 0.6;
const LIFT_WAIT_S = 45;
const RIDE_MPS = 8.5;
/** Average wait plus platform walk when boarding; alighting is quicker. */
const BOARD_WAIT_S = 240;
const ALIGHT_S = 90;
/** A station whose step-free status we can't confirm: a cautious user goes a long way round instead. */
const UNKNOWN_STATION_S = 900;

/** Someone who needs lifts or ramps rather than stairs and escalators. */
export const needsStepFree = (p: Profile) => p.maxSteps < 10 || !p.escalators;

/** TfL's level-access band between platform and train: a step of up to 50 mm and a gap of up to 85 mm (D-060). */
export const LEVEL_STEP_MM = 50;
export const LEVEL_GAP_MM = 85;
/** Getting the staff ramp: finding someone and them bringing it. A working guess. */
export const STAFF_RAMP_S = 180;

/**
 * One platform against this person's limits (D-060). Within TfL's level-access
 * band it fits everyone. Beyond it, the measured step is held to the kerb they
 * can manage (never less than the band) and the gap to their gap limit (the
 * band unless they set one). Where the figures run past their limits: the
 * level-access doors if TfL says where they are and some of the platform fits,
 * then the staff ramp if TfL lists one, otherwise "part" (some of the platform
 * fits) or "no". No figures: unknown, or the staff ramp if TfL lists one.
 */
export type PlatformFit = "level" | "fits" | "doors" | "ramp" | "part" | "no" | "unknown";
export function platformFit(b: PlatformBoarding, p: Profile): PlatformFit {
  if (!b.stepMm || !b.gapMm) return b.ramp ? "ramp" : "unknown";
  if (b.stepMm[1] <= LEVEL_STEP_MM && b.gapMm[1] <= LEVEL_GAP_MM) return "level";
  const stepLimit = Math.max(LEVEL_STEP_MM, p.maxKerbCm * 10);
  const gapLimit = p.maxGapMm ?? LEVEL_GAP_MM;
  if (b.stepMm[1] <= stepLimit && b.gapMm[1] <= gapLimit) return "fits";
  const somewhere = b.stepMm[0] <= stepLimit && b.gapMm[0] <= gapLimit;
  if (somewhere && b.levelAccessAt) return "doors";
  if (b.ramp) return "ramp";
  return somewhere ? "part" : "no";
}

const mmText = (b: PlatformBoarding) => [b.stepMm ? `step up to ${b.stepMm[1]} mm` : null, b.gapMm ? `gap up to ${b.gapMm[1]} mm` : null].filter(Boolean).join(", ");

/** A line's platforms at a station, judged together: the board edge doesn't know which way you'll go. */
export function boardingReason(platforms: PlatformBoarding[], p: Profile): Reason | null {
  if (!platforms.length) return null;
  const fits = platforms.map((b) => ({ b, f: platformFit(b, p) }));
  const worst = (f: PlatformFit) => fits.filter((x) => x.f === f);
  const no = worst("no");
  if (no.length === fits.length) return { kind: "excluded", attr: "boarding", detail: `${mmText(no[0]!.b)} between platform and train`, seconds: Infinity };
  const unsure = [...no, ...worst("part"), ...worst("unknown")];
  if (unsure.length) {
    const s = UNKNOWN_STATION_S * (1 - p.uncertaintyTolerance);
    const x = unsure[0]!;
    const detail =
      x.f === "unknown" ? `TfL doesn't publish the step and gap to the train on ${x.b.platform}` : x.f === "no" ? `${mmText(x.b)} to the train on ${x.b.platform}` : `${mmText(x.b)} to the train on parts of ${x.b.platform}`;
    return { kind: "unknown", attr: "boarding", detail, seconds: s };
  }
  if (worst("ramp").length) return { kind: "penalty", attr: "ramp", detail: "staff ramp onto the train: ask staff", seconds: STAFF_RAMP_S };
  return null;
}

/** Speed multiplier for a signed gradient. Wheeled users slow hard uphill; walkers follow Tobler. */
export function speedFactor(p: Profile, gradePct: number): number {
  if (!WHEELED(p)) {
    const tobler = Math.exp(-3.5 * Math.abs(gradePct / 100 + 0.05)) / Math.exp(-3.5 * 0.05);
    return Math.min(1, Math.max(0.3, tobler));
  }
  if (gradePct > 0) return Math.max(0.3, 1 - 0.07 * gradePct);
  return Math.max(0.5, 1 - 0.03 * Math.max(0, -gradePct - 2));
}

/** A road-legal scooter goes at road speed on a road; everyone else, and every other path, at their own pace. */
export const onRoad = (e: Pick<GraphEdge, "kind">, p: Pick<Profile, "roadLegal" | "roadSpeedMps">) => !!p.roadLegal && !!p.roadSpeedMps && e.kind === "street_proxy";
export const baseSpeed = (e: Pick<GraphEdge, "kind">, p: Profile) => (onRoad(e, p) ? p.roadSpeedMps! : p.speedMps);

/** Signed value as traversed: incline flips when walking an edge backwards. */
const signed = (v: number, forward: boolean) => (forward ? v : -v);

export interface EdgeContext {
  /** Straight-line distance from the edge's midpoint to the nearest mapped bench, metres. */
  benchM?: number;
  /** What people's notes say about this edge (a separate layer, joined here at request time; never part of the graph). */
  note?: NoteSignal;
}

/**
 * Notes are soft signals only. Bad experience adds up to half the edge's
 * travel time as a penalty; good experience takes up to half off the
 * unknown-risk penalty, never off travel time, and never changes the
 * verdict: a note can't make an unknown known.
 */
const NOTE_MAX_FACTOR = 0.5;

export function evaluateEdge(e: GraphEdge, forward: boolean, p: Profile, c: Conditions, ctx: EdgeContext = {}): Evaluation {
  const base = evaluateEdgeBase(e, forward, p, c, ctx);
  if (base.cost === Infinity) return base;
  const extra: Reason[] = [];
  // Paths shared with cycles: hard to hear a bike coming. A preference, priced per 100 m.
  if (p.sharedPathPer100mS && e.sharedWithCycles?.value === true) {
    const inferred = e.sharedWithCycles.state === "inferred";
    const pen = Math.round(((p.sharedPathPer100mS * e.lengthM) / 100) * (inferred ? 0.5 : 1));
    extra.push({ kind: "penalty", attr: "cycles", detail: inferred ? "shared with cycles (probably)" : "shared with cycles", seconds: pen });
  }
  const dark = darkCost(e, p, c);
  if (dark) extra.push(dark);
  if ((c.gust && c.gust.kmh >= GUST_BRIDGE_KMH) || c.healthAlert) extra.push(...weatherCosts(e, base, p, c));
  if (!extra.length) return base;
  return { ...base, cost: base.cost + extra.reduce((t, r) => t + r.seconds, 0), reasons: [...base.reasons, ...extra] };
}

/**
 * Gusts and health alerts as small costs (D-066). Neither closes anything:
 * - gusts of 50 km/h or more: an exposed bridge (15 m or longer, not covered) costs as much again
 *   for scooters, manual wheelchairs and lightweight powerchairs;
 * - an amber or red heat or cold alert: for presets with a rest limit, stretches with no bench cost a
 *   quarter more of their rest cost, and in heat, uncovered ground 5% more.
 */
export function weatherCosts(e: GraphEdge, base: Evaluation, p: Profile, c: Conditions): Reason[] {
  if (e.service || !OUTDOOR_GROUND.has(e.kind) || e.attrs.covered.value === true) return [];
  const out: Reason[] = [];
  if (c.gust && c.gust.kmh >= GUST_BRIDGE_KMH && e.bridge && e.lengthM >= GUST_BRIDGE_MIN_M && windSensitive(p)) {
    out.push({ kind: "penalty", attr: "gust", detail: `exposed bridge in gusts up to ${Math.round(c.gust.kmh)} km/h`, seconds: Math.round(base.seconds) });
  }
  if (c.healthAlert && p.maxRestIntervalM) {
    const rest = base.reasons.find((r) => r.attr === "rest");
    const sun = c.healthAlert.kind === "heat" ? base.seconds * ALERT_SUN_SHARE : 0;
    const s = Math.round((rest?.seconds ?? 0) * ALERT_REST_SHARE + sun);
    if (s > 0) out.push({ kind: "penalty", attr: "alert", detail: `${c.healthAlert.level} ${c.healthAlert.kind} health alert: ${rest ? "no bench nearby" : "in the sun"}`, seconds: s });
  }
  return out;
}

const INDOORS = new Set<GraphEdge["kind"]>(["transit", "board", "corridor", "elevator", "escalator"]);

/**
 * After dark, unlit stretches for those who asked to avoid them, priced per 100 m. A preference,
 * never a verdict: it doesn't make a route unknown. Lighting nobody mapped costs a share of an unlit
 * stretch, by how much this person minds not knowing.
 */
export function darkCost(e: GraphEdge, p: Profile, c: Conditions): Reason | null {
  if (!c.dark || !p.litAfterDarkPer100mS || INDOORS.has(e.kind) || e.attrs.covered.value === true) return null;
  const per = (p.litAfterDarkPer100mS * e.lengthM) / 100;
  if (e.attrs.lit.value === false) return { kind: "penalty", attr: "lit", detail: "not lit", seconds: Math.round(per) };
  if (!isKnown(e.attrs.lit)) return { kind: "penalty", attr: "lit", detail: "lighting not mapped", seconds: Math.round(per * 0.5 * (1 - p.uncertaintyTolerance)) };
  return null;
}

function evaluateEdgeBase(e: GraphEdge, forward: boolean, p: Profile, c: Conditions, ctx: EdgeContext = {}): Evaluation {
  const reasons: Reason[] = [];
  const a = e.attrs;
  let unknownCritical = false;
  /** A live state that leaves station access unknown for this person: priced like a station we can't confirm. */
  let livePenalty = 0;

  const exclude = (attr: string, detail: string): Evaluation => ({
    passable: "no",
    seconds: Infinity,
    cost: Infinity,
    reasons: [...reasons, { kind: "excluded", attr, detail, seconds: Infinity }],
  });

  if (!forward && !e.bidirectional) return exclude("oneway", "one way only");

  // Live state first: a closure beats everything.
  if (e.live && Date.parse(e.live.validUntil) > c.now.getTime() && Date.parse(e.live.validFrom) <= c.now.getTime()) {
    const applies = e.live.affects !== "step-free" || needsStepFree(p);
    if (applies && e.live.status === "closed" && !c.ignoreClosures)
      return exclude("live", e.live.affects === "step-free" ? `${e.live.headline === "No step-free access" ? "no step-free access" : "lift out of service"}: ${e.live.reason}` : `closed: ${e.live.reason}`);
    if (applies && (e.live.status === "restricted" || e.live.status === "degraded")) {
      // A works reason in our own words already says what it is ("Scaffolding on the pavement on ..."); others name the status.
      const stepFree = e.live.affects === "step-free";
      const detail = stepFree && e.live.headline ? `${e.live.headline}: ${e.live.reason}` : e.live.headline ? e.live.reason : `${e.live.status}: ${e.live.reason}`;
      // Step-free access to a platform or the street that may be cut off (a lift out reaching only some platforms) costs
      // what any station we can't confirm costs (D-058); otherwise a cautious user is sent through it as if nothing were wrong.
      if (stepFree && e.live.status === "restricted" && (e.kind === "board" || e.kind === "station_link")) livePenalty = UNKNOWN_STATION_S * (1 - p.uncertaintyTolerance);
      reasons.push({ kind: "unknown", attr: "live", detail, seconds: livePenalty });
      unknownCritical = true;
    }
  }

  // Buses, trams and the Metro: frequency-based waits, and who they can carry.
  if (e.service) return evaluateBus(e, forward, p, c, reasons, unknownCritical);

  // Rail: rides, boarding and interchanges.
  if (e.kind === "transit") {
    const seconds = e.lengthM / RIDE_MPS;
    return { passable: unknownCritical ? "unknown" : "yes", seconds, cost: seconds, reasons: [...reasons, { kind: "penalty", attr: "transit", detail: e.name ?? "train", seconds: 0 }] };
  }
  if (e.kind === "board" || e.kind === "interchange") {
    const seconds = e.kind === "board" ? (forward ? BOARD_WAIT_S : ALIGHT_S) : e.lengthM / Math.min(p.speedMps, 1.2) + 60;
    if (needsStepFree(p) && isKnown(a.stepCount) && a.stepCount.value > 0) {
      return exclude("steps", a.stepCount.method?.split(": ").slice(1).join(": ") || "no step-free route to the platform");
    }
    if (needsStepFree(p) && !isKnown(a.stepCount)) {
      // One unknown is enough: a live doubt on top of an unconfirmed station doesn't count twice.
      const s = UNKNOWN_STATION_S * (1 - p.uncertaintyTolerance);
      return { passable: "unknown", seconds, cost: seconds + s, reasons: [...reasons.map((r) => (r.attr === "live" ? { ...r, seconds: 0 } : r)), { kind: "unknown", attr: "station", detail: "step-free access not confirmed", seconds: s }] };
    }
    // Platform to train: TfL's measured step and gap against this person's limits (D-060).
    const boarding = e.kind === "board" && e.boarding && needsStepFree(p) ? boardingReason(e.boarding.platforms, p) : null;
    if (boarding?.kind === "excluded") return exclude(boarding.attr, boarding.detail);
    if (boarding?.kind === "unknown") {
      // One unknown is enough: a live doubt on top of an unpublished step doesn't count twice.
      const s = Math.max(boarding.seconds, livePenalty);
      return { passable: "unknown", seconds, cost: seconds + s, reasons: [...reasons.map((r) => (r.attr === "live" ? { ...r, seconds: 0 } : r)), { ...boarding, seconds: s }] };
    }
    if (boarding) return { passable: unknownCritical ? "unknown" : "yes", seconds, cost: seconds + livePenalty + boarding.seconds, reasons: [...reasons, boarding] };
    return { passable: unknownCritical ? "unknown" : "yes", seconds, cost: seconds + livePenalty, reasons };
  }

  // Vertical connectors.
  if (e.kind === "elevator") {
    return { passable: "yes", seconds: LIFT_WAIT_S, cost: LIFT_WAIT_S, reasons: [{ kind: "penalty", attr: "lift", detail: "lift", seconds: 0 }] };
  }
  if (e.kind === "escalator" && !p.escalators) return exclude("escalator", "escalator");
  if (e.kind === "steps") {
    if (p.maxSteps === 0) {
      const n = isKnown(a.stepCount) ? `${a.stepCount.value} steps` : "steps";
      return exclude("steps", n);
    }
    if (isKnown(a.stepCount)) {
      if (a.stepCount.value > p.maxSteps) return exclude("steps", `${a.stepCount.value} steps`);
    } else if (Number.isFinite(p.maxSteps)) {
      reasons.push({ kind: "unknown", attr: "steps", detail: "number of steps not known", seconds: 0 });
      unknownCritical = true;
    }
  }
  if (a.wheelchair.value === "no" && WHEELED(p)) return exclude("wheelchair", "marked not wheelchair accessible");

  // Gradient: exclusion on the steepest 10 m, effort on the mean.
  const grade = isKnown(a.incline) ? signed(a.incline.value, forward) : 0;
  let worst = isKnown(a.inclineMax) ? signed(a.inclineMax.value, forward) : grade;
  if (Math.abs(grade) > Math.abs(worst)) worst = grade;
  const speed = baseSpeed(e, p) * (e.kind === "steps" ? 0.4 : speedFactor(p, grade));
  const seconds = e.lengthM / speed;
  let penalty = livePenalty;

  if (isKnown(a.inclineMax) || isKnown(a.incline)) {
    const limit = worst >= 0 ? p.maxInclineUpPct : p.maxInclineDownPct;
    const dir = worst >= 0 ? "uphill" : "downhill";
    const mag = Math.abs(worst);
    // Short pinches (under 10 m) get half a percent of grace for DTM noise.
    if (mag > limit + (e.lengthM < 10 ? 0.5 : 0)) return exclude("incline", `${mag.toFixed(1)}% ${dir}`);
    if (c.ice && WHEELED(p) && mag > p.comfortInclinePct) return exclude("incline", `${mag.toFixed(1)}% ${dir} in ice`);
    if (mag > p.comfortInclinePct) {
      const f = (mag - p.comfortInclinePct) / Math.max(0.5, limit - p.comfortInclinePct);
      const s = seconds * 2 * f * f;
      penalty += s;
      reasons.push({ kind: "penalty", attr: "incline", detail: `${mag.toFixed(1)}% ${dir}`, seconds: s });
    }
  } else if (e.kind !== "steps" && p.maxInclineUpPct < 50) {
    const s = (UNKNOWN_RISK_PER_100M.incline! * e.lengthM) / 100 * (1 - p.uncertaintyTolerance);
    penalty += s;
    unknownCritical = true;
    reasons.push({ kind: "unknown", attr: "incline", detail: "gradient not known", seconds: s });
  }

  // Cross-slope from a 0.5 m DTM is near its noise floor, so it never hard-excludes.
  if (isKnown(a.crossSlope) && a.crossSlope.value > p.maxCrossSlopePct) {
    const over = a.crossSlope.value - p.maxCrossSlopePct;
    const s = seconds * Math.min(2, over / 4) * confidence(a.crossSlope, c.now);
    penalty += s;
    reasons.push({ kind: "penalty", attr: "crossSlope", detail: `${a.crossSlope.value.toFixed(1)}% camber`, seconds: s });
  }

  // Ice and gritting (DATA-07): where the council's routes are known, pavements off them cost more in ice.
  // The routes' own date, never the build's (Edinburgh's are from 2021): an old route list looks old.
  if (c.ice && a.gritted && isKnown(a.gritted) && e.kind !== "steps") {
    const when = a.gritted.observedAt ? ` (council routes from ${a.gritted.observedAt.slice(0, 4)})` : "";
    if (a.gritted.value) reasons.push({ kind: "penalty", attr: "gritted", detail: `on a gritting route${when}`, seconds: 0 });
    else {
      const s = seconds * (WHEELED(p) ? ICE_UNGRITTED_WHEELED : ICE_UNGRITTED);
      penalty += s;
      reasons.push({ kind: "penalty", attr: "gritted", detail: `not on a gritting route${when}, so it may be icy`, seconds: s });
    }
  }

  // Surface.
  if (isKnown(a.surface)) {
    const tol = p.surfaces[a.surface.value as Surface];
    if (tol === null) return exclude("surface", surfaceLabel(a.surface.value));
    const wet = c.wet && WET_SLIPPERY.has(a.surface.value) ? p.wetSurfaceSensitivity : 1;
    if (c.ice && WHEELED(p) && WET_SLIPPERY.has(a.surface.value)) return exclude("surface", `${surfaceLabel(a.surface.value)} in ice`);
    if (tol * wet > 0) {
      const s = seconds * tol * wet;
      penalty += s;
      reasons.push({ kind: "penalty", attr: "surface", detail: `${surfaceLabel(a.surface.value)}${wet > 1 ? ", wet" : ""}`, seconds: s });
    }
  } else if (WHEELED(p)) {
    const s = (UNKNOWN_RISK_PER_100M.surface! * e.lengthM) / 100 * (1 - p.uncertaintyTolerance);
    penalty += s;
    reasons.push({ kind: "unknown", attr: "surface", detail: "surface not known", seconds: s });
  }

  // Width.
  if (isKnown(a.width)) {
    if (a.width.value < p.minWidthM) {
      if (a.width.state === "inferred") {
        const s = seconds;
        penalty += s;
        reasons.push({ kind: "penalty", attr: "width", detail: `about ${a.width.value.toFixed(1)} m wide`, seconds: s });
      } else return exclude("width", `${a.width.value.toFixed(1)} m wide`);
    }
  } else if (WHEELED(p) && (e.kind === "footway" || e.kind === "street_proxy")) {
    const s = (UNKNOWN_RISK_PER_100M.width! * e.lengthM) / 100 * (1 - p.uncertaintyTolerance);
    penalty += s;
    reasons.push({ kind: "unknown", attr: "width", detail: "width not known", seconds: s });
  }

  // Street proxies: the pavement isn't its own path, so side-road kerbs (and maybe the pavement itself) are unknown.
  if (e.kind === "street_proxy") {
    const pav = a.pavement?.value ?? null;
    if (pav === "no") {
      // A road scooter belongs on the carriageway; for everyone else it means sharing with traffic.
      const s = seconds * (p.roadLegal ? 0.1 : WHEELED(p) ? 0.6 : 0.2);
      penalty += s;
      reasons.push({ kind: "penalty", attr: "pavement", detail: "no pavement: shared with traffic", seconds: s });
    } else if (WHEELED(p) && !p.roadLegal) {
      const s = (pav ? 12 : 30) * (1 - p.uncertaintyTolerance);
      penalty += s;
      unknownCritical = true;
      reasons.push({ kind: "unknown", attr: "pavement", detail: pav ? "kerbs at side roads not mapped" : "pavement not mapped", seconds: s });
    }
  }

  // Crossings: kerbs live on the end nodes; an unmapped kerb is an unknown.
  if (e.kind === "crossing" && WHEELED(p)) {
    reasons.push({ kind: "penalty", attr: "crossing", detail: "crossing", seconds: 0 });
  }

  // Rest points: prefer edges you can actually sit down on (a mapped bench within 30 m, the same test the route report uses).
  if (p.maxRestIntervalM && ctx.benchM !== undefined && ctx.benchM > 30 && e.kind !== "crossing" && !RAIL_KINDS.has(e.kind)) {
    const s = seconds * Math.min(1, 300 / p.maxRestIntervalM) * 0.6;
    penalty += s;
    reasons.push({ kind: "penalty", attr: "rest", detail: "no bench nearby", seconds: s });
  }

  if (ctx.note && ctx.note.count > 0 && !RAIL_KINDS.has(e.kind)) {
    const { score } = ctx.note;
    if (score < 0) {
      const s = seconds * Math.min(NOTE_MAX_FACTOR, -score * NOTE_MAX_FACTOR);
      penalty += s;
      reasons.push({ kind: "penalty", attr: "note", detail: "people's notes say it's hard going", seconds: s });
    } else if (score > 0) {
      const risk = reasons.filter((r) => r.kind === "unknown").reduce((t, r) => t + r.seconds, 0);
      const s = risk * Math.min(NOTE_MAX_FACTOR, score * NOTE_MAX_FACTOR);
      if (s > 0) {
        penalty -= s;
        reasons.push({ kind: "penalty", attr: "note", detail: "people's notes say it went well", seconds: -s });
      }
    }
  }

  return {
    passable: unknownCritical ? "unknown" : "yes",
    seconds,
    cost: seconds + penalty,
    reasons,
  };
}

/**
 * Cost of passing through a node: kerbs and single-node lifts.
 * `viaCrossing` tells us whether the user is stepping on or off a crossing,
 * which is where kerb data matters and where its absence is dangerous.
 */
export function evaluateNode(n: GraphNode, viaCrossing: boolean, p: Profile, c: Conditions): Evaluation {
  const base = evaluateNodeBase(n, viaCrossing, p, c);
  const cue = crossingCueCost(n, p);
  if (!cue || base.cost === Infinity) return base;
  return {
    passable: base.passable === "yes" && cue.unknown ? "unknown" : base.passable,
    seconds: base.seconds,
    cost: base.cost + cue.cost,
    reasons: [...base.reasons, ...cue.reasons],
  };
}

/** What a crossing lacks for someone who crosses by sound and touch, priced by their profile. */
export function crossingCueCost(n: GraphNode, p: Profile): { cost: number; reasons: Reason[]; unknown: boolean } | null {
  const x = n.crossing,
    w = p.crossingCues;
  if (!x || !w) return null;
  const reasons: Reason[] = [];
  let cost = 0,
    unknown = false;
  const add = (kind: "penalty" | "unknown", detail: string, s: number) => {
    const sec = Math.round(s);
    reasons.push({ kind, attr: "crossing", detail, seconds: sec });
    cost += sec;
    if (kind === "unknown") unknown = true;
  };
  const doubt = 0.5 * (1 - p.uncertaintyTolerance);
  if (!isKnown(x.control)) add("unknown", "crossing type not mapped", w.uncontrolledS * doubt);
  else if (x.control.value === "uncontrolled" || x.control.value === "marked") add("penalty", "no lights or zebra", w.uncontrolledS);
  else if (x.control.value === "zebra") add("penalty", "zebra: nothing tells you traffic has stopped", w.zebraS);
  else {
    const sound = x.sound.value === true,
      cone = x.vibration.value === true;
    if (!sound && !cone) {
      if (x.sound.value === false && x.vibration.value === false) add("penalty", "lights with no beep or rotating cone", w.silentSignalS);
      else add("unknown", "not known if the lights beep or have a rotating cone", w.silentSignalS * doubt);
    }
  }
  if (x.tactilePaving.value === false) add("penalty", "no tactile paving", w.noTactileS);
  else if (!isKnown(x.tactilePaving)) add("unknown", "tactile paving not mapped", w.noTactileS * doubt);
  return { cost, reasons, unknown };
}

function evaluateNodeBase(n: GraphNode, viaCrossing: boolean, p: Profile, _c: Conditions): Evaluation {
  const reasons: Reason[] = [];
  if (n.kind === "elevator") {
    return { passable: "yes", seconds: LIFT_WAIT_S, cost: LIFT_WAIT_S, reasons: [{ kind: "penalty", attr: "lift", detail: "lift", seconds: 0 }] };
  }
  if (n.entrance) {
    const v = entranceVerdict(n.entrance, p);
    if (v.passable === "no") return { passable: "no", seconds: Infinity, cost: Infinity, reasons: [{ kind: "excluded", attr: "entrance", detail: v.detail, seconds: Infinity }] };
  }
  if (n.kerb) {
    const t = n.kerb.type.value;
    // No measured height: a dropped kerb is taken at the most Inclusive Mobility 2021 allows (flush, 0 to 6 mm), so "flush only" still avoids it (D-054).
    const h = isKnown(n.kerb.heightCm) ? n.kerb.heightCm.value : t === "raised" ? 12 : t === "flush" ? 0 : t === "lowered" ? LOWERED_KERB_CM : null;
    if (h === null) {
      if (p.maxKerbCm < 10) {
        const s = UNKNOWN_KERB_S * (1 - p.uncertaintyTolerance);
        return { passable: "unknown", seconds: 0, cost: s, reasons: [{ kind: "unknown", attr: "kerb", detail: "kerb type not known", seconds: s }] };
      }
    } else if (h > p.maxKerbCm + (isKnown(n.kerb.heightCm) ? 0 : 0.5)) {
      return {
        passable: "no",
        seconds: Infinity,
        cost: Infinity,
        reasons: [{ kind: "excluded", attr: "kerb", detail: isKnown(n.kerb.heightCm) ? `${h} cm kerb` : `${t} kerb`, seconds: Infinity }],
      };
    }
    if (n.kerb.type.state === "inferred" && p.maxKerbCm < 10) {
      // Inferred from the crossing type, not observed: passable, but a cautious user still pays a little.
      const s = UNKNOWN_KERB_S * 0.25 * (1 - p.uncertaintyTolerance);
      reasons.push({ kind: "penalty", attr: "kerb", detail: `${t} kerb (inferred from crossing type)`, seconds: s });
      return { passable: "yes", seconds: 0, cost: s, reasons };
    }
    reasons.push({ kind: "penalty", attr: "kerb", detail: `${t ?? "unknown"} kerb`, seconds: 0 });
    return { passable: "yes", seconds: 0, cost: 0, reasons };
  }
  if (viaCrossing && p.maxKerbCm < 10) {
    const s = UNKNOWN_KERB_S * (1 - p.uncertaintyTolerance);
    return { passable: "unknown", seconds: 0, cost: s, reasons: [{ kind: "unknown", attr: "kerb", detail: "kerb at crossing not mapped", seconds: s }] };
  }
  return { passable: "yes", seconds: 0, cost: 0, reasons };
}

export interface EntranceVerdict {
  passable: "yes" | "no" | "unknown";
  /** Plain language: "automatic sliding door, step-free", "revolving door", "door type not known". */
  detail: string;
}

/**
 * Can this user get through this door? Unknown stays unknown: we never call
 * an entrance accessible because nothing says otherwise.
 */
export function entranceVerdict(en: EntranceInfo, p: Profile): EntranceVerdict {
  const wheeled = WHEELED(p);
  const door = en.door.value;
  const auto = en.automatic.value;
  const isAuto = auto !== null && auto !== "no";
  const parts: string[] = [];
  if (isAuto) parts.push(auto === "button" ? "push-button automatic door" : "automatic door");
  else if (door) parts.push(door === "no" ? "open doorway" : `${door} door`);
  if (isKnown(en.stepCount)) parts.push(en.stepCount.value === 0 ? "step-free" : `${en.stepCount.value} step${en.stepCount.value === 1 ? "" : "s"}`);
  if (isKnown(en.widthM)) parts.push(`${en.widthM.value} m wide`);
  if (en.wheelchair.value === "yes") parts.push("marked wheelchair accessible");

  if (en.wheelchair.value === "no" && wheeled) return { passable: "no", detail: "marked not wheelchair accessible" };
  if (door === "revolving" && !isAuto && (wheeled || p.maxSteps < 3)) return { passable: "no", detail: "revolving door" };
  if (isKnown(en.stepCount) && en.stepCount.value > p.maxSteps) return { passable: "no", detail: `${en.stepCount.value} steps at the door` };
  if (isKnown(en.widthM) && en.widthM.value < p.minWidthM) return { passable: "no", detail: `door ${en.widthM.value} m wide` };

  const stepFree = en.wheelchair.value === "yes" || en.stepCount.value === 0 || en.ramp.value === true;
  if (wheeled && !stepFree) return { passable: "unknown", detail: parts.length ? `${parts.join(", ")}; step at the door not known` : "door and step not known" };
  if (!door && !isAuto && wheeled) return { passable: "unknown", detail: parts.length ? `${parts.join(", ")}; door type not known` : "door type not known" };
  return { passable: "yes", detail: parts.join(", ") || (en.wheelchair.value === "yes" ? "wheelchair accessible" : "entrance") };
}

const RAIL_KINDS: ReadonlySet<string> = new Set(["transit", "board", "interchange", "station_link"]);

const WET_SLIPPERY: ReadonlySet<string> = new Set(["sett", "cobblestone", "metal", "wood", "paving_stones"]);

export function surfaceLabel(s: string): string {
  return (
    {
      asphalt: "tarmac",
      concrete: "concrete",
      paving_stones: "paving slabs",
      sett: "setts",
      cobblestone: "cobbles",
      compacted: "compacted path",
      fine_gravel: "fine gravel",
      gravel: "gravel",
      grass: "grass or earth",
      wood: "boardwalk",
      metal: "metal",
      other: "uneven surface",
    } as Record<string, string>
  )[s] ?? s;
}
