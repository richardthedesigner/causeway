"use client";
import { PRESETS, type MobilityPreset, type Profile } from "@causeway/profile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ChevronDown, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: Profile;
  onChange: (p: Profile) => void;
}

const STEP_LIMIT = 30;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Eleven starting points in three short sets, so nobody reads a list of eleven. */
const PRESET_GROUPS: { id: string; label: string; presets: MobilityPreset[] }[] = [
  { id: "walk", label: "Walking", presets: ["walking", "walking-stick", "crutches", "rollator"] },
  { id: "wheels", label: "On wheels", presets: ["manual-wheelchair", "manual-wheelchair-companion", "powerchair", "mobility-scooter", "pram"] },
  { id: "other", label: "Other needs", presets: ["fatigue", "visual-impairment"] },
];

/** The closed "Your limits" row still says what matters: "Uphill 6% / Kerb 2 cm / No steps". */
function limitsSummary(p: Profile, steps: number): string {
  const up = p.maxInclineUpPct >= 50 ? "Any slope" : `Uphill ${p.maxInclineUpPct}%`;
  const kerb = p.maxKerbCm === 0 ? "Flush kerbs" : `Kerb ${p.maxKerbCm} cm`;
  const st = steps === 0 ? "No steps" : steps >= STEP_LIMIT ? "Any steps" : `Up to ${steps} steps`;
  return `${up} / ${kerb} / ${st}`;
}


/**
 * "How do you get around?" Pick a starting point, then adjust any limit.
 * One engine, per-user numbers: nothing here is a special mode.
 */
export function ModeSheet({ open, onOpenChange, profile, onChange }: Props) {
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });
  const pick = (preset: MobilityPreset) => onChange({ ...PRESETS[preset] });
  const custom = JSON.stringify({ ...profile, label: "" }) !== JSON.stringify({ ...PRESETS[profile.preset], label: "" });
  const stepsAllowed = Number.isFinite(profile.maxSteps) ? Math.min(profile.maxSteps, STEP_LIMIT) : STEP_LIMIT;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="How do you get around?" description="Routes are worked out for your limits. Saved on this device only.">
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-base font-bold">Start from</legend>
          <div className="grid gap-4" role="radiogroup" aria-label="Start from">
            {PRESET_GROUPS.map((g) => (
              <div key={g.label} role="group" aria-labelledby={`group-${g.id}`} className="grid gap-2">
                <span id={`group-${g.id}`} className="text-sm text-muted">
                  {g.label}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {g.presets.map((k) => {
                    const on = profile.preset === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => pick(k)}
                        className={cn(
                          "min-h-12 rounded-2xl border px-3 py-2 text-left text-base leading-tight",
                          on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:border-ink",
                        )}
                      >
                        {PRESETS[k].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <details className="group mt-6 rounded-2xl border border-line" open={custom || undefined}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4">
            <span className="grid">
              <span className="font-bold">Your limits</span>
              <span className="text-sm text-muted">{limitsSummary(profile, stepsAllowed)}</span>
            </span>
            <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
        <section className="grid gap-5 px-4 pb-4" aria-label="Your limits">
          {custom ? (
            <Button variant="ghost" className="min-h-12 justify-self-start px-3 text-sm" onClick={() => pick(profile.preset)}>
              Reset to {PRESETS[profile.preset].label.toLowerCase()}
            </Button>
          ) : null}

          <Limit label="Steepest uphill" value={`${profile.maxInclineUpPct >= 50 ? "Any" : `${profile.maxInclineUpPct}%`}`} onStep={(d) => set({ maxInclineUpPct: clamp(Math.min(profile.maxInclineUpPct, 20) + d * 0.5, 2, 20) })}>
            <Slider
              thumbLabel="Steepest uphill"
              valueText={`${profile.maxInclineUpPct} percent`}
              min={2}
              max={20}
              step={0.5}
              value={[Math.min(profile.maxInclineUpPct, 20)]}
              onValueChange={([v]) => set({ maxInclineUpPct: v!, comfortInclinePct: Math.min(profile.comfortInclinePct, v!) })}
            />
          </Limit>
          <Limit label="Steepest downhill" value={`${profile.maxInclineDownPct >= 50 ? "Any" : `${profile.maxInclineDownPct}%`}`} onStep={(d) => set({ maxInclineDownPct: clamp(Math.min(profile.maxInclineDownPct, 20) + d * 0.5, 2, 20) })}>
            <Slider
              thumbLabel="Steepest downhill"
              valueText={`${profile.maxInclineDownPct} percent`}
              min={2}
              max={20}
              step={0.5}
              value={[Math.min(profile.maxInclineDownPct, 20)]}
              onValueChange={([v]) => set({ maxInclineDownPct: v! })}
            />
          </Limit>
          <Limit label="Highest kerb" value={profile.maxKerbCm === 0 ? "Flush only" : `${profile.maxKerbCm} cm`} onStep={(d) => set({ maxKerbCm: clamp(Math.min(profile.maxKerbCm, 20) + d, 0, 20) })}>
            <Slider thumbLabel="Highest kerb" valueText={`${profile.maxKerbCm} centimetres`} min={0} max={20} step={1} value={[Math.min(profile.maxKerbCm, 20)]} onValueChange={([v]) => set({ maxKerbCm: v! })} />
          </Limit>
          <Limit label="Steps" value={stepsAllowed === 0 ? "None" : stepsAllowed >= STEP_LIMIT ? "Any" : `Up to ${stepsAllowed}`} onStep={(d) => { const v = clamp(stepsAllowed + d, 0, STEP_LIMIT); set({ maxSteps: v >= STEP_LIMIT ? Infinity : v }); }}>
            <Slider
              thumbLabel="Most steps you can manage"
              valueText={stepsAllowed === 0 ? "no steps" : `${stepsAllowed} steps`}
              min={0}
              max={STEP_LIMIT}
              step={1}
              value={[stepsAllowed]}
              onValueChange={([v]) => set({ maxSteps: v! >= STEP_LIMIT ? Infinity : v! })}
            />
          </Limit>

          <div className="grid gap-1">
            <Toggle
              id="avoid-setts"
              label="Avoid setts and cobbles"
              checked={profile.surfaces.sett === null}
              onChange={(v) => set({ surfaces: { ...profile.surfaces, sett: v ? null : PRESETS[profile.preset].surfaces.sett ?? 0.5, cobblestone: v ? null : PRESETS[profile.preset].surfaces.cobblestone ?? 0.8 } })}
            />
            <Toggle
              id="avoid-gravel"
              label="Avoid gravel and grass"
              checked={profile.surfaces.gravel === null}
              onChange={(v) => set({ surfaces: { ...profile.surfaces, gravel: v ? null : PRESETS[profile.preset].surfaces.gravel ?? 0.6, grass: v ? null : PRESETS[profile.preset].surfaces.grass ?? 0.8 } })}
            />
            <Toggle id="buses" label="Use buses" checked={profile.buses !== false} onChange={(v) => set({ buses: v })} />
            {profile.preset === "mobility-scooter" ? (
              <Toggle
                id="scooter-permit"
                label="I have a permit to take my scooter on buses"
                checked={!!profile.busScooterPermit}
                onChange={(v) => set({ busScooterPermit: v })}
              />
            ) : null}
            <Toggle
              id="companion"
              label="Someone is helping or pushing"
              checked={profile.companion}
              onChange={(v) => {
                // A companion changes what's manageable, so adjust this person's own limits rather than swapping profiles.
                const d = v ? 1 : -1;
                set({
                  companion: v,
                  maxInclineUpPct: Math.max(2, profile.maxInclineUpPct + 2 * d),
                  maxInclineDownPct: Math.max(2, profile.maxInclineDownPct + 1 * d),
                  maxKerbCm: Math.max(0, profile.maxKerbCm + 4 * d),
                });
              }}
            />
          </div>

          <p className="m-0 text-sm text-muted">
            Your pace: {(profile.speedMps * 3.6).toFixed(1)} km/h on the flat
            {profile.paceSamples ? `, learned from ${profile.paceSamples} journey${profile.paceSamples === 1 ? "" : "s"}` : ", a starting figure. It adjusts as you use navigation"}.
          </p>

          <Limit
            label="When we don't know"
            value={profile.uncertaintyTolerance < 0.25 ? "Avoid unknowns" : profile.uncertaintyTolerance > 0.75 ? "Happy to risk it" : "Some risk is fine"}
            help="Some pavements, kerbs and widths aren't mapped yet. Choose how hard to avoid them."
          >
            <Slider
              thumbLabel="How much to avoid places we don't have data for"
              valueText={`${Math.round(profile.uncertaintyTolerance * 100)} percent tolerance`}
              min={0}
              max={1}
              step={0.05}
              value={[profile.uncertaintyTolerance]}
              onValueChange={([v]) => set({ uncertaintyTolerance: v! })}
            />
          </Limit>
        </section>
        </details>
      </SheetContent>
    </Sheet>
  );
}

/** A slider with − and + buttons: big targets for a tremor or gloves, and a simple path for Switch Control. */
function Limit({ label, value, help, onStep, children }: { label: string; value: string; help?: string; onStep?: (dir: -1 | 1) => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base">{label}</span>
        <span className="tabular font-mono text-base font-semibold">{value}</span>
      </div>
      {help ? <p className="m-0 mt-0.5 text-sm text-muted">{help}</p> : null}
      <div className="flex items-center gap-3">
        {onStep ? (
          <Button size="icon" variant="secondary" aria-label={`Less: ${label}`} onClick={() => onStep(-1)}>
            <Minus aria-hidden className="size-5" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">{children}</div>
        {onStep ? (
          <Button size="icon" variant="secondary" aria-label={`More: ${label}`} onClick={() => onStep(1)}>
            <Plus aria-hidden className="size-5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span className="text-base">{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
