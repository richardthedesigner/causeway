/**
 * Weather → routing conditions. Open-Meteo (CC BY 4.0; free tier is
 * non-commercial, see D-011). Rain makes setts, slabs and metal covers
 * slippery; ice and snow close steep and sett sections for wheeled users.
 * The cost model already takes { wet, ice }; this decides them.
 */
import type { Conditions } from "@causeway/router";

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
  };
}

export const openMeteoUrl = (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
  "&current=temperature_2m,precipitation,rain,snowfall,weather_code" +
  "&hourly=precipitation,temperature_2m&past_hours=12&forecast_hours=1&timezone=UTC";

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
  const sinceH = (h: number) =>
    hours.time.reduce((t, ts, i) => (Date.parse(ts) >= now.getTime() - h * 3_600_000 ? t + (hours.precipitation[i] ?? 0) : t), 0);
  const rain3h = sinceH(3);
  const precip12h = sinceH(12);
  const minTemp12h = Math.min(c.temperature_2m, ...hours.temperature_2m.filter((_, i) => Date.parse(hours.time[i]!) >= now.getTime() - 12 * 3_600_000));

  const ice = SNOW(c.weather_code) || FREEZING(c.weather_code) || (c.snowfall ?? 0) > 0 || (minTemp12h <= 1 && precip12h > 0.2);
  const wet = ice || RAIN(c.weather_code) || c.precipitation > 0 || rain3h > 0.2;
  const summary = ice
    ? `Icy or snowy: ${c.temperature_2m.toFixed(0)}°C${precip12h > 0 ? `, ${precip12h.toFixed(1)} mm in the last 12 hours` : ""}`
    : wet
      ? `Wet: ${rain3h > 0 ? `${rain3h.toFixed(1)} mm of rain in the last 3 hours` : "raining now"}`
      : "Dry";
  return { now, wet, ice, summary, source: "Open-Meteo (CC BY 4.0)", observedAt: c.time };
}

export async function fetchConditions(lat: number, lon: number, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<WeatherConditions> {
  const res = await fetchImpl(openMeteoUrl(lat, lon));
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`);
  return conditionsFromOpenMeteo((await res.json()) as OpenMeteoResponse, now);
}
