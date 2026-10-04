# Backend: sharing notes and sending reports

Decision: [D-030](DECISIONS.md). Without the two environment variables below, the app keeps notes and reports on the device and never talks to a server.

## Set up (once)

1. **Supabase project** in the London region (`eu-west-2`).
2. **Extensions:** turn on `postgis` (Database > Extensions).
3. **Migrations,** in order: `db/migrations/0001_graph.sql` to `0005_review.sql`.
4. **Auth:** turn on *Anonymous sign-ins* (Authentication > Sign In / Providers). Turn on *CAPTCHA protection* with Cloudflare Turnstile before any publicity, so sign-ups can't be scripted.
5. **Vercel:** set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase: Project settings > API) on the `causeway` project, then redeploy. The anon key is meant to be public; the database rules do the protecting.

## What the rules allow

| Who | Can |
|---|---|
| Anyone | Read visible notes through `note_public` (never author ids; photos only once approved) |
| Signed in (anonymous) | Add notes as themselves (30 a day), delete their own, flag others', send reports |
| Service role only | Read reports, see hidden notes, approve photos |

Check the rules locally (Postgres 16 + PostGIS): `PGHOST=/var/run/postgresql scripts/test-db.sh`. CI runs the same.

## Reviewers

Reviewers sign in to `/review` (not linked from the app) with an email code. They need a real account and a row in `reviewer`; nobody can sign up there.

1. Supabase: Authentication > Users > *Invite user* with their email. Make sure the *Magic Link* email template includes `{{ .Token }}`, so the email carries a code.
2. SQL editor: `insert into reviewer (user_id, name) select id, 'Their name' from auth.users where email = 'them@example.org';`
3. To remove someone: `delete from reviewer where name = 'Their name';`

What a reviewer can do is enforced by the database (`0005_review.sql`): see hidden notes and their flags, put back or take down a note, approve or reject a photo, and move a report to triaged, fixed or not a problem. They can't change what anyone wrote, add reviewers, or edit the log. Every decision goes into `review_log` with who made it; automatic hiding (two flags) is logged with no reviewer. Once a reviewer puts a note back, only flags made after that decision count towards hiding it again.

## Looking after it (weekly)

Open `/review` and work through the three lists: flagged notes, photos, reports. The page never holds the service key.

If the page is ever unavailable, the same in SQL:

- **Flags:** `select * from note where status = 'hidden';` then set `status` back to `'visible'` or to `'removed'`.
- **Photos:** `select id, photo_path from note where photo_status = 'pending';` If a photo shows no faces or number plates, copy it to the `note-photos-approved` bucket at the same path and set `photo_status = 'approved'`; otherwise `'rejected'`.
- **Reports:** `select * from report where status = 'new';` Triage, and pass council matters on.
