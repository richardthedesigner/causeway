"use client";
import { useRef, useState } from "react";
import type { StoneState } from "@/components/v3/Stone";
import { StoneLive, type StoneLiveHandle, type StoneLiveMode } from "@/components/v3/StoneLive";

const STATES: StoneState[] = ["fits", "unsure", "nope", "fog"];
const DISPLAY = "font-[family-name:var(--font-display)]";
const BUTTON =
  "min-h-12 min-w-16 rounded-2xl border-2 border-[var(--moment-muted)] px-3 font-bold focus-visible:outline-[var(--moment-ink)] aria-pressed:border-[var(--moment-ink)] aria-pressed:bg-[var(--moment-ink)] aria-pressed:text-[var(--moment-ground)]";

const MODE: Record<StoneLiveMode, string> = {
  starting: "the still image, while the live stone loads",
  live: "the live 3D stone",
  "reduced-motion": "the still image: reduced motion is on",
  "no-webgl": "the still image: this browser has no WebGL",
  "save-data": "the still image: Save-Data is on",
  lost: "the still image: the WebGL context was lost",
  hidden: "the still image: the tab is hidden",
  fallback: "the still image",
};

/**
 * The live stone's part of the lab (FEAT-73): the draft expressions for Jonny
 * and Richard to review. The four states, morphing between them, the tap
 * answer and the hop, a greyscale view, and the two still previews.
 */
export function StoneLiveLab() {
  const [state, setState] = useState<StoneState>("unsure");
  const [grey, setGrey] = useState(false);
  const [mode, setMode] = useState<StoneLiveMode>("starting");
  const stone = useRef<StoneLiveHandle>(null);
  return (
    <section aria-labelledby="lab-stone-live" className="mt-10" style={grey ? { filter: "grayscale(1)" } : undefined}>
      <h2 id="lab-stone-live" className={`${DISPLAY} px-4 text-xl font-bold`}>
        Live stone
      </h2>
      <p className="mt-1 mb-4 px-4 text-sm text-[var(--moment-muted)]">
        Fixture. A draft for Jonny to review (FEAT-73). Each state should read by its shape, eyes and rhythm alone, with no colour. It stays decorative: each has its word beside it.
      </p>
      <div className="px-4">
        <button type="button" aria-pressed={grey} onClick={() => setGrey(!grey)} className={BUTTON}>
          Show in greyscale
        </button>
      </div>
      <ul className="m-0 mt-4 flex list-none flex-wrap gap-2 px-4 py-0">
        {STATES.map((s) => (
          <li key={s} className="flex flex-col items-start gap-1">
            <StoneLive state={s} size={76} idle />
            <span className="text-sm">{s}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 px-4 font-bold">Changing state, a tap, and the hop</h3>
      <p className="mt-1 px-4 text-sm text-[var(--moment-muted)]">Choose a state to see it change shape. Tap the stone, or use Tap, to see it answer. Hop is what the unfold will ask for.</p>
      <div className="mt-16 px-4">
        <StoneLive ref={stone} state={state} size={200} idle onModeChange={setMode} />
      </div>
      <p className="mt-2 px-4 text-sm">Showing {MODE[mode]}.</p>
      <div className="mt-2 flex flex-wrap gap-2 px-4">
        <div role="group" aria-label="Live stone state" className="flex flex-wrap gap-2">
          {STATES.map((s) => (
            <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)} className={BUTTON}>
              {s}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => stone.current?.react()} className={BUTTON}>
          Tap
        </button>
        <button type="button" onClick={() => stone.current?.hop()} className={BUTTON}>
          Hop
        </button>
      </div>

      <h3 className="mt-6 px-4 font-bold">Under reduced motion</h3>
      <p className="mt-1 px-4 text-sm text-[var(--moment-muted)]">It holds its still pose: no loop, no bob, no hop. A change of state swaps the image.</p>
      <div className="mt-2 px-4">
        <StoneLive state={state} size={124} idle force="reduced-motion" />
      </div>

      <h3 className="mt-6 px-4 font-bold">Without WebGL</h3>
      <p className="mt-1 px-4 text-sm text-[var(--moment-muted)]">The same still images, also shown for Save-Data, a lost context or a hidden tab. Rendered from the live poses, so they read without colour too.</p>
      <div className="mt-2 px-4">
        <StoneLive state={state} size={124} idle force="fallback" />
      </div>
    </section>
  );
}
