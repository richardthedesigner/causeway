import { describe, expect, it } from "vitest";
import type { StoneState } from "../src/components/v3/Stone";
import { HOP_MS, POSES, REACT_MS, ZERO, addPose, hopAt, idleAt, lerpPose, reactionAt, type Pose } from "../src/components/v3/stone-poses";

const STATES: StoneState[] = ["fits", "unsure", "nope", "fog"];

/**
 * What a person sees with no colour: posture, eyes and mist. Each is scaled so
 * one unit is a plainly visible change (height by a tenth, a tilt of about 6
 * degrees, eyes moving their own width, a lid a third of the way, the mist on or off).
 */
const SEEN: [keyof Pose, number][] = [
  ["sy", 10],
  ["sx", 10],
  ["tilt", 10],
  ["lean", 10],
  ["yaw", 5],
  ["lift", 5],
  ["lookX", 10],
  ["lookY", 10],
  ["eyeScale", 5],
  ["lidL", 3],
  ["lidR", 3],
  ["lidLow", 3],
  ["slant", 3],
  ["veil", 1],
];
const apart = (a: Pose, b: Pose) => Math.hypot(...SEEN.map(([k, w]) => (a[k] - b[k]) * w));
const nearest = (p: Pose) => STATES.reduce((best, s) => (apart(p, POSES[s]) < apart(p, POSES[best]) ? s : best), STATES[0]!);
const times = Array.from({ length: 2400 }, (_, i) => i / 40); // a minute, 40 times a second

describe("the live stone's poses (FEAT-73)", () => {
  it("tells the four still poses apart without colour, each by more than one plain change", () => {
    for (const a of STATES) for (const b of STATES) if (a !== b) expect(apart(POSES[a], POSES[b]), `${a} against ${b}`).toBeGreaterThan(1.5);
  });

  it("still reads as its own state at every moment of its idle loop, so motion never changes the meaning", () => {
    for (const s of STATES) for (const t of times) expect(nearest(addPose(POSES[s], idleAt(s, t))), `${s} at ${t} s`).toBe(s);
  });

  it("still reads as its own state through a tap and a hop", () => {
    for (const s of STATES)
      for (let u = 0; u <= 1; u += 0.02) {
        expect(nearest(addPose(POSES[s], reactionAt(s, u))), `${s} tapped, at ${u}`).toBe(s);
        expect(nearest(addPose(POSES[s], hopAt(s, u))), `${s} hopping, at ${u}`).toBe(s);
      }
  });

  it("keeps the idle loop calm: small, and nothing faster than a blink", () => {
    for (const s of STATES) {
      let prev = idleAt(s, 0);
      for (const t of times.slice(1)) {
        const now = idleAt(s, t);
        expect(Math.abs(now.lift), `${s} lift`).toBeLessThanOrEqual(0.11);
        expect(Math.abs(now.tilt), `${s} tilt`).toBeLessThanOrEqual(0.06);
        expect(Math.abs(now.yaw), `${s} yaw`).toBeLessThanOrEqual(0.1);
        expect(Math.abs(now.sy), `${s} stretch`).toBeLessThanOrEqual(0.07);
        // Per second: the body moves less than half its height and turns less than about 30 degrees.
        expect(Math.abs(now.lift - prev.lift) * 40, `${s} lift speed`).toBeLessThan(0.6);
        expect(Math.abs(now.tilt - prev.tilt) * 40, `${s} tilt speed`).toBeLessThan(0.5);
        expect(Math.abs(now.yaw - prev.yaw) * 40, `${s} turn speed`).toBeLessThan(0.5);
        prev = now;
      }
    }
  });

  it("starts and ends the tap and the hop at rest, so nothing jumps", () => {
    for (const s of STATES)
      for (const f of [reactionAt, hopAt]) {
        expect(f(s, 0)).toEqual(ZERO);
        expect(f(s, 1)).toEqual(ZERO);
        for (const [k, v] of Object.entries(f(s, 0.02))) expect(Math.abs(v), `${s} ${k} just after the start`).toBeLessThan(0.02);
        for (const [k, v] of Object.entries(f(s, 0.98))) expect(Math.abs(v), `${s} ${k} just before the end`).toBeLessThan(0.02);
      }
    expect(REACT_MS).toBeLessThanOrEqual(1000);
    expect(HOP_MS).toBe(700);
  });

  it("morphs from one pose to the next", () => {
    expect(lerpPose(POSES.fits, POSES.nope, 0)).toEqual(POSES.fits);
    expect(lerpPose(POSES.fits, POSES.nope, 1)).toEqual(POSES.nope);
    expect(lerpPose(POSES.fits, POSES.nope, 0.5).sy).toBeCloseTo((POSES.fits.sy + POSES.nope.sy) / 2);
  });
});
