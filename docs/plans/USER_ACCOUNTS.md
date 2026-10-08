# Plan: user accounts

FEAT-25, 2026-10-08. Decision: [D-083](../DECISIONS.md#d-083-user-accounts-supabase-auth-upgraded-in-place-optional-forever). Status: planned, nothing built. Accounts stay deferred by Richard (DEF-07) until he says go; the phases below are FEAT-26 to FEAT-34 in the [roadmap](../ROADMAP.md#features).

Read first: [D-009](../DECISIONS.md) (profile data stays on the device), [D-030](../DECISIONS.md) (sharing on Supabase, anonymous, post-moderated), [D-059](../DECISIONS.md) (Your data), [D-060](../DECISIONS.md) (saved places stay on the phone), [BACKEND.md](../BACKEND.md), the [security review](../reviews/security-2026-10.md).

## Where we start from

- **No accounts.** The app signs in anonymously to Supabase the first time someone shares a note or sends a report (`apps/web/src/lib/sync.ts`). That anonymous user id is the only identity the server knows. Others see a salted per-person pseudonym (`author_key`), never the id.
- **Mobility profiles are on the phone only.** Named devices (Cherry, Lulu) are `SavedDevice`s in local storage (D-034, D-082). So are saved places (D-060). Nothing about them reaches a server (D-009, enforced by `pnpm e2e`).
- **Reviewers** already have real accounts: invited by email, signing in to `/review` with an email code, with powers set by row-level security (`0005_review.sql`).
- **No Supabase project exists yet** (OPEN_ITEMS). The site is a static export on Vercel, so there is no app server: the browser talks to Supabase directly and the database rules do the protecting.
- **In flight elsewhere:** community accessibility reports (reports, photos, agree and disagree votes, confidence scores) with a lightweight anonymous contributor id, and a safe spaces feature that may hold sensitive preferences. This plan sets the contract both attach to (see [Fit with community reports and safe spaces](#fit-with-community-reports-and-safe-spaces)).

## Goals

What an account unlocks, in order of value:

1. **Your profiles on every phone.** Cherry and Lulu, their limits, and saved places, synced between your devices. Today a new phone means setting everything up again.
2. **Contributions that count.** Reports and votes from someone with a track record weigh more than a fresh anonymous one, so good contributors make the map better faster, and bad actors get less leverage.
3. **Saved places and routes** that survive a lost phone.
4. **Carers and companions.** A partner, parent or support worker can set up and look after a profile for someone, or several people can use the same profile, with the person in control.
5. **Moderation with names.** Moderators act as themselves, with scoped powers and an audit trail, and repeat abusers can be suspended rather than just starting a new anonymous id.

## Non-goals

- **Accounts are never required.** Routing, every profile setting, saved places, reports, notes and votes all keep working without one. An account adds sync and weight; it never unlocks routing. Many disabled people use shared or borrowed phones, have cognitive or memory impairments that make sign-in hard, or simply don't want another account. The app's promise (D-009) is that it needs nothing about you to work.
- **No social features.** No followers, profiles to browse, leaderboards or public contribution histories. These create stalking and harassment risk for no routing benefit.
- **No passwords.** Passwords fail people with memory and cognitive impairments, invite reuse, and need a reset flow anyway.
- **No server-readable health data.** The mobility profile and any sensitive preference are encrypted on the phone before they sync (see [Sync](#sync-encrypted-on-the-phone)).
- **No location history.** Accounts don't store where you've been or routed. Saved places are encrypted like profiles.
- **No analytics on accounts.** No tracking of who signs in when beyond what security needs.

## Sign-in methods compared

What matters here: a disabled user must be able to sign in without a cognitive function test (WCAG 2.2 SC 3.3.8 Accessible Authentication (Minimum), AA), without solving a CAPTCHA, on a shared or older phone, with a screen reader, switch access or voice control, and recover without help.

SC 3.3.8 in short: no step may rely on remembering, transcribing or solving something unless there's an alternative, a helper (paste allowed, password managers work), or it's object recognition or personal content. Copying a code from an email is acceptable when paste and `autocomplete="one-time-code"` work.

| Method | Accessibility | Security | Cost to us | Verdict |
|---|---|---|---|---|
| **Upgrade the anonymous id** (add an email or passkey to the user who already exists) | Nothing new to learn: you keep what you've done | Same as the method added | Supabase does it natively: the user id stays the same, so notes, reports and votes need no migration | **Yes, always.** Every sign-up is an upgrade |
| **Email one-time code** (6 digits, also a link in the same email) | Meets 3.3.8 when paste and one-time-code autofill work. Works on any phone and with any assistive technology. Cost: switching to email and back, a strain for some | Good. As safe as the inbox | Supabase OTP, plus a proper sender (custom SMTP) | **Yes, first.** The method that works for everyone |
| **Email magic link only** | One tap, but often opens in a different browser from the installed web app, losing the session, and mail scanners can use up the link | Good | Same as code | **As a second way in the code email,** never on its own |
| **Passkeys** (Face ID, fingerprint, phone PIN) | Best when it works: nothing to remember or type, meets 3.3.8 outright. Weak on shared phones, and the platform dialogs vary with screen readers | Best: phishing resistant | Supabase passkey support needs checking at build time (below). WebAuthn PRF lets a passkey unlock encrypted sync | **Yes, offered straight after the first email sign-in,** then the default way back in |
| **Sign in with Apple or Google** | Low effort for people already signed in on the phone. Apple hides the email if asked | Good, but ties a disability app to a big tech identity, and Google learns who uses it | Apple developer account (yearly fee) and a Google OAuth client, both Richard's | **Later and optional** (FEAT-33), once testers say they want it |
| **Passwords** | Fail 3.3.8 without a password manager; reset flows add load | Weakest | | **No** |

**CAPTCHAs.** No visual or audio puzzles anywhere. Cloudflare Turnstile (SEC-09) runs in its invisible, non-interactive mode on anonymous sign-up and on account upgrade. If it ever wants an interaction, the fallback is the email code, never a puzzle. Rate limits and trust levels (below) carry most of the anti-abuse load so that Turnstile can stay invisible.

**Flow, as few steps as we can make it:**
1. "Keep your profiles on all your phones" in Your data, or "Get credit for your reports" after a contribution. Never a wall in front of anything.
2. Email address, one field, `autocomplete="email"`. Plain words about what we'll do with it.
3. Code screen: one field, `inputmode="numeric"`, `autocomplete="one-time-code"`, paste allowed, no time pressure under 1 hour, "Send a new code", and "Open the link in the email instead".
4. "Add a passkey so you don't need a code next time?" Yes or Not now.
5. What's on this phone, and what to sync (see [From the phone to an account](#from-the-phone-to-an-account)).

Every step: one task per screen, focus moved to the heading, errors said in words next to the field, works at 320 px and 200% text, no timeouts that lose what you typed.

## Providers compared

| | Supabase Auth | Clerk | Auth.js | Others |
|---|---|---|---|---|
| Fits a static export on Vercel | Yes: browser to Supabase, no app server | Yes, but its components add JavaScript to the first screen | **No:** needs a server runtime and its own database adapter | Stytch, WorkOS: hosted, fit. Better Auth: needs a server |
| Anonymous to account in place | **Native** (`updateUser` on the anonymous user keeps its id) | No anonymous users: our existing ids would need mapping | Build it ourselves | Mostly no |
| Row-level security on `auth.uid()` | **Same database, works today** | Through third-party JWT setup, a second user store to keep in step | Build it ourselves | Third-party JWT |
| Email code, OAuth | Yes | Yes | Yes | Yes |
| Passkeys | WebAuthn support has been arriving in stages: check passkey sign-in (not only as a second factor) is generally available before FEAT-28. Fallback below | Mature | Experimental | Stytch: mature |
| Turnstile | Built in | Built in (its own) | Build it | Varies |
| Where data lives | London (`eu-west-2`), like the rest of our data | US processor: a UK transfer to cover (IDTA or the UK extension) | Ours | Mostly US |
| Cost at our scale | Free tier covers 50,000 monthly users; Pro for backups and no pausing | Free to a limit, then per user | Free, but ours to run | Per user |

**Recommendation: Supabase Auth.** We already run on it (D-030), the anonymous ids people have now become accounts without a migration, RLS keeps working, data stays in London, and there's no new processor for the DPIA. Clerk has the best passkey UX, but a second user store, a US transfer and heavier first-screen JavaScript cost more than they give.

**Passkey fallback if Supabase's isn't ready:** a Supabase Edge Function using SimpleWebAuthn to register and verify passkeys, which then signs the user in through Supabase's admin API. More code to own and review, so only if needed; the email code works meanwhile.

## Data model

New tables, all in `public` with row-level security and grants by name (D-070). `auth.users` stays Supabase's.

| Table | Holds | Who can read | Notes |
|---|---|---|---|
| `account` | `user_id` (= `auth.users.id`), `handle`, `handle_changed_at`, `created_at`, `status` (`active`, `suspended`, `deleting`), `last_active_month` | The owner; moderators see `handle` and `status` | A row exists only once someone upgrades. Anonymous users have none. `last_active_month` is coarse on purpose, for retention only |
| `consent` | `user_id`, `purpose`, `version`, `granted_at`, `withdrawn_at` | The owner | Append only. Purposes: `sync_profiles`, `sync_places`, `sync_routes`, `sensitive_prefs`, `carer_share`, `public_credit` |
| `vault_item` | `id`, `user_id`, `kind` (`device`, `place`, `route`, `prefs`), `ciphertext`, `nonce`, `key_id`, `updated_at`, `deleted` | The owner, and grantees of a shared item | The server never sees what's inside. Size capped per item and per account |
| `vault_key` | `user_id`, `key_id`, `wrapped_key`, `wrapped_by` (`passkey_prf`, `recovery`), `credential_id` | The owner | The account's data key, wrapped by each way of unlocking it |
| `account_public_key` | `user_id`, `public_key` | Any signed-in account | For sharing a profile with a carer: the item key is wrapped to their public key |
| `contributor` | `contributor_id` (= the anonymous or full `auth.users.id`), `trust_level`, `weight`, `created_at` | The owner; the server functions that score | One row per person who has contributed, account or not |
| `reputation_event` | `contributor_id`, `kind`, `delta`, `ref`, `created_at` | The owner; moderators | Why weight moved: a report confirmed by others, a vote that matched the outcome, an upheld flag |
| `item_share` | `vault_item_id`, `owner_id`, `grantee_id`, `role` (`manage`, `use`), `wrapped_item_key`, `created_at`, `revoked_at` | Owner and grantee | Carers and companions |
| `moderator` | `user_id`, `role` (`moderator`, `admin`), `area_id` (null = everywhere) | Moderators | Grows `reviewer` (0005). The `review_log` keeps every decision |

**Profiles (mobility devices).** A synced device is one `vault_item` of kind `device`: the same `SavedDevice` JSON the phone keeps, encrypted. Several profiles under one account is just several items, as on the phone today.

**Saved places and routes.** One `vault_item` each. Saved routes don't exist yet: FEAT-34 adds them on the phone first, like saved places.

**Contributor identity.** The contributor id is the Supabase user id, anonymous or not. Because upgrading keeps the id, every report, vote, note and flag someone made anonymously on this phone becomes theirs with nothing to move. Public views never show it: they show a per-target key (SEC-18) or nothing.

**Handles.** Generated at upgrade from two words and a number ("quiet-heron-42"), changeable once a month, never an email or real name by default. Used in moderation and, only with `public_credit` consent, on the person's own contributions.

### From the phone to an account

1. **Anonymous ids.** The anonymous session on this phone is upgraded in place, so all its contributions follow. A second phone that also has an anonymous id with contributions: after signing in there, "This phone also sent 3 reports. Add them to your account?" The phone proves it holds that anonymous session (its refresh token), and a server function re-points those rows to the account and records a merge in `reputation_event`. Weight is recomputed, never added twice.
2. **Local data.** After sign-in the app lists what's on this phone: "Cherry (powerchair, lightweight), Lulu (pavement scooter), 4 saved places". Each kind has its own switch and consent line. Nothing syncs until switched on. The phone copy is never deleted by signing in or out.
3. **A second phone with its own data.** Items are matched by id; a different item with the same name is kept as "Cherry (from this phone)" for the person to tidy. After that, the newest `updated_at` wins per item.
4. **Your data and Delete everything** (D-059) gain an account section: download includes decrypted synced items; delete everything also deletes the account, its vault, shares, consents and contributor rows, after a code or passkey check.

## Sync, encrypted on the phone

D-009 says profile data stays on the device. Syncing it must not turn the server into a store of people's impairments, so sync is end to end encrypted.

- **One data key per account**, made on the phone (WebCrypto, AES-GCM). Each item is encrypted with it before upload.
- **Unlocking the data key on a new phone:**
  - with a passkey that supports the WebAuthn PRF extension (recent iCloud Keychain, Google Password Manager and others): the passkey derives a key that unwraps the data key, so the passkey alone both signs in and unlocks. Nothing to remember.
  - otherwise a **recovery key**, shown once, with "Save as a file", "Copy" (for a password manager) and "Print". Never asked to be typed from memory: pasting or opening the file works (3.3.8).
- **If both are lost,** synced data can't be read by anyone, us included. The phones still hold their copies. The sign-up screen says this in one plain sentence.
- **Server readable sync** (encrypted at rest only) would make recovery easier but puts health data where we and Supabase could read it. Not recommended; an open question for Richard.

## Privacy and safety

### UK GDPR

| Data | Lawful basis | Notes |
|---|---|---|
| Email, handle, sign-in records | Contract (Art. 6(1)(b)): needed to provide the account | |
| Synced profiles and sensitive preferences | Explicit consent (Art. 9(2)(a)) for special category data, as well as contract | Encrypted so we can't read it, but treated as health data anyway. Consent per purpose, recorded in `consent`, withdrawable from Your data, which deletes the synced copies |
| Saved places and routes | Consent | Where someone lives is not special category but is sensitive: same encryption |
| Contributions, votes, reputation | Legitimate interests (Art. 6(1)(f)): better accessibility data for everyone. A legitimate interests assessment goes in the DPIA | The mobility label on a note stays opt-in explicit consent (D-030) |
| Carer access | The profile owner's consent, given in the app | Where the owner can't consent themselves: open question |

- **Data minimisation.** Email is the only required personal field. No name, no date of birth, no phone number. Age: a "you're 13 or over" confirmation (UK age of digital consent is 13). No IP addresses stored by us; Supabase's auth logs keep them for its own retention period (documented in the privacy notice).
- **Retention.**
  - Anonymous users with nothing shared: removed after 12 months unused.
  - Accounts unused for 24 months: an email warning, then deletion 30 days later.
  - Deleted account: everything private goes at once. Public contributions are kept but cut from the person (the contributor row is replaced by a tombstone, weight frozen) unless they chose "delete my contributions too". Backups roll off within the backup window (7 days on the free plan, longer on Pro): the privacy notice says so.
  - `reputation_event` older than 2 years is summarised and dropped.
- **Export and delete.** Your data (D-059) covers the account: one JSON file with account, consents, decrypted synced items, contributions and reputation history; one delete for all of it. Both work without contacting us. Also by email request for anyone who can't use the app.
- **DPIA first.** SEC-10 must be done and signed off before FEAT-27 goes live. Accounts are why it's owed now.

### Location data

- Routing requests never carry the account or profile (D-009). The router doesn't know who's asking.
- No location history, trip history or "recent routes" on the server. Saved places and routes are encrypted vault items.
- Reports and notes keep the point of the thing reported, never a track of the reporter. Times shown publicly as the day, not the minute.
- Photos lose their EXIF location and device data on the phone before upload.

### Threat model

| Who | Wants | Risk from accounts | Defence |
|---|---|---|---|
| A stalker or abusive ex who knows the person | Where they go, when | A contribution history ties a person to the places they visit, often near home | No public histories. Public items show no handle unless `public_credit` is on, and then only on the item, never as a linked list. Per-target keys (SEC-18). Day-level times. "Hide all my credit" in one switch |
| Someone harassing disabled contributors | To find and target them | Handles as targets | Pseudonymous handles by default, no messaging between users, no profile pages, flags reviewed fast |
| A controlling carer | To monitor or restrict the person | Shared profile access used for control | The owner always sees who has access and can remove anyone, without the carer's approval. Grantees never see location, reports or saved places unless shared item by item. Access changes notify the owner. A carer can't delete the owner's account |
| Sybil or brigade | To push a place's score up or down | More weight per account | Weight earned slowly, capped, and from independent agreement (below). New and anonymous accounts weigh little |
| A breach of our database | Health data, emails | A leak of sensitive data | Vault items are ciphertext. Emails and handles are the main loss. RLS on every table; Security Advisor checks |
| A rogue or careless moderator | To see or act beyond their role | Moderator powers | Scoped by area, every action logged with who did it, no access to vaults, emails shown only to admins |
| Someone who gets the phone | The account | Signed-in session on a shared phone | "Sign out on this phone", session list with "Sign out everywhere", passkey or code before export or delete |
| Legal demands | Data about a user | What we hold | We hold little and can't read vaults. The privacy notice says what we can disclose |

## Reputation and trust

Scope: the accounts side supplies a **weight per contributor**; the community reports plan owns how weights combine into a place's confidence score. The contract is one server function, `contributor_weight(contributor_id) returns numeric`, and the `contributor` and `reputation_event` tables.

**Trust levels**

| Level | Who | Weight | Can |
|---|---|---|---|
| 0 | Anonymous, or an account under 7 days old | 0.25 | Report, vote, note, flag (with the D-030 limits) |
| 1 | Account with a verified email or passkey, 7 days old | 0.5 | As 0, higher daily limits |
| 2 | 30 days, 10 or more contributions later confirmed by other people or by official data, no upheld flags against them in 90 days | 1.0 | As 1; their flag counts double towards hiding |
| 3 | Trusted, named by a moderator | 1.5 | As 2; can mark a report "checked on site" |

- **Weight grows from agreement, not volume.** A report earns a point when two other unconnected people (or an official source, such as council data) later agree with it, and loses one when the place is later shown otherwise. Votes that match the eventual outcome earn a little. Posting a lot earns nothing on its own.
- **Caps.** No single contributor counts above 1.5 on any item, and one contributor's votes count once per place, however many reports.
- **Decay.** Points older than a year count half, so old reputation can't be banked and spent.
- **Sybil resistance.** Turnstile on sign-up. Level 1 needs a verified email or passkey, and one email gives one account. New accounts weigh little for a week. Accounts created together that vote together are grouped: votes on one place from accounts made within the same hour, with no other history, count as one.
- **Brigading.** A sudden run of votes on one place (more than the place's usual weekly count within an hour) freezes its score and queues it for a moderator. Once a moderator decides a report, later votes don't move it.
- **Losing trust.** Upheld flags remove points; two upheld in 30 days drops a level; a moderator can suspend. Suspension stops new contributions and sets weight to 0; past contributions stay unless removed.

**Moderation roles**

| Role | Can | From |
|---|---|---|
| Member (level 0 to 3) | Flag | Automatic |
| Moderator | Today's reviewer powers (D-030): hide and restore, approve photos, triage reports; plus suspend accounts and set level 3, within their area | Named by an admin |
| Admin (Richard) | Name moderators, see emails for safety cases, change any area | `moderator` table, by SQL only |

Every moderator action goes in `review_log`. A suspended person can ask for a review by email; another moderator decides.

## Shared accounts: carers and companions

Two shapes, both built on the vault:

1. **Several profiles under one account.** Already how the phone works (D-034): one person with Cherry and Lulu, or a parent with a profile for each child. Nothing new beyond sync.
2. **A profile shared between accounts.** The owner invites someone by email from the profile's menu: "Let someone else use or manage Cherry".
   - **Use:** the grantee can route with the profile on their phone (for example, a companion planning a trip together). Read only.
   - **Manage:** the grantee can also change the profile's settings. The owner sees every change ("Sam changed the kerb limit to 3 cm").
   - The item's key is wrapped to the grantee's public key, so the server still can't read it. Revoking makes a new item key and re-encrypts.
   - The owner can remove anyone at any time. Grantees see only what's shared to them.
   - **A person who can't hold an account themselves** (for example, someone with a severe learning disability): the carer creates the profile in their own account and it is theirs to manage. Whether a carer can consent on the person's behalf is an open question for Richard and the DPIA.

## Fit with community reports and safe spaces

The community reports plan (`docs/plans/COMMUNITY_REPORTS.md`) had not landed on `main` or in an open PR when this was written (2026-10-08). The contract it should meet, recorded in OPEN_ITEMS to check when it lands:

- **Use the Supabase anonymous user id as the contributor id.** Reports, photos, votes and confidence inputs should carry `auth.uid()` (as `note.author_id` does), not a separate random id. Then upgrading to an account carries everything with no migration. If it uses a separate phone-made id, add a `contributor_id` column that maps to `auth.uid()` before its first release, or the claim step above has to move rows.
- **Never expose the contributor id publicly.** Use per-target keys (SEC-18) for counting distinct people.
- **Read weights through `contributor_weight()`** and treat anonymous as level 0 (0.25), so accounts change weights without changing the scoring code.
- **Votes one per contributor per item,** enforced by a unique index, so a merged account can't double vote.
- **Leave room for `reputation_event`:** a report confirmed or disproved should be an event the accounts side can listen to.

**Safe spaces.** Any preference that reveals health, sexuality, religion or similar is special category data: it goes in the vault as kind `prefs`, encrypted on the phone, synced only with `sensitive_prefs` consent, and never sent with a routing or search request in a form tied to an account.

## Rollout

Each phase is its own PR and ships behind a flag. Nothing goes live before the DPIA.

| Phase | Roadmap | What | Size | Waits on |
|---|---|---|---|---|
| 0 | FEAT-26 | Richard's decisions on the open questions; DPIA (SEC-10) signed off; privacy notice, terms and community guidelines; Supabase project made (BACKEND.md), custom email sender, Turnstile | M | Richard |
| 1 | FEAT-27 | Accounts: upgrade the anonymous id with an email code, sign in on another phone, sign out, sign out everywhere, handles, delete account in Your data | L | FEAT-26 |
| 2 | FEAT-28 | Passkeys: add one after the first sign-in, sign in with it, manage them | M | FEAT-27; Supabase passkey check |
| 3 | FEAT-29 | Sync profiles and saved places, end to end encrypted, with consent per kind, the recovery key and conflict handling | L | FEAT-28 (PRF), FEAT-27 |
| 4 | FEAT-30 | Contributor identity: `contributor`, claiming anonymous ids from other phones, optional public credit | M | FEAT-27, community reports' first release |
| 5 | FEAT-31 | Reputation and moderation: trust levels, weights, Sybil and brigade checks, moderators by area | L | FEAT-30, enough reports to tune it |
| 6 | FEAT-32 | Carers and companions: share a profile to use or manage, with revoke and change notices | L | FEAT-29 |
| later | FEAT-33 | Sign in with Apple and Google | M | Tester demand; Richard's developer accounts |
| later | FEAT-34 | Saved routes on the phone, then in sync | M | FEAT-29 for sync |

**Feature flags.** The site is a static export, so flags are build time:

- `NEXT_PUBLIC_ACCOUNTS`: `off` (default, today's app exactly), `invite` (sign-in shown only after opening an invite link, which sets a flag on the phone), `on`.
- `NEXT_PUBLIC_ACCOUNTS_SYNC`, `NEXT_PUBLIC_ACCOUNTS_CARERS`, `NEXT_PUBLIC_REPUTATION`: one per later phase, off by default.
- The database enforces the same: during `invite`, an `account_beta` allow list gates creating an `account` row, so the API can't be used around a hidden button.
- **Kill switch:** setting the flag to `off` and redeploying hides every account screen; data on phones is untouched and anonymous sharing carries on. Supabase providers can also be turned off in its dashboard.
- Each phase has e2e journeys for signed out (unchanged) and signed in, and `pnpm a11y` covers every new screen.

## What Richard must set up

Simple steps go in OPEN_ITEMS when each phase starts. In short:

- **Supabase project** in London, per [BACKEND.md](../BACKEND.md), if not made by then. Consider Pro (about $25 a month) once it holds accounts, for daily backups kept longer and no pausing.
- **An email sender** for sign-in codes (Supabase's built-in one is limited to a few emails an hour): a provider such as Resend or Postmark, and DNS records (SPF, DKIM, DMARC) on the sending domain.
- **Cloudflare Turnstile** site key and secret, in Supabase's CAPTCHA setting (SEC-09).
- **Legal pages:** privacy notice (what, why, lawful basis, retention, processors, rights, contact), terms of use, community guidelines for reports, and how carer access works. Claude can draft; Richard approves.
- **ICO data protection fee,** if not already paid (a small yearly fee for most organisations that process personal data).
- **The DPIA** (SEC-10): Claude drafts, Richard signs.
- **A data requests contact,** an email address that someone reads.
- **Later, only for FEAT-33:** an Apple Developer account and a Google Cloud OAuth client.

## Open questions for Richard

1. **Go or wait?** Keep accounts deferred (DEF-07) until research with testers, or start Phase 0 now?
2. **End to end encrypted sync** (we can't read it, lost keys mean lost synced data) or **server readable** (easier recovery, but health data we hold)? Recommended: end to end.
3. **Minimum age:** 13 (the UK digital consent age) or 16 or 18?
4. **Sign in with Apple and Google:** offer later, or never?
5. **Supabase Pro** (about $25 a month) once accounts exist?
6. **Public credit:** may people show their handle on their own reports, or always anonymous to others?
7. **Carers consenting for someone else:** allowed, and with what checks?
8. **Moderators:** who besides you, and should they be scoped by city?
9. **Sending domain** for sign-in emails.
10. **Retention:** happy with 12 months for unused anonymous ids and 24 months for unused accounts?
