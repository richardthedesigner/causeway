# UI/UX assessment: first app screen

Date: 2026-10-04. Build: `apps/web` (Next.js static export, router on the device). Screens: search, route, route options and detail, "How do you get around?", dark mode, desktop, 200% text. Screenshots in [docs/ux/](ux/).

## Method

- **Automated accessibility**: axe-core 4.10 (WCAG 2.0, 2.1 and 2.2 A/AA, plus best practice) on the search, route and mode screens, phone size.
- **Target sizes**: every visible control measured against the brief (48 px minimum, 56 px preferred) and WCAG 2.5.8.
- **Text scaling**: root text at 200%, checked for anything pushed off-screen.
- **Keyboard**: tab order through the desktop panel.
- **Heuristic review** against the brief's principles: one primary action per screen, plain language, explanations on demand, thumb reach, honesty about unknowns, never colour alone, guest-facing quality. Also Nielsen's ten heuristics.
- **Real journeys**: Causewayside to the Grassmarket (phone, light and dark), Causewayside to Victoria Street (desktop), a dropped pin.

**Not done, and needed before Phase 2 is called done:** VoiceOver and TalkBack on real devices (axe cannot judge how a bottom sheet over a map *sounds*), Switch Control and Voice Control, and testing with disabled users in Edinburgh. Headless Chromium also can't judge gesture feel (sheet drag, map pinch).

## Results

axe found no violations on any screen after the fixes. Every control is at least 44 px or sits inside a 48 px row. Nothing overflows at 200% text.

## Findings and what was done

Severity: **critical** (blocks the task), **serious** (likely to cause errors or exclusion), **moderate**, **minor**.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | The map rendered blank: MapLibre sets `position: relative` on its container, which overrode our full-screen positioning and collapsed the map to zero height. | Critical | Fixed: sizing moved to a wrapper. |
| 2 | The route was below the fold on a phone: brand header, journey and settings filled the half-height sheet. | Serious | Fixed: brand header only on the first screen, compact "Directions" label, route cards come before detail. |
| 3 | A stray tap on the map silently replaced the destination and threw the route away. | Serious | Fixed: a tap proposes a pin with "Directions here" and "Cancel"; nothing changes until confirmed. The pin has its own marker. |
| 4 | Body text was set in pixels, so it ignored the phone's text size setting (WCAG 1.4.4). | Serious | Fixed: rem-based. |
| 5 | At 200% text the swap button and the Dry/Wet/Icy control were pushed off-screen. | Serious | Fixed: grid tracks can shrink, controls wrap. Large text also opens the sheet fully. |
| 6 | The global focus ring overrode Tailwind utility classes (it was unlayered CSS), so components couldn't style their own focus state. | Moderate | Fixed: moved into the base layer. |
| 7 | Refusing location access did nothing visible. | Moderate | Fixed: a plain message says to type the start instead. |
| 8 | The route note said "Tap to see where" but tapping did nothing. | Moderate | Fixed: "shown dashed on the map", which is true. |
| 9 | "Step by step / 34 steps": in a product where steps mean stairs, this reads as 34 flights. | Moderate | Fixed: "Route in words / 34 parts". |
| 10 | Alternatives were called "Alternative 1" and "Alternative 2", and two were the same choice in practice (same time, distance and slope). | Moderate | Fixed: named by what differs ("Gentler", "Fewer setts", "Fewer unknowns", "Another way"); near-duplicates dropped. |
| 11 | "Why this way?" could cite an unknown width as the reason a street was avoided, which reads as a fact. | Moderate | Fixed: unknowns are never the stated reason; the copy says the route "takes streets we have better data for". |
| 12 | "Getting in" showed building entrances for a street destination (the Grassmarket). | Moderate | Fixed: only for venues and dropped pins. |
| 13 | The weather fallback said "set below" when the control was above. | Minor | Fixed, and the control moved next to its explanation. |
| 14 | The slopes layer toggle was a checkbox buried in the footer. | Minor | Fixed: a "Slopes" button on the map with a key that includes "Not known". |
| 15 | The start point was offered as a destination. | Minor | Fixed. |
| 16 | Trade-off cards repeated their title in the subtitle ("Avoid setts / Avoids setts"). | Minor | Fixed: a "+N min" badge instead. |
| 17 | Verdict copy "468 m we can't vouch for" was vague. | Minor | Fixed: "Missing data for 468 m". |
| 18 | Steps on the map drawn in full ink were noisy, especially in dark mode. | Minor | Fixed: muted. |
| 19 | Unknown stretches were only dashed on the map, with no list of where they are. | Moderate | Fixed: "What we don't know" lists each stretch by street, with length and what is missing. |
| 20 | Slider thumbs are 28 px: small for a tremor or gloves. | Moderate | Fixed: − and + buttons (48 px) beside every limit; also a simple path for Switch Control. |
| 21 | "Someone is pushing" replaced the whole profile with the pushed preset. | Moderate | Fixed: it now adjusts this person's own limits (+2% up, +1% down, +4 cm kerb) and reverses cleanly. |

## Open findings (not fixed in this round)

| Finding | Severity | Why open / next step |
|---|---|---|
| "What we don't know" has no "Report what's there" action yet. | Moderate | Phase 4 report-an-issue loop. |
| The map has no basemap (buildings, labels, water): it is drawn from our footway graph only. Legible, but not yet "a beautiful map". | Moderate | Protomaps basemap (D-007) in Phase 2b. |
| The map colours don't switch live if the system theme changes mid-session. | Minor | Re-read tokens on `prefers-color-scheme` change. |
| The mode sheet is long: eleven presets before the limits. | Minor | Fixed 2026-10-04: three groups (Walking, On wheels, Other needs); limits fold into one row that shows the key numbers and opens by itself once changed. |
| Search covers demo places and street names only. | Moderate | Geocoder (Photon + OS Open Names, D-006). |

## Against the brief's principles

| Principle | Assessment |
|---|---|
| Same experience for everyone | Yes. No accessibility mode; walking is one preset among eleven, all through the same screens. |
| Honesty over confidence | Strong. Nothing says "step-free" while anything is unknown; unknown stretches are dashed; entrances say "not known" rather than guessing; every access fact has a source. |
| The user's limits, not "wheelchair" | Yes: presets plus editable slopes, kerbs, steps, surfaces and tolerance for unknowns, saved on the device only. |
| Cognitive load | Improved: one primary action per state (search, choose route, confirm pin). Route detail is behind scrolling, not walls of data. |
| Explain the route | Yes: "Why this way?" plus trade-offs ("Every way there that fits your settings has setts."). |
| Reach and touch | Primary controls in the bottom sheet; 48 px or larger targets except slider thumbs (open item). |
| Guest-facing quality | Works without an account or install; weather falls back gracefully; offline-capable once loaded. Real-device and real-user testing still to do. |

## Follow-up: navigation and reporting (2026-10-04)

The navigation and report screens were added after the first assessment and checked the same way: axe finds no violations on the route, navigation or report screens.

| Check | Result |
|---|---|
| One primary action | Navigation: End (56 px, bottom third). Report: Save report. |
| Screen readers | Each new instruction and hazard goes to an assertive live region. App speech is opt-in ("Speak"), so it never talks over VoiceOver or TalkBack. |
| No location | Falls back to a clearly labelled preview that moves along the route. Never pretends to know where you are. |
| Hazards | Said once, before you reach them ("Steep section in 60 metres: 7% downhill for 110 m. Setts for 110 m."). The banner stays while you're on the stretch. |
| Off route | Two fixes beyond 25 m, or beyond the phone's own accuracy if that is worse, before replanning from where you are. One poor fix doesn't trigger it. |
| Sharing | "Share arrival time" shares destination and arrival time only, never the mobility profile. |
| Reports | Two taps (what's wrong, Save). Kept on the device; no profile attached. |

Open: lock-screen progress (Live Activities) and background location need the native app (D-004). Haptics work on Android only (the web has no vibration on iOS).

## Follow-up: user notes (2026-10-04)

Notes (D-026) were checked the same way, in headless Chromium with axe-core 4.10: no violations on the note sheet (from "Getting in", from a street on the route, and from navigation), the route screen with notes in light and dark mode, or "What we don't know" opened with a note under a street.

| Check | Result |
|---|---|
| Taps | Three plus typing on every path: open (a "Getting in" button, a street button under "Why this way?", or "Add a note" while navigating), Good / Mixed / Bad, Save note. Measured in the run. |
| One primary action | Save note. The mobility label and photo are optional and off by default. |
| Not colour alone | Each note shows an icon and the word Good, Mixed or Bad. |
| Honesty | Every note shows the date and "A Causewayside user" (or "You"), with "Their own experience, not checked by us." Notes over a year old say things may have changed. Notes never change a verdict. |
| Targets | Street buttons, the switch row and "Delete my note" are at least 48 px. |
| Screen readers | Street buttons read "Add a note about Victoria Street"; delete buttons name the place. The switch's description says exactly what others will see. |

Open: on a phone at half height, "Getting in" and the street buttons are below the fold until the sheet is pulled up (as for the rest of the route detail). Real-device VoiceOver and TalkBack checks are still to do.

## Follow-up: polish (2026-10-04)

| Change | Check |
|---|---|
| Profile and ground controls share one row on a 390 px phone (they wrap at large text rather than truncate). | Measured: same row at 390 px. |
| Mode sheet: presets in three groups; "Your limits" folds into a row showing uphill, kerb and steps. The whole sheet fits one phone screen. | axe: no violations. |
| A building destination routes to the best entrance that fits your settings, and says so ("Takes you to an entrance that fits your settings (sliding door, marked wheelchair accessible)"). Falls back to the building's centre if no entrance fits or none is reachable. | axe: no violations. |
