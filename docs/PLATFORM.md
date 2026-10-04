# Platform recommendation

**Status: proposed, awaiting Richard's sign-off (D-004).** Nothing past the spike is built until then.

## Recommendation

One shared TypeScript core and two shells:

- **`packages/graph`, `packages/profile`, `packages/router`**: already built in Phase 0, with no platform dependencies.
- **`apps/mobile`: Expo (React Native), the primary product.** MapLibre Native (`@maplibre/maplibre-react-native`), on-device routing with the shared router, offline city packs, background location, Live Activities and Android ongoing notifications, haptics.
- **`apps/web`: Next.js App Router on Vercel, secondary.** Share-a-route and live-ETA pages for companions without the app, place pages, desktop trip planning, the Phase 1 debug map, and the marketing site. Full shadcn/ui.

## Criteria

| Criterion | Web PWA first | Expo from day one | Shared core + both (recommended) |
|---|---|---|---|
| Background location during navigation | iOS suspends a backgrounded PWA; no reliable background geolocation | Yes (`expo-location` background task) | Yes, on the app |
| Turn-by-turn reliability (screen off, in a pocket, on a chair mount) | Poor: needs the screen on, and Wake Lock is still patchy on iOS | Good | Good |
| Lock-screen presence | None | Live Activities (iOS), ongoing notification (Android) | Yes |
| VoiceOver / TalkBack inside a full-screen map | Workable, but a WebGL canvas is opaque to screen readers, so everything goes through a parallel DOM | Native accessibility tree; map annotations can be accessible elements | Native on the app; the web is used mostly for reading |
| Haptics | Vibration API absent on iOS Safari | Full (`expo-haptics`) | Yes |
| Offline storage (tiles, graph, POIs: est. 150 to 400 MB per city) | iOS can evict PWA storage after inactivity | App sandbox, durable | Yes |
| Battery | WebGL in a browser tab, no fine control | Native GL, location accuracy tuning | Better |
| App Store distribution and trust | No (only "Add to Home Screen") | Yes | Yes |
| Picked up cold by a stressed guest (principle 7) | A link opens instantly | Needs an install | **A link opens the web view instantly, with a prompt to install for navigation** |
| How much shadcn survives | 100% | Via react-native-reusables (shadcn API on NativeWind); vaul and cmdk replaced | 100% on web, the reusables port on native, one shared token set |
| Code shared with web | n/a | Core only | Core + design tokens + copy |

## What it costs

- **shadcn on native is a port, not shadcn.** react-native-reusables copies shadcn's API and owned-source model, styled with NativeWind (Tailwind). We keep one token file that drives both Tailwind configs, so the re-theme is shared. Component substitutions on native: Drawer (vaul) becomes `@gorhom/bottom-sheet` with snap points; Command (cmdk) becomes a custom list on the reusables primitives; Sonner becomes a native toast. **This is a partial deviation from "shadcn for all UI chrome" and needs Richard's explicit acceptance.**
- Two shells to keep at quality. Mitigation: the web app's scope is deliberately narrow (share, plan, debug, marketing); navigation is native only.
- App Store review and release cadence. Mitigation: Expo EAS updates for JS-only fixes.

## Rejected

- **Web PWA first**: fails the brief's own navigation bar (background location, lock screen, haptics, durable offline) on iOS, which is where most UK smartphone users are. It would be fine for a planning tool, not for getting someone from A to B.
- **Native Swift/Kotlin**: best accessibility and battery, but it loses the shared router and shadcn entirely, and doubles the work.

## Accessibility notes that apply to either shell

- The map is never the only representation: every route is also an ordered list of segments (`describeSegments` in the router), and that list is the screen-reader primary view.
- Gradient and surface are never encoded by colour alone: line pattern (setts hatched), width and labels carry the same information.
- Bottom-sheet architecture keeps primary controls in the bottom third; minimum target 48 px, preferring 56.
