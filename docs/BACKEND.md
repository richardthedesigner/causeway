# Backend: sharing notes and sending reports

Decision: [D-030](DECISIONS.md). Without the two environment variables below, the app keeps notes and reports on the device and never talks to a server.

## Set up (once)

1. **Supabase project** in the London region (`eu-west-2`).
2. **Extensions:** turn on `postgis` (Database > Extensions).
3. **Migrations,** in order: `db/migrations/0001_graph.sql` to `0004_storage.sql`.
4. **Auth:** turn on *Anonymous sign-ins* (Authentication > Sign In / Providers). Turn on *CAPTCHA protection* with Cloudflare Turnstile before any publicity, so sign-ups can't be scripted.
5. **Vercel:** set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase: Project settings > API) on the `causeway` project, then redeploy. The anon key is meant to be public; the database rules do the protecting.

## What the rules allow

| Who | Can |
|---|---|
| Anyone | Read visible notes through `note_public` (never author ids; photos only once approved) |
| Signed in (anonymous) | Add notes as themselves (30 a day), delete their own, flag others', send reports |
| Service role only | Read reports, see hidden notes, approve photos |

Check the rules locally (Postgres 16 + PostGIS): `PGHOST=/var/run/postgresql scripts/test-db.sh`. CI runs the same.

## Looking after it (weekly)

- **Flags:** `select * from note where status = 'hidden';` then set `status` back to `'visible'` or to `'removed'`.
- **Photos:** `select id, photo_path from note where photo_status = 'pending';` If a photo shows no faces or number plates, copy it to the `note-photos-approved` bucket at the same path and set `photo_status = 'approved'`; otherwise `'rejected'`.
- **Reports:** `select * from report where status = 'new';` Triage, and pass council matters on.
