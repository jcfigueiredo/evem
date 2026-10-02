import { EvEm } from '~/eventEmitter';
import { routeServerMessage, toServerEventName, type RouteOptions } from '~/shared/routing';
import { SSE_HEADERS, formatSseComment, formatSseMessage } from '~/sse/format';
import { SseHandler, defaultShouldReconnect } from '~/sse/SseHandler';
import { SseParser } from '~/sse/SseParser';
import type { SseCloseInfo } from '~/sse/types';
import { loadInlineDeclarations } from './demoPages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Conformance tests for sse-demo.html, whose inline copies of the SSE adapter must behave like the
 * real one (src/sse, src/shared):
 * - the inline SseParser against SseParser, on the parser tests' vectors fed in every kind of chunking;
 * - the inline formatSseMessage / formatSseComment / SSE_HEADERS against src/sse/format.ts;
 * - the inline routeServerMessage / toServerEventName against src/shared/routing.ts;
 * - the inline SseHandler (with its FetchSseTransport and ConnectionManager) against the real
 *   SseHandler: both connect to the page's own simulated server through its fake fetch, the same
 *   scenario is played against each (failures, reconnects, resume, heartbeats), and everything they
 *   publish and every request they send must be the same, at the same (fake) times.
 */

const page = loadInlineDeclarations('sse-demo.html', [
  'EvEm',
  'SSE_HEADERS',
  'assertSingleLine',
  'formatSseMessage',
  'formatSseComment',
  'SseParser',
  'parseRetryAfter',
  'checkResponse',
  'FetchSseTransport',
  'toServerEventName',
  'isNonEmptyString',
  'routeServerMessage',
  'ConnectionManager',
  'defaultShouldReconnect',
  'errorFor',
  'SseHandler',
  'SimulatedSseServer'
]);

// ---------------------------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------------------------

type ParserClass = new (callbacks: any, initialLastEventId?: string) => { feed(chunk: string): void; end(): void };

function parseWith(Parser: ParserClass, chunks: string[], initialLastEventId?: string) {
  const events: unknown[] = [];
  const retries: number[] = [];
  const comments: string[] = [];
  /** Id changes from messages without data, in stream order relative to the events */
  const lastEventIds: Array<[afterEvents: number, id: string]> = [];
  const parser = new Parser(
    {
      onEvent: (event: unknown) => events.push(event),
      onRetry: (milliseconds: number) => retries.push(milliseconds),
      onComment: (text: string) => comments.push(text),
      onLastEventId: (id: string) => lastEventIds.push([events.length, id])
    },
    initialLastEventId
  );
  for (const chunk of chunks) parser.feed(chunk);
  parser.end();
  return { events, retries, comments, lastEventIds };
}

/** Streams from tests/sse/parser.test.ts, plus a few more edge cases */
const PARSER_VECTORS: Array<[name: string, stream: string, initialLastEventId?: string]> = [
  ['multi-line data', 'data: YHOO\ndata: +2\ndata: 10\n\n'],
  [
    'ids, id reset, one leading space stripped',
    ': test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n\n'
  ],
  ['empty data, embedded newline, unterminated event', 'data\n\ndata\ndata\n\ndata:'],
  ['data:test and data: test', 'data:test\n\ndata: test\n\n'],
  ['named and unnamed events', 'event: order.updated\ndata: {"id":7}\n\ndata: plain\n\n'],
  ['an event without data resets its type', 'event: ignored\n\ndata: x\n\n'],
  ['the last id carries over', 'id: 7\ndata: a\n\ndata: b\n\n'],
  ['an id containing NULL is ignored', 'id: 5\ndata: a\n\nid: 6\0\ndata: b\n\n'],
  ['retry: digits only', 'retry: 5000\nretry: 1a\nretry: -1\nretry:\nretry: 250\n\n'],
  ['unknown fields and comments', ': ping\nfoo: bar\ndata: x\n\n'],
  ['a line without a colon', 'data\ndata: x\n\n'],
  ['an initial last event id', 'data: a\n\n', '41'],
  ['CRLF, CR and LF line endings', 'event: e\r\nid: 1\rdata: one\ndata: two\r\n\r\n: c\rdata: three\n\n'],
  ['a leading BOM', '﻿data: a\n\n'],
  ['a BOM inside data is kept', 'data: ﻿a\n\n'],
  ['an incomplete last event is discarded', 'data: a\n\ndata: b\n'],
  ['colons in the value', 'data: a:b: c\nevent: x:y\n\n'],
  ['an empty event name means message', 'event:\ndata: x\n\n'],
  ['field names are case-sensitive', 'Data: x\nDATA: y\ndata: z\n\n'],
  ['runs of blank lines', '\n\n\n\ndata: x\n\n\n\r\n\r'],
  ['comments only', ':\n: one\n:two\n\n'],
  ['non-ASCII data', 'data: {"text":"Café ☕ 🌙"}\nid: é\n\n'],
  ['ids without data', 'id: 0\n\nid: 0\n\nretry: 10\n\nid: 3\nevent: x\n\ndata: a\n\nid\n\n'],
  ['an id without data after an initial id', 'id: 41\n\nid: 42\n\n', '41']
];

/** Deterministic pseudo-random numbers */
function prng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

/** Cut a stream into random chunks; with `allowEmpty`, some of them are empty */
function randomChunks(stream: string, random: () => number, allowEmpty = false): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < stream.length;) {
    const size = Math.floor(random() * 6) + (allowEmpty ? 0 : 1);
    chunks.push(stream.slice(start, start + size));
    start += size;
  }
  return chunks;
}

describe('sse-demo.html: inline SseParser', () => {
  it('handles the documented pitfall: a CR at the end of a chunk and an LF at the start of the next end one line', () => {
    const { events } = parseWith(page.SseParser, ['data: a\r', '\n\r', '\ndata: b\n\n']);
    expect(events).toEqual([
      { type: 'message', data: 'a', lastEventId: '' },
      { type: 'message', data: 'b', lastEventId: '' }
    ]);
  });

  it.each(PARSER_VECTORS)('parses %s like SseParser', (_, stream, initialLastEventId) => {
    expect(parseWith(page.SseParser, [stream], initialLastEventId)).toEqual(
      parseWith(SseParser, [stream], initialLastEventId)
    );
  });

  it.each(PARSER_VECTORS)(
    'parses %s like SseParser, however it is split into chunks',
    (_, stream, initialLastEventId) => {
      const expected = parseWith(SseParser, [stream], initialLastEventId);
      expect(parseWith(page.SseParser, stream.split(''), initialLastEventId)).toEqual(expected);
      for (let i = 0; i <= stream.length; i++) {
        expect(parseWith(page.SseParser, [stream.slice(0, i), stream.slice(i)], initialLastEventId)).toEqual(expected);
      }
    }
  );

  const longStream = PARSER_VECTORS.filter(([, , initial]) => initial === undefined)
    .map(([, text]) => text)
    .join('\n');

  it('parses a long stream with every kind of line ending like SseParser, in random chunks (CR/LF pairs split across chunks)', () => {
    const random = prng(7);
    for (const ending of ['\n', '\r', '\r\n']) {
      const text = longStream.replace(/\r\n|\r|\n/g, ending);
      const expected = parseWith(SseParser, [text]);
      expect(expected.events.length).toBeGreaterThan(20);
      for (let run = 0; run < 150; run++) {
        expect(parseWith(page.SseParser, randomChunks(text, random))).toEqual(expected);
      }
    }
  });

  it('parses the same chunks like SseParser, empty chunks included', () => {
    // An empty chunk between a chunk ending in CR and one starting with LF must not split the CRLF
    const random = prng(99);
    const text = longStream.replace(/\r\n|\r|\n/g, '\r\n');
    for (let run = 0; run < 150; run++) {
      const chunks = randomChunks(text, random, true);
      expect(parseWith(page.SseParser, chunks)).toEqual(parseWith(SseParser, chunks));
    }
    const split = ['data: a\r', '', '\ndata: b\n\n'];
    expect(parseWith(page.SseParser, split)).toEqual(parseWith(SseParser, split));
    expect(parseWith(page.SseParser, split).events).toEqual([{ type: 'message', data: 'a\nb', lastEventId: '' }]);
  });

  it('parses what the formatter writes like SseParser, whichever formatter wrote it', () => {
    const messages = [
      formatSseMessage({ event: 'order.updated', id: 1, data: { id: 7, note: 'a\nb\r\nc' } }),
      formatSseMessage({ data: 'x\ry' }, { raw: true }),
      formatSseMessage({ event: 'order.created', id: 2, data: { id: 8 } }, { envelope: true }),
      formatSseComment('ping'),
      formatSseMessage({ retry: 1500 })
    ].join('');
    expect(parseWith(page.SseParser, messages.split(''))).toEqual(parseWith(SseParser, [messages]));
  });
});

// ---------------------------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------------------------

/** What a formatter call returns, or the error it throws */
function outcome(format: () => string) {
  try {
    return { text: format() };
  } catch (error) {
    return { error: (error as Error).name, message: (error as Error).message };
  }
}

const MESSAGE_VECTORS: ReadonlyArray<readonly [message: Record<string, unknown>, options?: Record<string, unknown>]> = [
  [{ event: 'order.updated', id: 42, data: { id: 7, status: 'shipped' } }],
  [{ data: 'hello' }],
  [{ data: 'line one\nline two\r\nline three\rfour' }],
  [{ data: 'line one\nline two\r\nline three\rfour' }, { raw: true }],
  [{ data: { a: 1 } }, { raw: true }],
  [{ event: 'refresh' }],
  [{ retry: 5000 }],
  [{ retry: 0, id: 0 }],
  [{ id: 'abc' }],
  [{}],
  [{ data: null }],
  [{ data: 0 }],
  [{ data: false }],
  [{ data: [1, 'two', null] }],
  [{ data: () => 1 }],
  [{ event: '', data: 1 }],
  [{ event: 'order.updated', id: '3', data: { id: 7 } }, { envelope: true }],
  [{ event: 'ping' }, { envelope: true }],
  [
    { event: 'note', data: 'multi\nline' },
    { envelope: true, raw: true }
  ],
  [{ event: 'chat.message', data: 'hi\n\nevent: admin.alert\ndata: {"forged":true}' }],
  [{ event: 'chat.message', data: 'hi\n\nevent: admin.alert\ndata: {"forged":true}' }, { raw: true }],
  [{ event: 'Café ☕', id: 'é', data: '🌙' }],
  // Rejected
  [{ event: 'a\nb', data: 1 }],
  [{ event: 'a\rb', data: 1 }],
  [{ id: '1\n2', data: 1 }],
  [{ id: 'x\0', data: 1 }],
  [{ retry: -1 }],
  [{ retry: 1.5 }],
  [{ retry: Number.NaN }],
  [{ retry: Number.POSITIVE_INFINITY }],
  [{ retry: Number.MAX_SAFE_INTEGER }],
  [{ retry: 2 ** 53 }],
  [{ retry: 1e21 }],
  [{ data: 1 }, { envelope: true }],
  [{ event: '', data: 1 }, { envelope: true }]
];

describe('sse-demo.html: inline formatSseMessage, formatSseComment and SSE_HEADERS', () => {
  it.each(
    MESSAGE_VECTORS.map(
      ([message, options]) => [JSON.stringify(message) ?? '', JSON.stringify(options) ?? '', message, options] as const
    )
  )('formats %s %s like formatSseMessage', (_, __, message, options) => {
    expect(outcome(() => page.formatSseMessage(message, options))).toEqual(
      outcome(() => formatSseMessage(message, options))
    );
  });

  it('formats generated event names, ids and data like formatSseMessage', () => {
    const random = prng(12345);
    const pieces = [
      'a',
      'Z',
      ' ',
      ':',
      '\n',
      '\r',
      '\r\n',
      '\n\n',
      'data: x',
      'event: forged',
      'id: 9',
      '\0',
      'é',
      '😀',
      '{"k":1}'
    ];
    for (let n = 0; n < 300; n++) {
      let text = '';
      for (let i = Math.floor(random() * 10); i > 0; i--) text += pieces[Math.floor(random() * pieces.length)];
      for (const [message, options] of [
        [{ event: text, id: text, data: { text } }, {}],
        [{ data: text }, { raw: true }],
        [{ event: text || 'x', data: text }, { envelope: true }],
        [{ id: text, retry: n }, {}]
      ] as const) {
        expect(outcome(() => page.formatSseMessage(message, options))).toEqual(
          outcome(() => formatSseMessage(message, options))
        );
      }
      expect(page.formatSseComment(text)).toBe(formatSseComment(text));
    }
  });

  it.each(['ping', '', 'two\nlines', 'a\r\nb\rc', 'a\n\ndata: forged', '\n'])(
    'formats the comment %j like formatSseComment',
    text => {
      expect(page.formatSseComment(text)).toBe(formatSseComment(text));
    }
  );

  it('formats an empty comment like formatSseComment', () => {
    expect(page.formatSseComment()).toBe(formatSseComment());
  });

  it('has the same SSE_HEADERS, frozen', () => {
    expect(page.SSE_HEADERS).toEqual(SSE_HEADERS);
    expect(Object.isFrozen(page.SSE_HEADERS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------

const ROUTE_MESSAGES: unknown[] = [
  null,
  undefined,
  42,
  'text',
  true,
  [],
  [1, 2],
  {},
  { event: 'order.updated', data: { id: 7 } },
  { event: 'server.order.updated', data: 1 },
  { event: '', data: 1 },
  { event: 5, data: 1 },
  { event: 'x' },
  { type: 'order.updated', data: 2 },
  { type: '', data: 1 },
  { event: 'a', type: 'b', data: 1 },
  { type: 'response', id: 1, result: 'r', timestamp: 5 },
  { type: 'response', id: 1, error: { code: 1 }, timestamp: 5 },
  { type: 'response', id: 2, result: 2 },
  { type: 'response', id: 3, error: 'bad' },
  { text: 'hi', level: 'info' }
];

const ROUTE_OPTIONS: RouteOptions[] = [
  { prefix: 'server', channel: 'sse', handleResponses: false },
  { prefix: '', channel: 'sse', handleResponses: false },
  { prefix: 'app', channel: 'sse', handleResponses: false },
  { prefix: 'server', channel: 'ws', handleResponses: true }
];

describe('sse-demo.html: inline routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(ROUTE_OPTIONS)('routes every kind of message like routeServerMessage with %j', options => {
    for (const message of ROUTE_MESSAGES) {
      expect({ message, routed: page.routeServerMessage(message, options) }).toEqual({
        message,
        routed: routeServerMessage(message, options)
      });
    }
  });

  it('names server events like toServerEventName', () => {
    const cases = [
      ['order.updated', 'server'],
      ['server.order', 'server'],
      ['server', 'server'],
      ['serverx.a', 'server'],
      ['server.', 'server'],
      ['', 'server'],
      ['a', ''],
      ['app.x', 'app'],
      ['x.app', 'app']
    ] as const;
    for (const [name, prefix] of cases) {
      expect({ name, prefix, routed: page.toServerEventName(name, prefix) }).toEqual({
        name,
        prefix,
        routed: toServerEventName(name, prefix)
      });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// SseHandler, against the page's simulated server
// ---------------------------------------------------------------------------------------------

/** The options the page creates its handler with (except fetch, which each run sets) */
const PAGE_OPTIONS = {
  rawEvents: true,
  heartbeatTimeout: 4000,
  reconnectDelay: 1000,
  maxReconnectDelay: 8000,
  maxReconnectAttempts: 4
};

interface Scenario {
  server: any;
  handler: any;
  advance(milliseconds: number): Promise<void>;
}

interface Run {
  /** [ms since start, event, payload] for everything published */
  published: Array<[number, string, unknown]>;
  /** [ms since start, Authorization, Last-Event-ID] for every request */
  requests: Array<[number, string | null, string | null]>;
  /** What was logged with console.error */
  logged: string[];
  finalState: string;
  lastEventId: string | undefined;
  /** The id of the server's last event */
  serverLastId: number;
}

/** Comparable payloads: errors by name and message, state changes without their timestamp */
function comparable(event: string, data: any): unknown {
  if (event.endsWith('.connection.state')) {
    return { from: data.from, to: data.to };
  }
  if (data && typeof data === 'object' && data.error instanceof Error) {
    return { ...data, error: { name: data.error.name, message: data.error.message } };
  }
  return data;
}

/**
 * Play a scenario against a handler connected to the page's simulated server, with fake timers.
 * `implementation` picks the real SseHandler or the page's copy; `emitter` the real EvEm or the page's.
 */
async function play(
  implementation: 'real' | 'inline',
  scenario: (context: Scenario) => Promise<void>,
  {
    options = {},
    random = 0.5,
    emitter = 'real',
    server: serverOptions = {}
  }: { options?: object; random?: number; emitter?: 'real' | 'inline'; server?: object } = {}
): Promise<Run> {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.spyOn(Math, 'random').mockReturnValue(random);
  vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
    run.logged.push(String(message));
  });
  const start = Date.now();
  const run: Run = { published: [], requests: [], logged: [], finalState: '', lastEventId: undefined, serverLastId: 0 };

  const server = new page.SimulatedSseServer({
    ...serverOptions,
    onRequest: (request: { authorization: string | null; lastEventId: string | null }) => {
      run.requests.push([Date.now() - start, request.authorization, request.lastEventId]);
    }
  });
  server.start();

  const evem = emitter === 'real' ? new EvEm() : new page.EvEm();
  evem.use((event: string, data: unknown) => {
    run.published.push([Date.now() - start, event, comparable(event, data)]);
    return data;
  });

  const Handler = implementation === 'real' ? SseHandler : page.SseHandler;
  let token = 0;
  const handler = new Handler('http://localhost/api/events', evem, {
    ...PAGE_OPTIONS,
    fetch: server.fetch,
    headers: () => ({ Authorization: `Bearer token-${++token}` }),
    ...options
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    await scenario({
      server,
      handler,
      advance: async milliseconds => {
        await vi.advanceTimersByTimeAsync(milliseconds);
      }
    });
    run.finalState = handler.getConnectionState();
    run.lastEventId = handler.getLastEventId();
    run.serverLastId = server.nextId - 1;
    await handler.disconnect();
    await vi.advanceTimersByTimeAsync(0);
  } finally {
    server.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
  return run;
}

/** Play a scenario against both handlers; the inline one must do exactly what the real one does */
async function expectSameAsReal(
  scenario: (context: Scenario) => Promise<void>,
  settings: Parameters<typeof play>[2] = {}
): Promise<Run> {
  const real = await play('real', scenario, settings);
  const inline = await play('inline', scenario, settings);
  expect(inline).toEqual(real);
  return real;
}

const named = (run: Run, event: string) => run.published.filter(([, name]) => name === event);
const states = (run: Run) => named(run, 'sse.connection.state').map(([, , data]) => (data as { to: string }).to);
/** The ids of the events the subscribers received (sse.event carries them, with rawEvents) */
const receivedIds = (run: Run) =>
  [...named(run, 'sse.event'), ...named(run, 'sse.parse.error')]
    .sort(([a], [b]) => a - b)
    .map(([, , data]) => Number((data as { lastEventId: string }).lastEventId));

describe("sse-demo.html: inline SseHandler against the real one, on the page's simulated server", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('connects and routes named events, envelopes, unnamed messages, malformed JSON and retry: the same way', async () => {
    const send = async ({ server, advance }: Scenario) => {
      await advance(300);
      server.sendOrder();
      server.sendOrder({ envelope: true });
      server.sendNotice();
      server.sendNotice();
      server.sendMalformed();
      server.sendRetry(1500);
      server.tick();
      await advance(6000);
    };
    const run = await expectSameAsReal(send);

    expect(states(run)).toEqual(['connecting', 'connected', 'disconnecting', 'disconnected']);
    expect(run.published.map(([, event]) => event)).toEqual(
      expect.arrayContaining([
        'server.order.created',
        'server.order.updated',
        'sse.message',
        'sse.parse.error',
        'server.price.updated'
      ])
    );
    expect(named(run, 'sse.message').map(([, , data]) => data)).toEqual([
      { text: 'Maintenance tonight at 22:00 UTC', level: 'info' },
      { text: 'Café ☕ menu: now with UTF-8', level: 'info' }
    ]);

    // The same, with the server cutting its writes into small chunks (inside lines and UTF-8 characters)
    const eventsOf = (played: Run) => played.published.map(([, event, data]) => [event, data]);
    for (const random of [0.05, 0.5, 0.97]) {
      const whole = await play('real', send, { random });
      const chunked = await expectSameAsReal(
        async context => {
          context.server.smallChunks = true;
          await send(context);
        },
        { random }
      );
      expect(eventsOf(chunked)).toEqual(eventsOf(whole));
    }
  });

  it("the page's own EvEm with the inline handler publishes what the real EvEm with the real handler does", async () => {
    const scenario = async ({ server, advance }: Scenario) => {
      await advance(300);
      server.sendOrder();
      server.sendNotice();
      server.sendMalformed();
      server.dropNetwork(2000);
      await advance(8000);
    };
    const real = await play('real', scenario);
    const inline = await play('inline', scenario, { emitter: 'inline' });
    expect(inline).toEqual(real);
  });

  it('after a network drop, reconnects with backoff, sends Last-Event-ID and gets the missed events once', async () => {
    const run = await expectSameAsReal(async ({ server, advance }) => {
      await advance(300);
      server.sendOrder();
      server.tick(); // still queued in the stream when it fails: the client never reads it
      server.dropNetwork(2000); // the server publishes two more events while the client is offline
      await advance(8000);
      server.sendNotice();
      await advance(500);
    });

    expect(states(run)).toEqual([
      'connecting',
      'connected',
      'reconnecting',
      'connecting', // attempt 1 (after 1000 ms) fails: the network is still down
      'reconnecting',
      'connecting', // attempt 2 (after 2000 ms more) succeeds
      'connected',
      'disconnecting',
      'disconnected'
    ]);
    expect(run.requests.map(([at, , lastEventId]) => [at, lastEventId])).toEqual([
      [0, null],
      [1300, '1'],
      [3450, '1']
    ]);
    expect(named(run, 'sse.error').map(([, , data]) => data)).toEqual([
      { error: { name: 'TypeError', message: 'network error' }, reason: 'network-error' },
      { error: { name: 'TypeError', message: 'Failed to fetch' }, reason: 'network-error' }
    ]);
    // Every event the server sent arrives once: 2 (lost in flight), 3 and 4 (sent while offline) by replay
    expect(run.serverLastId).toBeGreaterThanOrEqual(5);
    expect(receivedIds(run)).toEqual(Array.from({ length: run.serverLastId }, (_, i) => i + 1));
    expect(run.lastEventId).toBe(String(run.serverLastId));
  });

  it("stops on 401 with sse.error, and doesn't retry", async () => {
    const run = await expectSameAsReal(async ({ server, advance }) => {
      await advance(300);
      server.sendOrder();
      server.restartWith(401);
      await advance(60_000);
    });

    expect(run.finalState).toBe('disconnected');
    expect(run.requests).toEqual([
      [0, 'Bearer token-1', null],
      [1300, 'Bearer token-2', '1']
    ]);
    expect(named(run, 'sse.error').map(([, , data]) => data)).toEqual([
      { error: { name: 'Error', message: 'SSE request failed with HTTP 401' }, reason: 'http-error', status: 401 }
    ]);
  });

  it('backs off on 503, waiting at least Retry-After, then resumes', async () => {
    const run = await expectSameAsReal(async ({ server, advance }) => {
      await advance(300);
      server.restartWith(503, { times: 2, retryAfter: 2 });
      await advance(20_000);
    });

    // Delays between the end of a request and the next: 1000 (attempt 1), 2000 (Retry-After beats
    // 2000 ± 20%... equal here), 4000 (attempt 3); each request takes 150 ms
    expect(run.requests.map(([at]) => at)).toEqual([0, 1300, 3450, 7600]);
    expect(named(run, 'sse.error').map(([, , data]) => (data as { status: number }).status)).toEqual([503, 503]);
    expect(run.finalState).toBe('connected');

    const longRetryAfter = await expectSameAsReal(async ({ server, advance }) => {
      await advance(300);
      server.restartWith(503, { times: 1, retryAfter: 7 });
      await advance(20_000);
    });
    expect(longRetryAfter.requests.map(([at]) => at)).toEqual([0, 1300, 8450]);
  });

  it('stops quietly on 204', async () => {
    const run = await expectSameAsReal(async ({ server, advance }) => {
      await advance(300);
      server.restartWith(204);
      await advance(60_000);
    });

    expect(run.finalState).toBe('disconnected');
    expect(run.requests).toHaveLength(2);
    expect(named(run, 'sse.error')).toEqual([]);
  });

  it.each([400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504])(
    'reconnects or stops after HTTP %i like the real handler',
    async status => {
      const run = await expectSameAsReal(async ({ server, advance }) => {
        await advance(300);
        server.restartWith(status);
        await advance(20_000);
      });
      const retries = status === 408 || status === 429 || status >= 500;
      expect(run.finalState).toBe(retries ? 'connected' : 'disconnected');
    }
  );

  it('reconnects when the heartbeats stop and nothing else arrives within heartbeatTimeout', async () => {
    const run = await expectSameAsReal(async ({ server, advance }) => {
      await advance(300);
      await advance(5000); // pings every 1.5 s keep the connection alive
      server.heartbeats = false; // now only the price ticks (every 5 s) arrive
      await advance(12_000);
    });

    const errors = named(run, 'sse.error').map(([at, , data]) => [at, data]);
    expect(errors[0]).toEqual([
      9000,
      { error: { name: 'Error', message: 'No data received for 4000ms' }, reason: 'heartbeat-timeout' }
    ]);
    expect(states(run).filter(state => state === 'connected').length).toBeGreaterThan(2);
  });

  it("uses the server's retry: as the base delay", async () => {
    const run = await expectSameAsReal(async ({ server, advance }) => {
      await advance(300);
      server.sendRetry(400);
      server.restartWith(500, { times: 2 });
      await advance(5000);
    });
    // 400 (attempt 1), 800 (attempt 2), 1600 (attempt 3), each after a 150 ms request
    expect(run.requests.map(([at]) => at)).toEqual([0, 700, 1650, 3400]);
  });

  it('backs off exponentially up to maxReconnectDelay, then gives up with sse.reconnect.failed', async () => {
    for (const random of [0, 0.5, 0.999]) {
      const run = await expectSameAsReal(
        async ({ server, advance }) => {
          await advance(300);
          server.setUnreachable(true);
          await advance(60_000);
        },
        { random, options: { maxReconnectAttempts: 6 } }
      );

      // Between requests: the 150 ms request, then the delay of attempts 2 to 6
      const gaps = run.requests.slice(2).map(([at], i) => at - run.requests[i + 1]![0] - 150);
      const jitter = 0.8 + random * 0.4;
      expect(gaps).toEqual([2000, 4000, 8000, 16_000, 32_000].map(delay => Math.round(Math.min(8000, delay) * jitter)));
      expect(named(run, 'sse.reconnect.failed').map(([, , data]) => data)).toEqual([{ attempts: 6 }]);
      expect(run.finalState).toBe('disconnected');
    }
  });

  it("records the id of a message without data (the server's id: 0 at the start), and resumes from it", async () => {
    const run = await expectSameAsReal(async ({ server, handler, advance }) => {
      await advance(300);
      expect(handler.getLastEventId()).toBe('0');
      server.dropNetwork(500); // before any event: the client still resumes, from id 0
      await advance(3000);
    });
    expect(run.requests.map(([, , lastEventId]) => lastEventId)).toEqual([null, '0']);
    expect(receivedIds(run)).toEqual(Array.from({ length: run.serverLastId }, (_, i) => i + 1));
  });

  it('times out a server that never answers (the heartbeat timer starts before the request)', async () => {
    const run = await expectSameAsReal(
      async ({ server, advance }) => {
        await advance(4500); // the first request gets no answer: timed out at 4000
        server.latency = 150; // the reconnect (about 1000 ms later) gets one
        await advance(2000);
      },
      { server: { latency: 60_000 } }
    );
    expect(named(run, 'sse.error').map(([at, , data]) => [at, (data as { reason: string }).reason])).toEqual([
      [4000, 'heartbeat-timeout']
    ]);
    expect(run.finalState).toBe('connected');
  });

  it('logs a throwing shouldReconnect or onError, and goes on with the default policy', async () => {
    const throwing = () => {
      throw new Error('oops');
    };
    const run = await expectSameAsReal(
      async ({ server, advance }) => {
        await advance(300);
        server.sendMalformed();
        server.restartWith(401);
        await advance(5000);
      },
      { options: { shouldReconnect: throwing, onError: throwing } }
    );
    expect(run.logged).toEqual([
      'SseHandler onError threw:', // the malformed JSON
      'SseHandler shouldReconnect threw; using the default policy:', // the restart: reconnects
      'SseHandler onError threw:', // the 401
      'SseHandler shouldReconnect threw; using the default policy:' // the 401: stops
    ]);
    expect(run.finalState).toBe('disconnected');
  });

  it('cancels a pending reconnect on disconnect(), and resumes from the last id on connect()', async () => {
    const run = await expectSameAsReal(async ({ server, handler, advance }) => {
      await advance(300);
      server.sendOrder();
      server.dropNetwork(500);
      await advance(100);
      await handler.disconnect();
      await advance(10_000); // no reconnect while disconnected
      server.sendOrder();
      handler.connect();
      await advance(1000);
    });

    expect(run.requests.map(([at, , lastEventId]) => [at, lastEventId])).toEqual([
      [0, null],
      [10_400, '1']
    ]);
    // Everything the server sent meanwhile arrives after connect(), once
    expect(run.serverLastId).toBeGreaterThan(3);
    expect(receivedIds(run)).toEqual(Array.from({ length: run.serverLastId }, (_, i) => i + 1));
  });
});

describe('sse-demo.html: inline SseHandler constructor checks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The error a constructor throws, if any */
  const thrown = (create: () => unknown) => {
    try {
      create();
      return undefined;
    } catch (error) {
      return { name: (error as Error).name, message: (error as Error).message };
    }
  };
  const options = { autoConnect: false };

  it('rejects a relative URL outside browsers, like SseHandler', () => {
    const real = thrown(
      () => new SseHandler('/api/events', new EvEm(), { ...options, fetch: async () => new Response() })
    );
    expect(real).toEqual({
      name: 'TypeError',
      message: 'SseHandler needs an absolute URL outside browsers, got "/api/events".'
    });
    expect(
      thrown(() => new page.SseHandler('/api/events', new EvEm(), { ...options, fetch: async () => new Response() }))
    ).toEqual(real);
  });

  it('accepts a relative URL in a page, like SseHandler', () => {
    vi.stubGlobal('location', { href: 'http://localhost/demo/' });
    expect(thrown(() => new SseHandler('/api/events', new EvEm(), options))).toBeUndefined();
    expect(thrown(() => new page.SseHandler('/api/events', new EvEm(), options))).toBeUndefined();
  });

  it('rejects a missing fetch, like SseHandler', () => {
    vi.stubGlobal('fetch', undefined);
    const real = thrown(() => new SseHandler('http://localhost/api/events', new EvEm(), options));
    expect(real).toEqual({ name: 'TypeError', message: 'There is no global fetch: pass the fetch option.' });
    expect(thrown(() => new page.SseHandler('http://localhost/api/events', new EvEm(), options))).toEqual(real);
  });

  it('uses the default reconnection policy of SseHandler', () => {
    const cases: SseCloseInfo[] = [
      { reason: 'ended' },
      { reason: 'no-content' },
      { reason: 'network-error', error: new Error('x') },
      { reason: 'failed' },
      { reason: 'heartbeat-timeout' },
      { reason: 'aborted' },
      { reason: 'bad-content-type', contentType: 'text/html' },
      ...[200, 301, 400, 401, 403, 404, 408, 409, 429, 499, 500, 502, 503, 504, 599].map(status => ({
        reason: 'http-error' as const,
        status
      }))
    ];
    for (const info of cases) {
      expect({ info, reconnects: page.defaultShouldReconnect(info) }).toEqual({
        info,
        reconnects: defaultShouldReconnect(info)
      });
    }
  });
});
