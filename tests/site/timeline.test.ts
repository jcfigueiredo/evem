import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../demo/src/engine/trace';
import {
  announcement,
  describeEntry,
  isAtEnd,
  keepsFollowing,
  liveAnnouncement,
  preview,
  rowsFrom,
  setupSummary,
  sinceLatestAction,
  timelineRows,
  unseenRows
} from '../../demo/src/timeline';

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
      '0 search ran later, with the data published at +5 ms',
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

describe('timelineRows times and kinds', () => {
  it('gives each row its kind, and the time since the latest action (none before the first)', () => {
    const entries: TraceEntry[] = [
      { kind: 'subscribe', subscription: 'tick', pattern: 'tick', options: [], at: 2 },
      { kind: 'action', label: 'Go', at: 100 },
      { kind: 'publish', id: 1, event: 'tick', data: 1, at: 104 },
      { kind: 'log', level: 'log', text: 'tick 1', publish: 1, at: 105 },
      { kind: 'action', label: 'Again', at: 300 },
      { kind: 'log', level: 'log', text: 'later', at: 340 }
    ];
    expect(timelineRows(entries).map(row => [row.kind, row.since])).toEqual([
      ['subscribe', undefined],
      ['action', 0],
      ['publish', 4],
      ['log', 5],
      ['action', 0],
      ['log', 40]
    ]);
  });
});

describe('rowsFrom', () => {
  it('times the rows it keeps from their action, even when the action is before where it starts (after Clear)', () => {
    const entries: TraceEntry[] = [
      { kind: 'subscribe', subscription: 'tick', pattern: 'tick', options: [], at: 2 },
      { kind: 'action', label: 'Go', at: 100 },
      { kind: 'publish', id: 1, event: 'tick', data: 1, at: 104 },
      { kind: 'log', level: 'log', text: 'tick 1', publish: 1, at: 105 }
    ];
    expect(rowsFrom(entries, 2).map(row => [row.kind, row.since, row.depth])).toEqual([
      ['publish', 4, 0],
      ['log', 5, 1]
    ]);
  });
});

describe('unseenRows', () => {
  it("counts the rows after both where the timeline starts and what the reader saw, so a setup that's still running isn't news once it ends", () => {
    expect(unseenRows(10, 3, 0)).toBe(7);
    expect(unseenRows(10, 3, 8)).toBe(2);
    // A setup still running (its end unknown, so the timeline starts at 0), then ended at 6: its rows drop out
    expect(unseenRows(4, 0, 0)).toBe(4);
    expect(unseenRows(7, 6, 0)).toBe(1);
    expect(unseenRows(5, 6, 0)).toBe(0);
  });
});

describe('setupSummary', () => {
  it('counts what the setup made, in one line', () => {
    const at = { at: 0 };
    expect(
      setupSummary([
        { kind: 'subscribe', subscription: 'a', pattern: 'a', options: [], ...at },
        { kind: 'subscribe', subscription: 'b', pattern: 'b', options: [], ...at },
        { kind: 'publish', id: 1, event: 'a', data: 1, ...at },
        { kind: 'log', level: 'log', text: 'ready', ...at }
      ])
    ).toBe('Setup · 2 subscriptions, 1 publish, 1 log');
    expect(
      setupSummary([{ kind: 'match', subscription: 's', pattern: '*', event: 'e', matched: true, reason: 'r', ...at }])
    ).toBe('Setup · 1 steps');
  });
});

describe('sinceLatestAction', () => {
  it('keeps the latest action and what came after it, and nothing before the first action', () => {
    const at = { at: 0, publish: undefined };
    const setup: TraceEntry = { kind: 'log', level: 'log', text: 'setup', ...at };
    const first: TraceEntry = { kind: 'action', label: 'First', ...at };
    const second: TraceEntry = { kind: 'action', label: 'Second', ...at };
    const later: TraceEntry = { kind: 'log', level: 'log', text: 'later', ...at };
    expect(sinceLatestAction([setup])).toEqual([]);
    expect(sinceLatestAction([setup, first, later, second, later])).toEqual([second, later]);
  });
});

describe('keepsFollowing', () => {
  it("keeps what a hidden box was doing: its sizes are all 0, so it can't say where its reader is", () => {
    const hidden = { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
    expect(keepsFollowing(hidden, true)).toBe(true);
    expect(keepsFollowing(hidden, false)).toBe(false);
  });

  it('follows a box on screen while its reader is at its end, whatever it did before', () => {
    expect(keepsFollowing({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 }, false)).toBe(true);
    expect(keepsFollowing({ scrollTop: 0, scrollHeight: 1814, clientHeight: 618 }, true)).toBe(false);
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
