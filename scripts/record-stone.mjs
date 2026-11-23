// The live stone's review pack (FEAT-73), written to docs/ux/v3/stone-live/:
// - stone-live.mp4: a recording at 390 px wide of each state's idle loop, the change between
//   states, a tap and the hop, then the four states again with no colour;
// - greyscale-poses.png: the four still poses side by side, in greyscale;
// - greyscale-before-after.png: the first renders (top) against the new poses (bottom), in greyscale;
// - reduced-motion.png: the lab's live stone section under reduced motion (needs `pnpm web:build`).
//
//   node scripts/record-stone.mjs
//
// The recording plays the real StoneView frame by frame on a fixed clock, so it is smooth even
// though headless Chromium draws WebGL in software. Needs ffmpeg.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveOut } from "./serve-out.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps/web");
const out = join(root, "docs/ux/v3/stone-live");
mkdirSync(out, { recursive: true });
const STATES = ["fits", "unsure", "nope", "fog"];
const WORD = { fits: "Fits", unsure: "Unsure", nope: "Doesn't fit", fog: "Nobody has measured" };
const FPS = 30;
const GROUND = "#14110e";

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

// The recording.
{
  const bundle = await build({
    stdin: {
      contents: `
        import { StoneView, allowSoftwareWebgl } from "./src/components/v3/stone-stage";
        import { HEADROOM } from "./src/components/v3/stone-poses";
        allowSoftwareWebgl();
        const SIZE = 240;
        const h = Math.round((SIZE * 550) / 676);
        const canvas = document.getElementById("c");
        canvas.style.width = SIZE + "px";
        canvas.style.height = h * (1 + HEADROOM) + "px";
        const view = new StoneView(canvas, { state: "fits", idle: true, size: SIZE });
        view.setVisible(false); // the clock below draws every frame, not the page's loop
        window.view = view;
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
  const page = await browser.newPage({ viewport: { width: 390, height: 600 } });
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;background:${GROUND};color:#f4efe6;font:600 20px/1.3 system-ui,sans-serif}
    #wrap{height:600px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
    #cap{font-size:16px;font-weight:500;opacity:.8;min-height:22px}
    #word{font-size:30px;font-weight:800}
    canvas{display:block}
    .grey{filter:grayscale(1)}
  </style></head><body><div id="wrap"><div id="cap"></div><canvas id="c"></canvas><div id="word"></div></div>
  <script type="module">${bundle.outputFiles[0].text}</script></body></html>`);
  await page.waitForFunction("window.ready === true", null, { timeout: 60_000 });

  // The timeline, in seconds: each state long enough to show its whole loop, then a tap and a hop.
  const events = [];
  let at = 0;
  for (const [s, dur] of [["fits", 8], ["unsure", 11.5], ["nope", 13.5], ["fog", 9]]) {
    events.push({ at, state: s, cap: at === 0 ? `${s}: its idle loop` : `Changing to ${s}, then its idle loop` });
    events.push({ at: at + dur - 3.2, react: true, cap: `${s}: a tap` });
    events.push({ at: at + dur - 1.6, hop: true, cap: `${s}: the hop` });
    at += dur;
  }
  events.push({ at, grey: true, state: "fits", cap: "No colour: fits" });
  for (const [i, s] of ["unsure", "nope", "fog"].entries()) events.push({ at: at + 2.6 * (i + 1), state: s, cap: `No colour: ${s}` });
  const end = at + 2.6 * 4;

  const frames = mkdtempSync(join(tmpdir(), "stone-frames-"));
  let next = 0;
  const total = Math.round(end * FPS);
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    const now = 10_000 + t * 1000;
    while (next < events.length && events[next].at <= t) {
      const e = events[next++];
      await page.evaluate(
        ({ e, now, word }) => {
          if (e.state) window.view.setState(e.state, now);
          if (e.react) window.view.react(now);
          if (e.hop) window.view.hop(now);
          if (e.grey) document.getElementById("wrap").classList.add("grey");
          document.getElementById("cap").textContent = e.cap;
          if (e.state) document.getElementById("word").textContent = word[e.state];
        },
        { e, now, word: WORD },
      );
    }
    await page.evaluate((now) => window.view.frameAt(now), now);
    await page.screenshot({ path: join(frames, `f${String(f).padStart(5, "0")}.png`) });
  }
  const mp4 = join(out, "stone-live.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-preset", "slow", "-movflags", "+faststart", mp4]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`stone-live.mp4: ${end} s, ${(statSync(mp4).size / 1024).toFixed(0)} KB`);
  await page.close();
}

// The stills, from the images the fallback shows (rendered by scripts/render-stones.mjs) and the first renders.
{
  const uri = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;
  const cell = (src, label) => `<figure><img src="${src}" alt=""><figcaption>${label}</figcaption></figure>`;
  const row = (title, srcs) => `<h2>${title}</h2><div class="row">${STATES.map((s, i) => cell(srcs[i], WORD[s])).join("")}</div>`;
  const now = STATES.map((s) => uri(join(web, `public/stone/stone-${s}@3x.webp`), "image/webp"));
  const before = STATES.map((s) => uri(join(root, `docs/ux/v3/stone/stone-${s}.png`), "image/png"));
  const page = await browser.newPage({ viewport: { width: 1240, height: 400 } });
  const shoot = async (body, file) => {
    await page.setContent(`<!doctype html><html><head><style>
      body{margin:0;padding:24px;background:${GROUND};color:#f4efe6;font:600 20px/1.3 system-ui,sans-serif;filter:grayscale(1);width:max-content}
      h2{margin:8px 0 12px;font-size:20px}.row{display:flex;gap:16px;margin-bottom:16px}
      figure{margin:0;text-align:center}img{width:286px;height:233px;display:block}figcaption{margin-top:6px}
    </style></head><body>${body}</body></html>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
    await page.locator("body").screenshot({ path: join(out, file) });
    console.log(`${file}: ${(statSync(join(out, file)).size / 1024).toFixed(0)} KB`);
  };
  await shoot(row("The four poses, with no colour", now), "greyscale-poses.png");
  await shoot(row("Before: the first renders, with no colour", before) + row("After: the new poses, with no colour", now), "greyscale-before-after.png");
  await page.close();
}

// Reduced motion, on the lab page.
{
  const srv = await serveOut();
  const page = await browser.newPage({ viewport: { width: 390, height: 1300 }, reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto(`${srv.url}v3-lab.html?v3`);
  const sec = page.locator("section[aria-labelledby=lab-stone-live]");
  await sec.waitFor({ timeout: 60_000 });
  await page.getByText("Showing the still image: reduced motion is on.").waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("section[aria-labelledby=lab-stone-live] img")].every((i) => i.complete && i.naturalWidth));
  await sec.screenshot({ path: join(out, "reduced-motion.png") });
  console.log(`reduced-motion.png: ${(statSync(join(out, "reduced-motion.png")).size / 1024).toFixed(0)} KB`);
  srv.close();
}
await browser.close();
