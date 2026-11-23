"use client";
import { useEffect, useRef, useState } from "react";
import type { DistanceUnit } from "@causeway/profile";
import { VerdictPill } from "@/components/RouteStrip";
import { Stone, type StoneState } from "@/components/v3/Stone";
import { StreetBandList, type BandVerdict } from "@/components/v3/StreetBand";
import type { StreetBand } from "@/lib/street-bands";
import { FITS_BANDS, LONG_BANDS, NOPE_BANDS, UNSURE_BANDS } from "./fixtures";

const STATES: StoneState[] = ["fits", "unsure", "nope", "fog"];
const DISPLAY = "font-[family-name:var(--font-display)]";
/** The stone's renders are 676 by 550. */
const RATIO = 550 / 676;

function Section({ id, title, note, children }: { id: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className={`${DISPLAY} px-4 text-xl font-bold`}>
        {title}
      </h2>
      <p className="mt-1 mb-4 px-4 text-sm text-[var(--moment-muted)]">Fixture. {note}</p>
      {children}
    </section>
  );
}

/**
 * A list with the stone set on its first unlit band, the way the unfolded
 * route will place it: measured from the band's `data-stone-slot` after layout.
 */
function Bands({ bands, verdict, unit, onFocusBand }: { bands: StreetBand[]; verdict: BandVerdict; unit?: DistanceUnit; onFocusBand?: (edgeIds: number[]) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number; size: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      // Only an Unsure route sends the stone to an unlit band. The others have it on the last band or the blocker (FEAT-68).
      const slot = verdict === "unsure" ? el.querySelector<HTMLElement>("[data-stone-slot]") : null;
      if (!slot) return setAt(null);
      const a = el.getBoundingClientRect();
      const b = slot.getBoundingClientRect();
      const size = Math.max(0, Math.floor(Math.min(b.width, b.height / RATIO)));
      setAt({ left: b.left - a.left + (b.width - size) / 2, top: b.top - a.top + (b.height - size * RATIO) / 2, size });
    };
    place();
    const seen = new ResizeObserver(place);
    seen.observe(el);
    return () => seen.disconnect();
  }, [bands, verdict]);
  return (
    <div ref={box} className="relative">
      <StreetBandList bands={bands} verdict={verdict} unit={unit} onFocusBand={onFocusBand} />
      {at && at.size > 0 ? (
        <span className="pointer-events-none absolute" style={{ left: at.left, top: at.top }}>
          <Stone state={verdict} size={at.size} />
        </span>
      ) : null}
    </div>
  );
}

/** Every state of the v3 components (FEAT-67), on made-up props. Shown by /v3-lab with the flag on. */
export function Lab() {
  const [stone, setStone] = useState<StoneState>("unsure");
  const [lit, setLit] = useState<number[] | null>(null);
  return (
    <main className="h-dvh overflow-x-hidden overflow-y-auto bg-[var(--moment-ground)] pb-16 text-[var(--moment-ink)] [color-scheme:dark]">
      <div className="mx-auto max-w-[26rem]">
        <h1 className={`${DISPLAY} px-4 pt-8 text-3xl font-extrabold`}>v3 lab</h1>
        <p className="mt-2 px-4">
          <strong>Fixtures.</strong> Every name and figure on this page is made up, to show each state of the design v3 components. None of it comes from the router.
        </p>

        <Section id="lab-stone" title="Stone" note="The four states. The stone is decorative: each has its word beside it.">
          <ul className="m-0 grid list-none grid-cols-2 gap-4 px-4 py-0">
            {STATES.map((s) => (
              <li key={s} className="flex flex-col items-start gap-1">
                <Stone state={s} size={124} />
                <span className="text-sm">{s}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 px-4 font-bold">Idle, and swapping state</h3>
          <p className="mt-1 px-4 text-sm text-[var(--moment-muted)]">It bobs only when motion is allowed. Choosing another state cross-fades.</p>
          <div className="mt-2 flex flex-wrap items-center gap-4 px-4">
            <Stone state={stone} size={200} idle />
            <div role="group" aria-label="Stone state" className="flex flex-wrap gap-2">
              {STATES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={stone === s}
                  onClick={() => setStone(s)}
                  className="min-h-12 min-w-16 rounded-2xl border-2 border-[var(--moment-muted)] px-3 font-bold focus-visible:outline-[var(--moment-ink)] aria-pressed:border-[var(--moment-ink)] aria-pressed:bg-[var(--moment-ink)] aria-pressed:text-[var(--moment-ground)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section id="lab-pill" title="VerdictPill" note="The fill variant, then today's pill unchanged on today's surface.">
          <div className="flex flex-wrap gap-2 px-4">
            <VerdictPill variant="fill" v="passable" />
            <VerdictPill variant="fill" v="passable-with-unknowns" />
            <VerdictPill variant="fill" v="not-passable" />
          </div>
          <div className="mx-4 mt-4 flex flex-wrap gap-2 rounded-2xl bg-surface p-3">
            <VerdictPill v="passable" />
            <VerdictPill v="passable-with-unknowns" />
            <VerdictPill v="not-passable" />
          </div>
        </Section>

        <Section id="lab-unsure" title="Bands on an Unsure route" note="Measured, a few metres long, merged unknowns, a ride, no slope data, one unknown street, and a street that comes round twice.">
          <Bands bands={UNSURE_BANDS} verdict="unsure" />
        </Section>

        <Section id="lab-fits" title="Bands on a route that fits" note="All measured, with a ride and a stretch long enough for kilometres.">
          <Bands bands={FITS_BANDS} verdict="fits" />
        </Section>

        <Section id="lab-nope" title="Bands when nothing fits" note="The closest route, with the blocker last. A blocker has no length.">
          <Bands bands={NOPE_BANDS} verdict="nope" />
        </Section>

        <Section id="lab-focus" title="Bands that light the map" note="Each band is a button. A blocker has no stretch to light, so it stays plain.">
          <Bands bands={NOPE_BANDS.slice(0, 1).concat(UNSURE_BANDS.slice(2, 6), NOPE_BANDS.slice(2))} verdict="unsure" onFocusBand={setLit} />
          <p role="status" className="mt-3 px-4 text-sm text-[var(--moment-muted)]">
            {lit ? `Would light edges ${lit.join(", ")}.` : "Nothing lit yet."}
          </p>
        </Section>

        <Section id="lab-miles" title="Bands in miles" note="The same Unsure route for a device set to miles: yards, then miles.">
          <Bands bands={UNSURE_BANDS.slice(0, 4).concat(FITS_BANDS.slice(0, 1))} verdict="unsure" unit="mph" />
        </Section>

        <Section id="lab-long" title="Long names" note="For wrapping at 320 px and at 200% text. Nothing may run off the side, and a distance never wraps.">
          <Bands bands={LONG_BANDS} verdict="unsure" />
        </Section>
      </div>
    </main>
  );
}
