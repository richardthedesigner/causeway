/**
 * Made-up props for the v3 lab (FEAT-67). Fixtures only: no figure here came
 * from the router, and none may be copied into the app. The shapes follow what
 * `streetBands()` really returns (lib/street-bands.ts): rides with their stops,
 * stretches of a few metres, a street that comes round twice, a measured street
 * with no slope data, merged unknowns with their names, and a blocker added
 * last with no length and no edges.
 */
import type { StreetBand } from "@/lib/street-bands";

/** An Unsure route: measured streets, a ride, and unknowns either side of it. */
export const UNSURE_BANDS: StreetBand[] = [
  { name: "Buccleuch Street", m: 182, state: "measured", steepestPct: 1, condition: "Level", edgeIds: [101, 102, 103] },
  { name: "Chapel Street", m: 6, state: "measured", steepestPct: -4, condition: "About 4% down", edgeIds: [104] },
  { name: "Potterrow", m: 236, state: "measured", steepestPct: 5, condition: "Setts, about 5% up", edgeIds: [105, 106] },
  {
    name: "Four streets",
    m: 412,
    state: "unknown",
    steepestPct: null,
    condition: "Nobody has measured",
    edgeIds: [107, 108, 109, 110, 111],
    names: ["Marshall Street", "Nicolson Square", "West Nicolson Street", "Windmill Lane"],
  },
  { name: "Bus 23 to Forrest Road", m: 1430, state: "ride", steepestPct: null, condition: "5 stops", edgeIds: [112] },
  { name: "Forrest Road", m: 8, state: "measured", steepestPct: null, condition: "Slope not measured", edgeIds: [113] },
  { name: "Bristo Place", m: 64, state: "unknown", steepestPct: null, condition: "Nobody has measured", edgeIds: [114, 115] },
  { name: "Forrest Road", m: 121, state: "measured", steepestPct: -6, condition: "About 6% down", edgeIds: [116, 117] },
];

/** A route that fits: every stretch measured, one long enough to read in kilometres. */
export const FITS_BANDS: StreetBand[] = [
  { name: "Melville Drive", m: 1240, state: "measured", steepestPct: 2, condition: "Level", edgeIds: [201, 202, 203, 204] },
  { name: "Tram to Haymarket", m: 2100, state: "ride", steepestPct: null, condition: "1 stop", edgeIds: [205] },
  { name: "Leamington Walk", m: 318, state: "measured", steepestPct: 3, condition: "Level", edgeIds: [206, 207] },
  { name: "Bruntsfield Place", m: 77, state: "measured", steepestPct: 7, condition: "About 7% up", edgeIds: [208] },
];

/** The closest route when nothing fits: it stops short, and the blocker comes last. */
export const NOPE_BANDS: StreetBand[] = [
  { name: "Johnston Terrace", m: 290, state: "measured", steepestPct: 6, condition: "About 6% up", edgeIds: [301, 302] },
  { name: "Castle Wynd North", m: 45, state: "unknown", steepestPct: null, condition: "Nobody has measured", edgeIds: [303] },
  { name: "Castle Wynd South", m: 0, state: "blocked", steepestPct: null, condition: "36 steps", edgeIds: [] },
];

/** Long names and long conditions, to see the wrapping at 320 px and at 200% text. */
export const LONG_BANDS: StreetBand[] = [
  { name: "Path beside the Union Canal towpath at Fountainbridge", m: 948, state: "measured", steepestPct: -9, condition: "Compacted gravel, about 9% down", edgeIds: [401, 402] },
  {
    name: "Twelve streets",
    m: 1870,
    state: "unknown",
    steepestPct: null,
    condition: "Nobody has measured",
    edgeIds: [403, 404, 405],
    names: ["Gilmore Park", "Lower Gilmore Place", "Leamington Road", "Viewforth", "Gillespie Crescent", "Bruntsfield Terrace", "Leven Street", "Valleyfield Street", "Glengyle Terrace", "Tarvit Street", "Drumdryan Street", "Brougham Place"],
  },
  { name: "Train to Edinburgh Waverley, platform 12 to 19", m: 5300, state: "ride", steepestPct: null, condition: "2 stops", edgeIds: [406] },
  { name: "Fleshmarket Close, the upper flight", m: 0, state: "blocked", steepestPct: null, condition: "A flight of 14 steps with no handrail on either side", edgeIds: [] },
];
