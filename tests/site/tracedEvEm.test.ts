import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorPolicy, EvEm } from '../../src/index';
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

  it("names functions by the scenario's names first, then their own names, then by number", () => {
    const helper = function minified() {};
    const { trace, evem } = traced({ audit: helper });
    evem.subscribe('a', helper);
    evem.subscribe('a', function own() {});
    evem.unsubscribeById(evem.subscribe('a', () => {}));
    evem.subscribe('a', () => {});
    expect(lines(trace, ['subscribe'])).toEqual([
      'subscribe audit @-',
      'subscribe own @-',
      'subscribe subscriber 1 @-',
      'subscribe subscriber 2 @-'
    ]);
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

  it('records a once subscription leaving after its call, and does not count it afterwards', async () => {
    const { trace, evem } = traced();
    evem.subscribeOnce('a', function first() {});
    await evem.publish('a', 1);
    await evem.publish('a', 2);
    expect(lines(trace, ['unsubscribe', 'call', 'skip'])).toEqual(['call first @1', 'unsubscribe first @1']);
    expect(trace.entries.find(entry => entry.kind === 'unsubscribe')).toMatchObject({ once: true });
  });

  it('records unsubscribing a once subscription that never ran as a plain unsubscribe', async () => {
    const { trace, evem } = traced();
    evem.unsubscribeById(evem.subscribe('a', function first() {}, { once: true }));
    await Promise.resolve();
    expect(trace.entries.filter(entry => entry.kind === 'unsubscribe')).toEqual([
      expect.not.objectContaining({ once: true })
    ]);
    expect(lines(trace, ['unsubscribe'])).toEqual(['unsubscribe first @-']);
  });

  it('records history replays after the subscription, as replayed calls outside any publish', async () => {
    const { trace, evem } = traced();
    evem.enableHistory();
    await evem.publish('login', 'ada');
    await evem.publish('login', 'bo');
    evem.subscribe('login', function latest() {}, { replayLastEvent: true });
    evem.subscribe('login', function onlyOnce() {}, { replayHistory: true, once: true });

    expect(lines(trace, ['subscribe', 'call', 'unsubscribe'])).toEqual([
      'subscribe latest @-',
      'call latest @-',
      'subscribe onlyOnce @-',
      'call onlyOnce @-',
      'unsubscribe onlyOnce @-'
    ]);
    expect(trace.entries.filter(entry => entry.kind === 'call')).toEqual([
      expect.objectContaining({ data: 'bo', replayed: true }),
      expect.objectContaining({ data: 'ada', replayed: true })
    ]);

    await evem.publish('login', 'cy');
    expect(lines(trace, ['call', 'skip']).slice(2)).toEqual(['call latest @3']);
  });

  it('records the data each middleware passes on', async () => {
    const { trace, evem } = traced();
    evem.use(function stamp(_event: string, data: any) {
      return { ...data, stamped: true };
    });
    evem.use(function route(_event: string, data: any) {
      return { event: 'b', data };
    });
    await evem.publish('a', { id: 1 });
    expect(trace.entries.flatMap(entry => (entry.kind === 'middleware' ? [entry.data] : []))).toEqual([
      { id: 1, stamped: true },
      { id: 1, stamped: true }
    ]);
  });

  it('explains, when asked, whether each subscription matched the event, and why', async () => {
    const trace = new Trace();
    const TracedEvEm = createTracedEvEm(trace, new Map(), { explainMatches: true });
    const evem = new TracedEvEm();
    evem.subscribe('user.*', function users() {});
    evem.subscribe('*.created', function creations() {});
    await evem.publish('user.profile.updated');
    expect(
      trace.entries.flatMap(entry => (entry.kind === 'match' ? [`${entry.subscription} ${entry.matched}`] : []))
    ).toEqual(['users true', 'creations false']);
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

  it('keeps publishes that overlap apart: each call, skip and result belongs to its own publish', async () => {
    const first = async () => {
      await Promise.resolve();
    };
    const second = () => {};
    const { trace, evem } = traced({ first, second });
    evem.subscribe('a', first);
    evem.subscribe('a', second);

    await Promise.all([evem.publish('a', 1), evem.publish('a', 2)]);

    const calls = trace.entries.flatMap(entry =>
      entry.kind === 'call' ? [`${entry.subscription} ${String(entry.data)} @${entry.publish}`] : []
    );
    expect(calls.sort()).toEqual(['first 1 @1', 'first 2 @2', 'second 1 @1', 'second 2 @2']);
    expect(lines(trace, ['publish', 'result', 'skip']).sort()).toEqual([
      'publish a @-',
      'publish a @-',
      'result true @-',
      'result true @-'
    ]);
  });

  it('attributes async filter verdicts to their own publish when publishes overlap', async () => {
    const isEven = async (n: number) => n % 2 === 0;
    const handler = () => {};
    const { trace, evem } = traced({ isEven, handler });
    evem.subscribe('n', handler, { filter: isEven });

    await Promise.all([evem.publish('n', 1), evem.publish('n', 2)]);

    expect(lines(trace, ['filter', 'call', 'skip']).sort()).toEqual([
      'call handler @2',
      'filter handler @1',
      'filter handler @2',
      'skip handler filtered @1'
    ]);
  });

  it('puts entries recorded outside a handler under the running publish, but only when there is no doubt which', async () => {
    const { trace, evem } = traced();
    const logAfterAwait = async (text: string) => {
      await Promise.resolve();
      trace.record({ kind: 'log', level: 'log', text });
    };
    evem.subscribe('a', logAfterAwait);

    await evem.publish('a', 'alone');
    await Promise.all([evem.publish('a', 'overlap 1'), evem.publish('a', 'overlap 2')]);

    const logs = trace.entries.flatMap(entry =>
      entry.kind === 'log' ? [`${entry.text} @${entry.publish ?? '-'}`] : []
    );
    expect(logs).toEqual(['alone @1', 'overlap 1 @-', 'overlap 2 @-']);
  });

  it('says a publish stopped by an error stopped, not that it was canceled', async () => {
    const fails = () => {
      throw new Error('boom');
    };
    const after = () => {};
    const { trace, evem } = traced({ fails, after });
    evem.subscribe('a', fails);
    evem.subscribe('a', after);

    await expect(evem.publish('a', 1, { errorPolicy: ErrorPolicy.THROW })).rejects.toThrow('boom');

    expect(lines(trace, ['skip', 'rejected'])).toEqual(['skip after stopped @1', 'rejected  @-']);
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
