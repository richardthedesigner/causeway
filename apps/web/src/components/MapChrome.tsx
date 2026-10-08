"use client";
import { Check, ChevronDown, CloudRain, Layers, LocateFixed, MapPinPlus, Snowflake, Sun } from "lucide-react";
import { COMMUNITY_CATEGORIES } from "@causeway/graph";
import type { CommunityFilter } from "@/lib/community-store";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  highContrast: boolean;
  onHighContrast: (v: boolean) => void;
  onLocate: () => void;
  locating: boolean;
  credit: string;
  /** While navigating only the layers button stays; the rest is noise. */
  minimal?: boolean;
  /** Community reports on the map (FEAT-25): which to show. */
  community: CommunityFilter;
  onCommunity: (f: CommunityFilter) => void;
  /** Start adding a report. Absent while navigating (the report button there is for problems). */
  onAddReport?: () => void;
}

export const GROUND = {
  dry: { icon: Sun, label: "Dry", long: "Dry ground" },
  wet: { icon: CloudRain, label: "Wet", long: "Wet ground" },
  ice: { icon: Snowflake, label: "Icy", long: "Icy ground" },
} as const;

// The bar over the map is sized in pixels: with large text, rem sizes would double the buttons and squeeze out the city name (STAB-13).
const chip = "pointer-events-auto inline-flex max-w-full min-h-12 items-center gap-[6px] rounded-full bg-glass px-[12px] text-left font-bold break-words shadow-[0_2px_12px_rgb(0_0_0/0.16)] backdrop-blur-md";
const fab = "pointer-events-auto grid size-[48px] place-items-center rounded-2xl bg-glass shadow-[0_2px_12px_rgb(0_0_0/0.16)] backdrop-blur-md";
// A menu stays on screen at 200% text: no wider than the screen less the 12 px margins, and it scrolls if it's taller than the space below its button.
const panel = "fixed z-[60] grid min-w-[240px] max-w-[calc(100vw-24px)] content-start gap-1 overflow-y-auto rounded-2xl border border-line bg-surface p-2 text-base text-ink shadow-[0_8px_30px_rgb(0_0_0/0.2)]";

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={on} onClick={onClick} className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-left", on ? "bg-surface-2 font-bold" : "hover:bg-surface-2")}>
      <span className="flex-1">{children}</span>
      {on ? <Check aria-hidden className="size-5 text-accent" /> : null}
    </button>
  );
}

function Toggle({ on, onClick, children, indent = false }: { on: boolean; onClick: () => void; children: React.ReactNode; indent?: boolean }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={onClick} className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-2", indent && "pl-6")}>
      <span className={cn("min-w-0 flex-1", !indent && "font-bold")}>{children}</span>
      <span aria-hidden className={cn("relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors", on ? "bg-accent" : "bg-line")}>
        <span className={cn("absolute top-[4px] size-[20px] rounded-full bg-surface transition-[left]", on ? "left-[24px]" : "left-[4px]")} />
      </span>
    </button>
  );
}

/**
 * What floats over the map: where you are (city) and the map's own
 * controls. Everything you set for a trip, the ground included, lives in the
 * sheet at the bottom, in reach (D-036 step 8).
 */
export function MapChrome(props: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const { open, setOpen, toggle, root } = useMenu(menu);
  const [pickCategories, setPickCategories] = useState(false);
  const [about, setAbout] = useState(false);
  /**
   * An open menu is drawn at the end of the page, above the sheet, just under its button.
   * Inside the map it sat under the bottom sheet (drawn later, on top), so at
   * 200% text the sheet hid half the city list (STAB-17).
   */
  const [at, setAt] = useState<{ top: number; left?: number; right?: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return setAt(null);
    const place = () => {
      const r = root.current?.querySelector(`[data-menu="${open}"]`)?.getBoundingClientRect();
      if (r) setAt(open === "city" ? { top: r.bottom + 8, left: r.left } : { top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening moves focus into the menu (the chosen item, or the first); arrows move through it.
  useEffect(() => {
    if (open && at) (menu.current?.querySelector<HTMLElement>('[aria-checked="true"][role=menuitemradio]') ?? menu.current?.querySelector<HTMLElement>("[role^=menuitem]"))?.focus();
  }, [open, at]);
  const close = () => {
    root.current?.querySelector<HTMLButtonElement>(`[data-menu="${open}"]`)?.focus();
    setOpen(null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    // The menu is drawn at the end of the page, so Tab would leave it for nowhere useful: close it and go back to its button.
    if (e.key === "Tab") {
      e.preventDefault();
      return close();
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const floating = (label: string, className: string, children: React.ReactNode) =>
    at
      ? createPortal(
          <div ref={menu} role="menu" aria-label={label} onKeyDown={onKey} style={{ top: at.top, left: at.left, right: at.right, maxHeight: `calc(100dvh - ${Math.round(at.top) + 12}px)` }} className={cn(panel, className)}>
            {children}
          </div>,
          document.body,
        )
      : null;
  return (
    <div ref={root} className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-[8px] px-[12px] pt-[calc(12px+env(safe-area-inset-top,0px))] md:left-[452px]">
      {!props.minimal ? (
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          <div className="relative max-w-full">
            <button type="button" data-menu="city" aria-haspopup="menu" aria-expanded={open === "city"} onClick={() => toggle("city")} className={chip}>
              <span className="sr-only">City: </span>
              {props.city.name}
              <ChevronDown aria-hidden className="size-[16px] shrink-0" strokeWidth={2.6} />
            </button>
            {open === "city" ? (
              floating("City", "", <>
                {props.cities.map((c) => (
                  <Option
                    key={c.id}
                    on={c.id === props.city.id}
                    onClick={() => {
                      close();
                      if (c.id !== props.city.id) props.onCity(c);
                    }}
                  >
                    {c.name}
                  </Option>
                ))}
                <p className="m-0 px-3 pt-1 pb-2 text-sm text-muted">{props.city.coverage}</p>
              </>)
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="ml-auto grid shrink-0 gap-2">
        <div className="relative">
          <button type="button" data-menu="layers" aria-haspopup="menu" aria-expanded={open === "layers"} aria-label="Map layers" onClick={() => toggle("layers")} className={cn(fab, props.showSlopes && "bg-ink text-surface")}>
            <Layers aria-hidden className="size-[24px]" />
          </button>
          {open === "layers" ? (
            floating("Map layers", "w-[288px]", <>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={props.showSlopes}
                onClick={() => props.onSlopes(!props.showSlopes)}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 font-bold">Slopes on every street</span>
                <span aria-hidden className={cn("relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors", props.showSlopes ? "bg-accent" : "bg-line")}>
                  <span className={cn("absolute top-[4px] size-[20px] rounded-full bg-surface transition-[left]", props.showSlopes ? "left-[24px]" : "left-[4px]")} />
                </span>
              </button>
              <div role="group" aria-label="Slope key" className="m-0 grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-sm">
                {[["--g0", "0 to 3%"], ["--g1", "3 to 5%"], ["--g2", "5 to 8%"], ["--g3", "8 to 12%"], ["--g4", "Over 12%"]].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-2">
                    <span aria-hidden className="inline-block h-1.5 w-6 rounded-full" style={{ background: `var(${c})` }} />
                    {l}
                  </span>
                ))}
                <span className="flex items-center gap-2">
                  <span aria-hidden className="inline-block h-0 w-6 border-t-2 border-dashed border-unknown" />
                  Not known
                </span>
              </div>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={props.highContrast}
                onClick={() => props.onHighContrast(!props.highContrast)}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 font-bold">High contrast map</span>
                <span aria-hidden className={cn("relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors", props.highContrast ? "bg-accent" : "bg-line")}>
                  <span className={cn("absolute top-[4px] size-[20px] rounded-full bg-surface transition-[left]", props.highContrast ? "left-[24px]" : "left-[4px]")} />
                </span>
              </button>
              <div role="group" aria-label="Community reports" className="mt-1 grid gap-1 border-t border-line pt-2">
                <Toggle on={props.community.show} onClick={() => props.onCommunity({ ...props.community, show: !props.community.show })}>
                  Community reports
                </Toggle>
                {props.community.show ? (
                  <>
                    <Toggle indent on={props.community.bad} onClick={() => props.onCommunity({ ...props.community, bad: !props.community.bad })}>
                      <span aria-hidden className="mr-2 inline-block text-stop">▲</span>Problems
                    </Toggle>
                    <Toggle indent on={props.community.good} onClick={() => props.onCommunity({ ...props.community, good: !props.community.good })}>
                      <span aria-hidden className="mr-2 inline-block text-ok">●</span>Good for access
                    </Toggle>
                    <button type="button" role="menuitem" aria-expanded={pickCategories} onClick={() => setPickCategories((v) => !v)} className="flex min-h-12 items-center gap-3 rounded-xl px-3 pl-6 text-left font-bold hover:bg-surface-2">
                      <span className="min-w-0 flex-1">Choose categories</span>
                      <ChevronDown aria-hidden className={cn("size-5 shrink-0 transition-transform", pickCategories && "rotate-180")} />
                    </button>
                    {pickCategories ? (
                      <div role="group" aria-label="Categories" className="grid gap-1">
                        {COMMUNITY_CATEGORIES.filter((c) => (c.polarity === "bad" ? props.community.bad : props.community.good)).map((c) => {
                          const on = !props.community.hidden.includes(c.id);
                          return (
                            <Toggle
                              key={c.id}
                              indent
                              on={on}
                              onClick={() => props.onCommunity({ ...props.community, hidden: on ? [...props.community.hidden, c.id] : props.community.hidden.filter((h) => h !== c.id) })}
                            >
                              {c.label}
                            </Toggle>
                          );
                        })}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
              <button type="button" role="menuitem" aria-expanded={about} onClick={() => setAbout((v) => !v)} className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold hover:bg-surface-2">
                <span className="min-w-0 flex-1">About this map</span>
                <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform", about && "rotate-180")} />
              </button>
              {about ? (
                <div role="group" aria-label="About this map" className="px-3 pb-2 text-sm text-muted">
                  {props.credit}
                </div>
              ) : null}
            </>)
          ) : null}
        </div>
        {!props.minimal && props.onAddReport ? (
          <button type="button" id="add-report" aria-label="Add a report" onClick={props.onAddReport} className={cn(fab, "bg-accent text-accent-ink")}>
            <MapPinPlus aria-hidden className="size-[24px]" />
          </button>
        ) : null}
        {!props.minimal ? (
          <button type="button" aria-label={props.locating ? "Finding your location" : "Start from your location"} onClick={props.onLocate} className={fab}>
            <LocateFixed aria-hidden className={cn("size-[24px]", props.locating && "animate-pulse text-accent")} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
