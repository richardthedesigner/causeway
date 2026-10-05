/**
 * fetch with a time limit for the sharing and review calls to Supabase
 * (STAB-14), as getJson does for the live feeds (D-052). The limit runs from
 * the request to the last byte the caller reads, so a body that stalls is
 * cut off too. A timeout throws LiveTimeoutError, which every caller already
 * treats like any other failure: a note stays on the phone, a report waits.
 */
import { LiveTimeoutError } from "@causeway/live";

/** Calls that send or read a little JSON. */
const SHARE_TIMEOUT_MS = 15_000;
/** A photo going up on a slow connection. */
export const UPLOAD_TIMEOUT_MS = 30_000;

export async function timedFetch(url: string, init: RequestInit, label: string, ms = SHARE_TIMEOUT_MS): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new LiveTimeoutError(label, ms)), ms);
  const cancel = () => ctl.abort(init.signal?.reason);
  if (init.signal?.aborted) cancel();
  else init.signal?.addEventListener("abort", cancel, { once: true });
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    // fetch rejects with the abort reason: our timeout, or the caller's own cancel.
    throw ctl.signal.aborted ? ctl.signal.reason : e;
  } finally {
    // Headers are in; leave the timer running over the body, then it's harmless.
    setTimeout(() => clearTimeout(timer), ms);
  }
}
