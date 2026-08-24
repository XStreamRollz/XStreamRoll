import { Injectable, OnModuleInit } from "@nestjs/common"
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
  Registry,
} from "prom-client"

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry()

  readonly httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "path", "status_code"],
    registers: [this.registry],
  })

  readonly httpRequestDurationSeconds = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "path", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  })

  readonly websocketConnectionsTotal = new Counter({
    name: "websocket_connections_total",
    help: "Total number of WebSocket connections established",
    registers: [this.registry],
  })

  readonly websocketActiveConnections = new Gauge({
    name: "websocket_active_connections",
    help: "Current number of active WebSocket connections",
    registers: [this.registry],
  })

  // Issue #328: PostgreSQL connection pool metrics
  readonly dbPoolActive = new Gauge({
    name: "db_pool_active_connections",
    help: "Number of active (checked-out) PostgreSQL connections",
    registers: [this.registry],
  })

  readonly dbPoolIdle = new Gauge({
    name: "db_pool_idle_connections",
    help: "Number of idle PostgreSQL connections in the pool",
    registers: [this.registry],
  })

  readonly dbPoolWaiting = new Gauge({
    name: "db_pool_waiting_requests",
    help: "Number of queued requests waiting for a PostgreSQL connection",
    registers: [this.registry],
  })

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry })
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics()
  }

  get contentType(): string {
    return this.registry.contentType
  }
}
