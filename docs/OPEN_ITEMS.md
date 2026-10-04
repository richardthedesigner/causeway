# Open items

What's outstanding on Causewayside: things waiting on Richard, things blocked outside the project, and guesses to check with users. Keep this up to date: add an item when it comes up, and move it to "Done" with the date when it's settled. Details live in the linked issue or decision.

Last updated: 2026-10-04.

## Waiting on Richard

| What | Why it matters | Effort | Link |
|---|---|---|---|
| Run the data refresh once by hand: Actions, then data-refresh, then Run workflow on `main` | Proves the weekly refresh works. It has never run, and this project's sessions can't start workflows | 1 minute | [#14](https://github.com/richardthedesigner/causeway/issues/14) |
| Sign up for free API keys: National Rail, Met Office, Mapillary, BODS, Nexus | Each unlocks a data adapter (live trains, better weather, street photos, live buses) | About 30 minutes | [#9](https://github.com/richardthedesigner/causeway/issues/9) |
| Decide whether to show OpenStreetMap access tags for named venues at public launch | Saying a named business is or isn't accessible carries reputational and legal risk | A decision | [#11](https://github.com/richardthedesigner/causeway/issues/11) |
| Apply for the live Street Manager feed, and access to Scotland's roadworks register | Edinburgh has no roadworks data at all; England's is a month old | An application each | [#10](https://github.com/richardthedesigner/causeway/issues/10) |
| Ask Nexus for Tyne and Wear Metro lift status | Without it, Metro stations reached by lift are always "unknown" for step-free users | An email | [#13](https://github.com/richardthedesigner/causeway/issues/13) |
| Say what to do with the stray screenshots at the repo root (`step2-*.png`, from another session) | Clutter; move to `docs/ux/` or delete | A word | |

## Blocked outside the project

| What | Blocker | Link |
|---|---|---|
| Live bus and tram departures for Edinburgh and Newcastle | Lothian's API refuses (403), Transport for Edinburgh's open data is down (522), Nexus needs a key (401). Timetable frequencies are used meanwhile | [#8](https://github.com/richardthedesigner/causeway/issues/8) |

## Guesses to check with users (Phase 2 research)

These numbers shape routes but are our estimates, not evidence.

| What | Where |
|---|---|
| Bus, tram and Metro costs: waits, wheelchair space taken, seats at stops | [#12](https://github.com/richardthedesigner/causeway/issues/12) |
| How much detour a crossing with no lights, a silent signal or no tactile paving is worth | [D-037](DECISIONS.md#d-037-crossings-for-people-who-cross-by-sound-and-touch) |
| How much detour an unlit street is worth after dark | [D-038](DECISIONS.md#d-038-lit-streets-after-dark) |
| Battery use: each metre climbed counted as 30 m of flat, and the demo Cherry's 12 km range | [D-043](DECISIONS.md#d-043-battery-range-is-a-warning-set-by-the-user) |
| Screen reader and switch-access testing: axe only catches about a third of WCAG issues | [BUILD_LOG](BUILD_LOG.md) |

## Known gaps

- Opening hours don't know bank holidays; the app says "may differ on bank holidays" ([D-039](DECISIONS.md#d-039-open-when-you-get-there)).
- Weather beyond 48 hours ahead falls back to today's ([D-040](DECISIONS.md#d-040-leaving-later)).

## Deferred by Richard

Not now, on purpose: a phone app, whole cities, a reports backend, app accounts.

## Done

Nothing settled yet. Move items here with the date.
