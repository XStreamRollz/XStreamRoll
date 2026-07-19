import { io, type Socket } from 'socket.io-client'

const socketCache = new Map<string, Socket>()
const roomCounts = new WeakMap<Socket, Map<string, number>>()

function toHttpUrl(raw: string): string {
  // Convert ws/wss to http/https so socket.io-client can parse namespace
  if (raw.startsWith('ws://')) return raw.replace(/^ws:\/\//, 'http://')
  if (raw.startsWith('wss://')) return raw.replace(/^wss:\/\//, 'https://')
  return raw
}

export const createStreamSocket = (rawUrl: string): Socket => {
  const httpUrl = toHttpUrl(rawUrl)

  let urlObj: URL
  try {
    urlObj = new URL(httpUrl)
  } catch {
    // In case a bare host was passed (e.g. "localhost:3001"), assume http
    urlObj = new URL(`http://${httpUrl}`)
  }

  // Determine namespace: prefer existing /streams path if present, otherwise use /streams
  const namespace = urlObj.pathname && urlObj.pathname.startsWith('/streams')
    ? urlObj.pathname
    : '/streams'

  const base = `${urlObj.origin}${namespace}`
  const token = urlObj.searchParams.get('token') ?? undefined

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