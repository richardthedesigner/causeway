"use client";
import { Star } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { LABEL_MAX, type SavedPlace } from "@/lib/saved-places";

/** Save the destination as home, work or a name of your own (FEAT-04). Kept on this phone. */
export function SavePlace({ saved, onSave, onRemove }: { saved: SavedPlace | undefined; onSave: (label: string) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const id = useId();
  const save = (label: string) => {
    onSave(label);
    setOpen(false);
    setName("");
  };

  if (saved && !open)
    return (
      <div className="flex flex-wrap items-center gap-x-3 px-1 text-sm">
        <span className="flex items-center gap-1.5">
          <Star aria-hidden className="size-4 fill-current text-accent" />
          Saved as <span className="font-bold">{saved.label}</span>
        </span>
        <button type="button" onClick={() => setOpen(true)} className="min-h-10 font-bold text-accent">
          Rename
        </button>
        <button type="button" onClick={onRemove} className="min-h-10 font-bold text-accent">
          Remove
        </button>
      </div>
    );

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-10 items-center gap-1.5 self-start px-1 text-sm font-bold text-accent">
        <Star aria-hidden className="size-4" /> Save this place
      </button>
    );

  return (
    <form
      className="grid gap-2 rounded-2xl bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) save(name);
      }}
    >
      <p className="m-0 text-sm">Kept on this phone only.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => save("Home")}>
          Home
        </Button>
        <Button type="button" variant="secondary" onClick={() => save("Work")}>
          Work
        </Button>
      </div>
      <label htmlFor={id} className="text-sm font-bold">
        Or give it a name
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          value={name}
          maxLength={LABEL_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder="Like Mum's"
          autoComplete="off"
          className="min-h-12 min-w-0 flex-1 basis-40 rounded-xl border-2 border-line bg-surface px-3 text-base"
        />
        <Button type="submit" disabled={!name.trim()}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
