/**
 * WCAG 2.2 AA check of the built app with axe-core, light and dark, on the
 * screens people use most: start, search results, a route with buses and
 * toilets (every section open), first-visit setup, the device list and the
 * device settings, with a battery range, and the update prompt.
 *   pnpm web:build && pnpm a11y
 * Exits 1 on any violation, or anything the Content Security Policy blocks. Runs in CI (.github/workflows/ci.yml).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { launchBrowser, serveOut, watchCsp } from "./serve-out.mjs";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const server = await serveOut();
const url = server.url;
const browser = await launchBrowser();
const csp = [];
const failures = [];
for (const scheme of ["light", "dark"]) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme })).newPage();
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

  await page.getByRole("button", { name: "Accessible toilets" }).click();
  await page.getByRole("option").first().waitFor();
  await check("search results");

  await page.getByPlaceholder("Where to?").fill("Hamilton Place");
  await page.getByRole("option").first().click();
  await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  for (const d of await page.locator("details").all()) await d.evaluate((el) => (el.open = true));
  await check("route, all sections open");

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

  // A new build takes over an open page: the update prompt (DEP-05). The first takeover is a first visit.
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
  });
  await page.getByRole("button", { name: "Reload" }).waitFor();
  await check("update prompt");
}
await browser.close();
server.close();
// axe fetches the page's stylesheets itself to check them; the app never fetches the font CSS, it links it.
for (const c of csp.filter((c) => !(/'https:\/\/fonts\.googleapis\.com\//.test(c) && /connect-src/.test(c)))) failures.push(`Content Security Policy: ${c}`), console.log(`  [csp] ${c}`);
if (failures.length) {
  console.error(`\n${failures.length} accessibility or Content Security Policy problem(s).`);
  process.exit(1);
}
console.log("\nNo WCAG 2.2 AA violations found by axe.");
