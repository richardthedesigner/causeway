import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveTimeoutError } from "@causeway/live";
import { timedFetch } from "../src/lib/timed-fetch";

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
  vi.useRealTimers();
});

/** A server that never answers until the request is aborted. */
const hangs = () => {
  globalThis.fetch = ((_: unknown, init?: RequestInit) =>
    new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
};

describe("time limits for sharing and review (STAB-14)", () => {
  it("gives up on Supabase when it doesn't answer, naming the call", async () => {
    vi.useFakeTimers();
    hangs();
    const p = expect(timedFetch("https://x.supabase.co/rest/v1/note", { method: "POST" }, "Sharing", 15_000)).rejects.toThrow(LiveTimeoutError);
    await vi.advanceTimersByTimeAsync(15_000);
    await p;
  });

  it("still lets the caller cancel", async () => {
    hangs();
    const ctl = new AbortController();
    const p = timedFetch("https://x", { signal: ctl.signal }, "Sharing");
    ctl.abort(new Error("cancelled"));
    await expect(p).rejects.toThrow("cancelled");
  });

  it("passes an answer straight through", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 201 })) as typeof fetch;
    expect((await timedFetch("https://x", { method: "POST" }, "Sharing")).status).toBe(201);
  });
});
