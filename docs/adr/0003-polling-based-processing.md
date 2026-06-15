# 3. Polling-Based Stream Processing

## Status

Accepted

## Context

The stream processing worker (`xstreamroll-processing`) must retrieve pending stream events and process them in real-time. Traditional architectures for background jobs use dedicated message brokers or queues (like RabbitMQ, Apache Kafka, or Redis-backed bull). However, deploying and managing an external message broker adds significant operational overhead, extra system dependencies, and increases local development setup complexity.

## Decision

We will implement a polling-based pull architecture for our background stream processing worker. The worker daemon runs a continuous loop that periodically fetches pending stream events from the API backend via HTTP (`GET /streams/pending`).

Key mechanics of the design:

- **Sequential Polling**: The worker requests events, processes them, and sleeps for a configurable `POLL_INTERVAL_MS` before polling again. This prevents overlapping polls if the API call takes longer than the interval.
- **Local Flow Control & Capacity**: The worker tracks active sessions and matches them against `MAX_CONCURRENT_SESSIONS`. If the worker is at capacity, it drops excess events and throttles work, protecting itself from memory exhaustion.
- **Worker Autonomy**: Processing status is reported back to the API via standard HTTP POST requests (`POST /streams/processed`).

## Consequences

- **Minimal Infrastructure**: No message broker is required. The system runs fully with only the NestJS API, PostgreSQL database, and the Node.js processor.
- **Robust Error Recovery**: If a worker crashes or network connectivity is briefly lost, pending events remain on the API server and will be fetched on the next successful poll.
- **Latency Overhead**: Polling introduces a latency delay equal to the polling interval (e.g., if the interval is 5000ms, an event may wait up to 5 seconds before a worker fetches it).
- **API Traffic**: Periodic HTTP requests generate constant noise and minor load on the API server even when no streams are active. This is acceptable for current usage but may require a push-based model (e.g. WebSockets or gRPC) as scaling requirements grow.
