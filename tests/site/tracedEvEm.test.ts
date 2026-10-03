import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvEm } from '../../src/index';
import { Trace, type TraceEntry } from '../../demo/src/engine/trace';
import { createTracedEvEm, matchesPattern } from '../../demo/src/engine/tracedEvEm';

/** The trace without its timestamps */
const view = (trace: Trace) => trace.entries.map(({ at: _at, ...entry }) => entry);
/** The trace as short lines: kind, subscription or event, and the publish it belongs to */
const lines = (trace: Trace, kinds?: Array<TraceEntry['kind']>) =>
  trace.entries
    .filter(entry => !kinds || kinds.includes(entry.kind))
    .map(entry => {
      const subject =
        'subscription' in entry
          ? entry.subscription
          : entry.kind === 'publish'
            ? entry.event
            : entry.kind === 'middleware'
              ? `${entry.name} ${entry.outcome}${entry.to ? ` ${entry.to}` : ''}`
              : entry.kind === 'result'
                ? String(entry.result)
                : '';
      const extra = entry.kind === 'skip' ? ` ${entry.reason}` : entry.kind === 'call' && entry.later ? ' later' : '';
      return `${entry.kind} ${subject}${extra} @${entry.publish ?? '-'}`;
    });

function traced(names: Record<string, Function> = {}) {
  const trace = new Trace();
  const TracedEvEm = createTracedEvEm(trace, new Map(Object.entries(names).map(([name, fn]) => [fn, name])));
  return { trace, evem: new TracedEvEm() };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createTracedEvEm', () => {
  it('records the subscriptions, the publish, each call in priority order and the result', async () => {
    const { trace, evem } = traced();
    evem.subscribe('order.created', function low() {}, { priority: 'low' });
    evem.subscribe('order.created', function high() {}, { priority: 'high' });

    expect(await evem.publish('order.created', { id: 1 })).toBe(true);

    expect(view(trace)).toEqual([
      { kind: 'subscribe', subscription: 'low', pattern: 'order.created', options: ['priority low'] },
      { kind: 'subscribe', subscription: 'high', pattern: 'order.created', options: ['priority high'] },
      { kind: 'publish', id: 1, event: 'order.created', data: { id: 1 } },
      { kind: 'call', subscription: 'high', data: { id: 1 }, publish: 1 },
      { kind: 'call', subscription: 'low', data: { id: 1 }, publish: 1 },
      { kind: 'result', id: 1, result: true }
    ]);
  });

  it("names functions by the scenario's names first, then their own names, then by position", () => {
    const helper = function minified() {};
    const { trace, evem } = traced({ audit: helper });
    evem.subscribe('a', helper);
    evem.subscribe('a', function own() {});
    evem.subscribe('a', () => {});
    expect(lines(trace)).toEqual(['subscribe audit @-', 'subscribe own @-', 'subscribe subscriber 3 @-']);
  });

  it('records why a subscription that matched the event did not run, and debounced calls later', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { trace, evem } = traced();
    evem.subscribe('job', function filtered() {}, {
      filter: function isUrgent() {
        return false;
      }
    });
    evem.subscribe('job', function invalid() {}, { schema: () => ({ valid: false, errors: [] }) });
    evem.subscribe('job', function debounced() {}, { debounceTime: 100 });
    evem.subscribe('job', function throttled() {}, { throttleTime: 1000 });

    await evem.publish('job', {});
    await evem.publish('job', {});
    await vi.advanceTimersByTimeAsync(100);

    expect(lines(trace, ['call', 'skip', 'filter', 'schema'])).toEqual([
      'filter filtered @1',
      'schema invalid @1',
      'call throttled @1',
      'skip filtered filtered @1',
      'skip invalid schema @1',
      'skip debounced debounced @1',
      'filter filtered @2',
      'schema invalid @2',
      'skip filtered filtered @2',
      'skip invalid schema @2',
      'skip debounced debounced @2',
      'skip throttled throttled @2',
      'call debounced later @2'
    ]);
  });

  it('records a cancel and the subscriptions it stopped', async () => {
    const { trace, evem } = traced();
    evem.subscribe(
      'save',
      function guard(data: { cancel(): void }) {
        data.cancel();
      },
      { priority: 'high' }
    );
    evem.subscribe('save', function writer() {});

    expect(await evem.publish('save', {}, { cancelable: true })).toBe(false);

    expect(lines(trace, ['call', 'cancel', 'skip', 'result'])).toEqual([
      'call guard @1',
      'cancel guard @1',
      'skip writer canceled @1',
      'result false @-'
    ]);
  });

  it('records what middleware did, and matches subscriptions against the rerouted name', async () => {
    const { trace, evem } = traced();
    evem.use(function stamp(_event: string, data: object) {
      return { ...data, stamped: true };
    });
    evem.use({
      pattern: 'order.*',
      handler: function toAudit(event: string, data: unknown) {
        return { event: `audit.${event}`, data };
      }
    });
    evem.subscribe('order.created', function original() {});
    evem.subscribe('audit.*', function auditor() {});

    await evem.publish('order.created', { id: 1 });

    expect(lines(trace, ['middleware', 'call', 'skip'])).toEqual([
      'middleware stamp continue @1',
      'middleware toAudit reroute audit.order.created @1',
      'call auditor @1'
    ]);
  });

  it('records a middleware that cancels, and who it stopped', async () => {
    const { trace, evem } = traced();
    evem.use(function block() {
      return null;
    });
    evem.subscribe('x', function listener() {});
    expect(await evem.publish('x', {})).toBe(false);
    expect(lines(trace, ['middleware', 'skip', 'result'])).toEqual([
      'middleware block cancel @1',
      'skip listener canceled @1',
      'result false @-'
    ]);
  });

  it('records transforms and the errors callbacks throw', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { trace, evem } = traced();
    evem.subscribe('n', function double() {}, { priority: 'high', transform: (n: number) => n * 2 });
    evem.subscribe('n', function fails() {
      throw new Error('boom');
    });

    await evem.publish('n', 2);

    expect(view(trace).filter(entry => ['call', 'transform', 'error'].includes(entry.kind))).toEqual([
      { kind: 'call', subscription: 'double', data: 2, publish: 1 },
      { kind: 'transform', subscription: 'double', data: 4, publish: 1 },
      { kind: 'call', subscription: 'fails', data: 4, publish: 1 },
      { kind: 'error', subscription: 'fails', message: 'boom', publish: 1 }
    ]);
  });

  it('records a once subscription leaving, and does not count it afterwards', async () => {
    const { trace, evem } = traced();
    evem.subscribeOnce('a', function first() {});
    await evem.publish('a', 1);
    await evem.publish('a', 2);
    expect(lines(trace, ['unsubscribe', 'call', 'skip'])).toEqual(['unsubscribe first @1', 'call first @1']);
  });

  it('unsubscribes and removes middleware by the original functions', async () => {
    const handler = () => {};
    const middleware = (_event: string, data: unknown) => data;
    const { trace, evem } = traced({ handler, middleware });
    evem.subscribe('a', handler);
    evem.use(middleware);
    evem.unsubscribe('a', handler);
    evem.removeMiddleware(middleware);

    await evem.publish('a', {});

    expect(lines(trace, ['unsubscribe', 'call', 'middleware'])).toEqual(['unsubscribe handler @-']);
  });

  it('attributes a publish started by a handler to the publish it happened in', async () => {
    const { trace, evem } = traced();
    evem.subscribe('outer', async function relay() {
      await evem.publish('inner', 1);
    });
    evem.subscribe('inner', function sink() {});

    await evem.publish('outer', 0);

    expect(lines(trace, ['publish', 'call', 'result'])).toEqual([
      'publish outer @-',
      'call relay @1',
      'publish inner @1',
      'call sink @2',
      'result true @1',
      'result true @-'
    ]);
  });
});

describe('matchesPattern', () => {
  const evem = new EvEm();
  it.each([
    ['user.login', 'user.*', true],
    ['user.profile.updated', 'user.*', true],
    ['user', 'user.*', false],
    ['user.created', '*.created', true],
    ['admin.user.created', '*.created', false],
    ['system.db.error', 'system.*.error', true],
    ['system.error', 'system.*.error', false],
    ['anything.at.all', '*', true],
    ['a.b', 'a.b', true]
  ] as const)('%s against %s is %s, as EvEm matches', (event, pattern, matches) => {
    expect(matchesPattern(evem, event, pattern)).toBe(matches);
  });
});
