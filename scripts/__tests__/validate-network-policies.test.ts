/**
 * Lock the contract of `scripts/validate-network-policies.js` with two
 * fixtures so future refactors don't silently weaken or over-tighten
 * the validator. The tests exercise the validator as a black box via
 * child_process — same surface CI uses — instead of importing the
 * module, so we cover the YAML-normalization + spawn shell as well.
 */
import { spawnSync } from "child_process"
import * as crypto from "node:crypto"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const VALIDATOR = path.resolve(__dirname, "..", "validate-network-policies.js")

// Minimal valid fixture — two NetworkPolicy docs covering all 7
// invariants in the PASS direction. The first exercises the
// namespace-wide DNS shape (invariants 1, 2, 3, 4, 6). The second
// exercises the per-app ingress requirement that the first doc
// can't, because {podSelector: {}} doesn't reference any `app:`
// label (invariants 5, 7). If any future refactor weakens or
// drops one of these checks, this fixture trips the unit test
// rather than relying solely on the production CI run against
// k8s/70-network-policies.yaml.
//
//   1. kind=NetworkPolicy ✓ (both docs)
//   2. apiVersion=networking.k8s.io/v1 ✓ (both docs)
//   3. unique non-empty metadata.name ✓
//   4. metadata.namespace=xstreamroll ✓ (both docs)
//   5. allow-list of podSelector.matchLabels.app values ✓ (`api` is
//      documented; the allow-list check only fires for `allow-api-ingress`)
//   6. DNS egress to kube-system opens BOTH UDP + TCP port 53 ✓
//   7. every documented `app:*` label has at least one INGRESS
//      allow policy scoped to it ✓ (`allow-api-ingress` self-covers
//      `app: api` via its own podSelector + Ingress policyTypes + ingress body)
const VALID_YAML = `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: xstreamroll
spec:
  podSelector: {}
  policyTypes: ["Egress"]
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-ingress
  namespace: xstreamroll
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: app
      ports:
        - protocol: TCP
          port: 3001
`

// Single-violation fixture — an unknown `app:` label, which trips
// invariant #5 (allow-list) regardless of the other fields. We pin
// the EXACT error line so a future formatter tweak can't silently
// drift the contract.
const INVALID_YAML = `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-bogus-egress
  namespace: xstreamroll
spec:
  podSelector:
    matchLabels:
      app: bananarama
  policyTypes: ["Egress"]
  egress:
    - ports:
        - protocol: TCP
          port: 80
`

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
}

function runValidator(yaml: string): RunResult {
  const tmpFile = path.join(
    os.tmpdir(),
    // `crypto.randomUUID()` produces an RFC 4122 v4 UUID; the probability
    // of collision across concurrent jest workers is effectively zero
    // regardless of pid + clock granularity. Replaces `process.pid +
    // Date.now()`, which raced in parallel workers when two tests within
    // one millisecond produced identical filenames.
    `validator-fixture-${crypto.randomUUID()}.yaml`,
  )
  fs.writeFileSync(tmpFile, yaml)
  try {
    const result = spawnSync(process.execPath, [VALIDATOR, tmpFile], {
      encoding: "utf-8",
    })
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    }
  } finally {
    // The temp file is owned by this test (we just wrote it), so
    // unlinkSync without a swallow-catch is the right shape: if cleanup
    // fails (disk full, permission drift), the test runner surfaces the
    // error rather than silently leaking fixture files.
    fs.unlinkSync(tmpFile)
  }
}

describe("scripts/validate-network-policies.js", () => {
  it("exits 0 on a minimal valid NetworkPolicy fixture", () => {
    const res = runValidator(VALID_YAML)
    expect(res.status).toBe(0)
    expect(res.stderr).toBe("")
  })

  it("exits 1 with the documented allow-list error for an unknown app label", () => {
    const res = runValidator(INVALID_YAML)
    expect(res.status).toBe(1)
    // Exact pin: a future reformat must not quietly change this string,
    // otherwise downstream tools that grep the validator's stderr would
    // break. The full allow-list is asserted so renaming or trimming the
    // labels trips the test too.
    const expectedLine =
      'allow-bogus-egress: podSelector.matchLabels.app="bananarama" ' +
      "is not in the documented allow-list " +
      "(api, app, processing, postgres, redis, jaeger)"
    expect(res.stderr).toContain(expectedLine)
  })
})
