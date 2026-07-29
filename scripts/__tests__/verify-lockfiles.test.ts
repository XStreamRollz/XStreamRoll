/**
 * Black-box test for .github/scripts/verify-lockfiles.sh (issue #375).
 * Mirrors the validator-test pattern: spawn the script via
 * `child_process.spawnSync`, drive it as a separate process so we
 * exercise the same shell surface CI uses. Drift injection is
 * undone via `git checkout HEAD -- package-lock.json` in both
 * beforeEach and afterEach so a leaked mutation can't bleed into
 * the validator test that runs alongside this file.
 */
import { execFileSync, spawnSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

const REPO_ROOT = path.resolve(__dirname, "..", "..")
const SCRIPT = path.resolve(
  REPO_ROOT,
  ".github",
  "scripts",
  "verify-lockfiles.sh",
)
const LOCKFILE = path.resolve(REPO_ROOT, "package-lock.json")

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
}

function runScript(): RunResult {
  // The script uses `git diff HEAD -- ...` and reads paths relative
  // to the repo root, so we MUST run it from there.
  const result = spawnSync("bash", [SCRIPT], {
    encoding: "utf-8",
    cwd: REPO_ROOT,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

// Append a no-op comment to package-lock.json — enough to produce a
// diff against HEAD without breaking JSON parsing (git treats it as
// a text change).
function injectLockfileDrift(): void {
  fs.appendFileSync(LOCKFILE, "\n// drift marker for verify-lockfiles test\n")
}

// Restore package-lock.json to its committed state. Runs before AND
// after each test so the suite can't leave stale drift behind for
// the validator test that runs immediately after.
function restoreLockfileFromGit(): void {
  execFileSync("git", ["checkout", "HEAD", "--", "package-lock.json"], {
    cwd: REPO_ROOT,
  })
}

describe(".github/scripts/verify-lockfiles.sh", () => {
  beforeEach(restoreLockfileFromGit)
  afterEach(restoreLockfileFromGit)

  it("exits 0 with the success line when no lockfile drift", () => {
    const res = runScript()
    expect(res.status).toBe(0)
    expect(res.stdout).toContain("Lockfiles are unchanged")
  })

  it("exits 1 with the documented ::error:: line and a single diff body on drift", () => {
    injectLockfileDrift()
    const res = runScript()

    // The ::error:: annotation lands on stderr; GitHub Actions parses
    // it into a workflow-run annotation in the PR's "Checks" tab.
    // The `/m` flag is REQUIRED: JS RegExp's `$` (without `/m`)
    // matches end-of-input only — NOT the position before a trailing
    // `\n` (that's Perl-inherited behavior, which JS does not
    // implement). `echo` always emits a trailing `\n`, so without
    // `/m` the `$` anchor rejects the line and the regex fails.
    // Verified empirically with `node -e ...` (this assertion
    // matches `::error::...workflow.\n` with `/m`, fails without).
    expect(res.status).toBe(1)
    expect(res.stderr).toMatch(
      /^::error::npm ci mutated a package-lock\.json\..*$/m,
    )

    // The diff body lands on stdout EXACTLY once. Protects against
    // the duplicate-print regression this script just fixed — if a
    // future change reintroduces the print-during-if-then-print-
    // again-after pattern, the test fails here.
    const diffLines = res.stdout.match(/^diff --git a\//gm) ?? []
    expect(diffLines.length).toBe(1)
  })
})
