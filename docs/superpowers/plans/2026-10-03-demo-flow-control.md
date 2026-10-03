# Demo Flow Control Implementation Plan (Demo Revamp, Phase 3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Flow control group (Throttle, Debounce, Throttle + debounce), each showing its latest action over time in a lane chart with a lane per subscriber; calls that come after their publish (debounce) shown as their own rows that name the publish they came from; and the follow-ups the design assigns to 3b.

**Architecture:** Builds on phases 2 and 3a. The trace gains `action` entries (each action's start, `▶ Label` in the timeline, and the chart's origin), attributes a later call to the publish whose data it got, and refuses empty names as EvEm does. A pure model (`demo/src/lanes.ts`: `laneChart`, `timeAxis`) turns the trace into lanes; `demo/src/playground/laneChart.ts` draws them with HTML and Tailwind (dots placed by percentage, tooltips, a spoken summary) for scenarios with `lanes: true`. The three scenarios' checks run in Node with fake timers, so their throttle and debounce behavior is pinned to the library's.

**Tech Stack:** As phases 2 and 3a; no new dependencies.

**Spec:** `docs/demo-revamp-design.md` — "Phase 3: Playground" (the Flow control row: "Throttle · Debounce · Throttle + debounce, each with a burst button and an in/out lane chart"; the three-part split), "Phase 2 → Tracing" (delayed calls "appear when they happen, labeled with the publish that caused them"), "Follow-ups" (the rows for 3b), "Testing". Choices made with the user on 2026-10-03: a lane per subscriber; timeline rows (not cards), a later call labeled with its publish.

## Global Constraints

- No runtime dependencies, and no new dev dependencies. Development needs Node.js 20.19+ or 22.12+ (Vite 8); the package's `engines` (`>=20`) don't change.
- The site imports the library only as `@jcfigueiredo/evem` and its subpaths (aliased to `src/`); `src/` isn't touched.
- Colors only through daisyUI semantic tokens (plus `--code-*`); every text pair meets WCAG AA, faded text included (`tests/site/contrast.test.ts` reads every `text-base-content/NN` and `bg-base-content/NN` the site uses).
- Class names Tailwind must generate are written out in full in the source.
- DOM content from data goes through `el()`: strings become text nodes, never HTML.
- Scenario code is plain JavaScript: it runs with `AsyncFunction` and must also type-check as TypeScript with `noImplicitAny` off.
- Code style: Prettier (`pnpm format`), single quotes, 120 columns, no trailing commas.
- Commit messages: subject, a body that explains why, and the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW`.
- New tests go in `tests/site/`.

## Rulings made while planning (for review)

Every file in this plan was written and run first: `pnpm check` passed on the result (61 test files, 1,266 tests, the package check), the three scenarios were used in Chrome, and a dry run of the tasks in order confirmed each task's RED and GREEN results below and that the end state equals the validated files.

1. **The lane chart is HTML and Tailwind, not SVG.** Each lane is a row of a CSS grid (a name column, then a track); dots are placed by percentage of the time axis, so the chart is responsive and its labels stay readable at any width. Dots carry a tooltip (`title`); the chart is `role="img"` with a spoken summary ("published 11 times; everyKey ran 11 times; throttled ran 4 times, held back 7 times; …"). Filled dots are runs (and publishes, in the first lane); hollow dots are calls throttle or debounce held back. It shows the latest action only, from its `action` entry, so earlier bursts don't squeeze the axis.
2. **A later call names its publish by time.** The option the user chose read "search ran, from publish #2"; publish rows don't show numbers, so the row says `search ran later, with the data published at 1503 ms`, the time the publish row shows. It's a top-level row (a debounced call isn't part of any publish). It's attributed to the publish whose data it got (EvEm calls a debounced callback with that publish's data object), else to the latest publish of a matching event.
3. **Every action starts with a row** (`▶ Type "events"`): it shows which button made which rows, in every scenario, and gives the chart its time origin.
4. **Throttle boundaries follow EvEm, to the millisecond.** An event exactly at the end of a window opens a new one (EvEm drops only `now < expiresAt`), and with both options an event runs at once only when *more* than `throttleTime` has passed. The checks pin exact timings under fake timers; in the browser, real gaps run slightly over the set value, so an immediate run can land one event earlier than in the checks. Both follow the README's rule.
5. **The 3b follow-ups are in Task 1 and Task 4:** an empty event name records no match or skip rows (the traced EvEm mirrors EvEm's own check); `subscribe('')` records no subscription; a setup that throws clears the action buttons (unless a newer reset has taken over); subscribers are named through `nameOf` like filters and middleware; a test pins `unsubscribe(event, callback)` on a once subscription (it passes before the change: a guard); History & replay publishes the notification last, so `replayLastEvent` visibly picks the last *matching* event; CLAUDE.md's run-on sentence (Task 5). The phase 2 ruling 11 follow-up (rows or cards, later calls labeled) is settled by ruling 2.
6. **CLAUDE.md also gains 3a's console capture**, missed in 3a: runs record what the library prints with `console.log` and `console.group` (indented by group), not only warnings and errors.

## Review Focus

1. **Real timers in the browser** (gaps a little over the set value): the lane chart and the timeline agree with each other and with EvEm's rule, even where a boundary moves by one event compared with the checks. Chrome, Task 5 step 2.
2. **A second burst while the first one's debounced call is pending:** the new action becomes the chart's origin, and the late call lands where it happens (in the new chart, and in the timeline as a later row naming the old publish); nothing is lost or duplicated. Chrome, Task 5 step 3.
3. **Long bursts** (20 events, 600 ms apart: 12 seconds): the axis picks a larger step (at most 8 intervals), and every dot stays inside its lane. `timeAxis` tests in Task 2; Chrome, Task 5 step 3.
4. **Narrow screens:** the chart's name column shrinks (long names truncate, with the full name in the tooltip), and the page doesn't scroll sideways. Chrome, Task 5 step 3.
5. **Edited code in a lanes scenario with no actions, or no subscribers:** the chart shows its hint, or only the publishes lane; nothing breaks. `laneChart` returns `undefined` before any action (Task 2); Chrome, Task 5 step 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `demo/src/engine/trace.ts` | `action` entries |
| `demo/src/engine/tracedEvEm.ts` | Later calls attributed by data; empty names refused like EvEm; `nameOf` for subscribers |
| `demo/src/engine/session.ts` | An `action` entry per run; actions cleared when the setup throws; `Scenario.lanes` |
| `demo/src/timeline.ts` | `▶ Label` rows; later calls as top-level rows naming their publish's time |
| `demo/src/lanes.ts` (new) | `laneChart(entries)`, `timeAxis(duration)`: the latest action as lanes |
| `demo/src/playground/laneChart.ts` (new) | `renderLaneChart(container, chart)`: the chart in HTML and Tailwind |
| `demo/src/playground/workbench.ts` | An "Over time" card for scenarios with `lanes` |
| `demo/src/scenarios/throttle.ts`, `debounce.ts`, `throttleDebounce.ts` (new), `index.ts` | The Flow control group, between Core and Data |
| `demo/src/scenarios/historyReplay.ts` | The notification published last |
| `tests/site/*.test.ts` | `lanes` (new), `tracedEvEm`, `timeline`, `session` |
| `CLAUDE.md`, `docs/demo-revamp-design.md` | The chart, action rows, later calls, the console capture; 3b's status; the follow-ups list |

### Task 1: Later calls, action rows, and the engine follow-ups

**Files:**
- Modify (replace): `demo/src/engine/trace.ts`, `demo/src/engine/tracedEvEm.ts`, `demo/src/engine/session.ts`, `demo/src/timeline.ts`
- Test (replace): `tests/site/tracedEvEm.test.ts`, `tests/site/timeline.test.ts`, `tests/site/session.test.ts`

**Interfaces:**
- Produces:
  - `TraceEntry` adds `{ kind: 'action'; label: string }`; `ScenarioSession.run(actionId)` records one (with the action's label) before running it
  - A call outside any publish that isn't a replay (a debounced call) gets `publish` = the latest publish whose data is the same object, else the latest publish of a matching event; `timelineRows` shows it at depth 0 as `X ran later, with the data published at N ms` (or `X ran later` without a publish)
  - `describeEntry` for `action`: `▶ Label`, tone `primary`
  - The traced EvEm refuses an empty name as EvEm does: `subscribe('')` throws EvEm's error without recording; `publish('')` records the publish and the rejection, but no match or skip rows
  - A reset whose setup throws clears `actions` (if no newer reset has taken over)
  - `Scenario.lanes?: boolean` (used from Task 3)

These files are 3a's, with the changes above; the new test files contain the earlier tests too (three session tests updated for the `action` entry).

- [ ] **Step 1: Write the failing tests**

Replace `tests/site/tracedEvEm.test.ts` with:

```typescript
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

  it('attributes a debounced call to the publish whose data it got, not just the latest one', async () => {
    vi.useFakeTimers();
    const { trace, evem } = traced();
    evem.subscribe<{ q: string }>('search', function search() {}, {
      debounceTime: 100,
      filter: query => query.q !== 'skip'
    });
    await evem.publish('search', { q: 'ev' });
    // Filtered out, so it doesn't restart the debounce: the call still gets publish 1's data
    await evem.publish('search', { q: 'skip' });
    await vi.advanceTimersByTimeAsync(100);
    expect(lines(trace, ['call'])).toEqual(['call search later @1']);
  });

  it('records nothing about matches or skips for a publish EvEm refuses (an empty event name)', async () => {
    const trace = new Trace();
    const TracedEvEm = createTracedEvEm(trace, new Map(), { explainMatches: true });
    const evem = new TracedEvEm();
    evem.subscribe('*', function everything() {});

    await expect(evem.publish('')).rejects.toThrow('Event name cannot be empty.');

    expect(lines(trace)).toEqual(['subscribe everything @-', 'publish  @-', 'rejected  @-']);
  });

  it('records no subscription when subscribe() refuses an empty pattern', () => {
    const { trace, evem } = traced();
    expect(() => evem.subscribe('', function nobody() {})).toThrow('Event name cannot be empty.');
    expect(trace.entries).toEqual([]);
  });

  it('records unsubscribing a once subscription by its callback as a plain unsubscribe', async () => {
    const handler = () => {};
    const { trace, evem } = traced({ handler });
    evem.subscribe('a', handler, { once: true });
    evem.unsubscribe('a', handler);
    await Promise.resolve();
    expect(trace.entries.filter(entry => entry.kind === 'unsubscribe')).toEqual([
      expect.not.objectContaining({ once: true })
    ]);
    expect(lines(trace, ['unsubscribe'])).toEqual(['unsubscribe handler @-']);
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
```

Replace `tests/site/timeline.test.ts` with:

```typescript
import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../demo/src/engine/trace';
import { announcement, describeEntry, preview, timelineRows } from '../../demo/src/timeline';

describe('preview', () => {
  it('shows data as JSON, shortened with an ellipsis', () => {
    expect(preview({ id: 42 })).toBe('{"id":42}');
    expect(preview(undefined)).toBe('undefined');
    expect(preview('x'.repeat(100), 10)).toBe(`"${'x'.repeat(8)}…`);
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
```

Replace `tests/site/session.test.ts` with:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultValues, numberInput, ScenarioSession, type Scenario } from '../../demo/src/engine/session';

const scenario: Scenario = {
  id: 'greeting',
  group: 'Test',
  title: 'Greeting',
  summary: '',
  docs: '',
  controls: {
    greeting: { kind: 'select', label: 'greeting', options: ['hello', 'hi'], default: 'hello' },
    loud: { kind: 'toggle', label: 'loud', default: false }
  },
  helpers: {
    greet: function greet(name: string) {
      return name;
    }
  },
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    'const evem = new EvEm();',
    "evem.subscribe('greet', greet);",
    '// ▶ Greet',
    "await evem.publish('greet', {{greeting}});",
    "console.log('greeted', {{loud}});"
  ].join('\n'),
  checks: []
};

const kinds = (session: ScenarioSession) => session.trace.entries.map(entry => entry.kind);
const logs = (session: ScenarioSession) =>
  session.trace.entries.flatMap(entry => (entry.kind === 'log' ? [entry.text] : []));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScenarioSession', () => {
  it('starts from the default values and the code they render', () => {
    const session = new ScenarioSession(scenario);
    expect(defaultValues(scenario)).toEqual({ greeting: 'hello', loud: false });
    expect(session.code).toContain("await evem.publish('greet', 'hello');");
  });

  it('runs the setup on reset and an action on run, recording both and the code’s own logs', async () => {
    const session = new ScenarioSession(scenario);
    await session.reset();
    expect(session.actions).toEqual([{ id: 'greet', label: 'Greet' }]);
    expect(kinds(session)).toEqual(['subscribe']);

    await session.run('greet');

    expect(kinds(session)).toEqual(['subscribe', 'action', 'publish', 'call', 'result', 'log']);
    expect(session.trace.entries[1]).toMatchObject({ kind: 'action', label: 'Greet' });
    expect(session.trace.entries.at(-1)).toMatchObject({ kind: 'log', level: 'log', text: 'greeted false' });
  });

  it('renders the code again and restarts when a control changes', async () => {
    const session = new ScenarioSession(scenario);
    await session.reset();
    await session.run('greet');

    await session.setValue('greeting', 'hi');

    expect(session.values.greeting).toBe('hi');
    expect(session.code).toContain("await evem.publish('greet', 'hi');");
    expect(kinds(session)).toEqual(['subscribe']);
  });

  it("runs the reader's edit, keeps it while controls change, and goes back on restoreTemplate", async () => {
    const session = new ScenarioSession(scenario);
    await session.edit(scenario.code.replace('{{greeting}}', "'yo'").replace('{{loud}}', 'true'));
    expect(session.edited).toBe(true);

    await session.setValue('greeting', 'hi');
    expect(session.code).toContain("'yo'");

    await session.restoreTemplate();
    expect(session.edited).toBe(false);
    expect(session.code).toContain("await evem.publish('greet', 'hi');");
  });

  it('records a syntax error in edited code, and a missing action, as errors', async () => {
    const session = new ScenarioSession(scenario);
    await session.edit('const = 1;');
    expect(kinds(session)).toEqual(['error']);

    await session.run('greet');
    expect(session.trace.entries.at(-1)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('No action greet')
    });
  });

  it('records an import the package does not provide as an error, instead of running with it undefined', async () => {
    const session = new ScenarioSession(scenario);
    await session.edit("import { EvEmm } from '@jcfigueiredo/evem';\n// ▶ Greet\n");
    expect(session.trace.entries).toEqual([
      expect.objectContaining({ kind: 'error', message: '@jcfigueiredo/evem has no export named EvEmm' })
    ]);

    await session.edit("import { EvEm } from '@jcfigueiredo/evem/nope';\n");
    expect(session.trace.entries).toEqual([
      expect.objectContaining({ kind: 'error', message: "There's no @jcfigueiredo/evem/nope entry point" })
    ]);
  });

  it('records what EvEm itself logs during a run, and puts the console back afterwards', async () => {
    const original = console.error;
    const session = new ScenarioSession({
      ...scenario,
      helpers: {
        greet: function greet() {
          throw new Error('boom');
        }
      }
    });
    await session.reset();
    await session.run('greet');

    expect(session.trace.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'error', subscription: 'greet', message: 'boom' }),
        expect.objectContaining({
          kind: 'log',
          level: 'error',
          text: expect.stringContaining('Error in event handler for "greet"')
        })
      ])
    );
    expect(console.error).toBe(original);
  });

  it('gives the console back on the next reset, even when an earlier action never finished', async () => {
    const original = console.error;
    const session = new ScenarioSession({ ...scenario, code: '// ▶ Hang\nawait new Promise(() => {});' });
    await session.reset();

    void session.run('hang');
    expect(console.error).not.toBe(original);
    await session.reset();

    expect(console.error).toBe(original);
  });

  it('keeps the newest code when an earlier setup finishes after it', async () => {
    let open!: () => void;
    const gate = new Promise<void>(resolve => (open = resolve));
    const session = new ScenarioSession({ ...scenario, helpers: { gate: () => gate } });
    const slow = session.edit('await gate();\n// ▶ Old\nconsole.log("old");');
    await session.edit('// ▶ New\nconsole.log("new");');

    open();
    await slow;
    await session.run('new');

    expect(session.actions).toEqual([{ id: 'new', label: 'New' }]);
    expect(session.trace.entries).toEqual([
      expect.objectContaining({ kind: 'action', label: 'New' }),
      expect.objectContaining({ kind: 'log', text: 'new' })
    ]);
  });

  it('writes raw select values into the code as code, and text values as strings', () => {
    const session = new ScenarioSession({
      ...scenario,
      controls: {
        greeting: { kind: 'select', label: 'greeting', options: ['[1, 2]', 'null'], default: '[1, 2]', raw: true },
        loud: { kind: 'text', label: 'loud', default: 'very' }
      }
    });
    expect(session.code).toContain("await evem.publish('greet', [1, 2]);");
    expect(session.code).toContain("console.log('greeted', 'very');");
  });

  it('clears the action buttons when the code stops compiling', async () => {
    const session = new ScenarioSession(scenario);
    await session.reset();
    expect(session.actions).toHaveLength(1);

    await session.edit("import WebSocket from 'ws';\n// ▶ Greet\n");

    expect(session.actions).toEqual([]);
  });

  it('clears the action buttons when the setup throws', async () => {
    const session = new ScenarioSession(scenario);
    await session.reset();
    expect(session.actions).toHaveLength(1);

    await session.edit("throw new Error('setup failed');\n// ▶ Greet\n");

    expect(session.actions).toEqual([]);
    expect(session.trace.entries).toEqual([expect.objectContaining({ kind: 'error', message: 'setup failed' })]);
  });

  it("gives the code a console that logs info and debug too, and whose other methods are the page's", async () => {
    const table = vi.spyOn(console, 'table').mockImplementation(() => {});
    const session = new ScenarioSession(scenario);

    await session.edit("console.info('hi');\nconsole.debug('there');\nconsole.table([1]);");

    expect(logs(session)).toEqual(['hi', 'there']);
    expect(kinds(session)).toEqual(['log', 'log']);
    expect(table).toHaveBeenCalledWith([1]);
  });

  it('logs short values on one line and long ones indented', async () => {
    const session = new ScenarioSession(scenario);
    await session.edit("console.log({ a: 1 });\nconsole.log({ name: 'x'.repeat(90) });");
    expect(logs(session)).toEqual(['{"a":1}', `{\n  "name": "${'x'.repeat(90)}"\n}`]);
  });

  it('records what the library logs with console.log and console.group during a run, indented by group', async () => {
    const originalLog = console.log;
    const session = new ScenarioSession({
      ...scenario,
      helpers: {
        libraryLog: () => {
          console.group('Details:');
          console.log('inside');
          console.groupEnd();
          console.info('after');
        }
      },
      code: '// ▶ Log\nlibraryLog();'
    });
    await session.reset();
    await session.run('log');

    expect(logs(session)).toEqual(['Details:', '  inside', 'after']);
    expect(console.log).toBe(originalLog);
  });

  it('records an error thrown by an action', async () => {
    const session = new ScenarioSession({ ...scenario, code: '// ▶ Fail\nthrow new Error("no");' });
    await session.reset();
    await session.run('fail');
    expect(session.trace.entries).toEqual([
      expect.objectContaining({ kind: 'action', label: 'Fail' }),
      expect.objectContaining({ kind: 'error', message: 'no' })
    ]);
  });
});

describe('numberInput', () => {
  const control = { min: 0, max: 100 };

  it('keeps a number between the min and the max', () => {
    expect(numberInput('42', control, 5)).toBe(42);
    expect(numberInput('-3', control, 5)).toBe(0);
    expect(numberInput('250', control, 5)).toBe(100);
  });

  it('keeps the previous value for an empty input or one that is not a number', () => {
    expect(numberInput('', control, 5)).toBe(5);
    expect(numberInput('  ', control, 5)).toBe(5);
    expect(numberInput('abc', control, 5)).toBe(5);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:nowatch tests/site/tracedEvEm.test.ts tests/site/timeline.test.ts tests/site/session.test.ts`
Expected: FAIL — 8 of 69: in `session.test.ts` the three tests that list a run's entries (no `action` entry yet) and `clears the action buttons when the setup throws` (4); in `timeline.test.ts` `shows a call that came after its publish ended at the top level…` (1); in `tracedEvEm.test.ts` the debounced attribution, refused publish and refused subscription tests (3). (`records unsubscribing a once subscription by its callback…` passes already: it guards existing behavior.)

- [ ] **Step 3: Write the implementation**

Replace `demo/src/engine/trace.ts` with:

```typescript
import type { EvEm } from '@jcfigueiredo/evem';

/** Why a subscription that matched an event didn't run */
export type SkipReason = 'filtered' | 'schema' | 'throttled' | 'debounced' | 'canceled' | 'stopped' | 'not-called';

/** One thing EvEm did, as the timeline shows it. `publish` is the id of the publish it happened in, if any */
export type TraceEntry = { at: number; publish?: number } & (
  | { kind: 'subscribe'; subscription: string; pattern: string; options: string[] }
  | { kind: 'unsubscribe'; subscription: string; once?: boolean }
  | { kind: 'publish'; id: number; event: string; data: unknown }
  | { kind: 'result'; id: number; result: boolean }
  | { kind: 'rejected'; id: number; error: string }
  | { kind: 'middleware'; name: string; outcome: 'continue' | 'cancel' | 'reroute'; to?: string; data?: unknown }
  | { kind: 'schema'; subscription: string; valid: boolean }
  | { kind: 'filter'; subscription: string; name: string; passed: boolean }
  | { kind: 'call'; subscription: string; data: unknown; later?: boolean; replayed?: boolean }
  | { kind: 'match'; subscription: string; pattern: string; event: string; matched: boolean; reason: string }
  | { kind: 'cancel'; subscription: string }
  | { kind: 'transform'; subscription: string; data: unknown }
  | { kind: 'skip'; subscription: string; reason: SkipReason }
  | { kind: 'error'; message: string; subscription?: string }
  | { kind: 'log'; level: 'log' | 'warn' | 'error'; text: string }
  | { kind: 'action'; label: string }
);

/** A TraceEntry without the fields the trace fills in */
export type TraceRecord = TraceEntry extends infer Entry
  ? Entry extends TraceEntry
    ? Omit<Entry, 'at' | 'publish'> & { publish?: number }
    : never
  : never;

/**
 * What one scenario run did, in order. Each entry is also published on the playground's own emitter as
 * `trace.entry`, which is how the timeline hears about it.
 */
export class Trace {
  readonly entries: TraceEntry[] = [];
  /**
   * The publish whose handler (middleware, callback, filter, schema or transform) is running right now, if any.
   * The traced EvEm sets it while EvEm runs one, so entries recorded meanwhile belong to that publish, even when
   * publishes overlap.
   */
  currentPublish: number | undefined;
  private readonly started = performance.now();
  private nextPublishId = 1;
  /** Publishes still running, oldest first, each with the publish it was started in */
  private readonly running = new Map<number, number | undefined>();

  constructor(private readonly bus?: EvEm) {}

  /** Start a publish (in `parent`, if a handler started it): returns its id */
  startPublish(parent: number | undefined): number {
    const id = this.nextPublishId++;
    this.running.set(id, parent);
    return id;
  }

  endPublish(id: number): void {
    this.running.delete(id);
  }

  /**
   * The publish an entry recorded outside any handler belongs to (a log after a callback's await, EvEm's own error
   * log): the innermost running publish, if every running publish is nested in it, so there's no doubt
   */
  private soleRunningPublish(): number | undefined {
    const newest = [...this.running.keys()].at(-1);
    let nested = 0;
    for (let id = newest; id !== undefined && this.running.has(id); id = this.running.get(id)) nested++;
    return nested === this.running.size ? newest : undefined;
  }

  record(record: TraceRecord): TraceEntry {
    const entry = {
      ...record,
      at: Math.round(performance.now() - this.started),
      publish: 'publish' in record ? record.publish : (this.currentPublish ?? this.soleRunningPublish())
    } as TraceEntry;
    this.entries.push(entry);
    void this.bus?.publish('trace.entry', entry);
    return entry;
  }
}
```

Replace `demo/src/engine/tracedEvEm.ts` with:

```typescript
import {
  EvEm,
  type EventCallback,
  type MiddlewareConfig,
  type MiddlewareFunction,
  type PublishOptions,
  type SubscriptionOptions
} from '@jcfigueiredo/evem';
import type { SkipReason, Trace } from './trace';
import { explainMatch } from './wildcards';

/**
 * EvEm's own wildcard matching (private: the timeline must decide "this subscription matched" exactly as EvEm
 * does). Reached here only; a test pins it to the documented wildcard rules.
 */
export function matchesPattern(evem: EvEm, event: string, pattern: string): boolean {
  return (evem as unknown as { isEventMatch(event: string, pattern: string): boolean }).isEventMatch(event, pattern);
}

/** EvEm's own test for a middleware result that reroutes the event (private, like isEventMatch) */
function isReroute(evem: EvEm, result: unknown): result is { event: string; data: unknown } {
  return (evem as unknown as { isMiddlewareReroute(result: unknown): boolean }).isMiddlewareReroute(result);
}

/**
 * EvEm's private publish-chain methods (private, like isEventMatch). Every publish creates its own chain, before
 * its first await, and EvEm runs each of its handlers inside that chain, so the chain says which publish a handler
 * belongs to.
 */
interface PublishChains {
  enterPublishChain(event: string): Map<string, number>;
  runInPublishChain<R>(chain: Map<string, number> | null, fn: () => R): R;
}

/** Call `onValue` with a value, or with what a promise resolves to; returns the value or promise unchanged */
function settle<V>(value: V, onValue: (resolved: Awaited<V>) => void): V {
  if (value instanceof Promise) {
    return value.then(resolved => {
      onValue(resolved);
      return resolved;
    }) as V;
  }
  onValue(value as Awaited<V>);
  return value;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isCanceled = (data: unknown) =>
  typeof data === 'object' && data !== null && (data as { canceled?: unknown }).canceled === true;

interface Subscription {
  id: string;
  name: string;
  pattern: string;
  options: SubscriptionOptions<any, any> | undefined;
  original: EventCallback<any>;
  wrapped: EventCallback<any>;
}

/** What happened to the subscriptions during one publish */
interface PublishState {
  id: number;
  /** The event name after middleware reroutes */
  event: string;
  live: Subscription[];
  called: Set<string>;
  filtered: Set<string>;
  invalid: Set<string>;
  canceled: boolean;
}

function describeOptions(options: SubscriptionOptions<any, any> | undefined): string[] {
  if (!options) return [];
  const described: string[] = [];
  if (options.priority !== undefined) described.push(`priority ${String(options.priority)}`);
  if (options.filter) described.push(Array.isArray(options.filter) ? `${options.filter.length} filters` : 'filter');
  if (options.schema) described.push('schema');
  if (options.throttleTime !== undefined) described.push(`throttle ${options.throttleTime} ms`);
  if (options.debounceTime !== undefined) described.push(`debounce ${options.debounceTime} ms`);
  if (options.once) described.push('once');
  if (options.transform) described.push('transform');
  if (options.replayLastEvent) described.push('replay last');
  if (options.replayHistory) described.push('replay history');
  return described;
}

/**
 * An EvEm that records what it does in `trace`, for the timeline. It only observes: every method calls the real
 * one with wrappers that record calls, verdicts and results and pass everything through unchanged.
 */
/** What else the traced EvEm records */
export interface TraceOptions {
  /** For every publish, whether each subscription's pattern matched the event, and why (the Wildcards scenario) */
  explainMatches?: boolean;
}

export function createTracedEvEm(
  trace: Trace,
  names: ReadonlyMap<Function, string> = new Map(),
  { explainMatches = false }: TraceOptions = {}
): typeof EvEm {
  /** A function's display name: the scenario's name for it, else its own (only code the reader wrote keeps one) */
  const nameOf = (fn: Function, fallback: string | (() => string)) =>
    names.get(fn) ?? (fn.name || (typeof fallback === 'string' ? fallback : fallback()));

  return class TracedEvEm extends EvEm {
    private readonly subscriptions = new Map<string, Subscription>();
    private readonly publishes = new Map<number, PublishState>();
    /** Recent publishes, newest last, to attribute calls that happen after their publish (debounce) */
    private readonly history: Array<{ id: number; event: string; data: unknown }> = [];
    private readonly middlewares = new Map<MiddlewareFunction<any>, MiddlewareFunction<any>>();
    /** The publish each publish chain belongs to */
    private readonly chains = new WeakMap<Map<string, number>, number>();
    /** The publish being started, until EvEm has created its chain */
    private starting: number | undefined;
    /** How deep we are in subscribe(): a call that happens there, outside any publish, is a history replay */
    private subscribing = 0;
    /** Once subscriptions EvEm just removed, which say so after their call (EvEm removes them just before it) */
    private readonly leaving = new Map<string, Subscription>();
    /** Subscriptions removed before subscribe() returned: a once subscription a replay used up */
    private readonly removedWhileSubscribing = new Set<string>();
    /** Numbers the subscribers that have no name */
    private anonymous = 0;

    constructor(...args: ConstructorParameters<typeof EvEm>) {
      super(...args);
      // Follow EvEm's own publish chains: while EvEm runs a handler in a publish's chain, that's the current publish
      const own = this as unknown as PublishChains;
      const enterPublishChain = own.enterPublishChain.bind(this);
      const runInPublishChain = own.runInPublishChain.bind(this);
      own.enterPublishChain = event => {
        const chain = enterPublishChain(event);
        if (this.starting !== undefined) this.chains.set(chain, this.starting);
        return chain;
      };
      own.runInPublishChain = <R>(chain: Map<string, number> | null, fn: () => R): R => {
        const previous = trace.currentPublish;
        trace.currentPublish = chain ? this.chains.get(chain) : undefined;
        try {
          return runInPublishChain(chain, fn);
        } finally {
          trace.currentPublish = previous;
        }
      };
    }

    private current(): PublishState | undefined {
      const id = trace.currentPublish;
      return id === undefined ? undefined : this.publishes.get(id);
    }

    /**
     * The publish a call outside any publish came from (a debounced call): the latest one whose data it got, or else
     * the latest publish of an event that `pattern` matches
     */
    private publishFor(pattern: string, data: unknown): number | undefined {
      for (let index = this.history.length - 1; index >= 0; index--) {
        if (this.history[index]!.data === data && data !== undefined) return this.history[index]!.id;
      }
      for (let index = this.history.length - 1; index >= 0; index--) {
        const publish = this.history[index]!;
        if (matchesPattern(this, publish.event, pattern)) return publish.id;
      }
      return undefined;
    }

    override subscribe<T = unknown, R = any>(
      event: string,
      callback: EventCallback<T>,
      options?: SubscriptionOptions<T, R>
    ): string {
      // EvEm refuses an empty name before doing anything: so does the trace
      if (!event) return super.subscribe(event, callback, options);
      const name = nameOf(callback, () => `subscriber ${++this.anonymous}`);
      let id = '';
      const wrapped: EventCallback<T> = data => {
        const state = this.current();
        state?.called.add(id);
        // Outside any publish: a replay from history while subscribing, or a call that comes later (debounce)
        const replayed = !state && this.subscribing > 0;
        const publish = state?.id ?? (replayed ? undefined : this.publishFor(event, data));
        trace.record({
          kind: 'call',
          subscription: name,
          data,
          publish,
          ...(replayed ? { replayed: true } : state ? {} : { later: true })
        });
        if (this.leaving.delete(id)) trace.record({ kind: 'unsubscribe', subscription: name, once: true, publish });
        const wasCanceled = isCanceled(data);
        const afterCall = () => {
          if (!wasCanceled && isCanceled(data)) {
            if (state) state.canceled = true;
            trace.record({ kind: 'cancel', subscription: name, publish });
          }
        };
        const failed = (error: unknown) =>
          trace.record({ kind: 'error', subscription: name, message: messageOf(error), publish });
        try {
          const result = callback(data);
          if (result instanceof Promise) {
            return result.then(
              value => {
                afterCall();
                return value;
              },
              (error: unknown) => {
                failed(error);
                throw error;
              }
            );
          }
          afterCall();
          return result;
        } catch (error) {
          failed(error);
          throw error;
        }
      };
      const traced = options ? this.traceOptions(options, name, () => id) : undefined;
      // Recorded first, so a history replay (which runs inside subscribe) comes after it
      trace.record({ kind: 'subscribe', subscription: name, pattern: event, options: describeOptions(options) });
      this.subscribing++;
      try {
        id = super.subscribe(event, wrapped, traced);
      } finally {
        this.subscribing--;
      }
      if (this.removedWhileSubscribing.delete(id)) {
        trace.record({ kind: 'unsubscribe', subscription: name, once: true });
      } else {
        this.subscriptions.set(id, { id, name, pattern: event, options, original: callback, wrapped });
      }
      return id;
    }

    private traceOptions<T, R>(
      options: SubscriptionOptions<T, R>,
      name: string,
      id: () => string
    ): SubscriptionOptions<T, R> {
      const traced: SubscriptionOptions<T, R> = { ...options };
      if (options.filter) {
        const filters = Array.isArray(options.filter) ? options.filter : [options.filter];
        const wrappedFilters = filters.map((filter, index) => {
          const filterName = nameOf(filter, filters.length > 1 ? `filter ${index + 1}` : 'filter');
          return (data: T) => {
            const state = this.current();
            const publish = trace.currentPublish;
            return settle(filter(data), passed => {
              if (!passed) state?.filtered.add(id());
              trace.record({ kind: 'filter', subscription: name, name: filterName, passed: Boolean(passed), publish });
            });
          };
        });
        traced.filter = Array.isArray(options.filter) ? wrappedFilters : wrappedFilters[0];
      }
      if (options.schema) {
        const schema = options.schema;
        traced.schema = ((data: T) => {
          const state = this.current();
          const publish = trace.currentPublish;
          return settle(schema(data), result => {
            const valid = typeof result === 'boolean' ? result : Boolean(result?.valid);
            if (!valid) state?.invalid.add(id());
            trace.record({ kind: 'schema', subscription: name, valid, publish });
          });
        }) as typeof schema;
      }
      if (options.transform) {
        const transform = options.transform;
        traced.transform = (data: T) => {
          const publish = trace.currentPublish;
          return settle(transform(data), result =>
            trace.record({ kind: 'transform', subscription: name, data: result, publish })
          );
        };
      }
      return traced;
    }

    override unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void {
      // EvEm removes the first subscription to `event` made with `callback`
      for (const subscription of this.subscriptions.values()) {
        if (subscription.pattern === event && subscription.original === callback) {
          super.unsubscribe(event, subscription.wrapped);
          this.forget(subscription);
          return;
        }
      }
      super.unsubscribe(event, callback);
    }

    override unsubscribeById(id: string): void {
      super.unsubscribeById(id);
      const subscription = this.subscriptions.get(id);
      if (!subscription) {
        if (this.subscribing > 0) this.removedWhileSubscribing.add(id);
        return;
      }
      if (subscription.options?.once) {
        // EvEm removes a once subscription just before calling it: its wrapped callback says so after the call, and
        // if no call follows (an explicit unsubscribe), this does
        this.subscriptions.delete(id);
        this.leaving.set(id, subscription);
        queueMicrotask(() => {
          if (this.leaving.delete(id)) trace.record({ kind: 'unsubscribe', subscription: subscription.name });
        });
        return;
      }
      this.forget(subscription);
    }

    private forget(subscription: Subscription): void {
      this.subscriptions.delete(subscription.id);
      trace.record({ kind: 'unsubscribe', subscription: subscription.name });
    }

    override use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
      const handler = typeof middleware === 'function' ? middleware : middleware.handler;
      const name = nameOf(handler, `middleware ${this.middlewares.size + 1}`);
      const traced: MiddlewareFunction<T> = (event, data) => {
        const state = this.current();
        const publish = trace.currentPublish;
        return settle(handler(event, data), result => {
          if (result === null) {
            trace.record({ kind: 'middleware', name, outcome: 'cancel', publish });
          } else if (result !== data && isReroute(this, result)) {
            if (state) state.event = result.event;
            trace.record({
              kind: 'middleware',
              name,
              outcome: 'reroute',
              to: result.event,
              data: result.data,
              publish
            });
          } else {
            trace.record({ kind: 'middleware', name, outcome: 'continue', data: result, publish });
          }
        });
      };
      this.middlewares.set(handler, traced);
      super.use(typeof middleware === 'function' ? traced : { ...middleware, handler: traced });
    }

    override removeMiddleware<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
      const handler = typeof middleware === 'function' ? middleware : middleware.handler;
      const traced = (this.middlewares.get(handler) ?? handler) as MiddlewareFunction<T>;
      super.removeMiddleware(typeof middleware === 'function' ? traced : { ...middleware, handler: traced });
    }

    override async publish<T = unknown>(event: string, args?: T, options?: PublishOptions | number): Promise<boolean> {
      const parent = trace.currentPublish;
      const id = trace.startPublish(parent);
      trace.record({ kind: 'publish', id, event, data: args, publish: parent });
      const state: PublishState = {
        id,
        event,
        live: [...this.subscriptions.values()],
        called: new Set(),
        filtered: new Set(),
        invalid: new Set(),
        canceled: false
      };
      this.publishes.set(id, state);
      // EvEm refuses a publish with an empty name before doing anything: nothing matched, nothing was skipped
      const refused = !event;
      if (explainMatches && !refused) {
        for (const subscription of state.live) {
          const { matched, reason } = explainMatch(event, subscription.pattern);
          const pattern = subscription.pattern;
          trace.record({
            kind: 'match',
            subscription: subscription.name,
            pattern,
            event,
            matched,
            reason,
            publish: id
          });
        }
      }
      this.history.push({ id, event, data: args });
      if (this.history.length > 50) this.history.shift();
      // EvEm creates this publish's chain before its first await, so this is set while it does
      const starting = this.starting;
      this.starting = id;
      let pending: Promise<boolean>;
      try {
        pending = super.publish(event, args, options);
      } finally {
        this.starting = starting;
      }
      try {
        const result = await pending;
        this.recordSkips(state, result);
        trace.record({ kind: 'result', id, result, publish: parent });
        return result;
      } catch (error) {
        if (!refused) this.recordSkips(state, 'rejected');
        trace.record({ kind: 'rejected', id, error: messageOf(error), publish: parent });
        throw error;
      } finally {
        trace.endPublish(id);
        this.publishes.delete(id);
      }
    }

    /** For every subscription that matched the (final) event but didn't run, say why */
    private recordSkips(state: PublishState, result: boolean | 'rejected'): void {
      for (const subscription of state.live) {
        if (state.called.has(subscription.id) || !matchesPattern(this, state.event, subscription.pattern)) continue;
        const options = subscription.options;
        const reason: SkipReason = state.invalid.has(subscription.id)
          ? 'schema'
          : state.filtered.has(subscription.id)
            ? 'filtered'
            : options?.debounceTime !== undefined
              ? 'debounced'
              : options?.throttleTime !== undefined
                ? 'throttled'
                : result === 'rejected'
                  ? 'stopped'
                  : state.canceled || !result
                    ? 'canceled'
                    : 'not-called';
        trace.record({ kind: 'skip', subscription: subscription.name, reason, publish: state.id });
      }
    }
  };
}
```

Replace `demo/src/engine/session.ts` with:

```typescript
import type { EvEm } from '@jcfigueiredo/evem';
import * as core from '@jcfigueiredo/evem';
import * as sse from '@jcfigueiredo/evem/sse';
import * as sseServer from '@jcfigueiredo/evem/sse/server';
import * as websocket from '@jcfigueiredo/evem/websocket';
import { compileProgram, renderCode, type Action, type ControlValue, type PackageImport } from './program';
import { Trace } from './trace';
import { createTracedEvEm } from './tracedEvEm';

export type Control =
  /** `raw`: the options are code (`ErrorPolicy.THROW`), written into the code as they are, not as string literals */
  | { kind: 'select'; label: string; options: readonly ControlValue[]; default: ControlValue; raw?: boolean }
  | { kind: 'number'; label: string; min: number; max: number; step?: number; default: number }
  | { kind: 'toggle'; label: string; default: boolean }
  /** Free text; `suggestions` are offered in the input (and type-checked by the scenario tests) */
  | { kind: 'text'; label: string; default: string; suggestions?: readonly string[] };

/** A hand-checked expectation for one action, used by the scenario tests */
export interface ScenarioCheck {
  /** Control values for this check; the defaults otherwise */
  values?: Record<string, ControlValue>;
  /** Actions to run first (their trace isn't checked) */
  before?: string[];
  action: string;
  /** Subscription names in the order their callbacks ran during the action */
  calls: string[];
  /** What the action's last publish resolved to */
  result?: boolean;
  /** Part of the error the action's last publish rejected with */
  rejects?: string;
  /** Parts of what the action logged, in order (the code's console, and EvEm's own warnings and errors) */
  logs?: string[];
  /** `name: reason` for each subscription the action's publishes skipped, in order */
  skipped?: string[];
}

export interface Scenario {
  id: string;
  group: string;
  title: string;
  summary: string;
  /** Link to the feature's documentation */
  docs: string;
  controls: Record<string, Control>;
  /** Functions the code uses by name, like the reader's own code would (their names show in the timeline) */
  helpers: Record<string, (...args: any[]) => unknown>;
  /** The code, with `{{control}}` placeholders and `// ▶ Label` lines that start action blocks */
  code: string;
  checks: ScenarioCheck[];
  /** Record, for every publish, whether each subscription's pattern matched and why (the Wildcards scenario) */
  explainMatches?: boolean;
  /** Show the latest action over time: a lane for its publishes and one per subscriber (flow control) */
  lanes?: boolean;
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...parameters: string[]
) => (...args: unknown[]) => Promise<unknown>;

/** The page's own console methods, which every run that replaces them puts back */
const CAPTURED = ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const;
type Captured = (typeof CAPTURED)[number];
const pageConsole: Pick<Console, Captured> = Object.fromEntries(
  CAPTURED.map(method => [method, console[method]])
) as Pick<Console, Captured>;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * What a number control's input means: the number, kept between the control's min and max, or `previous` when the
 * input is empty or not a number
 */
export function numberInput(text: string, control: { min: number; max: number }, previous: number): number {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) return previous;
  return Math.min(control.max, Math.max(control.min, value));
}

/** The controls whose values are code, written as they are */
export function rawControls(scenario: Scenario): Set<string> {
  return new Set(
    Object.entries(scenario.controls).flatMap(([name, control]) =>
      control.kind === 'select' && control.raw ? [name] : []
    )
  );
}

/** The default value of every control */
export function defaultValues(scenario: Scenario): Record<string, ControlValue> {
  return Object.fromEntries(Object.entries(scenario.controls).map(([name, control]) => [name, control.default]));
}

/**
 * One scenario in the workbench: its control values, the code they render to (or the reader's edit), and a
 * running program with its trace. Every reset starts from a fresh EvEm and runs the setup again.
 */
export class ScenarioSession {
  readonly values: Record<string, ControlValue>;
  code: string;
  edited = false;
  actions: Action[] = [];
  trace: Trace;
  private program: Record<string, () => Promise<void>> | undefined;

  constructor(
    readonly scenario: Scenario,
    private readonly bus?: EvEm
  ) {
    this.values = defaultValues(scenario);
    this.code = renderCode(scenario.code, this.values, rawControls(scenario));
    this.trace = new Trace(bus);
  }

  /** Change a control: the code is rendered again (unless it's being edited) and the scenario restarts */
  setValue(name: string, value: ControlValue): Promise<void> {
    this.values[name] = value;
    if (!this.edited) {
      this.code = renderCode(this.scenario.code, this.values, rawControls(this.scenario));
    }
    return this.reset();
  }

  /** Run the reader's own version of the code */
  edit(code: string): Promise<void> {
    this.edited = true;
    this.code = code;
    return this.reset();
  }

  /** Go back to the code the controls render */
  restoreTemplate(): Promise<void> {
    this.edited = false;
    this.code = renderCode(this.scenario.code, this.values, rawControls(this.scenario));
    return this.reset();
  }

  /**
   * Start over: a new trace, a fresh EvEm, and the setup code run again. A setup that finishes after a newer reset
   * started (a slow one) leaves the newer program and trace alone.
   */
  async reset(): Promise<void> {
    const trace = new Trace(this.bus);
    this.trace = trace;
    this.program = undefined;
    this.actions = [];
    try {
      const { body, actions, imports } = compileProgram(this.code);
      this.actions = actions;
      const modules: Record<string, object> = {
        '@jcfigueiredo/evem': {
          ...core,
          EvEm: createTracedEvEm(trace, this.helperNames(), { explainMatches: this.scenario.explainMatches })
        },
        '@jcfigueiredo/evem/websocket': websocket,
        '@jcfigueiredo/evem/sse': sse,
        '@jcfigueiredo/evem/sse/server': sseServer
      };
      checkImports(imports, modules);
      const helperNames = Object.keys(this.scenario.helpers);
      const run = new AsyncFunction('__modules', 'console', ...helperNames, body);
      const helpers = helperNames.map(name => this.scenario.helpers[name]);
      const program = await this.capturingLogs(trace, () => run(modules, this.consoleForCode(trace), ...helpers));
      if (this.trace === trace) this.program = program as Record<string, () => Promise<void>>;
    } catch (error) {
      // No program, so no action can run: no buttons (unless a newer reset has taken over)
      if (this.trace === trace) this.actions = [];
      trace.record({ kind: 'error', message: messageOf(error) });
    }
  }

  /** Run one action block; its errors go to the trace */
  async run(actionId: string): Promise<void> {
    const trace = this.trace;
    const action = this.program?.[actionId];
    if (!action) {
      trace.record({ kind: 'error', message: `No action ${actionId} (the setup failed, or the code changed)` });
      return;
    }
    trace.record({ kind: 'action', label: this.actions.find(known => known.id === actionId)?.label ?? actionId });
    try {
      await this.capturingLogs(trace, action);
    } catch (error) {
      trace.record({ kind: 'error', message: messageOf(error) });
    }
  }

  /** The scenario's names for its helpers, which a production build's minifier would otherwise rename */
  private helperNames(): Map<Function, string> {
    return new Map(Object.entries(this.scenario.helpers).map(([name, helper]) => [helper as Function, name]));
  }

  /**
   * The `console` the scenario's code sees: what it logs goes to `trace` (`info` and `debug` as logs); its other
   * methods (`table`, `time`, …) are the page's
   */
  private consoleForCode(trace: Trace): Console {
    const record =
      (level: 'log' | 'warn' | 'error') =>
      (...args: unknown[]) =>
        trace.record({ kind: 'log', level, text: args.map(formatArgument).join(' ') });
    return Object.assign(Object.create(console) as Console, {
      log: record('log'),
      info: record('log'),
      debug: record('log'),
      warn: record('warn'),
      error: record('error')
    });
  }

  /**
   * Run `work`, recording in `trace` what the library logs meanwhile: EvEm's warnings and errors ("Error in event
   * handler …") and what it prints with console.log and console.group (memory leak details), indented by group
   */
  private async capturingLogs<V>(trace: Trace, work: () => Promise<V>): Promise<V> {
    let depth = 0;
    const record =
      (level: 'log' | 'warn' | 'error') =>
      (...args: unknown[]) =>
        trace.record({ kind: 'log', level, text: '  '.repeat(depth) + args.map(formatArgument).join(' ') });
    const group = (...args: unknown[]) => {
      record('log')(...args);
      depth++;
    };
    const capture: Pick<Console, Captured> = {
      log: record('log'),
      info: record('log'),
      warn: record('warn'),
      error: record('error'),
      group,
      groupCollapsed: group,
      groupEnd: () => {
        depth = Math.max(0, depth - 1);
      }
    };
    Object.assign(console, capture);
    try {
      return await work();
    } finally {
      // Undo only this capture, back to the page's console: a newer run that replaced it undoes its own, so a run
      // that never finishes (or finishes late) can't keep the console
      const own = console as unknown as Record<Captured, unknown>;
      for (const method of CAPTURED) {
        if (own[method] === capture[method]) own[method] = pageConsole[method];
      }
    }
  }
}

/** Report an import the playground can't provide, as TypeScript would, instead of running with it undefined */
function checkImports(imports: readonly PackageImport[], modules: Readonly<Record<string, object>>): void {
  for (const { entryPoint, names } of imports) {
    const module = modules[entryPoint];
    if (!module) throw new Error(`There's no ${entryPoint} entry point`);
    for (const name of names) {
      if (!(name in module)) throw new Error(`${entryPoint} has no export named ${name}`);
    }
  }
}

/** A logged value as text: errors by their message, objects as JSON */
function formatArgument(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    const line = JSON.stringify(value);
    if (line === undefined) return String(value);
    // Long values (info() output, history records) read better indented, one property per line
    return line.length <= 80 ? line : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
```

Replace `demo/src/timeline.ts` with:

```typescript
import type { SkipReason, TraceEntry } from './engine/trace';

export type Tone = 'primary' | 'neutral' | 'info' | 'success' | 'warning' | 'error';

/** One line of the timeline */
export interface TimelineRow {
  text: string;
  /** Data shown after the text (JSON, shortened) */
  detail?: string;
  tone: Tone;
  /** 0 for top-level lines; lines recorded during a publish are one level deeper than it */
  depth: number;
  /** Milliseconds since the scenario started */
  at: number;
}

const SKIP_TEXT: Record<SkipReason, string> = {
  filtered: 'filtered out',
  schema: 'rejected by its schema',
  throttled: 'throttled',
  debounced: 'debounced (runs later if nothing else arrives)',
  canceled: 'the event was canceled first',
  stopped: 'the publish stopped on an error first',
  'not-called': 'not called'
};

/** Data as short JSON for the timeline */
export function preview(value: unknown, max = 72): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** What a trace entry says, in words */
export function describeEntry(entry: TraceEntry): Omit<TimelineRow, 'depth' | 'at'> {
  switch (entry.kind) {
    case 'subscribe':
      return {
        text: `${entry.subscription} subscribed to ${entry.pattern}`,
        ...(entry.options.length > 0 ? { detail: entry.options.join(', ') } : {}),
        tone: 'neutral'
      };
    case 'unsubscribe':
      return {
        text: entry.once
          ? `${entry.subscription} unsubscribed after its one run (once)`
          : `${entry.subscription} unsubscribed`,
        tone: 'neutral'
      };
    case 'publish':
      return {
        text: `publish ${entry.event}`,
        ...(entry.data === undefined ? {} : { detail: preview(entry.data) }),
        tone: 'primary'
      };
    case 'result':
      return { text: `resolved ${entry.result}`, tone: entry.result ? 'success' : 'warning' };
    case 'rejected':
      return { text: `rejected: ${entry.error}`, tone: 'error' };
    case 'middleware': {
      const detail = entry.data === undefined ? {} : { detail: preview(entry.data) };
      return entry.outcome === 'reroute'
        ? { text: `middleware ${entry.name} rerouted it to ${entry.to}`, ...detail, tone: 'info' }
        : entry.outcome === 'cancel'
          ? { text: `middleware ${entry.name} canceled it`, tone: 'warning' }
          : { text: `middleware ${entry.name} passed it on`, ...detail, tone: 'info' };
    }
    case 'match':
      return {
        text: `${entry.subscription}: "${entry.pattern}" ${entry.matched ? 'matches' : "doesn't match"} "${entry.event}"`,
        detail: entry.reason,
        tone: entry.matched ? 'info' : 'neutral'
      };
    case 'schema':
      return {
        text: `${entry.subscription}: data ${entry.valid ? 'valid' : 'invalid'}`,
        tone: entry.valid ? 'info' : 'warning'
      };
    case 'filter':
      return {
        text: `${entry.subscription}: ${entry.name} ${entry.passed ? 'passed it' : 'rejected it'}`,
        tone: entry.passed ? 'info' : 'warning'
      };
    case 'call':
      return {
        text: `${entry.subscription} ran${entry.replayed ? ' (replayed from history)' : entry.later ? ' (later)' : ''}`,
        detail: preview(entry.data),
        tone: 'success'
      };
    case 'cancel':
      return { text: `${entry.subscription} canceled the event`, tone: 'warning' };
    case 'transform':
      return { text: `${entry.subscription} transformed the data`, detail: preview(entry.data), tone: 'info' };
    case 'skip':
      return { text: `${entry.subscription} skipped: ${SKIP_TEXT[entry.reason]}`, tone: 'neutral' };
    case 'error':
      return {
        text: entry.subscription ? `${entry.subscription} threw: ${entry.message}` : `error: ${entry.message}`,
        tone: 'error'
      };
    case 'action':
      return { text: `▶ ${entry.label}`, tone: 'primary' };
    case 'log':
      return {
        text: entry.text,
        tone: entry.level === 'log' ? 'neutral' : entry.level === 'warn' ? 'warning' : 'error'
      };
  }
}

/** The trace as timeline rows, in order; what happened during a publish is indented under it */
export function timelineRows(entries: readonly TraceEntry[]): TimelineRow[] {
  const publishDepth = new Map<number, number>();
  const publishedAt = new Map<number, number>();
  return entries.map(entry => {
    if (entry.kind === 'call' && entry.later) {
      // A call that comes after its publish ended (debounce) stands on its own, and says which publish it came from
      const at = entry.publish === undefined ? undefined : publishedAt.get(entry.publish);
      const text = `${entry.subscription} ran later${at === undefined ? '' : `, with the data published at ${at} ms`}`;
      return { ...describeEntry(entry), text, depth: 0, at: entry.at };
    }
    const depth = entry.publish === undefined ? 0 : (publishDepth.get(entry.publish) ?? 0) + 1;
    if (entry.kind === 'publish') {
      publishDepth.set(entry.id, depth);
      publishedAt.set(entry.id, entry.at);
    }
    return { ...describeEntry(entry), depth, at: entry.at };
  });
}

/** Rows as a screen reader hears them: one short sentence each */
export function announcement(rows: readonly TimelineRow[]): string {
  return rows.map(row => `${row.text}.`).join(' ');
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:nowatch tests/site/tracedEvEm.test.ts tests/site/timeline.test.ts tests/site/session.test.ts`
Expected: PASS (69 tests: 31, 20 and 18).

- [ ] **Step 5: Format, type-check, run the site tests and commit**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch tests/site
git add demo/src/engine/trace.ts demo/src/engine/tracedEvEm.ts demo/src/engine/session.ts demo/src/timeline.ts tests/site/tracedEvEm.test.ts tests/site/timeline.test.ts tests/site/session.test.ts
git commit -m "Demo engine: action rows, later calls that name their publish, empty names refused

Every action now starts with a row (▶ Label), so the timeline shows
which button made which rows. A debounced call, which runs after its
publish ended, is its own top-level row that says when the data it got
was published, attributed by that data rather than to whichever publish
came last.

Follow-ups from 3a's review: like EvEm, the trace refuses an empty name
before recording anything (no match or skip rows, no subscribe row); a
setup that throws clears the action buttons; subscribers are named
through nameOf like filters and middleware; a test pins unsubscribing a
once subscription by its callback.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

Expected: the site tests pass (11 files).

---

### Task 2: The lanes model

**Files:**
- Create: `demo/src/lanes.ts`
- Test: `tests/site/lanes.test.ts`

**Interfaces:**
- Consumes: `TraceEntry` with `action` (Task 1); `preview` (`timeline.ts`).
- Produces: `interface LaneDot { at: number; kind: 'publish' | 'ran' | 'held'; title: string }`; `interface Lane { name: string; dots: LaneDot[] }`; `interface LaneChart { start: number; end: number; published: LaneDot[]; lanes: Lane[] }`; `laneChart(entries): LaneChart | undefined` — the entries since the last `action` (undefined before any), every publish on `published`, and a lane per subscriber of the whole trace in subscription order with its calls (`ran`) and its `throttled` / `debounced` skips (`held`); `timeAxis(duration): { span; ticks }` — span `max(ceil(duration × 1.05), 400)`, ticks every 50, 100, 200, 250, 500, 1000, 2000, 5000, 10 000 or 30 000 ms (the first giving at most 8 intervals).

- [ ] **Step 1: Write the failing test**

`tests/site/lanes.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../demo/src/engine/trace';
import { laneChart, timeAxis } from '../../demo/src/lanes';

describe('timeAxis', () => {
  it('spans the duration with a little room, at least 400 ms, with at most 8 steps of a round size', () => {
    expect(timeAxis(0)).toEqual({ span: 400, ticks: [0, 50, 100, 150, 200, 250, 300, 350, 400] });
    expect(timeAxis(1000)).toEqual({ span: 1050, ticks: [0, 200, 400, 600, 800, 1000] });
    expect(timeAxis(4000).ticks).toEqual([0, 1000, 2000, 3000, 4000]);
  });
});

describe('laneChart', () => {
  const setup: TraceEntry[] = [
    { kind: 'subscribe', subscription: 'everyKey', pattern: 'typed', options: [], at: 0 },
    { kind: 'subscribe', subscription: 'search', pattern: 'typed', options: ['debounce 300 ms'], at: 0 },
    { kind: 'subscribe', subscription: 'never', pattern: 'other', options: [], at: 0 }
  ];

  it('is undefined before any action', () => {
    expect(laneChart(setup)).toBeUndefined();
  });

  it("shows the latest action's publishes, and each subscriber's runs and held-back calls, in subscription order", () => {
    const entries: TraceEntry[] = [
      ...setup,
      { kind: 'action', label: 'Type', at: 10 },
      { kind: 'publish', id: 1, event: 'typed', data: { q: 'e' }, at: 100 },
      { kind: 'call', subscription: 'everyKey', data: { q: 'e' }, publish: 1, at: 100 },
      { kind: 'skip', subscription: 'search', reason: 'debounced', publish: 1, at: 101 },
      { kind: 'action', label: 'Type', at: 1000 },
      { kind: 'publish', id: 2, event: 'typed', data: { q: 'ev' }, at: 1010 },
      { kind: 'call', subscription: 'everyKey', data: { q: 'ev' }, publish: 2, at: 1010 },
      { kind: 'skip', subscription: 'search', reason: 'debounced', publish: 2, at: 1011 },
      { kind: 'skip', subscription: 'everyKey', reason: 'filtered', publish: 2, at: 1011 },
      { kind: 'call', subscription: 'search', data: { q: 'ev' }, later: true, publish: 2, at: 1311 }
    ];

    expect(laneChart(entries)).toEqual({
      start: 1000,
      end: 1311,
      published: [{ at: 1010, kind: 'publish', title: 'typed {"q":"ev"}' }],
      lanes: [
        { name: 'everyKey', dots: [{ at: 1010, kind: 'ran', title: 'everyKey ran {"q":"ev"}' }] },
        {
          name: 'search',
          dots: [
            { at: 1011, kind: 'held', title: 'search: debounced' },
            { at: 1311, kind: 'ran', title: 'search ran later {"q":"ev"}' }
          ]
        },
        { name: 'never', dots: [] }
      ]
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:nowatch tests/site/lanes.test.ts`
Expected: FAIL — `Failed to load url ../../demo/src/lanes`.

- [ ] **Step 3: Write the implementation**

`demo/src/lanes.ts`:

```typescript
import type { TraceEntry } from './engine/trace';
import { preview } from './timeline';

/** One mark on a lane: a publish, a subscriber's run, or a run that throttle or debounce held back */
export interface LaneDot {
  /** Milliseconds since the scenario started */
  at: number;
  kind: 'publish' | 'ran' | 'held';
  /** What the mark is, for its tooltip */
  title: string;
}

export interface Lane {
  name: string;
  dots: LaneDot[];
}

/** The latest action on a time line: every publish on one lane, then a lane per subscriber */
export interface LaneChart {
  /** When the action started, and the last thing that happened since */
  start: number;
  end: number;
  published: LaneDot[];
  lanes: Lane[];
}

/** The time axis for a chart lasting `duration` ms: its span (a little longer), and readable ticks */
export function timeAxis(duration: number): { span: number; ticks: number[] } {
  const span = Math.max(Math.ceil(duration * 1.05), 400);
  const step = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10_000, 30_000].find(size => span / size <= 8) ?? 60_000;
  const ticks: number[] = [];
  for (let tick = 0; tick <= span; tick += step) ticks.push(tick);
  return { span, ticks };
}

/**
 * The lanes for the latest action in `entries` (undefined before any): its publishes, and for each subscriber of the
 * scenario, in subscription order, when it ran and when throttle or debounce held it back
 */
export function laneChart(entries: readonly TraceEntry[]): LaneChart | undefined {
  let from = -1;
  for (let index = entries.length - 1; index >= 0 && from === -1; index--) {
    if (entries[index]!.kind === 'action') from = index;
  }
  if (from === -1) return undefined;
  const recent = entries.slice(from);
  const names = [...new Set(entries.flatMap(entry => (entry.kind === 'subscribe' ? [entry.subscription] : [])))];
  const published = recent.flatMap(entry =>
    entry.kind === 'publish'
      ? [{ at: entry.at, kind: 'publish' as const, title: `${entry.event} ${preview(entry.data)}` }]
      : []
  );
  const lanes = names.map(name => ({
    name,
    dots: recent.flatMap((entry): LaneDot[] => {
      if (entry.kind === 'call' && entry.subscription === name) {
        return [
          { at: entry.at, kind: 'ran', title: `${name} ran${entry.later ? ' later' : ''} ${preview(entry.data)}` }
        ];
      }
      if (
        entry.kind === 'skip' &&
        entry.subscription === name &&
        (entry.reason === 'throttled' || entry.reason === 'debounced')
      ) {
        return [{ at: entry.at, kind: 'held', title: `${name}: ${entry.reason}` }];
      }
      return [];
    })
  }));
  return { start: recent[0]!.at, end: Math.max(...recent.map(entry => entry.at)), published, lanes };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test:nowatch tests/site/lanes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/lanes.ts tests/site/lanes.test.ts
git commit -m "Demo: the lanes model — the latest action as publishes and per-subscriber runs

laneChart() turns the trace since the latest action into a lane of
publishes and one lane per subscriber, with its runs and the calls
throttle or debounce held back; timeAxis() picks a span and round tick
steps. Pure, so the chart's content is unit-tested and the drawing only
places dots.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

---

### Task 3: The lane chart, and the Flow control scenarios

**Files:**
- Create: `demo/src/playground/laneChart.ts`, `demo/src/scenarios/throttle.ts`, `demo/src/scenarios/debounce.ts`, `demo/src/scenarios/throttleDebounce.ts`
- Modify (replace): `demo/src/playground/workbench.ts`, `demo/src/scenarios/index.ts`
- Test: `tests/site/scenarios.test.ts` (generic, from 3a)

**Interfaces:**
- Consumes: `laneChart`, `timeAxis`, `LaneChart`, `LaneDot` (Task 2); `Scenario.lanes` (Task 1).
- Produces: `renderLaneChart(container: HTMLElement, chart: LaneChart | undefined): void` — a hint before any action; else a grid (`role="img"`, `aria-label` summary) with a `published` lane, one lane per subscriber and a time axis; dots `bg-primary` (publish), `bg-success` (ran), hollow `border-2 border-base-content/60 bg-base-100` (held), each with a `title`. The workbench adds an "Over time" card between the timeline and the code for scenarios with `lanes`, re-rendered with the timeline. The scenarios `throttle`, `debounce`, `throttleDebounce` (group `Flow control`, `lanes: true`), listed after Once.

The chart is DOM code, checked in Chrome in Task 5 (as with the rest of the workbench); the scenarios' checks are the tests.

- [ ] **Step 1: List the scenarios (failing test)**

Replace `demo/src/scenarios/index.ts` with:

```typescript
import type { Scenario } from '../engine/session';
import { cancelableEvents } from './cancelableEvents';
import { debounce } from './debounce';
import { errorPolicies } from './errorPolicies';
import { filters } from './filters';
import { historyReplay } from './historyReplay';
import { memoryLeaks } from './memoryLeaks';
import { middleware } from './middleware';
import { once } from './once';
import { priorities } from './priorities';
import { publishSubscribe } from './publishSubscribe';
import { recursionProtection } from './recursionProtection';
import { schemaValidation } from './schemaValidation';
import { throttle } from './throttle';
import { throttleDebounce } from './throttleDebounce';
import { transforms } from './transforms';
import { wildcards } from './wildcards';

/** Every scenario, in sidebar order: the groups follow the README */
export const scenarios: readonly Scenario[] = [
  publishSubscribe,
  wildcards,
  priorities,
  filters,
  once,
  throttle,
  debounce,
  throttleDebounce,
  transforms,
  schemaValidation,
  middleware,
  cancelableEvents,
  errorPolicies,
  recursionProtection,
  historyReplay,
  memoryLeaks
];
```

- [ ] **Step 2: Run the scenario test to verify it fails**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: FAIL — `Failed to load url ./debounce` (or another of the new modules).

- [ ] **Step 3: Write the chart, the workbench card and the scenarios**

`demo/src/playground/laneChart.ts`:

```typescript
import { el } from '../dom';
import { timeAxis, type LaneChart, type LaneDot } from '../lanes';

// Full class names, so Tailwind finds them in the source
const DOT_CLASS: Record<LaneDot['kind'], string> = {
  publish: 'bg-primary',
  ran: 'bg-success',
  held: 'border-2 border-base-content/60 bg-base-100'
};

const times = (count: number) => `${count} time${count === 1 ? '' : 's'}`;

/** What the chart shows, in words, for screen readers */
function summary(chart: LaneChart): string {
  const lanes = chart.lanes.map(lane => {
    const ran = lane.dots.filter(dot => dot.kind === 'ran').length;
    const held = lane.dots.filter(dot => dot.kind === 'held').length;
    return `${lane.name} ran ${times(ran)}${held > 0 ? `, held back ${times(held)}` : ''}`;
  });
  return [`published ${times(chart.published.length)}`, ...lanes].join('; ');
}

/**
 * Draw `chart` in `container`: a lane for the publishes and one per subscriber, each mark placed by time (its
 * tooltip says what it is), and the time axis below. Before any action, a hint.
 */
export function renderLaneChart(container: HTMLElement, chart: LaneChart | undefined): void {
  if (!chart) {
    container.replaceChildren(
      el('p', { class: 'text-sm text-base-content/70' }, ['Run an action to see its events and runs over time.'])
    );
    return;
  }
  const { span, ticks } = timeAxis(chart.end - chart.start);
  const left = (at: number) => `left: ${(((at - chart.start) / span) * 100).toFixed(2)}%`;
  const lane = (label: string, dots: LaneDot[]) => [
    el('span', { class: 'font-mono text-xs text-base-content/70 truncate', title: label }, [label]),
    el(
      'div',
      { class: 'relative h-7 border-b border-base-300' },
      dots.map(dot =>
        el('span', {
          class: `absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${DOT_CLASS[dot.kind]}`,
          style: left(dot.at),
          title: dot.title
        })
      )
    )
  ];
  container.replaceChildren(
    el(
      'div',
      {
        class: 'grid grid-cols-[minmax(4rem,9rem)_minmax(0,1fr)] items-center gap-x-3',
        role: 'img',
        'aria-label': summary(chart)
      },
      [
        ...lane('published', chart.published),
        ...chart.lanes.flatMap(subscriber => lane(subscriber.name, subscriber.dots)),
        el('span', {}, []),
        el(
          'div',
          { class: 'relative h-5' },
          ticks.map(tick =>
            el(
              'span',
              {
                class: 'absolute top-1 -translate-x-1/2 text-xs text-base-content/70',
                style: left(chart.start + tick)
              },
              [`${tick} ms`]
            )
          )
        )
      ]
    )
  );
}
```

Replace `demo/src/playground/workbench.ts` with:

```typescript
import type { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import type { ControlValue } from '../engine/program';
import { numberInput, ScenarioSession, type Control, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { announcement, timelineRows, type Tone } from '../timeline';
import { renderLaneChart } from './laneChart';

// Full class names, so Tailwind finds them in the source
const TONE_CLASS: Record<Tone, string> = {
  primary: 'status-primary text-primary',
  neutral: 'bg-base-content/60 text-base-content/60',
  info: 'status-info text-info',
  success: 'status-success text-success',
  warning: 'status-warning text-warning',
  error: 'status-error text-error'
};

function controlField(
  name: string,
  control: Control,
  value: ControlValue,
  onChange: (value: ControlValue) => void
): HTMLElement {
  if (control.kind === 'toggle') {
    const input = el('input', { type: 'checkbox', class: 'toggle toggle-sm', name });
    input.checked = value === true;
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { class: 'label justify-between w-full py-1' }, [el('span', {}, [control.label]), input]);
  }
  if (control.kind === 'number') {
    const input = el('input', {
      type: 'number',
      class: 'input input-sm w-full',
      name,
      min: String(control.min),
      max: String(control.max),
      step: String(control.step ?? 1),
      value: String(value)
    });
    let current = Number(value);
    input.addEventListener('change', () => {
      const next = numberInput(input.value, control, current);
      input.value = String(next);
      if (next === current) return;
      current = next;
      onChange(next);
    });
    return el('fieldset', { class: 'fieldset py-1' }, [
      el('legend', { class: 'fieldset-legend' }, [control.label]),
      input
    ]);
  }
  if (control.kind === 'text') {
    const listId = `control-${name}-suggestions`;
    const input = el('input', {
      type: 'text',
      class: 'input input-sm w-full font-mono',
      name,
      value: String(value),
      list: listId,
      autocomplete: 'off',
      spellcheck: 'false'
    });
    // change fires on Enter and when the input loses focus, not on every key
    input.addEventListener('change', () => onChange(input.value));
    return el('fieldset', { class: 'fieldset py-1' }, [
      el('legend', { class: 'fieldset-legend' }, [control.label]),
      input,
      el(
        'datalist',
        { id: listId },
        (control.suggestions ?? []).map(suggestion => el('option', { value: suggestion }))
      )
    ]);
  }
  const select = el(
    'select',
    { class: 'select select-sm w-full', name },
    control.options.map(option => {
      const element = el('option', { value: JSON.stringify(option) }, [String(option)]);
      element.selected = option === value;
      return element;
    })
  );
  select.addEventListener('change', () => onChange(JSON.parse(select.value) as ControlValue));
  return el('fieldset', { class: 'fieldset py-1' }, [
    el('legend', { class: 'fieldset-legend' }, [control.label]),
    select
  ]);
}

/**
 * Show a scenario in `root`: its controls and actions, the timeline of what EvEm did, and the code that runs.
 * Returns a function that tears it down (subscriptions and editor).
 */
export async function mountWorkbench(root: HTMLElement, scenario: Scenario, bus: EvEm): Promise<() => void> {
  const session = new ScenarioSession(scenario, bus);
  let busy = false;
  // Bumped whenever the scenario starts over, so an action from before (one that never finishes, say) can't leave
  // the new action buttons disabled
  let generation = 0;
  const startOver = () => {
    generation++;
    busy = false;
  };

  const timeline = el('ol', { class: 'relative ms-2 border-s border-base-300 space-y-1.5' });
  // The list is rebuilt on every render, so screen readers hear only what's new, from this status line
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  let announcedTrace = session.trace;
  let announcedRows = 0;
  const timelineBox = el('div', { class: 'max-h-[26rem] overflow-y-auto pe-2' }, [timeline]);
  const controls = el('fieldset', { class: 'space-y-1' });
  const actions = el('div', { class: 'flex flex-wrap gap-2 pt-2' });
  const editedBadge = el('span', { class: 'badge badge-warning badge-sm hidden' }, ['edited']);
  const codeHost = el('div', { class: 'min-h-24' });
  const editButton = el('button', { type: 'button', class: 'btn btn-sm' }, ['Edit']);
  const runEditedButton = el('button', { type: 'button', class: 'btn btn-sm hidden' }, ['Run edited code']);
  const resetButton = el('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, ['Reset']);
  const editingNote = el('p', { class: 'text-sm text-warning hidden' }, [
    'The code is edited, so the controls are off. Run it with ⌘/Ctrl+Enter; Reset goes back to the controls.'
  ]);

  // Flow control scenarios show the latest action over time too
  const lanesHost = scenario.lanes ? el('div', {}) : undefined;

  const renderTimeline = () => {
    const rows = timelineRows(session.trace.entries);
    timeline.replaceChildren(
      ...rows.map(row =>
        el('li', { class: 'relative ps-4', style: `margin-inline-start: ${row.depth * 1.25}rem` }, [
          el('span', {
            class: `status ${TONE_CLASS[row.tone]} absolute -start-[0.3rem] top-[0.45rem] signal-glow`,
            'aria-hidden': 'true'
          }),
          el('span', { class: 'font-mono text-sm break-words whitespace-pre-wrap' }, [row.text]),
          row.detail
            ? el('span', { class: 'font-mono text-xs text-base-content/60 ms-2 break-all' }, [row.detail])
            : null,
          el('span', { class: 'text-xs text-base-content/60 ms-2' }, [`${row.at} ms`])
        ])
      )
    );
    if (rows.length === 0) {
      timeline.append(el('li', { class: 'ps-4 text-sm text-base-content/60' }, ['Nothing yet: run an action.']));
    }
    timelineBox.scrollTop = timelineBox.scrollHeight;
    if (lanesHost) renderLaneChart(lanesHost, laneChart(session.trace.entries));
    // A new trace means the reader started over (a control, Reset, edited code): its setup isn't announced
    if (session.trace !== announcedTrace) {
      announcedTrace = session.trace;
    } else if (rows.length > announcedRows) {
      announcer.textContent = announcement(rows.slice(announcedRows));
    }
    announcedRows = rows.length;
  };
  let pending = false;
  const scheduleRender = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      renderTimeline();
    });
  };
  const traceSubscription = bus.subscribe('trace.entry', scheduleRender);

  const runAction = async (id: string) => {
    if (busy) return;
    const started = generation;
    busy = true;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    try {
      await session.run(id);
    } finally {
      if (generation === started) {
        busy = false;
        for (const button of actions.querySelectorAll('button')) button.disabled = false;
      }
    }
  };

  const renderActions = () => {
    actions.replaceChildren(
      ...session.actions.map((action, index) => {
        const button = el('button', { type: 'button', class: index === 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm' }, [
          action.label
        ]);
        button.addEventListener('click', () => void runAction(action.id));
        return button;
      })
    );
  };

  const renderControls = () => {
    controls.replaceChildren(
      ...Object.entries(scenario.controls).map(([name, control]) =>
        controlField(name, control, session.values[name]!, async value => {
          startOver();
          await session.setValue(name, value);
          editor.setCode(session.code);
          renderActions();
          renderTimeline();
        })
      )
    );
    controls.disabled = session.edited;
  };

  const { createEditor } = await import('../editor');
  const runEdited = async () => {
    startOver();
    await session.edit(editor.getCode());
    renderActions();
    renderTimeline();
  };
  const editor = createEditor(codeHost, session.code, () => void runEdited());

  const setEditing = (editing: boolean) => {
    editor.setEditable(editing);
    editButton.classList.toggle('hidden', editing);
    runEditedButton.classList.toggle('hidden', !editing);
    editingNote.classList.toggle('hidden', !editing);
    editedBadge.classList.toggle('hidden', !editing);
    controls.disabled = editing;
    if (editing) editor.focus();
  };
  editButton.addEventListener('click', () => setEditing(true));
  runEditedButton.addEventListener('click', () => void runEdited());
  resetButton.addEventListener('click', async () => {
    setEditing(false);
    startOver();
    await session.restoreTemplate();
    editor.setCode(session.code);
    renderActions();
    renderTimeline();
  });

  root.replaceChildren(
    el('header', { class: 'mb-6' }, [
      el('p', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, [scenario.group]),
      el('h1', { class: 'font-mono text-3xl font-bold tracking-tight' }, [scenario.title]),
      el('p', { class: 'mt-2 text-base-content/70 max-w-prose' }, [
        scenario.summary,
        ' ',
        el('a', { class: 'link link-primary', href: scenario.docs, target: '_blank', rel: 'noopener' }, ['Docs ↗'])
      ])
    ]),
    el('div', { class: 'grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]' }, [
      el('section', { class: 'card bg-base-100 border border-base-300', 'aria-label': 'Scenario' }, [
        el('div', { class: 'card-body p-4 gap-2' }, [
          el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, ['Scenario']),
          controls,
          actions
        ])
      ]),
      el('section', { class: 'card bg-base-100 border border-base-300', 'aria-label': 'What EvEm did' }, [
        el('div', { class: 'card-body p-4 gap-3' }, [
          el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, ['What EvEm did']),
          timelineBox,
          announcer
        ])
      ])
    ]),
    ...(lanesHost
      ? [
          el('section', { class: 'card bg-base-100 border border-base-300 mt-4', 'aria-label': 'Over time' }, [
            el('div', { class: 'card-body p-4 gap-3' }, [
              el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, ['Over time']),
              lanesHost
            ])
          ])
        ]
      : []),
    el('section', { class: 'card bg-base-100 border border-base-300 mt-4', 'aria-label': 'Code' }, [
      el('div', { class: 'card-body p-4 gap-3' }, [
        el('div', { class: 'flex flex-wrap items-center gap-2' }, [
          el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70 me-auto' }, [
            'Code that runs ',
            editedBadge
          ]),
          editButton,
          runEditedButton,
          resetButton
        ]),
        editingNote,
        codeHost
      ])
    ])
  );

  await session.reset();
  renderControls();
  renderActions();
  renderTimeline();

  return () => {
    bus.unsubscribeById(traceSubscription);
    editor.destroy();
  };
}
```

`demo/src/scenarios/throttle.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const throttle: Scenario = {
  id: 'throttle',
  group: 'Flow control',
  title: 'Throttle',
  summary:
    'A throttled subscriber runs the first event at once and opens a time window; events during the window are dropped, not delayed. The lanes show which events got through.',
  docs: 'https://github.com/jcfigueiredo/evem#throttling-events',
  controls: {
    throttle: { kind: 'number', label: 'throttleTime (ms)', min: 50, max: 1000, step: 50, default: 250 },
    count: { kind: 'number', label: 'events', min: 2, max: 20, default: 5 },
    gap: { kind: 'number', label: 'time between events (ms)', min: 10, max: 600, step: 10, default: 100 }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const everyScroll = () => {};',
    'const updateIndicator = scroll => console.log(`indicator at ${scroll.position}`);',
    '',
    "evem.subscribe('window.scroll', everyScroll);",
    '// The first event runs at once and opens a {{throttle}} ms window; events during it are dropped',
    "evem.subscribe('window.scroll', updateIndicator, { throttleTime: {{throttle}} });",
    '',
    '// ▶ Scroll',
    'for (let i = 1; i <= {{count}}; i++) {',
    "  await evem.publish('window.scroll', { position: i * 100 });",
    '  await sleep({{gap}});',
    '}'
  ].join('\n'),
  checks: [
    {
      action: 'scroll',
      calls: [
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'everyScroll',
        'everyScroll',
        'updateIndicator',
        'everyScroll'
      ],
      skipped: ['updateIndicator: throttled', 'updateIndicator: throttled', 'updateIndicator: throttled'],
      logs: ['indicator at 100', 'indicator at 400']
    },
    {
      values: { gap: 300 },
      action: 'scroll',
      calls: [
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'updateIndicator'
      ],
      skipped: []
    },
    {
      values: { throttle: 1000 },
      action: 'scroll',
      calls: ['everyScroll', 'updateIndicator', 'everyScroll', 'everyScroll', 'everyScroll', 'everyScroll'],
      logs: ['indicator at 100']
    }
  ],
  lanes: true
};
```

`demo/src/scenarios/debounce.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const debounce: Scenario = {
  id: 'debounce',
  group: 'Flow control',
  title: 'Debounce',
  summary:
    'Each event restarts a debounced subscriber’s timer: it runs once the events pause for debounceTime, with the last one. The run comes after its publish has finished.',
  docs: 'https://github.com/jcfigueiredo/evem#debouncing-events',
  controls: {
    debounce: { kind: 'number', label: 'debounceTime (ms)', min: 50, max: 1000, step: 50, default: 300 },
    gap: { kind: 'number', label: 'time between events (ms)', min: 10, max: 600, step: 10, default: 100 }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const everyKey = () => {};',
    'const search = query => console.log(`searching for "${query.q}"`);',
    '',
    "evem.subscribe('search.typed', everyKey);",
    '// Each event restarts a {{debounce}} ms timer: search runs once typing pauses, with the last event',
    "evem.subscribe('search.typed', search, { debounceTime: {{debounce}} });",
    '',
    '// ▶ Type "events"',
    "const word = 'events';",
    'for (let i = 1; i <= word.length; i++) {',
    "  await evem.publish('search.typed', { q: word.slice(0, i) });",
    '  await sleep({{gap}});',
    '}'
  ].join('\n'),
  checks: [
    {
      action: 'type-events',
      calls: ['everyKey', 'everyKey', 'everyKey', 'everyKey', 'everyKey', 'everyKey', 'search'],
      logs: ['searching for "events"']
    },
    {
      values: { gap: 400 },
      action: 'type-events',
      calls: [
        'everyKey',
        'search',
        'everyKey',
        'search',
        'everyKey',
        'search',
        'everyKey',
        'search',
        'everyKey',
        'search',
        'everyKey',
        'search'
      ],
      logs: ['searching for "e"', 'searching for "events"']
    },
    {
      values: { debounce: 1000 },
      action: 'type-events',
      calls: ['everyKey', 'everyKey', 'everyKey', 'everyKey', 'everyKey', 'everyKey', 'search'],
      logs: ['searching for "events"']
    }
  ],
  lanes: true
};
```

`demo/src/scenarios/throttleDebounce.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const throttleDebounce: Scenario = {
  id: 'throttle-debounce',
  group: 'Flow control',
  title: 'Throttle + debounce',
  summary:
    'With both, an event runs at once when more than throttleTime has passed since the last immediate run; the others are debounced, so the last event still gets a run. Compare each option alone in the lanes.',
  docs: 'https://github.com/jcfigueiredo/evem#combining-throttle-and-debounce',
  controls: {
    throttle: { kind: 'number', label: 'throttleTime (ms)', min: 50, max: 1000, step: 50, default: 300 },
    debounce: { kind: 'number', label: 'debounceTime (ms)', min: 50, max: 1000, step: 50, default: 500 },
    gap: { kind: 'number', label: 'time between events (ms)', min: 10, max: 600, step: 10, default: 100 }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const everyKey = () => {};',
    'const throttled = () => {};',
    'const debounced = () => {};',
    'const suggest = typing => console.log(`suggestions for "${typing.q}"`);',
    '',
    "evem.subscribe('user.typing', everyKey);",
    "evem.subscribe('user.typing', throttled, { throttleTime: {{throttle}} });",
    "evem.subscribe('user.typing', debounced, { debounceTime: {{debounce}} });",
    '// Both: at once at the start of each throttle window, and once more with the last event when typing pauses',
    "evem.subscribe('user.typing', suggest, { throttleTime: {{throttle}}, debounceTime: {{debounce}} });",
    '',
    '// ▶ Type "hello world"',
    "const text = 'hello world';",
    'for (let i = 1; i <= text.length; i++) {',
    "  await evem.publish('user.typing', { q: text.slice(0, i) });",
    '  await sleep({{gap}});',
    '}'
  ].join('\n'),
  checks: [
    {
      action: 'type-hello-world',
      calls: [
        'everyKey',
        'throttled',
        'suggest',
        'everyKey',
        'everyKey',
        'everyKey',
        'throttled',
        'everyKey',
        'suggest',
        'everyKey',
        'everyKey',
        'throttled',
        'everyKey',
        'everyKey',
        'suggest',
        'everyKey',
        'throttled',
        'everyKey',
        'debounced',
        'suggest'
      ],
      logs: [
        'suggestions for "h"',
        'suggestions for "hello"',
        'suggestions for "hello wor"',
        'suggestions for "hello world"'
      ]
    },
    {
      values: { throttle: 1000 },
      action: 'type-hello-world',
      calls: [
        'everyKey',
        'throttled',
        'suggest',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'throttled',
        'debounced',
        'suggest'
      ],
      logs: ['suggestions for "h"', 'suggestions for "hello world"']
    }
  ],
  lanes: true
};
```

- [ ] **Step 4: Run the scenario test to verify it passes**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: PASS (94 tests: 80 before, and for Throttle 5, Debounce 5, Throttle + debounce 4).

- [ ] **Step 5: Format, type-check, build and commit**

```bash
pnpm format && pnpm typecheck && pnpm demo:build
git add demo/src/playground/laneChart.ts demo/src/playground/workbench.ts demo/src/scenarios
git commit -m "Demo: the Flow control scenarios, with a lane per subscriber over time

Throttle, Debounce and Throttle + debounce each burst events at a pace
the reader sets. An 'Over time' card draws the latest action: a lane of
publishes, then a lane per subscriber with its runs (filled) and the
calls throttle or debounce held back (hollow), so a plain, a throttled,
a debounced and a combined subscriber can be compared on one time axis.
Each scenario's checks pin the library's behavior under fake timers,
including the combined rule (at once only when more than throttleTime
has passed; the last event still runs once typing pauses).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

---

### Task 4: History & replay shows the last *matching* event

**Files:**
- Modify (replace): `demo/src/scenarios/historyReplay.ts`
- Test: its checks (`tests/site/scenarios.test.ts`)

**Interfaces:**
- None shared: the scenario publishes the notification after both logins, so the last event overall isn't a login and `replayLastEvent` on `user.login` visibly picks the last matching one.

- [ ] **Step 1: Change the checks first (failing test)**

In `demo/src/scenarios/historyReplay.ts`, replace `logs: ['history: ["user.login","notification","user.login"]']` with `logs: ['history: ["user.login","user.login","notification"]']`, and `values: { size: 1 },` with `values: { size: 2 },` (two events of history now hold the last login).

- [ ] **Step 2: Run the scenario test to verify it fails**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: FAIL — 1 of 94: `scenario history-replay > check 1` (the history is still in the old order).

- [ ] **Step 3: Publish the notification last**

Replace `demo/src/scenarios/historyReplay.ts` with:

```typescript
import type { Scenario } from '../engine/session';

export const historyReplay: Scenario = {
  id: 'history-replay',
  group: 'State & diagnostics',
  title: 'History & replay',
  summary:
    'With history on, EvEm keeps the last events. A late subscriber can replay the last matching one, or all of them, while it subscribes.',
  docs: 'https://github.com/jcfigueiredo/evem#using-event-history-and-replay',
  controls: { size: { kind: 'number', label: 'history size', min: 1, max: 10, default: 5 } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    '// Keep the last {{size}} events (the default is 50)',
    'evem.enableHistory({{size}});',
    '',
    '// ▶ Publish three events',
    "await evem.publish('user.login', { name: 'Ada' });",
    "await evem.publish('user.login', { name: 'Bo' });",
    "// The last event overall isn't a login: replayLastEvent still replays the last *matching* one",
    "await evem.publish('notification', { message: 'New feature!' });",
    "console.log('history:', evem.getEventHistory().map(record => record.event));",
    '',
    '// ▶ Subscribe late with replayLastEvent',
    'const latestLogin = user => console.log(`latest login: ${user.name}`);',
    "evem.subscribe('user.login', latestLogin, { replayLastEvent: true });",
    '',
    '// ▶ Subscribe late with replayHistory',
    'const everyLogin = user => console.log(`login: ${user.name}`);',
    "evem.subscribe('user.login', everyLogin, { replayHistory: true });",
    '',
    '// ▶ Clear the history',
    'evem.clearEventHistory();',
    "console.log('history:', evem.getEventHistory().length, 'events');"
  ].join('\n'),
  checks: [
    { action: 'publish-three-events', calls: [], logs: ['history: ["user.login","user.login","notification"]'] },
    {
      before: ['publish-three-events'],
      action: 'subscribe-late-with-replaylastevent',
      calls: ['latestLogin'],
      logs: ['latest login: Bo']
    },
    {
      before: ['publish-three-events'],
      action: 'subscribe-late-with-replayhistory',
      calls: ['everyLogin', 'everyLogin'],
      logs: ['login: Ada', 'login: Bo']
    },
    {
      values: { size: 2 },
      before: ['publish-three-events'],
      action: 'subscribe-late-with-replayhistory',
      calls: ['everyLogin'],
      logs: ['login: Bo']
    },
    { before: ['publish-three-events', 'clear-the-history'], action: 'subscribe-late-with-replayhistory', calls: [] }
  ]
};
```

- [ ] **Step 4: Run the scenario test to verify it passes**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: PASS (94 tests).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/scenarios/historyReplay.ts
git commit -m "Demo: History & replay shows replayLastEvent picking the last matching event

The notification is now published after both logins, so the last event
overall isn't a login, and a late user.login subscriber with
replayLastEvent visibly gets Bo, the last matching one. A follow-up
from 3a's review.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

---

### Task 5: Check the scenarios in Chrome, and the docs

**Files:**
- Modify: `CLAUDE.md`, `docs/demo-revamp-design.md`

- [ ] **Step 1: Start the dev server**

```bash
pnpm demo --host 127.0.0.1 --port 5199 --strictPort
```

(In the background; stop it later by the port: `kill $(lsof -t -nP -iTCP:5199 -sTCP:LISTEN)`.) Use Claude in Chrome in a tab of your own, with the window **visible**: check `document.visibilityState === 'visible'` first (resizing the window with `resize_window` brings it forward). A hidden window throttles timers to about one per second and pauses the timeline's animation frames, which would distort every timing below. A fresh dev server reloads the page once while it optimizes dependencies: run actions after that.

- [ ] **Step 2: Chrome: the Flow control scenarios at their defaults**

Click each scenario's action (from a script if a real click only scrolls the page), wait for its debounced calls, and look at the "Over time" card and the timeline. Expected:

- **Throttle**: `published` 5 dots about 100 ms apart; `everyScroll` 5 filled; `updateIndicator` filled at 0 and about 300 ms, hollow at the others. Summary: `published 5 times; everyScroll ran 5 times; updateIndicator ran 2 times, held back 3 times`.
- **Debounce**: `search` hollow at each of the 6 keys and one filled dot about 300 ms after the last; the timeline's last rows: `search ran later, with the data published at N ms` (N = the last publish row's time) and `searching for "events"`.
- **Throttle + debounce**: `throttled` filled at the start of each 300 ms window; `debounced` hollow at every key, filled once about 500 ms after the last; `suggest` filled at its immediate runs and once more at the end. The timeline agrees with the lanes (Review Focus 1).
- **Any scenario** (Priorities, say): each click adds a `▶ …` row before its rows.

- [ ] **Step 3: Chrome: the Review Focus and the follow-ups**

- Debounce: click the action, and click it again right after it finishes (before the debounced `search` runs). Expected: the chart starts at the second action; the first burst's late `search` appears where it happens, and in the timeline as a later row naming its publish; nothing is lost or doubled.
- Throttle: `events` 20 and `time between events` 600. Expected: the axis steps by 2000 ms, and every dot is inside its lane.
- Resize the window to its narrowest (about 513 px of page). Expected: the name column shrinks, long names truncate (tooltips show them), and `document.documentElement.scrollWidth <= innerWidth`. Restore the size.
- Edit Throttle's code to remove its subscribers and run it. Expected: the chart shows only the `published` lane. Remove its `// ▶` line too: the hint comes back.
- Wildcards: clear `event to publish` and publish. Expected: `publish`, then `rejected: Event name cannot be empty.` and the action's error, and no match or skip rows. Clear `your pattern` instead: only the error row, and no action buttons until the pattern is fixed.
- History & replay: `Publish three events`, then `Subscribe late with replayLastEvent`. Expected: `latest login: Bo`, though the last event was the notification.

- [ ] **Step 4: Stop the server and close the tab**

- [ ] **Step 5: Update the docs**

In `CLAUDE.md`:

- In the `### Demo Site` paragraph, replace "phases 2 (the foundation) and 3a (the core scenarios) are done" with "phases 2 (the foundation), 3a (the core scenarios) and 3b (flow control) are done".
- In the **Engine** bullet, replace "go to the trace while code runs With a scenario's" with "go to the trace while code runs, and so does what the library prints with `console.log` and `console.group` (indented by group). With a scenario's", and add at the end of the bullet: " Every run starts with an `action` entry (`▶ Label` in the timeline, and the lane chart's origin). A call outside any publish is a history replay (during `subscribe()`) or a later call (debounce), attributed to the publish whose data it got, else to the latest matching one, and shown as a top-level row naming that publish's time. Like EvEm, the trace refuses an empty event name before recording anything."
- In the **Scenarios** bullet, replace "optional `explainMatches`)" with "optional `explainMatches` and `lanes`)".
- In the **UI** bullet, replace "and the code panel, `editor.ts`, loaded lazily);" with "and the code panel, `editor.ts`, loaded lazily; with a scenario's `lanes`, `playground/laneChart.ts` draws the latest action over time from `lanes.ts`: a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back);".
- In the `tests/site/` line, replace "`wildcards` (`explainMatch` against EvEm's matching);" with "`wildcards` (`explainMatch` against EvEm's matching); `lanes` (the lane model and time axis);".

In `docs/demo-revamp-design.md`:

- The status line: replace "phases 1 (examples audit), 2 (foundation) and 3a (core scenarios) implemented; 3b, 3c, 4 and 5 not started." with "phases 1 (examples audit), 2 (foundation), 3a (core scenarios) and 3b (flow control) implemented; 3c, 4 and 5 not started."
- Under `## Follow-ups`, delete the eight rows whose phase is `3b` (they're done), leaving the table's header and the `3c`, `4` and `5` rows.

- [ ] **Step 6: Run everything CI runs, and commit**

```bash
pnpm check
git status --short
git add CLAUDE.md docs/demo-revamp-design.md
git commit -m "Docs: flow control, the lane chart, action rows and later calls; 3b's follow-ups done

CLAUDE.md describes the lane chart, action rows, how later calls are
attributed and shown, the trace refusing empty names, and the console
capture of log and group output that 3a missed (and fixes a run-on
sentence). The design marks 3b done and drops its follow-ups from the
list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

Expected: `pnpm check` passes (61 test files); `git status` shows nothing else changed.
