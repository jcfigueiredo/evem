# Demo Showcase: Hero and Features Implementation Plan (Demo Revamp, Phase 4a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The showcase's first half: a sticky navbar, a hero with the install command and a live diagram of a real EvEm delivering events, and the seven feature sections (Wildcards, Priorities, Middleware, Throttle & debounce, Cancelable events, History & replay, Schema validation), each with a live widget built from the playground's own scenario, Show code, and Explore in the playground.

**Architecture:** The page's text is static HTML (`demo/index.html`); scripts enhance it. The hero's diagram is animated by `showcase/heroFlow.ts` from a real EvEm wired in `showcase/flow.ts` (a middleware and three subscribers), so the dot follows the actual delivery order. Each feature section has a `data-scenario` slot where `showcase/widget.ts` mounts a compact view of the playground's `ScenarioSession` (its controls, actions, and the latest action's timeline rows or lane chart) when it nears the screen. The workbench's control fields and timeline rows move to `playground/views.ts`, shared by both pages, so they can't disagree.

**Tech Stack:** As phase 3; no new dependencies.

**Spec:** `docs/demo-revamp-design.md`: "Phase 4: Showcase" (the navbar, the hero and its animation, the feature sections, the widgets as compact scenario views, CodeMirror on demand), "Phase 2" (themes, `el()`, contrast), and the phase 4 split agreed with the user on 2026-10-03 (4a: navbar, hero, features; 4b: adapter cards, Why EvEm, footer, metadata, follow-ups).

## Global Constraints

- No runtime dependencies, and no new dev dependencies. Development needs Node.js 20.19+ or 22.12+ (Vite 8); the package's `engines` (`>=20`) don't change.
- The site imports the library only as `@jcfigueiredo/evem` and its subpaths (aliased to `src/`); `src/` isn't touched.
- Colors only through daisyUI semantic tokens (plus `--code-*`); every text pair meets WCAG AA, faded text included (`tests/site/contrast.test.ts`).
- Class names Tailwind must generate are written out in full in the source (`demo/src` and `demo/index.html` are Tailwind's sources).
- DOM content from data goes through `el()`: strings become text nodes, never HTML.
- Links between the pages are relative (`./playground/`), so they work under GitHub Pages' `/evem/`.
- Moving content can be paused, and stops with reduced motion (`prefers-reduced-motion: reduce`).
- Code style: Prettier (`pnpm format`, which covers `demo/index.html`), single quotes, 120 columns, no trailing commas; imports in the order packages, `../` paths, `./` paths.
- Commit messages: subject, a body that explains why, and the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW`.
- New tests go in `tests/site/`.

## Rulings made while planning (for review)

Every file in this plan was written and run first: `pnpm check` passed on the result (68 test files, 1,363 tests, the package check), the page was used in Chrome in both themes (hero, all seven widgets, Show code, the copy button with a real click), and measured at 375 px with and without reduced motion (Playwright). A dry run of the tasks in order, from `main`, confirmed each step's Expected result below and that the end state equals the validated files.

1. **Widgets are the playground's sessions, compact.** Each widget runs the scenario's own `ScenarioSession` and shows its controls, its actions and the latest action's timeline rows (`sinceLatestAction`), or its lane chart for flow control. The workbench's `controlField` and timeline row move to `playground/views.ts`, so both pages draw them the same way; `controlField` takes an id prefix, since several scenarios now share a page.
2. **The text is static HTML.** Section headings and sentences live in `index.html` (readable without JavaScript, and by search engines); a test checks that every `data-scenario` slot names a scenario with actions, and that the diagram's nodes match `flow.ts`.
3. **Widgets start when they near the screen** (an `IntersectionObserver`, 200 px ahead) and run their first action once, so each section shows something without a click. Each has its own EvEm bus, so one widget's entries don't redraw the others.
4. **The hero's diagram is driven by a real EvEm**: `createFlow()` publishes the next event (`order.created`, `user.signup`, `order.paid`, `debug.ping`) and reports who ran, in order; the dot follows that order. It pauses with its Pause button (moving content must be pausable), when scrolled out of view, and in a hidden tab. With reduced motion, or without JavaScript, it's a still diagram, and its live parts (the Live label, Pause, a caption line) stay hidden, so nothing claims to be live.
5. **The diagram's layout**: left to right from 640 px, stacked with ↓ arrows on phones; each subscriber shows its pattern and its priority on separate lines, which fits the card without overflow.
6. **The navbar** is sticky; on phones its links move into a "Menu" dropdown (`details`). The Adapters link comes with the adapter section in 4b.
7. **Copy** uses the clipboard API, showing "Copied" (or "Copy failed") for 1.5 s; its hover color is set for the dark box, since the ghost button's own hover hid its label in the light theme.
8. **The section sentences were checked against the README**: priorities order subscribers (middleware runs before any of them), only events published as cancelable can be canceled, and a failed schema skips the subscriber by default (other policies skip it quietly, run it anyway, or reject the publish).
9. **Dimmed subscribers** (the ones an event didn't reach) are at 50% opacity, which is visible as "didn't run" in both themes; they're inactive parts of a picture, not text the reader needs.

## Review Focus

1. **Scrolling fast past all seven widgets:** each mounts and runs its first action once, with no errors and no layout jumping under the reader. Chrome, Task 5 step 4.
2. **Changing a widget's control while its action runs** (the throttle & debounce burst): the session starts over, and the old run's rows never land in the new view. Chrome, Task 5 step 4.
3. **The hero over time:** after resizing the window, switching tabs or pausing for a while, the dot still travels between the right nodes, and no timer runs while it's hidden. Chrome, Task 5 step 4.
4. **Keyboard and screen readers:** Pause reports `aria-pressed`; the phone menu opens with the keyboard; a widget reads out its rows only after the reader's own interaction (the automatic first run stays quiet). Chrome, Task 5 step 4.
5. **Narrow screens and reduced motion:** at 375 px nothing scrolls sideways and the diagram stacks; with reduced motion the diagram is still and claims nothing live. Playwright, Task 5 step 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `demo/src/timeline.ts` | `sinceLatestAction`: the latest action's entries, for compact views |
| `demo/src/playground/views.ts` (new) | `controlField` (with an id prefix) and `timelineItem`, shared by the workbench and the widgets |
| `demo/src/playground/workbench.ts` | Uses `views.ts` |
| `demo/src/showcase/flow.ts` (new) | `createFlow`, `FLOW_SUBSCRIBERS`, `FLOW_EVENTS`, `FLOW_MIDDLEWARE`: the hero's real EvEm |
| `demo/index.html` | The navbar, the hero, the diagram's static picture, the feature sections and their widget slots |
| `demo/src/showcase/heroFlow.ts` (new) | The diagram's animation, its Pause, off-screen and reduced-motion behavior |
| `demo/src/showcase/widget.ts` (new) | A scenario's compact view: controls, actions, rows or lane chart, Show code, Explore |
| `demo/src/showcase/main.ts` | Mounts the theme picker, the copy buttons, the hero and the widgets |
| `tests/site/*.test.ts` | `flow`, `showcase` (new); `timeline` |
| `CLAUDE.md`, `docs/demo-revamp-design.md` | The showcase's parts; phase 4's split and 4a's status |

---

### Task 1: The latest action's entries, and views both pages share

**Files:**
- Modify: `demo/src/timeline.ts` (`sinceLatestAction`)
- Create: `demo/src/playground/views.ts` (`controlField`, `timelineItem`, moved from the workbench)
- Modify: `demo/src/playground/workbench.ts` (uses `views.ts`)
- Test: `tests/site/timeline.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `sinceLatestAction(entries: readonly TraceEntry[]): TraceEntry[]`: from the latest `action` entry on; `[]` before the first action
  - `controlField(name, control, value, onChange, idPrefix = 'control'): HTMLElement` (a text control's suggestions list gets the id `<idPrefix>-<name>-suggestions`) and `timelineItem(row: TimelineRow): HTMLElement`, in `demo/src/playground/views.ts`

- [ ] **Step 1: Write the failing test**

In `tests/site/timeline.test.ts`, replace:

```ts
import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../demo/src/engine/trace';
import { announcement, describeEntry, isAtEnd, liveAnnouncement, preview, timelineRows } from '../../demo/src/timeline';

describe('preview', () => {
```

with:

```ts
import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../demo/src/engine/trace';
import {
  announcement,
  describeEntry,
  isAtEnd,
  liveAnnouncement,
  preview,
  sinceLatestAction,
  timelineRows
} from '../../demo/src/timeline';

describe('preview', () => {
```

In `tests/site/timeline.test.ts`, replace:

```ts
});

describe('isAtEnd', () => {
  it('says whether a scrolled list shows its end, so it keeps following only a reader who was there', () => {
```

with:

```ts
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

describe('isAtEnd', () => {
  it('says whether a scrolled list shows its end, so it keeps following only a reader who was there', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/timeline.test.ts`

Expected: FAIL, 1 failed | 23 passed (24): `sinceLatestAction > keeps the latest action…` with `TypeError: sinceLatestAction is not a function`.

- [ ] **Step 3: Write `sinceLatestAction`**

In `demo/src/timeline.ts`, replace:

```ts
}

/** How long after the reader's last click, change or key press new rows are still read out */
const ANNOUNCE_WINDOW = 5000;
```

with:

```ts
}

/**
 * The entries of the latest action, from its `action` entry on (none before the first action): what a compact view
 * shows, with the setup and earlier actions left out
 */
export function sinceLatestAction(entries: readonly TraceEntry[]): TraceEntry[] {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index]!.kind === 'action') return entries.slice(index);
  }
  return [];
}

/** How long after the reader's last click, change or key press new rows are still read out */
const ANNOUNCE_WINDOW = 5000;
```

- [ ] **Step 4: Run the test again**

Run: `pnpm test:nowatch tests/site/timeline.test.ts`

Expected: PASS, 24 tests.

- [ ] **Step 5: Move the workbench's control fields and timeline rows into a shared module**

A refactor: the workbench draws the same rows and fields as before (the DOM is checked in Chrome, in Task 5). `controlField` gains an `idPrefix`, since several scenarios share the showcase.

Create `demo/src/playground/views.ts`:

```ts
import { el } from '../dom';
import type { ControlValue } from '../engine/program';
import { numberInput, optionLabel, type Control } from '../engine/session';
import type { TimelineRow, Tone } from '../timeline';

// Full class names, so Tailwind finds them in the source
const TONE_CLASS: Record<Tone, string> = {
  primary: 'status-primary text-primary',
  neutral: 'bg-base-content/60 text-base-content/60',
  info: 'status-info text-info',
  success: 'status-success text-success',
  warning: 'status-warning text-warning',
  error: 'status-error text-error'
};

/**
 * A control's field: a toggle, a number, a text input with suggestions, or a select. `idPrefix` keeps the ids of
 * suggestion lists apart when several scenarios share a page (the showcase)
 */
export function controlField(
  name: string,
  control: Control,
  value: ControlValue,
  onChange: (value: ControlValue) => void,
  idPrefix = 'control'
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
    const listId = `${idPrefix}-${name}-suggestions`;
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
      const element = el('option', { value: JSON.stringify(option) }, [optionLabel(option)]);
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

/** One timeline row: a status dot in its tone, the text, its detail (data, in short) and its time */
export function timelineItem(row: TimelineRow): HTMLElement {
  return el('li', { class: 'relative ps-4', style: `margin-inline-start: ${row.depth * 1.25}rem` }, [
    el('span', {
      class: `status ${TONE_CLASS[row.tone]} absolute -start-[0.3rem] top-[0.45rem] signal-glow`,
      'aria-hidden': 'true'
    }),
    el('span', { class: 'font-mono text-sm break-words whitespace-pre-wrap' }, [row.text]),
    row.detail ? el('span', { class: 'font-mono text-xs text-base-content/60 ms-2 break-all' }, [row.detail]) : null,
    el('span', { class: 'text-xs text-base-content/60 ms-2' }, [`${row.at} ms`])
  ]);
}
```

In `demo/src/playground/workbench.ts`, replace:

```ts
import type { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import type { ControlValue } from '../engine/program';
import { numberInput, optionLabel, ScenarioSession, type Control, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { isAtEnd, liveAnnouncement, timelineRows, type Tone } from '../timeline';
import { renderLaneChart } from './laneChart';
import { serverPane } from './serverPane';

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
      const element = el('option', { value: JSON.stringify(option) }, [optionLabel(option)]);
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
```

with:

```ts
import type { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import { ScenarioSession, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { isAtEnd, liveAnnouncement, timelineRows } from '../timeline';
import { renderLaneChart } from './laneChart';
import { serverPane } from './serverPane';
import { controlField, timelineItem } from './views';

/**
```

In `demo/src/playground/workbench.ts`, replace:

```ts
    const follow = session.trace !== shownTrace || isAtEnd(timelineBox);
    shownTrace = session.trace;
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
```

with:

```ts
    const follow = session.trace !== shownTrace || isAtEnd(timelineBox);
    shownTrace = session.trace;
    timeline.replaceChildren(...rows.map(timelineItem));
    if (rows.length === 0) {
      timeline.append(el('li', { class: 'ps-4 text-sm text-base-content/60' }, ['Nothing yet: run an action.']));
```

- [ ] **Step 6: Run the site tests and the type check**

Run: `pnpm test:nowatch tests/site && pnpm typecheck`

Expected: PASS, 17 files, 374 tests; the type check exits 0.

- [ ] **Step 7: Commit**

```bash
git add demo/src/timeline.ts demo/src/playground/views.ts demo/src/playground/workbench.ts tests/site/timeline.test.ts
git commit -F - <<'EOF'
Demo: the latest action's entries, and views both pages share

The showcase's widgets show what EvEm did in the latest action only, so sinceLatestAction returns the entries from it on. They draw controls and timeline rows like the playground's workbench, so those move to playground/views.ts, shared by both; controlField takes an id prefix, since several scenarios share the showcase.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 2: The hero's flow: a real EvEm wired like its diagram

**Files:**
- Create: `demo/src/showcase/flow.ts`
- Test: `tests/site/flow.test.ts` (new)

**Interfaces:**
- Consumes: `EvEm` from `@jcfigueiredo/evem`
- Produces: `interface FlowSubscriber { name; pattern; priority }`; `FLOW_SUBSCRIBERS` (audit `*` 10, billing `order.*` 5, welcome `user.signup` 0); `FLOW_EVENTS` (`order.created`, `user.signup`, `order.paid`, `debug.ping`); `FLOW_MIDDLEWARE = 'drops debug.*'`; `interface FlowRun { event: string; dropped: boolean; calls: string[] }`; `createFlow(): (event: string) => Promise<FlowRun>`

- [ ] **Step 1: Write the failing test**

Create `tests/site/flow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createFlow, FLOW_EVENTS, FLOW_SUBSCRIBERS } from '../../demo/src/showcase/flow';

describe('createFlow', () => {
  it('publishes through a real EvEm: the middleware drops debug.*, and matching subscribers run by priority', async () => {
    const flow = createFlow();
    expect(await flow('order.created')).toEqual({
      event: 'order.created',
      dropped: false,
      calls: ['audit', 'billing']
    });
    expect(await flow('user.signup')).toEqual({ event: 'user.signup', dropped: false, calls: ['audit', 'welcome'] });
    expect(await flow('debug.ping')).toEqual({ event: 'debug.ping', dropped: true, calls: [] });
  });

  it('cycles through events that show each part of the diagram, with subscribers listed highest priority first', async () => {
    const flow = createFlow();
    const runs = [];
    for (const event of FLOW_EVENTS) runs.push(await flow(event));
    expect(runs.some(run => run.dropped)).toBe(true);
    for (const subscriber of FLOW_SUBSCRIBERS) expect(runs.some(run => run.calls.includes(subscriber.name))).toBe(true);
    const priorities = FLOW_SUBSCRIBERS.map(subscriber => subscriber.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/flow.test.ts`

Expected: FAIL: `Failed to load url ../../demo/src/showcase/flow`, no tests run.

- [ ] **Step 3: Write the flow**

Create `demo/src/showcase/flow.ts`:

```ts
import { EvEm } from '@jcfigueiredo/evem';

/** A subscriber in the hero's diagram: what it listens to, and how early it runs */
export interface FlowSubscriber {
  name: string;
  pattern: string;
  priority: number;
}

/** The diagram's subscribers, highest priority first */
export const FLOW_SUBSCRIBERS: readonly FlowSubscriber[] = [
  { name: 'audit', pattern: '*', priority: 10 },
  { name: 'billing', pattern: 'order.*', priority: 5 },
  { name: 'welcome', pattern: 'user.signup', priority: 0 }
];

/** The events the hero publishes, in turn */
export const FLOW_EVENTS: readonly string[] = ['order.created', 'user.signup', 'order.paid', 'debug.ping'];

/** The middleware's rule, as the diagram shows it */
export const FLOW_MIDDLEWARE = 'drops debug.*';

/** What happened to one published event: whether the middleware dropped it, and which subscribers ran, in order */
export interface FlowRun {
  event: string;
  dropped: boolean;
  calls: string[];
}

/**
 * A real EvEm wired like the hero's diagram: a middleware that drops `debug.*` events, and the subscribers above.
 * Each call publishes one event and resolves with what happened to it, which the animation then draws.
 */
export function createFlow(): (event: string) => Promise<FlowRun> {
  const evem = new EvEm();
  let calls: string[] = [];
  evem.use((event, data) => (event.startsWith('debug.') ? null : data));
  for (const subscriber of FLOW_SUBSCRIBERS) {
    evem.subscribe(subscriber.pattern, () => void calls.push(subscriber.name), { priority: subscriber.priority });
  }
  return async event => {
    calls = [];
    const delivered = await evem.publish(event, { at: Date.now() });
    return { event, dropped: !delivered, calls };
  };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `pnpm test:nowatch tests/site/flow.test.ts && pnpm typecheck`

Expected: PASS, 2 tests; the type check exits 0.

- [ ] **Step 5: Commit**

```bash
git add demo/src/showcase/flow.ts tests/site/flow.test.ts
git commit -F - <<'EOF'
Demo: the hero's flow, a real EvEm wired like its diagram

The hero shows events flowing through middleware into prioritized subscribers. createFlow wires a real EvEm that way (a middleware that drops debug.*, and three subscribers by pattern and priority) and reports, for each published event, whether it was dropped and who ran in which order, so the animation draws what EvEm actually did.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 3: The page: navbar, hero and feature sections

**Files:**
- Replace: `demo/index.html`
- Test: `tests/site/showcase.test.ts` (new)

**Interfaces:**
- Consumes: Task 2's `FLOW_SUBSCRIBERS` and `FLOW_MIDDLEWARE`; the scenario list (`demo/src/scenarios`)
- Produces: in `index.html`, `#flow` (with `[data-flow]`, `[data-flow-node="publish|middleware|audit|billing|welcome"]`, `[data-flow-event]`, `[data-flow-status]`, `[data-flow-pause]`, and `[data-flow-live]` parts, hidden until the animation runs), `[data-copy]` buttons, `#features` with seven `[data-scenario="<id>"]` slots, and `#theme-picker`

- [ ] **Step 1: Write the failing test**

Create `tests/site/showcase.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ScenarioSession } from '../../demo/src/engine/session';
import { scenarios } from '../../demo/src/scenarios';
import { FLOW_MIDDLEWARE, FLOW_SUBSCRIBERS } from '../../demo/src/showcase/flow';

const page = readFileSync(new URL('../../demo/index.html', import.meta.url), 'utf8');
/** The text of an element, tags stripped, whitespace collapsed */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('the showcase page', () => {
  it("mounts a widget for each feature section, each one of the playground's scenarios with an action to run", async () => {
    const ids = [...page.matchAll(/data-scenario="([^"]+)"/g)].map(match => match[1]);
    expect(ids).toEqual([
      'wildcards',
      'priorities',
      'middleware',
      'throttle-debounce',
      'cancelable-events',
      'history-replay',
      'schema-validation'
    ]);
    for (const id of ids) {
      const scenario = scenarios.find(candidate => candidate.id === id);
      expect(scenario, id).toBeDefined();
      const session = new ScenarioSession(scenario!);
      await session.reset();
      session.stop();
      expect(session.actions.length, id).toBeGreaterThan(0);
    }
  });

  it('draws the hero diagram as the flow is wired: its middleware, and each subscriber with its pattern and priority', () => {
    const nodes = new Map(
      [...page.matchAll(/data-flow-node="([^"]+)"\s*>([\s\S]*?)<\/div>/g)].map(match => [match[1], textOf(match[2]!)])
    );
    expect([...nodes.keys()]).toEqual([
      'publish',
      'middleware',
      ...FLOW_SUBSCRIBERS.map(subscriber => subscriber.name)
    ]);
    expect(nodes.get('middleware')).toContain(FLOW_MIDDLEWARE);
    for (const { name, pattern, priority } of FLOW_SUBSCRIBERS) {
      expect(nodes.get(name)).toBe(`${name} ${pattern} priority ${priority}`);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/showcase.test.ts`

Expected: FAIL, 2 failed (2): the page has no slots yet (`expected [] to deeply equal [ 'wildcards', 'priorities', …(5) ]`) and no diagram (`expected [] to deeply equal [ 'publish', 'middleware', …(3) ]`).

- [ ] **Step 3: Write the page**

The text is static (readable without JavaScript); the scripts in Task 4 bring the diagram and the widgets to life.

Replace all of `demo/index.html` with:

```ts
<!doctype html>
<html lang="en" data-theme="signal">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EvEm: events, with intent</title>
    <meta
      name="description"
      content="A small TypeScript event emitter with wildcards, priorities, middleware, flow control, history, and WebSocket and SSE adapters. No dependencies."
    />
    <meta property="og:title" content="EvEm: events, with intent" />
    <meta
      property="og:description"
      content="A small TypeScript event emitter with wildcards, priorities, middleware, flow control, history, and WebSocket and SSE adapters."
    />
    <script>
      // Apply the saved theme before the page paints (same rules as resolveTheme in src/theme.ts)
      (function () {
        var choice = null;
        try {
          choice = localStorage.getItem('evem-theme');
        } catch (error) {}
        var light = window.matchMedia('(prefers-color-scheme: light)').matches;
        var theme = choice === 'signal-light' || (choice === 'system' && light) ? 'signal-light' : 'signal';
        document.documentElement.setAttribute('data-theme', theme);
      })();
    </script>
    <script type="module" src="./src/showcase/main.ts"></script>
  </head>
  <body class="min-h-screen bg-base-200">
    <header class="sticky top-0 z-30 border-b border-base-300 bg-base-200/90 backdrop-blur">
      <nav class="navbar mx-auto max-w-6xl px-4" aria-label="Main">
        <div class="navbar-start">
          <a href="./" class="flex items-center gap-2 font-mono text-lg font-bold">
            <span class="inline-block size-3.5 rounded bg-primary" aria-hidden="true"></span>evem
          </a>
        </div>
        <div class="navbar-end gap-1">
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="#features">Features</a>
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="./playground/">Playground</a>
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="https://github.com/jcfigueiredo/evem">GitHub</a>
          <details class="dropdown dropdown-end sm:hidden">
            <summary class="btn btn-ghost btn-sm" aria-label="Menu">Menu</summary>
            <ul class="menu dropdown-content z-40 mt-2 w-48 rounded-box border border-base-300 bg-base-100 p-2">
              <li><a href="#features">Features</a></li>
              <li><a href="./playground/">Playground</a></li>
              <li><a href="https://github.com/jcfigueiredo/evem">GitHub</a></li>
            </ul>
          </details>
          <div id="theme-picker" class="w-44"></div>
        </div>
      </nav>
    </header>

    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-content mx-auto w-full max-w-6xl flex-col gap-12 px-4 py-16 lg:flex-row lg:items-center">
          <div class="max-w-xl text-center lg:flex-1 lg:text-start">
            <h1 id="hero-title" class="font-mono text-4xl font-bold tracking-tight sm:text-6xl">
              Events, with intent.
            </h1>
            <p class="mt-4 text-lg text-base-content/70">
              A small TypeScript event emitter with wildcards, priorities, middleware, flow control and history, plus
              WebSocket and Server-Sent Events adapters.
            </p>
            <ul class="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start" aria-label="At a glance">
              <li class="badge badge-outline">No dependencies</li>
              <li class="badge badge-outline">TypeScript</li>
              <li class="badge badge-outline">ESM</li>
            </ul>
            <div
              class="mx-auto mt-6 flex max-w-md items-center gap-2 rounded-box bg-neutral py-1 ps-4 pe-1 text-neutral-content lg:mx-0"
            >
              <code class="flex-1 overflow-x-auto py-2 font-mono text-sm whitespace-nowrap"
                >npm install @jcfigueiredo/evem</code
              >
              <button
                type="button"
                class="btn btn-ghost btn-sm text-neutral-content hover:border-transparent hover:bg-neutral-content/15"
                data-copy="npm install @jcfigueiredo/evem"
                aria-label="Copy the install command"
              >
                Copy
              </button>
            </div>
            <div class="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
              <a class="btn btn-primary" href="./playground/">Open the playground</a>
              <a class="btn" href="https://github.com/jcfigueiredo/evem#readme">GitHub</a>
            </div>
          </div>

          <figure id="flow" class="card w-full max-w-lg border border-base-300 bg-base-100 lg:flex-1">
            <div class="card-body gap-4 p-5">
              <div class="flex items-center justify-between gap-2" data-flow-live hidden>
                <p class="text-xs tracking-widest text-base-content/70 uppercase">Live</p>
                <button type="button" class="btn btn-ghost btn-xs" data-flow-pause aria-pressed="false">Pause</button>
              </div>
              <div
                class="relative grid grid-cols-1 gap-2 text-center sm:grid-cols-[auto_auto_auto_auto_minmax(0,1fr)] sm:items-center sm:text-start"
                data-flow
              >
                <div
                  class="rounded-box border border-base-300 px-3 py-2 transition-shadow sm:row-span-3"
                  data-flow-node="publish"
                >
                  <p class="text-xs text-base-content/70">publish</p>
                  <p class="font-mono text-sm" data-flow-event>order.created</p>
                </div>
                <span class="text-base-content/70 sm:row-span-3" aria-hidden="true"
                  ><span class="sm:hidden">↓</span><span class="hidden sm:inline">→</span></span
                >
                <div
                  class="rounded-box border border-base-300 px-3 py-2 transition-shadow sm:row-span-3"
                  data-flow-node="middleware"
                >
                  <p class="text-xs text-base-content/70">middleware</p>
                  <p class="font-mono text-sm">drops debug.*</p>
                  <p class="text-xs text-error" data-flow-status></p>
                </div>
                <span class="text-base-content/70 sm:row-span-3" aria-hidden="true"
                  ><span class="sm:hidden">↓</span><span class="hidden sm:inline">→</span></span
                >
                <div
                  class="rounded-box border border-base-300 px-3 py-2 transition-[opacity,box-shadow]"
                  data-flow-node="audit"
                >
                  <p class="font-mono text-sm">audit</p>
                  <p class="font-mono text-xs whitespace-nowrap text-base-content/70">*</p>
                  <p class="font-mono text-xs whitespace-nowrap text-base-content/70">priority 10</p>
                </div>
                <div
                  class="rounded-box border border-base-300 px-3 py-2 transition-[opacity,box-shadow]"
                  data-flow-node="billing"
                >
                  <p class="font-mono text-sm">billing</p>
                  <p class="font-mono text-xs whitespace-nowrap text-base-content/70">order.*</p>
                  <p class="font-mono text-xs whitespace-nowrap text-base-content/70">priority 5</p>
                </div>
                <div
                  class="rounded-box border border-base-300 px-3 py-2 transition-[opacity,box-shadow]"
                  data-flow-node="welcome"
                >
                  <p class="font-mono text-sm">welcome</p>
                  <p class="font-mono text-xs whitespace-nowrap text-base-content/70">user.signup</p>
                  <p class="font-mono text-xs whitespace-nowrap text-base-content/70">priority 0</p>
                </div>
              </div>
              <figcaption class="text-sm text-base-content/70">
                <span data-flow-live hidden>A real EvEm, publishing an event every few seconds.</span>
                The middleware drops <code>debug.*</code>, and the subscribers whose pattern matches run, highest
                priority first.
              </figcaption>
            </div>
          </figure>
        </div>
      </section>

      <section id="features" class="mx-auto max-w-6xl scroll-mt-16 px-4 pb-24" aria-labelledby="features-title">
        <h2 id="features-title" class="font-mono text-3xl font-bold tracking-tight">Features</h2>
        <p class="mt-2 max-w-2xl text-base-content/70">
          Each example runs the real library: press its button to see what EvEm does, open its code, or take it to the
          playground to change it.
        </p>

        <article class="grid gap-6 border-t border-base-300 py-12 mt-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <h3 class="font-mono text-2xl font-bold">Wildcards</h3>
            <p class="mt-2 text-base-content/70">
              One subscription for a family of events: <code>user.*</code> for everything about users, <code>*</code>
              for everything. Type your own pattern and see what it matches, and why.
            </p>
          </div>
          <div data-scenario="wildcards"></div>
        </article>

        <article class="grid gap-6 border-t border-base-300 py-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <h3 class="font-mono text-2xl font-bold">Priorities</h3>
            <p class="mt-2 text-base-content/70">
              Subscribers run highest priority first, so an audit log sees each event before any other subscriber does.
              Change the priorities and publish again.
            </p>
          </div>
          <div data-scenario="priorities"></div>
        </article>

        <article class="grid gap-6 border-t border-base-300 py-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <h3 class="font-mono text-2xl font-bold">Middleware</h3>
            <p class="mt-2 text-base-content/70">
              Middleware sees every event before its subscribers do: it can change the data, cancel the event, or send
              it under another name.
            </p>
          </div>
          <div data-scenario="middleware"></div>
        </article>

        <article class="grid gap-6 border-t border-base-300 py-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <h3 class="font-mono text-2xl font-bold">Throttle &amp; debounce</h3>
            <p class="mt-2 text-base-content/70">
              Keep a fast stream from flooding a slow subscriber: throttle runs it at most once per window, debounce
              waits for a pause, and together they do both. The chart shows a burst of keystrokes over time.
            </p>
          </div>
          <div data-scenario="throttle-debounce"></div>
        </article>

        <article class="grid gap-6 border-t border-base-300 py-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <h3 class="font-mono text-2xl font-bold">Cancelable events</h3>
            <p class="mt-2 text-base-content/70">
              Publish an event as cancelable and a subscriber can cancel it: the subscribers after it don't run. A fraud
              check that stops a payment before it's charged.
            </p>
          </div>
          <div data-scenario="cancelable-events"></div>
        </article>

        <article class="grid gap-6 border-t border-base-300 py-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <h3 class="font-mono text-2xl font-bold">History &amp; replay</h3>
            <p class="mt-2 text-base-content/70">
              EvEm can remember events, so a subscriber that arrives late still gets the latest one, or all of them.
            </p>
          </div>
          <div data-scenario="history-replay"></div>
        </article>

        <article class="grid gap-6 border-t border-base-300 py-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <h3 class="font-mono text-2xl font-bold">Schema validation</h3>
            <p class="mt-2 text-base-content/70">
              Give a subscriber a schema and EvEm checks the data before calling it. By default, invalid data skips that
              subscriber and is logged; other policies skip it quietly, run it anyway, or reject the publish.
            </p>
          </div>
          <div data-scenario="schema-validation"></div>
        </article>
      </section>
    </main>
  </body>
</html>
```

- [ ] **Step 4: Run the test, and the build test**

Run: `pnpm test:nowatch tests/site/showcase.test.ts tests/site/build.test.ts`

Expected: PASS, 2 files, 3 tests (the build test builds the new page).

- [ ] **Step 5: Commit**

```bash
git add demo/index.html tests/site/showcase.test.ts
git commit -F - <<'EOF'
Demo: the showcase page: navbar, hero and feature sections

The showcase becomes a scroll tour: a sticky navbar (a menu on phones), a hero with the install command, its copy button and a diagram of an event flowing through middleware into prioritized subscribers, and seven feature sections, each a sentence and a slot for its live widget. The text is static HTML, so the page reads without JavaScript; a test keeps the slots pointing at scenarios with actions, and the diagram matching the flow it animates.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 4: The scripts: the hero's animation and the feature widgets

**Files:**
- Create: `demo/src/showcase/heroFlow.ts`, `demo/src/showcase/widget.ts`
- Replace: `demo/src/showcase/main.ts`

**Interfaces:**
- Consumes: Task 1's `sinceLatestAction`, `controlField`, `timelineItem`; Task 2's `createFlow`, `FLOW_EVENTS`, `FLOW_SUBSCRIBERS`; Task 3's page; the playground's `ScenarioSession`, `laneChart` / `renderLaneChart`, `scenarioPath`, `isAtEnd`, `liveAnnouncement`, the lazy `../editor`
- Produces: `mountHeroFlow(root: HTMLElement): void`; `mountWidget(host: HTMLElement, scenario: Scenario): Promise<void>`

- [ ] **Step 1: Write the animation and the widget**

The DOM is checked in Chrome and Playwright (Task 5), like the rest of the UI.

Create `demo/src/showcase/heroFlow.ts`:

```ts
import { el } from '../dom';
import { createFlow, FLOW_EVENTS, FLOW_SUBSCRIBERS, type FlowRun } from './flow';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Milliseconds between two events, after one's animation ends */
const GAP = 1400;

// Full class names, so Tailwind finds them in the source
const ACTIVE = ['border-primary', 'shadow-[0_0_12px_var(--color-primary)]'];
const DIM = 'opacity-50';

/**
 * Animate the hero's diagram (`#flow` in index.html) with a real EvEm (`createFlow`): every few seconds it publishes
 * the next event, and a dot follows it from the publish node through the middleware to each subscriber that ran, in
 * the order they ran. It pauses when the reader presses Pause, scrolls it out of view or leaves the tab. With reduced
 * motion (or without JavaScript), the diagram stays still, and only the parts that say it's live (`data-flow-live`:
 * the Live label, the Pause button, a line of the caption) stay hidden.
 */
export function mountHeroFlow(root: HTMLElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const live of root.querySelectorAll<HTMLElement>('[data-flow-live]')) live.hidden = false;
  const pause = root.querySelector<HTMLButtonElement>('[data-flow-pause]')!;
  const stage = root.querySelector<HTMLElement>('[data-flow]')!;
  const node = (name: string) => stage.querySelector<HTMLElement>(`[data-flow-node="${name}"]`)!;
  const eventLabel = stage.querySelector<HTMLElement>('[data-flow-event]')!;
  const status = stage.querySelector<HTMLElement>('[data-flow-status]')!;
  const dot = el('span', {
    class:
      'pointer-events-none absolute top-0 left-0 size-3 rounded-full bg-primary opacity-0 signal-glow text-primary',
    'aria-hidden': 'true'
  });
  stage.append(dot);
  const flow = createFlow();

  let paused = false;
  let onScreen = true;
  let resume: (() => void) | undefined;
  const running = () => !paused && onScreen && document.visibilityState === 'visible';
  const update = () => {
    if (running()) resume?.();
  };
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Play' : 'Pause';
    pause.setAttribute('aria-pressed', String(paused));
    update();
  });
  new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    update();
  }).observe(root);
  document.addEventListener('visibilitychange', update);

  /** The middle of a node, relative to the stage, less half the dot */
  const centerOf = (element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    const frame = stage.getBoundingClientRect();
    return { x: box.left - frame.left + box.width / 2 - 6, y: box.top - frame.top + box.height / 2 - 6 };
  };
  const travel = (from: HTMLElement, to: HTMLElement) => {
    const a = centerOf(from);
    const b = centerOf(to);
    return dot.animate(
      [
        { transform: `translate(${a.x}px, ${a.y}px)`, opacity: 1 },
        { transform: `translate(${b.x}px, ${b.y}px)`, opacity: 1 }
      ],
      { duration: 450, easing: 'ease-in-out', fill: 'forwards' }
    ).finished;
  };
  const light = (element: HTMLElement, on: boolean) => {
    for (const name of ACTIVE) element.classList.toggle(name, on);
  };

  const draw = async (run: FlowRun) => {
    const publish = node('publish');
    const middleware = node('middleware');
    eventLabel.textContent = run.event;
    status.textContent = '';
    for (const subscriber of FLOW_SUBSCRIBERS) {
      const element = node(subscriber.name);
      light(element, false);
      element.classList.remove(DIM);
    }
    light(publish, true);
    await travel(publish, middleware);
    light(publish, false);
    light(middleware, true);
    await sleep(250);
    light(middleware, false);
    if (run.dropped) {
      status.textContent = 'dropped';
      for (const subscriber of FLOW_SUBSCRIBERS) node(subscriber.name).classList.add(DIM);
      dot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      return;
    }
    for (const subscriber of FLOW_SUBSCRIBERS) {
      if (!run.calls.includes(subscriber.name)) node(subscriber.name).classList.add(DIM);
    }
    let from = middleware;
    for (const name of run.calls) {
      const target = node(name);
      await travel(from, target);
      light(target, true);
      from = target;
    }
    dot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
  };

  void (async () => {
    for (let turn = 0; ; turn++) {
      if (!running()) await new Promise<void>(resolve => (resume = resolve));
      resume = undefined;
      await draw(await flow(FLOW_EVENTS[turn % FLOW_EVENTS.length]!));
      await sleep(GAP);
    }
  })();
}
```

Create `demo/src/showcase/widget.ts`:

```ts
import { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import type { CodeEditor } from '../editor';
import { ScenarioSession, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { renderLaneChart } from '../playground/laneChart';
import { controlField, timelineItem } from '../playground/views';
import { scenarioPath } from '../routing';
import { isAtEnd, liveAnnouncement, sinceLatestAction, timelineRows } from '../timeline';

/**
 * A scenario in the showcase, compact: its controls, its actions, and what EvEm did in the latest one (or, for flow
 * control, the lane chart), with "Show code" (the code it runs, loaded on demand) and a link to the scenario in the
 * playground. It's the playground's own session, so the two pages can't disagree. It runs its first action once, to
 * start with something to see.
 */
export async function mountWidget(host: HTMLElement, scenario: Scenario): Promise<void> {
  const bus = new EvEm();
  const session = new ScenarioSession(scenario, bus);
  const prefix = `widget-${scenario.id}`;
  let busy = false;
  let lastInteraction = Number.NEGATIVE_INFINITY;

  const controls = el('div', { class: 'grid gap-x-3 sm:grid-cols-2' });
  const actions = el('div', { class: 'flex flex-wrap gap-2' });
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
  const output = scenario.lanes
    ? el('div', {})
    : el('div', { class: 'max-h-80 min-h-24 overflow-y-auto pe-2' }, [timeline]);
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  const codeHost = el('div', { class: 'hidden' });
  const codeButton = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false' }, [
    'Show code'
  ]);
  let editor: CodeEditor | undefined;

  let announced = 0;
  const render = () => {
    const entries = sinceLatestAction(session.trace.entries);
    const rows = timelineRows(entries);
    if (scenario.lanes) {
      renderLaneChart(output, laneChart(session.trace.entries));
    } else {
      const follow = isAtEnd(output);
      timeline.replaceChildren(...rows.map(timelineItem));
      if (rows.length === 0) {
        const first = session.actions[0];
        timeline.append(
          el('li', { class: 'ps-4 text-sm text-base-content/70' }, [
            first ? `Press “${first.label}” to see what EvEm does.` : 'Nothing yet.'
          ])
        );
      }
      if (follow) output.scrollTop = output.scrollHeight;
    }
    if (rows.length > announced) {
      const text = liveAnnouncement(rows.slice(announced), performance.now() - lastInteraction);
      if (text !== undefined) announcer.textContent = text;
    }
    announced = rows.length;
  };
  let pending = false;
  bus.subscribe('trace.entry', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      render();
    });
  });
  if (scenario.lanes) new ResizeObserver(() => render()).observe(output);

  const run = async (id: string) => {
    if (busy) return;
    busy = true;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    announced = 0;
    try {
      await session.run(id);
    } finally {
      busy = false;
      for (const button of actions.querySelectorAll('button')) button.disabled = false;
    }
  };
  const renderActions = () => {
    actions.replaceChildren(
      ...session.actions.map((action, index) => {
        const button = el('button', { type: 'button', class: index === 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm' }, [
          action.label
        ]);
        button.addEventListener('click', () => void run(action.id));
        return button;
      })
    );
  };
  const renderControls = () => {
    controls.replaceChildren(
      ...Object.entries(scenario.controls).map(([name, control]) =>
        controlField(
          name,
          control,
          session.values[name]!,
          async value => {
            busy = false;
            await session.setValue(name, value);
            editor?.setCode(session.code);
            renderActions();
            render();
          },
          prefix
        )
      )
    );
  };

  codeButton.addEventListener('click', async () => {
    const open = codeHost.classList.toggle('hidden') === false;
    codeButton.textContent = open ? 'Hide code' : 'Show code';
    codeButton.setAttribute('aria-expanded', String(open));
    if (open && !editor) {
      const { createEditor } = await import('../editor');
      editor = createEditor(codeHost, session.code, () => undefined);
    }
  });
  for (const type of ['click', 'change', 'keydown']) {
    host.addEventListener(type, () => {
      lastInteraction = performance.now();
    });
  }

  host.replaceChildren(
    el('div', { class: 'card border border-base-300 bg-base-100' }, [
      el('div', { class: 'card-body gap-3 p-4' }, [
        controls,
        actions,
        output,
        announcer,
        el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
          codeButton,
          el('a', { class: 'link link-primary text-sm', href: `./playground/${scenarioPath(scenario)}` }, [
            'Explore in the playground →'
          ])
        ]),
        codeHost
      ])
    ])
  );

  await session.reset();
  renderControls();
  renderActions();
  render();
  // Something to see from the start: the first action, once
  const first = session.actions[0];
  if (first) await run(first.id);
}
```

- [ ] **Step 2: Mount them from the page's script**

Replace all of `demo/src/showcase/main.ts` with:

```ts
import '../styles.css';
import { EvEm } from '@jcfigueiredo/evem';
import { scenarios } from '../scenarios';
import { mountThemePicker } from '../theme';
import { mountHeroFlow } from './heroFlow';
import { mountWidget } from './widget';

// The showcase's own events go through EvEm, like the playground's
const bus = new EvEm();
mountThemePicker(document.getElementById('theme-picker')!, bus, 'dropdown-end');
mountHeroFlow(document.getElementById('flow')!);

// Copy buttons: the text in data-copy, and a moment of "Copied"
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset['copy'] ?? '');
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    setTimeout(() => (button.textContent = 'Copy'), 1500);
  });
}

// Each feature's widget starts when it comes near the screen, so the page doesn't run seven scenarios at load
const widgets = new IntersectionObserver(
  entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      widgets.unobserve(entry.target);
      const host = entry.target as HTMLElement;
      const scenario = scenarios.find(candidate => candidate.id === host.dataset['scenario']);
      if (scenario) void mountWidget(host, scenario);
    }
  },
  { rootMargin: '200px' }
);
for (const host of document.querySelectorAll<HTMLElement>('[data-scenario]')) widgets.observe(host);
```

- [ ] **Step 3: Run the type check, the site tests and the build**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 19 files, 378 tests.

- [ ] **Step 4: Commit**

```bash
git add demo/src/showcase/heroFlow.ts demo/src/showcase/widget.ts demo/src/showcase/main.ts
git commit -F - <<'EOF'
Demo: the showcase's live diagram and feature widgets

The hero's diagram follows a real EvEm: every few seconds it publishes the next event, and a dot travels from the publish node through the middleware to each subscriber that ran, in the order it ran. It pauses with its Pause button, off screen and in hidden tabs, and stays still with reduced motion. Each feature's widget is the playground's session for its scenario, compact: controls, actions, the latest action's rows or the lane chart, Show code and a link to the playground; it starts when it nears the screen and runs its first action once.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 5: Docs, the full check and the browser check

**Files:**
- Modify: `CLAUDE.md` (Testing Strategy, Demo Site)
- Modify: `docs/demo-revamp-design.md` (status, Phase 4)

**Interfaces:**
- Consumes: everything above
- Produces: nothing new

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, replace:

```markdown
- `tests/site/`: the demo site. The engine (`program`, `tracedEvEm`, `session`); every scenario (`scenarios.test.ts`: type-checked with each value of each control through `tests/docs/typeCheck.ts`, and its `checks` run with fake timers); `wildcards` (`explainMatch` against EvEm's matching); `lanes` (the lane model and time axis); `webSocketServer`, `sseServer` and `localSseServer` (the servers, driven by the real `WebSocketHandler` and `SseHandler`); `timeline`, `routing` and `theme`; `themeBoot` (the pages' inline theme script against `resolveTheme`); `contrast` (WCAG AA for every text and background pair in both themes, read from `styles.css`, and 3:1 for the sidebar's current link and focus ring); and `build` (a Pages build, which must contain the real library). The DOM code is checked in Chrome, not by tests
```

with:

```markdown
- `tests/site/`: the demo site. The engine (`program`, `tracedEvEm`, `session`); every scenario (`scenarios.test.ts`: type-checked with each value of each control through `tests/docs/typeCheck.ts`, and its `checks` run with fake timers); `wildcards` (`explainMatch` against EvEm's matching); `lanes` (the lane model and time axis); `webSocketServer`, `sseServer` and `localSseServer` (the servers, driven by the real `WebSocketHandler` and `SseHandler`); `flow` (the hero's EvEm) and `showcase` (`index.html`'s widget slots are scenarios with actions, and its diagram matches `flow.ts`); `timeline`, `routing` and `theme`; `themeBoot` (the pages' inline theme script against `resolveTheme`); `contrast` (WCAG AA for every text and background pair in both themes, read from `styles.css`, and 3:1 for the sidebar's current link and focus ring); and `build` (a Pages build, which must contain the real library). The DOM code is checked in Chrome, not by tests
```

In `CLAUDE.md`, replace:

```markdown
Being rebuilt in phases (`docs/demo-revamp-design.md`; phases 2 (the foundation), 3a (the core scenarios), 3b (flow control) and 3c (WebSocket, SSE and Recipes) are done). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a hero until phase 4) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

with:

```markdown
Being rebuilt in phases (`docs/demo-revamp-design.md`; phases 2 (the foundation), 3 (the playground: 3a core scenarios, 3b flow control, 3c WebSocket, SSE and Recipes) and 4a (the showcase's hero and features) are done). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a scroll tour: the hero and the feature sections; the adapter cards, Why EvEm and the footer come in phase 4b) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

In `CLAUDE.md`, replace:

```markdown
- **UI**: `playground/main.ts` routes `#/<group>/<id>` (`routing.ts`) through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `wire.entry`, `theme.changed`); `playground/workbench.ts` shows a scenario (controls, actions, the timeline from `timeline.ts`, and the code panel, `editor.ts`, loaded lazily; with a scenario's `lanes`, `playground/laneChart.ts` draws the latest action over time from `lanes.ts`: a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back; with a scenario's `websocket` or `sse`, `playground/serverPane.ts` is the Server card: the wire log (line breaks shown as `↵`; rebuilt only when it grew, and kept at its end unless the reader scrolled up), a send box with the scenario's samples, the server's controls, and in development the switch to the local SSE server, with its command and whether it answers); `theme.ts` is the picker (`evem-theme` in `localStorage`); `dom.ts` has `el()`, which only ever adds text, not HTML. Each page has an inline `<head>` script that applies the saved theme before the first paint, with `resolveTheme`'s rules (tested)
```

with:

```markdown
- **UI**: `playground/main.ts` routes `#/<group>/<id>` (`routing.ts`) through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `wire.entry`, `theme.changed`); `playground/workbench.ts` shows a scenario (controls, actions, the timeline from `timeline.ts`, and the code panel, `editor.ts`, loaded lazily; with a scenario's `lanes`, `playground/laneChart.ts` draws the latest action over time from `lanes.ts`: a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back; with a scenario's `websocket` or `sse`, `playground/serverPane.ts` is the Server card: the wire log (line breaks shown as `↵`; rebuilt only when it grew, and kept at its end unless the reader scrolled up), a send box with the scenario's samples, the server's controls, and in development the switch to the local SSE server, with its command and whether it answers); `showcase/main.ts` mounts the showcase: the theme picker; copy buttons (`data-copy`); the hero's diagram (`showcase/heroFlow.ts`), animating a real EvEm wired in `showcase/flow.ts` (`createFlow`: a middleware that drops `debug.*`, three subscribers by pattern and priority), paused off screen, in a hidden tab or with its Pause button, and still with reduced motion (its `data-flow-live` parts hidden); and a widget (`showcase/widget.ts`) in each `data-scenario` slot once it nears the screen: the playground's `ScenarioSession` for that scenario, its controls and actions, the latest action's rows (`sinceLatestAction`) or its lane chart, Show code (CodeMirror loaded on demand) and a link to the scenario in the playground; it runs its first action once. The sections' text is static in `index.html`. `playground/views.ts` has `controlField` and `timelineItem`, shared by the workbench and the widgets; `theme.ts` is the picker (`evem-theme` in `localStorage`); `dom.ts` has `el()`, which only ever adds text, not HTML. Each page has an inline `<head>` script that applies the saved theme before the first paint, with `resolveTheme`'s rules (tested)
```

- [ ] **Step 2: Update the design**

In `docs/demo-revamp-design.md`, replace:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation) and 3 (playground: 3a core scenarios, 3b flow control, 3c-1 WebSocket and Recipes, 3c-2 SSE and the local server switch) implemented; 4 and 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

with:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3 (playground: 3a core scenarios, 3b flow control, 3c-1 WebSocket and Recipes, 3c-2 SSE and the local server switch) and 4a (showcase: navbar, hero, features) implemented; 4b and 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

In `docs/demo-revamp-design.md`, replace:

```markdown
## Phase 4: Showcase

```

with:

```markdown
## Phase 4: Showcase

Phase 4 ships in two parts, each with its own plan and pull request: **4a**, the navbar, the hero and the feature sections; **4b**, the adapter cards, Why EvEm, the footer, the metadata and the follow-ups for phase 4.

```

- [ ] **Step 3: Run everything CI runs**

Run: `pnpm check`

Expected: exit 0: the format check, the type check, 68 test files (1,363 passed, 12 skipped, as on `main`) and the package check.

- [ ] **Step 4: Check the showcase in the browser**

Start the dev server (`pnpm demo`, http://127.0.0.1:5199/) and open the showcase in Chrome (Claude in Chrome); check `document.visibilityState` first (a hidden window throttles timers and pauses the animation, by design). Then:

- **Hero**: the diagram shows Live and Pause, and cycles `order.created` (audit, then billing), `user.signup` (audit, then welcome), `order.paid`, `debug.ping` (the middleware says dropped, all subscribers dim). Pause holds it; Play resumes. Resize the window while it runs: the dot still lands on the nodes. Switch to another tab and back: it resumes.
- **Copy**: a real click on Copy turns it into "Copied" for a moment (the clipboard needs a user's click).
- **Widgets**: scroll slowly through the seven sections: each mounts and runs its first action once (Wildcards' explanations, the priorities' order, the middleware chain, the throttle & debounce lane chart, the canceled payment, the replayed history, the validated user). Then scroll fast from the top to the bottom: no errors in the console, no jump under the reader. In Wildcards, type a pattern (`*.created`) and publish; in Throttle & debounce, change `throttleTime` while the burst runs: the chart starts over with the new run. Show code opens the scenario's code; Explore in the playground opens the scenario there.
- **Themes**: Signal and Signal Light: the copy button's hover, the dimmed subscribers, the widgets.
- **Keyboard**: Tab through the navbar, the hero's buttons, Pause (`aria-pressed`), and a widget's controls and actions.
- **Narrow screens and reduced motion** (Playwright: a hidden Chrome window ignores resizing and can't emulate media): at 375 px nothing scrolls sideways, the navbar's links are in Menu, which opens within the screen, and the diagram stacks; with `prefers-reduced-motion: reduce`, the diagram doesn't move and Live, Pause and the caption's live line stay hidden.

Stop the dev server afterwards (`kill $(lsof -t -nP -iTCP:5199 -sTCP:LISTEN)`).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/demo-revamp-design.md
git commit -F - <<'EOF'
Docs: the showcase's hero, live diagram and feature widgets

CLAUDE.md describes the showcase's parts (the flow, the diagram's animation, the widgets and the views they share with the playground) and their tests. The design splits phase 4 in two and marks 4a done.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```
