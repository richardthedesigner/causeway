"use client";
import { Frown, Meh, Smile } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { REPORT_KINDS } from "@/lib/reports";
import {
  amReviewer,
  approvePhoto,
  flaggedNotes,
  newReports,
  pendingPhotos,
  rejectPhoto,
  reviewAvailable,
  sendCode,
  setNoteStatus,
  setReportStatus,
  signedInEmail,
  signOut,
  verifyCode,
  type FlaggedNote,
  type NewReport,
  type PendingPhoto,
} from "@/lib/review";

const day = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const ICON = { good: Smile, mixed: Meh, bad: Frown } as const;
const REASON: Record<string, string> = { wrong: "wrong", unkind: "unkind", personal: "about a person", other: "other" };
const AREA: Record<string, string> = { edinburgh: "Edinburgh", newcastle: "Newcastle", london: "London" };
const area = (id: string | null) => (id ? (AREA[id] ?? id) : null);
const KIND = Object.fromEntries(REPORT_KINDS.map((k) => [k.kind, k.label])) as Record<string, string>;

type Stage = "loading" | "signed-out" | "code-sent" | "not-reviewer" | "ready";

/**
 * Weekly upkeep for shared notes (D-030): flagged notes, photos waiting for
 * a look, and new problem reports. One decision per item; every decision is
 * logged by the database with who made it.
 */
export default function Review() {
  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [notes, setNotes] = useState<FlaggedNote[]>([]);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [reports, setReports] = useState<NewReport[]>([]);

  const refresh = useCallback(async () => {
    try {
      if (!(await amReviewer())) return setStage("not-reviewer");
      const [n, p, r] = await Promise.all([flaggedNotes(), pendingPhotos(), newReports()]);
      setNotes(n);
      setPhotos(p);
      setReports(r);
      setStage("ready");
    } catch {
      setStage("signed-out");
    }
  }, []);

  useEffect(() => {
    if (!reviewAvailable) return;
    if (signedInEmail()) void refresh();
    else setStage("signed-out");
  }, [refresh]);

  /** Run one decision, drop the item from its list, and say what happened. */
  const decide = async (what: string, act: () => Promise<unknown>, drop: () => void) => {
    setError(null);
    try {
      await act();
      drop();
      setSaid(what);
    } catch {
      setError("That didn't save. Check your connection and try again.");
    }
  };

  if (!reviewAvailable)
    return (
      <Shell>
        <p className="m-0">Sharing isn&apos;t switched on for this build, so there&apos;s nothing to review. See docs/BACKEND.md.</p>
      </Shell>
    );

  if (stage === "loading") return <Shell><p className="m-0 text-muted" aria-live="polite">Checking…</p></Shell>;

  if (stage === "signed-out" || stage === "code-sent")
    return (
      <Shell>
        <form
          className="grid max-w-sm gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (stage === "signed-out") {
              if (await sendCode(email.trim())) setStage("code-sent");
              else setError("Couldn't send a code. Reviewers need an account set up by the project owner.");
            } else if (await verifyCode(email.trim(), code)) {
              setStage("loading");
              await refresh();
            } else setError("That code didn't work. Codes expire after an hour.");
          }}
        >
          <p className="m-0">Sign in with the email address you were invited with. We&apos;ll send a code.</p>
          <label className="grid gap-1">
            <span className="font-bold">Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={stage === "code-sent"} className="min-h-12 rounded-2xl border border-line bg-surface-2 px-4 text-base" />
          </label>
          {stage === "code-sent" ? (
            <label className="grid gap-1">
              <span className="font-bold">Code from the email</span>
              <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} className="min-h-12 rounded-2xl border border-line bg-surface-2 px-4 text-base tracking-widest" />
            </label>
          ) : null}
          {error ? <p role="alert" className="m-0 text-stop">{error}</p> : null}
          <Button variant="primary" size="lg" type="submit">
            {stage === "signed-out" ? "Send me a code" : "Sign in"}
          </Button>
        </form>
      </Shell>
    );

  if (stage === "not-reviewer")
    return (
      <Shell>
        <p className="m-0">You&apos;re signed in as {signedInEmail()}, but this account isn&apos;t a reviewer. Ask the project owner to add you.</p>
        <Button onClick={() => { signOut(); setStage("signed-out"); }}>Sign out</Button>
      </Shell>
    );

  const empty = !notes.length && !photos.length && !reports.length;
  return (
    <Shell
      aside={
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {signedInEmail()}
          <Button variant="ghost" onClick={() => { signOut(); setStage("signed-out"); }}>Sign out</Button>
        </span>
      }
    >
      <p className="m-0 min-h-6 text-muted" role="status">{said}</p>
      {error ? <p role="alert" className="m-0 text-stop">{error}</p> : null}
      {empty ? <p className="m-0 text-lg">Nothing waiting. Thank you.</p> : null}

      <Section title="Flagged notes" count={notes.length} hint="Hidden because two people flagged them. Put back what's fair; take down what's wrong, unkind or about a person.">
        {notes.map((n) => {
          const Icon = ICON[n.sentiment];
          return (
            <Item key={n.id}>
              <p className="m-0 flex items-start gap-2">
                <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
                <span>
                  <span className="font-bold">{n.target_name}: </span>&ldquo;{n.body}&rdquo;
                </span>
              </p>
              <p className="m-0 text-sm text-muted">
                {day(n.observed_at)} / {area(n.area_id)} / flagged as {[...new Set(n.note_flag.map((f) => REASON[f.reason] ?? f.reason))].join(" and ")}
              </p>
              <Actions>
                <Button onClick={() => decide(`Put back: note about ${n.target_name}.`, () => setNoteStatus(n.id, "visible"), () => setNotes((x) => x.filter((y) => y.id !== n.id)))}>Put back</Button>
                <Button onClick={() => decide(`Taken down: note about ${n.target_name}.`, () => setNoteStatus(n.id, "removed"), () => setNotes((x) => x.filter((y) => y.id !== n.id)))}>Take down</Button>
              </Actions>
            </Item>
          );
        })}
      </Section>

      <Section title="Photos" count={photos.length} hint="Nobody else sees these until you approve them. Reject any with a face or a number plate.">
        {photos.map((p) => (
          <Item key={p.id}>
            {p.url ? <img src={p.url} alt={`Photo with a note about ${p.target_name}`} className="max-h-72 w-auto max-w-full rounded-xl" /> : <p className="m-0 text-muted">Couldn&apos;t load this photo.</p>}
            <p className="m-0">
              <span className="font-bold">{p.target_name}: </span>&ldquo;{p.body}&rdquo;
            </p>
            <p className="m-0 text-sm text-muted">{day(p.observed_at)}</p>
            <Actions>
              <Button disabled={!p.url} onClick={() => decide(`Approved: photo about ${p.target_name}.`, () => approvePhoto(p), () => setPhotos((x) => x.filter((y) => y.id !== p.id)))}>Approve</Button>
              <Button onClick={() => decide(`Rejected: photo about ${p.target_name}.`, () => rejectPhoto(p.id), () => setPhotos((x) => x.filter((y) => y.id !== p.id)))}>Reject</Button>
            </Actions>
          </Item>
        ))}
      </Section>

      <Section title="Reports" count={reports.length} hint="Problems people hit. Triaged means someone is on it; pass council matters on.">
        {reports.map((r) => {
          const [lon, lat] = r.geom?.coordinates ?? [];
          return (
            <Item key={r.id}>
              <p className="m-0 font-bold">{KIND[r.kind] ?? r.kind}</p>
              {r.detail ? <p className="m-0">&ldquo;{r.detail}&rdquo;</p> : null}
              <p className="m-0 text-sm text-muted">
                {day(r.created_at)}
                {r.area_id ? ` / ${area(r.area_id)}` : ""}
                {lat !== undefined ? (
                  <>
                    {" / "}
                    <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`} target="_blank" rel="noreferrer" className="underline">
                      See on a map<span className="sr-only"> (opens OpenStreetMap)</span>
                    </a>
                  </>
                ) : null}
              </p>
              <Actions>
                <Button onClick={() => decide(`Triaged: ${KIND[r.kind] ?? r.kind}.`, () => setReportStatus(r.id, "triaged"), () => setReports((x) => x.filter((y) => y.id !== r.id)))}>Triaged</Button>
                <Button onClick={() => decide(`Marked fixed: ${KIND[r.kind] ?? r.kind}.`, () => setReportStatus(r.id, "fixed"), () => setReports((x) => x.filter((y) => y.id !== r.id)))}>Fixed</Button>
                <Button variant="ghost" onClick={() => decide(`Rejected: ${KIND[r.kind] ?? r.kind}.`, () => setReportStatus(r.id, "rejected"), () => setReports((x) => x.filter((y) => y.id !== r.id)))}>Not a problem</Button>
              </Actions>
            </Item>
          );
        })}
      </Section>
    </Shell>
  );
}

function Shell({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl content-start gap-6 bg-surface px-4 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="m-0 text-2xl font-bold">Review</h1>
        {aside}
      </header>
      {children}
    </main>
  );
}

function Section({ title, count, hint, children }: { title: string; count: number; hint: string; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <section aria-labelledby={`h-${title}`} className="grid gap-3">
      <h2 id={`h-${title}`} className="m-0 text-lg font-bold">
        {title} <span className="font-normal text-muted">({count})</span>
      </h2>
      <p className="m-0 text-sm text-muted">{hint}</p>
      <ul className="m-0 grid list-none gap-3 p-0">{children}</ul>
    </section>
  );
}

const Item = ({ children }: { children: React.ReactNode }) => <li className="grid gap-2 rounded-2xl border border-line p-4">{children}</li>;
const Actions = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap gap-2">{children}</div>;
