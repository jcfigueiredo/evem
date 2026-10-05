import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorPolicy, EvEm } from '../../src/eventEmitter';
import { MessageQueue } from '../../src/websocket/MessageQueue';
import { ConnectionManager } from '../../src/websocket/ConnectionManager';
import { RequestResponseManager } from '../../src/websocket/RequestResponseManager';
import { WebSocketHandler } from '../../src/websocket/WebSocketHandler';
import { MockWebSocket } from './mocks/MockWebSocket';

/**
 * A publish of `event` that rejects, as an app's own subscription can make it: a schema the data fails, with
 * schemaErrorPolicy THROW (exceeding the recursion limit would too)
 */
const rejectEvery = (evem: EvEm, event: string) =>
  evem.subscribe(event, () => {}, { schema: () => false, schemaErrorPolicy: ErrorPolicy.THROW });

/** Let the rejections that nobody handled be reported: Node.js does it once the microtasks have run */
const settle = () => new Promise(resolve => setTimeout(resolve, 10));

describe('The WebSocket adapter when a publish it makes rejects', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  let error: ReturnType<typeof vi.spyOn>;
  let evem: EvEm;

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    evem = new EvEm();
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const openSocket = () => {
    const socket = new MockWebSocket('wss://test.example.com');
    socket.simulateOpen();
    return socket;
  };
  const logged = (event: string) =>
    expect(error).toHaveBeenCalledWith(`Error publishing "${event}" from the WebSocket connection:`, expect.any(Error));

  it('logs a server message whose publish rejects', async () => {
    rejectEvery(evem, 'server.order.created');
    const socket = openSocket();
    const handler = new WebSocketHandler(socket, evem);

    socket.simulateMessage(JSON.stringify({ event: 'order.created', data: { id: 'not a number' } }));
    await settle();

    expect(unhandled).toEqual([]);
    logged('server.order.created');
    await handler.disconnect();
  });

  it('logs a ws.parse.error whose publish rejects', async () => {
    rejectEvery(evem, 'ws.parse.error');
    const socket = openSocket();
    const handler = new WebSocketHandler(socket, evem);

    socket.simulateMessage('not json');
    await settle();

    expect(unhandled).toEqual([]);
    logged('ws.parse.error');
    await handler.disconnect();
  });

  it("logs a socket error's ws.error whose publish rejects", async () => {
    rejectEvery(evem, 'ws.error');
    const socket = openSocket();
    const handler = new WebSocketHandler(socket, evem);

    socket.simulateError(new Error('socket failed'));
    await settle();

    expect(unhandled).toEqual([]);
    logged('ws.error');
    await handler.disconnect();
  });

  it('logs the ws.error of a socket it cannot create, and ws.reconnect.failed, when their publishes reject', async () => {
    rejectEvery(evem, 'ws.error');
    rejectEvery(evem, 'ws.reconnect.failed');
    const socket = openSocket();
    const handler = new WebSocketHandler(socket, evem, {
      reconnect: true,
      reconnectDelay: 1,
      maxReconnectAttempts: 1,
      WebSocketConstructor: class {
        constructor() {
          throw new Error('cannot create');
        }
      } as unknown as new (url: string) => MockWebSocket
    });

    socket.simulateClose(1006);
    await settle();

    expect(unhandled).toEqual([]);
    logged('ws.error');
    logged('ws.reconnect.failed');
    expect(handler.getConnectionState()).toBe('disconnected');
    await handler.disconnect();
  });

  it('logs a ws.queue.overflow whose publish rejects', async () => {
    rejectEvery(evem, 'ws.queue.overflow');
    const queue = new MessageQueue(evem, new ConnectionManager(evem));
    queue.enable(1);

    await evem.publish('ws.send', { n: 1 });
    await evem.publish('ws.send', { n: 2 });
    await settle();

    expect(unhandled).toEqual([]);
    logged('ws.queue.overflow');
  });

  it('rejects a request whose ws.send.request publish rejects, with that error, at once', async () => {
    rejectEvery(evem, 'ws.send.request');
    const manager = new RequestResponseManager(evem);

    await expect(manager.request('users.get', { id: 1 }, { timeout: 60_000 })).rejects.toThrow(
      "Schema validation failed for event 'ws.send.request'"
    );
    await settle();

    expect(unhandled).toEqual([]);
  });
});
