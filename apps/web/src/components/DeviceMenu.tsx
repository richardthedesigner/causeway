"use client";
import { PRESETS, type SavedDevice } from "@causeway/profile";
import { Accessibility, Check, ChevronUp, Pencil, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deviceLabel, orderDevices } from "@/lib/devices";
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
  /** Show the one-time tip that the button switches device. */
  tip?: boolean;
  onTipSeen?: () => void;
}

const typeOf = (d: SavedDevice) => PRESETS[d.profile.preset].label;

/**
 * Who the routes are for, inside the search bar (D-036). A named device
 * shows its name; an unnamed one its icon and type. The list opens upwards,
 * so a thumb on the button never covers it.
 */
export function DeviceMenu({ devices, activeId, onPick, onEdit, onAdd, onSetup, tip, onTipSeen }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const { open, setOpen, toggle, root } = useMenu(panel);
  /**
   * Where the list sits: just above the button, measured on open. It's drawn
   * on the sheet's outer layer (not inside its scrolling body, which clips
   * anything above the sheet's top edge) so focus and keys stay in the sheet.
   */
  const [at, setAt] = useState<{ bottom: number; right: number; host: HTMLElement } | null>(null);
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
      if (r) setAt({ bottom: h.bottom - r.top + 8, right: Math.max(8, h.right - r.right), host });
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
    if (d.id === activeId) return;
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
      {onSetup ? (
        <button type="button" data-menu="device" onClick={onSetup} aria-label="Set up how you get around" className="inline-flex min-h-12 items-center rounded-xl bg-accent px-4 text-sm font-bold text-accent-ink">
          Set up
        </button>
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
        aria-label={`Routes are for ${deviceLabel(active)}${active.name ? `, ${typeOf(active)}` : ""}. Change device`}
        className="inline-flex min-h-12 max-w-full min-w-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-accent-ink"
      >
        {active.name ? null : <Accessibility aria-hidden className="size-4 shrink-0" strokeWidth={2.6} />}
        <span className="truncate">{deviceLabel(active)}</span>
        <ChevronUp aria-hidden className={cn("size-4 shrink-0 transition-transform", !isOpen && "rotate-180")} strokeWidth={2.6} />
      </button>
      )}

      {isOpen && at ? createPortal(
        <div
          ref={panel}
          role="menu"
          aria-label="Getting around as"
          onKeyDown={(e) => { keep(e); onKey(e); }}
          style={{ bottom: at.bottom, right: at.right }}
          className="absolute z-[60] grid w-72 max-w-[calc(100vw-2rem)] gap-0.5 rounded-2xl border border-line bg-surface p-2 text-base text-ink shadow-[0_8px_30px_rgb(0_0_0/0.2)]"
        >
          {split ? <p className="m-0 px-3 pt-1 text-xs tracking-wide text-muted uppercase">Favourites</p> : null}
          {list.filter((d) => !split || d.favourite).map(row)}
          {split ? <p className="m-0 px-3 pt-2 text-xs tracking-wide text-muted uppercase">Others</p> : null}
          {split ? list.filter((d) => !d.favourite).map(row) : null}
          <hr className="mx-2 my-1 border-0 border-t border-line" />
          <button type="button" role="menuitem" onClick={() => { close(); onEdit(); }} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-2">
            <Pencil aria-hidden className="size-4 text-muted" /> Edit {deviceLabel(active)}
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
