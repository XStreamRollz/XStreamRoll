/**
 * @xstreamroll/types
 *
 * Single source of truth for domain types shared by the API, the web
 * app, and the SDK. Types here should mirror what the API actually
 * sends and accepts on the wire — this package exists to eliminate
 * drift between independently-maintained copies of the same shape,
 * not to describe aspirational or future API surface.
 */

export * from "./user"
export * from "./stream"
export * from "./stream-event"
export * from "./pagination"
export * from "./errors"
