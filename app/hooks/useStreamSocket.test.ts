/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react"

import {
  createStreamSocket,
  subscribeToStream,
  unsubscribeFromStream,
} from "../lib/websocket"
import { computeBackoff, useStreamSocket } from "./useStreamSocket"

jest.mock("../lib/websocket", () => ({
  createStreamSocket: jest.fn(),
  subscribeToStream: jest.fn(),
  unsubscribeFromStream: jest.fn(),
}))

const mockCreate = createStreamSocket as jest.MockedFunction<
  typeof createStreamSocket
>
const mockSubscribe = subscribeToStream as jest.MockedFunction<
  typeof subscribeToStream
>
const mockUnsubscribe = unsubscribeFromStream as jest.MockedFunction<
  typeof unsubscribeFromStream
>

/**
 * Minimal stand-in for a socket.io-client Socket that exercises the
 * surface area used by `useStreamSocket`: `.on` / `.off` / `.emit`
 * for events, `.connect` / `.disconnect` actions, and the `.connected`
 * flag the backoff path reads before calling `.connect()`.
 */
class FakeSocket {
  public listeners = new Map<string, Set<(...args: any[]) => void>>()
  public connected = false

  public connect = jest.fn(() => {
    this.connected = true
  })
  public disconnect = jest.fn(() => {
    this.connected = false
  })

  public on(event: string, fn: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
    return this
  }

  public off(event: string, fn: (...args: any[]) => void) {
    this.listeners.get(event)?.delete(fn)
    return this
  }

  public emit(event: string, ...args: unknown[]) {
    // Mirror real socket.io-client semantics: once the transport emits
    // `disconnect`, .connected flips to false so the next backoff tick
    // sees a consistent state.
    if (event === 'disconnect') {
      this.connected = false
    }
    const fns = this.listeners.get(event)
    if (!fns) return
    for (const fn of Array.from(fns)) {
      ;(fn as (...a: unknown[]) => void)(...args)
    }
  }
}

describe("computeBackoff", () => {
  it("returns 0 for non-positive attempts", () => {
    expect(computeBackoff(0)).toBe(0)
    expect(computeBackoff(-3)).toBe(0)
    expect(computeBackoff(Number.NaN)).toBe(0)
  })

  it("produces the documented exponential schedule, capped at the max", () => {
    expect(computeBackoff(1)).toBe(1_000)
    expect(computeBackoff(2)).toBe(2_000)
    expect(computeBackoff(3)).toBe(4_000)
    expect(computeBackoff(4)).toBe(8_000)
    expect(computeBackoff(5)).toBe(16_000)
    // 6th attempt would be 32_000 — clamped to the documented ceiling.
    expect(computeBackoff(6)).toBe(30_000)
    expect(computeBackoff(20)).toBe(30_000)
  })

  it("honors custom initial/max override options", () => {
    expect(computeBackoff(1, { initialMs: 100, maxMs: 500 })).toBe(100)
    expect(computeBackoff(3, { initialMs: 100, maxMs: 500 })).toBe(400)
    expect(computeBackoff(10, { initialMs: 100, maxMs: 500 })).toBe(500)
  })
})

describe("useStreamSocket", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    // Each render with a new URL should get its own socket.
    mockCreate.mockImplementation(
      () => new FakeSocket() as unknown as ReturnType<typeof createStreamSocket>,
    )
    mockSubscribe.mockResolvedValue({ ok: true })
    mockUnsubscribe.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("starts in the connecting state and surfaces status transitions", () => {
    const { result } = renderHook(() =>
      useStreamSocket("ws://localhost:3001/streams/42"),
    )
    expect(result.current.status).toBe("connecting")

    const socket = (mockCreate.mock.results[0].value as unknown) as FakeSocket
    act(() => socket.emit("connect"))
    expect(result.current.status).toBe("connected")

    act(() => socket.emit("disconnect", "transport close"))
    expect(result.current.status).toBe("disconnected")
  })

  it("skips redundant setup when the URL string is identical (safety net)", () => {
    const { rerender } = renderHook(
      ({ url }: { url: string }) => useStreamSocket(url),
      { initialProps: { url: "ws://localhost:3001/streams/42" } },
    )
    expect(mockCreate).toHaveBeenCalledTimes(1)

    // Same value → no extra set-up, listener count stays at 1.
    rerender({ url: "ws://localhost:3001/streams/42" })
    expect(mockCreate).toHaveBeenCalledTimes(1)

    // Different URL → new set-up begins after the previous one tears down.
    rerender({ url: "ws://localhost:3001/streams/99" })
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it("schedules a reconnect at the initial backoff delay on transport close", () => {
    const { result } = renderHook(() =>
      useStreamSocket("ws://localhost:3001/streams/42"),
    )
    const socket = (mockCreate.mock.results[0].value as unknown) as FakeSocket

    act(() => socket.emit("connect"))
    expect(result.current.status).toBe("connected")

    socket.connect.mockClear()
    act(() => socket.emit("disconnect", "transport close"))

    // Just shy of the 1s mark we shouldn't have retried yet.
    act(() => jest.advanceTimersByTime(999))
    expect(socket.connect).not.toHaveBeenCalled()

    // Crossing the 1s mark fires the retry exactly once.
    act(() => jest.advanceTimersByTime(1))
    expect(socket.connect).toHaveBeenCalledTimes(1)
  })

  it("resets the attempt counter on a successful (re)connect", () => {
    const { result } = renderHook(() =>
      useStreamSocket("ws://localhost:3001/streams/42"),
    )
    const socket = (mockCreate.mock.results[0].value as unknown) as FakeSocket

    act(() => socket.emit("connect"))
    socket.connect.mockClear()

    // First disconnect -> 1s wait.
    act(() => socket.emit("disconnect", "transport close"))
    act(() => jest.advanceTimersByTime(1_000))
    expect(socket.connect).toHaveBeenCalledTimes(1)

    // Pretend the retry actually succeeded -> handleConnect resets the
    // counter, so the next disconnect also waits 1s (not 2s).
    socket.connect.mockClear()
    socket.connected = true
    act(() => socket.emit("connect"))
    expect(result.current.status).toBe("connected")

    socket.connect.mockClear()
    act(() => socket.emit("disconnect", "transport close"))
    act(() => jest.advanceTimersByTime(999))
    expect(socket.connect).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(1))
    expect(socket.connect).toHaveBeenCalledTimes(1)
  })

  it("escalates the delay across consecutive failed reconnects", () => {
    const { result } = renderHook(() =>
      useStreamSocket("ws://localhost:3001/streams/42"),
    )
    const socket = (mockCreate.mock.results[0].value as unknown) as FakeSocket

    act(() => socket.emit("connect"))
    socket.connect.mockClear()

    // Disconnect #1 → wait 1s.
    act(() => socket.emit("disconnect", "transport close"))
    act(() => jest.advanceTimersByTime(1_000))
    expect(socket.connect).toHaveBeenCalledTimes(1)

    // Retry didn't actually connect — simulate a second disconnect.
    socket.connect.mockClear()
    socket.connected = false
    act(() => socket.emit("disconnect", "transport close"))
    // Below the 2s mark we should still be waiting.
    act(() => jest.advanceTimersByTime(1_999))
    expect(socket.connect).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(1))
    expect(socket.connect).toHaveBeenCalledTimes(1)
  })

  it("does not auto-reconnect on a client-initiated disconnect", () => {
    const { result } = renderHook(() =>
      useStreamSocket("ws://localhost:3001/streams/42"),
    )
    const socket = (mockCreate.mock.results[0].value as unknown) as FakeSocket

    act(() => socket.emit("connect"))
    socket.connect.mockClear()

    act(() =>
      socket.emit("disconnect", "io client disconnect"),
    )
    expect(result.current.status).toBe("disconnected")

    act(() => jest.advanceTimersByTime(60_000))
    expect(socket.connect).not.toHaveBeenCalled()
  })

  it("does not auto-reconnect on a server-initiated disconnect", () => {
    const { result } = renderHook(() =>
      useStreamSocket("ws://localhost:3001/streams/42"),
    )
    const socket = (mockCreate.mock.results[0].value as unknown) as FakeSocket

    act(() => socket.emit("connect"))
    socket.connect.mockClear()

    act(() =>
      socket.emit("disconnect", "io server disconnect"),
    )
    expect(result.current.status).toBe("disconnected")

    act(() => jest.advanceTimersByTime(60_000))
    expect(socket.connect).not.toHaveBeenCalled()
  })

  it("clears a pending reconnect timer when the URL changes", () => {
    const { rerender } = renderHook(
      ({ url }: { url: string }) => useStreamSocket(url),
      { initialProps: { url: "ws://localhost:3001/streams/42" } },
    )
    const firstSocket = (mockCreate.mock.results[0].value as unknown) as FakeSocket

    act(() => firstSocket.emit("connect"))
    firstSocket.connect.mockClear()
    act(() => firstSocket.emit("disconnect", "transport close"))

    // Switch URL before the 1s backoff elapses.
    rerender({ url: "ws://localhost:3001/streams/99" })
    expect(mockCreate).toHaveBeenCalledTimes(2)

    act(() => jest.advanceTimersByTime(60_000))
    // The original socket had a pending retry, but cleanup must have
    // cleared it so we never call connect on the disconnected one.
    expect(firstSocket.connect).not.toHaveBeenCalled()
  })
})
