# Phase 4 report: navigation and the loop (first pass)

Date: 2026-10-04.

## What shipped

- **Turn-by-turn core** (`packages/router/src/navigate.ts`): manoeuvres from bearings and street names, plus crossings, lifts, stations and trains. Hazards ahead: steep sections, setts, camber, unmapped and inferred kerbs, moving bridges and missing data, merged across edges and said once. Progress snapping that never jumps backwards, and accuracy-aware off-route detection. Tested by simulating travel along a real route.
- **Navigation screen**: live location, or a labelled preview when location isn't available. Next instruction with distance, a hazard banner, time and distance to go, and End, Speak and Report. Instructions go to screen readers; speech is opt-in. Vibration where supported. Off-route replans from where you are.
- **Report a problem**: two taps, with an optional note and photo, kept on the device (D-022).
- **Share arrival time**: destination and time only, never the profile.
- **Offline** (D-023): the app and loaded city graphs are cached, and routing runs on the device.

## Example: Royal Mile to Victoria Street, manual wheelchair

```
In 40 metres, continue onto Lawnmarket.
In 40 metres, turn left onto George IV Bridge.
Steep section in 60 metres: 7% downhill for 110 m. Setts for 110 m. Pavement slopes sideways: 5% for 70 m.
In 40 metres, turn right onto Victoria Street.
You have arrived.
```

## Not yet

- Lock-screen progress (Live Activities), background location and reliable haptics need the native app (D-004).
- Street-level imagery for complex junctions (Mapillary, D-008 licensing).
- Crowd verification and reputation: needs a backend and moderation (D-022, Richard).
- Passive surface sensing (opt-in accelerometer): needs the native app and a privacy review.
- ETA calibrated to the user's own speed over time.

## Decisions needing Richard

1. **Backend for reports** (Supabase): storing public location reports, moderation, and whether reports feed back into OSM (D-008).
2. **Native app start** (Expo, D-004): needs an Apple developer account and a Google Play account in his name or his organisation's.
