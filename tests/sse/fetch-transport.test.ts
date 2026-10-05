import { describe, expect, it, vi, type Mock } from 'vitest';
import { FetchSseTransport } from '../../src/sse/FetchSseTransport';
import type { SseTransportListener } from '../../src/sse/types';
import type { SseParsedEvent } from '../../src/sse/SseParser';
import { createFakeFetch, flush } from './helpers/fakeFetch';

function recordingListener() {
  const events: SseParsedEvent[] = [];
  const listener: SseTransportListener & { opened: number; retries: number[]; activity: Mock<() => void> } = {
    opened: 0,
    retries: [],
    open() {
      this.opened++;
    },
    event: event => {
      events.push(event);
    },
    retry(milliseconds) {
      this.retries.push(milliseconds);
    },
    activity: vi.fn()
  };
  return { listener, events };
}

describe('FetchSseTransport', () => {
  it('streams events from the response body', async () => {
    const { fetch, calls } = createFakeFetch();
    const transport = new FetchSseTransport({ fetch });
    const { listener, events } = recordingListener();

    const closed = transport.connect({ url: 'https://api.test/events' }, listener);
    await flush();
    calls[0]!.stream.push('event: order.updated\nid: 1\ndata: {"id"');
    calls[0]!.stream.push(':7}\n\nretry: 5000\n: ping\n');
    calls[0]!.stream.close();

    await expect(closed).resolves.toEqual({ reason: 'ended' });
    expect(listener.opened).toBe(1);
    expect(events).toEqual([{ type: 'order.updated', data: '{"id":7}', lastEventId: '1' }]);
    expect(listener.retries).toEqual([5000]);
    expect(listener.activity).toHaveBeenCalledTimes(2);
  });

  it('sends Accept, the configured headers and Last-Event-ID', async () => {
    const { fetch, calls } = createFakeFetch();
    const headers = vi.fn(async () => ({ Authorization: 'Bearer t1' }));
    const transport = new FetchSseTransport({
      fetch,
      headers,
      method: 'POST',
      body: () => '{"topic":"orders"}',
      withCredentials: true
    });

    void transport.connect({ url: 'https://api.test/events', lastEventId: '41' }, recordingListener().listener);
    await flush();

    const init = calls[0]!.init;
    expect(Object.fromEntries(new Headers(init.headers).entries())).toEqual({
      accept: 'text/event-stream',
      authorization: 'Bearer t1',
      'last-event-id': '41'
    });
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"topic":"orders"}');
    expect(init.credentials).toBe('include');
    expect(headers).toHaveBeenCalledTimes(1);
    transport.abort();
  });

  it('calls fetch as a plain function, so browser fetch works', async () => {
    const { fetch } = createFakeFetch();
    const strictFetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return fetch(input, init);
    };
    const transport = new FetchSseTransport({ fetch: strictFetch as typeof globalThis.fetch });
    const { listener } = recordingListener();

    void transport.connect({ url: 'https://api.test/events' }, listener);
    await flush();

    expect(listener.opened).toBe(1);
    transport.abort();
  });

  it.each([
    [{ status: 204 }, { reason: 'no-content' }],
    [{ status: 401 }, { reason: 'http-error', status: 401 }],
    [
      { status: 503, headers: { 'retry-after': '7' } },
      { reason: 'http-error', status: 503, retryAfter: 7000 }
    ],
    [{ contentType: 'application/json' }, { reason: 'bad-content-type', contentType: 'application/json' }],
    [{ contentType: null }, { reason: 'bad-content-type', contentType: null }]
  ])('reports %j as %j without opening', async (response, expected) => {
    const { fetch } = createFakeFetch(() => response);
    const { listener } = recordingListener();

    await expect(
      new FetchSseTransport({ fetch }).connect({ url: 'https://api.test/events' }, listener)
    ).resolves.toEqual(expected);
    expect(listener.opened).toBe(0);
  });

  it('accepts a content type with parameters', async () => {
    const { fetch, calls } = createFakeFetch(() => ({ contentType: 'Text/Event-Stream; charset=utf-8' }));
    const { listener } = recordingListener();
    const closed = new FetchSseTransport({ fetch }).connect({ url: 'https://api.test/events' }, listener);
    await flush();
    calls[0]!.stream.close();

    await expect(closed).resolves.toEqual({ reason: 'ended' });
    expect(listener.opened).toBe(1);
  });

  it('reports network errors, including a stream that fails midway', async () => {
    const failingFetch = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(
      new FetchSseTransport({ fetch: failingFetch }).connect({ url: 'x' }, recordingListener().listener)
    ).resolves.toEqual({ reason: 'network-error', error: new TypeError('fetch failed') });

    const { fetch, calls } = createFakeFetch();
    const closed = new FetchSseTransport({ fetch }).connect({ url: 'x' }, recordingListener().listener);
    await flush();
    calls[0]!.stream.fail(new Error('connection reset'));
    await expect(closed).resolves.toEqual({ reason: 'network-error', error: new Error('connection reset') });
  });

  it('reports a failing headers function as an error', async () => {
    const { fetch } = createFakeFetch();
    const headers = () => {
      throw new Error('token refresh failed');
    };
    await expect(
      new FetchSseTransport({ fetch, headers }).connect({ url: 'x' }, recordingListener().listener)
    ).resolves.toEqual({ reason: 'network-error', error: new Error('token refresh failed') });
  });

  it('resolves as aborted after abort()', async () => {
    const { fetch } = createFakeFetch();
    const transport = new FetchSseTransport({ fetch });
    const closed = transport.connect({ url: 'x' }, recordingListener().listener);
    await flush();

    transport.abort();

    await expect(closed).resolves.toEqual({ reason: 'aborted' });
  });

  it('waits for an async event listener before reading more (backpressure)', async () => {
    const { fetch, calls } = createFakeFetch();
    const order: string[] = [];
    let release!: () => void;
    const listener: SseTransportListener = {
      open() {},
      retry() {},
      activity() {},
      event: event => {
        order.push(`start ${event.data}`);
        if (event.data === '1')
          return new Promise<void>(resolve => {
            release = () => {
              order.push('end 1');
              resolve();
            };
          });
      }
    };
    const closed = new FetchSseTransport({ fetch }).connect({ url: 'x' }, listener);
    await flush();
    calls[0]!.stream.push('data: 1\n\n');
    await flush();
    calls[0]!.stream.push('data: 2\n\n');
    calls[0]!.stream.close();
    await flush();
    expect(order).toEqual(['start 1']);

    release();
    await closed;

    expect(order).toEqual(['start 1', 'end 1', 'start 2']);
  });
});

describe('FetchSseTransport - id-only messages', () => {
  it('reports id-only messages in order with the events around them', async () => {
    const { fetch, calls } = createFakeFetch();
    const order: string[] = [];
    const listener: SseTransportListener = {
      open() {},
      retry() {},
      activity() {},
      event: event => {
        order.push(`event ${event.data} (${event.lastEventId})`);
      },
      lastEventId: id => {
        order.push(`id ${id}`);
      }
    };
    const closed = new FetchSseTransport({ fetch }).connect({ url: 'x' }, listener);
    await flush();
    calls[0]!.stream.push('id: 5\ndata: a\n\nid: 6\n\nid: 7\ndata: b\n\n');
    calls[0]!.stream.close();
    await closed;

    expect(order).toEqual(['event a (5)', 'id 6', 'event b (7)']);
  });
});

describe('FetchSseTransport - Retry-After as an HTTP date', () => {
  it.each([
    ['30 s from now', 30_000, 30_000],
    ['in the past', -60_000, 0]
  ])('waits until the date: %s', async (_case, offset, expected) => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const retryAfter = new Date(now + offset).toUTCString();
    const { fetch } = createFakeFetch(() => ({ status: 503, headers: { 'retry-after': retryAfter } }));
    const { listener } = recordingListener();

    await expect(
      new FetchSseTransport({ fetch }).connect({ url: 'https://api.test/events' }, listener)
    ).resolves.toEqual({
      reason: 'http-error',
      status: 503,
      retryAfter: expected
    });
    vi.restoreAllMocks();
  });

  it('ignores a Retry-After that is neither seconds nor a date', async () => {
    const { fetch } = createFakeFetch(() => ({ status: 503, headers: { 'retry-after': 'soon' } }));
    const { listener } = recordingListener();
    const closed = await new FetchSseTransport({ fetch }).connect({ url: 'https://api.test/events' }, listener);
    expect(closed).toEqual({ reason: 'http-error', status: 503 });
    expect('retryAfter' in closed && closed.retryAfter !== undefined).toBe(false);
  });
});
