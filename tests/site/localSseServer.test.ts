import { describe, expect, it } from 'vitest';
import { EvEm } from '../../src/index';
import { SseHandler } from '../../src/sse/index';
import { checkLocalServer, LocalSseServer } from '../../demo/src/fakes/localSseServer';

const encoder = new TextEncoder();

/** A stand-in for the page's fetch: answers with `status` and a body whose chunks the test writes */
function stubFetch(status = 200, type = 'text/event-stream') {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    requests.push({ url, init });
    const body = new ReadableStream<Uint8Array>({ start: c => void (controller = c) });
    init.signal?.addEventListener('abort', () => {
      try {
        controller.error(new DOMException('The operation was aborted.', 'AbortError'));
      } catch {
        // Already over
      }
    });
    return new Response(status === 200 ? body : 'nope', { status, headers: { 'Content-Type': type } });
  };
  return {
    fetch,
    requests,
    write: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close()
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

describe('LocalSseServer', () => {
  it("passes the page's fetch through, logging the request, the status, every chunk and how the stream ended", async () => {
    const page = stubFetch();
    const server = new LocalSseServer(page.fetch, () => 0);
    const evem = new EvEm();
    const ticks: unknown[] = [];
    evem.subscribe('server.tick', tick => void ticks.push(tick));
    new SseHandler('http://localhost:5199/events', evem, { fetch: server.fetch, reconnect: false });
    await settle();
    expect(server.openConnections).toBe(1);

    page.write('event: tick\nid: 1\ndata: {"n":1}\n\n');
    await settle();
    page.end();
    await settle();

    expect(ticks).toEqual([{ n: 1 }]);
    expect(server.openConnections).toBe(0);
    expect(server.wire.map(entry => `${entry.direction}: ${entry.text}`)).toEqual([
      'client: GET http://localhost:5199/events',
      'note: connection 1 answered 200 (text/event-stream)',
      'server: event: tick\nid: 1\ndata: {"n":1}\n\n',
      'note: connection 1 ended by the server'
    ]);
  });

  it('logs a client that closes the stream, and a status that is no stream', async () => {
    const page = stubFetch();
    const server = new LocalSseServer(page.fetch, () => 0);
    const sse = new SseHandler('http://localhost:5199/events', new EvEm(), { fetch: server.fetch });
    await settle();
    await sse.disconnect();
    await settle();
    expect(server.wire.at(-1)?.text).toBe('connection 1 closed by the client');

    const failing = new LocalSseServer(stubFetch(500, 'text/plain').fetch, () => 0);
    new SseHandler('http://localhost:5199/events', new EvEm(), { fetch: failing.fetch, reconnect: false });
    await settle();
    expect(failing.wire.at(-1)?.text).toBe('connection 1 answered 500 (text/plain)');
    expect(() => failing.run('drop')).toThrow('The local server has no drop control');
  });

  it('notes a request that gets no answer at all', async () => {
    const server = new LocalSseServer(
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => 0
    );
    new SseHandler('http://localhost:5199/events', new EvEm(), { fetch: server.fetch, reconnect: false });
    await settle();
    expect(server.wire.at(-1)?.text).toBe('no answer: Failed to fetch');
  });
});

describe('checkLocalServer', () => {
  it('says whether an event stream answers, and what came instead', async () => {
    expect(await checkLocalServer('/events', stubFetch().fetch)).toBe('answering');
    expect(await checkLocalServer('/events', stubFetch(500, 'text/plain').fetch)).toBe('answered 500 (text/plain)');
    expect(await checkLocalServer('/events', () => Promise.reject(new TypeError('Failed to fetch')))).toBe(
      'no answer: Failed to fetch'
    );
  });
});
