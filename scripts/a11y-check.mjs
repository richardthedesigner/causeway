/**
 * WCAG 2.2 AA check of the built app with axe-core, light and dark, on the
 * screens people use most: start, a route to a park, search results, a route with buses and
 * toilets (every section open), first-visit setup, the device list and the
 * device settings, with a battery range and as a road scooter in mph and
 * km/h (FEAT-18, SMALL-02), and the update prompt. Then the
 * setup and device settings sheets on a 320 by 640 phone at 200% text: the
 * header takes at most a third of the screen, and nothing runs off the side (STAB-11).
 * And the other screens at the same size: start with "This trip", search,
 * a route with every section open, "Report what's there" (FEAT-03), the note sheet,
 * navigation, the report sheet and the community report sheets. Nothing runs off the side, and in navigation the next instruction and
 * the journey panel don't cover each other (STAB-12). Your data is checked too (SEC-06).
 * And a London route that goes round a lift out (TfL's recorded feeds), with
 * "On this route" open by itself, light, dark and at 320 px with 200% text (D-067).
 * And where you start (FEAT-20): the route screen while the phone finds you, and
 * "Where are you starting from?" with location turned off, light, dark and at 320 px
 * with 200% text. The other screens share a location in the city, as a phone would.
 *   pnpm web:build && pnpm a11y
 * Exits 1 on any violation, or anything the Content Security Policy blocks. Runs in CI (.github/workflows/ci.yml).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { hereIn, launchBrowser, serveOut, watchCsp } from "./serve-out.mjs";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const server = await serveOut();
const url = server.url;
const browser = await launchBrowser();
const csp = [];
const failures = [];
const MIN_SHEET_PX = 300;
for (const scheme of ["light", "dark"]) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, ...hereIn("edinburgh") })).newPage();
  watchCsp(page, csp);
  const check = async (name) => {
    await page.addScriptTag({ content: AXE });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })));
    console.log(`${scheme} / ${name}: ${violations.length} violation${violations.length === 1 ? "" : "s"}`);
    for (const v of violations) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help}\n    ${v.targets.join("\n    ")}`);
      failures.push(`${scheme} / ${name} / ${v.id}`);
    }
  };
  await page.goto(url);
  await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await check("start");

  // A park: the route ends at a gate into it and says so (DATA-08, D-048). Then back to the start.
  await page.getByPlaceholder("Where to?").fill("The Meadows");
  await page.getByRole("option").first().click();
  await page.getByText(/Ends at a gate into/).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  await check("route to a park");
  await page.goto(url);
  await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  // Your data (SEC-06), at the point of deleting.
  await page.getByPlaceholder("Where to?").focus();
  await page.getByRole("button", { name: "Your data", exact: true }).click();
  await page.getByRole("dialog", { name: "Your data" }).waitFor();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await check("your data, deleting");
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Where to?").blur();

  await page.getByRole("button", { name: "Accessible toilets" }).click();
  await page.getByRole("option").first().waitFor();
  await check("search results");

  await page.getByPlaceholder("Where to?").fill("Hamilton Place");
  await page.getByRole("option").first().click();
  await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.locator("details").evaluateAll((els) => els.forEach((el) => (el.open = true)));
  await check("route, all sections open");
  // "Report what's there" from "What we don't know" (FEAT-03).
  await page.getByRole("button", { name: /^Report what's there on / }).first().click();
  await page.getByRole("dialog", { name: "Report what's there" }).waitFor();
  await page.getByRole("dialog").getByRole("radio").first().click();
  await check("report what's there");
  await page.keyboard.press("Escape");

  // Community reports (FEAT-35): the add sheet with a category chosen and the review open, a report's own sheet,
  // and the map layers menu with its filters.
  await page.getByRole("button", { name: "Add a report", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add a report" });
  await add.waitFor();
  await add.getByRole("radio", { name: "No dropped kerb" }).click();
  await add.locator("details").evaluate((el) => (el.open = true));
  await check("add a community report");
  await add.getByRole("button", { name: "Save: No dropped kerb" }).click();
  await add.getByRole("button", { name: "Done" }).click();
  await page.locator('[aria-label^="No dropped kerb, a problem"]').first().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "No dropped kerb" }).waitFor();
  await check("a community report");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Community reports" }).waitFor();
  await page.getByRole("menuitem", { name: "Choose categories" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Steps" }).waitFor();
  await check("map layers, community categories open");
  await page.keyboard.press("Escape");

  // A first visit: the device button reads "Set up" and opens setup (D-036 step 5).
  await page.getByRole("button", { name: "Set up how you get around" }).first().click();
  await page.getByRole("dialog", { name: "What do you use?" }).waitFor();
  await check("setup: what do you use?");
  await page.getByRole("radio", { name: /Powerchair, lightweight/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Name").fill("Cherry");
  await check("setup: name");
  await page.getByRole("button", { name: "Next" }).click();
  await check("setup: limits");
  await page.getByRole("button", { name: "Save Cherry" }).click();

  // Then the device button opens the device list; Edit opens the device's settings.
  await page.getByRole("button", { name: /Routes are for/ }).first().click();
  await page.getByRole("menu", { name: "Getting around as" }).waitFor();
  await check("device list");
  await page.getByRole("menuitem", { name: /^Edit/ }).click();
  await page.getByRole("dialog").filter({ hasText: "Your limits" }).waitFor();
  await check("device settings");
  // Cherry is a powerchair, so the limits offer a battery range (D-043).
  await page.getByText("Your limits", { exact: true }).first().click();
  await page.getByRole("switch", { name: "Warn me about battery range" }).click();
  await page.getByRole("slider", { name: "Range on one charge" }).waitFor();
  await check("device settings, battery range");
  // A road scooter: speed on the road, in either unit (FEAT-18).
  await page.getByRole("radio", { name: /Mobility scooter, road/ }).click();
  await page.locator("[role=dialog] details").evaluateAll((els) => els.forEach((el) => (el.open = true)));
  await page.getByRole("slider", { name: "Speed on the road" }).waitFor();
  await check("device settings, road scooter, mph");
  // Distances follow the same unit (SMALL-02): the battery range reads in miles here.
  const range = page.getByRole("switch", { name: "Warn me about battery range" });
  if ((await range.getAttribute("aria-checked")) !== "true") await range.click();
  await page.getByRole("slider", { name: "Range on one charge" }).waitFor();
  await check("device settings, road scooter, battery range in miles");
  await page.getByRole("radio", { name: "km/h" }).click();
  await check("device settings, road scooter, km/h");

  // A new build takes over an open page: the update prompt (DEP-04). The first takeover is a first visit.
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
  });
  await page.getByRole("button", { name: "Reload" }).waitFor();
  await check("update prompt");
}
// "On this route" with something blocked (D-067): London, TfL's recorded lift outages and station messages, a wheelchair
// route to Canary Wharf that goes round the faulty lift. The list opens by itself. Light and dark, then 320 px at 200% text.
const FX = new URL("../packages/live/test/fixtures/", import.meta.url);
async function londonLiftOut(page) {
  await page.route(/open-meteo\.com|environment\.data\.gov\.uk|ukhsa-dashboard\.data\.gov\.uk/, (r) => r.abort());
  await page.route(/api\.tfl\.gov\.uk/, (r) => {
    const u = r.request().url();
    const body = /Disruptions\/Lifts/.test(u) ? readFileSync(new URL("tfl-lifts-2026-10-04.json", FX), "utf8") : /StopPoint\/Mode/.test(u) ? readFileSync(new URL("tfl-station-disruptions-2026-10-04.json", FX), "utf8") : "[]";
    return r.fulfill({ contentType: "application/json", body });
  });
  await page.addInitScript(() => localStorage.setItem("causewayside.city.v1", "london"));
  await page.goto(url);
  await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
  // The lift feed answers before the route is asked for.
  await page.waitForFunction(() => !document.body.innerText.includes("Checking lifts"), null, { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(2000);
  await page.getByPlaceholder("Where to?").fill("Canary Wharf station");
  await page.getByRole("option").first().click();
  await page.getByText("Goes round a closure on the way. See On this route.").waitFor({ timeout: 60_000 });
  const open = await page.locator("details", { hasText: "On this route" }).first().evaluate((el) => el.open);
  if (!open) failures.push("On this route didn't open by itself with something blocked");
  await page.getByRole("heading", { name: /^Blocked/ }).waitFor();
}
for (const scheme of ["light", "dark"]) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, ...hereIn("london") })).newPage();
  watchCsp(page, csp);
  await londonLiftOut(page);
  await page.addScriptTag({ content: AXE });
  for (const d of await page.locator("details").all()) await d.evaluate((el) => (el.open = true));
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })));
  console.log(`${scheme} / route with a lift out, On this route open: ${violations.length} violation${violations.length === 1 ? "" : "s"}`);
  for (const v of violations) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help}\n    ${v.targets.join("\n    ")}`);
    failures.push(`${scheme} / route with a lift out / ${v.id}`);
  }
}
{
  const page = await (await browser.newContext({ viewport: { width: 320, height: 640 }, ...hereIn("london") })).newPage();
  watchCsp(page, csp);
  await londonLiftOut(page);
  await page.addStyleTag({ content: "html { font-size: 200% !important }" });
  for (const d of await page.locator("details").all()) await d.evaluate((el) => (el.open = true));
  await page.waitForTimeout(500);
  const off = await page.evaluate(() => {
    const all = [...document.querySelectorAll("body *")].filter((e) => {
      if (e.closest(".maplibregl-map") || (e.closest("svg") && e.tagName !== "svg")) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && (b.right > innerWidth + 1 || b.left < -1);
    });
    return all.filter((e) => !all.some((o) => o !== e && e.contains(o))).slice(0, 3).map((e) => `${e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 30)}"`);
  });
  console.log(`200% text / route with a lift out, every section open: ${off.length ? off.map((o) => `${o} runs off the side`).join("; ") : "fits"}`);
  for (const o of off) failures.push(`200% text / route with a lift out / ${o} runs off the side`);
}
// Where you start (FEAT-20). No answer from the phone yet: the route screen says it's finding you. Location turned off:
// "Where are you starting from?", with why. Light and dark, then 320 px at 200% text.
const offsideAt = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll("body *")].filter((e) => {
      if (e.closest(".maplibregl-map") || (e.closest("svg") && e.tagName !== "svg")) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && (b.right > innerWidth + 1 || b.left < -1);
    });
    return all.filter((e) => !all.some((o) => o !== e && e.contains(o))).slice(0, 3).map((e) => `${e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 30)}"`);
  });
const locationOff = () => {
  navigator.geolocation.getCurrentPosition = (_ok, fail) => setTimeout(() => fail({ code: 1, PERMISSION_DENIED: 1, message: "denied" }), 50);
};
for (const [scheme, size, zoom] of [["light", { width: 390, height: 844 }, false], ["dark", { width: 390, height: 844 }, false], ["light", { width: 320, height: 640 }, true]]) {
  for (const [name, init, ready] of [
    ["finding where you are", () => (navigator.geolocation.getCurrentPosition = () => {}), "Finding where you are…"],
    ["where are you starting from, location off", locationOff, "Location is turned off for this site, so we can't tell where you are."],
  ]) {
    const context = await browser.newContext({ viewport: size, colorScheme: scheme });
    const page = await context.newPage();
    watchCsp(page, csp);
    await page.addInitScript(init);
    await page.goto(url);
    await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
    if (zoom) await page.addStyleTag({ content: "html { font-size: 200% !important }" });
    await page.getByPlaceholder("Where to?").fill("Hamilton Place");
    await page.getByRole("option").first().click();
    await page.getByText(ready).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const label = `${zoom ? "200% text" : scheme} / ${name}`;
    if (zoom) {
      const off = await offsideAt(page);
      console.log(`${label}: ${off.length ? off.map((o) => `${o} runs off the side`).join("; ") : "fits"}`);
      for (const o of off) failures.push(`${label} / ${o} runs off the side`);
    } else {
      await page.addScriptTag({ content: AXE });
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })));
      console.log(`${label}: ${violations.length} violation${violations.length === 1 ? "" : "s"}`);
      for (const v of violations) {
        console.log(`  [${v.impact}] ${v.id}: ${v.help}\n    ${v.targets.join("\n    ")}`);
        failures.push(`${label} / ${v.id}`);
      }
    }
    await context.close();
  }
}
// Reflow (WCAG 1.4.4, 1.4.10): the device sheets at 320 by 640 with text at 200% (STAB-11).
{
  const page = await (await browser.newContext({ viewport: { width: 320, height: 640 }, ...hereIn("edinburgh") })).newPage();
  watchCsp(page, csp);
  await page.goto(url);
  await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: "html { font-size: 200% !important }" });
  const reflow = async (name) => {
    const r = await page.evaluate(() => {
      const d = [...document.querySelectorAll("[role=dialog]")].pop();
      const box = d.getBoundingClientRect();
      const off = [...d.querySelectorAll("*")].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && (b.right > box.right + 1 || b.left < box.left - 1);
      });
      return { off: off.slice(0, 3).map((e) => `${e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 30)}"`), header: d.querySelector("header")?.getBoundingClientRect().height ?? 0 };
    });
    const problems = [...r.off.map((o) => `${o} runs off the side`), ...(r.header > 640 / 3 ? [`the header takes ${Math.round(r.header)} of 640 px, over a third`] : [])];
    console.log(`200% text / ${name}: ${problems.length ? problems.join("; ") : "fits"}`);
    for (const p of problems) failures.push(`200% text / ${name} / ${p}`);
  };
  await page.getByRole("button", { name: "Set up how you get around" }).first().click();
  await page.getByRole("dialog", { name: "What do you use?" }).waitFor();
  await reflow("setup: what do you use?");
  await page.getByRole("radio", { name: /Powerchair, lightweight/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await reflow("setup: name");
  await page.getByLabel("Name").fill("Cherry");
  await page.getByRole("button", { name: "Next" }).click();
  await reflow("setup: limits");
  await page.getByRole("button", { name: "Save Cherry" }).click();
  await page.getByRole("button", { name: /Routes are for/ }).first().click();
  await page.getByRole("menuitem", { name: /^Edit/ }).click();
  await page.getByRole("dialog").filter({ hasText: "Your limits" }).waitFor();
  await page.locator("[role=dialog] details").evaluateAll((els) => els.forEach((el) => (el.open = true)));
  await page.getByRole("switch", { name: "Warn me about battery range" }).click();
  await reflow("device settings, every section open");
  await page.getByRole("radio", { name: /Mobility scooter, road/ }).click();
  await page.locator("[role=dialog] details").evaluateAll((els) => els.forEach((el) => (el.open = true)));
  await page.getByRole("slider", { name: "Speed on the road" }).waitFor();
  await reflow("device settings, road scooter");
  await page.keyboard.press("Escape");
  // Community reports (FEAT-35).
  await page.getByRole("button", { name: "Add a report", exact: true }).click();
  await page.getByRole("dialog", { name: "Add a report" }).waitFor();
  await page.getByRole("radio", { name: "Pavement blocked" }).click();
  await page.locator("[role=dialog] details").evaluateAll((els) => els.forEach((el) => (el.open = true)));
  await reflow("add a community report");
}
// Reflow on the other screens at 320 by 640 with text at 200% (STAB-12). The map draws its own labels, so it's left out.
{
  const page = await (await browser.newContext({ viewport: { width: 320, height: 640 }, ...hereIn("edinburgh") })).newPage();
  watchCsp(page, csp);
  await page.goto(url);
  await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: "html { font-size: 200% !important }" });
  const reflow = async (name, extra = []) => {
    await page.waitForTimeout(500);
    const off = await page.evaluate(() => {
      const all = [...document.querySelectorAll("body *")].filter((e) => {
        if (e.closest(".maplibregl-map") || (e.closest("svg") && e.tagName !== "svg")) return false;
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && (b.right > innerWidth + 1 || b.left < -1);
      });
      // Report the innermost: a row is off the side because of what's in it.
      return all.filter((e) => !all.some((o) => o !== e && e.contains(o))).slice(0, 3).map((e) => `${e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 30)}"`);
    });
    const problems = [...off.map((o) => `${o} runs off the side`), ...extra];
    console.log(`200% text / ${name}: ${problems.length ? problems.join("; ") : "fits"}`);
    for (const p of problems) failures.push(`200% text / ${name} / ${p}`);
  };
  // The city name sits beside the map buttons; with large text it slid under them, cut off but on screen (STAB-13).
  const city = await page.evaluate(() => {
    const c = document.querySelector('[data-menu="city"]');
    const l = document.querySelector('[data-menu="layers"]').getBoundingClientRect();
    const r = c.getBoundingClientRect();
    return { spills: c.scrollWidth > c.clientWidth + 1, under: r.right > l.left && r.top < l.bottom && r.bottom > l.top };
  });
  const cityProblems = [...(city.spills ? ["the city name spills out of its button"] : []), ...(city.under ? ["the city name runs under the map layers button"] : [])];
  await reflow("start, with This trip", cityProblems);
  // The sheet starts down, showing only "Where to?" (SMALL-24). Focusing search opens it, as dragging it up would.
  await page.getByPlaceholder("Where to?").focus();
  await page.getByRole("button", { name: "Your data", exact: true }).click();
  await page.getByRole("dialog", { name: "Your data" }).waitFor();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await reflow("your data, deleting");
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Where to?").fill("Hamilton Place");
  await page.getByRole("option").first().waitFor({ timeout: 30_000 });
  await reflow("search");
  await page.getByRole("option").first().click();
  await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
  // How much of the sheet shows above the Start bar (STAB-18): at least a route card's headline, not a sliver.
  await page.waitForTimeout(800);
  const shown = await page.evaluate(() => {
    const bar = document.querySelector("body > .fixed.z-30").getBoundingClientRect();
    const sheet = document.querySelector("[data-vaul-drawer]").getBoundingClientRect();
    const head = document.querySelector("[data-route-card] > div").getBoundingClientRect();
    return { px: Math.round(bar.top - Math.max(sheet.top, 0)), headline: Math.round(bar.top - head.bottom) };
  });
  console.log(`200% text / route sheet above the Start bar: ${shown.px} px, headline clear by ${shown.headline} px`);
  if (shown.px < MIN_SHEET_PX) failures.push(`200% text / route sheet / only ${shown.px} px above the Start bar (want ${MIN_SHEET_PX})`);
  if (shown.headline < 0) failures.push(`200% text / route sheet / the route card's headline is under the Start bar by ${-shown.headline} px`);
  await page.locator("details").evaluateAll((els) => els.forEach((el) => (el.open = true)));
  await reflow("route, all sections open");
  // The route panel must not scroll sideways (STAB-22): "Another way" used to spill out of its box.
  const wide = await page.evaluate(() => {
    const p = document.querySelector("[data-route-panel]");
    return p.scrollWidth - p.clientWidth;
  });
  console.log(`200% text / route panel width excess: ${wide} px, other ways: ${await page.locator("[aria-label=\"Other ways\"] li").count()}`);
  if (wide > 0) failures.push(`200% text / route panel / scrolls sideways by ${wide} px`);
  await page.getByRole("button", { name: /^Report what's there on / }).first().click();
  await page.getByRole("dialog", { name: "Report what's there" }).waitFor();
  await reflow("report what's there");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add a note about this route" }).click();
  await page.getByRole("radio", { name: "Bad" }).waitFor();
  await reflow("note sheet");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("region", { name: "Next instruction" }).waitFor();
  const [top, bottom] = await page.evaluate(() => ["Next instruction", "Journey progress"].map((n) => document.querySelector(`[aria-label="${n}"]`).getBoundingClientRect().toJSON()));
  await reflow("navigation", top.bottom > bottom.top ? [`the journey panel covers the next instruction (${Math.round(top.bottom)} > ${Math.round(bottom.top)})`] : []);
  await page.getByRole("button", { name: "Report a problem here" }).click();
  await page.getByRole("dialog", { name: "Report a problem" }).waitFor();
  await reflow("report sheet");
}
// The map controls (STAB-13): reachable by keyboard while the sheet is open, menus take and return focus,
// and at 320 px with text at 200% no city name is cut off or runs under the buttons.
{
  const page = await (await browser.newContext({ viewport: { width: 320, height: 640 }, ...hereIn("edinburgh") })).newPage();
  watchCsp(page, csp);
  await page.goto(url);
  await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: "html { font-size: 200% !important }" });
  const problems = [];
  if (await page.locator("main[aria-hidden=true]").count()) problems.push("the sheet hides the map from screen readers");
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("data-menu") ?? document.activeElement?.getAttribute("aria-label") ?? "");
  const reached = new Set();
  await page.getByPlaceholder("Where to?").focus();
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    reached.add(await focused());
  }
  for (const want of ["city", "layers", "Start from your location"]) if (!reached.has(want)) problems.push(`Tab never reaches ${want}`);
  for (const [name, item] of [["city", "menuitemradio"], ["layers", "menuitemcheckbox"]]) {
    await page.locator(`[data-menu="${name}"]`).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    if ((await page.evaluate(() => document.activeElement?.getAttribute("role"))) !== item) problems.push(`the ${name} menu doesn't take focus`);
    await page.keyboard.press("Escape");
    if ((await focused()) !== name) problems.push(`Escape from the ${name} menu doesn't return focus`);
  }
  // Focusing the search raised the sheet to full height; start again with it low.
  await page.reload();
  await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: "html { font-size: 200% !important }" });
  for (const city of ["Edinburgh", "Newcastle and Gateshead", "London"]) {
    await page.locator('[data-menu="city"]').click();
    await page.getByRole("menuitemradio", { name: city }).click();
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const c = document.querySelector('[data-menu="city"]');
      const l = document.querySelector('[data-menu="layers"]');
      return { clipped: c.scrollWidth > c.clientWidth + 1, right: c.getBoundingClientRect().right, next: l.getBoundingClientRect().left };
    });
    if (r.clipped) problems.push(`"${city}" is cut off`);
    if (r.right > r.next) problems.push(`"${city}" runs under the layers button`);
  }
  console.log(`map controls: ${problems.length ? problems.join("; ") : "reachable, and every city name fits"}`);
  for (const p of problems) failures.push(`map controls / ${p}`);
}
await browser.close();
server.close();
// axe fetches the page's stylesheets itself to check them; the app never fetches the font CSS, it links it.
for (const c of csp.filter((c) => !(/'https:\/\/fonts\.googleapis\.com\//.test(c) && /connect-src/.test(c)))) failures.push(`Content Security Policy: ${c}`), console.log(`  [csp] ${c}`);
if (failures.length) {
  console.error(`\n${failures.length} accessibility or Content Security Policy problem(s).`);
  process.exit(1);
}
console.log("\nNo WCAG 2.2 AA violations found by axe, and every screen checked reflows at 200% text.");
