# 8. Evaluate Replacing the Polling Loop with a Message Queue

## Status

Proposed — see also [ADR-0003 polling-based processing](./0003-polling-based-processing.md).
This ADR evaluates the migration path; it does **not** mandate the change.

## Context

[ADR-0003](./0003-polling-based-processing.md) introduced the polling loop
in `xstreamroll-processing` because building on top of a message broker
was deemed too heavy for the team's deployment footprint at the time.
Polling has worked — but as the platform has shifted towards streaming
data for creator pipelines, the trade-offs are no longer favouring
polling:

- The `POLL_INTERVAL_MS` ceiling dominates end-to-end latency. At the
  default ~1 s this contributes up to a full second of jitter onto
  every event before processing even starts.
- `GET /streams/pending` traffic remains constant even when no streams
  are active, multiplying load on the API server. Multi-worker
  deployments (the reason [ADR-0003](./0003-polling-based-processing.md)
  was paired with `PostgresLockManager`) make that baseline worse.
- Operational dashboards conflate "no events" with "event-loop
  healthy". A push-based pipeline surfaces real-time delivery state
  directly on the broker.
- Recovery from worker failure is currently cooperative (TTL +
  heartbeat). A queue absorbs work-in-progress without extra plumbing.

This ADR enumerates the candidate architectures, their costs, the
migration phases, and the concrete signals we should look for before
committing to a change.

## Options Considered

### A. Keep polling, tune harder (#404 alt)

- Reduces jitter from `POLL_INTERVAL_MS` to ~100 ms at the cost of
  10× more API requests.
- Still bounded by the network round-trip.
- No improvement in baseline traffic when idle.

### B. Redis Streams as inbox

- Each API instance publishes new events to a single Redis stream
  (`XADD`) and the worker(s) consume via `XREADGROUP` with consumer
  groups for horizontal scaling.
- Single new dependency (Redis) already present for caching and rate
  limits — degrades to "we already run this in prod".
- Acknowledgement model means events are not lost on a worker crash
  mid-batch; no Postgres `INSERT … ON CONFLICT` dance required for
  leader election.
- Downside: introduces a second delivery channel — the API still has
  to decide whether the event was *truly* delivered to a worker.
- Throughput ceiling sits at single-digit-thousand events/sec per
  Redis instance; good for the next phase, not for infinite scale.

### C. NATS / JetStream

- Subject-based routing and at-least-once semantics.
- Pure pub/sub with stream-replay — replay of historical events is a
  first-class feature (`StreamEventRecord` becomes free).
- Higher operational complexity than Redis (no evolving Cloud
  Native path, no managed offering on every cloud).
- Excellent fit if/when we add WebSocket fan-out back to the SDK
  (issue #34 follow-up), since NATS subjects compose naturally.

### D. Apache Kafka

- Renowned durability and partitioning.
- Heaviest ops burden — ZooKeeper or KRaft, broker sizing, schema
  registry, monitoring surface.
- Likely overkill for the next 12 months.

### E. PostgreSQL `LISTEN`/`NOTIFY`

- Zero new infrastructure: the API posts a `NOTIFY` whenever a new
  pending event is committed; workers `LISTEN` and pull on wake.
- Already runs in the prod stack.
- Drops cross-region replication — LISTEN only fires in the connected
  database and is not a durable transport (the message is lost when
  the session ends, before it lands in `stream_events`).
- Useful intermediate step but not a destination.

## Recommendation

Adopt Option B (Redis Streams) as the next milestone and leave C/D on
the shelf until the throughput envelope changes.

**Why now**
- Replay (issue #396) and the SDK pagination helper work better when
  events are addressable by an offset or timestamp — Redis stream IDs
  give us that for free.
- We already run Redis for rate limiting and cache (`@nestjs/cache-manager`).
- `consumer groups` give us horizontal scaling with no extra leader
  election ceremony — `PostgresLockManager` (issue #216) can shrink
  from "required for correctness" to "kept for the in-process worker
  in tests".

**Why not Kafka yet**
- Operational burden is the dominant cost; cost increase is not
  justified at current scale.
- We can migrate from Redis Streams to Kafka later if volume grows —
  both share the same `StreamEventRecord` shape and at-least-once
  semantics, so the swap is a transport-only change.

**Phased migration**

1. **Hidden behind a feature flag.** A new processing entry point
   subscribes to `xstreamroll:events` while the polling loop keeps
   running. Compare `eventsProcessedCount` between the two paths to
   verify parity.
2. **Workers shed coordinator code.** When the queue path is stable
   enough, `SessionRegistry` falls back to `MemoryLockManager` and
   `PostgresLockManager` becomes a small optional layer used only by
   side-car tools that still need per-stream ownership.
3. **Polling loop deprecation.** Flip the feature flag default to
   "queue", keep the polling loop on for one release run as a
   parachute.
4. **API publishes in addition to (and after) writing to
   `stream_events`.** Transactional outbox or "POST then publish"
   pattern — whichever we can run cheaply today — so the queue never
   becomes the source of truth the API is unaware of.

**Signals to revisit this ADR earlier**
- `POLL_INTERVAL_MS` < 250 ms is required by a downstream consumer;
- Steady-state API requests from the worker exceed 5 % of total API
  traffic;
- A second team needs per-stream real-time fan-out and is building
  the same hack on top of `stream_events`.

## Consequences

- **Latency:** worst-case event delivery drops from `POLL_INTERVAL_MS`
  to sub-50 ms.
- **Throughput:** removes the polling-induced `GET /streams/pending`
  traffic from the API at idle.
- **Ops:** adds one Redis dependency we must monitor (but already
  operate in production). Loss of Redis degrades to the polling
  fallback, not to a hard outage.
- **Backward compatibility:** the `stream_events` table stays the
  source of truth. The replay endpoint and SDK pagination helper
  continue to read from it without change.
- **Code:** `xstreamroll-processing` will gain a new entry point; the
  polling entry point is preserved behind the fallback flag and
  removed in a follow-up release.

## References

- Issue #404 — original request to evaluate polling→message-queue
- Issue #396 — stream event replay API (independent but benefits
  from queue offsets)
- [ADR-0003 polling-based processing](./0003-polling-based-processing.md)
- [ADR-0001 NestJS](./0001-use-nestjs.md) for the WebSocket
  integration direction
