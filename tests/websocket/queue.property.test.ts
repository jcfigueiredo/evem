import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { WebSocketHandler } from '../../src/websocket/WebSocketHandler';
import { createMockWebSocketConstructor } from './mocks/MockWebSocket';

// 100 generated cases per property by default; FC_NUM_RUNS=5000 pnpm test:nowatch <this file> searches longer
fc.configureGlobal({ numRuns: Number(process.env['FC_NUM_RUNS'] ?? 100) });

type Step = { kind: 'send' } | { kind: 'drop' } | { kind: 'reconnect' };

// Weighted toward sends, with drops and reconnects often enough to queue, overflow and flush
const step: fc.Arbitrary<Step> = fc.oneof(
  { arbitrary: fc.constant({ kind: 'send' } as const), weight: 5 },
  { arbitrary: fc.constant({ kind: 'drop' } as const), weight: 1 },
  { arbitrary: fc.constant({ kind: 'reconnect' } as const), weight: 1 }
);

/** Message n: an object for even n, a string for odd n (the queue tracks the two differently) */
const message = (n: number) => (n % 2 === 0 ? { n } : `m${n}`);

describe('WebSocket message queue - model-based', () => {
  it('sends every message once, in order, queueing while offline and dropping the oldest past queueSize', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(step, { minLength: 5, maxLength: 40 }),
        fc.integer({ min: 1, max: 4 }),
        async (steps, queueSize) => {
          vi.useFakeTimers();
          try {
            const { constructor: Socket, instances } = createMockWebSocketConstructor({ autoConnect: false });
            const evem = new EvEm();
            const overflows: unknown[] = [];
            evem.subscribe('ws.queue.overflow', ({ droppedMessage }: { droppedMessage: unknown }) => {
              overflows.push(droppedMessage);
            });
            const handler = new WebSocketHandler('wss://test.example.com', evem, {
              reconnect: true,
              reconnectDelay: 1,
              maxReconnectAttempts: Number.POSITIVE_INFINITY,
              queueSize,
              WebSocketConstructor: Socket
            });
            instances[0]!.simulateOpen();
            await vi.advanceTimersByTimeAsync(0);

            // The model
            let connected = true;
            let queue: unknown[] = [];
            const sent: unknown[] = [];
            const dropped: unknown[] = [];
            let next = 0;

            for (const { kind } of steps) {
              if (kind === 'send') {
                const data = message(next++);
                await evem.publish('ws.send', data);
                if (connected) sent.push(data);
                else {
                  queue.push(data);
                  if (queue.length > queueSize) dropped.push(queue.shift());
                }
              } else if (kind === 'drop' && connected) {
                instances.at(-1)!.simulateClose(1006);
                connected = false;
              } else if (kind === 'reconnect' && !connected) {
                await vi.advanceTimersByTimeAsync(1); // the handler creates the next socket
                instances.at(-1)!.simulateOpen();
                connected = true;
                sent.push(...queue);
                queue = [];
              }
              await vi.advanceTimersByTimeAsync(0);

              const onTheWire = instances.flatMap(socket => socket.sentMessages);
              expect(onTheWire).toEqual(sent.map(data => JSON.stringify(data)));
              expect(overflows).toEqual(dropped);
            }
            await handler.disconnect();
          } finally {
            vi.useRealTimers();
          }
        }
      )
    );
  });
});
