/**
 * Problem reports, kept on this device until there is somewhere to send
 * them (the crowd-verification backend is a Phase 4 decision for Richard:
 * it stores location data from members of the public). No profile data is
 * ever attached to a report.
 */
import { loadStored, readList, saveStored, type StoredVersion } from "./stored";

export type ReportKind = "blocked" | "kerb" | "surface" | "lift" | "steep" | "other" | "whats-there";

/** The kinds on "Report a problem". "What's there" is reached from "What we don't know" instead (FEAT-03). */
export const REPORT_KINDS: { kind: Exclude<ReportKind, "whats-there">; label: string }[] = [
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
  /** For "what's there" (FEAT-03): the street, and each thing we didn't know with the answer given. */
  about?: { place: string; answers: { attr: string; question: string; answer: string }[] };
  /** Set once the report has been sent for triage (only when sharing is on, D-030). */
  sentAt?: string;
}

const KEY = "causewayside.reports.v1";

/** Newest shape first (STAB-03). Anything unreadable is backed up before it can be overwritten. */
const VERSIONS: StoredVersion<Report[]>[] = [
  { key: KEY, read: (json, dropped) => readList(json, dropped, (x) => (x && typeof (x as Report).id === "string" ? (x as Report) : null)) },
];

export function loadReports(): Report[] {
  return loadStored(VERSIONS)?.value ?? [];
}

export function saveReport(r: Report): boolean {
  return saveStored(KEY, [r, ...loadReports()].slice(0, 200));
}

export function markSent(id: string): void {
  // If it doesn't save, it's tried again next time.
  saveStored(KEY, loadReports().map((r) => (r.id === id ? { ...r, sentAt: new Date().toISOString() } : r)));
}

export interface WhatsThereQuestion {
  /** The router's attribute ("kerb", "surface"), kept with the answer so it can be matched to the graph later. */
  attr: string;
  /** What we didn't know, in the router's words. */
  detail: string;
  question: string;
  answers: string[];
}

const QUESTIONS: Record<string, { question: string; answers: string[] }> = {
  kerb: { question: "What are the kerbs like?", answers: ["Dropped, level with the road", "Dropped, with a small lip", "Raised, no dropped kerb"] },
  pavement: { question: "Is there a pavement?", answers: ["Yes, on both sides", "On one side only", "No pavement"] },
  surface: { question: "What's the surface like?", answers: ["Smooth: tarmac or paving", "Setts or cobbles", "Gravel or loose", "Grass or earth"] },
  width: { question: "How wide is it?", answers: ["Wide enough to pass easily", "Narrow in places", "Too narrow to pass"] },
  incline: { question: "How steep is it?", answers: ["Flat or gentle", "Steep", "Very steep"] },
  steps: { question: "Are there steps?", answers: ["No steps", "One or two steps", "A flight of steps"] },
  station: { question: "Is it step-free?", answers: ["Yes, step-free", "No, not step-free"] },
  "bus-seat": { question: "Is there a seat at the stop?", answers: ["Yes, a seat", "No seat"] },
};

/**
 * One question for each thing we don't know about a street (FEAT-03), in the
 * order the router gave them. Things a person on the street can't see, such
 * as live lift status or an operator's scooter rules, get no question; the
 * note covers anything else.
 */
export function whatsThereQuestions(attrs: readonly { attr: string; detail: string }[]): WhatsThereQuestion[] {
  const out: WhatsThereQuestion[] = [];
  for (const { attr, detail } of attrs) {
    // "Kerbs at side roads not mapped" comes from the pavement check, but it's a question about kerbs.
    const key = attr === "pavement" && /kerb/.test(detail) ? "kerb" : attr;
    const q = QUESTIONS[key];
    if (q && !out.some((o) => o.attr === key)) out.push({ attr: key, detail, ...q });
  }
  return out;
}

/** A report in a line or two, for triage. */
export function reportDetail(r: Pick<Report, "note" | "about">): string | null {
  const about = r.about ? [`On ${r.about.place}.`, ...r.about.answers.map((a) => `${a.question} ${a.answer}.`)] : [];
  return [...about, r.note].filter(Boolean).join(" ") || null;
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
