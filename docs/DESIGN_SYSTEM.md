# Design system

How the Causewayside app looks and behaves, and why. Decision: [D-035](DECISIONS.md). Screens: [docs/ux/v2/](ux/v2/). Figma: see "Figma" at the end.

The code is the source of truth. Tokens live in `apps/web/src/app/globals.css`; the components named below live in `apps/web/src/components/`. If this page and the code disagree, the code wins and this page is out of date.

## The premise

Every screen answers one question first: **can I get there?** A wheelchair user's first question isn't "how long?". It's "will I be able to finish this?". So:

1. **You are the travel mode.** Google has car, walk and transit tabs. We have your profile ("Manual chair"), and it sits inside the search bar on every screen.
2. **Verdict first.** Every route and every recent place shows Fits, Unsure or Doesn't fit before the time.
3. **The route as a strip.** One bar, coloured by slope, with what you'll meet pinned on it. Dashed means we don't know.
4. **Never a dead end.** When nothing fits, say what's in the way and offer something you can do.
5. **Thumb reach.** Search and the main action sit at the bottom. The map gets everything above.

## Layout

| Surface | Phone | Desktop (≥ 768 px) |
|---|---|---|
| Map | Full screen, behind everything | Full screen |
| Sheet | Bottom sheet, snaps to 24%, 52%, 94% | 420 px panel docked left, 16 px inset |
| Map chrome | City and ground chips top left; layers and locate buttons top right | Same, starting right of the panel |
| Route actions | Start bar pinned to the bottom of the screen | Inline under the route card |
| Navigation | Instruction card top, progress panel bottom | Both 440 px wide, left |

With large text (root font ≥ 20 px) the sheet opens to full height instead of half.

## Colour

Light values first, then dark. Every colour is a CSS custom property; Tailwind reads them as `bg-surface`, `text-ok` and so on. Never use a literal colour in a component.

### Neutrals and accent

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ground` | `#e8ebe5` | `#141816` | Map background, page background |
| `--surface` | `#fbfbf8` | `#1c211f` | Sheets, cards, buttons |
| `--surface-2` | `#f1f3ee` | `#242a27` | Search field, secondary buttons, icon wells |
| `--glass` | `#fbfbf8` at 90% | `#1c211f` at 92% | Chips and buttons floating over the map (with backdrop blur) |
| `--ink` | `#1b211d` | `#ecefea` | Text, selected route card border |
| `--muted` | `#576059` | `#a3aca5` | Secondary text |
| `--line` | `#d2d8d0` | `#343c37` | Borders, dividers |
| `--accent` | `#1d5b86` | `#86bce2` | Primary button, profile chip, links, rides on the strip |
| `--accent-ink` | `#ffffff` | `#0d1a23` | Text on accent |
| `--nav` | `#123a56` | `#0e2e45` | Navigation instruction card |
| `--nav-ink` | `#ffffff` | `#ffffff` | Text on the instruction card |

### Verdicts

Meaning, not decoration. Always with a word and an icon, never colour alone.

| Verdict | Text | Tint | Icon | Word |
|---|---|---|---|---|
| Fits | `--ok` `#24724f` / `#57c194` | `--ok-soft` `#dcefe4` / `#1d3a2c` | CircleCheck | Fits |
| Unsure (some data missing) | `--caution` `#865a08` / `#e9b44c` | `--caution-soft` `#f6ead0` / `#3d3018` | CircleHelp | Unsure |
| Doesn't fit | `--stop` `#9e2440` / `#f07a92` | `--stop-soft` `#f6dde3` / `#43202a` | CircleX | Doesn't fit |
| Not known (ground) | `--unknown` `#737b75` / `#8b938d` | none | dashed line | Not known |

`--stop-ink` (`#ffffff` light, `#1c0a10` dark) is the text on a solid `--stop` fill: only the End button.

### Slope bands

The same five bands on the map's slope layer, the route line and the route strip. Thresholds follow UK guidance (Inclusive Mobility 2021: 5% preferred maximum, 8% absolute over short distances).

| Band | Gradient | Light | Dark |
|---|---|---|---|
| `--g0` | 0 to 3% | `#2f8f6b` | `#45b58a` |
| `--g1` | 3 to 5% | `#8bb04a` | `#a6c95d` |
| `--g2` | 5 to 8% | `#e0a92a` | `#f0bd3e` |
| `--g3` | 8 to 12% | `#d0612b` | `#ee7a44` |
| `--g4` | over 12% | `#8f1d3f` | `#e0507a` |
| not known | | `--unknown`, dashed | |
| steps | | `--stop`, dotted | |
| ride (bus, tram, train) | | `--accent`, thin | |

### Contrast (WCAG 2.2)

| Pair | Light | Dark |
|---|---|---|
| ink on surface | 15.8 | 14.1 |
| muted on surface | 6.3 | 7.0 |
| accent-ink on accent | 7.3 | 8.7 |
| ok on ok-soft | 4.9 | 5.6 |
| caution on caution-soft | 5.1 | 6.8 |
| stop on stop-soft | 5.9 | 5.3 |
| stop-ink on stop | 7.6 | 7.2 |
| nav-ink on nav | 11.9 | 14.0 |

Everything is at least 4.5:1. Check a new pair before you use it.

## Type

**Atkinson Hyperlegible** for everything, **Atkinson Hyperlegible Mono** for small uppercase labels. It was designed by the Braille Institute for low-vision readers: letters that are easy to confuse (I, l, 1; O, 0) look different.

Sizes are in rem so they follow the phone's text size setting. Body is 17 px (1.0625 rem).

| Role | Size | Weight | Where |
|---|---|---|---|
| Route time | 28 px | Bold, tabular | Route card, arrival time |
| Instruction distance | 32 px | Bold, tabular | Navigation card |
| Destination | 18 px | Bold | Journey row |
| Body | 17 px | Regular | Explanations, list items |
| Secondary | 14 px | Regular, `--muted` | Distances, sources, meta |
| Section label | 12 px | Mono, uppercase, 0.08 em tracking | "RECENT", "WHAT YOU CAN DO" |

Figures that line up use `tabular-nums` (the `.tabular` class).

## Shape and space

| | Value |
|---|---|
| Sheet radius | 22 px (`--radius`) |
| Card radius | 20 px (route card), 16 px (rows, buttons in rows) |
| Chip radius | full |
| Floating button | 48 px square, 16 px radius |
| Side gutter | 16 px |
| Gap between blocks | 12 px |
| Floating shadow | `0 2px 12px rgb(0 0 0 / 0.16)` |
| Sheet shadow | `0 -8px 40px rgb(0 0 0 / 0.18)` |

Borders mark a thing you can choose (route rows, options). A 2 px `--ink` border marks the selected route. Fills mark state (verdict tints, the "allowed once" banner).

## Touch and focus

- Every control is at least 48 px tall, or sits in a 48 px row. The primary action is 56 px.
- Focus: 3 px `--focus` outline, 2 px offset. The search bar shows it on the whole bar.
- Respect `prefers-reduced-motion`: no map easing, no transitions.
- Nothing may scroll sideways at 200% text. Rows wrap; chips truncate.

## Components

### Verdict pill (`RouteStrip.tsx`, `VerdictPill`)

Icon, word, tint. Used on route cards, other-way rows, recent places and the "as close as you can get" option. Never "step-free" while anything is unknown (the trust contract).

### Route strip (`RouteStrip.tsx`, `RouteStrip`)

The signature component. One 8 px bar, split into slope bands in route order, widths proportional to distance. Rides are shortened (6 to 15% of the walking distance) so a train doesn't swallow the bar.

Pins (32 px circles) sit on the bar at the point you meet them:

| Pin | Icon | Ring |
|---|---|---|
| Steep section | TrendingUp | caution |
| Setts or cobbles | Grid3x3 | caution |
| Kerb not mapped | CornerRightDown | caution |
| Moving bridge | Ship | caution |
| Lift | ArrowUpDown | ink |
| Ride | Bus | ink |
| Door | DoorOpen | ink |

Pins closer than 7% of the bar drop out visually; everything is still listed in words for screen readers. Sideways slope (camber) is spoken during navigation but not pinned: it's common and would crowd out what decides the route. While navigating, a 24 px accent dot shows where you are.

### Search bar (`PlaceSearch.tsx`)

Magnifier, field, and the profile chip (accent fill, wheelchair icon, short profile name) inside one 56 px bar. Tapping the chip opens "How do you get around?". Quick searches below it as outline chips. Before you type: recent places with a verdict and minutes, then places in the city.

### Map chrome (`MapChrome.tsx`)

Glass chips and buttons over the map. City chip (menu of cities, with the coverage line). Ground chip (Dry / Wet / Icy, with the weather source). Layers button (slopes on every street, the slope key, "About this map" with attribution). Locate button (start from your location). While navigating only the layers button stays.

### Route card (`RoutePanel.tsx`)

Selected route: 2 px ink border. Verdict pill, time, distance and steepest slope, the strip, one sentence on why this way, extras (rides, lifts, setts, how much isn't mapped), the door it ends at, live lift or works notes. Other ways below as 56 px rows: time, name, meta, verdict. Then the details you open when you want them: getting in, why this way, what we don't know, hills, buses, route in words, where this comes from.

### Nothing fits (`RoutePanel.tsx`, `NoFit`)

A `--stop-soft` panel names what's in the way ("12.8% uphill on Castle Wynd South") and the map marks it in red. Then "What you can do", as option cards:

1. **Get as close as you can.** The reachable point nearest the destination on the direct way, with its strip and verdict.
2. **I'll manage … today.** The smallest change to your limits that finds a way, for this journey only. Tried one limit at a time first.
3. **Check your limits.** Opens the profile sheet.

When a one-off change is in use, a caution banner says so ("Allowing slopes up to 13% for this journey only. Your saved limits haven't changed.") with Undo. It clears when the journey changes and is never saved.

### Navigation (`NavView.tsx`)

Top: the instruction card (`--nav`), arrow icon, distance, instruction. Under it, the "coming up" card for the next hazard within 300 m: `--caution-soft` while it's ahead, solid `--caution` when you're at it. Bottom: the strip with you on it, arrival time, minutes and distance left, End (solid `--stop`, the only red button), then Speak, Note and Report.

## Copy

- Plain British English. Say what happens: "Start", "Allow for this journey", "Show this route".
- Name the obstacle and where it is: "36 steps on Castle Wynd South", not "accessibility issue".
- Unknowns are unknowns: "470 m not fully mapped", never a guess dressed as a fact.
- Your saved settings are yours. Anything temporary says "for this journey only".
- No em dashes.

## Screens

| | |
|---|---|
| Home | [home.png](ux/v2/home.png), with recents: [home-recents.png](ux/v2/home-recents.png) |
| Route | [route.png](ux/v2/route.png), dark: [route-dark.png](ux/v2/route-dark.png), desktop: [desktop-route.png](ux/v2/desktop-route.png) |
| Nothing fits | [nothing-fits.png](ux/v2/nothing-fits.png), [nothing-fits-options.png](ux/v2/nothing-fits-options.png), [allowed-once.png](ux/v2/allowed-once.png) |
| Navigating | [navigating.png](ux/v2/navigating.png) |

The screenshots in `docs/ux/` (not `v2/`) and [UX_ASSESSMENT.md](UX_ASSESSMENT.md) show the interface before D-035.

## Checks

Run on every change to the UI:

- axe-core (WCAG 2.0 to 2.2 A/AA plus best practice) on home, route, nothing fits and navigation. Last run: no violations.
- 200% root text: nothing wider than the screen. Last run: none.
- Light and dark.
- Still owed (as in UX_ASSESSMENT): VoiceOver and TalkBack on real phones, and testing with disabled people.

## Figma

[Causewayside design system](https://www.figma.com/design/fXQDly3nwKL9NufpZW1wPa) (private to Richard's team). Figma follows the code, not the other way round.

- **Variables:** `Color` collection with Light and Dark modes (26 tokens, each with its `var(--…)` code syntax), and `Space & radius`.
- **Text styles:** the type ramp above, in Atkinson Hyperlegible.
- **Components:** Verdict pill (3 variants), Button (Primary, Secondary, Danger), Map chip, Map button, Search bar, Route strip, Route card, Other way row, Nothing fits panel, Option card, Allowed once banner, Instruction card, Coming up card. Fills, strokes and radii are bound to the variables; each has a description pointing to its code.
- **Screens:** Home, Route, Nothing fits, Navigating, and Route in dark mode, built from those components. The maps are placeholders.

When a token or component changes in code, update the Figma variable or component to match.
