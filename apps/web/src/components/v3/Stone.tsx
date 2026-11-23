"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./v3.module.css";

export type StoneState = "fits" | "unsure" | "nope" | "fog";

/** The renders are 676 by 550 (docs/ux/v3/stone/). */
const RATIO = 550 / 676;
/** A little longer than the 200 ms fade, so the old stone always goes, with or without animations. */
const SWAP_MS = 260;

function Img({ state, size, className }: { state: StoneState; size: number; className?: string }) {
  // Relative, like every other file the app fetches, so it also works where the app is not at the root.
  const src = (x: 2 | 3) => `stone/stone-${state}@${x}x.webp`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" role="presentation" draggable={false} decoding="async" className={className} width={size} height={Math.round(size * RATIO)} src={src(2)} srcSet={`${src(2)} 451w, ${src(3)} 676w`} sizes={`${size}px`} />
  );
}

/**
 * The stone (design v3): a sett with two eyes, showing the route's state.
 * Decorative: it sits beside the word and the icon and is never the only
 * signal of anything, so it has no name and screen readers pass over it.
 *
 * `size` is its width in CSS px. It bobs only when `idle` and motion is
 * allowed. Changing `state` cross-fades in 200 ms.
 */
export function Stone({ state, size, idle = false, className }: { state: StoneState; size: number; idle?: boolean; className?: string }) {
  const [shown, setShown] = useState(state);
  const [old, setOld] = useState<StoneState | null>(null);
  // A new state: keep the one on screen as the outgoing layer (the pattern React gives for state that follows a prop).
  if (state !== shown) {
    setOld(shown);
    setShown(state);
  }
  useEffect(() => {
    if (old === null) return;
    const t = setTimeout(() => setOld(null), SWAP_MS);
    return () => clearTimeout(t);
  }, [old, shown]);

  return (
    <span aria-hidden className={cn(styles.stone, idle && styles.bob, className)} style={{ width: size, height: Math.round(size * RATIO) }}>
      {old !== null ? <Img key={`out-${old}`} state={old} size={size} className={styles.out} /> : null}
      <Img key={shown} state={shown} size={size} className={old !== null ? styles.in : undefined} />
    </span>
  );
}
