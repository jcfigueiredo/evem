# Demo UX Pass Implementation Plan (Demo Revamp, after Phase 4a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The playground shows the code beside the output: the scenario's controls and actions with the code right under them, and the output in tabs (What EvEm did, Over time, Server) beside them, each column scrolling inside, with an Expand that gives the code the wide column; plus run buttons in the code's margin, button styles that read as buttons in both themes, a calmer timeline, and Output and Code tabs in the showcase's widgets.

**Architecture:** The data comes first: timeline rows learn their kind and their time since the latest action, the session marks where its setup ends (`setupEnd`) and `setupSummary` sums it up in one line; `actionLabel` reads an action's `// ▶ Label` line, for the editor's run gutter. Then `playground/views.ts` gains what both pages share: `BUTTON` (the daisyUI variant of every button), `tabList` (the WAI-ARIA tabs pattern, its keys in the pure `tabAfterKey`) and timeline rows that set the code's logs apart. The workbench is rebuilt on those in a two-column grid that fills the viewport on wide screens and stacks on phones; where its cards go comes from `playground/layout.ts` (the `normal` and `wide` layouts, and the saved choice); the Server pane becomes a compact tab; the widgets get tabs too.

**Tech Stack:** As phase 4a; no new dependencies.

**Spec:** `docs/demo-revamp-design.md`: "UX pass (after 4a)" (added by Task 6; the choices the user made on 2026-10-03: code beside output, run buttons in the code, visible button styles, a calmer timeline, tabs in the showcase widgets; and, from the user's look at the prototype, room for the code: an optional Expand), "Phase 3" (the workbench, the timeline, the Server card), "Phase 4" (the widgets), and the 4a follow-ups this pass closes (the double editor on quick Show code clicks, the theme picker wrapping on phones).

## Global Constraints

- No runtime dependencies, and no new dev dependencies. Development needs Node.js 20.19+ or 22.12+ (Vite 8); the package's `engines` (`>=20`) don't change.
- The site imports the library only as `@jcfigueiredo/evem` and its subpaths (aliased to `src/`); `src/` isn't touched.
- Colors only through daisyUI semantic tokens (plus `--code-*`); every text pair meets WCAG AA, faded text included (`tests/site/contrast.test.ts`).
- Class names Tailwind must generate are written out in full in the source (`demo/src` and the pages are Tailwind's sources).
- DOM content from data goes through `el()`: strings become text nodes, never HTML.
- Every button uses a daisyUI variant that reads as a button in both themes, from `BUTTON` in `playground/views.ts`.
- No layout shift while a page loads or a scenario runs (measured with a `layout-shift` PerformanceObserver: 0).
- Code style: Prettier (`pnpm format`), single quotes, 120 columns, no trailing commas; imports in the order packages, `../` paths, `./` paths.
- Commit messages: subject, a body that explains why, and the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW`.
- New tests go in `tests/site/`.

## Rulings made while planning (for review)

Every file in this plan was written and run first: `pnpm check` passed on the result (72 test files, 1,382 tests passed, 12 skipped, and the package check). The playground was used in Chrome at 1440 px in both themes (an SSE scenario with its Server tab, a lanes scenario, a WebSocket one), and measured with Playwright at 375 px (four scenarios: nothing scrolls sideways) and for layout shift on reload (0 on three scenarios). A dry run of the tasks in order, from `main`, confirmed each step's Expected result below and that the end state equals the validated files.

1. **Code beside output** (the user's choice). From the `lg` breakpoint, `main#workbench` is the viewport's height (`lg:h-dvh`) and the grid has two columns (5 : 7): the Scenario card (summary, controls, actions) above the Code card on the left, the Output card spanning both rows on the right; the code and the output scroll inside their cards. Below `lg` the cards stack (Scenario, Output, Code) with fixed heights (32rem, 28rem), and `grid-cols-1` keeps a long word from widening the page.
2. **Output in tabs:** What EvEm did, Over time (scenarios with lanes, which open on it) and Server (scenarios with a server). A tab that isn't shown counts its new entries in a badge, which screen readers hear through the tab's name ("Server, 3 new"). Clear is only on the timeline tab, and is `invisible` (not removed) elsewhere, so the tab row never shifts.
3. **Run buttons in the code:** a ▶ in the margin of each `// ▶ Label` line runs that action through the same path as its button (one run at a time, `ActionGate`). They're hidden while the code is being edited: the buttons run the session's actions, which may no longer match the text on screen.
4. **Button variants:** `btn-primary` for the main action, `btn-soft` for the others (plain `btn` is nearly the card's own color in Signal, so it read as text), `btn-ghost` only for minor ones (Reset, Clear), and `btn-xs btn-soft` for the Server tab's compact controls. Checked in both themes in Chrome.
5. **A calmer timeline:** the setup's entries (before `session.setupEnd`) fold into one `Setup · 3 subscriptions, 1 publish` line (a `details`), until the reader clears the timeline; what the code logged is a `›` console chip; rows after an action show `+N ms` since it (the action itself keeps its time since the reset, so actions can be compared); a later call names its publish's time the same way (`with the data published at +5 ms`).
6. **The widgets:** Output and Code tabs; the editor loads once, however quickly the Code tab is pressed (a shared promise: the 4a follow-up about two editors); its ▶ buttons run the action and switch to Output; a control change runs the first action again, so the output always matches the controls.
7. **The theme picker on phones** shows just the theme's name, on one line; its accessible name keeps "Theme: …" (the 4a follow-up).
8. **"Server card" becomes "Server tab"** wherever it names the UI: the scenario summaries, a sample's text (and the check that reads it), comments and test names. The design doc's account of the user's review keeps "card", since it describes the page before.
9. **`tabList` doesn't call `onSelect` for its first selection.** The prototype did, and the workbench's `onSelect` ran while the workbench was still being built, before its renderers existed (a `ReferenceError` that left the page empty); the first selection isn't a change anyway.
10. **Room for the code** (the user, on the prototype: "the code section is compressed… maybe optional to expand the code area"). *Expand*, in the code's header, swaps the layout: the code takes the wide column (7 : 5) at the grid's full height, and the Scenario and Output cards stack beside it, so nothing leaves the screen and the ▶ buttons still run every action. *Shrink* goes back; the choice is saved (`evem-code-layout`, read and written like the theme, so blocked storage only means it isn't remembered). At 1440×900 the code goes from 467×508 to 653×804 px. In both layouts the row under the Scenario card gets at least 20rem (`minmax(0,max-content)` then `minmax(20rem,1fr)`), and the Scenario card scrolls on a short screen: at 1024×700 the code went from 130 to 242 px tall. Below 1280 px the heading says "Code" instead of "Code that runs", so the header stays on one line. On phones, *Expand* only makes the code taller (85dvh).
11. **daisyUI's `card-body` makes every `p` inside it grow** (`flex-grow: 1`): in a card's flex column next to something that takes the free space (the wire log, the editor), use a `div` or `grow-0`. The prototype's Server legend, a `p`, took half the tab.

The independent review of the commits that fixed the layout shift (`d5f3f1e..d32ec23`, after 4a's review) found nothing Critical or Important; its five minors go on the follow-ups list for 4b (Task 6).

## Review Focus

1. **Short and medium windows** (1024 to 1366 px wide, 700 to 800 px tall), in both layouts: both columns fit the viewport, the code keeps at least its 20rem row, the Scenario card scrolls rather than pushing it, and the page itself doesn't scroll; Expand and Shrink while a stream runs keep the timeline and the lane chart drawn at the new width. Chrome, Task 4.
2. **A ▶ pressed while an action runs**, or a control changed during a run: one run at a time, and an old run's rows never land in the new view; in a widget, a ▶ in the Code tab shows Output and its run. Chrome, Tasks 4 and 5.
3. **Clear, then Reset or a control change:** the timeline starts over with the setup folded again, and the tab counts start from zero. Chrome, Task 4 step 3.
4. **Keyboard and screen readers on the tabs:** the arrow keys, Home and End move between tabs (`tabAfterKey`, tested) and focus follows; each panel is labelled by its tab; a count is part of the tab's name only while it shows. Chrome, Task 4 step 3.
5. **A stream left running** (the SSE ticks) on another tab: the badge counts up without moving anything, and opening Server shows the log at its end. Chrome, Task 4 step 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `demo/src/timeline.ts` | Rows' `kind` and `since`; later calls timed from the action; `setupSummary` |
| `demo/src/engine/session.ts` | `setupEnd`: how many trace entries the setup made |
| `demo/src/engine/program.ts` | `actionLabel`: an action's label from its `// ▶` line |
| `demo/src/editor.ts` | The run gutter (`EditorOptions.onRunAction`); fills its card |
| `demo/src/playground/views.ts` | `BUTTON`, `tabAfterKey`, `tabList`, and timeline rows with log chips and relative times |
| `demo/src/playground/layout.ts` (new) | `LAYOUTS` (`normal`, `wide`), `GRID_ROWS`, and the saved choice (`readCodeLayout`, `saveCodeLayout`) |
| `demo/src/playground/workbench.ts` | Code beside output: the Scenario, Code and Output cards, Expand, the setup fold, Clear, tab counts |
| `demo/playground/index.html` | `main#workbench` fills the viewport on wide screens |
| `demo/src/playground/serverPane.ts` | The Server tab: a compact toolbar above the wire log |
| `demo/src/showcase/widget.ts` | Output and Code tabs, one editor load, ▶ buttons, a rerun on control changes |
| `demo/src/theme.ts` | `browserStorage()` (exported, for the layout); the picker's label on phones |
| Scenarios, fakes, tests | "Server card" → "Server tab" |
| `tests/site/*.test.ts` | `timeline`, `session`, `program`; `views` and `layout` (new) |
| `CLAUDE.md`, `docs/demo-revamp-design.md` | The UX pass: its choices, the new UI, the follow-ups it closes, and the ones the layout-shift fixes' review added |

---

### Task 1: Timeline rows: their kind, their time since the action, and the setup in one line

**Files:**
- Modify: `demo/src/timeline.ts` (`TimelineRow.kind` and `since`; later calls timed from the action; `setupSummary`)
- Modify: `demo/src/engine/session.ts` (`setupEnd`)
- Test: `tests/site/timeline.test.ts`, `tests/site/session.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `TimelineRow.kind: TraceEntry['kind']` and `TimelineRow.since?: number` (milliseconds since the latest action at or before the row; undefined before the first action); a later call's text ends `with the data published at +N ms`
  - `setupSummary(entries: readonly TraceEntry[]): string`: `Setup · 2 subscriptions, 1 publish, 1 log` (subscriptions, publishes, logs and errors that occurred; otherwise `Setup · N steps`)
  - `ScenarioSession.setupEnd: number`: how many trace entries the setup made (0 after a failed setup, and until the first reset)

- [ ] **Step 1: Write the failing tests**

In `tests/site/timeline.test.ts`, replace:

```ts
  liveAnnouncement,
  preview,
  sinceLatestAction,
  timelineRows
```

with:

```ts
  liveAnnouncement,
  preview,
  setupSummary,
  sinceLatestAction,
  timelineRows
```

In `tests/site/timeline.test.ts`, replace:

```ts
      '1 search skipped: debounced (runs later if nothing else arrives)',
      '0 resolved true',
      '0 search ran later, with the data published at 5 ms',
      '0 search ran later'
    ]);
```

with:

```ts
      '1 search skipped: debounced (runs later if nothing else arrives)',
      '0 resolved true',
      '0 search ran later, with the data published at +5 ms',
      '0 search ran later'
    ]);
```

In `tests/site/timeline.test.ts`, replace:

```ts
});

describe('sinceLatestAction', () => {
  it('keeps the latest action and what came after it, and nothing before the first action', () => {
```

with:

```ts
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
```

In `tests/site/session.test.ts`, replace:

```ts
    expect(defaultValues(scenario)).toEqual({ greeting: 'hello', loud: false });
    expect(session.code).toContain("await evem.publish('greet', 'hello');");
  });

```

with:

```ts
    expect(defaultValues(scenario)).toEqual({ greeting: 'hello', loud: false });
    expect(session.code).toContain("await evem.publish('greet', 'hello');");
  });

  it('marks where the setup ends, so the timeline can fold it away, and what came after stays after it', async () => {
    const session = new ScenarioSession(scenario);
    expect(session.setupEnd).toBe(0);
    await session.reset();
    expect(session.setupEnd).toBe(1);
    await session.run('greet');
    expect(session.trace.entries.length).toBeGreaterThan(session.setupEnd);
    expect(session.trace.entries[session.setupEnd]).toMatchObject({ kind: 'action' });

    await session.edit('throw new Error("broken setup")');
    expect(session.setupEnd).toBe(0);
  });

```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:nowatch tests/site/timeline.test.ts tests/site/session.test.ts`

Expected: FAIL, 2 files, 4 failed | 50 passed (54): `setupEnd` is undefined (`expected undefined to be +0`); the later call still reads `published at 5 ms`; rows have no kind (`expected [ [ undefined, undefined ], …(5) ]`); `TypeError: setupSummary is not a function`.

- [ ] **Step 3: Write the row times, the summary and `setupEnd`**

In `demo/src/timeline.ts`, replace:

```ts
  /** Milliseconds since the scenario started */
  at: number;
}

```

with:

```ts
  /** Milliseconds since the scenario started */
  at: number;
  /** Milliseconds since the latest action started (none before the first action) */
  since?: number;
  /** The kind of trace entry the line shows (what the code logged reads differently from EvEm's own steps) */
  kind: TraceEntry['kind'];
}

```

In `demo/src/timeline.ts`, replace:

```ts

/** What a trace entry says, in words */
export function describeEntry(entry: TraceEntry): Omit<TimelineRow, 'depth' | 'at'> {
  switch (entry.kind) {
    case 'subscribe':
```

with:

```ts

/** What a trace entry says, in words */
export function describeEntry(entry: TraceEntry): Omit<TimelineRow, 'depth' | 'at' | 'since' | 'kind'> {
  switch (entry.kind) {
    case 'subscribe':
```

In `demo/src/timeline.ts`, replace:

```ts
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

```

with:

```ts
export function timelineRows(entries: readonly TraceEntry[]): TimelineRow[] {
  const publishDepth = new Map<number, number>();
  const publishedAt = new Map<number, string>();
  let actionAt: number | undefined;
  /** A time as the timeline shows it: since the latest action (`+N ms`), or since the start before any action */
  const shown = (at: number) => (actionAt === undefined ? `${at} ms` : `+${at - actionAt} ms`);
  return entries.map(entry => {
    if (entry.kind === 'action') actionAt = entry.at;
    const since = actionAt === undefined ? {} : { since: entry.at - actionAt };
    if (entry.kind === 'call' && entry.later) {
      // A call that comes after its publish ended (debounce) stands on its own, and says which publish it came from
      const at = entry.publish === undefined ? undefined : publishedAt.get(entry.publish);
      const text = `${entry.subscription} ran later${at === undefined ? '' : `, with the data published at ${at}`}`;
      return { ...describeEntry(entry), text, depth: 0, at: entry.at, ...since, kind: entry.kind };
    }
    const depth = entry.publish === undefined ? 0 : (publishDepth.get(entry.publish) ?? 0) + 1;
    if (entry.kind === 'publish') {
      publishDepth.set(entry.id, depth);
      publishedAt.set(entry.id, shown(entry.at));
    }
    return { ...describeEntry(entry), depth, at: entry.at, ...since, kind: entry.kind };
  });
}

/** One line about a setup the timeline folds away: how many subscriptions, publishes, logs and errors it made */
export function setupSummary(entries: readonly TraceEntry[]): string {
  const count = (kind: TraceEntry['kind']) => entries.filter(entry => entry.kind === kind).length;
  const parts = (
    [
      ['subscribe', 'subscription', 'subscriptions'],
      ['publish', 'publish', 'publishes'],
      ['log', 'log', 'logs'],
      ['error', 'error', 'errors']
    ] as const
  ).flatMap(([kind, one, many]) => {
    const n = count(kind);
    return n === 0 ? [] : [`${n} ${n === 1 ? one : many}`];
  });
  return `Setup · ${parts.length > 0 ? parts.join(', ') : `${entries.length} steps`}`;
}

```

In `demo/src/engine/session.ts`, replace:

```ts
  actions: Action[] = [];
  trace: Trace;
  /** The scenario's server (scenarios with `websocket` or `sse`), new at every reset */
  server: FakeServer | undefined;
```

with:

```ts
  actions: Action[] = [];
  trace: Trace;
  /**
   * How many of the trace's entries the setup made (the code before its first action, run at every reset): the
   * timeline folds them away. 0 until the setup has run, and when it failed.
   */
  setupEnd = 0;
  /** The scenario's server (scenarios with `websocket` or `sse`), new at every reset */
  server: FakeServer | undefined;
```

In `demo/src/engine/session.ts`, replace:

```ts
    this.trace = trace;
    this.program = undefined;
    this.stop();
    const clock = () => trace.now();
```

with:

```ts
    this.trace = trace;
    this.program = undefined;
    this.setupEnd = 0;
    this.stop();
    const clock = () => trace.now();
```

In `demo/src/engine/session.ts`, replace:

```ts
      const helpers = helperNames.map(name => this.scenario.helpers[name]);
      const program = await this.capturingLogs(trace, () => run(modules, this.consoleForCode(trace), ...helpers));
      if (this.trace === trace) this.program = program as Record<string, () => Promise<void>>;
    } catch (error) {
      // No program, so no action can run: no buttons (unless a newer reset has taken over)
```

with:

```ts
      const helpers = helperNames.map(name => this.scenario.helpers[name]);
      const program = await this.capturingLogs(trace, () => run(modules, this.consoleForCode(trace), ...helpers));
      if (this.trace === trace) {
        this.program = program as Record<string, () => Promise<void>>;
        this.setupEnd = trace.entries.length;
      }
    } catch (error) {
      // No program, so no action can run: no buttons (unless a newer reset has taken over)
```

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm test:nowatch tests/site/timeline.test.ts tests/site/session.test.ts && pnpm typecheck`

Expected: PASS, 2 files, 54 tests; the type check exits 0.

- [ ] **Step 5: Commit**

```bash
git add demo/src/timeline.ts demo/src/engine/session.ts tests/site/timeline.test.ts tests/site/session.test.ts
git commit -F - <<'EOF'
Demo: timeline rows know their kind and their time since the action

A calmer timeline needs three things from the data: each row's kind (so the code's own logs can look like console output), its time since the latest action (rows read +12 ms rather than a time since the reset), and where the setup ends, so the entries every reset makes can fold into one line. setupSummary sums them up (Setup · 3 subscriptions, 1 publish), and a call that ran later names its publish's time the same way.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 2: Run buttons in the code

**Files:**
- Modify: `demo/src/engine/program.ts` (`actionLabel`)
- Modify: `demo/src/editor.ts` (the run gutter; the editor fills its card)
- Test: `tests/site/program.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `actionLabel(line: string): string | undefined`: the label of a `// ▶ Label` line (trimmed), undefined for any other line; `splitActions` uses it
  - `createEditor(parent, code, onRun, options: EditorOptions = {})` with `interface EditorOptions { onRunAction?: (label: string) => void }`: a ▶ button (`.cm-run`, named "Run “Label”") in the margin of each action line, hidden while the code is editable

- [ ] **Step 1: Write the failing test**

In `tests/site/program.test.ts`, replace:

```ts
import { describe, expect, it } from 'vitest';
import { compileProgram, renderCode, slug, splitActions, toLiteral } from '../../demo/src/engine/program';

describe('toLiteral', () => {
```

with:

```ts
import { describe, expect, it } from 'vitest';
import { actionLabel, compileProgram, renderCode, slug, splitActions, toLiteral } from '../../demo/src/engine/program';
import { defaultValues, rawControls } from '../../demo/src/engine/session';
import { scenarios } from '../../demo/src/scenarios';

describe('toLiteral', () => {
```

In `tests/site/program.test.ts`, replace:

```ts
  it('makes lowercase words joined by dashes', () => {
    expect(slug('Publish order.created!')).toBe('publish-order-created');
  });
});
```

with:

```ts
  it('makes lowercase words joined by dashes', () => {
    expect(slug('Publish order.created!')).toBe('publish-order-created');
  });
});

describe('actionLabel', () => {
  it("reads an action's label from its `// ▶ Label` line, indented or not, and nothing from other lines", () => {
    expect(actionLabel('// ▶ Show the last event id')).toBe('Show the last event id');
    expect(actionLabel('   // ▶  Type "hello world"  ')).toBe('Type "hello world"');
    expect(actionLabel('// Show the last event id')).toBeUndefined();
    expect(actionLabel("console.log('// ▶ not a marker')")).toBeUndefined();
  });

  it("finds exactly the actions compileProgram finds, in every scenario: the code's ▶ buttons and its action buttons agree", () => {
    for (const scenario of scenarios) {
      const code = renderCode(scenario.code, defaultValues(scenario), rawControls(scenario));
      const labels = code.split('\n').flatMap(line => actionLabel(line) ?? []);
      expect(labels, scenario.id).toEqual(compileProgram(code).actions.map(action => action.label));
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/program.test.ts`

Expected: FAIL, 2 failed | 9 passed (11): both `actionLabel` tests with `TypeError: actionLabel is not a function`.

- [ ] **Step 3: Write `actionLabel`**

In `demo/src/engine/program.ts`, replace:

```ts
}

/** The setup code (before the first marker) and the action blocks of a scenario's code */
export function splitActions(code: string): { setup: string; actions: Array<Action & { code: string }> } {
```

with:

```ts
}

/** The label of an action's `// ▶ Label` line, or undefined for any other line */
export function actionLabel(line: string): string | undefined {
  return ACTION_MARKER.exec(line.trim())?.[1]?.trim();
}

/** The setup code (before the first marker) and the action blocks of a scenario's code */
export function splitActions(code: string): { setup: string; actions: Array<Action & { code: string }> } {
```

In `demo/src/engine/program.ts`, replace:

```ts
  const actions: Array<Action & { code: string[] }> = [];
  for (const line of lines) {
    const marker = ACTION_MARKER.exec(line.trim());
    if (marker) {
      const label = marker[1]!.trim();
      actions.push({ id: slug(label), label, code: [] });
    } else if (actions.length > 0) {
```

with:

```ts
  const actions: Array<Action & { code: string[] }> = [];
  for (const line of lines) {
    const label = actionLabel(line);
    if (label !== undefined) {
      actions.push({ id: slug(label), label, code: [] });
    } else if (actions.length > 0) {
```

- [ ] **Step 4: Run the test again**

Run: `pnpm test:nowatch tests/site/program.test.ts`

Expected: PASS, 11 tests.

- [ ] **Step 5: Add the run gutter to the editor**

A CodeMirror gutter whose markers are buttons, one per line `actionLabel` reads; clicking one calls `onRunAction` with the label. A compartment hides the gutter while the code is editable. The editor also fills its host's height (`height: 100%`), since the code card now gives it a fixed share of the screen. The DOM is checked in Chrome in Task 4.

In `demo/src/editor.ts`, replace:

```ts
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/** A code panel: read-only until `setEditable(true)`; Cmd/Ctrl+Enter calls `onRun` */
```

with:

```ts
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  gutter,
  GutterMarker,
  highlightActiveLine,
  keymap,
  lineNumbers
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { actionLabel } from './engine/program';

/** What a code panel can do besides showing code */
export interface EditorOptions {
  /** Called with an action's label when its ▶ button, in the margin of its `// ▶ Label` line, is pressed */
  onRunAction?: (label: string) => void;
}

/** A code panel: read-only until `setEditable(true)`; Cmd/Ctrl+Enter calls `onRun` */
```

In `demo/src/editor.ts`, replace:

```ts
      color: 'var(--color-neutral-content)',
      fontSize: '13px',
      borderRadius: 'var(--radius-box)'
    },
    '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--code-keyword)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--code-comment)', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(255 255 255 / 0.04)' },
```

with:

```ts
      color: 'var(--color-neutral-content)',
      fontSize: '13px',
      borderRadius: 'var(--radius-box)',
      // A panel with a set height (the workbench's code card, a widget's Code tab) scrolls inside
      height: '100%'
    },
    '.cm-run-gutter .cm-gutterElement': { display: 'flex', alignItems: 'center', paddingLeft: '4px' },
    '.cm-run': {
      color: 'var(--code-string)',
      background: 'none',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '11px',
      lineHeight: '1',
      padding: '3px 5px'
    },
    '.cm-run:hover, .cm-run:focus-visible': { backgroundColor: 'rgb(163 230 53 / 0.18)', outline: 'none' },
    '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--code-keyword)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overflow: 'auto' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--code-comment)', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(255 255 255 / 0.04)' },
```

In `demo/src/editor.ts`, replace:

```ts
);

export function createEditor(parent: HTMLElement, code: string, onRun: () => void): CodeEditor {
  const editable = new Compartment();
  const readOnly = (on: boolean) => [EditorView.editable.of(!on), EditorState.readOnly.of(on)];
  const view = new EditorView({
```

with:

```ts
);

/** A ▶ button in the margin of an action's line */
class RunMarker extends GutterMarker {
  constructor(readonly label: string) {
    super();
  }

  override eq(other: RunMarker): boolean {
    return other.label === this.label;
  }

  override toDOM(): Node {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-run';
    button.textContent = '▶';
    button.title = `Run “${this.label}”`;
    button.setAttribute('aria-label', `Run “${this.label}”`);
    return button;
  }
}

/** The margin with a ▶ button on each `// ▶ Label` line, which calls `onRunAction` with the label */
function runGutter(onRunAction: (label: string) => void) {
  return gutter({
    class: 'cm-run-gutter',
    markers: view => {
      const markers = new RangeSetBuilder<GutterMarker>();
      for (let number = 1; number <= view.state.doc.lines; number++) {
        const line = view.state.doc.line(number);
        const label = actionLabel(line.text);
        if (label !== undefined) markers.add(line.from, line.from, new RunMarker(label));
      }
      return markers.finish();
    },
    domEventHandlers: {
      click: (view, block, event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.cm-run')) return false;
        const label = actionLabel(view.state.doc.lineAt(block.from).text);
        if (label !== undefined) onRunAction(label);
        return true;
      }
    }
  });
}

export function createEditor(
  parent: HTMLElement,
  code: string,
  onRun: () => void,
  options: EditorOptions = {}
): CodeEditor {
  const editable = new Compartment();
  // The ▶ buttons run the program that's running, so they go while the code is being edited
  const runButtons = new Compartment();
  const runs = (on: boolean) => (on && options.onRunAction ? runGutter(options.onRunAction) : []);
  const readOnly = (on: boolean) => [EditorView.editable.of(!on), EditorState.readOnly.of(on)];
  const view = new EditorView({
```

In `demo/src/editor.ts`, replace:

```ts
      doc: code,
      extensions: [
        lineNumbers(),
        history(),
```

with:

```ts
      doc: code,
      extensions: [
        runButtons.of(runs(true)),
        lineNumbers(),
        history(),
```

In `demo/src/editor.ts`, replace:

```ts
    getCode: () => view.state.doc.toString(),
    setCode: next => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } }),
    setEditable: on => view.dispatch({ effects: editable.reconfigure(readOnly(!on)) }),
    focus: () => view.focus(),
    destroy: () => view.destroy()
```

with:

```ts
    getCode: () => view.state.doc.toString(),
    setCode: next => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } }),
    setEditable: on =>
      view.dispatch({ effects: [editable.reconfigure(readOnly(!on)), runButtons.reconfigure(runs(!on))] }),
    focus: () => view.focus(),
    destroy: () => view.destroy()
```

- [ ] **Step 6: Run the site tests and the type check**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 21 files, 390 tests.

- [ ] **Step 7: Commit**

```bash
git add demo/src/engine/program.ts demo/src/editor.ts tests/site/program.test.ts
git commit -F - <<'EOF'
Demo: run buttons in the code

Each // ▶ line of a scenario's code gets a ▶ button in the editor's margin that runs that action, so the code can be read and run in one place. actionLabel reads the label for both the buttons and splitActions, and a test checks that both find the same actions in every scenario. The buttons hide while the code is being edited, since the actions they run may no longer match the text.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 3: Views both pages share: button styles, tabs and calmer rows

**Files:**
- Modify: `demo/src/playground/views.ts` (`BUTTON`, `tabAfterKey`, `Tab`, `tabList`; `timelineItem`: log chips and relative times)
- Test: `tests/site/views.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's `TimelineRow.kind` and `since`
- Produces:
  - `BUTTON = { main: 'btn btn-sm btn-primary', other: 'btn btn-sm btn-soft', minor: 'btn btn-sm btn-ghost', server: 'btn btn-xs btn-soft' }`
  - `tabAfterKey(count: number, index: number, key: string): number | undefined` (ArrowRight / ArrowLeft wrap around, Home, End)
  - `interface Tab { id: string; label: string; panel: HTMLElement }` and `tabList(tabs, { label, initial?, idPrefix, onSelect? })` returning `{ element, select(id), selected(), setCount(id, count) }`: tabs `<idPrefix>-tab-<id>`, panels `<idPrefix>-panel-<id>`; `onSelect` hears changes, not the first selection
  - `timelineItem(row)`: a plain log as a `›` chip; rows after an action timed `+N ms`

- [ ] **Step 1: Write the failing test**

Create `tests/site/views.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tabAfterKey } from '../../demo/src/playground/views';

describe('tabAfterKey', () => {
  it('moves to the next or previous tab with the arrow keys, wrapping around', () => {
    expect(tabAfterKey(3, 0, 'ArrowRight')).toBe(1);
    expect(tabAfterKey(3, 2, 'ArrowRight')).toBe(0);
    expect(tabAfterKey(3, 0, 'ArrowLeft')).toBe(2);
    expect(tabAfterKey(3, 2, 'ArrowLeft')).toBe(1);
  });

  it('goes to the first tab with Home and the last with End, and ignores other keys', () => {
    expect(tabAfterKey(3, 1, 'Home')).toBe(0);
    expect(tabAfterKey(3, 1, 'End')).toBe(2);
    expect(tabAfterKey(3, 1, 'Enter')).toBeUndefined();
    expect(tabAfterKey(3, 1, 'ArrowDown')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/views.test.ts`

Expected: FAIL, 2 failed (2): `TypeError: tabAfterKey is not a function`.

- [ ] **Step 3: Write the shared views**

`tabList` follows the WAI-ARIA tabs pattern with daisyUI's `tabs tabs-border`: `role=tablist` / `tab` / `tabpanel`, `aria-selected`, `aria-controls` and `aria-labelledby`, a roving `tabIndex`, and its keys from `tabAfterKey`. A count's badge is `aria-hidden`; while it shows, the tab's `aria-label` says it ("Server, 3 new"). Its first selection doesn't call `onSelect`: a caller's handler would run while the caller is still being built.

In `demo/src/playground/views.ts`, replace:

```ts
}

/** One timeline row: a status dot in its tone, the text, its detail (data, in short) and its time */
export function timelineItem(row: TimelineRow): HTMLElement {
  return el('li', { class: 'relative ps-4', style: `margin-inline-start: ${row.depth * 1.25}rem` }, [
    el('span', {
      class: `status ${TONE_CLASS[row.tone]} absolute -start-[0.3rem] top-[0.45rem] signal-glow`,
```

with:

```ts
}

/**
 * The buttons' looks, in one place: the main action (`btn-primary`), the other actions (`btn-soft`, which reads as a
 * button in both themes: plain `btn` is nearly the card's own color in Signal), minor ones (`btn-ghost`), and the
 * Server tab's compact controls
 */
export const BUTTON = {
  main: 'btn btn-sm btn-primary',
  other: 'btn btn-sm btn-soft',
  minor: 'btn btn-sm btn-ghost',
  server: 'btn btn-xs btn-soft'
} as const;

/** A row's time: an action's start since the scenario started; anything after an action, since that action */
function timeOf(row: TimelineRow): string {
  if (row.kind === 'action' || row.since === undefined) return `${row.at} ms`;
  return `+${row.since} ms`;
}

/**
 * One timeline row: a status dot in its tone, the text, its detail (data, in short) and its time. What the code
 * logged (a plain log) reads as console output, set apart from EvEm's own steps.
 */
export function timelineItem(row: TimelineRow): HTMLElement {
  const indent = `margin-inline-start: ${row.depth * 1.25}rem`;
  const time = el('span', { class: 'text-xs text-base-content/60 ms-2' }, [timeOf(row)]);
  if (row.kind === 'log' && row.tone === 'neutral') {
    return el('li', { class: 'relative ps-4', style: indent }, [
      el(
        'span',
        { class: 'absolute -start-[0.3rem] top-0 font-mono text-sm text-base-content/70', 'aria-hidden': 'true' },
        ['›']
      ),
      el('span', { class: 'rounded bg-base-200 px-1.5 py-0.5 font-mono text-sm break-words whitespace-pre-wrap' }, [
        row.text
      ]),
      time
    ]);
  }
  return el('li', { class: 'relative ps-4', style: indent }, [
    el('span', {
      class: `status ${TONE_CLASS[row.tone]} absolute -start-[0.3rem] top-[0.45rem] signal-glow`,
```

In `demo/src/playground/views.ts`, replace:

```ts
    el('span', { class: 'font-mono text-sm break-words whitespace-pre-wrap' }, [row.text]),
    row.detail ? el('span', { class: 'font-mono text-xs text-base-content/60 ms-2 break-all' }, [row.detail]) : null,
    el('span', { class: 'text-xs text-base-content/60 ms-2' }, [`${row.at} ms`])
  ]);
}

```

with:

```ts
    el('span', { class: 'font-mono text-sm break-words whitespace-pre-wrap' }, [row.text]),
    row.detail ? el('span', { class: 'font-mono text-xs text-base-content/60 ms-2 break-all' }, [row.detail]) : null,
    time
  ]);
}

/**
 * The tab a key moves to, in a list of `count` tabs where the one at `index` has focus: the arrow keys go to the next
 * or previous one, wrapping around, Home to the first and End to the last (the WAI-ARIA tabs pattern); undefined for
 * any other key
 */
export function tabAfterKey(count: number, index: number, key: string): number | undefined {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/** One tab of a tab list, and the panel it shows */
export interface Tab {
  id: string;
  label: string;
  panel: HTMLElement;
}

/**
 * daisyUI tabs (`tabs-border`) over panels, following the WAI-ARIA tabs pattern: the arrow keys (and Home, End) move
 * between tabs, the selected tab is `aria-selected`, and each panel is labelled by its tab. `setCount` shows a badge
 * with what's new on a tab that isn't selected (0 hides it); `onSelect` hears every change (not the first selection).
 */
export function tabList(
  tabs: readonly Tab[],
  {
    label,
    initial,
    idPrefix,
    onSelect
  }: { label: string; initial?: string; idPrefix: string; onSelect?: (id: string) => void }
): {
  element: HTMLElement;
  select: (id: string) => void;
  selected: () => string;
  setCount: (id: string, count: number) => void;
} {
  let current = tabs.some(tab => tab.id === initial) ? initial! : tabs[0]!.id;
  const badges = new Map<string, HTMLElement>();
  const buttons = tabs.map(tab => {
    const badge = el('span', { class: 'badge badge-sm badge-primary ms-1 hidden', 'aria-hidden': 'true' });
    badges.set(tab.id, badge);
    const button = el(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `${idPrefix}-tab-${tab.id}`,
        'aria-controls': `${idPrefix}-panel-${tab.id}`,
        class: 'tab'
      },
      [tab.label, badge]
    );
    tab.panel.id = `${idPrefix}-panel-${tab.id}`;
    tab.panel.setAttribute('role', 'tabpanel');
    tab.panel.setAttribute('aria-labelledby', button.id);
    button.addEventListener('click', () => select(tab.id));
    button.addEventListener('keydown', event => {
      const index = tabAfterKey(tabs.length, tabs.indexOf(tab), event.key);
      if (index === undefined) return;
      const next = tabs[index]!;
      event.preventDefault();
      select(next.id);
      document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
    });
    return button;
  });
  /** Show a tab's panel, without telling `onSelect` (the first selection isn't a change) */
  const show = (id: string) => {
    current = id;
    tabs.forEach((tab, index) => {
      const on = tab.id === id;
      const button = buttons[index]!;
      button.classList.toggle('tab-active', on);
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      tab.panel.hidden = !on;
      if (on) setCount(id, 0);
    });
  };
  const select = (id: string) => {
    show(id);
    onSelect?.(id);
  };
  const setCount = (id: string, count: number) => {
    const badge = badges.get(id);
    if (!badge) return;
    const shown = count > 0 && id !== current;
    badge.classList.toggle('hidden', !shown);
    badge.textContent = shown ? String(count) : '';
    // The badge is hidden from assistive tech; the tab's name says it instead
    const index = tabs.findIndex(tab => tab.id === id);
    if (shown) buttons[index]!.setAttribute('aria-label', `${tabs[index]!.label}, ${count} new`);
    else buttons[index]!.removeAttribute('aria-label');
  };
  const element = el('div', { role: 'tablist', class: 'tabs tabs-border', 'aria-label': label }, buttons);
  show(current);
  return { element, select, selected: () => current, setCount };
}

```

- [ ] **Step 4: Run the test and the type check**

Run: `pnpm test:nowatch tests/site/views.test.ts && pnpm typecheck`

Expected: PASS, 2 tests; the type check exits 0.

- [ ] **Step 5: Commit**

```bash
git add demo/src/playground/views.ts tests/site/views.test.ts
git commit -F - <<'EOF'
Demo: button styles, tabs and calmer timeline rows, for both pages

Plain daisyUI buttons are nearly the card's own color in the Signal theme, so they read as text; BUTTON names one variant per role (primary, soft, ghost, and compact soft for the server's controls), for the playground and the showcase alike. tabList gives both pages the WAI-ARIA tabs pattern, with counts of what's new on a tab that isn't shown; its keys are the pure tabAfterKey, tested. Timeline rows show the code's logs as console chips and time rows from their action.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 4: The playground: code beside output, with Expand

**Files:**
- Create: `demo/src/playground/layout.ts`
- Test: `tests/site/layout.test.ts` (new)
- Modify: `demo/src/theme.ts` (exports `browserStorage`)
- Replace: `demo/src/playground/workbench.ts`
- Modify: `demo/playground/index.html` (`main#workbench` fills the viewport on wide screens)
- Modify: `demo/src/playground/serverPane.ts` (the Server tab: a compact toolbar above the log)
- Modify ("Server card" → "Server tab"): `demo/src/engine/session.ts`, `demo/src/fakes/sseServer.ts`, `demo/src/fakes/webSocketServer.ts`, `demo/src/fakes/wire.ts`, `demo/src/scenarios/chat.ts`, `demo/src/scenarios/connectionQueue.ts`, `demo/src/scenarios/serverEvents.ts`, `demo/src/scenarios/sseFailures.ts`, `demo/src/scenarios/sseReconnect.ts`, `demo/src/scenarios/sseStream.ts`, `tests/site/scenarios.test.ts`, `tests/site/serverPane.test.ts`, `tests/site/webSocketServer.test.ts`

**Interfaces:**
- Consumes: Task 1's `setupSummary` and `session.setupEnd`; Task 2's `EditorOptions.onRunAction`; Task 3's `BUTTON`, `tabList`, `Tab`, `timelineItem`
- Produces:
  - `type CodeLayout = 'normal' | 'wide'`, `CODE_LAYOUT_STORAGE_KEY = 'evem-code-layout'`, `GRID_ROWS`, `LAYOUTS: Record<CodeLayout, { grid; scenario; output; code }>`, `readCodeLayout(storage)`, `saveCodeLayout(storage, layout)` in `demo/src/playground/layout.ts`
  - `browserStorage(): Storage | undefined` from `demo/src/theme.ts`
  - The workbench's sections `aria-label`led Scenario, Output and Code; output tabs `output-tab-timeline`, `output-tab-lanes`, `output-tab-server`

- [ ] **Step 1: Write the layout's failing test**

Create `tests/site/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CODE_LAYOUT_STORAGE_KEY, LAYOUTS, readCodeLayout, saveCodeLayout } from '../../demo/src/playground/layout';

/** The cells of the wide grid (two columns, two rows) a card's `lg:` classes put it in */
function cells(classes: string): string[] {
  const column = Number(/lg:col-start-(\d)/.exec(classes)?.[1]);
  const row = Number(/lg:row-start-(\d)/.exec(classes)?.[1]);
  const span = Number(/lg:row-span-(\d)/.exec(classes)?.[1] ?? 1);
  return Array.from({ length: span }, (_, index) => `${column},${row + index}`);
}

describe('the workbench layouts', () => {
  it.each(Object.entries(LAYOUTS))('%s: the three cards fill the wide grid, each in its own cells', (_, layout) => {
    const taken = [layout.scenario, layout.output, layout.code].flatMap(cells);
    expect(taken.sort()).toEqual(['1,1', '1,2', '2,1', '2,2']);
  });

  it('gives the code the wide column, and its whole height, in the wide layout', () => {
    expect(cells(LAYOUTS.wide.code)).toEqual(['1,1', '1,2']);
    expect(LAYOUTS.wide.grid).toBe('lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]');
    expect(LAYOUTS.normal.grid).toBe('lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]');
  });
});

describe('the saved layout', () => {
  it('is the wide one only when saved so; anything else, nothing, or storage that fails is the normal one', () => {
    const saved = (value: string | null) => ({
      getItem: (key: string) => (key === CODE_LAYOUT_STORAGE_KEY ? value : null)
    });
    expect(readCodeLayout(saved('wide'))).toBe('wide');
    expect(readCodeLayout(saved('normal'))).toBe('normal');
    expect(readCodeLayout(saved('huge'))).toBe('normal');
    expect(readCodeLayout(saved(null))).toBe('normal');
    expect(readCodeLayout(undefined)).toBe('normal');
    expect(
      readCodeLayout({
        getItem: () => {
          throw new Error('blocked');
        }
      })
    ).toBe('normal');
  });

  it('is saved under its key, and storage that cannot be written is ignored', () => {
    const store = new Map<string, string>();
    saveCodeLayout({ setItem: (key, value) => void store.set(key, value) }, 'wide');
    expect(store.get(CODE_LAYOUT_STORAGE_KEY)).toBe('wide');
    expect(() =>
      saveCodeLayout(
        {
          setItem: () => {
            throw new Error('full');
          }
        },
        'normal'
      )
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/layout.test.ts`

Expected: FAIL: `Failed to load url ../../demo/src/playground/layout`, no tests run.

- [ ] **Step 3: Write the layouts, and share the theme's storage accessor**

Create `demo/src/playground/layout.ts`:

```ts
/**
 * How the workbench's cards share a wide screen: `normal` puts the code under the scenario's controls, beside the
 * output; `wide` gives the code the wide column at its full height, with the scenario and the output beside it (the
 * code's ▶ buttons still run its actions). Below the `lg` breakpoint the cards stack either way; there, `wide` only
 * makes the code taller.
 */
export type CodeLayout = 'normal' | 'wide';

export const CODE_LAYOUT_STORAGE_KEY = 'evem-code-layout';

/**
 * The grid's rows, in both layouts: the scenario's card as tall as its content, but never so tall that the row under
 * it (the code, or in the wide layout the output) gets less than 20rem; on a short screen the scenario's card scrolls
 * instead
 */
export const GRID_ROWS = 'lg:grid-rows-[minmax(0,max-content)_minmax(20rem,1fr)]';

/** The classes that place the grid's columns and each card (written out whole, for Tailwind) */
export interface LayoutClasses {
  grid: string;
  scenario: string;
  output: string;
  code: string;
}

export const LAYOUTS: Record<CodeLayout, LayoutClasses> = {
  normal: {
    grid: 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]',
    scenario: 'lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto',
    output: 'h-[32rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto lg:min-h-0',
    code: 'h-[28rem] lg:col-start-1 lg:row-start-2 lg:h-auto lg:min-h-0'
  },
  wide: {
    grid: 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]',
    scenario: 'lg:col-start-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto',
    output: 'h-[32rem] lg:col-start-2 lg:row-start-2 lg:h-auto lg:min-h-0',
    code: 'h-[85dvh] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-auto lg:min-h-0'
  }
};

/** The saved layout, or the normal one when there's none, it's unknown, or storage can't be read */
export function readCodeLayout(storage: Pick<Storage, 'getItem'> | undefined): CodeLayout {
  try {
    return storage?.getItem(CODE_LAYOUT_STORAGE_KEY) === 'wide' ? 'wide' : 'normal';
  } catch {
    return 'normal';
  }
}

/** Save the layout; storage that can't be written (private mode, blocked) is ignored */
export function saveCodeLayout(storage: Pick<Storage, 'setItem'> | undefined, layout: CodeLayout): void {
  try {
    storage?.setItem(CODE_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // The layout still applies to this page
  }
}
```

In `demo/src/theme.ts`, replace:

```ts
}

function storage(): Storage | undefined {
  try {
    return window.localStorage;
```

with:

```ts
}

/** The browser's localStorage, or undefined where it can't be reached (blocked, sandboxed) */
export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
```

In `demo/src/theme.ts`, replace:

```ts
  let choice = readChoice(storage());
```

with:

```ts
  let choice = readChoice(browserStorage());
```

In `demo/src/theme.ts`, replace:

```ts
    button.addEventListener('click', () => {
      choice = option.choice;
      saveChoice(storage(), choice);
      apply();
      details.removeAttribute('open');
```

with:

```ts
    button.addEventListener('click', () => {
      choice = option.choice;
      saveChoice(browserStorage(), choice);
      apply();
      details.removeAttribute('open');
```

- [ ] **Step 4: Run the test again**

Run: `pnpm test:nowatch tests/site/layout.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Rebuild the workbench, the page and the Server tab**

The workbench builds the three cards and places them from `LAYOUTS` (Expand switches and saves the layout); its output card holds the tabs, its timeline folds the setup and has Clear. The page's `main` becomes the viewport's height on wide screens. The server pane becomes a column that fits a tab: which server and its connections, a send row, one row of compact controls, then the log, which takes the rest. Its legend is a `div`, since daisyUI's `card-body` makes every `p` grow.

Replace all of `demo/src/playground/workbench.ts` with:

```ts
import type { EvEm } from '@jcfigueiredo/evem';
import { ActionGate } from '../actionGate';
import { el } from '../dom';
import { ScenarioSession, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { browserStorage } from '../theme';
import { isAtEnd, liveAnnouncement, setupSummary, timelineRows } from '../timeline';
import { renderLaneChart } from './laneChart';
import { GRID_ROWS, LAYOUTS, readCodeLayout, saveCodeLayout, type CodeLayout } from './layout';
import { serverPane } from './serverPane';
import { BUTTON, controlField, tabList, timelineItem, type Tab } from './views';

const CARD = 'card bg-base-100 border border-base-300';
const HEADING = 'text-xs uppercase tracking-widest text-base-content/70';

/**
 * Show a scenario in `root`, code beside output: on the left, the scenario's summary, controls and actions, with the
 * code right under them (its `// ▶` lines have run buttons); on the right, the output in tabs: what EvEm did (the
 * setup folded into one line), and for some scenarios the lane chart or the server. On wide screens both columns fill
 * the screen and scroll inside, so nothing pushes the code away from its controls. Expand gives the code the wide
 * column instead (remembered, see `layout.ts`). Returns a function that tears it down (subscriptions, editor,
 * connections).
 */
export async function mountWorkbench(root: HTMLElement, scenario: Scenario, bus: EvEm): Promise<() => void> {
  const session = new ScenarioSession(scenario, bus);
  // One action at a time; starting over (a control, Reset, edited code) frees the buttons from earlier runs
  const gate = new ActionGate();

  // What EvEm did: the setup folded away, then everything after it (from where the reader last cleared it)
  const setupList = el('ol', { class: 'relative ms-2 mt-2 space-y-1.5 border-s border-base-300' });
  const setupSummaryLine = el('summary', { class: 'cursor-pointer text-sm text-base-content/70' });
  const setupFold = el('details', { class: 'mb-3' }, [setupSummaryLine, setupList]);
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
  const timelineBox = el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [setupFold, timeline]);
  const clearButton = el('button', { type: 'button', class: 'btn btn-xs btn-ghost' }, ['Clear']);
  // The list is rebuilt on every render, so screen readers hear only what's new, from this status line
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  let announcedTrace = session.trace;
  let announcedRows = 0;
  // New rows are read out only after the reader did something (see liveAnnouncement)
  let lastInteraction = Number.NEGATIVE_INFINITY;
  const interacted = () => {
    lastInteraction = performance.now();
  };
  for (const type of ['click', 'change', 'keydown']) root.addEventListener(type, interacted);
  // The timeline follows new rows only for a reader at its end (and on a new trace, which starts at the top)
  let shownTrace = session.trace;
  // The first entry the timeline shows: after the setup, or after the reader cleared it
  let clearedFrom = 0;

  const summary = el('p', { class: 'text-sm text-base-content/70' }, [
    scenario.summary,
    ' ',
    el('a', { class: 'link link-primary', href: scenario.docs, target: '_blank', rel: 'noopener' }, ['Docs ↗'])
  ]);
  const controls = el('fieldset', { class: 'grid gap-x-3 sm:grid-cols-2' });
  const actions = el('div', { class: 'flex flex-wrap gap-2' });
  const editedBadge = el('span', { class: 'badge badge-warning badge-sm hidden' }, ['edited']);
  const codeHost = el('div', { class: 'min-h-0 flex-1' });
  const editButton = el('button', { type: 'button', class: BUTTON.other }, ['Edit']);
  const runEditedButton = el('button', { type: 'button', class: `${BUTTON.main} hidden` }, ['Run edited code']);
  const resetButton = el('button', { type: 'button', class: BUTTON.minor }, ['Reset']);
  const layoutButton = el('button', { type: 'button', class: BUTTON.minor });
  const editingNote = el('p', { class: 'grow-0 text-sm text-warning hidden' }, [
    'The code is edited, so the controls are off. Run it with ⌘/Ctrl+Enter; Reset goes back to the controls.'
  ]);

  const restart = async (change: () => Promise<void>) => {
    gate.reset();
    clearedFrom = 0;
    await change();
    editor.setCode(session.code);
    renderActions();
    renderTimeline();
  };

  // The output's tabs: what EvEm did; the lane chart (flow control); the server (adapters)
  const lanesHost = scenario.lanes ? el('div', {}) : undefined;
  const server =
    scenario.websocket || scenario.sse
      ? serverPane(session, local => restart(() => session.useLocalServer(local)))
      : undefined;
  const timelinePanel = el('div', { class: 'flex min-h-0 flex-1 flex-col' }, [timelineBox]);
  const outputTabs: Tab[] = [
    { id: 'timeline', label: 'What EvEm did', panel: timelinePanel },
    ...(lanesHost
      ? [{ id: 'lanes', label: 'Over time', panel: el('div', { class: 'min-h-0 flex-1 overflow-auto' }, [lanesHost]) }]
      : []),
    ...(server
      ? [
          {
            id: 'server',
            label: 'Server',
            panel: el('div', { class: 'flex min-h-0 flex-1 flex-col' }, [server.element])
          }
        ]
      : [])
  ];
  // What each tab had the last time the reader looked at it, for the counts on the others
  const seen = { timeline: 0, server: 0 };
  const tabs = tabList(outputTabs, {
    label: 'Output',
    idPrefix: 'output',
    initial: scenario.lanes ? 'lanes' : 'timeline',
    onSelect: id => {
      clearButton.classList.toggle('invisible', id !== 'timeline');
      scheduleRender();
    }
  });

  // Clear empties the timeline, so it's there only on that tab
  clearButton.classList.toggle('invisible', tabs.selected() !== 'timeline');

  const renderTimeline = () => {
    const entries = session.trace.entries;
    const setupEnd = session.setupEnd;
    const from = Math.max(setupEnd, clearedFrom);
    const setupEntries = clearedFrom === 0 ? entries.slice(0, setupEnd) : [];
    const rows = timelineRows(entries.slice(from));
    const follow = session.trace !== shownTrace || isAtEnd(timelineBox);
    shownTrace = session.trace;

    setupFold.hidden = setupEntries.length === 0;
    setupSummaryLine.textContent = setupSummary(setupEntries);
    setupList.replaceChildren(...timelineRows(setupEntries).map(timelineItem));
    timeline.replaceChildren(...rows.map(timelineItem));
    if (rows.length === 0) {
      const first = session.actions[0];
      timeline.append(
        el('li', { class: 'ps-4 text-sm text-base-content/60' }, [
          first ? `Nothing yet: press “${first.label}”, or ▶ in the code.` : 'Nothing yet.'
        ])
      );
    }
    if (follow) timelineBox.scrollTop = timelineBox.scrollHeight;
    if (lanesHost) renderLaneChart(lanesHost, laneChart(entries));
    server?.render();

    // Counts on the tabs the reader isn't looking at
    const wire = server ? (session.server?.wire.length ?? 0) : 0;
    if (tabs.selected() === 'timeline') seen.timeline = rows.length;
    if (tabs.selected() === 'server') seen.server = wire;
    tabs.setCount('timeline', rows.length - seen.timeline);
    if (server) tabs.setCount('server', wire - seen.server);

    // A new trace means the reader started over (a control, Reset, edited code): its setup isn't announced
    if (session.trace !== announcedTrace) {
      announcedTrace = session.trace;
      seen.timeline = rows.length;
      seen.server = wire;
    } else if (rows.length > announcedRows) {
      const text = liveAnnouncement(rows.slice(announcedRows), performance.now() - lastInteraction);
      if (text !== undefined) announcer.textContent = text;
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
  const wireSubscription = bus.subscribe('wire.entry', scheduleRender);
  // The chart's tick labels depend on its width: draw it again when that changes
  const resizes = lanesHost ? new ResizeObserver(() => scheduleRender()) : undefined;
  if (lanesHost) resizes?.observe(lanesHost);

  clearButton.addEventListener('click', () => {
    clearedFrom = session.trace.entries.length;
    announcedRows = 0;
    seen.timeline = 0;
    renderTimeline();
  });

  const runAction = async (id: string) => {
    const token = gate.start();
    if (token === undefined) return;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    try {
      await session.run(id);
    } finally {
      if (gate.end(token)) for (const button of actions.querySelectorAll('button')) button.disabled = false;
    }
  };

  const renderActions = () => {
    actions.replaceChildren(
      ...session.actions.map((action, index) => {
        const button = el('button', { type: 'button', class: index === 0 ? BUTTON.main : BUTTON.other }, [
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
        controlField(name, control, session.values[name]!, value => restart(() => session.setValue(name, value)))
      )
    );
    controls.disabled = session.edited;
  };

  const { createEditor } = await import('../editor');
  const runEdited = () => restart(() => session.edit(editor.getCode()));
  // The ▶ in the code's margin runs the action with that line's label, like its button
  const editor = createEditor(codeHost, session.code, () => void runEdited(), {
    onRunAction: label => {
      const action = session.actions.find(candidate => candidate.label === label);
      if (action) void runAction(action.id);
    }
  });

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
  resetButton.addEventListener('click', () => {
    setEditing(false);
    void restart(() => session.restoreTemplate());
  });

  const scenarioCard = el('section', { 'aria-label': 'Scenario' }, [
    el('div', { class: 'card-body gap-3 p-4' }, [summary, controls, actions])
  ]);
  const outputCard = el('section', { 'aria-label': 'Output' }, [
    el('div', { class: 'card-body min-h-0 flex-1 gap-3 p-4' }, [
      el('div', { class: 'flex items-center justify-between gap-2' }, [tabs.element, clearButton]),
      ...outputTabs.map(tab => tab.panel),
      announcer
    ])
  ]);
  const codeCard = el('section', { 'aria-label': 'Code' }, [
    el('div', { class: 'card-body min-h-0 flex-1 gap-3 p-4' }, [
      el('div', { class: 'flex flex-wrap items-center gap-2' }, [
        // "Code", and on wider columns "Code that runs": the header stays on one line beside its buttons
        el('h2', { class: `${HEADING} me-auto` }, [
          'Code',
          el('span', { class: 'hidden xl:inline' }, [' that runs']),
          ' ',
          editedBadge
        ]),
        editButton,
        runEditedButton,
        resetButton,
        layoutButton
      ]),
      editingNote,
      codeHost
    ])
  ]);
  const grid = el('div', {}, [scenarioCard, outputCard, codeCard]);
  // The cards' places come from the layout; the code's own buttons say which one it is and switch to the other
  const applyLayout = (layout: CodeLayout) => {
    const classes = LAYOUTS[layout];
    grid.className = `grid min-h-0 flex-1 grid-cols-1 gap-4 ${GRID_ROWS} ${classes.grid}`;
    scenarioCard.className = `${CARD} ${classes.scenario}`;
    outputCard.className = `${CARD} ${classes.output}`;
    codeCard.className = `${CARD} ${classes.code}`;
    const wide = layout === 'wide';
    layoutButton.replaceChildren(
      el('span', { 'aria-hidden': 'true' }, [wide ? '⤡' : '⤢']),
      wide ? ' Shrink' : ' Expand'
    );
    layoutButton.title = wide
      ? 'Put the code back under the controls'
      : 'Give the code the wide column; the controls and the output move beside it';
  };
  let layout = readCodeLayout(browserStorage());
  applyLayout(layout);
  layoutButton.addEventListener('click', () => {
    layout = layout === 'wide' ? 'normal' : 'wide';
    saveCodeLayout(browserStorage(), layout);
    applyLayout(layout);
  });

  root.replaceChildren(
    el('header', { class: 'flex shrink-0 flex-wrap items-baseline gap-x-3' }, [
      el('p', { class: HEADING }, [scenario.group]),
      el('h1', { class: 'font-mono text-2xl font-bold tracking-tight' }, [scenario.title])
    ]),
    grid
  );

  await session.reset();
  renderControls();
  renderActions();
  renderTimeline();

  return () => {
    for (const type of ['click', 'change', 'keydown']) root.removeEventListener(type, interacted);
    bus.unsubscribeById(traceSubscription);
    bus.unsubscribeById(wireSubscription);
    resizes?.disconnect();
    editor.destroy();
    // Leaving the scenario ends its connections, which would otherwise keep reconnecting
    session.stop();
  };
}
```

In `demo/playground/index.html`, replace:

```ts
          <span class="font-mono font-bold">evem playground</span>
        </header>
        <main id="workbench" class="mx-auto max-w-6xl p-4 lg:p-8"></main>
      </div>
      <div class="drawer-side z-20">
```

with:

```ts
          <span class="font-mono font-bold">evem playground</span>
        </header>
        <main id="workbench" class="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:h-dvh lg:p-6"></main>
      </div>
      <div class="drawer-side z-20">
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
import { checkLocalServer } from '../fakes/localSseServer';
import { isAtEnd } from '../timeline';
import type { FakeServer, WireEntry } from '../fakes/wire';

```

with:

```ts
import { checkLocalServer } from '../fakes/localSseServer';
import { isAtEnd } from '../timeline';
import { BUTTON } from './views';
import type { FakeServer, WireEntry } from '../fakes/wire';

```

In `demo/src/playground/serverPane.ts`, replace:

```ts

  const log = el('ol', { class: 'space-y-0.5 font-mono text-xs' });
  const logBox = el('div', { class: 'max-h-64 overflow-y-auto pe-2' }, [log]);
  const status = el('p', { class: 'text-sm text-base-content/70' });
  const button = (label: string, className: string, onClick: () => void) => {
```

with:

```ts

  const log = el('ol', { class: 'space-y-0.5 font-mono text-xs' });
  const logBox = el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [log]);
  const status = el('p', { class: 'text-sm text-base-content/70' });
  const button = (label: string, className: string, onClick: () => void) => {
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
  const frame = el('textarea', {
    class: 'textarea textarea-sm w-full font-mono text-xs',
    rows: '4',
    spellcheck: 'false',
    'aria-label': sse ? 'Text to write to the stream' : 'Frame to send to the client'
```

with:

```ts
  const frame = el('textarea', {
    class: 'textarea textarea-sm w-full font-mono text-xs',
    rows: '2',
    spellcheck: 'false',
    'aria-label': sse ? 'Text to write to the stream' : 'Frame to send to the client'
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
      ? el(
          'select',
          { class: 'select select-sm w-full', 'aria-label': 'Sample' },
          samples.map((sample, index) => el('option', { value: String(index) }, [sample.label]))
        )
```

with:

```ts
      ? el(
          'select',
          { class: 'select select-xs w-auto max-w-60', 'aria-label': 'Sample' },
          samples.map((sample, index) => el('option', { value: String(index) }, [sample.label]))
        )
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
  const statusSelect = el(
    'select',
    { class: 'select select-sm join-item w-20 shrink-0', 'aria-label': 'Status' },
    STATUSES.map(code => el('option', { value: code }, [code]))
  );
```

with:

```ts
  const statusSelect = el(
    'select',
    { class: 'select select-xs join-item w-16 shrink-0', 'aria-label': 'Status' },
    STATUSES.map(code => el('option', { value: code }, [code]))
  );
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
    max: '60',
    placeholder: 'Retry-After',
    class: 'input input-sm join-item min-w-0 flex-1',
    'aria-label': 'Retry-After, in seconds (optional)'
  });

  const simulated = el('div', { class: 'flex flex-col gap-2' }, [
    ...(sampleSelect ? [sampleSelect] : []),
    frame,
    button(sse ? 'Write to the stream' : 'Send to the client', 'btn btn-sm btn-primary', () =>
      run('send', frame.value)
    ),
    ...(sse
      ? [
          button('Write it in two chunks', 'btn btn-sm', () => run('split', frame.value)),
          el('div', { class: 'grid grid-cols-2 gap-2' }, [
            button('Heartbeat', 'btn btn-sm', () => run('ping')),
            button('Go silent', 'btn btn-sm', () => run('silent')),
            button('End the stream', 'btn btn-sm', () => run('end')),
            button('Drop it', 'btn btn-sm', () => run('drop'))
          ]),
          button('Refuse the next connection', 'btn btn-sm', () => run('refuse')),
          el('div', { class: 'join w-full' }, [
            statusSelect,
            retryAfter,
            button('Restart', 'btn btn-sm join-item shrink-0', () =>
              run('restart', `${statusSelect.value} ${retryAfter.value}`)
            )
          ]),
          el('p', { class: 'text-xs text-base-content/70' }, [
            'Restart ends the stream and answers the next request with that status (and Retry-After, in seconds).'
          ])
        ]
      : [
          button('Drop the connection', 'btn btn-sm', () => run('drop')),
          button('Refuse the next connection', 'btn btn-sm', () => run('refuse'))
        ])
  ]);

```

with:

```ts
    max: '60',
    placeholder: 'Retry-After',
    class: 'input input-xs join-item w-24',
    'aria-label': 'Retry-After, in seconds (optional)'
  });

  // The server's controls: a send row, the text to send, then one wrapping row of compact buttons
  const simulated = el('div', { class: 'flex flex-col gap-2' }, [
    el('div', { class: 'flex flex-wrap items-center gap-1.5' }, [
      ...(sampleSelect ? [sampleSelect] : []),
      button(sse ? 'Write to the stream' : 'Send to the client', 'btn btn-xs btn-primary', () =>
        run('send', frame.value)
      ),
      ...(sse ? [button('Write it in two chunks', BUTTON.server, () => run('split', frame.value))] : [])
    ]),
    frame,
    el(
      'div',
      { class: 'flex flex-wrap items-center gap-1.5' },
      sse
        ? [
            button('Heartbeat', BUTTON.server, () => run('ping')),
            button('Go silent', BUTTON.server, () => run('silent')),
            button('End the stream', BUTTON.server, () => run('end')),
            button('Drop it', BUTTON.server, () => run('drop')),
            button('Refuse the next connection', BUTTON.server, () => run('refuse')),
            el(
              'div',
              {
                class: 'join',
                title:
                  'Restart ends the stream and answers the next request with that status (and Retry-After, in seconds)'
              },
              [
                statusSelect,
                retryAfter,
                button('Restart', `${BUTTON.server} join-item`, () =>
                  run('restart', `${statusSelect.value} ${retryAfter.value}`)
                )
              ]
            )
          ]
        : [
            button('Drop the connection', BUTTON.server, () => run('drop')),
            button('Refuse the next connection', BUTTON.server, () => run('refuse'))
          ]
    )
  ]);

```

In `demo/src/playground/serverPane.ts`, replace:

```ts
        el('code', { class: 'font-mono text-xs break-all rounded bg-base-200 p-2' }, [local.command]),
        localStatus,
        button('Check again', 'btn btn-sm', () => void checkLocal())
      ])
    : undefined;
```

with:

```ts
        el('code', { class: 'font-mono text-xs break-all rounded bg-base-200 p-2' }, [local.command]),
        localStatus,
        button('Check again', BUTTON.server, () => void checkLocal())
      ])
    : undefined;
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
  const modeButtons = local
    ? ['Simulated', 'Local server'].map((label, index) =>
        button(label, 'btn btn-sm join-item flex-1', () => void switchServer(index === 1))
      )
    : [];

  const legend = el(
    'p',
    { class: 'mb-2 flex flex-wrap gap-x-4 text-xs text-base-content/70' },
    (['client', 'server', 'note'] as const).map(direction =>
      el('span', {}, [
```

with:

```ts
  const modeButtons = local
    ? ['Simulated', 'Local server'].map((label, index) =>
        button(label, 'btn btn-xs join-item', () => void switchServer(index === 1))
      )
    : [];

  // A div, not a p: daisyUI's card-body makes every p inside it grow, which would split the log's space with it
  const legend = el(
    'div',
    { class: 'flex flex-wrap gap-x-4 text-xs text-base-content/70' },
    (['client', 'server', 'note'] as const).map(direction =>
      el('span', {}, [
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
  };

  const element = el('div', { class: 'grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]' }, [
    el('div', { class: 'min-w-0' }, [legend, logBox]),
    el('div', { class: 'flex flex-col gap-2' }, [
      ...(local ? [el('div', { class: 'join w-full', role: 'group', 'aria-label': 'Which server' }, modeButtons)] : []),
      status,
      simulated,
      ...(localPanel ? [localPanel] : [])
    ])
  ]);
  showMode();
```

with:

```ts
  };

  // Top to bottom: which server and its connections, its controls, then the log, which takes the rest and scrolls
  const element = el('div', { class: 'flex min-h-0 flex-1 flex-col gap-3' }, [
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
      ...(local ? [el('div', { class: 'join', role: 'group', 'aria-label': 'Which server' }, modeButtons)] : []),
      status
    ]),
    simulated,
    ...(localPanel ? [localPanel] : []),
    legend,
    logBox
  ]);
  showMode();
```

- [ ] **Step 6: Run the type check and the site tests**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 23 files, 397 tests.

- [ ] **Step 7: Check the playground in the browser**

Start the dev server (`pnpm demo`, http://localhost:5173/) and open the playground in Chrome (Claude in Chrome); check `document.visibilityState` first (a hidden window throttles timers). Sizes and media need Playwright (a hidden Chrome window ignores resizing). Then:

- **Layout** (1440×900, Signal and Signal Light): *Publish & subscribe*, *Throttle + debounce* and SSE *Reconnect & resume*. The Scenario card with the code under it on the left, the output's tabs on the right; the page itself doesn't scroll, and the timeline and the code scroll inside their cards. *Throttle + debounce* opens on Over time. Every button reads as a button in both themes.
- **Expand** (the Code card's header): the code moves to the wide column at full height, the Scenario and Output cards stack beside it, and a ▶ still runs its action; Shrink goes back; the choice holds on another scenario and after a reload. While the SSE ticks run, Expand and Shrink: the timeline and the lane chart redraw at their new width.
- **Short windows** (Playwright, 1024×700 and 1280×720, both layouts): the page doesn't scroll, the Code card is at least its 20rem row, the Scenario card scrolls inside it, and the Code card's header stays on one line ("Code" below 1280 px).
- **Run buttons**: the ▶ in the margin of each `// ▶` line runs it like its button; a ▶ pressed during a run does nothing; Edit hides them and Reset brings them back.
- **Timeline**: the setup is one `Setup · …` line that opens; the code's logs are `›` chips; rows after an action show `+N ms`; Clear empties it (and is only on that tab); Reset, or a control, starts over with the setup folded again.
- **Tabs**: on the SSE scenario, Server counts new wire entries while What EvEm did is shown, and the count goes when the tab opens; the arrow keys, Home and End move between the tabs. The Server tab's controls are one compact row above the log, which fills the rest and stays at its end.
- **Phones** (Playwright, 375×800): the cards stack (Scenario, Output, Code) and nothing scrolls sideways.
- **Layout shift** (Playwright: a `layout-shift` PerformanceObserver installed before load, then a reload and 6 s): 0 on an SSE, a WebSocket and a flow control scenario.

Stop the dev server afterwards.

- [ ] **Step 8: Commit**

```bash
git add demo/src/playground/layout.ts tests/site/layout.test.ts demo/src/theme.ts demo/src/playground/workbench.ts demo/playground/index.html demo/src/playground/serverPane.ts
git commit -F - <<'EOF'
Demo: the playground shows the code beside the output

The Server card and the lane chart pushed the code down, and the code was out of reach of the controls. On wide screens the workbench is now the viewport's height, in two columns that scroll inside: the scenario's controls and actions with the code right under them, and the output in tabs (What EvEm did, Over time, Server) beside them. The code's row keeps at least 20rem, and Expand gives the code the wide column at full height, with the controls and the output beside it (remembered in localStorage). The timeline folds the setup into one line and has Clear; the Server tab's controls are one compact row.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

- [ ] **Step 9: Call the Server card the Server tab**

Wherever the text names it: the scenario summaries, a sample's text and the check that reads it, comments and test names.

In `demo/src/engine/session.ts`, replace:

```ts
}

/** A ready-made message for the Server card's send box */
export interface ServerSample {
  label: string;
```

with:

```ts
}

/** A ready-made message for the Server tab's send box */
export interface ServerSample {
  label: string;
```

In `demo/src/engine/session.ts`, replace:

```ts
   * A fake SSE server for the scenario: how it behaves, and samples for the server pane's send box. The code's
   * `SseHandler` reads from it unless the code passes its own `fetch` or another transport. With `local`, the
   * development server can switch to a real SSE server instead (`/events` is proxied to port 8000), and the Server card
   * shows `local.command` to start one.
   */
```

with:

```ts
   * A fake SSE server for the scenario: how it behaves, and samples for the server pane's send box. The code's
   * `SseHandler` reads from it unless the code passes its own `fetch` or another transport. With `local`, the
   * development server can switch to a real SSE server instead (`/events` is proxied to port 8000), and the Server tab
   * shows `local.command` to start one.
   */
```

In `demo/src/fakes/sseServer.ts`, replace:

```ts
 * An in-page SSE server for the playground: its `fetch` answers like a real server, with a `text/event-stream`
 * response whose body it writes with the library's `formatSseMessage` / `formatSseComment`, or with the status the
 * Server card asked for. It sends text whole or split mid-character, sends heartbeats, ends or drops its streams,
 * refuses connections or goes silent, and logs the requests, every chunk and what happened to each connection.
 */
```

with:

```ts
 * An in-page SSE server for the playground: its `fetch` answers like a real server, with a `text/event-stream`
 * response whose body it writes with the library's `formatSseMessage` / `formatSseComment`, or with the status the
 * Server tab asked for. It sends text whole or split mid-character, sends heartbeats, ends or drops its streams,
 * refuses connections or goes silent, and logs the requests, every chunk and what happened to each connection.
 */
```

In `demo/src/fakes/sseServer.ts`, replace:

```ts

  /**
   * The Server card's controls: `send <text>`, `split <text>` (in two chunks, mid-character if it can), `ping`,
   * `end`, `drop`, `refuse`, `silent`, and `restart <status> [<Retry-After seconds>]`
   */
```

with:

```ts

  /**
   * The Server tab's controls: `send <text>`, `split <text>` (in two chunks, mid-character if it can), `ping`,
   * `end`, `drop`, `refuse`, `silent`, and `restart <status> [<Retry-After seconds>]`
   */
```

In `demo/src/fakes/webSocketServer.ts`, replace:

```ts
  }

  /** The Server card's controls: `send <text>`, `drop`, `refuse` */
  run(command: string, argument = ''): void {
    if (command === 'send') this.send(argument);
```

with:

```ts
  }

  /** The Server tab's controls: `send <text>`, `drop`, `refuse` */
  run(command: string, argument = ''): void {
    if (command === 'send') this.send(argument);
```

In `demo/src/fakes/wire.ts`, replace:

```ts
}

/** What the Server card and the scenario checks need from a scenario's server */
export interface FakeServer {
  /** Everything sent each way, and what happened to connections, oldest first */
```

with:

```ts
}

/** What the Server tab and the scenario checks need from a scenario's server */
export interface FakeServer {
  /** Everything sent each way, and what happened to connections, oldest first */
```

In `demo/src/fakes/wire.ts`, replace:

```ts
  readonly openConnections: number;
  /**
   * Do what one of the Server card's controls does: `send` a text, `drop` the connections, … (each server has its
   * own). A check's `server:<command> <argument>` step calls it too.
   */
```

with:

```ts
  readonly openConnections: number;
  /**
   * Do what one of the Server tab's controls does: `send` a text, `drop` the connections, … (each server has its
   * own). A check's `server:<command> <argument>` step calls it too.
   */
```

In `demo/src/scenarios/chat.ts`, replace:

```ts
  title: 'Chat over WebSocket',
  summary:
    'A chat client: history by request, messages filtered to one room, and sends that wait in the queue while offline. Bo answers you; send messages from other rooms from the Server card.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#example-browser-chat',
  controls: { room: { kind: 'select', label: 'room', options: ['lobby', 'random'], default: 'lobby' } },
```

with:

```ts
  title: 'Chat over WebSocket',
  summary:
    'A chat client: history by request, messages filtered to one room, and sends that wait in the queue while offline. Bo answers you; send messages from other rooms from the Server tab.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#example-browser-chat',
  controls: { room: { kind: 'select', label: 'room', options: ['lobby', 'random'], default: 'lobby' } },
```

In `demo/src/scenarios/connectionQueue.ts`, replace:

```ts
  title: 'Connection & offline queue',
  summary:
    'WebSocketHandler connects EvEm to a socket: ws.send messages go out while connected, and wait in a queue while not. Drop the connection or refuse the next one from the Server card to see it reconnect and flush.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#offline-queue',
  controls: {
```

with:

```ts
  title: 'Connection & offline queue',
  summary:
    'WebSocketHandler connects EvEm to a socket: ws.send messages go out while connected, and wait in a queue while not. Drop the connection or refuse the next one from the Server tab to see it reconnect and flush.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#offline-queue',
  controls: {
```

In `demo/src/scenarios/serverEvents.ts`, replace:

```ts
  title: 'Server events & routing',
  summary:
    "Incoming messages are routed by their fields: an event (or the older type field) is published under a prefix, anything else as ws.message, and what doesn't parse as ws.parse.error. Send your own from the Server card.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-server-events.md',
  controls: {
```

with:

```ts
  title: 'Server events & routing',
  summary:
    "Incoming messages are routed by their fields: an event (or the older type field) is published under a prefix, anything else as ws.message, and what doesn't parse as ws.parse.error. Send your own from the Server tab.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-server-events.md',
  controls: {
```

In `demo/src/scenarios/serverEvents.ts`, replace:

```ts
    },
    {
      action: 'server:send {"event":"news.item","data":{"title":"From the Server card"}}',
      calls: ['news'],
      logs: ['news: From the Server card']
    }
  ],
  websocket: {
    latency: 30,
    sample: '{"event":"news.item","data":{"title":"From the Server card"}}',
    onMessage: (message, server) => {
      if ((message as { event?: string }).event !== 'news.subscribe') return;
```

with:

```ts
    },
    {
      action: 'server:send {"event":"news.item","data":{"title":"From the Server tab"}}',
      calls: ['news'],
      logs: ['news: From the Server tab']
    }
  ],
  websocket: {
    latency: 30,
    sample: '{"event":"news.item","data":{"title":"From the Server tab"}}',
    onMessage: (message, server) => {
      if ((message as { event?: string }).event !== 'news.subscribe') return;
```

In `demo/src/scenarios/sseFailures.ts`, replace:

```ts
  title: 'Failures',
  summary:
    'How a stream ends decides what SseHandler does: a 401 or 404 stops it, a 503 or 429 reconnects no sooner than Retry-After, a 204 stops it quietly, and a stream that goes silent past heartbeatTimeout is aborted and reconnected. The server sends : ping every second; restart it with a status, or make it go silent, from the Server card.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#how-a-connection-ends',
  controls: {
```

with:

```ts
  title: 'Failures',
  summary:
    'How a stream ends decides what SseHandler does: a 401 or 404 stops it, a 503 or 429 reconnects no sooner than Retry-After, a 204 stops it quietly, and a stream that goes silent past heartbeatTimeout is aborted and reconnected. The server sends : ping every second; restart it with a status, or make it go silent, from the Server tab.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#how-a-connection-ends',
  controls: {
```

In `demo/src/scenarios/sseReconnect.ts`, replace:

```ts
  title: 'Reconnect & resume',
  summary:
    "The server streams numbered ticks, each with its number as id, and ends the first stream after 5 (like examples/python/server.py --drop-after 5). SseHandler reconnects after the server's retry: delay and sends Last-Event-ID, so the ticks go on where they stopped. Drop or refuse connections from the Server card to see the backoff.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#resuming-with-last-event-id',
  controls: {
```

with:

```ts
  title: 'Reconnect & resume',
  summary:
    "The server streams numbered ticks, each with its number as id, and ends the first stream after 5 (like examples/python/server.py --drop-after 5). SseHandler reconnects after the server's retry: delay and sends Last-Event-ID, so the ticks go on where they stopped. Drop or refuse connections from the Server tab to see the backoff.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#resuming-with-last-event-id',
  controls: {
```

In `demo/src/scenarios/sseStream.ts`, replace:

```ts
  title: 'Stream & routing',
  summary:
    "SseHandler reads a text/event-stream and publishes each event: a named one as server.<name>, an unnamed { event, data } envelope the same way, anything else as sse.message, and data that doesn't parse as sse.parse.error. Write events to the stream from the Server card.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#routing',
  controls: {
```

with:

```ts
  title: 'Stream & routing',
  summary:
    "SseHandler reads a text/event-stream and publishes each event: a named one as server.<name>, an unnamed { event, data } envelope the same way, anything else as sse.message, and data that doesn't parse as sse.parse.error. Write events to the stream from the Server tab.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#routing',
  controls: {
```

In `tests/site/scenarios.test.ts`, replace:

```ts

/**
 * Run an action; a command to the scenario's server, `server:<command> <argument>` (what the Server card's controls
 * do: `server:drop`, `server:send <text>`, …); or `wait:<ms>`, which lets that much time pass
 */
```

with:

```ts

/**
 * Run an action; a command to the scenario's server, `server:<command> <argument>` (what the Server tab's controls
 * do: `server:drop`, `server:send <text>`, …); or `wait:<ms>`, which lets that much time pass
 */
```

In `tests/site/serverPane.test.ts`, replace:

```ts

describe('connectionStatus', () => {
  it("says what the Server card's connection count means, from the states of the code's handlers", () => {
    expect(connectionStatus(1, ['connected'])).toBe('1 open connection');
    expect(connectionStatus(2, ['connected', 'connected'])).toBe('2 open connections');
```

with:

```ts

describe('connectionStatus', () => {
  it("says what the Server tab's connection count means, from the states of the code's handlers", () => {
    expect(connectionStatus(1, ['connected'])).toBe('1 open connection');
    expect(connectionStatus(2, ['connected', 'connected'])).toBe('2 open connections');
```

In `tests/site/webSocketServer.test.ts`, replace:

```ts
  });

  it('runs the Server card controls by name, and refuses one it lacks', async () => {
    const { server, wire } = setup();
    await vi.advanceTimersByTimeAsync(20);
```

with:

```ts
  });

  it('runs the Server tab controls by name, and refuses one it lacks', async () => {
    const { server, wire } = setup();
    await vi.advanceTimersByTimeAsync(20);
```

- [ ] **Step 10: Run the site tests**

Run: `pnpm test:nowatch tests/site`

Expected: PASS, 23 files, 397 tests (the serverEvents check reads the renamed sample).

- [ ] **Step 11: Commit**

```bash
git add demo/src/engine/session.ts demo/src/fakes/sseServer.ts demo/src/fakes/webSocketServer.ts demo/src/fakes/wire.ts demo/src/scenarios/chat.ts demo/src/scenarios/connectionQueue.ts demo/src/scenarios/serverEvents.ts demo/src/scenarios/sseFailures.ts demo/src/scenarios/sseReconnect.ts demo/src/scenarios/sseStream.ts tests/site/scenarios.test.ts tests/site/serverPane.test.ts tests/site/webSocketServer.test.ts
git commit -F - <<'EOF'
Demo: the Server card is the Server tab

The server's log and controls moved into the output's tabs, so the scenarios' summaries ("drop the connection from the Server tab"), a sample's text, comments and test names say tab.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 5: The showcase's widgets: Output and Code tabs; the theme picker on phones

**Files:**
- Modify: `demo/src/showcase/widget.ts`
- Modify: `demo/src/theme.ts` (the picker's label)

**Interfaces:**
- Consumes: Task 2's `EditorOptions.onRunAction`; Task 3's `BUTTON` and `tabList`
- Produces: nothing new

- [ ] **Step 1: Give the widgets tabs, one editor load and reruns**

The Output and Code tabs replace Show code. The editor's import is one shared promise, so quick presses of Code can't create two editors (a 4a follow-up). A ▶ in the code shows Output and runs its action. A control change runs the first action again.

In `demo/src/showcase/widget.ts`, replace:

```ts
import { laneChart } from '../lanes';
import { renderLaneChart } from '../playground/laneChart';
import { controlField, timelineItem } from '../playground/views';
import { scenarioPath } from '../routing';
import { isAtEnd, liveAnnouncement, sinceLatestAction, timelineRows } from '../timeline';
```

with:

```ts
import { laneChart } from '../lanes';
import { renderLaneChart } from '../playground/laneChart';
import { BUTTON, controlField, tabList, timelineItem } from '../playground/views';
import { scenarioPath } from '../routing';
import { isAtEnd, liveAnnouncement, sinceLatestAction, timelineRows } from '../timeline';
```

In `demo/src/showcase/widget.ts`, replace:

```ts

/**
 * A scenario in the showcase, compact: its controls, its actions, and what EvEm did in the latest one (or, for flow
 * control, the lane chart), with "Show code" (the code it runs, loaded on demand, in the output's place) and a link to
 * the scenario in the playground. It fills its slot, whose height is fixed; the output scrolls inside. It's the
 * playground's own session, so the two pages can't disagree. It runs its first action once, to start with something
 * to see.
 */
export async function mountWidget(host: HTMLElement, scenario: Scenario): Promise<void> {
```

with:

```ts

/**
 * A scenario in the showcase, compact: its controls, its actions, and Output and Code tabs: what EvEm did in the
 * latest action (or, for flow control, the lane chart), and the code it runs (loaded the first time it's shown), with
 * a link to the scenario in the playground. It fills its slot, whose height is fixed; the output scrolls inside. It's
 * the playground's own session, so the two pages can't disagree. It runs its first action at the start, and again
 * when a control changes, so the output always matches the controls.
 */
export async function mountWidget(host: HTMLElement, scenario: Scenario): Promise<void> {
```

In `demo/src/showcase/widget.ts`, replace:

```ts
    : el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [timeline]);
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  const codeHost = el('div', { class: 'min-h-0 flex-1 overflow-auto hidden' });
  const codeButton = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false' }, [
    'Show code'
  ]);
  let editor: CodeEditor | undefined;

  let announced = 0;
```

with:

```ts
    : el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [timeline]);
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  const codeHost = el('div', { class: 'min-h-0 flex-1' });
  // The editor loads on demand, once, however quickly the Code tab is pressed
  let editor: Promise<CodeEditor> | undefined;
  const showCode = () =>
    (editor ??= import('../editor').then(({ createEditor }) =>
      createEditor(codeHost, session.code, () => undefined, {
        // The ▶ in the code's margin runs that action, and shows its output
        onRunAction: label => {
          const action = session.actions.find(candidate => candidate.label === label);
          if (!action) return;
          tabs.select('output');
          void run(action.id);
        }
      })
    ));
  // Output and code take turns in the card, whose height is fixed
  const tabs = tabList(
    [
      { id: 'output', label: 'Output', panel: output },
      { id: 'code', label: 'Code', panel: codeHost }
    ],
    { label: `${scenario.title}: output or code`, idPrefix: prefix, onSelect: id => void (id === 'code' && showCode()) }
  );

  let announced = 0;
```

In `demo/src/showcase/widget.ts`, replace:

```ts
    actions.replaceChildren(
      ...session.actions.map((action, index) => {
        const button = el('button', { type: 'button', class: index === 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm' }, [
          action.label
        ]);
```

with:

```ts
    actions.replaceChildren(
      ...session.actions.map((action, index) => {
        const button = el('button', { type: 'button', class: index === 0 ? BUTTON.main : BUTTON.other }, [
          action.label
        ]);
```

In `demo/src/showcase/widget.ts`, replace:

```ts
            gate.reset();
            await session.setValue(name, value);
            editor?.setCode(session.code);
            renderActions();
            render();
          },
          prefix
```

with:

```ts
            gate.reset();
            await session.setValue(name, value);
            void editor?.then(view => view.setCode(session.code));
            renderActions();
            render();
            // The output always matches the controls: run the first action again
            const first = session.actions[0];
            if (first) await run(first.id);
          },
          prefix
```

In `demo/src/showcase/widget.ts`, replace:

```ts
  };

  codeButton.addEventListener('click', async () => {
    // The code takes the output's place: the card's height is fixed
    const open = codeHost.classList.toggle('hidden') === false;
    output.classList.toggle('hidden', open);
    codeButton.textContent = open ? 'Show output' : 'Show code';
    codeButton.setAttribute('aria-expanded', String(open));
    if (open && !editor) {
      const { createEditor } = await import('../editor');
      editor = createEditor(codeHost, session.code, () => undefined);
    }
  });
  for (const type of ['click', 'change', 'keydown']) {
    host.addEventListener(type, () => {
```

with:

```ts
  };

  for (const type of ['click', 'change', 'keydown']) {
    host.addEventListener(type, () => {
```

In `demo/src/showcase/widget.ts`, replace:

```ts
      controls,
      actions,
      output,
      codeHost,
      announcer,
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        codeButton,
        el('a', { class: 'link link-primary text-sm', href: `./playground/${scenarioPath(scenario)}` }, [
          'Explore in the playground →'
        ])
      ])
    ])
  );
```

with:

```ts
      controls,
      actions,
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        tabs.element,
        el('a', { class: 'link link-primary text-sm', href: `./playground/${scenarioPath(scenario)}` }, [
          'Explore in the playground →'
        ])
      ]),
      output,
      codeHost,
      announcer
    ])
  );
```

- [ ] **Step 2: Run the type check and the site tests**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 23 files, 397 tests.

- [ ] **Step 3: Check the widgets in the browser**

With the dev server running (`pnpm demo`), open the showcase in Chrome and scroll to the features:

- **Tabs**: each widget has Output and Code tabs beside *Explore in the playground*; Code shows the scenario's code (loaded once: press Code, Output, Code quickly, and there is one editor); a ▶ in it runs that action and switches to Output.
- **Controls**: change a control (*Priorities*' audit priority, *Throttle + debounce*'s `throttleTime`): the widget runs its first action again, and the output matches the new value.
- **Buttons**: the first action is `btn-primary`, the others `btn-soft`, in both themes.

Stop the dev server afterwards.

- [ ] **Step 4: Commit**

```bash
git add demo/src/showcase/widget.ts
git commit -F - <<'EOF'
Demo: the showcase's widgets get Output and Code tabs

Show code swapped the output for the code behind one button; tabs say what's there and what else there is, like the playground's output. The code loads once however quickly the tab is pressed, its ▶ buttons run an action and show its output, and a control change runs the first action again, so the output always matches the controls.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

- [ ] **Step 5: Keep the theme picker's label on one line on phones**

In `demo/src/theme.ts`, replace:

```ts
  const summary = el('summary', { class: 'btn btn-sm btn-ghost w-full justify-between font-normal' }, [
    label,
    el('span', { 'aria-hidden': 'true' }, ['▾'])
  ]);
```

with:

```ts
  // On narrow screens the label is just the theme's name, on one line; its accessible name keeps "Theme:"
  const summary = el(
    'summary',
    { class: 'btn btn-sm btn-ghost w-full justify-between font-normal whitespace-nowrap' },
    [
      el('span', { class: 'hidden sm:inline', 'aria-hidden': 'true' }, ['Theme: ']),
      label,
      el('span', { 'aria-hidden': 'true' }, ['▾'])
    ]
  );
```

In `demo/src/theme.ts`, replace:

```ts
    const theme = resolveTheme(choice, media.matches);
    document.documentElement.setAttribute('data-theme', theme);
    label.textContent = `Theme: ${CHOICES.find(option => option.choice === choice)!.label}`;
    for (const button of menu.querySelectorAll('button')) {
      button.classList.toggle('menu-active', button.dataset['choice'] === choice);
```

with:

```ts
    const theme = resolveTheme(choice, media.matches);
    document.documentElement.setAttribute('data-theme', theme);
    const name = CHOICES.find(option => option.choice === choice)!.label;
    label.textContent = name;
    summary.setAttribute('aria-label', `Theme: ${name}`);
    for (const button of menu.querySelectorAll('button')) {
      button.classList.toggle('menu-active', button.dataset['choice'] === choice);
```

- [ ] **Step 6: Run the theme tests and the type check**

Run: `pnpm test:nowatch tests/site/theme.test.ts tests/site/themeBoot.test.ts && pnpm typecheck`

Expected: PASS, 2 files, 32 tests; the type check exits 0.

- [ ] **Step 7: Check it at 375 px**

Playwright, 375×800, both pages: the picker reads "Signal" on one line in the navbar (and "Theme: Signal" from 640 px), and its accessible name is "Theme: Signal".

- [ ] **Step 8: Commit**

```bash
git add demo/src/theme.ts
git commit -F - <<'EOF'
Demo: the theme picker's label fits a phone's navbar

On phones "Theme: Signal" wrapped onto two lines (a 4a follow-up). Below 640 px the label is just the theme's name, on one line; the summary's accessible name still says "Theme: …".

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 6: Docs, and everything CI runs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/demo-revamp-design.md` (status, the "UX pass" section, follow-ups)

**Interfaces:**
- Consumes: everything above
- Produces: nothing new

- [ ] **Step 1: Update the docs**

CLAUDE.md describes the new workbench, `layout.ts`, `BUTTON`, `tabList`, the Server tab and the widgets' tabs, and the `card-body` gotcha; the design doc gets the UX pass's status, its section (the user's choices, and Expand), loses the two 4a follow-ups this pass fixes, and gains the five minors of the layout-shift fixes' review (for 4b).

In `CLAUDE.md`, replace:

```markdown
Being rebuilt in phases (`docs/demo-revamp-design.md`; phases 2 (the foundation), 3 (the playground: 3a core scenarios, 3b flow control, 3c WebSocket, SSE and Recipes) and 4a (the showcase's hero and features) are done). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a scroll tour: the hero and the feature sections; the adapter cards, Why EvEm and the footer come in phase 4b) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

with:

```markdown
Being rebuilt in phases (`docs/demo-revamp-design.md`; phases 2 (the foundation), 3 (the playground: 3a core scenarios, 3b flow control, 3c WebSocket, SSE and Recipes) 4a (the showcase's hero and features) and the UX pass (code beside output) are done). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a scroll tour: the hero and the feature sections; the adapter cards, Why EvEm and the footer come in phase 4b) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

In `CLAUDE.md`, replace:

```markdown
- **Scenarios** (`demo/src/scenarios/`): one module per feature (`Scenario`: id, group, title, summary, docs link, controls, helpers, code template, checks, optional `explainMatches`, `lanes`, and a server: `websocket` or `sse`), listed in `index.ts` in sidebar order, each group together. The code is JavaScript the tests type-check with `noImplicitAny` off, so filters, validators and callbacks are written in it, as named constants where `subscribe` would type their parameter `unknown`; `helpers` are for functions it shouldn't show (their keys name them in the timeline, since minification renames bundled functions). Controls: `select` (`raw: true` writes the options as code, e.g. `ErrorPolicy.THROW`; an empty-string option is labeled `'' (empty)`, `optionLabel`), `number`, `toggle`, `text` (with `suggestions`). A check gives control `values`, `before` actions, the `action` and its `calls` in order, and optionally `result`, `rejects`, `logs` (in order), `skipped` (`name: reason`), `wire` (parts of the server's wire log, in order) and `wait` (ms to let pass after the action). In `before` and `action`, `server:<command> <argument>` runs a Server card control (`server.run()`) and `wait:<ms>` lets time pass. Scenarios with `sse` are checked with bounded time (a tick stream never runs out of timers): steps settle in 50 ms slices until done, then only `wait` adds time; `Math.random` is 0.5 (no reconnect jitter) and `location` is stubbed, so `SseHandler` takes relative URLs as in the page
- **Fake servers** (`demo/src/fakes/`): every scenario server is a `FakeServer` (`wire.ts`: `wire`, `openConnections`, `run(command, argument)` for the Server card's controls and checks, `close()`), logging through a `WireLog` (entries on the trace's clock, published on the playground bus as `wire.entry`, none after `close()`); `session.server` is new at every reset, and `session.stop()` (on every reset, and when the page leaves the scenario) disconnects the code's handlers and closes it. A scenario's `websocket` (`FakeWebSocketBehavior`: `latency`, request `methods`, `onMessage`, the send box's `sample`) gives it a `FakeWebSocketServer` (`webSocketServer.ts`): its `socketClass` makes `IWebSocket`s that open after the latency, like a browser's; it answers `{ type: 'request' }` by method (a thrown `{ code, message }` is an error response, a missing method a 404), drops connections (1006), refuses the next ones, and notes what it can't read or can't send (an answer after its connection closed). A scenario's `sse` (`FakeSseBehavior`: `latency`, `heartbeat`, `onOpen(stream)`, plus `samples` and `local`) gives it a `FakeSseServer` (`sseServer.ts`): its `fetch` answers with a `text/event-stream` body written with the library's `formatSseMessage` / `formatSseComment`, logs each request (`Last-Event-ID` and the code's headers), every chunk (`chunkText`: a character split across chunks shows as `\xNN`) and each connection's end; commands `send`, `split` (two chunks, mid-character), `ping`, `end`, `drop`, `refuse`, `silent`, `restart <status> [<Retry-After s>]`. With `sse.local`, development builds can switch to `LocalSseServer` (`localSseServer.ts`): the page's own `fetch` to a real server behind the dev proxy, with the same wire log; `checkLocalServer()` says whether it answers. In the code's scope, `WebSocketHandler` and `SseHandler` are subclasses that pass the server's `socketClass` / `fetch` unless the code gives its own (`WebSocketConstructor` or a socket; `fetch` or another `transport`), and what `WebSocketHandler` registers is named after it
- **UI**: `playground/main.ts` routes `#/<group>/<id>` (`routing.ts`) through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `wire.entry`, `theme.changed`); `playground/workbench.ts` shows a scenario (controls, actions, the timeline from `timeline.ts`, and the code panel, `editor.ts`, loaded lazily; with a scenario's `lanes`, `playground/laneChart.ts` draws the latest action over time from `lanes.ts`: a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back; with a scenario's `websocket` or `sse`, `playground/serverPane.ts` is the Server card: the wire log (line breaks shown as `↵`; rebuilt only when it grew, and kept at its end unless the reader scrolled up), a send box with the scenario's samples, the server's controls, and in development the switch to the local SSE server, with its command and whether it answers); `showcase/main.ts` mounts the showcase: the theme picker; copy buttons (`data-copy`); the hero's diagram (`showcase/heroFlow.ts`), animating a real EvEm wired in `showcase/flow.ts` (`createFlow`: a middleware that drops `debug.*`, three subscribers by pattern and priority), paused off screen, in a hidden tab or with its Pause button, and still with reduced motion (its `data-flow-live` parts hidden); and a widget (`showcase/widget.ts`) in each `data-scenario` slot once it nears the screen: the playground's `ScenarioSession` for that scenario, its controls and actions, the latest action's rows (`sinceLatestAction`) or its lane chart, Show code (CodeMirror loaded on demand) and a link to the scenario in the playground; it runs its first action once. The sections' text is static in `index.html`. `playground/views.ts` has `controlField` and `timelineItem`, shared by the workbench and the widgets; `theme.ts` is the picker (`evem-theme` in `localStorage`); `dom.ts` has `el()`, which only ever adds text, not HTML. Each page has an inline `<head>` script that applies the saved theme before the first paint, with `resolveTheme`'s rules (tested)
```

with:

```markdown
- **Scenarios** (`demo/src/scenarios/`): one module per feature (`Scenario`: id, group, title, summary, docs link, controls, helpers, code template, checks, optional `explainMatches`, `lanes`, and a server: `websocket` or `sse`), listed in `index.ts` in sidebar order, each group together. The code is JavaScript the tests type-check with `noImplicitAny` off, so filters, validators and callbacks are written in it, as named constants where `subscribe` would type their parameter `unknown`; `helpers` are for functions it shouldn't show (their keys name them in the timeline, since minification renames bundled functions). Controls: `select` (`raw: true` writes the options as code, e.g. `ErrorPolicy.THROW`; an empty-string option is labeled `'' (empty)`, `optionLabel`), `number`, `toggle`, `text` (with `suggestions`). A check gives control `values`, `before` actions, the `action` and its `calls` in order, and optionally `result`, `rejects`, `logs` (in order), `skipped` (`name: reason`), `wire` (parts of the server's wire log, in order) and `wait` (ms to let pass after the action). In `before` and `action`, `server:<command> <argument>` runs a Server tab control (`server.run()`) and `wait:<ms>` lets time pass. Scenarios with `sse` are checked with bounded time (a tick stream never runs out of timers): steps settle in 50 ms slices until done, then only `wait` adds time; `Math.random` is 0.5 (no reconnect jitter) and `location` is stubbed, so `SseHandler` takes relative URLs as in the page
- **Fake servers** (`demo/src/fakes/`): every scenario server is a `FakeServer` (`wire.ts`: `wire`, `openConnections`, `run(command, argument)` for the Server tab's controls and checks, `close()`), logging through a `WireLog` (entries on the trace's clock, published on the playground bus as `wire.entry`, none after `close()`); `session.server` is new at every reset, and `session.stop()` (on every reset, and when the page leaves the scenario) disconnects the code's handlers and closes it. A scenario's `websocket` (`FakeWebSocketBehavior`: `latency`, request `methods`, `onMessage`, the send box's `sample`) gives it a `FakeWebSocketServer` (`webSocketServer.ts`): its `socketClass` makes `IWebSocket`s that open after the latency, like a browser's; it answers `{ type: 'request' }` by method (a thrown `{ code, message }` is an error response, a missing method a 404), drops connections (1006), refuses the next ones, and notes what it can't read or can't send (an answer after its connection closed). A scenario's `sse` (`FakeSseBehavior`: `latency`, `heartbeat`, `onOpen(stream)`, plus `samples` and `local`) gives it a `FakeSseServer` (`sseServer.ts`): its `fetch` answers with a `text/event-stream` body written with the library's `formatSseMessage` / `formatSseComment`, logs each request (`Last-Event-ID` and the code's headers), every chunk (`chunkText`: a character split across chunks shows as `\xNN`) and each connection's end; commands `send`, `split` (two chunks, mid-character), `ping`, `end`, `drop`, `refuse`, `silent`, `restart <status> [<Retry-After s>]`. With `sse.local`, development builds can switch to `LocalSseServer` (`localSseServer.ts`): the page's own `fetch` to a real server behind the dev proxy, with the same wire log; `checkLocalServer()` says whether it answers. In the code's scope, `WebSocketHandler` and `SseHandler` are subclasses that pass the server's `socketClass` / `fetch` unless the code gives its own (`WebSocketConstructor` or a socket; `fetch` or another `transport`), and what `WebSocketHandler` registers is named after it
- **UI**: `playground/main.ts` routes `#/<group>/<id>` (`routing.ts`) through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `wire.entry`, `theme.changed`). `playground/workbench.ts` shows a scenario code beside output: on wide screens the page is the viewport's height (`main#workbench` is `lg:h-dvh`), with two columns that scroll inside (`playground/layout.ts`: the code's row gets at least 20rem, and the Scenario card scrolls on a short screen); on the left, the Scenario card (summary, controls, actions) and under it the code panel (`editor.ts`, loaded lazily; a ▶ button in the margin of each `// ▶ Label` line runs that action, `actionLabel`, and goes while the code is being edited); on the right, the Output card's tabs (`tabList`: What EvEm did; Over time with a scenario's `lanes`, the default tab then; Server with a `websocket` or `sse`), with a count of new entries on the tabs not shown. On phones it stacks: Scenario, Output, Code. The Code card's Expand switches to the `wide` layout (`LAYOUTS`): the code in the wide column at full height, the Scenario and Output cards beside it; remembered in `localStorage` (`evem-code-layout`, read and written like the theme, through `browserStorage()` from `theme.ts`). The timeline (`timeline.ts`) folds the setup (the entries before `session.setupEnd`) into one `Setup · …` line (`setupSummary`), shows what the code logged as a `›` console chip, times rows after an action as `+N ms` since it (`since`), and has a Clear button. `playground/laneChart.ts` draws the latest action over time from `lanes.ts` (a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back). `playground/serverPane.ts` is the Server tab: which server and its connections, a send row with the scenario's samples, one row of compact controls, then the wire log (line breaks shown as `↵`; rebuilt only when it grew, and kept at its end unless the reader scrolled up), plus in development the switch to the local SSE server. `playground/views.ts` has what both pages share: `BUTTON` (every button's daisyUI variant: `btn-primary` for the main action, `btn-soft` for the others, `btn-ghost` for minor ones), `controlField`, `timelineItem` and `tabList` (the WAI-ARIA tabs pattern). `actionGate.ts`: one action run at a time, and a reset frees the buttons from earlier runs. `showcase/main.ts` mounts the showcase: the theme picker; copy buttons (`data-copy`); the phone menu (`details[data-menu]`, which closes on a choice, Escape, a click or focus elsewhere); the hero's diagram (`showcase/heroFlow.ts`), animating a real EvEm wired in `showcase/flow.ts` (`createFlow`: a middleware that drops `debug.*`, three subscribers by pattern and priority), paused off screen, in a hidden tab or with its Pause button, and still with reduced motion (its label stays "How an event flows" and Pause invisible, so the card's size never changes); and a widget (`showcase/widget.ts`) in each `data-scenario` slot once it nears the screen: the playground's `ScenarioSession` for that scenario in a card of fixed height (`WIDGET_HEIGHT`, which the slot reserves), with its controls and actions and Output and Code tabs (the latest action's rows, `sinceLatestAction`, or its lane chart; the code, loaded once, with ▶ buttons), and a link to the scenario in the playground; it runs its first action at the start and again when a control changes. The sections' text is static in `index.html`. `theme.ts` is the picker (`evem-theme` in `localStorage`; on phones just the theme's name, on one line); `dom.ts` has `el()`, which only ever adds text, not HTML. Each page links `src/styles.css` in its head (a script import paints the page unstyled first on the dev server; `tests/site/pages.test.ts`) and has an inline `<head>` script that applies the saved theme before the first paint, with `resolveTheme`'s rules (tested). daisyUI's `card-body` makes every `p` inside it grow: use a `div` (or `grow-0`) in a card's flex column next to something that should take the free space
```

In `docs/demo-revamp-design.md`, replace:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3 (playground: 3a core scenarios, 3b flow control, 3c-1 WebSocket and Recipes, 3c-2 SSE and the local server switch) and 4a (showcase: navbar, hero, features) implemented; 4b and 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

with:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3 (playground: 3a core scenarios, 3b flow control, 3c-1 WebSocket and Recipes, 3c-2 SSE and the local server switch), 4a (showcase: navbar, hero, features) and the UX pass after 4a implemented; 4b and 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

In `docs/demo-revamp-design.md`, delete:

```markdown
| 4a review | Quick Show code clicks before the editor has loaded create two editors in a widget: reuse the pending import | 4 |
```

In `docs/demo-revamp-design.md`, replace:

```markdown
| 4a | On phones, the theme picker's "Theme: Signal" wraps onto two lines in the navbar | 4 |
```

with:

```markdown
| Layout-shift fixes' review | The phone menu closes on any `focusout` leaving it, including one with no `relatedTarget`: in Safari, where a click doesn't focus buttons or links, a menu opened from the keyboard could close before the link's click lands. Close only when `relatedTarget` is outside the menu (outside clicks are handled already); check in Safari | 4 |
| Layout-shift fixes' review | The navbar's two dropdowns close differently: the phone menu on an outside click, the theme picker not. Share the close rules | 4 |
| Layout-shift fixes' review | On phones the lanes widget scrolls sideways by 10 px: the chart's last tick label overhangs its track. Reserve half a label at the end of the track, or right-align the last label | 4 |
| Layout-shift fixes' review | On phones a widget's output is short (168 px with three controls) and kept at its end, so a run's first rows are out of view with no visible scrollbar: a taller card below `sm`, two control columns, or a fade at the top | 4 |
| Layout-shift fixes' review | `ActionGate.end` checks the token against both the holder and the generation, and the second check never decides: drop it, or say why both are there | 4 |
```

In `docs/demo-revamp-design.md`, replace:

```markdown
| 3c-2 review | `Scenario.sse.local` can be set on any SSE scenario, though only one whose simulated server matches what the Python examples serve should have it: say so on the field | 5 |
```

with:

```markdown
| 3c-2 review | `Scenario.sse.local` can be set on any SSE scenario, though only one whose simulated server matches what the Python examples serve should have it: say so on the field | 5 |

## UX pass (after 4a)

From the user's review of the playground on 2026-10-03: the Server card (and the lane chart) pushed the code down, the code was out of reach of the controls, and buttons didn't read as buttons. Choices made with the user:

- **Code beside output.** On wide screens the workbench is the viewport's height, in two columns that scroll inside: on the left, the scenario's summary, controls and actions, with the code right under them; on the right, the output in tabs: *What EvEm did*, *Over time* (scenarios with lanes, which open on it) and *Server* (scenarios with a server). A tab that isn't shown counts its new entries. On phones the columns stack: the scenario, the output, then the code.
- **Room for the code** (the user's follow-up: the code was compressed). The code's row never gets less than 20rem; on a short screen the scenario's card scrolls instead. *Expand*, in the code's header, gives the code the wide column at its full height, with the scenario and the output stacked beside it (the ▶ buttons still run every action); *Shrink* puts it back, and the choice is remembered (`evem-code-layout` in `localStorage`). On phones, *Expand* makes the code taller.
- **Run buttons in the code.** Each `// ▶` line of the code has a ▶ button in its margin that runs that action, like the action buttons (not while the code is being edited, when they could run something else than what's on screen).
- **Visible button styles.** Every button uses a daisyUI variant that reads as a button in both themes: `btn-primary` for the main action, `btn-soft` for the others, `btn-ghost` only for minor ones such as Reset. The Server tab's controls are one compact row above its log.
- **A calmer timeline.** The setup (what the code does at every reset, before any action) folds into one *Setup · N subscriptions, …* line that opens on click; what the code logged reads as console output, set apart from EvEm's own steps; rows after an action are timed from it (`+N ms`); a Clear button empties the timeline (the scenario keeps running).
- **Showcase widgets.** Each widget has *Output* and *Code* tabs (the code with its ▶ buttons, which show the output), and runs its first action again when a control changes, so the output always matches the controls.
```

- [ ] **Step 2: Run everything CI runs**

Run: `pnpm check`

Expected: exit 0: the format check, the type check, 72 test files (1,382 passed, 12 skipped) and the package check.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/demo-revamp-design.md
git commit -F - <<'EOF'
Docs: the UX pass

The design doc records the choices the user made for the playground (code beside output, run buttons in the code, visible button styles, a calmer timeline, tabs in the widgets, and Expand for the code), marks the pass done, closes the two 4a follow-ups it fixed and lists the minors of the layout-shift fixes' review for 4b. CLAUDE.md describes the new workbench and what both pages share.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```
