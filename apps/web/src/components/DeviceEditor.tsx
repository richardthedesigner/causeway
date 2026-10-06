"use client";
import { formatDistance, formatSpeed, hasBattery, kerbLimitText, MPS_PER_MPH, PRESETS, rangeInUnit, rangeToKm, ROAD_MPH_MAX, ROAD_MPH_MIN, speedUnit, stepKerbCm, type MobilityPreset, type Profile, type SavedDevice, type SpeedUnit } from "@causeway/profile";
import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ChevronDown, Minus, Plus, Trash2 } from "lucide-react";

import { presetProfile, RANGE_DEFAULT_KM, RANGE_MAX_KM, RANGE_MIN_KM } from "@/lib/devices";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  device: SavedDevice;
  onChange: (p: Profile) => void;
  onRename: (name: string) => void;
  onFavourite: (on: boolean) => void;
  /** Absent when this is the only device: there must always be one to route for. */
  onRemove?: () => void;
}

/** One line under the powered types, so the classes the tester asked for are told apart (D-034). */
const TYPE_HINT: Partial<Record<MobilityPreset, string>> = {
  "powerchair-light": "Small wheels. Struggles with kerbs, setts and hills",
  powerchair: "Big wheels and batteries. Copes with rougher ground",
  "mobility-scooter": "Class 2: 4 mph, pavements only",
  "mobility-scooter-road": "Class 3: registered, can use the road at 8 mph",
};

const STEP_LIMIT = 30;
/** Road speed to the nearest half mph, the steps the control moves in (a device saved at 3.6 m/s reads 8, not 8.1). */
const halfMph = (mps: number) => Math.round((mps / MPS_PER_MPH) * 2) / 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Thirteen types in three short sets, so nobody reads a list of thirteen. */
const PRESET_GROUPS: { id: string; label: string; presets: MobilityPreset[] }[] = [
  { id: "walk", label: "Walking", presets: ["walking", "walking-stick", "crutches", "rollator"] },
  { id: "wheels", label: "On wheels", presets: ["manual-wheelchair", "manual-wheelchair-companion", "powerchair-light", "powerchair", "mobility-scooter", "mobility-scooter-road", "pram"] },
  { id: "other", label: "Other needs", presets: ["fatigue", "visual-impairment"] },
];

/** The closed "Your limits" row still says what matters: "Uphill 6% / Kerb 2 cm / No steps / 12 km battery / 8 mph on roads". */
function limitsSummary(p: Profile, steps: number): string {
  const up = p.maxInclineUpPct >= 50 ? "Any slope" : `Uphill ${p.maxInclineUpPct}%`;
  const kerb = p.maxKerbCm === 0 ? "Flush kerbs" : `Kerb ${kerbLimitText(p.maxKerbCm)}`;
  const st = steps === 0 ? "No steps" : steps >= STEP_LIMIT ? "Any steps" : `Up to ${steps} steps`;
  const road = p.roadLegal && p.roadSpeedMps ? `${formatSpeed(halfMph(p.roadSpeedMps) * MPS_PER_MPH, speedUnit(p))} on roads` : null;
  return [up, kerb, st, p.maxRangeKm ? `${formatDistance(p.maxRangeKm * 1000, speedUnit(p))} battery` : null, road].filter(Boolean).join(" / ");
}


/**
 * Edit one saved device (D-036 step 4): its name, whether it's a favourite,
 * its type and its limits. Full screen on a phone, a side panel on wide
 * screens. Changes apply as they're made, like the limits always have.
 * One engine, per-user numbers: nothing here is a special mode.
 */
export function DeviceEditor({ open, onOpenChange, device, onChange, onRename, onFavourite, onRemove }: Props) {
  const profile = device.profile;
  const [confirming, setConfirming] = useState(false);
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });
  const pick = (preset: MobilityPreset) => onChange(presetProfile(profile, preset));
  // The battery range is the person's own figure, not a change to the type's limits.
  // The speed unit is how they read speeds, not a limit either.
  const custom = JSON.stringify({ ...profile, label: "", maxRangeKm: undefined, speedUnit: undefined }) !== JSON.stringify({ ...PRESETS[profile.preset], label: "", maxRangeKm: undefined, speedUnit: undefined });
  const unit = speedUnit(profile);
  // Road speed in mph, to the nearest half: the steps the control moves in whatever the unit shown.
  const roadMph = profile.roadSpeedMps ? halfMph(profile.roadSpeedMps) : ROAD_MPH_MAX;
  const setRoadMph = (mph: number) => set({ roadSpeedMps: clamp(mph, ROAD_MPH_MIN, ROAD_MPH_MAX) * MPS_PER_MPH });
  const range = profile.maxRangeKm ?? null;
  // Battery range is kept in km. In miles mode it is shown and stepped in whole miles.
  const rangeShown = range === null ? null : rangeInUnit(range, unit);
  const [rangeMin, rangeMax] = [rangeInUnit(RANGE_MIN_KM, unit), rangeInUnit(RANGE_MAX_KM, unit)];
  const setRange = (shown: number) => set({ maxRangeKm: rangeToKm(clamp(shown, rangeMin, rangeMax), unit) });
  const stepsAllowed = Number.isFinite(profile.maxSteps) ? Math.min(profile.maxSteps, STEP_LIMIT) : STEP_LIMIT;

  return (
    <Sheet open={open} onOpenChange={(v) => { setConfirming(false); onOpenChange(v); }}>
      <SheetContent
        title={device.name || "How do you get around?"}
        description="Routes are worked out for these limits. Saved on this device only."
        className="max-md:inset-0 max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:pt-[env(safe-area-inset-top,0px)]"
      >
        <div className="mb-6 grid gap-4">
          <label className="grid gap-1.5">
            <span className="font-bold">Name</span>
            <input
              id="device-name"
              type="text"
              value={device.name}
              onChange={(e) => onRename(e.target.value.slice(0, 40))}
              placeholder={PRESETS[profile.preset].label}
              autoComplete="off"
              className="min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-base text-ink focus:border-accent focus:outline-none"
            />
            <span className="text-sm text-muted">Optional. For example: Cherry, Dad&apos;s chair, the red one.</span>
          </label>
          <Toggle id="device-favourite" label="Favourite" checked={device.favourite} onChange={onFavourite} />
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-base font-bold">Type</legend>
          <div className="grid gap-4" role="radiogroup" aria-label="Start from">
            {PRESET_GROUPS.map((g) => (
              <div key={g.label} role="group" aria-labelledby={`group-${g.id}`} className="grid gap-2">
                <span id={`group-${g.id}`} className="text-sm text-muted">
                  {g.label}
                </span>
                {/* Two columns, or one when large text would clip the names (STAB-11). */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
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
                        {TYPE_HINT[k] ? <span className={cn("mt-0.5 block text-sm", on ? "text-surface/80" : "text-muted")}>{TYPE_HINT[k]}</span> : null}
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
          <Limit label="Highest kerb" value={kerbLimitText(profile.maxKerbCm)} onStep={(d) => set({ maxKerbCm: stepKerbCm(profile.maxKerbCm, d) })}>
            <Slider thumbLabel="Highest kerb" valueText={profile.maxKerbCm > 0 && profile.maxKerbCm < 1 ? `${Math.round(profile.maxKerbCm * 10)} millimetres` : `${profile.maxKerbCm} centimetres`} min={0} max={20} step={1} value={[Math.min(profile.maxKerbCm, 20)]} onValueChange={([v]) => set({ maxKerbCm: v! })} />
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
            <Toggle
              id="crossing-cues"
              label="Prefer crossings with lights that beep or have a rotating cone"
              checked={!!profile.crossingCues}
              onChange={(v) => set({ crossingCues: v ? (PRESETS["visual-impairment"].crossingCues ?? { uncontrolledS: 240, zebraS: 60, silentSignalS: 120, noTactileS: 45 }) : undefined, sharedPathPer100mS: v ? (PRESETS["visual-impairment"].sharedPathPer100mS ?? 60) : undefined })}
            />
            <Toggle id="lit-after-dark" label="After dark, prefer streets that are lit" checked={!!profile.litAfterDarkPer100mS} onChange={(v) => set({ litAfterDarkPer100mS: v ? (PRESETS["visual-impairment"].litAfterDarkPer100mS ?? 60) : undefined })} />
            <fieldset className="m-0 grid gap-2 border-0 p-0 py-2">
              <legend className="text-base">Accessible toilet at least every</legend>
              <div role="radiogroup" aria-label="Accessible toilet at least every" className="flex flex-wrap gap-2">
                {([null, 500, 1000, 2000] as const).map((m) => {
                  const on = profile.maxToiletIntervalM === m;
                  return (
                    <button
                      key={String(m)}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set({ maxToiletIntervalM: m })}
                      className={cn("min-h-12 rounded-full border px-4 text-base", on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:border-ink")}
                    >
                      {m === null ? "Don't mind" : formatDistance(m, unit)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
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

          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="text-base">Show speeds and distances in</legend>
            <div role="radiogroup" aria-label="Show speeds and distances in" className="flex flex-wrap gap-2">
              {(["mph", "kmh"] as SpeedUnit[]).map((u) => {
                const on = unit === u;
                return (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ speedUnit: u })}
                    className={cn("min-h-12 rounded-full border px-4 text-base", on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:border-ink")}
                  >
                    {u === "mph" ? "Miles, mph" : "Kilometres, km/h"}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {profile.roadLegal ? (
            <Limit
              label="Speed on the road"
              value={formatSpeed(roadMph * MPS_PER_MPH, unit)}
              help="On roads without a separate pavement. 8 mph is the top speed allowed for a class 3 scooter."
              onStep={(d) => setRoadMph(roadMph + d * 0.5)}
            >
              <Slider
                thumbLabel="Speed on the road"
                valueText={formatSpeed(roadMph * MPS_PER_MPH, unit, true)}
                min={ROAD_MPH_MIN}
                max={ROAD_MPH_MAX}
                step={0.5}
                value={[roadMph]}
                onValueChange={([v]) => setRoadMph(v!)}
              />
            </Limit>
          ) : null}

          <p className="m-0 text-sm text-muted">
            Your {profile.roadLegal ? "pavement " : ""}pace: {formatSpeed(profile.speedMps, unit)} on the flat
            {profile.paceSamples ? `, learned from ${profile.paceSamples} journey${profile.paceSamples === 1 ? "" : "s"}` : ", a starting figure. It adjusts as you use navigation"}.
          </p>

          {hasBattery(profile) ? (
            <div className="grid gap-1">
              <Toggle id="battery-range" label="Warn me about battery range" checked={range !== null} onChange={(v) => set({ maxRangeKm: v ? RANGE_DEFAULT_KM : null })} />
              {range !== null ? (
                <Limit
                  label="Range on one charge"
                  value={formatDistance(range * 1000, unit)}
                  help="On the flat, from your manual or your own trips. We count each climb as extra distance, and warn when a trip uses over half."
                  onStep={(d) => setRange(rangeShown! + d)}
                >
                  <Slider thumbLabel="Range on one charge" valueText={formatDistance(range * 1000, unit, { long: true })} min={rangeMin} max={rangeMax} step={1} value={[rangeShown!]} onValueChange={([v]) => setRange(v!)} />
                </Limit>
              ) : (
                <p className="m-0 text-sm text-muted">Off: we don&apos;t guess your battery.</p>
              )}
            </div>
          ) : null}

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

        {onRemove ? (
          <div className="mt-8 grid gap-3 border-t border-line pt-4">
            {confirming ? (
              <div role="alert" className="grid gap-3 rounded-2xl border-2 border-stop p-4">
                <p className="m-0 font-bold">Remove {device.name || PRESETS[profile.preset].label}?</p>
                <p className="m-0 text-sm text-muted">Its name and limits go from this device. Your other devices stay.</p>
                <div className="flex flex-wrap gap-2">
                  <Button className="min-h-12 bg-stop px-4 text-surface" onClick={() => { setConfirming(false); onRemove(); }}>
                    Remove
                  </Button>
                  <Button variant="secondary" className="min-h-12 px-4" onClick={() => setConfirming(false)} autoFocus>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" className="min-h-12 justify-self-start px-3 font-bold text-stop" onClick={() => setConfirming(true)}>
                <Trash2 aria-hidden className="size-5" /> Remove {device.name || "this device"}
              </Button>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** A slider with − and + buttons: big targets for a tremor or gloves, and a simple path for Switch Control. */
function Limit({ label, value, help, onStep, children }: { label: string; value: string; help?: string; onStep?: (dir: -1 | 1) => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
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
      <span className="min-w-0 text-base">{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
