import { Logger } from "@nestjs/common"
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
import {
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
  cors: { origin: "*" },
})
export class StreamsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(StreamsGateway.name)

  @WebSocketServer()
  public server!: Server

  constructor(private readonly jwtService: JwtService) {}

  afterInit(_server: Server): void {
    this.logger.log("StreamsGateway initialised on namespace /streams")
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractToken(client)
      if (!token) {
        this.disconnectWithError(client, "MISSING_TOKEN", "Authentication token required")
        return
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token)
      client.data.userId = payload.sub

      this.logger.log(
        `client ${client.id} connected (user=${String(payload.sub)})`,
      )
      client.emit("connected", { userId: payload.sub })
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown verification error"
      this.disconnectWithError(client, "INVALID_TOKEN", `JWT verification failed: ${message}`)
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    // Socket.IO automatically removes the socket from every room on
    // disconnect, so there is no manual cleanup beyond logging. The
    // `try/catch` exists to make sure a buggy logger never throws back
    // into the framework and crashes the worker.
    try {
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
    this.server.to(this.roomFor(payload.streamId)).emit(STREAM_EVENTS.STARTED, payload)
  }

  emitStopped(payload: StreamStoppedPayload): void {
    this.server.to(this.roomFor(payload.streamId)).emit(STREAM_EVENTS.STOPPED, payload)
  }

  emitError(payload: StreamErrorPayload): void {
    this.server.to(this.roomFor(payload.streamId)).emit(STREAM_EVENTS.ERROR, payload)
  }

  /* -------------------------------------------------------------- */

  private roomFor(streamId: string | number): string {
    return `stream:${String(streamId)}`
  }

  private extractToken(client: Socket): string | null {
    // Preferred: socket.io handshake auth payload — `io(url, { auth: { token }})`
    const handshakeAuth = (client.handshake?.auth ?? {}) as Record<string, unknown>
    const rawAuthToken = handshakeAuth["token"]
    if (typeof rawAuthToken === "string" && rawAuthToken.length > 0) {
      return rawAuthToken
    }

    // Fallback: `Authorization: Bearer <token>` header.
    const authHeader = client.handshake?.headers?.authorization
    if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
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

  private disconnectWithError(client: Socket, code: string, message: string): void {
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
