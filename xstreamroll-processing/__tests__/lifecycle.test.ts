import axios from "axios"

import { SessionLifecycleManager } from "../src/session/lifecycle"

jest.mock("axios")
const mockedPatch = axios.patch as jest.MockedFunction<typeof axios.patch>

beforeEach(() => {
  mockedPatch.mockResolvedValue({ data: {} })
})

afterEach(() => {
  jest.clearAllMocks()
})

describe("SessionLifecycleManager", () => {
  const opts = { apiUrl: "http://localhost:3001", workerId: "worker-1" }

  it("starts in idle state", () => {
    const mgr = new SessionLifecycleManager("stream-1", opts)
    expect(mgr.getState()).toBe("idle")
  })

  it("transitions idle → starting → active on start()", async () => {
    const mgr = new SessionLifecycleManager("stream-1", opts)
    await mgr.start()
    expect(mgr.getState()).toBe("active")
    expect(mockedPatch).toHaveBeenCalledWith(
      "http://localhost:3001/streams/stream-1",
      expect.objectContaining({ status: "starting" }),
    )
    expect(mockedPatch).toHaveBeenCalledWith(
      "http://localhost:3001/streams/stream-1",
      expect.objectContaining({ status: "active" }),
    )
  })

  it("transitions active → stopping → ended on stop()", async () => {
    const mgr = new SessionLifecycleManager("stream-1", opts)
    await mgr.start()
    await mgr.stop()
    expect(mgr.getState()).toBe("ended")
    expect(mockedPatch).toHaveBeenCalledWith(
      "http://localhost:3001/streams/stream-1",
      expect.objectContaining({ status: "ended" }),
    )
  })

  it("transitions to error state on handleDisconnect()", async () => {
    const mgr = new SessionLifecycleManager("stream-1", opts)
    await mgr.start()
    await mgr.handleDisconnect(new Error("connection lost"))
    expect(mgr.getState()).toBe("error")
    expect(mockedPatch).toHaveBeenCalledWith(
      "http://localhost:3001/streams/stream-1",
      expect.objectContaining({ status: "error", reason: "connection lost" }),
    )
  })

  it("throws when start() called from non-idle state", async () => {
    const mgr = new SessionLifecycleManager("stream-1", opts)
    await mgr.start()
    await expect(mgr.start()).rejects.toThrow(/Invalid transition/)
  })

  it("throws when stop() called from non-active state", async () => {
    const mgr = new SessionLifecycleManager("stream-1", opts)
    await expect(mgr.stop()).rejects.toThrow(/Invalid transition/)
  })

  it("handleDisconnect is a no-op when already ended", async () => {
    const mgr = new SessionLifecycleManager("stream-1", opts)
    await mgr.start()
    await mgr.stop()
    mockedPatch.mockClear()
    await mgr.handleDisconnect()
    expect(mockedPatch).not.toHaveBeenCalled()
  })

  it("PATCH failure is swallowed (does not throw)", async () => {
    mockedPatch.mockRejectedValue(new Error("network error"))
    const mgr = new SessionLifecycleManager("stream-1", opts)
    await expect(mgr.start()).resolves.not.toThrow()
  })
})
