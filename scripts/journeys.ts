/**
 * Acceptance journeys, as data. Each is reproducible against the committed
 * snapshot; the live variant (Phase 3) re-runs the same journeys against a
 * freshly built graph with live overlays.
 *
 * Coordinates are public places, not private addresses.
 */
export interface Journey {
  id: string;
  title: string;
  from: { label: string; lon: number; lat: number };
  to: { label: string; lon: number; lat: number };
}

export const EDINBURGH_JOURNEYS: Journey[] = [
  {
    id: "waverley-grassmarket",
    title: "Waverley Station to the Grassmarket",
    from: { label: "Edinburgh Waverley concourse", lon: -3.1893, lat: 55.952 },
    to: { label: "Grassmarket", lon: -3.196, lat: 55.9476 },
  },
  {
    id: "royal-mile-victoria-street",
    title: "Royal Mile (High Street) to Victoria Street",
    from: { label: "High Street by St Giles'", lon: -3.1907, lat: 55.9496 },
    to: { label: "Victoria Street", lon: -3.1937, lat: 55.9484 },
  },
  {
    id: "market-street-high-street",
    title: "Market Street to the High Street (the Cockburn Street climb)",
    from: { label: "Waverley Market Street entrance", lon: -3.1905, lat: 55.9513 },
    to: { label: "High Street at Cockburn Street", lon: -3.1883, lat: 55.9502 },
  },
];

/** Phase 1 area journeys (central Edinburgh graph). Causewayside is the demo address. */
export const EDINBURGH_CENTRAL_JOURNEYS: Journey[] = [
  ...EDINBURGH_JOURNEYS,
  {
    id: "causewayside-museum",
    title: "Causewayside to the National Museum of Scotland",
    from: { label: "Causewayside", lon: -3.1812, lat: 55.9385 },
    to: { label: "National Museum of Scotland, Chambers Street", lon: -3.1897, lat: 55.9469 },
  },
  {
    id: "causewayside-waverley",
    title: "Causewayside to Waverley Station",
    from: { label: "Causewayside", lon: -3.1812, lat: 55.9385 },
    to: { label: "Edinburgh Waverley concourse", lon: -3.1893, lat: 55.952 },
  },
];
