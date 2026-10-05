/**
 * UK bank holidays from GOV.UK (Open Government Licence v3.0; SMALL-01), so
 * opening hours know when a place's holiday hours apply.
 *   pnpm build:holidays
 * Writes apps/web/src/lib/bank-holidays.json (bundled with the app): dates from last year on, for England and
 * Wales and for Scotland (our cities). GOV.UK publishes about two years ahead,
 * so the weekly data refresh keeps it current.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const URL_ = "https://www.gov.uk/bank-holidays.json";
type Feed = Record<string, { events: { title: string; date: string }[] }>;

const feed = (await (await fetch(URL_)).json()) as Feed;
const from = `${new Date().getUTCFullYear() - 1}-01-01`;
const pick = (division: string) => {
  const events = feed[division]?.events;
  if (!events?.length) throw new Error(`GOV.UK bank holidays: no ${division}`);
  return Object.fromEntries(events.filter((e) => e.date >= from).map((e) => [e.date, e.title.replace(/’/g, "'")]));
};
const out = {
  source: "GOV.UK bank holidays",
  licence: "Open Government Licence v3.0",
  fetchedAt: new Date().toISOString().slice(0, 10),
  divisions: { "england-and-wales": pick("england-and-wales"), scotland: pick("scotland") },
};
writeFileSync(join(import.meta.dirname, "../apps/web/src/lib/bank-holidays.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(out.divisions["england-and-wales"]).length} dates in England and Wales, ${Object.keys(out.divisions.scotland).length} in Scotland, to ${Object.keys(out.divisions.scotland).sort().pop()}`);
