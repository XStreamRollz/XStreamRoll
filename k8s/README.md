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
- **Ingress** — `k8s/60-ingress.yaml`
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

`terminationGracePeriodSeconds` on every Deployment is ≥30s so the
worker's 15s graceful-shutdown hook has room to drain.

## Non-root security

- `app` and `processing` run as uid 1000 (`runAsNonRoot: true`),
  matching the `appuser`/`appgroup` users that already exist in their
  Dockerfiles.
- The published API image does not yet drop privileges; the manifest
  therefore permits root with a comment to harden it upstream.

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
