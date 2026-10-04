"use client";
import { Frown, Meh, Smile } from "lucide-react";
import { corroborations, noteAttribution, noteConfidence, type UserNote } from "@causeway/graph";
import { cn } from "@/lib/utils";

const ICON = { good: Smile, mixed: Meh, bad: Frown } as const;
const WORD = { good: "Good", mixed: "Mixed", bad: "Bad" } as const;
const TONE = { good: "text-ok", mixed: "text-caution", bad: "text-stop" } as const;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * People's notes, most trusted first. Always with the date and who (by
 * label only), and never presented as checked: the words are theirs.
 */
export function NoteList({ notes, all, author, onDelete, className }: { notes: UserNote[]; all: UserNote[]; author: string; onDelete?: (id: string) => void; className?: string }) {
  if (!notes.length) return null;
  const now = new Date();
  const ranked = notes
    .map((n) => ({ n, conf: noteConfidence(n, all, now), agree: corroborations(n, all) }))
    .sort((a, b) => b.conf - a.conf || b.n.at.localeCompare(a.n.at));
  return (
    <ul className={cn("m-0 grid list-none gap-3 p-0", className)}>
      {ranked.map(({ n, agree }) => {
        const Icon = ICON[n.sentiment];
        const own = n.author === author;
        const old = now.getTime() - Date.parse(n.at) > 365 * 86_400_000;
        return (
          <li key={n.id} className="grid gap-0.5">
            <span className="flex items-start gap-2">
              <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", TONE[n.sentiment])} />
              <span>
                <span className="font-bold">{WORD[n.sentiment]}: </span>
                &ldquo;{n.text}&rdquo;
              </span>
            </span>
            <span className="pl-7 text-sm text-muted">
              {day(n.at)}
              {n.ground ? ` / ${n.ground === "wet" ? "Wet ground" : "Dry ground"}` : ""} / {noteAttribution(n, own)}
              {agree ? ` / ${agree} ${agree === 1 ? "other person" : "others"} said the same` : ""}
              {old ? " / Over a year old, things may have changed" : ""}
            </span>
            {n.photo ? <img src={n.photo} alt={`Photo with the note about ${n.target.name}`} className="ml-7 max-h-40 w-auto max-w-[calc(100%-1.75rem)] rounded-xl" /> : null}
            {own && onDelete ? (
              <button type="button" onClick={() => onDelete(n.id)} className="ml-5 min-h-12 justify-self-start px-2 text-sm text-muted underline">
                Delete my note<span className="sr-only"> about {n.target.name}</span>
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
