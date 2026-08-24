import * as crypto from "crypto"

import { ConflictException, NotFoundException } from "@nestjs/common"

import { WebhookDeliveriesRepository } from "./repository/webhook-deliveries.repository"
import { WebhookSubscriptionsRepository } from "./repository/webhook-subscriptions.repository"
import {
  MAX_RETRIES,
  WebhooksService,
  nextAttemptAfter,
  signPayload,
} from "./webhooks.service"

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

    it("does not deliver to a deactivated subscription (fan-out stops immediately)", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      await service.update(sub.id, { active: false })

      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
      const list = await service.listDeliveries(sub.id, 1, 20)
      expect(list.data).toHaveLength(0)
    })

    it("reactivating a deactivated subscription resumes fan-out", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      fetchMock.mockResolvedValue({ status: 200, text: async () => "ok" })

      await service.update(sub.id, { active: false })
      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()
      expect(fetchMock).not.toHaveBeenCalled()

      await service.update(sub.id, { active: true })
      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(1)
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

  describe("listByUser", () => {
    it("returns only the caller's subscriptions, newest first", async () => {
      const own = await service.register({
        userId: 1,
        streamId: 2,
        url: "https://example.com/own",
        events: ["stream:started"],
      })
      await service.register({
        userId: 99,
        streamId: 2,
        url: "https://example.com/other",
        events: ["stream:started"],
      })

      const res = await service.listByUser(1, 1, 20)
      expect(res.data).toHaveLength(1)
      expect(res.data[0].id).toBe(own.id)
      expect(res.total).toBe(1)
    })

    it("filters by streamId when provided", async () => {
      await service.register({
        userId: 1,
        streamId: 2,
        url: "https://example.com/a",
        events: ["stream:started"],
      })
      await service.register({
        userId: 1,
        streamId: 3,
        url: "https://example.com/b",
        events: ["stream:started"],
      })

      const res = await service.listByUser(1, 1, 20, 3)
      expect(res.data).toHaveLength(1)
      expect(res.data[0].streamId).toBe(3)
    })

    it("paginates like the other list endpoints", async () => {
      for (let i = 0; i < 3; i++) {
        await service.register({
          userId: 1,
          streamId: 2,
          url: `https://example.com/${i}`,
          events: ["stream:started"],
        })
      }

      const page1 = await service.listByUser(1, 1, 2)
      const page2 = await service.listByUser(1, 2, 2)
      expect(page1.data).toHaveLength(2)
      expect(page2.data).toHaveLength(1)
      expect(page1.total).toBe(3)
      expect(page2.total).toBe(3)
    })
  })

  describe("update", () => {
    it("updates url, events, and active", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 2,
        url: "https://example.com/old",
        events: ["stream:started"],
      })

      const updated = await service.update(sub.id, {
        url: "https://example.com/new",
        events: ["stream:stopped"],
        active: false,
      })

      expect(updated.url).toBe("https://example.com/new")
      expect(updated.events).toEqual(["stream:stopped"])
      expect(updated.active).toBe(false)
      // Secret is never touched by an update.
      expect(updated.secret).toBe(sub.secret)
    })

    it("leaves omitted fields unchanged", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 2,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })

      const updated = await service.update(sub.id, { active: false })
      expect(updated.active).toBe(false)
      expect(updated.url).toBe("https://example.com/hook")
      expect(updated.events).toEqual(["stream:started"])
    })

    it("throws NotFoundException for an unknown webhook", async () => {
      await expect(service.update(999, { active: false })).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe("delete", () => {
    it("deletes an existing subscription", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 2,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })

      await expect(service.delete(sub.id)).resolves.toBeUndefined()
      await expect(service.findById(sub.id)).rejects.toThrow(NotFoundException)
    })

    it("throws NotFoundException for an unknown webhook", async () => {
      await expect(service.delete(999)).rejects.toThrow(NotFoundException)
    })
  })

  describe("retryDelivery", () => {
    it("re-queues a terminally failed delivery keeping its attempt count", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      // Simulate an exhausted delivery: 6 attempts, terminally failed.
      const delivery = await deliveries.create(sub.id, "stream:started", {})
      delivery.status = "failed"
      delivery.attemptCount = MAX_RETRIES + 1
      delivery.nextAttemptAt = null

      const before = Date.now()
      const requeued = await service.retryDelivery(sub.id, delivery.id)

      expect(requeued.status).toBe("pending")
      expect(requeued.attemptCount).toBe(MAX_RETRIES + 1)
      expect(requeued.nextAttemptAt).not.toBeNull()
      expect(requeued.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(before)
    })

    it("pulls a pending delivery forward so the sweep picks it up immediately", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      const delivery = await deliveries.create(sub.id, "stream:started", {})
      delivery.status = "pending"
      delivery.nextAttemptAt = new Date(Date.now() + 60_000)

      const requeued = await service.retryDelivery(sub.id, delivery.id)
      expect(requeued.status).toBe("pending")
      expect(requeued.nextAttemptAt!.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it("throws NotFoundException for an unknown webhook", async () => {
      await expect(service.retryDelivery(999, 1)).rejects.toThrow(
        NotFoundException,
      )
    })

    it("throws NotFoundException for an unknown delivery", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      await expect(service.retryDelivery(sub.id, 999)).rejects.toThrow(
        NotFoundException,
      )
    })

    it("throws NotFoundException when the delivery belongs to another webhook", async () => {
      const subA = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/a",
        events: ["stream:started"],
      })
      const subB = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/b",
        events: ["stream:started"],
      })
      const delivery = await deliveries.create(subA.id, "stream:started", {})
      delivery.status = "failed"

      await expect(service.retryDelivery(subB.id, delivery.id)).rejects.toThrow(
        NotFoundException,
      )
    })

    it("throws ConflictException for an already-delivered delivery", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      const delivery = await deliveries.create(sub.id, "stream:started", {})
      delivery.status = "success"
      delivery.deliveredAt = new Date()

      await expect(service.retryDelivery(sub.id, delivery.id)).rejects.toThrow(
        ConflictException,
      )
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

    it("reactivating a deactivated subscription resumes its pending delivery retries", async () => {
      const sub = await service.register({
        userId: 1,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
      })
      fetchMock.mockResolvedValue({ status: 500, text: async () => "boom" })
      await service.dispatchStreamEvent(5, "stream:started", {})
      await flushPromises()

      // Deactivate, make the pending delivery due, and sweep — nothing
      // is attempted while the subscription stays inactive.
      await service.update(sub.id, { active: false })
      fetchMock.mockClear()
      let list = await service.listDeliveries(sub.id, 1, 20)
      list.data[0].nextAttemptAt = new Date(Date.now() - 1_000)

      await service.sweepRetries()
      await flushPromises()
      expect(fetchMock).not.toHaveBeenCalled()

      // Reactivate: the same delivery is still pending with its retry
      // schedule intact, so the sweep picks it back up.
      await service.update(sub.id, { active: true })
      list = await service.listDeliveries(sub.id, 1, 20)
      list.data[0].nextAttemptAt = new Date(Date.now() - 1_000)

      await service.sweepRetries()
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(1)
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
      "sha256=" +
      crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")
    expect(signPayload(secret, body)).toBe(expected)
  })

  it("produces a different signature for a different secret", () => {
    const body = JSON.stringify({ hello: "world" })
    expect(signPayload("secret-a", body)).not.toBe(
      signPayload("secret-b", body),
    )
  })

  it("produces a different signature if the body changes by a single byte", () => {
    const secret = "test-secret"
    expect(signPayload(secret, "a")).not.toBe(signPayload(secret, "b"))
  })
})
