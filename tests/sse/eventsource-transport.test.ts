import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventSourceSseTransport } from '../../src/sse/EventSourceSseTransport';
import type { SseTransportListener } from '../../src/sse/types';
import type { SseParsedEvent } from '../../src/sse/SseParser';
import { MockEventSource } from './helpers/MockEventSource';

function recordingListener() {
  const events: SseParsedEvent[] = [];
  const listener = {
    open: vi.fn(),
    event: vi.fn((event: SseParsedEvent) => {
      events.push(event);
    }),
    retry: vi.fn(),
    activity: vi.fn(),
    reconnecting: vi.fn()
  } satisfies SseTransportListener;
  return { listener, events };
}

describe('EventSourceSseTransport', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
  });

  const transportWith = (options: Partial<ConstructorParameters<typeof EventSourceSseTransport>[0]> = {}) =>
    new EventSourceSseTransport({ EventSourceConstructor: MockEventSource, ...options });

  it('delivers unnamed messages and the listed named event types', () => {
    const { listener, events } = recordingListener();
    void transportWith({ eventTypes: ['order.updated', 'message'] }).connect({ url: '/events' }, listener);
    const source = MockEventSource.instances[0]!;

    source.simulateOpen();
    source.simulateMessage('{"a":1}', { lastEventId: '4' });
    source.simulateMessage('{"id":7}', { type: 'order.updated', lastEventId: '5' });
    source.simulateMessage('ignored', { type: 'not.listed' });

    expect(listener.open).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      { type: 'message', data: '{"a":1}', lastEventId: '4' },
      { type: 'order.updated', data: '{"id":7}', lastEventId: '5' }
    ]);
    expect(listener.activity).toHaveBeenCalledTimes(2);
  });

  it('reports the browser reconnecting by itself, and the next open', () => {
    const { listener } = recordingListener();
    void transportWith().connect({ url: '/events' }, listener);
    const source = MockEventSource.instances[0]!;
    source.simulateOpen();

    source.simulateError(MockEventSource.CONNECTING);
    source.simulateOpen();

    expect(listener.reconnecting).toHaveBeenCalledTimes(1);
    expect(listener.open).toHaveBeenCalledTimes(2);
  });

  it('resolves as failed and closes the source when the browser gives up', async () => {
    const { listener } = recordingListener();
    const closed = transportWith().connect({ url: '/events' }, listener);
    const source = MockEventSource.instances[0]!;

    source.simulateError(MockEventSource.CLOSED);

    await expect(closed).resolves.toEqual({ reason: 'failed' });
    expect(source.onmessage).toBeNull();
  });

  it('closes the source and resolves as aborted on abort()', async () => {
    const transport = transportWith();
    const closed = transport.connect({ url: '/events' }, recordingListener().listener);
    const source = MockEventSource.instances[0]!;

    transport.abort();

    await expect(closed).resolves.toEqual({ reason: 'aborted' });
    expect(source.readyState).toBe(MockEventSource.CLOSED);
  });

  it('passes the last event id as a query parameter, and withCredentials', () => {
    const { listener } = recordingListener();
    void transportWith({ withCredentials: true }).connect({ url: '/events?topic=a#x', lastEventId: '4 2' }, listener);
    void transportWith({ lastEventIdParam: 'since' }).connect({ url: '/events', lastEventId: '9' }, listener);

    expect(MockEventSource.instances.map(source => source.url)).toEqual([
      '/events?topic=a&lastEventId=4%202#x',
      '/events?since=9'
    ]);
    expect(MockEventSource.instances[0]!.init).toEqual({ withCredentials: true });
  });

  it('reports a missing EventSource implementation as an error', async () => {
    const transport = new EventSourceSseTransport({ EventSourceConstructor: undefined });
    vi.stubGlobal('EventSource', undefined);

    await expect(transport.connect({ url: '/events' }, recordingListener().listener)).resolves.toMatchObject({
      reason: 'network-error',
      error: expect.objectContaining({ message: expect.stringContaining('EventSource') })
    });
    vi.unstubAllGlobals();
  });
});

describe('EventSourceSseTransport - an EventSource that cannot be created', () => {
  it('ends the connection as a network error, with what the constructor threw', async () => {
    const thrown = new SyntaxError('Invalid URL');
    class Throwing {
      constructor() {
        throw thrown;
      }
    }
    const { listener } = recordingListener();
    const transport = new EventSourceSseTransport({
      EventSourceConstructor: Throwing as unknown as typeof MockEventSource
    });

    await expect(transport.connect({ url: 'not a url' }, listener)).resolves.toEqual({
      reason: 'network-error',
      error: thrown
    });
    expect(listener.open).not.toHaveBeenCalled();
  });
});

describe('EventSourceSseTransport - what mutation testing showed the tests missed', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
  });

  it('ends as a network error when there is no EventSource at all', async () => {
    vi.stubGlobal('EventSource', undefined);
    const { listener } = recordingListener();
    const closed = await new EventSourceSseTransport({}).connect({ url: '/events' }, listener);
    expect(closed).toEqual({
      reason: 'network-error',
      error: new Error('No EventSource implementation: pass EventSourceConstructor or use the fetch transport')
    });
    vi.unstubAllGlobals();
  });

  it('creates its EventSource without credentials, and listens to no named event by default', () => {
    const { listener } = recordingListener();
    void new EventSourceSseTransport({ EventSourceConstructor: MockEventSource }).connect({ url: '/events' }, listener);
    const source = MockEventSource.instances[0]!;
    expect(source.init).toEqual({ withCredentials: false });
    expect((source as unknown as { listeners: Map<string, unknown> }).listeners.size).toBe(0);
  });

  it('works with a listener that has no reconnecting callback, and can be aborted before it connects', async () => {
    const transport = new EventSourceSseTransport({ EventSourceConstructor: MockEventSource });
    expect(() => transport.abort()).not.toThrow();
    const listener = { open() {}, event() {}, retry() {}, activity() {} };
    const closed = transport.connect({ url: '/events' }, listener);
    expect(() => MockEventSource.instances[0]!.simulateError(MockEventSource.CONNECTING)).not.toThrow();
    transport.abort();
    await expect(closed).resolves.toEqual({ reason: 'aborted' });
  });
});
