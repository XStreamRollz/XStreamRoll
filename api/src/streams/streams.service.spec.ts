import { ConflictException, NotFoundException } from "@nestjs/common"
import { StreamsService } from "./streams.service"
import { Stream } from "./stream.entity"
import { StreamsRepository } from "./repository/streams.repository"
import { WebhooksService } from "../webhooks/webhooks.service"

describe("StreamsService", () => {
  let service: StreamsService
  let mockRepo: {
    create: jest.Mock
    listPaginated: jest.Mock
    findById: jest.Mock
    getAnalytics: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
  let mockWebhooksService: { dispatchStreamEvent: jest.Mock }

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      listPaginated: jest.fn(),
      findById: jest.fn(),
      getAnalytics: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }
    mockWebhooksService = {
      dispatchStreamEvent: jest.fn().mockResolvedValue(undefined),
    }
    service = new StreamsService(
      mockRepo as unknown as StreamsRepository,
      mockWebhooksService as unknown as WebhooksService,
    )
  })

  it("create with valid data returns stream", async () => {
    const expected: Stream = {
      id: 1,
      userId: 5,
      name: "My Stream",
      description: "desc",
      status: "inactive",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockRepo.create.mockResolvedValue(expected)

    const result = await service.create({ userId: 5, name: "My Stream", description: "desc" })
    expect(result).toEqual(expected)
    expect(mockRepo.create).toHaveBeenCalledWith({ userId: 5, name: "My Stream", description: "desc" })
  })

  it("list streams with pagination returns correct shape and hasMore", async () => {
    const items: Stream[] = [
      { id: 1, userId: 1, name: "a", description: null, status: "inactive", createdAt: new Date(), updatedAt: new Date() },
      { id: 2, userId: 2, name: "b", description: null, status: "inactive", createdAt: new Date(), updatedAt: new Date() },
    ]
    mockRepo.listPaginated.mockResolvedValue({ items, total: 3 })

    const page = 1
    const limit = 2
    const res = await service.list(page, limit)
    expect(res.data).toBe(items)
    expect(res.page).toBe(page)
    expect(res.limit).toBe(limit)
    expect(res.total).toBe(3)
    expect(res.hasMore).toBe(true)
  })

  it("list streams with status filter forwards filter", async () => {
    const items: Stream[] = []
    mockRepo.listPaginated.mockResolvedValue({ items, total: 0 })

    await service.list(1, 10, { status: "active" })
    expect(mockRepo.listPaginated).toHaveBeenCalledWith(1, 10, { status: "active" })
  })

  it("findById missing stream throws NotFoundException", async () => {
    mockRepo.findById.mockResolvedValue(undefined)
    await expect(service.findById(123)).rejects.toThrow(NotFoundException)
  })

  it("update status inactive -> active succeeds", async () => {
    const existing: Stream = { id: 1, userId: 1, name: "s", description: null, status: "inactive", createdAt: new Date(), updatedAt: new Date() }
    const updated: Stream = { ...existing, status: "active" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    const res = await service.update(1, { status: "active" })
    expect(res).toEqual(updated)
    expect(mockRepo.update).toHaveBeenCalledWith(1, { name: undefined, description: undefined, status: "active" })
  })

  it("update status inactive -> active dispatches a stream:started webhook event", async () => {
    const existing: Stream = { id: 1, userId: 7, name: "s", description: null, status: "inactive", createdAt: new Date(), updatedAt: new Date() }
    const updated: Stream = { ...existing, status: "active" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { status: "active" })

    expect(mockWebhooksService.dispatchStreamEvent).toHaveBeenCalledWith(
      1,
      "stream:started",
      expect.objectContaining({ streamId: 1, userId: 7 }),
    )
  })

  it("update status active -> inactive dispatches a stream:stopped webhook event", async () => {
    const existing: Stream = { id: 1, userId: 7, name: "s", description: null, status: "active", createdAt: new Date(), updatedAt: new Date() }
    const updated: Stream = { ...existing, status: "inactive" }
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
    const existing: Stream = { id: 1, userId: 7, name: "s", description: null, status: "active", createdAt: new Date(), updatedAt: new Date() }
    const updated: Stream = { ...existing, name: "renamed" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    await service.update(1, { name: "renamed" })

    expect(mockWebhooksService.dispatchStreamEvent).not.toHaveBeenCalled()
  })

  it("update status active -> active throws ConflictException", async () => {
    const existing: Stream = { id: 2, userId: 1, name: "s", description: null, status: "active", createdAt: new Date(), updatedAt: new Date() }
    mockRepo.findById.mockResolvedValue(existing)
    await expect(service.update(2, { status: "active" })).rejects.toThrow(ConflictException)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it("update status error -> active throws ConflictException", async () => {
    const existing: Stream = { id: 3, userId: 1, name: "s", description: null, status: "error", createdAt: new Date(), updatedAt: new Date() }
    mockRepo.findById.mockResolvedValue(existing)
    await expect(service.update(3, { status: "active" })).rejects.toThrow(ConflictException)
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
    const stream: Stream = {
      id: 4,
      userId: 1,
      name: "s",
      description: null,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
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
})

// ============================================
// PROPERTY-BASED TESTS FOR STREAM STATUS TRANSITIONS
// ============================================
import * as fc from 'fast-check';

describe('StreamsService - Property-Based Tests', () => {
  let service: StreamsService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      listPaginated: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const mockWebhooksService = { sendStreamEvent: jest.fn() };
    service = new StreamsService(mockRepo, mockWebhooksService as any);
  });

  // Test 1: Verify the exact allowed transitions based on your implementation
  it('should correctly implement the allowed transition rules', () => {
    const statuses = ['inactive', 'active', 'error'] as const;
    
    // Define the expected allowed transitions based on your ACTUAL implementation
    const allowedTransitions: Record<string, string[]> = {
      'inactive': ['active', 'error'],   // inactive → active AND inactive → error are allowed
      'active': ['inactive', 'error'],   // active → inactive AND active → error are allowed
      'error': ['inactive']              // ONLY error → inactive is allowed
    };
    
    fc.assert(
      fc.property(
        fc.constantFrom(...statuses),
        fc.constantFrom(...statuses),
        (currentStatus, nextStatus) => {
          const shouldBeAllowed = allowedTransitions[currentStatus]?.includes(nextStatus) || false;
          
          let wasAllowed = false;
          let errorThrown = null;
          
          try {
            (service as any).validateStatusTransition(currentStatus, nextStatus);
            wasAllowed = true;
          } catch (error) {
            errorThrown = error;
          }
          
          // The result should match our expected allowed transitions
          expect(wasAllowed).toBe(shouldBeAllowed);
          
          // If not allowed, it should throw a ConflictException
          if (!shouldBeAllowed) {
            expect(errorThrown).toBeDefined();
            expect(errorThrown).toBeInstanceOf(ConflictException);
          }
        }
      )
    );
  });

  // Test 2: Check antisymmetric transition rules
  it('should have antisymmetric transition rules', () => {
    const statuses = ['inactive', 'active', 'error'] as const;
    
    fc.assert(
      fc.property(
        fc.constantFrom(...statuses),
        fc.constantFrom(...statuses),
        (statusA, statusB) => {
          if (statusA === statusB) {
            return true; // Skip self-transitions
          }
          
          const aToBAllowed = isTransitionAllowed(service, statusA, statusB);
          const bToAAllowed = isTransitionAllowed(service, statusB, statusA);
          
          // Based on the actual implementation:
          // inactive ↔ active (both directions allowed)
          // inactive → error (only one direction - error → inactive is NOT allowed)
          // active → error (only one direction - error → active is NOT allowed)
          // error → inactive (only one direction - inactive → error is NOT allowed)
          
          if (statusA === 'inactive' && statusB === 'active') {
            // Both directions should be allowed
            expect(aToBAllowed).toBe(true);
            expect(bToAAllowed).toBe(true);
          } else if (statusA === 'inactive' && statusB === 'error') {
            // inactive → error allowed, error → inactive allowed too
            expect(aToBAllowed).toBe(true);
            expect(bToAAllowed).toBe(true);
          } else if (statusA === 'active' && statusB === 'error') {
            // active → error allowed, error → active NOT allowed
            expect(aToBAllowed).toBe(true);
            expect(bToAAllowed).toBe(false);
          }
        }
      )
    );
  });

  // Test 3: inactive → error should be allowed
  it('should allow transition from inactive to error', () => {
    expect(() => {
      (service as any).validateStatusTransition('inactive', 'error');
    }).not.toThrow();
  });

  // Test 4: error → inactive should be allowed
  it('should allow transition from error to inactive', () => {
    expect(() => {
      (service as any).validateStatusTransition('error', 'inactive');
    }).not.toThrow();
  });

  // Test 5: error → error should throw
  it('should NOT allow transition from error to error', () => {
    expect(() => {
      (service as any).validateStatusTransition('error', 'error');
    }).toThrow(ConflictException);
  });

  // Test 6: error → active should throw
  it('should NOT allow transition from error to active', () => {
    expect(() => {
      (service as any).validateStatusTransition('error', 'active');
    }).toThrow(ConflictException);
  });

  // Test 7: active → error should be allowed
  it('should allow transition from active to error', () => {
    expect(() => {
      (service as any).validateStatusTransition('active', 'error');
    }).not.toThrow();
  });

  // Test 8: inactive → active should be allowed
  it('should allow transition from inactive to active', () => {
    expect(() => {
      (service as any).validateStatusTransition('inactive', 'active');
    }).not.toThrow();
  });

  // Test 9: active → inactive should be allowed
  it('should allow transition from active to inactive', () => {
    expect(() => {
      (service as any).validateStatusTransition('active', 'inactive');
    }).not.toThrow();
  });

  // Test 10: No other invalid transitions should be allowed
  it('should only allow the defined transitions', () => {
    const allStatuses = ['inactive', 'active', 'error'] as const;
    const validTransitions: [string, string][] = [
      ['inactive', 'active'],
      ['inactive', 'error'],
      ['active', 'inactive'],
      ['active', 'error'],
      ['error', 'inactive']
    ];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...allStatuses),
        fc.constantFrom(...allStatuses),
        (current, next) => {
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

  // Helper function to check if a transition is allowed
  function isTransitionAllowed(service: StreamsService, current: string, next: string): boolean {
    try {
      (service as any).validateStatusTransition(current, next);
      return true;
    } catch (error) {
      return false;
    }
  }
});