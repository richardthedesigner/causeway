"use client";
import { PRESETS, type MobilityPreset, type Profile } from "@causeway/profile";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { SetupChoice } from "@/lib/devices";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  /** "first": nothing saved yet, so skipping keeps today's default. "add": another device; skipping step 1 cancels. */
  mode: "first" | "add";
  onDone: (c: SetupChoice) => void;
  onSkip: () => void;
}

/** The common answers first, each with the line that tells similar ones apart; everything else one tap away. */
const MAIN: { preset: MobilityPreset; hint: string }[] = [
  { preset: "manual-wheelchair", hint: "Self-propelled" },
  { preset: "manual-wheelchair-companion", hint: "Someone pushes" },
  { preset: "powerchair-light", hint: "Small wheels. Struggles with kerbs, setts and hills" },
  { preset: "powerchair", hint: "Big wheels and batteries. Copes with rougher ground" },
  { preset: "mobility-scooter", hint: "Class 2: 4 mph, pavements only" },
  { preset: "mobility-scooter-road", hint: "Class 3: registered, can use the road at 8 mph" },
];
const MORE: MobilityPreset[] = ["walking-stick", "crutches", "rollator", "pram", "fatigue", "visual-impairment", "walking"];

/** The numbers that decide most routes, in the words the limits screen uses. */
function keyLimits(p: Profile): [string, string][] {
  const pct = (v: number) => (v >= 50 ? "Any" : `${v}%`);
  const steps = !Number.isFinite(p.maxSteps) || p.maxSteps >= 30 ? "Any" : p.maxSteps === 0 ? "None" : `Up to ${p.maxSteps}`;
  const setts = p.surfaces.sett === null ? "Avoid" : p.surfaces.sett >= 0.5 ? "Avoid where possible" : "Fine";
  return [
    ["Steepest uphill", pct(p.maxInclineUpPct)],
    ["Steepest downhill", pct(p.maxInclineDownPct)],
    ["Highest kerb", p.maxKerbCm === 0 ? "Flush only" : `${p.maxKerbCm} cm`],
    ["Steps", steps],
    ["Setts and cobbles", setts],
  ];
}

/**
 * First visit and "Add a device" (D-036 step 5): what do you use, what do you
 * call it, check the limits. Every step can be skipped. Full screen on a phone.
 */
export function DeviceSetup({ open, mode, onDone, onSkip }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preset, setPreset] = useState<MobilityPreset | null>(null);
  const [more, setMore] = useState(false);
  const [name, setName] = useState("");
  const [favourite, setFavourite] = useState(true);

  // Each opening starts clean; a first device is a favourite by default, an added one isn't.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPreset(null);
    setMore(false);
    setName("");
    setFavourite(mode === "first");
  }, [open, mode]);

  const chosen = preset ?? "manual-wheelchair";
  const done = () => onDone({ preset: chosen, name, favourite });
  const label = name.trim() || PRESETS[chosen].label;
  const titles = { 1: "What do you use?", 2: "What do you call it?", 3: `${name.trim() ? `${name.trim()}'s` : "Your"} limits` } as const;

  const option = (k: MobilityPreset, hint?: string) => {
    const on = preset === k;
    return (
      <button
        key={k}
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => setPreset(k)}
        className={cn("grid min-h-14 min-w-0 rounded-2xl border px-4 py-2 text-left leading-tight [overflow-wrap:anywhere]", on ? "border-2 border-ink bg-surface-2 px-[15px] py-[7px]" : "border-line hover:border-ink")}
      >
        <span className="font-bold">{PRESETS[k].label}</span>
        {hint ? <span className="mt-0.5 text-sm text-muted">{hint}</span> : null}
      </button>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onSkip()}>
      <SheetContent
        title={titles[step]}
        description={`Step ${step} of 3. ${step === 1 ? "You can add more devices later." : step === 2 ? "Optional. Lots of people name their chair; it's how you'll switch between devices." : `Starting figures for ${PRESETS[chosen].label.toLowerCase()}. Change any you know are different from Edit, any time.`}`}
        className="max-md:inset-0 max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:pt-[env(safe-area-inset-top,0px)]"
      >
        <div className="mb-5 flex gap-1.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span key={n} className={cn("h-1 flex-1 rounded-full", n <= step ? "bg-ink" : "bg-line")} />
          ))}
        </div>

        {step === 1 ? (
          <div className="grid gap-4">
            <div role="radiogroup" aria-label="What do you use?" className="grid gap-2">
              {MAIN.map((m) => option(m.preset, m.hint))}
              {more ? MORE.map((k) => option(k)) : null}
            </div>
            {!more ? (
              <Button variant="ghost" className="min-h-12 justify-self-start px-3" onClick={() => setMore(true)}>
                Something else: walking aids, pram, other needs
              </Button>
            ) : null}
          </div>
        ) : step === 2 ? (
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="font-bold">Name</span>
              <input
                id="setup-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                placeholder={PRESETS[chosen].label}
                autoComplete="off"
                autoFocus
                className="min-h-12 w-full min-w-0 rounded-xl border-2 border-ink bg-surface px-3 text-lg text-ink focus:border-accent focus:outline-none"
              />
              <span className="text-sm text-muted">For example: Cherry, Dad&apos;s chair, the red one.</span>
            </label>
            <label htmlFor="setup-favourite" className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
              <span className="grid">
                <span>Favourite</span>
                <span className="text-sm text-muted">Favourites stay at the top of the list.</span>
              </span>
              <Switch id="setup-favourite" checked={favourite} onCheckedChange={setFavourite} />
            </label>
          </div>
        ) : (
          <dl className="m-0 grid border-t border-line">
            {keyLimits(PRESETS[chosen]).map(([k, v]) => (
              <div key={k} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 border-b border-line py-1">
                <dt>{k}</dt>
                <dd className="m-0 font-mono font-semibold tabular">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {step > 1 ? (
            <Button variant="ghost" className="min-h-12 px-3" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>
              Back
            </Button>
          ) : null}
          <span className="flex-1" />
          {step === 3 ? (
            <Button variant="primary" className="min-h-12 px-6" onClick={done}>
              Save {label}
            </Button>
          ) : (
            <>
              <Button variant="ghost" className="min-h-12 px-3" onClick={step === 1 ? onSkip : () => { setName(""); setStep(3); }}>
                {step === 1 ? (mode === "first" ? "Skip for now" : "Cancel") : "Skip"}
              </Button>
              <Button variant="primary" className="min-h-12 px-6" disabled={step === 1 && !preset} onClick={() => setStep((s) => (s + 1) as 2 | 3)}>
                Next
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
