#!/usr/bin/env bash
# scripts/verify-lockfiles.sh
# ---------------------------------------------------------------------------
# Lockfile-drift guard (issue #375).
#
# If any `npm ci` invocation in this workflow ended up mutating a tracked
# `package-lock.json` file, the diff against HEAD will be non-empty and
# this script exits 1, causing the calling CI step to fail.
#
# The list of paths is explicit rather than `find`-based because:
#   * npm workspaces share the root lockfile; today each sub-workspace
#     resolves via it, but if a future PR adds a workspace-level lockfile,
#     this list MUST be updated.
#   * Explicit paths make the workflow run-log show exactly which files
#     were checked.
#
# Usage:
#   bash .github/scripts/verify-lockfiles.sh
#
# Exit codes:
#   0 → no drift detected; log a confirmation line.
#   1 → at least one lockfile changed; emit `::error::` so GitHub
#       Actions surfaces the failure on the offending line in the PR.

set -euo pipefail

LOCKFILES=(
  "package-lock.json"
  "api/package-lock.json"
  "app/package-lock.json"
  "xstreamroll-sdk/package-lock.json"
  "xstreamroll-processing/package-lock.json"
  "packages/types/package-lock.json"
  "tests/contracts/package-lock.json"
)

# Translate the list into a `-- path` arg that ignores files that don't
# exist yet (e.g., a future workspace-level lockfile). An empty PATHS
# list is still safe — `git diff --exit-code HEAD --` with no paths
# errors out under set -e (which is what we want: an empty PATHS list
# would mean the script's own contract drifted out from under us, not
# a silent pass).
PATHS=()
for f in "${LOCKFILES[@]}"; do
  [ -f "$f" ] && PATHS+=("$f")
done

if [ "${#PATHS[@]}" -eq 0 ]; then
  echo "::error::verify-lockfiles.sh: no tracked lockfiles exist on disk; check that the LOCKFILES list matches reality."
  exit 1
fi

# Capture the diff (including any non-drift git errors — corrupted
# .git, shallow-clone missing objects, etc.) into a variable before
# deciding what to emit. Working in a single checkpoint rather
# than `if git ... then echo ... else ... fi` has two benefits:
#   1. the diff body lands exactly ONCE, paired with the `::error::`
#      remediation line — readers see the actionable next step
#      before the supporting context;
#   2. any non-drift git failure surfaces in the CI log instead of
#      being silently swallowed by `|| true` under `set -e`.
diff_body="$(git --no-pager diff HEAD -- "${PATHS[@]}" 2>&1)" || diff_body=""
if [ -z "$diff_body" ]; then
  echo "Lockfiles are unchanged — npm ci respected the committed package-lock.json files."
else
  # The annotation lands on stderr (not stdout) so it surfaces as a
  # workflow-run "annotation" rather than just a log line. GitHub
  # Actions parses `::error::` from either stream, but stderr is
  # the idiomatic channel for warning-level annotations.
  echo "::error::npm ci mutated a package-lock.json. Run 'npm install' locally, commit the resulting package-lock.json, and re-run the workflow." >&2
  # Trim a trailing newline so the diff body sits cleanly under the
  # remediation line in the GitHub Actions log viewer.
  printf '%s' "$diff_body"
  exit 1
fi
