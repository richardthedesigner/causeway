"use client";
import { formatDistance, type DistanceUnit } from "@causeway/profile";
import { ChevronRight } from "lucide-react";
import { GROUND, type Ground } from "@/components/MapChrome";
import { Switch } from "@/components/ui/switch";
import { leaveLabel, nextAt, ukTime } from "@/lib/leave";
import { cn } from "@/lib/utils";

interface Props {
  deviceLabel: string;
  onDevice: () => void;
  ground: Ground;
  groundNote: string;
  onGround: (g: Ground) => void;
  buses: boolean;
  onBuses: (v: boolean) => void;
  toiletEvery: number | null;
  /** How this person reads distances. */
  unit: DistanceUnit;
  onToilets: () => void;
  leaveAt: Date | null;
  onLeave: (d: Date | null) => void;
}

/**
 * "This trip", at the foot of the sheet when it's swiped up (D-036 step 8):
 * who you're getting around as, the ground, buses and toilets. Settings sit at
 * the bottom of the screen, in reach, never across the top of the map.
 */
export function TripSettings(p: Props) {
  // Rows wrap and the grids hold their width, so 200% text on a 320 px phone stays on screen (STAB-12).
  const row = "flex min-h-14 flex-wrap items-center justify-between gap-x-3 border-b border-line py-1";
  return (
    <section aria-labelledby="trip-h" className="grid grid-cols-1 gap-1">
      <h2 id="trip-h" className="m-0 px-1 pt-2 font-mono text-xs tracking-[0.08em] text-muted uppercase">
        This trip
      </h2>
      <div className="grid grid-cols-1 px-1">
        <button type="button" onClick={p.onDevice} className={cn(row, "text-left")}>
          <span>Getting around as</span>
          <span className="ml-auto flex min-w-0 items-center gap-1 font-bold">
            <span className="truncate">{p.deviceLabel}</span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
          </span>
        </button>
        <Leaving row={row} leaveAt={p.leaveAt} onLeave={p.onLeave} />
        <fieldset className={cn(row, "m-0 min-w-0 flex-wrap border-x-0 border-t-0 p-0 py-2")}>
          <legend className="float-left">Ground</legend>
          <GroundPicker ground={p.ground} onGround={p.onGround} />
          <p className="m-0 basis-full text-sm text-muted">{p.groundNote}</p>
        </fieldset>
        <label htmlFor="trip-buses" className={cn(row, "cursor-pointer")}>
          <span>Use buses</span>
          <Switch id="trip-buses" checked={p.buses} onCheckedChange={p.onBuses} />
        </label>
        <button type="button" onClick={p.onToilets} className={cn(row, "border-b-0 text-left")}>
          <span>Accessible toilet at least every</span>
          <span className="ml-auto flex items-center gap-1 font-bold">
            {p.toiletEvery === null ? "Don't mind" : formatDistance(p.toiletEvery, p.unit)}
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
          </span>
        </button>
      </div>
    </section>
  );
}

/** Dry, wet or icy: three chips, the same wherever the ground can be changed. */
export function GroundPicker({ ground, onGround, className }: { ground: Ground; onGround: (g: Ground) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Ground" className={cn("flex flex-wrap gap-1.5", className)}>
      {(Object.keys(GROUND) as Ground[]).map((k) => {
        const G = GROUND[k];
        const on = ground === k;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onGround(k)}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-bold", on ? "border-ink bg-ink text-surface" : "border-line hover:border-ink")}
          >
            <G.icon aria-hidden className="size-4" /> {G.label}
          </button>
        );
      })}
    </div>
  );
}

const SOON = [
  { label: "Now", min: 0 },
  { label: "In 30 min", min: 30 },
  { label: "In 1 hour", min: 60 },
];

/** Now, soon, or a set time (the next time the clock reads it: today, or tomorrow if it's passed). */
function Leaving({ row, leaveAt, onLeave }: { row: string; leaveAt: Date | null; onLeave: (d: Date | null) => void }) {
  const label = leaveLabel(leaveAt);
  const chip = "inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-bold";
  const set = leaveAt && label !== "now";
  return (
    <fieldset className={cn(row, "m-0 min-w-0 flex-wrap border-x-0 border-t-0 p-0 py-2")}>
      <legend className="float-left">Leaving</legend>
      <span className="font-bold" aria-live="polite">
        {label === "now" ? "Now" : `${label.charAt(0).toUpperCase()}${label.slice(1)}`}
      </span>
      <div className="flex basis-full flex-wrap items-center gap-1.5">
        {SOON.map((o) => (
          <button key={o.label} type="button" onClick={() => onLeave(o.min ? new Date(Date.now() + o.min * 60_000) : null)} className={cn(chip, (o.min === 0 ? !set : false) ? "border-ink bg-ink text-surface" : "border-line hover:border-ink")} aria-pressed={o.min === 0 ? !set : undefined}>
            {o.label}
          </button>
        ))}
        {/* The time field has a fixed width, so with large text "At" goes above it (STAB-12). */}
        <label className={cn(chip, "max-w-full flex-wrap gap-x-2 rounded-[22px] px-[12px] font-normal", set ? "border-ink" : "border-line")}>
          <span className="font-bold">At</span>
          <input type="time" value={set ? ukTime(leaveAt) : ""} onChange={(e) => onLeave(nextAt(e.target.value))} className="min-h-9 min-w-0 bg-transparent text-base" />
        </label>
      </div>
      {set ? <p className="m-0 basis-full text-sm text-muted">Routes, bus waits, opening hours, daylight and the forecast are for {label}.</p> : null}
    </fieldset>
  );
}
