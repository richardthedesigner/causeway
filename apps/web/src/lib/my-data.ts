/**
 * Everything Causewayside keeps about you, in one place (SEC-06, UK GDPR): what's on this
 * phone, a copy to download, and a way to delete all of it, here and anything shared.
 * Every key the app writes starts "causewayside."; the sign-in tokens are left out of the
 * copy, as they're credentials, not information about you.
 */
import { deleteEverythingShared, sharing } from "./sync";

const PREFIX = "causewayside.";
const SECRET = /session/;

function keys(store: Storage | undefined): string[] {
  if (!store) return [];
  const out: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith(PREFIX)) out.push(k);
  }
  return out.sort();
}

const local = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};
const session = (): Storage | undefined => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};

const count = (raw: string | null): number => {
  try {
    const v = JSON.parse(raw ?? "null");
    return Array.isArray(v) ? v.length : Array.isArray(v?.devices) ? v.devices.length : 0;
  } catch {
    return 0;
  }
};

export interface MyDataSummary {
  devices: number;
  notes: number;
  reports: number;
  recents: number;
  saved: number;
  /** Notes or reports may be on our server too. */
  shared: boolean;
}

export function myDataSummary(): MyDataSummary {
  const s = local();
  const ks = keys(s);
  const get = (k: string) => s?.getItem(k) ?? null;
  return {
    devices: count(get("causewayside.devices.v1")),
    notes: count(get("causewayside.notes.v1")),
    reports: count(get("causewayside.reports.v1")),
    recents: ks.filter((k) => k.startsWith("causewayside.recents.") && !k.endsWith(".backup")).reduce((n, k) => n + count(get(k)), 0),
    saved: ks.filter((k) => k.startsWith("causewayside.saved.")).reduce((n, k) => n + count(get(k)), 0),
    shared: sharing && ks.includes("causewayside.session.v1"),
  };
}

/** A copy of everything on this phone, as one JSON document. */
export function myDataExport(now = new Date()): string {
  const s = local();
  const data: Record<string, unknown> = {};
  for (const k of keys(s)) {
    if (SECRET.test(k)) continue;
    const raw = s!.getItem(k);
    try {
      data[k] = JSON.parse(raw ?? "null");
    } catch {
      data[k] = raw;
    }
  }
  return JSON.stringify(
    {
      app: "Causewayside",
      exportedAt: now.toISOString(),
      about: "Everything Causewayside keeps on this phone: your devices and their limits, notes, reports, recent places and settings. Notes and reports you shared are on our server too; deleting from the app removes them there as well.",
      data,
    },
    null,
    2,
  );
}

/**
 * Delete everything: what was shared first (it needs this phone's sign-in), then this phone.
 * If the shared part fails, nothing is deleted here, so it can be tried again.
 */
export async function deleteMyData(): Promise<"done" | "shared-failed"> {
  if ((await deleteEverythingShared()) === "failed") return "shared-failed";
  for (const store of [local(), session()]) for (const k of keys(store)) store!.removeItem(k);
  return "done";
}
