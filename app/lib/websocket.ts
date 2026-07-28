import { io, type Socket } from 'socket.io-client'

/**
 * Issue #319 — the JWT used to authenticate the WebSocket stream is no
 * longer read from a `?token=` query-string parameter. Reverse proxies
 * (nginx, Cloudflare, etc.) log the full URL — including the query —
 * to access logs, so any JWT carried in `?token=...` was being
 * persisted in plaintext.
 *
 * Callers must now supply the token explicitly via
 * `createStreamSocket(url, { token })`, which forwards it through the
 * socket.io handshake `auth` payload (`io(url, { auth: { token } })`).
 * The Authorization header path remains available on the server.
 *
 * As defense-in-depth we additionally strip any stray `?token=` from
 * the outbound URL — even if a wrongly-configured caller slips one in,
 * it never reaches nginx or any downstream log collector.
 */

const socketCache = new Map<string, Socket>()
const roomCounts = new WeakMap<Socket, Map<string, number>>()

function toHttpUrl(raw: string): string {
  // Convert ws/wss to http/https so socket.io-client can parse namespace
  if (raw.startsWith('ws://')) return raw.replace(/^ws:\/\//, 'http://')
  if (raw.startsWith('wss://')) return raw.replace(/^wss:\/\//, 'https://')
  return raw
}

export interface CreateStreamSocketOptions {
  /**
   * JWT used to authenticate the WebSocket stream. Forwarded to the
   * server via the socket.io handshake `auth` payload (NOT via the
   * URL — see file-level JSDoc, Issue #319).
   */
  token?: string
}

export const createStreamSocket = (
  rawUrl: string,
  options: CreateStreamSocketOptions = {},
): Socket => {
  const httpUrl = toHttpUrl(rawUrl)

  let urlObj: URL
  try {
    urlObj = new URL(httpUrl)
  } catch {
    // In case a bare host was passed (e.g. "localhost:3001"), assume http
    urlObj = new URL(`http://${httpUrl}`)
  }

  // Determine namespace: prefer existing /streams path if present, otherwise use /streams
  const namespace =
    urlObj.pathname && urlObj.pathname.startsWith('/streams')
      ? urlObj.pathname
      : '/streams'

  // Issue #319 — strip any `?token=` from the URL entirely so it can't
  // end up in an access log even if a caller mistakenly appended one.
  urlObj.searchParams.delete('token')

  const base = `${urlObj.origin}${namespace}`
  const token = options.token

  const cacheKey = `${base}|${token ?? ''}`
  const existing = socketCache.get(cacheKey)
  if (existing) return existing

  const socket = io(base, {
    auth: token ? { token } : undefined,
    transports: ['websocket'],
    withCredentials: true,
  })

  socketCache.set(cacheKey, socket)
  roomCounts.set(socket, new Map())

  return socket
}

export const subscribeToStream = async (
  socket: Socket,
  streamId: string | number,
): Promise<{ ok: boolean; room?: string; error?: string } | null> => {
  if (!socket) return null
  const counts = roomCounts.get(socket) ?? new Map()
  const room = `stream:${String(streamId)}`
  const prev = counts.get(room) ?? 0
  if (prev > 0) {
    counts.set(room, prev + 1)
    roomCounts.set(socket, counts)
    return { ok: true, room }
  }

  return await new Promise((resolve) => {
    socket.emit('stream:subscribe', { streamId }, (res: any) => {
      if (res && res.ok) {
        counts.set(room, 1)
        roomCounts.set(socket, counts)
      }
      resolve(res)
    })
  })
}

export const unsubscribeFromStream = async (
  socket: Socket,
  streamId: string | number,
): Promise<{ ok: boolean; room?: string; error?: string } | null> => {
  if (!socket) return null
  const counts = roomCounts.get(socket) ?? new Map()
  const room = `stream:${String(streamId)}`
  const prev = counts.get(room) ?? 0
  if (prev > 1) {
    counts.set(room, prev - 1)
    roomCounts.set(socket, counts)
    return { ok: true, room }
  }

  return await new Promise((resolve) => {
    socket.emit('stream:unsubscribe', { streamId }, (res: any) => {
      counts.delete(room)
      roomCounts.set(socket, counts)
      resolve(res)
    })
  })
}
