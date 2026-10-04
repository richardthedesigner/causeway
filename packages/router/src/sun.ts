/**
 * Is it dark? The sun's altitude from the date and place, worked out on the
 * device (NOAA's simplified solar position, good to well under a degree).
 * Dark means the sun is more than 6 degrees below the horizon: the end of
 * civil twilight, when street lighting is what you see by.
 */
const RAD = Math.PI / 180;

/** Sun altitude in degrees above the horizon. */
export function sunAltitude(when: Date, lon: number, lat: number): number {
  const d = when.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545; // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24; // hours
  const ha = (gmst * 15 + lon) * RAD - ra;
  const alt = Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha));
  return alt / RAD;
}

export const isDark = (when: Date, lon: number, lat: number): boolean => sunAltitude(when, lon, lat) < -6;
