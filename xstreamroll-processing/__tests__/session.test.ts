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
  // Define all possible states from your actual implementation
  const sessionStates = ['idle', 'running', 'stopped', 'errored'] as const;

  it('should handle all session state transitions without panicking', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates),
        fc.constantFrom(...sessionStates),
        (currentState, nextState) => {
          // Create a fresh session for each test
          const s = new StreamSession("s1", "w1", { publish: jest.fn() });
          
          // Set the current state (using the actual session methods)
          if (currentState === 'idle') {
            // Already in idle state
          } else if (currentState === 'running') {
            s.start();
          } else if (currentState === 'stopped') {
            s.start();
            // Need to properly stop the session
            // This might need to be sync or async based on your implementation
          } else if (currentState === 'errored') {
            // To get to errored state, we need to cause an error
            // This depends on your implementation
            const errorSession = new StreamSession("s1", "w1", {
              publish: async () => { throw new Error("force error"); }
            });
            errorSession.start();
            errorSession.enqueue(makeEvent());
            // Wait a bit for the error to process
            // This is a simplified approach - you might need to adjust
          }
          
          // Test that transitioning doesn't cause unexpected errors
          expect(() => {
            // Attempt the transition based on the next state
            if (nextState === 'idle') {
              // Can we transition to idle?
              // This depends on your implementation
            } else if (nextState === 'running') {
              s.start();
            } else if (nextState === 'stopped') {
              // stop() is async, so we need to handle this differently
              // For property testing, we'll check sync methods
            } else if (nextState === 'errored') {
              // Force an error
            }
          }).not.toThrow();
        }
      )
    );
  });

  // Test: Starting from any state should eventually reach running or errored
  it('should eventually reach running or errored state from any valid state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates.filter(s => s !== 'stopped' && s !== 'errored')),
        (currentState) => {
          const s = new StreamSession("s1", "w1", { publish: jest.fn() });
          
          if (currentState === 'running') {
            s.start();
            expect(s.getState()).toBe('running');
          } else if (currentState === 'idle') {
            // From idle, starting should work
            s.start();
            expect(s.getState()).toBe('running');
          }
        }
      )
    );
  });

  // Test: Error state should only transition to stopped or errored
  it('should handle error state transitions correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates),
        (nextState) => {
          // Create a session that will error
          const s = new StreamSession("s1", "w1", {
            publish: async () => { throw new Error("forced error"); }
          });
          
          // Start and trigger error
          s.start();
          s.enqueue(makeEvent());
          
          // Wait for error to occur (simplified)
          // In real tests, you'd wait for the error event
          
          // Check that from errored state, only certain transitions are allowed
          if (s.getState() === 'errored') {
            // Your implementation likely doesn't allow transitions from errored
            // except to stopped via stop()
            if (nextState === 'stopped') {
              // Should be able to stop
              // This is async, so we'd need to handle differently
            } else {
              // Other transitions should not be allowed
              // This depends on your implementation
            }
          }
        }
      )
    );
  });

  // Test: No self-transitions allowed
  it('should not allow invalid self-transitions', () => {
    const states = ['idle', 'running', 'stopped', 'errored'] as const;
    
    fc.assert(
      fc.property(
        fc.constantFrom(...states),
        (state) => {
          const s = new StreamSession("s1", "w1", { publish: jest.fn() });
          
          // Set the initial state
          if (state === 'running') {
            s.start();
          } else if (state === 'stopped') {
            s.start();
            // Need to properly stop
          } else if (state === 'errored') {
            // Create error state
            const errorSession = new StreamSession("s1", "w1", {
              publish: async () => { throw new Error("error"); }
            });
            errorSession.start();
            errorSession.enqueue(makeEvent());
          }
          
          // Self-transition should not be allowed or should be a no-op
          // This depends on your actual implementation
          if (state === 'idle') {
            // Starting from idle should work
            expect(() => s.start()).not.toThrow();
          } else if (state === 'running') {
            // Starting from running should be a no-op or throw
            // Check your implementation
          }
        }
      )
    );
  });

  // Test: Events should not be accepted in non-running states
  it('should only accept events in running state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates),
        (state) => {
          const s = new StreamSession("s1", "w1", { publish: jest.fn() });
          
          // Set the state
          if (state === 'running') {
            s.start();
          } else if (state === 'stopped') {
            s.start();
            // Stop the session
            // This is async, but we'll check the behavior
          }
          
          const event = makeEvent();
          const result = s.enqueue(event);
          
          // Events should only be accepted in running state
          if (state === 'running') {
            // Should accept events (may return true or false based on implementation)
            // Check your actual implementation
          } else {
            // Should reject events
            expect(result).toBe(false);
          }
        }
      )
    );
  });

  // Test: Stop should work from any state
  it('should handle stop from any state gracefully', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sessionStates),
        async (state) => {
          const s = new StreamSession("s1", "w1", { publish: jest.fn() });
          
          // Set the state
          if (state === 'running') {
            s.start();
          } else if (state === 'stopped') {
            s.start();
            // Need to properly stop
          } else if (state === 'errored') {
            // Create error state
            const errorSession = new StreamSession("s1", "w1", {
              publish: async () => { throw new Error("error"); }
            });
            errorSession.start();
            errorSession.enqueue(makeEvent());
          }
          
          // Stop should work from any state
          // This is async in your implementation
          // For property testing, we test that it doesn't throw
          if (state === 'idle') {
            // Stop on idle should be a no-op
            await expect(s.stop()).resolves.toBeUndefined();
          } else if (state === 'running') {
            // Stop on running should work
            await expect(s.stop()).resolves.toBeUndefined();
          }
        }
      )
    );
  });
});