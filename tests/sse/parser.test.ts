import { describe, expect, it } from 'vitest';
import { SseParser, type SseParsedEvent } from '../../src/sse/SseParser';

/** Parse a stream fed in the given chunks; returns the dispatched events, retry values and comments */
function parse(chunks: string[], initialLastEventId?: string) {
  const events: SseParsedEvent[] = [];
  const retries: number[] = [];
  const comments: string[] = [];
  const parser = new SseParser(
    {
      onEvent: event => events.push(event),
      onRetry: milliseconds => retries.push(milliseconds),
      onComment: text => comments.push(text)
    },
    initialLastEventId
  );
  for (const chunk of chunks) parser.feed(chunk);
  parser.end();
  return { events, retries, comments };
}

const message = (data: string, lastEventId = '', type = 'message'): SseParsedEvent => ({ type, data, lastEventId });

describe('SseParser - examples from the HTML specification', () => {
  it('joins multiple data lines with newlines', () => {
    expect(parse(['data: YHOO\ndata: +2\ndata: 10\n\n']).events).toEqual([message('YHOO\n+2\n10')]);
  });

  it('tracks ids, resets them with an empty id, and strips only one leading space', () => {
    const stream = ': test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n\n';
    expect(parse([stream]).events).toEqual([
      message('first event', '1'),
      message('second event', ''),
      message(' third event', '')
    ]);
  });

  it('dispatches empty data, keeps embedded newlines, and discards an unterminated event', () => {
    expect(parse(['data\n\ndata\ndata\n\ndata:']).events).toEqual([message(''), message('\n')]);
  });

  it('treats "data:test" and "data: test" the same', () => {
    expect(parse(['data:test\n\ndata: test\n\n']).events).toEqual([message('test'), message('test')]);
  });
});

describe('SseParser - fields', () => {
  it('sets the event type, defaulting to "message"', () => {
    expect(parse(['event: order.updated\ndata: {"id":7}\n\ndata: plain\n\n']).events).toEqual([
      message('{"id":7}', '', 'order.updated'),
      message('plain')
    ]);
  });

  it('does not dispatch an event without data, but resets its type', () => {
    expect(parse(['event: ignored\n\ndata: x\n\n']).events).toEqual([message('x')]);
  });

  it('keeps the last event id for later events without an id', () => {
    expect(parse(['id: 7\ndata: a\n\ndata: b\n\n']).events).toEqual([message('a', '7'), message('b', '7')]);
  });

  it('ignores an id containing NULL', () => {
    expect(parse(['id: 5\ndata: a\n\nid: 6\0\ndata: b\n\n']).events).toEqual([message('a', '5'), message('b', '5')]);
  });

  it('reports retry values made only of ASCII digits', () => {
    expect(parse(['retry: 5000\nretry: 1a\nretry: -1\nretry:\nretry: 250\n\n']).retries).toEqual([5000, 250]);
  });

  it('ignores unknown fields and reports comments', () => {
    const result = parse([': ping\nfoo: bar\ndata: x\n\n']);
    expect(result.events).toEqual([message('x')]);
    expect(result.comments).toEqual([' ping']);
  });

  it('treats a line without a colon as a field with an empty value', () => {
    expect(parse(['data\ndata: x\n\n']).events).toEqual([message('\nx')]);
  });

  it('starts from an initial last event id', () => {
    expect(parse(['data: a\n\n'], '41').events).toEqual([message('a', '41')]);
  });
});

describe('SseParser - line endings and chunking', () => {
  const stream = 'event: e\r\nid: 1\rdata: one\ndata: two\r\n\r\n: c\rdata: three\n\n';
  const expected = [message('one\ntwo', '1', 'e'), message('three', '1')];

  it('accepts CRLF, CR and LF line endings', () => {
    expect(parse([stream]).events).toEqual(expected);
  });

  it('gives the same events whichever way the stream is split into chunks', () => {
    expect(parse(stream.split('')).events).toEqual(expected);
    for (let i = 1; i < stream.length; i++) {
      expect(parse([stream.slice(0, i), stream.slice(i)]).events).toEqual(expected);
    }
  });

  it('treats a CR at the end of a chunk and an LF at the start of the next as one line ending', () => {
    expect(parse(['data: a\r', '\n\r', '\ndata: b\n\n']).events).toEqual([message('a'), message('b')]);
  });

  it('remembers a CR at the end of a chunk across empty chunks', () => {
    expect(parse(['data: a\r', '', '\ndata: b\n\n']).events).toEqual([message('a\nb')]);
  });

  it('skips a leading byte order mark, even when it arrives on its own', () => {
    expect(parse(['﻿data: a\n\n']).events).toEqual([message('a')]);
    expect(parse(['﻿', 'data: a\n\n']).events).toEqual([message('a')]);
    expect(parse(['data: ﻿a\n\n']).events).toEqual([message('﻿a')]);
  });
});

describe('SseParser - id-only messages', () => {
  it('reports a changed last event id from a message without data', () => {
    const ids: string[] = [];
    const parser = new SseParser({ onEvent: () => {}, onLastEventId: id => ids.push(id) }, '1');
    parser.feed('id: 1\n\nid: 7\n\nid: 7\n\ndata: x\nid: 8\n\nid\n\n');

    // '1' is unchanged from the initial id; the event carries '8' itself; the empty id clears it
    expect(ids).toEqual(['7', '']);
  });
});
