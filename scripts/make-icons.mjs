/**
 * Draws the app icons (SMALL-12) from one mark, so they stay in step.
 * The mark: a route that ends in a dot, white on the accent blue (D-035 tokens).
 * apps/web/public/icon.svg is the hand-kept source for browsers that take SVG (it also follows dark mode).
 * This script writes the rasters: favicon.ico (16, 32, 48), apple-touch-icon.png (180),
 * and icon-192/512 plus maskable versions. The maskable ones fill the whole square, and the
 * mark sits well inside the central 80% circle that launchers keep.
 *   node scripts/make-icons.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "./serve-out.mjs";

const PUBLIC = join(import.meta.dirname, "../apps/web/public");
const BLUE = "#1d5b86";
const mark = `<path d="M20 44C20 33 44 33 44 20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><circle cx="44" cy="20" r="7" fill="#fff"/>`;
const svg = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${rx}" fill="${BLUE}"/>${mark}</svg>`;

const browser = await launchBrowser();
const page = await browser.newPage();
async function png(size, rx) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(rx).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// Apple rounds the corners itself, so the touch icon is square. Standard icons carry their own corners.
writeFileSync(join(PUBLIC, "apple-touch-icon.png"), await png(180, 0));
writeFileSync(join(PUBLIC, "icon-192.png"), await png(192, 14));
writeFileSync(join(PUBLIC, "icon-512.png"), await png(512, 14));
writeFileSync(join(PUBLIC, "icon-maskable-192.png"), await png(192, 0));
writeFileSync(join(PUBLIC, "icon-maskable-512.png"), await png(512, 0));

// favicon.ico: three PNG entries.
const sizes = [16, 32, 48];
const images = [];
for (const s of sizes) images.push(await png(s, Math.max(4, Math.round(s * 0.2))));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const o = 6 + 16 * i;
  head[o] = s;
  head[o + 1] = s;
  head.writeUInt16LE(1, o + 4);
  head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(images[i].length, o + 8);
  head.writeUInt32LE(offset, o + 12);
  offset += images[i].length;
});
writeFileSync(join(PUBLIC, "favicon.ico"), Buffer.concat([head, ...images]));
await browser.close();
