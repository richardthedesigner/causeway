import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { conditionsFromOpenMeteo, forecastConditions, parseLiftDisruptions, toLiveStates, type OpenMeteoResponse } from "@causeway/live";

describe("TfL lift disruptions", () => {
  // Real response recorded 2026-10-04.
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/tfl-lifts-2026-10-04.json"), "utf8"));
  const outages = parseLiftDisruptions(raw, "2026-10-04T12:00:00Z");

  it("parses every disruption in the recorded feed", () => {
    expect(outages).toHaveLength(raw.length);
    expect(outages.every((o) => o.liftIds.length > 0)).toBe(true);
  });

  it("pulls the station name out of the message", () => {
    expect(outages.find((o) => o.stationId === "940GZZLUWYP")?.stationName).toBe("Wembley Park");
  });

  it("closes the mapped lift edges, and the closure expires on its own", () => {
    const o = outages.find((x) => x.stationId === "940GZZLUWYP")!;
    const states = toLiveStates([o], new Map([[o.liftIds[0]!, [42]]]), 15);
    const s = states.get(42)!;
    expect(s.status).toBe("closed");
    expect(Date.parse(s.validUntil) - Date.parse(s.validFrom)).toBe(15 * 60_000);
  });

  it("rejects a malformed feed rather than reporting no outages", () => {
    expect(() => parseLiftDisruptions({ error: "x" }, "2026-10-04T12:00:00Z")).toThrow();
  });
});

describe("weather to conditions", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const hourly = (p: number[], t: number[]) => ({
    time: p.map((_, i) => new Date(now.getTime() - (p.length - 1 - i) * 3_600_000).toISOString()),
    precipitation: p,
    temperature_2m: t,
  });
  // Shape follows Open-Meteo's documented forecast response; values are synthetic.
  const base = (over: Partial<OpenMeteoResponse["current"]>, h = hourly([0, 0, 0], [12, 12, 12])): OpenMeteoResponse => ({
    current: { time: now.toISOString(), temperature_2m: 12, precipitation: 0, weather_code: 1, ...over },
    hourly: h,
  });

  it("is dry when nothing has fallen", () => {
    const c = conditionsFromOpenMeteo(base({}), now);
    expect([c.wet, c.ice, c.summary]).toEqual([false, false, "Dry"]);
  });
  it("is wet after recent rain even if it has stopped", () => {
    const c = conditionsFromOpenMeteo(base({}, hourly([0, 1.5, 0], [12, 12, 12])), now);
    expect(c.wet).toBe(true);
    expect(c.ice).toBe(false);
  });
  it("is icy when it rained and the temperature fell to freezing", () => {
    const c = conditionsFromOpenMeteo(base({ temperature_2m: 2 }, hourly([1, 0, 0], [3, 1, 0])), now);
    expect(c.ice).toBe(true);
    expect(c.wet).toBe(true);
  });
  it("treats snow as ice", () => {
    expect(conditionsFromOpenMeteo(base({ weather_code: 73 }), now).ice).toBe(true);
  });

  // Hours from 12:00 to 21:00 UTC: dry now, rain from 17:00.
  const ahead = (): OpenMeteoResponse => {
    const t = Array.from({ length: 10 }, (_, i) => new Date(now.getTime() + i * 3_600_000).toISOString());
    return {
      current: { time: now.toISOString(), temperature_2m: 12, precipitation: 0, weather_code: 1 },
      hourly: { time: t, precipitation: t.map((_, i) => (i >= 5 ? 1.2 : 0)), temperature_2m: t.map(() => 11), weather_code: t.map((_, i) => (i >= 5 ? 61 : 1)), snowfall: t.map(() => 0) },
    };
  };
  it("ignores forecast hours when working out the ground now", () => {
    expect(conditionsFromOpenMeteo(ahead(), now).wet).toBe(false);
  });
  it("uses the forecast for a later trip, and says it's a forecast", () => {
    const later = forecastConditions(ahead(), new Date("2026-10-04T18:30:00Z"), now);
    expect(later.wet).toBe(true);
    expect(later.summary).toBe("Forecast wet at 19:30: 2.4 mm of rain in the 3 hours before");
    expect(forecastConditions(ahead(), new Date("2026-10-04T14:00:00Z"), now).summary).toBe("Forecast dry at 15:00");
    // Beyond the forecast: what we know now.
    expect(forecastConditions(ahead(), new Date("2026-10-06T14:00:00Z"), now).summary).toBe("Dry");
  });
});

describe("Street Manager activities (DATA-05)", async () => {
  const { streetManagerActivityObservations } = await import("../src/works.js");
  const osgb = (e: number, n: number): [number, number] => [e / 1e5, n / 1e5];
  const act = (over: Record<string, string | null> = {}) => ({
    ref: "ARN-1",
    event_time: "2026-09-15T10:00:00Z",
    event_type: "ACTIVITY_CREATED",
    geom: "POINT(425000 564000)",
    street: "STOREY'S GATE",
    activity: "skips",
    details: null,
    location_type: "Footway",
    cancelled: "No",
    start_date: "2026-10-01T00:00:00.000Z",
    start_time: null,
    end_date: "2026-10-05T00:00:00.000Z",
    end_time: null,
    ...over,
  });
  const now = new Date("2026-10-04T12:00:00Z");

  it("keeps activities on the pavement, never as closed, until the end of the last day", () => {
    const [o] = streetManagerActivityObservations([act()], osgb, now);
    expect(o).toMatchObject({ id: "sma:ARN-1", footway: "affected", description: "A skip on the pavement", street: "Storey's Gate", start: "2026-10-01T00:00:00.000Z", end: "2026-10-05T23:59:59.000Z" });
  });

  it("uses the end time when given, and never shows the record's free text (D-052)", () => {
    const [o] = streetManagerActivityObservations([act({ activity: "other", details: "Bridge maintenance works", end_time: "2026-10-05T18:00:00.000Z" })], osgb, now);
    expect(o!.end).toBe("2026-10-05T18:00:00.000Z");
    expect(o!.description).toBe("An obstruction on the pavement");
  });

  it("leaves out road-only, cancelled and finished activities", () => {
    expect(streetManagerActivityObservations([act({ location_type: "Carriageway" }), act({ cancelled: "Yes" }), act({ event_type: "ACTIVITY_CANCELLED" }), act({ end_date: "2026-10-01T00:00:00.000Z" })], osgb, now)).toEqual([]);
  });
});
