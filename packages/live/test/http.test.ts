import { describe, expect, it } from "vitest";
import { fetchLiftOutages, getJson, LiveHttpError, LiveTimeoutError } from "@causeway/live";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** A fetch that never answers and ignores its signal: the worst case. */
const hangs = (() => new Promise<Response>(() => undefined)) as typeof fetch;

describe("getJson (STAB-05)", () => {
  it("returns the feed's JSON", async () => {
    await expect(getJson("https://x", "Feed", { fetchImpl: async () => json({ a: 1 }) })).resolves.toEqual({ a: 1 });
  });

  it("gives up on a feed that never answers, even one that ignores its signal", async () => {
    const t = Date.now();
    await expect(getJson("https://x", "Feed", { fetchImpl: hangs, timeoutMs: 30 })).rejects.toBeInstanceOf(LiveTimeoutError);
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it("counts a slow body against the limit too", async () => {
    const slowBody = (async () => ({ ok: true, status: 200, json: () => new Promise(() => undefined) }) as unknown as Response) as typeof fetch;
    await expect(getJson("https://x", "Feed", { fetchImpl: slowBody, timeoutMs: 30 })).rejects.toThrow("Feed: no answer in 0.03 s");
  });

  it("aborts the request it gave up on", async () => {
    let seen: AbortSignal | undefined;
    const watch = ((_: string, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    await expect(getJson("https://x", "Feed", { fetchImpl: watch, timeoutMs: 20 })).rejects.toBeInstanceOf(LiveTimeoutError);
    expect(seen?.aborted).toBe(true);
  });

  it("stops when the caller cancels, with the caller's reason", async () => {
    const ctl = new AbortController();
    const p = getJson("https://x", "Feed", { fetchImpl: hangs, signal: ctl.signal });
    ctl.abort(new Error("typed past it"));
    await expect(p).rejects.toThrow("typed past it");
  });

  it("names the feed and status on an error, so callers can treat 404 as nothing found", async () => {
    const err = await getJson("https://x", "Postcodes", { fetchImpl: async () => json({}, 404) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LiveHttpError);
    expect(err).toMatchObject({ feed: "Postcodes", status: 404, message: "Postcodes: HTTP 404" });
  });

  it("puts the limit on every adapter: a hung lift feed fails, so the app shows its fallback", async () => {
    await expect(fetchLiftOutages(hangs, new Date(), { timeoutMs: 20 })).rejects.toBeInstanceOf(LiveTimeoutError);
  });
});
