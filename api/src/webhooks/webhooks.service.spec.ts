import { NotFoundException } from "@nestjs/common"
import * as crypto from "crypto"
import {
  MAX_RETRIES,
  WebhooksService,
  nextAttemptAfter,
  signPayload,
} from "./webhooks.service"
import { WebhookDeliveriesRepository } from "./repository/webhook-deliveries.repository"
import { WebhookSubscriptionsRepository } from "./repository/webhook-subscriptions.repository"

/** Flushes the microtask queue so fire-and-forget attemptDelivery() settles. */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe("WebhooksService", () => {
  let subscriptions: WebhookSubscriptionsRepository
  let deliveries: WebhookDeliveriesRepository
  let service: WebhooksService
  let fetchMock: jest.Mock

  beforeEach(() => {
    subscriptions = new WebhookSubscriptionsRepository()
    deliveries = new WebhookDeliveriesRepository()
    service = new WebhooksService(subscriptions, deliveries)
    fetchMock = jest.fn()
    ;(global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("register", () => {
    it("creates an active subscription with a random 32-byte hex secret", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 2,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })

      expect(sub.userId).toBe(1)
      expect(sub.streamId).toBe(2)
      expect(sub.active).toBe(true)
      expect(sub.secret).toMatch(/^[0-9a-f]{64}$/)
    })

    it("generates a different secret for each subscription", async () => {
      const a = await service.register({
        userId: 1,
        streamId: 1,
        url: "https://example.com/a",
        events: ["stream:started"],
      })
      const b = await service.register({
        userId: 1,
        streamId: 1,
        url: "https://example.com/b",
        events: ["stream:started"],
      })
      expect(a.secret).not.toBe(b.secret)
    })
  })

  describe("findById", () => {
    it("throws NotFoundException for an unknown id", async () => {
      await expect(service.findById(999)).rejects.toThrow(NotFoundException)
    })
  })

  describe("dispatchStreamEvent", () => {
    it("signs the exact request body with the subscription secret and delivers it", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      fetchMock.mockResolvedValue({ status: 200, text: async () => "ok" })

      await service.dispatchStreamEvent(5, "stream:started", { streamId: 5 })
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("https://example.com/hook")
      expect(init.headers["X-Webhook-Signature"]).toBe(
        signPayload(sub.secret, init.body as string),
      )

      const list = await service.listDeliveries(sub.id, 1, 20)
      expect(list.data[0].status).toBe("success")
      expect(list.data[0].lastStatusCode).toBe(200)
      expect(list.data[0].attemptCount).toBe(1)
      expect(list.data[0].deliveredAt).not.toBeNull()
    })

    it("does not deliver to a subscription for an event it did not subscribe to", async () => {
      await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:stopped"],
      })

      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("does not deliver to a subscription on a different stream", async () => {
      await service.register({
        userId: 1,
        streamId: 99,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })

      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("records a non-2xx response as pending with a future next attempt", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      fetchMock.mockResolvedValue({ status: 500, text: async () => "boom" })

      const before = Date.now()
      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()

      const list = await service.listDeliveries(sub.id, 1, 20)
      const delivery = list.data[0]
      expect(delivery.status).toBe("pending")
      expect(delivery.attemptCount).toBe(1)
      expect(delivery.lastStatusCode).toBe(500)
      expect(delivery.nextAttemptAt).not.toBeNull()
      expect(delivery.nextAttemptAt!.getTime()).toBeGreaterThan(before)
    })

    it("records a network error (fetch throws) with no status code, still schedules a retry", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      fetchMock.mockRejectedValue(new Error("network unreachable"))

      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()

      const list = await service.listDeliveries(sub.id, 1, 20)
      expect(list.data[0].status).toBe("pending")
      expect(list.data[0].lastStatusCode).toBeNull()
      expect(list.data[0].lastError).toBe("network unreachable")
    })
  })

  describe("sweepRetries", () => {
    it("re-attempts due pending deliveries and marks a delivery failed once retries are exhausted", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      fetchMock.mockResolvedValue({ status: 500, text: async () => "boom" })

      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()

      // Repeatedly force the due delivery into the past and sweep, until
      // MAX_RETRIES is exhausted (6 attempts total: the initial one above
      // plus MAX_RETRIES retries).
      for (let i = 0; i < MAX_RETRIES; i++) {
        const before = await service.listDeliveries(sub.id, 1, 20)
        const pending = before.data[0]
        expect(pending.status).toBe("pending")
        pending.nextAttemptAt = new Date(Date.now() - 1_000)

        await service.sweepRetries()
        await flushPromises()
      }

      const final = await service.listDeliveries(sub.id, 1, 20)
      expect(final.data[0].status).toBe("failed")
      expect(final.data[0].attemptCount).toBe(MAX_RETRIES + 1)
      expect(final.data[0].nextAttemptAt).toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES + 1)
    })

    it("skips a due delivery whose subscription was deactivated", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      fetchMock.mockResolvedValue({ status: 500, text: async () => "boom" })
      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()

      const stored = await subscriptions.findById(sub.id)
      stored!.active = false
      fetchMock.mockClear()

      const list = await service.listDeliveries(sub.id, 1, 20)
      list.data[0].nextAttemptAt = new Date(Date.now() - 1_000)

      await service.sweepRetries()
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})

describe("nextAttemptAfter", () => {
  it("returns an increasing delay for each retry within the budget", () => {
    let previousDelay = 0
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const next = nextAttemptAfter(attempt)
      expect(next).not.toBeNull()
      const delay = next!.getTime() - Date.now()
      expect(delay).toBeGreaterThan(previousDelay)
      previousDelay = delay
    }
  })

  it("returns null once MAX_RETRIES is exceeded", () => {
    expect(nextAttemptAfter(MAX_RETRIES + 1)).toBeNull()
  })

  it("keeps the cumulative retry window within 24 hours", () => {
    let cumulativeMs = 0
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const next = nextAttemptAfter(attempt)!
      cumulativeMs = next.getTime() - Date.now()
    }
    expect(cumulativeMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })
})

describe("signPayload", () => {
  it("produces a sha256=<hex> signature matching a manual HMAC computation", () => {
    const secret = "test-secret"
    const body = JSON.stringify({ hello: "world" })
    const expected =
      "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")
    expect(signPayload(secret, body)).toBe(expected)
  })

  it("produces a different signature for a different secret", () => {
    const body = JSON.stringify({ hello: "world" })
    expect(signPayload("secret-a", body)).not.toBe(signPayload("secret-b", body))
  })

  it("produces a different signature if the body changes by a single byte", () => {
    const secret = "test-secret"
    expect(signPayload(secret, "a")).not.toBe(signPayload(secret, "b"))
  })
})
