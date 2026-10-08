# Community reports

Roadmap: FEAT-25 (takes in DEF-04 and DEF-06). Decision: [D-083](../DECISIONS.md#d-083-community-reports-categories-votes-and-confidence-that-decays). Brief: Richard, 2026-10-08.

People tag good or bad access on the map: a missing dropped kerb, steps, a broken lift, a narrow pavement, a good ramp, an accessible toilet. Others agree, disagree, or say whether it's still there. That gives a confidence that fades with time, and routes trust a report only once enough people have confirmed it recently.

## What was there already

- **Notes** (D-026, D-030): free-text experience of a place or a stretch, good, mixed or bad. Shared through Supabase with anonymous sign-in, flagged down by two people, photos checked by a person first. Notes are soft routing signals only.
- **Problem reports** (Phase 4, D-076): kind, place, note and photo, kept on the phone. With sharing on they go to `/review` for triage, never on the map.
- **Nothing public, categorical or votable.** DEF-04 (reports backend) and DEF-06 (several people confirming) were deferred. Richard's brief turns both on.
- The backend is Supabase (D-030), with no project made yet. The app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time; without them it keeps everything on the phone. That is the feature flag here too.

## Data model

Code: `packages/graph/src/community.ts` (shared by the app and the router), `db/migrations/0009_community_reports.sql`.

**Report** (`community_report`): id (made on the phone, so a report can wait offline), city, category, point, optional review (200 characters), optional photo, when it was seen, status (visible, hidden, removed), photo status. The author's id is stored and never shown.

**Category**: 13 to start, each with good or bad, a label, a "still there?" question, a half-life and what it attaches to.

| Category | Good or bad | Half-life | Attaches to |
|---|---|---|---|
| No dropped kerb | bad | 1 year | crossing |
| Steps | bad | 2 years | steps or ramp |
| Broken lift | bad | 5 days | lift or escalator |
| Narrow pavement | bad | 1 year | pavement |
| Pavement blocked | bad | 7 days | pavement |
| Rough or broken surface | bad | 6 months | pavement |
| Steep slope | bad | 5 years | pavement |
| Dropped kerb | good | 2 years | crossing |
| Good ramp | good | 2 years | steps or ramp |
| Big lift | good | 90 days | lift or escalator |
| Wide, smooth pavement | good | 1 year | pavement |
| Accessible toilet | good | 1 year | a place |
| Somewhere to sit | good | 1 year | a place |

**Geometry**: a point. It joins the graph at request time, never written into it (D-008): the nearest edge of the right kind within 15 m (a kerb report lands on the crossing, not the pavement beside it; both kerbs of one crossing count), otherwise the nearest pavement. Rides and boarding edges never. Places aren't on an edge.

**Photos**: one per report, shrunk to 640 px on the phone and re-encoded, which drops EXIF (location, camera, time). Uploaded to the same private bucket as note photos, in the person's own folder. Nobody else sees it until a reviewer checks it for faces and number plates and copies it to the public bucket.

**Votes** (`community_vote`): agree, disagree, still there, gone. One per person per report; a new answer replaces the old. Never on your own report.

**Confidence**:

- Every voice saying it's there (the reporter, each agree, each still-there) adds weight 1 when new, halving every half-life of the category. Disagree and gone add weight against, decaying the same way.
- confidence = support / (support + against + 1).
- One fresh report: 0.5. Two people: 0.67. Three: 0.75.
- Levels:
  - **confirmed**: confidence at least 0.7. Three fresh voices clear it; two don't.
  - **reported**: anything else with live support.
  - **disputed**: weight against at least three quarters of the weight for.
  - **faded**: live support under 0.3, about two half-lives with nobody saying it's still there.
- A broken lift with three voices fades in about three weeks unless someone says it's still there. Steps stay confirmed for years.
- These are placeholders until research and real use calibrate them (D-013). They are in one file with tests.

## How confidence feeds routing

Code: `packages/router/src/community.ts`. The worker joins reports to edges for each plan, as it does notes.

| Level | What happens |
|---|---|
| Confirmed, bad, and it stops this person | The edge is closed for them, with the reason "no dropped kerb, confirmed by people (3 people, last seen today)". The route goes round it and says so |
| Confirmed, bad, doesn't stop them | A penalty in seconds, by category and profile |
| Reported (one or two people, or older) | A quarter of that penalty, and a line under "On this route": "not confirmed yet". One person can never close a street |
| Disputed or faded | Shown on the map (faded ones hidden), ignored by routes |
| Confirmed, good | Takes up to half off the edge's unknown-risk penalty. Never lowers travel time and never turns an unknown into a known, the same rule as good notes |

Who a category stops: no dropped kerb stops anyone whose kerb limit is under 6 cm; steps stop anyone who can't do steps; a broken lift stops anyone who needs step-free access; a blocked pavement stops wheeled users. Narrow, rough and steep only cost time: we don't know how narrow or how steep, and the graph's own measures stay in charge of limits.

Your own reports count on your own routes at once. With sharing on, everyone's routes see everyone's reports, through the same levels.

## Adding a report

- **Fewest taps**: "Add a report", then what you found, then Save. Three taps.
- **The button**:
  - A big button in the home sheet, in thumb reach: "Add a report: good or bad access".
  - A map button by the layers button.
  - "Report something here" on a dropped pin.
- **Where**: the pin starts at your location as soon as the phone gives it, or the map's middle until then. "Move the pin" lets you drag it, tap the map, or move it with the arrow keys (2 m a press, 10 m with Shift), then Done. A dropped pin starts the report there.
- **What**: two groups of large buttons with icons and words, "A problem" and "Good for access".
- **Duplicates**: if someone else reported the same category within 20 m, the sheet offers "See it and agree" first.
- **Optional extras**: a short review and a photo, behind one disclosure.
- **Screen readers**: every control is a real button with its name. Report pins on the map are buttons named "Broken lift, a problem, not confirmed yet. Community report". The pin you're placing is a named button that takes the arrow keys.

## Checking someone else's

Tap a pin and a sheet opens. It shows:

- How sure we are: the level in words, how many people say it's there and how many say it isn't, when it was last seen, a bar and a percentage.
- What it means for routes, in one sentence.
- The review and the photo, if any.
- "Is this right?" with Agree and Disagree, and the category's own question ("Is the lift still broken?") with "Yes, still there" and "No, it's gone". Each is a large button that shows when it's chosen, and you can change your answer.
- "Report this report": made up, unkind, about a person or a face or number plate, or something else.
- On your own report: "Delete my report".

## Map controls

The map layers menu gains a Community reports section:

- One switch for all reports.
- Problems on or off, and good things on or off.
- "Choose categories" with a switch per category.

The choice is kept on the phone. Problems are a red triangle with "!", good things a green circle with a tick, so the shape carries the meaning without colour. Unconfirmed ones are lighter with a dashed ring. Faded reports aren't drawn. Pins are hidden while navigating.

## Moderation and abuse

The database enforces all of it, not the app (`0009`, tested by `db/test/community.test.sql`):

- **Rate limits per person**: 20 reports and 200 votes a day.
- **Rate limits per device and network**:
  - The anonymous id lives on the device, so the per-person limits are per device.
  - Making new ids is free, so there is a second limit per network address: 60 reports and 600 votes a day.
  - It is counted by a salted hash of the address that changes every day. The hash is never readable, not even by the person it belongs to.
  - The address comes from the headers PostgREST passes on (`cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`).
- **One vote each**, never on your own report.
- **Report button**: two people reporting a report hide it until a reviewer looks. A reviewer putting it back resets the count.
- **Photos**: pre-moderated (above). The review page needs a Community tab (FEAT-26).
- **Server fields**: who, when it arrived, status and photo status are set by the database whatever the app sends. The column grants refuse them outright.
- **Inside the city**: a report outside its city's bounds is refused.
- **CAPTCHA**: Cloudflare Turnstile on anonymous sign-up (SEC-09) is still owed before any publicity. It matters more now that one id can vote.

## Privacy and GDPR

- **No profile, ever** (D-009). A report carries a category, a place, a time and, if you choose, words and a photo. The router gets the reports; the server never gets the profile. `pnpm e2e` watches every request for it.
- **No precise home locations**:
  - Others see a report's point rounded to 4 decimal places, about 11 m by 7 m.
  - They never see who made it, so one person's reports can't be strung together into where they live. No author key, unlike notes.
  - Vote times are shown only to the hour.
  - The pin starts at your location because that's where the kerb usually is; the sheet says others see the place to about 10 m.
  - EXIF is stripped from photos on the phone.
- **Special category data**: none is collected. Unlike notes, reports have no mobility label.
- **Lawful basis**: legitimate interests (making routes safer for disabled people) for the report itself. Consent is explicit and per report for the optional words and photo.
- **Your data**: "Your data" counts community reports and answers, includes them in the copy, and "Delete everything" removes your reports, votes and flags from the server too.
- **Retention**:
  - Reports are kept while visible. Faded ones stop affecting anything but stay until a clean-up job removes reports faded for a year (FEAT-29).
  - Removed reports and their photos should be purged by the same job.
- **Owed by people**:
  - The DPIA (SEC-10) should now cover community reports.
  - The privacy page needs a paragraph on them (FEAT-28).

## Identity: working now, accounts later

Accounts are being designed in a separate session ("Causeway: user accounts architecture"). This feature doesn't build accounts. It is shaped so they slot in.

- **Now**: Supabase anonymous sign-in (D-030), on the first save or vote. The anonymous user id is the contributor id. It is stored on the phone, and is what the per-person limits, own-report checks and deletes key on.
- **Later**: Supabase links an email, passkey or OAuth identity to the existing anonymous user (`updateUser` / `linkIdentity`). `auth.uid()` stays the same, so every report, vote and flag carries over with no migration and no rewrite.
- **Integration points for the accounts work**:
  1. `apps/web/src/lib/sync.ts` `session()`: the one place a session is made or refreshed. Upgrading the anonymous user in place keeps the id.
  2. Two phones, one account: if accounts let someone sign in on a second phone that already has its own anonymous id, that phone's contributions need a "merge" step. It should be a server function that re-parents `community_report.author_id`, `community_vote.voter_id` and `community_flag.flagger_id` from the old id to the new one. Resolve one-vote-per-report conflicts by keeping the newer vote, then delete the old auth user. Nothing else changes.
  3. Rate limits key on `auth.uid()`, so an account inherits them. Accounts may earn higher limits or more weight later (a trusted reviewer's "confirmed"). That would be a column on a profile table read by the triggers, not a change to the report tables.
  4. The public view never exposes ids, so accounts don't change what others see. A public display name, if ever wanted, would be opt-in and a separate decision.
  5. `deleteEverythingShared()` deletes by `auth.uid()`; for an account it should also delete the auth user.

## OpenStreetMap later (plan only)

D-008 says crowd checks should flow back to OSM. Not built; the order would be:

1. **Only well-confirmed, structural facts**: no dropped kerb, dropped kerb, steps, a ramp. Confirmed by at least 5 people over at least 30 days, never disputed. Never temporary ones (broken lift, blocked pavement) and never places.
2. **Compare with OSM first**:
   - Only where OSM disagrees or says nothing, for example a crossing node with no `kerb=*` tag, or `kerb=lowered` where people confirm no dropped kerb.
   - Where OSM already agrees, nothing to send.
3. **OSM Notes, not edits**: post an OSM Note at the point, in plain words with the evidence, using the public Notes API. For example: "Causewayside users report this crossing has no dropped kerb (6 people, last seen 2 October)". A local mapper decides. Automated edits need the Automated Edits code of conduct, a discussion and an account. Notes don't, and they keep a person in the loop.
4. **Licence**:
   - Reports are our content (not ODbL).
   - Sending a fact to OSM needs contributors to have agreed that we may share it under ODbL terms. The terms of use need a sentence on that before the first note (FEAT-30).
   - Photos are never sent.
5. **Close the loop**:
   - When the weekly data refresh picks up a matching OSM tag, mark the report "now in OpenStreetMap".
   - Let it fade, since the graph now carries the fact.
6. **Tooling**: a weekly job (GitHub Actions, like the data refresh) that lists candidates as a pull request for a person to approve, then posts the notes. MapRoulette is an alternative for a larger batch.

## What's built in this pull request

- The model, confidence and decay, snapping and routing rules, with unit tests: `packages/graph/test/community.test.ts`, `packages/router/test/community.test.ts`. The routing test uses Edinburgh's graph: a wheelchair route goes round a confirmed missing dropped kerb, not round a single report.
- Migration 0009 with 21 database checks.
- The app:
  - The add sheet, the pin you can move and the detail sheet.
  - Votes and reporting a report.
  - Map pins and filters.
  - "On this route" lines.
  - Your data counts.
- End-to-end, against a stand-in backend: add in three taps at your location, move the pin by keyboard, filter, and agree. The a11y check covers the new sheets and menu at 390 px in light and dark, and 320 px at 200% text.
- Everything works on the phone with sharing off. Sharing switches on with the two Supabase variables, as D-030 set up. Steps for Richard: [handoff](../handoff/COWORK_COMMUNITY_REPORTS.md).

## Not done (roadmap rows)

- **FEAT-26**: a Community tab in `/review` (hidden reports, photos to approve).
- **FEAT-27**: confirmed accessible toilets and seats used by routes (rest and toilet limits).
- **FEAT-28**: the privacy page paragraph.
- **FEAT-29**: a clean-up job for faded and removed reports and their photos.
- **FEAT-30**: OSM Notes from confirmed reports (this plan's last section).
- **FEAT-31**: check the categories, the three-tap flow and the thresholds with testers.
