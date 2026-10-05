import { gunzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hoursAt, hoursText, parseHours, setBankHolidays } from "../src/lib/opening-hours";

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

describe("bank holidays (SMALL-01)", () => {
  // Winter: GMT, so UTC+0.
  const gmt = (raw: string, local: string) => hoursAt(parseHours(raw)!, new Date(`${local}Z`));
  afterEach(() => setBankHolidays(null));

  it("uses the place's holiday hours on a bank holiday, and its usual hours either side", () => {
    setBankHolidays("england-and-wales");
    const h = "Mo-Sa 09:00-17:30; PH 10:00-16:00";
    expect(gmt(h, "2026-12-25T12:00").text).toBe("Open until 16:00 (Christmas Day)");
    expect(gmt(h, "2026-12-24T18:00").text).toBe("Closed, opens tomorrow 10:00");
    expect(gmt(h, "2026-12-29T12:00").text).toBe("Open until 17:30");
  });

  it("knows a place shut on bank holidays is shut, and says when it opens next", () => {
    setBankHolidays("england-and-wales");
    // Friday 25th and the substitute Boxing Day, Monday 28th, are both holidays.
    expect(gmt("Mo-Fr 09:00-17:00; PH off", "2026-12-25T12:00")).toEqual({ open: false, text: "Closed, opens Tuesday 09:00 (Christmas Day)" });
  });

  it("without a holiday rule, says the hours may differ only on the day itself", () => {
    setBankHolidays("england-and-wales");
    expect(gmt("Mo-Fr 09:00-17:00", "2026-12-25T12:00").text).toBe("Open until 17:00 (may differ today: Christmas Day)");
    expect(gmt("Mo-Fr 09:00-17:00; PH off", "2026-12-23T12:00").text).toBe("Open until 17:00");
  });

  it("follows the city's nation: St Andrew's Day is a holiday in Edinburgh, not in London", () => {
    const h = "Mo-Fr 09:00-17:00; PH off";
    setBankHolidays("scotland");
    expect(gmt(h, "2026-11-30T12:00").open).toBe(false);
    setBankHolidays("england-and-wales");
    expect(gmt(h, "2026-11-30T12:00").open).toBe(true);
  });

  it("falls back to a general warning past the dates GOV.UK has published", () => {
    setBankHolidays("england-and-wales");
    expect(gmt("Mo-Fr 09:00-17:00; PH off", "2031-06-02T12:00").text).toBe("Open until 17:00 (may differ on bank holidays)");
  });
});
