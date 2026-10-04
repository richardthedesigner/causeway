"use client";
import { ArrowUpDown, Bus, CircleCheck, CircleHelp, CircleX, CornerRightDown, DoorOpen, Grid3x3, MoveDiagonal, Ship, TrendingUp } from "lucide-react";
import type { RouteStrip as Strip } from "@/lib/plan-types";
import { cn } from "@/lib/utils";

const BAND = ["var(--g0)", "var(--g1)", "var(--g2)", "var(--g3)", "var(--g4)"];
const BAND_WORDS = ["level", "gentle", "moderate", "steep", "very steep"];

const MARK_ICON = {
  steep: TrendingUp,
  setts: Grid3x3,
  kerb: CornerRightDown,
  bridge: Ship,
  camber: MoveDiagonal,
  lift: ArrowUpDown,
  ride: Bus,
  door: DoorOpen,
} as const;

/** Distance along the route (nav plan scale) to distance along the strip (rides shortened). */
export function stripAt(s: Strip, t: number): number {
  for (const p of s.parts) {
    if (t <= p.t1) return p.d0 + (Math.max(0, t - p.t0) / Math.max(1e-6, p.t1 - p.t0)) * (p.d1 - p.d0);
  }
  return s.length;
}

function bandStyle(bin: number): React.CSSProperties {
  if (bin === -1) return { background: "repeating-linear-gradient(90deg, var(--unknown) 0 5px, transparent 5px 9px)" };
  if (bin === 5) return { background: "repeating-linear-gradient(90deg, var(--stop) 0 3px, transparent 3px 6px)" };
  if (bin === 6) return { background: "var(--accent)", height: "4px", marginTop: "2px" };
  return { background: BAND[bin] };
}

/**
 * The whole route in one bar: slope bands in order, with what you'll meet
 * pinned on it. Dashed is ground we don't know. It reads without colour:
 * every pinned thing has an icon and is listed in words for screen readers.
 */
export function RouteStrip({ strip, along, className }: { strip: Strip; along?: number; className?: string }) {
  const L = Math.max(1, strip.length);
  // Pins closer than 7% of the bar would overlap: keep the first (route order) and say the rest in words only.
  const shown: Strip["marks"] = [];
  for (const m of strip.marks) {
    const x = stripAt(strip, m.at) / L;
    const prev = shown[shown.length - 1];
    if (!prev || x - stripAt(strip, prev.at) / L >= 0.07) shown.push(m);
  }
  const unknown = strip.parts.filter((p) => p.bin === -1).reduce((t, p) => t + p.t1 - p.t0, 0);
  const steepest = Math.max(-1, ...strip.parts.filter((p) => p.bin >= 0 && p.bin <= 4).map((p) => p.bin));
  const words = [
    steepest >= 0 ? `Steepest part ${BAND_WORDS[steepest]}` : null,
    ...strip.marks.map((m) => m.text),
    unknown >= 10 ? `${Math.round(unknown / 10) * 10} m we don't have full data for` : null,
  ].filter(Boolean);
  const me = along === undefined ? null : stripAt(strip, along) / L;

  return (
    <div className={cn("relative h-8", className)}>
      <p className="sr-only">On the way: {words.join(". ")}.</p>
      <div aria-hidden className="absolute inset-x-0 top-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {strip.parts.map((p, i) => (
          <span key={i} className="block h-2 min-w-px" style={{ flex: `${p.d1 - p.d0} 1 0`, ...bandStyle(p.bin) }} />
        ))}
      </div>
      <div aria-hidden className="absolute inset-0">
        {shown.map((m, i) => {
          const Icon = MARK_ICON[m.kind];
          const warn = m.kind === "steep" || m.kind === "setts" || m.kind === "camber" || m.kind === "kerb" || m.kind === "bridge";
          return (
            <span
              key={i}
              title={m.text}
              className={cn("absolute top-0 grid size-8 -translate-x-1/2 place-items-center rounded-full border-2 bg-surface", warn ? "border-caution text-caution" : "border-ink text-ink")}
              style={{ left: `clamp(1rem, ${(stripAt(strip, m.at) / L) * 100}%, calc(100% - 1rem))` }}
            >
              <Icon className="size-4" strokeWidth={2.4} />
            </span>
          );
        })}
        {me !== null ? (
          <span className="absolute top-1 size-6 -translate-x-1/2 rounded-full border-[3px] border-surface bg-accent shadow" style={{ left: `clamp(0.75rem, ${me * 100}%, calc(100% - 0.75rem))` }} />
        ) : null}
      </div>
    </div>
  );
}

export type VerdictKind = "passable" | "passable-with-unknowns" | "not-passable" | "none";

/** Fits / Unsure / Doesn't fit. Word, icon and colour together; never colour alone. */
export function VerdictPill({ v, className }: { v: VerdictKind; className?: string }) {
  const ok = v === "passable";
  const unsure = v === "passable-with-unknowns";
  const Icon = ok ? CircleCheck : unsure ? CircleHelp : CircleX;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold whitespace-nowrap",
        ok ? "bg-ok-soft text-ok" : unsure ? "bg-caution-soft text-caution" : "bg-stop-soft text-stop",
        className,
      )}
    >
      <Icon aria-hidden className="size-4" strokeWidth={2.4} />
      {ok ? "Fits" : unsure ? "Unsure" : "Doesn't fit"}
    </span>
  );
}
