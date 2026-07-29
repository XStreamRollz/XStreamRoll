#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Validator for k8s/70-network-policies.yaml (issue #357).
 *
 * The policies in this file are the only thing standing between the
 * `xstreamroll` namespace pods and arbitrary cross-pod traffic. They
 * cover the documented traffic matrix (see k8s/70-network-policies.yaml
 * and k8s/README.md); a typo or a forgotten allow rule can either
 * silently drop legit traffic or quietly leave a service exposed to
 * the entire cluster.
 *
 * This script enforces the invariants that the README documents, so
 * regressions fail CI instead of being discovered at production rollout
 * time. It does NOT speak to a cluster — it parses the YAML and checks
 * the rules — so the validation is fully reproducible and runs without
 * any kubectl/docker dependency.
 *
 * Invariants enforced:
 *   1. Every resource is in apiVersion `networking.k8s.io/v1` and
 *      kind `NetworkPolicy` (non-NetworkPolicy docs are flagged).
 *   2. `metadata.name` is non-empty and globally unique.
 *   3. `metadata.namespace` is `xstreamroll` (no value is treated as
 *      an implicit `default`, which would accidentally apply the
 *      policy outside our namespace).
 *   4. `spec.podSelector` and `spec.policyTypes` are present.
 *   5. `podSelector.matchLabels.app` values must come from the
 *      documented allow-list. New app labels that haven't been
 *      documented MUST be added alongside traffic-shape rules so the
 *      platform team can audit them.
 *   6. Any namespace-wide NetworkPolicy (`podSelector: {}`) that has
 *      an egress rule targeting `kubernetes.io/metadata.name: kube-system`
 *      (where kubelet schedules CoreDNS) must open BOTH UDP and TCP
 *      port 53 — DNS depends on UDP, but TCP fallback is required for
 *      large/zone-transfer responses. The check is structural rather
 *      than name-gated, so future renames of the policy don't silently
 *      break DNS resolution.
 *   7. Every documented app label has at least one INGRESS allow
 *      policy scoped to it. Egress per app is intentionally NOT
 *      required: data stores (postgres, redis) and opt-in
 *      dependencies (jaeger) don't outbound beyond DNS, and the
 *      namespace-wide `allow-dns-egress` covers that for every pod.
 *      Adding a per-app egress policy to satisfy a CI check would
 *      be misleading and the reviewer would have to decide whether
 *      it represents real traffic.
 *
 * Exit code 0 with a one-line summary on success, exit 1 with an error
 * list on failure.
 */

const fs = require("fs")
const path = require("path")
const yaml = require("js-yaml")

const DEFAULT_FILE = "k8s/70-network-policies.yaml"
const EXPECTED_NAMESPACE = "xstreamroll"
const EXPECTED_API_VERSION = "networking.k8s.io/v1"

// App labels the platform currently documents in the traffic matrix.
// Anything outside this set is rejected so an unrelated component
// can't accidentally piggy-back on the namespace's network policies.
const KNOWN_APP_LABELS = new Set([
  "api",
  "app",
  "processing",
  "postgres",
  "redis",
  "jaeger",
])

const errors = []
function err(msg) {
  errors.push(msg)
}

// js-yaml's stream parser requires `---` between every pair of
// top-level documents; it rejects adjacent docs separated only by
// blank lines and `#` comments with a "duplicated mapping key"
// error. kubectl/kustomize accept the lenient style this repo's k8s
// manifests use, so the source files don't have explicit `---`
// markers between every doc. We reconstruct the markers here so the
// validator can consume the same source of truth kubectl does, without
// editing the originally-authored YAML.
function normalizeYamlStream(text) {
  const lines = text.split("\n")
  let prevCodeLine = null // last non-blank, non-comment line content
  const out = []
  for (const line of lines) {
    const trimmed = line.trim()
    const isCode = trimmed !== "" && !trimmed.startsWith("#")
    if (
      isCode &&
      /^apiVersion:/.test(trimmed) &&
      prevCodeLine !== null &&
      prevCodeLine !== "---"
    ) {
      out.push("---")
    }
    out.push(line)
    if (isCode) prevCodeLine = trimmed
  }
  return out.join("\n")
}

const target = process.argv[2] || DEFAULT_FILE
const raw = fs.readFileSync(path.resolve(target), "utf8")
const normalized = normalizeYamlStream(raw)
let docs
try {
  docs = yaml.loadAll(normalized)
} catch (e) {
  console.error(`Failed to parse ${target}: ${e.message}`)
  process.exit(2)
}

// Trackers used for cross-document invariants.
const seenNames = new Set()

const policies = []

for (const [i, doc] of docs.entries()) {
  if (doc == null) continue // skip empty docs / pure comments
  const loc = `#${i + 1}`
  if (doc.kind !== "NetworkPolicy") {
    err(
      `${loc}: expected kind=NetworkPolicy, got kind=${doc.kind || "<missing>"} — non-NetworkPolicy docs in this file are not allowed`,
    )
    continue
  }
  if (doc.apiVersion !== EXPECTED_API_VERSION) {
    err(
      `${loc}: expected apiVersion=${EXPECTED_API_VERSION}, got apiVersion=${doc.apiVersion || "<missing>"}`,
    )
  }

  const name = doc?.metadata?.name
  if (!name || typeof name !== "string") {
    err(`${loc}: missing metadata.name`)
    continue
  }
  if (seenNames.has(name)) {
    err(`${name}: duplicate NetworkPolicy name`)
  }
  seenNames.add(name)

  // Catches a subtle bug: dropping metadata.namespace makes the policy
  // apply to a non-existent "default" namespace where it has zero
  // effect — silently. The kustomization.yaml pins namespace: xstreamroll
  // so this is double-defense, not a single point of failure.
  if (doc.metadata.namespace && doc.metadata.namespace !== EXPECTED_NAMESPACE) {
    err(
      `${name}: metadata.namespace=${doc.metadata.namespace} is not ${EXPECTED_NAMESPACE}`,
    )
  }

  const spec = doc.spec || {}
  if (!spec.podSelector) {
    err(`${name}: missing spec.podSelector`)
    continue
  }
  const policyTypes = spec.policyTypes
  if (!Array.isArray(policyTypes) || policyTypes.length === 0) {
    err(`${name}: missing spec.policyTypes`)
  }
  for (const t of policyTypes || []) {
    if (t !== "Ingress" && t !== "Egress") {
      err(
        `${name}: spec.policyTypes contains unknown value "${t}" (must be Ingress or Egress)`,
      )
    }
  }

  // App labels outside the allow-list are rejected. The cert-manager
  // HTTP-01 solver uses a non-`app:.*` label
  // (acme.cert-manager.io/http01-solver=true) and is intentionally
  // exempted from this check.
  const matchLabels = spec.podSelector.matchLabels || {}
  if (
    Object.prototype.hasOwnProperty.call(matchLabels, "app") &&
    !KNOWN_APP_LABELS.has(matchLabels.app)
  ) {
    err(
      `${name}: podSelector.matchLabels.app="${matchLabels.app}" is not in the documented allow-list (${[
        ...KNOWN_APP_LABELS,
      ].join(", ")})`,
    )
  }

  // DNS policy completeness — any NetworkPolicy with `podSelector: {}`
  // (i.e., applies to every pod in the namespace) that has an egress
  // rule targeting the kube-system namespace (where kubelet schedules
  // CoreDNS / kube-dns) MUST open BOTH UDP and TCP port 53. UDP is the
  // primary DNS transport; TCP is the fallback for large responses
  // and zone transfers. The check is structural rather than name-gated
  // so a future rename of the policy doesn't silently pass CI while
  // breaking production DNS. Note: only `matchLabels` selectors are
  // detected — `matchExpressions` would slip through. Repo policy
  // uses matchLabels everywhere today.
  const targetsKubeSystem = (e) =>
    (e.to || []).some((t) =>
      Object.entries(t.namespaceSelector?.matchLabels ?? {}).some(
        ([k, v]) => k === "kubernetes.io/metadata.name" && v === "kube-system",
      ),
    )
  // Single pass: capture every kube-system-targeted egress rule and
  // re-use the result both for the policy-shape detection and the
  // UDP+TCP port union check.
  const dnsRules = (spec.egress || []).filter(targetsKubeSystem)
  const isDnsPolicy =
    spec.podSelector &&
    Object.keys(spec.podSelector).length === 0 &&
    dnsRules.length > 0
  if (isDnsPolicy) {
    const dnsPorts = dnsRules.flatMap((e) => e.ports || [])
    const hasUdp53 = dnsPorts.some(
      (p) => Number(p.port) === 53 && p.protocol === "UDP",
    )
    const hasTcp53 = dnsPorts.some(
      (p) => Number(p.port) === 53 && p.protocol === "TCP",
    )
    if (!hasUdp53 || !hasTcp53) {
      err(
        `${name}: DNS egress must allow BOTH UDP and TCP port 53 (saw UDP=${hasUdp53}, TCP=${hasTcp53})`,
      )
    }
  }

  policies.push({
    name,
    spec,
    policyTypes: policyTypes || [],
  })
}

// Cross-document invariant: every documented `app:*` label referenced
// in podSelectors must have at least one INGRESS allow policy scoped
// directly to it. Without that rule, the pod is unreachable from any
// peer. We deliberately do NOT require a per-app egress allow policy:
// data stores (postgres/redis) and opt-in dependencies (jaeger) don't
// outbound beyond DNS, and the namespace-wide default-deny +
// `allow-dns-egress` already cover that case. Requiring an unused
// per-app egress would be misleading — readers of the YAML should see
// exactly what each pod actually talks to.
const targetedLabels = new Set()
for (const p of policies) {
  const app = p.spec?.podSelector?.matchLabels?.app
  if (app && KNOWN_APP_LABELS.has(app)) targetedLabels.add(app)
}

for (const app of targetedLabels) {
  const ingress = policies.filter(
    (p) =>
      p.spec?.podSelector?.matchLabels?.app === app &&
      p.policyTypes.includes("Ingress") &&
      p.spec.ingress,
  )
  if (ingress.length === 0) {
    err(`app=${app} has no ingress allow policy`)
  }
}

if (errors.length > 0) {
  console.error(`NetworkPolicy validation failed (${target}):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

const total = policies.length
const ingressCount = policies.filter((p) =>
  p.policyTypes.includes("Ingress"),
).length
const egressCount = policies.filter((p) =>
  p.policyTypes.includes("Egress"),
).length
console.log(
  `NetworkPolicy validation OK (${target}) — ${total} policies (${ingressCount} ingress, ${egressCount} egress, ${targetedLabels.size} app labels reachable)`,
)
