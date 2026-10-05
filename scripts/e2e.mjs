/**
 * End-to-end journey in the built app (STAB-01): search for a place, get a
 * route, start navigating, arrive, end. One per city, so each city's graph,
 * search index and base map are known to load and route together.
 * Navigation runs in preview mode (no location), and the test speeds up the
 * preview's half-second tick so the walk takes seconds, not minutes.
 *   pnpm web:build && pnpm e2e
 * Then one journey through the rest of the trip (STAB-10): set up two devices
 * and switch between them, leave later, and add a note. Every request any
 * journey makes is checked for the profile (SEC-05, D-009): the device's name,
 * its type and its limits must never leave the phone.
 * Exits 1 on any failed step, page error, profile leak, or anything the Content
 * Security Policy blocks. Runs in CI (.github/workflows/ci.yml). Set E2E_SHOT=<file.png>
 * to keep a screenshot of the trip journey when it fails.
 */
import { launchBrowser, serveOut, watchCsp } from "./serve-out.mjs";

const JOURNEYS = [
  { city: "edinburgh", start: "Causewayside", to: "Hamilton Place" },
  { city: "newcastle", start: "Grey Street", to: "Grainger Market" },
  { city: "london", start: "Parliament Square", to: "Westminster Abbey" },
];

/** Things only the profile contains. None may appear in any request's address or body. */
const DEVICE = "Zebrafinch";
const PROFILE_MARKERS = [DEVICE, "powerchair-light", "maxInclineUpPct", "maxKerbCm", "minWidthM"];
function watchProfile(page, problems) {
  page.on("request", (r) => {
    const sent = `${r.url()} ${r.postData() ?? ""}`;
    for (const m of PROFILE_MARKERS) if (sent.includes(m)) problems.push(`profile leak: "${m}" sent to ${r.url().split("?")[0]}`);
  });
}

const server = await serveOut();
const browser = await launchBrowser();
const failures = [];

for (const j of JOURNEYS) {
  const name = `${j.city} to ${j.to}`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const problems = [];
  watchCsp(page, problems);
  watchProfile(page, problems);
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

// The rest of the trip (STAB-10), in Edinburgh.
{
  const name = "edinburgh: devices, leaving later and a note";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const problems = [];
  watchCsp(page, problems);
  watchProfile(page, problems);
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  await page.addInitScript(() => localStorage.setItem("causewayside.city.v1", "edinburgh"));
  const step = async (label, fn) => {
    try {
      await fn();
      console.log(`  ok   ${label}`);
    } catch (e) {
      // Playwright's own reason (covered, hidden, off screen) is further down its message; keep it.
      const why = e.message.split("\n").filter((l) => /intercepts|not visible|outside of the viewport|not stable|detached/.test(l)).slice(-2).map((l) => l.trim());
      throw new Error([`${label}: ${e.message.split("\n")[0]}`, ...why].join(" / "));
    }
  };
  const deviceButton = () => page.getByRole("button", { name: /^Routes are for/ }).first();
  const addDevice = async (radio, name) => {
    await page.getByRole("dialog", { name: "What do you use?" }).waitFor();
    await page.getByRole("radio", { name: radio }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: `Save ${name}` }).click();
  };
  console.log(name);
  try {
    await step("app loads", async () => {
      await page.goto(server.url);
      await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
    });
    await step("set up a powerchair", async () => {
      await page.getByRole("button", { name: "Set up how you get around" }).first().click();
      await addDevice(/Powerchair, lightweight/, DEVICE);
      await page.getByRole("button", { name: new RegExp(`^Routes are for ${DEVICE}`) }).first().waitFor();
    });
    await step("add a second device", async () => {
      await deviceButton().click();
      await page.getByRole("menuitem", { name: "Add a device" }).click();
      await addDevice(/^Manual wheelchair Self-propelled/, "Chair");
      await page.getByRole("button", { name: /^Routes are for Chair/ }).first().waitFor();
    });
    await step("switch back to the powerchair", async () => {
      await deviceButton().click();
      await page.getByRole("menu", { name: "Getting around as" }).waitFor();
      await page.getByRole("menuitemradio", { name: new RegExp(DEVICE) }).click();
      await page.getByRole("button", { name: new RegExp(`^Routes are for ${DEVICE}`) }).first().waitFor();
      await page.getByRole("menu", { name: "Getting around as" }).waitFor({ state: "hidden" });
      // With two devices, a tip about switching follows the switch and sits over the trip settings. Dismiss it, as a person would.
      const tip = page.getByRole("note").filter({ hasText: "to switch device" });
      await tip.waitFor({ timeout: 6_000 }).then(() => tip.getByRole("button", { name: "Got it" }).click(), () => undefined);
    });
    await step("leave in an hour", async () => {
      const soon = page.getByRole("button", { name: "In 1 hour" });
      await soon.scrollIntoViewIfNeeded();
      await soon.click();
      await page.getByText(/^Routes, bus waits, opening hours, daylight and the forecast are for/).waitFor();
    });
    await step("a route for later", async () => {
      await page.getByPlaceholder("Where to?").fill("Hamilton Place");
      await page.getByRole("option").first().waitFor({ timeout: 30_000 });
      await page.getByRole("option").first().click();
      await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    });
    await step("add a note about the route", async () => {
      await page.getByRole("button", { name: "Add a note about this route" }).click();
      await page.getByRole("radio", { name: "Bad" }).click();
      await page.getByLabel("What should people know?").fill("Kerb dropped on one side only.");
      await page.getByRole("button", { name: "Save note" }).click();
      await page.getByText("Saved. Thank you.").waitFor();
      await page.getByRole("button", { name: "Done" }).click();
    });
    await step("the note is kept on this phone, without the profile", async () => {
      const stored = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes("note")).map(([, v]) => v).join(" "));
      if (!stored.includes("Kerb dropped on one side only.")) throw new Error("note not stored");
      for (const m of PROFILE_MARKERS.slice(2)) if (stored.includes(m)) throw new Error(`note holds "${m}"`);
    });
  } catch (e) {
    if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT });
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
console.log("\nEvery journey ran from search to arrival, and no request carried the profile.");
