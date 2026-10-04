# Plan: device classes and saved, named devices

Tester feedback, 2026-10-04. Status: engine and data done; the device switcher is designed and planned below.

## What the tester said

- A lightweight powerchair and a heavy duty one have "really different parameters". Their lightweight chair, Cherry, can't do as much as their mobility scooter.
- Scooters split the same way: pavement (class 2) and road (class 3).
- They avoid cobbles and setts with Cherry because she gets stuck.
- They name their devices: the scooter is Lulu, the wheelchair is Cherry.
- Also reported: the destination field was twitchy while typing "Grassmarket", and the route had two long unmapped stretches and "struggled" to find another way.

## Done in this change (D-034)

**Four powered classes instead of two** (`packages/profile`)

| Preset | Label | Uphill | Kerb | Width | Setts / cobbles | Buses |
|---|---|---|---|---|---|---|
| `powerchair-light` (new) | Powerchair, lightweight | 8% | 3 cm | 0.8 m | heavy penalty / never | Yes, wheelchair space |
| `powerchair` | Powerchair, heavy duty | 12% | 5 cm | 1.0 m | light penalty | Yes, wheelchair space |
| `mobility-scooter` | Mobility scooter, pavement | 10% | 5 cm | 1.1 m | penalty | With a permit |
| `mobility-scooter-road` (new) | Mobility scooter, road | 12% | 7 cm | 1.2 m | light penalty | No, too big |

- Existing preset keys are unchanged, so saved profiles, notes and tests keep working. Only the labels gained "heavy duty" and "pavement".
- The numbers are starting points, like every preset. User testing replaces them.
- `isPowerchair()` and `isScooter()` replace string checks in the router.

**Road scooters in the router** (`packages/router/src/cost.ts`)
- New `roadLegal` flag. A street with no pavement costs a road scooter almost nothing extra (it belongs on the carriageway), and an unmapped pavement is not an unknown for it.
- Road scooters are excluded from buses; trams and the Metro say "check the operator's size rules", as for pavement scooters.

**Saved, named devices** (`SavedDevice` in `packages/profile`, store in `apps/web/src/lib/devices.ts`)
- A device is `{ id, name, favourite, profile }`. The name is also the profile's `label`, which the app already shows in the header and reads out ("Getting around as Cherry").
- Stored on the device only, like the profile (D-009).
- **Demo seed:** until onboarding creates the first device, the app starts as if the user had saved and favourited:
  - **Cherry**: lightweight powerchair, setts and cobbles set to never.
  - **Lulu**: pavement scooter.
- On a first visit the app starts as Cherry. Someone who already has a saved profile keeps it.
- Remove `SEED_DEVICES` when the device switcher and onboarding ship.

**Already covered:** notes label both powerchairs and both scooters "powerchair or scooter", so nothing about the class leaks into a shared note. The mode sheet lists the two new presets in "On wheels".

## Build plan: the device switcher (D-036)

Status: designed and agreed, ready to build on the new UI (D-035). Storyboard: the "Device switcher journey" artifact, 20 screens from first visit to managing devices.

### What was agreed

- **The device button stays inside the search bar**, where the profile chip sits today. No separate header control: search and "whose limits" are one bar.
- **The bar lives at the bottom**, in the existing drawer, in thumb reach. Nothing to tap goes at the top of the screen.
- **Label rule.** A named device shows its name only ("Cherry"). A type that was never named shows its icon and type, as today ("Manual chair").
- **The list opens upwards** from the button: favourites first, a tick on the device in use, then "Edit Cherry" and "+ Add a device". With more than two devices, the ones that aren't favourites go under an "Others" heading.
- **No search icon once a destination is in the bar.** The magnifier only shows on the empty "Where to?" state.
- **Narrow bars split onto two lines.** When the destination and the button don't both fit, the destination takes the first line and the button goes full width under it. Review the bar's padding while doing this.
- **Routes say who they're for.** A "For Cherry" tag on the route, and a line saying what changed after a switch ("7 min quicker than Cherry's route").
- **"Just this trip" stays.** When the device in use can't do a journey and another saved device can, offer "Use Lulu for this trip". The button reads "Lulu, this trip" and it reverts on arrival or a new destination.
- **Ask before switching mid-journey stays.** During navigation the device shows as an icon in the bottom bar. Tapping it asks "Switch device mid-journey?" rather than opening the list.
- **Editing is a full screen** opened from the list: name, favourite, type, limits, remove.
- **First visit:** with nothing saved, the button reads "Set up" and one line above the bar says why. Setup is three skippable screens: what do you use, what do you call it, check the limits. A one-time tip then points at the button.

### Work, in shipping order

Each step is one pull request that can go live on its own.

**1. Devices behind the profile** (`apps/web/src/lib/devices.ts`, `app/page.tsx`). Done.
- Page state holds `devices` and `activeId`; `profile` is the active device's profile. Every profile change writes back to that device.
- Migration: someone with a saved profile and no devices gets it as one unnamed device. Nobody loses settings.
- Unit tests: migration, favourites-first ordering, the label rule.

**2. Device button and list** (new `DeviceButton.tsx`, `DeviceMenu.tsx`; replaces `profileChip` in `page.tsx`)
- Button: the label rule above, chevron, 48 px tall. Accessible name: "Routes are for Cherry, lightweight powerchair. Change device".
- List: a popover on the top side of the button, as a radio group. Arrow keys move, Enter picks, Escape closes and returns focus to the button.
- Picking closes the list, re-plans (already reactive on `routeProfile`) and announces "Now using Lulu" in a polite live region, with a short toast.
- "Edit Cherry" opens step 4's screen. "+ Add a device" opens step 5's flow.

**3. Search bar layout** (`PlaceSearch.tsx`)
- Hide the magnifier when the bar shows a destination.
- Two-line layout using a container query on the bar: when the bar is narrower than the destination's minimum (about 12 characters) plus the button, wrap. Check it at 320 px, at 200% text and with the longest preset label ("Manual chair + help").
- Padding review: one inner padding for the bar, and the button inset to match the bar's corner radius.

**4. Edit a device** (`ModeSheet.tsx` becomes `DeviceEditor.tsx`)
- Full screen, not a sheet over the map: name, favourite, type, limits (today's limits section moves across as is), "Remove Cherry" with a confirm step in the page.
- Changing type keeps the name (today `pick()` overwrites the label).
- Type tiles get one line each for the powered classes (lightweight, heavy duty, pavement scooter, road scooter).

**5. First visit and add a device** (new `DeviceSetup.tsx`)
- Three steps with Skip on each: type, name with favourite switch, limits with Done. Skipping everything leaves an unnamed manual wheelchair, the current default.
- With no devices, the button reads "Set up" and the drawer's peek state shows one line: "Tell us how you get around and we'll plan routes you can actually do."
- One-time tip after the first save, remembered on the device.
- **Remove the Cherry and Lulu demo seed** (`SEED_DEVICES`) in this step, because real first visits replace it.

**6. Routes: who it's for and the switch offer** (`RoutePanel.tsx`, `RouteStrip.tsx`, `use-planner.ts`)
- "For Cherry" tag on the route verdict.
- After a switch, compare against the previous device's result and say what changed: time, and anything newly avoided or allowed.
- When the active device gets no route, plan for each other saved device in the worker. If one fits, offer "Use Lulu for this trip". This extends the existing `once` override from a patch to a whole device; it already clears on a new destination, so it also needs to clear on arrival.

**7. Navigation** (`NavView.tsx`)
- Bottom bar: device icon button, arrival time, End.
- Tapping the device opens "Switch device mid-journey?" with the other favourite as the main action and "Keep Cherry" as the second. Switching re-plans from the current position.

**8. "This trip" in the full drawer** (`page.tsx`, `MapChrome.tsx`)
- At the full snap, under recents: getting around as, weather, buses, toilet spacing.
- This moves the weather control from the top of the map into the drawer, so every control sits at the bottom. The city picker and layers can follow later.

### Checks for every step

- 48 px targets, visible focus, works with Switch Control and a keyboard.
- Screen readers hear the device name and type; favourite is spoken, not only a star.
- Light and dark, 320 px wide, 200% text.
- `pnpm typecheck` and `pnpm test` pass; new unit tests for the logic in steps 1, 2 and 6.

## Follow-ups from the same feedback

- **Unmapped stretches.** Diagnosed 2026-10-04 on the committed central graph, with Cherry's settings (lightweight powerchair, setts and cobbles never) from six EH7 starts (Picardy Place, Broughton Street, Elm Row, London Road, Abbeyhill, Montgomery Street). We don't have the tester's exact start.
  - **The two stretches.** Every start uses both. York Place, 331 m: the pavement is a road tag on one side only, and side-road kerbs are unmapped. The western way into the Grassmarket, about 560 m: West Port (229 m, no pavement tag at all), Grindlay Street (164 m), Lady Lawson Street (116 m) and Spittal Street (55 m), all street proxies.
  - **Why the route is long.** Not the data. From Picardy Place it is 1.6 km (23 min) on foot and 3.2 km (48 min) for Cherry, round by Lothian Road. Every short way in is closed to her: setts on Victoria Street, the High Street and Lawnmarket; West Bow at 12.3% and Victoria Terrace at 10.2%, over her 8% limit; steps on Candlemaker Row and the Vennel. With setts as a heavy penalty instead of never, the route is the same, so the hills alone force it.
  - **Why it "struggled".** There is no mapped alternative. Keeping her off street proxies adds about 1.9 km and 26 minutes. Treating every unknown as free changes the route by about 120 m, so the unknown penalties aren't distorting it.
  - **So.** Mapping those pavements in OSM, plus the York Place kerbs, would turn about 1.1 km of unknowns into known ground without shortening the route. "Unmapped for 200 m" doesn't fit this case, because no short unmapped cut is being avoided. The east end of the Grassmarket itself is setts, so where the destination pin sits matters for Cherry. Still open: check the West Bow and Victoria Terrace gradients on the ground, since they decide the route.
- **Battery range.** Lightweight chairs have small batteries. A `maxRangeKm` per device, with a warning on long routes, fits the device model.
- **Speeds.** Road scooters do 8 mph on the road but 4 mph on pavements. The router uses one pace; split it if the pace learning shows it matters.
