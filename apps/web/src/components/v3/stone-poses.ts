/**
 * The live stone's body language (FEAT-73): a still pose per state, the idle
 * loop that plays on top of it, the tap reaction and the hop. Plain numbers
 * and maths, no three.js, so it is cheap to test and the same poses drive the
 * live stone and the static images rendered from it.
 *
 * Each state must read with no colour at all, in a greyscale still:
 * - fits: tall and upright, eyes forward and wide, smiling lower lids;
 * - unsure: tilted and turned, eyes to the side, one lid raised higher than the other;
 * - nope: squashed low and slumped forward, eyes down under heavy, drooping lids;
 * - fog: pale, half asleep with flat heavy lids, eyes small, veiled in mist at its foot.
 * Motion adds feeling on top and never changes the meaning. Everything is slow and small:
 * people may be anxious about the journey, and a stone that "doesn't fit" must never mock them.
 */
import type { StoneState } from "./Stone";

/** Every number that shapes the stone. Lengths are in scene units (the sett is 2.3 wide, 1.35 tall). */
export interface Pose {
  /** Squash and stretch of the body, about its foot. */
  sx: number;
  sy: number;
  sz: number;
  /** Roll in radians: positive leans to the viewer's right. */
  tilt: number;
  /** Pitch in radians: positive slumps the top towards the viewer. */
  lean: number;
  /** Extra turn in radians, on top of the three-quarter view. */
  yaw: number;
  /** Height off the ground. */
  lift: number;
  /** Where the eyes sit on the face: positive is the viewer's right, and up. */
  lookX: number;
  lookY: number;
  /** Size of both eyes. */
  eyeScale: number;
  /** Upper lids, 0 open to 1 shut: the viewer's left eye, then right. */
  lidL: number;
  lidR: number;
  /** Lower lids pushed up, 0 to 1: a smile in the eyes. */
  lidLow: number;
  /** Slant of the upper lids in radians: positive drops the outer corners (sad). */
  slant: number;
  /** A blink on top of the lids, 0 to 1. */
  blink: number;
  /** The mist at the stone's foot, 0 to 1. */
  veil: number;
}

export type PoseKey = keyof Pose;
const KEYS: PoseKey[] = ["sx", "sy", "sz", "tilt", "lean", "yaw", "lift", "lookX", "lookY", "eyeScale", "lidL", "lidR", "lidLow", "slant", "blink", "veil"];

/** No change: the identity for offsets. */
export const ZERO: Pose = { sx: 0, sy: 0, sz: 0, tilt: 0, lean: 0, yaw: 0, lift: 0, lookX: 0, lookY: 0, eyeScale: 0, lidL: 0, lidR: 0, lidLow: 0, slant: 0, blink: 0, veil: 0 };

/** The still poses. These are what the static images show and what reduced motion holds. */
export const POSES: Record<StoneState, Pose> = {
  fits: { sx: 0.96, sy: 1.09, sz: 0.96, tilt: 0, lean: -0.05, yaw: 0, lift: 0, lookX: 0, lookY: 0.03, eyeScale: 1.1, lidL: 0, lidR: 0, lidLow: 0.4, slant: 0, blink: 0, veil: 0 },
  unsure: { sx: 1, sy: 1, sz: 1, tilt: 0.11, lean: 0, yaw: 0.14, lift: 0, lookX: 0.1, lookY: 0.02, eyeScale: 1, lidL: 0.36, lidR: 0, lidLow: 0, slant: 0.1, blink: 0, veil: 0 },
  nope: { sx: 1.06, sy: 0.84, sz: 1.04, tilt: 0, lean: 0.13, yaw: 0, lift: 0, lookX: 0, lookY: -0.085, eyeScale: 0.94, lidL: 0.4, lidR: 0.4, lidLow: 0, slant: 0.5, blink: 0, veil: 0 },
  fog: { sx: 1, sy: 0.97, sz: 1, tilt: -0.04, lean: 0.03, yaw: 0, lift: 0, lookX: 0, lookY: -0.01, eyeScale: 0.88, lidL: 0.6, lidR: 0.6, lidLow: 0.14, slant: 0, blink: 0, veil: 1 },
};

/** The body colour per state. Only ever a second signal: the poses above must read without it. */
export const COLOURS: Record<StoneState, string> = { fits: "#3DD68C", unsure: "#FFB800", nope: "#FF4E2E", fog: "#D9D1C2" };

/**
 * Room above the stone's box for hops and stretches, as a share of the box's height.
 * The live canvas covers the box and this much above it. Nothing goes sideways, so
 * no room is added there and nothing can make the page scroll sideways.
 */
export const HEADROOM = 0.36;

/** How long things take, in ms. */
export const MORPH_MS = 700;
export const REACT_MS = 900;
/** Matches the hop in the unfold (handoff, Motion: 700 ms). */
export const HOP_MS = 700;

export function addPose(a: Pose, b: Pose, k = 1): Pose {
  const out = { ...a };
  for (const key of KEYS) out[key] = a[key] + b[key] * k;
  return out;
}

export function lerpPose(a: Pose, b: Pose, e: number): Pose {
  const out = { ...a };
  for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * e;
  return out;
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
export const easeInOut = (x: number) => {
  const u = clamp01(x);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};
/** A soft bump, 0 to 1 and back, over [0, 1]. */
const bump = (u: number) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 2);
/** Where we are in a window that opens every `period` seconds at `start` and lasts `dur`: 0 to 1 inside, -1 outside. */
function windowAt(t: number, period: number, start: number, dur: number): number {
  const p = ((t % period) + period) % period;
  return p >= start && p < start + dur ? (p - start) / dur : -1;
}
/** Hold, move over `ramp`, hold, move back: 0 or 1 most of the time. */
function hold(t: number, period: number, at: number, ramp: number, back: number): number {
  const p = ((t % period) + period) % period;
  return smooth((p - at) / ramp) - smooth((p - back) / ramp);
}
const wave = (t: number, period: number, phase = 0) => Math.sin((2 * Math.PI * t) / period + phase);

function blinkAt(t: number, period: number, start: number, dur: number): number {
  const u = windowAt(t, period, start, dur);
  return u < 0 ? 0 : bump(u);
}

/** A small bounce over [0, 1]: crouch, rise, land. Returns offsets. */
function bounce(u: number, height: number): Pick<Pose, "lift" | "sx" | "sy" | "sz"> {
  if (u <= 0 || u >= 1) return { lift: 0, sx: 0, sy: 0, sz: 0 };
  let sy = 0;
  let lift = 0;
  if (u < 0.2) sy = -0.06 * bump(u / 0.2);
  else if (u < 0.78) {
    const a = Math.sin((Math.PI * (u - 0.2)) / 0.58);
    lift = height * a;
    sy = 0.04 * a;
  } else sy = -0.05 * bump((u - 0.78) / 0.22);
  return { lift, sy, sx: -sy * 0.5, sz: -sy * 0.5 };
}

/**
 * The idle loop: offsets to add to the still pose at `t` seconds. Each state
 * has its own rhythm. Nothing moves fast: the quickest thing is a blink.
 */
export function idleAt(state: StoneState, t: number): Pose {
  const o = { ...ZERO };
  switch (state) {
    case "fits": {
      // Breathing, a blink, and now and then a small happy bounce with smiling eyes.
      o.sy = 0.012 * wave(t, 3.2);
      o.sx = o.sz = -0.006 * wave(t, 3.2);
      o.lookX = 0.012 * wave(t, 9);
      o.blink = blinkAt(t, 4.3, 3.4, 0.18);
      const u = windowAt(t, 6.4, 1.6, 0.9);
      if (u >= 0) {
        const b = bounce(u, 0.1);
        o.lift += b.lift;
        o.sx += b.sx;
        o.sy += b.sy;
        o.sz += b.sz;
        o.lidLow += 0.18 * bump(u);
      }
      break;
    }
    case "unsure": {
      // Glances one way, then the other, the head following a little. Now and then a shuffle and a shrug.
      const g = hold(t, 5.2, 2.2, 0.45, 4.3);
      o.lookX = -0.2 * g;
      o.tilt = -0.05 * g;
      o.yaw = -0.08 * g;
      o.sy = 0.008 * wave(t, 3.6);
      const s = windowAt(t, 10.4, 6.2, 1.4);
      if (s >= 0) {
        o.yaw += 0.05 * Math.sin(4 * Math.PI * s) * bump(s);
        o.sy += 0.035 * bump(s);
        o.lidL -= 0.18 * bump(s);
      }
      o.blink = blinkAt(t, 3.7, 1.2, 0.2);
      break;
    }
    case "nope": {
      // A slow sigh: breathe in, let it out and sink. Rarely, a small slow shake of the head.
      const u = windowAt(t, 6.5, 0.5, 3.6);
      if (u >= 0) {
        const inhale = u < 0.38 ? smooth(u / 0.38) : 1 - smooth((u - 0.38) / 0.62);
        const sink = u < 0.38 ? 0 : bump((u - 0.38) / 0.62);
        o.sy = 0.04 * inhale - 0.025 * sink;
        o.sx = o.sz = -0.015 * inhale + 0.012 * sink;
        o.lean = 0.035 * sink;
        o.lookY = 0.015 * inhale;
      }
      const h = windowAt(t, 13, 8.5, 1.9);
      if (h >= 0) o.yaw = 0.05 * Math.sin(4 * Math.PI * h) * bump(h);
      o.blink = blinkAt(t, 5.2, 2.1, 0.36);
      break;
    }
    case "fog": {
      // Drifts up and down, sways, eyes wander, a slow heavy blink.
      o.lift = 0.035 * (1 + wave(t, 6.5));
      o.tilt = 0.03 * wave(t, 8.2, 1);
      o.lookX = 0.03 * wave(t, 11);
      o.blink = blinkAt(t, 7, 4.5, 1.3);
      break;
    }
  }
  return o;
}

/** The answer to a tap, at `u` from 0 to 1 over REACT_MS: a small acknowledgement in the same mood, no new meaning. */
export function reactionAt(state: StoneState, u: number): Pose {
  const o = { ...ZERO };
  if (u <= 0 || u >= 1) return o;
  const k = bump(u);
  switch (state) {
    case "fits": {
      // A little hop and a bigger smile.
      const b = bounce(u, 0.13);
      Object.assign(o, b);
      o.lidLow = 0.25 * k;
      break;
    }
    case "unsure":
      // Looks round at you, lid raised in surprise, and straightens a little.
      o.lookX = -POSES.unsure.lookX * k;
      o.lidL = -0.25 * k;
      o.tilt = -0.06 * k;
      o.yaw = -0.08 * k;
      break;
    case "nope":
      // Lifts its eyes to you and draws itself up a little, then settles back.
      o.lookY = 0.085 * k;
      o.lidL = o.lidR = -0.16 * k;
      o.sy = 0.04 * k;
      o.lean = -0.05 * k;
      break;
    case "fog":
      // Wakes a little: eyes open and grow, a small rise.
      o.lidL = o.lidR = -0.38 * k;
      o.eyeScale = 0.08 * k;
      o.lift = 0.04 * k;
      break;
  }
  return o;
}

/** How high each mood hops: a stone that doesn't fit has less spring in it. */
const HOP_HEIGHT: Record<StoneState, number> = { fits: 0.4, unsure: 0.34, nope: 0.26, fog: 0.3 };

/** The hop in place, at `u` from 0 to 1 over HOP_MS. The unfold moves the stone's box; this is the body's part. */
export function hopAt(state: StoneState, u: number): Pose {
  const o = { ...ZERO };
  if (u <= 0 || u >= 1) return o;
  const h = HOP_HEIGHT[state];
  if (u < 0.18) o.sy = -0.09 * bump(u / 0.18);
  else if (u < 0.8) {
    const a = Math.sin((Math.PI * (u - 0.18)) / 0.62);
    o.lift = h * a;
    o.sy = 0.06 * Math.sin((Math.PI * (u - 0.18)) / 0.31) * (u < 0.49 ? 1 : 0);
  } else o.sy = -0.07 * bump((u - 0.8) / 0.2);
  o.sx = o.sz = -o.sy * 0.5;
  o.lidL = o.lidR = -0.1 * bump(u);
  return o;
}
