import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvEm } from '../../src/index';
import { SseHandler, type SseHandlerOptions } from '../../src/sse/index';
import { FakeSseServer, type FakeSseBehavior } from '../../demo/src/fakes/sseServer';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A server on the fake clock, an SseHandler reading from it, what the handler published, and the wire as lines */
function setup(behavior: FakeSseBehavior = {}, options: SseHandlerOptions = {}) {
  vi.useFakeTimers();
  // No jitter in reconnect delays
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const server = new FakeSseServer(behavior, () => Date.now());
  const evem = new EvEm();
  const published: string[] = [];
  evem.use((event, data) => {
    if (event !== 'sse.connection.state') published.push(event);
    else published.push(`state ${(data as { to: string }).to}`);
    return data;
  });
  const sse = new SseHandler('https://api.test/events', evem, { reconnectDelay: 100, ...options, fetch: server.fetch });
  const wire = () => server.wire.map(entry => `${entry.direction}: ${entry.text}`);
  return { server, evem, sse, published, wire };
}

describe('FakeSseServer', () => {
  it('answers a request with an event stream after its latency, and writes formatted messages to it', async () => {
    const { server, published, wire } = setup({
      onOpen: stream => stream.send({ event: 'hello', data: { n: 1 }, id: 1 })
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(server.openConnections).toBe(1);
    await vi.advanceTimersByTimeAsync(20);

    expect(published).toEqual(['state connecting', 'state connected', 'server.hello']);
    expect(wire()).toEqual([
      'client: GET https://api.test/events',
      'note: connection 1 opened (200, text/event-stream)',
      'server: event: hello\nid: 1\ndata: {"n":1}\n\n'
    ]);
  });

  it('writes text as it is, or in two chunks split inside a character, which the client still reads whole', async () => {
    const { server, evem, wire } = setup();
    const notes: unknown[] = [];
    evem.subscribe('server.note', note => void notes.push(note));
    await vi.advanceTimersByTimeAsync(20);

    server.run('split', 'event: note\ndata: "Café"\n\n');
    server.run('send', 'event: note\ndata: "plain"\n\n');
    await vi.advanceTimersByTimeAsync(20);

    expect(notes).toEqual(['Café', 'plain']);
    expect(wire().slice(-3)).toEqual([
      'server: event: note\ndata: "Caf\\xC3',
      'server: \\xA9"\n\n',
      'server: event: note\ndata: "plain"\n\n'
    ]);
  });

  it('sends heartbeats, and goes silent so that the client times out and reconnects', async () => {
    const { server, published, wire } = setup({ heartbeat: 100 }, { heartbeatTimeout: 250 });
    await vi.advanceTimersByTimeAsync(220);
    expect(wire().filter(line => line === 'server: : ping\n\n')).toHaveLength(2);

    server.run('silent');
    await vi.advanceTimersByTimeAsync(400);

    expect(published).toContain('sse.error');
    expect(wire()).toContain('note: connection 1: the server stops writing, and keeps it open');
    expect(wire()).toContain('note: connection 1 closed by the client');
    expect(wire().at(-1)).toBe('note: connection 2 opened (200, text/event-stream)');
    expect(published.at(-1)).toBe('state connected');
  });

  it('ends a stream, drops it, or refuses the next connection, and resumes after the Last-Event-ID', async () => {
    const { server, published, wire } = setup({
      onOpen: stream =>
        stream.send({
          event: 'tick',
          data: Number(stream.lastEventId ?? 0) + 1,
          id: Number(stream.lastEventId ?? 0) + 1
        })
    });
    await vi.advanceTimersByTimeAsync(40);

    server.run('end');
    await vi.advanceTimersByTimeAsync(160);
    server.run('refuse');
    server.run('drop');
    await vi.advanceTimersByTimeAsync(400);

    expect(published.filter(event => event === 'server.tick')).toHaveLength(3);
    expect(wire()).toEqual([
      'client: GET https://api.test/events',
      'note: connection 1 opened (200, text/event-stream)',
      'server: event: tick\nid: 1\ndata: 1\n\n',
      'note: connection 1 ended by the server',
      'client: GET https://api.test/events · last-event-id: 1',
      'note: connection 2 opened (200, text/event-stream)',
      'server: event: tick\nid: 2\ndata: 2\n\n',
      'note: will refuse the next connection',
      'note: connection 2 dropped (network error)',
      'client: GET https://api.test/events · last-event-id: 2',
      'note: refused a connection (network error)',
      'client: GET https://api.test/events · last-event-id: 2',
      'note: connection 3 opened (200, text/event-stream)',
      'server: event: tick\nid: 3\ndata: 3\n\n'
    ]);
  });

  it('restarts with a status and Retry-After, once: the client waits at least that long', async () => {
    const { server, published, wire } = setup();
    await vi.advanceTimersByTimeAsync(20);

    server.run('restart', '503 1');
    await vi.advanceTimersByTimeAsync(200);
    expect(wire().slice(-4)).toEqual([
      'note: will answer the next request with 503 Service Unavailable · Retry-After: 1',
      'note: connection 1 ended by the server',
      'client: GET https://api.test/events',
      'note: connection 2 answered 503 Service Unavailable · Retry-After: 1'
    ]);
    expect(published).toContain('sse.error');

    await vi.advanceTimersByTimeAsync(800);
    expect(server.openConnections).toBe(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(server.openConnections).toBe(1);
    expect(wire().at(-1)).toBe('note: connection 3 opened (200, text/event-stream)');
  });

  it('answers a 401 or a 204 the way they stop SseHandler, with and without an error', async () => {
    const unauthorized = setup();
    await vi.advanceTimersByTimeAsync(20);
    unauthorized.server.restart(401);
    await vi.advanceTimersByTimeAsync(300);
    expect(unauthorized.published.slice(-2)).toEqual(['sse.error', 'state disconnected']);

    const noContent = setup();
    await vi.advanceTimersByTimeAsync(20);
    noContent.server.restart(204);
    await vi.advanceTimersByTimeAsync(300);
    expect(noContent.published).not.toContain('sse.error');
    expect(noContent.wire().at(-1)).toBe('note: connection 2 answered 204 No Content');
  });

  it('shows the headers the client sends, and notes a control with no open stream instead of doing nothing', async () => {
    const { server, sse, wire } = setup({}, { headers: { Authorization: 'Bearer t0ken' }, reconnect: false });
    await vi.advanceTimersByTimeAsync(20);
    await sse.disconnect();

    server.run('send', 'data: 1\n\n');
    server.run('end');
    expect(wire()).toEqual([
      'client: GET https://api.test/events · authorization: Bearer t0ken',
      'note: connection 1 opened (200, text/event-stream)',
      'note: connection 1 closed by the client',
      'note: no open stream: nothing sent',
      'note: no open stream: nothing to end'
    ]);
    expect(() => server.run('explode')).toThrow('The SSE server has no command explode');
  });

  it("logs a request's URL as given, so an absolute URL in edited code shows where it was meant to go", async () => {
    const { wire } = setup();
    await vi.advanceTimersByTimeAsync(20);
    expect(wire()[0]).toBe('client: GET https://api.test/events');
  });

  it('notes a write to a silenced stream, and an empty write, instead of writing nothing quietly', async () => {
    const { server, wire } = setup();
    await vi.advanceTimersByTimeAsync(20);
    server.run('silent');
    server.run('send', 'event: note\ndata: "lost"\n\n');
    server.run('ping');
    expect(wire().slice(-2)).toEqual([
      'note: connection 1 is silent: nothing sent',
      'note: connection 1 is silent: no ping sent'
    ]);

    server.run('send', '');
    server.run('split', '');
    expect(wire().slice(-2)).toEqual([
      'note: nothing to write: the text is empty',
      'note: nothing to write: the text is empty'
    ]);
  });

  it('closes quietly when the scenario starts over: its streams end, nothing more is logged', async () => {
    const { server, published, wire } = setup({ heartbeat: 50 }, { reconnect: false });
    await vi.advanceTimersByTimeAsync(20);
    const logged = wire().length;

    server.close();
    await vi.advanceTimersByTimeAsync(500);

    expect(server.openConnections).toBe(0);
    expect(wire()).toHaveLength(logged);
    expect(published.at(-1)).toBe('state disconnected');
  });
});
