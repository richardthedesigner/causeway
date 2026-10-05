/**
 * Weather → routing conditions. Open-Meteo (CC BY 4.0; free tier is
 * non-commercial, see D-011). Rain makes setts, slabs and metal covers
 * slippery; ice and snow close steep and sett sections for wheeled users.
 * The cost model already takes { wet, ice }; this decides them.
 */
import type { Conditions } from "@causeway/router";
import { getJson } from "./timeout.js";

export interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    precipitation: number;
    rain?: number;
    snowfall?: number;
    weather_code: number;
  };
  hourly?: {
    time: string[];
    precipitation: number[];
    temperature_2m: number[];
    /** Present when the forecast hours were asked for (openMeteoUrl does). */
    weather_code?: number[];
    snowfall?: number[];
  };
}

export const openMeteoUrl = (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
  "&current=temperature_2m,precipitation,rain,snowfall,weather_code" +
  "&hourly=precipitation,temperature_2m,weather_code,snowfall&past_hours=12&forecast_hours=48&timezone=UTC";

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
    const t = Date.parse(hours.time[i]!);
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
  return { now, wet, ice, summary, source: "Open-Meteo (CC BY 4.0)", observedAt: c.time };
}

/**
 * The ground at a later time, from the hourly forecast: the same rules as now, over the hours
 * before `when`. Falls back to the current conditions when the forecast doesn't reach that far.
 */
export function forecastConditions(r: OpenMeteoResponse, when: Date, now = new Date()): WeatherConditions {
  const h = r.hourly;
  let at = -1;
  for (const [i, t] of (h?.time ?? []).entries()) if (Date.parse(t) <= when.getTime()) at = i;
  if (!h || at < 0 || when.getTime() - Date.parse(h.time[at]!) > 3_600_000 || !h.weather_code) return conditionsFromOpenMeteo(r, now);
  const back = (hrs: number) => h.time.map((_, i) => i).filter((i) => Date.parse(h.time[i]!) > when.getTime() - hrs * 3_600_000 && i <= at);
  const precip = (hrs: number) => back(hrs).reduce((t, i) => t + (h.precipitation[i] ?? 0), 0);
  const code = h.weather_code[at] ?? 0;
  const temp = h.temperature_2m[at] ?? 10;
  const minTemp12h = Math.min(...back(12).map((i) => h.temperature_2m[i] ?? 10));
  const snow = back(3).some((i) => (h.snowfall?.[i] ?? 0) > 0);
  const ice = SNOW(code) || FREEZING(code) || snow || (minTemp12h <= 1 && precip(12) > 0.2);
  const wet = ice || RAIN(code) || precip(3) > 0.2;
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(when);
  const summary = ice ? `Forecast icy or snowy at ${hhmm}: ${temp.toFixed(0)}°C` : wet ? `Forecast wet at ${hhmm}: ${precip(3).toFixed(1)} mm of rain in the 3 hours before` : `Forecast dry at ${hhmm}`;
  return { now: when, wet, ice, summary, source: "Open-Meteo forecast (CC BY 4.0)", observedAt: h.time[at]! };
}

export async function fetchConditions(lat: number, lon: number, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<WeatherConditions> {
  return conditionsFromOpenMeteo(await getJson<OpenMeteoResponse>(openMeteoUrl(lat, lon), "Open-Meteo", { fetchImpl }), now);
}
