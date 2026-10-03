# Demo Showcase: Adapters, Why EvEm and Footer Implementation Plan (Demo Revamp, Phase 4b-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The showcase's second half: an Adapters section with two live cards (WebSocket: drop the connection, keep sending, watch the queue flush; SSE: a live stream that resumes from `Last-Event-ID` after a drop), a short and honest Why EvEm, a footer that says which library code the site runs, a favicon and the playground's metadata; plus the showcase's follow-ups (the hero's Pause and still diagram, the Copy announcement, the menus, the widgets on phones).

**Architecture:** The adapter cards are the showcase's widgets in an adapter mode: a scenario with a server (`websocket` or `sse`) shows its whole stream after its setup (`widgetEntries`), runs no action by itself, and adds the server's controls (`serverControls`) and a Wire tab whose lines are the Server tab's (`wireItem`, moved to `views.ts`). The footer's version and commit are stamped into both pages at build time by a small Vite plugin (`siteStamp.ts`). The phone menu and the theme picker share their close rules (`dropdown.ts`).

**Tech Stack:** As phase 4a; no new dependencies.

**Spec:** `docs/demo-revamp-design.md`: "Phase 4: Showcase" (the Adapters cards, Why EvEm, the footer, the metadata), the Follow-ups rows for phase 4 that concern the showcase, and the user's choices on 2026-10-03: ship 4b as two pull requests (4b-1, this one; 4b-2, the playground's follow-ups), and release 0.3.0 after 4b (the package isn't on npm yet, though the hero says `npm install`).

## Global Constraints

- No runtime dependencies, and no new dev dependencies. Development needs Node.js 20.19+ or 22.12+ (Vite 8); the package's `engines` (`>=20`) don't change.
- The site imports the library only as `@jcfigueiredo/evem` and its subpaths (aliased to `src/`); `src/` isn't touched.
- Colors only through daisyUI semantic tokens (plus `--code-*`); every text pair meets WCAG AA, faded text included (`tests/site/contrast.test.ts`).
- Class names Tailwind must generate are written out in full in the source (`demo/src` and the pages are Tailwind's sources).
- DOM content from data goes through `el()`: strings become text nodes, never HTML.
- Every button uses a daisyUI variant that reads as a button in both themes, from `BUTTON` in `playground/views.ts`.
- No layout shift while the page loads or a widget mounts: every widget slot reserves the widget's height (`WIDGET_HEIGHT`).
- Links between the pages are relative (`./playground/`), so they work under GitHub Pages' `/evem/`.
- Code style: Prettier (`pnpm format`, which covers `demo/index.html`), single quotes, 120 columns, no trailing commas; imports in the order packages, `../` paths, `./` paths.
- Commit messages: subject, a body that explains why, and the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW`.
- New tests go in `tests/site/`.

## Rulings made while planning (for review)

Every file in this plan was written and run first: `pnpm check` passed on the result (74 test files, 1,394 tests passed, 12 skipped, and the package check). The showcase was used with Playwright's Chromium at 1440 and 1280 px in both themes and at 375 px (all nine widgets mounted, both adapter cards dropped and recovered, the menus and the theme picker opened and closed), and the playground's sidebar and picker checked. A dry run of the tasks in order, from `main`, confirmed each step's Expected result below and that the end state equals the validated files.

1. **The adapter cards are widgets with a server.** They run the playground's *Connection & offline queue* and *Reconnect & resume*, so the two pages can't disagree. A stream doesn't wait for a button, so an adapter's card shows everything after its setup (not only the latest action), and doesn't run an action by itself: the connection opening is its first output. A control change starts the scenario over, which reconnects. Its server controls (*Drop the connection*, *Drop the stream*) act on the session's current server and stay usable during a run (they're outside the action buttons' gate).
2. **A Wire tab** in the adapter cards shows the server's wire log with the Server tab's own lines (`wireItem` and `WIRE_DIRECTION`, moved from `serverPane.ts` to `views.ts`), so dropping the connection shows the 1006, the reconnect and the queued message going out, and the SSE resume shows `last-event-id`. A feature widget has no Wire panel at all: the prototype mounted an untabbed, never-hidden one, which took half of every feature card's output (caught by measuring each card).
3. **The two adapter articles share a subgrid** on wide screens (`lg:row-span-3 lg:grid-rows-subgrid`), so their headings, texts and cards line up although the texts wrap differently.
4. **Why EvEm is three cards and a link,** from the README's comparison, each saying when to pick the other library (Node's EventEmitter for what's built in and a synchronous `emit`; mitt or EventEmitter3 for size, speed or a typed event map; RxJS for operators over streams). The site shouldn't oversell.
5. **The footer says which library code the site runs:** version (package.json) and commit (`GITHUB_SHA` in the Pages workflow, else `git rev-parse HEAD`), linked to the commit, stamped at build time into `%EVEM_VERSION%`, `%EVEM_COMMIT%` and `%EVEM_COMMIT_URL%` by a `transformIndexHtml` plugin (`order: 'pre'`, before Vite's own `%ENV%` replacement); the playground's sidebar says the same. This answers the follow-up note "show which code the site runs"; releasing 0.3.0 stays on the list, for after 4b, with a dry run and the user's OK.
6. **Widgets on phones:** the cards are taller below `sm` (`WIDGET_HEIGHT` is `h-[36rem] sm:h-[32rem]`), the controls stay in two columns, and the playground link reads "Playground →" so it stays on the tabs' row. Outputs at 375 px went from 92 to 176 px to 244 to 364 px.
7. **The hero's Pause** is labeled Pause or Play and has no `aria-pressed` (a screen reader heard "Play, pressed"). **The still diagram** (reduced motion, no JavaScript) shows the first event as the flow delivers it: `welcome` is dimmed, since `order.created` never reaches it; a test pins it to `createFlow()`'s calls for `FLOW_EVENTS[0]`. **Copy** announces "Copied" (or "Copy failed") through a live region, and its button keeps its name.
8. **The menus close alike** (`closeOnLeave`): on a choice, Escape (back to the summary), a click elsewhere or the focus moving out; a focus change with no destination doesn't close them (Safari doesn't focus a link or button on click, so the click would never land). The theme picker gains the outside click, on both pages.
9. **The lane chart's last tick label** ends at its tick (`-translate-x-full`), so on phones it doesn't hang past the chart and scroll it sideways; the lanes widget's resizes go through the same once-per-frame render as its entries.
10. **The favicon** is the wordmark's square in each theme's primary (`prefers-color-scheme` inside the SVG), linked from both pages; the playground gets Open Graph tags like the showcase's.

## Review Focus

1. **The adapter cards over time:** left running while the reader scrolls, a stream keeps arriving (once a second, one render per frame); dropping repeatedly, changing a control mid-reconnect, and switching tabs never leave the card stuck, duplicated or scrolled away from its end. Chrome, Task 4.
2. **Both themes and phones** for the new sections and the footer: contrast of the footer's titles and the Why EvEm cards' faded text, nothing sideways at 375 px, the adapter cards' tab row on one line. Chrome, Task 4.
3. **The menus with keyboard and pointer:** the phone menu and the theme picker open, close on Escape (focus back on the summary), on a click elsewhere and on Tab out, and a link chosen with the mouse is followed. Chrome, Task 4.
4. **The build stamp in CI:** the Pages workflow's build (`GITHUB_SHA` set) and a local build both fill every placeholder; nothing shows `%EVEM_`. `tests/site/build.test.ts`, Task 4.
5. **Reduced motion and no JavaScript:** the still diagram matches the first event, Pause stays invisible, and the footer's version line is there without scripts. Playwright, Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `demo/src/siteStamp.ts` (new) | `siteBuild()` (version, commit) and `stampHtml()`: the pages' build placeholders |
| `demo/vite.config.ts` | The `evem-site-stamp` plugin |
| `demo/src/playground/views.ts` | `WIRE_DIRECTION` and `wireItem`, moved from the Server tab |
| `demo/src/playground/serverPane.ts` | Uses `wireItem` |
| `demo/src/playground/laneChart.ts` | The last tick label ends at its tick |
| `demo/src/showcase/widget.ts` | The adapter mode (`widgetEntries`, `serverControls`, the Wire tab), two control columns, the short link, `WIDGET_HEIGHT` |
| `demo/index.html` | The Adapters link and section, Why EvEm, the footer, the favicon, the still diagram, Pause, the slots' heights |
| `demo/playground/index.html` | Open Graph tags, the favicon, the version line |
| `demo/src/favicon.svg` (new) | The favicon |
| `demo/src/dropdown.ts` (new) | `closeOnLeave`: the menus' close rules |
| `demo/src/showcase/main.ts`, `demo/src/theme.ts`, `demo/src/showcase/heroFlow.ts` | The menus close alike, Copy is announced, Pause loses `aria-pressed` |
| `tests/site/*.test.ts` | `siteStamp`, `widget` (new); `showcase`, `build` |
| `CLAUDE.md`, `docs/demo-revamp-design.md` | The new sections, the adapter mode, the stamp; 4b's split, status and follow-ups |

---

### Task 1: The site stamp: which library code the site runs

**Files:**
- Create: `demo/src/siteStamp.ts`
- Modify: `demo/vite.config.ts` (the `evem-site-stamp` plugin)
- Test: `tests/site/siteStamp.test.ts` (new)

**Interfaces:**
- Consumes: nothing new
- Produces: `interface SiteBuild { version: string; commit: string }`; `stampHtml(html: string, build: SiteBuild): string` (fills `%EVEM_VERSION%`, `%EVEM_COMMIT%` (7 characters) and `%EVEM_COMMIT_URL%` (`https://github.com/jcfigueiredo/evem/commit/<sha>`)); `siteBuild(env = process.env): SiteBuild` (version from package.json, commit from `GITHUB_SHA`, else `git rev-parse HEAD`); the Vite plugin applies it to both pages

- [ ] **Step 1: Write the failing test**

Create `tests/site/siteStamp.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { siteBuild, stampHtml } from '../../demo/src/siteStamp';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

describe('the site stamp', () => {
  it("fills the pages' placeholders with the library's version and the commit the site was built from", () => {
    const html = '<p>EvEm %EVEM_VERSION%, <a href="%EVEM_COMMIT_URL%">%EVEM_COMMIT%</a></p>';
    expect(stampHtml(html, { version: '0.3.0', commit: '0123456789abcdef0123456789abcdef01234567' })).toBe(
      '<p>EvEm 0.3.0, <a href="https://github.com/jcfigueiredo/evem/commit/0123456789abcdef0123456789abcdef01234567">0123456</a></p>'
    );
  });

  it('reads the version from package.json and the commit from GitHub Actions, else from git', () => {
    expect(siteBuild({ GITHUB_SHA: 'feedface' })).toEqual({ version, commit: 'feedface' });
    expect(siteBuild({}).commit).toMatch(/^[0-9a-f]{40}$/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/siteStamp.test.ts`

Expected: FAIL: `Failed to load url ../../demo/src/siteStamp`, no tests run.

- [ ] **Step 3: Write the stamp**

Create `demo/src/siteStamp.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** What the site was built from: the library's version (package.json) and the commit */
export interface SiteBuild {
  version: string;
  commit: string;
}

const REPOSITORY = 'https://github.com/jcfigueiredo/evem';

/**
 * Fill the pages' build placeholders: `%EVEM_VERSION%`, `%EVEM_COMMIT%` (short) and `%EVEM_COMMIT_URL%`. The site
 * runs the library from source, not from npm, so its footer says which code that is.
 */
export function stampHtml(html: string, build: SiteBuild): string {
  return html
    .replaceAll('%EVEM_VERSION%', build.version)
    .replaceAll('%EVEM_COMMIT_URL%', `${REPOSITORY}/commit/${build.commit}`)
    .replaceAll('%EVEM_COMMIT%', build.commit.slice(0, 7));
}

/** The build this is: the version from package.json, the commit from GitHub Actions (`GITHUB_SHA`), else from git */
export function siteBuild(env: Record<string, string | undefined> = process.env): SiteBuild {
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  const commit =
    env['GITHUB_SHA'] ??
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('.', import.meta.url), encoding: 'utf8' }).trim();
  return { version, commit };
}
```

- [ ] **Step 4: Run the test again**

Run: `pnpm test:nowatch tests/site/siteStamp.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Stamp the pages at build time**

A `transformIndexHtml` plugin with `order: 'pre'`, so it runs before Vite's own `%ENV%` replacement. The pages get their placeholders in Task 4; the build test checks the stamped footer there.

In `demo/vite.config.ts`, replace:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** A path relative to this file */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
```

with:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { siteBuild, stampHtml } from './src/siteStamp';

/** A path relative to this file */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** The library version and commit this build runs, stamped into the pages' footers */
const build = siteBuild();

export default defineConfig({
```

In `demo/vite.config.ts`, replace:

```ts
  // GitHub Pages serves the site from /evem/ (pages.yml sets DEMO_BASE)
  base: process.env['DEMO_BASE'] ?? '/',
  plugins: [tailwindcss()],
  resolve: {
    // The library's own sources, under the package's published names, so the demo's code reads like users' code
```

with:

```ts
  // GitHub Pages serves the site from /evem/ (pages.yml sets DEMO_BASE)
  base: process.env['DEMO_BASE'] ?? '/',
  plugins: [
    tailwindcss(),
    { name: 'evem-site-stamp', transformIndexHtml: { order: 'pre', handler: html => stampHtml(html, build) } }
  ],
  resolve: {
    // The library's own sources, under the package's published names, so the demo's code reads like users' code
```

- [ ] **Step 6: Run the type check and the build test**

Run: `pnpm typecheck && pnpm test:nowatch tests/site/build.test.ts`

Expected: the type check exits 0; PASS, 1 test (the pages have no placeholders yet, so nothing changes in the build).

- [ ] **Step 7: Commit**

```bash
git add demo/src/siteStamp.ts demo/vite.config.ts tests/site/siteStamp.test.ts
git commit -F - <<'EOF'
Demo: stamp the pages with the library version and commit they run

The site runs the library from source on every push to main, not from the npm release, so the playground can show behavior that isn't released. siteStamp fills the pages' %EVEM_VERSION%, %EVEM_COMMIT% and %EVEM_COMMIT_URL% at build time (the commit from GITHUB_SHA in the Pages workflow, else git), for a footer that says which code that is.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 2: Shared views for the cards: wire lines, and the lane chart's last label

**Files:**
- Modify: `demo/src/playground/views.ts` (`WIRE_DIRECTION`, `wireItem`)
- Modify: `demo/src/playground/serverPane.ts` (uses them)
- Modify: `demo/src/playground/laneChart.ts` (the last tick label)

**Interfaces:**
- Consumes: nothing new
- Produces: `WIRE_DIRECTION: Record<WireEntry['direction'], { mark; label; className }>` and `wireItem(entry: WireEntry): HTMLElement` (a wire log line: its mark, its text with `↵` for line breaks, its time) in `demo/src/playground/views.ts`

- [ ] **Step 1: Move the Server tab's wire lines into the shared views**

A refactor: the Server tab draws the same lines (checked in Chrome in Task 4); the adapter cards will draw them too.

In `demo/src/playground/views.ts`, replace:

```ts
import type { ControlValue } from '../engine/program';
import { numberInput, optionLabel, type Control } from '../engine/session';
import type { TimelineRow, Tone } from '../timeline';

```

with:

```ts
import type { ControlValue } from '../engine/program';
import { numberInput, optionLabel, type Control } from '../engine/session';
import type { WireEntry } from '../fakes/wire';
import type { TimelineRow, Tone } from '../timeline';

```

In `demo/src/playground/views.ts`, replace:

```ts
  return { element, select, selected: () => current, setCount };
}

```

with:

```ts
  return { element, select, selected: () => current, setCount };
}

// Full class names, so Tailwind finds them in the source
/** How each kind of wire line is marked: what the client sent, what the server sent, and what happened to connections */
export const WIRE_DIRECTION: Record<WireEntry['direction'], { mark: string; label: string; className: string }> = {
  client: { mark: '→', label: 'client sent', className: 'text-info' },
  server: { mark: '←', label: 'server sent', className: 'text-success' },
  note: { mark: '·', label: 'connection', className: 'text-base-content/70' }
};

/** A wire entry's text with its line breaks visible (`↵`), since in an event stream they're the syntax */
const visible = (text: string): string => text.replace(/\r/g, '␍').replace(/\n/g, '↵\n');

/** One line of a server's wire log: its direction's mark, its text, and its time; for the Server tab and the cards */
export function wireItem(entry: WireEntry): HTMLElement {
  const direction = WIRE_DIRECTION[entry.direction];
  return el('li', { class: 'flex gap-2' }, [
    el('span', { class: `${direction.className} shrink-0`, title: direction.label, 'aria-label': direction.label }, [
      direction.mark
    ]),
    el('span', { class: 'break-all whitespace-pre-wrap' }, [visible(entry.text)]),
    el('span', { class: 'shrink-0 text-base-content/70' }, [`${entry.at} ms`])
  ]);
}

```

In `demo/src/playground/serverPane.ts`, replace:

```ts
import { checkLocalServer } from '../fakes/localSseServer';
import { keepsFollowing } from '../timeline';
import { BUTTON } from './views';
import type { FakeServer, WireEntry } from '../fakes/wire';

// Full class names, so Tailwind finds them in the source
const DIRECTION: Record<WireEntry['direction'], { mark: string; label: string; className: string }> = {
  client: { mark: '→', label: 'client sent', className: 'text-info' },
  server: { mark: '←', label: 'server sent', className: 'text-success' },
  note: { mark: '·', label: 'connection', className: 'text-base-content/70' }
};

/** How many wire lines the pane keeps on screen */
```

with:

```ts
import { checkLocalServer } from '../fakes/localSseServer';
import { keepsFollowing } from '../timeline';
import { BUTTON, WIRE_DIRECTION, wireItem } from './views';
import type { FakeServer } from '../fakes/wire';

/** How many wire lines the pane keeps on screen */
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
  return 'No open connection.';
}

/** A wire entry's text with its line breaks visible (`↵`), since in an event stream they're the syntax */
const visible = (text: string): string => text.replace(/\r/g, '␍').replace(/\n/g, '↵\n');

/**
```

with:

```ts
  return 'No open connection.';
}

/**
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
    (['client', 'server', 'note'] as const).map(direction =>
      el('span', {}, [
        el('span', { class: DIRECTION[direction].className }, [DIRECTION[direction].mark]),
        ` ${DIRECTION[direction].label}`
      ])
    )
```

with:

```ts
    (['client', 'server', 'note'] as const).map(direction =>
      el('span', {}, [
        el('span', { class: WIRE_DIRECTION[direction].className }, [WIRE_DIRECTION[direction].mark]),
        ` ${WIRE_DIRECTION[direction].label}`
      ])
    )
```

In `demo/src/playground/serverPane.ts`, replace:

```ts
    if (server !== shown.server || wire.length !== shown.length) {
      following = server !== shown.server || keepsFollowing(logBox, following);
      log.replaceChildren(
        ...wire.slice(-SHOWN).map(entry => {
          const direction = DIRECTION[entry.direction];
          return el('li', { class: 'flex gap-2' }, [
            el(
              'span',
              { class: `${direction.className} shrink-0`, title: direction.label, 'aria-label': direction.label },
              [direction.mark]
            ),
            el('span', { class: 'break-all whitespace-pre-wrap' }, [visible(entry.text)]),
            el('span', { class: 'shrink-0 text-base-content/70' }, [`${entry.at} ms`])
          ]);
        })
      );
      if (wire.length === 0) log.append(el('li', { class: 'text-base-content/70' }, ['Nothing on the wire yet.']));
      reveal();
```

with:

```ts
    if (server !== shown.server || wire.length !== shown.length) {
      following = server !== shown.server || keepsFollowing(logBox, following);
      log.replaceChildren(...wire.slice(-SHOWN).map(wireItem));
      if (wire.length === 0) log.append(el('li', { class: 'text-base-content/70' }, ['Nothing on the wire yet.']));
      reveal();
```

- [ ] **Step 2: End the lane chart's last tick label at its tick**

Centered, the last label hung past the chart, and on phones the lanes widget scrolled sideways by 10 px.

In `demo/src/playground/laneChart.ts`, replace:

```ts
          'div',
          { class: 'relative h-5' },
          ticks.map(tick =>
            el(
              'span',
              {
                class: 'absolute top-1 -translate-x-1/2 whitespace-nowrap text-xs text-base-content/70',
                style: left(chart.start + tick)
              },
```

with:

```ts
          'div',
          { class: 'relative h-5' },
          // Labels centered on their tick; the last ends at it, so it never hangs past the chart (on phones, that
          // would scroll the chart sideways)
          ticks.map((tick, index) =>
            el(
              'span',
              {
                class:
                  index === ticks.length - 1
                    ? 'absolute top-1 -translate-x-full whitespace-nowrap text-xs text-base-content/70'
                    : 'absolute top-1 -translate-x-1/2 whitespace-nowrap text-xs text-base-content/70',
                style: left(chart.start + tick)
              },
```

- [ ] **Step 3: Run the type check and the site tests**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 24 files, 403 tests.

- [ ] **Step 4: Commit**

```bash
git add demo/src/playground/views.ts demo/src/playground/serverPane.ts demo/src/playground/laneChart.ts
git commit -F - <<'EOF'
Demo: wire lines both pages can draw, and the lane chart's last label inside it

The showcase's adapter cards will show the server's wire log like the playground's Server tab, so its lines (wireItem, with WIRE_DIRECTION's marks) move to playground/views.ts. The lane chart's last tick label now ends at its tick instead of centering on it: it hung past the chart, and on phones the lanes widget scrolled sideways.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 3: The widget's adapter mode

**Files:**
- Modify: `demo/src/showcase/widget.ts` (`widgetEntries`, `serverControls`, the Wire tab, one render per frame, two control columns, the short link)
- Test: `tests/site/widget.test.ts` (new)

**Interfaces:**
- Consumes: Task 2's `wireItem`
- Produces: `widgetEntries(scenario: Scenario, entries: readonly TraceEntry[], setupEnd: number): TraceEntry[]` (an adapter: everything after the setup; a feature: `sinceLatestAction`); `serverControls(scenario: Scenario): Array<{ label: string; command: string }>` (WebSocket: Drop the connection, `drop`; SSE: Drop the stream, `drop`; a feature: none)

- [ ] **Step 1: Write the failing test**

Create `tests/site/widget.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScenarioSession } from '../../demo/src/engine/session';
import type { TraceEntry } from '../../demo/src/engine/trace';
import { scenarios } from '../../demo/src/scenarios';
import { serverControls, widgetEntries } from '../../demo/src/showcase/widget';

const scenario = (id: string) => scenarios.find(candidate => candidate.id === id)!;
const at = { at: 0 };
const entries: TraceEntry[] = [
  { kind: 'subscribe', subscription: 'tick', pattern: 'server.tick', options: [], ...at },
  { kind: 'publish', id: 1, event: 'server.tick', data: { n: 1 }, ...at },
  { kind: 'action', label: 'Show the last event id', ...at },
  { kind: 'log', level: 'log', text: 'last event id: 1', ...at },
  { kind: 'publish', id: 2, event: 'server.tick', data: { n: 2 }, ...at }
];

describe('widgetEntries', () => {
  it("shows a feature's latest action, and an adapter's whole stream after its setup (a stream doesn't wait for a button)", () => {
    expect(widgetEntries(scenario('priorities'), entries, 1)).toEqual(entries.slice(2));
    expect(widgetEntries(scenario('reconnect-resume'), entries, 1)).toEqual(entries.slice(1));
    expect(widgetEntries(scenario('connection-queue'), entries, 1)).toEqual(entries.slice(1));
  });
});

describe('serverControls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers no server controls for a feature', () => {
    expect(serverControls(scenario('priorities'))).toEqual([]);
  });

  it.each(['connection-queue', 'reconnect-resume'])("offers %s's card a drop button that its server runs", async id => {
    vi.stubGlobal('location', { href: 'http://localhost:5199/' });
    const controls = serverControls(scenario(id));
    expect(controls.map(control => control.command)).toEqual(['drop']);
    const session = new ScenarioSession(scenario(id));
    await session.reset();
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(session.server!.openConnections).toBe(1);
    for (const { command } of controls) session.server!.run(command);
    expect(session.server!.wire.at(-1)?.text).toMatch(/connection 1 dropped/);
    session.stop();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/widget.test.ts`

Expected: FAIL, 4 failed (4): `TypeError: widgetEntries is not a function` and `TypeError: serverControls is not a function`.

- [ ] **Step 3: Give the widget its adapter mode**

An adapter's card shows its stream from the setup on, runs no action by itself, and gets the server's controls (outside the action buttons' gate, so they work during a run) and a Wire tab, which only adapter cards mount. Entries, wire lines and resizes render once per frame. On phones the controls stay in two columns and the link reads "Playground →", so the output keeps its room.

In `demo/src/showcase/widget.ts`, replace:

```ts
export const WIDGET_HEIGHT = 'h-[32rem]';

```

with:

```ts
export const WIDGET_HEIGHT = 'h-[32rem]';

/** How many wire lines an adapter's card keeps */
const WIRE_SHOWN = 100;

/** Whether a scenario talks to a server: an adapter's card, with its stream, its wire and the server's controls */
const isAdapter = (scenario: Scenario) => Boolean(scenario.websocket || scenario.sse);

/**
 * The entries a widget shows: a feature's latest action; an adapter's whole stream after its setup, since a stream
 * doesn't wait for a button
 */
export function widgetEntries(scenario: Scenario, entries: readonly TraceEntry[], setupEnd: number): TraceEntry[] {
  return isAdapter(scenario) ? entries.slice(setupEnd) : sinceLatestAction(entries);
}

/** The server's controls an adapter's card offers (a command for its server's `run`); none for a feature */
export function serverControls(scenario: Scenario): Array<{ label: string; command: string }> {
  if (scenario.websocket) return [{ label: 'Drop the connection', command: 'drop' }];
  if (scenario.sse) return [{ label: 'Drop the stream', command: 'drop' }];
  return [];
}

```

In `demo/src/showcase/widget.ts`, replace:

```ts
import type { CodeEditor } from '../editor';
import { ScenarioSession, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { renderLaneChart } from '../playground/laneChart';
import { BUTTON, controlField, tabList, timelineItem } from '../playground/views';
import { scenarioPath } from '../routing';
import { keepsFollowing, liveAnnouncement, sinceLatestAction, timelineRows } from '../timeline';
```

with:

```ts
import type { CodeEditor } from '../editor';
import { ScenarioSession, type Scenario } from '../engine/session';
import type { TraceEntry } from '../engine/trace';
import { laneChart } from '../lanes';
import { renderLaneChart } from '../playground/laneChart';
import { BUTTON, controlField, tabList, timelineItem, wireItem, type Tab } from '../playground/views';
import { scenarioPath } from '../routing';
import { keepsFollowing, liveAnnouncement, sinceLatestAction, timelineRows } from '../timeline';
```

In `demo/src/showcase/widget.ts`, replace:

```ts
 * a link to the scenario in the playground. It fills its slot, whose height is fixed; the output scrolls inside. It's
 * the playground's own session, so the two pages can't disagree. It runs its first action at the start, and again
 * when a control changes, so the output always matches the controls.
 */
export async function mountWidget(host: HTMLElement, scenario: Scenario): Promise<void> {
```

with:

```ts
 * a link to the scenario in the playground. It fills its slot, whose height is fixed; the output scrolls inside. It's
 * the playground's own session, so the two pages can't disagree. It runs its first action at the start, and again
 * when a control changes, so the output always matches the controls. An adapter's card (a scenario with a server)
 * shows its stream from the start instead, with the server's controls (drop the connection) and a Wire tab.
 */
export async function mountWidget(host: HTMLElement, scenario: Scenario): Promise<void> {
```

In `demo/src/showcase/widget.ts`, replace:

```ts
  let lastInteraction = Number.NEGATIVE_INFINITY;

  const controls = el('div', { class: 'grid gap-x-3 sm:grid-cols-2' });
  const actions = el('div', { class: 'flex flex-wrap gap-2' });
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
```

with:

```ts
  let lastInteraction = Number.NEGATIVE_INFINITY;

  // Two columns even on phones, where stacked controls would leave the output little room
  const controls = el('div', { class: 'grid grid-cols-2 gap-x-3' });
  const actions = el('div', { class: 'flex flex-wrap gap-2' });
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
```

In `demo/src/showcase/widget.ts`, replace:

```ts
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  const codeHost = el('div', { class: 'min-h-0 flex-1' });
  // The editor loads on demand, once, however quickly the Code tab is pressed
  let editor: Promise<CodeEditor> | undefined;
```

with:

```ts
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  const codeHost = el('div', { class: 'min-h-0 flex-1' });
  const adapter = isAdapter(scenario);
  const wire = el('ol', { class: 'space-y-1 font-mono text-xs' });
  const wireBox = el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [wire]);
  // The editor loads on demand, once, however quickly the Code tab is pressed
  let editor: Promise<CodeEditor> | undefined;
```

In `demo/src/showcase/widget.ts`, replace:

```ts
    [
      { id: 'output', label: 'Output', panel: output },
      { id: 'code', label: 'Code', panel: codeHost }
    ],
```

with:

```ts
    [
      { id: 'output', label: 'Output', panel: output },
      ...(adapter ? [{ id: 'wire', label: 'Wire', panel: wireBox } satisfies Tab] : []),
      { id: 'code', label: 'Code', panel: codeHost }
    ],
```

In `demo/src/showcase/widget.ts`, replace:

```ts
      onSelect: id => {
        if (id === 'code') void showCode();
        // Rows that came while the code was shown couldn't scroll the hidden output: it follows its end now
        else if (following) output.scrollTop = output.scrollHeight;
      }
    }
  );
  // Whether the output follows its end (see keepsFollowing)
  let following = true;

  let announced = 0;
  const render = () => {
    const entries = sinceLatestAction(session.trace.entries);
    const rows = timelineRows(entries);
    if (scenario.lanes) {
```

with:

```ts
      onSelect: id => {
        if (id === 'code') void showCode();
        // Rows that came while another tab was shown couldn't scroll the hidden panel: it follows its end now
        else if (id === 'wire' && followingWire) wireBox.scrollTop = wireBox.scrollHeight;
        else if (id === 'output' && following) output.scrollTop = output.scrollHeight;
      }
    }
  );
  // Whether the output and the wire follow their end (see keepsFollowing)
  let following = true;
  let followingWire = true;

  let announced = 0;
  const render = () => {
    const entries = widgetEntries(scenario, session.trace.entries, session.setupEnd);
    const rows = timelineRows(entries);
    if (scenario.lanes) {
```

In `demo/src/showcase/widget.ts`, replace:

```ts
      if (following) output.scrollTop = output.scrollHeight;
    }
    if (rows.length > announced) {
      const text = liveAnnouncement(rows.slice(announced), performance.now() - lastInteraction);
```

with:

```ts
      if (following) output.scrollTop = output.scrollHeight;
    }
    if (adapter) {
      followingWire = keepsFollowing(wireBox, followingWire);
      wire.replaceChildren(...(session.server?.wire ?? []).slice(-WIRE_SHOWN).map(wireItem));
      if (followingWire) wireBox.scrollTop = wireBox.scrollHeight;
    }
    if (rows.length > announced) {
      const text = liveAnnouncement(rows.slice(announced), performance.now() - lastInteraction);
```

In `demo/src/showcase/widget.ts`, replace:

```ts
    announced = rows.length;
  };
  let pending = false;
  bus.subscribe('trace.entry', () => {
    if (pending) return;
    pending = true;
```

with:

```ts
    announced = rows.length;
  };
  // One render per frame, however many entries, wire lines or resizes came in it
  let pending = false;
  const scheduleRender = () => {
    if (pending) return;
    pending = true;
```

In `demo/src/showcase/widget.ts`, replace:

```ts
      render();
    });
  });
  if (scenario.lanes) new ResizeObserver(() => render()).observe(output);

  const run = async (id: string) => {
    const token = gate.start();
    if (token === undefined) return;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    announced = 0;
    try {
      await session.run(id);
    } finally {
      if (gate.end(token)) for (const button of actions.querySelectorAll('button')) button.disabled = false;
    }
  };
```

with:

```ts
      render();
    });
  };
  bus.subscribe('trace.entry', scheduleRender);
  if (adapter) bus.subscribe('wire.entry', scheduleRender);
  if (scenario.lanes) new ResizeObserver(scheduleRender).observe(output);

  const run = async (id: string) => {
    const token = gate.start();
    if (token === undefined) return;
    for (const button of actions.querySelectorAll<HTMLButtonElement>('button:not([data-server-control])'))
      button.disabled = true;
    if (!adapter) announced = 0;
    try {
      await session.run(id);
    } finally {
      if (gate.end(token)) {
        for (const button of actions.querySelectorAll<HTMLButtonElement>('button:not([data-server-control])'))
          button.disabled = false;
      }
    }
  };
```

In `demo/src/showcase/widget.ts`, replace:

```ts
        ]);
        button.addEventListener('click', () => void run(action.id));
        return button;
      })
```

with:

```ts
        ]);
        button.addEventListener('click', () => void run(action.id));
        return button;
      }),
      // The server's own controls act on whichever server the session has now, outside the action buttons' gate
      ...serverControls(scenario).map(({ label, command }) => {
        const button = el('button', { type: 'button', class: BUTTON.other, 'data-server-control': '' }, [label]);
        button.addEventListener('click', () => session.server?.run(command));
        return button;
      })
```

In `demo/src/showcase/widget.ts`, replace:

```ts
            void editor?.then(view => view.setCode(session.code));
            renderActions();
            render();
            // The output always matches the controls: run the first action again
            const first = session.actions[0];
            if (first) await run(first.id);
          },
          prefix
```

with:

```ts
            void editor?.then(view => view.setCode(session.code));
            renderActions();
            announced = 0;
            render();
            // The output always matches the controls: a feature runs its first action again (an adapter's stream
            // starts over by itself)
            const first = session.actions[0];
            if (first && !adapter) await run(first.id);
          },
          prefix
```

In `demo/src/showcase/widget.ts`, replace:

```ts
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        tabs.element,
        el('a', { class: 'link link-primary text-sm', href: `./playground/${scenarioPath(scenario)}` }, [
          'Explore in the playground →'
        ])
      ]),
      output,
      codeHost,
      announcer
```

with:

```ts
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        tabs.element,
        // Short on phones, so the link stays on the tabs' row
        el('a', { class: 'link link-primary text-sm', href: `./playground/${scenarioPath(scenario)}` }, [
          el('span', { class: 'hidden sm:inline' }, ['Explore in the playground →']),
          el('span', { class: 'sm:hidden' }, ['Playground →'])
        ])
      ]),
      output,
      // Only an adapter's card has a Wire tab; elsewhere its panel would be an empty box taking half the room
      ...(adapter ? [wireBox] : []),
      codeHost,
      announcer
```

In `demo/src/showcase/widget.ts`, replace:

```ts
  renderActions();
  render();
  // Something to see from the start: the first action, once
  const first = session.actions[0];
  if (first) await run(first.id);
}

```

with:

```ts
  renderActions();
  render();
  // Something to see from the start: a feature's first action, once (an adapter's stream is already running)
  const first = session.actions[0];
  if (first && !adapter) await run(first.id);
}

```

- [ ] **Step 4: Run the test, the type check and the site tests**

Run: `pnpm test:nowatch tests/site/widget.test.ts && pnpm typecheck && pnpm test:nowatch tests/site`

Expected: PASS, 4 tests; the type check exits 0; PASS, 25 files, 407 tests.

- [ ] **Step 5: Commit**

```bash
git add demo/src/showcase/widget.ts tests/site/widget.test.ts
git commit -F - <<'EOF'
Demo: the showcase's widgets can show an adapter, with its server

The showcase's adapter cards run the playground's WebSocket and SSE scenarios. A stream doesn't wait for a button, so a widget whose scenario has a server shows everything after its setup and runs no action by itself; it gets the server's controls (drop the connection) and a Wire tab with the Server tab's lines. Its renders, and a lanes widget's resizes, are batched per frame. On phones the controls stay in two columns and the playground link is short, so the output keeps its room.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 4: The page: Adapters, Why EvEm, the footer, and the showcase follow-ups

**Files:**
- Modify: `demo/index.html`
- Modify: `demo/playground/index.html`
- Create: `demo/src/favicon.svg`
- Create: `demo/src/dropdown.ts`
- Modify: `demo/src/showcase/main.ts`, `demo/src/theme.ts`, `demo/src/showcase/heroFlow.ts`
- Modify: `demo/src/showcase/widget.ts` (`WIDGET_HEIGHT`)
- Test: `tests/site/showcase.test.ts`, `tests/site/build.test.ts`

**Interfaces:**
- Consumes: Task 1's stamp; Task 3's adapter mode (the slots `connection-queue` and `reconnect-resume`)
- Produces: `closeOnLeave(details: HTMLDetailsElement): void` in `demo/src/dropdown.ts`; `WIDGET_HEIGHT = 'h-[36rem] sm:h-[32rem]'`; the sections `#adapters` and `#why`; the footer

- [ ] **Step 1: Write the failing tests**

In `tests/site/showcase.test.ts`, replace:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ScenarioSession } from '../../demo/src/engine/session';
import { scenarios } from '../../demo/src/scenarios';
import { FLOW_MIDDLEWARE, FLOW_SUBSCRIBERS } from '../../demo/src/showcase/flow';
import { WIDGET_HEIGHT } from '../../demo/src/showcase/widget';

```

with:

```ts
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScenarioSession } from '../../demo/src/engine/session';
import { scenarios } from '../../demo/src/scenarios';
import { createFlow, FLOW_EVENTS, FLOW_MIDDLEWARE, FLOW_SUBSCRIBERS } from '../../demo/src/showcase/flow';
import { WIDGET_HEIGHT } from '../../demo/src/showcase/widget';

```

In `tests/site/showcase.test.ts`, replace:

```ts

describe('the showcase page', () => {
  it("mounts a widget for each feature section, each one of the playground's scenarios with an action to run", async () => {
    const ids = [...page.matchAll(/data-scenario="([^"]+)"/g)].map(match => match[1]);
    expect(ids).toEqual([
```

with:

```ts

describe('the showcase page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts a widget for each feature and adapter section, each one of the playground's scenarios with an action to run", async () => {
    const ids = [...page.matchAll(/data-scenario="([^"]+)"/g)].map(match => match[1]);
    expect(ids).toEqual([
```

In `tests/site/showcase.test.ts`, replace:

```ts
      'cancelable-events',
      'history-replay',
      'schema-validation'
    ]);
    for (const id of ids) {
      const scenario = scenarios.find(candidate => candidate.id === id);
```

with:

```ts
      'cancelable-events',
      'history-replay',
      'schema-validation',
      'connection-queue',
      'reconnect-resume'
    ]);
    // SseHandler takes relative URLs only where there's a page to resolve them against
    vi.stubGlobal('location', { href: 'http://localhost:5199/' });
    for (const id of ids) {
      const scenario = scenarios.find(candidate => candidate.id === id);
```

In `tests/site/showcase.test.ts`, replace:

```ts
  it("reserves each widget's height in its slot, so a widget coming in never moves the page", () => {
    const slots = [...page.matchAll(/<div([^>]*)data-scenario="[^"]+"([^>]*)>/g)].map(match => match[1]! + match[2]!);
    expect(slots).toHaveLength(7);
    for (const slot of slots) expect(slot.match(/class="([^"]*)"/)?.[1]?.split(/\s+/)).toContain(WIDGET_HEIGHT);
  });

```

with:

```ts
  it("reserves each widget's height in its slot, so a widget coming in never moves the page", () => {
    const slots = [...page.matchAll(/<div([^>]*)data-scenario="[^"]+"([^>]*)>/g)].map(match => match[1]! + match[2]!);
    expect(slots).toHaveLength(9);
    for (const slot of slots) {
      const classes = slot.match(/class="([^"]*)"/)?.[1]?.split(/\s+/);
      for (const height of WIDGET_HEIGHT.split(' ')) expect(classes).toContain(height);
    }
  });

```

In `tests/site/showcase.test.ts`, replace:

```ts
    expect(figure).not.toMatch(/\shidden[\s>]/);
    expect(figure).toContain('data-flow-label');
  });

```

with:

```ts
    expect(figure).not.toMatch(/\shidden[\s>]/);
    expect(figure).toContain('data-flow-label');
  });

  it('shows the still diagram as the flow delivers its first event: the subscribers it never reaches are dimmed', async () => {
    const figure = page.slice(page.indexOf('<figure id="flow"'), page.indexOf('</figure>'));
    expect(textOf(/data-flow-event>([^<]*)</.exec(figure)![1]!)).toBe(FLOW_EVENTS[0]);
    const { calls } = await createFlow()(FLOW_EVENTS[0]!);
    const dimmed = [...figure.matchAll(/class="([^"]*)"\s*data-flow-node="([^"]+)"/g)]
      .filter(match => match[1]!.split(/\s+/).includes('opacity-50'))
      .map(match => match[2]);
    expect(dimmed).toEqual(FLOW_SUBSCRIBERS.map(subscriber => subscriber.name).filter(name => !calls.includes(name)));
  });

  it("names the hero's Pause button by what it does, without aria-pressed (it reads Play while paused)", () => {
    const pause = /<button[^>]*data-flow-pause[^>]*>/.exec(page)![0];
    expect(pause).not.toContain('aria-pressed');
  });

```

In `tests/site/build.test.ts`, replace:

```ts
    );
    for (const page of ['index.html', 'playground/index.html']) {
      expect(readFileSync(join(outDir, page), 'utf8')).toMatch(/src="\/evem\/assets\/[^"]+\.js"/);
    }
    const scripts = readdirSync(join(outDir, 'assets'))
      .filter(file => file.endsWith('.js'))
```

with:

```ts
    );
    for (const page of ['index.html', 'playground/index.html']) {
      const html = readFileSync(join(outDir, page), 'utf8');
      expect(html).toMatch(/src="\/evem\/assets\/[^"]+\.js"/);
      // The footer says which library code the site runs (siteStamp.ts)
      expect(html, page).not.toContain('%EVEM_');
    }
    expect(readFileSync(join(outDir, 'index.html'), 'utf8')).toMatch(/commit\/[0-9a-f]{40}">[0-9a-f]{7}</);
    const scripts = readdirSync(join(outDir, 'assets'))
      .filter(file => file.endsWith('.js'))
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:nowatch tests/site/showcase.test.ts tests/site/build.test.ts`

Expected: FAIL, 2 files, 5 failed | 2 passed (7): the build's footer has no stamped commit (`expected '<!doctype html>…' to match /commit\/[0-9a-f]{40}">[0-9a-f]{7}</`); the slots lack the adapters (`…(5) ] to deeply equal [ … …(7) ]`); 7 slots, not 9; nothing dimmed in the still diagram (`expected [] to deeply equal [ 'welcome' ]`); Pause still has `aria-pressed`.

- [ ] **Step 3: Write the sections, the footer, the favicon and the metadata**

The Adapters section (two articles on a subgrid, so their cards line up), Why EvEm and the footer, with the stamp's placeholders; the navbar and the phone menu gain Adapters; every slot reserves the taller phone height; the still diagram dims `welcome`; Pause loses `aria-pressed`. The playground gets Open Graph tags, the favicon and the version line.

Create `demo/src/favicon.svg`:

```ts
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <style>
    rect { fill: #22d3ee; }
    @media (prefers-color-scheme: light) { rect { fill: #0e7490; } }
  </style>
  <rect x="4" y="4" width="24" height="24" rx="6" />
</svg>
```

In `demo/index.html`, replace:

```ts
      })();
    </script>
    <link rel="stylesheet" href="./src/styles.css" />
    <script type="module" src="./src/showcase/main.ts"></script>
```

with:

```ts
      })();
    </script>
    <link rel="icon" href="./src/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./src/styles.css" />
    <script type="module" src="./src/showcase/main.ts"></script>
```

In `demo/index.html`, replace:

```ts
        <div class="navbar-end gap-1">
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="#features">Features</a>
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="./playground/">Playground</a>
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="https://github.com/jcfigueiredo/evem">GitHub</a>
```

with:

```ts
        <div class="navbar-end gap-1">
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="#features">Features</a>
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="#adapters">Adapters</a>
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="./playground/">Playground</a>
          <a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="https://github.com/jcfigueiredo/evem">GitHub</a>
```

In `demo/index.html`, replace:

```ts
            <ul class="menu dropdown-content z-40 mt-2 w-48 rounded-box border border-base-300 bg-base-100 p-2">
              <li><a href="#features">Features</a></li>
              <li><a href="./playground/">Playground</a></li>
              <li><a href="https://github.com/jcfigueiredo/evem">GitHub</a></li>
```

with:

```ts
            <ul class="menu dropdown-content z-40 mt-2 w-48 rounded-box border border-base-300 bg-base-100 p-2">
              <li><a href="#features">Features</a></li>
              <li><a href="#adapters">Adapters</a></li>
              <li><a href="./playground/">Playground</a></li>
              <li><a href="https://github.com/jcfigueiredo/evem">GitHub</a></li>
```

In `demo/index.html`, replace:

```ts
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs tracking-widest text-base-content/70 uppercase" data-flow-label>How an event flows</p>
                <button type="button" class="btn btn-ghost btn-xs invisible" data-flow-pause aria-pressed="false">
                  Pause
                </button>
              </div>
              <div
```

with:

```ts
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs tracking-widest text-base-content/70 uppercase" data-flow-label>How an event flows</p>
                <button type="button" class="btn btn-ghost btn-xs invisible" data-flow-pause>Pause</button>
              </div>
              <div
```

In `demo/index.html`, replace:

```ts
                </div>
                <div
                  class="rounded-box border border-base-300 px-3 py-2 transition-[opacity,box-shadow]"
                  data-flow-node="welcome"
                >
```

with:

```ts
                </div>
                <div
                  class="rounded-box border border-base-300 px-3 py-2 opacity-50 transition-[opacity,box-shadow]"
                  data-flow-node="welcome"
                >
```

In `demo/index.html`, replace:

```ts
            </p>
          </div>
          <div class="card h-[32rem] border border-base-300 bg-base-100" data-scenario="wildcards"></div>
        </article>

```

with:

```ts
            </p>
          </div>
          <div class="card h-[36rem] border border-base-300 bg-base-100 sm:h-[32rem]" data-scenario="wildcards"></div>
        </article>

```

In `demo/index.html`, replace:

```ts
            </p>
          </div>
          <div class="card h-[32rem] border border-base-300 bg-base-100" data-scenario="priorities"></div>
        </article>

```

with:

```ts
            </p>
          </div>
          <div class="card h-[36rem] border border-base-300 bg-base-100 sm:h-[32rem]" data-scenario="priorities"></div>
        </article>

```

In `demo/index.html`, replace:

```ts
            </p>
          </div>
          <div class="card h-[32rem] border border-base-300 bg-base-100" data-scenario="middleware"></div>
        </article>

```

with:

```ts
            </p>
          </div>
          <div class="card h-[36rem] border border-base-300 bg-base-100 sm:h-[32rem]" data-scenario="middleware"></div>
        </article>

```

In `demo/index.html`, replace:

```ts
            </p>
          </div>
          <div class="card h-[32rem] border border-base-300 bg-base-100" data-scenario="throttle-debounce"></div>
        </article>

```

with:

```ts
            </p>
          </div>
          <div
            class="card h-[36rem] border border-base-300 bg-base-100 sm:h-[32rem]"
            data-scenario="throttle-debounce"
          ></div>
        </article>

```

In `demo/index.html`, replace:

```ts
            </p>
          </div>
          <div class="card h-[32rem] border border-base-300 bg-base-100" data-scenario="cancelable-events"></div>
        </article>

```

with:

```ts
            </p>
          </div>
          <div
            class="card h-[36rem] border border-base-300 bg-base-100 sm:h-[32rem]"
            data-scenario="cancelable-events"
          ></div>
        </article>

```

In `demo/index.html`, replace:

```ts
            </p>
          </div>
          <div class="card h-[32rem] border border-base-300 bg-base-100" data-scenario="history-replay"></div>
        </article>

```

with:

```ts
            </p>
          </div>
          <div
            class="card h-[36rem] border border-base-300 bg-base-100 sm:h-[32rem]"
            data-scenario="history-replay"
          ></div>
        </article>

```

In `demo/index.html`, replace:

```ts
            </p>
          </div>
          <div class="card h-[32rem] border border-base-300 bg-base-100" data-scenario="schema-validation"></div>
        </article>
      </section>
    </main>
  </body>
</html>
```

with:

```ts
            </p>
          </div>
          <div
            class="card h-[36rem] border border-base-300 bg-base-100 sm:h-[32rem]"
            data-scenario="schema-validation"
          ></div>
        </article>
      </section>

      <section id="adapters" class="mx-auto max-w-6xl scroll-mt-16 px-4 pb-24" aria-labelledby="adapters-title">
        <h2 id="adapters-title" class="font-mono text-3xl font-bold tracking-tight">Adapters</h2>
        <p class="mt-2 max-w-2xl text-base-content/70">
          Connect EvEm to a server, and its messages arrive as events. These cards run the real adapters against a
          server in the page: drop its connection and watch them recover.
        </p>
        <div
          class="mt-8 grid grid-cols-1 gap-12 border-t border-base-300 pt-12 lg:grid-cols-2 lg:grid-rows-[auto_auto_auto] lg:gap-x-8 lg:gap-y-0"
        >
          <article class="lg:row-span-3 lg:grid lg:grid-rows-subgrid">
            <h3 class="font-mono text-2xl font-bold">WebSocket</h3>
            <p class="mt-2 text-base-content/70">
              <code>WebSocketHandler</code> sends what you publish on <code>ws.send</code> while connected, and queues
              it while not. Drop the connection, keep sending, and watch it reconnect and flush the queue.
            </p>
            <div
              class="card mt-6 h-[36rem] border border-base-300 bg-base-100 sm:h-[32rem]"
              data-scenario="connection-queue"
            ></div>
          </article>
          <article class="lg:row-span-3 lg:grid lg:grid-rows-subgrid">
            <h3 class="font-mono text-2xl font-bold">Server-Sent Events</h3>
            <p class="mt-2 text-base-content/70">
              <code>SseHandler</code> turns a stream into events. Drop the stream: it reconnects and sends
              <code>Last-Event-ID</code>, so the ticks go on where they stopped.
            </p>
            <div
              class="card mt-6 h-[36rem] border border-base-300 bg-base-100 sm:h-[32rem]"
              data-scenario="reconnect-resume"
            ></div>
          </article>
        </div>
      </section>

      <section id="why" class="mx-auto max-w-6xl scroll-mt-16 px-4 pb-24" aria-labelledby="why-title">
        <h2 id="why-title" class="font-mono text-3xl font-bold tracking-tight">Why EvEm</h2>
        <p class="mt-2 max-w-2xl text-base-content/70">
          Most emitters stop at subscribe and emit. EvEm adds what apps end up building around them, awaits async
          subscribers in priority order, and has no dependencies. It isn't always the right pick:
        </p>
        <div class="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <article class="card border border-base-300 bg-base-100">
            <div class="card-body gap-3 p-5">
              <h3 class="font-mono text-lg font-bold">Next to Node's EventEmitter</h3>
              <p class="text-sm text-base-content/70">
                EvEm adds wildcards, priorities, middleware, filters, throttle and debounce, history, and async
                subscribers awaited in order with timeouts; and it runs in browsers too.
              </p>
              <p class="text-sm text-base-content/70">
                <strong class="text-base-content">Pick EventEmitter</strong> for what's built into Node, with a
                synchronous <code>emit</code>.
              </p>
            </div>
          </article>
          <article class="card border border-base-300 bg-base-100">
            <div class="card-body gap-3 p-5">
              <h3 class="font-mono text-lg font-bold">Next to mitt or EventEmitter3</h3>
              <p class="text-sm text-base-content/70">
                EvEm adds patterns, priorities, middleware, history and error policies, and tracks subscriptions by id.
              </p>
              <p class="text-sm text-base-content/70">
                <strong class="text-base-content">Pick them</strong> when bundle size or raw speed matters most, or for
                a typed event map: EvEm types payloads per call, not per event name.
              </p>
            </div>
          </article>
          <article class="card border border-base-300 bg-base-100">
            <div class="card-body gap-3 p-5">
              <h3 class="font-mono text-lg font-bold">Next to RxJS</h3>
              <p class="text-sm text-base-content/70">
                EvEm is plain publish and subscribe: smaller, and quicker to learn.
              </p>
              <p class="text-sm text-base-content/70">
                <strong class="text-base-content">Pick RxJS</strong> for composable operators over streams and complex
                async workflows.
              </p>
            </div>
          </article>
        </div>
        <p class="mt-6 text-base-content/70">
          <a class="link link-primary" href="https://github.com/jcfigueiredo/evem#comparison-with-alternatives"
            >The full comparison</a
          >
          is in the README.
        </p>
      </section>
    </main>

    <footer class="border-t border-base-300">
      <div class="footer mx-auto max-w-6xl gap-y-8 px-4 py-12 text-base-content/70 sm:footer-horizontal">
        <aside class="max-w-sm">
          <a href="./" class="flex items-center gap-2 font-mono text-lg font-bold text-base-content">
            <span class="inline-block size-3.5 rounded bg-primary" aria-hidden="true"></span>evem
          </a>
          <p>Events, with intent. MIT License.</p>
          <p>
            This site runs the library from source: version %EVEM_VERSION%, commit
            <a class="link" href="%EVEM_COMMIT_URL%">%EVEM_COMMIT%</a>.
          </p>
        </aside>
        <nav aria-labelledby="footer-try">
          <h2 id="footer-try" class="footer-title text-base-content">Try it</h2>
          <a class="link link-hover" href="./playground/">Playground</a>
          <a class="link link-hover" href="#features">Features</a>
          <a class="link link-hover" href="#adapters">Adapters</a>
        </nav>
        <nav aria-labelledby="footer-docs">
          <h2 id="footer-docs" class="footer-title text-base-content">Docs</h2>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem#readme">README</a>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md"
            >WebSocket adapter</a
          >
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md"
            >SSE adapter</a
          >
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem/blob/main/CHANGELOG.md">Changelog</a>
        </nav>
        <nav aria-labelledby="footer-project">
          <h2 id="footer-project" class="footer-title text-base-content">Project</h2>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem">GitHub</a>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem/issues">Issues</a>
          <a class="link link-hover" href="https://github.com/jcfigueiredo/evem/blob/main/LICENSE.md">License</a>
        </nav>
      </div>
    </footer>
  </body>
</html>
```

In `demo/playground/index.html`, replace:

```ts
    <title>EvEm Playground</title>
    <meta name="description" content="Try every EvEm feature against the real library, and see what it did and why." />
    <script>
      // Apply the saved theme before the page paints (same rules as resolveTheme in src/theme.ts)
```

with:

```ts
    <title>EvEm Playground</title>
    <meta name="description" content="Try every EvEm feature against the real library, and see what it did and why." />
    <meta property="og:title" content="EvEm Playground" />
    <meta
      property="og:description"
      content="Try every EvEm feature against the real library, and see what it did and why."
    />
    <script>
      // Apply the saved theme before the page paints (same rules as resolveTheme in src/theme.ts)
```

In `demo/playground/index.html`, replace:

```ts
      })();
    </script>
    <link rel="stylesheet" href="../src/styles.css" />
    <script type="module" src="../src/playground/main.ts"></script>
```

with:

```ts
      })();
    </script>
    <link rel="icon" href="../src/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="../src/styles.css" />
    <script type="module" src="../src/playground/main.ts"></script>
```

In `demo/playground/index.html`, replace:

```ts
          <ul id="scenario-menu" class="menu w-full grow"></ul>
          <div id="theme-picker" class="p-3"></div>
        </nav>
      </div>
```

with:

```ts
          <ul id="scenario-menu" class="menu w-full grow"></ul>
          <div id="theme-picker" class="p-3"></div>
          <p class="px-5 pb-4 text-xs text-base-content/70">
            Runs the library from source: version %EVEM_VERSION%, commit
            <a class="link" href="%EVEM_COMMIT_URL%">%EVEM_COMMIT%</a>.
          </p>
        </nav>
      </div>
```

In `demo/src/showcase/widget.ts`, replace:

```ts
/**
 * The height of a widget, which its slot in index.html reserves (as a card of the same size) until it mounts: a
 * widget coming in, or its output growing, never moves the page
 */
export const WIDGET_HEIGHT = 'h-[32rem]';
```

with:

```ts
/**
 * The height of a widget, which its slot in index.html reserves (as a card of the same size) until it mounts: a
 * widget coming in, or its output growing, never moves the page. Taller on phones, where the controls and the
 * buttons wrap onto more lines and would leave the output little room.
 */
export const WIDGET_HEIGHT = 'h-[36rem] sm:h-[32rem]';
```

In `demo/src/showcase/heroFlow.ts`, replace:

```ts
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Play' : 'Pause';
    pause.setAttribute('aria-pressed', String(paused));
    update();
  });
```

with:

```ts
  pause.addEventListener('click', () => {
    paused = !paused;
    // The label says what the button does; aria-pressed would make "Play, pressed" of it
    pause.textContent = paused ? 'Play' : 'Pause';
    update();
  });
```

- [ ] **Step 4: Close the menus alike, and announce Copy**

Create `demo/src/dropdown.ts`:

```ts
/**
 * Close a `details` dropdown (the phone menu, the theme picker) the way menus close: when one of its links is chosen,
 * on Escape (focus goes back to its summary), and when a click or the focus lands outside it. A focus change with no
 * destination (Safari doesn't focus a link or button on click) doesn't close it, or the click would never land.
 */
export function closeOnLeave(details: HTMLDetailsElement): void {
  const close = () => details.removeAttribute('open');
  for (const link of details.querySelectorAll('a')) link.addEventListener('click', close);
  details.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !details.open) return;
    close();
    details.querySelector('summary')?.focus();
  });
  details.addEventListener('focusout', event => {
    const next = event.relatedTarget as Node | null;
    if (next && !details.contains(next)) close();
  });
  document.addEventListener('click', event => {
    if (!details.contains(event.target as Node)) close();
  });
}
```

In `demo/src/showcase/main.ts`, replace:

```ts
import { EvEm } from '@jcfigueiredo/evem';
import { scenarios } from '../scenarios';
import { mountThemePicker } from '../theme';
```

with:

```ts
import { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import { closeOnLeave } from '../dropdown';
import { scenarios } from '../scenarios';
import { mountThemePicker } from '../theme';
```

In `demo/src/showcase/main.ts`, replace:

```ts

// The phone menu closes once a link is chosen, on Escape, and when a click or the focus goes elsewhere
for (const menu of document.querySelectorAll<HTMLDetailsElement>('details[data-menu]')) {
  const close = () => menu.removeAttribute('open');
  for (const link of menu.querySelectorAll('a')) link.addEventListener('click', close);
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menu.open) return;
    close();
    menu.querySelector('summary')?.focus();
  });
  menu.addEventListener('focusout', event => {
    if (!menu.contains(event.relatedTarget as Node | null)) close();
  });
  document.addEventListener('click', event => {
    if (!menu.contains(event.target as Node)) close();
  });
}

// Copy buttons: the text in data-copy, and a moment of "Copied"
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', async () => {
```

with:

```ts

// The phone menu closes once a link is chosen, on Escape, and when a click or the focus goes elsewhere
for (const menu of document.querySelectorAll<HTMLDetailsElement>('details[data-menu]')) closeOnLeave(menu);

// Copy buttons: the text in data-copy, and a moment of "Copied", which screen readers hear too (the button's own
// name stays what it does)
const copyStatus = el('p', { class: 'sr-only', 'aria-live': 'polite' });
document.body.append(copyStatus);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', async () => {
```

In `demo/src/showcase/main.ts`, replace:

```ts
      button.textContent = 'Copy failed';
    }
    setTimeout(() => (button.textContent = 'Copy'), 1500);
  });
}
```

with:

```ts
      button.textContent = 'Copy failed';
    }
    copyStatus.textContent = button.textContent;
    setTimeout(() => {
      button.textContent = 'Copy';
      copyStatus.textContent = '';
    }, 1500);
  });
}
```

In `demo/src/theme.ts`, replace:

```ts
import type { EvEm } from '@jcfigueiredo/evem';
import { el } from './dom';

/** The themes: Signal (dark, the default) and Signal Light */
```

with:

```ts
import type { EvEm } from '@jcfigueiredo/evem';
import { el } from './dom';
import { closeOnLeave } from './dropdown';

/** The themes: Signal (dark, the default) and Signal Light */
```

In `demo/src/theme.ts`, replace:

```ts
    if (choice === 'system') apply();
  });
  container.replaceChildren(details);
  apply();
```

with:

```ts
    if (choice === 'system') apply();
  });
  // It closes like the phone menu: on a choice (above), Escape, and a click or the focus elsewhere
  closeOnLeave(details);
  container.replaceChildren(details);
  apply();
```

- [ ] **Step 5: Run the tests, the type check and the site tests**

Run: `pnpm test:nowatch tests/site/showcase.test.ts tests/site/build.test.ts && pnpm typecheck && pnpm test:nowatch tests/site`

Expected: PASS, 2 files, 7 tests; the type check exits 0; PASS, 25 files, 409 tests.

- [ ] **Step 6: Check the showcase in the browser**

Start the dev server (`pnpm demo`, http://localhost:5173/) and open the showcase; sizes and media need Playwright (a hidden Chrome window ignores resizing and can't emulate media). Then:

- **Adapters** (1440 and 1280 px, Signal and Signal Light): the two cards start at the same height. WebSocket: the output shows the connection opening; *Drop the connection*, then *Send a message* while it's down: `state: reconnecting, queued: 1`, then it reconnects; the Wire tab shows the 1006, connection 2 and the message going out. SSE: ticks arrive once a second; *Drop the stream*: it reconnects, and the Wire tab shows `GET /events · last-event-id: N` and stays at its end. Change a control mid-reconnect: the card starts over and connects.
- **Why EvEm and the footer** in both themes: three cards, the README link; the footer's columns, and its line `This site runs the library from source: version 0.3.0, commit <7 hex>` linking to the commit. The favicon loads (no 404 in the console).
- **The hero**: Pause reads Play while paused and has no `aria-pressed`; with `prefers-reduced-motion: reduce` the diagram is still, on `order.created`, with `welcome` dimmed.
- **Copy**: after a click, a live region says "Copied" (or "Copy failed" where the clipboard is blocked) and empties after 1.5 s.
- **Menus** (375 px): the phone menu has Features, Adapters, Playground, GitHub; it closes on Escape (focus back on Menu), on a click elsewhere and after a link is chosen; the theme picker closes on a click elsewhere too.
- **Phones** (375×800): nothing scrolls sideways (the throttle & debounce chart included); every widget's output is at least about 240 px, its controls in two columns and its tabs' row on one line ("Playground →").
- **The playground**: its sidebar ends with the version line, its favicon loads, and its theme picker closes on a click elsewhere.

Stop the dev server afterwards.

- [ ] **Step 7: Commit**

```bash
git add demo/index.html demo/playground/index.html demo/src/favicon.svg demo/src/dropdown.ts demo/src/showcase/main.ts demo/src/theme.ts demo/src/showcase/heroFlow.ts demo/src/showcase/widget.ts tests/site/showcase.test.ts tests/site/build.test.ts
git commit -F - <<'EOF'
Demo: the showcase gets Adapters, Why EvEm and a footer

The Adapters section runs the real WebSocket and SSE adapters against a server in the page: drop the connection and watch them reconnect, flush the queue and resume from Last-Event-ID. Why EvEm compares it honestly with Node's EventEmitter, mitt or EventEmitter3, and RxJS, saying when to pick each. The footer, and the playground's sidebar, say which library version and commit the site runs; both pages get a favicon, and the playground Open Graph tags.

With them, the showcase's follow-ups: the still diagram shows the first event as the flow delivers it (welcome dimmed, pinned by a test), Pause drops aria-pressed, Copy is announced, the menus close alike (and not on Safari's focus change with no destination), and widgets are taller on phones.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 5: Docs, and everything CI runs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/demo-revamp-design.md` (status, 4b's split, follow-ups)

**Interfaces:**
- Consumes: everything above
- Produces: nothing new

- [ ] **Step 1: Update the docs**

CLAUDE.md describes the new sections, the adapter mode, `dropdown.ts`, the stamp and the new tests; the design doc gets 4b-1's status and 4b's split, drops the nine follow-ups this pass fixes, and turns the note about the site's version into the release that's left.

In `CLAUDE.md`, replace:

```markdown
- `tests/site/`: the demo site. The engine (`program`, `tracedEvEm`, `session`); every scenario (`scenarios.test.ts`: type-checked with each value of each control through `tests/docs/typeCheck.ts`, and its `checks` run with fake timers); `wildcards` (`explainMatch` against EvEm's matching); `lanes` (the lane model and time axis); `webSocketServer`, `sseServer` and `localSseServer` (the servers, driven by the real `WebSocketHandler` and `SseHandler`); `flow` (the hero's EvEm) and `showcase` (`index.html`'s widget slots are scenarios with actions, and its diagram matches `flow.ts`); `timeline`, `routing` and `theme`; `themeBoot` (the pages' inline theme script against `resolveTheme`); `contrast` (WCAG AA for every text and background pair in both themes, read from `styles.css`, and 3:1 for the sidebar's current link and focus ring); and `build` (a Pages build, which must contain the real library). The DOM code is checked in Chrome, not by tests
```

with:

```markdown
- `tests/site/`: the demo site. The engine (`program`, `tracedEvEm`, `session`); every scenario (`scenarios.test.ts`: type-checked with each value of each control through `tests/docs/typeCheck.ts`, and its `checks` run with fake timers); `wildcards` (`explainMatch` against EvEm's matching); `lanes` (the lane model and time axis); `webSocketServer`, `sseServer` and `localSseServer` (the servers, driven by the real `WebSocketHandler` and `SseHandler`); `flow` (the hero's EvEm) and `showcase` (`index.html`'s widget slots are scenarios with actions, and its diagram matches `flow.ts`); `widget` (what a widget shows, `widgetEntries`, and an adapter card's server controls, run on the real fake servers); `views` (`tabAfterKey`) and `layout` (the workbench's two layouts and the saved one); `siteStamp` (the pages' build placeholders); `timeline`, `routing` and `theme`; `themeBoot` (the pages' inline theme script against `resolveTheme`); `contrast` (WCAG AA for every text and background pair in both themes, read from `styles.css`, and 3:1 for the sidebar's current link and focus ring); and `build` (a Pages build, which must contain the real library). The DOM code is checked in Chrome, not by tests
```

In `CLAUDE.md`, replace:

```markdown
Being rebuilt in phases (`docs/demo-revamp-design.md`; phases 2 (the foundation), 3 (the playground: 3a core scenarios, 3b flow control, 3c WebSocket, SSE and Recipes) 4a (the showcase's hero and features) and the UX pass (code beside output) are done). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a scroll tour: the hero and the feature sections; the adapter cards, Why EvEm and the footer come in phase 4b) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

with:

```markdown
Being rebuilt in phases (`docs/demo-revamp-design.md`; phases 2 (the foundation), 3 (the playground: 3a core scenarios, 3b flow control, 3c WebSocket, SSE and Recipes) 4a (the showcase's hero and features), the UX pass (code beside output) and 4b-1 (the adapter cards, Why EvEm, the footer) are done; 4b-2, the playground's follow-ups, is next). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a scroll tour: the hero, the feature sections, the adapter cards, Why EvEm and the footer) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

In `CLAUDE.md`, replace:

```markdown
- **UI**: `playground/main.ts` routes `#/<group>/<id>` (`routing.ts`) through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `wire.entry`, `theme.changed`). `playground/workbench.ts` shows a scenario code beside output: on wide screens the page is the viewport's height (`main#workbench` is `lg:h-dvh`), with two columns that scroll inside (`playground/layout.ts`: the code's row gets at least 20rem, and the Scenario card scrolls on a short screen); on the left, the Scenario card (summary, controls, actions) and under it the code panel (`editor.ts`, loaded lazily; a ▶ button in the margin of each `// ▶ Label` line runs that action, `actionLabel`, and goes while the code is being edited); on the right, the Output card's tabs (`tabList`: What EvEm did; Over time with a scenario's `lanes`, the default tab then; Server with a `websocket` or `sse`), with a count of new entries on the tabs not shown. On phones it stacks: Scenario, Output, Code. The Code card's Expand switches to the `wide` layout (`LAYOUTS`): the code in the wide column at full height, the Scenario and Output cards beside it; remembered in `localStorage` (`evem-code-layout`, read and written like the theme, through `browserStorage()` from `theme.ts`). The timeline (`timeline.ts`) folds the setup (the entries before `session.setupEnd`) into one `Setup · …` line (`setupSummary`), shows what the code logged as a `›` console chip, times rows after an action as `+N ms` since it (`since`), and has a Clear button. `playground/laneChart.ts` draws the latest action over time from `lanes.ts` (a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back). `playground/serverPane.ts` is the Server tab: which server and its connections, a send row with the scenario's samples, one row of compact controls, then the wire log (line breaks shown as `↵`; rebuilt only when it grew, and kept at its end unless the reader scrolled up), plus in development the switch to the local SSE server. `playground/views.ts` has what both pages share: `BUTTON` (every button's daisyUI variant: `btn-primary` for the main action, `btn-soft` for the others, `btn-ghost` for minor ones), `controlField`, `timelineItem` and `tabList` (the WAI-ARIA tabs pattern). `actionGate.ts`: one action run at a time, and a reset frees the buttons from earlier runs. `showcase/main.ts` mounts the showcase: the theme picker; copy buttons (`data-copy`); the phone menu (`details[data-menu]`, which closes on a choice, Escape, a click or focus elsewhere); the hero's diagram (`showcase/heroFlow.ts`), animating a real EvEm wired in `showcase/flow.ts` (`createFlow`: a middleware that drops `debug.*`, three subscribers by pattern and priority), paused off screen, in a hidden tab or with its Pause button, and still with reduced motion (its label stays "How an event flows" and Pause invisible, so the card's size never changes); and a widget (`showcase/widget.ts`) in each `data-scenario` slot once it nears the screen: the playground's `ScenarioSession` for that scenario in a card of fixed height (`WIDGET_HEIGHT`, which the slot reserves), with its controls and actions and Output and Code tabs (the latest action's rows, `sinceLatestAction`, or its lane chart; the code, loaded once, with ▶ buttons), and a link to the scenario in the playground; it runs its first action at the start and again when a control changes. The sections' text is static in `index.html`. `theme.ts` is the picker (`evem-theme` in `localStorage`; on phones just the theme's name, on one line); `dom.ts` has `el()`, which only ever adds text, not HTML. Each page links `src/styles.css` in its head (a script import paints the page unstyled first on the dev server; `tests/site/pages.test.ts`) and has an inline `<head>` script that applies the saved theme before the first paint, with `resolveTheme`'s rules (tested). daisyUI's `card-body` makes every `p` inside it grow: use a `div` (or `grow-0`) in a card's flex column next to something that should take the free space
```

with:

```markdown
- **UI**: `playground/main.ts` routes `#/<group>/<id>` (`routing.ts`) through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `wire.entry`, `theme.changed`). `playground/workbench.ts` shows a scenario code beside output: on wide screens the page is the viewport's height (`main#workbench` is `lg:h-dvh`), with two columns that scroll inside (`playground/layout.ts`: the code's row gets at least 20rem, and the Scenario card scrolls on a short screen); on the left, the Scenario card (summary, controls, actions) and under it the code panel (`editor.ts`, loaded lazily; a ▶ button in the margin of each `// ▶ Label` line runs that action, `actionLabel`, and goes while the code is being edited); on the right, the Output card's tabs (`tabList`: What EvEm did; Over time with a scenario's `lanes`, the default tab then; Server with a `websocket` or `sse`), with a count of new entries on the tabs not shown. On phones it stacks: Scenario, Output, Code. The Code card's Expand switches to the `wide` layout (`LAYOUTS`): the code in the wide column at full height, the Scenario and Output cards beside it; remembered in `localStorage` (`evem-code-layout`, read and written like the theme, through `browserStorage()` from `theme.ts`). The timeline (`timeline.ts`) folds the setup (the entries before `session.setupEnd`) into one `Setup · …` line (`setupSummary`), shows what the code logged as a `›` console chip, times rows after an action as `+N ms` since it (`since`), and has a Clear button. `playground/laneChart.ts` draws the latest action over time from `lanes.ts` (a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back). `playground/serverPane.ts` is the Server tab: which server and its connections, a send row with the scenario's samples, one row of compact controls, then the wire log (line breaks shown as `↵`; rebuilt only when it grew, and kept at its end unless the reader scrolled up), plus in development the switch to the local SSE server. `playground/views.ts` has what both pages share: `BUTTON` (every button's daisyUI variant: `btn-primary` for the main action, `btn-soft` for the others, `btn-ghost` for minor ones), `controlField`, `timelineItem`, `wireItem` (a wire log line, with `WIRE_DIRECTION`'s marks) and `tabList` (the WAI-ARIA tabs pattern). `actionGate.ts`: one action run at a time, and a reset frees the buttons from earlier runs. `showcase/main.ts` mounts the showcase: the theme picker; copy buttons (`data-copy`; "Copied" is also announced, through a live region); the phone menu (`details[data-menu]`); both close like menus (`dropdown.ts`, `closeOnLeave`: on a choice, Escape, a click elsewhere, or the focus moving out, but not on a focus change with no destination, which Safari makes on a click); the hero's diagram (`showcase/heroFlow.ts`), animating a real EvEm wired in `showcase/flow.ts` (`createFlow`: a middleware that drops `debug.*`, three subscribers by pattern and priority), paused off screen, in a hidden tab or with its Pause button (labeled Pause or Play, without `aria-pressed`), and still with reduced motion (its label stays "How an event flows" and Pause invisible, so the card's size never changes; the still picture is the first event's: `welcome` dimmed, pinned by a test); and a widget (`showcase/widget.ts`) in each `data-scenario` slot once it nears the screen: the playground's `ScenarioSession` for that scenario in a card of fixed height (`WIDGET_HEIGHT`, taller on phones, which the slot reserves), with its controls (two columns, even on phones) and actions and Output and Code tabs (the latest action's rows or its lane chart; the code, loaded once, with ▶ buttons), and a link to the scenario in the playground; it runs its first action at the start and again when a control changes. An adapter's card (a scenario with a `websocket` or `sse` server: the Adapters section's *Connection & offline queue* and *Reconnect & resume*) shows its stream from the start instead (`widgetEntries`: everything after the setup), runs no action by itself, and adds the server's controls (`serverControls`: drop the connection) and a Wire tab (`wireItem`). The sections' text is static in `index.html`; its footer, and the playground's sidebar, say which library code the site runs: `%EVEM_VERSION%` and `%EVEM_COMMIT%` / `%EVEM_COMMIT_URL%` are filled at build time by a Vite plugin (`siteStamp.ts`: the version from package.json, the commit from `GITHUB_SHA` or git). Both pages have `favicon.svg` (the wordmark's square, in each theme's primary). `theme.ts` is the picker (`evem-theme` in `localStorage`; on phones just the theme's name, on one line); `dom.ts` has `el()`, which only ever adds text, not HTML. Each page links `src/styles.css` in its head (a script import paints the page unstyled first on the dev server; `tests/site/pages.test.ts`) and has an inline `<head>` script that applies the saved theme before the first paint, with `resolveTheme`'s rules (tested). daisyUI's `card-body` makes every `p` inside it grow: use a `div` (or `grow-0`) in a card's flex column next to something that should take the free space
```

In `docs/demo-revamp-design.md`, replace:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3 (playground: 3a core scenarios, 3b flow control, 3c-1 WebSocket and Recipes, 3c-2 SSE and the local server switch), 4a (showcase: navbar, hero, features) and the UX pass after 4a implemented; 4b and 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

with:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3 (playground: 3a core scenarios, 3b flow control, 3c-1 WebSocket and Recipes, 3c-2 SSE and the local server switch), 4a (showcase: navbar, hero, features), the UX pass after 4a, and 4b-1 (adapter cards, Why EvEm, footer, metadata, the showcase's follow-ups) implemented; 4b-2 (the playground's follow-ups) and 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

In `docs/demo-revamp-design.md`, delete:

```markdown
| 3b review | The site has no favicon (a 404 in the console) | 4 |
| 4a review | The hero's Pause button reads Play while `aria-pressed` is true (a screen reader hears "Play, pressed"): keep the label fixed, or drop `aria-pressed` | 4 |
| 4a review | The copy button's "Copied" isn't announced (its `aria-label` stays "Copy the install command") | 4 |
| 4a review | A lanes widget redraws on every resize without the rAF batching the workbench uses | 4 |
| 4a review | The still diagram (reduced motion, no JavaScript) shows `order.created` with `welcome` lit, which wouldn't run; and no test pins the diagram's first event to `FLOW_EVENTS[0]` | 4 |
| Layout-shift fixes' review | The phone menu closes on any `focusout` leaving it, including one with no `relatedTarget`: in Safari, where a click doesn't focus buttons or links, a menu opened from the keyboard could close before the link's click lands. Close only when `relatedTarget` is outside the menu (outside clicks are handled already); check in Safari | 4 |
| Layout-shift fixes' review | The navbar's two dropdowns close differently: the phone menu on an outside click, the theme picker not. Share the close rules | 4 |
| Layout-shift fixes' review | On phones the lanes widget scrolls sideways by 10 px: the chart's last tick label overhangs its track. Reserve half a label at the end of the track, or right-align the last label | 4 |
| Layout-shift fixes' review | On phones a widget's output is short (168 px with three controls) and kept at its end, so a run's first rows are out of view with no visible scrollbar: a taller card below `sm`, two control columns, or a fade at the top | 4 |
```

In `docs/demo-revamp-design.md`, replace:

```markdown
| UX pass review | After Clear, the empty timeline still says "Nothing yet: press …", which reads oddly once the reader has run something; and CLAUDE.md's `tests/site/` list doesn't name the `views` and `layout` tests | 4 |
```

with:

```markdown
| UX pass review | After Clear, the empty timeline still says "Nothing yet: press …", which reads oddly once the reader has run something | 4 |
```

In `docs/demo-revamp-design.md`, replace:

```markdown
| Note, 2026-10-03 | The public site builds the library from `src/` on every push to `main`, not from the npm release, so the playground can show unreleased behavior (phase 1's fixes are still under Unreleased) while the showcase says `npm install`: show which code the site runs, and release a version when the playground depends on unreleased behavior | 4 |
```

with:

```markdown
| Note, 2026-10-03 | The site runs the library from source (its footer and the playground's sidebar now say which version and commit), and the package isn't on npm yet though the hero says `npm install`: release 0.3.0 (`pnpm release 0.3.0 --dry-run` first, then the user's OK) | after 4b |
```

In `docs/demo-revamp-design.md`, replace:

```markdown
Phase 4 ships in two parts, each with its own plan and pull request: **4a**, the navbar, the hero and the feature sections; **4b**, the adapter cards, Why EvEm, the footer, the metadata and the follow-ups for phase 4.
```

with:

```markdown
Phase 4 ships in parts, each with its own plan and pull request: **4a**, the navbar, the hero and the feature sections; **4b-1**, the adapter cards, Why EvEm, the footer, the metadata and the showcase's follow-ups; **4b-2**, the playground's follow-ups (the user chose this split on 2026-10-03, with the release of 0.3.0 after 4b: the package isn't on npm yet, though the site says `npm install`).
```

- [ ] **Step 2: Run everything CI runs**

Run: `pnpm check`

Expected: exit 0: the format check, the type check, 74 test files (1,394 passed, 12 skipped) and the package check.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/demo-revamp-design.md
git commit -F - <<'EOF'
Docs: the showcase, finished (phase 4b-1)

The design doc marks 4b-1 done, records the split of 4b into two pull requests and the release of 0.3.0 that follows it, and drops the follow-ups this part fixed. CLAUDE.md describes the Adapters cards and the widget's adapter mode, the shared menu closing, the site stamp and the new tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```
