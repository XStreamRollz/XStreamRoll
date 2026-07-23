import { Logger, Optional } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets"
import type { Server, Socket } from "socket.io"
import { MetricsService } from "../metrics/metrics.service"
import {
  NOTIFICATION_EVENTS,
  NotificationCreatedPayload,
  STREAM_EVENTS,
  StreamErrorPayload,
  StreamStartedPayload,
  StreamStoppedPayload,
} from "./stream-events"

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string | number
    [key: string]: unknown
  }
}

/** Origin used when `CORS_ORIGIN` is unset or empty — keeps local dev working. */
const DEFAULT_CORS_ORIGIN = "http://localhost:3000"

function isValidUrl(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Resolve the trusted WebSocket CORS origin(s) from the environment.
 *
 * Mirrors the REST API policy in `main.ts`
 * (`process.env.CORS_ORIGIN || "http://localhost:3000"`) but additionally
 * accepts a comma-separated list so several trusted origins can be allowed.
 * Returns a single string when one origin is configured and an array when
 * multiple are; socket.io matches the handshake `Origin` header against this
 * value and rejects any origin not on the list, closing the Cross-Site
 * WebSocket Hijacking hole left by the previous `origin: "*"`.
 */
export function resolveCorsOrigins(
  raw: string | undefined = process.env.CORS_ORIGIN,
): string | string[] {
  const origins = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

  if (origins.length === 0) {
    return DEFAULT_CORS_ORIGIN
  }

  for (const origin of origins) {
    if (!isValidUrl(origin)) {
      const errMsg = `Invalid CORS_ORIGIN "${origin}": must be a well-formed HTTP/HTTPS URL`
      if (process.env.NODE_ENV === "production") {
        console.error(`Environment validation failed:\n  - CORS_ORIGIN: ${errMsg}`)
        process.exit(1)
      } else {
        console.warn(`[CORS Warning] ${errMsg}; falling back to default origin ${DEFAULT_CORS_ORIGIN}`)
        return DEFAULT_CORS_ORIGIN
      }
    }
  }

  return origins.length === 1 ? origins[0] : origins
}

interface JwtPayload {
  sub: string | number
  [key: string]: unknown
}

/**
 * WebSocket gateway that broadcasts real-time stream status events to
 * connected clients.
 *
 * Authentication: clients must present a JWT either via the `auth.token`
 * handshake payload or an `Authorization: Bearer <token>` header. Invalid
 * or missing tokens result in immediate disconnection.
 *
 * Wire events (server → client):
 *   - `stream:started` { streamId, userId, startedAt }
 *   - `stream:stopped` { streamId, userId, stoppedAt, reason? }
 *   - `stream:error`   { streamId, userId?, occurredAt, code, message }
 *
 * Clients join per-stream rooms (`stream:<id>`) by emitting
 * `stream:subscribe`/`stream:unsubscribe`. The service-level helpers
 * (`emitStarted` / `emitStopped` / `emitError`) only broadcast to the
 * room matching the affected stream so events stay scoped.
 */
@WebSocketGateway({
  namespace: "/streams",
  cors: { origin: resolveCorsOrigins(), credentials: true },
})
export class StreamsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(StreamsGateway.name)

  @WebSocketServer()
  public server!: Server

  constructor(
    private readonly jwtService: JwtService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  afterInit(_server: Server): void {
    this.logger.log("StreamsGateway initialised on namespace /streams")
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractToken(client)
      if (!token) {
        this.disconnectWithError(
          client,
          "MISSING_TOKEN",
          "Authentication token required",
        )
        return
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token)
      client.data.userId = payload.sub

      // Every authenticated client joins its own per-user room so
      // server-initiated pushes (e.g. notifications) can target a user
      // without requiring an explicit subscribe handshake.
      void client.join(this.userRoomFor(payload.sub))

      this.metricsService?.websocketConnectionsTotal.inc()
      this.metricsService?.websocketActiveConnections.inc()

      this.logger.log(
        `client ${client.id} connected (user=${String(payload.sub)})`,
      )
      client.emit("connected", { userId: payload.sub })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "unknown verification error"
      this.disconnectWithError(
        client,
        "INVALID_TOKEN",
        `JWT verification failed: ${message}`,
      )
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    // Socket.IO automatically removes the socket from every room on
    // disconnect, so there is no manual cleanup beyond logging. The
    // `try/catch` exists to make sure a buggy logger never throws back
    // into the framework and crashes the worker.
    try {
      this.metricsService?.websocketActiveConnections.dec()
      this.logger.log(
        `client ${client.id} disconnected (user=${String(client.data?.userId ?? "anon")})`,
      )
    } catch {
      // intentionally swallow — disconnect must never raise
    }
  }

  /**
   * Subscribe a connected, authenticated client to events for a specific
   * stream. The client must already be authenticated (handled in
   * `handleConnection`).
   */
  @SubscribeMessage("stream:subscribe")
  handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    payload: { streamId?: string | number } = {},
  ): { ok: boolean; room?: string; error?: string } {
    if (!client.data?.userId) {
      return { ok: false, error: "unauthenticated" }
    }
    if (payload.streamId === undefined || payload.streamId === null) {
      return { ok: false, error: "streamId required" }
    }
    const room = this.roomFor(payload.streamId)
    void client.join(room)
    return { ok: true, room }
  }

  @SubscribeMessage("stream:unsubscribe")
  handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    payload: { streamId?: string | number } = {},
  ): { ok: boolean; room?: string; error?: string } {
    if (!client.data?.userId) {
      return { ok: false, error: "unauthenticated" }
    }
    if (payload.streamId === undefined || payload.streamId === null) {
      return { ok: false, error: "streamId required" }
    }
    const room = this.roomFor(payload.streamId)
    void client.leave(room)
    return { ok: true, room }
  }

  /* ------------------------------------------------------------------ *
   * Service-level emit helpers — called by application services when a
   * stream lifecycle event occurs. Each helper scopes the broadcast to
   * the per-stream room so unrelated clients are not flooded.
   * ------------------------------------------------------------------ */

  emitStarted(payload: StreamStartedPayload): void {
    this.server
      .to(this.roomFor(payload.streamId))
      .emit(STREAM_EVENTS.STARTED, payload)
  }

  emitStopped(payload: StreamStoppedPayload): void {
    this.server
      .to(this.roomFor(payload.streamId))
      .emit(STREAM_EVENTS.STOPPED, payload)
  }

  emitError(payload: StreamErrorPayload): void {
    this.server
      .to(this.roomFor(payload.streamId))
      .emit(STREAM_EVENTS.ERROR, payload)
  }

  /**
   * Push a newly created notification to every socket the target user has
   * open. Scoped to the user's own room so other clients never see it.
   */
  emitNotification(payload: NotificationCreatedPayload): void {
    this.server
      .to(this.userRoomFor(payload.userId))
      .emit(NOTIFICATION_EVENTS.NEW, payload)
  }

  /* -------------------------------------------------------------- */

  private roomFor(streamId: string | number): string {
    return `stream:${String(streamId)}`
  }

  private userRoomFor(userId: string | number): string {
    return `user:${String(userId)}`
  }

  private extractToken(client: Socket): string | null {
    // Preferred: socket.io handshake auth payload — `io(url, { auth: { token }})`
    const handshakeAuth = (client.handshake?.auth ?? {}) as Record<
      string,
      unknown
    >
    const rawAuthToken = handshakeAuth["token"]
    if (typeof rawAuthToken === "string" && rawAuthToken.length > 0) {
      return rawAuthToken
    }

    // Fallback: `Authorization: Bearer <token>` header.
    const authHeader = client.handshake?.headers?.authorization
    if (
      typeof authHeader === "string" &&
      authHeader.toLowerCase().startsWith("bearer ")
    ) {
      return authHeader.slice(7).trim() || null
    }

    // Last resort: `?token=` query string (useful for in-browser clients
    // that cannot set custom headers).
    const queryToken = client.handshake?.query?.token
    if (typeof queryToken === "string" && queryToken.length > 0) {
      return queryToken
    }

    return null
  }

  private disconnectWithError(
    client: Socket,
    code: string,
    message: string,
  ): void {
    this.logger.warn(`rejecting client ${client.id}: [${code}] ${message}`)
    client.emit(STREAM_EVENTS.ERROR, {
      streamId: "",
      occurredAt: new Date().toISOString(),
      code,
      message,
    } satisfies StreamErrorPayload)
    client.disconnect(true)
  }
}
