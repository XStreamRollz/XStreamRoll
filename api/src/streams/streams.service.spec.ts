import {
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common"
import * as fc from "fast-check"


import { Stream } from "./stream.entity"
import { Tag } from "../tags/tag.entity"
import { TagsService } from "../tags/tags.service"
import { StreamsRepository } from "./repository/streams.repository"
import { StreamsService } from "./streams.service"

describe("StreamsService", () => {
  let service: StreamsService
  let mockRepo: {
    create: jest.Mock
    listPaginated: jest.Mock
    findById: jest.Mock
    getAnalytics: jest.Mock
    update: jest.Mock
    delete: jest.Mock
    listEventsForStream: jest.Mock
    insertPendingEvent: jest.Mock
    getPendingEvents: jest.Mock
  }
  let mockWebhooksService: { dispatchStreamEvent: jest.Mock }
  let mockTagsService: { listForStreamIds: jest.Mock }
  let mockGateway: {
    emitStarted: jest.Mock
    emitStopped: jest.Mock
    emitError: jest.Mock
  }

  /** Helper to build a fully-typed Stream with the new visibility field. */
  function streamFixture(overrides: Partial<Stream> = {}): Stream {
    return {
      id: 1,
      userId: 1,
      name: "s",
      description: null,
      status: "inactive",
      visibility: "private",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }
  }

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      listPaginated: jest.fn(),
      findById: jest.fn(),
      getAnalytics: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      listEventsForStream: jest.fn(),
      insertPendingEvent: jest.fn(),
      getPendingEvents: jest.fn(),
    }
    mockWebhooksService = {
      dispatchStreamEvent: jest.fn().mockResolvedValue(undefined),
    }
    mockTagsService = {
      listForStreamIds: jest.fn().mockResolvedValue(new Map()),
    }
    mockGateway = {
      emitStarted: jest.fn(),
      emitStopped: jest.fn(),
      emitError: jest.fn(),
    }
    service = new StreamsService(
      mockRepo as unknown as StreamsRepository,
      mockWebhooksService as unknown as WebhooksService,
      mockTagsService as unknown as TagsService,
      mockGateway as unknown as StreamsGateway,
    )
  })

  it("create with valid data returns stream", async () => {
    const expected = streamFixture({ name: "My Stream", description: "desc" })
    mockRepo.create.mockResolvedValue(expected)

    const result = await service.create({ userId: 5, name: "My Stream", description: "desc" })
    expect(result).toEqual(expected)
    expect(mockRepo.create).toHaveBeenCalledWith({ userId: 5, name: "My Stream", description: "desc", visibility: undefined })
  })

  it("create forwards requested visibility to the repository (issue #393)", async () => {
    const expected = streamFixture({ visibility: "public" })
    mockRepo.create.mockResolvedValue(expected)

    await service.create({ userId: 5, name: "Public Stream", visibility: "public" })
    expect(mockRepo.create).toHaveBeenCalledWith({
      userId: 5,
      name: "Public Stream",
      description: undefined,
      visibility: "public",
    })
  })

  it("list streams with pagination returns correct shape and hasMore", async () => {
    const items = [streamFixture({ id: 1 }), streamFixture({ id: 2, name: "b" })]
    mockRepo.listPaginated.mockResolvedValue({ items, total: 3 })

    const page = 1
    const limit = 2
    const res = await service.list(page, limit, 1)
    expect(res.page).toBe(page)
    expect(res.limit).toBe(limit)
    expect(res.total).toBe(3)
    expect(res.hasMore).toBe(true)
  })

  it("list batches tags in a single call so each stream row ships with tags (issue #330)", async () => {
    const streamA = streamFixture({ id: 1, name: "a" })
    const streamB = streamFixture({ id: 2, name: "b" })
    mockRepo.listPaginated.mockResolvedValue({ items: [streamA, streamB], total: 2 })
    const tagsByStream = new Map<number, Tag[]>([
      [1, [{ id: 10, name: "live", slug: "live", createdAt: new Date() }]],
      [2, []],
    ])
    mockTagsService.listForStreamIds.mockResolvedValue(tagsByStream)

    const res = await service.list(1, 20, 1)
    expect(mockTagsService.listForStreamIds).toHaveBeenCalledTimes(1)
    expect(mockTagsService.listForStreamIds).toHaveBeenCalledWith([1, 2])
    expect(res.data[0]?.tags).toHaveLength(1)
    expect(res.data[0]?.tags?.[0]?.slug).toBe("live")
    expect(res.data[1]?.tags).toEqual([])
  })

  it("list defaults tags to [] when the tag service returns no entry for a stream id", async () => {
    const stream = streamFixture({ id: 99, name: "x" })
    mockRepo.listPaginated.mockResolvedValue({ items: [stream], total: 1 })
    mockTagsService.listForStreamIds.mockResolvedValue(new Map())

    const res = await service.list(1, 20, 1)
    expect(res.data[0]?.tags).toEqual([])
  })

  it("list forwards the visibility filter (issue #393)", async () => {
    mockRepo.listPaginated.mockResolvedValue({ items: [], total: 0 })

    await service.list(1, 20, 1, { visibility: "public" })
    expect(mockRepo.listPaginated).toHaveBeenCalledWith(1, 20, 1, { visibility: "public" })
  })

  it("list streams with status filter forwards filter", async () => {
    mockRepo.listPaginated.mockResolvedValue({ items: [], total: 0 })

    await service.list(1, 10, 42, { status: "active" })
    expect(mockRepo.listPaginated).toHaveBeenCalledWith(1, 10, 42, { status: "active" })
  })

  it("list streams forwards visibility filter and ownerOnly flag", async () => {
    const items: Stream[] = []
    mockRepo.listPaginated.mockResolvedValue({ items, total: 0 })

    await service.list(1, 10, 7, { visibility: "private", ownerOnly: true })
    expect(mockRepo.listPaginated).toHaveBeenCalledWith(1, 10, 7, {
      visibility: "private",
      ownerOnly: true,
    })
  })

  it("list with invalid viewerUserId rejects", async () => {
    await expect(service.list(1, 10, 0)).rejects.toThrow(NotFoundException)
    await expect(service.list(1, 10, -1)).rejects.toThrow(NotFoundException)
    await expect(service.list(1, 10, 1.5)).rejects.toThrow(NotFoundException)
    expect(mockRepo.listPaginated).not.toHaveBeenCalled()
  })

  it("findById missing stream throws NotFoundException", async () => {
    mockRepo.findById.mockResolvedValue(undefined)
    await expect(service.findById(123)).rejects.toThrow(NotFoundException)
  })

  it("update status inactive -> active succeeds", async () => {
    const existing = streamFixture({ status: "inactive" })
    const updated = { ...existing, status: "active" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    const res = await service.update(1, { status: "active" })
    expect(res).toEqual(updated)
    expect(mockRepo.update).toHaveBeenCalledWith(1, {
      name: undefined,
      description: undefined,
      status: "active",
      visibility: undefined,
    })
  })

  it("update visibility flip (issue #393) does not dispatch a status webhook", async () => {
    const existing = streamFixture({ visibility: "private" })
    const updated = { ...existing, visibility: "public" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { visibility: "public" })
    expect(mockRepo.update).toHaveBeenCalledWith(1, {
      name: undefined,
      description: undefined,
      status: undefined,
      visibility: "public",
    })
    expect(mockWebhooksService.dispatchStreamEvent).not.toHaveBeenCalled()
  })

  it("update status inactive -> active dispatches a stream:started webhook event", async () => {
    const existing = streamFixture({ status: "inactive", userId: 7 })
    const updated = { ...existing, status: "active" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { status: "active" })

    expect(mockWebhooksService.dispatchStreamEvent).toHaveBeenCalledWith(
      1,
      "stream:started",
      expect.objectContaining({ streamId: 1, userId: 7 }),
    )
  })

  // ── Issue #519 — socket broadcasts on status transitions ────────────────

  it("update inactive -> active emits stream:started to the gateway", async () => {
    const existing = streamFixture({ status: "inactive", userId: 7 })
    const updated = { ...existing, status: "active" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { status: "active" })

    expect(mockGateway.emitStarted).toHaveBeenCalledWith({
      streamId: 1,
      userId: 7,
      startedAt: expect.any(String),
    })
    expect(mockGateway.emitStopped).not.toHaveBeenCalled()
    expect(mockGateway.emitError).not.toHaveBeenCalled()
  })

  it("update active -> inactive emits stream:stopped to the gateway", async () => {
    const existing = streamFixture({ status: "active", userId: 7 })
    const updated = { ...existing, status: "inactive" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { status: "inactive" })

    expect(mockGateway.emitStopped).toHaveBeenCalledWith({
      streamId: 1,
      userId: 7,
      stoppedAt: expect.any(String),
    })
    expect(mockGateway.emitStarted).not.toHaveBeenCalled()
    expect(mockGateway.emitError).not.toHaveBeenCalled()
  })

  it("update * -> error emits stream:error to the gateway with code and message", async () => {
    const existing = streamFixture({ status: "inactive", userId: 7 })
    const updated = { ...existing, status: "error" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { status: "error" })

    expect(mockGateway.emitError).toHaveBeenCalledWith({
      streamId: 1,
      userId: 7,
      occurredAt: expect.any(String),
      code: "STREAM_ERROR",
      message: "stream 1 entered error state",
    })
    expect(mockGateway.emitStarted).not.toHaveBeenCalled()
    expect(mockGateway.emitStopped).not.toHaveBeenCalled()
  })

  it("update error -> inactive emits stream:stopped to the gateway", async () => {
    const existing = streamFixture({ status: "error", userId: 7 })
    const updated = { ...existing, status: "inactive" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { status: "inactive" })

    expect(mockGateway.emitStopped).toHaveBeenCalledWith({
      streamId: 1,
      userId: 7,
      stoppedAt: expect.any(String),
    })
  })

  it("update without a status change emits nothing to the gateway", async () => {
    const existing = streamFixture({ status: "active", userId: 7, name: "old" })
    const updated = { ...existing, name: "renamed" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { name: "renamed" })

    expect(mockGateway.emitStarted).not.toHaveBeenCalled()
    expect(mockGateway.emitStopped).not.toHaveBeenCalled()
    expect(mockGateway.emitError).not.toHaveBeenCalled()
  })

  it("invalid transitions emit nothing to the gateway", async () => {
    const existing = streamFixture({ status: "active" })
    mockRepo.findById.mockResolvedValue(existing)

    await expect(service.update(2, { status: "active" })).rejects.toThrow(
      ConflictException,
    )
    expect(mockGateway.emitStarted).not.toHaveBeenCalled()
    expect(mockGateway.emitStopped).not.toHaveBeenCalled()
    expect(mockGateway.emitError).not.toHaveBeenCalled()
  })

  it("a rejected webhook dispatch does not suppress the socket emit", async () => {
    const existing = streamFixture({ status: "inactive", userId: 7 })
    const updated = { ...existing, status: "active" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)
    mockWebhooksService.dispatchStreamEvent.mockRejectedValue(
      new Error("subscriber unreachable"),
    )

    await service.update(1, { status: "active" })

    // The webhook failure is swallowed (fire-and-forget) and the socket
    // emit still fires — the two side effects are independent.
    expect(mockGateway.emitStarted).toHaveBeenCalledTimes(1)
  })

  it("update status active -> inactive dispatches a stream:stopped webhook event", async () => {
    const existing = streamFixture({ status: "active", userId: 7 })
    const updated = { ...existing, status: "inactive" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { status: "inactive" })

    expect(mockWebhooksService.dispatchStreamEvent).toHaveBeenCalledWith(
      1,
      "stream:stopped",
      expect.objectContaining({ streamId: 1, userId: 7 }),
    )
  })

  it("update without a status change does not dispatch a webhook event", async () => {
    const existing = streamFixture({ status: "active", userId: 7, name: "old" })
    const updated = { ...existing, name: "renamed" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { name: "renamed" })

    expect(mockWebhooksService.dispatchStreamEvent).not.toHaveBeenCalled()
  })

  it("update status active -> active throws ConflictException", async () => {
    const existing = streamFixture({ id: 2, status: "active" })
    mockRepo.findById.mockResolvedValue(existing)
    await expect(service.update(2, { status: "active" })).rejects.toThrow(ConflictException)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it("update status error -> active throws ConflictException", async () => {
    const existing = streamFixture({ id: 3, status: "error" })
    mockRepo.findById.mockResolvedValue(existing)
    await expect(service.update(3, { status: "active" })).rejects.toThrow(ConflictException)
  })

  // ── Event ingestion (#514) ──────────────────────────────────────────────

  it("ingestEvent delegates to the repository with a server-stamped timestamp", async () => {
    const pending = {
      streamId: "7",
      data: { viewerId: "u1" },
      timestamp: "2026-08-01T00:00:00.000Z",
    }
    mockRepo.insertPendingEvent.mockResolvedValue(pending)

    const result = await service.ingestEvent({
      streamId: "7",
      data: { viewerId: "u1" },
    })

    // The timestamp is supplied by the server (Issue #514: trusting client
    // clocks for latency metrics is a correctness risk).
    expect(mockRepo.insertPendingEvent).toHaveBeenCalledWith(
      7,
      { viewerId: "u1" },
      expect.any(Date),
    )
    expect(result).toEqual(pending)
  })

  it("ingestEvent rejects oversize payloads without touching the repository", async () => {
    const bigData = { blob: "x".repeat(64 * 1024) }

    await expect(
      service.ingestEvent({ streamId: "7", data: bigData }),
    ).rejects.toThrow(PayloadTooLargeException)
    expect(mockRepo.insertPendingEvent).not.toHaveBeenCalled()
  })

  it("getPendingEvents delegates to the repository", async () => {
    mockRepo.getPendingEvents.mockResolvedValue({
      data: [],
      nextCursor: null,
    })

    await service.getPendingEvents(100, 0)

    expect(mockRepo.getPendingEvents).toHaveBeenCalledWith(100, 0)
  })

  it("delete existing stream resolves", async () => {
    mockRepo.delete.mockResolvedValue(true)
    await expect(service.delete(1)).resolves.toBeUndefined()
  })

  it("delete non-existent stream throws NotFoundException", async () => {
    mockRepo.delete.mockResolvedValue(false)
    await expect(service.delete(999)).rejects.toThrow(NotFoundException)
  })

  it("getAnalytics checks stream existence before loading analytics", async () => {
    const stream = streamFixture({ id: 4, status: "active" })
    const analytics = {
      streamId: 4,
      totalEventsProcessed: { last24h: 1, last7d: 2, last30d: 3 },
      errorRate: { window: "30d", totalEvents: 3, errorEvents: 1, percentage: 33.33 },
      processingLatency: { window: "30d", averageMs: 10, p99Ms: 25 },
      eventsPerMinute: [],
      generatedAt: new Date().toISOString(),
    }
    mockRepo.findById.mockResolvedValue(stream)
    mockRepo.getAnalytics.mockResolvedValue(analytics)

    await expect(service.getAnalytics(4)).resolves.toBe(analytics)
    expect(mockRepo.findById).toHaveBeenCalledWith(4)
    expect(mockRepo.getAnalytics).toHaveBeenCalledWith(4)
  })

  it("getAnalytics missing stream throws NotFoundException", async () => {
    mockRepo.findById.mockResolvedValue(undefined)

    await expect(service.getAnalytics(404)).rejects.toThrow(NotFoundException)
    expect(mockRepo.getAnalytics).not.toHaveBeenCalled()
  })

  // ── Stream event replay (#396) ───────────────────────────────────────────

  it("listEvents returns paginated events for an existing stream", async () => {
    const stream = streamFixture()
    const events = [
      {
        id: "3",
        streamId: "1",
        eventType: "viewer:joined" as const,
        payload: { viewerId: "u3" },
        occurredAt: "2026-08-01T00:00:02.000Z",
      },
      {
        id: "2",
        streamId: "1",
        eventType: "viewer:joined" as const,
        payload: { viewerId: "u2" },
        occurredAt: "2026-08-01T00:00:01.000Z",
      },
      {
        id: "1",
        streamId: "1",
        eventType: "viewer:joined" as const,
        payload: { viewerId: "u1" },
        occurredAt: "2026-08-01T00:00:00.000Z",
      },
    ]
    mockRepo.findById.mockResolvedValue(stream)
    mockRepo.listEventsForStream.mockResolvedValue({ items: events, total: 3 })

    const res = await service.listEvents(1, 1, 50)
    expect(res.data).toHaveLength(3)
    expect(res.total).toBe(3)
    expect(res.hasMore).toBe(false)
    expect(mockRepo.listEventsForStream).toHaveBeenCalledWith(1, 1, 50)
  })

  it("listEvents paginates correctly when more pages remain", async () => {
    const stream = streamFixture()
    const events = [
      {
        id: "5",
        streamId: "1",
        eventType: "viewer:left" as const,
        payload: { viewerId: "u5" },
        occurredAt: "2026-08-01T00:00:05.000Z",
      },
    ]
    mockRepo.findById.mockResolvedValue(stream)
    mockRepo.listEventsForStream.mockResolvedValue({ items: events, total: 7 })

    const res = await service.listEvents(1, 2, 3)
    expect(res.data).toHaveLength(1)
    expect(res.hasMore).toBe(true)
  })

  it("listEvents throws NotFoundException for a missing stream", async () => {
    mockRepo.findById.mockResolvedValue(undefined)
    await expect(service.listEvents(404, 1, 50)).rejects.toThrow(NotFoundException)
    expect(mockRepo.listEventsForStream).not.toHaveBeenCalled()
  })
})

/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================
// PROPERTY-BASED TESTS FOR STREAM STATUS TRANSITIONS + VISIBILITY TRANSITIONS
// ============================================
describe("StreamsService - Property-Based Tests", () => {
  let service: StreamsService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      listPaginated: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      listEventsForStream: jest.fn(),
    };
    const mockWebhooksService = { sendStreamEvent: jest.fn() };
    const mockTagsService = { listForStreamIds: jest.fn().mockResolvedValue(new Map()) };
    service = new StreamsService(mockRepo, mockWebhooksService as any, mockTagsService as any);
  });

  it("should correctly implement the allowed transition rules", () => {
    const statuses = ["inactive", "active", "error"] as const;

    const allowedTransitions: Record<string, string[]> = {
      "inactive": ["active", "error"],
      "active": ["inactive", "error"],
      "error": ["inactive"],
    };

    fc.assert(
      fc.property(
        fc.constantFrom(...statuses),
        fc.constantFrom(...statuses),
        (currentStatus: string, nextStatus: string) => {
          const shouldBeAllowed = allowedTransitions[currentStatus]?.includes(nextStatus) || false;

          let wasAllowed = false;
          let errorThrown = null;

          try {
            (service as any).validateStatusTransition(currentStatus, nextStatus);
            wasAllowed = true;
          } catch (error) {
            errorThrown = error;
          }

          expect(wasAllowed).toBe(shouldBeAllowed);

          if (!shouldBeAllowed) {
            expect(errorThrown).toBeDefined();
            expect(errorThrown).toBeInstanceOf(ConflictException);
          }
        }
      )
    );
  });

  it("should have antisymmetric transition rules", () => {
    const statuses = ["inactive", "active", "error"] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...statuses),
        fc.constantFrom(...statuses),
        (statusA: string, statusB: string) => {
          if (statusA === statusB) {
            return true;
          }

          const aToBAllowed = isTransitionAllowed(service, statusA, statusB);
          const bToAAllowed = isTransitionAllowed(service, statusB, statusA);

          if (statusA === "inactive" && statusB === "active") {
            expect(aToBAllowed).toBe(true);
            expect(bToAAllowed).toBe(true);
          } else if (statusA === "inactive" && statusB === "error") {
            expect(aToBAllowed).toBe(true);
            expect(bToAAllowed).toBe(true);
          } else if (statusA === "active" && statusB === "error") {
            expect(aToBAllowed).toBe(true);
            expect(bToAAllowed).toBe(false);
          }
        }
      )
    );
  });

  it("should allow transition from inactive to error", () => {
    expect(() => {
      (service as any).validateStatusTransition("inactive", "error");
    }).not.toThrow();
  });

  it("should allow transition from error to inactive", () => {
    expect(() => {
      (service as any).validateStatusTransition("error", "inactive");
    }).not.toThrow();
  });

  it("should NOT allow transition from error to error", () => {
    expect(() => {
      (service as any).validateStatusTransition("error", "error");
    }).toThrow(ConflictException);
  });

  it("should NOT allow transition from error to active", () => {
    expect(() => {
      (service as any).validateStatusTransition("error", "active");
    }).toThrow(ConflictException);
  });

  it("should allow transition from active to error", () => {
    expect(() => {
      (service as any).validateStatusTransition("active", "error");
    }).not.toThrow();
  });

  it("should allow transition from inactive to active", () => {
    expect(() => {
      (service as any).validateStatusTransition("inactive", "active");
    }).not.toThrow();
  });

  it("should allow transition from active to inactive", () => {
    expect(() => {
      (service as any).validateStatusTransition("active", "inactive");
    }).not.toThrow();
  });

  it("should only allow the defined transitions", () => {
    const allStatuses = ["inactive", "active", "error"] as const;
    const validTransitions: [string, string][] = [
      ["inactive", "active"],
      ["inactive", "error"],
      ["active", "inactive"],
      ["active", "error"],
      ["error", "inactive"]
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...allStatuses),
        fc.constantFrom(...allStatuses),
        (current: string, next: string) => {
          const isExpectedValid = validTransitions.some(
            ([c, n]) => c === current && n === next
          );

          let isActuallyValid = false;
          try {
            (service as any).validateStatusTransition(current, next);
            isActuallyValid = true;
          } catch (error) {
            isActuallyValid = false;
          }

          expect(isActuallyValid).toBe(isExpectedValid);
        }
      )
    );
  });

  function isTransitionAllowed(service: StreamsService, current: string, next: string): boolean {
    try {
      (service as any).validateStatusTransition(current, next);
      return true;
    } catch (error) {
      return false;
    }
  }
});

// ============================================
// VISIBILITY PROPERTY-BASED TESTS (issue #393)
// ============================================
describe("StreamsService - Visibility transitions (issue #393)", () => {
  let mockRepo: any
  let service: StreamsService

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      listPaginated: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      listEventsForStream: jest.fn(),
    }
    const mockWebhooksService = { dispatchStreamEvent: jest.fn() }
    const mockTagsService = { listForStreamIds: jest.fn().mockResolvedValue(new Map()) }
    service = new StreamsService(
      mockRepo,
      mockWebhooksService as any,
      mockTagsService as any,
    )
  })

  it("any visibility -> any visibility is allowed (no state machine)", async () => {
    const visibilities = ["public", "private"] as const
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...visibilities),
        fc.constantFrom(...visibilities),
        async (from: string, to: string): Promise<void> => {
          const existing = {
            id: 1,
            userId: 1,
            name: "s",
            description: null,
            status: "inactive" as const,
            visibility: from,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          mockRepo.findById.mockResolvedValue(existing)
          mockRepo.update.mockResolvedValue({ ...existing, visibility: to })
          let ok = true
          try {
            await service.update(1, { visibility: to as "public" | "private" })
          } catch {
            ok = false
          }
          expect(ok).toBe(true)
        },
      ),
    )
  })
})
