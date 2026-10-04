/**
 * WCAG 2.2 AA check of the built app with axe-core, light and dark, on the
 * screens people use most: start, search results, a route with buses and
 * toilets (every section open), and the "How do you get around?" sheet.
 *   pnpm web:build && pnpm a11y
 * Exits 1 on any violation. Runs in CI (.github/workflows/ci.yml).
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const OUT = join(import.meta.dirname, "../apps/web/out");
if (!existsSync(OUT)) throw new Error("apps/web/out missing: run pnpm web:build first");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".gz": "application/gzip", ".pmtiles": "application/octet-stream", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (path.endsWith("/")) path += "index.html";
  const file = join(OUT, path);
  if (!file.startsWith(OUT) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Locally the pre-installed Chromium may not match Playwright's expected build; CI installs the right one.
const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") && !process.env.CI ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const failures = [];
for (const scheme of ["light", "dark"]) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme })).newPage();
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

  await page.getByRole("button", { name: /Routes are for|Getting around as/ }).first().click();
  await page.getByRole("dialog", { name: "How do you get around?" }).waitFor();
  await check("How do you get around?");
}
await browser.close();
server.close();
if (failures.length) {
  console.error(`\n${failures.length} accessibility violation(s).`);
  process.exit(1);
}
console.log("\nNo WCAG 2.2 AA violations found by axe.");
