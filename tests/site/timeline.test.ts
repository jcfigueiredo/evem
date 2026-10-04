import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../demo/src/engine/trace';
import {
  announcement,
  describeEntry,
  groupRuns,
  groupSummary,
  isAtEnd,
  keepHistory,
  latestConnectionState,
  keepsFollowing,
  keepsFollowingTop,
  liveAnnouncement,
  preview,
  rowsFrom,
  setupSummary,
  sinceLatestAction,
  timelineRows,
  unseenRows,
  type TimelineRow
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

describe('latestConnectionState', () => {
  it("is the state an adapter's connection last moved to among the entries, for either adapter", () => {
    const at = { at: 0 };
    const state = (event: string, to: string, id: number): TraceEntry => ({
      kind: 'publish',
      id,
      event,
      data: { from: 'x', to, timestamp: 0 },
      ...at
    });
    expect(
      latestConnectionState([
        state('sse.connection.state', 'reconnecting', 1),
        state('sse.connection.state', 'connected', 2)
      ])
    ).toBe('connected');
    expect(latestConnectionState([state('ws.connection.state', 'disconnected', 1)])).toBe('disconnected');
    expect(
      latestConnectionState([{ kind: 'publish', id: 1, event: 'server.tick', data: { n: 1 }, ...at }])
    ).toBeUndefined();
    expect(latestConnectionState([state('my.connection.state.extra', 'connected', 1)])).toBeUndefined();
  });
});

describe('keepHistory', () => {
  const rows = (n: number) =>
    timelineRows(
      Array.from({ length: n }, (_, at) => ({ kind: 'log', level: 'log', text: `row ${at}`, at }) as TraceEntry)
    );

  it('keeps what the timeline showed before each restart, in order', () => {
    const history = keepHistory(keepHistory([], { label: 'a → 1', rows: rows(2) }), { label: 'b → 2', rows: rows(3) });
    expect(history.map(segment => [segment.label, segment.rows.length])).toEqual([
      ['a → 1', 2],
      ['b → 2', 3]
    ]);
  });

  it('keeps what else a segment carries (its runs, its scope)', () => {
    const runs = [{ at: 0, end: 5 }];
    expect(keepHistory([], { label: 'a', rows: rows(1), runs, scope: 't1' })[0]).toMatchObject({ runs, scope: 't1' });
  });

  it('keeps at most maxRows rows, dropping the oldest, and the segments that empties', () => {
    const history = keepHistory(keepHistory([], { label: 'old', rows: rows(4) }), { label: 'new', rows: rows(5) }, 6);
    expect(history.map(segment => [segment.label, segment.rows.map(row => row.text)])).toEqual([
      ['old', ['row 3']],
      ['new', ['row 0', 'row 1', 'row 2', 'row 3', 'row 4']]
    ]);
    expect(keepHistory(history, { label: 'newest', rows: rows(6) }, 6).map(segment => segment.label)).toEqual([
      'newest'
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

/** A timeline row, for the grouping tests: what it is, where and when, and whose */
const row = (kind: TimelineRow['kind'], text: string, depth: number, at: number, subject?: string): TimelineRow => ({
  kind,
  text,
  depth,
  at,
  tone: 'neutral',
  ...(subject === undefined ? {} : { subject })
});

describe('timelineRows: whose row it is', () => {
  it('names the subscription a row is about, and the publish it belongs to', () => {
    const entries: TraceEntry[] = [
      { kind: 'subscribe', subscription: 'welcome', pattern: 'user.*', options: [], at: 0 },
      { kind: 'publish', id: 1, event: 'user.new', data: 1, at: 1 },
      { kind: 'call', subscription: 'welcome', data: 1, publish: 1, at: 1 },
      { kind: 'skip', subscription: 'audit', reason: 'filtered', publish: 1, at: 1 },
      { kind: 'error', subscription: 'mailer', message: 'down', publish: 1, at: 1 },
      { kind: 'result', id: 1, result: true, at: 2 },
      { kind: 'unsubscribe', subscription: 'welcome', at: 3 }
    ];
    expect(timelineRows(entries).map(each => each.publish)).toEqual([undefined, 1, 1, 1, 1, 1, undefined]);
    expect(timelineRows(entries).map(each => each.subject)).toEqual([
      'welcome',
      undefined,
      'welcome',
      'audit',
      'mailer',
      undefined,
      'welcome'
    ]);
  });
});

describe('groupRuns', () => {
  const texts = (groups: ReturnType<typeof groupRuns>) => groups.map(group => group.rows.map(each => each.text));

  it('keeps an action with what happened until its run ended, in order', () => {
    const rows = [
      row('action', '▶ Publish', 0, 100),
      row('publish', 'publish a', 0, 100),
      row('call', 'x ran', 1, 100, 'x'),
      row('result', 'resolved true', 0, 400),
      row('publish', 'publish server.tick', 0, 900),
      row('call', 'tick ran', 1, 900, 'tick')
    ];
    expect(texts(groupRuns(rows, [{ at: 100, end: 400 }]))).toEqual([
      ['▶ Publish', 'publish a', 'x ran', 'resolved true'],
      ['publish server.tick', 'tick ran']
    ]);
  });

  it('gives each top-level row outside an action, with the rows under it and its result, a group of its own', () => {
    const rows = [
      { ...row('publish', 'publish t1', 0, 10), publish: 1 },
      { ...row('call', 'tick ran', 1, 10, 'tick'), publish: 1 },
      { ...row('publish', 'publish t2', 0, 11), publish: 2 },
      { ...row('result', 'resolved true', 0, 12), publish: 1 },
      { ...row('result', 'resolved false', 0, 13), publish: 2 },
      row('call', 'save ran later', 0, 20, 'save')
    ];
    expect(texts(groupRuns(rows, []))).toEqual([
      ['publish t1', 'tick ran', 'resolved true'],
      ['publish t2', 'resolved false'],
      ['save ran later']
    ]);
  });

  it('keeps everything after an action that is still running in its group', () => {
    const rows = [
      row('action', '▶ Scroll', 0, 0),
      row('publish', 'publish s', 0, 0),
      row('publish', 'publish s', 0, 99)
    ];
    expect(texts(groupRuns(rows, [{ at: 0 }]))).toEqual([['▶ Scroll', 'publish s', 'publish s']]);
  });

  it('starts with what is left of a publish the reader cleared the top of', () => {
    const rows = [row('call', 'x ran', 1, 5, 'x'), row('publish', 'publish b', 0, 6)];
    expect(texts(groupRuns(rows, []))).toEqual([['x ran'], ['publish b']]);
  });
});

describe('groupSummary', () => {
  it('says what an action caused: who ran, who was skipped and how the publish ended', () => {
    const rows = [
      row('action', '▶ Publish user.registered', 0, 0),
      row('publish', 'publish user.registered', 0, 0),
      row('call', 'welcome ran', 1, 0, 'welcome'),
      row('skip', 'audit skipped: filtered out', 1, 0, 'audit'),
      row('call', 'sendEmail ran', 1, 0, 'sendEmail'),
      row('call', 'afterEmail ran', 1, 300, 'afterEmail'),
      row('result', 'resolved true', 0, 300)
    ];
    expect(groupSummary(rows)).toBe(
      '▶ Publish user.registered · welcome, sendEmail and afterEmail ran · audit skipped · resolved true'
    );
  });

  it('counts publishes, names a few subscribers and counts the rest, and counts errors', () => {
    const rows = [
      row('action', '▶ Scroll', 0, 0),
      ...['a', 'b', 'c', 'd', 'e'].flatMap(name => [
        row('publish', 'publish s', 0, 0),
        row('call', `${name} ran`, 1, 0, name)
      ]),
      row('error', 'e threw: boom', 1, 0, 'e'),
      row('rejected', 'rejected: boom', 0, 0),
      row('result', 'resolved false', 0, 0)
    ];
    expect(groupSummary(rows)).toBe('▶ Scroll · 5 publishes · a, b, c and 2 more ran · 2 errors · resolved false');
  });

  it('names a stream event with its data, and who left or joined', () => {
    const rows = [
      { ...row('publish', 'publish server.tick', 0, 0), detail: '{"n":3}' },
      row('call', 'tick ran', 1, 0, 'tick'),
      row('unsubscribe', 'tick unsubscribed', 1, 0, 'tick'),
      row('subscribe', 'tock subscribed to server.*', 1, 0, 'tock')
    ];
    expect(groupSummary(rows)).toBe('publish server.tick {"n":3} · tick ran · tick unsubscribed · tock subscribed');
  });

  it('is the row itself when nothing followed it', () => {
    expect(groupSummary([row('action', '▶ Clear the history', 0, 0)])).toBe('▶ Clear the history');
  });
});

describe('keepsFollowingTop', () => {
  it('follows a newest-first list while its reader is at the top, and keeps what a hidden one was doing', () => {
    expect(keepsFollowingTop({ scrollTop: 0, scrollHeight: 900, clientHeight: 300 }, false)).toBe(true);
    expect(keepsFollowingTop({ scrollTop: 10, scrollHeight: 900, clientHeight: 300 }, false)).toBe(true);
    expect(keepsFollowingTop({ scrollTop: 200, scrollHeight: 900, clientHeight: 300 }, true)).toBe(false);
    expect(keepsFollowingTop({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 }, false)).toBe(false);
  });
});
