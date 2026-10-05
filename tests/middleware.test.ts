import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvEm, MiddlewareFunction } from '../src/eventEmitter';

describe('Middleware', () => {
  let evem: EvEm;

  beforeEach(() => {
    evem = new EvEm();
  });

  describe('Registration and Execution', () => {
    it('should apply middleware to all events', async () => {
      // Setup a middleware that adds a property to all events
      const middleware: MiddlewareFunction = (event, data) => {
        return {
          ...data,
          processed: true
        };
      };

      // Register the middleware
      evem.use(middleware);

      // Set up a handler that checks for the processed property
      const handler = vi.fn(data => {
        expect(data.processed).toBe(true);
      });

      evem.subscribe('test.event', handler);

      // Publish the event
      await evem.publish('test.event', { message: 'Hello' });

      // Verify the handler was called with the processed data
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should execute multiple middleware functions in order of registration', async () => {
      // Setup a tracking array to monitor execution order
      const executionOrder: string[] = [];

      // Create three middleware functions
      const middleware1: MiddlewareFunction = (event, data) => {
        executionOrder.push('middleware1');
        return { ...data, first: true };
      };

      const middleware2: MiddlewareFunction = (event, data) => {
        executionOrder.push('middleware2');
        return { ...data, second: true };
      };

      const middleware3: MiddlewareFunction = (event, data) => {
        executionOrder.push('middleware3');
        return { ...data, third: true };
      };

      // Register the middleware
      evem.use(middleware1);
      evem.use(middleware2);
      evem.use(middleware3);

      // Set up a handler that checks for all the properties
      const handler = vi.fn(data => {
        expect(data.first).toBe(true);
        expect(data.second).toBe(true);
        expect(data.third).toBe(true);
      });

      evem.subscribe('test.event', handler);

      // Publish the event
      await evem.publish('test.event', {});

      // Verify the execution order
      expect(executionOrder).toEqual(['middleware1', 'middleware2', 'middleware3']);
      // Verify the handler was called with the processed data
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event Cancellation in Middleware', () => {
    it('should allow middleware to cancel events', async () => {
      // Setup a middleware that cancels events with a specific condition
      const middleware: MiddlewareFunction = (event, data) => {
        // Cancel the event if the data has a 'cancel' property set to true
        if (data.shouldCancel) {
          return null; // Canceling the event by returning null
        }
        return data;
      };

      // Register the middleware
      evem.use(middleware);

      // Set up a handler that should not be called for canceled events
      const handler = vi.fn();
      evem.subscribe('test.event', handler);

      // Publish an event that should be canceled
      const result = await evem.publish('test.event', { shouldCancel: true });

      // Verify the handler was not called and the result indicates cancellation
      expect(handler).not.toHaveBeenCalled();
      expect(result).toBe(false);

      // Publish an event that should not be canceled
      await evem.publish('test.event', { message: 'This should go through' });

      // Verify the handler was called for the non-canceled event
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Async Middleware', () => {
    it('should support async middleware functions', async () => {
      // Setup an async middleware
      const asyncMiddleware: MiddlewareFunction = async (event, data) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          ...data,
          asyncProcessed: true
        };
      };

      // Register the middleware
      evem.use(asyncMiddleware);

      // Set up a handler that checks for the processed property
      const handler = vi.fn(data => {
        expect(data.asyncProcessed).toBe(true);
      });

      evem.subscribe('test.event', handler);

      // Publish the event
      await evem.publish('test.event', { message: 'Hello' });

      // Verify the handler was called with the processed data
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in async middleware gracefully', async () => {
      // Setup an async middleware that throws
      const errorMiddleware: MiddlewareFunction = async () => {
        throw new Error('Middleware error');
      };

      // Mock console.error to suppress output during test
      const originalConsoleError = console.error;
      console.error = vi.fn();

      try {
        // Register the middleware
        evem.use(errorMiddleware);

        // Set up a handler
        const handler = vi.fn();
        evem.subscribe('test.event', handler);

        // Publish the event
        await evem.publish('test.event', { message: 'Hello' });

        // Handler should not be called since middleware threw
        expect(handler).not.toHaveBeenCalled();

        // Verify the error was logged
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Error in middleware for event'),
          expect.any(Error)
        );
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
    });
  });

  describe('Event and Data Transformation', () => {
    it('should allow middleware to transform the event name', async () => {
      // Setup a middleware that redirects events
      const redirectMiddleware: MiddlewareFunction = (event, data) => {
        // Redirect events with 'redirect' property to a different event
        if (data.redirect) {
          return {
            event: 'redirected.event',
            data
          };
        }
        return data;
      };

      // Register the middleware
      evem.use(redirectMiddleware);

      // Set up handlers for both events
      const originalHandler = vi.fn();
      const redirectedHandler = vi.fn();

      evem.subscribe('original.event', originalHandler);
      evem.subscribe('redirected.event', redirectedHandler);

      // Publish the event that should be redirected
      await evem.publish('original.event', { redirect: true, message: 'Redirect me' });

      // Verify only the redirected handler was called
      expect(originalHandler).not.toHaveBeenCalled();
      expect(redirectedHandler).toHaveBeenCalledTimes(1);
    });

    it('should allow middleware to modify event data', async () => {
      // Setup a middleware that enriches data
      const enrichMiddleware: MiddlewareFunction = (event, data) => {
        // Add timestamp and event name to all events
        return {
          ...data,
          timestamp: 1234567890,
          originalEvent: event
        };
      };

      // Register the middleware
      evem.use(enrichMiddleware);

      // Set up a handler
      const handler = vi.fn(data => {
        expect(data.timestamp).toBe(1234567890);
        expect(data.originalEvent).toBe('test.event');
      });

      evem.subscribe('test.event', handler);

      // Publish the event
      await evem.publish('test.event', { message: 'Enrich me' });

      // Verify the handler was called with the enriched data
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Removing Middleware', () => {
    it('should allow removing middleware by reference', async () => {
      // Create a middleware with a side effect we can track
      let middlewareExecuted = false;
      const middleware: MiddlewareFunction = (event, data) => {
        middlewareExecuted = true;
        return { ...data, processed: true };
      };

      // Register and then remove the middleware
      evem.use(middleware);
      evem.removeMiddleware(middleware);

      // Set up a handler
      const handler = vi.fn();
      evem.subscribe('test.event', handler);

      // Publish the event
      await evem.publish('test.event', { message: 'Hello' });

      // Verify the handler was called
      expect(handler).toHaveBeenCalledTimes(1);

      // Verify the middleware was not executed
      expect(middlewareExecuted).toBe(false);

      // Verify the data was not processed by the middleware
      expect(handler).toHaveBeenCalledWith(expect.not.objectContaining({ processed: true }));
    });
  });

  describe('Middleware with Existing Features', () => {
    it('should work with cancelable events', async () => {
      // Setup a middleware that adds a property
      const middleware: MiddlewareFunction = (event, data) => {
        return { ...data, middlewareProcessed: true };
      };

      // Register the middleware
      evem.use(middleware);

      // Set up a handler that checks for the property and cancels the event
      const handler1 = vi.fn(event => {
        expect(event.middlewareProcessed).toBe(true);
        event.cancel();
      });

      // Set up a second handler that should not be called due to cancellation
      const handler2 = vi.fn();

      evem.subscribe('test.event', handler1);
      evem.subscribe('test.event', handler2);

      // Publish a cancelable event
      const result = await evem.publish('test.event', {}, { cancelable: true });

      // Verify the first handler was called with the processed data
      expect(handler1).toHaveBeenCalledTimes(1);

      // Verify the second handler was not called due to cancellation
      expect(handler2).not.toHaveBeenCalled();

      // Verify the result indicates the event was canceled
      expect(result).toBe(false);
    });

    it('should work with event filtering', async () => {
      // Setup a middleware that adds a property
      const middleware: MiddlewareFunction = (event, data) => {
        return { ...data, importance: 'high' };
      };

      // Register the middleware
      evem.use(middleware);

      // Set up a handler with a filter
      const handler = vi.fn();
      evem.subscribe('test.event', handler, {
        filter: data => data.importance === 'high'
      });

      // Publish the event
      await evem.publish('test.event', { message: 'This should pass the filter' });

      // Verify the handler was called
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
describe('Middleware - payloads shaped like a reroute', () => {
  let evem: EvEm;

  beforeEach(() => {
    evem = new EvEm();
  });

  it('should not reroute when a pass-through middleware returns an {event, data} payload unchanged', async () => {
    evem.use((_event, data) => data);
    const handler = vi.fn();
    const reroutedHandler = vi.fn();
    evem.subscribe('ws.send', handler);
    evem.subscribe('client.chat.send', reroutedHandler);

    const payload = { event: 'client.chat.send', data: { text: 'hi' } };
    await evem.publish('ws.send', payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
    expect(reroutedHandler).not.toHaveBeenCalled();
  });

  it('should not reroute when a middleware enriches an {event, data} payload', async () => {
    evem.use((_event, data: any) => ({ ...data, traceId: 'abc' }));
    const handler = vi.fn();
    evem.subscribe('ws.send', handler);

    await evem.publish('ws.send', { event: 'client.chat.send', data: { text: 'hi' } });

    expect(handler).toHaveBeenCalledWith({
      event: 'client.chat.send',
      data: { text: 'hi' },
      traceId: 'abc'
    });
  });

  it('should still reroute when a middleware returns a new { event, data } object', async () => {
    evem.use((event, data) => (event === 'old.name' ? { event: 'new.name', data } : data));
    const oldHandler = vi.fn();
    const newHandler = vi.fn();
    evem.subscribe('old.name', oldHandler);
    evem.subscribe('new.name', newHandler);

    await evem.publish('old.name', { value: 1 });

    expect(oldHandler).not.toHaveBeenCalled();
    expect(newHandler).toHaveBeenCalledWith({ value: 1 });
  });
});

describe('Middleware - results that are not objects', () => {
  it('replaces the data with a primitive result instead of rerouting', async () => {
    const evem = new EvEm();
    const received: unknown[] = [];
    evem.use(() => 42);
    evem.subscribe('count', data => {
      received.push(data);
    });

    expect(await evem.publish('count', { n: 1 })).toBe(true);
    expect(received).toEqual([42]);
  });
});

describe('Middleware - removing it', () => {
  const run = async (evem: EvEm) => {
    const seen: unknown[] = [];
    evem.subscribe('order', data => {
      seen.push(data);
    });
    await evem.publish('order', []);
    return seen[0];
  };
  const tag = (name: string) => (_event: string, data: string[]) => [...data, name];

  it('removes the function it is given, wherever it is in the list', async () => {
    const evem = new EvEm();
    const a = tag('a');
    const b = tag('b');
    evem.use(a);
    evem.use(b);
    evem.removeMiddleware(b);
    expect(await run(evem)).toEqual(['a']);
  });

  it('removes nothing when given one that was never added', async () => {
    const evem = new EvEm();
    evem.use(tag('a'));
    evem.use({ pattern: 'order', handler: tag('b') });
    evem.removeMiddleware(tag('x'));
    evem.removeMiddleware({ pattern: 'order', handler: tag('y') });
    expect(await run(evem)).toEqual(['a', 'b']);
  });

  it('removes a pattern registration only where both its pattern and its handler match', async () => {
    const evem = new EvEm();
    const shared = tag('shared');
    const other = tag('other');
    evem.use({ pattern: 'shipment', handler: shared });
    evem.use({ pattern: 'order', handler: other });
    evem.use({ pattern: 'order', handler: shared });
    evem.removeMiddleware({ pattern: 'order', handler: shared });
    expect(await run(evem)).toEqual(['other']);
  });
});

describe('Middleware - results that are not a reroute', () => {
  it('replaces the data with undefined when it returns nothing', async () => {
    const evem = new EvEm();
    const received: unknown[] = [];
    evem.use(() => undefined);
    evem.subscribe('count', data => {
      received.push(data);
    });
    expect(await evem.publish('count', { n: 1 })).toBe(true);
    expect(received).toEqual([undefined]);
  });

  it('replaces the data with a string result, whatever its length', async () => {
    const evem = new EvEm();
    const received: unknown[] = [];
    evem.use(() => 'ok');
    evem.subscribe('count', data => {
      received.push(data);
    });
    expect(await evem.publish('count', 1)).toBe(true);
    expect(received).toEqual(['ok']);
  });

  it('treats { event, data } whose event is not a string as data', async () => {
    const evem = new EvEm();
    const received: unknown[] = [];
    const rerouted = vi.fn();
    // Not a valid MiddlewareResult for a reroute: event must be a string
    evem.use((() => ({ event: 42, data: 'x' })) as unknown as MiddlewareFunction);
    evem.subscribe('count', data => {
      received.push(data);
    });
    evem.subscribe('42', rerouted);
    await evem.publish('count', 1);
    expect(received).toEqual([{ event: 42, data: 'x' }]);
    expect(rerouted).not.toHaveBeenCalled();
  });
});

describe('Middleware - events whose data is null', () => {
  it('lets a pass-through middleware return null data unchanged, without canceling the event', async () => {
    const evem = new EvEm();
    const logged: string[] = [];
    evem.use((event, data) => {
      logged.push(event);
      return data;
    });
    evem.use(async (_event, data) => data);
    const received = vi.fn();
    evem.subscribe('ping', received);

    expect(await evem.publish('ping', null)).toBe(true);
    expect(logged).toEqual(['ping']);
    expect(received).toHaveBeenCalledWith(null);
  });

  it('still cancels an event whose data was not null when a middleware returns null', async () => {
    const evem = new EvEm();
    evem.use(() => null);
    const received = vi.fn();
    evem.subscribe('ping', received);

    expect(await evem.publish('ping', { n: 1 })).toBe(false);
    expect(received).not.toHaveBeenCalled();
  });

  it('cancels when a middleware returns null for data an earlier middleware set', async () => {
    const evem = new EvEm();
    evem.use(() => ({ n: 2 }));
    evem.use(() => null);
    expect(await evem.publish('ping', null)).toBe(false);
  });
});
