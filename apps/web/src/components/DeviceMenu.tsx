"use client";
import { PRESETS, type SavedDevice } from "@causeway/profile";
import { Accessibility, Check, ChevronUp, Pencil, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deviceLabel, limitsLine, orderDevices, routingFor } from "@/lib/devices";
import { useMenu } from "@/lib/use-menu";
import { cn } from "@/lib/utils";

interface Props {
  devices: SavedDevice[];
  activeId: string;
  onPick: (id: string) => void;
  onEdit: () => void;
  onAdd: () => void;
  /** First visit: the button reads "Set up" and opens setup instead of the list. */
  onSetup?: () => void;
  /** A device borrowed for this journey only: the button says "Lulu, this trip". */
  tripLabel?: string;
  /** The id of that borrowed device, so the route screen's line can show its type and limits. */
  tripId?: string;
  /** Show the one-time tip that the button switches device. */
  tip?: boolean;
  onTipSeen?: () => void;
  /** "chip" sits in the search bar; "row" is the full-width line on the route screen (FEAT-21). */
  variant?: "chip" | "row";
}

const typeOf = (d: SavedDevice) => PRESETS[d.profile.preset].label;

/**
 * Who the routes are for, inside the search bar (D-036). A named device
 * shows its name; an unnamed one its icon and type. The list opens upwards,
 * so a thumb on the button never covers it. On the route screen it is a
 * full-width line near the top of the panel (FEAT-21); in the wide-screen
 * side panel the list opens downwards there, so it isn't cut off above.
 */
export function DeviceMenu({ devices, activeId, onPick, onEdit, onAdd, onSetup, tripLabel, tip, onTipSeen, variant = "chip", tripId }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const { open, setOpen, toggle, root } = useMenu(panel);
  /**
   * Where the list sits: just above the button, measured on open. It's drawn
   * on the sheet's outer layer (not inside its scrolling body, which clips
   * anything above the sheet's top edge) so focus and keys stay in the sheet.
   */
  const [at, setAt] = useState<{ bottom: number; top: number; right: number; host: HTMLElement } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const active = devices.find((d) => d.id === activeId) ?? devices[0]!;
  const list = orderDevices(devices);
  const split = list.some((d) => !d.favourite) && list.length > 2;
  const isOpen = open === "device";

  useLayoutEffect(() => {
    if (!isOpen && !said && !tip) return;
    const place = () => {
      const host = root.current?.closest<HTMLElement>("[data-vaul-drawer]") ?? document.body;
      const r = root.current?.getBoundingClientRect();
      const h = host === document.body ? new DOMRect(0, 0, window.innerWidth, window.innerHeight) : host.getBoundingClientRect();
      if (r) setAt({ bottom: h.bottom - r.top + 8, top: r.bottom - h.top + 8, right: Math.max(8, h.right - r.right), host });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [isOpen, said, tip]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening puts focus on the device in use; arrow keys move through the list.
  useEffect(() => {
    if (isOpen && at) panel.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [isOpen, at]);
  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), 2500);
    return () => clearTimeout(t);
  }, [said]);

  // The search list around us (cmdk) also listens for arrows and Enter; keep those keys to this control.
  const keep = (e: React.KeyboardEvent) => {
    if (["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) e.stopPropagation();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(panel.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const close = () => {
    setOpen(null);
    root.current?.querySelector<HTMLButtonElement>('[data-menu="device"]')?.focus();
  };
  const pick = (d: SavedDevice) => {
    close();
    if (d.id === activeId && !tripLabel) return;
    onPick(d.id);
    setSaid(`Now using ${deviceLabel(d)}`);
  };

  const row = (d: SavedDevice) => {
    const on = d.id === activeId;
    return (
      <button
        key={d.id}
        type="button"
        role="menuitemradio"
        aria-checked={on}
        onClick={() => pick(d)}
        className={cn("flex min-h-14 items-center gap-3 rounded-xl px-3 py-1.5 text-left", on ? "bg-surface-2" : "hover:bg-surface-2")}
      >
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="font-bold">
            {deviceLabel(d)}
            {d.favourite ? (
              <span className="text-caution">
                {" "}
                <span aria-hidden>★</span>
                <span className="sr-only">, favourite</span>
              </span>
            ) : null}
          </span>
          {d.name ? <span className="text-sm text-muted">{typeOf(d)}</span> : null}
        </span>
        {on ? <Check aria-hidden className="size-5 shrink-0 text-accent" /> : null}
      </button>
    );
  };

  return (
    <div ref={root} onKeyDown={keep} className="relative max-w-full min-w-0">
      {onSetup && variant !== "row" ? (
        <SetupButton onClick={onSetup} />
      ) : variant === "row" ? (
        <RowButton
          active={devices.find((d) => d.id === tripId) ?? active}
          trip={!!tripLabel}
          open={isOpen}
          // First visit: nothing saved yet, so Change starts setup rather than a list of one.
          onClick={() => {
            if (onSetup) return onSetup();
            if (tip) onTipSeen?.();
            toggle("device");
          }}
          setup={!!onSetup}
        />
      ) : (
      <button
        type="button"
        data-menu="device"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          if (tip) onTipSeen?.();
          toggle("device");
        }}
        aria-label={tripLabel ? `Routes are for ${tripLabel}, this trip only. Change device` : `Routes are for ${deviceLabel(active)}${active.name ? `, ${typeOf(active)}` : ""}. Change device`}
        className="inline-flex min-h-12 max-w-full min-w-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-accent-ink"
      >
        {active.name || tripLabel ? null : <Accessibility aria-hidden className="size-4 shrink-0" strokeWidth={2.6} />}
        <span className="truncate">{tripLabel ? `${tripLabel}, this trip` : deviceLabel(active)}</span>
        <ChevronUp aria-hidden className={cn("size-4 shrink-0 transition-transform", !isOpen && "rotate-180")} strokeWidth={2.6} />
      </button>
      )}

      {isOpen && at ? createPortal(
        <div
          ref={panel}
          role="menu"
          aria-label="Getting around as"
          onKeyDown={(e) => { keep(e); onKey(e); }}
          style={variant === "row" && at.host === document.body ? { top: at.top, right: at.right } : { bottom: at.bottom, right: at.right }}
          className="absolute z-[60] grid w-72 max-w-[calc(100vw-2rem)] gap-0.5 rounded-2xl border border-line bg-surface p-2 text-base text-ink shadow-[0_8px_30px_rgb(0_0_0/0.2)]"
        >
          {split ? <p className="m-0 px-3 pt-1 text-xs tracking-wide text-muted uppercase">Favourites</p> : null}
          {list.filter((d) => !split || d.favourite).map(row)}
          {split ? <p className="m-0 px-3 pt-2 text-xs tracking-wide text-muted uppercase">Others</p> : null}
          {split ? list.filter((d) => !d.favourite).map(row) : null}
          <hr className="mx-2 my-1 border-0 border-t border-line" />
          <button type="button" role="menuitem" onClick={() => { close(); onEdit(); }} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-2">
            <Pencil aria-hidden className="size-4 text-muted" /> {active.name.trim() ? `Edit ${deviceLabel(active)}` : `Edit and name ${deviceLabel(active)}`}
          </button>
          <button type="button" role="menuitem" onClick={() => { close(); onAdd(); }} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-2">
            <Plus aria-hidden className="size-4 text-muted" /> Add a device
          </button>
        </div>,
        at.host,
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {said ?? ""}
      </p>
      {tip && at && !isOpen && !said && !onSetup
        ? createPortal(
            <div role="note" style={{ bottom: at.bottom, right: at.right }} className="absolute z-[60] flex w-64 max-w-[calc(100vw-2rem)] items-start gap-2 rounded-xl bg-accent p-3 text-sm text-accent-ink shadow-lg">
              <p className="m-0 flex-1">Tap {deviceLabel(active)} to switch device or add another.</p>
              <button type="button" onClick={onTipSeen} className="-m-1 min-h-11 shrink-0 rounded-lg px-2 font-bold underline">
                Got it
              </button>
            </div>,
            at.host,
          )
        : null}
      {said && at && !isOpen
        ? createPortal(
            <p aria-hidden style={{ bottom: at.bottom, right: at.right }} className="absolute z-[60] m-0 w-max max-w-[calc(100vw-2rem)] rounded-xl bg-ink px-3 py-2 text-sm font-bold text-surface shadow-lg">
              {said}
            </p>,
            at.host,
          )
        : null}
    </div>
  );
}

/**
 * The route screen's line for who the routes are for (FEAT-21): the name, the
 * type and the limits that shape a route, with "Change" to switch or edit.
 * The visible words start the button's name, so voice control finds it.
 */
function RowButton({ active, trip, open, onClick, setup }: { active: SavedDevice; trip: boolean; open: boolean; onClick: () => void; setup?: boolean }) {
  const who = routingFor(active);
  return (
    <button
      type="button"
      data-menu="device"
      aria-haspopup={setup ? "dialog" : "menu"}
      aria-expanded={setup ? undefined : open}
      onClick={onClick}
      aria-label={`Routes are for ${who.name}${who.type ? `, ${who.type}` : ""}${trip ? ", this trip only" : ""}. ${limitsLine(active.profile)}. ${setup ? "Set up how you get around" : "Change"}`}
      className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-2xl border-2 border-line bg-surface-2 px-3 py-2 text-left hover:border-ink"
    >
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
        <Accessibility className="size-5" strokeWidth={2.4} />
      </span>
      <span className="grid min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]">
        <span>
          <span className="text-muted">Routes are for </span>
          <span className="font-bold">{who.name}</span>
          {who.type ? <span className="text-muted"> · {who.type}</span> : null}
          {trip ? <span className="text-muted"> · this trip only</span> : null}
        </span>
        <span className="text-sm text-muted">{limitsLine(active.profile)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-accent">
        {setup ? "Set up" : "Change"}
        {setup ? null : <ChevronUp aria-hidden className={cn("size-4 transition-transform", !open && "rotate-180")} strokeWidth={2.6} />}
      </span>
    </button>
  );
}

/** What the first-visit button shows in turn (SMALL-25): "Set up", then the kinds of mobility it covers. */
const SETUP_WORDS = ["Set up", "Scooter", "Wheelchair", "Rollator", "Stick"];
const REST_MS = 7000;
const WORD_MS = 1750;

/**
 * The first-visit "Set up" button (D-036 step 5). It rests on "Set up", then
 * shows Scooter, Wheelchair, Rollator and Stick in turn, so people see what
 * it's for. Its name is always "Set up how you get around": the words are
 * hidden from screen readers and never announced. All the words sit in one
 * grid cell, so the button is as wide as the longest and never jumps. Still
 * under reduced motion, back on "Set up" while hovered or focused, and gone
 * once a device is set up.
 */
function SetupButton({ onClick }: { onClick: () => void }) {
  const [shown, setShown] = useState(0);
  const [held, setHeld] = useState({ hover: false, focus: false });
  const [still, setStill] = useState(true);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setStill(q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);

  const paused = still || held.hover || held.focus;
  useEffect(() => {
    if (paused) {
      setShown(0);
      return;
    }
    const t = window.setTimeout(() => setShown((i) => (i + 1) % SETUP_WORDS.length), shown === 0 ? REST_MS : WORD_MS);
    return () => window.clearTimeout(t);
  }, [paused, shown]);

  return (
    <button
      type="button"
      data-menu="device"
      onClick={onClick}
      onPointerEnter={() => setHeld((h) => ({ ...h, hover: true }))}
      onPointerLeave={() => setHeld((h) => ({ ...h, hover: false }))}
      onFocus={() => setHeld((h) => ({ ...h, focus: true }))}
      onBlur={() => setHeld((h) => ({ ...h, focus: false }))}
      aria-label="Set up how you get around"
      className="inline-flex min-h-12 items-center rounded-xl bg-accent px-3 text-sm font-bold text-accent-ink"
    >
      <span aria-hidden className="grid">
        {SETUP_WORDS.map((w, i) => (
          <span key={w} className={cn("text-center [grid-area:1/1] motion-safe:transition-opacity motion-safe:duration-300", i === shown ? "opacity-100" : "opacity-0")}>
            {w}
          </span>
        ))}
      </span>
    </button>
  );
}
