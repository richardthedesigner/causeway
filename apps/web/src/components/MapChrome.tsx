"use client";
import { Check, ChevronDown, CloudRain, Layers, LocateFixed, Snowflake, Sun } from "lucide-react";
import type { City } from "@/lib/cities";
import { useMenu } from "@/lib/use-menu";
import { cn } from "@/lib/utils";

export type Ground = "dry" | "wet" | "ice";

interface Props {
  city: City;
  cities: City[];
  onCity: (c: City) => void;
  showSlopes: boolean;
  onSlopes: (v: boolean) => void;
  onLocate: () => void;
  locating: boolean;
  credit: string;
  /** While navigating only the layers button stays; the rest is noise. */
  minimal?: boolean;
}

export const GROUND = {
  dry: { icon: Sun, label: "Dry", long: "Dry ground" },
  wet: { icon: CloudRain, label: "Wet", long: "Wet ground" },
  ice: { icon: Snowflake, label: "Icy", long: "Icy ground" },
} as const;

const chip = "pointer-events-auto inline-flex max-w-full min-h-12 items-center gap-2 rounded-full bg-glass px-4 font-bold shadow-[0_2px_12px_rgb(0_0_0/0.16)] backdrop-blur-md";
const fab = "pointer-events-auto grid size-12 place-items-center rounded-2xl bg-glass shadow-[0_2px_12px_rgb(0_0_0/0.16)] backdrop-blur-md";
const panel = "pointer-events-auto absolute z-30 mt-2 grid min-w-60 gap-1 rounded-2xl border border-line bg-surface p-2 text-base shadow-[0_8px_30px_rgb(0_0_0/0.2)]";

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={on} onClick={onClick} className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-left", on ? "bg-surface-2 font-bold" : "hover:bg-surface-2")}>
      <span className="flex-1">{children}</span>
      {on ? <Check aria-hidden className="size-5 text-accent" /> : null}
    </button>
  );
}

/**
 * What floats over the map: where you are (city) and the map's own
 * controls. Everything you set for a trip, the ground included, lives in the
 * sheet at the bottom, in reach (D-036 step 8).
 */
export function MapChrome(props: Props) {
  const { open, setOpen, toggle, root } = useMenu();
  return (
    <div ref={root} className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] md:left-[452px]">
      {!props.minimal ? (
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          <div className="relative max-w-full">
            <button type="button" data-menu="city" aria-haspopup="menu" aria-expanded={open === "city"} onClick={() => toggle("city")} className={chip}>
              <span className="sr-only">City: </span>
              {props.city.name}
              <ChevronDown aria-hidden className="size-4" strokeWidth={2.6} />
            </button>
            {open === "city" ? (
              <div role="menu" aria-label="City" className={cn(panel, "left-0")}>
                {props.cities.map((c) => (
                  <Option
                    key={c.id}
                    on={c.id === props.city.id}
                    onClick={() => {
                      setOpen(null);
                      if (c.id !== props.city.id) props.onCity(c);
                    }}
                  >
                    {c.name}
                  </Option>
                ))}
                <p className="m-0 px-3 pt-1 pb-2 text-sm text-muted">{props.city.coverage}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="ml-auto grid shrink-0 gap-2">
        <div className="relative">
          <button type="button" data-menu="layers" aria-haspopup="menu" aria-expanded={open === "layers"} aria-label="Map layers" onClick={() => toggle("layers")} className={cn(fab, props.showSlopes && "bg-ink text-surface")}>
            <Layers aria-hidden className="size-6" />
          </button>
          {open === "layers" ? (
            <div role="menu" aria-label="Map layers" className={cn(panel, "right-0 w-72 max-w-[calc(100vw-2rem)]")}>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={props.showSlopes}
                onClick={() => props.onSlopes(!props.showSlopes)}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-2"
              >
                <span className="flex-1 font-bold">Slopes on every street</span>
                <span aria-hidden className={cn("relative h-7 w-12 rounded-full transition-colors", props.showSlopes ? "bg-accent" : "bg-line")}>
                  <span className={cn("absolute top-1 size-5 rounded-full bg-surface transition-[left]", props.showSlopes ? "left-6" : "left-1")} />
                </span>
              </button>
              <ul aria-label="Slope key" className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-sm">
                {[["--g0", "0 to 3%"], ["--g1", "3 to 5%"], ["--g2", "5 to 8%"], ["--g3", "8 to 12%"], ["--g4", "Over 12%"]].map(([c, l]) => (
                  <li key={l} className="flex items-center gap-2">
                    <span aria-hidden className="inline-block h-1.5 w-6 rounded-full" style={{ background: `var(${c})` }} />
                    {l}
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  <span aria-hidden className="inline-block h-0 w-6 border-t-2 border-dashed border-unknown" />
                  Not known
                </li>
              </ul>
              <details className="px-3 pb-2 text-sm text-muted">
                <summary className="min-h-10 cursor-pointer py-2 font-bold text-ink">About this map</summary>
                {props.credit}
              </details>
            </div>
          ) : null}
        </div>
        {!props.minimal ? (
          <button type="button" aria-label={props.locating ? "Finding your location" : "Start from your location"} onClick={props.onLocate} className={fab}>
            <LocateFixed aria-hidden className={cn("size-6", props.locating && "animate-pulse text-accent")} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
