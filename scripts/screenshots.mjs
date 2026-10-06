/**
 * Screenshot tests for the main screens (STAB-02): the map, search, where you
 * start from (FEAT-20), the route
 * panel, navigation, the device editor, the note, what's-there and report sheets and Your
 * data. Each is captured light and dark, at a phone size (390 by 844), at
 * 320 by 640 and at 320 by 640 with text at 200%, and compared with the
 * baseline in tests/screenshots/. It fails when a screen changes without its
 * baseline being updated.
 *   pnpm web:build && pnpm screenshots            check against the baselines
 *   pnpm web:build && pnpm screenshots --update   rewrite the baselines
 *   pnpm screenshots --only=route                 just the screens whose name has "route"
 * Captures are made steady: every feed is cut off (so each screen shows its
 * fallback), the clock is fixed, animations are off, navigation's preview
 * walk is held still, and the saved city is Edinburgh. A pixel counts as
 * changed past a small colour difference, and a screen fails past a small
 * share of changed pixels, so font hinting doesn't flake. On failure the
 * new picture and a diff go to tests/screenshots/diff/ (CI uploads them).
 * The map draws itself with WebGL, so its picture is held to a looser share.
 * Uses the same serving and browser as `pnpm a11y` (scripts/serve-out.mjs).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, serveOut, watchCsp } from "./serve-out.mjs";

const ROOT = join(import.meta.dirname, "../tests/screenshots");
const DIFF = join(ROOT, "diff");
const update = process.argv.includes("--update");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
/** A pixel is changed when any colour channel differs by more than this (of 255). */
const CHANNEL = 24;
/** A screen fails when more than this share of its pixels changed. */
const SHARE = 0.002;
const FIXED_TIME = new Date("2026-10-05T10:00:00+01:00");
const SIZES = [
  { id: "phone", width: 390, height: 844, zoom: false, schemes: ["light"] },
  { id: "w320", width: 320, height: 640, zoom: false, schemes: ["light"] },
  { id: "w320-200", width: 320, height: 640, zoom: true, schemes: ["light", "dark"] },
];
const WITH_MAP = new Set(["map", "route"]);
const NO_MAP = ".maplibregl-canvas, .maplibregl-marker, .maplibregl-ctrl-attrib { visibility: hidden !important }";
const STILL = "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important }";

const server = await serveOut();
const browser = await launchBrowser();
const failures = [];
const seen = new Set();
const csp = [];
if (update) rmSync(ROOT, { recursive: true, force: true });
rmSync(DIFF, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

async function compare(page, expected, actual) {
  return page.evaluate(
    async ([a, b, channel]) => {
      const load = async (s) => {
        const img = new Image();
        img.src = `data:image/png;base64,${s}`;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height);
      };
      const [x, y] = [await load(a), await load(b)];
      if (x.width !== y.width || x.height !== y.height) return { size: true, changed: 1, total: 1, diff: null };
      const out = new ImageData(x.width, x.height);
      let changed = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]));
        const bad = d > channel;
        if (bad) changed++;
        out.data.set(bad ? [255, 0, 60, 255] : [y.data[i], y.data[i + 1], y.data[i + 2], 70], i);
      }
      const c = new OffscreenCanvas(x.width, x.height);
      c.getContext("2d").putImageData(out, 0, 0);
      const blob = await c.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const v of bytes) s += String.fromCharCode(v);
      return { size: false, changed, total: x.width * x.height, diff: btoa(s) };
    },
    [expected.toString("base64"), actual.toString("base64"), CHANNEL],
  );
}

let checker;
async function shoot(page, name, scheme, size) {
  const id = `${name}.${scheme}.${size.id}`;
  if (only && !id.includes(only)) return;
  seen.add(id);
  await page.waitForTimeout(800);
  const hide = WITH_MAP.has(name) ? null : await page.addStyleTag({ content: NO_MAP });
  const png = await page.screenshot({ animations: "disabled", caret: "hide" });
  await hide?.evaluate((el) => el.remove());
  const file = join(ROOT, `${id}.png`);
  if (update) {
    writeFileSync(file, png);
    console.log(`  wrote ${id}`);
    return;
  }
  if (!existsSync(file)) {
    // Keep the picture, so a new screen's baseline can come from CI's own browser (its diff artifact).
    mkdirSync(DIFF, { recursive: true });
    writeFileSync(join(DIFF, `${id}.actual.png`), png);
    failures.push(`${id}: no baseline (run pnpm screenshots --update)`);
    console.log(`  FAIL ${id}: no baseline`);
    return;
  }
  const r = await compare(checker, readFileSync(file), png);
  const share = r.changed / r.total;
  const limit = name === "map" ? SHARE * 10 : SHARE;
  if (r.size || share > limit) {
    mkdirSync(DIFF, { recursive: true });
    writeFileSync(join(DIFF, `${id}.actual.png`), png);
    if (r.diff) writeFileSync(join(DIFF, `${id}.diff.png`), Buffer.from(r.diff, "base64"));
    const why = r.size ? "the size changed" : `${(share * 100).toFixed(2)}% of pixels changed (limit ${(limit * 100).toFixed(2)}%)`;
    failures.push(`${id}: ${why}`);
    console.log(`  FAIL ${id}: ${why}`);
  } else console.log(`  ok   ${id} (${(share * 100).toFixed(3)}%)`);
}

async function open(scheme, size) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: scheme, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "en-GB", timezoneId: "Europe/London" });
  const page = await context.newPage();
  watchCsp(page, csp);
  page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
  // No live feeds: weather, flood, lifts and live search all fall back, the same every time.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(() => {
    delete Navigator.prototype.geolocation;
    localStorage.setItem("causewayside.city.v1", "edinburgh");
    // Hold navigation's preview walk (a 500 ms tick) still.
    const every = window.setInterval;
    window.setInterval = (fn, ms, ...rest) => (ms === 500 ? 0 : every(fn, ms, ...rest));
  });
  await page.goto(server.url);
  await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: STILL + (size.zoom ? "\nhtml { font-size: 200% !important }" : "") });
  return page;
}

checker = await (await browser.newContext()).newPage();
for (const size of SIZES) {
  for (const scheme of size.schemes) {
    console.log(`${scheme} / ${size.id}`);
    let page = await open(scheme, size);
    await page.waitForTimeout(1500);
    await shoot(page, "map", scheme, size);

    await page.getByPlaceholder("Where to?").focus();
    await page.getByRole("button", { name: "Your data", exact: true }).click();
    await page.getByRole("dialog", { name: "Your data" }).waitFor();
    await shoot(page, "your-data", scheme, size);
    await page.keyboard.press("Escape");
    await page.getByPlaceholder("Where to?").blur();

    await page.getByPlaceholder("Where to?").fill("Hamilton Place");
    await page.getByRole("option").first().waitFor({ timeout: 30_000 });
    await shoot(page, "search", scheme, size);
    await page.getByRole("option").first().click();
    // No location here, so it asks where you're starting from, with the city's start suggested (FEAT-20).
    await page.getByText("This browser can't share where you are.").waitFor({ timeout: 10_000 });
    await page.getByPlaceholder("Where are you starting from?").blur();
    await shoot(page, "start-from", scheme, size);
    await page.getByRole("option", { name: /^Causewayside\s+Suggested start/ }).click();
    await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shoot(page, "route", scheme, size);

    await page.getByRole("button", { name: "Add a note about this route" }).click();
    await page.getByRole("radio", { name: "Bad" }).waitFor();
    await shoot(page, "note", scheme, size);
    await page.keyboard.press("Escape");

    // "Report what's there" from "What we don't know" (FEAT-03).
    await page.locator("details", { hasText: "What we don't know" }).first().evaluate((el) => (el.open = true));
    await page.getByRole("button", { name: /^Report what's there on / }).first().focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Report what's there" }).waitFor();
    await shoot(page, "whats-there", scheme, size);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("region", { name: "Next instruction" }).waitFor();
    await shoot(page, "navigation", scheme, size);
    await page.getByRole("button", { name: "Report a problem here" }).click();
    await page.getByRole("dialog", { name: "Report a problem" }).waitFor();
    await shoot(page, "report", scheme, size);
    await page.context().close();

    // The device editor, through first-visit setup.
    page = await open(scheme, size);
    await page.getByRole("button", { name: "Set up how you get around" }).first().click();
    await page.getByRole("dialog", { name: "What do you use?" }).waitFor();
    await shoot(page, "setup", scheme, size);
    await page.getByRole("radio", { name: /Powerchair, lightweight/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Name").fill("Cherry");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Save Cherry" }).click();
    await page.getByRole("button", { name: /Routes are for/ }).first().click();
    await page.getByRole("menu", { name: "Getting around as" }).waitFor();
    await shoot(page, "device-list", scheme, size);
    await page.getByRole("menuitem", { name: /^Edit/ }).click();
    await page.getByRole("dialog").filter({ hasText: "Your limits" }).waitFor();
    await shoot(page, "device-editor", scheme, size);
    await page.context().close();
  }
}
await browser.close();
server.close();

if (!update && !only) {
  const stale = readdirSync(ROOT).filter((f) => f.endsWith(".png") && !seen.has(f.slice(0, -4)));
  for (const f of stale) failures.push(`${f}: baseline for a screen that is no longer captured (delete it)`);
}
for (const c of csp) failures.push(`Content Security Policy: ${c}`);
if (failures.length) {
  console.error(`\n${failures.length} screenshot problem(s):\n${failures.map((f) => `  ${f}`).join("\n")}\nIf the change is wanted, run pnpm screenshots --update and commit the new pictures.`);
  process.exit(1);
}
console.log(update ? `\nBaselines written to tests/screenshots/ (${seen.size}).` : `\nAll ${seen.size} screens match their baselines.`);
