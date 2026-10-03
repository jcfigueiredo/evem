import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvEm } from '../../src/index';
import { WebSocketHandler } from '../../src/websocket/index';
import { FakeWebSocketServer, type FakeWebSocketBehavior } from '../../demo/src/fakes/webSocketServer';

afterEach(() => {
  vi.useRealTimers();
});

/** A server whose clock is the fake one, a handler connected to it, and the wire log as short lines */
function setup(behavior: FakeWebSocketBehavior = {}, options: ConstructorParameters<typeof WebSocketHandler>[2] = {}) {
  vi.useFakeTimers();
  const server = new FakeWebSocketServer(behavior, () => Date.now());
  const evem = new EvEm();
  const handler = new WebSocketHandler('wss://example.test/ws', evem, {
    ...options,
    WebSocketConstructor: server.socketClass
  });
  const wire = () => server.wire.map(entry => `${entry.direction}: ${entry.text}`);
  return { server, evem, handler, wire };
}

describe('FakeWebSocketServer', () => {
  it('opens a connection after its latency, like a browser socket', async () => {
    vi.useFakeTimers();
    const server = new FakeWebSocketServer({ latency: 50 });
    const socket = new server.socketClass('wss://example.test/ws');
    const opened = vi.fn();
    socket.onopen = opened;

    expect(socket.readyState).toBe(socket.CONNECTING);
    expect(() => socket.send('too early')).toThrow('CONNECTING');
    await vi.advanceTimersByTimeAsync(50);

    expect(socket.readyState).toBe(socket.OPEN);
    expect(opened).toHaveBeenCalledOnce();
    expect(server.openConnections).toBe(1);
    expect(server.wire.map(entry => entry.text)).toEqual(['connection 1 opened']);
  });

  it('answers requests by method: results, error responses, and a 404 for a method it lacks', async () => {
    const { handler } = setup({
      methods: {
        'users.get': params => ({ ...(params as object), name: 'Ada' }),
        'users.delete': () => {
          throw { code: 403, message: 'Not allowed' };
        }
      }
    });
    await vi.advanceTimersByTimeAsync(20);

    const user = handler.request('users.get', { id: 1 });
    const denied = handler.request('users.delete', { id: 1 });
    const missing = handler.request('users.rename', {});
    const outcomes = Promise.allSettled([user, denied, missing]);
    await vi.advanceTimersByTimeAsync(100);

    const [got, forbidden, notFound] = await outcomes;
    expect(got).toEqual({ status: 'fulfilled', value: { id: 1, name: 'Ada' } });
    expect(forbidden).toMatchObject({ status: 'rejected', reason: { message: 'Not allowed', code: 403 } });
    expect(notFound).toMatchObject({ status: 'rejected', reason: { message: 'No method users.rename', code: 404 } });
  });

  it('sends its own messages to every open connection: JSON, or a string as it is', async () => {
    const { server, evem } = setup();
    const news = vi.fn();
    const parseErrors = vi.fn();
    evem.subscribe('server.news', news);
    evem.subscribe('ws.parse.error', parseErrors);
    await vi.advanceTimersByTimeAsync(20);

    server.send({ event: 'news', data: { title: 'Hi' } });
    server.send('not json');
    await vi.advanceTimersByTimeAsync(20);

    expect(news).toHaveBeenCalledWith({ title: 'Hi' });
    expect(parseErrors).toHaveBeenCalledWith(expect.objectContaining({ rawData: 'not json' }));
  });

  it("logs the client's frames, and lets the scenario's onMessage answer them", async () => {
    const { evem, wire } = setup({
      onMessage: (message, server) => server.send({ event: 'echo', data: (message as { data: unknown }).data })
    });
    const echoed = vi.fn();
    evem.subscribe('server.echo', echoed);
    await vi.advanceTimersByTimeAsync(20);

    await evem.publish('ws.send', { event: 'say', data: 'hello' });
    await vi.advanceTimersByTimeAsync(40);

    expect(echoed).toHaveBeenCalledWith('hello');
    expect(wire()).toEqual([
      'note: connection 1 opened',
      'client: {"event":"say","data":"hello"}',
      'server: {"event":"echo","data":"hello"}'
    ]);
  });

  it('drops its connections and refuses the next ones, which WebSocketHandler reconnects through', async () => {
    const { server, handler, wire } = setup({}, { reconnect: true, reconnectDelay: 100 });
    await vi.advanceTimersByTimeAsync(20);
    expect(handler.getConnectionState()).toBe('connected');

    server.refuseNext();
    server.drop();
    await vi.advanceTimersByTimeAsync(0);
    expect(handler.getConnectionState()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(120);
    expect(handler.getConnectionState()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(120);
    expect(handler.getConnectionState()).toBe('connected');

    expect(wire()).toEqual([
      'note: connection 1 opened',
      'note: will refuse the next connection',
      'note: connection 1 dropped (1006)',
      'note: refused a connection',
      'note: connection 2 opened'
    ]);
  });

  it('notes an answer that comes after its connection closed as not sent, rather than as a frame the server sent', async () => {
    const { server, handler, wire } = setup({
      methods: { 'reports.build': () => new Promise(resolve => setTimeout(() => resolve({ rows: 120 }), 3000)) }
    });
    await vi.advanceTimersByTimeAsync(20);
    // Still pending when the test ends: the answer is lost, and the timeout is 5 s away
    void handler.request('reports.build', {}, { timeout: 5000 }).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(400);
    server.drop();
    await vi.advanceTimersByTimeAsync(3000);

    const lines = wire();
    expect(lines.at(-2)).toBe('note: connection 1 dropped (1006)');
    expect(lines.at(-1)).toMatch(
      /^note: not sent \(connection 1 is closed\): \{"type":"response","id":"[^"]+","result":\{"rows":120\}\}$/
    );
    expect(lines.filter(line => line.startsWith('server:'))).toEqual([]);
  });

  it('notes a send or a drop when no connection is open, instead of doing nothing', async () => {
    const { server, wire } = setup({}, { reconnect: false });
    await vi.advanceTimersByTimeAsync(20);
    server.drop();
    server.drop();
    server.send({ event: 'news' });

    expect(wire().slice(-3)).toEqual([
      'note: connection 1 dropped (1006)',
      'note: no open connection to drop',
      'note: no open connection: nothing sent'
    ]);
  });

  it('logs a client closing its connection, and close() stops it quietly', async () => {
    const { server, handler, wire } = setup();
    await vi.advanceTimersByTimeAsync(20);

    await handler.disconnect();
    expect(wire().at(-1)).toBe('note: connection 1 closed by the client (1000)');

    server.close();
    const late = new server.socketClass('wss://example.test/ws');
    const closed = vi.fn();
    late.onclose = closed;
    await vi.advanceTimersByTimeAsync(20);
    expect(closed).toHaveBeenCalled();
    expect(server.wire).toHaveLength(2);
  });
});
