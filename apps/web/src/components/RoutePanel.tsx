"use client";
import { ArrowUpDown, CircleAlert, CircleCheck, CircleHelp, CircleX, DoorOpen, SlidersHorizontal } from "lucide-react";
import type { Profile } from "@causeway/profile";
import { useState } from "react";
import { ElevationChart } from "@/components/ElevationChart";
import { Button } from "@/components/ui/button";
import type { Place, PlannedRoute, PlanResult } from "@/lib/plan-types";
import type { Conditions, LiveLifts } from "@/lib/use-planner";
import { cn } from "@/lib/utils";

interface Props {
  from: Place;
  to: Place;
  profile: Profile;
  conditions: Conditions;
  result: PlanResult | null;
  planning: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChangeFrom: () => void;
  onChangeTo: () => void;
  onSwap: () => void;
  onOpenMode: () => void;
  onConditions: (c: "dry" | "wet" | "ice") => void;
  lifts: LiveLifts;
  onStart: () => void;
}

export const meta = (r: PlannedRoute) => {
  const s = r.summary;
  // With a train in the middle, the distance that matters is the bit you push, wheel or walk.
  const d = s.rides.length ? s.walkM : s.distanceM;
  const dist = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d} m`;
  const steep = s.worstInclinePct === null ? "slope unknown" : `max ${Math.abs(s.worstInclinePct)}%`;
  return `${Math.round(s.minutes)} min / ${dist} / ${steep}`;
};

/** Plain-language verdict. Never "step-free" while anything is unknown (the trust contract). */
function Verdict({ r }: { r: PlannedRoute }) {
  const s = r.summary;
  if (s.verdict === "passable")
    return (
      <span className="inline-flex items-center gap-1.5 text-ok">
        <CircleCheck aria-hidden className="size-5" /> Fits your limits
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-caution">
      <CircleHelp aria-hidden className="size-5" /> Missing data for {s.unknownM} m
    </span>
  );
}

export function RoutePanel(props: Props) {
  const { from, to, profile, conditions, result, planning, selectedId, onSelect } = props;
  const all: PlannedRoute[] = result?.status === "ok" ? [...result.routes, ...result.tradeoffs.flatMap((t) => (t.route ? [t.route] : []))] : [];
  const sel = all.find((r) => r.id === selectedId) ?? (result?.status === "ok" ? result.routes[0] : undefined);
  const weather = conditions.ice ? "ice" : conditions.wet ? "wet" : "dry";

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* Journey: from / to, each changeable; swap. */}
      <section aria-label="Journey" className="flex flex-wrap items-stretch gap-2">
        <div className="grid min-w-0 flex-[1_1_12rem] gap-1.5">
          <button type="button" onClick={props.onChangeFrom} className="min-h-12 w-full min-w-0 rounded-2xl bg-surface-2 px-4 py-1.5 text-left">
            <span className="sr-only">Change start: </span>
            <span className="block text-sm text-muted" aria-hidden>
              From
            </span>
            <span className="block truncate">{from.name}</span>
          </button>
          <button type="button" onClick={props.onChangeTo} className="min-h-12 w-full min-w-0 rounded-2xl bg-surface-2 px-4 py-1.5 text-left">
            <span className="sr-only">Change destination: </span>
            <span className="block text-sm text-muted" aria-hidden>
              To
            </span>
            <span className="block truncate font-bold">{to.name}</span>
          </button>
        </div>
        <Button variant="ghost" size="icon" onClick={props.onSwap} aria-label="Swap start and destination" className="self-center">
          <ArrowUpDown aria-hidden className="size-6" />
        </Button>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={props.onOpenMode} aria-label={`Routes are for ${profile.label}. Change`} className="h-auto max-w-full py-2 text-left">
          <SlidersHorizontal aria-hidden className="size-5" /> {profile.label}
        </Button>
        <span className="text-sm text-muted">{weather === "dry" ? "Dry ground" : weather === "wet" ? "Wet ground" : "Icy ground"}</span>
      </div>

      {planning && !result ? <p className="m-0 text-muted" aria-live="polite">Working out routes for your limits…</p> : null}

      {result?.status === "none" ? (
        <section aria-live="polite" className="grid gap-2 rounded-2xl border border-stop/40 p-4">
          <p className="m-0 flex items-center gap-2 font-bold">
            <CircleX aria-hidden className="size-5 text-stop" /> {result.message}
          </p>
          {result.walkingHeadline ? <p className="m-0 text-muted">{result.walkingHeadline}</p> : null}
          <Button onClick={props.onOpenMode}>Check your limits</Button>
        </section>
      ) : null}

      {result?.status === "ok" && sel ? (
        <>
          <section aria-labelledby="routes-h" className="grid gap-2">
            <h2 id="routes-h" className="sr-only">
              Routes
            </h2>
            <div role="radiogroup" aria-label="Routes" className="grid gap-2">
              {result.routes.map((r) => (
                <RouteCard key={r.id} r={r} on={r.id === sel.id} onSelect={() => onSelect(r.id)} />
              ))}
            </div>
            {planning ? <p className="m-0 text-sm text-muted" aria-live="polite">Updating…</p> : null}
            {props.lifts.state === "ok" ? (
              <p className="m-0 text-sm text-muted">
                Lift status from TfL at {props.lifts.at.slice(11, 16)} UTC: {props.lifts.closed === 0 ? "no outages on this network" : `${props.lifts.closed} platform${props.lifts.closed === 1 ? "" : "s"} closed to step-free travel, routed around`}.
              </p>
            ) : props.lifts.state === "failed" ? (
              <p className="m-0 text-sm text-caution">Couldn&apos;t get live lift status from TfL. Check before you travel.</p>
            ) : props.lifts.state === "loading" ? (
              <p className="m-0 text-sm text-muted">Checking lifts with TfL…</p>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" onClick={props.onStart} className="flex-1">
              Start
            </Button>
            <ShareButton to={to.name} minutes={sel.summary.minutes} />
          </div>

          <section aria-labelledby="why-h" className="grid gap-2">
            <h2 id="why-h" className="m-0 text-lg font-bold">
              Why this way?
            </h2>
            <p className="m-0">{result.headline}</p>
            {result.notes.length ? (
              <ul className="m-0 grid list-none gap-1 p-0 text-muted">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </section>

          {result.tradeoffs.length ? (
            <section aria-labelledby="trade-h" className="grid gap-2">
              <h2 id="trade-h" className="m-0 text-lg font-bold">
                Other options
              </h2>
              {result.tradeoffs.map((t) =>
                t.route ? (
                  <RouteCard key={t.id} r={t.route} title={t.label} on={t.route.id === sel.id} onSelect={() => onSelect(t.route!.id)} />
                ) : (
                  <p key={t.id} className="m-0 flex items-start gap-2 text-muted">
                    <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
                    {t.message}
                  </p>
                ),
              )}
            </section>
          ) : null}

          {sel.unknowns.length ? (
            <details className="rounded-2xl border border-line">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 font-bold">
                What we don&apos;t know
                <span className="text-sm font-normal text-muted">{sel.unknowns.length} places</span>
              </summary>
              <ul className="m-0 grid list-none gap-2 px-4 pb-4">
                {sel.unknowns.slice(0, 12).map((u) => (
                  <li key={u.name} className="grid">
                    <span>
                      {u.name} <span className="tabular text-muted">/ {u.m} m</span>
                    </span>
                    <span className="text-sm text-muted">{u.what}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <ElevationChart data={sel.elevation} worstPct={sel.summary.worstInclinePct} />

          {to.venue || to.id.startsWith("pin:") ? (
          <section aria-labelledby="in-h" className="grid gap-2">
            <h2 id="in-h" className="m-0 flex items-center gap-2 text-lg font-bold">
              <DoorOpen aria-hidden className="size-5" /> Getting in
            </h2>
            {result.entrances.length ? (
              <ul className="m-0 grid list-none gap-2 p-0">
                {result.entrances.map((e, i) => (
                  <li key={i} className="grid gap-0.5">
                    <span className="flex items-center gap-2">
                      {e.verdict.passable === "yes" ? (
                        <CircleCheck aria-hidden className="size-5 text-ok" />
                      ) : e.verdict.passable === "no" ? (
                        <CircleX aria-hidden className="size-5 text-stop" />
                      ) : (
                        <CircleHelp aria-hidden className="size-5 text-unknown" />
                      )}
                      <span>
                        {e.name ? `${e.name}: ` : "Entrance: "}
                        {e.verdict.detail}
                        <span className="sr-only">. {e.verdict.passable === "yes" ? "Usable with your settings" : e.verdict.passable === "no" ? "Not usable with your settings" : "Not known"}</span>
                      </span>
                    </span>
                    <span className="pl-7 text-sm text-muted">
                      {e.distanceM} m from the pin / {e.source}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-muted">No entrances mapped near this point. Check with the venue before you go.</p>
            )}
          </section>
          ) : null}

          <section aria-labelledby="ground-h" className="grid gap-2">
            <h2 id="ground-h" className="m-0 text-lg font-bold">
              Ground conditions
            </h2>
            <div role="radiogroup" aria-labelledby="ground-h" className="flex max-w-full flex-wrap gap-1 self-start rounded-[1.75rem] border border-line p-1">
              {(["dry", "wet", "ice"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={weather === k}
                  onClick={() => props.onConditions(k)}
                  className={cn("min-h-12 min-w-16 rounded-full px-4 text-base", weather === k ? "bg-ink text-surface" : "text-ink")}
                >
                  {k === "dry" ? "Dry" : k === "wet" ? "Wet" : "Icy"}
                </button>
              ))}
            </div>
            <p className="m-0 text-sm text-muted">
              {conditions.summary}. {conditions.source}.
            </p>
          </section>

          <details className="group rounded-2xl border border-line">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-bold">
              Route in words
              <span className="text-sm font-normal text-muted">{sel.segments.length} parts</span>
            </summary>
            <ol className="m-0 grid gap-2 px-4 pb-4 pl-9 [overflow-wrap:anywhere]">
              {sel.segments.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </details>
        </>
      ) : null}
    </div>
  );
}

function RouteCard({ r, on, onSelect, title, subtitle }: { r: PlannedRoute; on: boolean; onSelect: () => void; title?: string; subtitle?: string }) {
  const s = r.summary;
  const extras = [
    s.rides.length ? s.rides.map((x) => `${x.line} to ${x.to}`).join(", then ") : null,
    s.movableBridges.length ? `${s.movableBridges.map((b) => b.name).join(", ")} (moving bridge)` : null,
    s.lifts ? `${s.lifts} lift${s.lifts > 1 ? "s" : ""}` : null, s.steps ? `${s.steps} flight${s.steps > 1 ? "s" : ""} of steps` : null, (s.surfaceMix["setts"] ?? 0) > 20 ? `${s.surfaceMix["setts"]} m of setts` : null].filter(Boolean);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onSelect}
      className={cn("grid w-full gap-1 rounded-2xl border-2 p-4 text-left", on ? "border-accent bg-surface-2" : "border-line bg-surface hover:border-ink")}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-bold">{title ?? r.label}</span>
        {r.minutesExtra > 0 ? <span className="tabular text-sm text-muted">+{r.minutesExtra} min</span> : null}
      </span>
      <span className="tabular font-mono text-[15px]">{meta(r)}</span>
      {subtitle ? <span className="text-sm text-muted">{subtitle}</span> : null}
      {extras.length ? <span className="text-sm text-muted">{extras.join(" / ")}</span> : null}
      <span className="text-sm">
        <Verdict r={r} />
      </span>
    </button>
  );
}

/**
 * Share where you're going and when you'll arrive. Never includes the
 * profile: someone's mobility settings are theirs alone.
 */
function ShareButton({ to, minutes }: { to: string; minutes: number }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const eta = new Date(Date.now() + minutes * 60_000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const text = `I'm heading to ${to}. I should be there about ${eta}.`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      /* cancelled or blocked: fall through to copying */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* nothing more we can do without a share sheet or clipboard */
    }
  };
  return (
    <Button size="lg" onClick={share} aria-live="polite">
      {copied ? "Copied" : "Share arrival time"}
    </Button>
  );
}
