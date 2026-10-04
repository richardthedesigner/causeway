/**
 * Per-user edge cost. One function, driven entirely by the profile.
 *
 * Cost is in seconds: travel time at the user's speed, plus penalties
 * expressed as "how many seconds of detour would you trade to avoid this".
 * Hard exclusions return Infinity. Unknown attributes add a risk penalty
 * scaled by (1 - uncertaintyTolerance): a cautious user pays more to avoid
 * the unknown, an adventurous one barely notices it.
 */
import { confidence, isKnown, type EntranceInfo, type GraphEdge, type GraphNode, type Surface } from "@causeway/graph";
import type { Profile } from "@causeway/profile";

export interface Conditions {
  now: Date;
  /** Recent or current rain: setts, painted lines and metal covers get slippery. */
  wet: boolean;
  /** Ice or snow: steep and sett sections close for wheeled users. */
  ice: boolean;
}

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

/** Seconds of detour a fully cautious user would accept to avoid one unknown, per 100 m. */
const UNKNOWN_RISK_PER_100M: Record<string, number> = {
  incline: 60,
  surface: 25,
  width: 20,
  crossSlope: 10,
};
/** Unknown kerb at a crossing is the classic strand point: a flat cost per crossing. */
const UNKNOWN_KERB_S = 120;
const LIFT_WAIT_S = 45;
const RIDE_MPS = 8.5;
/** Average wait plus platform walk when boarding; alighting is quicker. */
const BOARD_WAIT_S = 240;
const ALIGHT_S = 90;
/** A station whose step-free status we can't confirm: a cautious user goes a long way round instead. */
const UNKNOWN_STATION_S = 900;

/** Someone who needs lifts or ramps rather than stairs and escalators. */
export const needsStepFree = (p: Profile) => p.maxSteps < 10 || !p.escalators;

/** Speed multiplier for a signed gradient. Wheeled users slow hard uphill; walkers follow Tobler. */
export function speedFactor(p: Profile, gradePct: number): number {
  if (!WHEELED(p)) {
    const tobler = Math.exp(-3.5 * Math.abs(gradePct / 100 + 0.05)) / Math.exp(-3.5 * 0.05);
    return Math.min(1, Math.max(0.3, tobler));
  }
  if (gradePct > 0) return Math.max(0.3, 1 - 0.07 * gradePct);
  return Math.max(0.5, 1 - 0.03 * Math.max(0, -gradePct - 2));
}

/** Signed value as traversed: incline flips when walking an edge backwards. */
const signed = (v: number, forward: boolean) => (forward ? v : -v);

export function evaluateEdge(e: GraphEdge, forward: boolean, p: Profile, c: Conditions): Evaluation {
  const reasons: Reason[] = [];
  const a = e.attrs;
  let unknownCritical = false;

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
    if (applies && e.live.status === "closed") return exclude("live", e.live.affects === "step-free" ? `lift out of service: ${e.live.reason}` : `closed: ${e.live.reason}`);
    if (applies && (e.live.status === "restricted" || e.live.status === "degraded")) {
      reasons.push({ kind: "unknown", attr: "live", detail: `${e.live.status}: ${e.live.reason}`, seconds: 0 });
      unknownCritical = true;
    }
  }

  // Rail: rides, boarding and interchanges.
  if (e.kind === "transit") {
    const seconds = e.lengthM / RIDE_MPS;
    return { passable: unknownCritical ? "unknown" : "yes", seconds, cost: seconds, reasons: [...reasons, { kind: "penalty", attr: "transit", detail: e.name ?? "train", seconds: 0 }] };
  }
  if (e.kind === "board" || e.kind === "interchange") {
    const seconds = e.kind === "board" ? (forward ? BOARD_WAIT_S : ALIGHT_S) : e.lengthM / Math.min(p.speedMps, 1.2) + 60;
    if (needsStepFree(p) && !isKnown(a.stepCount)) {
      const s = UNKNOWN_STATION_S * (1 - p.uncertaintyTolerance);
      return { passable: "unknown", seconds, cost: seconds + s, reasons: [...reasons, { kind: "unknown", attr: "station", detail: "step-free access not confirmed", seconds: s }] };
    }
    return { passable: unknownCritical ? "unknown" : "yes", seconds, cost: seconds, reasons };
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
  const speed = p.speedMps * (e.kind === "steps" ? 0.4 : speedFactor(p, grade));
  const seconds = e.lengthM / speed;
  let penalty = 0;

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
      const s = seconds * (WHEELED(p) ? 0.6 : 0.2);
      penalty += s;
      reasons.push({ kind: "penalty", attr: "pavement", detail: "no pavement: shared with traffic", seconds: s });
    } else if (WHEELED(p)) {
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
export function evaluateNode(n: GraphNode, viaCrossing: boolean, p: Profile, _c: Conditions): Evaluation {
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
    const h = isKnown(n.kerb.heightCm) ? n.kerb.heightCm.value : t === "raised" ? 12 : t === "flush" ? 0 : t === "lowered" ? 2 : null;
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
