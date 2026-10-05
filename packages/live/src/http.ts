/**
 * Getting a live feed's JSON with a time limit (STAB-05). Every caller has a
 * fallback for a failed feed: lifts read "couldn't check", works and floods
 * keep what they had, the weather assumes dry and says so. A feed that hangs
 * never fails, though, so without a limit the fallback never comes: "Checking
 * lifts with TfL…" would stay for good, and each refresh would add another
 * request that never ends.
 */

/** How long a live feed gets, body included, before its caller falls back. */
export const LIVE_TIMEOUT_MS = 10_000;

/** A feed answered, but not with a success. `status` lets a caller treat, say, 404 as "nothing here". */
export class LiveHttpError extends Error {
  constructor(
    readonly feed: string,
    readonly status: number,
  ) {
    super(`${feed}: HTTP ${status}`);
    this.name = "LiveHttpError";
  }
}

/** A feed didn't answer in time. */
export class LiveTimeoutError extends Error {
  constructor(
    readonly feed: string,
    readonly ms: number,
  ) {
    super(`${feed}: no answer in ${ms / 1000} s`);
    this.name = "LiveTimeoutError";
  }
}

export interface LiveOptions {
  /** For tests and for callers with their own fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** The caller's own cancel, such as a search the user has typed past. */
  signal?: AbortSignal;
}

/**
 * GET `url` and parse its JSON, within `timeoutMs` from the request to the
 * last byte. Throws LiveHttpError for a non-success status, LiveTimeoutError
 * when time runs out, and the caller's abort reason when `signal` aborts. The
 * request is aborted either way, and the limit holds even for a fetch that
 * ignores its signal.
 */
export async function getJson<T>(url: string, feed: string, { fetchImpl = fetch, timeoutMs = LIVE_TIMEOUT_MS, signal }: LiveOptions = {}): Promise<T> {
  const ctl = new AbortController();
  let fail!: (e: unknown) => void;
  const stopped = new Promise<never>((_, reject) => (fail = reject));
  const abort = (reason: unknown) => {
    ctl.abort(reason);
    fail(reason);
  };
  const timer = setTimeout(() => abort(new LiveTimeoutError(feed, timeoutMs)), timeoutMs);
  const onCancel = () => abort(signal!.reason);
  if (signal?.aborted) onCancel();
  else signal?.addEventListener("abort", onCancel, { once: true });
  const get = async () => {
    const res = await fetchImpl(url, { signal: ctl.signal });
    if (!res.ok) throw new LiveHttpError(feed, res.status);
    return (await res.json()) as T;
  };
  const request = get();
  // Once the limit or the cancel wins, the aborted request still rejects; that's expected, not an error to report.
  request.catch(() => undefined);
  try {
    return await Promise.race([request, stopped]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCancel);
  }
}
