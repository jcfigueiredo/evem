import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvEm, ErrorPolicy } from '../../src/eventEmitter';
import { defaultShouldReconnect, SseHandler, type SseHandlerOptions } from '../../src/sse/SseHandler';
import { FakeTransport } from './helpers/FakeTransport';
import { MockEventSource } from './helpers/MockEventSource';

const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('SseHandler', () => {
  let evem: EvEm;
  let transport: FakeTransport;
  let handler: SseHandler;
  let states: string[];

  const create = (options: SseHandlerOptions = {}) => {
    handler = new SseHandler('https://api.test/events', evem, { transport, ...options });
    return handler;
  };
  const received = (event: string) => {
    const values: unknown[] = [];
    evem.subscribe(event, (value: unknown) => {
      values.push(value);
    });
    return values;
  };

  beforeEach(() => {
    evem = new EvEm();
    transport = new FakeTransport();
    states = [];
    evem.subscribe('sse.connection.state', (change: { to: string }) => {
      states.push(change.to);
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // no jitter
  });

  afterEach(async () => {
    await handler?.disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('routing', () => {
    it('publishes named events under the server prefix, with JSON data', async () => {
      const orders = received('server.order.updated');
      create();
      await tick();
      transport.open();

      transport.send('{"id":7}', 'order.updated');
      transport.send('{"id":8}', 'server.order.updated');
      await tick();

      expect(orders).toEqual([{ id: 7 }, { id: 8 }]);
    });

    it('uses names as-is with an empty prefix', async () => {
      const orders = received('order.updated');
      create({ serverEventPrefix: '' });
      await tick();

      transport.send('1', 'order.updated');
      await tick();

      expect(orders).toEqual([1]);
    });

    it('unwraps unnamed { event, data } envelopes, and sends other unnamed messages to sse.message', async () => {
      const orders = received('server.order.updated');
      const messages = received('sse.message');
      create();
      await tick();

      transport.send('{"event":"order.updated","data":{"id":7}}');
      transport.send('{"ping":1}');
      transport.send('"just text"');
      await tick();

      expect(orders).toEqual([{ id: 7 }]);
      expect(messages).toEqual([{ ping: 1 }, 'just text']);
    });

    it('does not unwrap envelopes with unwrapEnvelope: false', async () => {
      const messages = received('sse.message');
      create({ unwrapEnvelope: false });
      await tick();

      transport.send('{"event":"order.updated","data":1}');
      await tick();

      expect(messages).toEqual([{ event: 'order.updated', data: 1 }]);
    });

    it('reports data that fails to parse, and keeps going', async () => {
      const parseErrors = received('sse.parse.error');
      const orders = received('server.order.updated');
      const onError = vi.fn();
      create({ onError });
      await tick();

      transport.send('not json', 'order.updated', '3');
      transport.send('{"id":1}', 'order.updated', '4');
      await tick();

      expect(parseErrors).toEqual([
        {
          error: expect.any(SyntaxError),
          rawData: 'not json',
          eventType: 'order.updated',
          lastEventId: '3'
        }
      ]);
      expect(onError).toHaveBeenCalledWith(expect.any(SyntaxError));
      expect(orders).toEqual([{ id: 1 }]);
    });

    it('supports text and custom data parsing', async () => {
      const texts = received('server.log');
      create({ parseData: 'text' });
      await tick();
      transport.send('plain line', 'log');
      await tick();
      expect(texts).toEqual(['plain line']);

      await handler.disconnect();
      const parseData = vi.fn((data: string, type: string) => `${type}:${data}`);
      const custom = received('server.audit');
      transport = new FakeTransport();
      create({ parseData });
      await tick();
      transport.send('x', 'audit');
      await tick();
      expect(custom).toEqual(['audit:x']);
      expect(parseData).toHaveBeenCalledWith('x', 'audit');
    });

    it('publishes sse.event with the metadata when rawEvents is on', async () => {
      const raw = received('sse.event');
      create({ rawEvents: true });
      await tick();

      transport.send('{"id":7}', 'order.updated', '12');
      await tick();

      expect(raw).toEqual([{ type: 'order.updated', data: { id: 7 }, rawData: '{"id":7}', lastEventId: '12' }]);
    });

    it('does not leak a rejected publish as an unhandled rejection', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      evem.subscribe('server.strict', vi.fn(), { schema: () => false, schemaErrorPolicy: ErrorPolicy.THROW });
      create();
      await tick();

      transport.send('1', 'strict');
      await tick();

      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('server.strict'), expect.any(Error));
    });
  });

  describe('last event id', () => {
    it('tracks the last event id and sends it when reconnecting', async () => {
      vi.useFakeTimers();
      create({ lastEventId: '10' });
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.current.request).toEqual({ url: 'https://api.test/events', lastEventId: '10' });

      transport.open();
      transport.send('1', 'tick', '11');
      expect(handler.getLastEventId()).toBe('11');
      transport.end({ reason: 'network-error', error: new Error('reset') });
      await vi.advanceTimersByTimeAsync(3000);

      expect(transport.connections).toHaveLength(2);
      expect(transport.current.request.lastEventId).toBe('11');
    });

    it('forgets the id when the server sends an empty id', async () => {
      create({ lastEventId: '10' });
      await tick();

      transport.send('1', 'tick', '');

      expect(handler.getLastEventId()).toBeUndefined();
    });
  });

  describe('lifecycle', () => {
    it('goes connecting → connected, and disconnecting → disconnected on disconnect()', async () => {
      create();
      await tick();
      transport.open();
      await tick();

      await handler.disconnect();

      expect(states).toEqual(['connecting', 'connected', 'disconnecting', 'disconnected']);
      expect(handler.isConnected()).toBe(false);
      expect(transport.aborts).toBe(1);
    });

    it('waits for connect() with autoConnect: false', async () => {
      create({ autoConnect: false });
      await tick();
      expect(transport.connections).toHaveLength(0);

      handler.connect();
      await tick();

      expect(transport.connections).toHaveLength(1);
    });

    it('can connect again after disconnect()', async () => {
      create();
      await tick();
      await handler.disconnect();

      handler.connect();
      await tick();
      transport.open();
      await tick();

      expect(transport.connections).toHaveLength(2);
      expect(handler.getConnectionState()).toBe('connected');
    });

    it('cancels a pending reconnect on disconnect()', async () => {
      vi.useFakeTimers();
      create();
      await vi.advanceTimersByTimeAsync(0);
      transport.open();
      transport.end();
      await vi.advanceTimersByTimeAsync(0);
      expect(handler.getConnectionState()).toBe('reconnecting');

      await handler.disconnect();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(transport.connections).toHaveLength(1);
      expect(handler.getConnectionState()).toBe('disconnected');
    });

    it('registers nothing on the emitter', async () => {
      const fresh = new EvEm();
      handler = new SseHandler('/events', fresh, { transport });
      await tick();

      expect(fresh.info()).toEqual([]);
    });
  });

  describe('reconnection policy', () => {
    const runUntilEnd = async (info: Parameters<FakeTransport['end']>[0], options: SseHandlerOptions = {}) => {
      vi.useFakeTimers();
      const errors = received('sse.error');
      create(options);
      await vi.advanceTimersByTimeAsync(0);
      transport.open();
      transport.end(info);
      await vi.advanceTimersByTimeAsync(0);
      return errors;
    };

    it('reconnects after the stream ends, without reporting an error', async () => {
      const errors = await runUntilEnd({ reason: 'ended' });
      expect(handler.getConnectionState()).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(3000);
      expect(transport.connections).toHaveLength(2);
      expect(errors).toEqual([]);
    });

    it('stops on 204 No Content, without reporting an error', async () => {
      const errors = await runUntilEnd({ reason: 'no-content' });
      expect(handler.getConnectionState()).toBe('disconnected');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(transport.connections).toHaveLength(1);
      expect(errors).toEqual([]);
    });

    it.each([401, 403, 404])('stops on HTTP %i and reports it', async status => {
      const errors = await runUntilEnd({ reason: 'http-error', status });
      expect(handler.getConnectionState()).toBe('disconnected');
      expect(errors).toEqual([{ error: expect.any(Error), reason: 'http-error', status }]);
    });

    it.each([408, 429, 500, 503])('reconnects on HTTP %i', async status => {
      await runUntilEnd({ reason: 'http-error', status });
      expect(handler.getConnectionState()).toBe('reconnecting');
    });

    it('stops on a wrong content type', async () => {
      const errors = await runUntilEnd({ reason: 'bad-content-type', contentType: 'text/html' });
      expect(handler.getConnectionState()).toBe('disconnected');
      expect(errors).toEqual([{ error: expect.any(Error), reason: 'bad-content-type', contentType: 'text/html' }]);
    });

    it('reconnects after network errors and reports them', async () => {
      const error = new Error('connection reset');
      const errors = await runUntilEnd({ reason: 'network-error', error });
      expect(handler.getConnectionState()).toBe('reconnecting');
      expect(errors).toEqual([{ error, reason: 'network-error' }]);
    });

    it('lets shouldReconnect override the defaults', async () => {
      const shouldReconnect = vi.fn(() => true);
      await runUntilEnd({ reason: 'http-error', status: 401 }, { shouldReconnect });
      expect(shouldReconnect).toHaveBeenCalledWith({ reason: 'http-error', status: 401, attempts: 0 });
      expect(handler.getConnectionState()).toBe('reconnecting');
    });

    it('treats an abort it did not ask for (from a custom transport) as the stream ending', async () => {
      await runUntilEnd({ reason: 'aborted' });
      expect(handler.getConnectionState()).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(3000);
      expect(transport.connections).toHaveLength(2);
    });

    it('never reconnects with reconnect: false', async () => {
      await runUntilEnd({ reason: 'ended' }, { reconnect: false });
      expect(handler.getConnectionState()).toBe('disconnected');
    });

    it('gives up after maxReconnectAttempts consecutive failures', async () => {
      vi.useFakeTimers();
      const failed = received('sse.reconnect.failed');
      create({ maxReconnectAttempts: 2, backoff: false, reconnectDelay: 100 });
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 3; i++) {
        transport.end({ reason: 'network-error', error: new Error('down') });
        await vi.advanceTimersByTimeAsync(100);
      }

      expect(transport.connections).toHaveLength(3);
      expect(handler.getConnectionState()).toBe('disconnected');
      expect(failed).toEqual([{ attempts: 2 }]);
    });
  });

  describe('reconnect delays', () => {
    const delaysOf = async (
      options: SseHandlerOptions,
      ends: Array<Parameters<FakeTransport['end']>[0]>,
      openFirst = false
    ) => {
      vi.useFakeTimers();
      create(options);
      await vi.advanceTimersByTimeAsync(0);
      const delays: number[] = [];
      for (const info of ends) {
        if (openFirst) transport.open();
        const before = transport.connections.length;
        transport.end(info);
        let waited = 0;
        while (transport.connections.length === before) {
          await vi.advanceTimersByTimeAsync(100);
          waited += 100;
        }
        delays.push(waited);
      }
      return delays;
    };
    const networkError = { reason: 'network-error' as const, error: new Error('down') };

    it('backs off exponentially from reconnectDelay, up to maxReconnectDelay', async () => {
      expect(await delaysOf({ reconnectDelay: 1000, maxReconnectDelay: 5000 }, Array(5).fill(networkError))).toEqual([
        1000, 2000, 4000, 5000, 5000
      ]);
    });

    it('uses a fixed delay with backoff: false', async () => {
      expect(await delaysOf({ reconnectDelay: 1000, backoff: false }, Array(3).fill(networkError))).toEqual([
        1000, 1000, 1000
      ]);
    });

    it('starts again from the base delay after a successful connection', async () => {
      expect(await delaysOf({ reconnectDelay: 1000 }, Array(3).fill(networkError), true)).toEqual([1000, 1000, 1000]);
    });

    it('uses the server retry value as the base delay', async () => {
      vi.useFakeTimers();
      create({ reconnectDelay: 1000, backoff: false });
      await vi.advanceTimersByTimeAsync(0);
      transport.open();
      transport.current.listener.retry(2500);
      transport.end(networkError);

      await vi.advanceTimersByTimeAsync(2400);
      expect(transport.connections).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(100);
      expect(transport.connections).toHaveLength(2);
    });

    it('waits at least as long as Retry-After', async () => {
      expect(
        await delaysOf({ reconnectDelay: 1000 }, [{ reason: 'http-error', status: 503, retryAfter: 7000 }])
      ).toEqual([7000]);
    });
  });

  describe('heartbeat timeout', () => {
    it('reconnects when no bytes arrive within heartbeatTimeout', async () => {
      vi.useFakeTimers();
      const errors = received('sse.error');
      create({ heartbeatTimeout: 1000, backoff: false, reconnectDelay: 100 });
      await vi.advanceTimersByTimeAsync(0);
      transport.open();

      await vi.advanceTimersByTimeAsync(900);
      transport.current.listener.activity(); // e.g. a ": ping" comment
      await vi.advanceTimersByTimeAsync(900);
      expect(transport.aborts).toBe(0);

      await vi.advanceTimersByTimeAsync(100);
      expect(transport.aborts).toBe(1);
      expect(errors).toEqual([{ error: expect.any(Error), reason: 'heartbeat-timeout' }]);
      await vi.advanceTimersByTimeAsync(100);
      expect(transport.connections).toHaveLength(2);
    });
  });

  describe('ordering', () => {
    const slowSubscriberLog = () => {
      const log: string[] = [];
      evem.subscribe('server.job', async (n: number) => {
        log.push(`start ${n}`);
        await new Promise(resolve => setTimeout(resolve, n === 1 ? 20 : 1));
        log.push(`end ${n}`);
      });
      return log;
    };

    it('lets async subscribers overlap by default', async () => {
      const log = slowSubscriberLog();
      create();
      await tick();
      transport.send('1', 'job');
      transport.send('2', 'job');
      await new Promise(resolve => setTimeout(resolve, 40));

      expect(log.indexOf('start 2')).toBeLessThan(log.indexOf('end 1'));
    });

    it('handles events strictly in order with sequential: true, and returns the wait to the transport', async () => {
      const log = slowSubscriberLog();
      create({ sequential: true });
      await tick();
      const first = transport.send('1', 'job');
      transport.send('2', 'job');
      expect(first).toBeInstanceOf(Promise);
      await new Promise(resolve => setTimeout(resolve, 40));

      expect(log).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
    });
  });

  describe('transports', () => {
    it('rejects options the EventSource transport cannot honour', () => {
      for (const options of [
        { headers: { a: 'b' } },
        { method: 'POST' },
        { heartbeatTimeout: 1000 },
        { fetch: globalThis.fetch }
      ]) {
        expect(
          () =>
            new SseHandler('/events', evem, {
              transport: 'eventsource',
              EventSourceConstructor: MockEventSource,
              autoConnect: false,
              ...options
            })
        ).toThrow(/doesn't support/);
      }
    });

    it('rejects EventSource-only options with the fetch transport', () => {
      for (const options of [{ eventTypes: ['a'] }, { lastEventIdParam: 'since' }]) {
        expect(() => new SseHandler('https://api.test/events', evem, { autoConnect: false, ...options })).toThrow(
          /only apply to the EventSource transport/
        );
      }
    });

    it('mirrors the native EventSource reconnecting by itself', async () => {
      MockEventSource.instances = [];
      handler = new SseHandler('/events', evem, { transport: 'eventsource', EventSourceConstructor: MockEventSource });
      await tick();
      const source = MockEventSource.instances[0]!;

      source.simulateOpen();
      source.simulateError(MockEventSource.CONNECTING);
      await tick();
      expect(handler.getConnectionState()).toBe('reconnecting');
      source.simulateOpen();
      await tick();

      expect(states).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
    });
  });

  describe('robustness', () => {
    it('keeps reconnecting when onError throws', async () => {
      vi.useFakeTimers();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      create({
        onError: () => {
          throw new Error('bad handler');
        },
        backoff: false,
        reconnectDelay: 100
      });
      await vi.advanceTimersByTimeAsync(0);
      transport.open();
      transport.end({ reason: 'network-error', error: new Error('down') });
      await vi.advanceTimersByTimeAsync(100);

      expect(transport.connections).toHaveLength(2);
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('onError'), expect.any(Error));
    });

    it('falls back to the default policy when shouldReconnect throws', async () => {
      vi.useFakeTimers();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      create({
        shouldReconnect: () => {
          throw new Error('bad policy');
        }
      });
      await vi.advanceTimersByTimeAsync(0);
      transport.open();
      transport.end({ reason: 'network-error', error: new Error('down') });
      await vi.advanceTimersByTimeAsync(0);

      expect(handler.getConnectionState()).toBe('reconnecting');
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('shouldReconnect'), expect.any(Error));
    });

    it('exports the default policy so one case can be overridden', () => {
      expect(defaultShouldReconnect({ reason: 'http-error', status: 401 })).toBe(false);
      expect(defaultShouldReconnect({ reason: 'http-error', status: 503 })).toBe(true);
      expect(defaultShouldReconnect({ reason: 'ended' })).toBe(true);
      expect(defaultShouldReconnect({ reason: 'no-content' })).toBe(false);
    });

    it('records the last event id from id-only messages', async () => {
      vi.useFakeTimers();
      create();
      await vi.advanceTimersByTimeAsync(0);
      transport.open();
      transport.send('1', 'tick', '5');
      transport.current.listener.lastEventId?.('6');
      expect(handler.getLastEventId()).toBe('6');

      transport.end({ reason: 'network-error', error: new Error('down') });
      await vi.advanceTimersByTimeAsync(3000);
      expect(transport.current.request.lastEventId).toBe('6');
    });

    it('applies the jitter at the delay cap too', async () => {
      vi.useFakeTimers();
      const delays: number[] = [];
      for (const random of [0, 0.999]) {
        vi.spyOn(Math, 'random').mockReturnValue(random);
        transport = new FakeTransport();
        create({ reconnectDelay: 1000, maxReconnectDelay: 2000 });
        await vi.advanceTimersByTimeAsync(0);
        transport.end({ reason: 'network-error', error: new Error('down') }); // attempt 1: base
        await vi.advanceTimersByTimeAsync(5000);
        transport.end({ reason: 'network-error', error: new Error('down') }); // attempt 2: capped at 2000
        let waited = 0;
        while (transport.connections.length === 2) {
          await vi.advanceTimersByTimeAsync(100);
          waited += 100;
        }
        delays.push(waited);
        await handler.disconnect();
      }

      expect(delays).toEqual([1600, 2400]);
    });

    it('times out a request that never gets a response', async () => {
      vi.useFakeTimers();
      const errors = received('sse.error');
      create({ heartbeatTimeout: 1000, backoff: false, reconnectDelay: 100 });
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(1000); // the server never answers

      expect(transport.aborts).toBe(1);
      expect(errors).toEqual([{ error: expect.any(Error), reason: 'heartbeat-timeout' }]);
      await vi.advanceTimersByTimeAsync(100);
      expect(transport.connections).toHaveLength(2);
    });

    it('clamps reconnect delays to what setTimeout can wait', async () => {
      vi.useFakeTimers();
      create({ backoff: false });
      await vi.advanceTimersByTimeAsync(0);
      transport.open();
      transport.current.listener.retry(3e9); // above 2^31 - 1 ms, which setTimeout runs at once
      transport.end({ reason: 'network-error', error: new Error('down') });

      await vi.advanceTimersByTimeAsync(60_000);
      expect(transport.connections).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2 ** 31);
      expect(transport.connections).toHaveLength(2);
    });

    it('fails fast on configuration that can never work', () => {
      // A relative URL needs a browser to resolve it
      expect(() => new SseHandler('/events', evem, { autoConnect: false })).toThrow(/absolute URL/);
      // No EventSource implementation in Node.js
      expect(
        () => new SseHandler('https://api.test/events', evem, { transport: 'eventsource', autoConnect: false })
      ).toThrow(/EventSource/);
      // Options a custom transport would never see
      for (const options of [
        { headers: { a: 'b' } },
        { method: 'POST' },
        { body: 'x' },
        { fetch: globalThis.fetch },
        { withCredentials: true }
      ]) {
        expect(() => new SseHandler('/events', evem, { transport, autoConnect: false, ...options })).toThrow(
          /custom transport/
        );
      }
    });
  });
});

describe('SseHandler - setup and connection edge cases', () => {
  const tick = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws a TypeError when there is no global fetch and no fetch option', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => new SseHandler('https://api.test/events', new EvEm(), { autoConnect: false })).toThrow(TypeError);
    expect(() => new SseHandler('https://api.test/events', new EvEm(), { autoConnect: false })).toThrow(
      'There is no global fetch: pass the fetch option.'
    );
  });

  it('reports an EventSource connection that failed for good as sse.error, with what failed', async () => {
    const evem = new EvEm();
    const transport = new FakeTransport();
    const errors: Array<{ reason: string; error: Error }> = [];
    evem.subscribe('sse.error', (error: { reason: string; error: Error }) => {
      errors.push(error);
    });
    const handler = new SseHandler('https://api.test/events', evem, { transport, reconnect: false });
    await tick();
    transport.open();
    transport.end({ reason: 'failed' });
    await tick();

    expect(errors).toHaveLength(1);
    expect(errors[0]!.reason).toBe('failed');
    expect(errors[0]!.error.message).toBe('EventSource connection failed');
    await handler.disconnect();
  });

  it('does nothing on connect() while it is already connecting or connected', async () => {
    const transport = new FakeTransport();
    const handler = new SseHandler('https://api.test/events', new EvEm(), { transport });
    await tick();
    transport.open();

    handler.connect();
    await tick();

    expect(transport.connections).toHaveLength(1);
    await handler.disconnect();
  });

  it('makes no request when a state handler disconnects it as it starts connecting', async () => {
    const evem = new EvEm();
    const transport = new FakeTransport();
    const handler = new SseHandler('https://api.test/events', evem, { transport, autoConnect: false });
    evem.subscribe('sse.connection.state', ({ to }: { to: string }) => {
      if (to === 'connecting') void handler.disconnect();
    });

    handler.connect();
    await tick();

    expect(transport.connections).toHaveLength(0);
    expect(handler.getConnectionState()).toBe('disconnected');
  });
});

describe('SseHandler - option errors, stale connections and timers', () => {
  const url = 'https://api.test/events';
  const tick = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const collect = (evem: EvEm, event: string) => {
    const values: unknown[] = [];
    evem.subscribe(event, (value: unknown) => {
      values.push(value);
    });
    return values;
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('names every option the chosen transport would ignore or not support', () => {
    const evem = new EvEm();
    const eventSource = MockEventSource as unknown as NonNullable<SseHandlerOptions['EventSourceConstructor']>;
    expect(
      () =>
        new SseHandler(url, evem, {
          transport: new FakeTransport(),
          headers: { a: 'b' },
          method: 'POST',
          autoConnect: false
        })
    ).toThrow('headers, method would be ignored with a custom transport; configure the transport instead.');
    expect(
      () =>
        new SseHandler(url, evem, {
          transport: 'eventsource',
          EventSourceConstructor: eventSource,
          headers: { a: 'b' },
          heartbeatTimeout: 1000,
          autoConnect: false
        })
    ).toThrow("The EventSource transport doesn't support: headers, heartbeatTimeout. Use the fetch transport.");
    expect(() => new SseHandler(url, evem, { eventTypes: ['x'], lastEventIdParam: 'id', autoConnect: false })).toThrow(
      'eventTypes, lastEventIdParam only apply to the EventSource transport.'
    );
  });

  it('takes heartbeatTimeout: 0 (off) with the EventSource transport, and a global EventSource', () => {
    const evem = new EvEm();
    const eventSource = MockEventSource as unknown as NonNullable<SseHandlerOptions['EventSourceConstructor']>;
    expect(
      () =>
        new SseHandler(url, evem, {
          transport: 'eventsource',
          EventSourceConstructor: eventSource,
          heartbeatTimeout: 0,
          autoConnect: false
        })
    ).not.toThrow();
    vi.stubGlobal('EventSource', MockEventSource);
    expect(() => new SseHandler(url, evem, { transport: 'eventsource', autoConnect: false })).not.toThrow();
  });

  it.each([
    [{ reason: 'http-error', status: 503 }, 'SSE request failed with HTTP 503', { status: 503 }],
    [
      { reason: 'bad-content-type', contentType: 'text/html' },
      'Expected a text/event-stream response, got text/html',
      { contentType: 'text/html' }
    ],
    [
      { reason: 'bad-content-type', contentType: null },
      'Expected a text/event-stream response, got no content type',
      { contentType: null }
    ],
    [{ reason: 'network-error', error: new Error('down') }, 'down', {}]
  ] as const)('reports %j as sse.error with exactly its details', async (end, message, details) => {
    const evem = new EvEm();
    const transport = new FakeTransport();
    const errors = collect(evem, 'sse.error') as Array<Record<string, unknown> & { error: Error }>;
    const handler = new SseHandler(url, evem, { transport, reconnect: false });
    await tick();
    transport.end(end);
    await tick();

    expect(errors).toHaveLength(1);
    const { error, ...rest } = errors[0]!;
    expect(error.message).toBe(message);
    expect(rest).toStrictEqual({ reason: end.reason, ...details });
    await handler.disconnect();
  });

  it('reports a heartbeat timeout with how long it waited', async () => {
    vi.useFakeTimers();
    const evem = new EvEm();
    const transport = new FakeTransport();
    const errors = collect(evem, 'sse.error') as Array<{ error: Error; reason: string }>;
    const handler = new SseHandler(url, evem, { transport, heartbeatTimeout: 1000, reconnect: false });
    await vi.advanceTimersByTimeAsync(0);
    transport.open();
    await vi.advanceTimersByTimeAsync(1000);

    expect(errors.map(error => [error.reason, error.error.message])).toEqual([
      ['heartbeat-timeout', 'No data received for 1000ms']
    ]);
    await handler.disconnect();
  });

  it('reconnects by default after an EventSource connection failed for good', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const handler = new SseHandler(url, new EvEm(), { transport, reconnectDelay: 100, backoff: false });
    await vi.advanceTimersByTimeAsync(0);
    transport.end({ reason: 'failed' });
    await vi.advanceTimersByTimeAsync(100);
    expect(transport.connections).toHaveLength(2);
    await handler.disconnect();
  });

  it('treats a custom transport ending as aborted on its own, every time, as the stream ending', async () => {
    vi.useFakeTimers();
    const evem = new EvEm();
    const transport = new FakeTransport();
    const errors = collect(evem, 'sse.error');
    const handler = new SseHandler(url, evem, { transport, reconnectDelay: 100, backoff: false });
    await vi.advanceTimersByTimeAsync(0);
    transport.end({ reason: 'aborted' });
    await vi.advanceTimersByTimeAsync(100);
    transport.end({ reason: 'aborted' });
    await vi.advanceTimersByTimeAsync(100);

    expect(errors).toEqual([]);
    expect(transport.connections).toHaveLength(3);
    await handler.disconnect();
    // And after a disconnect, too
    handler.connect();
    await vi.advanceTimersByTimeAsync(0);
    transport.end({ reason: 'aborted' });
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toEqual([]);
    await handler.disconnect();
  });

  it("ignores what an old connection reports once it's been replaced", async () => {
    vi.useFakeTimers();
    const evem = new EvEm();
    const transport = new FakeTransport();
    const messages = collect(evem, 'sse.message');
    const handler = new SseHandler(url, evem, { transport, reconnectDelay: 100, backoff: false });
    await vi.advanceTimersByTimeAsync(0);
    const old = transport.current.listener;
    transport.open();
    await handler.disconnect();
    handler.connect();
    await vi.advanceTimersByTimeAsync(0);
    const states = collect(evem, 'sse.connection.state');

    old.open();
    old.retry(99_999);
    old.lastEventId?.('stale');
    old.reconnecting?.();
    void old.event({ type: 'message', data: '"late"', lastEventId: '' });
    await vi.advanceTimersByTimeAsync(0);

    expect(messages).toEqual([]);
    expect(states).toEqual([]);
    expect(handler.getLastEventId()).toBeUndefined();
    // The current connection's reconnect delay isn't the old one's retry
    transport.end({ reason: 'ended' });
    await vi.advanceTimersByTimeAsync(100);
    expect(transport.connections).toHaveLength(3);
    await handler.disconnect();
  });

  it("keeps the current connection's heartbeat when an old connection reports activity", async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const handler = new SseHandler(url, new EvEm(), { transport, heartbeatTimeout: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    const old = transport.current.listener;
    await handler.disconnect();
    handler.connect();
    await vi.advanceTimersByTimeAsync(0);
    transport.open();

    old.activity();
    await vi.advanceTimersByTimeAsync(1000);

    expect(transport.aborts).toBe(2); // the disconnect's, and the current connection's heartbeat
    await handler.disconnect();
  });

  it('restarts the heartbeat when the connection opens, and pauses it while an EventSource retries', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const handler = new SseHandler(url, new EvEm(), { transport, heartbeatTimeout: 1000 });
    await vi.advanceTimersByTimeAsync(800);
    transport.open();
    await vi.advanceTimersByTimeAsync(700);
    expect(transport.aborts).toBe(0);
    transport.current.listener.reconnecting?.();
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport.aborts).toBe(0);
    await handler.disconnect();
  });

  it('leaves no timer pending once disconnected, or once the stream has stopped', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const handler = new SseHandler(url, new EvEm(), { transport, heartbeatTimeout: 1000, reconnectDelay: 500 });
    await vi.advanceTimersByTimeAsync(0);
    transport.open();
    transport.end({ reason: 'network-error', error: new Error('down') }); // waits to reconnect
    await vi.advanceTimersByTimeAsync(0);
    await handler.disconnect();
    expect(vi.getTimerCount()).toBe(0);

    const stopping = new FakeTransport();
    const once = new SseHandler(url, new EvEm(), { transport: stopping, heartbeatTimeout: 1000, reconnect: false });
    await vi.advanceTimersByTimeAsync(0);
    stopping.open();
    stopping.end({ reason: 'ended' });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await once.disconnect();
  });

  it('announces disconnecting and disconnected once, however often disconnect() is called', async () => {
    const evem = new EvEm();
    const transport = new FakeTransport();
    const states = collect(evem, 'sse.connection.state') as Array<{ to: string }>;
    const handler = new SseHandler(url, evem, { transport });
    await tick();
    await handler.disconnect();
    await handler.disconnect();
    expect(states.map(state => state.to)).toEqual(['connecting', 'disconnecting', 'disconnected']);
  });

  it('logs nothing on a reconnect it decides by itself, without an onError', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = new FakeTransport();
    const handler = new SseHandler(url, new EvEm(), { transport, reconnectDelay: 100 });
    await vi.advanceTimersByTimeAsync(0);
    transport.end({ reason: 'network-error', error: new Error('down') });
    await vi.advanceTimersByTimeAsync(0);
    expect(error).not.toHaveBeenCalled();
    await handler.disconnect();
  });

  it('waits reconnectDelay after an error that has no Retry-After', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const handler = new SseHandler(url, new EvEm(), { transport, reconnectDelay: 500, backoff: false });
    await vi.advanceTimersByTimeAsync(0);
    transport.end({ reason: 'network-error', error: new Error('down') });
    await vi.advanceTimersByTimeAsync(499);
    expect(transport.connections).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.connections).toHaveLength(2);
    await handler.disconnect();
  });

  it('publishes an unnamed { type: "response" } message as sse.message (requests are a WebSocket thing)', async () => {
    const evem = new EvEm();
    const transport = new FakeTransport();
    const messages = collect(evem, 'sse.message');
    const handler = new SseHandler(url, evem, { transport });
    await tick();
    transport.open();
    await transport.send('{"type":"response","id":"1","result":2}');
    expect(messages).toEqual([{ type: 'response', id: '1', result: 2 }]);
    await handler.disconnect();
  });

  it('logs a publish that rejects as coming from the SSE stream', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const evem = new EvEm();
    evem.subscribe('server.tick', () => {}, { schema: () => false, schemaErrorPolicy: ErrorPolicy.THROW });
    const transport = new FakeTransport();
    const handler = new SseHandler(url, evem, { transport });
    await tick();
    transport.open();
    await transport.send('1', 'tick');
    await tick();
    expect(error).toHaveBeenCalledWith('Error publishing "server.tick" from the SSE stream:', expect.any(Error));
    await handler.disconnect();
  });
});
