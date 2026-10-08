"use client";
/**
 * Community reports (FEAT-35, D-084): add one in three taps (the button,
 * what you found, Save), and check other people's.
 */
import {
  Accessibility,
  Armchair,
  ArrowUpDown,
  Ban,
  Camera,
  ChartNoAxesColumnIncreasing,
  Check,
  CircleCheck,
  Construction,
  Flag,
  LocateFixed,
  MapPin,
  MoveHorizontal,
  MoveUpRight,
  Route,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  categoryInfo,
  COMMUNITY_CATEGORIES,
  evidence,
  LEVEL_LABEL,
  nearbyReports,
  REVIEW_MAX_CHARS,
  reportLevel,
  type CommunityCategory,
  type CommunityReport,
  type ReportLevel,
  type VoteKind,
} from "@causeway/graph";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { LocalCommunityReport } from "@/lib/community-store";
import { shrinkPhoto } from "@/lib/reports";
import type { FlagReason } from "@/lib/sync";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<CommunityCategory, LucideIcon> = {
  "no-dropped-kerb": Ban,
  steps: ChartNoAxesColumnIncreasing,
  "broken-lift": ArrowUpDown,
  "narrow-pavement": MoveHorizontal,
  "blocked-pavement": Construction,
  "rough-surface": Waves,
  steep: TrendingUp,
  "dropped-kerb": CircleCheck,
  ramp: MoveUpRight,
  "big-lift": ArrowUpDown,
  "smooth-pavement": Route,
  "accessible-toilet": Accessibility,
  seat: Armchair,
};

/** Where a new report goes, and how we know. */
export interface Draft {
  lon: number;
  lat: number;
  /** "here": the phone's position. "moved": put there by hand. "guess": we couldn't ask the phone, so the map's centre. */
  how: "here" | "moved" | "guess";
  accuracyM?: number | null;
}

const whereText = (d: Draft) =>
  d.how === "here" ? `Your location${d.accuracyM ? `, to about ${Math.round(d.accuracyM)} m` : ""}` : d.how === "moved" ? "Where you put the pin" : "The middle of the map. Move the pin to the spot";

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 60) return `${d} days ago`;
  const m = Math.round(d / 30);
  return m < 24 ? `${m} months ago` : `${Math.round(d / 365)} years ago`;
};

// ---------------------------------------------------------------- add

interface AddProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: Draft | null;
  city: string;
  sharing: boolean;
  /** Everyone's reports, to offer "agree with it" rather than a copy. */
  reports: readonly CommunityReport[];
  onMovePin: () => void;
  onSave: (r: LocalCommunityReport) => boolean;
  /** Open an existing report instead (to agree with it). */
  onOpenReport: (id: string) => void;
}

/** The fewest taps: what you found, then Save. Where defaults to your location; a review and a photo are optional. */
export function CommunityAddSheet({ open, onOpenChange, draft, city, sharing, reports, onMovePin, onSave, onOpenReport }: AddProps) {
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [done, setDone] = useState<"saved" | "failed" | null>(null);
  const countId = useId();

  const reset = (v: boolean) => {
    if (!v) {
      setCategory(null);
      setText("");
      setPhoto(null);
      setDone(null);
    }
    onOpenChange(v);
  };
  const same = draft && category ? nearbyReports(reports, draft.lon, draft.lat, category).filter((r) => !r.own) : [];
  const save = () => {
    if (!draft || !category) return;
    const ok = onSave({
      id: crypto.randomUUID(),
      city,
      category,
      lon: draft.lon,
      lat: draft.lat,
      text: text.trim() || null,
      photo,
      at: new Date().toISOString(),
      votes: [],
      own: true,
    });
    setDone(ok ? "saved" : "failed");
  };
  const groups: { title: string; polarity: "bad" | "good" }[] = [
    { title: "A problem", polarity: "bad" },
    { title: "Good for access", polarity: "good" },
  ];

  return (
    <Sheet open={open} onOpenChange={reset}>
      <SheetContent title="Add a report" description={sharing ? "Tag what helps or gets in the way, so routes and other people know." : "Tag what helps or gets in the way. Kept on this phone until sharing is switched on."}>
        {done === "saved" ? (
          <div className="grid gap-4" role="status">
            <p className="m-0 flex items-center gap-2 text-lg font-bold">
              <Check aria-hidden className="size-6 text-ok" /> Saved. Thank you.
            </p>
            <p className="m-0">
              {sharing
                ? "It's on the map now. Your routes take it into account at once. Other people's routes only change once two more people agree, so one report can't close a street."
                : "It's on your map and your routes take it into account. It stays on this phone until reports can be shared."}
            </p>
            <Button variant="primary" size="lg" onClick={() => reset(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <MapPin aria-hidden className="size-6 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-muted">Where</span>
                <span className="block font-bold">{draft ? whereText(draft) : "Finding your location…"}</span>
              </span>
              <Button id="community-move-pin" onClick={onMovePin} disabled={!draft}>
                Move the pin
              </Button>
            </div>
            {groups.map((g) => (
              <fieldset key={g.polarity} className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-2 flex items-center gap-2 text-base font-bold">
                  {g.polarity === "bad" ? <TriangleAlert aria-hidden className="size-5 text-stop" /> : <CircleCheck aria-hidden className="size-5 text-ok" />}
                  {g.title}
                </legend>
                <div role="radiogroup" aria-label={g.title} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2">
                  {COMMUNITY_CATEGORIES.filter((c) => c.polarity === g.polarity).map((c) => {
                    const Icon = CATEGORY_ICON[c.id];
                    const on = category === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        data-category={c.id}
                        onClick={() => setCategory(c.id)}
                        className={cn("flex min-h-14 min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left [overflow-wrap:anywhere]", on ? "border-ink bg-ink text-surface" : "border-line")}
                      >
                        <Icon aria-hidden className="size-5 shrink-0" />
                        <span className="min-w-0">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {same.length ? (
              <div role="note" className="grid gap-2 rounded-2xl border border-line p-3">
                <p className="m-0">Someone has already reported this here. Agreeing with theirs counts for more than a second copy.</p>
                <Button
                  onClick={() => {
                    reset(false);
                    onOpenReport(same[0]!.id);
                  }}
                >
                  See it and agree
                </Button>
              </div>
            ) : null}
            <details className="rounded-2xl border border-line">
              <summary className="min-h-12 cursor-pointer px-3 py-3 font-bold">Add a short review or a photo (optional)</summary>
              <div className="grid gap-4 px-3 pb-3">
                <label className="grid gap-1">
                  <span>Your review</span>
                  <textarea
                    id="community-text"
                    value={text}
                    maxLength={REVIEW_MAX_CHARS}
                    aria-describedby={countId}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    className="rounded-2xl border border-line bg-surface-2 p-3 text-base"
                  />
                  <span id={countId} className="text-sm text-muted">
                    {REVIEW_MAX_CHARS - text.length} characters left. Please don&apos;t name or describe people.
                  </span>
                </label>
                <label className="flex min-h-12 cursor-pointer items-center gap-3">
                  <Camera aria-hidden className="size-6" />
                  <span>{photo ? "Photo added" : "Add a photo"}</span>
                  <input
                    id="community-photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setPhoto(await shrinkPhoto(f));
                    }}
                  />
                </label>
                <p className="m-0 text-sm text-muted">Photos are made small and lose their location and camera details on this phone. A person checks each one for faces and number plates before anyone else sees it.</p>
              </div>
            </details>
            {done === "failed" ? (
              <p role="alert" className="m-0">
                Couldn&apos;t save on this phone (storage is full or blocked).
              </p>
            ) : null}
            <Button id="community-save" variant="primary" size="lg" disabled={!draft || !category} onClick={save}>
              {category ? `Save: ${categoryInfo(category).label}` : "Choose what you found"}
            </Button>
            <p className="m-0 text-sm text-muted">
              Others see what you found, your words and the place to about 10 metres. Never who you are, and never your settings.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** While moving the pin: a bar over the sheet with big targets, and the pin itself takes arrow keys. */
export function PlacingBar({ onHere, onDone, locating }: { onHere: () => void; onDone: () => void; locating: boolean }) {
  // Drawn at the end of the page: inside the map's layer, the bottom sheet would sit on top of it.
  return createPortal(
    <div role="region" aria-label="Move the report pin" className="fixed inset-x-0 bottom-0 z-[55] grid gap-3 rounded-t-[var(--radius)] border-t border-line bg-surface p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_30px_rgb(0_0_0/0.16)] md:left-4 md:right-auto md:bottom-4 md:w-[420px] md:rounded-[var(--radius)] md:border">
      <p className="m-0 font-bold">Drag the pin onto the spot, or tap the map. With a keyboard, the pin moves with the arrow keys.</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2">
        <Button size="lg" onClick={onHere}>
          <LocateFixed aria-hidden className={cn("size-5", locating && "animate-pulse")} /> My location
        </Button>
        <Button id="community-pin-done" variant="primary" size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- detail

const MEANS: Record<ReportLevel, { bad: string; good: string }> = {
  confirmed: { bad: "Confirmed: routes for anyone it stops now go round it.", good: "Confirmed: routes count on it." },
  reported: { bad: "Routes warn about it and lean away a little. Once more people confirm it, routes for anyone it stops go round it.", good: "Routes don't count on it until more people confirm it." },
  disputed: { bad: "People disagree about this, so routes ignore it for now.", good: "People disagree about this, so routes ignore it for now." },
  faded: { bad: "Nobody has checked this lately, so routes ignore it.", good: "Nobody has checked this lately, so routes ignore it." },
};

interface DetailProps {
  report: CommunityReport | null;
  onOpenChange: (v: boolean) => void;
  sharing: boolean;
  onVote: (id: string, kind: VoteKind) => void;
  onFlag: (id: string, reason: FlagReason) => Promise<boolean>;
  onDelete: (id: string) => void;
}

export function CommunityDetailSheet({ report, onOpenChange, sharing, onVote, onFlag, onDelete }: DetailProps) {
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState<"done" | "failed" | null>(null);
  if (!report) return null;
  const info = categoryInfo(report.category);
  const e = evidence(report);
  const level = reportLevel(e);
  const yes = 1 + report.votes.filter((v) => v.kind === "agree" || v.kind === "still-there").length;
  const no = report.votes.length + 1 - yes;
  const Icon = CATEGORY_ICON[report.category];
  const pct = Math.floor(e.confidence * 100);
  const canVote = sharing && !report.own && report.shared !== false;
  const vote = (k: VoteKind) => onVote(report.id, k);
  const close = (v: boolean) => {
    if (!v) {
      setFlagging(false);
      setFlagged(null);
    }
    onOpenChange(v);
  };
  const choice = (k: VoteKind, label: string, Glyph: LucideIcon) => (
    <Button size="lg" aria-pressed={report.myVote === k} onClick={() => vote(k)} className={cn(report.myVote === k && "border-ink bg-ink text-surface")}>
      <Glyph aria-hidden className="size-5" /> {label}
    </Button>
  );

  return (
    <Sheet open onOpenChange={close}>
      <SheetContent title={info.label} description={`${info.polarity === "bad" ? "A problem" : "Good for access"}, reported by people. Not checked by us.`}>
        <div className="grid gap-5">
          <div className="grid gap-2 rounded-2xl bg-surface-2 p-3">
            <p className="m-0 flex items-center gap-2 font-bold">
              <Icon aria-hidden className={cn("size-6", info.polarity === "bad" ? "text-stop" : "text-ok")} />
              <span id="community-level">{LEVEL_LABEL[level]}</span>
            </p>
            <p className="m-0">
              {yes === 1 ? "1 person says it's there" : `${yes} people say it's there`}
              {no ? `, ${no === 1 ? "1 says" : `${no} say`} it isn't` : ""}. Last seen {ago(e.lastSeen)}.
            </p>
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                <span className={cn("block h-full rounded-full", level === "confirmed" ? "bg-ok" : level === "reported" ? "bg-accent" : "bg-muted")} style={{ width: `${pct}%` }} />
              </span>
              <span className="tabular text-sm">How sure: {pct}%</span>
            </div>
            <p className="m-0 text-sm">{MEANS[level][info.polarity]}</p>
          </div>
          {report.text ? <blockquote className="m-0 border-l-4 border-line pl-3">“{report.text}”</blockquote> : null}
          {report.photo ? <img src={report.photo} alt={`Photo with the report: ${info.label}`} className="max-h-64 w-full rounded-2xl object-cover" /> : null}
          {canVote ? (
            <div className="grid gap-4">
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-2 font-bold">Is this right?</legend>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
                  {choice("agree", "Agree", ThumbsUp)}
                  {choice("disagree", "Disagree", ThumbsDown)}
                </div>
              </fieldset>
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-2 font-bold">{info.question}</legend>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
                  {choice("still-there", "Yes, still there", Check)}
                  {choice("gone", "No, it's gone", Ban)}
                </div>
              </fieldset>
              {report.myVote ? (
                <p role="status" className="m-0 text-sm">
                  Thanks. Your answer counts now, and you can change it.
                </p>
              ) : null}
            </div>
          ) : report.own ? (
            <div className="grid gap-2">
              <p className="m-0">You reported this{report.shared ? "" : ". It's on this phone only"}.</p>
              <Button
                onClick={() => {
                  onDelete(report.id);
                  close(false);
                }}
              >
                <Trash2 aria-hidden className="size-5" /> Delete my report
              </Button>
            </div>
          ) : (
            <p className="m-0 text-muted">Agreeing and disagreeing need sharing, which isn&apos;t switched on yet.</p>
          )}
          {sharing && !report.own ? (
            flagged === "done" ? (
              <p role="status" className="m-0">
                Thanks. Two reports like yours hide it until someone checks.
              </p>
            ) : flagging ? (
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-2 font-bold">What&apos;s wrong with it?</legend>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
                  {(
                    [
                      ["wrong", "It's made up"],
                      ["unkind", "It's unkind"],
                      ["personal", "It's about a person, or shows a face or number plate"],
                      ["other", "Something else"],
                    ] as [FlagReason, string][]
                  ).map(([r, l]) => (
                    <Button key={r} className="h-auto py-2 text-left" onClick={async () => setFlagged((await onFlag(report.id, r)) ? "done" : "failed")}>
                      {l}
                    </Button>
                  ))}
                </div>
                {flagged === "failed" ? (
                  <p role="alert" className="m-0 mt-2">
                    Couldn&apos;t send that just now. Try again when you have signal.
                  </p>
                ) : null}
              </fieldset>
            ) : (
              <Button variant="ghost" onClick={() => setFlagging(true)}>
                <Flag aria-hidden className="size-5" /> Report this report
              </Button>
            )
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
