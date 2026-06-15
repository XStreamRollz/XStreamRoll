# 5. Socket.IO for Real-time Communication

## Status

Accepted

## Context

The XStreamRoll platform must broadcast real-time stream status updates (such as `stream:started`, `stream:stopped`, and `stream:error` events) to connected client applications. While raw WebSockets (`ws` package) are standard, they do not provide built-in features for automatic reconnection, connection state recovery, network transport fallbacks, or pub/sub room categorization.

## Decision

We will use Socket.IO (integrated via NestJS `@nestjs/platform-socket.io` and `@WebSocketGateway`) for all real-time communication between clients and the API backend.

We will leverage Socket.IO's native room management:

- Clients connect to the `/streams` namespace and authenticate using JWTs.
- Clients subscribe to specific stream topics by emitting a `stream:subscribe` event, placing their socket into a room named `stream:<id>`.
- The API backend broadcasts lifecycle events only to the specific `stream:<id>` room, ensuring events remain scoped and preventing network flood to unrelated client sockets.

## Consequences

- **Reliable Connectivity**: Clients benefit from automatic reconnection attempts, packet buffering during disconnects, and fallback to HTTP long-polling if websocket connections are blocked by proxies or firewalls.
- **Simplified Room Logic**: The server handles room subscriptions (`socket.join()` and `socket.leave()`) natively, removing the need to implement a custom pub/sub routing layer.
- **Client Library Lock-in**: Clients must use the Socket.IO client SDK (instead of the standard browser `WebSocket` object), which increases the frontend bundle size slightly and requires coordinating library versions.
- **Clustering Overhead**: If the backend API scales out to multiple instances behind a load balancer, we must configure a Redis adapter (or similar Socket.IO adapter) to sync room events across nodes.
