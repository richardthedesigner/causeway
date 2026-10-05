import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LiveState } from "@causeway/graph";
import { disruptionsMissing, fetchTflDisruptions, heldDisruptions, holdDisruptions, mergeLiveStates, NO_DISRUPTIONS_HELD, parseLineStatus, parseStationDisruptions, railDisruptionStates, readStationMessage, tflLineStatusUrl } from "../src/tfl-disruptions.js";

const fx = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", f), "utf8"));
const AT = "2026-10-04T12:00:00Z";
const NOW = new Date(AT);
const net = JSON.parse(readFileSync(join(import.meta.dirname, "../../../data/transit/london/network.json"), "utf8"));
const refs = new Set<string>();
for (const r of net.routes as { line: string; stops: string[] }[]) {
  r.stops.forEach((s, i) => {
    refs.add(`board:${r.line}:${s}`);
    if (i) refs.add(`ride:${r.line}:${r.stops[i - 1]}:${s}`);
  });
}

describe("TfL line status (DATA-04)", () => {
  const lines = parseLineStatus(fx("tfl-line-status-2026-10-04.json"), AT);

  it("reads part closures with TfL's own dates and the stations they name", () => {
    const jub = lines.find((d) => d.line === "jubilee")!;
    expect(jub).toMatchObject({ kind: "line-closed", validFrom: "2026-10-04T04:30:00Z", validUntil: "2026-10-05T00:29:00Z" });
    expect(jub.stations).toContain("940GZZLUWSM");
    expect(jub.message).toMatch(/no service between Green Park and Canary Wharf/);
  });

  it("closes the rides between the named stations, and only those", () => {
    const s = railDisruptionStates(lines, net, refs, NOW);
    expect(s.get("ride:jubilee:940GZZLUGPK:940GZZLUWSM")?.status).toBe("closed");
    expect(s.has("ride:jubilee:940GZZLUWSM:940GZZLUGPK") || s.has("ride:jubilee:940GZZLUGPK:940GZZLUWSM")).toBe(true);
    // Canary Wharf to North Greenwich still runs: North Greenwich isn't named.
    expect([...s.keys()].some((k) => k.includes("940GZZLUNGW"))).toBe(false);
    // Boarding is untouched: Westminster's other end of the line still runs.
    expect([...s.keys()].some((k) => k.startsWith("board:"))).toBe(false);
  });

  it("drops states that have already ended", () => {
    expect(railDisruptionStates(lines, net, refs, new Date("2026-10-06T00:00:00Z")).size).toBe(0);
  });
});

describe("TfL station disruptions (DATA-04)", () => {
  it("acts only on plain cases", () => {
    expect(readStationMessage("CANARY WHARF: Step free access is not available to the Jubilee line due to a faulty lift.")).toEqual({ effect: "no-step-free", partial: false });
    expect(readStationMessage("King George V: No Step Free Access - Step free access is not available due to a faulty lift.").effect).toBe("no-step-free");
    expect(readStationMessage("South Quay: No Step Free Access - Step free access is not available for trains towards Lewisham due to a faulty lift.")).toEqual({ effect: "no-step-free", partial: true });
    expect(readStationMessage("WEMBLEY PARK STATION: no lift service between the street and ticket hall. Step-free access is still available by using the entrance on Bridge Road.").effect).toBeNull();
    expect(readStationMessage("BARONS COURT STATION: westbound trains will not call at Barons Court.")).toEqual({ effect: "not-calling", partial: true });
    expect(readStationMessage("FOO STATION: The station is closed today.").effect).toBe("closed");
    expect(readStationMessage("FOO STATION: The westbound entrance is closed. The station is closed to the east.").effect).toBeNull();
    expect(readStationMessage("CANNING TOWN STATION: There is a reduced escalator service due to faults.").effect).toBeNull();
  });

  it("a loss of step-free access that names another way in is unknown, not closed (D-061)", () => {
    expect(readStationMessage("FOO STATION: No step-free access to the Jubilee line. Use the entrance on Bank Street for step-free access.")).toEqual({ effect: "no-step-free", partial: true });
    expect(readStationMessage("FOO STATION: Step-free access is not available. Please use Bar station instead.")).toEqual({ effect: "no-step-free", partial: true });
    expect(readStationMessage("FOO STATION: Step-free access is not available due to a faulty lift.")).toEqual({ effect: "no-step-free", partial: false });
  });

  it("says what each closure is in a few words, for \"In the way\"", () => {
    const s = railDisruptionStates(parseStationDisruptions(fx("tfl-station-disruptions-2026-10-04.json"), AT), net, refs, NOW);
    expect(s.get("board:jubilee:940GZZLUCYF")!.headline).toBe("No step-free access");
    expect(s.get("board:dlr:940GZZDLSOQ")!.headline).toBe("No step-free access to part of the station");
    const l = railDisruptionStates(parseLineStatus(fx("tfl-line-status-2026-10-04.json"), AT), net, refs, NOW);
    expect(l.get("ride:jubilee:940GZZLUGPK:940GZZLUWSM")!.headline).toBe("No service");
  });

  it("puts today's messages on the right boarding edges", () => {
    const s = railDisruptionStates(parseStationDisruptions(fx("tfl-station-disruptions-2026-10-04.json"), AT), net, refs, NOW);
    expect(s.get("board:jubilee:940GZZLUCYF")).toMatchObject({ status: "closed", affects: "step-free" });
    expect(s.get("board:dlr:940GZZDLKGV")).toMatchObject({ status: "closed", affects: "step-free" });
    // One direction only: flagged, not closed.
    expect(s.get("board:dlr:940GZZDLSOQ")).toMatchObject({ status: "restricted", affects: "step-free" });
    // About the Bakerloo line, or escalators: nothing on our lines.
    expect(s.has("board:jubilee:940GZZLUWLO")).toBe(false);
    expect(s.has("board:jubilee:940GZZLUCGT")).toBe(false);
  });
});

describe("merging live states", () => {
  const st = (status: LiveState["status"], affects?: "step-free"): LiveState => ({ status, affects, reason: status, source: "x", validFrom: AT, validUntil: AT });
  it("keeps the strongest: closed for everyone, closed step-free, then restricted", () => {
    const m = mergeLiveStates(new Map([["a", st("restricted")], ["b", st("closed", "step-free")]]), new Map([["a", st("closed", "step-free")], ["b", st("closed")]]));
    expect(m.get("a")).toMatchObject({ status: "closed", affects: "step-free" });
    expect(m.get("b")!.affects).toBeUndefined();
  });
});

describe("when a TfL disruption feed fails (D-061)", () => {
  const lineJson = fx("tfl-line-status-2026-10-04.json");
  const stationJson = fx("tfl-station-disruptions-2026-10-04.json");
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const fetchWith = (lines: "ok" | "fail" | "hang", stations: "ok" | "fail" | "hang"): typeof fetch =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      const isLine = String(url) === tflLineStatusUrl();
      const how = isLine ? lines : stations;
      if (how === "fail") return new Response("busy", { status: 503 });
      if (how === "hang")
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      return ok(isLine ? lineJson : stationJson);
    }) as typeof fetch;

  it("fetches each feed on its own: one failing leaves the other", async () => {
    const d = await fetchTflDisruptions(fetchWith("fail", "ok"), NOW);
    expect(d.lines).toBeNull();
    expect(d.stations!.length).toBeGreaterThan(0);
    expect(disruptionsMissing(d)).toBe("lines");
    const e = await fetchTflDisruptions(fetchWith("ok", "hang"), NOW, { timeoutMs: 50 });
    expect(e.lines!.length).toBeGreaterThan(0);
    expect(e.stations).toBeNull();
    expect(disruptionsMissing(e)).toBe("stations");
    expect(disruptionsMissing(await fetchTflDisruptions(fetchWith("fail", "hang"), NOW, { timeoutMs: 50 }))).toBe("both");
    expect(disruptionsMissing(await fetchTflDisruptions(fetchWith("ok", "ok"), NOW))).toBeNull();
  });

  it("keeps a failed feed's last good answer until 15 minutes after that fetch, then drops it", async () => {
    const first = await fetchTflDisruptions(fetchWith("ok", "ok"), NOW);
    let held = holdDisruptions(NO_DISRUPTIONS_HELD, first);
    const closedAt = (h: typeof held, at: Date) => railDisruptionStates(heldDisruptions(h), net, refs, at).get("board:jubilee:940GZZLUCYF")?.status;
    expect(closedAt(held, NOW)).toBe("closed");
    // Ten minutes later the station feed fails: Canary Wharf still has no step-free access.
    const later = new Date(NOW.getTime() + 10 * 60_000);
    held = holdDisruptions(held, { lines: first.lines, stations: null, fetchedAt: later.toISOString() });
    expect(held.stations?.fetchedAt).toBe(NOW.toISOString());
    expect(closedAt(held, later)).toBe("closed");
    // Sixteen minutes after the good fetch, still failing: dropped, so the route card says we couldn't check.
    const after = new Date(NOW.getTime() + 16 * 60_000);
    held = holdDisruptions(held, { lines: first.lines, stations: null, fetchedAt: after.toISOString() });
    expect(held.stations).toBeNull();
    expect(held.lines?.fetchedAt).toBe(after.toISOString());
    expect(closedAt(held, after)).toBeUndefined();
  });
});
