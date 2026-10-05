/**
 * Sharing notes and sending reports (D-030). Off unless the build has
 * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY; without them
 * the app keeps everything on the device, exactly as before.
 *
 * Plain fetch against Supabase's REST endpoints, no SDK. Sign-in is
 * anonymous: no account, no email, just a random id the database uses to
 * let you delete your own notes and to count different people. The
 * mobility profile is never sent (D-009).
 */
import { fromPublicRow, toNoteRow, type NotePublicRow, type UserNote } from "@causeway/graph";
import type { Report } from "./reports";
import { timedFetch, UPLOAD_TIMEOUT_MS } from "./timed-fetch";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SESSION_KEY = "causewayside.session.v1";
const PHOTO_BUCKET = "note-photos";
/** Approved photos are copied here by a reviewer; this bucket is public. */
const APPROVED_BUCKET = "note-photos-approved";

export const sharing = !!(URL_ && KEY);

interface Session {
  access_token: string;
  refresh_token: string;
  /** Seconds since the epoch. */
  expires_at: number;
  user: { id: string };
}

function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
  } catch {
    return null;
  }
}

function storeSession(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* not kept: we sign in again next time, which only costs a new anonymous id */
  }
}

async function auth(path: string, body: unknown): Promise<Session> {
  const r = await timedFetch(`${URL_}/auth/v1/${path}`, { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify(body) }, "Sign-in");
  if (!r.ok) throw new Error(`sign-in: HTTP ${r.status}`);
  const s = (await r.json()) as Session & { expires_in?: number };
  if (!s.expires_at && s.expires_in) s.expires_at = Math.floor(Date.now() / 1000) + s.expires_in;
  storeSession(s);
  return s;
}

/** A valid session: the stored one, refreshed if it's about to expire, or a new anonymous one. */
async function session(): Promise<Session> {
  const s = loadSession();
  if (s && s.expires_at - 60 > Date.now() / 1000) return s;
  if (s?.refresh_token) {
    try {
      return await auth("token?grant_type=refresh_token", { refresh_token: s.refresh_token });
    } catch {
      /* refresh token gone stale: start a new anonymous session */
    }
  }
  return auth("signup", { data: {} });
}

async function rest(path: string, init: RequestInit & { signedIn?: boolean } = {}): Promise<Response> {
  const headers: Record<string, string> = { apikey: KEY, "content-type": "application/json", ...(init.headers as Record<string, string>) };
  if (init.signedIn !== false) headers.authorization = `Bearer ${(await session()).access_token}`;
  return timedFetch(`${URL_}${path}`, { ...init, headers }, "Sharing");
}

async function uploadPhoto(n: UserNote): Promise<string | null> {
  if (!n.photo?.startsWith("data:")) return null;
  const s = await session();
  const path = `${s.user.id}/${n.id}.jpg`;
  const blob = await (await fetch(n.photo)).blob();
  const r = await timedFetch(`${URL_}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: KEY, authorization: `Bearer ${s.access_token}`, "content-type": "image/jpeg", "x-upsert": "true" },
    body: blob,
  }, "Photo upload", UPLOAD_TIMEOUT_MS);
  return r.ok ? path : null;
}

/** Share one note. True once the server has it (or already had it). */
export async function pushNote(n: UserNote): Promise<boolean> {
  if (!sharing) return false;
  try {
    const photoPath = await uploadPhoto(n).catch(() => null);
    const r = await rest("/rest/v1/note", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(toNoteRow(n, photoPath)) });
    return r.ok || r.status === 409;
  } catch {
    return false;
  }
}

export async function deleteSharedNote(id: string): Promise<boolean> {
  if (!sharing) return false;
  try {
    return (await rest(`/rest/v1/note?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" })).ok;
  } catch {
    return false;
  }
}

export type FlagReason = "wrong" | "unkind" | "personal" | "other";

export async function flagNote(id: string, reason: FlagReason): Promise<boolean> {
  if (!sharing) return false;
  try {
    const r = await rest("/rest/v1/note_flag", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ note_id: id, reason }) });
    return r.ok || r.status === 409;
  } catch {
    return false;
  }
}

/** Shared notes for a city. Reading needs no sign-in, but signing in tells us which ones are yours. */
export async function fetchSharedNotes(city: string, deviceAuthor: string): Promise<UserNote[]> {
  if (!sharing) return [];
  const r = await rest(`/rest/v1/note_public?area_id=eq.${encodeURIComponent(city)}&select=*&order=observed_at.desc&limit=2000`, { signedIn: !!loadSession() });
  if (!r.ok) throw new Error(`notes: HTTP ${r.status}`);
  const rows = (await r.json()) as NotePublicRow[];
  const photo = (p: string) => `${URL_}/storage/v1/object/public/${APPROVED_BUCKET}/${p}`;
  return rows.map((row) => fromPublicRow(row, deviceAuthor, photo)).filter((n): n is UserNote => n !== null);
}

/**
 * Delete everything this phone has shared (SEC-06): photos, flags, reports and notes, by
 * the anonymous id the server knows it by. "none" when nothing was ever shared from here.
 * "failed" leaves the session in place so it can be tried again; the id is the only key.
 */
export async function deleteEverythingShared(): Promise<"none" | "done" | "failed"> {
  const stored = loadSession();
  if (!sharing || !stored) return "none";
  try {
    const s = await session();
    // A refresh that failed starts a new id, which owns nothing: the old one can't be reached.
    if (s.user.id !== stored.user.id) return "failed";
    const id = s.user.id;
    const headers = { apikey: KEY, authorization: `Bearer ${s.access_token}`, "content-type": "application/json" };
    const list = await timedFetch(`${URL_}/storage/v1/object/list/${PHOTO_BUCKET}`, { method: "POST", headers, body: JSON.stringify({ prefix: id, limit: 1000 }) }, "Photo list");
    if (!list.ok) return "failed";
    const files = (await list.json()) as { name: string }[];
    if (files.length) {
      const del = await timedFetch(`${URL_}/storage/v1/object/${PHOTO_BUCKET}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: files.map((f) => `${id}/${f.name}`) }) }, "Photo delete");
      if (!del.ok) return "failed";
    }
    for (const q of [`note_flag?flagger_id=eq.${id}`, `report?author_id=eq.${id}`, `note?author_id=eq.${id}`]) {
      if (!(await rest(`/rest/v1/${q}`, { method: "DELETE" })).ok) return "failed";
    }
    return "done";
  } catch {
    return "failed";
  }
}

/** Send a problem report for triage. Reports are never shown publicly. */
export async function pushReport(rep: Report): Promise<boolean> {
  if (!sharing) return false;
  try {
    const r = await rest("/rest/v1/report", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        id: rep.id,
        geom: `SRID=4326;POINT(${rep.lon} ${rep.lat})`,
        kind: rep.kind,
        detail: rep.note || null,
        area_id: rep.city,
        accuracy_m: rep.accuracyM,
        created_at: rep.at,
      }),
    });
    return r.ok || r.status === 409;
  } catch {
    return false;
  }
}
