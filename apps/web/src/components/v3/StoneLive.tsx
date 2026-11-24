"use client";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { cn } from "@/lib/utils";
import { Stone, type StoneState } from "./Stone";
import { HEADROOM } from "./stone-poses";
import type { StoneView } from "./stone-stage";
import styles from "./stone-live.module.css";

/** The stone's box, as Stone's: its renders are 676 by 550. */
const RATIO = 550 / 676;

/**
 * What the stone is doing, for the lab and for tests:
 * - `starting`: the still image shows while three.js loads;
 * - `live`: the 3D stone is drawing;
 * - otherwise the still image, and why: reduced motion, no WebGL, Save-Data,
 *   WebGL would be slow here, the context was lost, frames kept taking too long,
 *   the tab is hidden, or a preview asked for it.
 */
export type StoneLiveMode = "starting" | "live" | "reduced-motion" | "no-webgl" | "save-data" | "lost" | "slow" | "hidden" | "fallback";

/** What a parent can ask of a live stone, through `ref`. Both do nothing while the still image shows. */
export interface StoneLiveHandle {
  /** The hop in place (700 ms), for the unfold to play as it moves the stone's box onto its band. */
  hop(): void;
  /** The same small answer a tap gives. */
  react(): void;
}

export interface StoneLiveProps {
  state: StoneState;
  /** Width in CSS px, as Stone. */
  size: number;
  /** Plays the state's idle loop. Without it the stone holds its pose, still reacts and hops, and costs nothing between. */
  idle?: boolean;
  className?: string;
  ref?: Ref<StoneLiveHandle>;
  /** For the lab: behave as under reduced motion, or as with no WebGL. */
  force?: "reduced-motion" | "fallback";
  onModeChange?: (mode: StoneLiveMode) => void;
}

function saveData(): boolean {
  try {
    return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  } catch {
    return false;
  }
}

/**
 * The live stone (design v3, FEAT-73): the sett in three.js, with a body
 * language for each state that reads without colour (stone-poses.ts). It
 * takes the same props as Stone, so one can replace the other in a line.
 *
 * Decorative, like Stone: hidden from screen readers, never focused, and
 * always beside the word and the icon that carry the verdict. A tap gets a
 * small answer in its mood and means nothing; the tap is not stopped, so a
 * swipe that starts on the stone still reaches the page.
 *
 * It shows the still image (Stone, rendered from the same poses) first, and
 * whenever live drawing is wrong or impossible: reduced motion, no WebGL or
 * only software WebGL, a lost context, frames that keep running slow,
 * Save-Data, or a hidden tab. three.js is fetched only when the
 * live stone is wanted.
 */
export function StoneLive({ state, size, idle = false, className, ref, force, onModeChange }: StoneLiveProps) {
  const box = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<StoneView | null>(null);
  const latest = useRef({ state, idle, size });
  latest.current = { state, idle, size };
  // Unknown until mounted: the exported page always starts on the still image.
  const [env, setEnv] = useState<{ reduced: boolean; saveData: boolean } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const [trouble, setTrouble] = useState<"lost" | "slow" | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setEnv({ reduced: mq.matches, saveData: saveData() });
    read();
    mq.addEventListener("change", read);
    const vis = () => setHidden(document.hidden);
    vis();
    document.addEventListener("visibilitychange", vis);
    return () => {
      mq.removeEventListener("change", read);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  const wanted = env !== null && !force && !env.reduced && !env.saveData && !noWebgl;

  useEffect(() => {
    if (!wanted) return;
    let gone = false;
    let unhear = () => {};
    import("./stone-stage")
      .then((m) => {
        if (gone || !canvas.current) return;
        if (!m.stageReady()) return setNoWebgl(true);
        unhear = m.onStage((s) => setTrouble(s === "ok" ? null : s));
        const { state: s, idle: i, size: z } = latest.current;
        view.current = new m.StoneView(canvas.current, { state: s, idle: i, size: z, onFirstFrame: () => setDrawn(true) });
      })
      .catch(() => {
        if (!gone) setNoWebgl(true);
      });
    return () => {
      gone = true;
      unhear();
      view.current?.dispose();
      view.current = null;
      setDrawn(false);
    };
  }, [wanted]);

  useEffect(() => view.current?.setState(state), [state]);
  useEffect(() => view.current?.setIdle(idle), [idle]);
  useEffect(() => view.current?.resize(size), [size]);

  // Draw only while on screen.
  useEffect(() => {
    const el = box.current;
    if (!wanted || !el || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver(([e]) => view.current?.setVisible(!!e?.isIntersecting), { rootMargin: "64px" });
    seen.observe(el);
    return () => seen.disconnect();
  }, [wanted]);

  useImperativeHandle(ref, () => ({ hop: () => view.current?.hop(), react: () => view.current?.react() }), []);

  const mode: StoneLiveMode =
    force === "reduced-motion" || env?.reduced
      ? "reduced-motion"
      : force === "fallback"
        ? "fallback"
        : env?.saveData
          ? "save-data"
          : noWebgl
            ? "no-webgl"
            : trouble
              ? trouble
              : hidden
                ? "hidden"
                : drawn
                  ? "live"
                  : "starting";
  useEffect(() => onModeChange?.(mode), [mode, onModeChange]);

  const live = mode === "live";
  const height = Math.round(size * RATIO);
  // The still image bobs only where it stands in for good (no WebGL, Save-Data, a lost context), never while the live stone loads.
  const settled = mode === "no-webgl" || mode === "save-data" || mode === "lost" || mode === "slow" || mode === "fallback";

  return (
    <span ref={box} aria-hidden className={cn(styles.box, className)} style={{ width: size, height }} onPointerDown={live ? () => view.current?.react() : undefined}>
      {live ? null : <Stone state={state} size={size} idle={idle && settled} />}
      {wanted ? <canvas ref={canvas} className={styles.canvas} style={{ top: -height * HEADROOM, height: height * (1 + HEADROOM), visibility: live ? "visible" : "hidden" }} /> : null}
    </span>
  );
}
