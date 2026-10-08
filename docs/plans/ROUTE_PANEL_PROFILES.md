# Route panel: who it's for, saved profiles, route details

FEAT-21, FEAT-22 and FEAT-23. From Richard's feedback of 2026-10-08.

## What Richard saw

1. Once a destination is set, nothing shows the mobility mode or lets you change it.
2. Nothing says the settings are a saved, named profile, such as "Cherry".
3. Under the route sit nine identical collapsed rows. The facts that matter are hidden, and the rows all look the same.

## What's there already

- Named profiles exist. The code calls them devices (`SavedDevice`, D-034): a name, a favourite flag and a full `Profile`. They are saved in `localStorage` (`causewayside.devices.v1`), on the phone only (D-009). First visit starts with one unnamed device, from the current settings. `?demo=devices` seeds Cherry and Lulu.
- The device button (D-036) sits at the end of the destination bar. On the route screen it was easy to miss, and it says nothing about the type.
- Changing the active device re-plans already. The plan effect depends on the route profile.

## The plan

**FEAT-21: who the route is for.** A full-width row right above the route card: "Routing for **Cherry** · Powerchair, lightweight", then the limits in a line ("Kerbs up to 6 cm · slopes up to 8%"), and "Change". It is the same device menu (D-036), so the list, Edit and "Add a device" work as before. Picking another profile re-plans and the card says what changed (`compareLine`). The small button in the destination bar goes on the route screen, so there's one control, not two.

**FEAT-22: named, saved profiles.** Keep the device model and its storage. The row always shows the name, or the type for an unnamed profile, with "Give it a name, like Cherry" linking to Edit. New pure helpers, `routingFor` and `limitsLine`, are unit tested with switching.

**FEAT-23: route details.** In order, after Start:

1. **At a glance.** Up to five tiles: worth knowing, getting in, steepest, toilets, not known. Each has an icon, a word and a number, never colour alone. Each one jumps to its section and opens it.
2. **On this route.** As now (D-067). It opens by itself when something is blocked or slower.
3. **Getting in** (venues only), shown open: each entrance with its verdict.
4. **Hills**, shown open: the steepest figure and the elevation chart.
5. **Route in words**, shown open: the first five steps, "Show all N steps", and copy.
6. **Accessible toilets**, shown open: the gap line and the first three, then "Show all".
7. Kept behind disclosure: "What we don't know" (long, with report buttons), "Why this way?" and "Where this comes from".

**"Unsure" explained.** When the chosen route is Unsure, the card says why: "Unsure: 320 m of this route isn't fully mapped, so we can't promise it fits. See What we don't know." When another way is Unsure, one line under the list explains it.

## Accessibility

Real headings for each section, native `<details>` for what stays folded, and buttons with names that say where they go. Targets are at least 48 px, and the layout wraps at 320 px and 200% text. Copy is British English, with no em dashes.

## Tests

- Vitest: `routingFor`, `limitsLine`, and switching keeps every profile.
- `pnpm a11y`, `pnpm e2e` and `pnpm screenshots --update` (the route screen is meant to change).
