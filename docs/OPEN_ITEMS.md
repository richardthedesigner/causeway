# Open items

What's outstanding on Causewayside: things waiting on Richard, things blocked outside the project, and guesses to check with users. Keep this up to date: add an item when it comes up, and move it to "Done" with the date when it's settled. Details live in the linked issue or decision. The order of work is in [ROADMAP.md](ROADMAP.md).

Last updated: 2026-10-08.

## Waiting on Richard

| What | Why it matters | Effort | Link |
|---|---|---|---|
| Make the Causeway Supabase project, run migrations 0001 to 0009, turn on anonymous sign-ins and Turnstile, and set the two Vercel variables (FEAT-35) | Community reports, notes and votes stay on each phone until then. Your Supabase organisation already has two free projects (one is the live Expanvas database, never to be paused), so a third needs gtm-kpi-hub paused or a paid plan | About 30 minutes, with Cowork | [handoff](handoff/COWORK_COMMUNITY_REPORTS.md) |
| Name who checks flagged community reports and photos each week (SEC-11) | Photos stay hidden and flagged reports stay down until someone looks | A decision | [BACKEND.md](BACKEND.md) |
| Answer the user accounts plan's open questions, starting with go or wait (FEAT-26) | Accounts are planned but deferred (DEF-07). Nothing can start until the go-ahead, the choice on encrypted sync, minimum age and carer consent | A read and ten answers | [plans/USER_ACCOUNTS.md](plans/USER_ACCOUNTS.md#open-questions-for-richard), [D-083](DECISIONS.md#d-083-user-accounts-supabase-auth-upgraded-in-place-optional-forever) |
| Time the app on a real mid-range Android phone, or run it through WebPageTest (SPEED-12) | The container's numbers have an unslowed worker and a software GPU, so they are best cases | 15 minutes | [perf notes](perf/2026-10.md) |
| Run the data refresh once by hand: Actions, then data-refresh, then Run workflow on `main` | Proves the weekly refresh works. It has never run, and this project's sessions can't start workflows | 1 minute | [#14](https://github.com/richardthedesigner/causeway/issues/14) |
| Sign up for free API keys: National Rail, Met Office, Mapillary, BODS, Nexus | Each unlocks a data adapter (live trains, better weather, street photos, live buses) | About 30 minutes | [#9](https://github.com/richardthedesigner/causeway/issues/9) |
| Decide whether to show OpenStreetMap access tags for named venues at public launch | Saying a named business is or isn't accessible carries reputational and legal risk | A decision | [#11](https://github.com/richardthedesigner/causeway/issues/11) |
| Apply for the live Street Manager feed | England's works data is a month old. (Scotland's roadworks register turned out to be open data, daily, no application needed: [DATA_SURVEY_UK](DATA_SURVEY_UK.md)) | An application | [#10](https://github.com/richardthedesigner/causeway/issues/10) |
| Send the licence emails in the data survey: Edinburgh council (kerbs, crossings, widths, setts), Glasgow (kerbs, steps), Islington and Southwark, Westminster, Canal & River Trust, Sustrans | Unlocks kerb, width and step data that OSM lacks; the data is public but has no stated licence | About ten short emails | [DATA_SURVEY_UK §7](DATA_SURVEY_UK.md#7-who-to-ask-for-richard) |
| Apply for an NHS Service Search v3 key and an Edinburgh Festivals type C key; register for Spatial Hub | Each has a long approval lead time | Three applications | [DATA_SURVEY_UK §7](DATA_SURVEY_UK.md#7-who-to-ask-for-richard) |
| Ask Nexus for Tyne and Wear Metro lift status | Without it, Metro stations reached by lift are always "unknown" for step-free users | An email | [#13](https://github.com/richardthedesigner/causeway/issues/13) |
| Decide whether chain-store websites scraped by AllThePlaces count as scraping under our rule | 348 places in search come only from AllThePlaces: mostly chain stores, parcel lockers and scout halls. Its Changing Places and NHS records are already out | A decision | ROADMAP DATA-27, [D-028](DECISIONS.md#d-028-overture-fills-search-gaps-osm-stays-the-source-of-access-facts) |
| Turn on private vulnerability reporting: Settings, then Code security | `SECURITY.md` sends people there; until it's on they have nowhere private to report | 1 minute | [ROADMAP](ROADMAP.md) SEC-14 |
| Score the security headers: open [securityheaders.com](https://securityheaders.com/?q=https%3A%2F%2Fcauseway.richardthedesigner.com%2F&followRedirects=on) and note the grade | The scorer refuses cloud sessions, so it needs a browser. The custom domain (DEP-07) unblocked it | 1 minute | [ROADMAP](ROADMAP.md) SEC-25 |

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
| In ice, how much an ungritted pavement costs: 100% more time on wheels, 50% on foot | [D-047](DECISIONS.md#d-047-ice-gritting-and-floods) |
| Rest distances from Inclusive Mobility (50 m with a stick or crutches, 100 m with fatigue): right for real people, given how few benches are mapped? | [D-013](DECISIONS.md#d-013-unknown-risk-weights-and-preset-thresholds-are-placeholders) |
| A manual wheelchair held to 6 mm kerbs, with every unmeasured dropped kerb taken as 6 mm: right for real chairs and real kerbs? | [D-054](DECISIONS.md#d-054-presets-on-inclusive-mobility-values-kerbs-credit-and-more-benches) |
| Road scooters: 8 mph on every road without a mapped pavement, and whether riders want those road routes at all (RES-10) | [D-051](DECISIONS.md#d-051-road-scooters-go-at-road-speed-on-roads) |
| "On this route": the council's setts or narrow pavement listed as Slower from a fifth more time on a stretch; three mappers' notes before counting the rest | [D-067](DECISIONS.md#d-067-more-data-same-calm) |
| Weather and health nudges: gusts from 50 km/h double an exposed bridge for scooters and light chairs; in an amber or red alert, a quarter more of the rest cost and 5% more in the sun; the Water of Leith worth a line from 1.05 m at Murrayfield | [D-066](DECISIONS.md#d-066-heat-and-cold-alerts-gusts-air-quality-and-the-water-of-leith) |
| Boarding with the staff ramp: 3 minutes to find staff and get the ramp | [D-068](DECISIONS.md#d-068-boarding-the-train-against-each-persons-limits) |
| Screen reader and switch-access testing: axe only catches about a third of WCAG issues | [BUILD_LOG](BUILD_LOG.md) |

## Known gaps

- There is no Causeway Supabase project yet. When one is made, run db/migrations 0001 to 0009 in order. SEC-16 is merged, so this is now safe. 0008 (SEC-17) makes the server set note and report fields the client used to choose; 0009 adds community reports (D-084).
- Community report confidence (confirmed at three fresh voices, half-lives from 5 days to 5 years) and the routing penalties are our guesses. Check with testers and real use (FEAT-41, D-084).
- The per-network limit for community reports reads the address from the headers Supabase passes on. Check on the real project that `request.headers` carries `x-forwarded-for` or `cf-connecting-ip`; if not, only the per-person limits apply ([D-084](DECISIONS.md#d-084-community-reports-categories-votes-and-confidence-that-decays)).
- The profile has a gap limit for boarding trains (`maxGapMm`), but no setting in the app: everyone gets TfL's 85 mm level band. Add a setting once research says people want one ([D-068](DECISIONS.md#d-068-boarding-the-train-against-each-persons-limits)).
- TfL's level-access doors are in the spoken route only, not on the visual route card ([D-068](DECISIONS.md#d-068-boarding-the-train-against-each-persons-limits)).
- When someone deletes everything, a photo a reviewer had approved stays in the public bucket (hidden, as its note is gone) until a reviewer removes it. Worth a weekly clean-up step for the reviewer, or a server job, once sharing is on ([D-059](DECISIONS.md#d-059-your-data-a-copy-and-delete-everything)).
- Weather beyond 48 hours ahead falls back to today's ([D-040](DECISIONS.md#d-040-leaving-later)).
- The speed budget's timing checks hold 10% off CI. On a busy machine they can fail when nothing changed; run the test again before looking for a cause. A data refresh that rebuilds a graph can trip the settled-node check: re-baseline on purpose ([D-056](DECISIONS.md#d-056-a-speed-budget-the-tests-enforce), ROADMAP SPEED-07).
- The Scottish Road Works Register is daily, but the data refresh is weekly, so new Edinburgh works can be up to a week late ([D-057](DECISIONS.md#d-057-edinburghs-works-from-the-scottish-road-works-register)).
- Street Manager's June 2026 activity archive is published truncated, so the build skips it; activities created or last changed only in June are missing until a later event brings them back ([D-027](DECISIONS.md#d-027-live-and-third-party-data-come-in-through-adapters)).
- Whether a register entry closes the pavement is read from its free text. Check a sample of Edinburgh road closures on the ground or with testers (D-057).
- Edinburgh's pavement gritting routes were last published in 2021. The route says so; check with the council whether they still hold before winter ([D-064](DECISIONS.md#d-064-gritting-routes-from-the-councils-licensed-layer-matched-by-direction-dated-2021)).
- UKHSA can issue a heat or cold alert outside its core season (heat June to September, cold November to March). We don't count one then, so an early or late alert is missed. Check how often it happens before relying on the season ([D-066](DECISIONS.md#d-066-heat-and-cold-alerts-gusts-air-quality-and-the-water-of-leith)).
- Toilet Map records over 2 years old still count on routes as stops; they only say they may be out of date. Whether they should count less is for research ([D-065](DECISIONS.md#d-065-when-osm-and-the-toilet-map-disagree-and-when-a-record-is-old)).

## Deferred by Richard

Not now, on purpose: a phone app, whole cities, app accounts. The reports backend came back on 2026-10-08 with community reports (FEAT-35). Accounts are now planned ([plans/USER_ACCOUNTS.md](plans/USER_ACCOUNTS.md), D-083) but stay deferred until Richard says go.

## Done

- 2026-10-08: the community reports plan landed (FEAT-35, D-084) and meets the accounts plan's contract (D-083): the Supabase anonymous user id is the contributor id, it is never shown, votes are one per contributor per report (primary key), and every vote and report carries a weight the scoring multiplies by. The weight is 1 until `contributor_weight()` exists; then the public view returns it and the thresholds are recalibrated ([plan](plans/COMMUNITY_REPORTS.md#identity-working-now-accounts-later)).
- 2026-10-08: Richard asked for community content: public reports by category with votes and decaying confidence (FEAT-35, [D-084](DECISIONS.md#d-084-community-reports-categories-votes-and-confidence-that-decays)). That takes the reports backend (DEF-04) and crowd verification (DEF-06) off the deferred list.
- 2026-10-08: DEP-01. Richard set Vercel's production branch to `main`; GitHub's default branch is `main`. Still open for Richard: lift the no-deletion rule on `claude/sleepy-johnson-mavbrs` so the old branch can be deleted, and point the production-branch protection at `main` only.
- 2026-10-05: Richard chose the next cities: Glasgow, then Leeds, then by built-up area population without asking again ([D-072](DECISIONS.md#d-072-which-city-next), ROADMAP DEF-09, DEF-10).
- 2026-10-05: branch protection is on. `main` takes no deletion or force push, needs a PR, and requires `check` and `migrations`. The production branch takes no deletion or force push; it can't require PRs until DEP-01, because the mirror pushes to it (ROADMAP SEC-23).
- 2026-10-05: the MapLibre worker guess is settled. Vercel serves `/maplibre/6.12.0/maplibre-gl-worker.mjs` as JavaScript and the map draws on production ([D-050](DECISIONS.md#d-050-dependency-audit-in-ci-and-maplibre-6)).
- 2026-10-05: the migrations can run on Supabase (BACKEND.md step 3). `0007_supabase_grants.sql` takes back Supabase's default grants, so nobody signed out can delete notes or write the graph tables. Run all seven in one go (SEC-16, [D-070](DECISIONS.md#d-070-every-grant-by-name-row-level-security-on-every-table)).
- 2026-10-05: TfL's informational station messages (a reduced escalator service) are shown, under Worth knowing in "On this route" on routes through the station ([D-067](DECISIONS.md#d-067-more-data-same-calm)).
- 2026-10-05: the weather and health lines (alerts, gusts, air, the Water of Leith) moved from "Why this way?" into "On this route", with their source and time ([D-067](DECISIONS.md#d-067-more-data-same-calm)).
- 2026-10-05: Open-Meteo's times were read as the phone's local time, an hour out in British Summer Time. Now read as UTC everywhere, with a test ([D-066](DECISIONS.md#d-066-heat-and-cold-alerts-gusts-air-quality-and-the-water-of-leith)).
- 2026-10-05: an ended UKHSA alert no longer counts: past its end date or outside its season, it's ignored (the overnight build's follow-up #4, [D-066](DECISIONS.md#d-066-heat-and-cold-alerts-gusts-air-quality-and-the-water-of-leith)).
- 2026-10-05: Edinburgh council's pavement surface wins over OSM on streets drawn as one line, where OSM only has the carriageway's surface. Richard's call (ROADMAP DATA-22, [D-063](DECISIONS.md#d-063-on-a-street-drawn-as-one-line-the-councils-pavement-surface-beats-the-carriageways)).
- 2026-10-05: Edinburgh's roadworks from the Scottish Road Works Register: the site answers from the cloud container now, and `pnpm build:srwr` builds them (ROADMAP DATA-02, [D-057](DECISIONS.md#d-057-edinburghs-works-from-the-scottish-road-works-register)).
- 2026-10-05: North Bridge is passable on foot (Richard). The register records it as a road closure since 2018; D-057 keeps it open to people on foot, as works on the pavement.
- 2026-10-05: the rollator keeps 300 m between rests, not Inclusive Mobility's 50 m for stick users: it has a seat. Richard's call ([D-054](DECISIONS.md#d-054-presets-on-inclusive-mobility-values-kerbs-credit-and-more-benches), ROADMAP DATA-28).
- 2026-10-05: presets follow Inclusive Mobility's kerbs, as Richard decided: manual wheelchair 6 mm ([D-054](DECISIONS.md#d-054-presets-on-inclusive-mobility-values-kerbs-credit-and-more-benches)).
- 2026-10-05: opening hours now know bank holidays (SMALL-01, [D-039](DECISIONS.md#d-039-open-when-you-get-there)).
- 2026-10-04: the scraped Changing Places toilets and NHS records are out of the search indexes and filtered from future builds (ROADMAP DATA-01, PR #33).
- 2026-10-04: the stray `step2-*.png` screenshots moved to `docs/ux/devices/` (ROADMAP BLOAT-01).
