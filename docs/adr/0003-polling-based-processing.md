# 3. Polling-Based Stream Processing

## Status

Accepted

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

## Considered Alternatives

### Apache Kafka / Redpanda

Kafka is the industry standard for durable, ordered event streaming at scale. It would provide exactly-once semantics, log compaction, and replayability out of the box.

- **Why rejected**: Kafka requires a separate cluster (ZooKeeper / KRaft) to operate. For the current scale (single-team prototype, low event volume), the operational burden of running Kafka locally and in CI is disproportionate. Kafka's partitioning model also adds complexity: routing events to the correct partition by stream ID would require either a static partition count (inflexible) or a partitioning strategy that the team would need to design and test.
- **Revisit trigger**: When event throughput exceeds ~10k events/second or the team needs durable event replay for compliance/debugging.

### NATS

NATS is a lightweight, high-performance messaging system with built-in at-least-once delivery (JetStream) and a simpler deployment model than Kafka.

- **Why rejected**: Like Kafka, NATS adds a stateful infrastructure dependency. NATS JetStream requires persistent volumes for message storage. The simplicity advantage over Kafka is real but still exceeds the project's current operational budget (one PostgreSQL instance is already required). The team has deeper PostgreSQL expertise than NATS administration.
- **Revisit trigger**: When the team grows to include dedicated infra engineers or when low-latency (< 100ms) event delivery becomes a hard requirement.

### Redis Pub/Sub + Bull Queue

Redis-backed queues (Bull, BullMQ) provide a familiar job-queue abstraction with zero additional servers if Redis is already in the stack. Redis Pub/Sub alone lacks persistence.

- **Why rejected**: The project does not currently run Redis. Adding Redis solely for the worker queue would duplicate persistence responsibilities with PostgreSQL (which already stores events) and add another cache invalidation surface. Bull's scheduling features (rate limiting, job chaining) are powerful but unused at current scale.
- **Revisit trigger**: If the project adopts Redis for caching or Socket.IO adapter needs, the team should re-evaluate consolidating the worker's event delivery onto Redis-backed BullMQ.

### RabbitMQ

RabbitMQ is a mature AMQP broker with flexible routing and good operational tooling.

- **Why rejected**: Like the other brokers, RabbitMQ is an additional stateful service. Its Erlang runtime and management UI add deployment surface area. The team's familiarity with SQL-based patterns makes PostgreSQL a better fit for the current stage.
- **Revisit trigger**: When fan-out routing to multiple worker types (e.g., a dedicated archive worker, a dedicated notification worker) becomes necessary.

## Consequences

- **Minimal Infrastructure**: No message broker is required. The system runs fully with only the NestJS API, PostgreSQL database, and the Node.js processor.
- **Robust Error Recovery**: If a worker crashes or network connectivity is briefly lost, pending events remain on the API server and will be fetched on the next successful poll.
- **Latency Overhead**: Polling introduces a latency delay equal to the polling interval (e.g., if the interval is 5000ms, an event may wait up to 5 seconds before a worker fetches it).
- **API Traffic**: Periodic HTTP requests generate constant noise and minor load on the API server even when no streams are active. This is acceptable for current usage but may require a push-based model (e.g. WebSockets or gRPC) as scaling requirements grow.
- **No Built-in Ordering Guarantees**: Unlike Kafka partitions, polling does not guarantee in-order delivery across worker restarts. The session-based processing model (events are routed to per-stream sessions) handles this at the application layer.

## Revisit Conditions

This ADR should be revisited when any of the following conditions are met:

1. **Event throughput exceeds 10k events/second** — polling overhead becomes non-trivial at this scale.
2. **Sub-100ms latency is required** — the polling interval imposes a hard floor on end-to-end latency.
3. **A second infrastructure engineer joins the team** — the operational budget can absorb a message broker.
4. **The team adopts Redis for another purpose** — consolidating onto BullMQ may reduce total infrastructure complexity.
5. **Multiple worker types emerge** — a notification worker, archive worker, or analytics worker would benefit from a shared broker with fan-out routing rather than competing over the same `/streams/pending` endpoint.
