# Security

Causewayside holds health-related information: how far someone can walk or wheel, what slopes and kerbs they can manage, which device they use. We take reports about it seriously.

## Reporting a vulnerability

Please report it privately, not in a public issue or pull request.

- Use GitHub's private reporting: [Report a vulnerability](https://github.com/richardthedesigner/causeway/security/advisories/new) (the repository's **Security** tab, then **Report a vulnerability**).
- Say what you found, how to reproduce it, and what someone could do with it.
- Please don't access, change or delete other people's notes, reports or photos beyond what you need to show the problem.

We aim to reply within 5 working days and to agree a date for any fix and disclosure with you. We'll credit you in the fix unless you'd rather we didn't.

## What's in scope

- The web app (`apps/web`) and its live deployment.
- The sharing backend: the database rules in `db/migrations` and the storage buckets for note photos ([docs/BACKEND.md](docs/BACKEND.md)).
- Anything that could expose someone's profile, location or identity. The profile is meant never to leave the device ([D-009](docs/DECISIONS.md)).
- The GitHub workflows in `.github/workflows`.

## Out of scope

- Wrong or missing map data, such as a kerb that's higher than mapped. That's a safety problem, not a security one: please send it with the **Report** button in the app, or open an issue.
- Reports from automated scanners with no working example.
- Denial of service by sheer volume.
- The third-party services we call (OpenStreetMap, Open-Meteo, TfL, postcodes.io, Photon, Supabase). Report those to them.

## How the app protects people

- Routing runs on the device. Profiles and devices stay in the browser's storage. Sharing a note sends the note, never the profile ([D-009](docs/DECISIONS.md), [D-030](docs/DECISIONS.md)).
- Shared notes use anonymous sign-in, and row-level security decides who can read and change what.
- The site sends a Content Security Policy and other security headers ([D-041](docs/DECISIONS.md)).
