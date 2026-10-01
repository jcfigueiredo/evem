
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '~/eventEmitter';

describe('EvEm - Edge Cases and Special Scenarios Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should handle a callback that subscribes to another event', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn(() => {
      emitter.subscribe('event2', callback1);
    });

    emitter.subscribe('event1', callback2);
    emitter.publish('event1');

    emitter.publish('event2');
    expect(callback1).toHaveBeenCalled();
  });

  test('should handle a callback that unsubscribes another callback', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn(() => {
      emitter.unsubscribe('event', callback1);
    });

    emitter.subscribe('event', callback1);
    emitter.subscribe('event', callback2);

    emitter.publish('event');
    emitter.publish('event');

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(2);
  });

  test('should throw an error when maximum recursion depth is exceeded', async () => {
    // We need to modify our approach since errors in callbacks are now caught 
    // rather than propagated with our cancelable events implementation
    
    // Set up a spy on console.error to capture the error message
    const consoleErrorSpy = vi.spyOn(console, 'error');
    
    let recursionCount = 0;
    emitter.subscribe('recursive.event', async () => {
      if (++recursionCount < 4) {
        await emitter.publish('recursive.event');
      }
    });

    // The publish call will now complete, but it will log an error
    await emitter.publish('recursive.event');
    
    // Verify that the error about max recursion depth was logged
    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorArgs = consoleErrorSpy.mock.calls.find(
      args => args[0] === 'Error in event handler for "recursive.event":'
    );
    expect(errorArgs).toBeDefined();
    expect(errorArgs![1].message).toBe("Max recursion depth of 3 exceeded for event 'recursive.event'");
    
    // Restore the original console.error
    consoleErrorSpy.mockRestore();
  });

  test('should handle unexpected input types gracefully', () => {

    const callback = vi.fn(() => {
      throw new Error('Callback Error');
    });

    expect(() => emitter.subscribe('event', callback)).not.toThrow();
    expect(() => emitter.unsubscribe('event', callback)).not.toThrow();

    expect(() => emitter.publish('event', null));

  });
});

describe('EvEm - Custom Recursion Limit Tests', () => {
  test('should allow setting a custom maximum recursion depth', async () => {
    // Similar approach as the previous test, but with a custom recursion depth
    const customMaxDepth = 5;
    const emitter = new EvEm(customMaxDepth);
    
    // Set up a spy on console.error
    const consoleErrorSpy = vi.spyOn(console, 'error');
    
    let recursionCount = 0;
    emitter.subscribe('recursive.event', async () => {
      if (++recursionCount < customMaxDepth + 1) {
        await emitter.publish('recursive.event');
      }
    });

    // The publish call will complete but log an error
    await emitter.publish('recursive.event');
    
    // Verify the correct error was logged
    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorArgs = consoleErrorSpy.mock.calls.find(
      args => args[0] === 'Error in event handler for "recursive.event":'
    );
    expect(errorArgs).toBeDefined();
    expect(errorArgs![1].message).toBe(`Max recursion depth of ${customMaxDepth} exceeded for event 'recursive.event'`);
    
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });
});
describe('EvEm - Recursion guard vs. concurrency', () => {
  const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

  test('concurrent publishes of the same event are not treated as recursion', async () => {
    const emitter = new EvEm();
    const received: number[] = [];
    emitter.subscribe('slow.event', async (n: number) => {
      await tick(5);
      received.push(n);
    });

    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map(n => emitter.publish('slow.event', n))
    );

    expect(results).toEqual([true, true, true, true, true, true]);
    expect(received.sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('concurrent publishes are not treated as recursion when middleware is registered', async () => {
    const emitter = new EvEm();
    emitter.use((_event, data) => data);
    const handler = vi.fn();
    emitter.subscribe('fast.event', handler);

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(n => emitter.publish('fast.event', n))
    );

    expect(results.every(Boolean)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(5);
  });

  test('an event rerouted by middleware can be published more than maxRecursionDepth times', async () => {
    const emitter = new EvEm();
    emitter.use((event, data) => (event === 'legacy.event' ? { event: 'new.event', data } : data));
    const handler = vi.fn();
    emitter.subscribe('new.event', handler);

    for (let i = 0; i < 5; i++) {
      await expect(emitter.publish('legacy.event', { i })).resolves.toBe(true);
    }
    expect(handler).toHaveBeenCalledTimes(5);
  });

  test('recursion is still detected when the event is rerouted by middleware', async () => {
    const emitter = new EvEm();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    emitter.use((event, data) => (event === 'loop.start' ? { event: 'loop.handled', data } : data));
    emitter.subscribe('loop.handled', async () => {
      await emitter.publish('loop.start');
    });

    await emitter.publish('loop.start');

    const recursionErrors = consoleErrorSpy.mock.calls.filter(
      args => args[1] instanceof Error && args[1].message.includes('Max recursion depth of 3')
    );
    expect(recursionErrors.length).toBeGreaterThan(0);
    consoleErrorSpy.mockRestore();
  });

  test('recursion is detected for subscribers behind async filters and validators', async () => {
    const emitter = new EvEm();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let filteredCalls = 0;
    let validatedCalls = 0;
    emitter.subscribe('filtered.loop', async () => {
      if (++filteredCalls < 10) await emitter.publish('filtered.loop');
    }, { filter: async () => true });
    emitter.subscribe('validated.loop', async () => {
      if (++validatedCalls < 10) await emitter.publish('validated.loop');
    }, { schema: async () => true });

    await emitter.publish('filtered.loop');
    await emitter.publish('validated.loop');

    expect(filteredCalls).toBe(3);
    expect(validatedCalls).toBe(3);
    consoleErrorSpy.mockRestore();
  });

  test('recursion through middleware that republishes the same event is detected', async () => {
    const emitter = new EvEm();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let middlewareCalls = 0;
    emitter.use(async (event, data) => {
      if (event === 'echo') {
        middlewareCalls++;
        await emitter.publish('echo');
      }
      return data;
    });

    await emitter.publish('echo');

    expect(middlewareCalls).toBe(3);
    expect(
      consoleErrorSpy.mock.calls.some(
        args => args[1] instanceof Error && args[1].message.includes('Max recursion depth of 3')
      )
    ).toBe(true);
    consoleErrorSpy.mockRestore();
  });
});
