// Render the stone's static images (FEAT-73) from the live stone's own scene and poses, so the
// fallback shows exactly the pose the live stone holds, and reads without colour too.
//
//   node scripts/render-stones.mjs                 writes apps/web/public/stone/stone-{state}@{2,3}x.webp
//   node scripts/render-stones.mjs --png <dir>     also writes a 676 by 550 PNG of each pose to <dir>
//
// It bundles apps/web/src/components/v3/stone-scene.ts with esbuild and draws it in headless
// Chromium (software WebGL), like docs/ux/v3/stone/shoot.py did for the first renders.
import { build } from "esbuild";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps/web");
const out = join(web, "public/stone");
const pngAt = process.argv.indexOf("--png");
const pngDir = pngAt > 0 ? process.argv[pngAt + 1] : null;

const bundle = await build({
  stdin: {
    contents: `
      import { Color } from "three";
      import { applyPose, createStoneScene, drawRig, frame, setColour, CROP } from "./src/components/v3/stone-scene";
      import { COLOURS, POSES } from "./src/components/v3/stone-poses";
      // Draw at twice the 3x size and scale down: smoother edges than the renderer's own antialiasing.
      const SS = 2;
      const canvas = document.createElement("canvas");
      const s = createStoneScene({ canvas, preserveDrawingBuffer: true });
      s.renderer.setSize(CROP.w * SS, CROP.h * SS, false);
      frame(s.camera, CROP.x, CROP.y, CROP.w, CROP.h);
      const scaled = (w, h, type, q) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d");
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = "high";
        x.drawImage(canvas, 0, 0, w, h);
        return c.toDataURL(type, q);
      };
      window.shoot = (state) => {
        const r = s.rig(COLOURS[state]);
        setColour(r, new Color(COLOURS[state]));
        applyPose(r, POSES[state], 0);
        drawRig(s, r);
        return {
          x3: scaled(676, 550, "image/webp", 0.9),
          x2: scaled(451, 367, "image/webp", 0.9),
          png: scaled(676, 550, "image/png"),
        };
      };
      window.ready = true;
    `,
    resolveDir: web,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  minify: true,
});

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><body><script type="module">${bundle.outputFiles[0].text}</script></body></html>`);
await page.waitForFunction("window.ready === true", null, { timeout: 60_000 });
const bytes = (url) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
mkdirSync(out, { recursive: true });
if (pngDir) mkdirSync(pngDir, { recursive: true });
for (const state of ["fits", "unsure", "nope", "fog"]) {
  const shot = await page.evaluate((st) => window.shoot(st), state);
  if (!shot.x3.startsWith("data:image/webp")) throw new Error("This browser can't write WebP");
  writeFileSync(join(out, `stone-${state}@3x.webp`), bytes(shot.x3));
  writeFileSync(join(out, `stone-${state}@2x.webp`), bytes(shot.x2));
  if (pngDir) writeFileSync(join(pngDir, `stone-${state}.png`), bytes(shot.png));
  console.log(`stone-${state}: ${bytes(shot.x2).length} and ${bytes(shot.x3).length} bytes`);
}
await browser.close();
