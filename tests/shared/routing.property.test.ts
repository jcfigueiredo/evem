import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { routeServerMessage, toServerEventName } from '../../src/shared/routing';
import { SseHandler } from '../../src/sse/SseHandler';
import { WebSocketHandler } from '../../src/websocket/WebSocketHandler';
import { FakeTransport } from '../sse/helpers/FakeTransport';
import { createMockWebSocketConstructor } from '../websocket/mocks/MockWebSocket';

// 100 generated cases per property by default; FC_NUM_RUNS=5000 pnpm test:nowatch <this file> searches longer
fc.configureGlobal({ numRuns: Number(process.env['FC_NUM_RUNS'] ?? 100) });

// Names made of a few segments, the prefixes among them, so names that already start with the prefix, or with a
// longer word that starts like it ('serverless'), come up often
const segment = fc.constantFrom('server', 'serverless', 'app', 'user', 'login', 'response');
const name = fc.oneof(
  { arbitrary: fc.array(segment, { minLength: 1, maxLength: 3 }).map(parts => parts.join('.')), weight: 4 },
  { arbitrary: fc.constant(''), weight: 1 }
);
const prefix = fc.constantFrom('server', 'app', '');

// Messages as a server sends them (JSON): mostly envelopes with the fields routing looks at, each maybe missing,
// of the wrong type or falsy; sometimes any JSON value at all
const envelope = fc.record(
  {
    type: fc.oneof(name, fc.constant('response'), fc.jsonValue()),
    event: fc.oneof(name, fc.jsonValue()),
    data: fc.jsonValue(),
    id: fc.oneof(fc.nat(), fc.string()),
    result: fc.jsonValue(),
    error: fc.oneof(fc.constantFrom(0, '', false, null), fc.jsonValue()),
    timestamp: fc.nat()
  },
  { requiredKeys: [] }
);
const message = fc.oneof({ arbitrary: envelope, weight: 4 }, { arbitrary: fc.jsonValue(), weight: 1 });

const NOW = 1_000_000;

/** The routing rules as the docs state them */
function documented(value: unknown, options: { prefix: string; channel: string; handleResponses: boolean }) {
  const { prefix: before, channel, handleResponses } = options;
  const named = (text: string) => (before === '' || text.startsWith(`${before}.`) ? text : `${before}.${text}`);
  const fields = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  if (handleResponses && fields['type'] === 'response') {
    const { id, result, error, timestamp = NOW } = fields;
    return error
      ? { event: `${channel}.response.error`, data: { id, error, timestamp } }
      : { event: `${channel}.response`, data: { id, result, timestamp } };
  }
  // A non-empty string event names it; else a non-empty string type other than 'response' (responses are only
  // special as a type)
  const { event, type } = fields;
  if (typeof event === 'string' && event !== '') return { event: named(event), data: fields['data'] };
  if (typeof type === 'string' && type !== '' && type !== 'response')
    return { event: named(type), data: fields['data'] };
  return { event: `${channel}.message`, data: value };
}

describe('Server routing - properties', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the prefix at most once', () => {
    fc.assert(
      fc.property(name, prefix, (text, before) => {
        const once = toServerEventName(text, before);
        expect(toServerEventName(once, before)).toBe(once);
        if (before !== '') expect(once.startsWith(`${before}.`)).toBe(true);
      })
    );
  });

  it('routes any message as the documented rules say', () => {
    fc.assert(
      fc.property(
        message,
        prefix,
        fc.constantFrom('ws', 'sse'),
        fc.boolean(),
        (value, before, channel, handleResponses) => {
          const options = { prefix: before, channel, handleResponses };
          expect(routeServerMessage(value, options)).toEqual(documented(value, options));
        }
      )
    );
  });

  it('publishes a message the same way over WebSocket and over SSE, with either separator', async () => {
    await fc.assert(
      fc.asyncProperty(message, prefix, fc.constantFrom('.', ':'), async (value, before, separator) => {
        const text = JSON.stringify(value);
        const published = { ws: [] as unknown[], sse: [] as unknown[] };
        const record = (into: unknown[], channel: string) => {
          const evem = new EvEm({ separator });
          evem.use((event, data) => {
            // The adapters' own state events (and SSE's readiness) aside; ws.message and sse.message are the same event
            const own = (name: string) => name.split('.').join(separator);
            if (!event.includes(own('connection.state')) && event !== own('sse.ready'))
              into.push({ event: event.replace(`${channel}${separator}`, 'channel.'), data });
            return data;
          });
          return evem;
        };

        const { constructor: Socket, instances } = createMockWebSocketConstructor({ autoConnect: false });
        const ws = new WebSocketHandler('wss://test.example.com', record(published.ws, 'ws'), {
          WebSocketConstructor: Socket,
          enableRequestResponse: false, // routes { type: 'response' } like any message, as SSE does
          serverEventPrefix: before
        });
        instances[0]!.simulateOpen();
        await vi.advanceTimersByTimeAsync(0);
        instances[0]!.simulateMessage(text);

        const transport = new FakeTransport();
        const sse = new SseHandler('https://api.test/events', record(published.sse, 'sse'), {
          transport,
          serverEventPrefix: before
        });
        await vi.advanceTimersByTimeAsync(0);
        transport.open();
        await transport.send(text);
        await vi.advanceTimersByTimeAsync(0);

        expect(published.ws).toEqual(published.sse);
        expect(published.ws).toHaveLength(1);
        await ws.disconnect();
        await sse.disconnect();
      })
    );
  });
});
