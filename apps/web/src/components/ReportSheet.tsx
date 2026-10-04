"use client";
import { useState } from "react";
import { Camera, Check } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { REPORT_KINDS, saveReport, shrinkPhoto, type ReportKind } from "@/lib/reports";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  where: { lon: number; lat: number; accuracyM: number | null; label: string } | null;
  city: string;
  /** Reports are sent for triage when sharing is on (D-028). */
  sharing?: boolean;
  onSaved?: () => void;
}

/** Two taps: what's wrong, then Save. A photo and a note are optional. */
export function ReportSheet({ open, onOpenChange, where, city, sharing, onSaved }: Props) {
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [done, setDone] = useState<"saved" | "failed" | null>(null);

  const reset = (v: boolean) => {
    if (!v) {
      setKind(null);
      setNote("");
      setPhoto(null);
      setDone(null);
    }
    onOpenChange(v);
  };

  const send = () => {
    if (!kind || !where) return;
    const ok = saveReport({ id: crypto.randomUUID(), kind, lon: where.lon, lat: where.lat, accuracyM: where.accuracyM, at: new Date().toISOString(), city, note: note.trim(), photo });
    setDone(ok ? "saved" : "failed");
    if (ok) onSaved?.();
  };

  return (
    <Sheet open={open} onOpenChange={reset}>
      <SheetContent title="Report a problem" description={where ? `At ${where.label}. ${sharing ? "Sent to us to look into, never shown publicly." : "Saved on this phone for now."}` : "We need a location to save a report."}>
        {done === "saved" ? (
          <div className="grid gap-4" role="status">
            <p className="m-0 flex items-center gap-2 text-lg font-bold">
              <Check aria-hidden className="size-6 text-ok" /> Saved. Thank you.
            </p>
            <p className="m-0 text-muted">
              {sharing ? "We'll look into it. It goes to us, not on the map, and never includes your settings." : "It's kept on this phone. When reports can be shared, yours will help the next person on this street."}
            </p>
            <Button variant="primary" size="lg" onClick={() => reset(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-base font-bold">What&apos;s wrong?</legend>
              <div role="radiogroup" aria-label="What's wrong?" className="grid grid-cols-2 gap-2">
                {REPORT_KINDS.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    role="radio"
                    aria-checked={kind === k.kind}
                    onClick={() => setKind(k.kind)}
                    className={kind === k.kind ? "min-h-14 rounded-2xl border border-ink bg-ink px-3 text-left text-surface" : "min-h-14 rounded-2xl border border-line px-3 text-left"}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-1">
              <span>Anything to add? (optional)</span>
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
            <Button variant="primary" size="lg" disabled={!kind || !where} onClick={send}>
              Save report
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
