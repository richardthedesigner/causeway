import { describe, expect, it } from "vitest";
import { airLines, areaStatus, gustStatus, healthAlertStatus } from "../src/lib/area-status";
import { CITIES } from "../src/lib/cities";

describe("weather and health extras (D-066)", () => {
  it("puts England's cities in their UKHSA regions, and Edinburgh in none", () => {
    expect(CITIES.find((c) => c.id === "london")?.ukhsaRegion).toEqual({ code: "E12000007", name: "London" });
    expect(CITIES.find((c) => c.id === "newcastle")?.ukhsaRegion).toEqual({ code: "E12000001", name: "North East" });
    expect(CITIES.find((c) => c.id === "edinburgh")?.ukhsaRegion).toBeUndefined();
    expect(CITIES.find((c) => c.id === "edinburgh")?.riverLevel).toBe(true);
    expect(CITIES.every((c) => c.credit.includes("Copernicus Atmosphere Monitoring Service"))).toBe(true);
  });

  it("says the UKHSA alert with its end, none, or that it couldn't check", () => {
    const at = "2026-07-18T09:05:00.000Z";
    expect(healthAlertStatus({ state: "ok", alert: { kind: "heat", level: "red", region: "London", at, until: "2026-07-20T08:00:00.000Z" }, at, region: "London" })).toBe(
      "UKHSA red heat health alert for London until 20 Jul, 08:00 UTC, checked at 09:05 UTC. Routes for people who need rests favour benches and cover.",
    );
    expect(healthAlertStatus({ state: "ok", alert: null, at, region: "North East" })).toBe("Heat and cold health alerts for North East from UKHSA at 09:05 UTC: none at amber or red in force.");
    expect(healthAlertStatus({ state: "failed", region: "London", at })).toBe("Couldn't get heat and cold health alerts for London from UKHSA at 09:05 UTC.");
    expect(healthAlertStatus({ state: "none" })).toBeNull();
  });

  it("gives gusts with source and time, and says what they change from 50 km/h", () => {
    expect(gustStatus({ kmh: 43.6, at: "2026-10-05T01:00:00Z", source: "Open-Meteo" })).toBe("Gusts up to 44 km/h, from Open-Meteo for 5 Oct, 01:00 UTC.");
    expect(gustStatus({ kmh: 62, at: "2026-10-05T01:00:00Z", source: "Open-Meteo" })).toMatch(/Exposed bridges cost more/);
  });

  it("lists air lines only when high, and the river quietly", () => {
    const air = [{ text: "UV high (index 7)", source: "Open-Meteo, Copernicus Atmosphere Monitoring Service", at: "2026-06-20T13:00:00Z" }];
    expect(airLines(air)).toEqual(["UV high (index 7), across the area (Open-Meteo, Copernicus Atmosphere Monitoring Service, 20 Jun, 13:00 UTC)."]);
    expect(airLines(null)).toEqual([]);
    expect(areaStatus({ air: [], airFailed: false, river: { metres: 0.484, at: "2026-10-05T00:00:00.000Z" }, riverFailed: false }, true)).toEqual([
      "Air quality, pollen and UV from the Copernicus Atmosphere Monitoring Service, via Open-Meteo: nothing high.",
      "Water of Leith at Murrayfield from SEPA at 00:00 UTC: 0.48 m. Said on routes using the walkway from 1.05 m.",
    ]);
    expect(areaStatus({ air: null, airFailed: true, river: null, riverFailed: true }, false)).toEqual(["Couldn't get air quality, pollen and UV from Open-Meteo."]);
  });
});
