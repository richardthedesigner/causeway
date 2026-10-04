import { gunzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hoursAt, hoursText, parseHours } from "../src/lib/opening-hours";

// Sunday 4 October 2026 is BST (UTC+1).
const uk = (local: string) => new Date(`${local}+01:00`);
const at = (raw: string, local: string) => hoursAt(parseHours(raw)!, uk(local));

describe("opening hours", () => {
  it("reads weekday rules, days off and later rules overriding earlier ones", () => {
    const h = "Mo-Sa 10:00-18:00; Su 11:00-17:00";
    expect(at(h, "2026-10-04T12:00")).toEqual({ open: true, text: "Open until 17:00" });
    expect(at(h, "2026-10-04T17:45").text).toBe("Closed, opens tomorrow 10:00");
    expect(at(h, "2026-10-05T09:00").text).toBe("Closed, opens 10:00");
    expect(at(h, "2026-10-05T17:40").text).toBe("Open until 18:00, closing soon");
    expect(at("Mo-Fr 09:00-17:00; Sa,Su off", "2026-10-03T12:00").text).toBe("Closed, opens Monday 09:00");
    expect(at("Mo-Su 09:00-17:00; Su off", "2026-10-04T12:00").open).toBe(false);
  });

  it("handles past midnight, 24/7, split days and public holidays", () => {
    expect(at("Mo-Su 12:00-01:00", "2026-10-05T00:30")).toEqual({ open: true, text: "Open until 01:00, closing soon" });
    expect(at("24/7", "2026-10-04T03:00").text).toBe("Open 24 hours");
    expect(at("Mo-Fr 09:00-12:30,13:30-17:00", "2026-10-05T13:00").text).toBe("Closed, opens 13:30");
    expect(at("Mo-Fr 08:00-18:00; PH off", "2026-10-05T12:00").text).toBe("Open until 18:00 (may differ on bank holidays)");
    expect(at("10:00-16:00", "2026-10-04T11:00").open).toBe(true);
  });

  it("says the hours as mapped, never a guess, when it can't read them", () => {
    expect(parseHours("Mo-Fr 09:00-17:00; Jan off")).toBeNull();
    expect(parseHours("sunrise-sunset")).toBeNull();
    expect(hoursText("Mo-Fr 10:00+", new Date())).toEqual({ open: null, text: "Hours as mapped: Mo-Fr 10:00+" });
  });

  it("reads most of what's mapped in our cities", () => {
    const dir = join(import.meta.dirname, "../../../data/places");
    let all = 0,
      read = 0;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json.gz"))) {
      const places = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString()).places as { a?: Record<string, string> }[];
      for (const p of places) {
        const h = p.a?.opening_hours;
        if (!h) continue;
        all++;
        if (parseHours(h)) read++;
      }
    }
    console.log(`opening hours read: ${read} of ${all}`);
    expect(read / all).toBeGreaterThan(0.85);
  });
});
