# Demo Core Scenarios Implementation Plan (Demo Revamp, Phase 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Twelve more playground scenarios, completing the Core, Data, Middleware, Control & errors and State & diagnostics groups, plus the engine and workbench upgrades they need: wildcard match explanations, once and replay rows in the right order, middleware data, text controls and code-valued selects, scenario checks with fake timers and richer expectations, and the minor issues phase 2's review deferred.

**Architecture:** Builds on phase 2's site (`demo/`). The engine (`demo/src/engine/`) gains `wildcards.ts` (`explainMatch`) and new trace entries (`match`, `unsubscribe` with `once`, `call` with `replayed`, middleware `data`); `session.ts` gains control kinds (`text`, `raw` selects), richer `ScenarioCheck`s and a fuller console; `workbench.ts` renders the new controls. Each scenario is a module in `demo/src/scenarios/` whose code is JavaScript (type-checked with `noImplicitAny` off) and whose `checks` run in Node with fake timers, so every scenario is a regression test of the behavior it shows.

**Tech Stack:** As phase 2 (Vite 8, Tailwind 4 + daisyUI 5, CodeMirror 6, Vitest 1.0, the TypeScript compiler API); no new dependencies.

**Spec:** `docs/demo-revamp-design.md` — "Phase 3: Playground" (the group table's first five rows), "Phase 2 → Scenario engine" and "Tracing", "Testing". Phase 2's plan (`docs/superpowers/plans/2026-10-02-demo-foundation.md`) describes the code this plan changes.

## Global Constraints

- No runtime dependencies, and no new dev dependencies. Development needs Node.js 20.19+ or 22.12+ (Vite 8); the package's `engines` (`>=20`) don't change.
- The site imports the library only as `@jcfigueiredo/evem` and its subpaths (aliased to `src/`); `src/` isn't touched.
- Colors only through daisyUI semantic tokens (plus `--code-*`); every text pair meets WCAG AA, faded text included (`tests/site/contrast.test.ts` reads every `text-base-content/NN` the site uses).
- Class names Tailwind must generate are written out in full in the source.
- DOM content from data goes through `el()`: strings become text nodes, never HTML.
- Scenario code is plain JavaScript: it runs with `AsyncFunction` and must also type-check as TypeScript with `noImplicitAny` off. No type annotations or generics in it.
- Code style: Prettier (`pnpm format`), single quotes, 120 columns, no trailing commas.
- Commit messages: subject, a body that explains why, and the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW`.
- New tests go in `tests/site/`.

## Rulings made while planning (for review)

Every file in this plan was written and run first: `pnpm check` passed on the result (60 test files, 1,241 tests, the package check), the scenarios were used in Chrome, and a dry run of the tasks in order confirmed each task's RED and GREEN results below and that the end state equals the validated files.

1. **Phase 3 ships in three parts.** The spec's phase 3 holds about 20 scenarios and three new subsystems; this plan (3a) covers the engine upgrades and the Core, Data, Middleware, Control & errors and State & diagnostics groups. **3b** is Flow control (throttle, debounce, both, with burst buttons and lane charts); **3c** is WebSocket, SSE and Recipes (the fake servers, the server pane, Python mode). Each gets its own plan and pull request; Task 8 records the split in the spec.
2. **Scenario code is JavaScript, type-checked with `noImplicitAny` off.** Strict TypeScript rejects `order => order.total > 100` (an implicit `any`), which would push every filter, validator and callback into hidden `helpers`. `typeCheck()` takes compiler option overrides; the scenario test turns `noImplicitAny` off, which still catches wrong method and option names. The code panel then shows the whole program. Functions passed inline where `subscribe` gives their parameter the type `unknown` (a transform or filter next to a callback without parameters) are written as named constants instead, which also names them in the timeline.
3. **"See what matches and why" (Wildcards) is a trace option.** A scenario with `explainMatches: true` makes the traced EvEm record, for each publish, one `match` row per subscription: EvEm's verdict and a reason from `explainMatch()` (`demo/src/engine/wildcards.ts`). A test pins every verdict to EvEm's own matching. Matches are explained against the published name (the Wildcards scenario has no middleware to reroute it).
4. **A once subscription is shown leaving after its call.** EvEm removes it just before calling it; the trace holds that unsubscribe until the call is recorded, then records it as "unsubscribed after its one run (once)". An unsubscribe that no call follows (an explicit `unsubscribeById`) is recorded on the next microtask, as a plain unsubscribe. This fixes phase 2's deferred minor ("unsubscribed" read before "ran").
5. **History replays read as replays.** The subscribe row is recorded before EvEm's `subscribe()` runs, and calls made while it replays history are `replayed` (top level, "ran (replayed from history)"), not "later" calls attributed to some earlier publish. A once subscription used up by a replay is never registered, so later publishes don't list it.
6. **Scenario checks run with fake timers** (phase 2's ruling 12), firing every timer a step starts, and gained `before` (actions run first), `rejects`, `logs` (in order) and `skipped` (`name: reason`). Subscribers may throw on purpose; the code, setup and actions may not (scenarios catch the rejections they show).
7. **Phase 2's deferred minors are fixed here**, where scenarios start to need them: stale action buttons after a compile error, number input validation (`numberInput`), `console.info` / `debug` (and the page's other console methods), middleware data in the timeline, the navigation race between two quick scenario switches, long unbroken log lines. Still deferred: checking narrow layouts below 513 px (needs device emulation).
8. **Code-valued selects (`raw: true`).** `ErrorPolicy.THROW` or a payload like `[50, 5000]` must be written into the code as code, not as a string literal; `renderCode` takes the set of raw controls.
9. **Logged objects:** one line up to 80 characters, indented JSON beyond (for `info()` and history records); the timeline wraps long text.
10. **Unnamed subscribers are numbered among themselves** (`subscriber 1`, `subscriber 2`), not by position, which could repeat a name after an unsubscribe.
11. **Still rows, not cards** (phase 2's ruling 11): these scenarios read well as indented rows; 3b decides with the debounce lanes, the first scenario where calls come later.

## Review Focus

1. **Text controls with empty or odd values** (an empty event, a pattern with spaces): the publish rejects (`Event name cannot be empty.`) or matches nothing, the timeline says so, and the scenario keeps working after a fix. Chrome, Task 8 step 3.
2. **Number inputs that are empty, not numbers, or out of range:** the field goes back to the previous value or the nearest limit, and the code never gets `NaN`. `numberInput` tests in Task 3; Chrome, Task 8 step 3.
3. **Real timers in the browser** (a slow callback that outlives its publish's timeout, an async filter, a delayed email): late rows land at the top level, after the publish they came from finished, and the buttons stay usable. Chrome, Task 8 step 3.
4. **A once subscription used up by a replay, or unsubscribed before it ever ran:** its leaving is said once, and later publishes don't list it as skipped. Tests in Task 2 (`records history replays…`, `records unsubscribing a once subscription that never ran…`).
5. **Scenario code the reader edits** (removing an action, a compile error, `console.table`): the buttons follow the code, nothing is left from the previous version, and other console methods work. Tests in Task 3 (`clears the action buttons when the code stops compiling`, `gives the code a console…`); Chrome, Task 8 step 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `demo/src/engine/wildcards.ts` (new) | `explainMatch(event, pattern)`: EvEm's wildcard verdict, with the reason in words |
| `demo/src/engine/trace.ts` | Trace entries: `match`; `once` on `unsubscribe`; `replayed` on `call`; `data` on `middleware` |
| `demo/src/engine/tracedEvEm.ts` | Match explanations (`explainMatches` option), once and replay ordering, middleware data, subscriber numbering |
| `demo/src/timeline.ts` | Words for the new entries; no data detail for a publish without data |
| `demo/src/engine/program.ts` | `renderCode` writes raw controls as code |
| `demo/src/engine/session.ts` | `text` controls and `raw` selects, `numberInput`, richer `ScenarioCheck`, `explainMatches`, a fuller console, cleared actions, indented long logs |
| `demo/src/playground/workbench.ts` | Text inputs with suggestions, validated number inputs, wrapping timeline text |
| `demo/src/playground/main.ts` | A navigation that finishes after a newer one is torn down |
| `demo/src/scenarios/*.ts`, `index.ts` | The twelve new scenarios, in the README's order |
| `tests/docs/typeCheck.ts` | Compiler option overrides |
| `tests/site/*.test.ts` | `wildcards` (new), `tracedEvEm`, `timeline`, `session`, `program`, `scenarios` (fake timers, new check fields, groups kept together) |
| `CLAUDE.md`, `docs/demo-revamp-design.md` | Scenario authoring, the new engine behavior and tests; the phase 3 split and 3a's status |

### Task 1: Wildcard explanations

**Files:**
- Create: `demo/src/engine/wildcards.ts`
- Test: `tests/site/wildcards.test.ts`

**Interfaces:**
- Produces: `interface MatchExplanation { matched: boolean; reason: string }`; `explainMatch(event: string, pattern: string): MatchExplanation` — `*` alone matches everything; a `*` at the end of a pattern with more than one segment matches one or more segments; any other `*` exactly one. Reasons: `* on its own matches every event`, `the same name`, `segment N is "x", not "y"`, `the event has N segments, the pattern M segments` (plus ` (a * that isn't at the end matches exactly one segment)` when the pattern has a `*`), `the event has N segment(s); a * at the end needs at least one more after "prefix"`, and for matches with stars, `* matched "x"` / `the * at the end matched "rest"`, joined with `, `.

- [ ] **Step 1: Write the failing test**

`tests/site/wildcards.test.ts` (every verdict must equal EvEm's own, through `matchesPattern`):

```typescript
import { describe, expect, it } from 'vitest';
import { EvEm } from '../../src/index';
import { matchesPattern } from '../../demo/src/engine/tracedEvEm';
import { explainMatch } from '../../demo/src/engine/wildcards';

const NOT_AT_THE_END = "(a * that isn't at the end matches exactly one segment)";

describe('explainMatch', () => {
  it.each([
    ['user.login', '*', '* on its own matches every event'],
    ['user.login', 'user.login', 'the same name'],
    ['user.logout', 'user.login', 'segment 2 is "logout", not "login"'],
    ['user', 'user.login', 'the event has 1 segment, the pattern 2 segments'],
    ['user.login', 'user.*', 'the * at the end matched "login"'],
    ['user.profile.updated', 'user.*', 'the * at the end matched "profile.updated"'],
    ['user', 'user.*', 'the event has 1 segment; a * at the end needs at least one more after "user"'],
    ['admin.login', 'user.*', 'segment 1 is "admin", not "user"'],
    ['user.created', '*.created', '* matched "user"'],
    ['admin.user.created', '*.created', `the event has 3 segments, the pattern 2 segments ${NOT_AT_THE_END}`],
    ['system.db.error', 'system.*.error', '* matched "db"'],
    ['system.error', 'system.*.error', `the event has 2 segments, the pattern 3 segments ${NOT_AT_THE_END}`],
    ['system.db.pool.error', 'system.*.error', `the event has 4 segments, the pattern 3 segments ${NOT_AT_THE_END}`],
    ['a.b.c', '*.b.*', '* matched "a", the * at the end matched "c"']
  ])('%s against %s: %s, with the verdict EvEm gives', (event, pattern, reason) => {
    expect(explainMatch(event, pattern)).toEqual({ matched: matchesPattern(new EvEm(), event, pattern), reason });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:nowatch tests/site/wildcards.test.ts`
Expected: FAIL — `Failed to load url ../../demo/src/engine/wildcards`.

- [ ] **Step 3: Write the implementation**

`demo/src/engine/wildcards.ts`:

```typescript
/** Whether a subscription pattern matches an event name, and why, in words */
export interface MatchExplanation {
  matched: boolean;
  reason: string;
}

const segments = (count: number) => `${count} segment${count === 1 ? '' : 's'}`;

/**
 * Explain EvEm's wildcard rules for one event and pattern: `*` alone matches everything, a `*` at the end matches
 * one or more segments, and any other `*` matches exactly one. A test pins the verdict to EvEm's own matching.
 */
export function explainMatch(event: string, pattern: string): MatchExplanation {
  if (pattern === '*') return { matched: true, reason: '* on its own matches every event' };
  const events = event.split('.');
  const patterns = pattern.split('.');
  const trailing = patterns.length > 1 && patterns[patterns.length - 1] === '*';
  const fixed = trailing ? patterns.slice(0, -1) : patterns;
  if (trailing && events.length <= fixed.length) {
    return {
      matched: false,
      reason: `the event has ${segments(events.length)}; a * at the end needs at least one more after "${fixed.join('.')}"`
    };
  }
  if (!trailing && events.length !== patterns.length) {
    const exactlyOne = pattern.includes('*') ? " (a * that isn't at the end matches exactly one segment)" : '';
    return {
      matched: false,
      reason: `the event has ${segments(events.length)}, the pattern ${segments(patterns.length)}${exactlyOne}`
    };
  }
  for (const [index, segment] of fixed.entries()) {
    if (segment !== '*' && segment !== events[index]) {
      return { matched: false, reason: `segment ${index + 1} is "${events[index]}", not "${segment}"` };
    }
  }
  const reasons = fixed.flatMap((segment, index) => (segment === '*' ? [`* matched "${events[index]}"`] : []));
  if (trailing) reasons.push(`the * at the end matched "${events.slice(fixed.length).join('.')}"`);
  return { matched: true, reason: reasons.length > 0 ? reasons.join(', ') : 'the same name' };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test:nowatch tests/site/wildcards.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/engine/wildcards.ts tests/site/wildcards.test.ts
git commit -m "Demo engine: explain why a wildcard pattern matches an event, or not

explainMatch() gives EvEm's wildcard verdict for an event and a pattern
with the reason in words (which segment differs, how many segments a *
can take), for the Wildcards scenario. A test pins every verdict to
EvEm's own isEventMatch, so the words can't disagree with the library.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

---

### Task 2: Trace and timeline upgrades

**Files:**
- Modify (replace): `demo/src/engine/trace.ts`, `demo/src/engine/tracedEvEm.ts`, `demo/src/timeline.ts`
- Test (replace): `tests/site/tracedEvEm.test.ts`, `tests/site/timeline.test.ts`

**Interfaces:**
- Consumes: `explainMatch` (Task 1).
- Produces:
  - `TraceEntry` additions: `{ kind: 'match'; subscription; pattern; event; matched: boolean; reason: string }`; `once?: boolean` on `unsubscribe`; `replayed?: boolean` on `call`; `data?: unknown` on `middleware` (the data it passed on, or the rerouted event's data)
  - `interface TraceOptions { explainMatches?: boolean }`; `createTracedEvEm(trace, names = new Map(), options: TraceOptions = {})` — with `explainMatches`, every publish records a `match` row per live subscription, right after the publish row
  - The subscribe row is recorded before EvEm's `subscribe()` runs; calls during it outside any publish are `replayed`; a once subscription's unsubscribe is recorded after its call (`once: true`), or on the next microtask if no call follows; a once subscription used up by a replay isn't registered; unnamed subscribers are `subscriber 1`, `subscriber 2`, …
  - Timeline words: `X unsubscribed after its one run (once)`, `X ran (replayed from history)`, `X: "pattern" matches "event"` / `doesn't match` with the reason as detail, middleware rows with the data as detail, and no detail for a publish without data

These files are phase 2's, with the changes above; the new test files contain phase 2's tests too (two of them updated: the naming test and the once test).

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

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:nowatch tests/site/tracedEvEm.test.ts tests/site/timeline.test.ts`
Expected: FAIL — 11 of 46: in `tracedEvEm.test.ts` the naming, once, replay, middleware data and match explanation tests (5); in `timeline.test.ts` the once, replayed and two match rows, `shows no data for a publish without any` and the middleware detail test (6).

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
  const nameOf = (fn: Function, fallback: string) => names.get(fn) ?? (fn.name || fallback);

  return class TracedEvEm extends EvEm {
    private readonly subscriptions = new Map<string, Subscription>();
    private readonly publishes = new Map<number, PublishState>();
    /** Recent publishes, newest last, to attribute calls that happen after their publish (debounce) */
    private readonly history: Array<{ id: number; event: string }> = [];
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

    /** The latest publish of an event that `pattern` matches */
    private latestFor(pattern: string): number | undefined {
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
      const name = names.get(callback) ?? (callback.name || `subscriber ${++this.anonymous}`);
      let id = '';
      const wrapped: EventCallback<T> = data => {
        const state = this.current();
        state?.called.add(id);
        // Outside any publish: a replay from history while subscribing, or a call that comes later (debounce)
        const replayed = !state && this.subscribing > 0;
        const publish = state?.id ?? (replayed ? undefined : this.latestFor(event));
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
      if (explainMatches) {
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
      this.history.push({ id, event });
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
        this.recordSkips(state, 'rejected');
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
  return entries.map(entry => {
    const depth = entry.publish === undefined ? 0 : (publishDepth.get(entry.publish) ?? 0) + 1;
    if (entry.kind === 'publish') publishDepth.set(entry.id, depth);
    return { ...describeEntry(entry), depth, at: entry.at };
  });
}

/** Rows as a screen reader hears them: one short sentence each */
export function announcement(rows: readonly TimelineRow[]): string {
  return rows.map(row => `${row.text}.`).join(' ');
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:nowatch tests/site/tracedEvEm.test.ts tests/site/timeline.test.ts`
Expected: PASS (46 tests: 27 and 19).

- [ ] **Step 5: Format, type-check, run the site tests and commit**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch tests/site
git add demo/src/engine/trace.ts demo/src/engine/tracedEvEm.ts demo/src/timeline.ts tests/site/tracedEvEm.test.ts tests/site/timeline.test.ts
git commit -m "Demo engine: match explanations, once and replay rows in order, middleware data

The traced EvEm can now record, for every publish, whether each
subscription's pattern matched and why (explainMatches, for the
Wildcards scenario). A once subscription reads 'ran', then 'unsubscribed
after its one run': EvEm removes it just before the call, so the trace
holds that row until the call is recorded. Calls made while subscribe()
replays history read 'replayed from history', after the subscribe row,
instead of 'later' calls of an earlier publish. Middleware rows show
the data they passed on, a publish without data shows none, and
unnamed subscribers are numbered among themselves.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

Expected: everything passes (site tests: 11 files).

---

### Task 3: Controls, checks and the session upgrades

**Files:**
- Modify (replace): `demo/src/engine/program.ts`, `demo/src/engine/session.ts`, `demo/src/playground/workbench.ts`, `demo/src/playground/main.ts`, `tests/docs/typeCheck.ts`
- Test (replace): `tests/site/session.test.ts`, `tests/site/program.test.ts`, `tests/site/scenarios.test.ts`

**Interfaces:**
- Consumes: `createTracedEvEm(trace, names, { explainMatches })` (Task 2).
- Produces:
  - `renderCode(template, values, raw: ReadonlySet<string> = new Set())` — raw controls' values are written as they are
  - `type Control` adds `raw?: boolean` to `select` and `{ kind: 'text'; label; default: string; suggestions?: readonly string[] }`
  - `interface ScenarioCheck` adds `before?: string[]`, `rejects?: string`, `logs?: string[]`, `skipped?: string[]` (`name: reason`); `interface Scenario` adds `explainMatches?: boolean`
  - `rawControls(scenario): Set<string>`; `numberInput(text, control: { min; max }, previous): number` (clamped, or `previous` for empty / non-numeric input)
  - `ScenarioSession`: actions cleared at every reset; the code's `console` logs `log` / `info` / `debug` / `warn` / `error` to the trace and keeps the page's other methods; logged values over 80 characters are indented JSON; `explainMatches` passed to the traced EvEm
  - `typeCheck(files, declarationFiles = [], overrides: ts.CompilerOptions = {})`
  - Workbench: text inputs (`change`: Enter or leaving the field) with a datalist of `suggestions`; number inputs through `numberInput`; timeline text that wraps (`break-words whitespace-pre-wrap`). `main.ts`: a workbench that finishes mounting after a newer navigation is torn down at once
  - The scenario test: variants include each text suggestion; type-checks with `{ noImplicitAny: false }`; checks run under fake timers (`settle()` fires every timer a step starts), with `before`, `rejects`, `logs` and `skipped`, and allow subscriber errors but not code, setup or action errors; the list's groups must each be contiguous

- [ ] **Step 1: Write the failing tests**

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

    expect(kinds(session)).toEqual(['subscribe', 'publish', 'call', 'result', 'log']);
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
    expect(session.trace.entries).toEqual([expect.objectContaining({ kind: 'log', text: 'new' })]);
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

  it('records an error thrown by an action', async () => {
    const session = new ScenarioSession({ ...scenario, code: '// ▶ Fail\nthrow new Error("no");' });
    await session.reset();
    await session.run('fail');
    expect(session.trace.entries).toEqual([expect.objectContaining({ kind: 'error', message: 'no' })]);
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

Replace `tests/site/program.test.ts` with:

```typescript
import { describe, expect, it } from 'vitest';
import { compileProgram, renderCode, slug, splitActions, toLiteral } from '../../demo/src/engine/program';

describe('toLiteral', () => {
  it('writes strings in single quotes, escaped, and numbers and booleans as they are', () => {
    expect(toLiteral('high')).toBe("'high'");
    expect(toLiteral("it's a \\ path")).toBe("'it\\'s a \\\\ path'");
    expect(toLiteral(-10)).toBe('-10');
    expect(toLiteral(true)).toBe('true');
  });
});

describe('renderCode', () => {
  it('replaces each {{name}} with that control value as a literal', () => {
    expect(
      renderCode("subscribe('a', f, { priority: {{priority}}, once: {{once}} })", { priority: 'high', once: false })
    ).toBe("subscribe('a', f, { priority: 'high', once: false })");
  });

  it('writes the values of raw controls as they are: they are code', () => {
    expect(
      renderCode(
        'publish(e, d, { errorPolicy: {{policy}} }); log({{name}})',
        { policy: 'ErrorPolicy.THROW', name: 'ada' },
        new Set(['policy'])
      )
    ).toBe("publish(e, d, { errorPolicy: ErrorPolicy.THROW }); log('ada')");
  });

  it('throws for a placeholder that has no control', () => {
    expect(() => renderCode('{{missing}}', {})).toThrow('No control named missing for {{missing}}');
  });
});

describe('slug', () => {
  it('makes lowercase words joined by dashes', () => {
    expect(slug('Publish order.created!')).toBe('publish-order-created');
  });
});

describe('splitActions', () => {
  it('splits the setup from the action blocks that start at // ▶ lines', () => {
    const code = ['const a = 1;', '// ▶ First thing', 'one();', '// ▶ Second thing', 'two();', 'three();'].join('\n');
    expect(splitActions(code)).toEqual({
      setup: 'const a = 1;',
      actions: [
        { id: 'first-thing', label: 'First thing', code: 'one();' },
        { id: 'second-thing', label: 'Second thing', code: 'two();\nthree();' }
      ]
    });
  });
});

describe('compileProgram', () => {
  it('resolves package imports and returns the actions as functions that share the setup', async () => {
    const code = [
      "import { EvEm as Emitter, type EventRecord } from '@jcfigueiredo/evem';",
      'let count = 0;',
      'const name = Emitter.name;',
      '// ▶ Count',
      'count++;',
      'return `${name} ${count}`;'
    ].join('\n');
    const { body, actions } = compileProgram(code);
    expect(actions).toEqual([{ id: 'count', label: 'Count' }]);

    const run = new Function('__modules', `return (async () => {\n${body}\n})();`);
    const program = await run({ '@jcfigueiredo/evem': { EvEm: class Real {} } });
    expect(await program.count()).toBe('Real 1');
    expect(await program.count()).toBe('Real 2');
  });

  it('lists the names the code imports from each entry point, so they can be checked', () => {
    const code = [
      "import { EvEm as Emitter, type EventRecord, toServerEventName } from '@jcfigueiredo/evem';",
      "import { SseHandler } from '@jcfigueiredo/evem/sse';"
    ].join('\n');
    expect(compileProgram(code).imports).toEqual([
      { entryPoint: '@jcfigueiredo/evem', names: ['EvEm', 'toServerEventName'] },
      { entryPoint: '@jcfigueiredo/evem/sse', names: ['SseHandler'] }
    ]);
  });

  it('reports any other import', () => {
    expect(() => compileProgram("import WebSocket from 'ws';")).toThrow(
      'Only imports from @jcfigueiredo/evem are supported here'
    );
  });
});
```

Replace `tests/site/scenarios.test.ts` with:

```typescript
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { renderCode } from '../../demo/src/engine/program';
import { defaultValues, rawControls, ScenarioSession, type Scenario } from '../../demo/src/engine/session';
import { scenarioPath } from '../../demo/src/routing';
import { scenarios } from '../../demo/src/scenarios';
import { typeCheck } from '../docs/typeCheck';

const scratch = mkdtempSync(join(tmpdir(), 'evem-scenarios-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
afterEach(() => {
  vi.useRealTimers();
});

/** The scenario's code with every value of every control, one control at a time (the others at their defaults) */
function variants(scenario: Scenario): string[] {
  const defaults = defaultValues(scenario);
  const raw = rawControls(scenario);
  const codes = [renderCode(scenario.code, defaults, raw)];
  for (const [name, control] of Object.entries(scenario.controls)) {
    const values =
      control.kind === 'select'
        ? control.options
        : control.kind === 'toggle'
          ? [true, false]
          : control.kind === 'number'
            ? [control.min, control.max]
            : (control.suggestions ?? []);
    for (const value of values) codes.push(renderCode(scenario.code, { ...defaults, [name]: value }, raw));
  }
  return codes;
}

/** Finish a session step under fake timers, firing every timer it starts (delays, timeouts, slow callbacks) */
async function settle(step: Promise<void>): Promise<void> {
  let done = false;
  void step.finally(() => (done = true));
  for (let turn = 0; !done && turn < 100; turn++) await vi.runAllTimersAsync();
  await step;
}

describe('the scenario list', () => {
  it('has unique ids and addresses', () => {
    expect(new Set(scenarios.map(scenario => scenario.id)).size).toBe(scenarios.length);
    expect(new Set(scenarios.map(scenarioPath)).size).toBe(scenarios.length);
  });

  it('keeps each group together, so the sidebar shows it once', () => {
    const groups = scenarios.map(scenario => scenario.group);
    const runs = groups.filter((group, index) => group !== groups[index - 1]);
    expect(runs).toEqual([...new Set(groups)]);
  });
});

describe.each(scenarios.map(scenario => [scenario.id, scenario] as const))('scenario %s', (_id, scenario) => {
  it('has select defaults among their options, and checks only for actions it has', async () => {
    for (const control of Object.values(scenario.controls)) {
      if (control.kind === 'select') expect(control.options).toContain(control.default);
    }
    const session = new ScenarioSession(scenario);
    await session.reset();
    const actions = session.actions.map(action => action.id);
    expect(scenario.checks.length).toBeGreaterThan(0);
    for (const check of scenario.checks) {
      for (const action of [...(check.before ?? []), check.action]) expect(actions).toContain(action);
    }
  });

  it('type-checks against the package API with every control value', () => {
    const prelude = join(scratch, `${scenario.id}.d.ts`);
    const helpers = Object.keys(scenario.helpers).map(name => `  const ${name}: (...args: any[]) => any;`);
    writeFileSync(prelude, `declare global {\n${helpers.join('\n')}\n}\nexport {};\n`);
    const files = variants(scenario).map((code, index) => ({ path: `__scenarios__/${scenario.id}_${index}.ts`, code }));
    // Scenario code is JavaScript: its own functions' parameters have no types
    const problems = typeCheck(files, [prelude], { noImplicitAny: false }).map(
      d => `${d.path}:${d.line}: TS${d.code} ${d.message}`
    );
    expect(problems).toEqual([]);
  }, 60_000);

  it.each(scenario.checks.map((check, index) => [index + 1, check] as const))(
    'check %i: the action does what the scenario says',
    async (_index, check) => {
      vi.useFakeTimers();
      const session = new ScenarioSession(scenario);
      Object.assign(session.values, check.values ?? {});
      await settle(session.restoreTemplate());
      for (const action of check.before ?? []) await settle(session.run(action));
      const before = session.trace.entries.length;

      await settle(session.run(check.action));

      const entries = session.trace.entries.slice(before);
      // Subscribers may throw on purpose; the code itself, the setup and the actions must not
      expect(entries.filter(entry => entry.kind === 'error' && !entry.subscription)).toEqual([]);
      expect(entries.flatMap(entry => (entry.kind === 'call' ? [entry.subscription] : []))).toEqual(check.calls);
      if (check.result !== undefined) {
        expect(entries.filter(entry => entry.kind === 'result').at(-1)).toMatchObject({ result: check.result });
      }
      if (check.rejects !== undefined) {
        expect(entries.filter(entry => entry.kind === 'rejected').at(-1)).toMatchObject({
          error: expect.stringContaining(check.rejects)
        });
      }
      if (check.skipped !== undefined) {
        expect(
          entries.flatMap(entry => (entry.kind === 'skip' ? [`${entry.subscription}: ${entry.reason}`] : []))
        ).toEqual(check.skipped);
      }
      const logs = entries.flatMap(entry => (entry.kind === 'log' ? [entry.text] : []));
      let from = 0;
      for (const expected of check.logs ?? []) {
        const index = logs.findIndex((text, position) => position >= from && text.includes(expected));
        expect(index, `a log containing ${JSON.stringify(expected)}, in order, in ${JSON.stringify(logs)}`).not.toBe(
          -1
        );
        from = index + 1;
      }
    }
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:nowatch tests/site/session.test.ts tests/site/program.test.ts tests/site/scenarios.test.ts`
Expected: FAIL — 8 of 32: in `session.test.ts` the raw/text, cleared actions, console, log formatting and both `numberInput` tests (6); in `program.test.ts` the raw controls test (1); in `scenarios.test.ts` Priorities' type check (`rawControls` doesn't exist yet) (1).

- [ ] **Step 3: Write the implementation**

Replace `demo/src/engine/program.ts` with:

```typescript
/** A value a scenario control can have */
export type ControlValue = string | number | boolean;

/** An action block of a scenario's code: the lines after a `// ▶ Label` comment, up to the next one */
export interface Action {
  id: string;
  label: string;
}

const ACTION_MARKER = /^\/\/ ▶ (.+)$/;
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** A control value as a JavaScript literal: strings in single quotes, numbers and booleans as they are */
export function toLiteral(value: ControlValue): string {
  return typeof value === 'string' ? `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(value);
}

/** A scenario's code with each `{{name}}` replaced by that control's value as a literal */
export function renderCode(
  template: string,
  values: Record<string, ControlValue>,
  raw: ReadonlySet<string> = new Set()
): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    if (!(name in values)) {
      throw new Error(`No control named ${name} for ${placeholder}`);
    }
    // A raw control's values are code (`ErrorPolicy.THROW`, `[1, 2]`), written as they are
    return raw.has(name) ? String(values[name]) : toLiteral(values[name]!);
  });
}

/** Lowercase words joined by dashes: 'Publish order.created' → 'publish-order-created' */
export function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The setup code (before the first marker) and the action blocks of a scenario's code */
export function splitActions(code: string): { setup: string; actions: Array<Action & { code: string }> } {
  const lines = code.split('\n');
  const setup: string[] = [];
  const actions: Array<Action & { code: string[] }> = [];
  for (const line of lines) {
    const marker = ACTION_MARKER.exec(line.trim());
    if (marker) {
      const label = marker[1]!.trim();
      actions.push({ id: slug(label), label, code: [] });
    } else if (actions.length > 0) {
      actions[actions.length - 1]!.code.push(line);
    } else {
      setup.push(line);
    }
  }
  return { setup: setup.join('\n'), actions: actions.map(action => ({ ...action, code: action.code.join('\n') })) };
}

/** An entry point of the package that the code imports, and the exported names it imports from it */
export interface PackageImport {
  entryPoint: string;
  names: string[];
}

const PACKAGE_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*['"](@jcfigueiredo\/evem(?:\/[\w/]+)?)['"];?[ \t]*$/gm;

/**
 * The body of an async function that runs a scenario's setup and returns its actions as functions, so the
 * actions share the setup's variables. Imports from the package become lookups in `__modules`; any other
 * import or export is reported as an error.
 */
export function compileProgram(code: string): { body: string; actions: Action[]; imports: PackageImport[] } {
  const { setup, actions } = splitActions(code);
  const imports: PackageImport[] = [];
  const resolvedSetup = setup.replace(PACKAGE_IMPORT, (_, names: string, entryPoint: string) => {
    const specifiers = names
      .split(',')
      .map(name => name.trim())
      .filter(name => name !== '' && !name.startsWith('type '));
    imports.push({ entryPoint, names: specifiers.map(specifier => specifier.split(/\s+as\s+/)[0]!) });
    const bindings = specifiers.map(specifier => specifier.replace(/\s+as\s+/, ': '));
    return `const { ${bindings.join(', ')} } = __modules[${JSON.stringify(entryPoint)}];`;
  });
  const unsupported = /^\s*(?:import|export)\b.*$/m.exec(
    [resolvedSetup, ...actions.map(action => action.code)].join('\n')
  );
  if (unsupported) {
    throw new Error(`Only imports from @jcfigueiredo/evem are supported here (found: ${unsupported[0].trim()})`);
  }
  const actionFunctions = actions
    .map(action => `  ${JSON.stringify(action.id)}: async () => {\n${action.code}\n  }`)
    .join(',\n');
  return {
    body: `${resolvedSetup}\nreturn {\n${actionFunctions}\n};`,
    actions: actions.map(({ id, label }) => ({ id, label })),
    imports
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
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...parameters: string[]
) => (...args: unknown[]) => Promise<unknown>;

/** The page's own console methods, which every run that replaces them puts back */
const pageConsole = { warn: console.warn, error: console.error };

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

  /** Run `work`, recording what EvEm itself logs meanwhile (e.g. "Error in event handler …") in `trace` */
  private async capturingLogs<V>(trace: Trace, work: () => Promise<V>): Promise<V> {
    const record =
      (level: 'warn' | 'error') =>
      (...args: unknown[]) =>
        trace.record({ kind: 'log', level, text: args.map(formatArgument).join(' ') });
    const capture = { warn: record('warn'), error: record('error') };
    console.warn = capture.warn;
    console.error = capture.error;
    try {
      return await work();
    } finally {
      // Undo only this capture, back to the page's console: a newer run that replaced it undoes its own, so a run
      // that never finishes (or finishes late) can't keep the console
      if (console.warn === capture.warn) console.warn = pageConsole.warn;
      if (console.error === capture.error) console.error = pageConsole.error;
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

Replace `tests/docs/typeCheck.ts` with:

```typescript
import { join, relative } from 'node:path';
import ts from 'typescript';
import { REPO_ROOT } from './codeBlocks';

/** The published entry points, mapped to their sources */
const PACKAGE_PATHS: Record<string, string[]> = {
  '@jcfigueiredo/evem': ['src/index.ts'],
  '@jcfigueiredo/evem/websocket': ['src/websocket/index.ts'],
  '@jcfigueiredo/evem/sse': ['src/sse/index.ts'],
  '@jcfigueiredo/evem/sse/server': ['src/sse/server.ts']
};

export interface VirtualFile {
  /** Path relative to the repository root (it doesn't exist on disk); `.ts` or `.tsx` */
  path: string;
  code: string;
}

export interface TypeDiagnostic {
  /** The virtual file's path, as given */
  path: string;
  /** 1-based line within the virtual file (0 if the diagnostic has no position) */
  line: number;
  /** TypeScript error code, e.g. 2345 */
  code: number;
  message: string;
}

/** The repository's compiler options, with the package names mapped to src/ and JSX kept as is */
function compilerOptions(): ts.CompilerOptions {
  const configPath = join(REPO_ROOT, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, REPO_ROOT);
  return {
    ...options,
    // tsconfig.json skips checking every .d.ts file; the preludes must be checked, or a broken one could hide errors
    skipLibCheck: false,
    noEmit: true,
    incremental: false,
    jsx: ts.JsxEmit.Preserve,
    paths: { ...options.paths, ...PACKAGE_PATHS }
  };
}

/**
 * Type-check in-memory files against the library's sources, with the repository's compiler options.
 * `declarationFiles` (absolute paths) are added to the program, e.g. preludes that declare globals, and `overrides`
 * change compiler options (the demo's scenarios turn off `noImplicitAny`: their code is JavaScript).
 * Returns the syntactic and semantic diagnostics of the in-memory files and of the declaration files.
 */
export function typeCheck(
  files: VirtualFile[],
  declarationFiles: string[] = [],
  overrides: ts.CompilerOptions = {}
): TypeDiagnostic[] {
  const options = { ...compilerOptions(), ...overrides };
  const virtual = new Map(files.map(file => [join(REPO_ROOT, file.path), file]));

  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const file = virtual.get(fileName);
    return file
      ? ts.createSourceFile(fileName, file.code, languageVersion, true)
      : getSourceFile.call(host, fileName, languageVersion, ...rest);
  };
  host.fileExists = fileName => virtual.has(fileName) || fileExists.call(host, fileName);
  host.readFile = fileName => virtual.get(fileName)?.code ?? readFile.call(host, fileName);

  const checked = [...virtual.keys(), ...declarationFiles];
  const program = ts.createProgram(checked, options, host);
  return checked.flatMap(fileName => {
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) {
      throw new Error(`${fileName} wasn't added to the program`);
    }
    return [...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)].map(
      diagnostic => ({
        path: virtual.get(fileName)?.path ?? relative(REPO_ROOT, fileName),
        line:
          diagnostic.file && diagnostic.start !== undefined
            ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
            : 0,
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
      })
    );
  });
}
```

Replace `demo/src/playground/workbench.ts` with:

```typescript
import type { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import type { ControlValue } from '../engine/program';
import { numberInput, ScenarioSession, type Control, type Scenario } from '../engine/session';
import { announcement, timelineRows, type Tone } from '../timeline';

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

Replace `demo/src/playground/main.ts` with:

```typescript
import '../styles.css';
import { EvEm } from '@jcfigueiredo/evem';
import { scenarioForHash } from '../routing';
import { scenarios } from '../scenarios';
import { mountThemePicker } from '../theme';
import { renderMenu } from './menu';
import { mountWorkbench } from './workbench';

// The playground's own events (navigation, theme, trace entries) go through EvEm too
const bus = new EvEm();
const menu = document.getElementById('scenario-menu')!;
const workbench = document.getElementById('workbench')!;
const sidebarToggle = document.getElementById('sidebar') as HTMLInputElement;
let teardown: (() => void) | undefined;
// Counts navigations: a workbench that finishes mounting after a newer navigation is torn down at once
let navigation = 0;

bus.subscribe<string>('playground.navigate', async hash => {
  const current = ++navigation;
  const scenario = scenarioForHash(hash, scenarios);
  renderMenu(menu, scenarios, scenario);
  document.title = `${scenario.title} · EvEm Playground`;
  sidebarToggle.checked = false;
  teardown?.();
  teardown = undefined;
  const mounted = await mountWorkbench(workbench, scenario, bus);
  if (current === navigation) teardown = mounted;
  else mounted();
});

window.addEventListener('hashchange', () => void bus.publish('playground.navigate', location.hash));
// Choosing a scenario closes the drawer, the current one too (its link doesn't change the hash, so no navigate)
menu.addEventListener('click', event => {
  if ((event.target as Element).closest('a')) sidebarToggle.checked = false;
});
mountThemePicker(document.getElementById('theme-picker')!, bus);
void bus.publish('playground.navigate', location.hash);
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:nowatch tests/site/session.test.ts tests/site/program.test.ts tests/site/scenarios.test.ts`
Expected: PASS (32 tests: 16, 9 and 7).

- [ ] **Step 5: Format, type-check, run everything and commit**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch
git add demo/src/engine/program.ts demo/src/engine/session.ts demo/src/playground/workbench.ts demo/src/playground/main.ts tests/docs/typeCheck.ts tests/site/session.test.ts tests/site/program.test.ts tests/site/scenarios.test.ts
git commit -m "Demo: text controls, code-valued selects, and scenario checks with fake timers

Scenarios can now offer a text field (with suggestions) and selects
whose options are code (ErrorPolicy.THROW, [50, 5000]). Their code is
type-checked as JavaScript (noImplicitAny off, through a new typeCheck()
override), so filters, validators and callbacks can be written in the
code panel instead of hidden helpers. Checks run with fake timers and
can run actions first and expect a rejection, logs and skip reasons.

Fixes deferred from phase 2: action buttons from a previous version of
the code are cleared, number inputs ignore empty or invalid input and
stay within their range, the code's console keeps info, debug and the
page's other methods, long logged values are indented, timeline text
wraps, and a navigation that finishes after a newer one is torn down.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

Expected: the whole suite passes.

---

### Task 4: Core scenarios — Publish & subscribe, Wildcards, Filters, Once

**Files:**
- Create: `demo/src/scenarios/publishSubscribe.ts`, `demo/src/scenarios/wildcards.ts`, `demo/src/scenarios/filters.ts`, `demo/src/scenarios/once.ts`
- Modify (replace): `demo/src/scenarios/index.ts`
- Test: `tests/site/scenarios.test.ts` (generic; Task 3)

**Interfaces:**
- Consumes: `Scenario`, the control kinds and check fields (Task 3); `explainMatches` (Tasks 2 and 3).
- Produces: `publishSubscribe`, `wildcards`, `filters`, `once`; the list in the README's order so far (Core: Publish & subscribe, Wildcards, Priorities, Filters, Once).

The scenarios' code is shown in the code panel exactly as written (with the controls' values in place of `{{name}}`); keep it readable as a user's code. `// ▶ Label` lines start action blocks; an action's id is its label in lowercase words joined by dashes (`Unsubscribe sendEmail by id` → `unsubscribe-sendemail-by-id`).

- [ ] **Step 1: List the scenarios (failing test)**

Replace `demo/src/scenarios/index.ts` with:

```typescript
import type { Scenario } from '../engine/session';
import { filters } from './filters';
import { once } from './once';
import { priorities } from './priorities';
import { publishSubscribe } from './publishSubscribe';
import { wildcards } from './wildcards';

/** Every scenario, in sidebar order: the groups follow the README */
export const scenarios: readonly Scenario[] = [
  publishSubscribe,
  wildcards,
  priorities,
  filters,
  once
];
```

- [ ] **Step 2: Run the scenario test to verify it fails**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: FAIL — `Failed to load url ./filters` (or another of the new modules).

- [ ] **Step 3: Write the scenarios**

`demo/src/scenarios/publishSubscribe.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const publishSubscribe: Scenario = {
  id: 'publish-subscribe',
  group: 'Core',
  title: 'Publish & subscribe',
  summary:
    'Subscribers run in order for each publish, and publish waits for async ones. Unsubscribe with the callback, or with the id subscribe() returned.',
  docs: 'https://github.com/jcfigueiredo/evem#quick-start',
  controls: { delay: { kind: 'number', label: 'email delay (ms)', min: 0, max: 2000, step: 100, default: 300 } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const welcome = user => console.log(`Welcome, ${user.name}!`);',
    '// An async callback: publish waits for it before running the next subscriber',
    'const sendEmail = async user => {',
    '  await sleep({{delay}});',
    '  console.log(`Email sent to ${user.name}`);',
    '};',
    "const afterEmail = () => console.log('This runs after the email is sent');",
    '',
    "evem.subscribe('user.registered', welcome);",
    "const emailId = evem.subscribe('user.registered', sendEmail);",
    "evem.subscribe('user.registered', afterEmail);",
    '',
    '// ▶ Publish user.registered',
    "await evem.publish('user.registered', { name: 'Ada' });",
    '',
    '// ▶ Unsubscribe welcome by callback',
    "evem.unsubscribe('user.registered', welcome);",
    '',
    '// ▶ Unsubscribe sendEmail by id',
    'evem.unsubscribeById(emailId);'
  ].join('\n'),
  checks: [
    {
      action: 'publish-user-registered',
      calls: ['welcome', 'sendEmail', 'afterEmail'],
      result: true,
      logs: ['Welcome, Ada!', 'Email sent to Ada', 'This runs after the email is sent']
    },
    {
      before: ['unsubscribe-welcome-by-callback'],
      action: 'publish-user-registered',
      calls: ['sendEmail', 'afterEmail']
    },
    { before: ['unsubscribe-sendemail-by-id'], action: 'publish-user-registered', calls: ['welcome', 'afterEmail'] }
  ]
};
```

`demo/src/scenarios/wildcards.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const wildcards: Scenario = {
  id: 'wildcards',
  group: 'Core',
  title: 'Wildcards',
  summary:
    'Event names are split on dots. * alone matches every event, a * at the end matches one or more segments, and any other * exactly one. Type a pattern and an event to see what matches, and why.',
  docs: 'https://github.com/jcfigueiredo/evem#using-wildcards-in-event-subscription',
  controls: {
    pattern: {
      kind: 'text',
      label: 'your pattern',
      default: 'user.*',
      suggestions: ['*', 'user.*', '*.created', 'system.*.error', 'user.login']
    },
    event: {
      kind: 'text',
      label: 'event to publish',
      default: 'user.login',
      suggestions: [
        'user.login',
        'user',
        'user.profile.updated',
        'admin.user.created',
        'system.db.error',
        'system.error'
      ]
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const yours = () => {};',
    'const everything = () => {};',
    '',
    'evem.subscribe({{pattern}}, yours);',
    "evem.subscribe('*', everything);",
    '',
    '// ▶ Publish',
    'await evem.publish({{event}});'
  ].join('\n'),
  checks: [
    { action: 'publish', calls: ['yours', 'everything'], result: true },
    { values: { event: 'user' }, action: 'publish', calls: ['everything'] },
    { values: { event: 'user.profile.updated' }, action: 'publish', calls: ['yours', 'everything'] },
    {
      values: { pattern: 'system.*.error', event: 'system.db.error' },
      action: 'publish',
      calls: ['yours', 'everything']
    },
    { values: { pattern: '*.created', event: 'admin.user.created' }, action: 'publish', calls: ['everything'] }
  ],
  explainMatches: true
};
```

`demo/src/scenarios/filters.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const filters: Scenario = {
  id: 'filters',
  group: 'Core',
  title: 'Filters',
  summary:
    'A filter decides, from the data, whether a subscriber runs. Filters can be async, and several in an array must all pass, in order.',
  docs: 'https://github.com/jcfigueiredo/evem#filtering-events',
  controls: {
    total: { kind: 'number', label: 'order total', min: 0, max: 1000, step: 10, default: 250 },
    vip: { kind: 'toggle', label: 'VIP customer', default: false },
    test: { kind: 'toggle', label: 'test order', default: false }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const isBig = order => order.total > 100;',
    '// An async filter: publish waits for its answer',
    'const isVip = async order => {',
    '  await sleep(100);',
    '  return order.vip;',
    '};',
    'const isReal = order => !order.test;',
    '',
    'const bigOrders = order => console.log(`Big order: ${order.total}`);',
    "const vipOrders = () => console.log('VIP order');",
    "const realBigOrders = () => console.log('A real big order');",
    '',
    "evem.subscribe('order.created', bigOrders, { filter: isBig });",
    "evem.subscribe('order.created', vipOrders, { filter: isVip });",
    '// Several filters run in order, stop at the first that says no, and must all pass',
    "evem.subscribe('order.created', realBigOrders, { filter: [isReal, isBig] });",
    '',
    '// ▶ Publish order.created',
    "await evem.publish('order.created', { id: 7, total: {{total}}, vip: {{vip}}, test: {{test}} });"
  ].join('\n'),
  checks: [
    { action: 'publish-order-created', calls: ['bigOrders', 'realBigOrders'], skipped: ['vipOrders: filtered'] },
    {
      values: { total: 50 },
      action: 'publish-order-created',
      calls: [],
      skipped: ['bigOrders: filtered', 'vipOrders: filtered', 'realBigOrders: filtered']
    },
    {
      values: { vip: true, test: true },
      action: 'publish-order-created',
      calls: ['bigOrders', 'vipOrders'],
      skipped: ['realBigOrders: filtered']
    }
  ]
};
```

`demo/src/scenarios/once.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const once: Scenario = {
  id: 'once',
  group: 'Core',
  title: 'Once',
  summary:
    'A once subscription runs a single time, then unsubscribes. Only an event that gets through its filter uses it up.',
  docs: 'https://github.com/jcfigueiredo/evem#using-once-only-events',
  controls: { bigOver: { kind: 'number', label: 'a big order is over', min: 0, max: 1000, step: 10, default: 100 } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const welcome = user => console.log(`Welcome, ${user.name}: this shows once`);',
    'const firstBigOrder = order => console.log(`The first big order: ${order.total}`);',
    '',
    "evem.subscribeOnce('user.login', welcome);",
    '// Only an event that gets through the filter uses up a once subscription',
    "evem.subscribe('order.created', firstBigOrder, { once: true, filter: order => order.total > {{bigOver}} });",
    '',
    '// ▶ Log in',
    "await evem.publish('user.login', { name: 'Ada' });",
    '',
    '// ▶ Small order',
    "await evem.publish('order.created', { total: 20 });",
    '',
    '// ▶ Big order',
    "await evem.publish('order.created', { total: 500 });"
  ].join('\n'),
  checks: [
    { action: 'log-in', calls: ['welcome'], logs: ['Welcome, Ada: this shows once'] },
    { before: ['log-in'], action: 'log-in', calls: [], skipped: [] },
    { action: 'small-order', calls: [], skipped: ['firstBigOrder: filtered'] },
    { before: ['small-order'], action: 'big-order', calls: ['firstBigOrder'] },
    { before: ['big-order'], action: 'big-order', calls: [], skipped: [] }
  ]
};
```

- [ ] **Step 4: Run the scenario test to verify it passes**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: PASS (31 tests: the list's 2, Priorities' 5, and for each new scenario its two generic tests and its checks: Publish & subscribe 5, Wildcards 7, Filters 5, Once 7).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/scenarios
git commit -m "Demo: the Core scenarios — publish & subscribe, wildcards, filters, once

Publish & subscribe shows sync and async callbacks (publish waits for
the async one) and unsubscribing by callback or by id. Wildcards takes a
pattern and an event and explains, for each subscription, whether it
matched and why. Filters shows a sync, an async and an array of
filters, with the reason each subscriber was skipped. Once shows
subscribeOnce, and that only an event getting through the filter uses
a once subscription up.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

---

### Task 5: Data and Middleware scenarios — Transforms, Schema validation, Middleware

**Files:**
- Create: `demo/src/scenarios/transforms.ts`, `demo/src/scenarios/schemaValidation.ts`, `demo/src/scenarios/middleware.ts`
- Modify (replace): `demo/src/scenarios/index.ts`
- Test: `tests/site/scenarios.test.ts` (generic)

**Interfaces:**
- Consumes: as Task 4; `raw` selects (Schema validation's `schemaErrorPolicy`).
- Produces: `transforms`, `schemaValidation`, `middleware`, listed after Once.

- [ ] **Step 1: List the scenarios (failing test)**

Replace `demo/src/scenarios/index.ts` with:

```typescript
import type { Scenario } from '../engine/session';
import { filters } from './filters';
import { middleware } from './middleware';
import { once } from './once';
import { priorities } from './priorities';
import { publishSubscribe } from './publishSubscribe';
import { schemaValidation } from './schemaValidation';
import { transforms } from './transforms';
import { wildcards } from './wildcards';

/** Every scenario, in sidebar order: the groups follow the README */
export const scenarios: readonly Scenario[] = [
  publishSubscribe,
  wildcards,
  priorities,
  filters,
  once,
  transforms,
  schemaValidation,
  middleware
];
```

- [ ] **Step 2: Run the scenario test to verify it fails**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: FAIL — `Failed to load url ./middleware` (or another of the new modules).

- [ ] **Step 3: Write the scenarios**

`demo/src/scenarios/transforms.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const transforms: Scenario = {
  id: 'transforms',
  group: 'Data',
  title: 'Transforms',
  summary:
    "A subscriber's transform turns the data the subscribers after it receive. It only applies when its subscriber ran.",
  docs: 'https://github.com/jcfigueiredo/evem#event-transformation',
  controls: { sender: { kind: 'select', label: 'sender', options: ['ada', 'bot'], default: 'ada' } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const normalize = () => {};',
    'const count = () => {};',
    'const lowercase = message => ({ ...message, content: message.content.trim().toLowerCase() });',
    "const fromPeople = message => message.sender !== 'bot';",
    "const countWords = message => ({ ...message, words: message.content.split(' ').length });",
    'const display = message => {',
    "  const words = message.words === undefined ? 'no word count' : `${message.words} words`;",
    '  console.log(`"${message.content}", ${words}`);',
    '};',
    '',
    "// Each transform's result is the data the subscribers after it receive",
    "evem.subscribe('message.received', normalize, { priority: 'high', transform: lowercase });",
    '// A transform only applies when its subscriber ran: here, not for the bot',
    "evem.subscribe('message.received', count, { filter: fromPeople, transform: countWords });",
    "evem.subscribe('message.received', display, { priority: 'low' });",
    '',
    '// ▶ Publish a message',
    "await evem.publish('message.received', { content: '  Hello World Again  ', sender: {{sender}} });"
  ].join('\n'),
  checks: [
    { action: 'publish-a-message', calls: ['normalize', 'count', 'display'], logs: ['"hello world again", 3 words'] },
    {
      values: { sender: 'bot' },
      action: 'publish-a-message',
      calls: ['normalize', 'display'],
      skipped: ['count: filtered'],
      logs: ['"hello world again", no word count']
    }
  ]
};
```

`demo/src/scenarios/schemaValidation.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const schemaValidation: Scenario = {
  id: 'schema-validation',
  group: 'Data',
  title: 'Schema validation',
  summary:
    "A schema checks the data before a subscriber's filters and callback. Each subscription's schemaErrorPolicy decides what invalid data does.",
  docs: 'https://github.com/jcfigueiredo/evem#schema-validation',
  controls: {
    policy: {
      kind: 'select',
      label: "sendWelcome's schemaErrorPolicy",
      options: [
        'ErrorPolicy.CANCEL_ON_ERROR',
        'ErrorPolicy.LOG_AND_CONTINUE',
        'ErrorPolicy.SILENT',
        'ErrorPolicy.THROW'
      ],
      default: 'ErrorPolicy.CANCEL_ON_ERROR',
      raw: true
    }
  },
  helpers: {},
  code: [
    "import { EvEm, ErrorPolicy } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    '',
    '// A simple validator returns true or false',
    "const isAdult = user => typeof user.age === 'number' && user.age >= 18;",
    '// An advanced one returns { valid, errors }',
    'const checkUser = user => {',
    '  const errors = [',
    "    { path: 'email', message: 'Email must contain @', failed: !String(user.email).includes('@') },",
    "    { path: 'age', message: 'Must be 18 or older', failed: user.age < 18 }",
    '  ].filter(error => error.failed);',
    '  return { valid: errors.length === 0, errors };',
    '};',
    'const register = user => console.log(`Registered ${user.name}`);',
    'const sendWelcome = user => console.log(`Welcome email to ${user.email}`);',
    '',
    '// The default schemaErrorPolicy, CANCEL_ON_ERROR, logs and skips this subscriber only',
    "evem.subscribe('user.register', register, { schema: isAdult });",
    "evem.subscribe('user.register', sendWelcome, { schema: checkUser, schemaErrorPolicy: {{policy}} });",
    '',
    '// ▶ Register a valid user',
    "await evem.publish('user.register', { name: 'Ada', email: 'ada@example.com', age: 36 });",
    '',
    '// ▶ Register an invalid user',
    'await evem',
    "  .publish('user.register', { name: 'Bo', email: 'bo', age: 16 })",
    "  .catch(error => console.log('publish rejected:', error.validationErrors.map(problem => problem.path)));"
  ].join('\n'),
  checks: [
    { action: 'register-a-valid-user', calls: ['register', 'sendWelcome'], result: true },
    {
      action: 'register-an-invalid-user',
      calls: [],
      result: true,
      skipped: ['register: schema', 'sendWelcome: schema'],
      logs: ['Schema validation failed', 'Schema validation failed']
    },
    {
      values: { policy: 'ErrorPolicy.LOG_AND_CONTINUE' },
      action: 'register-an-invalid-user',
      calls: ['sendWelcome'],
      skipped: ['register: schema']
    },
    {
      values: { policy: 'ErrorPolicy.SILENT' },
      action: 'register-an-invalid-user',
      calls: [],
      skipped: ['register: schema', 'sendWelcome: schema']
    },
    {
      values: { policy: 'ErrorPolicy.THROW' },
      action: 'register-an-invalid-user',
      calls: [],
      rejects: 'Schema validation failed',
      logs: ['publish rejected: ["email","age"]']
    }
  ]
};
```

`demo/src/scenarios/middleware.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const middleware: Scenario = {
  id: 'middleware',
  group: 'Middleware',
  title: 'Middleware',
  summary:
    'Middleware sees every event before its subscribers, in the order it was added: it can change the data, cancel the event with null, or reroute it. A pattern limits it to matching events.',
  docs: 'https://github.com/jcfigueiredo/evem#middleware',
  controls: { role: { kind: 'select', label: 'role', options: ['user', 'admin', 'guest'], default: 'user' } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    '',
    '// Global middleware runs for every event: this one changes the data',
    "const stamp = (event, data) => ({ ...data, checkedAt: '10:42' });",
    '// Returning null cancels the event',
    "const blockGuests = (event, data) => (data.role === 'guest' ? null : data);",
    '// Returning a new { event, data } object reroutes it',
    "const routeAdmins = (event, data) => (data.role === 'admin' ? { event: 'admin.action', data } : data);",
    '',
    'evem.use(stamp);',
    '// Pattern middleware only runs for the events its pattern matches',
    "evem.use({ pattern: 'user.*', handler: blockGuests });",
    "evem.use({ pattern: 'user.action', handler: routeAdmins });",
    '',
    "const userAction = action => console.log('user action:', action);",
    "const adminAction = action => console.log('admin action:', action);",
    "evem.subscribe('user.action', userAction);",
    "evem.subscribe('admin.action', adminAction);",
    '',
    '// ▶ Publish user.action',
    "const delivered = await evem.publish('user.action', { role: {{role}}, action: 'delete' });",
    "console.log(delivered ? 'delivered' : 'canceled by middleware');",
    '',
    '// ▶ Publish order.created',
    "await evem.publish('order.created', { id: 1 });"
  ].join('\n'),
  checks: [
    { action: 'publish-user-action', calls: ['userAction'], result: true, logs: ['user action:', 'delivered'] },
    { values: { role: 'admin' }, action: 'publish-user-action', calls: ['adminAction'], result: true },
    {
      values: { role: 'guest' },
      action: 'publish-user-action',
      calls: [],
      result: false,
      logs: ['canceled by middleware']
    },
    { action: 'publish-order-created', calls: [], result: true }
  ]
};
```

- [ ] **Step 4: Run the scenario test to verify it passes**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: PASS (48 tests: Transforms 4, Schema validation 7, Middleware 6 more).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/scenarios
git commit -m "Demo: the Data and Middleware scenarios — transforms, schema validation, middleware

Transforms chains three subscribers and shows that a transform only
applies when its subscriber ran. Schema validation has a simple and an
advanced validator and lets the reader pick the schemaErrorPolicy, from
skipping the subscriber to rejecting the publish with the validation
errors. Middleware changes the data, cancels with null and reroutes,
globally and by pattern, with each step's output in the timeline.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

---

### Task 6: Control & errors scenarios — Cancelable events, Error policies & timeouts, Recursion protection

**Files:**
- Create: `demo/src/scenarios/cancelableEvents.ts`, `demo/src/scenarios/errorPolicies.ts`, `demo/src/scenarios/recursionProtection.ts`
- Modify (replace): `demo/src/scenarios/index.ts`
- Test: `tests/site/scenarios.test.ts` (generic)

**Interfaces:**
- Consumes: as Task 4; `raw` selects (payloads, `errorPolicy`); checks' `rejects`, `logs` and `skipped`; fake timers (the slow report).
- Produces: `cancelableEvents`, `errorPolicies`, `recursionProtection`, listed after Middleware.

- [ ] **Step 1: List the scenarios (failing test)**

Replace `demo/src/scenarios/index.ts` with:

```typescript
import type { Scenario } from '../engine/session';
import { cancelableEvents } from './cancelableEvents';
import { errorPolicies } from './errorPolicies';
import { filters } from './filters';
import { middleware } from './middleware';
import { once } from './once';
import { priorities } from './priorities';
import { publishSubscribe } from './publishSubscribe';
import { recursionProtection } from './recursionProtection';
import { schemaValidation } from './schemaValidation';
import { transforms } from './transforms';
import { wildcards } from './wildcards';

/** Every scenario, in sidebar order: the groups follow the README */
export const scenarios: readonly Scenario[] = [
  publishSubscribe,
  wildcards,
  priorities,
  filters,
  once,
  transforms,
  schemaValidation,
  middleware,
  cancelableEvents,
  errorPolicies,
  recursionProtection
];
```

- [ ] **Step 2: Run the scenario test to verify it fails**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: FAIL — `Failed to load url ./cancelableEvents` (or another of the new modules).

- [ ] **Step 3: Write the scenarios**

`demo/src/scenarios/cancelableEvents.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const cancelableEvents: Scenario = {
  id: 'cancelable-events',
  group: 'Control & errors',
  title: 'Cancelable events',
  summary:
    "Publish with cancelable: true and subscribers get cancel(), which stops the ones after them. Objects and arrays are copied to carry it; primitives can't.",
  docs: 'https://github.com/jcfigueiredo/evem#using-cancelable-events',
  controls: {
    payload: {
      kind: 'select',
      label: 'payload',
      options: ['{ amount: 50 }', '{ amount: 5000 }', '[50, 5000]', '5000'],
      default: '{ amount: 5000 }',
      raw: true
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const tooBig = payment =>',
    '  Array.isArray(payment) ? payment.some(amount => amount > 1000) : (payment.amount ?? payment) > 1000;',
    '',
    'const fraudCheck = payment => {',
    '  if (!tooBig(payment)) return;',
    "  if (typeof payment.cancel === 'function') payment.cancel();",
    '  else console.log("too big, but a primitive payload has no cancel()");',
    '};',
    "const charge = payment => console.log('charged', payment);",
    '',
    "evem.subscribe('payment.requested', fraudCheck, { priority: 'high' });",
    "evem.subscribe('payment.requested', charge);",
    '',
    '// ▶ Publish payment.requested',
    "const completed = await evem.publish('payment.requested', {{payload}}, { cancelable: true });",
    "console.log(completed ? 'payment completed' : 'payment canceled');"
  ].join('\n'),
  checks: [
    {
      action: 'publish-payment-requested',
      calls: ['fraudCheck'],
      result: false,
      skipped: ['charge: canceled'],
      logs: ['payment canceled']
    },
    {
      values: { payload: '{ amount: 50 }' },
      action: 'publish-payment-requested',
      calls: ['fraudCheck', 'charge'],
      result: true
    },
    { values: { payload: '[50, 5000]' }, action: 'publish-payment-requested', calls: ['fraudCheck'], result: false },
    {
      values: { payload: '5000' },
      action: 'publish-payment-requested',
      calls: ['fraudCheck', 'charge'],
      result: true,
      logs: ['a primitive payload has no cancel()', 'payment completed']
    }
  ]
};
```

`demo/src/scenarios/errorPolicies.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const errorPolicies: Scenario = {
  id: 'error-policies',
  group: 'Control & errors',
  title: 'Error policies & timeouts',
  summary:
    "A publish's errorPolicy decides what a callback's error does: log and go on, ignore it, stop the event, or reject. A callback slower than the timeout is an error too, but it keeps running.",
  docs: 'https://github.com/jcfigueiredo/evem#error-policy-configuration',
  controls: {
    policy: {
      kind: 'select',
      label: 'errorPolicy',
      options: [
        'ErrorPolicy.LOG_AND_CONTINUE',
        'ErrorPolicy.SILENT',
        'ErrorPolicy.CANCEL_ON_ERROR',
        'ErrorPolicy.THROW'
      ],
      default: 'ErrorPolicy.LOG_AND_CONTINUE',
      raw: true
    },
    timeout: { kind: 'number', label: 'timeout (ms)', min: 100, max: 3000, step: 100, default: 500 }
  },
  helpers: {},
  code: [
    "import { EvEm, ErrorPolicy } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const validate = data => {',
    "  if (!data.valid) throw new Error('Invalid data');",
    '};',
    "const save = () => console.log('saved');",
    'const slowReport = async () => {',
    '  await sleep(1000);',
    "  console.log('report finished (the callback kept running)');",
    '};',
    '',
    "evem.subscribe('data.process', validate, { priority: 'high' });",
    "evem.subscribe('data.process', save);",
    "evem.subscribe('report.generate', slowReport);",
    '',
    '// ▶ Publish invalid data',
    'await evem',
    "  .publish('data.process', { valid: false }, { errorPolicy: {{policy}} })",
    "  .then(completed => console.log('publish resolved', completed))",
    "  .catch(error => console.log('publish rejected:', error.message));",
    '',
    '// ▶ Generate a slow report',
    'await evem',
    "  .publish('report.generate', undefined, { timeout: {{timeout}}, errorPolicy: {{policy}} })",
    "  .then(completed => console.log('publish resolved', completed))",
    "  .catch(error => console.log('publish rejected:', error.message));"
  ].join('\n'),
  checks: [
    {
      action: 'publish-invalid-data',
      calls: ['validate', 'save'],
      result: true,
      logs: ['Error in event handler for "data.process"', 'saved', 'publish resolved true']
    },
    {
      values: { policy: 'ErrorPolicy.SILENT' },
      action: 'publish-invalid-data',
      calls: ['validate', 'save'],
      result: true,
      logs: ['saved', 'publish resolved true']
    },
    {
      values: { policy: 'ErrorPolicy.CANCEL_ON_ERROR' },
      action: 'publish-invalid-data',
      calls: ['validate'],
      result: false,
      skipped: ['save: canceled'],
      logs: ['Error in event handler', 'publish resolved false']
    },
    {
      values: { policy: 'ErrorPolicy.THROW' },
      action: 'publish-invalid-data',
      calls: ['validate'],
      rejects: 'Invalid data',
      skipped: ['save: stopped'],
      logs: ['publish rejected: Invalid data']
    },
    {
      action: 'generate-a-slow-report',
      calls: ['slowReport'],
      result: true,
      logs: ['Event handler timed out after 500ms', 'publish resolved true', 'report finished']
    },
    {
      values: { timeout: 3000 },
      action: 'generate-a-slow-report',
      calls: ['slowReport'],
      result: true,
      logs: ['report finished', 'publish resolved true']
    },
    {
      values: { policy: 'ErrorPolicy.THROW' },
      action: 'generate-a-slow-report',
      calls: ['slowReport'],
      rejects: 'timed out',
      logs: ['publish rejected: Event handler timed out after 500ms']
    }
  ]
};
```

`demo/src/scenarios/recursionProtection.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const recursionProtection: Scenario = {
  id: 'recursion-protection',
  group: 'Control & errors',
  title: 'Recursion protection',
  summary:
    'A handler that publishes the event it is handling would loop forever. EvEm stops it at a maximum nesting depth: the publish over the limit rejects.',
  docs: 'https://github.com/jcfigueiredo/evem#recursion-protection',
  controls: { depth: { kind: 'number', label: 'maximum depth', min: 1, max: 6, default: 3 } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    '// How deeply an event can nest inside its own handlers (default 3)',
    'const evem = new EvEm({{depth}});',
    'let runs = 0;',
    '',
    '// This handler publishes the event it is handling',
    'const tick = async () => {',
    '  runs++;',
    "  await evem.publish('tick');",
    '};',
    "evem.subscribe('tick', tick);",
    '',
    '// ▶ Publish tick',
    'runs = 0;',
    "await evem.publish('tick');",
    "console.log(`tick ran ${runs} time${runs === 1 ? '' : 's'}`);"
  ].join('\n'),
  checks: [
    {
      action: 'publish-tick',
      calls: ['tick', 'tick', 'tick'],
      result: true,
      logs: ['Max recursion depth of 3 exceeded', 'tick ran 3 times']
    },
    { values: { depth: 1 }, action: 'publish-tick', calls: ['tick'], logs: ['tick ran 1 time'] }
  ]
};
```

- [ ] **Step 4: Run the scenario test to verify it passes**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: PASS (67 tests: Cancelable events 6, Error policies & timeouts 9, Recursion protection 4 more).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/scenarios
git commit -m "Demo: the Control & errors scenarios — cancelable events, error policies, recursion

Cancelable events sends an object, an array or a primitive through a
fraud check that cancels big payments (a primitive can't carry
cancel()). Error policies & timeouts runs a throwing callback under each
errorPolicy, and a callback slower than the publish timeout, which
keeps running after the timeout error. Recursion protection shows a
handler re-publishing its own event, stopped at the maximum depth.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

---

### Task 7: State & diagnostics scenarios — History & replay, Memory leaks & info()

**Files:**
- Create: `demo/src/scenarios/historyReplay.ts`, `demo/src/scenarios/memoryLeaks.ts`
- Modify (replace): `demo/src/scenarios/index.ts`
- Test: `tests/site/scenarios.test.ts` (generic)

**Interfaces:**
- Consumes: as Task 4; replayed calls (Task 2); indented long logs (Task 3).
- Produces: `historyReplay`, `memoryLeaks`, last in the list.

- [ ] **Step 1: List the scenarios (failing test)**

Replace `demo/src/scenarios/index.ts` with:

```typescript
import type { Scenario } from '../engine/session';
import { cancelableEvents } from './cancelableEvents';
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
import { transforms } from './transforms';
import { wildcards } from './wildcards';

/** Every scenario, in sidebar order: the groups follow the README */
export const scenarios: readonly Scenario[] = [
  publishSubscribe,
  wildcards,
  priorities,
  filters,
  once,
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
Expected: FAIL — `Failed to load url ./historyReplay` (or `./memoryLeaks`).

- [ ] **Step 3: Write the scenarios**

`demo/src/scenarios/historyReplay.ts`:

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
    "await evem.publish('notification', { message: 'New feature!' });",
    "await evem.publish('user.login', { name: 'Bo' });",
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
    { action: 'publish-three-events', calls: [], logs: ['history: ["user.login","notification","user.login"]'] },
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
      values: { size: 1 },
      before: ['publish-three-events'],
      action: 'subscribe-late-with-replayhistory',
      calls: ['everyLogin'],
      logs: ['login: Bo']
    },
    { before: ['publish-three-events', 'clear-the-history'], action: 'subscribe-late-with-replayhistory', calls: [] }
  ]
};
```

`demo/src/scenarios/memoryLeaks.ts`:

```typescript
import type { Scenario } from '../engine/session';

export const memoryLeaks: Scenario = {
  id: 'memory-leaks',
  group: 'State & diagnostics',
  title: 'Memory leaks & info()',
  summary:
    "Leak detection warns when an event collects more subscriptions than a threshold, a sign they aren't unsubscribed. info() lists the subscriptions and middleware, optionally for a pattern.",
  docs: 'https://github.com/jcfigueiredo/evem#memory-leak-detection',
  controls: {
    threshold: { kind: 'number', label: 'warn above', min: 1, max: 10, default: 3 },
    handlers: { kind: 'number', label: 'handlers to add', min: 1, max: 10, default: 5 },
    details: { kind: 'toggle', label: 'show subscription details', default: false }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    '// Warn when an event or pattern has more than {{threshold}} subscriptions',
    'evem.enableMemoryLeakDetection({ threshold: {{threshold}}, showSubscriptionDetails: {{details}} });',
    "evem.subscribe('user.login', () => {}, { priority: 'high' });",
    "evem.use({ pattern: 'button.*', handler: (event, data) => data });",
    '',
    '// ▶ Add click handlers',
    'for (let i = 0; i < {{handlers}}; i++) {',
    "  evem.subscribe('button.click', () => {});",
    '}',
    '',
    '// ▶ Inspect everything with info()',
    'console.log(evem.info());',
    '',
    '// ▶ Inspect button.* with info()',
    "console.log(evem.info('button.*'));"
  ].join('\n'),
  checks: [
    {
      action: 'add-click-handlers',
      calls: [],
      logs: ['Possible memory leak detected: 4 handlers added for event "button.click"']
    },
    { action: 'inspect-everything-with-info', calls: [], logs: ['"event": "user.login"'] },
    { before: ['add-click-handlers'], action: 'inspect-button-with-info', calls: [], logs: ['"event": "button.click"'] }
  ]
};
```

- [ ] **Step 4: Run the scenario test to verify it passes**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: PASS (79 tests: History & replay 7, Memory leaks & info() 5 more).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/scenarios
git commit -m "Demo: the State & diagnostics scenarios — history & replay, memory leaks & info()

History & replay keeps the last N events and subscribes late with
replayLastEvent or replayHistory, the replays reading as such in the
timeline. Memory leaks & info() adds click handlers past a threshold to
trigger the leak warning, and prints info(), for everything or a
pattern, as indented JSON.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

---

### Task 8: Check every scenario in Chrome, and the docs

**Files:**
- Modify: `CLAUDE.md`, `docs/demo-revamp-design.md`

- [ ] **Step 1: Start the dev server**

```bash
pnpm demo --host 127.0.0.1 --port 5199 --strictPort
```

(In the background. On macOS, `localhost` alone binds IPv6 only. If `pkill` can't find it later, it's `node …/vite/bin/vite.js`: stop it by the port, `kill $(lsof -t -nP -iTCP:5199 -sTCP:LISTEN)`.)

- [ ] **Step 2: Chrome: every scenario's actions**

With Claude in Chrome (a tab of your own; the tab must be visible, since the timeline renders on animation frames), open `http://127.0.0.1:5199/playground/` and, for each scenario in the sidebar, run every action at the defaults. Expected for each: the sidebar shows the groups Core, Data, Middleware, Control & errors, State & diagnostics in that order; no error rows other than those the scenario is about; and:

- **Publish & subscribe**: `welcome ran`, `sendEmail ran` (its log about 300 ms later), `afterEmail ran` after it; after `Unsubscribe welcome by callback`, a publish runs only `sendEmail` and `afterEmail`.
- **Wildcards**: a `match` row per subscription (`yours: "user.*" matches "user.login"` with `the * at the end matched "login"`). Event `user`: `yours` doesn't match (`the event has 1 segment; a * at the end needs…`).
- **Filters**: `vipOrders skipped: filtered out` about 100 ms after the publish (the async filter).
- **Once**: `welcome ran`, then `welcome unsubscribed after its one run (once)`; a second `Log in` calls nobody.
- **Transforms**: `display` logs `"hello world again", 3 words`; with sender `bot`, `count skipped: filtered out` and `no word count`.
- **Schema validation** with `ErrorPolicy.THROW`: `rejected: Schema validation failed…` and `publish rejected: ["email","age"]`.
- **Middleware** with role `admin`: `middleware routeAdmins rerouted it to admin.action` with the data, then `adminAction ran`.
- **Cancelable events**: `charge skipped: the event was canceled first`, `payment canceled`; payload `5000`: the primitive log, then `charge ran`.
- **Error policies & timeouts**: `Generate a slow report` shows the timeout error at about 500 ms, `publish resolved true`, and `report finished…` about half a second later, at the top level.
- **Recursion protection**: three nested `publish tick`, the innermost `rejected: Max recursion depth of 3 exceeded…`, then `tick ran 3 times`.
- **History & replay**: after `Publish three events`, `Subscribe late with replayHistory` shows `everyLogin ran (replayed from history)` twice.
- **Memory leaks & info()**: `Add click handlers` logs `Possible memory leak detected: 4 handlers…`; `Inspect everything with info()` shows indented JSON, wrapped inside the timeline panel.

- [ ] **Step 3: Chrome: odd input (the Review Focus)**

- Wildcards: clear `event to publish` and press Enter, then Publish. Expected: the publish is rejected (`rejected: Event name cannot be empty.`, and the same error from the action), nothing else breaks, and typing `user.login` again works. A pattern with a space (`user .*`) matches nothing, and its match row says why (`segment 1 is "user", not "user "`).
- Publish & subscribe: type `abc` into `email delay (ms)` and leave the field. Expected: it goes back to the previous value, and the code is unchanged; `5000` becomes `2000` (the maximum).
- Error policies & timeouts: click `Generate a slow report`. Expected: while its publish runs (about 500 ms), the action buttons are disabled; then both work again, and the late `report finished…` row still arrives.
- Edit any scenario's code to remove its `// ▶` lines and run it. Expected: the action buttons disappear. Add `console.table([1, 2])`: no error row.

- [ ] **Step 4: Stop the server and close the tab**

- [ ] **Step 5: Update the docs**

In `CLAUDE.md`:

- In the `### Demo Site` paragraph, replace "phase 2, the foundation, is done" with "phases 2 (the foundation) and 3a (the core scenarios) are done".
- At the end of the **Engine** bullet, add: " With a scenario's `explainMatches`, every publish also records, per subscription, whether its pattern matched and why (`wildcards.ts`: `explainMatch`, its verdicts pinned to EvEm's). A once subscription's leaving is recorded after its call (EvEm removes it just before calling it), and calls made while `subscribe()` replays history are `replayed`, after the subscribe row."
- Replace the **Scenarios** bullet with:

```markdown
- **Scenarios** (`demo/src/scenarios/`): one module per feature (`Scenario`: id, group, title, summary, docs link, controls, helpers, code template, checks, optional `explainMatches`), listed in `index.ts` in sidebar order, each group together. The code is JavaScript the tests type-check with `noImplicitAny` off, so filters, validators and callbacks are written in it, as named constants where `subscribe` would type their parameter `unknown`; `helpers` are for functions it shouldn't show (their keys name them in the timeline, since minification renames bundled functions). Controls: `select` (`raw: true` writes the options as code, e.g. `ErrorPolicy.THROW`), `number`, `toggle`, `text` (with `suggestions`). A check gives control `values`, `before` actions, the `action` and its `calls` in order, and optionally `result`, `rejects`, `logs` (in order) and `skipped` (`name: reason`)
```

- In the `tests/site/` line, replace "and its `checks` run)" with "and its `checks` run with fake timers); `wildcards` (`explainMatch` against EvEm's matching)".

In `docs/demo-revamp-design.md`:

- The status line: replace "phases 1 (examples audit) and 2 (foundation) implemented; phases 3–5 not started." with "phases 1 (examples audit), 2 (foundation) and 3a (core scenarios) implemented; 3b, 3c, 4 and 5 not started."
- Under `## Phase 3: Playground`, after its first paragraph, add: "Phase 3 ships in three parts, each with its own plan and pull request: **3a**, the engine upgrades and the Core, Data, Middleware, Control & errors and State & diagnostics groups; **3b**, Flow control, with the burst buttons and lane charts; **3c**, the WebSocket, SSE and Recipes groups, with the fake servers, the server pane and Python mode."

- [ ] **Step 6: Run everything CI runs, and commit**

```bash
pnpm check
git status --short
git add CLAUDE.md docs/demo-revamp-design.md
git commit -m "Docs: the playground's core scenarios, and phase 3 in three parts

CLAUDE.md describes how scenarios are written now (JavaScript code
type-checked with noImplicitAny off, the control kinds, the check
fields) and the engine's match explanations, once and replay rows. The
design records phase 3's split into 3a (done), 3b (flow control) and
3c (adapters).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW"
```

Expected: `pnpm check` passes (60 test files); `git status` shows nothing else changed (no `demo/dist/`).
