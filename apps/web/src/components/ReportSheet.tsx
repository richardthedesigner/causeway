"use client";
import { useId, useState } from "react";
import { Camera, Check } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { REPORT_KINDS, saveReport, shrinkPhoto, whatsThereQuestions, type ReportKind } from "@/lib/reports";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  where: { lon: number; lat: number; accuracyM: number | null; label: string } | null;
  city: string;
  /**
   * "Report what's there" (FEAT-03): a street from "What we don't know" and the
   * things we lack for it. The sheet asks about those instead of what's wrong.
   */
  about?: { name: string; attrs: readonly { attr: string; detail: string }[] } | null;
  /** Reports are sent for triage when sharing is on (D-030). */
  sharing?: boolean;
  onSaved?: () => void;
}

/**
 * Two taps: what's wrong, then Save. A photo and a note are optional.
 * From "What we don't know" it asks what's there instead: one question for
 * each thing we lack, already tied to the street and the point on the route.
 */
export function ReportSheet({ open, onOpenChange, where, about, city, sharing, onSaved }: Props) {
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [done, setDone] = useState<"saved" | "failed" | null>(null);

  const reset = (v: boolean) => {
    if (!v) {
      setKind(null);
      setAnswers({});
      setNote("");
      setPhoto(null);
      setDone(null);
    }
    onOpenChange(v);
  };

  const questions = about ? whatsThereQuestions(about.attrs) : [];
  const answered = questions.filter((q) => answers[q.attr]);
  // With nothing we can ask about, the note is the answer.
  const ready = !!where && (about ? (questions.length ? answered.length > 0 : note.trim().length > 0) : !!kind);

  const send = () => {
    if (!ready || !where) return;
    const ok = saveReport({
      id: crypto.randomUUID(),
      kind: about ? "whats-there" : kind!,
      ...(about ? { about: { place: about.name, answers: answered.map((q) => ({ attr: q.attr, question: q.question, answer: answers[q.attr]! })) } } : {}),
      lon: where.lon,
      lat: where.lat,
      accuracyM: where.accuracyM,
      at: new Date().toISOString(),
      city,
      note: note.trim(),
      photo,
    });
    setDone(ok ? "saved" : "failed");
    if (ok) onSaved?.();
  };

  return (
    <Sheet open={open} onOpenChange={reset}>
      <SheetContent
        title={about ? "Report what's there" : "Report a problem"}
        description={where ? `${about ? "On" : "At"} ${where.label}. ${sharing ? "Sent to us to look into, never shown publicly." : "Saved on this phone for now."}` : "We need a location to save a report."}
      >
        {done === "saved" ? (
          <div className="grid gap-4" role="status">
            <p className="m-0 flex items-center gap-2 text-lg font-bold">
              <Check aria-hidden className="size-6 text-ok" /> Saved. Thank you.
            </p>
            <p className="m-0 text-muted">
              {sharing
                ? "We'll look into it. It goes to us, not on the map, and never includes your settings."
                : `It's kept on this phone, in Your data. When reports can be shared, yours will help the next person on this ${about ? "route" : "street"}.`}
            </p>
            <Button variant="primary" size="lg" onClick={() => reset(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="grid gap-5">
            {about ? (
              questions.length ? (
                questions.map((q) => (
                  <Choices key={q.attr} legend={q.question} hint={`${q.detail[0]!.toUpperCase()}${q.detail.slice(1)}.`} options={q.answers.map((a) => ({ value: a, label: a }))} value={answers[q.attr] ?? null} onChange={(v) => setAnswers((x) => ({ ...x, [q.attr]: v }))} />
                ))
              ) : (
                <p className="m-0">We don&apos;t have {about.attrs.map((a) => a.detail).join(", ") || "full data"} here. Tell us what you know in the note.</p>
              )
            ) : (
              <Choices legend="What's wrong?" options={REPORT_KINDS.map((k) => ({ value: k.kind, label: k.label }))} value={kind} onChange={(v) => setKind(v as ReportKind)} />
            )}
            <label className="grid gap-1">
              <span>{about && !questions.length ? "What's there?" : "Anything to add? (optional)"}</span>
              <textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-2xl border border-line bg-surface-2 p-3 text-base" />
            </label>
            <label className="flex min-h-12 cursor-pointer items-center gap-3">
              <Camera aria-hidden className="size-6" />
              <span>{photo ? "Photo added" : "Add a photo (optional)"}</span>
              <input
                id="report-photo"
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
            {done === "failed" ? (
              <p role="alert" className="m-0">
                Couldn&apos;t save on this phone (storage is full or blocked).
              </p>
            ) : null}
            <Button variant="primary" size="lg" disabled={!ready} onClick={send}>
              Save report
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** One question, as a group of buttons that act as radios. Two columns, or one when large text would clip the labels (STAB-12). */
function Choices({ legend, hint, options, value, onChange }: { legend: string; hint?: string; options: { value: string; label: string }[]; value: string | null; onChange: (v: string) => void }) {
  const hintId = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={hint ? "mb-1 text-base font-bold" : "mb-2 text-base font-bold"}>{legend}</legend>
      {hint ? (
        <p id={hintId} className="m-0 mb-2 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <div role="radiogroup" aria-label={legend} aria-describedby={hint ? hintId : undefined} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={value === o.value ? "min-h-14 min-w-0 rounded-2xl border border-ink bg-ink px-3 py-2 text-left text-surface [overflow-wrap:anywhere]" : "min-h-14 min-w-0 rounded-2xl border border-line px-3 py-2 text-left [overflow-wrap:anywhere]"}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
