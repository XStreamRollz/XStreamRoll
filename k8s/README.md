# Kubernetes manifests — issue #217

This directory contains the deployable Kubernetes manifests for the
XStreamRoll platform. They cover the four runtime components of the
monorepo (`api`, `app`, `xstreamroll-processing`) and a single-postgres
data store.

## What this PR ships

- **Namespace + ResourceQuota** — `k8s/00-namespace.yaml`
- **Postgres StatefulSet** (1 replica, 10Gi PVC, init script loaded from `database/schema.sql`) — `k8s/10-postgres.yaml`
- **API Deployment** (NestJS) — `k8s/20-api.yaml`
- **App Deployment** (Next.js) — `k8s/30-app.yaml`
- **Processing Deployment** (Node worker) — `k8s/40-processing.yaml`
- **Ingress** (TLS via cert-manager — issue #325) — `k8s/60-ingress.yaml`
- **cert-manager ClusterIssuers** (self-signed + Let's Encrypt staging) — `k8s/50-cert-issuer.yaml`
- **Kustomize entrypoint** — `k8s/kustomization.yaml`

Container images are published by `.github/workflows/release.yml` to:

| Component | Image |
|-----------|-------|
| api       | `ghcr.io/xstreamrollz/xstreamroll-api` |
| app       | `ghcr.io/xstreamrollz/xstreamroll-app` |
| processing | `ghcr.io/xstreamrollz/xstreamroll-processing` |

## Health probes

| Service    | Liveness  | Readiness  | Notes |
|------------|-----------|------------|-------|
| api        | `/livez`  | `/health`  | Readiness pings Postgres; liveness is DB-free to avoid restart loops. |
| app        | `/api/health` | `/api/health` | Returns static `ok` payload; bypasses project middleware (matcher is `/dashboard/:path*`). |
| processing | `/livez`  | `/healthz` | Readiness flips to 503 the moment `GracefulShutdown` flips `shuttingDown=true`. |

`terminationGracePeriodSeconds` on every Deployment is ≥60s so the
worker's 15s graceful-shutdown hook has room to drain.

### Processing worker shutdown timing

| Phase | Duration | Notes |
|-------|----------|-------|
| `preStop` sleep | 5s | Delays SIGTERM delivery via `sleep 5` |
| GracefulShutdown | 15s | Code drain in `src/lifecycle.ts` |
| Readiness fail window | 30s | `failureThreshold: 6` × `periodSeconds: 5` |
| Total drain budget | 20s | 5s + 15s — within the 60s grace period |
| `terminationGracePeriodSeconds` | 60s | Hard limit before SIGKILL |

## Non-root security

- `app` and `processing` run as uid 1000 (`runAsNonRoot: true`),
  matching the `appuser`/`appgroup` users that already exist in their
  Dockerfiles.
- The published API image does not yet drop privileges; the manifest
  therefore permits root with a comment to harden it upstream.

## TLS / cert-manager (issue #325)

The cluster MUST have [cert-manager](https://cert-manager.io/docs/installation/) installed before the Ingress can mint a real certificate. If cert-manager is missing, the Ingress will produce a `Ready: False` condition with reason `IssuerNotFound`.

Two ClusterIssuers ship by default (`k8s/50-cert-issuer.yaml`):

| Issuer | Use |
|--------|-----|
| `selfsigned-issuer` | Local clusters without public DNS — mints an untrusted cert so the rest of the stack can be exercised end-to-end. Use this while developing against `minikube`/`kind`. |
| `letsencrypt-staging` | Preview / staging clusters where the hostname resolves publicly but a production-signed cert is not desired. |
| `letsencrypt-prod` | **Commented out by default.** Enable only after `ops@example.com` is replaced in `k8s/50-cert-issuer.yaml` and DNS for `spec.rules[0].host` resolves to the Ingress controller. |

The Ingress picks the issuer through this annotation:

```yaml
cert-manager.io/cluster-issuer: letsencrypt-staging
```

Switch to `selfsigned-issuer` for local development (no DNS / no ACME account), or `letsencrypt-prod` for real production.

### Enabling the production issuer

1. Replace `ops@example.com` with a real ops mailbox in `k8s/50-cert-issuer.yaml`.
2. Uncomment the `letsencrypt-prod` ClusterIssuer block.
3. Apply: `kubectl apply -f k8s/50-cert-issuer.yaml`.
4. Update `k8s/60-ingress.yaml`'s annotation to `cert-manager.io/cluster-issuer: letsencrypt-prod`.
5. Verify the cert was minted:

   ```bash
   kubectl -n xstreamroll get certificate
   kubectl -n xstreamroll describe certificate xstreamroll.example.com-tls
   ```

### Hostname placeholders

The Ingress ships with `xstreamroll.example.com` as a placeholder host so the manifest loads cleanly without a real DNS name. `SPEC.rules[0].host`, `spec.tls[0].hosts[0]`, and `spec.tls[0].secretName` MUST be replaced together before applying in any real cluster — the comments above each field are tagged `REPLACE-ME` so `grep -n REPLACE-ME k8s/60-ingress.yaml` finds the three lines.

### Verification

`k8s/30-app.yaml`'s `/api/health` readiness probe runs over the **cluster-internal** HTTP path and is unaffected by this PR. Confirm the public-facing TLS by hitting the host from outside the cluster:

```bash
curl -vI https://xstreamroll.example.com/api/health 2>&1 | grep -E '^< (HTTP|Location)'
```

The response must be `HTTP/2 200`. A `301` to the HTTPS URL confirms `ssl-redirect` is active; a cleartext `HTTP 200` indicates the issuer or annotation is misconfigured.

## Secrets

`k8s/10-postgres.yaml` and `k8s/20-api.yaml` commit Secret **templates**
using `stringData:` with `CHANGEME-*` placeholders. You MUST substitute
real credentials before applying these in any environment that matters.

Recommended workflow for non-development environments:

```bash
# Create the Postgres secret in your cluster.
kubectl -n xstreamroll create secret generic postgres-credentials \
  --from-literal=POSTGRES_DB=xstreamroll \
  --from-literal=POSTGRES_USER=xstreamroll \
  --from-literal=POSTGRES_PASSWORD="$(openssl rand -base64 32)" \
  --from-literal=DATABASE_URL="postgresql://xstreamroll:$(openssl rand -base64 32)@postgres:5432/xstreamroll" \
  --dry-run=client -o yaml | kubectl apply -f -

# Create the API secret.
kubectl -n xstreamroll create secret generic api-secrets \
  --from-literal=DATABASE_URL="postgresql://xstreamroll:$(kubectl -n xstreamroll get secret postgres-credentials -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)@postgres:5432/xstreamroll" \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
  --from-literal=STREAM_API_KEY="$(openssl rand -hex 24)" \
  --dry-run=client -o yaml | kubectl apply -f -
```

For production, prefer External Secrets Operator or Sealed Secrets so
plaintext values never leave your secret manager.

## Deploying a specific version

The manifests in this directory use `0.0.0-dev` as a placeholder tag for
local development. **Never apply this to a real environment.** Every
production or staging deploy must pin images to a specific, immutable tag
produced by the release workflow.

The release workflow (`.github/workflows/release.yml`) pushes two tags per
release:

| Tag format | Example | Use |
|---|---|---|
| Semver | `v1.2.3` | Human-readable, used for rollbacks |
| Short SHA | `sha-abc1234` | Immutable, used for precise rollback |
| `latest` | `latest` | Convenience alias — **do not use in manifests** |

### Deploying by semver tag

```bash
VERSION=v1.2.3   # semver tag from the GitHub release

kustomize edit set image \
  ghcr.io/xstreamrollz/xstreamroll-api:${VERSION} \
  ghcr.io/xstreamrollz/xstreamroll-app:${VERSION} \
  ghcr.io/xstreamrollz/xstreamroll-processing:${VERSION}

kubectl apply -k k8s/
```

### Deploying by commit SHA (recommended for production)

```bash
SHA=sha-abc1234   # short SHA tag from the release workflow

kustomize edit set image \
  ghcr.io/xstreamrollz/xstreamroll-api:${SHA} \
  ghcr.io/xstreamrollz/xstreamroll-app:${SHA} \
  ghcr.io/xstreamrollz/xstreamroll-processing:${SHA}

kubectl apply -k k8s/
```

### Rolling back

```bash
# Roll back the API to the previous semver
PREVIOUS=v1.2.2
kustomize edit set image ghcr.io/xstreamrollz/xstreamroll-api:${PREVIOUS}
kubectl apply -k k8s/

# Or use kubectl rollout undo for a quick in-cluster rollback
kubectl -n xstreamroll rollout undo deployment/api
```

## Applying

### With Kustomize (recommended)

```bash
kubectl apply -k k8s/
```

This builds the manifests from `k8s/*.yaml`, injects the `postgres-init`
ConfigMap from `database/schema.sql`, and applies every resource.

### Without Kustomize

If your cluster does not have Kustomize, apply the YAML files in order:

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/10-postgres.yaml
kubectl apply -f k8s/20-api.yaml
kubectl apply -f k8s/30-app.yaml
kubectl apply -f k8s/40-processing.yaml
kubectl apply -f k8s/50-cert-issuer.yaml
kubectl apply -f k8s/60-ingress.yaml

# Build the init ConfigMap yourself. With `disableNameSuffixHash: true`
# in the Kustomization, Kustomize emits a ConfigMap literally named
# `postgres-init` — the same name the StatefulSet's volume mount
# references — so this manual `kubectl create` produces the exact
# same runtime resource as `kubectl apply -k k8s/`.
kubectl -n xstreamroll create configmap postgres-init \
  --from-file=schema.sql=database/schema.sql \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Verifying the rollout

```bash
kubectl -n xstreamroll get pods
kubectl -n xstreamroll wait --for=condition=ready pod -l app=api --timeout=120s
kubectl -n xstreamroll wait --for=condition=ready pod -l app=app --timeout=120s
kubectl -n xstreamroll wait --for=condition=ready pod -l app=postgres --timeout=120s

# Probe the API liveness endpoint inside the cluster:
kubectl -n xstreamroll exec deploy/api -- wget -q -O - http://localhost:3001/livez

# Probe the worker readiness endpoint:
kubectl -n xstreamroll exec deploy/processing -- wget -q -O - http://localhost:3002/healthz

# Probe the Ingress TLS endpoint (issue #325):
curl -vI https://xstreamroll.example.com/api/health
```

## Release process

Images are published by `.github/workflows/release.yml` and are restricted
to commits that live on `main`. Pushing a `v*.*.*` tag from any other branch
is rejected before any build step runs.

### Cutting a release

1. Merge all changes to `main` and ensure CI is green.
2. Create and push a semver tag from `main`:

   ```bash
   git checkout main && git pull
   git tag v1.2.3
   git push origin v1.2.3
   ```

3. The release workflow runs the `verify-branch` job to confirm the tag
   is on `main`, then builds and pushes three images under the `production`
   GitHub environment (which requires reviewer approval if configured).

4. Each image receives two immutable tags:
   - `v1.2.3` — semver
   - `sha-<short>` — commit SHA for precise identification

   A `latest` convenience alias is also pushed but **must not be used in
   Kubernetes manifests**.

5. Build provenance attestations are attached to every image via
   `actions/attest-build-provenance`. Verify an image's attestation with:

   ```bash
   gh attestation verify \
     oci://ghcr.io/xstreamrollz/xstreamroll-api:v1.2.3 \
     --repo OlaGreat/XStreamRoll
   ```

## Acceptance criteria mapping

| Issue #217 criterion | Where it lands |
|----------------------|----------------|
| Deployments use published Docker images | `image:` in `20-api.yaml`, `30-app.yaml`, `40-processing.yaml` (all pinned to `ghcr.io/xstreamrollz/xstreamroll-*:latest`). |
| Implement health-check endpoints | `/livez` on api, `/api/health` on app, `/livez`+`/healthz` on processing worker. Tests in `xstreamroll-processing/__tests__/metrics.test.ts`. |
| Correct separation of ConfigMaps and Secrets | `ConfigMap` resources for `NODE_ENV`, `CORS_ORIGIN`, `PORT`, `API_URL`, etc. `Secret` resources exclusively for `DATABASE_URL`, `JWT_SECRET`, `STREAM_API_KEY`. |
| Define resource requests/limits | Every container has `resources.requests` + `resources.limits`. |
| DB credentials not hardcoded | `DATABASE_URL` is sourced from Secret refs (`secretKeyRef` / `secretRef`); only `CHANGEME-*` placeholders committed. |
| **Issue #325 — Ingress TLS** | `k8s/60-ingress.yaml` `spec.tls` + `cert-manager.io/cluster-issuer` annotation, `k8s/50-cert-issuer.yaml` ClusterIssuers, `kustomization.yaml` wires the issuer into the build, `k8s/README.md` documents the rotation. |
