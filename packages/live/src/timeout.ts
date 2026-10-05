/**
 * Every live feed gets a time limit (STAB-05). A feed that hangs would
 * otherwise leave the app saying "checking" for ever; with a limit it fails
 * like any other error, and each caller's fallback takes over (the last
 * states until they expire, dry weather, "couldn't check").
 */

/** Long enough for a slow phone connection, short enough that people aren't left waiting. */
export const LIVE_TIMEOUT_MS = 10_000;

export class LiveTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label}: no answer in ${Math.round(ms / 1000)} s`);
    this.name = "LiveTimeoutError";
  }
}

/**
 * Fetch JSON with a time limit that covers the body as well as the headers.
 * The caller's own signal (a newer request replacing this one) still aborts it.
 */
export async function getJson<T = unknown>(url: string, label: string, opts: { fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const { fetchImpl = fetch, signal, timeoutMs = LIVE_TIMEOUT_MS } = opts;
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  const onAbort = () => ctl.abort();
  if (signal?.aborted) ctl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (timedOut) throw new LiveTimeoutError(label, timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
