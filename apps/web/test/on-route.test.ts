import { describe, expect, it } from "vitest";
import type { OnRouteItem } from "@causeway/router";
import { blockedLine, floodLine, itemMeta, onRouteAside, onRouteUrgent, whereText } from "../src/lib/on-route";

const item = (o: Partial<OnRouteItem>): OnRouteItem => ({ group: "info", text: "x", where: [], label: "static", source: "OpenStreetMap", date: null, until: null, ...o });
const NOW = new Date("2026-10-05T11:30:00Z");

describe("On this route, in words (D-067)", () => {
  it("labels every fact with its kind, source and date, and the end when there is one", () => {
    expect(itemMeta(item({ label: "live", source: "TfL", date: "2026-10-05T11:05:00Z" }), NOW)).toBe("Live, TfL, at 12:05");
    expect(itemMeta(item({ label: "live", source: "TfL", date: "2026-10-04T11:05:00Z" }), NOW)).toBe("Live, TfL, at 12:05 on 4 Oct 2026");
    expect(itemMeta(item({ source: "Scottish Road Works Register", date: "2026-10-01", until: "2026-11-30T00:00:00Z" }), NOW)).toBe("Static data, Scottish Road Works Register, dated 1 Oct 2026, until 30 Nov 2026");
    expect(itemMeta(item({ label: "reported", source: "OpenStreetMap Notes", date: "2026-09-12" }), NOW)).toBe("Reported by people, OpenStreetMap Notes, dated 12 Sep 2026");
    // An end years away is a placeholder.
    expect(itemMeta(item({ until: "2030-01-01T00:00:00Z" }), NOW)).toBe("Static data, OpenStreetMap");
  });

  it("counts what's inside on the summary row, and opens only for blocked or slower", () => {
    const list = [item({ group: "blocked" }), item({ group: "info" }), item({ group: "info", text: "y" })];
    expect(onRouteAside(list)).toBe("1 blocked, 2 worth knowing");
    expect(onRouteAside([])).toBe("Nothing known");
    expect(onRouteUrgent(list)).toBe(true);
    expect(onRouteUrgent([item({})])).toBe(false);
  });

  it("names up to two places, then counts", () => {
    expect(whereText([])).toBeNull();
    expect(whereText(["West Port", "Grassmarket"])).toBe("On West Port and Grassmarket");
    expect(whereText(["A", "B", "C", "D"])).toBe("On A, B and 2 more");
  });

  it("puts one line on the route card for closures gone round, and one for a flood area on the route", () => {
    expect(blockedLine([item({ group: "blocked" })])).toBe("Goes round a closure on the way. See On this route.");
    expect(blockedLine([item({ group: "blocked" }), item({ group: "blocked", text: "y" })])).toBe("Goes round 2 closures on the way. See On this route.");
    expect(blockedLine([item({ group: "slower" })])).toBeNull();
    expect(floodLine([item({ group: "slower", source: "Environment Agency" })])).toBe("Passes through a flood warning area. See On this route.");
    expect(floodLine([item({ group: "info", source: "Environment Agency" })])).toBeNull();
  });
});
