import { describe, expect, it } from 'vitest';
import { SseParser, type SseParsedEvent } from '../../src/sse/SseParser';
import { formatSseComment, formatSseMessage, SSE_HEADERS } from '../../src/sse/server';

function parseAll(stream: string) {
  const events: SseParsedEvent[] = [];
  const retries: number[] = [];
  const parser = new SseParser({ onEvent: event => events.push(event), onRetry: ms => retries.push(ms) });
  parser.feed(stream);
  parser.end();
  return { events, retries };
}

/** Deterministic pseudo-random strings mixing line breaks, spaces, colons, field-like text and non-ASCII */
function* generatedStrings(count: number) {
  const pieces = [
    'a',
    'Z',
    ' ',
    '  ',
    ':',
    '\n',
    '\r',
    '\r\n',
    '\n\n',
    'data: x',
    'event: forged',
    'id: 9',
    '\t',
    'é',
    '😀',
    ' ',
    '{"k":1}'
  ];
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let n = 0; n < count; n++) {
    let text = '';
    const length = Math.floor(next() * 12);
    for (let i = 0; i < length; i++) text += pieces[Math.floor(next() * pieces.length)];
    yield text;
  }
}

describe('formatSseMessage', () => {
  it('writes named JSON events in the documented format', () => {
    expect(formatSseMessage({ event: 'order.updated', id: 42, data: { id: 7, status: 'shipped' } })).toBe(
      'event: order.updated\nid: 42\ndata: {"id":7,"status":"shipped"}\n\n'
    );
  });

  it('JSON-encodes strings by default, so a default client parses them', () => {
    expect(formatSseMessage({ data: 'hello' })).toBe('data: "hello"\n\n');
  });

  it('writes raw text one data line per line', () => {
    expect(formatSseMessage({ data: 'line one\nline two\r\nline three' }, { raw: true })).toBe(
      'data: line one\ndata: line two\ndata: line three\n\n'
    );
  });

  it('writes null for a named event without data, so it is still dispatched', () => {
    expect(formatSseMessage({ event: 'refresh' })).toBe('event: refresh\ndata: null\n\n');
  });

  it('writes only the fields when there is neither an event nor data', () => {
    expect(formatSseMessage({ retry: 5000 })).toBe('retry: 5000\n\n');
    expect(parseAll(formatSseMessage({ retry: 5000 }))).toEqual({ events: [], retries: [5000] });
  });

  it('writes an unnamed { event, data } envelope', () => {
    expect(formatSseMessage({ event: 'order.updated', id: '3', data: { id: 7 } }, { envelope: true })).toBe(
      'id: 3\ndata: {"event":"order.updated","data":{"id":7}}\n\n'
    );
  });

  it('rejects field values that would corrupt the stream', () => {
    expect(() => formatSseMessage({ event: 'a\nb', data: 1 })).toThrow(TypeError);
    expect(() => formatSseMessage({ event: 'a\rb', data: 1 })).toThrow(TypeError);
    expect(() => formatSseMessage({ id: '1\n2', data: 1 })).toThrow(TypeError);
    expect(() => formatSseMessage({ id: 'x\0', data: 1 })).toThrow(TypeError);
    expect(() => formatSseMessage({ retry: -1 })).toThrow(RangeError);
    expect(() => formatSseMessage({ retry: 1.5 })).toThrow(RangeError);
    // 1e21 would be written as 'retry: 1e+21', which clients ignore
    expect(() => formatSseMessage({ retry: 1e21 })).toThrow(RangeError);
    expect(() => formatSseMessage({ data: 1 }, { envelope: true })).toThrow(TypeError);
  });

  it('cannot be tricked into writing a second, forged event', () => {
    const text = 'hi\n\nevent: admin.alert\ndata: {"forged":true}';
    for (const raw of [false, true]) {
      const { events } = parseAll(formatSseMessage({ event: 'chat.message', data: text }, { raw }));
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('chat.message');
    }
  });

  it('round-trips generated data, event names and ids through the parser', () => {
    for (const text of generatedStrings(300)) {
      const name = text.replace(/[\r\n]/g, '') || 'x';
      const id = name.replace(/\0/g, '');

      const json = parseAll(formatSseMessage({ event: name, id, data: { text } })).events;
      expect(json).toEqual([{ type: name, data: JSON.stringify({ text }), lastEventId: id }]);
      expect(JSON.parse(json[0]!.data)).toEqual({ text });

      // Raw text comes back with every line ending normalized to \n, as the format requires
      const raw = parseAll(formatSseMessage({ data: text }, { raw: true })).events;
      expect(raw).toEqual([{ type: 'message', data: text.replace(/\r\n|\r/g, '\n'), lastEventId: '' }]);
    }
  });
});

describe('formatSseComment', () => {
  it('writes comment lines that dispatch nothing', () => {
    expect(formatSseComment('ping')).toBe(': ping\n\n');
    expect(formatSseComment()).toBe(':\n\n');
    expect(formatSseComment('two\nlines')).toBe(': two\n: lines\n\n');
    expect(parseAll(formatSseComment('a\n\ndata: forged')).events).toEqual([]);
  });
});

describe('SSE_HEADERS', () => {
  it('sets the content type and disables caching, transforms and proxy buffering', () => {
    expect(SSE_HEADERS).toEqual({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });
    expect(Object.isFrozen(SSE_HEADERS)).toBe(true);
  });
});
