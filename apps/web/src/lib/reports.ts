/**
 * Problem reports, kept on this device until there is somewhere to send
 * them (the crowd-verification backend is a Phase 4 decision for Richard:
 * it stores location data from members of the public). No profile data is
 * ever attached to a report.
 */
export type ReportKind = "blocked" | "kerb" | "surface" | "lift" | "steep" | "other";

export const REPORT_KINDS: { kind: ReportKind; label: string }[] = [
  { kind: "blocked", label: "Pavement blocked" },
  { kind: "kerb", label: "No dropped kerb" },
  { kind: "surface", label: "Broken or rough surface" },
  { kind: "lift", label: "Lift not working" },
  { kind: "steep", label: "Steeper than shown" },
  { kind: "other", label: "Something else" },
];

export interface Report {
  id: string;
  kind: ReportKind;
  lon: number;
  lat: number;
  accuracyM: number | null;
  at: string;
  city: string;
  note: string;
  /** Small JPEG data URL, if the person added a photo. */
  photo: string | null;
  /** Set once the report has been sent for triage (only when sharing is on, D-030). */
  sentAt?: string;
}

const KEY = "causewayside.reports.v1";

export function loadReports(): Report[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Report[];
  } catch {
    return [];
  }
}

export function saveReport(r: Report): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify([r, ...loadReports()].slice(0, 200)));
    return true;
  } catch {
    return false;
  }
}

export function markSent(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadReports().map((r) => (r.id === id ? { ...r, sentAt: new Date().toISOString() } : r))));
  } catch {
    /* tried again next time */
  }
}

/** Shrink a photo to at most 640 px on its long side, as JPEG, so it fits on the device. */
export async function shrinkPhoto(file: File): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
