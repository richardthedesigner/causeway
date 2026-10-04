/**
 * The review page's connection (D-030). Reviewers sign in with an email
 * code as themselves; the database decides what a reviewer may do (row-level
 * security in db/migrations/0005_review.sql) and logs every decision. This
 * file never holds the service key, and its session is kept apart from the
 * anonymous one the app uses for notes.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SESSION_KEY = "causewayside.review-session.v1";

export const reviewAvailable = !!(URL_ && KEY);

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}

const load = (): Session | null => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
  } catch {
    return null;
  }
};
const store = (s: Session | null) => {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* lasts for this page only */
  }
};

async function auth(path: string, body: unknown): Promise<Response> {
  return fetch(`${URL_}/auth/v1/${path}`, { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
}

function keep(json: Session & { expires_in?: number }): Session {
  if (!json.expires_at && json.expires_in) json.expires_at = Math.floor(Date.now() / 1000) + json.expires_in;
  store(json);
  return json;
}

/** Email a sign-in code. Only existing accounts get one: reviewers are invited, nobody signs up here. */
export async function sendCode(email: string): Promise<boolean> {
  const r = await auth("otp", { email, create_user: false });
  return r.ok;
}

export async function verifyCode(email: string, token: string): Promise<boolean> {
  const r = await auth("verify", { type: "email", email, token: token.replace(/\s/g, "") });
  if (!r.ok) return false;
  keep(await r.json());
  return true;
}

export function signedInEmail(): string | null {
  return load()?.user.email ?? null;
}

export function signOut() {
  store(null);
}

async function session(): Promise<Session> {
  const s = load();
  if (!s) throw new Error("signed out");
  if (s.expires_at - 60 > Date.now() / 1000) return s;
  const r = await auth("token?grant_type=refresh_token", { refresh_token: s.refresh_token });
  if (!r.ok) {
    store(null);
    throw new Error("signed out");
  }
  return keep(await r.json());
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const s = await session();
  const r = await fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: KEY, authorization: `Bearer ${s.access_token}`, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

export async function amReviewer(): Promise<boolean> {
  return (await (await call("/rest/v1/rpc/is_reviewer", { method: "POST", body: "{}" })).json()) === true;
}

export interface FlaggedNote {
  id: string;
  area_id: string;
  target_name: string;
  sentiment: "good" | "mixed" | "bad";
  body: string;
  observed_at: string;
  note_flag: { reason: string; created_at: string }[];
}

export interface PendingPhoto {
  id: string;
  target_name: string;
  body: string;
  photo_path: string;
  observed_at: string;
  /** Short-lived link to the private photo, made for this reviewer. */
  url: string | null;
}

export interface NewReport {
  id: string;
  area_id: string | null;
  kind: string;
  detail: string | null;
  created_at: string;
  geom: { type: "Point"; coordinates: [number, number] } | null;
}

export async function flaggedNotes(): Promise<FlaggedNote[]> {
  return (await call("/rest/v1/note?status=eq.hidden&select=id,area_id,target_name,sentiment,body,observed_at,note_flag(reason,created_at)&order=created_at.asc")).json();
}

export async function pendingPhotos(): Promise<PendingPhoto[]> {
  const rows = (await (await call("/rest/v1/note?photo_status=eq.pending&select=id,target_name,body,photo_path,observed_at&order=created_at.asc")).json()) as Omit<PendingPhoto, "url">[];
  return Promise.all(
    rows.map(async (r) => {
      try {
        const j = (await (await call(`/storage/v1/object/sign/note-photos/${r.photo_path}`, { method: "POST", body: JSON.stringify({ expiresIn: 600 }) })).json()) as { signedURL?: string };
        return { ...r, url: j.signedURL ? `${URL_}/storage/v1${j.signedURL}` : null };
      } catch {
        return { ...r, url: null };
      }
    }),
  );
}

export async function newReports(): Promise<NewReport[]> {
  return (await call("/rest/v1/report?status=eq.new&select=id,area_id,kind,detail,created_at,geom&order=created_at.asc")).json();
}

const patch = (table: "note" | "report", id: string, body: Record<string, string>) =>
  call(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(body) });

export const setNoteStatus = (id: string, status: "visible" | "removed") => patch("note", id, { status });

/** Approve: publish a copy to the public bucket first, then mark it approved so the public view shows it. */
export async function approvePhoto(p: PendingPhoto): Promise<void> {
  await call("/storage/v1/object/copy", {
    method: "POST",
    body: JSON.stringify({ bucketId: "note-photos", sourceKey: p.photo_path, destinationBucket: "note-photos-approved", destinationKey: p.photo_path }),
  });
  await patch("note", p.id, { photo_status: "approved" });
}

export const rejectPhoto = (id: string) => patch("note", id, { photo_status: "rejected" });

export const setReportStatus = (id: string, status: "triaged" | "fixed" | "rejected") => patch("report", id, { status });
