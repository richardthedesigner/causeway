import { describe, expect, it, vi } from "vitest";
import { fetchLiftOutages, getJson, LIVE_TIMEOUT_MS, LiveTimeoutError } from "../src/index.js";

/** A fetch that never answers until it's aborted, as a hung feed does. */
const hangs: typeof fetch = (_url, init) =>
  new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
const answers =
  (body: unknown, status = 200): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), { status });

describe("live feed time limits (STAB-05)", () => {
  it("gives up on a feed that never answers, with a clear error", async () => {
    await expect(getJson("https://x", "Test feed", { fetchImpl: hangs, timeoutMs: 20 })).rejects.toThrow(LiveTimeoutError);
    await expect(getJson("https://x", "Test feed", { fetchImpl: hangs, timeoutMs: 20 })).rejects.toThrow("Test feed: no answer in 0 s");
  });

  it("still lets the caller cancel, and says so as an abort, not a timeout", async () => {
    const ctl = new AbortController();
    const p = getJson("https://x", "Test feed", { fetchImpl: hangs, signal: ctl.signal, timeoutMs: 10_000 });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reads JSON, and names the feed on an HTTP error", async () => {
    expect(await getJson("https://x", "Test feed", { fetchImpl: answers({ a: 1 }) })).toEqual({ a: 1 });
    await expect(getJson("https://x", "Test feed", { fetchImpl: answers({}, 503) })).rejects.toThrow("Test feed: HTTP 503");
  });

  it("applies to the adapters, so a hung lift feed fails instead of waiting for ever", async () => {
    vi.useFakeTimers();
    try {
      const p = expect(fetchLiftOutages(hangs)).rejects.toThrow("TfL lift feed: no answer in 10 s");
      await vi.advanceTimersByTimeAsync(LIVE_TIMEOUT_MS);
      await p;
    } finally {
      vi.useRealTimers();
    }
  });
});
