"use client";
import { ArrowUpDown, ChevronDown, CircleAlert, CircleCheck, CircleHelp, CircleX, DoorOpen, MapPin, MessageSquarePlus, Share2, Trees, Undo2 } from "lucide-react";
import { entranceRef, notesForEntrance, notesForPlace, notesForStretch, type UserNote } from "@causeway/graph";
import type { Profile } from "@causeway/profile";
import { useState } from "react";
import { createPortal } from "react-dom";
import { BusDepartures } from "@/components/BusDepartures";
import { leaveLabel, ukTime } from "@/lib/leave";
import { hoursText } from "@/lib/opening-hours";
import type { toiletsAlong } from "@/lib/toilets";
import { ElevationChart } from "@/components/ElevationChart";
import { NoteList } from "@/components/NoteList";
import { SearchBar } from "@/components/SearchBar";
import { GroundPicker } from "@/components/TripSettings";
import type { Ground } from "@/components/MapChrome";
import { compareLine } from "@/lib/devices";
import type { NoteAbout } from "@/components/NoteSheet";
import { RouteStrip, VerdictPill } from "@/components/RouteStrip";
import { Button } from "@/components/ui/button";
import type { FloodHere, Place, PlannedRoute, PlanResult, WorksSummary } from "@/lib/plan-types";
import { departure, type Conditions, type LiveLifts } from "@/lib/use-planner";
import type { FlagReason } from "@/lib/sync";
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
  /** Who the routes are for: the device button, shown in the destination bar. */
  device?: React.ReactNode;
  /** The device these routes were planned for, shown on the route ("For Cherry"). */
  forLabel?: string;
  /** The previous device's best time for this journey, after a switch. */
  compare?: { label: string; minutes: number | null } | null;
  /** Other saved devices that can make this journey when this one can't. */
  alternatives?: { id: string; label: string; minutes: number }[];
  onUseForTrip?: (id: string) => void;
  /** Change the ground from the route (the top-of-map chip moved into the sheet, D-036 step 8). */
  onGround?: (g: Ground) => void;
  lifts: LiveLifts;
  /** Street works on pavements in this area; null where there is no feed (Scotland for now). */
  works: WorksSummary | null;
  /** Environment Agency flood warnings over this city's paths; null where we don't check (DATA-07). */
  floods?: { here: FloodHere[]; at: string } | null;
  /** The city has a works feed at all. */
  worksCovered: boolean;
  /** Accessible toilets along the chosen route, from the search index. */
  toilets: ReturnType<typeof toiletsAlong> | null;
  /** Live bus departures exist for this city (TfL in London). */
  liveBuses: boolean;
  onStart: () => void;
  /** Notes on this device (separate from the graph), this device's author id, and the graph build the route came from. */
  notes: UserNote[];
  author: string;
  builtAt: string;
  /** Open the note sheet with these subjects to choose from, most likely first. */
  onAddNote: (choices: NoteAbout[]) => void;
  onDeleteNote: (id: string) => void;
  /** Present when notes are shared: flag someone else's note. */
  onFlagNote?: (id: string, reason: FlagReason) => Promise<boolean>;
  /** A limit stretched for this journey only (never saved), and how to undo it. */
  once: { what: string[] } | null;
  onAllowOnce: (patch: Partial<Profile>, what: string[]) => void;
  onUndoOnce: () => void;
  /** Go as close as you can get instead. */
  onGoClosest: (p: Place) => void;
  /** Phones: Start sits in a bar pinned to the bottom of the screen, in reach at any sheet height. */
  pinActions?: boolean;
}

const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);
const groundWord = (c: Conditions) => (c.ice ? "icy ground" : c.wet ? "wet ground" : "dry ground");

export const meta = (r: PlannedRoute) => {
  const s = r.summary;
  // With a train in the middle, the distance that matters is the bit you push, wheel or walk.
  const d = s.rides.length ? s.walkM : s.distanceM;
  const steep = s.worstInclinePct === null ? "slope not known" : `max ${Math.abs(s.worstInclinePct)}%`;
  return `${dist(d)} · ${steep}`;
};

/** What else is on the way, in a few words: rides, lifts, steps, setts. */
function extras(r: PlannedRoute): string[] {
  const s = r.summary;
  return [
    s.rides.length ? s.rides.map((x) => `${x.line.replace(/ towards .*/, "")} to ${x.to}`).join(", then ") : null,
    s.movableBridges.length ? `${s.movableBridges.map((b) => b.name).join(", ")} (moving bridge)` : null,
    s.lifts ? `${s.lifts} lift${s.lifts > 1 ? "s" : ""}` : null,
    s.steps ? `${s.steps} flight${s.steps > 1 ? "s" : ""} of steps` : null,
    (s.surfaceMix["setts"] ?? 0) > 20 ? `${s.surfaceMix["setts"]} m of setts` : null,
    s.unknownM >= 10 ? `${dist(s.unknownM)} not fully mapped` : null,
  ].filter((x): x is string => !!x);
}

export function RoutePanel(props: Props) {
  const { from, to, profile, conditions, result, planning, selectedId, onSelect } = props;
  const all: PlannedRoute[] = result?.status === "ok" ? [...result.routes, ...result.tradeoffs.flatMap((t) => (t.route ? [t.route] : []))] : [];
  const sel = all.find((r) => r.id === selectedId) ?? (result?.status === "ok" ? result.routes[0] : undefined);
  const { notes, author, builtAt } = props;
  const stretches = sel?.stretches ?? [];
  const unknownNames = new Set(sel?.unknowns.map((u) => u.name) ?? []);
  const stretchNotes = (name: string) => {
    const st = stretches.find((x) => x.name === name);
    return st ? notesForStretch(notes, st, builtAt) : [];
  };
  // Notes on stretches we lack data for show under "What we don't know"; the rest under "Why this way?".
  const routeNotes = stretches.filter((st) => !unknownNames.has(st.name)).flatMap((st) => notesForStretch(notes, st, builtAt));
  const titled =
    result?.status === "ok"
      ? [...result.routes.map((r) => ({ r, title: r.label, why: null as string | null })), ...result.tradeoffs.flatMap((t) => (t.route ? [{ r: t.route, title: t.label, why: t.message }] : []))]
      : [];
  const others = titled.filter((o) => o.r.id !== sel?.id);
  const selTitle = titled.find((o) => o.r.id === sel?.id);
  const tradeoffMessages = result?.status === "ok" ? result.tradeoffs.filter((t) => !t.route) : [];
  const isVenue = !!to.venue || to.id.startsWith("pin:");
  const placeNotes = notesForPlace(notes, to);
  const entrances = result?.status === "ok" ? result.entrances : [];
  const entranceNotes = entrances.flatMap((e) => notesForEntrance(notes, e.osmId));
  const peopleCount = routeNotes.length + placeNotes.length + entranceNotes.length + [...unknownNames].reduce((t, n) => t + stretchNotes(n).length, 0);

  // What a new note can be about, most likely first: the place you're going, its doors, then the streets on the way.
  const choices: NoteAbout[] = [
    ...(isVenue ? [{ target: { kind: "place" as const, ref: to.id, name: to.name }, lon: to.lon, lat: to.lat }] : []),
    ...entrances.map((e) => ({ target: { kind: "place" as const, ref: entranceRef(e.osmId), name: entranceName(e) }, lon: e.lon, lat: e.lat })),
    ...[...stretches]
      .filter((st) => st.m >= 20 && !st.name.startsWith("a path") && !st.name.startsWith("unnamed"))
      .sort((a, b) => Number(b.name === to.name) - Number(a.name === to.name) || b.m - a.m)
      .slice(0, 10)
      .map((st): NoteAbout => {
        const [lon, lat] = st.points[Math.floor(st.points.length / 2)]!;
        return { target: { kind: "way", name: st.name, osmWayIds: st.osmWayIds, edgeIds: st.edgeIds, graphBuiltAt: builtAt }, lon, lat };
      }),
  ];

  const worksClosed = props.works && props.works.closedNow > 0;
  const flood = props.floods?.here.find((f) => f.severity <= 2);
  const liveLine = flood
    ? `${flood.name}: ${flood.label}. ${flood.severity === 1 ? "Paths there are closed." : "Paths there may be flooded, so they count as unknown."} (Environment Agency)`
    : props.lifts.state === "failed"
      ? "Couldn't get live lift status from TfL. Check before you travel."
      : props.lifts.state === "ok" && props.lifts.lines.length > 0
        ? `${props.lifts.lines[0]} Routed around (TfL, ${props.lifts.at.slice(11, 16)} UTC).`
      : props.lifts.state === "ok" && props.lifts.closed > 0
        ? `${props.lifts.closed} lift${props.lifts.closed === 1 ? "" : "s"} out of service, routed around (TfL, ${props.lifts.at.slice(11, 16)} UTC).`
        : worksClosed
          ? `${props.works!.closedNow} pavement closure${props.works!.closedNow === 1 ? "" : "s"} nearby, avoided.`
          : null;
  // The sentence that says why this route: the explanation for the best route, the trade-off for the others.
  const why = !sel ? null : result?.status === "ok" && sel.id === result.routes[0]?.id ? result.headline : (selTitle?.why ?? null);

  return (
    <div className="grid grid-cols-1 gap-3 [&>*]:min-w-0">
      {/* Journey: two rows, swap on the side. Tap either to change it. */}
      <section aria-label="Journey" className="flex items-stretch gap-1">
        <div className="grid min-w-0 flex-1">
          <button type="button" onClick={props.onChangeFrom} className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-1 text-left hover:bg-surface-2">
            <span aria-hidden className="ml-1 size-3 shrink-0 rounded-full border-[3px] border-ink" />
            <span className="sr-only">Change start: </span>
            <span className="truncate">{from.name}</span>
          </button>
        </div>
        <Button variant="ghost" size="icon" onClick={props.onSwap} aria-label="Swap start and destination" className="self-center">
          <ArrowUpDown aria-hidden className="size-6" />
        </Button>
      </section>

      {/* The same bar as search: where to, and who the routes are for (D-036). No magnifier once there's a destination. */}
      <SearchBar
        main={
          <button type="button" onClick={props.onChangeTo} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left">
            <MapPin aria-hidden className="size-5 shrink-0 text-accent" strokeWidth={2.6} />
            <span className="sr-only">Change destination: </span>
            <span className="truncate text-lg font-bold">{to.name}</span>
          </button>
        }
        trailing={props.device}
      />
      {props.onGround ? (
        <div className="-mt-1 flex flex-wrap items-center justify-between gap-2 px-1">
          <span className="text-sm text-muted">Worked out for {groundWord(conditions)}.</span>
          <GroundPicker ground={conditions.ice ? "ice" : conditions.wet ? "wet" : "dry"} onGround={props.onGround} />
        </div>
      ) : (
        <p className="m-0 -mt-1 px-1 text-sm text-muted">Worked out for {groundWord(conditions)}.</p>
      )}

      {props.once ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border-2 border-caution bg-caution-soft p-3">
          <p className="m-0 min-w-0 flex-1 text-sm">
            <span className="font-bold">Allowing {props.once.what.join(" and ")} for this journey only.</span> Your saved limits haven&apos;t changed.
          </p>
          <Button size="md" onClick={props.onUndoOnce} className="min-h-11 shrink-0 px-3 text-sm">
            <Undo2 aria-hidden className="size-4" /> Undo
          </Button>
        </div>
      ) : null}

      {planning && !result ? (
        <p className="m-0 py-6 text-center text-muted" aria-live="polite">
          Working out routes for your limits…
        </p>
      ) : null}

      {result?.status === "none" ? (
        <NoFit result={result} to={to} forLabel={props.forLabel} alternatives={props.alternatives ?? []} onUseForTrip={props.onUseForTrip} onAllowOnce={props.onAllowOnce} onGoClosest={props.onGoClosest} onOpenMode={props.onOpenMode} />
      ) : null}

      {result?.status === "ok" && sel ? (
        <>
          <section aria-labelledby="route-h" aria-live="polite" className="grid gap-3 rounded-[20px] border-2 border-ink p-4">
            <h2 id="route-h" className="sr-only">
              {selTitle?.title || "Best for you"}
            </h2>
            {props.forLabel ? <span className="justify-self-start rounded-full border border-line px-3 py-0.5 text-sm font-bold">For {props.forLabel}</span> : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <VerdictPill v={sel.summary.verdict} />
              <span className="tabular text-[28px] leading-none font-bold">{Math.round(sel.summary.minutes)} min</span>
              <span className="tabular text-sm text-muted">{meta(sel)}</span>
            </div>
            <ArrivalHours hours={to.hours} minutes={sel.summary.minutes} leave={conditions.leaveAt ?? null} />
            <RouteStrip strip={sel.strip} />
            {props.compare && props.compare.label !== props.forLabel ? (
              <p className={cn("m-0 font-bold", props.compare.minutes === null || Math.round(sel.summary.minutes) < props.compare.minutes ? "text-ok" : "text-ink")}>{compareLine(Math.round(sel.summary.minutes), props.compare)}</p>
            ) : null}
            {why ? <p className="m-0">{why}</p> : null}
            {extras(sel).length ? <p className="m-0 -mt-1 text-sm text-muted">{extras(sel).join(" · ")}</p> : null}
            {result.door ? (
              <p className="m-0 flex items-start gap-1.5 text-sm">
                <DoorOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
                Ends at {result.door.name ? `the ${result.door.name} entrance` : "an entrance"} that fits you ({result.door.detail}).
              </p>
            ) : null}
            {result.gate ? (
              <p className="m-0 flex items-start gap-1.5 text-sm">
                <Trees aria-hidden className="mt-0.5 size-4 shrink-0" />
                Ends at a gate into {result.gate.park}, the nearest on your way (OS Open Greenspace).
              </p>
            ) : null}
            {liveLine ? <p className={cn("m-0 text-sm", props.lifts.state === "failed" ? "text-caution" : "text-muted")}>{liveLine}</p> : null}
            {planning ? <p className="m-0 text-sm text-muted">Updating…</p> : null}
          </section>

          {others.length ? (
            <ul aria-label="Other ways" className="m-0 grid list-none gap-2 p-0">
              {others.map((o) => (
                <li key={o.r.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(o.r.id)}
                    className="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line px-4 py-2 text-left hover:border-ink"
                  >
                    <span className="sr-only">Switch to </span>
                    <span className="tabular text-lg font-bold">{Math.round(o.r.summary.minutes)} min</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{o.title || "Another way"}</span>
                      <span className="tabular block text-sm text-muted">{meta(o.r)}</span>
                    </span>
                    <VerdictPill v={o.r.summary.verdict} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {tradeoffMessages.map((t) => (
            <p key={t.id} className="m-0 flex items-start gap-2 text-sm text-muted">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t.message}
            </p>
          ))}

          {(() => {
            const actions = (
              <div className="flex gap-2">
                <Button variant="primary" size="lg" onClick={props.onStart} className="min-w-0 flex-1 rounded-2xl">
                  Start
                </Button>
                <Button size="lg" onClick={() => props.onAddNote(choices)} disabled={!choices.length} aria-label="Add a note about this route" className="w-[56px] shrink-0 rounded-2xl px-0">
                  <MessageSquarePlus aria-hidden className="size-6" />
                </Button>
                <ShareButton to={to.name} minutes={sel.summary.minutes} />
              </div>
            );
            // The sheet is transformed while it snaps, so a fixed bar has to live outside it.
            return props.pinActions && typeof document !== "undefined"
              ? createPortal(
                  <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgb(0_0_0/0.08)]">{actions}</div>,
                  document.body,
                )
              : actions;
          })()}

          <div className="grid gap-2 [&>*]:min-w-0">
            {isVenue ? (
              <More
                title="Getting in"
                icon={<DoorOpen aria-hidden className="size-5" />}
                aside={entrances.length ? `${entrances.filter((e) => e.verdict.passable === "yes").length} of ${entrances.length} fit` : "Not mapped"}
              >
                {to.facts ? (
                  <div className="grid gap-0.5">
                    <ul className="m-0 grid list-none gap-0.5 p-0">
                      {to.facts.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <span className="text-sm text-muted">{to.factsSource}. Mapped by volunteers; check with the venue if it matters.</span>
                  </div>
                ) : null}
                {entrances.length ? (
                  <ul className="m-0 grid list-none gap-3 p-0">
                    {entrances.map((e) => (
                      <li key={e.osmId} className="grid gap-0.5">
                        <span className="flex items-center gap-2">
                          {e.verdict.passable === "yes" ? (
                            <CircleCheck aria-hidden className="size-5 shrink-0 text-ok" />
                          ) : e.verdict.passable === "no" ? (
                            <CircleX aria-hidden className="size-5 shrink-0 text-stop" />
                          ) : (
                            <CircleHelp aria-hidden className="size-5 shrink-0 text-unknown" />
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
                        <PeopleSay notes={notesForEntrance(notes, e.osmId)} all={notes} author={author} onDelete={props.onDeleteNote} onFlag={props.onFlagNote} className="pl-7" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-muted">No entrances mapped near this point. Check with the venue before you go.</p>
                )}
                <PeopleSay notes={placeNotes} all={notes} author={author} onDelete={props.onDeleteNote} onFlag={props.onFlagNote} title="What people say about the place" />
              </More>
            ) : null}

            <More title="Why this way?" aside={peopleCount ? `${peopleCount} note${peopleCount === 1 ? "" : "s"} from people` : undefined}>
              {result.notes.length ? (
                <ul className="m-0 grid list-none grid-cols-1 gap-1 p-0">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-muted">Nothing else to flag on this route.</p>
              )}
              <PeopleSay notes={routeNotes} all={notes} author={author} onDelete={props.onDeleteNote} onFlag={props.onFlagNote} title="Notes from people on this route" hint="Their own experience, not checked by us. Notes nudge your routes but never rule a street in or out." />
            </More>

            <BusDepartures legs={sel.busLegs} live={props.liveBuses && leaveLabel(conditions.leaveAt ?? null) === "now"} />

            {props.toilets ? <Toilets data={props.toilets} wantM={profile.maxToiletIntervalM} /> : null}

            {sel.unknowns.length ? (
              <More title="What we don't know" aside={`${sel.unknowns.length} place${sel.unknowns.length === 1 ? "" : "s"}`}>
                <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0">
                  {sel.unknowns.slice(0, 12).map((u) => (
                    <li key={u.name} className="grid">
                      <span>
                        {u.name} <span className="tabular text-muted">/ {u.m} m</span>
                      </span>
                      <span className="text-sm text-muted">{u.what}</span>
                      <PeopleSay notes={stretchNotes(u.name)} all={notes} author={author} onDelete={props.onDeleteNote} onFlag={props.onFlagNote} title="What people say (not checked by us)" className="mt-2" />
                    </li>
                  ))}
                </ul>
              </More>
            ) : null}

            <More title="Hills" aside={sel.summary.worstInclinePct === null ? "Not known" : `Steepest ${Math.abs(sel.summary.worstInclinePct)}%`}>
              <ElevationChart data={sel.elevation} worstPct={sel.summary.worstInclinePct} />
            </More>

            <More title="Route in words" aside={`${sel.segments.length} parts`}>
              <ol className="m-0 grid gap-2 pl-5 [overflow-wrap:anywhere]">
                {sel.segments.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </More>

            <More title="Where this comes from">
              <ul className="m-0 grid list-none gap-1 p-0 text-sm text-muted">
                <li>
                  Ground: {conditions.summary}. {conditions.source}.
                </li>
                {props.lifts.state === "ok" ? (
                  <li>
                    Lift status from TfL at {props.lifts.at.slice(11, 16)} UTC: {props.lifts.closed === 0 ? "no outages on this network" : `${props.lifts.closed} platform${props.lifts.closed === 1 ? "" : "s"} closed to step-free travel, routed around`}.
                  </li>
                ) : null}
                {props.lifts.state === "ok" && props.lifts.lines.length ? (
                  <li>Line closures from TfL, routed around: {props.lifts.lines.join(" ")}</li>
                ) : props.lifts.state === "loading" ? (
                  <li>Checking lifts with TfL…</li>
                ) : null}
                {props.floods ? (
                  <li>
                    Flood warnings from the Environment Agency at {props.floods.at.slice(11, 16)} UTC: {props.floods.here.length ? props.floods.here.map((f) => `${f.name}, ${f.label}`).join("; ") : "none over these paths"}.
                  </li>
                ) : null}
                {props.works ? (
                  <li>
                    Pavement works: {props.works.closedNow + props.works.affectedNow === 0 ? "none known in this area today" : `${props.works.closedNow} closing a pavement (avoided) and ${props.works.affectedNow} on one (counted as unknown)`}. From {props.works.sources.join(" and ")}.
                  </li>
                ) : !props.worksCovered ? (
                  <li>No open roadworks feed here yet, so pavement closures aren&apos;t shown.</li>
                ) : null}
              </ul>
            </More>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Nothing fits. Say what's in the way, then what you can do: go as close as
 * you can, or stretch a limit for this journey only. Never a dead end (D-035).
 */
function NoFit({ result, to, forLabel, alternatives, onUseForTrip, onAllowOnce, onGoClosest, onOpenMode }: { result: Extract<PlanResult, { status: "none" }>; to: Place; forLabel?: string; alternatives: NonNullable<Props["alternatives"]>; onUseForTrip?: (id: string) => void; onAllowOnce: Props["onAllowOnce"]; onGoClosest: Props["onGoClosest"]; onOpenMode: () => void }) {
  const b = result.blockers;
  const named = b.slice(0, 2).map((x) => `${x.detail} on ${x.name}`);
  const cl = result.closest;
  return (
    <section aria-live="polite" aria-labelledby="nofit-h" className="grid gap-3">
      <div className="grid gap-1 rounded-[20px] bg-stop-soft p-4">
        <h2 id="nofit-h" className="m-0 flex items-center gap-2 text-lg font-bold text-stop">
          <CircleX aria-hidden className="size-6 shrink-0" /> {forLabel ? `No route for ${forLabel}` : result.message}
        </h2>
        {named.length ? (
          <p className="m-0">
            In the way: <span className="font-bold">{named.join(", then ")}</span>
            {b.length > 2 ? ` and ${b.length - 2} more` : ""}. Marked on the map.
          </p>
        ) : (
          <p className="m-0">Your start and {to.name} aren&apos;t joined up in our map data.</p>
        )}
      </div>
      <h3 className="m-0 font-mono text-xs tracking-[0.08em] text-muted uppercase">What you can do</h3>
      {onUseForTrip
        ? alternatives.map((a) => (
            <button key={a.id} type="button" onClick={() => onUseForTrip(a.id)} className="grid gap-1 rounded-2xl border-2 border-line p-4 text-left hover:border-ink">
              <span className="font-bold">
                {a.label} can do this one: {a.minutes} min
              </span>
              <span className="text-sm text-muted">Plans this journey for {a.label}. You go back to {forLabel ?? "your device"} when it ends.</span>
              <span className="font-bold text-accent">Use {a.label} for this trip</span>
            </button>
          ))
        : null}
      {cl ? (
        <button
          type="button"
          onClick={() => onGoClosest({ id: `closest:${cl.end[0].toFixed(5)},${cl.end[1].toFixed(5)}`, name: `${cl.name}, near ${to.name}`, kind: `As close as you can get: ${dist(cl.leftM)} short`, lon: cl.end[0], lat: cl.end[1] })}
          className="grid gap-1 rounded-2xl border-2 border-line p-4 text-left hover:border-ink"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold">Get as close as you can</span>
            <VerdictPill v={cl.summary.verdict} />
          </span>
          <span className="text-sm text-muted">
            {cl.name}, {dist(cl.leftM)} from {to.name}. {Math.round(cl.summary.minutes)} min.
          </span>
          <RouteStrip strip={cl.strip} className="my-1" />
          <span className="font-bold text-accent">Show this route</span>
        </button>
      ) : null}
      {result.relax ? (
        <button type="button" onClick={() => onAllowOnce(result.relax!.patch, result.relax!.what)} className="grid gap-1 rounded-2xl border-2 border-line p-4 text-left hover:border-ink">
          <span className="font-bold">I&apos;ll manage {result.relax.what.join(" and ")} today</span>
          <span className="text-sm text-muted">
            Plans with {result.relax.what.join(" and ")} allowed, for this journey only (about {result.relax.minutes} min). Your saved limits stay the same.
          </span>
          <span className="font-bold text-accent">Allow for this journey</span>
        </button>
      ) : null}
      <button type="button" onClick={onOpenMode} className="grid gap-1 rounded-2xl border-2 border-line p-4 text-left hover:border-ink">
        <span className="font-bold">Check your limits</span>
        <span className="text-sm text-muted">If they&apos;re stricter than you need, a change here applies to every route.</span>
      </button>
    </section>
  );
}

const entranceName = (e: { name: string | null; verdict: { detail: string } }) => (e.name ? `${e.name} entrance` : `Entrance (${e.verdict.detail})`);

/** A section you open when you want it. The summary row says what's inside, so a closed section still informs. */
function More({ title, aside, icon, children }: { title: string; aside?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line">
      {/* The summary wraps under large text: the count and arrow drop below the title (STAB-12). */}
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 px-4 py-1">
        <span className="flex min-w-0 items-center gap-2 font-bold [overflow-wrap:anywhere]">
          {icon}
          {title}
        </span>
        <span className="ml-auto flex items-center gap-2 text-sm text-muted">
          {aside}
          <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 [overflow-wrap:break-word]">{children}</div>
    </details>
  );
}

function PeopleSay({
  notes,
  all,
  author,
  onDelete,
  onFlag,
  title,
  hint,
  className,
}: {
  notes: UserNote[];
  all: UserNote[];
  author: string;
  onDelete: (id: string) => void;
  onFlag?: (id: string, reason: FlagReason) => Promise<boolean>;
  title?: string;
  hint?: string;
  className?: string;
}) {
  if (!notes.length) return null;
  return (
    <div className={cn("grid gap-2", className)}>
      {title ? <h3 className="m-0 text-base font-bold">{title}</h3> : null}
      <p className="m-0 text-sm text-muted">{hint ?? "Their own experience, not checked by us."}</p>
      <NoteList notes={notes} all={all} author={author} onDelete={onDelete} onFlag={onFlag} />
    </div>
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
    <Button size="lg" onClick={share} aria-label={copied ? "Copied your arrival time" : "Share your arrival time"} className="w-[56px] shrink-0 rounded-2xl px-0">
      <Share2 aria-hidden className="size-6 shrink-0" />
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </Button>
  );
}

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

/** Accessible toilets on the way, in route order, with what matters when you get there. */
function Toilets({ data, wantM }: { data: NonNullable<Props["toilets"]>; wantM: number | null }) {
  const { toilets, longestGapM } = data;
  const short = wantM !== null && longestGapM > wantM;
  return (
    <More title="Accessible toilets" aside={toilets.length ? `${toilets.length} on the way` : "None mapped"}>
      {wantM !== null ? (
        <p className={cn("m-0 mb-2 text-sm", short ? "text-caution" : "text-muted")}>
          {short ? `Longest stretch without one: ${km(longestGapM)}. You asked for one every ${km(wantM)}.` : `One at least every ${km(wantM)}, as you asked.`}
        </p>
      ) : null}
      {toilets.length ? (
        <ul className="m-0 grid list-none gap-2 p-0">
          {toilets.slice(0, 12).map((t) => (
            <li key={`${t.name}${t.at}`} className="grid">
              <span>
                {t.name} <span className="tabular text-muted">/ at {km(t.at)}</span>
              </span>
              <span className="text-sm text-muted">{[t.public ? "Public toilet" : "In a venue", t.offM > 15 ? `${km(t.offM)} off the route` : null, ...t.facts].filter(Boolean).join(" / ")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted">No accessible toilets are mapped within about 80 m of this route. Some won't be mapped.</p>
      )}
      <p className="m-0 mt-2 text-sm text-muted">From OpenStreetMap. Mapped by volunteers; check opening times.</p>
    </More>
  );
}

/** Whether the destination is open when you'd get there, from its mapped hours. */
function ArrivalHours({ hours, minutes, leave }: { hours?: string; minutes: number; leave: Date | null }) {
  const start = departure({ leaveAt: leave });
  const arrive = new Date(start.getTime() + minutes * 60_000);
  const later = leaveLabel(leave) !== "now";
  const h = hoursText(hours, arrive);
  if (!h && !later) return null;
  return (
    <>
      {later ? <p className="m-0 text-sm text-muted">Leaving {leaveLabel(leave)}, arriving about {ukTime(arrive)}.</p> : null}
      {h ? (
        <p className={cn("m-0 text-sm", h.open === false ? "font-bold text-ink" : "text-muted")}>
          {h.open === null ? h.text : `When you arrive: ${h.text.charAt(0).toLowerCase()}${h.text.slice(1)}`}. Hours from OpenStreetMap.
        </p>
      ) : null}
    </>
  );
}
