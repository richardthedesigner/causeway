# Plan: device classes and saved, named devices

Tester feedback, 2026-10-04. Status: engine and data done; screens wait for the UI update.

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

## For the UI update (not built yet)

Build these once the UI update lands, on its components:

1. **Device switcher in the header.** The header pill shows the active device's name. Tapping it opens a short list: favourites first, each with name, class ("Lightweight powerchair") and the key limits line. One tap switches device and re-plans the route.
2. **Save and name.** In "How do you get around?", after picking a class and adjusting limits: "Save as a device", with a name field ("Cherry") and a favourite star. Picking a preset must not overwrite a saved device's name (today `pick()` replaces the label).
3. **Edit, rename, delete, favourite** from the switcher list. Delete asks to confirm.
4. **Class picker wording.** Under "On wheels", group the powered options with one line each:
   - Lightweight or folding powerchair: "Small wheels. Struggles with kerbs, setts and hills."
   - Heavy duty powerchair: "Big wheels and batteries. Copes with rougher ground."
   - Pavement scooter (class 2): "4 mph, pavements only."
   - Road scooter (class 3): "Registered. Can use the road at 8 mph."
5. **Route screen.** Say which device the route is for ("For Cherry"), and when a route exists for one device but not another, offer to switch: "No route for Cherry. Lulu can do this one."
6. **Onboarding.** First run asks "What do you use?" and saves the first device, replacing the demo seed.

Accessibility for all of it: 48 px targets, names read by screen readers, the switcher works with Switch Control, no colour-only favourite state.

## Follow-ups from the same feedback

- **Search flicker.** In `PlaceSearch.tsx`, every keystroke runs `setLive(null)`, so live results vanish and come back 350 ms later. Keep the previous results until the new ones arrive. "grass market" with a space should also match "Grassmarket" in the local index.
- **Unmapped stretches.** Check the tester's route (their home to the Grassmarket) in the inspector: which street proxies were unmapped and why the alternative was poor. Candidates: map the pavements in OSM, or let a cautious user see "the only way is unmapped for 200 m" rather than a long detour.
- **Battery range.** Lightweight chairs have small batteries. A `maxRangeKm` per device, with a warning on long routes, fits the device model.
- **Speeds.** Road scooters do 8 mph on the road but 4 mph on pavements. The router uses one pace; split it if the pace learning shows it matters.
