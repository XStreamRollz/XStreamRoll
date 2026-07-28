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

if git diff --exit-code HEAD -- "${PATHS[@]}"; then
  echo "Lockfiles are unchanged — npm ci respected the committed package-lock.json files."
else
  echo "::error::npm ci mutated a package-lock.json. Run 'npm install' locally, commit the resulting package-lock.json, and re-run the workflow."
  exit 1
fi
