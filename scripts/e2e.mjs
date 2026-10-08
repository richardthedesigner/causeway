/**
 * End-to-end journey in the built app (STAB-01): search for a place, get a
 * route, start navigating, arrive, end. One per city, so each city's graph,
 * search index and base map are known to load and route together.
 * Navigation runs in preview mode (no location), and the test runs the preview's
 * half-second ticks in batches of about 500 m (STAB-15), so the walk takes seconds
 * and a slow runner draws late, not less far. E2E_CPU=6 slows the page's CPU six
 * times; E2E_ARRIVE_MS overrides the 2-minute arrival limit.
 *   pnpm web:build && pnpm e2e
 * Then one journey through the rest of the trip (STAB-10): set up two devices
 * and switch between them, leave later, copy the route as text, add a note,
 * report what's there on a street we lack data for, by keyboard (FEAT-03),
 * then download a copy of your data and delete it all (SEC-06). One with no
 * signal (SMALL-06): the route still comes, and the app says what still works.
 * One where the routing worker crashes (STAB-07): it starts again and the route
 * comes back. And one in London with every live feed hanging (STAB-05): the route still
 * comes, and the weather and lift lines fall back within their time limit
 * instead of waiting for ever. And "On this route" (D-067): a London route
 * round a lift out, from TfL's recorded feeds, and an Edinburgh route's
 * summary row. Every request any
 * journey makes is checked for the profile (SEC-05, D-009): the device's name,
 * its type and its limits must never leave the phone. Destination first (FEAT-20): the city
 * journeys have no location, so they're asked where they're starting from and take the
 * city's suggested start; the others share a location, and no request may carry it. One
 * journey checks where you start: from your location, swapped, with location turned off,
 * and from outside the city. One with saved places on the map (SMALL-13): a marker offers
 * "Go here" and "Start from here", by keyboard too. And community reports (FEAT-35), against a stand-in
 * backend: add one in three taps, move its pin by keyboard, filter the map, and agree with one.
 * Exits 1 on any failed step, page error, profile leak, or anything the Content
 * Security Policy blocks. Runs in CI (.github/workflows/ci.yml). Set E2E_SHOT=<file.png>
 * to keep a screenshot of the trip journey when it fails.
 */
import { readFileSync } from "node:fs";
import { HERE, hereIn, launchBrowser, serveOut, watchCsp, watchPosition } from "./serve-out.mjs";

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
  // E2E_CPU=6 slows the page's CPU six times, to prove the walk arrives on a slow runner.
  if (process.env.E2E_CPU) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.E2E_CPU) });
  const problems = [];
  watchCsp(page, problems);
  watchProfile(page, problems);
  // Nothing the app itself serves may 4xx or 5xx (SMALL-12: /favicon.ico did). Outside services
  // (Open-Meteo, TfL and so on) rate-limit and fail on their own, so those only warn (STAB-21).
  page.on("response", (r) => {
    if (r.status() < 400) return;
    if (new URL(r.url()).origin === new URL(server.url).origin) problems.push(`${r.status()} for ${r.url()}`);
    else console.log(`  WARN ${r.status()} from outside service ${r.url().split("?")[0]}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  // No location: navigation falls back to its preview, which walks the route by itself.
  await page.addInitScript(() => {
    delete Navigator.prototype.geolocation;
    // NavView's preview moves along the route by a fixed distance each 500 ms tick (four times
    // walking speed, about 2.8 m). Run the ticks in batches, each covering about 500 m of the
    // route, so the walk is a dozen or so batches however fast the machine is. The page only has to
    // draw once per batch, and a slow runner draws late, not less far.
    const every = window.setInterval;
    window.setInterval = (fn, ms, ...rest) => (ms === 500 ? every(() => { for (let i = 0; i < 180; i++) fn(...rest); }, 50) : every(fn, ms, ...rest));
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
    await step(`no location, so it asks where you're starting from, with ${j.start} suggested`, async () => {
      await page.getByText("This browser can't share where you are.").waitFor({ timeout: 10_000 });
      await page.getByRole("option", { name: new RegExp(`^${j.start}\\s+Suggested start`) }).click();
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
      const began = Date.now();
      const arrived = page.getByRole("region", { name: "Next instruction" }).getByText(/arrived/);
      await arrived.waitFor({ timeout: Number(process.env.E2E_ARRIVE_MS ?? 120_000) }).catch(async () => {
        throw new Error(`never arrived: ${await page.getByRole("region", { name: "Next instruction" }).innerText()}`);
      });
      console.log(`       walked in ${((Date.now() - began) / 1000).toFixed(1)} s`);
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

// Saved places on the map (SMALL-13): each is a labelled button, reachable by keyboard. Tapping one offers "Go here" and
// "Start from here"; a saved place is also a start from "Where are you starting from?".
{
  const name = "edinburgh: saved places on the map";
  const problems = [];
  const saved = [
    { label: "Home", place: { id: "e2e-meadows", name: "The Meadows", kind: "Park", lon: -3.1894, lat: 55.9421 } },
    { label: "Work", place: { id: "e2e-links", name: "Bruntsfield Links", kind: "Park", lon: -3.204, lat: 55.9398 } },
    // About 1.1 km south of the city's start: under the half-open sheet until the map pans (SMALL-20).
    { label: "Flat", place: { id: "e2e-flat", name: "Morningside", kind: "Suburb", lon: -3.1812, lat: 55.9285 } },
  ];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  watchCsp(page, problems);
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  await page.addInitScript((list) => {
    localStorage.setItem("causewayside.city.v1", "edinburgh");
    localStorage.setItem("causewayside.saved.edinburgh.v1", JSON.stringify(list));
    // Location is off: answer at once, as a phone with it turned off does, so no run waits on a browser's own prompt.
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition = (_ok, fail) => setTimeout(() => fail({ code: 1, PERMISSION_DENIED: 1, message: "denied" }), 50);
  }, saved);
  const step = async (label, fn) => {
    try {
      await fn();
      console.log(`  ok   ${label}`);
    } catch (e) {
      const why = e.message.split("\n").find((l) => /waiting for/.test(l))?.trim() ?? "";
      failures.push(`${name}: ${label}: ${e.message.split("\n")[0]} ${why}`);
      console.log(`  FAIL ${label}: ${e.message.split("\n")[0]} ${why}`);
    }
  };
  const marker = (label) => page.getByRole("button", { name: `${label}, saved place`, exact: true });
  const fromText = async () => (await page.getByRole("button", { name: /^Change start/ }).first().innerText()).replace(/^\s*Change start:\s*/, "").trim();
  // By keyboard: with the sheet half open a marker can sit under it, where a tap can't reach.
  const openMarker = async (label) => {
    await marker(label).focus();
    await page.keyboard.press("Enter");
  };
  console.log(name);
  await page.goto(server.url);
  await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
  await step("each saved place is a button on the map", async () => {
    await marker("Home").waitFor({ timeout: 60_000 });
    await marker("Work").waitFor();
  });
  await step("every saved place can be tapped, not hidden under the sheet", async () => {
    // Under the sheet the marker's centre hits the sheet, not the marker. The map pans over half a second, so wait for it.
    const tappable = () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".saved-marker")].every((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return r.top >= 0 && r.bottom <= innerHeight && hit && el.contains(hit);
        }),
      );
    await page.waitForFunction(() => document.querySelectorAll(".saved-marker").length === 3);
    const until = Date.now() + 5000;
    while (!(await tappable()) && Date.now() < until) await page.waitForTimeout(100);
    if (!(await tappable())) throw new Error("a saved place is under the sheet, out of tap range");
  });
  await step("a marker opens Go here and Start from here by keyboard, and drops no pin", async () => {
    await marker("Home").focus();
    await page.keyboard.press("Enter");
    await page.getByRole("region", { name: "Saved place: Home" }).waitFor();
    for (const b of ["Go here", "Start from here", "Cancel"]) await page.getByRole("button", { name: b, exact: true }).waitFor();
    const focused = await page.evaluate(() => document.activeElement?.id);
    if (focused !== "saved-pick") throw new Error(`focus is on "${focused}", not the saved place`);
    if (await page.getByRole("region", { name: "Dropped pin" }).count()) throw new Error("a pin was dropped");
    await page.keyboard.press("Escape");
    await page.getByRole("region", { name: "Saved place: Home" }).waitFor({ state: "detached" });
    // Focus goes back on the next frame, so wait for it rather than reading it at once.
    await page.waitForFunction(() => document.activeElement?.id === "saved-marker-e2e-meadows", null, { timeout: 5000 }).catch(async () => {
      throw new Error(`focus went to "${await page.evaluate(() => document.activeElement?.id)}", not back to the marker`);
    });
  });
  await step("Start from here sets the start, and the marker gives way to the route's own", async () => {
    await openMarker("Work");
    await page.getByRole("button", { name: "Start from here", exact: true }).click();
    await marker("Work").waitFor({ state: "detached" });
    await page.getByPlaceholder("Where to?").fill("Hamilton Place");
    await page.getByRole("option").first().click();
    await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    if ((await fromText()) !== "Bruntsfield Links") throw new Error(`From says "${await fromText()}"`);
  });
  await step("on the route screen, another saved place is a start", async () => {
    await page.getByRole("button", { name: /^Change start/ }).first().click();
    await page.getByRole("option", { name: /Saved as Home/ }).first().click();
    await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    if ((await fromText()) !== "The Meadows") throw new Error(`From says "${await fromText()}"`);
  });
  await step("Go here makes it the destination", async () => {
    await page.goto(server.url);
    await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
    await openMarker("Work");
    await page.getByRole("button", { name: "Go here", exact: true }).click();
    // No location here, so it asks where you're starting from (D-073): a saved place does for that too.
    await page.getByPlaceholder("Where are you starting from?").waitFor();
    await page.getByRole("option", { name: /Saved as Home/ }).first().click();
    await page.getByRole("button", { name: /^Change destination: Bruntsfield Links/ }).waitFor({ timeout: 60_000 });
  });
  if (problems.length) failures.push(`${name}: ${problems.join("; ")}`);
  await context.close();
}

// The rest of the trip (STAB-10), in Edinburgh.
{
  const name = "edinburgh: devices, leaving later, a note, and your data";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...hereIn("edinburgh"), permissions: ["clipboard-read", "clipboard-write", "geolocation"] });
  const page = await context.newPage();
  const problems = [];
  watchCsp(page, problems);
  watchProfile(page, problems);
  watchPosition(page, "edinburgh", problems);
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
      // The trip settings sit under the search box, below the half-open drawer. Focusing search opens it fully, as a person dragging it up would.
      await page.getByPlaceholder("Where to?").focus();
      const soon = page.getByRole("button", { name: "In 1 hour" });
      await soon.waitFor();
      await soon.scrollIntoViewIfNeeded();
      // Really on screen, not just inside the drawer's scroll area (which runs below the bottom edge).
      await page.waitForFunction(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "In 1 hour");
        const r = b?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.bottom <= innerHeight;
      }, null, { timeout: 10_000 });
      await soon.click();
      await page.getByText(/^Routes, bus waits, opening hours, daylight and the forecast are for/).waitFor();
    });
    await step("a route for later", async () => {
      await page.getByPlaceholder("Where to?").fill("Hamilton Place");
      await page.getByRole("option").first().waitFor({ timeout: 30_000 });
      await page.getByRole("option").first().click();
      await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    });
    await step("copy the route as text", async () => {
      // Drag the sheet up, as a person would, so the route's sections are in view.
      const sheet = await page.locator("[data-vaul-drawer]").boundingBox();
      await page.mouse.move(sheet.x + sheet.width / 2, sheet.y + 8);
      await page.mouse.down();
      await page.mouse.move(sheet.x + sheet.width / 2, 40, { steps: 10 });
      await page.mouse.up();
      const words = page.getByText("Route in words", { exact: true });
      await words.scrollIntoViewIfNeeded();
      await words.click();
      await page.getByRole("button", { name: "Copy the route as text" }).click();
      // Copied, or (where the clipboard is blocked) the text offered to select. Either way, the route in words.
      const done = page.getByText("Copied. Paste it into a message.");
      await done.or(page.getByLabel(/Select the text instead/)).waitFor();
      const copied = await done.isVisible();
      const text = copied ? await page.evaluate(() => navigator.clipboard.readText()) : await page.getByLabel(/Select the text instead/).inputValue();
      if (!/^From .+ to Hamilton Place/.test(text) || !/\n1\. /.test(text)) throw new Error(`unexpected text: ${text.slice(0, 80)}`);
      if (text.includes(DEVICE)) throw new Error("the text names the device");
      // A powerchair reads kilometres and metres, the default for its type (SMALL-02).
      if (!/About [\d.]+ min, \d+(\.\d)? km\./.test(text) || /\b(miles?|yd)\b/.test(text)) throw new Error(`distance unit in the text: ${text.split("\n")[1]}`);
      await page.getByText("Route in words", { exact: true }).click();
    });
    await step("show distances in miles", async () => {
      // The same per-device choice as speeds: the route card, the strip and the copied text all follow it.
      await deviceButton().click();
      await page.getByRole("menuitem", { name: /^Edit/ }).click();
      await page.getByRole("dialog").filter({ hasText: "Your limits" }).waitFor();
      await page.getByText("Your limits", { exact: true }).first().click();
      await page.getByRole("radio", { name: /^Miles/ }).click();
      await page.keyboard.press("Escape");
      await page.getByText(/\d+(\.\d)? miles ·/).first().waitFor({ timeout: 60_000 });
      if (await page.getByText(/\d+(\.\d)? km ·/).count()) throw new Error("a route card still shows kilometres");
      const words = page.getByText("Route in words", { exact: true });
      await words.scrollIntoViewIfNeeded();
      await words.click();
      // The card follows the unit at once, and the route in words once the route is planned again: read it until it does.
      let text = "";
      for (let tries = 0; tries < 30; tries++) {
        await page.getByRole("button", { name: "Copy the route as text" }).click();
        const done = page.getByText("Copied. Paste it into a message.");
        await done.or(page.getByLabel(/Select the text instead/)).waitFor();
        text = (await done.isVisible()) ? await page.evaluate(() => navigator.clipboard.readText()) : await page.getByLabel(/Select the text instead/).inputValue();
        if (/About [\d.]+ min, \d+(\.\d)? miles\./.test(text) && !/\d (m|km)\b/.test(text)) break;
        await page.waitForTimeout(1000);
      }
      if (!/About [\d.]+ min, \d+(\.\d)? miles\./.test(text) || /\d (m|km)\b/.test(text)) throw new Error(`the copied text isn't in miles: ${text.match(/.{0,40}\d (m|km)\b.{0,20}/)?.[0] ?? text.split("\n")[1]}`);
    });
    await step("add a note about the route", async () => {
      await page.getByRole("button", { name: "Add a note about this route" }).click();
      await page.getByRole("radio", { name: "Bad" }).click();
      await page.getByLabel("What should people know?").fill("Kerb dropped on one side only.");
      await page.getByRole("button", { name: "Save note" }).click();
      await page.getByText("Saved. Thank you.").waitFor();
      await page.getByRole("button", { name: "Done" }).click();
    });
    // FEAT-03: say what's there on a street we lack data for, by keyboard alone. Kept on the phone, with the street and the question.
    await step("report what's there, by keyboard", async () => {
      const gap = page.locator("details summary", { hasText: "What we don't know" }).first();
      await gap.scrollIntoViewIfNeeded();
      await gap.focus();
      await page.keyboard.press("Enter");
      const report = page.getByRole("button", { name: /^Report what's there on / }).first();
      await report.focus();
      await page.keyboard.press("Enter");
      const sheet = page.getByRole("dialog", { name: "Report what's there" });
      await sheet.waitFor();
      const first = sheet.getByRole("radio").first();
      await first.focus();
      await page.keyboard.press("Space");
      if ((await first.getAttribute("aria-checked")) !== "true") throw new Error("Space didn't choose an answer");
      await sheet.getByRole("button", { name: "Save report" }).focus();
      await page.keyboard.press("Enter");
      await sheet.getByText("Saved. Thank you.").waitFor();
      await sheet.getByRole("button", { name: "Done" }).click();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("causewayside.reports.v1") ?? "[]"));
      const r = saved.find((x) => x.kind === "whats-there");
      if (!r?.about?.place || !r.about.answers?.[0]?.question || !r.about.answers[0].answer || typeof r.lon !== "number") throw new Error(`stored: ${JSON.stringify(r)?.slice(0, 120)}`);
      for (const m of PROFILE_MARKERS.slice(1)) if (JSON.stringify(r).includes(m)) throw new Error(`report holds "${m}"`);
    });
    // FEAT-04: save the destination, and find it first in search next time.
    await step("save the place as home", async () => {
      const save = page.getByRole("button", { name: "Save this place" });
      await save.scrollIntoViewIfNeeded();
      await save.click();
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await page.getByText("Saved as").waitFor();
    });
    await step("home comes first in search", async () => {
      await page.goto(server.url);
      await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
      await page.getByPlaceholder("Where to?").focus();
      const first = page.getByRole("option").first();
      await first.waitFor({ timeout: 30_000 });
      const t = await first.innerText();
      if (!/^Home\s+Hamilton Place/.test(t)) throw new Error(`first suggestion: ${t.replace(/\s+/g, " ")}`);
    });
    await step("search distances follow miles (SMALL-18)", async () => {
      // The device is still set to miles from the step above: a category search lists distances in yards or miles, never m or km.
      await page.getByPlaceholder("Where to?").fill("toilet");
      const first = page.getByRole("option").first();
      await first.waitFor({ timeout: 30_000 });
      const t = (await page.getByRole("option").allInnerTexts()).join(" ");
      if (!/\d (yd|miles?)\b/.test(t) || /\d (m|km)\b/.test(t)) throw new Error(`search distances aren't in miles: ${t.replace(/\s+/g, " ").slice(0, 160)}`);
    });
    await step("the note is kept on this phone, without the profile", async () => {
      const stored = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes("note")).map(([, v]) => v).join(" "));
      if (!stored.includes("Kerb dropped on one side only.")) throw new Error("note not stored");
      for (const m of PROFILE_MARKERS.slice(2)) if (stored.includes(m)) throw new Error(`note holds "${m}"`);
    });
    // SEC-06: one place for everything about you.
    const yourData = async () => {
      await page.goto(server.url);
      await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
      await page.getByPlaceholder("Where to?").focus();
      const link = page.getByRole("button", { name: "Your data", exact: true });
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await page.getByRole("dialog", { name: "Your data" }).waitFor();
    };
    await step("download a copy of your data", async () => {
      await yourData();
      await page.getByRole("dialog", { name: "Your data" }).getByText("1 report of what's there").waitFor();
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download a copy" }).click();
      const text = await (await download).createReadStream().then(async (s) => {
        let out = "";
        for await (const chunk of s) out += chunk;
        return out;
      });
      for (const want of [DEVICE, "Kerb dropped on one side only.", "causewayside.saved.", "whats-there"]) if (!text.includes(want)) throw new Error(`the copy lacks "${want}"`);
      if (/access_token/.test(text)) throw new Error("the copy holds a sign-in token");
    });
    await step("delete everything, and start afresh", async () => {
      await page.getByRole("button", { name: "Delete everything" }).click();
      await page.getByRole("button", { name: "Yes, delete everything" }).click();
      await page.getByText("Deleted.").waitFor();
      await page.getByRole("button", { name: "Close and start afresh" }).click();
      await page.getByRole("button", { name: "Set up how you get around" }).first().waitFor({ timeout: 60_000 });
      const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => /devices|notes|reports|recents|saved/.test(k)));
      if (left.length) throw new Error(`still stored: ${left.join(", ")}`);
    });
  } catch (e) {
    if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT });
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL ${e.message}`);
  }
  for (const p of problems) failures.push(`${name}: ${p}`), console.log(`  FAIL ${p}`);
  await context.close();
}

// No signal (SMALL-06): a loaded city keeps routing, and the app says so.
{
  const name = "edinburgh: no signal";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...hereIn("edinburgh") });
  const page = await context.newPage();
  const problems = [];
  watchCsp(page, problems);
  watchProfile(page, problems);
  watchPosition(page, "edinburgh", problems);
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  await page.addInitScript(() => localStorage.setItem("causewayside.city.v1", "edinburgh"));
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
      await page.getByText("Places in Edinburgh").waitFor({ timeout: 60_000 });
    });
    await step("the signal goes, and the app says what still works", async () => {
      await context.setOffline(true);
      await page.getByRole("status").filter({ hasText: "No signal" }).waitFor();
      await page.getByText(/Routes, search and the map for Edinburgh still work/).waitFor();
    });
    await step("a route is still found", async () => {
      await page.getByPlaceholder("Where to?").fill("Hamilton Place");
      await page.getByRole("option").first().waitFor({ timeout: 30_000 });
      await page.getByRole("option").first().click();
      await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    });
    await step("the signal comes back, and the notice goes", async () => {
      await context.setOffline(false);
      await page.getByRole("status").filter({ hasText: "No signal" }).waitFor({ state: "detached" });
    });
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL ${e.message}`);
  }
  for (const p of problems) failures.push(`${name}: ${p}`), console.log(`  FAIL ${p}`);
  await context.close();
}

// The routing worker crashes (STAB-07): it's started again, says so, and the route comes back.
{
  const name = "edinburgh: the routing worker crashes";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...hereIn("edinburgh") });
  const page = await context.newPage();
  const problems = [];
  watchCsp(page, problems);
  watchProfile(page, problems);
  watchPosition(page, "edinburgh", problems);
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  await page.addInitScript(() => localStorage.setItem("causewayside.city.v1", "edinburgh"));
  console.log(name);
  try {
    await page.goto(server.url);
    await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
    await page.getByPlaceholder("Where to?").fill("Hamilton Place");
    await page.getByRole("option").first().click();
    await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    console.log("  ok   a route");
    // Throw inside the worker, outside any handler: what a real crash looks like from the page.
    // The routing worker is one of the app's own chunks; MapLibre's workers are served from /maplibre/.
    const router = page.workers().find((w) => w.url().includes("/_next/"));
    if (!router) throw new Error("no routing worker found");
    await router.evaluate(() => setTimeout(() => {
      throw new Error("test crash");
    }));
    await page.getByText("Routing hit a problem and was started again").waitFor({ timeout: 60_000 });
    console.log("  ok   it says routing was started again");
    // A new worker, and the asked-for route back from it.
    const fresh = page.workers().find((w) => w.url().includes("/_next/") && w !== router);
    if (!fresh) throw new Error("no new routing worker");
    await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    console.log("  ok   a new worker, and the route is worked out again");
  } catch (e) {
    failures.push(`${name}: ${e.message.split("\n")[0]}`);
    console.log(`  FAIL ${e.message.split("\n")[0]}`);
  }
  for (const p of problems) failures.push(`${name}: ${p}`), console.log(`  FAIL ${p}`);
  await context.close();
}

// Every live feed hangs (STAB-05): TfL, Open-Meteo (weather and air), the Environment Agency, UKHSA and SEPA never answer.
{
  const name = "london: every live feed hangs";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...hereIn("london") });
  const page = await context.newPage();
  const problems = [];
  watchCsp(page, problems);
  watchPosition(page, "london", problems);
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  await page.route(/api\.tfl\.gov\.uk|open-meteo\.com|environment\.data\.gov\.uk|ukhsa-dashboard\.data\.gov\.uk|timeseries\.sepa\.org\.uk/, () => {});
  await page.addInitScript(() => localStorage.setItem("causewayside.city.v1", "london"));
  console.log(name);
  try {
    await page.goto(server.url);
    await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
    // The limit is 10 s (LIVE_TIMEOUT_MS); allow for the build being slow to start. The start screen shows the weather line.
    await page.getByText("Couldn't check the weather").first().waitFor({ timeout: 25_000 });
    console.log("  ok   the weather falls back to dry, and says so");
    await page.getByPlaceholder("Where to?").fill("Westminster Abbey");
    await page.getByRole("option").first().click();
    await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    console.log("  ok   a route, with no live feed answering");
    // With a train in the route, the line names the disruption feeds too (D-061).
    await page.getByText(/Couldn't get live lift status( or station and line disruptions)? from TfL/).first().waitFor({ timeout: 25_000 });
    console.log("  ok   the lift line says it couldn't check");
  } catch (e) {
    failures.push(`${name}: ${e.message.split("\n")[0]}`);
    console.log(`  FAIL ${e.message.split("\n")[0]}`);
  }
  for (const p of problems) failures.push(`${name}: ${p}`), console.log(`  FAIL ${p}`);
  await context.close();
}

// "On this route" (D-067). London with TfL's recorded lift outages and station messages: a wheelchair route to Canary Wharf
// goes round the faulty lift, the route card says so in one line, and the list opens by itself with it under Blocked and
// the escalator message at Canning Town under Worth knowing. Then Edinburgh: the list is there, closed, saying what's in it.
{
  const name = "london: a lift out on the way, in On this route";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...hereIn("london") });
  const page = await context.newPage();
  const problems = [];
  watchCsp(page, problems);
  watchPosition(page, "london", problems);
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  const fixture = (f) => readFileSync(new URL(`../packages/live/test/fixtures/${f}`, import.meta.url), "utf8");
  await page.route(/open-meteo\.com|environment\.data\.gov\.uk|ukhsa-dashboard\.data\.gov\.uk/, (r) => r.abort());
  await page.route(/api\.tfl\.gov\.uk/, (r) => {
    const u = r.request().url();
    const body = /Disruptions\/Lifts/.test(u) ? fixture("tfl-lifts-2026-10-04.json") : /StopPoint\/Mode/.test(u) ? fixture("tfl-station-disruptions-2026-10-04.json") : "[]";
    return r.fulfill({ contentType: "application/json", body });
  });
  await page.addInitScript(() => localStorage.setItem("causewayside.city.v1", "london"));
  console.log(name);
  try {
    await page.goto(server.url);
    await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
    await page.getByPlaceholder("Where to?").fill("Canary Wharf station");
    await page.getByRole("option").first().click();
    await page.getByText("Goes round a closure on the way. See On this route.").waitFor({ timeout: 60_000 });
    console.log("  ok   the route card says it goes round a closure, in one line");
    const list = page.locator("details", { hasText: "On this route" }).first();
    if (!(await list.evaluate((el) => el.open))) throw new Error("On this route didn't open by itself");
    await list.getByRole("heading", { name: "Blocked (1 item)" }).waitFor();
    await list.getByText(/faulty lift/).first().waitFor();
    await list.getByText(/Live, TfL, at \d\d:\d\d/).first().waitFor();
    console.log("  ok   On this route opens by itself, with the lift under Blocked, labelled live from TfL");
    await list.getByText(/reduced escalator service/i).first().waitFor();
    if (await page.getByText(/lifts? out of service, routed around/).count()) throw new Error("the card still counts lift outages across London");
    console.log("  ok   TfL's escalator message is worth knowing, and the card has no area-wide lift count");
  } catch (e) {
    failures.push(`${name}: ${e.message.split("\n")[0]}`);
    console.log(`  FAIL ${e.message.split("\n")[0]}`);
  }
  for (const p of problems) failures.push(`${name}: ${p}`), console.log(`  FAIL ${p}`);
  await context.close();
}
{
  const name = "edinburgh: On this route on a route with nothing blocked";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...hereIn("edinburgh") });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  await page.addInitScript(() => localStorage.setItem("causewayside.city.v1", "edinburgh"));
  console.log(name);
  try {
    await page.goto(server.url);
    await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
    await page.getByPlaceholder("Where to?").fill("Grassmarket");
    await page.getByRole("option").first().click();
    await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    const summary = page.locator("details summary", { hasText: "On this route" }).first();
    const text = (await summary.innerText()).replace(/\s+/g, " ");
    if (!/On this route (Nothing known|(\d+ (blocked|slower|worth knowing)(, )?)+)/.test(text)) throw new Error(`summary says "${text}"`);
    if (/blocked/.test(text)) throw new Error(`something blocked on a quiet day: "${text}"`);
    console.log(`  ok   the summary row says what's inside: "${text.replace("On this route ", "")}"`);
  } catch (e) {
    failures.push(`${name}: ${e.message.split("\n")[0]}`);
    console.log(`  FAIL ${e.message.split("\n")[0]}`);
  }
  for (const p of problems) failures.push(`${name}: ${p}`), console.log(`  FAIL ${p}`);
  await context.close();
}

// The icons are there and are images (SMALL-12). The manifest's icons too.
{
  const manifest = await (await fetch(`${server.url}manifest.webmanifest`)).json();
  const paths = ["favicon.ico", "icon.svg", "apple-touch-icon.png", ...manifest.icons.map((i) => i.src)];
  for (const path of new Set(paths)) {
    const r = await fetch(new URL(path, server.url));
    if (!r.ok || r.headers.get("content-type")?.startsWith("image/") !== true) failures.push(`icon ${path}: ${r.status} ${r.headers.get("content-type")}`);
  }
}

// Where you start (FEAT-20, D-073): destination first, then your location, asked for only then. Swap ends. Location
// turned off, and standing outside the city: both say so and ask where you're starting from, the city's start suggested.
{
  const name = "edinburgh: where you start";
  const problems = [];
  const run = async (label, options, init, fn) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
    const page = await context.newPage();
    watchCsp(page, problems);
    watchPosition(page, "edinburgh", problems);
    page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    await page.addInitScript(() => localStorage.setItem("causewayside.city.v1", "edinburgh"));
    // Count every time the app asks the phone where it is.
    await page.addInitScript(() => {
      const geo = navigator.geolocation;
      if (!geo) return;
      const get = geo.getCurrentPosition.bind(geo);
      window.__asked = 0;
      geo.getCurrentPosition = (...a) => {
        window.__asked++;
        return get(...a);
      };
    });
    if (init) await page.addInitScript(init);
    try {
      await page.goto(server.url);
      await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
      await page.getByText("Places in Edinburgh").waitFor({ timeout: 60_000 });
      if (await page.evaluate(() => window.__asked)) throw new Error("asked for the location on page load");
      if (await page.getByRole("button", { name: /^Change start/ }).count()) throw new Error("a From field before a destination");
      await page.getByPlaceholder("Where to?").fill("Hamilton Place");
      await page.getByRole("option").first().click();
      await fn(page);
      console.log(`  ok   ${label}`);
    } catch (e) {
      failures.push(`${name}: ${label}: ${e.message.split("\n")[0]}`);
      console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`);
    }
    await context.close();
  };
  const fromText = async (page) => (await page.getByRole("button", { name: /^Change start/ }).first().innerText()).replace(/^\s*Change start:\s*/, "").trim();
  console.log(name);
  await run("from your location, focus on From, and swap", hereIn("edinburgh"), null, async (page) => {
    await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    if ((await fromText(page)) !== "Your location") throw new Error(`From says "${await fromText(page)}"`);
    if (!(await page.evaluate(() => window.__asked))) throw new Error("never asked for the location");
    const focused = await page.evaluate(() => document.activeElement?.id);
    if (focused !== "journey-from") throw new Error(`focus is on "${focused}", not From`);
    await page.getByRole("button", { name: "Swap start and destination" }).click();
    await page.getByRole("button", { name: /^Change destination: Your location/ }).waitFor();
    if ((await fromText(page)) !== "Hamilton Place") throw new Error(`after swapping, From says "${await fromText(page)}"`);
    await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
    // Live search is biased to the city's start, never to you: watchPosition fails the run if a request carries it.
    await page.getByRole("button", { name: /^Change destination/ }).click();
    const photon = page.waitForRequest(/photon\.komoot\.io/, { timeout: 15_000 });
    await page.getByPlaceholder("Where to?").fill("Qzxv Lane");
    const u = new URL((await photon).url());
    if (u.searchParams.get("lat") === String(HERE.edinburgh.latitude)) throw new Error("Photon was sent your position");
  });
  await run(
    "location turned off: it says so, and asks where you're starting from",
    {},
    () => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => setTimeout(() => fail({ code: 1, PERMISSION_DENIED: 1, message: "denied" }), 50);
    },
    async (page) => {
      await page.getByText("Location is turned off for this site, so we can't tell where you are.").waitFor({ timeout: 10_000 });
      const focused = await page.evaluate(() => document.activeElement?.getAttribute("placeholder"));
      if (focused !== "Where are you starting from?") throw new Error(`focus is on "${focused}"`);
      await page.getByRole("option", { name: /^Causewayside\s+Suggested start/ }).click();
      await page.getByText("Why this way?").waitFor({ timeout: 60_000 });
      if ((await fromText(page)) !== "Causewayside") throw new Error(`From says "${await fromText(page)}"`);
    },
  );
  await run("outside the city: it says so, and asks where you're starting from", { ...hereIn("edinburgh"), geolocation: HERE.london }, null, async (page) => {
    await page.getByText("You're outside the part of Edinburgh we have routes for.").waitFor({ timeout: 10_000 });
    await page.getByPlaceholder("Where are you starting from?").waitFor();
  });
  for (const p of problems) failures.push(`${name}: ${p}`), console.log(`  FAIL ${p}`);
}
// Community reports (FEAT-35, D-084), against a stand-in backend (the build has no keys; sync.ts takes one on localhost
// only). Add a report in three taps at your location, move a pin by keyboard, filter the map, and agree with someone
// else's report, which makes it confirmed. Reports carry a place on purpose (the thing reported), never the profile.
{
  const name = "edinburgh: community reports";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...hereIn("edinburgh") });
  const page = await context.newPage();
  const problems = [];
  watchCsp(page, problems);
  watchProfile(page, problems);
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  const now = new Date().toISOString();
  const theirs = [
    { id: "0e2e0000-0000-4000-8000-000000000001", area_id: "edinburgh", category: "broken-lift", lon: -3.1835, lat: 55.9395, body: "Out since Monday", photo_path: null, observed_at: now, votes: [{ kind: "agree", at: now }], my_vote: null, own: false },
    { id: "0e2e0000-0000-4000-8000-000000000002", area_id: "edinburgh", category: "seat", lon: -3.1795, lat: 55.9380, body: null, photo_path: null, observed_at: now, votes: [], my_vote: null, own: false },
  ];
  const posted = { reports: [], votes: [] };
  await page.addInitScript(() => {
    window.__CAUSEWAY_TEST_BACKEND__ = { url: "https://e2e.supabase.co", key: "e2e-anon" };
    localStorage.setItem("causewayside.city.v1", "edinburgh");
  });
  await page.route(/open-meteo\.com|environment\.data\.gov\.uk|ukhsa-dashboard\.data\.gov\.uk|timeseries\.sepa\.org\.uk/, (r) => r.abort());
  await page.route(/e2e\.supabase\.co/, (r) => {
    const req = r.request();
    const u = new URL(req.url());
    const json = (body, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname.startsWith("/auth/v1/")) return json({ access_token: "e2e", refresh_token: "e2e", expires_in: 3600, user: { id: "0e2e0000-0000-4000-8000-0000000000ff" } });
    if (u.pathname === "/rest/v1/community_report_public") return json(theirs);
    if (req.method() === "GET") return json([]);
    if (u.pathname === "/rest/v1/community_report") posted.reports.push(JSON.parse(req.postData() ?? "{}"));
    if (u.pathname === "/rest/v1/community_vote") posted.votes.push(JSON.parse(req.postData() ?? "{}"));
    return r.fulfill({ status: 201, body: "" });
  });
  console.log(name);
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      throw new Error(`${label}: ${e.message.split("\n")[0]}`);
    }
    console.log(`  ok   ${label}`);
  };
  try {
    await page.goto(server.url);
    await page.getByPlaceholder("Where to?").waitFor({ timeout: 60_000 });
    await step("add a report in three taps, at your location", async () => {
      await page.getByRole("button", { name: "Add a report", exact: true }).click(); // 1
      const sheet = page.getByRole("dialog", { name: "Add a report" });
      await sheet.getByText(/^Your location/).waitFor({ timeout: 15_000 });
      await sheet.getByRole("radio", { name: "No dropped kerb" }).click(); // 2
      await sheet.getByRole("button", { name: "Save: No dropped kerb" }).click(); // 3
      await sheet.getByText("Saved. Thank you.").waitFor();
      await sheet.getByRole("button", { name: "Done" }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label^="No dropped kerb, a problem"]'), null, { timeout: 15_000 });
      const sent = posted.reports[0];
      if (!sent || sent.category !== "no-dropped-kerb" || sent.area_id !== "edinburgh") throw new Error(`sent: ${JSON.stringify(sent)}`);
      const [, lon, lat] = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(sent.geom) ?? [];
      if (Math.abs(Number(lon) - HERE.edinburgh.longitude) > 1e-4 || Math.abs(Number(lat) - HERE.edinburgh.latitude) > 1e-4) throw new Error(`not at your location: ${sent.geom}`);
    });
    await step("move the pin with the keyboard, then back to the sheet", async () => {
      await page.getByRole("button", { name: "Add a report", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Add a report" });
      await sheet.getByText(/^Your location/).waitFor({ timeout: 15_000 });
      await sheet.getByRole("button", { name: "Move the pin" }).click();
      const pin = page.getByRole("button", { name: /^Report pin/ });
      await pin.waitFor();
      await pin.focus();
      for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await sheet.getByText("Where you put the pin").waitFor();
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached" });
    });
    await step("filter the map: problems off, then on", async () => {
      const bad = page.locator('[aria-label^="Broken lift, a problem"]');
      const good = page.locator('[aria-label^="Somewhere to sit, good for access"]');
      await bad.waitFor();
      await good.waitFor();
      await page.getByRole("button", { name: "Map layers" }).click();
      await page.getByRole("menuitemcheckbox", { name: /Problems/ }).click();
      await bad.waitFor({ state: "detached" });
      if (!(await good.count())) throw new Error("good things went too");
      await page.getByRole("menuitemcheckbox", { name: /Problems/ }).click();
      await bad.waitFor();
      await page.keyboard.press("Escape");
    });
    await step("agree with someone else's report: it becomes confirmed", async () => {
      // By keyboard: on a phone this one is under the half-open sheet, and a marker is a real button.
      await page.locator('[aria-label^="Broken lift, a problem"]').focus();
      await page.keyboard.press("Enter");
      const sheet = page.getByRole("dialog", { name: "Broken lift" });
      await sheet.getByText("Not confirmed yet").waitFor();
      await sheet.getByRole("button", { name: "Agree", exact: true }).click();
      await sheet.getByText("Confirmed", { exact: true }).waitFor();
      if ((await sheet.getByRole("button", { name: "Agree", exact: true }).getAttribute("aria-pressed")) !== "true") throw new Error("Agree isn't shown as chosen");
      for (let i = 0; i < 50 && !posted.votes.length; i++) await page.waitForTimeout(100);
      if (posted.votes[0]?.kind !== "agree" || posted.votes[0]?.report_id !== theirs[0].id) throw new Error(`vote sent: ${JSON.stringify(posted.votes[0])}`);
      await sheet.getByRole("button", { name: "Yes, still there" }).click();
      await sheet.getByRole("button", { name: "Report this report" }).waitFor();
    });
  } catch (e) {
    if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT });
    failures.push(`${name}: ${e.message.split("\n")[0]}`);
    console.log(`  FAIL ${e.message.split("\n")[0]}`);
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
console.log("\nEvery journey ran from search to arrival, no request carried the profile or your position, and hung feeds fell back.");
