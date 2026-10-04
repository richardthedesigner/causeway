"use client";
import { useState } from "react";
import { Camera, Check, Frown, Meh, Smile } from "lucide-react";
import { mobilityLabelFor, noteAttribution, NOTE_MAX_CHARS, NOTE_SENTIMENTS, noteProblem, type NoteSentiment, type NoteTarget, type UserNote } from "@causeway/graph";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { deviceAuthor, saveNote } from "@/lib/notes-store";
import { shrinkPhoto } from "@/lib/reports";

export interface NoteAbout {
  target: NoteTarget;
  lon: number;
  lat: number;
}

interface Props {
  about: NoteAbout | null;
  onOpenChange: (v: boolean) => void;
  city: string;
  /** The profile preset id. Only its coarse label is ever offered, and only if the person switches it on. */
  preset: string;
  onSaved: (n: UserNote) => void;
}

const ICON = { good: Smile, mixed: Meh, bad: Frown } as const;

/** Three taps plus typing: open, how was it, Save. A photo and how you get around are optional. */
export function NoteSheet({ about, onOpenChange, city, preset, onSaved }: Props) {
  const [sentiment, setSentiment] = useState<NoteSentiment | null>(null);
  const [text, setText] = useState("");
  const [shareMobility, setShareMobility] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [done, setDone] = useState<"saved" | "failed" | null>(null);
  const label = mobilityLabelFor(preset);

  const reset = (v: boolean) => {
    if (!v) {
      setSentiment(null);
      setText("");
      setShareMobility(false);
      setPhoto(null);
      setDone(null);
    }
    onOpenChange(v);
  };

  const ready = !!about && !!sentiment && noteProblem({ text, sentiment, mobility: null }) === null;

  const save = () => {
    if (!about || !sentiment || !ready) return;
    const n: UserNote = {
      id: crypto.randomUUID(),
      author: deviceAuthor(),
      city,
      target: about.target,
      lon: about.lon,
      lat: about.lat,
      sentiment,
      text: text.trim(),
      photo,
      at: new Date().toISOString(),
      mobility: shareMobility ? label : null,
    };
    const ok = saveNote(n);
    setDone(ok ? "saved" : "failed");
    if (ok) onSaved(n);
  };

  const where = about?.target.name ?? "";
  return (
    <Sheet open={about !== null} onOpenChange={reset}>
      <SheetContent title="Add a note" description={about ? `About ${where}. Saved on this phone for now.` : undefined}>
        {done === "saved" ? (
          <div className="grid gap-4" role="status">
            <p className="m-0 flex items-center gap-2 text-lg font-bold">
              <Check aria-hidden className="size-6 text-ok" /> Saved. Thank you.
            </p>
            <p className="m-0 text-muted">
              It&apos;s kept on this phone and already shapes your own routes. When notes can be shared, others will see it from &ldquo;a Causewayside user&rdquo;, with the date.
            </p>
            <Button variant="primary" size="lg" onClick={() => reset(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-base font-bold">How was it?</legend>
              <div role="radiogroup" aria-label="How was it?" className="grid grid-cols-3 gap-2">
                {NOTE_SENTIMENTS.map((s) => {
                  const Icon = ICON[s.sentiment];
                  const on = sentiment === s.sentiment;
                  return (
                    <button
                      key={s.sentiment}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSentiment(s.sentiment)}
                      className={
                        on
                          ? "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-ink bg-ink px-2 text-surface"
                          : "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-line px-2"
                      }
                    >
                      <Icon aria-hidden className="size-6" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="grid gap-1">
              <span className="font-bold">What should people know?</span>
              <span id="note-hint" className="text-sm text-muted">
                For example: step-free side entrance, the door is heavy, setts are slippery when wet.
              </span>
              <textarea
                id="note-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={NOTE_MAX_CHARS}
                rows={3}
                aria-describedby="note-hint note-count"
                className="rounded-2xl border border-line bg-surface-2 p-3 text-base"
              />
              <span id="note-count" className="text-right text-sm text-muted">
                {text.length} of {NOTE_MAX_CHARS}
              </span>
            </label>
            <div className="grid gap-1">
              <label htmlFor="note-mobility" className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
                <span>Show how I get around</span>
                <Switch id="note-mobility" checked={shareMobility} onCheckedChange={setShareMobility} aria-describedby="note-mobility-hint" />
              </label>
              <span id="note-mobility-hint" className="text-sm text-muted">
                {shareMobility ? `Shown as \u201c${noteAttribution({ mobility: label })}\u201d.` : "Shown as \u201ca Causewayside user\u201d."} Only these words go with the note, never your settings.
              </span>
            </div>
            <label className="flex min-h-12 cursor-pointer items-center gap-3">
              <Camera aria-hidden className="size-6" />
              <span>{photo ? "Photo added" : "Add a photo (optional)"}</span>
              <input
                id="note-photo"
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
            <Button variant="primary" size="lg" disabled={!ready} onClick={save}>
              Save note
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
