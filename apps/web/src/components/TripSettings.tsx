"use client";
import { ChevronRight } from "lucide-react";
import { GROUND, type Ground } from "@/components/MapChrome";
import { Switch } from "@/components/ui/switch";
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
  onToilets: () => void;
}

const km = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

/**
 * "This trip", at the foot of the sheet when it's swiped up (D-036 step 8):
 * who you're getting around as, the ground, buses and toilets. Settings sit at
 * the bottom of the screen, in reach, never across the top of the map.
 */
export function TripSettings(p: Props) {
  const row = "flex min-h-14 items-center justify-between gap-3 border-b border-line";
  return (
    <section aria-labelledby="trip-h" className="grid gap-1">
      <h2 id="trip-h" className="m-0 px-1 pt-2 font-mono text-xs tracking-[0.08em] text-muted uppercase">
        This trip
      </h2>
      <div className="grid px-1">
        <button type="button" onClick={p.onDevice} className={cn(row, "text-left")}>
          <span>Getting around as</span>
          <span className="flex min-w-0 items-center gap-1 font-bold">
            <span className="truncate">{p.deviceLabel}</span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
          </span>
        </button>
        <fieldset className={cn(row, "m-0 flex-wrap border-x-0 border-t-0 p-0 py-2")}>
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
          <span className="flex items-center gap-1 font-bold">
            {p.toiletEvery === null ? "Don't mind" : km(p.toiletEvery)}
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
    <div role="radiogroup" aria-label="Ground" className={cn("flex gap-1.5", className)}>
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
