# Open items

What's outstanding on Causewayside: things waiting on Richard, things blocked outside the project, and guesses to check with users. Keep this up to date: add an item when it comes up, and move it to "Done" with the date when it's settled. Details live in the linked issue or decision. The order of work is in [ROADMAP.md](ROADMAP.md).

Last updated: 2026-10-05.

## Waiting on Richard

| What | Why it matters | Effort | Link |
|---|---|---|---|
| Run the data refresh once by hand: Actions, then data-refresh, then Run workflow on `main` | Proves the weekly refresh works. It has never run, and this project's sessions can't start workflows | 1 minute | [#14](https://github.com/richardthedesigner/causeway/issues/14) |
| Sign up for free API keys: National Rail, Met Office, Mapillary, BODS, Nexus | Each unlocks a data adapter (live trains, better weather, street photos, live buses) | About 30 minutes | [#9](https://github.com/richardthedesigner/causeway/issues/9) |
| Decide whether to show OpenStreetMap access tags for named venues at public launch | Saying a named business is or isn't accessible carries reputational and legal risk | A decision | [#11](https://github.com/richardthedesigner/causeway/issues/11) |
| Apply for the live Street Manager feed | England's works data is a month old. (Scotland's roadworks register turned out to be open data, daily, no application needed: [DATA_SURVEY_UK](DATA_SURVEY_UK.md)) | An application | [#10](https://github.com/richardthedesigner/causeway/issues/10) |
| Send the licence emails in the data survey: Edinburgh council (kerbs, crossings, widths, setts), Glasgow (kerbs, steps), Islington and Southwark, Westminster, Canal & River Trust, Sustrans | Unlocks kerb, width and step data that OSM lacks; the data is public but has no stated licence | About ten short emails | [DATA_SURVEY_UK §7](DATA_SURVEY_UK.md#7-who-to-ask-for-richard) |
| Apply for an NHS Service Search v3 key and an Edinburgh Festivals type C key; register for Spatial Hub | Each has a long approval lead time | Three applications | [DATA_SURVEY_UK §7](DATA_SURVEY_UK.md#7-who-to-ask-for-richard) |
| Ask Nexus for Tyne and Wear Metro lift status | Without it, Metro stations reached by lift are always "unknown" for step-free users | An email | [#13](https://github.com/richardthedesigner/causeway/issues/13) |
| Decide whether chain-store websites scraped by AllThePlaces count as scraping under our rule | 348 places in search come only from AllThePlaces: mostly chain stores, parcel lockers and scout halls. Its Changing Places and NHS records are already out | A decision | ROADMAP DATA-27, [D-028](DECISIONS.md#d-028-overture-fills-search-gaps-osm-stays-the-source-of-access-facts) |
| Decide whether Edinburgh council's pavement surface should win over OSM on streets drawn as one line | They disagree on 2,822 edges; OSM wins today, and on those streets OSM's tag may describe the road, not the pavement | A decision | [D-046](DECISIONS.md#d-046-council-footway-data-as-a-separate-layer), ROADMAP DATA-22 |
| Turn on private vulnerability reporting: Settings, then Code security | `SECURITY.md` sends people there; until it's on they have nowhere private to report | 1 minute | [ROADMAP](ROADMAP.md) SEC-14 |

## Blocked outside the project

| What | Blocker | Link |
|---|---|---|
| Edinburgh roadworks from the Scottish Road Works Register | `downloads.srwr.scot` resets every secure connection from the cloud build container. It's open (OGL); it needs building from somewhere the site answers | ROADMAP DATA-02, [#10](https://github.com/richardthedesigner/causeway/issues/10) |
| Live bus and tram departures for Edinburgh and Newcastle | Lothian's API refuses (403), Transport for Edinburgh's open data is down (522), Nexus needs a key (401). Timetable frequencies are used meanwhile | [#8](https://github.com/richardthedesigner/causeway/issues/8) |

## Guesses to check with users (Phase 2 research)

These numbers shape routes but are our estimates, not evidence.

| What | Where |
|---|---|
| Bus, tram and Metro costs: waits, wheelchair space taken, seats at stops | [#12](https://github.com/richardthedesigner/causeway/issues/12) |
| How much detour a crossing with no lights, a silent signal or no tactile paving is worth | [D-037](DECISIONS.md#d-037-crossings-for-people-who-cross-by-sound-and-touch) |
| How much detour an unlit street is worth after dark | [D-038](DECISIONS.md#d-038-lit-streets-after-dark) |
| Battery use: each metre climbed counted as 30 m of flat, and the demo Cherry's 12 km range | [D-043](DECISIONS.md#d-043-battery-range-is-a-warning-set-by-the-user) |
| In ice, how much an ungritted pavement costs: 100% more time on wheels, 50% on foot | [D-047](DECISIONS.md#d-047-ice-gritting-and-floods) |
| Rest distances from Inclusive Mobility (50 m with a stick or crutches, 100 m with fatigue): right for real people, given how few benches are mapped? | [D-013](DECISIONS.md#d-013-unknown-risk-weights-and-preset-thresholds-are-placeholders) |
| Screen reader and switch-access testing: axe only catches about a third of WCAG issues | [BUILD_LOG](BUILD_LOG.md) |

## Known gaps

- When someone deletes everything, a photo a reviewer had approved stays in the public bucket (hidden, as its note is gone) until a reviewer removes it. Worth a weekly clean-up step for the reviewer, or a server job, once sharing is on ([D-052](DECISIONS.md#d-052-your-data-a-copy-and-delete-everything)).
- Weather beyond 48 hours ahead falls back to today's ([D-040](DECISIONS.md#d-040-leaving-later)).
- A guess to check on the next production deploy: Vercel serves MapLibre's worker (`/maplibre/6.12.0/maplibre-gl-worker.mjs`) as JavaScript, so the map draws. The local checks confirm it with our own server ([D-050](DECISIONS.md#d-050-dependency-audit-in-ci-and-maplibre-6)).

## Deferred by Richard

Not now, on purpose: a phone app, whole cities, a reports backend, app accounts.

## Done

- 2026-10-05: opening hours now know bank holidays (SMALL-01, [D-039](DECISIONS.md#d-039-open-when-you-get-there)).
- 2026-10-04: the scraped Changing Places toilets and NHS records are out of the search indexes and filtered from future builds (ROADMAP DATA-01, PR #33).
- 2026-10-04: the stray `step2-*.png` screenshots moved to `docs/ux/devices/` (ROADMAP BLOAT-01).
