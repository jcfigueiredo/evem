import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../demo/src/engine/trace';
import { announcement, describeEntry, isAtEnd, liveAnnouncement, preview, timelineRows } from '../../demo/src/timeline';

describe('preview', () => {
  it('shows data as JSON, shortened with an ellipsis', () => {
    expect(preview({ id: 42 })).toBe('{"id":42}');
    expect(preview(undefined)).toBe('undefined');
    expect(preview('x'.repeat(100), 10)).toBe(`"${'x'.repeat(8)}…`);
  });

  it('shows an error by its name and message, which JSON would drop', () => {
    const error = new SyntaxError('Unexpected token');
    expect(preview({ error, rawData: 'oops' })).toBe('{"error":"SyntaxError: Unexpected token","rawData":"oops"}');
  });
});

describe('describeEntry', () => {
  it.each([
    [
      { kind: 'subscribe', subscription: 'audit', pattern: 'order.*', options: ['priority high'], at: 0 },
      'audit subscribed to order.*',
      'neutral'
    ],
    [{ kind: 'publish', id: 1, event: 'order.created', data: {}, at: 0 }, 'publish order.created', 'primary'],
    [{ kind: 'result', id: 1, result: false, at: 0 }, 'resolved false', 'warning'],
    [
      { kind: 'middleware', name: 'toAudit', outcome: 'reroute', to: 'audit.x', at: 0 },
      'middleware toAudit rerouted it to audit.x',
      'info'
    ],
    [{ kind: 'filter', subscription: 'vip', name: 'isVip', passed: false, at: 0 }, 'vip: isVip rejected it', 'warning'],
    [{ kind: 'call', subscription: 'save', data: 1, later: true, at: 0 }, 'save ran (later)', 'success'],
    [
      { kind: 'skip', subscription: 'save', reason: 'debounced', at: 0 },
      'save skipped: debounced (runs later if nothing else arrives)',
      'neutral'
    ],
    [
      { kind: 'unsubscribe', subscription: 'save', once: true, at: 0 },
      'save unsubscribed after its one run (once)',
      'neutral'
    ],
    [
      { kind: 'call', subscription: 'latest', data: 1, replayed: true, at: 0 },
      'latest ran (replayed from history)',
      'success'
    ],
    [
      {
        kind: 'match',
        subscription: 'users',
        pattern: 'user.*',
        event: 'user.login',
        matched: true,
        reason: '',
        at: 0
      },
      'users: "user.*" matches "user.login"',
      'info'
    ],
    [
      { kind: 'match', subscription: 'users', pattern: 'user.*', event: 'user', matched: false, reason: '', at: 0 },
      'users: "user.*" doesn\'t match "user"',
      'neutral'
    ],
    [
      { kind: 'skip', subscription: 'after', reason: 'stopped', at: 0 },
      'after skipped: the publish stopped on an error first',
      'neutral'
    ],
    [{ kind: 'error', subscription: 'save', message: 'boom', at: 0 }, 'save threw: boom', 'error'],
    [{ kind: 'log', level: 'warn', text: 'careful', at: 0 }, 'careful', 'warning']
  ] as Array<[TraceEntry, string, string]>)('%o reads "%s"', (entry, text, tone) => {
    expect(describeEntry(entry)).toMatchObject({ text, tone });
  });
});

describe('later calls and actions', () => {
  it('shows a call that came after its publish ended at the top level, with the time of the publish it came from', () => {
    const entries: TraceEntry[] = [
      { kind: 'action', label: 'Type', at: 0 },
      { kind: 'publish', id: 1, event: 'search', data: { q: 'ev' }, at: 5 },
      { kind: 'skip', subscription: 'search', reason: 'debounced', publish: 1, at: 6 },
      { kind: 'result', id: 1, result: true, at: 6 },
      { kind: 'call', subscription: 'search', data: { q: 'ev' }, later: true, publish: 1, at: 306 },
      { kind: 'call', subscription: 'search', data: { q: 'ev' }, later: true, at: 400 }
    ];
    expect(timelineRows(entries).map(row => `${row.depth} ${row.text}`)).toEqual([
      '0 ▶ Type',
      '0 publish search',
      '1 search skipped: debounced (runs later if nothing else arrives)',
      '0 resolved true',
      '0 search ran later, with the data published at 5 ms',
      '0 search ran later'
    ]);
  });
});

describe('describeEntry details', () => {
  it('shows no data for a publish without any', () => {
    expect(describeEntry({ kind: 'publish', id: 1, event: 'tick', data: undefined, at: 0 })).toEqual({
      text: 'publish tick',
      tone: 'primary'
    });
  });

  it('shows the data a middleware passed on, and the reason a pattern matched or not', () => {
    expect(describeEntry({ kind: 'middleware', name: 'stamp', outcome: 'continue', data: { a: 1 }, at: 0 })).toEqual({
      text: 'middleware stamp passed it on',
      detail: '{"a":1}',
      tone: 'info'
    });
    expect(
      describeEntry({ kind: 'match', subscription: 's', pattern: '*', event: 'e', matched: true, reason: 'why', at: 0 })
    ).toMatchObject({ detail: 'why' });
  });
});

describe('timelineRows', () => {
  it('indents what happened during a publish under it, nested publishes one level more', () => {
    const entries: TraceEntry[] = [
      { kind: 'subscribe', subscription: 'relay', pattern: 'outer', options: [], at: 0 },
      { kind: 'publish', id: 1, event: 'outer', data: 0, at: 1 },
      { kind: 'call', subscription: 'relay', data: 0, publish: 1, at: 1 },
      { kind: 'publish', id: 2, event: 'inner', data: 1, publish: 1, at: 2 },
      { kind: 'call', subscription: 'sink', data: 1, publish: 2, at: 2 },
      { kind: 'result', id: 2, result: true, publish: 1, at: 3 },
      { kind: 'result', id: 1, result: true, at: 3 }
    ];
    expect(timelineRows(entries).map(row => `${row.depth} ${row.text}`)).toEqual([
      '0 relay subscribed to outer',
      '0 publish outer',
      '1 relay ran',
      '1 publish inner',
      '2 sink ran',
      '1 resolved true',
      '0 resolved true'
    ]);
  });
});

describe('isAtEnd', () => {
  it('says whether a scrolled list shows its end, so it keeps following only a reader who was there', () => {
    expect(isAtEnd({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    expect(isAtEnd({ scrollTop: 590, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    expect(isAtEnd({ scrollTop: 0, scrollHeight: 1000, clientHeight: 400 })).toBe(false);
    // A list too short to scroll
    expect(isAtEnd({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })).toBe(true);
  });
});

describe('liveAnnouncement', () => {
  const rows = timelineRows([{ kind: 'log', level: 'log', text: 'tick 7', at: 5, publish: undefined }]);

  it("reads out what the reader's own interaction caused, and stays quiet for a stream that runs by itself", () => {
    expect(liveAnnouncement(rows, 1200)).toBe('tick 7.');
    expect(liveAnnouncement(rows, 60_000)).toBeUndefined();
    expect(liveAnnouncement([], 0)).toBeUndefined();
  });
});

describe('announcement', () => {
  it('reads rows as one short sentence each, for a screen reader, and nothing for no rows', () => {
    const rows = timelineRows([
      { kind: 'publish', id: 1, event: 'order.created', data: { id: 42 }, at: 0 },
      { kind: 'call', subscription: 'audit', data: { id: 42 }, publish: 1, at: 1 },
      { kind: 'result', id: 1, result: true, at: 2 }
    ]);
    expect(announcement(rows)).toBe('publish order.created. audit ran. resolved true.');
    expect(announcement([])).toBe('');
  });
});
