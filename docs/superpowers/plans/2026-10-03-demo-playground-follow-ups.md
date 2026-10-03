# Demo Playground Follow-ups Implementation Plan (Demo Revamp, Phase 4b-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the fourteen follow-ups left for phase 4: the timeline after Clear and the tab counts, the ▶ buttons during a run, the buttons and tabs that missed the UX pass, a legend for the lane chart, and the adapter cards' and footer's small issues from 4b-1's review.

**Architecture:** Small, local changes. The timeline's rows are computed over the whole trace and sliced afterwards (`rowsFrom`), so rows after Clear keep their `+N ms`; the tab counts compare entry indexes (`unseenRows`), so they don't depend on when the setup ends. The editor gets `setRunsEnabled`, which both pages call with their action buttons. `BUTTON` gains its compact forms; `tabList` focuses its own buttons and makes its panels focusable. The lane chart draws a legend. An adapter card announces once per click; the stamp runs per page.

**Tech Stack:** As phase 4b-1; no new dependencies.

**Spec:** `docs/demo-revamp-design.md`: the Follow-ups table's rows for phase 4 (3b review: the lane legend; the layout-shift fixes' review: `ActionGate`; the UX pass review's seven; 4b-1's and its review's five), which this plan removes, and "Phase 4"'s split agreed with the user on 2026-10-03 (4b-2 is the playground's follow-ups, before the 0.3.0 release).

## Global Constraints

- No runtime dependencies, and no new dev dependencies. Development needs Node.js 20.19+ or 22.12+ (Vite 8); the package's `engines` (`>=20`) don't change.
- The site imports the library only as `@jcfigueiredo/evem` and its subpaths (aliased to `src/`); `src/` isn't touched.
- Colors only through daisyUI semantic tokens (plus `--code-*`); every text pair meets WCAG AA, faded text included (`tests/site/contrast.test.ts`).
- Class names Tailwind must generate are written out in full in the source.
- DOM content from data goes through `el()`: strings become text nodes, never HTML.
- Every button uses a daisyUI variant that reads as a button in both themes, from `BUTTON` in `playground/views.ts`.
- Code style: Prettier (`pnpm format`), single quotes, 120 columns, no trailing commas; imports in the order packages, `../` paths, `./` paths.
- Commit messages: subject, a body that explains why, and the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW`.
- New tests go in `tests/site/`.

## Rulings made while planning (for review)

Every file in this plan was written and run first: `pnpm check` passed on the result (74 test files, 1,398 tests passed, 12 skipped, and the package check), and the playground and the showcase were checked with Playwright's Chromium (the ▶ buttons during a throttle burst, Clear on a running stream, the tab keys and Tab into a panel, the Server tab's buttons and the local server switch, the lane legend, an adapter card's announcement over a stream, the footer's titles and stamp). A dry run of the tasks in order, from `main`, confirmed each step's Expected result below and that the end state equals the validated files.

1. **Rows after Clear** are the whole trace's rows from where the timeline starts (`rowsFrom(entries, from)`: `timelineRows(entries).slice(from)`, which is one row per entry), so a row still nests under its publish and is timed `+N ms` from its action when those were cleared away. The empty timeline after Clear says "Cleared: what EvEm does next shows here." instead of asking for a press.
2. **Tab counts are entry indexes** (`unseenRows(total, from, seen)`): what's after both where the timeline starts and what the reader last saw. A new trace isn't news (`seen` is its length at the first render), and if that render came while the setup was still running, the rest of the setup drops out of the count once `setupEnd` is known, since `from` moves past it.
3. **The ▶ buttons are disabled while a run holds the actions** (`editor.setRunsEnabled`), like the action buttons, and dimmed; a press during a run is ignored even on a marker drawn while disabled. A reset (a control, Reset, edited code) frees them, as it frees the action buttons, since an old run may never end. In a widget, the editor may not be loaded yet, so the calls go through its promise.
4. **`BUTTON` gains `serverMain` (`btn-xs btn-primary`, the Server tab's send button) and `minorSmall` (`btn-xs btn-ghost`, Clear)**; the local server switch is `btn-xs btn-soft` with the server in use solid `btn-primary`, so the other half no longer reads as text.
5. **`tabList` focuses its own buttons** (not by id: while a workbench replaces another, two tab lists share ids), and its panels are focusable (`tabIndex = 0`), so after the tab row, Tab reaches the panel and the arrow keys scroll it.
6. **The lane chart's legend** sits under the chart (published, ran, held back by throttle or debounce), `aria-hidden`, since the chart's own label already says it in words; it's a `div`, not a `p` (`card-body` makes paragraphs grow).
7. **An adapter card announces once per click:** after an announcement, it waits for the reader's next interaction, so a stream doesn't read every tick for five seconds. Feature widgets and the workbench keep the five-second window, which a feature's run (a burst of keystrokes, say) needs.
8. **The footer's titles** are `text-base-content/70 opacity-100`, a pair the contrast test checks (daisyUI's `.footer-title` sets 60% opacity, which it didn't). **The stamp runs per page**, so the dev server's footer keeps up with new commits (one `git rev-parse` per page load). **An adapter card's tab list** is named "…: output, wire or code". **The widget test** waits for the fake connection with `vi.waitFor` instead of a fixed 150 ms.
9. **`ActionGate.end`** checks the token against the holder only, with a comment saying why that's enough (the holder is always the current generation, and `reset()` clears it).

## Review Focus

1. **Clear on a running stream, then Reset or a control change:** the rows after Clear keep `+N ms`, the counts on the hidden tabs stay right, and the timeline starts over with the setup folded. Chrome, Task 1.
2. **The ▶ buttons across resets:** during a run they're disabled; a control change or Reset during a run frees them at once; editing the code hides them, and Reset brings them back enabled. Chrome, Task 2.
3. **Keyboard on the output tabs:** the arrow keys move focus between the tabs; Tab from the tab row reaches the shown panel (Clear first, when it shows), and the arrow keys scroll it. Chrome, Task 3.
4. **An adapter card over a long stream:** one announcement per click, none for the ticks after it; the next click announces again. Chrome, Task 4.
5. **Both themes** for the lane legend's marks, the Server tab's buttons and the local server switch (development only), and the footer's titles. Chrome, Tasks 3 and 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `demo/src/timeline.ts` | `rowsFrom`, `unseenRows` |
| `demo/src/playground/workbench.ts` | Rows and counts from them; Clear's message; the ▶ buttons with the action buttons; Clear's button style |
| `demo/src/editor.ts` | `setRunsEnabled` and the disabled ▶ |
| `demo/src/showcase/widget.ts` | The ▶ buttons with the action buttons; an adapter card's single announcement and its tab list's name |
| `demo/src/actionGate.ts` | `end` checks the holder only |
| `demo/src/playground/views.ts` | `BUTTON.serverMain`, `BUTTON.minorSmall`; `tabList` focuses its buttons, panels focusable |
| `demo/src/playground/serverPane.ts` | Its send button and the server switch from `BUTTON` |
| `demo/src/playground/laneChart.ts` | The legend |
| `demo/index.html`, `demo/vite.config.ts` | The footer's titles; the stamp per page |
| `tests/site/timeline.test.ts`, `tests/site/widget.test.ts` | `rowsFrom`, `unseenRows`; the wait for the connection |
| `CLAUDE.md`, `docs/demo-revamp-design.md` | The behavior above; phase 4 done, its follow-ups gone |

---

### Task 1: The timeline after Clear, and the tab counts

**Files:**
- Modify: `demo/src/timeline.ts` (`rowsFrom`, `unseenRows`)
- Modify: `demo/src/playground/workbench.ts` (uses them; Clear's message)
- Test: `tests/site/timeline.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `rowsFrom(entries: readonly TraceEntry[], from: number): TimelineRow[]` (`timelineRows(entries).slice(from)`); `unseenRows(total: number, from: number, seen: number): number` (`max(0, total - max(from, seen))`)

- [ ] **Step 1: Write the failing tests**

In `tests/site/timeline.test.ts`, replace:

```ts
  liveAnnouncement,
  preview,
  setupSummary,
  sinceLatestAction,
  timelineRows
} from '../../demo/src/timeline';

```

with:

```ts
  liveAnnouncement,
  preview,
  rowsFrom,
  setupSummary,
  sinceLatestAction,
  timelineRows,
  unseenRows
} from '../../demo/src/timeline';

```

In `tests/site/timeline.test.ts`, replace:

```ts
});

describe('setupSummary', () => {
  it('counts what the setup made, in one line', () => {
```

with:

```ts
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:nowatch tests/site/timeline.test.ts`

Expected: FAIL, 2 failed | 28 passed (30): `TypeError: rowsFrom is not a function` and `TypeError: unseenRows is not a function`.

- [ ] **Step 3: Write `rowsFrom` and `unseenRows`**

In `demo/src/timeline.ts`, replace:

```ts
}

/** One line about a setup the timeline folds away: how many subscriptions, publishes, logs and errors it made */
export function setupSummary(entries: readonly TraceEntry[]): string {
```

with:

```ts
}

/**
 * The rows of the entries from `from` on (after the setup, or after the reader cleared the timeline), computed over
 * the whole trace, so a row still nests under its publish and is timed from its action when those come before `from`
 */
export function rowsFrom(entries: readonly TraceEntry[], from: number): TimelineRow[] {
  return timelineRows(entries).slice(from);
}

/**
 * How many of `total` entries a hidden timeline tab counts as new: those after both where the timeline starts
 * (`from`) and what the reader last saw (`seen`), as entry indexes, so a setup whose end isn't known yet stops
 * counting once it is
 */
export function unseenRows(total: number, from: number, seen: number): number {
  return Math.max(0, total - Math.max(from, seen));
}

/** One line about a setup the timeline folds away: how many subscriptions, publishes, logs and errors it made */
export function setupSummary(entries: readonly TraceEntry[]): string {
```

- [ ] **Step 4: Run the tests again**

Run: `pnpm test:nowatch tests/site/timeline.test.ts`

Expected: PASS, 30 tests.

- [ ] **Step 5: Use them in the workbench, and say when the timeline was cleared**

The rows come from `rowsFrom`; the timeline tab's count compares entry indexes (`seen.timeline` is the entry count the reader saw, and the trace's length when it's new); Clear no longer resets it; the empty timeline after Clear says so.

In `demo/src/playground/workbench.ts`, replace:

```ts
import { laneChart } from '../lanes';
import { browserStorage } from '../theme';
import { keepsFollowing, liveAnnouncement, setupSummary, timelineRows } from '../timeline';
import { renderLaneChart } from './laneChart';
import { GRID_ROWS, LAYOUTS, readCodeLayout, saveCodeLayout, type CodeLayout } from './layout';
```

with:

```ts
import { laneChart } from '../lanes';
import { browserStorage } from '../theme';
import { keepsFollowing, liveAnnouncement, rowsFrom, setupSummary, timelineRows, unseenRows } from '../timeline';
import { renderLaneChart } from './laneChart';
import { GRID_ROWS, LAYOUTS, readCodeLayout, saveCodeLayout, type CodeLayout } from './layout';
```

In `demo/src/playground/workbench.ts`, replace:

```ts
    const from = Math.max(setupEnd, clearedFrom);
    const setupEntries = clearedFrom === 0 ? entries.slice(0, setupEnd) : [];
    const rows = timelineRows(entries.slice(from));
    followTimeline = session.trace !== shownTrace || keepsFollowing(timelineBox, followTimeline);
    shownTrace = session.trace;
```

with:

```ts
    const from = Math.max(setupEnd, clearedFrom);
    const setupEntries = clearedFrom === 0 ? entries.slice(0, setupEnd) : [];
    const rows = rowsFrom(entries, from);
    followTimeline = session.trace !== shownTrace || keepsFollowing(timelineBox, followTimeline);
    shownTrace = session.trace;
```

In `demo/src/playground/workbench.ts`, replace:

```ts
      timeline.append(
        el('li', { class: 'ps-4 text-sm text-base-content/60' }, [
          first ? `Nothing yet: press “${first.label}”, or ▶ in the code.` : 'Nothing yet.'
        ])
      );
```

with:

```ts
      timeline.append(
        el('li', { class: 'ps-4 text-sm text-base-content/60' }, [
          clearedFrom > 0
            ? 'Cleared: what EvEm does next shows here.'
            : first
              ? `Nothing yet: press “${first.label}”, or ▶ in the code.`
              : 'Nothing yet.'
        ])
      );
```

In `demo/src/playground/workbench.ts`, replace:

```ts
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
```

with:

```ts
    // Counts on the tabs the reader isn't looking at
    const wire = server ? (session.server?.wire.length ?? 0) : 0;
    if (tabs.selected() === 'timeline') seen.timeline = entries.length;
    if (tabs.selected() === 'server') seen.server = wire;
    tabs.setCount('timeline', unseenRows(entries.length, from, seen.timeline));
    if (server) tabs.setCount('server', wire - seen.server);

    // A new trace means the reader started over (a control, Reset, edited code): what it holds isn't news (seen is an
    // entry index, so the rest of a setup still running drops out once its end is known)
    if (session.trace !== announcedTrace) {
      announcedTrace = session.trace;
      seen.timeline = entries.length;
      seen.server = wire;
    } else if (rows.length > announcedRows) {
```

In `demo/src/playground/workbench.ts`, replace:

```ts
    clearedFrom = session.trace.entries.length;
    announcedRows = 0;
    seen.timeline = 0;
    renderTimeline();
  });
```

with:

```ts
    clearedFrom = session.trace.entries.length;
    announcedRows = 0;
    renderTimeline();
  });
```

- [ ] **Step 6: Run the type check and the site tests**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 25 files, 413 tests.

- [ ] **Step 7: Commit**

```bash
git add demo/src/timeline.ts demo/src/playground/workbench.ts tests/site/timeline.test.ts
git commit -F - <<'EOF'
Demo: rows after Clear keep their time, and tab counts follow entries

The timeline computed its rows from the slice it showed, so rows after Clear lost the action they're timed from (and the publish they nest under), and read times since the reset. rowsFrom computes them over the whole trace and slices afterwards. The timeline tab's count was a row count taken at a new trace's first render, right only while setups are synchronous; unseenRows compares entry indexes, so the rest of a setup still running drops out once its end is known. After Clear, the empty timeline says it was cleared instead of asking for a press.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 2: The ▶ buttons during a run

**Files:**
- Modify: `demo/src/editor.ts` (`setRunsEnabled`)
- Modify: `demo/src/playground/workbench.ts`, `demo/src/showcase/widget.ts` (call it with their action buttons)
- Modify: `demo/src/actionGate.ts` (`end`)

**Interfaces:**
- Consumes: nothing new
- Produces: `CodeEditor.setRunsEnabled(enabled: boolean): void` (the ▶ buttons' `disabled`; a press while disabled is ignored)

- [ ] **Step 1: Let the editor disable its ▶ buttons**

In `demo/src/editor.ts`, replace:

```ts
  setCode(code: string): void;
  setEditable(editable: boolean): void;
  focus(): void;
  destroy(): void;
```

with:

```ts
  setCode(code: string): void;
  setEditable(editable: boolean): void;
  /** Whether the ▶ buttons can run their action: off while a run holds the actions, like the action buttons */
  setRunsEnabled(enabled: boolean): void;
  focus(): void;
  destroy(): void;
```

In `demo/src/editor.ts`, replace:

```ts
      padding: '3px 5px'
    },
    '.cm-run:hover': { backgroundColor: 'color-mix(in oklch, var(--code-string) 18%, transparent)' },
    // Keyboard focus needs a ring that stands out from the code panel (3:1, pinned in contrast.test.ts)
    '.cm-run:focus-visible': { outline: '2px solid var(--code-string)', outlineOffset: '1px' },
```

with:

```ts
      padding: '3px 5px'
    },
    '.cm-run:disabled': { opacity: '0.35', cursor: 'default' },
    '.cm-run:hover:not(:disabled)': { backgroundColor: 'color-mix(in oklch, var(--code-string) 18%, transparent)' },
    // Keyboard focus needs a ring that stands out from the code panel (3:1, pinned in contrast.test.ts)
    '.cm-run:focus-visible': { outline: '2px solid var(--code-string)', outlineOffset: '1px' },
```

In `demo/src/editor.ts`, replace:

```ts
/** A ▶ button in the margin of an action's line */
class RunMarker extends GutterMarker {
  constructor(readonly label: string) {
    super();
  }
```

with:

```ts
/** A ▶ button in the margin of an action's line */
class RunMarker extends GutterMarker {
  constructor(
    readonly label: string,
    readonly enabled: () => boolean
  ) {
    super();
  }
```

In `demo/src/editor.ts`, replace:

```ts
    button.title = `Run “${this.label}”`;
    button.setAttribute('aria-label', `Run “${this.label}”`);
    return button;
  }
```

with:

```ts
    button.title = `Run “${this.label}”`;
    button.setAttribute('aria-label', `Run “${this.label}”`);
    button.disabled = !this.enabled();
    return button;
  }
```

In `demo/src/editor.ts`, replace:

```ts

/** The margin with a ▶ button on each `// ▶ Label` line, which calls `onRunAction` with the label */
function runGutter(onRunAction: (label: string) => void) {
  return gutter({
    class: 'cm-run-gutter',
```

with:

```ts

/** The margin with a ▶ button on each `// ▶ Label` line, which calls `onRunAction` with the label */
function runGutter(onRunAction: (label: string) => void, enabled: () => boolean) {
  return gutter({
    class: 'cm-run-gutter',
```

In `demo/src/editor.ts`, replace:

```ts
        const line = view.state.doc.line(number);
        const label = actionLabel(line.text);
        if (label !== undefined) markers.add(line.from, line.from, new RunMarker(label));
      }
      return markers.finish();
```

with:

```ts
        const line = view.state.doc.line(number);
        const label = actionLabel(line.text);
        if (label !== undefined) markers.add(line.from, line.from, new RunMarker(label, enabled));
      }
      return markers.finish();
```

In `demo/src/editor.ts`, replace:

```ts
      click: (view, block, event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.cm-run')) return false;
        const label = actionLabel(view.state.doc.lineAt(block.from).text);
        if (label !== undefined) onRunAction(label);
```

with:

```ts
      click: (view, block, event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.cm-run')) return false;
        if (!enabled()) return true;
        const label = actionLabel(view.state.doc.lineAt(block.from).text);
        if (label !== undefined) onRunAction(label);
```

In `demo/src/editor.ts`, replace:

```ts
  // The ▶ buttons run the program that's running, so they go while the code is being edited
  const runButtons = new Compartment();
  const runs = (on: boolean) => (on && options.onRunAction ? runGutter(options.onRunAction) : []);
  const readOnly = (on: boolean) => [EditorView.editable.of(!on), EditorState.readOnly.of(on)];
  const view = new EditorView({
```

with:

```ts
  // The ▶ buttons run the program that's running, so they go while the code is being edited
  const runButtons = new Compartment();
  let runsEnabled = true;
  const runs = (on: boolean) => (on && options.onRunAction ? runGutter(options.onRunAction, () => runsEnabled) : []);
  const readOnly = (on: boolean) => [EditorView.editable.of(!on), EditorState.readOnly.of(on)];
  const view = new EditorView({
```

In `demo/src/editor.ts`, replace:

```ts
    setEditable: on =>
      view.dispatch({ effects: [editable.reconfigure(readOnly(!on)), runButtons.reconfigure(runs(!on))] }),
    focus: () => view.focus(),
    destroy: () => view.destroy()
```

with:

```ts
    setEditable: on =>
      view.dispatch({ effects: [editable.reconfigure(readOnly(!on)), runButtons.reconfigure(runs(!on))] }),
    setRunsEnabled: enabled => {
      runsEnabled = enabled;
      for (const button of view.dom.querySelectorAll<HTMLButtonElement>('.cm-run')) button.disabled = !enabled;
    },
    focus: () => view.focus(),
    destroy: () => view.destroy()
```

- [ ] **Step 2: Disable them with the action buttons on both pages**

A run disables them and its end enables them, when it still holds the gate; a reset (a control, Reset, edited code) enables them, as it frees the action buttons. The widget reaches its editor through the promise that loads it.

In `demo/src/playground/workbench.ts`, replace:

```ts
    await change();
    editor.setCode(session.code);
    renderActions();
    renderTimeline();
```

with:

```ts
    await change();
    editor.setCode(session.code);
    // A run from before the reset may never end: the ▶ buttons are free again, like the action buttons
    editor.setRunsEnabled(true);
    renderActions();
    renderTimeline();
```

In `demo/src/playground/workbench.ts`, replace:

```ts
    if (token === undefined) return;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    try {
      await session.run(id);
    } finally {
      if (gate.end(token)) for (const button of actions.querySelectorAll('button')) button.disabled = false;
    }
  };
```

with:

```ts
    if (token === undefined) return;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    editor.setRunsEnabled(false);
    try {
      await session.run(id);
    } finally {
      if (gate.end(token)) {
        for (const button of actions.querySelectorAll('button')) button.disabled = false;
        editor.setRunsEnabled(true);
      }
    }
  };
```

In `demo/src/showcase/widget.ts`, replace:

```ts
    for (const button of actions.querySelectorAll<HTMLButtonElement>('button:not([data-server-control])'))
      button.disabled = true;
    if (!adapter) announced = 0;
    try {
```

with:

```ts
    for (const button of actions.querySelectorAll<HTMLButtonElement>('button:not([data-server-control])'))
      button.disabled = true;
    void editor?.then(view => view.setRunsEnabled(false));
    if (!adapter) announced = 0;
    try {
```

In `demo/src/showcase/widget.ts`, replace:

```ts
        for (const button of actions.querySelectorAll<HTMLButtonElement>('button:not([data-server-control])'))
          button.disabled = false;
      }
    }
```

with:

```ts
        for (const button of actions.querySelectorAll<HTMLButtonElement>('button:not([data-server-control])'))
          button.disabled = false;
        void editor?.then(view => view.setRunsEnabled(true));
      }
    }
```

In `demo/src/showcase/widget.ts`, replace:

```ts
            gate.reset();
            await session.setValue(name, value);
            void editor?.then(view => view.setCode(session.code));
            renderActions();
            announced = 0;
```

with:

```ts
            gate.reset();
            await session.setValue(name, value);
            void editor?.then(view => {
              view.setCode(session.code);
              view.setRunsEnabled(true);
            });
            renderActions();
            announced = 0;
```

- [ ] **Step 3: Say why `ActionGate.end` checks the holder only**

A refactor: the second check never decided (`tests/site/actionGate.test.ts` covers the interleavings).

In `demo/src/actionGate.ts`, replace:

```ts
  /** A run ended: true if it still held the buttons (so they can be enabled again) */
  end(token: number): boolean {
    if (token !== this.holder || token !== this.generation) return false;
    this.holder = undefined;
    return true;
```

with:

```ts
  /** A run ended: true if it still held the buttons (so they can be enabled again) */
  end(token: number): boolean {
    // The holder is always the current generation, and reset() clears it, so an older run's token never matches
    if (token !== this.holder) return false;
    this.holder = undefined;
    return true;
```

- [ ] **Step 4: Run the type check and the site tests**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 25 files, 413 tests.

- [ ] **Step 5: Check it in the browser**

With `pnpm demo`, in the playground: *Throttle + debounce*, press the ▶ on `// ▶ Type "hello world"`: during the burst the ▶ is dimmed and disabled with the action button, and enabled after; change `throttleTime` during a burst: both are enabled at once. Edit hides the ▶ and Reset brings it back enabled. In the showcase's *Throttle & debounce* widget, open Code and press its ▶: Output shows, and the ▶ is disabled until the burst ends.

- [ ] **Step 6: Commit**

```bash
git add demo/src/editor.ts demo/src/playground/workbench.ts demo/src/showcase/widget.ts demo/src/actionGate.ts
git commit -F - <<'EOF'
Demo: the code's ▶ buttons are disabled while a run holds the actions

A ▶ pressed during a run did nothing, quietly, while the action buttons showed they were busy. The editor's setRunsEnabled disables the ▶ buttons (dimmed, and a press ignored), and both pages call it with their action buttons; a reset frees them too. ActionGate.end now checks the holder only, which is always the current generation, and says so.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 3: Buttons, tabs, and the lane chart's legend

**Files:**
- Modify: `demo/src/playground/views.ts` (`BUTTON`, `tabList`)
- Modify: `demo/src/playground/serverPane.ts`
- Modify: `demo/src/playground/workbench.ts` (Clear's style)
- Modify: `demo/src/playground/laneChart.ts` (the legend)

**Interfaces:**
- Consumes: nothing new
- Produces: `BUTTON.serverMain` (`'btn btn-xs btn-primary'`) and `BUTTON.minorSmall` (`'btn btn-xs btn-ghost'`); `tabList`'s panels have `tabIndex = 0`

- [ ] **Step 1: Compact buttons from `BUTTON`, and tabs that focus their own buttons**

In `demo/src/playground/views.ts`, replace:

```ts
 * The buttons' looks, in one place: the main action (`btn-primary`), the other actions (`btn-soft`, which reads as a
 * button in both themes: plain `btn` is nearly the card's own color in Signal), minor ones (`btn-ghost`), and the
 * Server tab's compact controls
 */
export const BUTTON = {
```

with:

```ts
 * The buttons' looks, in one place: the main action (`btn-primary`), the other actions (`btn-soft`, which reads as a
 * button in both themes: plain `btn` is nearly the card's own color in Signal), minor ones (`btn-ghost`), and the
 * compact ones (the Server tab's controls, its send button, Clear)
 */
export const BUTTON = {
```

In `demo/src/playground/views.ts`, replace:

```ts
  other: 'btn btn-sm btn-soft',
  minor: 'btn btn-sm btn-ghost',
  server: 'btn btn-xs btn-soft'
} as const;

```

with:

```ts
  other: 'btn btn-sm btn-soft',
  minor: 'btn btn-sm btn-ghost',
  server: 'btn btn-xs btn-soft',
  serverMain: 'btn btn-xs btn-primary',
  minorSmall: 'btn btn-xs btn-ghost'
} as const;

```

In `demo/src/playground/views.ts`, replace:

```ts
    tab.panel.setAttribute('role', 'tabpanel');
    tab.panel.setAttribute('aria-labelledby', button.id);
    button.addEventListener('click', () => select(tab.id));
    button.addEventListener('keydown', event => {
```

with:

```ts
    tab.panel.setAttribute('role', 'tabpanel');
    tab.panel.setAttribute('aria-labelledby', button.id);
    // Focusable, so the keyboard can scroll a panel of plain rows after leaving the tab row
    tab.panel.tabIndex = 0;
    button.addEventListener('click', () => select(tab.id));
    button.addEventListener('keydown', event => {
```

In `demo/src/playground/views.ts`, replace:

```ts
      if (index === undefined) return;
      const next = tabs[index]!;
      event.preventDefault();
      select(next.id);
      document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
    });
    return button;
```

with:

```ts
      if (index === undefined) return;
      const next = tabs[index]!;
      const nextButton = buttons[index]!;
      event.preventDefault();
      select(next.id);
      // The button itself, not by id: while a scenario's workbench replaces another, two lists can share ids
      nextButton.focus();
    });
    return button;
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
    el('div', { class: 'flex flex-wrap items-center gap-1.5' }, [
      ...(sampleSelect ? [sampleSelect] : []),
      button(sse ? 'Write to the stream' : 'Send to the client', 'btn btn-xs btn-primary', () =>
        run('send', frame.value)
      ),
      ...(sse ? [button('Write it in two chunks', BUTTON.server, () => run('split', frame.value))] : [])
    ]),
```

with:

```ts
    el('div', { class: 'flex flex-wrap items-center gap-1.5' }, [
      ...(sampleSelect ? [sampleSelect] : []),
      button(sse ? 'Write to the stream' : 'Send to the client', BUTTON.serverMain, () => run('send', frame.value)),
      ...(sse ? [button('Write it in two chunks', BUTTON.server, () => run('split', frame.value))] : [])
    ]),
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
    modeButtons.forEach((element, index) => {
      const active = (index === 1) === session.localServer;
      element.classList.toggle('btn-primary', active);
      element.setAttribute('aria-pressed', String(active));
    });
```

with:

```ts
    modeButtons.forEach((element, index) => {
      const active = (index === 1) === session.localServer;
      // The server in use is solid primary; the other one soft, so it still reads as a button
      element.classList.toggle('btn-primary', active);
      element.classList.toggle('btn-soft', !active);
      element.setAttribute('aria-pressed', String(active));
    });
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
  const modeButtons = local
    ? ['Simulated', 'Local server'].map((label, index) =>
        button(label, 'btn btn-xs join-item', () => void switchServer(index === 1))
      )
    : [];
```

with:

```ts
  const modeButtons = local
    ? ['Simulated', 'Local server'].map((label, index) =>
        button(label, `${BUTTON.server} join-item`, () => void switchServer(index === 1))
      )
    : [];
```

In `demo/src/playground/workbench.ts`, replace:

```ts
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
  const timelineBox = el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [setupFold, timeline]);
  const clearButton = el('button', { type: 'button', class: 'btn btn-xs btn-ghost' }, ['Clear']);
  // The list is rebuilt on every render, so screen readers hear only what's new, from this status line
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
```

with:

```ts
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
  const timelineBox = el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [setupFold, timeline]);
  const clearButton = el('button', { type: 'button', class: BUTTON.minorSmall }, ['Clear']);
  // The list is rebuilt on every render, so screen readers hear only what's new, from this status line
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
```

- [ ] **Step 2: Draw a legend under the lane chart**

In `demo/src/playground/laneChart.ts`, replace:

```ts
  held: 'border-2 border-base-content/60 bg-base-100'
};

const times = (count: number) => `${count} time${count === 1 ? '' : 's'}`;
```

with:

```ts
  held: 'border-2 border-base-content/60 bg-base-100'
};

/** The legend under the chart, mark by mark */
const LEGEND: Array<[LaneDot['kind'], string]> = [
  ['publish', 'published'],
  ['ran', 'ran'],
  ['held', 'held back (throttle or debounce)']
];

const times = (count: number) => `${count} time${count === 1 ? '' : 's'}`;
```

In `demo/src/playground/laneChart.ts`, replace:

```ts
        )
      ]
    )
  );
```

with:

```ts
        )
      ]
    ),
    // What the marks mean, which the tooltips alone told only a pointer
    el(
      'div',
      { class: 'mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/70', 'aria-hidden': 'true' },
      LEGEND.map(([kind, text]) =>
        el('span', { class: 'inline-flex items-center gap-1.5' }, [
          el('span', { class: `inline-block size-2.5 rounded-full ${DOT_CLASS[kind]}` }),
          text
        ])
      )
    )
  );
```

- [ ] **Step 3: Run the type check and the site tests**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 25 files, 413 tests.

- [ ] **Step 4: Check it in the browser**

In the playground (both themes): Clear is `btn-xs btn-ghost`; an SSE scenario's *Write to the stream* is `btn-xs btn-primary`; with the local server switch (development, *Stream & routing*), the server in use is solid primary and the other soft. On the output tabs, the arrow keys move focus between them, and Tab from the tab row reaches the shown panel (after Clear, when it shows). *Throttle + debounce*'s chart has the legend: published, ran, held back (throttle or debounce), in the marks' colors.

- [ ] **Step 5: Commit**

```bash
git add demo/src/playground/views.ts demo/src/playground/serverPane.ts demo/src/playground/workbench.ts demo/src/playground/laneChart.ts
git commit -F - <<'EOF'
Demo: the last buttons from BUTTON, focusable tab panels, and a legend for the lanes

Clear, the Server tab's send button and the local server switch still had their own classes, and the switch's other half was a plain btn, which reads as text in Signal; BUTTON gains its compact forms. tabList focuses its own buttons rather than by id (two lists can share ids while a workbench replaces another), and its panels are focusable, so the keyboard can scroll them. The lane chart explains its marks in a legend: published, ran, and held back by throttle or debounce, which only the tooltips said.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 4: The adapter cards' announcements, and the footer

**Files:**
- Modify: `demo/src/showcase/widget.ts` (one announcement per click; the tab list's name)
- Modify: `demo/index.html` (the footer's titles)
- Modify: `demo/vite.config.ts` (the stamp per page)
- Modify: `tests/site/widget.test.ts` (wait for the connection)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new

- [ ] **Step 1: Announce once per click, and name the tabs**

In `demo/src/showcase/widget.ts`, replace:

```ts
    ],
    {
      label: `${scenario.title}: output or code`,
      idPrefix: prefix,
      onSelect: id => {
```

with:

```ts
    ],
    {
      label: `${scenario.title}: ${adapter ? 'output, wire or code' : 'output or code'}`,
      idPrefix: prefix,
      onSelect: id => {
```

In `demo/src/showcase/widget.ts`, replace:

```ts
    if (rows.length > announced) {
      const text = liveAnnouncement(rows.slice(announced), performance.now() - lastInteraction);
      if (text !== undefined) announcer.textContent = text;
    }
    announced = rows.length;
```

with:

```ts
    if (rows.length > announced) {
      const text = liveAnnouncement(rows.slice(announced), performance.now() - lastInteraction);
      if (text !== undefined) {
        announcer.textContent = text;
        // A stream never stops: an adapter's card says once what followed the reader's click, not every tick after
        if (adapter) lastInteraction = Number.NEGATIVE_INFINITY;
      }
    }
    announced = rows.length;
```

- [ ] **Step 2: The footer's titles in a tested color, and the stamp per page**

In `demo/index.html`, replace:

```ts
        </aside>
        <nav aria-labelledby="footer-try">
          <h2 id="footer-try" class="footer-title text-base-content">Try it</h2>
          <a class="link link-hover" href="./playground/">Playground</a>
          <a class="link link-hover" href="#features">Features</a>
```

with:

```ts
        </aside>
        <nav aria-labelledby="footer-try">
          <h2 id="footer-try" class="footer-title text-base-content/70 opacity-100">Try it</h2>
          <a class="link link-hover" href="./playground/">Playground</a>
          <a class="link link-hover" href="#features">Features</a>
```

In `demo/index.html`, replace:

```ts
        </nav>
        <nav aria-labelledby="footer-docs">
          <h2 id="footer-docs" class="footer-title text-base-content">Docs</h2>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem#readme">README</a>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md"
```

with:

```ts
        </nav>
        <nav aria-labelledby="footer-docs">
          <h2 id="footer-docs" class="footer-title text-base-content/70 opacity-100">Docs</h2>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem#readme">README</a>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md"
```

In `demo/index.html`, replace:

```ts
        </nav>
        <nav aria-labelledby="footer-project">
          <h2 id="footer-project" class="footer-title text-base-content">Project</h2>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem">GitHub</a>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem/issues">Issues</a>
```

with:

```ts
        </nav>
        <nav aria-labelledby="footer-project">
          <h2 id="footer-project" class="footer-title text-base-content/70 opacity-100">Project</h2>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem">GitHub</a>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem/issues">Issues</a>
```

In `demo/vite.config.ts`, replace:

```ts
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** The library version and commit this build runs, stamped into the pages' footers */
const build = siteBuild();

export default defineConfig({
  root: here('.'),
```

with:

```ts
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
```

In `demo/vite.config.ts`, replace:

```ts
  plugins: [
    tailwindcss(),
    { name: 'evem-site-stamp', transformIndexHtml: { order: 'pre', handler: html => stampHtml(html, build) } }
  ],
  resolve: {
```

with:

```ts
  plugins: [
    tailwindcss(),
    // The library version and commit the pages run, stamped into their footers; per page, so the dev server keeps up
    // with new commits
    { name: 'evem-site-stamp', transformIndexHtml: { order: 'pre', handler: html => stampHtml(html, siteBuild()) } }
  ],
  resolve: {
```

- [ ] **Step 3: Wait for the fake connection instead of a fixed time**

In `tests/site/widget.test.ts`, replace:

```ts
    const session = new ScenarioSession(scenario(id));
    await session.reset();
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(session.server!.openConnections).toBe(1);
    for (const { command } of controls) session.server!.run(command);
    expect(session.server!.wire.at(-1)?.text).toMatch(/connection 1 dropped/);
```

with:

```ts
    const session = new ScenarioSession(scenario(id));
    await session.reset();
    // The fake connection opens after its latency: wait for it, however loaded the machine
    await vi.waitFor(() => expect(session.server!.openConnections).toBe(1));
    for (const { command } of controls) session.server!.run(command);
    expect(session.server!.wire.at(-1)?.text).toMatch(/connection 1 dropped/);
```

- [ ] **Step 4: Run the type check and the site tests**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 25 files, 413 tests (the widget test now waits for the connection).

- [ ] **Step 5: Check it in the browser**

Restart `pnpm demo` (the config changed). In the showcase's SSE card, press *Drop the stream*: its live region (`[aria-live]` in the card) says what followed once, and stays the same while the ticks go on; the next click announces again. Its tab list is named "Reconnect & resume: output, wire or code". The footer's titles are at 70% of the text color with full opacity, in both themes; its commit is the checkout's current one.

- [ ] **Step 6: Commit**

```bash
git add demo/src/showcase/widget.ts demo/index.html demo/vite.config.ts tests/site/widget.test.ts
git commit -F - <<'EOF'
Demo: adapter cards announce once per click, and the footer's small fixes

An adapter card read its stream's ticks aloud for five seconds after every click; it now announces once what followed the click, and waits for the next one. Its tab list is named for its three tabs. The footer's titles use a color the contrast test checks (daisyUI's footer-title set an opacity it didn't); the stamp runs per page, so the dev server's footer keeps up with new commits; and the widget test waits for the fake connection instead of a fixed 150 ms.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 5: Docs, and everything CI runs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/demo-revamp-design.md` (status; phase 4's follow-ups removed)

**Interfaces:**
- Consumes: everything above
- Produces: nothing new

- [ ] **Step 1: Update the docs**

CLAUDE.md describes the behavior above; the design doc marks phase 4 done and removes its fourteen follow-ups, leaving the 0.3.0 release and phase 5's.

In `CLAUDE.md`, replace:

```markdown
Being rebuilt in phases (`docs/demo-revamp-design.md`; phases 2 (the foundation), 3 (the playground: 3a core scenarios, 3b flow control, 3c WebSocket, SSE and Recipes) 4a (the showcase's hero and features), the UX pass (code beside output) and 4b-1 (the adapter cards, Why EvEm, the footer) are done; 4b-2, the playground's follow-ups, is next). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a scroll tour: the hero, the feature sections, the adapter cards, Why EvEm and the footer) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

with:

```markdown
Being rebuilt in phases (`docs/demo-revamp-design.md`; phases 2 (the foundation), 3 (the playground: 3a core scenarios, 3b flow control, 3c WebSocket, SSE and Recipes) 4a (the showcase's hero and features), the UX pass (code beside output) 4b-1 (the adapter cards, Why EvEm, the footer) and 4b-2 (the playground's follow-ups) are done; 0.3.0's release and phase 5, the cleanup, are next). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a scroll tour: the hero, the feature sections, the adapter cards, Why EvEm and the footer) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

In `CLAUDE.md`, replace:

```markdown
- **UI**: `playground/main.ts` routes `#/<group>/<id>` (`routing.ts`) through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `wire.entry`, `theme.changed`). `playground/workbench.ts` shows a scenario code beside output: on wide screens the page is the viewport's height (`main#workbench` is `lg:h-dvh`), with two columns that scroll inside (`playground/layout.ts`: the code's row gets at least 20rem, and the Scenario card scrolls on a short screen); on the left, the Scenario card (summary, controls, actions) and under it the code panel (`editor.ts`, loaded lazily; a ▶ button in the margin of each `// ▶ Label` line runs that action, `actionLabel`, and goes while the code is being edited); on the right, the Output card's tabs (`tabList`: What EvEm did; Over time with a scenario's `lanes`, the default tab then; Server with a `websocket` or `sse`), with a count of new entries on the tabs not shown. On phones it stacks: Scenario, Output, Code. The Code card's Expand switches to the `wide` layout (`LAYOUTS`): the code in the wide column at full height, the Scenario and Output cards beside it; remembered in `localStorage` (`evem-code-layout`, read and written like the theme, through `browserStorage()` from `theme.ts`). The timeline (`timeline.ts`) folds the setup (the entries before `session.setupEnd`) into one `Setup · …` line (`setupSummary`), shows what the code logged as a `›` console chip, times rows after an action as `+N ms` since it (`since`), and has a Clear button. `playground/laneChart.ts` draws the latest action over time from `lanes.ts` (a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back). `playground/serverPane.ts` is the Server tab: which server and its connections, a send row with the scenario's samples, one row of compact controls, then the wire log (line breaks shown as `↵`; rebuilt only when it grew, and kept at its end unless the reader scrolled up), plus in development the switch to the local SSE server. `playground/views.ts` has what both pages share: `BUTTON` (every button's daisyUI variant: `btn-primary` for the main action, `btn-soft` for the others, `btn-ghost` for minor ones), `controlField`, `timelineItem`, `wireItem` (a wire log line, with `WIRE_DIRECTION`'s marks) and `tabList` (the WAI-ARIA tabs pattern). `actionGate.ts`: one action run at a time, and a reset frees the buttons from earlier runs. `showcase/main.ts` mounts the showcase: the theme picker; copy buttons (`data-copy`; "Copied" is also announced, through a live region); the phone menu (`details[data-menu]`); both close like menus (`dropdown.ts`, `closeOnLeave`: on a choice, Escape, a click elsewhere, or the focus moving out, but not on a focus change with no destination, which Safari makes on a click); the hero's diagram (`showcase/heroFlow.ts`), animating a real EvEm wired in `showcase/flow.ts` (`createFlow`: a middleware that drops `debug.*`, three subscribers by pattern and priority), paused off screen, in a hidden tab or with its Pause button (labeled Pause or Play, without `aria-pressed`), and still with reduced motion (its label stays "How an event flows" and Pause invisible, so the card's size never changes; the still picture is the first event's: `welcome` dimmed, pinned by a test); and a widget (`showcase/widget.ts`) in each `data-scenario` slot once it nears the screen: the playground's `ScenarioSession` for that scenario in a card of fixed height (`WIDGET_HEIGHT`, taller on phones, which the slot reserves), with its controls (two columns, even on phones) and actions and Output and Code tabs (the latest action's rows or its lane chart; the code, loaded once, with ▶ buttons), and a link to the scenario in the playground; it runs its first action at the start and again when a control changes. An adapter's card (a scenario with a `websocket` or `sse` server: the Adapters section's *Connection & offline queue* and *Reconnect & resume*) shows its stream from the start instead (`widgetEntries`: everything after the setup), runs no action by itself, and adds the server's controls (`serverControls`: drop the connection) and a Wire tab (`wireItem`). The sections' text is static in `index.html`; its footer, and the playground's sidebar, say which library code the site runs: `%EVEM_VERSION%` and `%EVEM_COMMIT%` / `%EVEM_COMMIT_URL%` are filled at build time by a Vite plugin (`siteStamp.ts`: the version from package.json, the commit from `GITHUB_SHA` or git). Both pages have `favicon.svg` (the wordmark's square, in each theme's primary). `theme.ts` is the picker (`evem-theme` in `localStorage`; on phones just the theme's name, on one line); `dom.ts` has `el()`, which only ever adds text, not HTML. Each page links `src/styles.css` in its head (a script import paints the page unstyled first on the dev server; `tests/site/pages.test.ts`) and has an inline `<head>` script that applies the saved theme before the first paint, with `resolveTheme`'s rules (tested). daisyUI's `card-body` makes every `p` inside it grow: use a `div` (or `grow-0`) in a card's flex column next to something that should take the free space
```

with:

```markdown
- **UI**: `playground/main.ts` routes `#/<group>/<id>` (`routing.ts`) through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `wire.entry`, `theme.changed`). `playground/workbench.ts` shows a scenario code beside output: on wide screens the page is the viewport's height (`main#workbench` is `lg:h-dvh`), with two columns that scroll inside (`playground/layout.ts`: the code's row gets at least 20rem, and the Scenario card scrolls on a short screen); on the left, the Scenario card (summary, controls, actions) and under it the code panel (`editor.ts`, loaded lazily; a ▶ button in the margin of each `// ▶ Label` line runs that action, `actionLabel`, and goes while the code is being edited); on the right, the Output card's tabs (`tabList`: What EvEm did; Over time with a scenario's `lanes`, the default tab then; Server with a `websocket` or `sse`), with a count of new entries on the tabs not shown. On phones it stacks: Scenario, Output, Code. The Code card's Expand switches to the `wide` layout (`LAYOUTS`): the code in the wide column at full height, the Scenario and Output cards beside it; remembered in `localStorage` (`evem-code-layout`, read and written like the theme, through `browserStorage()` from `theme.ts`). The timeline (`timeline.ts`) folds the setup (the entries before `session.setupEnd`) into one `Setup · …` line (`setupSummary`), shows what the code logged as a `›` console chip, times rows after an action as `+N ms` since it (`since`), and has a Clear button (after which it says so, and rows keep their `+N ms`: `rowsFrom` times the whole trace, then slices). Tab counts compare entry indexes (`unseenRows`), so a setup still running stops counting once its end is known; the ▶ buttons are disabled with the action buttons while a run holds them (`editor.setRunsEnabled`). `playground/laneChart.ts` draws the latest action over time from `lanes.ts` (a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back), with a legend under it. `playground/serverPane.ts` is the Server tab: which server and its connections, a send row with the scenario's samples, one row of compact controls, then the wire log (line breaks shown as `↵`; rebuilt only when it grew, and kept at its end unless the reader scrolled up), plus in development the switch to the local SSE server. `playground/views.ts` has what both pages share: `BUTTON` (every button's daisyUI variant: `btn-primary` for the main action, `btn-soft` for the others, `btn-ghost` for minor ones, and their compact `btn-xs` forms), `controlField`, `timelineItem`, `wireItem` (a wire log line, with `WIRE_DIRECTION`'s marks) and `tabList` (the WAI-ARIA tabs pattern; it focuses its own buttons, and its panels are focusable so the keyboard can scroll them). `actionGate.ts`: one action run at a time, and a reset frees the buttons from earlier runs. `showcase/main.ts` mounts the showcase: the theme picker; copy buttons (`data-copy`; "Copied" is also announced, through a live region); the phone menu (`details[data-menu]`); both close like menus (`dropdown.ts`, `closeOnLeave`: on a choice, Escape, a click elsewhere, or the focus moving out, but not on a focus change with no destination, which Safari makes on a click); the hero's diagram (`showcase/heroFlow.ts`), animating a real EvEm wired in `showcase/flow.ts` (`createFlow`: a middleware that drops `debug.*`, three subscribers by pattern and priority), paused off screen, in a hidden tab or with its Pause button (labeled Pause or Play, without `aria-pressed`), and still with reduced motion (its label stays "How an event flows" and Pause invisible, so the card's size never changes; the still picture is the first event's: `welcome` dimmed, pinned by a test); and a widget (`showcase/widget.ts`) in each `data-scenario` slot once it nears the screen: the playground's `ScenarioSession` for that scenario in a card of fixed height (`WIDGET_HEIGHT`, taller on phones, which the slot reserves), with its controls (two columns, even on phones) and actions and Output and Code tabs (the latest action's rows or its lane chart; the code, loaded once, with ▶ buttons), and a link to the scenario in the playground; it runs its first action at the start and again when a control changes. An adapter's card (a scenario with a `websocket` or `sse` server: the Adapters section's *Connection & offline queue* and *Reconnect & resume*) shows its stream from the start instead (`widgetEntries`: everything after the setup), runs no action by itself, announces once what followed a click (not every tick after it), and adds the server's controls (`serverControls`: drop the connection) and a Wire tab (`wireItem`). The sections' text is static in `index.html`; its footer, and the playground's sidebar, say which library code the site runs: `%EVEM_VERSION%` and `%EVEM_COMMIT%` / `%EVEM_COMMIT_URL%` are filled by a Vite plugin, per page, so the dev server keeps up with new commits (`siteStamp.ts`: the version from package.json, the commit from `GITHUB_SHA`, else git, else "unknown"; it never throws). Both pages have `favicon.svg` (the wordmark's square, in each theme's primary). `theme.ts` is the picker (`evem-theme` in `localStorage`; on phones just the theme's name, on one line); `dom.ts` has `el()`, which only ever adds text, not HTML. Each page links `src/styles.css` in its head (a script import paints the page unstyled first on the dev server; `tests/site/pages.test.ts`) and has an inline `<head>` script that applies the saved theme before the first paint, with `resolveTheme`'s rules (tested). daisyUI's `card-body` makes every `p` inside it grow: use a `div` (or `grow-0`) in a card's flex column next to something that should take the free space
```

In `docs/demo-revamp-design.md`, replace:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3 (playground: 3a core scenarios, 3b flow control, 3c-1 WebSocket and Recipes, 3c-2 SSE and the local server switch), 4a (showcase: navbar, hero, features), the UX pass after 4a, and 4b-1 (adapter cards, Why EvEm, footer, metadata, the showcase's follow-ups) implemented; 4b-2 (the playground's follow-ups) and 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

with:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3 (playground: 3a core scenarios, 3b flow control, 3c-1 WebSocket and Recipes, 3c-2 SSE and the local server switch), 4 (showcase: 4a navbar, hero, features; 4b-1 adapter cards, Why EvEm, footer, metadata; 4b-2 the playground's follow-ups) and the UX pass after 4a implemented; the 0.3.0 release and phase 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

In `docs/demo-revamp-design.md`, delete:

```markdown
| 3b review | The lane chart has no legend: filled (ran) and hollow (held back) are explained only in tooltips | 4 |
| Layout-shift fixes' review | `ActionGate.end` checks the token against both the holder and the generation, and the second check never decides: drop it, or say why both are there | 4 |
| UX pass review | The tab counts start from the row count at a new trace's first render, which is right only because every scenario's setup is synchronous: a setup that awaits would show its rows unfolded, then folded, and leave a hidden tab's count off. Count from an entry index (against `setupEnd` and `clearedFrom`) instead | 4 |
| UX pass review | Three buttons don't use `BUTTON`: Clear (`btn-xs btn-ghost`), the Server tab's send button (`btn-xs btn-primary`) and the development-only Simulated / Local server switch, whose inactive half is a plain `btn`, the variant this pass found reads as text in Signal. Add `BUTTON` entries for them | 4 |
| UX pass review | After Clear, the empty timeline still says "Nothing yet: press …", which reads oddly once the reader has run something | 4 |
| UX pass review | `tabList` moves focus with `document.getElementById` though it holds the buttons: while the next scenario's workbench awaits the editor, two tab lists share the `output-` ids for a moment. Focus the button itself | 4 |
| UX pass review | The output's tab panels aren't focusable (`tabindex="0"`), so a keyboard user can't scroll the timeline or the lane chart after leaving the tab row | 4 |
| UX pass review | Rows after Clear (and in the folded setup) are timed since the reset, not `+N ms` since their action: `timelineRows` runs on the slice, which drops the action `since` counts from. Compute the rows over the whole trace and slice them afterwards | 4 |
| UX pass review | The ▶ buttons in the code give no cue while a run holds the actions (a press is dropped quietly): disable them with the action buttons | 4 |
| 4b-1 | An adapter card's live region reads its stream's ticks aloud for 5 s after each click (`liveAnnouncement`'s window), which is chatty for a stream: announce only what the click caused, or summarize | 4 |
| 4b-1 review | The footer's titles (daisyUI's `.footer-title`) are at 60% opacity, 4.75:1 in Signal Light: AA, but the contrast test only knows `text-base-content/NN` utilities, so it doesn't guard them. Use a tested pair (`opacity-100 text-base-content/70`) or pin `.footer-title` in the test | 4 |
| 4b-1 review | The dev server stamps the commit it started at (`siteBuild()` runs once at config load), so after new commits its footer is behind: compute it per request when serving, or say so | 4 |
| 4b-1 review | An adapter card's tab list is named "…: output or code", but it has Output, Wire and Code | 4 |
| 4b-1 review | `tests/site/widget.test.ts` waits a real 150 ms for a 30 ms fake connection: poll for the open connection instead, for a loaded CI runner | 4 |
```

- [ ] **Step 2: Run everything CI runs**

Run: `pnpm check`

Expected: exit 0: the format check, the type check, 74 test files (1,398 passed, 12 skipped) and the package check.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/demo-revamp-design.md
git commit -F - <<'EOF'
Docs: phase 4 done (4b-2, the playground's follow-ups)

The design doc marks phase 4 done and removes its follow-ups, leaving the 0.3.0 release and phase 5's cleanup. CLAUDE.md describes the timeline after Clear, the tab counts, the ▶ buttons during a run, the compact buttons, the focusable tab panels, the lane legend, the adapter cards' announcements and the stamp per page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```
