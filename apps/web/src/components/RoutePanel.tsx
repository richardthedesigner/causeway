"use client";
import { ArrowUpDown, ChevronDown, CircleAlert, CircleCheck, CircleHelp, CircleX, DoorOpen, MessageSquarePlus, Share2, SlidersHorizontal } from "lucide-react";
import { entranceRef, notesForEntrance, notesForPlace, notesForStretch, type UserNote } from "@causeway/graph";
import type { Profile } from "@causeway/profile";
import { useState } from "react";
import { BusDepartures } from "@/components/BusDepartures";
import { ElevationChart } from "@/components/ElevationChart";
import { NoteList } from "@/components/NoteList";
import type { NoteAbout } from "@/components/NoteSheet";
import { Button } from "@/components/ui/button";
import type { Place, PlannedRoute, PlanResult, WorksSummary } from "@/lib/plan-types";
import type { Conditions, LiveLifts } from "@/lib/use-planner";
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
  onConditions: (c: "dry" | "wet" | "ice") => void;
  lifts: LiveLifts;
  /** Street works on pavements in this area; null where there is no feed (Scotland for now). */
  works: WorksSummary | null;
  /** The city has a works feed at all. */
  worksCovered: boolean;
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
}

const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

export const meta = (r: PlannedRoute) => {
  const s = r.summary;
  // With a train in the middle, the distance that matters is the bit you push, wheel or walk.
  const d = s.rides.length ? s.walkM : s.distanceM;
  const steep = s.worstInclinePct === null ? "slope unknown" : `max ${Math.abs(s.worstInclinePct)}%`;
  return `${Math.round(s.minutes)} min / ${dist(d)} / ${steep}`;
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
      <CircleHelp aria-hidden className="size-5" /> Missing data for {dist(s.unknownM)}
    </span>
  );
}

export function RoutePanel(props: Props) {
  const { from, to, profile, conditions, result, planning, selectedId, onSelect } = props;
  const all: PlannedRoute[] = result?.status === "ok" ? [...result.routes, ...result.tradeoffs.flatMap((t) => (t.route ? [t.route] : []))] : [];
  const sel = all.find((r) => r.id === selectedId) ?? (result?.status === "ok" ? result.routes[0] : undefined);
  const weather = conditions.ice ? "ice" : conditions.wet ? "wet" : "dry";
  const { notes, author, builtAt } = props;
  const stretches = sel?.stretches ?? [];
  const unknownNames = new Set(sel?.unknowns.map((u) => u.name) ?? []);
  const stretchNotes = (name: string) => {
    const st = stretches.find((x) => x.name === name);
    return st ? notesForStretch(notes, st, builtAt) : [];
  };
  // Notes on stretches we lack data for show under "What we don't know"; the rest under "Why this way?".
  const routeNotes = stretches.filter((st) => !unknownNames.has(st.name)).flatMap((st) => notesForStretch(notes, st, builtAt));
  const others =
    result?.status === "ok"
      ? [...result.routes.map((r) => ({ r, title: r.label })), ...result.tradeoffs.flatMap((t) => (t.route ? [{ r: t.route, title: t.label }] : []))].filter((o) => o.r.id !== sel?.id)
      : [];
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
  const liveLine =
    props.lifts.state === "failed"
      ? "Couldn't get live lift status from TfL. Check before you travel."
      : props.lifts.state === "ok" && props.lifts.closed > 0
        ? `${props.lifts.closed} lift${props.lifts.closed === 1 ? "" : "s"} out of service, routed around (TfL, ${props.lifts.at.slice(11, 16)} UTC).`
        : worksClosed
          ? `${props.works!.closedNow} pavement closure${props.works!.closedNow === 1 ? "" : "s"} nearby, avoided.`
          : null;

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Journey: one card, two rows, swap on the side. */}
      <section aria-label="Journey" className="flex items-stretch gap-1 rounded-2xl bg-surface-2">
        <div className="grid min-w-0 flex-1">
          <button type="button" onClick={props.onChangeFrom} className="flex min-h-12 min-w-0 items-center gap-2 px-4 text-left">
            <span className="sr-only">Change start: </span>
            <span aria-hidden className="w-10 shrink-0 text-sm text-muted">
              From
            </span>
            <span className="truncate">{from.name}</span>
          </button>
          <span aria-hidden className="mx-4 border-t border-line" />
          <button type="button" onClick={props.onChangeTo} className="flex min-h-12 min-w-0 items-center gap-2 px-4 text-left">
            <span className="sr-only">Change destination: </span>
            <span aria-hidden className="w-10 shrink-0 text-sm text-muted">
              To
            </span>
            <span className="truncate font-bold">{to.name}</span>
          </button>
        </div>
        <Button variant="ghost" size="icon" onClick={props.onSwap} aria-label="Swap start and destination" className="self-center">
          <ArrowUpDown aria-hidden className="size-6" />
        </Button>
      </section>

      {planning && !result ? <p className="m-0 text-muted" aria-live="polite">Working out routes for your limits…</p> : null}

      {result?.status !== "ok" ? <Settings {...props} weather={weather} /> : null}

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
            <RouteSummary r={sel} title={result.tradeoffs.find((t) => t.route?.id === sel.id)?.label} />
            {planning ? <p className="m-0 text-sm text-muted" aria-live="polite">Updating…</p> : null}
          </section>

          <div className="grid gap-2">
            <Button variant="primary" size="lg" onClick={props.onStart}>
              Start
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => props.onAddNote(choices)} disabled={!choices.length}>
                <MessageSquarePlus aria-hidden className="size-5 shrink-0" /> Add a note
              </Button>
              <ShareButton to={to.name} minutes={sel.summary.minutes} />
            </div>
          </div>

          <div className="grid gap-1">
            <p className="m-0">{result.headline}</p>
            {result.door ? (
              <p className="m-0 flex items-start gap-1.5 text-sm text-muted">
                <DoorOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
                Takes you to {result.door.name ? `the ${result.door.name} entrance` : "an entrance"} that fits your settings ({result.door.detail}).
              </p>
            ) : null}
            {liveLine ? <p className={cn("m-0 text-sm", props.lifts.state === "failed" ? "text-caution" : "text-muted")}>{liveLine}</p> : null}
          </div>

          <Settings {...props} weather={weather} />

          <div className="grid gap-2">
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
                <ul className="m-0 grid list-none gap-1 p-0">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-muted">Nothing else to flag on this route.</p>
              )}
              <PeopleSay notes={routeNotes} all={notes} author={author} onDelete={props.onDeleteNote} onFlag={props.onFlagNote} title="Notes from people on this route" hint="Their own experience, not checked by us. Notes nudge your routes but never rule a street in or out." />
            </More>

            {others.length || tradeoffMessages.length ? (
              <More title="Other ways" aside={others.length ? `${others.length}` : undefined}>
                {others.length ? (
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {others.map((o) => (
                      <li key={o.r.id}>
                        <RouteCard r={o.r} title={o.title} onSelect={() => onSelect(o.r.id)} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {tradeoffMessages.map((t) => (
                  <p key={t.id} className="m-0 flex items-start gap-2 text-muted">
                    <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
                    {t.message}
                  </p>
                ))}
              </More>
            ) : null}

            <BusDepartures legs={sel.busLegs} live={props.liveBuses} />

            {sel.unknowns.length ? (
              <More title="What we don't know" aside={`${sel.unknowns.length} place${sel.unknowns.length === 1 ? "" : "s"}`}>
                <ul className="m-0 grid list-none gap-3 p-0">
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
                ) : props.lifts.state === "loading" ? (
                  <li>Checking lifts with TfL…</li>
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

/** Who and what ground: the two things that change every route. */
function Settings({ profile, onOpenMode, onConditions, weather }: Props & { weather: "dry" | "wet" | "ice" }) {
  return (
    // Sized to share one row on a 390 px phone; wraps at large text sizes rather than truncating.
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <Button onClick={onOpenMode} aria-label={`Routes are for ${profile.label}. Change`} className="h-auto min-w-0 max-w-full gap-1.5 px-2.5 py-2 text-left text-sm">
        <SlidersHorizontal aria-hidden className="size-4 shrink-0" /> <span>{profile.label}</span>
      </Button>
      <div role="radiogroup" aria-label="Ground" className="flex gap-0.5 rounded-full border border-line p-0.5">
        {(["dry", "wet", "ice"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={weather === k}
            onClick={() => onConditions(k)}
            className={cn("min-h-12 min-w-12 rounded-full px-2.5 text-sm", weather === k ? "bg-ink text-surface" : "text-ink")}
          >
            {k === "dry" ? "Dry" : k === "wet" ? "Wet" : "Icy"}
          </button>
        ))}
      </div>
    </div>
  );
}

const entranceName = (e: { name: string | null; verdict: { detail: string } }) => (e.name ? `${e.name} entrance` : `Entrance (${e.verdict.detail})`);

/** A section you open when you want it. The summary row says what's inside, so a closed section still informs. */
function More({ title, aside, icon, children }: { title: string; aside?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4">
        <span className="flex items-center gap-2 font-bold">
          {icon}
          {title}
        </span>
        <span className="flex items-center gap-2 text-sm text-muted">
          {aside}
          <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="grid gap-3 px-4 pb-4">{children}</div>
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

/** The chosen route, as a plain summary (not a control: other ways are under "Other ways"). */
function RouteSummary({ r, title }: { r: PlannedRoute; title?: string }) {
  const s = r.summary;
  const extras = [
    s.rides.length ? s.rides.map((x) => `${x.line.replace(/ towards .*/, "")} to ${x.to}`).join(", then ") : null,
    s.movableBridges.length ? `${s.movableBridges.map((b) => b.name).join(", ")} (moving bridge)` : null,
    s.lifts ? `${s.lifts} lift${s.lifts > 1 ? "s" : ""}` : null,
    s.steps ? `${s.steps} flight${s.steps > 1 ? "s" : ""} of steps` : null,
    (s.surfaceMix["setts"] ?? 0) > 20 ? `${s.surfaceMix["setts"]} m of setts` : null,
  ].filter(Boolean);
  return (
    <div className="grid gap-0.5 rounded-2xl border-2 border-accent bg-surface-2 px-4 py-3">
      <h3 className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 text-base">
        <span className="font-bold">{title ?? (r.label || "This way")}</span>
        {r.minutesExtra > 0 ? <span className="tabular text-sm font-normal text-muted">+{r.minutesExtra} min</span> : null}
      </h3>
      <span className="tabular font-mono text-[15px]">{meta(r)}</span>
      {extras.length ? <span className="text-sm text-muted">{extras.join(" / ")}</span> : null}
      <span className="text-sm">
        <Verdict r={r} />
      </span>
    </div>
  );
}

/** Another way there, one row: tap to make it the chosen route. */
function RouteCard({ r, onSelect, title }: { r: PlannedRoute; onSelect: () => void; title?: string }) {
  const s = r.summary;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-12 w-full flex-wrap items-center justify-between gap-x-3 rounded-2xl border border-line bg-surface px-4 py-2 text-left hover:border-ink"
    >
      <span className="font-bold whitespace-nowrap">
        <span className="sr-only">Switch to </span>
        {title ?? r.label}
      </span>
      <span className="tabular text-sm text-muted">
        {Math.round(s.minutes)} min{r.minutesExtra > 0 ? ` (+${r.minutesExtra})` : ""} / {s.verdict === "passable" ? "fits your limits" : `missing data for ${dist(s.unknownM)}`}
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
    <Button onClick={share} aria-label={copied ? "Copied" : "Share your arrival time"}>
      <Share2 aria-hidden className="size-5 shrink-0" /> <span aria-live="polite">{copied ? "Copied" : "Share"}</span>
    </Button>
  );
}
