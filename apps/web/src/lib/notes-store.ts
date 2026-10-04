/**
 * Notes about places and pavements, kept on this device until there is a
 * backend (D-022, D-026). The shape is `UserNote` from @causeway/graph and
 * maps one to one onto the `note` table in db/migrations/0002_notes.sql.
 * No profile data is ever stored with a note; the mobility label is opt-in
 * per note.
 */
import type { UserNote } from "@causeway/graph";

const KEY = "causewayside.notes.v1";
const AUTHOR_KEY = "causewayside.author.v1";

export function loadNotes(): UserNote[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as UserNote[]) : [];
  } catch {
    return [];
  }
}

export function saveNote(n: UserNote): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify([n, ...loadNotes().filter((o) => o.id !== n.id)].slice(0, 200)));
    return true;
  } catch {
    return false;
  }
}

export function deleteNote(id: string): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadNotes().filter((o) => o.id !== id)));
    return true;
  } catch {
    return false;
  }
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
