#!/usr/bin/env bash
# Vercel's ignoreCommand (apps/web/vercel.json): exit 0 skips the build, exit 1 builds.
# Keeps us under the free plan's 100 deployments a day (DEP-03):
#  - main mirrors the production branch commit for commit (mirror-production.yml), so it never needs its own build.
#  - Changes only to docs, Markdown, workflows or database migrations don't change the app.
# When in doubt (no earlier commit to compare with), it builds.
set -u
if [ "${VERCEL_GIT_COMMIT_REF:-}" = "main" ]; then
  echo "Skip: main mirrors the production branch."
  exit 0
fi
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  base="$(git rev-parse -q --verify HEAD^ 2>/dev/null || true)"
fi
if [ -z "$base" ]; then
  echo "Build: nothing to compare with."
  exit 1
fi
cd "$(git rev-parse --show-toplevel)" || exit 1
if git diff --quiet "$base" HEAD -- . ':(exclude)docs' ':(exclude)*.md' ':(exclude).github' ':(exclude)db' ':(exclude)CLAUDE.md'; then
  echo "Skip: only docs, workflows or migrations changed since $base."
  exit 0
fi
echo "Build: app code or data changed since $base."
exit 1
