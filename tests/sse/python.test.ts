import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { SseHandler, type SseHandlerOptions } from '../../src/sse/SseHandler';
import { SseParser, type SseParsedEvent } from '../../src/sse/SseParser';
import {
  formatSseComment,
  formatSseMessage,
  SSE_HEADERS,
  type FormatSseMessageOptions,
  type SseMessage
} from '../../src/sse/server';
import { createFakeFetch, flush } from './helpers/fakeFetch';

/**
 * The Python helper (examples/python/evem_sse.py) and server (examples/python/server.py) against
 * the JS helper and client. Skipped when python3 isn't installed.
 */

const PYTHON = 'python3';
const hasPython = spawnSync(PYTHON, ['--version']).status === 0;
const examplesDirectory = fileURLToPath(new URL('../../examples/python/', import.meta.url));
const formatVectorsScript = fileURLToPath(new URL('./helpers/format_vectors.py', import.meta.url));
const serverScript = fileURLToPath(new URL('../../examples/python/server.py', import.meta.url));
const pythonGuide = fileURLToPath(new URL('../../docs/sse-python.md', import.meta.url));

type MessageVector = { message: SseMessage; options?: FormatSseMessageOptions };
type Vector = MessageVector | { comment: string | null };
type Result = { output?: string; error?: string; message?: string };

const isMessage = (vector: Vector): vector is MessageVector => 'message' in vector;

function formatWithJs(vector: Vector): Result {
  try {
    if (isMessage(vector)) {
      return { output: formatSseMessage(vector.message, vector.options) };
    }
    return { output: vector.comment === null ? formatSseComment() : formatSseComment(vector.comment) };
  } catch (error) {
    return { error: (error as Error).name };
  }
}

/** Run the vectors (JSON text, so tests can also send values JS can't write, like 1.0 or NaN) through Python */
function formatWithPython(input: string): { headers: Record<string, string>; results: Result[] } {
  // -B: don't leave __pycache__ in examples/python
  const run = spawnSync(PYTHON, ['-B', formatVectorsScript, examplesDirectory], {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) {
    throw new Error(`format_vectors.py failed (${run.status}): ${run.stderr}`);
  }
  return JSON.parse(run.stdout);
}

/** Deterministic pseudo-random strings mixing line breaks, other Unicode separators, field-like text and non-ASCII */
function* generatedStrings(count: number) {
  const pieces = [
    'a', 'Z', ' ', ':', '\n', '\r', '\r\n', '\n\n', 'data: x', 'event: forged', 'id: 9', '\t', '"', '\\', '\0',
    // str.splitlines() would split on these; the SSE format and the JS helper don't
    '\v', '\f', '\x1c', '\x1d', '\x1e', '\x85', '\u2028', '\u2029',
    'é', 'ß', '日本', '😀', '👍🏽', '\ud800', '\udfff', '{"k":1}',
  ];
  let seed = 4242;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let n = 0; n < count; n++) {
    let text = '';
    const length = Math.floor(next() * 12);
    for (let i = 0; i < length; i++) text += pieces[Math.floor(next() * pieces.length)];
    yield text;
  }
}

const handwrittenVectors: Vector[] = [
  // Named and unnamed events, ids and retry
  { message: { event: 'order.updated', id: 42, data: { id: 7, status: 'shipped' } } },
  { message: { event: 'order.updated', id: 'abc-1', retry: 5000, data: { id: 7 } } },
  { message: { data: { id: 7 } } },
  { message: { event: 'server.notice', data: 'already prefixed' } },
  { message: { event: 'café.ünïcode', data: 1 } },
  { message: { event: 'with space:and colon', data: 1 } },
  { message: { id: 0, data: 1 } },
  { message: { id: -1, data: 1 } },
  { message: { id: '', data: 1 } },
  { message: { id: ' 5 ', data: 1 } },
  { message: { id: 'ü😀', data: 1 } },
  { message: { id: 7 } },
  { message: { retry: 0 } },
  { message: { retry: 5000 } },
  { message: { id: 3, retry: 100 } },
  { message: {} },
  // Data omitted vs null
  { message: { event: 'refresh' } },
  { message: { event: 'refresh', data: null } },
  { message: { data: null } },
  { message: { event: '' } },
  { message: { event: '', data: null } },
  // JSON values
  { message: { data: 'hello' } },
  { message: { data: '' } },
  { message: { data: 0 } },
  { message: { data: -12 } },
  { message: { data: 1.5 } },
  { message: { data: -0.25 } },
  { message: { data: 0.1 } },
  { message: { data: 3.141592653589793 } },
  { message: { data: 123456.789 } },
  { message: { data: 1e21 } },
  { message: { data: 1.7976931348623157e308 } },
  { message: { data: 5e-324 } },
  { message: { data: true } },
  { message: { data: false } },
  { message: { data: [] } },
  { message: { data: {} } },
  { message: { data: [1, 'two', null, true, { a: [] }, [[]]] } },
  { message: { data: { nested: { deeper: { list: [1, 2, { x: 'y' }] } }, empty: '' } } },
  { message: { data: { 'key with "quotes"': 'and \\ backslashes', '': 'empty key', 2: 'numeric key' } } },
  // Strings: line breaks (escaped in JSON), Unicode, escapes
  { message: { data: 'line one\nline two\r\nline three\rline four' } },
  { message: { data: { text: 'a\n\nevent: forged\ndata: x' } } },
  { message: { data: 'café 日本語 😀 👍🏽 🇧🇷' } },
  { message: { data: '\u0000\u0001\u0008\t\n\u000b\u000c\r\u001f\u007f\u0080\u009f' } },
  { message: { data: '\u2028\u2029\u0085\u00a0\ufeff' } },
  { message: { data: '"quotes" \\backslash\\ /slash/ </script>' } },
  { message: { data: 'lone \ud800 and \udfff surrogates, broken pair \udc00\ud800' } },
  // Raw text: one data line per line, split only on \r\n, \r and \n
  { message: { data: 'line one\nline two\r\nline three\rline four' }, options: { raw: true } },
  { message: { data: '' }, options: { raw: true } },
  { message: { data: '\n' }, options: { raw: true } },
  { message: { data: '\r\n\r\n' }, options: { raw: true } },
  { message: { data: '\n\r' }, options: { raw: true } },
  { message: { data: 'trailing\n' }, options: { raw: true } },
  { message: { data: 'hi\n\nevent: admin.alert\ndata: {"forged":true}' }, options: { raw: true } },
  { message: { data: 'v\vf\fx\x1cy\x1dz\x1en\x85l\u2028p\u2029end' }, options: { raw: true } },
  { message: { data: 'café 😀\nsecond line' }, options: { raw: true } },
  { message: { event: 'chat.message', id: 9, data: 'plain text' }, options: { raw: true } },
  { message: { data: { notAString: true } }, options: { raw: true } },
  { message: { data: 42 }, options: { raw: true } },
  { message: { event: 'raw.without.data' }, options: { raw: true } },
  // Envelope
  { message: { event: 'order.updated', id: '3', data: { id: 7 } }, options: { envelope: true } },
  { message: { event: 'order.updated', data: null }, options: { envelope: true } },
  { message: { event: 'ping' }, options: { envelope: true } },
  { message: { event: 'ping', retry: 10 }, options: { envelope: true } },
  { message: { event: 'chat.message', data: 'text\nwith lines' }, options: { envelope: true, raw: true } },
  { message: { event: 'list', data: [1, 2, 3] }, options: { envelope: true } },
  // Comments
  { comment: null },
  { comment: '' },
  { comment: 'ping' },
  { comment: 'two\nlines' },
  { comment: 'a\r\nb\rc\nd' },
  { comment: '\n' },
  { comment: 'a\n\ndata: forged' },
  { comment: ' leading space' },
  { comment: 'café 😀' },
  { comment: 'v\vf\fu\u2028end' },
];

const generatedVectors: Vector[] = [...generatedStrings(250)].flatMap((text): Vector[] => {
  const name = text.replace(/[\r\n]/g, '') || 'x';
  const id = name.replace(/\0/g, '');
  return [
    { message: { event: name, id, data: { text } } },
    { message: { data: text } },
    { message: { data: text }, options: { raw: true } },
    { message: { event: name, data: text }, options: { envelope: true } },
    { comment: text },
  ];
});

const validVectors = [...handwrittenVectors, ...generatedVectors];

/** Input both helpers must reject (JS throws TypeError / RangeError, Python raises ValueError) */
const invalidVectors: Vector[] = [
  { message: { event: 'a\nb', data: 1 } },
  { message: { event: 'a\rb', data: 1 } },
  { message: { event: 'a\r\nb' } },
  { message: { event: 'trailing\n', data: 1 }, options: { envelope: true } },
  { message: { id: '1\n2', data: 1 } },
  { message: { id: '1\r2', data: 1 } },
  { message: { id: 'x\0', data: 1 } },
  { message: { id: '\0' } },
  { message: { retry: -1 } },
  { message: { retry: 1.5 } },
  { message: { retry: 2 ** 53 } }, // above Number.MAX_SAFE_INTEGER
  { message: { retry: '5000' as unknown as number } },
  { message: { retry: true as unknown as number } },
  { message: { data: 1 }, options: { envelope: true } },
  { message: { event: '', data: 1 }, options: { envelope: true } },
  { message: {}, options: { envelope: true } },
];

/** What the parser should produce for a message, given what was passed to the formatter */
function expectedRoundTrip({ message, options = {} }: MessageVector) {
  const { event, data, id, retry } = message;
  const lastEventId = id === undefined ? '' : String(id);
  const retries = retry === undefined ? [] : [retry];
  if (!event && data === undefined) {
    return { events: [], retries };
  }
  const type = event && !options.envelope ? event : 'message';
  const payload = options.envelope ? { event, data: data ?? null } : data ?? null;
  return { events: [{ type, lastEventId, payload }], retries, rawText: options.raw && typeof payload === 'string' };
}

function parse(stream: string) {
  const events: SseParsedEvent[] = [];
  const retries: number[] = [];
  const parser = new SseParser({ onEvent: event => events.push(event), onRetry: ms => retries.push(ms) });
  parser.feed(stream);
  parser.end();
  return { events, retries };
}

const waitFor = async (condition: () => boolean, timeout = 10000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for condition');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

describe.skipIf(!hasPython)('Python SSE helper (examples/python/evem_sse.py)', () => {
  it('writes the same text as formatSseMessage / formatSseComment, and the same SSE_HEADERS', () => {
    const js = validVectors.map(formatWithJs);
    expect(js.filter(result => result.error)).toEqual([]);

    const python = formatWithPython(JSON.stringify(validVectors));
    expect(python.results).toHaveLength(validVectors.length);
    const mismatches = validVectors.flatMap((vector, i) =>
      python.results[i]?.output === js[i]?.output ? [] : [{ vector, js: js[i], python: python.results[i] }]
    );
    expect(mismatches).toEqual([]);
    expect(python.headers).toEqual({ ...SSE_HEADERS });
    expect(Object.keys(python.headers)).toEqual(Object.keys(SSE_HEADERS));
  });

  it('rejects the same invalid input, with ValueError where JS throws TypeError or RangeError', () => {
    const js = invalidVectors.map(formatWithJs);
    const python = formatWithPython(JSON.stringify(invalidVectors)).results;

    expect(js.map(result => result.error)).toEqual(invalidVectors.map(() => expect.stringMatching(/^(TypeError|RangeError)$/)));
    expect(python.map(result => result.error)).toEqual(invalidVectors.map(() => 'ValueError'));
  });

  it('differs from JS only where documented: float formatting, NaN / infinity and argument types', () => {
    // Raw JSON text, so Python receives values that JSON.stringify can't produce
    const input = `[
      {"message": {"data": 1.0}},
      {"message": {"data": [2.0, 1e-7, 0.00001]}},
      {"message": {"data": NaN}},
      {"message": {"data": {"x": Infinity}}},
      {"message": {"retry": 5000.0}},
      {"message": {"id": 1.5, "data": 1}},
      {"message": {"id": true, "data": 1}},
      {"message": {"event": 5, "data": 1}}
    ]`;
    const python = formatWithPython(input).results.map(result => result.output ?? result.error);

    expect(python).toEqual([
      'data: 1.0\n\n', // JS: data: 1
      'data: [2.0,1e-07,1e-05]\n\n', // JS: data: [2,1e-7,0.00001]
      'ValueError', // JS: data: null
      'ValueError', // JS: data: {"x":null}
      'ValueError', // JS accepts 5000.0, which is the number 5000
      'TypeError', // JS: id: 1.5
      'TypeError', // JS: id: true (not allowed by the TS types)
      'TypeError', // JS: event: 5 (not allowed by the TS types)
    ]);
    // Floats are written differently but read back as the same numbers
    expect(JSON.parse(parse(python[0]!).events[0]!.data)).toBe(1);
    expect(JSON.parse(parse(python[1]!).events[0]!.data)).toEqual([2, 1e-7, 0.00001]);
  });

  it('has working examples in its docstrings and in docs/sse-python.md', () => {
    for (const file of [`${examplesDirectory}evem_sse.py`, pythonGuide]) {
      const run = spawnSync(PYTHON, ['-B', '-m', 'doctest', file], {
        encoding: 'utf8',
        env: { ...process.env, PYTHONPATH: examplesDirectory },
      });
      expect(run.stdout + run.stderr).toBe('');
      expect(run.status).toBe(0);
    }
  });

  it('writes messages that SseParser reads back as the original data, id and retry', () => {
    const messages = validVectors.filter(isMessage);
    const python = formatWithPython(JSON.stringify(messages)).results;

    messages.forEach((vector, i) => {
      const expected = expectedRoundTrip(vector);
      const { events, retries } = parse(python[i]!.output!);
      expect(retries).toEqual(expected.retries);
      expect(events.map(({ type, lastEventId }) => ({ type, lastEventId })))
        .toEqual(expected.events.map(({ type, lastEventId }) => ({ type, lastEventId })));
      if (events[0]) {
        const payload = expected.events[0]!.payload;
        // Raw text comes back with every line ending normalized to \n, as the format requires
        expect(expected.rawText ? events[0].data : JSON.parse(events[0].data))
          .toEqual(expected.rawText ? (payload as string).replace(/\r\n|\r/g, '\n') : payload);
      }
    });
  });

  it('writes comments that dispatch nothing', () => {
    const comments = validVectors.filter((vector): vector is { comment: string | null } => !isMessage(vector));
    const python = formatWithPython(JSON.stringify(comments)).results;
    expect(python.map(result => parse(result.output!))).toEqual(comments.map(() => ({ events: [], retries: [] })));
  });

  it('writes streams that SseHandler routes to server.<event>, envelopes and raw text included', async () => {
    const stream: Vector[] = [
      { message: { retry: 2000 } },
      { comment: 'ping' },
      { message: { event: 'order.updated', id: 1, data: { id: 7, status: 'shipped' } } },
      { message: { event: 'order.updated', id: 2, data: { id: 8 } }, options: { envelope: true } },
      { message: { event: 'server.notice', id: 3, data: 'not prefixed twice' } },
      { message: { event: 'refresh', id: 4 } },
      { message: { id: 5, data: { plain: 'message' } } },
      { message: { event: 'note', id: 6, data: 'line one\nline two' }, options: { raw: true } },
    ];
    const text = formatWithPython(JSON.stringify(stream)).results.map(result => result.output).join('');
    const names = ['server.order.updated', 'server.notice', 'server.refresh', 'server.note', 'sse.message', 'sse.parse.error'];

    const receive = async (options: SseHandlerOptions) => {
      const { fetch, calls } = createFakeFetch();
      const evem = new EvEm();
      const received: Array<[string, unknown]> = [];
      for (const name of names) {
        evem.subscribe(name, (data: unknown) => { received.push([name, data]); });
      }
      const handler = new SseHandler('https://example.test/events', evem, { ...options, fetch });
      await flush();
      calls[0]!.stream.push(text);
      await flush();
      const lastEventId = handler.getLastEventId();
      await handler.disconnect();
      return { received, lastEventId };
    };

    const json = await receive({});
    expect(json.received).toEqual([
      ['server.order.updated', { id: 7, status: 'shipped' }],
      ['server.order.updated', { id: 8 }],
      ['server.notice', 'not prefixed twice'],
      ['server.refresh', null],
      ['sse.message', { plain: 'message' }],
      // Raw text isn't JSON: it needs parseData: 'text'
      ['sse.parse.error', expect.objectContaining({ rawData: 'line one\nline two', eventType: 'note' })],
    ]);
    expect(json.lastEventId).toBe('6');

    const plainText = await receive({ parseData: 'text' });
    expect(plainText.received).toContainEqual(['server.note', 'line one\nline two']);
  });
});

interface PythonServer {
  child: ChildProcessWithoutNullStreams;
  url: string;
  /** Lines the server logged on stderr */
  log: string[];
}

/** Start examples/python/server.py on a free port */
async function startPythonServer(args: string[]): Promise<PythonServer> {
  const child = spawn(PYTHON, ['-B', serverScript, '--port', '0', ...args]);
  const log: string[] = [];
  let partialLine = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    const lines = (partialLine + chunk).split('\n');
    partialLine = lines.pop()!;
    log.push(...lines);
  });

  const port = await new Promise<number>((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => reject(new Error(`server.py didn't print its port:\n${log.join('\n')}`)), 10000);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.includes('\n')) {
        clearTimeout(timer);
        resolve(Number(stdout.slice(0, stdout.indexOf('\n'))));
      }
    });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`server.py exited with ${code}:\n${log.join('\n')}`));
    });
  });
  return { child, url: `http://127.0.0.1:${port}/events`, log };
}

/** Read a stream with fetch up to the first heartbeat comment */
async function readUntilPing(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const response = await fetch(url, { headers, signal: controller.signal });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes(': ping\n\n')) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  controller.abort();
  return { response, text: text.slice(0, text.indexOf(': ping\n\n') + ': ping\n\n'.length) };
}

describe.skipIf(!hasPython)('SseHandler against the Python server (examples/python/server.py)', () => {
  let server: PythonServer | undefined;
  let handler: SseHandler | undefined;

  afterEach(async () => {
    await handler?.disconnect();
    handler = undefined;
    const child = server?.child;
    server = undefined;
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        child.once('exit', resolve);
        child.kill();
      });
    }
  });

  it('delivers every tick once and in order, resuming with Last-Event-ID after the server drops the stream', async () => {
    server = await startPythonServer(['--drop-after', '3', '--interval', '0.01', '--retry', '50']);
    const evem = new EvEm();
    const ticks: number[] = [];
    const errors: unknown[] = [];
    evem.subscribe('server.tick', ({ n }: { n: number }) => { ticks.push(n); });
    evem.subscribe('sse.error', (error: unknown) => { errors.push(error); });

    handler = new SseHandler(server.url, evem);
    await waitFor(() => ticks.length >= 10);
    await handler.disconnect();

    expect(ticks).toEqual(Array.from({ length: ticks.length }, (_, i) => i + 1));
    expect(handler.getLastEventId()).toBe(String(ticks.length));
    expect(errors).toEqual([]); // the server ending the stream isn't an error

    // The server notices the disconnect on its next write
    const { log } = server;
    await waitFor(() => log.includes('connection 2: client disconnected'));
    expect(log.filter(line => line.startsWith('connection '))).toEqual([
      'connection 1: resuming after 0',
      'connection 1: ended by the server after 3',
      'connection 2: resuming after 3',
      'connection 2: client disconnected',
    ]);
  }, 20000);

  it('sends SSE_HEADERS, retry and heartbeats, and resumes from the lastEventId query parameter (the header wins)', async () => {
    server = await startPythonServer(['--interval', '30', '--heartbeat', '0.02', '--retry', '50']);

    const fromQuery = await readUntilPing(`${server.url}?lastEventId=41`);
    expect(fromQuery.response.status).toBe(200);
    for (const [name, value] of Object.entries(SSE_HEADERS)) {
      expect(fromQuery.response.headers.get(name)).toBe(value);
    }
    expect(fromQuery.text).toBe('retry: 50\n\nevent: tick\nid: 42\ndata: {"n":42}\n\n: ping\n\n');

    const fromBoth = await readUntilPing(`${server.url}?lastEventId=41`, { 'Last-Event-ID': '7' });
    expect(fromBoth.text).toBe('retry: 50\n\nevent: tick\nid: 8\ndata: {"n":8}\n\n: ping\n\n');
  }, 20000);

  it('keeps the connection alive with heartbeats when there are no events (heartbeatTimeout)', async () => {
    server = await startPythonServer(['--interval', '30', '--heartbeat', '0.05']);
    const evem = new EvEm();
    const errors: unknown[] = [];
    evem.subscribe('sse.error', (error: unknown) => { errors.push(error); });

    handler = new SseHandler(server.url, evem, { heartbeatTimeout: 300 });
    await waitFor(() => handler!.isConnected());
    await new Promise(resolve => setTimeout(resolve, 1000)); // several heartbeat timeouts without a tick

    expect(errors).toEqual([]);
    expect(handler.isConnected()).toBe(true);
    expect(server.log.filter(line => /^connection \d+: resuming/.test(line))).toEqual(['connection 1: resuming after 0']);
  }, 20000);
});
