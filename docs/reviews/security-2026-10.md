# Security review, October 2026

SEC-07 (row-level security and storage rules against a threat model) and REV-02 (the quarterly security review). Reviewed on 2026-10-05 against `main` at `023b781`, which includes PRs #42 and #44 and so migration `0006_my_data.sql`.

Read-only. Nothing in the app, the migrations, the workflows or the settings was changed. Each finding has a roadmap row.

## Summary

Sharing is not switched on yet (BACKEND.md, SEC-11), so nothing below is exploitable in production today. One critical and one high finding must be fixed **before** the migrations are run on Supabase. Both come from the same gap: the database tests run on a plain Postgres, where the tables start with no grants. Supabase grants everything in `public` to `anon` and `authenticated` by default, and the migrations never take that back.

| ID | Severity | Finding | Row |
|---|---|---|---|
| C1 | Critical | Anyone, signed out, can delete any shared note through `note_public` | SEC-16 |
| H1 | High | The graph tables have no row-level security: anyone can write to them | SEC-16 |
| M1 | Medium | The 30-notes-a-day limit is bypassed by sending an old `created_at`; reports can arrive already "fixed" | SEC-17 |
| M2 | Medium | `author_key` links all of one person's notes across a city | SEC-18 |
| M3 | Medium | The data-refresh workflow leaves a write token on disk while it runs third-party code | SEC-19, SEC-23 |
| M4 | Medium | Unlimited anonymous accounts: two of them hide any note, and the daily limit is per account | SEC-09 (exists) |
| L1 | Low | A note's `photo_path` can point at someone else's photo | SEC-17 |
| L2 | Low | An approved photo's public URL contains the author's anonymous id | SEC-18 |
| L3 | Low | The private photo bucket has no size or file type limit | SEC-20 |
| L4 | Low | CSP `connect-src` allows any `*.supabase.co` project | SEC-21 |
| L5 | Low | BACKEND.md is out of date on migrations and on who can do what | SEC-22 |

## Threat model

### What we protect

1. **The mobility profile** (device, limits, speeds). The most sensitive thing in the app: it is health data under UK GDPR. It stays on the device and is never sent (D-009).
2. **Where someone has been.** Shared notes, reports and photos all carry a location and a time. Several from one person can show where they live or go every day.
3. **Shared notes.** Their integrity (nobody else can change or delete them) and their tone (abuse gets hidden quickly).
4. **Photos.** Pending photos may show faces or number plates; they must stay private until a reviewer looks.
5. **Reviewer powers.** A reviewer can hide notes and publish photos. That must not be reachable by anyone else.
6. **The routing data.** Wrong kerb, step or lift data sends a wheelchair user somewhere they can't get out of. Its integrity is a safety matter.

### Who might attack

- **A curious or hostile visitor** with the public anon key (it ships in the app) and `curl`. The most likely attacker.
- **A spammer or troll** scripting anonymous sign-ups to flood notes or hide other people's.
- **Someone targeting one person**, trying to follow their notes and photos to learn where they go.
- **A compromised dependency** (npm, pip or a GitHub Action) running in CI or the data refresh.
- **A stolen reviewer email inbox**, which gives the sign-in code.

### Trust boundaries

| Boundary | What crosses it | What guards it |
|---|---|---|
| Browser to static app (Vercel) | Nothing but page loads | HTTPS, HSTS, CSP and other headers (`apps/web/vercel.json`) |
| Browser to Supabase REST, Auth and Storage | Notes, flags, reports, photos; the public anon key and a user JWT | Row-level security, grants, triggers, storage policies (`db/migrations`) |
| Browser to third-party APIs | Search text, rough location for weather and air quality | Fixed hosts in `connect-src`. No profile data (SEC-05) |
| `/review` to Supabase | A reviewer's JWT from an email code | `create_user: false`, the `reviewer` table, `is_reviewer()` policies |
| GitHub to Vercel | `main` and the production branch build and deploy | Vercel ignores `claude/*` branches |
| Data-refresh workflow | Downloaded open data, pip and npm packages, a token that can write | Pinned actions, a PR instead of a direct push |

## Findings

### C1. Anyone can delete any shared note through `note_public` (critical, latent)

- **Where:** `db/migrations/0003_sharing.sql:89` (the view) and `:137` (the grant).
- **What:** `note_public` is a plain one-table view, so Postgres lets you insert, update and delete through it. It runs as its owner, so the row-level security on `note` does not apply. On Supabase, new tables and views in `public` are granted to `anon` and `authenticated` in full by default. The migration adds `grant select` but never revokes the rest.
- **Proof:** on a local Postgres with Supabase's default privileges applied before the migrations, signed out as `anon`: `delete from note_public where id = '…'` returned `DELETE 1` and the note was gone. Over the REST API this is one `DELETE /rest/v1/note_public?id=eq.…` with the public key. Updates through the view are stopped by the `review_fields_only` trigger, but deletes are not.
- **Impact:** anyone can wipe every shared note in every city, silently. No log entry.
- **Fix:** `revoke all on note_public from anon, authenticated;` before the `grant select`. Better, also take back Supabase's defaults for this project's objects: `alter default privileges in schema public revoke all on tables from anon, authenticated;` at the top of the first migration that runs on Supabase. Then make CI apply Supabase's default privileges before the migrations (as the probe did), so the tests see what production sees, and add a test that `anon` cannot delete through the view.

### H1. The graph tables have no row-level security (high, latent)

- **Where:** `db/migrations/0001_graph.sql:15` to `:125`: `source`, `area`, `graph_node`, `graph_edge`, `edge_attribute`, `node_attribute`, `live_state`, `partner_venue_access`, and the `edge_attribute_resolved` view.
- **What:** none of these has row-level security or a revoke. With Supabase's defaults, `anon` can insert, update and delete them.
- **Proof:** as `anon`, `insert into area …` and `delete from source where id = 'crowd'` both succeeded. An insert into `live_state` reached a not-null check, so the privilege is there.
- **Impact:** today the app routes from JSON files, not these tables, so the damage would be to the database copy only. The day routing or live state reads from Supabase, anyone could mark a lift as working or remove a step. That is a safety issue for the people the app is for. `area` is also the foreign key for every note.
- **Fix:** `alter table … enable row level security` on every table in `public`, with a `select` policy only where the public needs to read. Revoke `insert, update, delete` from `anon, authenticated` on all of them. Add a CI check that every table in `public` has row-level security on (`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity` must be empty). Supabase's Security Advisor flags the same thing once the project exists.

### M1. Client-set fields bypass the rate limit and triage

- **Where:** `db/migrations/0003_sharing.sql:46` and `:55` (triggers), `:57` (the count), `:136` (insert on `report`).
- **What:** the insert grants cover every column. The daily limit counts notes with `created_at` in the last day, but the client can send `created_at` itself. Reports can be sent with `status = 'fixed'` and any `verified_by`.
- **Proof:** one anonymous user inserted 40 notes in a row with `created_at` two days ago; all 40 were accepted. A report went in as `fixed` with a made-up `verified_by`.
- **Impact:** the only flood control on notes is gone; a report can skip the "new" list the reviewers work through, so it is never looked at.
- **Fix:** in the `before insert` trigger on `note`, set `new.created_at := now()` (and keep `observed_at` within, say, a week before now and not in the future). Add a `before insert` trigger on `report` that sets `status := 'new'` and `verified_by := '{}'`. Or grant insert on named columns only.

### M2. `author_key` links all of one person's notes

- **Where:** `db/migrations/0003_sharing.sql:107`.
- **What:** the pseudonym is a hash of the author id and one secret salt, so it is the same on every note that person ever writes, in every city. Each note also has a point, a time, and an optional mobility label.
- **Impact:** anyone can group one person's notes and see where they go and when, often enough to guess where they live. This cuts against D-009 and the promise in `0002_notes.sql` that the author is "never shown". It is what a stalker or an abusive ex would use.
- **Fix:** the key exists to count different people on the same place or way. Hash the target in as well (`author_id || place_ref or the way ids || salt`), so it only matches within one target. Corroboration still works, and notes on different places can't be linked.

### M3. The data-refresh workflow leaves a write token on disk

- **Where:** `.github/workflows/data-refresh.yml:25` (checkout without `persist-credentials: false`), `:13` (`contents: write`, `pull-requests: write`), `:36` (`pip install` with no versions).
- **What:** the checkout stores the job's `GITHUB_TOKEN` in `.git/config`. The job then installs unpinned pip packages, every npm dependency, and runs scripts over downloaded data for up to 90 minutes. Any of those can read the token and push. `mirror-production.yml` then fast-forwards the production branch to match `main`.
- **Impact:** a compromised package could put code on the production site without a pull request.
- **Fix:** `persist-credentials: false` on the checkout. `peter-evans/create-pull-request` takes its own token and doesn't need the stored one. Pin the pip packages to exact versions (ideally with hashes in a `requirements.txt`). Richard: check that `main` has branch protection that blocks direct pushes from Actions (see OPEN_ITEMS).

### M4. Unlimited anonymous accounts (known)

- **Where:** `0003_sharing.sql` (the two-flag rule and the daily limit are per account), BACKEND.md step 4.
- **What:** anyone can script anonymous sign-ups. Two accounts hide any note. Thirty notes per account per day is no limit at all.
- **Fix:** already planned: Turnstile CAPTCHA on anonymous sign-up (SEC-09, D-030). It must be on before sharing goes live, not only before publicity, as one person can hide every note in a city in a minute. Later, a per-IP limit at Supabase's edge.

### L1. A note can claim someone else's photo

- **Where:** `db/migrations/0003_sharing.sql:46` (no check on `photo_path`), `apps/web/src/lib/review.ts:156`.
- **What:** `photo_path` is free text. A note can point at another person's photo in the private bucket, for example one a reviewer already rejected. If a reviewer approves it, it is published under the attacker's note.
- **Impact:** small: a reviewer still sees the photo before it goes public. But it lets someone re-submit a rejected photo of another person.
- **Fix:** in the insert trigger, refuse any `photo_path` that isn't `auth.uid() || '/' || new.id || '.jpg'`.

### L2. An approved photo's URL contains the author's id

- **Where:** `apps/web/src/lib/sync.ts:80` (the path is `<user id>/<note id>.jpg`), `apps/web/src/lib/review.ts:156` (the public copy keeps that path), `0003_sharing.sql:103` (the view shows it).
- **Impact:** the anonymous user id is exposed, which links that person's photo notes (the same harm as M2). It does not let anyone act as them.
- **Fix:** publish to `note-photos-approved/<note id>.jpg` and set the note's public path to that. One line in `approvePhoto`, and the view returns `id || '.jpg'` for approved photos.

### L3. No size or type limit on photo uploads

- **Where:** `db/migrations/0004_storage.sql:14`.
- **What:** the bucket has no `file_size_limit` or `allowed_mime_types`. The app shrinks photos to 640 px, but a script can upload anything, any size, into its own folder, and with `x-upsert` replace it as often as it likes.
- **Impact:** storage cost and quota on the free plan. Not public, so not a hosting risk.
- **Fix:** set `file_size_limit = 1048576` (1 MB is plenty for 640 px) and `allowed_mime_types = '{image/jpeg}'` on `note-photos`, and the same on `note-photos-approved`.

### L4. CSP allows any Supabase project

- **Where:** `apps/web/vercel.json:16` (`connect-src … https://*.supabase.co`, and `img-src`).
- **What:** together with `'unsafe-inline'` in `script-src` (SEC-13), an injected script could send the profile from `localStorage` to an attacker's own Supabase project and the CSP would allow it.
- **Impact:** only matters if there is an XSS. None was found: no `dangerouslySetInnerHTML` except the fixed service worker line, and React escapes note text.
- **Fix:** name the one project host (`https://<ref>.supabase.co`) once it exists. Keep SEC-13.

### L5. BACKEND.md is out of date

- **Where:** `docs/BACKEND.md:9` says run migrations up to `0005_review.sql`; `0006_my_data.sql` is missing. `:19` says only the service role reads reports and approves photos; reviewers do that now, and people can read and delete their own reports.
- **Impact:** whoever sets up Supabase follows this page. Missing `0006` means "Delete everything" fails for reports, flags and photos.
- **Fix:** update the list and the table. Add a step: run Supabase's Security Advisor after the migrations, and fix anything it lists.

## Checked and fine

- **Notes:** row-level security on `note`, `note_flag`, `report`, `reviewer` and `review_log`. Nobody can write as someone else, read someone else's rows from the tables, or delete someone else's note through the table. New photos always start pending; status always starts visible. All 38 checks in `scripts/test-db.sh` pass locally (Postgres 16, PostGIS 3).
- **Reviewers:** `is_reviewer()` is `security definer` with a fixed `search_path`, and only says whether *you* are one. Reviewers can change only `status` and `photo_status`, enforced by a trigger, and every change is logged with who made it. Nobody can edit the log or add reviewers through the API.
- **`security definer` functions:** `note_flag_hide`, `log_review`, `is_reviewer`. All set `search_path = public`; the two trigger functions can't be called directly.
- **The salt** sits in schema `private`, with all access revoked from `anon` and `authenticated`.
- **Storage:** the private bucket allows upload, replace, read and delete in your own folder only. The public bucket can be written only by reviewers. Nobody can list the public bucket.
- **`0006_my_data.sql`:** the new select and delete policies are all limited to your own rows. Deleting your notes takes their flags with them.
- **`/review` sign-in:** `create_user: false`, so nobody can sign up there. The page never holds the service key; the session lives in `sessionStorage` and ends with the tab. Rate limits and session length are SEC-08.
- **Headers:** CSP, HSTS (two years), `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, a tight `Permissions-Policy`. Live check is SEC-12; `'unsafe-inline'` is SEC-13.
- **The profile:** not sent anywhere (SEC-05 holds). Notes carry only an opt-in coarse label. Photos are redrawn through a canvas (`apps/web/src/lib/reports.ts:56`), which drops EXIF, so no GPS or camera data leaves the phone.
- **Workflows:** every action pinned to a commit SHA. No `pull_request_target`, so forks never get secrets or a write token. CI has `contents: read` and `persist-credentials: false`. The data-refresh PR body comes through environment variables, not pasted into the script. No secrets in the repo.
- **Dependencies:** `pnpm audit` finds no known vulnerabilities. CI fails on high ones (SEC-04); Dependabot opens weekly updates for npm and Actions.
- **Vercel:** `claude/*` branches don't build, so a session's branch can't publish a preview of unreviewed code.

## Not checked

- The live Supabase project and Vercel settings: not set up yet, and out of scope for a code review. Run Supabase's Security Advisor once it exists.
- Branch protection on `main` and the production branch. Needs repo admin (OPEN_ITEMS).
- Python scripts' handling of hostile input files. They run only in CI on data from known hosts.

## Next review

REV-02 is due again in January 2027.
