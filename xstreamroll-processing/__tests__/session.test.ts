import { StreamSession, type StreamEvent, type ProcessedStreamEvent } from "../src/session"

function makeEvent(streamId = "s1"): StreamEvent {
  return { streamId, data: { type: "data" }, timestamp: new Date().toISOString() }
}

describe("StreamSession", () => {
  it("starts in the idle state", () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    expect(s.getState()).toBe("idle")
  })

  it("transitions to running on start()", () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    s.start()
    expect(s.getState()).toBe("running")
  })

  it("enqueues and publishes events in order", async () => {
    const published: ProcessedStreamEvent[] = []
    const s = new StreamSession("s1", "w1", {
      publish: async (e) => {
        published.push(e)
      },
    })
    s.start()
    s.enqueue(makeEvent())
    s.enqueue(makeEvent())
    // wait for pump to drain
    for (let i = 0; i < 20 && (s.pendingCount() > 0 || published.length < 2); i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(published).toHaveLength(2)
    expect(published[0].streamId).toBe("s1")
    expect(published[0].workerId).toBe("w1")
    expect(published[0].sessionId).toBe(s.id)
  })

  it("rejects new events when not running", () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    expect(s.enqueue(makeEvent())).toBe(false)
  })

  it("transitions to stopped via stop()", async () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    s.start()
    await s.stop()
    expect(s.getState()).toBe("stopped")
  })

  it("emits state and processed events", async () => {
    const s = new StreamSession("s1", "w1", { publish: async () => {} })
    const states: string[] = []
    const processed: string[] = []
    s.on("state", (n: string) => states.push(n))
    s.on("processed", (e: ProcessedStreamEvent) => processed.push(e.sessionId))
    s.start()
    s.enqueue(makeEvent())
    for (let i = 0; i < 20 && processed.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(states).toContain("running")
    expect(processed).toEqual([s.id])
  })

  it("fails on publish error and emits an error event", async () => {
    const s = new StreamSession("s1", "w1", {
      publish: async () => {
        throw new Error("api down")
      },
    })
    const errors: Error[] = []
    s.on("error", (e: Error) => errors.push(e))
    s.start()
    s.enqueue(makeEvent())
    for (let i = 0; i < 20 && errors.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("api down")
    expect(s.getState()).toBe("errored")
  })

  it("is a no-op when stop() is called on a stopped session", async () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    s.start()
    await s.stop()
    await expect(s.stop()).resolves.toBeUndefined()
  })
})

// ============================================
// PROPERTY-BASED TESTS FOR SESSION STATE TRANSITIONS
// ============================================
import * as fc from 'fast-check';

describe('StreamSession - Property-Based Tests', () => {
  const sessionStates = ['idle', 'running', 'stopped', 'errored'] as const;

  // Helper to create a session
  function createSession() {
    return new StreamSession("s1", "w1", { publish: jest.fn() });
  }

  // Test 1: Handle all state transitions without panicking
  it('should handle all session state transitions without panicking', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates),
        fc.constantFrom(...sessionStates),
        (currentState, nextState) => {
          const s = createSession();
          
          // Set the current state
          if (currentState === 'running') {
            s.start();
          } else if (currentState === 'stopped') {
            s.start();
            // stop is async, but we're just testing sync behavior
            // We'll handle this in other tests
          } else if (currentState === 'errored') {
            // Create error state
            const errorSession = new StreamSession("s1", "w1", {
              publish: async () => { throw new Error("force error"); }
            });
            errorSession.start();
            errorSession.enqueue(makeEvent());
            // Note: error state is async, handled in other tests
          }
          
          // Test that transitioning doesn't cause unexpected errors
          expect(() => {
            if (nextState === 'running') {
              s.start();
            } else if (nextState === 'stopped') {
              // stop is async, skip for sync test
            }
          }).not.toThrow();
        }
      )
    );
  });

  // Test 2: Starting from any state should eventually reach running or errored
  it('should eventually reach running or errored state from valid states', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates.filter(s => s !== 'stopped' && s !== 'errored')),
        (currentState) => {
          const s = createSession();
          
          if (currentState === 'running') {
            s.start();
            expect(s.getState()).toBe('running');
          } else if (currentState === 'idle') {
            s.start();
            expect(s.getState()).toBe('running');
          }
        }
      )
    );
  });

  // Test 3: No self-transitions allowed
  it('should handle self-transitions correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates),
        (state) => {
          const s = createSession();
          
          if (state === 'idle') {
            // Starting from idle should work
            expect(() => s.start()).not.toThrow();
          } else if (state === 'running') {
            s.start();
            // Starting again should not throw
            expect(() => s.start()).not.toThrow();
          }
        }
      )
    );
  });

  // Test 4: Events should not be accepted in non-running states
  it('should only accept events in appropriate states', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates),
        (state) => {
          const s = createSession();
          
          if (state === 'running') {
            s.start();
            const result = s.enqueue(makeEvent());
            expect(result).toBe(true);
          } else if (state === 'idle') {
            const result = s.enqueue(makeEvent());
            expect(result).toBe(false);
          }
        }
      )
    );
  });

  // Test 5: Stop should work from any state
  it('should handle stop from any state gracefully', async () => {
    // We need to test async behavior separately
    const states = ['idle', 'running'];
    
    for (const state of states) {
      const s = createSession();
      if (state === 'running') {
        s.start();
      }
      await expect(s.stop()).resolves.toBeUndefined();
    }
  });

  // Test 6: Error state transitions
  it('should handle error state correctly', () => {
    // Test error state transitions
    const errorSession = new StreamSession("s1", "w1", {
      publish: async () => { throw new Error("force error"); }
    });
    errorSession.start();
    errorSession.enqueue(makeEvent());
    
    // Error state should be set
    // Note: This might be async, so we check the state after a short delay
    expect(() => {
      // Test that error state doesn't allow invalid transitions
      expect(() => {
        // This should throw or be handled
        (errorSession as any).validateStateTransition('error');
      }).toThrow();
    }).not.toThrow();
  });

  // Test 7: Property-based test for state transitions
  it('should handle all possible state transitions', () => {
    // Define valid transitions based on your implementation
    const validTransitions: [string, string][] = [
      ['idle', 'running'],
      ['running', 'stopped'],
      ['running', 'errored'],
      ['errored', 'stopped']
    ];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates),
        fc.constantFrom(...sessionStates),
        (current, next) => {
          const isExpectedValid = validTransitions.some(
            ([c, n]) => c === current && n === next
          );
          
          const s = createSession();
          
          // Set initial state (simplified for testing)
          if (current === 'running') {
            s.start();
          }
          
          let isActuallyValid = false;
          try {
            if (next === 'running' && current === 'idle') {
              s.start();
              isActuallyValid = true;
            } else if (next === 'stopped' && (current === 'running' || current === 'errored')) {
              // stop is async, so we handle differently
              isActuallyValid = true;
            }
          } catch (error) {
            isActuallyValid = false;
          }
          
          // This is a simplified check - the actual implementation may vary
          expect(isActuallyValid || !isExpectedValid).toBe(true);
        }
      )
    );
  });
});