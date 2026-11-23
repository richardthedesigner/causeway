"use client";
import { Bus, CircleX } from "lucide-react";
import type { DistanceUnit } from "@causeway/profile";
import { bandLabel } from "@/lib/route-verdict";
import type { StreetBand as Band } from "@/lib/street-bands";
import { cn } from "@/lib/utils";
import { bandDistance } from "./band-distance";
import styles from "./v3.module.css";

/** The route's verdict, in the stone's words. */
export type BandVerdict = "fits" | "unsure" | "nope";

const DISPLAY = "font-[family-name:var(--font-display)]";

/**
 * What sits at the right of a band. Ground you cover shows its distance, in
 * the device's unit (D-074). A ride and a blocker are not ground you cover,
 * so they show a word and an icon in its place, never a distance.
 */
function Aside({ band, unit }: { band: Band; unit: DistanceUnit }) {
  if (band.state === "ride" || band.state === "blocked") {
    const Icon = band.state === "ride" ? Bus : CircleX;
    return (
      <span className={cn(DISPLAY, "ml-auto inline-flex shrink-0 items-center gap-1.5 text-base font-extrabold whitespace-nowrap")}>
        <Icon aria-hidden className="size-5" strokeWidth={2.4} />
        {band.state === "ride" ? "Ride" : "Blocked"}
      </span>
    );
  }
  // "204 m", "1.2 km", "120 yd": the figure large, its unit small beside it.
  const { figure, unit: word } = bandDistance(band.m, unit);
  const unknown = band.state === "unknown";
  return (
    <span data-band-distance className={cn(DISPLAY, "tabular shrink-0 font-extrabold tracking-tight whitespace-nowrap", unknown ? "mt-1 block text-[2.125rem] leading-none" : "ml-auto text-2xl")}>
      {figure}
      {word ? <small className="ml-0.5 text-sm tracking-normal">{word}</small> : null}
    </span>
  );
}

/**
 * One stretch of the way (design v3), as a list item. Goes inside
 * `StreetBandList`.
 *
 * - Measured: filled `--ok-fill`, whatever the route's verdict. The street
 *   was measured and is fine; the route's doubt lives in its unlit bands.
 * - Unknown: unlit. An edge, a hatch, and "Nobody has measured" in words,
 *   with room on the right for the stone (`data-stone-slot`, for whoever
 *   places it).
 * - Blocked: `--stop-fill`, the blocker in the condition line, and "Blocked"
 *   with its icon where the distance would be.
 * - Ride: no verdict fill, a bus icon and "Ride".
 *
 * A screen reader hears one sentence for the band (`bandLabel`). With
 * `onFocusBand` the band is a button: focusing or pressing it hands back the
 * stretch's edges, to light it on the map. Without it, or with no edges to
 * light (a blocker), the band is plain text.
 *
 * @public Used on its own by the unfolded route (FEAT-68); until then only through the list.
 */
export function StreetBand({ band, verdict, unit = "kmh", onFocusBand }: { band: Band; verdict: BandVerdict; unit?: DistanceUnit; onFocusBand?: (edgeIds: number[]) => void }) {
  const unknown = band.state === "unknown";
  const className = cn(styles.band, styles[band.state]);
  const body = (
    <>
      <span className="sr-only">{bandLabel(band, unit)}</span>
      <span aria-hidden className={cn("min-w-0", unknown ? "flex-1" : "flex-[1_1_10rem]")}>
        <span className={cn(DISPLAY, "block text-lg leading-[1.15] font-bold break-words")}>{band.name}</span>
        <span className="mt-0.5 block text-sm leading-snug break-words">{band.condition}</span>
        {unknown ? <Aside band={band} unit={unit} /> : null}
      </span>
      {unknown ? <span aria-hidden data-stone-slot className={styles.slot} /> : <span aria-hidden className="contents"><Aside band={band} unit={unit} /></span>}
    </>
  );
  return (
    <li data-band-state={band.state} data-verdict={verdict}>
      {onFocusBand && band.edgeIds.length ? (
        <button type="button" className={className} onFocus={() => onFocusBand(band.edgeIds)} onClick={() => onFocusBand(band.edgeIds)}>
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

/** The way, street by street: the bands in the order you travel. */
export function StreetBandList({
  bands,
  verdict,
  unit = "kmh",
  onFocusBand,
  className,
}: {
  bands: Band[];
  verdict: BandVerdict;
  unit?: DistanceUnit;
  onFocusBand?: (edgeIds: number[]) => void;
  className?: string;
}) {
  return (
    // role="list": Safari drops list semantics from a list with no markers.
    <ol role="list" aria-label="The way, street by street" className={cn("m-0 flex list-none flex-col gap-[var(--band-gap)] px-[var(--band-gutter)] py-0", className)}>
      {bands.map((band, i) => (
        // The same street can come up more than once, so the place in the list is the key.
        <StreetBand key={i} band={band} verdict={verdict} unit={unit} onFocusBand={onFocusBand} />
      ))}
    </ol>
  );
}
