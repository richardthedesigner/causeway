# Working on Causewayside

Read this first in every session.

## Before you start

- **The order of work** is in [docs/ROADMAP.md](docs/ROADMAP.md). Check it before picking up new work.
- **What's waiting on Richard, blocked, or a guess** is in [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md).
- **Why things are the way they are** is in [docs/DECISIONS.md](docs/DECISIONS.md). Read the relevant decision before changing behaviour it covers.

## The roadmap has two copies

- `docs/ROADMAP.md` is the master copy. Make changes there only.
- A read-only Google Doc copy lives in Richard's Drive `causewayside` folder: [Causewayside roadmap](https://docs.google.com/document/d/1T-RPq188B09LBahJIWPg_Hapm6m_vYbHB88pUzxJXV4/edit).
- After changing the roadmap, update the Doc to match if the Google Drive connector is available. If it isn't, tell Richard the Doc is now out of date.
- Never treat the Doc as the source. Richard may comment there; carry anything he asks for into the repo file.

## Keep the docs current

- Move items in OPEN_ITEMS.md to "Done" with the date when they're settled, and add new ones as they come up.
- Record new decisions in DECISIONS.md with the next D-number.
- Note shipped work in BUILD_LOG.md.
- When work on the roadmap finishes, mark it in ROADMAP.md in the same pull request.

## Pull requests and CI

- A failed Vercel preview saying "Resource is limited" (`api-deployments-free-per-day`) is the free plan's daily limit, not a code problem. Say so once on the PR and move on.
- The GitHub Actions checks (`check`, `migrations`) are the ones that matter.
