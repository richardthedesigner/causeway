# Design v3 handoff: Drench with the stone

From: Jonny (design), for Claude Code sessions working in this repo. Written 23 Nov 2026.
Status: **proposal, not yet a decision.** It changes parts of D-035 and `docs/DESIGN_SYSTEM.md`. Nothing here ships until Richard settles the open questions below and a D-number records it.

Reference prototype (moves, swipe up and down): https://claude.ai/artifact/Y2FBKYeAhuK2Sw7PMrfdNP
Local copy: [docs/ux/v3/prototype/index.html](../ux/v3/prototype/index.html), recording `unfold-v1.mp4` beside it.

## What Richard chose

- Of three routes tried in November (Drench, Band, Object), he picked **Drench** for the working screens and found **Object** more engaging.
- The approved direction is a real hybrid, not two looks side by side: **one screen that opens as Object and unfolds into Drench.** Calm first, then the detail, with the stone staying on screen and walking to the stretch it can't vouch for.
- Only the route verdict screen exists as a prototype. The other flows (map, device, saved, reporting) exist as stills in the older Drench style and need the same treatment. Treat them as content and layout references, not finished designs.

## The idea in one paragraph

A route result opens as a moment: dark ground, the stone, one word (Fits, Unsure or Doesn't fit) and one flag for the thing that matters (here "990 m nobody has measured"). Pull up and it unfolds: the word shrinks into the pill, the time grows into a big figure, and the route rises underneath as streets drawn as bands in verdict colour. Measured streets are filled; an unmeasured stretch stays unlit. The stone shrinks and hops onto that stretch. The stone never carries words and never decorates: it only shows the state of the route.

## How it maps onto what's already here

| Today (DESIGN_SYSTEM.md) | v3 proposal | Note |
|---|---|---|
| Route card with verdict pill, time, strip | Moment state, then unfolded detail | Proposal: the moment is the route result before the sheet is pulled up; the unfolded state is the sheet at 94% |
| Route strip, one 8 px bar | Street bands, one row per stretch | The strip stays in the collapsed card and on the map. The bands are the strip opened out: same order, same data, one row per segment |
| Verdict pill: icon, word, tint | Verdict pill on a solid verdict fill | Keep the icon. Colour is never the only signal |
| Atkinson Hyperlegible everywhere | Atkinson for body, Bricolage Grotesque for display numbers and the verdict word | Needs Richard's decision (see below) |
| Light and dark themes | Dark ground is the moment's look; bands carry the colour | Light theme still needed: drench fields on light ground (see the stills) |

## Open questions for Richard (block the build)

1. **Controls at the top.** The prototype has Back and Read aloud at the top. D-035 says no control a user must tap sits at the top (one-handed and chair-mounted phones). Proposal: move both into the bottom bar beside GO. Recommended.
2. **Display type.** Bricolage Grotesque for the time, the verdict word and street names; Atkinson for everything else. Atkinson was chosen for low-vision legibility. Bricolage at 24 px and above keeps 1, l and I distinct enough, but it should be checked with testers (RES rows). Alternative: Atkinson Bold at the same sizes.
3. **Section labels.** DESIGN_SYSTEM.md uses mono uppercase section labels ("RECENT"). The v3 language drops them for plain headings. Needs a yes or no.
4. **Moment on every route, or first view only?** Proposal: the moment shows for a new route result; returning to a route you've already seen opens unfolded.
5. **New features in the stills, not on the roadmap:** "Tell me when someone measures the 990 m" (an alert on a saved route) and Undo after sending a report. Each needs a roadmap row and Richard's go, or comes out of the screens.

## Data corrections (the stills are wrong here)

- **Manual wheelchair kerb limit is 6 mm (0.6 cm), not 6 cm** (D-054, `packages/profile`). The device and limits stills say 6 cm. Fix in any build.
- **Devices:** the stills list five devices with invented names. Use the 13 presets and their labels from `packages/profile/src/index.ts`.
- **Report types:** the stills match the 13 categories in `packages/graph/src/community.ts`. Use those labels and `polarity`.
- **Route figures** (34 min, 1.9 km, 990 m on nine streets, Candlemaker Row 8.1%, adds 9 min) are the Grassmarket example from the brief. Every figure on screen must come from the router, never hard-coded.
- "Home: Warrender Park Road" on the saved still is invented.

## Tokens (proposed additions, CSS custom properties in `globals.css`)

Add, don't replace. Existing `--ok`, `--caution`, `--stop` stay for text and tints.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--moment-ground` | `#141210` | Moment and unfolded dark ground | ink on it 16.3 |
| `--moment-ink` | `#F5EFE4` | Text on the ground | |
| `--moment-muted` | `#CFC6B6` | Secondary text on the ground | 11.0 |
| `--ok-fill` | `#3DD68C` | Filled band, Fits | `#17130F` on it 9.9 |
| `--caution-fill` | `#FFB800` | Unsure pill, GO, the flag | `#17130F` on it 10.7 |
| `--stop-fill` | `#FF4E2E` | Doesn't fit, bad report | `#17130F` on it 5.6 |
| `--fill-ink` | `#17130F` | Text on any fill | |
| `--unknown-edge` | `#80756A` | Outline of the unlit band | 4.2 against ground (needs 3 for a UI edge) |

Radii: band 16 px, pill full, GO 18 px. Gutter 12 px for bands, 16 px elsewhere. Targets 48 px minimum (the prototype's 44 px buttons must grow), GO 56 px or more.

## Motion spec

All of it off under `prefers-reduced-motion` (crossfade only, 0.2 s).

| Step | Duration | Delay | Easing |
|---|---|---|---|
| Destination line fades | 0.18 s | 0 | ease |
| Verdict word shrinks to the pill and fades | 0.7 s | 0 | `cubic-bezier(.2,.8,.2,1)` |
| Header (time, pill, sentence) arrives | 0.4 s | 0.26 s | same |
| Bands rise 60 px, one after another | 0.6 s each | 0.18 s, then +0.06 s per band | same |
| Stone shrinks | 0.35 s | 0 | same |
| Stone hops to the unmeasured band | 0.7 s | 0.2 s | `cubic-bezier(.34,1.56,.64,1)` |
| Footer (note, GO) arrives | 0.6 s | 0.5 s | same |
| Stone idle bob | 3.2 s loop | | ease-in-out, 8 px |

Folding back reverses with no delays. Gestures: swipe up opens, swipe down closes, plus a real button ("Pull up for the way", `aria-expanded`) and Escape. The hidden layer is `inert` until opened. A polite live region says "Showing the way, street by street" and "Showing the verdict".

## The stone

- A sett (causey stone) with two eyes. Four states, rendered in three.js: [docs/ux/v3/stone/render.html](../ux/v3/stone/render.html) with `?c=<hex>&look=<side|front|down|up>`; `shoot.py` renders transparent PNGs with Playwright. It expects three.js 0.170 at `./three` beside the page (`npm i three@0.170`, then link `node_modules/three` there) and a local server on port 8765.
  - `unsure`: saffron, eyes to the side
  - `fits`: mint, eyes forward
  - `nope`: tomato, eyes down
  - `fog`: pale, for unmeasured
- Ship as PNG or WebP at 2x and 3x, or render live if the stack allows WebGL cheaply. PNGs first.
- Rules: the stone only ever shows the route's state. It sits beside text, never replaces it. It is decorative to screen readers (`alt=""`); the words carry the meaning.

## Components to build

1. `RouteMoment`: stone, verdict word, destination and time line, one flag, the pull-up button.
2. `StreetBand`: name, one-line condition, metres; variants filled (by verdict) and unlit (unmeasured, with the outline and diagonal hatch).
3. `VerdictPill`: existing component plus a `fill` variant.
4. `Stone`: state, size, idle animation, reduced-motion aware.
5. The unfold transition, wrapping 1 to 4.

## Screens

| Flow | Reference | State |
|---|---|---|
| Route verdict, moment and unfolded | `ux/v3/prototype/`, `screens/route-moment.png`, `screens/route-detail.png` | Approved direction, prototype |
| Map | `screens/Map.png` | Older Drench still, to redo in v3 |
| Device | `screens/Device.png` | Still; wrong figures (see above) |
| Saved, list and confirmation | `screens/SavedList.png`, `screens/SavedPeak.png` | Still |
| Report: good or bad, type, noted | `screens/ReportChoose.png`, `screens/ReportType.png`, `screens/ReportNoted.png` | Still |

## Roadmap

- FEAT-49 is this handoff (PR #96).
- FEAT-50 is the build. It waits on the open questions above, listed in [OPEN_ITEMS.md](../OPEN_ITEMS.md).

## Checks before any PR

The repo's usual ones (`pnpm typecheck`, `pnpm test`, `pnpm web:build && pnpm a11y`), plus: light and dark, 320 px wide, 200% text (bands wrap, nothing scrolls sideways), reduced motion, VoiceOver and TalkBack reading order (word, then flag, then button), and a screen recording of the unfold attached to the PR.
