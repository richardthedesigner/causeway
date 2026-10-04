/**
 * Notes about places and pavements, kept on this device until there is a
 * backend (D-022, D-026). The shape is `UserNote` from @causeway/graph and
 * maps one to one onto the `note` table in db/migrations/0002_notes.sql.
 * No profile data is ever stored with a note; the mobility label is opt-in
 * per note.
 */
import type { UserNote } from "@causeway/graph";
import { loadStored, readList, saveStored, type StoredVersion } from "./stored";

/** A note on this device. `sharedAt` is set once the server has it (only when sharing is on, D-030). */
export type LocalNote = UserNote & { sharedAt?: string };

const KEY = "causewayside.notes.v1";
const AUTHOR_KEY = "causewayside.author.v1";

/** Newest shape first (STAB-03). Anything unreadable is backed up before it can be overwritten. */
const VERSIONS: StoredVersion<LocalNote[]>[] = [
  { key: KEY, read: (json, dropped) => readList(json, dropped, (x) => (x && typeof (x as LocalNote).id === "string" ? (x as LocalNote) : null)) },
];

export function loadNotes(): LocalNote[] {
  return loadStored(VERSIONS)?.value ?? [];
}

export function saveNote(n: LocalNote): boolean {
  return saveStored(KEY, [n, ...loadNotes().filter((o) => o.id !== n.id)].slice(0, 200));
}

export function markShared(id: string): void {
  const n = loadNotes().find((o) => o.id === id);
  if (n) saveNote({ ...n, sharedAt: new Date().toISOString() });
}

export function deleteNote(id: string): boolean {
  return saveStored(KEY, loadNotes().filter((o) => o.id !== id));
}

/**
 * A random id for this device, so corroboration counts different people
 * and you can tell your own notes. It is not linked to anything else.
 */
export function deviceAuthor(): string {
  try {
    const cur = localStorage.getItem(AUTHOR_KEY);
    if (cur) return cur;
    const id = crypto.randomUUID();
    localStorage.setItem(AUTHOR_KEY, id);
    return id;
  } catch {
    return "this-device";
  }
}
