# Handoff: switch on sharing for community reports

For Richard's Cowork assistant. Paste everything under **The prompt** into Cowork. It does as much as it can in Chrome and stops where only Richard can act: a decision, a sign-in or a key.

Why: community reports (FEAT-25, [D-083](../DECISIONS.md#d-083-community-reports-categories-votes-and-confidence-that-decays)) are live on causeway.richardthedesigner.com, but each phone keeps its own until there is a Supabase project. Notes and problem reports (D-030) are waiting on the same thing.

Never put a password, secret key or service-role key into a chat, a document or this repo. The two values Vercel needs are public by design (the anon key is meant to be in the app; the database rules do the protecting).

---

## The prompt

You're helping Richard switch on sharing for his app Causewayside (causeway.richardthedesigner.com). Work in Chrome, in his signed-in accounts. Do each step, check it worked, and tell him what you did in short bullets. Stop and ask him whenever a step says **Ask Richard**. Never type, paste or save a password, a secret key or a "service_role" key anywhere except the field that asks for it. Never paste them into chat.

### 1. Make room for a free Supabase project

His Supabase organisation (id `iwxvofchobzhelqrweef`) already has two projects: "Expanvas PoC" and "gtm-kpi-hub". The free plan allows two active projects.

- Open https://supabase.com/dashboard/org/iwxvofchobzhelqrweef and check how many projects are active.
- **Ask Richard:** "Supabase's free plan allows two active projects and you have two. Shall I pause Expanvas PoC (it can be restored later), pause gtm-kpi-hub, or would you rather upgrade to Pro (about $25 a month)?" Do what he says. To pause: open the project, then Project Settings, then General, then "Pause project".

### 2. Create the project

- Open https://supabase.com/dashboard/new/iwxvofchobzhelqrweef
- Name: `causeway`
- Database password: click "Generate a password". **Ask Richard** to save it in his password manager now. Don't write it anywhere else.
- Region: **West EU (London)**, which is `eu-west-2`.
- Click "Create new project" and wait until it says it's healthy (a minute or two).
- Note the project's reference: the part after `/project/` in the address bar (a string of about 20 letters). Below it's called `REF`.

### 3. Turn on PostGIS

- Open https://supabase.com/dashboard/project/REF/database/extensions
- Search for `postgis`, switch it on, and choose the schema `extensions` when asked (not `public`).

### 4. Run the database set-up

Easiest: tell Richard "The Supabase project `causeway` exists, reference REF. Ask Claude Code to run the Causewayside migrations 0001 to 0009 on it." Claude Code has a Supabase connector and can do this and check the result.

If Richard wants it done now instead:

- Open https://supabase.com/dashboard/project/REF/sql/new
- For each file, in order, open its raw text, copy all of it, paste it into the SQL editor, click Run and check it says "Success":
  1. https://raw.githubusercontent.com/richardthedesigner/causeway/main/db/migrations/0001_graph.sql
  2. https://raw.githubusercontent.com/richardthedesigner/causeway/main/db/migrations/0002_notes.sql
  3. https://raw.githubusercontent.com/richardthedesigner/causeway/main/db/migrations/0003_sharing.sql
  4. https://raw.githubusercontent.com/richardthedesigner/causeway/main/db/migrations/0004_storage.sql
  5. https://raw.githubusercontent.com/richardthedesigner/causeway/main/db/migrations/0005_review.sql
  6. https://raw.githubusercontent.com/richardthedesigner/causeway/main/db/migrations/0006_my_data.sql
  7. https://raw.githubusercontent.com/richardthedesigner/causeway/main/db/migrations/0007_supabase_grants.sql
  8. https://raw.githubusercontent.com/richardthedesigner/causeway/main/db/migrations/0008_server_fields.sql
  9. https://raw.githubusercontent.com/richardthedesigner/causeway/main/db/migrations/0009_community_reports.sql
- If any file fails, stop and tell Richard which one and the error. Don't run the later ones.
- Then open https://supabase.com/dashboard/project/REF/storage/buckets and check there are two buckets: `note-photos` (private) and `note-photos-approved` (public).

### 5. Let people take part without an account

- Open https://supabase.com/dashboard/project/REF/auth/providers
- Find "Allow anonymous sign-ins" and switch it on. Save.
- Leave "Enable CAPTCHA protection" **off** for now. The app doesn't send a CAPTCHA token yet (roadmap SEC-09), so turning it on would stop everyone saving. Step 8 gets the CAPTCHA keys ready.

### 6. Copy the two public values

- Open https://supabase.com/dashboard/project/REF/settings/api-keys
- Copy the **Project URL** (`https://REF.supabase.co`). It's also on https://supabase.com/dashboard/project/REF/settings/api
- Copy the **anon** key (labelled "anon public", or the "publishable" key). It's safe in the app.
- Do **not** copy the "service_role" or "secret" key.

### 7. Give them to the app on Vercel

- Open https://vercel.com/richard-8622s-projects/causeway/settings/environment-variables
- Add `NEXT_PUBLIC_SUPABASE_URL` with the Project URL. Tick Production and Preview.
- Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the anon key. Tick Production and Preview.
- Save, then redeploy production: open https://vercel.com/richard-8622s-projects/causeway/deployments, open the menu (three dots) on the latest Production deployment, choose "Redeploy", and leave "Use existing build cache" unticked. Wait until it's Ready.
- Or tell Richard "Ask Claude Code to set the two Vercel variables and redeploy". It has a Vercel connector.

### 8. Get the CAPTCHA keys ready (Cloudflare Turnstile)

- **Ask Richard** whether he has a Cloudflare account. If he hasn't, he can sign up free at https://dash.cloudflare.com/sign-up.
- Open https://dash.cloudflare.com/?to=/:account/turnstile and click "Add widget".
- Widget name: `Causewayside`. Hostname: `causeway.richardthedesigner.com`. Widget mode: Managed. Create.
- The **Site key** is public: tell Richard what it is, so a later Claude Code session can add it to the app (SEC-09).
- The **Secret key** goes into Supabase only when SEC-09 ships, at https://supabase.com/dashboard/project/REF/auth/protection. Don't save it anywhere now; it can be shown again from Cloudflare later.

### 9. Name a reviewer

Photos and flagged reports wait for a person to check them.

- **Ask Richard** who will check them weekly (it can be him) and their email address.
- Open https://supabase.com/dashboard/project/REF/auth/users, click "Invite user" and enter that email.
- Open https://supabase.com/dashboard/project/REF/auth/templates, choose "Magic Link", and make sure the message includes `{{ .Token }}` (so the email carries a code). If it doesn't, add the line `Your code: {{ .Token }}` and save.
- Open https://supabase.com/dashboard/project/REF/sql/new and run, with their real email and name:
  `insert into reviewer (user_id, name) select id, 'Their name' from auth.users where email = 'their@email';`
- Their review page is https://causeway.richardthedesigner.com/review/

### 10. Check it works

- On Richard's phone, open https://causeway.richardthedesigner.com and allow location.
- Tap "Add a report: good or bad access", choose "Somewhere to sit", then Save. The sheet should say it's on the map.
- Open https://supabase.com/dashboard/project/REF/editor, choose the `community_report` table, and check one row arrived. Then delete the test report in the app: tap its pin, then "Delete my report".
- Tell Richard it's done, with: the project reference, which project you paused (if any), the Turnstile site key, and who the reviewer is.

### 11. Leave a note for Tay

Put a short note in the Google Drive folder "Tay": "Causewayside sharing is on (Supabase project causeway, London). Weekly: check /review for flagged reports and photos." Add the reviewer's name.
