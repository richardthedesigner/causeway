"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** The narrowest the field or destination may get beside the device button before the bar splits. */
const MIN_MAIN_PX = 150;
const GAP_PX = 8;

/**
 * The bar at the bottom of the sheet: the field or destination, then who the
 * routes are for (D-036). When both don't fit on one line, it splits: the
 * main part keeps the first line and the trailing button goes full width
 * underneath. Padding is concentric: the 4 px inset turns the bar's 16 px
 * corner into the button's 12 px one.
 */
export function SearchBar({ main, trailing, className }: { main: React.ReactNode; trailing?: React.ReactNode; className?: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const natural = useRef(0);
  const padLeft = useRef(0);
  const [split, setSplit] = useState(false);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || !trailing) return;
    const check = () => {
      const t = tail.current;
      if (!t) return;
      // Measure the button at its own width when it sits on the line; while split it is stretched, so use the last natural width.
      // The same goes for the bar's left padding, which is smaller while split: measured split, a button just too wide
      // would fit, unsplit, split again, and so on for ever.
      const s = getComputedStyle(el);
      if (!split) {
        natural.current = t.offsetWidth;
        padLeft.current = parseFloat(s.paddingLeft);
      }
      const inner = el.clientWidth - padLeft.current - parseFloat(s.paddingRight);
      const fits = inner >= MIN_MAIN_PX + GAP_PX + natural.current;
      if (fits === split) setSplit(!fits);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [split, trailing]);

  return (
    <div
      ref={bar}
      data-search-bar
      data-split={split || undefined}
      className={cn(
        "flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-line bg-surface-2 py-1 pr-1 pl-4 focus-within:border-accent",
        split && "pl-1 [&>[data-main]]:pl-3",
        className,
      )}
    >
      <div data-main className="flex min-h-12 min-w-0 flex-1 items-center gap-2">
        {main}
      </div>
      {trailing ? (
        <div ref={tail} className={cn("flex max-w-full min-w-0 shrink-0", split && "basis-full [&>*]:flex-1 [&_[data-menu]]:w-full [&_[data-menu]]:justify-center")}>
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
