import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteMyData, myDataExport, myDataSummary } from "../src/lib/my-data";

/** A localStorage stand-in. */
class Mem implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

describe("your data (SEC-06)", () => {
  let local: Mem;
  beforeEach(() => {
    local = new Mem();
    Object.assign(globalThis, { localStorage: local, sessionStorage: new Mem() });
    local.setItem("causewayside.devices.v1", JSON.stringify([{ id: "a", name: "Cherry", profile: { preset: "powerchair" } }, { id: "b", name: "", profile: { preset: "walking" } }]));
    local.setItem("causewayside.notes.v1", JSON.stringify([{ id: "n1", text: "Kerb" }]));
    local.setItem("causewayside.reports.v1", "[]");
    local.setItem("causewayside.recents.edinburgh.v1", JSON.stringify([{ id: "p1" }, { id: "p2" }]));
    local.setItem("causewayside.recents.edinburgh.v1.backup", JSON.stringify([{ id: "old" }]));
    local.setItem("causewayside.session.v1", JSON.stringify({ access_token: "secret" }));
    local.setItem("someone-else", "keep me");
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  it("counts what's on this phone", () => {
    expect(myDataSummary()).toEqual({ devices: 2, notes: 1, reports: 0, whatsThere: 0, community: 0, votes: 0, recents: 2, saved: 0, shared: false });
  });

  it("counts what's-there reports apart from problem reports (FEAT-03)", () => {
    local.setItem("causewayside.reports.v1", JSON.stringify([{ id: "r1", kind: "kerb" }, { id: "r2", kind: "whats-there", about: { place: "Jawbone Walk", answers: [] } }]));
    expect(myDataSummary()).toMatchObject({ reports: 1, whatsThere: 1 });
  });

  it("exports everything the app keeps, but never the sign-in token", () => {
    const copy = JSON.parse(myDataExport(new Date("2026-10-05T10:00:00Z")));
    expect(copy.exportedAt).toBe("2026-10-05T10:00:00.000Z");
    expect(Object.keys(copy.data)).toEqual(["causewayside.devices.v1", "causewayside.notes.v1", "causewayside.recents.edinburgh.v1", "causewayside.recents.edinburgh.v1.backup", "causewayside.reports.v1"]);
    expect(copy.data["causewayside.devices.v1"][0].name).toBe("Cherry");
    expect(JSON.stringify(copy)).not.toContain("secret");
  });

  it("deletes everything the app keeps, backups and sign-in included, and nothing else", async () => {
    expect(await deleteMyData()).toBe("done");
    expect(local.length).toBe(1);
    expect(local.getItem("someone-else")).toBe("keep me");
  });
});
