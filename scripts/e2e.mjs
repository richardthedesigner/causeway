/**
 * End-to-end journey in the built app (STAB-01): search for a place, get a
 * route, start navigating, arrive, end. One per city, so each city's graph,
 * search index and base map are known to load and route together.
 * Navigation runs in preview mode (no location), and the test speeds up the
 * preview's half-second tick so the walk takes seconds, not minutes.
 *   pnpm web:build && pnpm e2e
 * Exits 1 on any failed step, page error, or anything the Content Security
 * Policy blocks. Runs in CI (.github/workflows/ci.yml).
 */
import { launchBrowser, serveOut, watchCsp } from "./serve-out.mjs";

const JOURNEYS = [
  { city: "edinburgh", start: "Causewayside", to: "Hamilton Place" },
  { city: "newcastle", start: "Grey Street", to: "Grainger Market" },
  { city: "london", start: "Parliament Square", to: "Westminster Abbey" },
];

const server = await serveOut();
const browser = await launchBrowser();
const failures = [];

for (const j of JOURNEYS) {
  const name = `${j.city} to ${j.to}`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const problems = [];
  watchCsp(page, problems);
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  // No location: navigation falls back to its preview, which walks the route by itself.
  await page.addInitScript(() => {
    delete Navigator.prototype.geolocation;
    // NavView's preview moves along the route every 500 ms. Take ten of its steps each 50 ms,
    // a hundred times faster, so a 2 km route takes seconds.
    const every = window.setInterval;
    window.setInterval = (fn, ms, ...rest) => (ms === 500 ? every(() => { for (let i = 0; i < 10; i++) fn(...rest); }, 50) : every(fn, ms, ...rest));
  });
  // The city the app opens in, as if picked last time (page.tsx CITY_KEY).
  await page.addInitScript((id) => localStorage.setItem("causewayside.city.v1", id), j.city);
  const step = async (label, fn) => {
    try {
      await fn();
      console.log(`  ok   ${label}`);
    } catch (e) {
      throw new Error(`${label}: ${e.message.split("\n")[0]}`);
    }
  };
  console.log(name);
  try {
    await step("app loads", async () => {
      await page.goto(server.url);
      await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
    });
    await step(`search for ${j.to}`, async () => {
      await page.getByPlaceholder("Where to?").fill(j.to);
      await page.getByRole("option").first().waitFor({ timeout: 30_000 });
      await page.getByRole("option").first().click();
    });
    await step(`a route is found, from ${j.start}`, async () => {
      await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
      // A city opened from last time starts at its own start, not another city's.
      const from = await page.getByRole("button", { name: /^Change start/ }).first().innerText();
      if (!from.includes(j.start)) throw new Error(`${from.replace(/\s+/g, " ").trim()}`);
    });
    await step("start navigating", async () => {
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("region", { name: "Next instruction" }).waitFor();
      await page.getByRole("button", { name: "End", exact: true }).waitFor();
    });
    await step("arrive", async () => {
      const arrived = page.getByRole("region", { name: "Next instruction" }).getByText(/arrived/);
      await arrived.waitFor({ timeout: 120_000 }).catch(async () => {
        throw new Error(`never arrived: ${await page.getByRole("region", { name: "Next instruction" }).innerText()}`);
      });
    });
    await step("end", async () => {
      await page.getByRole("button", { name: "End", exact: true }).click();
      await page.getByRole("region", { name: "Next instruction" }).waitFor({ state: "detached" });
    });
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL ${e.message}`);
  }
  for (const p of problems) failures.push(`${name}: ${p}`), console.log(`  FAIL ${p}`);
  await context.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`\n${failures.length} end-to-end failure(s).`);
  process.exit(1);
}
console.log("\nEvery journey ran from search to arrival.");
