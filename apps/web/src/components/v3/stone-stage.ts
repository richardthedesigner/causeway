/**
 * The live stone's stage (FEAT-73): one WebGL renderer shared by every live
 * stone on the page, and one frame loop. Each stone draws into the shared
 * renderer and copies the result onto its own 2D canvas, so three stones cost
 * one WebGL context, not three.
 *
 * Loaded by StoneLive with a dynamic import, so three.js is fetched only when a
 * v3 surface shows a live stone.
 *
 * The loop:
 * - draws only stones that are on screen, while the tab is visible;
 * - stops when nothing moves (a stone that is not idle holds still and costs nothing);
 * - runs at 30 frames a second for idle loops and 60 while something moves on purpose
 *   (a change of state, a tap, a hop).
 * When the last stone goes, the renderer and everything on the GPU are disposed.
 *
 * It gives up, and every stone shows its still image, when WebGL is missing,
 * when the browser says WebGL would be slow (software drawing, a blocked GPU),
 * when the context is lost, or when frames keep taking too long.
 */
import { Color } from "three";
import type { StoneState } from "./Stone";
import { COLOURS, HEADROOM, HOP_MS, MORPH_MS, POSES, REACT_MS, addPose, easeInOut, hopAt, idleAt, lerpPose, reactionAt, type Pose } from "./stone-poses";
import { applyPose, createStoneScene, drawRig, frame, setColour, CROP, type Rig, type StoneScene } from "./stone-scene";

/** Device pixels per CSS pixel, at most 2: a third more pixels than this costs more than it shows on a small stone. */
const MAX_DPR = 2;
const IDLE_FRAME_MS = 1000 / 30;
/** Frames slower than this, several in a row, mean this phone can't draw the stone well: show the still image instead. */
const SLOW_MS = 50;
const SLOW_RUN = 4;
/** The live canvas covers the box and HEADROOM above it. */
const LIVE = { x: CROP.x, y: CROP.y - CROP.h * HEADROOM, w: CROP.w, h: CROP.h * (1 + HEADROOM) };

/** What the stage tells each stone: drawing, the context was lost, or it gave up for being slow. */
export type StageStatus = "ok" | "lost" | "slow";
type Listener = (status: StageStatus) => void;

let stage: StoneScene | null = null;
let failed = false;
let software = false;
let slowRun = 0;
const views = new Set<StoneView>();
const listeners = new Set<Listener>();
let raf = 0;
let last = 0;

function onLost(e: Event) {
  // Ask for the context back; until then every stone shows its still image.
  e.preventDefault();
  failed = true;
  stop();
  for (const l of listeners) l("lost");
}
function onRestored() {
  // Start again from nothing: whatever was on the GPU is gone.
  teardown();
  failed = false;
  try {
    ensure();
    for (const v of views) v.rebuild();
    for (const l of listeners) l("ok");
    wake();
  } catch {
    failed = true;
  }
}

function ensure(): StoneScene {
  if (stage) return stage;
  if (failed) throw new Error("WebGL is not available");
  const canvas = document.createElement("canvas");
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  try {
    // A smaller shadow map than the stills: the stone is small on a phone, and it is drawn every frame.
    // Software WebGL fails here (failIfMajorPerformanceCaveat): it would block the page for the sake of a decoration.
    stage = createStoneScene({ canvas, shadowSize: 1024, failIfMajorPerformanceCaveat: !software });
  } catch (e) {
    failed = true;
    throw e;
  }
  frame(stage.camera, LIVE.x, LIVE.y, LIVE.w, LIVE.h);
  return stage;
}

function teardown() {
  stop();
  if (!stage) return;
  const c = stage.renderer.domElement;
  c.removeEventListener("webglcontextlost", onLost);
  c.removeEventListener("webglcontextrestored", onRestored);
  stage.dispose();
  stage = null;
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function wake() {
  if (!raf && stage && !failed && !document.hidden) raf = requestAnimationFrame(tick);
}

function tick(now: number) {
  raf = 0;
  if (!stage || failed || document.hidden) return;
  const active = [...views].filter((v) => v.wants(now));
  if (!active.length) return;
  const busy = active.some((v) => v.busy(now));
  if (busy || now - last >= IDLE_FRAME_MS - 2) {
    last = now;
    const first = active.some((v) => !v.drawn);
    const t0 = performance.now();
    for (const v of active) v.draw(stage, now);
    // The first frame compiles the shaders, so it is not counted.
    if (!first && !software) slowRun = performance.now() - t0 > SLOW_MS ? slowRun + 1 : 0;
    if (slowRun >= SLOW_RUN) {
      failed = true;
      for (const l of listeners) l("slow");
      teardown();
      return;
    }
  }
  raf = requestAnimationFrame(tick);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : wake()));
}

/** Is WebGL there? Builds the shared stage if it is not built yet. */
export function stageReady(): boolean {
  try {
    ensure();
    return true;
  } catch {
    return false;
  }
}

/**
 * For scripts that record the stone in headless Chromium, whose WebGL is
 * software: start the stage anyway, and never give up for slowness.
 */
export function allowSoftwareWebgl() {
  software = true;
  failed = false;
}

/** Hear when the shared context is lost, comes back, or the stage gives up for being slow. */
export function onStage(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** One live stone: its pose, its timers, and the 2D canvas it is shown on. */
export class StoneView {
  private ctx: CanvasRenderingContext2D;
  private rig: Rig | null = null;
  private state: StoneState;
  private idle: boolean;
  private size = 0;
  private visible = true;
  /** Each stone breathes on its own beat, so two side by side don't move in step. */
  private phase = Math.random() * 20;
  private morph: { from: Pose; fromColour: Color; at: number } | null = null;
  private reactAt = -Infinity;
  private hopStart = -Infinity;
  private pose: Pose;
  private colour: Color;
  private dirty = true;
  private onFirstFrame: (() => void) | null;
  /** Has it drawn a frame yet? */
  drawn = false;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { state: StoneState; idle: boolean; size: number; onFirstFrame?: () => void },
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D canvas");
    this.ctx = ctx;
    this.state = opts.state;
    this.idle = opts.idle;
    this.pose = { ...POSES[opts.state] };
    this.colour = new Color(COLOURS[opts.state]);
    this.onFirstFrame = opts.onFirstFrame ?? null;
    this.resize(opts.size);
    this.rebuild();
    views.add(this);
    wake();
  }

  /** After a lost context: a new rig on the new stage. */
  rebuild() {
    this.rig = ensure().rig(COLOURS[this.state]);
    setColour(this.rig, this.colour);
    this.dirty = true;
  }

  resize(size: number) {
    if (size === this.size) return;
    this.size = size;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.max(1, Math.round(size * dpr));
    this.canvas.height = Math.max(1, Math.round(size * (LIVE.h / LIVE.w) * dpr));
    this.dirty = true;
    wake();
  }

  setState(state: StoneState, now = performance.now()) {
    if (state === this.state) return;
    this.morph = { from: { ...this.pose }, fromColour: this.colour.clone(), at: now };
    this.state = state;
    wake();
  }

  setIdle(idle: boolean) {
    this.idle = idle;
    this.dirty = true;
    wake();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible) {
      this.dirty = true;
      wake();
    }
  }

  /** A tap: a small answer in the current mood. */
  react(now = performance.now()) {
    this.reactAt = now;
    wake();
  }

  /** The hop the unfold asks for, in place. */
  hop(now = performance.now()) {
    this.hopStart = now;
    wake();
  }

  /** Something moving on purpose: draw at the full rate. */
  busy(now: number): boolean {
    return (this.morph !== null && now - this.morph.at < MORPH_MS) || now - this.reactAt < REACT_MS || now - this.hopStart < HOP_MS;
  }

  wants(now: number): boolean {
    return this.visible && this.rig !== null && (this.dirty || this.idle || this.busy(now) || this.morph !== null);
  }

  draw(s: StoneScene, now: number) {
    const rig = this.rig;
    if (!rig) return;
    const t = now / 1000 + this.phase;
    let target = this.idle ? addPose(POSES[this.state], idleAt(this.state, t)) : { ...POSES[this.state] };
    const goal = new Color(COLOURS[this.state]);
    if (this.morph) {
      const e = easeInOut((now - this.morph.at) / MORPH_MS);
      target = lerpPose(this.morph.from, target, e);
      this.colour.copy(this.morph.fromColour).lerp(goal, e);
      if (e >= 1) this.morph = null;
    } else this.colour.copy(goal);
    let pose = target;
    const r = (now - this.reactAt) / REACT_MS;
    if (r > 0 && r < 1) pose = addPose(pose, reactionAt(this.state, r));
    const h = (now - this.hopStart) / HOP_MS;
    if (h > 0 && h < 1) pose = addPose(pose, hopAt(this.state, h));
    this.pose = pose;

    const w = this.canvas.width;
    const hgt = this.canvas.height;
    const r3 = s.renderer;
    // The shared canvas only ever grows, to the largest stone on the page.
    const have = r3.domElement;
    if (have.width < w || have.height < hgt) r3.setSize(Math.max(have.width, w), Math.max(have.height, hgt), false);
    const H = r3.domElement.height;
    r3.setViewport(0, 0, w, hgt);
    r3.setScissor(0, 0, w, hgt);
    r3.setScissorTest(true);
    setColour(rig, this.colour);
    applyPose(rig, pose, t);
    drawRig(s, rig);
    // WebGL counts rows from the bottom, the 2D canvas from the top.
    this.ctx.clearRect(0, 0, w, hgt);
    this.ctx.drawImage(r3.domElement, 0, H - hgt, w, hgt, 0, 0, w, hgt);
    this.dirty = false;
    this.drawn = true;
    if (this.onFirstFrame) {
      const f = this.onFirstFrame;
      this.onFirstFrame = null;
      f();
    }
  }

  /** Draw one frame at a given time, whatever the loop is doing: for recordings. */
  frameAt(now: number) {
    this.draw(ensure(), now);
  }

  dispose() {
    views.delete(this);
    if (this.rig && stage) stage.drop(this.rig);
    this.rig = null;
    if (views.size === 0) teardown();
  }
}
