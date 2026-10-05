/**
 * Weather and health extras (D-066): Open-Meteo times in UTC, gusts, air
 * quality, pollen and UV, UKHSA heat and cold alerts, and SEPA's Water of
 * Leith level. Real responses recorded 2026-10-05 (a calm night: every alert
 * green), plus alerts and readings made up in the feeds' own shapes to test
 * what happens when they fire.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  airNotes,
  airQualityUrl,
  alertFor,
  alertInForce,
  conditionsFromOpenMeteo,
  fetchAirNotes,
  fetchHealthAlert,
  fetchRiverLevel,
  forecastConditions,
  inSeason,
  parseLatestLevel,
  parseRegionAlerts,
  riverHigh,
  riverLine,
  sepaLevelUrl,
  strongestAlert,
  ukhsaAlertsUrl,
  ukhsaAlertUrl,
  UKHSA_REGIONS,
  usesWalkway,
  utcIso,
  WATER_OF_LEITH_HIGH_M,
  type OpenMeteoResponse,
} from "@causeway/live";

const fixture = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", f), "utf8"));
const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("Open-Meteo times are UTC, wherever the phone is", () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });
  it("adds the zone Open-Meteo leaves off", () => {
    expect(utcIso("2026-10-05T01:00")).toBe("2026-10-05T01:00:00Z");
    expect(utcIso("2026-10-05T01:00:00Z")).toBe("2026-10-05T01:00:00Z");
    expect(utcIso("2026-08-18T09:00:00+01:00")).toBe("2026-08-18T09:00:00+01:00");
  });
  it("doesn't count a forecast hour as past in British Summer Time", () => {
    // A phone in London in October is on BST: read as local time, 13:00 would be 12:00 UTC, "now".
    process.env.TZ = "Europe/London";
    const now = new Date("2026-10-04T12:00:00Z");
    const r: OpenMeteoResponse = {
      current: { time: "2026-10-04T12:00", temperature_2m: 12, precipitation: 0, weather_code: 1 },
      hourly: { time: ["2026-10-04T09:00", "2026-10-04T10:00", "2026-10-04T11:00", "2026-10-04T12:00", "2026-10-04T13:00"], precipitation: [0, 0, 0, 0, 3], temperature_2m: [12, 12, 12, 12, 12] },
    };
    expect(conditionsFromOpenMeteo(r, now).wet).toBe(false);
    // And an hour that is past still counts: 09:00 UTC is three hours back, not four.
    const early = { ...r, hourly: { ...r.hourly!, precipitation: [3, 0, 0, 0, 0] } };
    expect(conditionsFromOpenMeteo(early, now).wet).toBe(true);
  });
});

describe("Open-Meteo gusts", () => {
  const r = fixture("open-meteo-gusts-2026-10-05.json") as OpenMeteoResponse;
  it("asks for gusts now and by the hour", () => {
    expect(r.current.wind_gusts_10m).toBeTypeOf("number");
  });
  it("takes the stronger of now and the next hour, with the time in UTC", () => {
    const now = new Date("2026-10-05T01:10:00Z");
    const c = conditionsFromOpenMeteo(r, now);
    const next = r.hourly!.time.indexOf("2026-10-05T02:00");
    expect(c.gust).toEqual({ kmh: Math.max(r.current.wind_gusts_10m!, r.hourly!.wind_gusts_10m![next]!), at: "2026-10-05T01:00:00Z", source: "Open-Meteo" });
  });
  it("uses the forecast hour when you leave later", () => {
    const i = r.hourly!.time.indexOf("2026-10-05T09:00");
    const c = forecastConditions(r, new Date("2026-10-05T09:00:00Z"), new Date("2026-10-05T01:10:00Z"));
    expect(c.gust).toEqual({ kmh: r.hourly!.wind_gusts_10m![i], at: "2026-10-05T09:00:00Z", source: "Open-Meteo forecast" });
  });
});

describe("Open-Meteo air quality, pollen and UV (CAMS)", () => {
  it("reads from the pinned host", () => {
    expect(airQualityUrl(55.9486, -3.1999)).toMatch(/^https:\/\/air-quality-api\.open-meteo\.com\/v1\/air-quality\?latitude=55\.949&longitude=-3\.200&/);
  });
  it("says nothing on an ordinary night (AQI 57 is under 60)", () => {
    expect(airNotes(fixture("open-meteo-air-2026-10-05.json"))).toEqual([]);
  });
  it("lists only what is high, crediting CAMS, with the time", () => {
    const notes = airNotes({ current: { time: "2026-06-20T13:00", european_aqi: 64, uv_index: 7.2, grass_pollen: 85, birch_pollen: 79, alder_pollen: null } });
    const source = "Open-Meteo, Copernicus Atmosphere Monitoring Service";
    expect(notes).toEqual([
      { text: "Air quality poor (European AQI 64)", source, at: "2026-06-20T13:00:00Z" },
      { text: "Pollen high: grass", source, at: "2026-06-20T13:00:00Z" },
      { text: "UV high (index 7)", source, at: "2026-06-20T13:00:00Z" },
    ]);
    expect(airNotes({ current: { time: "2026-04-01T13:00", birch_pollen: 80, uv_index: 5.9 } }).map((n) => n.text)).toEqual(["Pollen high: birch"]);
  });
  it("refuses a response with no current values rather than saying the air is fine", async () => {
    await expect(fetchAirNotes(55.9, -3.2, { fetchImpl: ok({ error: true }) })).rejects.toThrow();
  });
});

describe("UKHSA heat and cold alerts", () => {
  it("reads from the pinned paths", () => {
    expect(ukhsaAlertsUrl("heat")).toBe("https://ukhsa-dashboard.data.gov.uk/api/proxy/alerts/v1/heat");
    expect(ukhsaAlertsUrl("cold")).toBe("https://ukhsa-dashboard.data.gov.uk/api/proxy/alerts/v1/cold");
    expect(ukhsaAlertUrl("heat", UKHSA_REGIONS.london.code)).toBe("https://ukhsa-dashboard.data.gov.uk/api/proxy/alerts/v1/heat/E12000007");
    expect(UKHSA_REGIONS.northEast.code).toBe("E12000001");
  });

  const summer = new Date("2026-08-17T12:00:00Z");
  it("finds nothing to say on the recorded green day", () => {
    const heat = parseRegionAlerts(fixture("ukhsa-heat-2026-10-05.json"));
    const cold = parseRegionAlerts(fixture("ukhsa-cold-2026-10-05.json"));
    expect(heat).toHaveLength(9);
    expect(alertFor("heat", heat, UKHSA_REGIONS.london.code, undefined, summer)).toBeNull();
    expect(alertFor("cold", cold, UKHSA_REGIONS.london.code, undefined, new Date("2026-12-01T12:00:00Z"))).toBeNull();
  });

  const amber = () => parseRegionAlerts(fixture("ukhsa-heat-2026-10-05.json")).map((r) => (r.regionCode === "E12000007" ? { ...r, status: "Amber" as const } : r));
  const detail = { ...fixture("ukhsa-heat-london-2026-10-05.json"), status: "Amber" };

  it("raises amber and red, with the end from the region's own record", () => {
    expect(alertFor("heat", amber(), "E12000007", detail, summer)).toEqual({ kind: "heat", level: "amber", region: "London", at: "2026-08-18T08:00:00.000Z", until: "2026-08-18T08:00:00.000Z" });
    // Without the record, an in-season alert still counts, with no end.
    expect(alertFor("heat", amber(), "E12000007", undefined, summer)?.until).toBeUndefined();
    const red = { kind: "cold" as const, level: "red" as const, region: "London", at: "x" };
    expect(strongestAlert(alertFor("heat", amber(), "E12000007", undefined, summer), red, null)).toBe(red);
  });

  it("doesn't count an alert past its end date (#36 follow-up)", () => {
    expect(alertFor("heat", amber(), "E12000007", detail, new Date("2026-08-18T08:00:00Z"))).toBeNull();
    expect(alertInForce({ kind: "heat", level: "amber", region: "London", at: "x", until: "2026-08-18T08:00:00Z" }, new Date("2026-08-18T07:59:00Z"))).toBe(true);
  });

  it("doesn't count an alert outside its season: the list still shows August's on 5 October", () => {
    const oct = new Date("2026-10-05T12:00:00Z");
    expect(alertFor("heat", amber(), "E12000007", undefined, oct)).toBeNull();
    expect([inSeason("heat", new Date("2026-06-01T00:30:00+01:00")), inSeason("heat", new Date("2026-09-30T22:59:00Z")), inSeason("heat", new Date("2026-09-30T23:00:00Z"))]).toEqual([true, true, false]);
    expect([inSeason("cold", new Date("2026-11-01T00:00:00Z")), inSeason("cold", new Date("2027-03-31T12:00:00Z")), inSeason("cold", new Date("2026-10-31T12:00:00Z"))]).toEqual([true, true, false]);
  });

  it("lets the region's own record have the last word on the status", () => {
    expect(alertFor("heat", amber(), "E12000007", fixture("ukhsa-heat-london-2026-10-05.json"), summer)).toBeNull();
  });

  it("drops a status it doesn't know rather than reading it as green", () => {
    expect(parseRegionAlerts([{ status: "Purple", geography_code: "E12000007" }])).toEqual([]);
    expect(() => parseRegionAlerts({})).toThrow();
  });

  it("asks nothing out of season, and fails loudly when an in-season feed fails", async () => {
    let asked = 0;
    const counting = (async () => {
      asked++;
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchHealthAlert("E12000007", { fetchImpl: counting }, new Date("2026-10-05T12:00:00Z"))).toBeNull();
    expect(asked).toBe(0);
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchHealthAlert("E12000007", { fetchImpl: down }, summer)).rejects.toThrow(/UKHSA heat alerts: HTTP 503/);
  });
});

describe("SEPA: the Water of Leith at Murrayfield", () => {
  it("reads the pinned 15-minute series", () => {
    expect(sepaLevelUrl()).toContain("ts_id=54261010");
    expect(sepaLevelUrl()).toMatch(/^https:\/\/timeseries\.sepa\.org\.uk\/KiWIS\/KiWIS\?/);
  });
  it("takes the latest reading, and says nothing at a normal level", async () => {
    const level = parseLatestLevel(fixture("sepa-murrayfield-2026-10-05.json"))!;
    expect(level).toEqual({ metres: 0.484, at: "2026-10-05T00:00:00.000Z" });
    expect(riverHigh(level)).toBe(false);
    expect(riverHigh({ metres: WATER_OF_LEITH_HIGH_M, at: level.at })).toBe(true);
    expect(WATER_OF_LEITH_HIGH_M).toBe(1.05);
    expect(await fetchRiverLevel({ fetchImpl: ok(fixture("sepa-murrayfield-2026-10-05.json")) })).toEqual(level);
    expect(() => parseLatestLevel({})).toThrow();
  });
  it("only matters on the walkway, and says where it's from", () => {
    expect(usesWalkway(["Leith Walk", null, "Water of Leith Walkway"])).toBe(true);
    expect(usesWalkway(["Leith Walk", "Water of Leith Visitor Centre"])).toBe(false);
    expect(riverLine({ metres: 1.2, at: "2026-10-05T00:00:00.000Z" }, (t) => t.slice(11, 16))).toBe("Water of Leith high at Murrayfield (1.20 m): the walkway can flood. Worth knowing, not a warning (SEPA, 00:00).");
  });
});
