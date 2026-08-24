# 3. Polling-Based Stream Processing

## Status

Accepted — superseded for new milestones by [ADR-0008 message-queue
replacement](./0008-message-queue-replacement.md). The polling loop
remains the production entry point of `xstreamroll-processing`;
[ADR-0008](./0008-message-queue-replacement.md) covers the proposed
queue migration.

## Context

The stream processing worker (`xstreamroll-processing`) must retrieve pending stream events and process them in real-time. Traditional architectures for background jobs use dedicated message brokers or queues (like RabbitMQ, Apache Kafka, or Redis-backed bull). However, deploying and managing an external message broker adds significant operational overhead, extra system dependencies, and increases local development setup complexity.

### Problem Statement

When a producer (e.g., the API server or an SDK client) publishes a stream event, the processing worker must pick it up, apply any registered filters, manage a per-stream session lifecycle, and report the result back to the API — all without the producer blocking on the processing outcome. The system needs a delivery mechanism that the worker can use to discover and claim pending work.

## Decision

We will implement a polling-based pull architecture for our background stream processing worker. The worker daemon runs a continuous loop that periodically fetches pending stream events from the API backend via HTTP (`GET /streams/pending`).

Key mechanics of the design:

- **Sequential Polling**: The worker requests events, processes them, and sleeps for a configurable `POLL_INTERVAL_MS` before polling again. This prevents overlapping polls if the API call takes longer than the interval.
- **Local Flow Control & Capacity**: The worker tracks active sessions and matches them against `MAX_CONCURRENT_SESSIONS`. If the worker is at capacity, it drops excess events and throttles work, protecting itself from memory exhaustion.
- **Worker Autonomy**: Processing status is reported back to the API via standard HTTP POST requests (`POST /streams/processed`).

### Recovery model

Polling is a "pull-from-truth" pattern, so recovery is implicit:

- **Worker crash mid-batch.** Pending events stay on the API server
  (`stream_events` row remains in the `pending` state) and are
  returned by the next poll. There is no separate acknowledgement
  queue to recover from.
- **Network blip between worker and API.** Identical to a worker
  crash; the row is returned by the next successful poll. The
  `POST /streams/processed` is idempotent on the server.
- **A stream stuck on one worker.** `PostgresLockManager`
  (issue #216) holds a per-stream lock with a 30 s TTL refreshed by
  a heartbeat. If the holder crashes the lock expires and the next
  worker's `acquire(streamId)` re-claims it on the following poll.

### Relationship to goroutine-style workers

The polling loop in the worker and the [ADR-0008 message-queue
replacement](./0008-message-queue-replacement.md) entry point are
designed to coexist behind a feature flag. That means a worker
running both paths in parallel during a migration can verify parity
via the `eventsProcessedCount` metric and shut down the polling loop
once the queue path keeps up.

## Consequences

- **Minimal Infrastructure**: No message broker is required. The system runs fully with only the NestJS API, PostgreSQL database, and the Node.js processor.
- **Robust Error Recovery**: If a worker crashes or network connectivity is briefly lost, pending events remain on the API server and will be fetched on the next successful poll.
- **Latency Overhead**: Polling introduces a latency delay equal to the polling interval (e.g., if the interval is 5000ms, an event may wait up to 5 seconds before a worker fetches it). Tunable to ~100 ms with a corresponding increase in API traffic.
- **API Traffic**: Periodic HTTP requests generate constant noise and minor load on the API server even when no streams are active. This is acceptable for current usage but may require a push-based model (e.g. WebSockets, gRPC, or a queue — see [ADR-0008](./0008-message-queue-replacement.md)) as scaling requirements grow.

## When to revisit

- `POLL_INTERVAL_MS < ~250 ms is required by a downstream consumer.
- The polling-induced `GET /streams/pending` traffic exceeds ~5 % of
  total API traffic in a steady-state baseline.
- A second consumer needs per-stream real-time fan-out and starts
  rebuilding the same plumbing on top of `stream_events`.

The replacement path is enumerated end-to-end in
[ADR-0008](./0008-message-queue-replacement.md).

## References

- [ADR-0008 message-queue replacement](./0008-message-queue-replacement.md)
- [ADR-0001 NestJS](./0001-use-nestjs.md) — outlines the WebSocket
  layer the queue migration should integrate with
- Issue #216 — PostgresLockManager added for horizontal worker scaling
