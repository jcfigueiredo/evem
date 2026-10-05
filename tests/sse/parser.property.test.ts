import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SseParser, type SseParsedEvent } from '../../src/sse/SseParser';
import { formatSseComment, formatSseMessage } from '../../src/sse/server';

// 100 generated cases per property by default; FC_NUM_RUNS=5000 pnpm test:nowatch <this file> searches longer
fc.configureGlobal({ numRuns: Number(process.env['FC_NUM_RUNS'] ?? 100) });

/** Everything the parser reports, in order */
type Output = Array<{ event: SseParsedEvent } | { retry: number } | { comment: string } | { lastEventId: string }>;

function parse(chunks: readonly string[], initialLastEventId?: string): Output {
  const output: Output = [];
  const parser = new SseParser(
    {
      onEvent: event => output.push({ event }),
      onRetry: retry => output.push({ retry }),
      onComment: comment => output.push({ comment }),
      onLastEventId: lastEventId => output.push({ lastEventId })
    },
    initialLastEventId
  );
  for (const chunk of chunks) parser.feed(chunk);
  parser.end();
  return output;
}

const withoutComments = (output: Output) => output.filter(item => !('comment' in item));

/**
 * The WHATWG "event stream interpretation", read independently of SseParser, over lines that are already split:
 * what the parser should report for them (plus its one addition, onLastEventId for a message without data)
 */
function interpret(lines: readonly string[]): Output {
  const output: Output = [];
  let data = '';
  let type = '';
  let lastEventIdBuffer = '';
  let lastEventId = '';
  for (const line of lines) {
    if (line === '') {
      const changed = lastEventIdBuffer !== lastEventId;
      lastEventId = lastEventIdBuffer;
      if (data === '') {
        if (changed) output.push({ lastEventId });
      } else {
        output.push({ event: { type: type || 'message', data: data.slice(0, -1), lastEventId } });
      }
      data = '';
      type = '';
      continue;
    }
    if (line.startsWith(':')) {
      output.push({ comment: line.slice(1) });
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') type = value;
    else if (field === 'data') data += `${value}\n`;
    else if (field === 'id' && !value.includes('\0')) lastEventIdBuffer = value;
    else if (field === 'retry' && /^[0-9]+$/.test(value)) output.push({ retry: Number(value) });
  }
  return output; // an event the stream didn't finish is discarded
}

// Field values: anything but line breaks, including spaces, colons, NUL, a BOM and a surrogate pair
const value = fc.string({ unit: fc.constantFrom('a', 'Z', '7', ' ', ':', '\0', 'é', '﻿', '😀', '\t'), maxLength: 6 });
// Weighted toward data lines, so events are often half-read when a line ends (where chunking bugs show)
const line = fc.oneof(
  { arbitrary: fc.constant(''), weight: 2 },
  { arbitrary: value.map(text => `:${text}`), weight: 1 },
  { arbitrary: value.map(text => `data: ${text}`), weight: 4 },
  {
    arbitrary: fc
      .tuple(fc.constantFrom('data', 'event', 'id', 'retry', 'other', 'Data'), fc.constantFrom(':', ': ', ''), value)
      .map(([field, separator, text]) => (separator === '' ? field : `${field}${separator}${text}`)),
    weight: 3
  },
  { arbitrary: fc.stringMatching(/^[0-9]{1,5}$/).map(digits => `retry: ${digits}`), weight: 1 }
);
const lines = fc.array(line, { maxLength: 30 });
const LINE_ENDINGS = ['\n', '\r\n', '\r'] as const;

/**
 * The lines as a stream, each ended with the matching ending. A CR followed by a line that starts with LF would
 * read as one CRLF: such a CR becomes CRLF, so the stream still has these lines.
 */
function serialize(stream: readonly string[], endings: readonly string[] = []): string {
  return stream
    .map((text, index) => {
      let ending = endings[index] ?? '\n';
      const next = stream[index + 1];
      if (ending === '\r' && next === '' && (endings[index + 1] ?? '\n').startsWith('\n')) ending = '\r\n';
      return text + ending;
    })
    .join('');
}

/** A string cut into chunks at the given positions */
const cut = (text: string, positions: readonly number[]) => {
  const points = [...new Set(positions.map(position => position % (text.length + 1)))].sort((a, b) => a - b);
  return [0, ...points].map((start, index) => text.slice(start, points[index] ?? text.length));
};

describe('SseParser - properties', () => {
  it('reads a stream as the WHATWG algorithm does', () => {
    fc.assert(
      fc.property(lines, stream => {
        expect(parse([serialize(stream)])).toEqual(interpret(stream));
      })
    );
  });

  it('reads LF, CRLF and CR line endings, mixed line by line, alike', () => {
    fc.assert(
      fc.property(lines, fc.array(fc.constantFrom(...LINE_ENDINGS), { maxLength: 30 }), (stream, endings) => {
        expect(parse([serialize(stream, endings)])).toEqual(parse([serialize(stream)]));
      })
    );
  });

  it('gives the same output however the stream is cut into chunks', () => {
    fc.assert(
      fc.property(
        lines,
        fc.array(fc.constantFrom(...LINE_ENDINGS), { maxLength: 30 }),
        fc.array(fc.nat(), { maxLength: 12 }),
        (stream, endings, positions) => {
          const text = serialize(stream, endings);
          expect(parse(cut(text, positions))).toEqual(parse([text]));
        }
      )
    );
  });

  it('reads a line ending split across chunks, CR in one and LF in the next, as one line ending', () => {
    fc.assert(
      fc.property(lines, fc.array(fc.constantFrom(...LINE_ENDINGS), { maxLength: 30 }), (stream, endings) => {
        const text = serialize(stream, endings);
        // Every chunk ends right after a CR
        expect(parse(text.split(/(?<=\r)/))).toEqual(parse([text]));
      })
    );
  });

  it('ignores a BOM at the start, comments and unknown fields', () => {
    fc.assert(
      fc.property(
        lines,
        fc.array(
          fc.tuple(
            fc.nat(),
            fc.oneof(
              value.map(text => `:${text}`),
              value.map(text => `unknown: ${text}`)
            )
          )
        ),
        (stream, insertions) => {
          const noisy = [...stream];
          for (const [position, extra] of insertions) noisy.splice(position % (noisy.length + 1), 0, extra);
          expect(withoutComments(parse([`﻿${serialize(noisy)}`]))).toEqual(withoutComments(parse([serialize(stream)])));
        }
      )
    );
  });

  it('reads back what formatSseMessage writes', () => {
    const singleLine = fc.string({ unit: fc.constantFrom('a', 'Z', '7', ' ', ':', 'é', '😀'), maxLength: 8 });
    fc.assert(
      fc.property(
        fc.record(
          {
            event: singleLine,
            data: fc.oneof(
              fc.jsonValue(),
              fc.string({ unit: fc.constantFrom('a', ' ', '\n', '\r', '\r\n', 'é'), maxLength: 10 })
            ),
            id: fc.oneof(singleLine, fc.nat()),
            retry: fc.nat()
          },
          { requiredKeys: [] }
        ),
        fc.boolean(),
        fc.boolean(),
        (message, raw, envelope) => {
          fc.pre(!envelope || Boolean(message.event));
          const output = parse([formatSseMessage(message, { raw, envelope })]);

          const events = output.flatMap(item => ('event' in item ? [item.event] : []));
          const id = message.id === undefined ? '' : String(message.id);
          if (message.event || message.data !== undefined) {
            const payload = envelope ? { event: message.event, data: message.data ?? null } : message.data;
            const text = raw && typeof payload === 'string' ? payload : (JSON.stringify(payload) ?? 'null');
            expect(events).toEqual([
              {
                type: envelope ? 'message' : message.event || 'message',
                data: text.split(/\r\n|\r|\n/).join('\n'),
                lastEventId: id
              }
            ]);
          } else {
            expect(events).toEqual([]);
            expect(output.filter(item => 'lastEventId' in item)).toEqual(id === '' ? [] : [{ lastEventId: id }]);
          }
          expect(output.filter(item => 'retry' in item)).toEqual(
            message.retry === undefined ? [] : [{ retry: message.retry }]
          );
        }
      )
    );
  });

  it('reads back what formatSseComment writes as comments, and nothing else', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom('a', ' ', ':', '\n', '\r', 'é'), maxLength: 12 }), text => {
        expect(parse([formatSseComment(text)])).toEqual(
          text.split(/\r\n|\r|\n/).map(part => ({ comment: part ? ` ${part}` : '' }))
        );
      })
    );
  });
});
