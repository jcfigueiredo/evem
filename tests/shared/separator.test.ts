import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { routeServerMessage, toServerEventName } from '../../src/shared/routing';
import { SseHandler } from '../../src/sse/SseHandler';
import { WebSocketHandler } from '../../src/websocket/WebSocketHandler';
import { FakeTransport } from '../sse/helpers/FakeTransport';
import { createMockWebSocketConstructor } from '../websocket/mocks/MockWebSocket';

const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** Every event published on the emitter, as `name data` */
function recordAll(evem: EvEm): string[] {
  const log: string[] = [];
  evem.use((event, data) => {
    log.push(`${event} ${JSON.stringify(data, (key, value) => (key === 'timestamp' ? undefined : value))}`);
    return data;
  });
  return log;
}

describe('Routing with a separator', () => {
  it('joins the prefix with the separator, and keeps a name that already has it', () => {
    expect(toServerEventName('task-changed', 'server', ':')).toBe('server:task-changed');
    expect(toServerEventName('server:task-changed', 'server', ':')).toBe('server:task-changed');
    expect(toServerEventName('server.task-changed', 'server', ':')).toBe('server:server.task-changed');
    expect(toServerEventName('task', '', ':')).toBe('task');
  });

  it("names the adapter's own events with the separator", () => {
    const options = { prefix: 'server', channel: 'ws', handleResponses: true, separator: ':' };
    expect(routeServerMessage(42, options).event).toBe('ws:message');
    expect(routeServerMessage({ type: 'response', id: 1, result: 2 }, options).event).toBe('ws:response');
    expect(routeServerMessage({ type: 'response', id: 1, error: { code: 1 } }, options).event).toBe(
      'ws:response:error'
    );
    expect(routeServerMessage({ event: 'task-changed', data: 1 }, options)).toEqual({
      event: 'server:task-changed',
      data: 1
    });
  });
});

describe('WebSocketHandler with a separator', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('publishes and listens to its events with the separator: state, sends, queue, requests, server events', async () => {
    vi.useFakeTimers();
    const evem = new EvEm({ separator: ':' });
    const log = recordAll(evem);
    const { constructor: Socket, instances } = createMockWebSocketConstructor({ autoConnect: false });
    const handler = new WebSocketHandler('wss://test.example.com', evem, {
      WebSocketConstructor: Socket,
      reconnect: true,
      reconnectDelay: 1,
      queueSize: 1
    });
    instances[0]!.simulateOpen();
    await vi.advanceTimersByTimeAsync(0);

    await evem.publish('ws:send', { a: 1 });
    await evem.publish('ws:send:chat', { b: 2 });
    const answer = handler.request('sum', [1, 2]);
    await vi.advanceTimersByTimeAsync(0);
    const request = JSON.parse(instances[0]!.sentMessages.at(-1)!) as { id: string; type: string };
    instances[0]!.simulateMessage(JSON.stringify({ type: 'response', id: request.id, result: 3 }));
    await expect(answer).resolves.toBe(3);
    instances[0]!.simulateMessage(JSON.stringify({ event: 'task-changed', data: { lane: 'doing' } }));
    instances[0]!.simulateMessage('42');
    instances[0]!.simulateMessage('not json');

    instances[0]!.simulateClose(1006);
    await vi.advanceTimersByTimeAsync(0);
    await evem.publish('ws:send', { c: 3 });
    await evem.publish('ws:send', { d: 4 });
    await vi.advanceTimersByTimeAsync(1);
    instances[1]!.simulateOpen();
    await vi.advanceTimersByTimeAsync(0);

    expect(instances[0]!.sentMessages.slice(0, 2)).toEqual(['{"a":1}', '{"b":2}']);
    expect(request.type).toBe('request');
    expect(instances[1]!.sentMessages).toEqual(['{"d":4}']);
    const names = log.map(entry => entry.split(' ')[0]!);
    expect(names).toEqual(
      expect.arrayContaining([
        'ws:connection:state',
        'ws:send:request',
        'ws:response',
        'server:task-changed',
        'ws:message',
        'ws:parse:error',
        'ws:queue:overflow',
        'ws:send:queued'
      ])
    );
    expect(names.every(name => !name.includes('.'))).toBe(true);
    await handler.disconnect();
  });
});

describe('SseHandler with a separator', () => {
  it('publishes its events and server events with the separator', async () => {
    const evem = new EvEm({ separator: ':' });
    const log = recordAll(evem);
    const transport = new FakeTransport();
    const handler = new SseHandler('https://api.test/events', evem, { transport, rawEvents: true });
    await tick();
    transport.open();
    await tick();

    transport.send('{"lane":"doing"}', 'task-changed');
    transport.send('{"id":1}', 'server:order');
    transport.send('{"event":"chat:run-started","data":{"run":7}}');
    transport.send('"hello"');
    transport.send('not json', 'broken');
    await tick();
    transport.end({ reason: 'http-error', status: 401 });
    await tick();

    expect(log.filter(entry => !entry.startsWith('sse:event'))).toEqual([
      'sse:connection:state {"from":"disconnected","to":"connecting"}',
      'sse:connection:state {"from":"connecting","to":"connected"}',
      'sse:ready {}',
      'server:task-changed {"lane":"doing"}',
      'server:order {"id":1}',
      'server:chat:run-started {"run":7}',
      'sse:message "hello"',
      expect.stringMatching(/^sse:parse:error /),
      expect.stringMatching(/^sse:error /),
      'sse:connection:state {"from":"connected","to":"disconnected"}'
    ]);
    expect(log.filter(entry => entry.startsWith('sse:event'))).toHaveLength(4);
    await handler.disconnect();
  });
});
