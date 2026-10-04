import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSnapshot } from "@causeway/graph/node";
import { PRESETS } from "@causeway/profile";
import { diagnose, Router, summarise, type Diagnosis } from "@causeway/router";

const p = PRESETS["manual-wheelchair"];
let router: Router;
let d: Diagnosis;

// Causewayside to the top of Castle Wynd South, a 12.8% climb from the Grassmarket that no manual chair preset takes.
beforeAll(() => {
  const g = loadSnapshot(join(import.meta.dirname, "../../../data/snapshots/edinburgh-central.graph.json.gz"));
  router = new Router(g);
  const a = router.snap(-3.1812, 55.9385, p);
  const wynd = g.edges.find((e) => e.name === "Castle Wynd South")!;
  const top = [wynd.geometry[0]!, wynd.geometry.at(-1)!].map(([lon, lat]) => router.snap(lon, lat, PRESETS.walking)).find((n) => !router.route(a, n, p, undefined))!;
  expect(top).toBeDefined();
  d = diagnose(router, a, top, p, PRESETS.walking);
}, 60_000);

describe("diagnose: when nothing fits", () => {
  it("names what is in the way, past the point you can reach", () => {
    expect(d.blockers.length).toBeGreaterThan(0);
    expect(d.blockers[0]).toMatchObject({ name: "Castle Wynd South", attr: "incline" });
  });

  it("finds how close you can get", () => {
    expect(d.closest).not.toBeNull();
    expect(d.closest!.leftM).toBeLessThan(150);
    expect(summarise(d.closest!.route).verdict).not.toBe("not-passable");
  });

  it("offers the smallest one-off change that finds a way, and only that", () => {
    expect(d.relax).not.toBeNull();
    expect(Object.keys(d.relax!.patch)).toEqual(["maxInclineUpPct"]);
    expect(d.relax!.patch.maxInclineUpPct).toBeGreaterThan(p.maxInclineUpPct);
    expect(d.relax!.what[0]).toMatch(/^slopes up to \d+%$/);
  });
});
