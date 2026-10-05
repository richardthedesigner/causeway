/**
 * Weather → routing conditions. Open-Meteo (CC BY 4.0; free tier is
 * non-commercial, see D-011). Rain makes setts, slabs and metal covers
 * slippery; ice and snow close steep and sett sections for wheeled users.
 * The cost model already takes { wet, ice }; this decides them.
 */
import type { Conditions } from "@causeway/router";
import { getJson, type LiveOptions } from "./http.js";

export interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    precipitation: number;
    rain?: number;
    snowfall?: number;
    weather_code: number;
    /** km/h. Present when asked for (openMeteoUrl does). */
    wind_gusts_10m?: number;
  };
  hourly?: {
    time: string[];
    precipitation: number[];
    temperature_2m: number[];
    /** Present when the forecast hours were asked for (openMeteoUrl does). */
    weather_code?: number[];
    snowfall?: number[];
    wind_gusts_10m?: number[];
  };
}

export const openMeteoUrl = (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
  "&current=temperature_2m,precipitation,rain,snowfall,weather_code,wind_gusts_10m" +
  "&hourly=precipitation,temperature_2m,weather_code,snowfall,wind_gusts_10m&past_hours=12&forecast_hours=48&timezone=UTC";

/**
 * Open-Meteo, asked for UTC, gives times without a zone ("2026-10-05T01:00"). `Date.parse` reads a
 * zoneless date-time as the device's local time, an hour out in British Summer Time, so every time
 * goes through this first (D-066).
 */
export const utcIso = (t: string) => (/[zZ]$|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}${t.length === 16 ? ":00" : ""}Z`);
const utcMs = (t: string) => Date.parse(utcIso(t));

// WMO weather codes: 51-67 drizzle/rain, 80-82 showers, 71-77/85-86 snow, 56-57/66-67 freezing.
const RAIN = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
const SNOW = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
const FREEZING = (c: number) => c === 56 || c === 57 || c === 66 || c === 67;

export interface WeatherConditions extends Conditions {
  /** Plain-language reason, shown to the user ("Wet: 1.2 mm of rain in the last 3 hours"). */
  summary: string;
  source: string;
  observedAt: string;
}

export function conditionsFromOpenMeteo(r: OpenMeteoResponse, now = new Date()): WeatherConditions {
  const c = r.current;
  const hours = r.hourly ?? { time: [], precipitation: [], temperature_2m: [] };
  // Past hours only: the response also carries the forecast.
  const past = (i: number, h: number) => {
    const t = utcMs(hours.time[i]!);
    return t >= now.getTime() - h * 3_600_000 && t <= now.getTime();
  };
  const sinceH = (h: number) => hours.precipitation.reduce((t, mm, i) => (past(i, h) ? t + (mm ?? 0) : t), 0);
  const rain3h = sinceH(3);
  const precip12h = sinceH(12);
  const minTemp12h = Math.min(c.temperature_2m, ...hours.temperature_2m.filter((_, i) => past(i, 12)));

  const ice = SNOW(c.weather_code) || FREEZING(c.weather_code) || (c.snowfall ?? 0) > 0 || (minTemp12h <= 1 && precip12h > 0.2);
  const wet = ice || RAIN(c.weather_code) || c.precipitation > 0 || rain3h > 0.2;
  const summary = ice
    ? `Icy or snowy: ${c.temperature_2m.toFixed(0)}°C${precip12h > 0 ? `, ${precip12h.toFixed(1)} mm in the last 12 hours` : ""}`
    : wet
      ? `Wet: ${rain3h > 0 ? `${rain3h.toFixed(1)} mm of rain in the last 3 hours` : "raining now"}`
      : "Dry";
  // Gusts (D-066): the stronger of now and the next hour, so a walk that starts calm isn't caught out.
  const next = hours.time.findIndex((t) => utcMs(t) > now.getTime());
  const gustNext = next >= 0 ? (r.hourly?.wind_gusts_10m?.[next] ?? 0) : 0;
  const gust = typeof c.wind_gusts_10m === "number" ? { gust: { kmh: Math.max(c.wind_gusts_10m, gustNext), at: utcIso(c.time), source: "Open-Meteo" } } : {};
  return { now, wet, ice, summary, source: "Open-Meteo (CC BY 4.0)", observedAt: c.time, ...gust };
}

/**
 * The ground at a later time, from the hourly forecast: the same rules as now, over the hours
 * before `when`. Falls back to the current conditions when the forecast doesn't reach that far.
 */
export function forecastConditions(r: OpenMeteoResponse, when: Date, now = new Date()): WeatherConditions {
  const h = r.hourly;
  let at = -1;
  for (const [i, t] of (h?.time ?? []).entries()) if (utcMs(t) <= when.getTime()) at = i;
  if (!h || at < 0 || when.getTime() - utcMs(h.time[at]!) > 3_600_000 || !h.weather_code) return conditionsFromOpenMeteo(r, now);
  const back = (hrs: number) => h.time.map((_, i) => i).filter((i) => utcMs(h.time[i]!) > when.getTime() - hrs * 3_600_000 && i <= at);
  const precip = (hrs: number) => back(hrs).reduce((t, i) => t + (h.precipitation[i] ?? 0), 0);
  const code = h.weather_code[at] ?? 0;
  const temp = h.temperature_2m[at] ?? 10;
  const minTemp12h = Math.min(...back(12).map((i) => h.temperature_2m[i] ?? 10));
  const snow = back(3).some((i) => (h.snowfall?.[i] ?? 0) > 0);
  const ice = SNOW(code) || FREEZING(code) || snow || (minTemp12h <= 1 && precip(12) > 0.2);
  const wet = ice || RAIN(code) || precip(3) > 0.2;
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(when);
  const summary = ice ? `Forecast icy or snowy at ${hhmm}: ${temp.toFixed(0)}°C` : wet ? `Forecast wet at ${hhmm}: ${precip(3).toFixed(1)} mm of rain in the 3 hours before` : `Forecast dry at ${hhmm}`;
  // Gusts at the hour you leave (D-066).
  const g = h.wind_gusts_10m?.[at];
  const gust = typeof g === "number" ? { gust: { kmh: g, at: utcIso(h.time[at]!), source: "Open-Meteo forecast" } } : {};
  return { now: when, wet, ice, summary, source: "Open-Meteo forecast (CC BY 4.0)", observedAt: h.time[at]!, ...gust };
}

export async function fetchConditions(lat: number, lon: number, fetchImpl: typeof fetch = fetch, now = new Date(), opts: Omit<LiveOptions, "fetchImpl"> = {}): Promise<WeatherConditions> {
  return conditionsFromOpenMeteo(await getJson<OpenMeteoResponse>(openMeteoUrl(lat, lon), "Open-Meteo", { ...opts, fetchImpl }), now);
}

/**
 * Air quality, pollen and UV from Open-Meteo's air quality API, which serves the Copernicus
 * Atmosphere Monitoring Service (CAMS) forecast. Same non-commercial terms as the weather (D-011).
 * These never change a route: they are area-wide lines, and only when they are high (D-066).
 */
export const airQualityUrl = (lat: number, lon: number) =>
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` + "&current=european_aqi,uv_index,grass_pollen,birch_pollen,alder_pollen&timezone=UTC";

export interface AirQualityResponse {
  current: {
    time: string;
    european_aqi?: number | null;
    uv_index?: number | null;
    grass_pollen?: number | null;
    birch_pollen?: number | null;
    alder_pollen?: number | null;
  };
}

/** One area-wide line, with its source and time. */
export interface AreaNote {
  text: string;
  source: string;
  /** ISO 8601, UTC. */
  at: string;
}

export const AIR_SOURCE = "Open-Meteo, Copernicus Atmosphere Monitoring Service";

/** European AQI bands (EEA): 60 and over is poor. */
const aqiWord = (v: number) => (v >= 100 ? "extremely poor" : v >= 80 ? "very poor" : v >= 60 ? "poor" : null);
/** WHO UV index bands: 6 and over is high. */
const uvWord = (v: number) => (v >= 11 ? "extreme" : v >= 8 ? "very high" : v >= 6 ? "high" : null);
/** Grains per cubic metre at which a count is high: grass 50, birch and alder 80. */
const POLLEN_HIGH: ["grass_pollen" | "birch_pollen" | "alder_pollen", string, number][] = [
  ["grass_pollen", "grass", 50],
  ["birch_pollen", "birch", 80],
  ["alder_pollen", "alder", 80],
];

/** Lines worth knowing about the air: only what is high, nothing on an ordinary day. */
export function airNotes(r: AirQualityResponse): AreaNote[] {
  const c = r?.current;
  if (!c || typeof c.time !== "string") throw new Error("Open-Meteo air quality: no current values");
  const at = utcIso(c.time);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const out: AreaNote[] = [];
  const aqi = n(c.european_aqi);
  const aw = aqi === null ? null : aqiWord(aqi);
  if (aw) out.push({ text: `Air quality ${aw} (European AQI ${Math.round(aqi!)})`, source: AIR_SOURCE, at });
  const pollen = POLLEN_HIGH.filter(([k, , high]) => (n(c[k]) ?? 0) >= high).map(([, word]) => word);
  if (pollen.length) out.push({ text: `Pollen high: ${pollen.join(", ")}`, source: AIR_SOURCE, at });
  const uv = n(c.uv_index);
  const uw = uv === null ? null : uvWord(uv);
  if (uw) out.push({ text: `UV ${uw} (index ${Math.round(uv!)})`, source: AIR_SOURCE, at });
  return out;
}

export async function fetchAirNotes(lat: number, lon: number, opts: LiveOptions = {}): Promise<AreaNote[]> {
  return airNotes(await getJson<AirQualityResponse>(airQualityUrl(lat, lon), "Open-Meteo air quality", opts));
}
