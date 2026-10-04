# Working on Causewayside

## The roadmap comes first

[docs/ROADMAP.md](docs/ROADMAP.md) is the one list of work. Every session follows it:

1. **Before starting:** read its **Now** section and the section your task belongs to. If the task isn't listed, add a row with a new ID first.
2. **While working:** set the row to `doing` with the date and branch. Put the ID in the branch name, commit messages and PR title (`SEC-01: security headers`).
3. **When finished:** set the row to `done (YYYY-MM-DD)`, add a line to the roadmap's **Log**, and add rows for anything you found but didn't do.
4. **If Now drops below five open items,** promote the next most useful ones.

A PR that changes code without touching `docs/ROADMAP.md` is incomplete.

## The other docs

- What shipped: add an entry to `docs/BUILD_LOG.md` (newest first).
- Why: a new or updated `D-0xx` in `docs/DECISIONS.md` for any real choice.
- Anything that needs Richard (an account, a key, money, a decision) goes in the roadmap's **Waiting on Richard** section and, if it needs discussion, a GitHub issue.

## Checks before pushing

```sh
pnpm typecheck
pnpm test
pnpm --filter @causeway/web typecheck
```

UI changes: also `pnpm web:build && pnpm a11y`, and check light, dark, 320 px wide and 200% text.

## Writing style for docs and UI copy

British English. Short, direct sentences. No em dashes.
