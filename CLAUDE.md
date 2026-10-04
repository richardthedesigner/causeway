# Working on Causewayside

Read this first in every session.

## The roadmap comes first

[docs/ROADMAP.md](docs/ROADMAP.md) is the one list of work. Every session follows it:

1. **Before starting:** read its **Now** section and the section your task belongs to. If the task isn't listed, add a row with a new ID first.
2. **While working:** set the row to `doing` with the date and branch. Put the ID in commit messages and the PR title (`SEC-01: security headers`).
3. **When finished:** set the row to `done (YYYY-MM-DD)` in the same pull request, add a line to the roadmap's **Log**, and add rows for anything you found but didn't do.
4. **If Now drops below five open items,** promote the next most useful ones.

A PR that changes code without touching `docs/ROADMAP.md` is incomplete.

## The other docs

- **What's waiting on Richard, blocked outside the project, or a guess to check:** [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md). A roadmap row that waits on Richard also gets a line there. Move settled items to "Done" with the date.
- **Why things are the way they are:** [docs/DECISIONS.md](docs/DECISIONS.md). Read the relevant decision before changing behaviour it covers. Record new choices with the next D-number.
- **What shipped:** add an entry to [docs/BUILD_LOG.md](docs/BUILD_LOG.md), newest first.
- **Data sources:** [docs/DATA_SURVEY_UK.md](docs/DATA_SURVEY_UK.md). Roadmap rows cite it by section (§).

## The roadmap has two copies

- `docs/ROADMAP.md` is the master copy. Make changes there only.
- A read-only Google Doc copy lives in Richard's Drive `causewayside` folder: [Causewayside roadmap](https://docs.google.com/document/d/1T-RPq188B09LBahJIWPg_Hapm6m_vYbHB88pUzxJXV4/edit).
- After changing the roadmap, update the Doc to match if the Google Docs connector is available. If it isn't, tell Richard the Doc is now out of date.
- Never treat the Doc as the source. Richard may comment there; carry anything he asks for into the repo file.

## Checks before pushing

```sh
pnpm typecheck
pnpm test
pnpm --filter @causeway/web typecheck
```

UI changes: also `pnpm web:build && pnpm a11y`, and check light, dark, 320 px wide and 200% text.

## Pull requests and CI

- The GitHub Actions checks (`check`, `migrations`) are the ones that matter.
- Vercel doesn't build `claude/*` branches (`apps/web/vercel.json`), except the production branch. A failed Vercel preview saying "Resource is limited" (`api-deployments-free-per-day`) is the free plan's daily limit, not a code problem. Say so once on the PR and move on.

## Writing style for docs and UI copy

British English. Short, direct sentences. No em dashes.
