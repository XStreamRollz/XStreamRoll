# 8. Horizontal Worker Scaling via Distributed Lock Manager

## Status

Accepted

## Context

The stream processing worker (`xstreamroll-processing`) runs as a single process in production, periodically polling the API for pending stream events and spawning per-stream sessions. When multiple worker replicas are deployed (e.g., behind a Kubernetes `Deployment` with `replicas > 1`), each replica independently polls the same `/streams/pending` endpoint and attempts to process the same events. This produces two problems:

1. **Duplicate processing**: Two workers may both fetch the same pending event and try to route it to a session for the same stream, leading to duplicate publishes via `POST /streams/processed`.
2. **Resource waste**: Every worker occupies memory and CPU for stream sessions that another worker is already handling, reducing the effective capacity of the cluster.

The system needs a way for workers to coordinate — to claim exclusive ownership of a stream's event processing so that, at any given moment, exactly one worker is responsible for all events belonging to a particular stream.

## Decision

We will implement a **distributed lock manager** abstraction that the `SessionRegistry` consults before routing an event to a session. The lock manager provides atomic `acquire`, `renew`, and `release` operations keyed by `streamId`.

Two backends ship with the worker:

- **`MemoryLockManager`** (`LOCK_BACKEND=memory`, default) — an in-process `Map<string, LockEntry>` that uses JavaScript `setTimeout` for TTL-based auto-eviction. Behaviour is identical to the single-worker case when only one pod runs. Used by the unit and integration test suite so tests remain deterministic and DB-free.
- **`PostgresLockManager`** (`LOCK_BACKEND=postgres`) — a lightweight `stream_locks` table (bootstrapped by the worker itself via `install()`). Acquisition is a single atomic UPSERT:

  ```sql
  INSERT INTO stream_locks (stream_id, owner_id, owner_token, expires_at)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (stream_id) DO UPDATE
    SET owner_id    = EXCLUDED.owner_id,
        owner_token = EXCLUDED.owner_token,
        expires_at  = EXCLUDED.expires_at
    WHERE stream_locks.expires_at <= NOW()
       OR stream_locks.owner_id    = EXCLUDED.owner_id
  RETURNING owner_id, owner_token, expires_at
  ```

  PostgreSQL serialises concurrent writes to the same primary key, so exactly one worker wins the race and returns a row; all others see zero rows and skip the event. The `RETURNING` clause eliminates the need for a separate `SELECT` to confirm ownership.

Key design properties:

- **Lease-based (TTL)**: Every lock has a configurable `ttlMs` (default 30s). Workers must periodically renew locks (heartbeat) to maintain ownership. If a worker crashes without releasing, the lock auto-expires and another worker can claim the stream after the TTL elapses.
- **Re-entrant**: If the same worker already owns a lock for a stream (e.g., after a transient processing failure), `acquire` refreshes the existing token and returns it.
- **No external dependencies for single-worker deployments**: The in-memory backend is the default, so local development and CI do not require a running PostgreSQL instance for the lock table.

## Considered Alternatives

### Redis-backed distributed locks (Redlock)

Redis with the Redlock algorithm is a well-known distributed locking primitive. Several Node.js libraries implement it (e.g., `redislock`, `node-redlock`).

- **Why rejected**: The project does not currently run Redis. Adopting Redis solely for lock coordination adds a stateful dependency that must be deployed, monitored, and backed up. The PostgreSQL-backed lock manager leverages the existing database connection pool and requires no additional infrastructure.
- **Revisit trigger**: If the project adopts Redis for caching or Socket.IO adapter, the team should evaluate replacing `PostgresLockManager` with a Redis-based lock manager for lower latency.

### Advisory locks (`pg_advisory_lock`)

PostgreSQL provides session-level advisory locks via `pg_advisory_lock()` / `pg_advisory_unlock()`. These are deadlock-free and release automatically when the database connection drops.

- **Why rejected**: Advisory locks are **session-scoped** — they require a persistent connection per lock and block if the lock is held by another session. The worker's connection pool manages connections at the pool level, not per-stream. If a worker pod crashes, its database connections are dropped asynchronously (TCP timeout), leaving advisory locks held for an unpredictable duration. The UPSERT-based approach uses row-level locks that release immediately on commit and are visible through the pool.
- **Revisit trigger**: If lock acquisition latency becomes a bottleneck (> 10ms per acquire at scale) and the team is willing to manage per-lock connections.

### etcd / ZooKeeper

etcd and ZooKeeper provide strongly-consistent distributed coordination primitives (leases, ephemeral nodes). They are the standard choice for Kubernetes-native leader election.

- **Why rejected**: Overkill for the current use case. The system only needs per-stream locking for event processing, not service discovery, configuration management, or cluster membership. The lock TTL is measured in seconds, not milliseconds, so the strong consistency guarantees of etcd/Raft are unnecessary. Adding either service would triple the project's infrastructure surface area.
- **Revisit trigger**: When the team needs a general-purpose coordination service for purposes beyond stream locking (e.g., configuration distribution, service mesh).

## Consequences

- **Horizontal scaling enabled**: Multiple worker replicas can share the processing load without duplicate work. Each stream is owned by at most one worker at a time.
- **Existing single-worker deployments unchanged**: With `LOCK_BACKEND=memory`, the lock manager is invisible to the polling loop and adds zero overhead.
- **No new infrastructure**: The PostgreSQL backend reuses the existing database connection and requires no additional services.
- **TTL tuning required**: Workers must renew locks frequently enough to prevent premature expiry. The heartbeat interval is currently hard-coded as `ttlMs / 3` in `SessionRegistry`. If the database is slow or the worker is CPU-starved, locks may expire prematurely, causing duplicate processing.
- **Fencing tokens**: The `owner_token` (a random UUIDv4) acts as a fencing token — a stale `release` from a previous lifecycle cannot accidentally drop a new lock because the token will not match.

## Revisit Conditions

This ADR should be revisited when any of the following conditions are met:

1. **Lock contention becomes a bottleneck** — if `stream_locks` UPSERT latency exceeds 10ms at the 99th percentile under the expected concurrent stream count.
2. **Adoption of Redis for other purposes** — consolidating lock coordination onto Redis may simplify the infrastructure.
3. **Requirement for sub-second failover** — the current default TTL of 30s means a crashed worker's streams are unavailable for up to 30 seconds. A faster failover may require a push-based eviction mechanism (e.g., WebSocket heartbeat with Kubernetes liveness probes).
4. **Multi-region deployment** — the PostgreSQL lock table is region-local by default. Cross-region locking would require global replication or a different coordination primitive.
