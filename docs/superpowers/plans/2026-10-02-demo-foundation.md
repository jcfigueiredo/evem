# Demo Foundation Implementation Plan (Demo Revamp, Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Vite site under `demo/` that runs the real library: the Signal / Signal Light themes with a picker, the scenario engine (code that runs, traced into a timeline of what EvEm did and why), a working playground workbench with its first scenario (Priorities), a placeholder showcase page, `pnpm demo` / `pnpm demo:build`, and a GitHub Pages workflow.

**Architecture:** `demo/vite.config.ts` aliases `@jcfigueiredo/evem` (and its subpaths) to `src/`, so the site imports the library by its published name. The engine (`demo/src/engine/`) is DOM-free and unit-tested in Node: `program.ts` renders a scenario's code from its controls and compiles it into setup + action functions; `tracedEvEm.ts` is an `EvEm` subclass that records what EvEm does (calls, filter and schema verdicts, middleware outcomes, cancels, skips and their reasons) into a `Trace`; `session.ts` runs a scenario. The UI (`demo/src/playground/`, `theme.ts`) is plain TypeScript with daisyUI classes; its pure parts (timeline rows, routing, theme choice) are unit-tested, the rest is checked in Chrome.

**Tech Stack:** Vite 8 (Rolldown), Tailwind CSS 4 with `@tailwindcss/vite`, daisyUI 5, CodeMirror 6 (`@codemirror/*`, lazy-loaded), `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`, Vitest 1.0 (unchanged), the TypeScript compiler API (phase 1's `tests/docs/typeCheck.ts`).

**Spec:** `docs/demo-revamp-design.md` — sections "Phase 2: Foundation" (Layout, Themes, Python mode, GitHub Pages, Scenario engine), "Decisions" and "Testing".

## Global Constraints

- No runtime dependencies: everything added here is a dev dependency. The published package (`files: ["dist"]`) is unchanged.
- Vite 8 needs Node.js `^20.19.0 || >=22.12.0` for the dev tooling; the library itself still supports Node.js 20+. CI's Node 20 leg uses the latest 20.x.
- The site imports the library only as `@jcfigueiredo/evem`, `@jcfigueiredo/evem/websocket`, `@jcfigueiredo/evem/sse` and `@jcfigueiredo/evem/sse/server`, aliased to `src/` in `demo/vite.config.ts`, `vitest.config.ts` and `tsconfig.json` (`paths`).
- Colors only through daisyUI semantic tokens, except the shared code-panel palette (`--code-*`); every text pair meets WCAG AA (4.5:1), enforced by `tests/site/contrast.test.ts`.
- Class names that Tailwind must generate are written out in full in the source (no `` `status-${tone}` ``): Tailwind scans the files for literal class names.
- DOM content from data goes through `el()` (`demo/src/dom.ts`): strings become text nodes, never HTML.
- Code style: Prettier (`pnpm format`), single quotes, 120 columns, no trailing commas; the format scripts cover the new `demo/` files from Task 1 on. The old pages in `demo/examples/` stay unformatted until phase 5 deletes them.
- Commit messages: subject, a body that explains why, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- New tests go in `tests/site/` (the old pages keep `tests/demo/` until phase 5).

## Rulings made while planning (for review)

Each was checked by a prototype that ran the code in this plan: the 136 tests in `tests/site/` pass against it (the whole suite too), `pnpm typecheck` and `pnpm format:check` are clean, the Pages build works, Task 1 builds with its placeholder pages, and the playground was used in Chrome (both themes, edit mode, an action that never finishes, a 390 px wide layout). Checking the plan against the spec found three engine bugs, fixed in the code below test-first: an import of a name the package doesn't export ran with it `undefined` (the spec asks for an error); a console capture restored whatever it found, so an action that never finished kept the console for good; and a slow setup that finished after a newer reset overwrote it.

1. **Vite 8, not 7.** The spec named Vite 7; Vite 8 (8.3.2) is current and `@tailwindcss/vite` supports it. `build.rollupOptions` is a deprecated alias in Vite 8, so the config uses `build.rolldownOptions`.
2. **`vite-tsconfig-paths` is replaced by Vitest's own `resolve.alias`.** With Vite 8 at the root, pnpm links `vite-tsconfig-paths` to Vite 8, and `pnpm typecheck` fails in `vitest.config.ts` (its plugin type is Vite 8's, Vitest 1.0 expects Vite 5's). It only provided the tests' `~/` alias; an alias does the same, and the config also maps the package names for the engine's tests. Vitest stays at 1.0 (upgrading it is still a separate change).
3. **Phase 2 includes the workbench and one scenario (Priorities).** The spec lists the playground UI under phase 2's layout and the scenarios under phase 3; building the workbench now makes phase 2 something to open and judge, and phase 3 then adds the other scenarios and the adapters.
4. **Display names come from the scenario's `helpers` map, not `function.name`.** A production build minifies function names (and the test transform renamed one to `audit2` in the prototype); `.name` is only the fallback, for functions the reader writes while editing (that code isn't bundled).
5. **Python mode works through Vite's proxy as is.** Verified: the stream from `examples/python/server.py` arrives unbuffered (one tick per second through the proxy) and `Last-Event-ID` passes through, so the spec's fallback (a `--cors` flag on the Python examples) isn't needed.
6. **CodeMirror from its individual packages**, without the `codemirror` meta-package, and loaded lazily: the editor is its own chunk (about 400 kB, 138 kB gzipped), fetched with the code panel; the showcase page doesn't load it.
7. **One code-panel palette for both themes.** Code panels use daisyUI's `neutral`, dark in both themes, so the syntax colors (`--code-*`) are shared; their contrast against both themes' `neutral` is tested.
8. **No DOM test environment.** The DOM code (`theme.ts`'s picker, `playground/*`, `editor.ts`) is checked in Chrome in Task 8; its logic is in pure functions that are unit-tested (`resolveTheme` / `readChoice` / `saveChoice`, the inline boot script's parity with them, `timelineRows`, routing).
9. **The site build is a test.** `tests/site/build.test.ts` builds the site with `DEMO_BASE=/evem/`, as Pages does, inside `pnpm test:nowatch`, so `pnpm check` and CI build it without a separate `pnpm demo:build` step.
10. **A `once` subscription is shown leaving, not skipped.** EvEm removes it after its call, so the timeline shows the call and then "unsubscribed"; on later publishes it no longer matches anything, so there's no "once already used" skip (the spec lists one).
11. **Timeline rows, not cards.** Phase 2 shows each publish's steps as rows indented under it (status dots, timings). Debounced calls are attributed to the publish that caused them in the trace and read "(later)"; naming that publish in the row, and any card styling, comes in phase 3 with the debounce scenario, which is the first to need it.
12. **Scenario checks use real timers for now.** Priorities has no timers; phase 3 switches `tests/site/scenarios.test.ts` to fake timers with its first timed scenario (the spec asks for fake timers).
13. **No `vite/client` types yet.** Nothing imports `?raw` or reads `import.meta.env` until phase 3's Python mode switch; that phase adds them.

## Review Focus

1. **An action or setup that never finishes, or finishes late** (edited code that awaits forever, a slow callback): its button stays disabled while it runs, and Reset, a control change or "Run edited code" must give working buttons, the newest code's program and the page's own console back. The workbench's `generation` counter does the buttons (Chrome, Task 8 step 5); the session does the rest (Task 4: `gives the console back on the next reset…`, `keeps the newest code when an earlier setup finishes after it`).
2. **Edited code that doesn't compile, imports something that doesn't exist, or throws**: the timeline shows one error entry, nothing crashes, Reset recovers. Tests in Task 4 (`records a syntax error…`, `records an import the package does not provide…`, `records an error thrown by an action`).
3. **Storage that throws** (private mode, blocked site data) and unknown saved values: the theme falls back to Signal everywhere, including the inline boot script before the page paints. Tests in Task 7 (`readChoice`, `saveChoice`, and the boot-script parity table with a throwing `localStorage`).
4. **A publish rerouted by middleware, or canceled**: skips are computed against the final event name, and subscriptions stopped by a cancel say so instead of "not called". Tests in Task 3.
5. **Narrow screens**: below the `lg` breakpoint the sidebar becomes a drawer behind the ☰ button, panels stack, and nothing scrolls sideways. Checked in Chrome in Task 8 (step 6).

---

## File Structure

| File | Responsibility |
|---|---|
| `demo/vite.config.ts` | Root `demo/`, the package-name aliases, the `/python` proxy, the two-page build, `DEMO_BASE` |
| `demo/index.html`, `demo/src/showcase/main.ts` | The showcase page (a hero for now; phase 4 fills it in) |
| `demo/playground/index.html`, `demo/src/playground/main.ts` | The playground page: drawer, sidebar, workbench; navigation through the playground's own EvEm |
| `demo/src/styles.css` | Tailwind + daisyUI, the `signal` and `signal-light` themes, the code palette, the Signal glow, the reduced-motion guard |
| `demo/src/theme.ts` | Theme choice (resolve, read, save) and the picker |
| `demo/src/dom.ts` | `el()`: elements from attributes and children, strings as text |
| `demo/src/engine/program.ts` | Control values → code; code → setup + actions |
| `demo/src/engine/trace.ts` | `Trace` and the `TraceEntry` model |
| `demo/src/engine/tracedEvEm.ts` | `createTracedEvEm()`, `matchesPattern()` |
| `demo/src/engine/session.ts` | `Scenario` types, `ScenarioSession` |
| `demo/src/scenarios/priorities.ts`, `demo/src/scenarios/index.ts` | The first scenario, and the list |
| `demo/src/routing.ts` | `#/<group>/<id>` addresses |
| `demo/src/timeline.ts` | Trace entries → timeline rows (text, tone, depth) |
| `demo/src/editor.ts` | The CodeMirror code panel |
| `demo/src/playground/workbench.ts`, `demo/src/playground/menu.ts` | The workbench and the sidebar |
| `tests/site/*.test.ts` | Build, engine, scenarios, timeline, routing, theme, boot script, contrast |
| `vitest.config.ts`, `tsconfig.json`, `package.json`, `.gitignore` | Aliases, paths, dependencies and scripts, `demo/dist` |
| `.github/workflows/ci.yml`, `.github/workflows/pages.yml` | The demo build in CI; deployment to Pages |
| `CLAUDE.md`, `README.md`, `docs/releasing.md`, `docs/demo-revamp-design.md` | The new commands, architecture and tests; phase 2 marked done |

### Task 1: Toolchain, aliases and a site that builds

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (dev dependencies, scripts), `vitest.config.ts`, `tsconfig.json`, `.gitignore`
- Create: `demo/vite.config.ts`, `demo/playground/index.html`, `demo/src/showcase/main.ts`, `demo/src/playground/main.ts`
- Replace: `demo/index.html` (the old card index; its pages in `demo/examples/` stay until phase 5)
- Delete: `tests/demo/demoIndex.test.ts` (it only checked the old index's cards)
- Test: `tests/site/build.test.ts`

**Interfaces:**
- Produces: `pnpm demo` (dev server) and `pnpm demo:build` (static site into `demo/dist/`), with `DEMO_BASE` setting Vite's `base`; the package-name aliases for the site, Vitest and `tsc`.

- [ ] **Step 1: Write the failing test**

`tests/site/build.test.ts`:

```typescript
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../', import.meta.url));

it('builds the showcase and the playground for GitHub Pages, with the real library inside', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'evem-site-'));
  try {
    execFileSync(
      process.execPath,
      [
        join(repo, 'node_modules/vite/bin/vite.js'),
        'build',
        '--config',
        join(repo, 'demo/vite.config.ts'),
        '--outDir',
        outDir,
        '--emptyOutDir',
        '--logLevel',
        'error'
      ],
      { cwd: repo, env: { ...process.env, DEMO_BASE: '/evem/' }, stdio: 'pipe' }
    );
    for (const page of ['index.html', 'playground/index.html']) {
      expect(readFileSync(join(outDir, page), 'utf8')).toMatch(/src="\/evem\/assets\/[^"]+\.js"/);
    }
    const scripts = readdirSync(join(outDir, 'assets'))
      .filter(file => file.endsWith('.js'))
      .map(file => readFileSync(join(outDir, 'assets', file), 'utf8'))
      .join('\n');
    // A message from src/eventEmitter.ts: the pages run the library, not a copy of it
    expect(scripts).toContain('Max recursion depth of');
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}, 120_000);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:nowatch tests/site/build.test.ts`
Expected: FAIL — `Command failed: … node_modules/vite/bin/vite.js build …` with `Cannot find module …/node_modules/vite/bin/vite.js` (Vitest's own Vite 5 isn't linked at the root, and `demo/vite.config.ts` doesn't exist).

- [ ] **Step 3: Add the dependencies and replace `vite-tsconfig-paths`**

```bash
pnpm add -D vite@^8.3.2 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 daisyui@^5.7.47 \
  @codemirror/state@^6.7.6 @codemirror/view@^6.43.13 @codemirror/commands@^6.11.1 \
  @codemirror/language@^6.12.4 @codemirror/lang-javascript@^6.2.5 @lezer/highlight@^1.2.5 \
  @fontsource-variable/inter@^5.3.0 @fontsource-variable/jetbrains-mono@^5.3.0
pnpm remove vite-tsconfig-paths
```

(pnpm warns that Vite 8 wants `@types/node` 20.19+; the repo keeps 18 on purpose, see `SseFetch` in CLAUDE.md, and `pnpm typecheck` passes with it.)

`vitest.config.ts` (replaces the `tsconfigPaths()` plugin with aliases):

```typescript
/// <reference types="vitest" />

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // tsconfig.json's ~/ path, for tests
      { find: /^~\//, replacement: source('') },
      // The package's entry points, for code that imports them by name (the demo)
      { find: /^@jcfigueiredo\/evem$/, replacement: source('index.ts') },
      { find: /^@jcfigueiredo\/evem\/websocket$/, replacement: source('websocket/index.ts') },
      { find: /^@jcfigueiredo\/evem\/sse$/, replacement: source('sse/index.ts') },
      { find: /^@jcfigueiredo\/evem\/sse\/server$/, replacement: source('sse/server.ts') }
    ]
  },
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['html']
    }
  }
});
```

In `tsconfig.json`, extend `paths` so `tsc` resolves the package names the site imports:

```json
    "paths": {
      "~/*": ["./src/*"],
      "@jcfigueiredo/evem": ["./src/index.ts"],
      "@jcfigueiredo/evem/websocket": ["./src/websocket/index.ts"],
      "@jcfigueiredo/evem/sse": ["./src/sse/index.ts"],
      "@jcfigueiredo/evem/sse/server": ["./src/sse/server.ts"]
    }
```

In `package.json` `scripts`, add after `"typecheck"`:

```json
    "demo": "vite --config demo/vite.config.ts",
    "demo:build": "vite build --config demo/vite.config.ts",
```

and extend the format scripts to the new site files (not the old `demo/examples/` pages):

```json
    "format": "prettier --write src tests scripts vitest.config.ts demo/src demo/vite.config.ts demo/index.html demo/playground",
    "format:check": "prettier --check src tests scripts vitest.config.ts demo/src demo/vite.config.ts demo/index.html demo/playground",
```

In `.gitignore`, under `# production`, add `/demo/dist`.

- [ ] **Step 4: Write the Vite config and the two pages**

`demo/vite.config.ts`:

```typescript
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** A path relative to this file */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  // GitHub Pages serves the site from /evem/ (pages.yml sets DEMO_BASE)
  base: process.env['DEMO_BASE'] ?? '/',
  plugins: [tailwindcss()],
  resolve: {
    // The library's own sources, under the package's published names, so the demo's code reads like users' code
    alias: [
      { find: /^@jcfigueiredo\/evem$/, replacement: here('../src/index.ts') },
      { find: /^@jcfigueiredo\/evem\/websocket$/, replacement: here('../src/websocket/index.ts') },
      { find: /^@jcfigueiredo\/evem\/sse$/, replacement: here('../src/sse/index.ts') },
      { find: /^@jcfigueiredo\/evem\/sse\/server$/, replacement: here('../src/sse/server.ts') }
    ]
  },
  server: {
    // Python mode: SSE scenarios reach examples/python/server.py (or the Flask / FastAPI apps) on port 8000
    proxy: { '/python': { target: 'http://127.0.0.1:8000', rewrite: path => path.replace(/^\/python/, '') } }
  },
  build: {
    outDir: here('dist'),
    emptyOutDir: true,
    rolldownOptions: { input: { main: here('index.html'), playground: here('playground/index.html') } }
  }
});
```

Replace `demo/index.html` with a minimal page (Task 7 gives it its content):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EvEm</title>
    <script type="module" src="./src/showcase/main.ts"></script>
  </head>
  <body></body>
</html>
```

`demo/playground/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EvEm Playground</title>
    <script type="module" src="../src/playground/main.ts"></script>
  </head>
  <body></body>
</html>
```

`demo/src/showcase/main.ts` and `demo/src/playground/main.ts`, the same placeholder (Tasks 7 and 8 replace them). It publishes something, so the bundle keeps `EvEm.publish`, which the test looks for:

```typescript
import { EvEm } from '@jcfigueiredo/evem';

// The page's own events go through EvEm (a later task replaces this file)
const bus = new EvEm();
bus.subscribe<string>('page.ready', title => console.info(`${title} is ready`));
void bus.publish('page.ready', document.title);
```

Delete `tests/demo/demoIndex.test.ts`: the index it checked is gone.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:nowatch tests/site/build.test.ts`
Expected: PASS (1 test, about 1–2 s).

- [ ] **Step 6: Check the rest still works, then commit**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch && pnpm demo:build
git status --short   # demo/dist/ must not appear
git add package.json pnpm-lock.yaml vitest.config.ts tsconfig.json .gitignore demo/vite.config.ts demo/index.html demo/playground demo/src tests/site/build.test.ts tests/demo/demoIndex.test.ts
git commit -m "Demo site: Vite 8 with the library's sources under its package names

demo/vite.config.ts builds a two-page site (the showcase at the root,
the playground at /playground/) from the library's src/, aliased to
@jcfigueiredo/evem and its entry points, so the site's code reads like
users' code. DEMO_BASE sets the base path (/evem/ on GitHub Pages);
pnpm demo runs the dev server, which proxies /python to the Python SSE
examples on port 8000. pnpm demo:build writes demo/dist/ (ignored).

vite-tsconfig-paths is replaced by Vitest's resolve.alias: with Vite 8 at
the root, pnpm linked it to Vite 8 and pnpm typecheck failed against
Vitest 1.0's Vite 5 plugin types. The aliases also map the package names
for the site's engine tests. The old demo's card index is replaced; its
pages in demo/examples/ stay until the playground covers them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes (the old `tests/demo/` tests for the pages in `demo/examples/` still run).

---

### Task 2: Scenario code: controls into code, code into actions

**Files:**
- Create: `demo/src/engine/program.ts`
- Test: `tests/site/program.test.ts`

**Interfaces:**
- Produces: `type ControlValue = string | number | boolean`; `interface Action { id: string; label: string }`; `interface PackageImport { entryPoint: string; names: string[] }`; `toLiteral(value)`, `renderCode(template, values)`, `slug(label)`, `splitActions(code)`, `compileProgram(code): { body: string; actions: Action[]; imports: PackageImport[] }` — `body` is the body of an async function with a `__modules` parameter (plus whatever names the caller adds) that runs the setup and returns `{ [actionId]: () => Promise<unknown> }`; `imports` lists the exported names the code imports from each entry point (aliases resolved, `type` specifiers dropped), so the session can check them.

- [ ] **Step 1: Write the failing tests**

`tests/site/program.test.ts`:

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

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:nowatch tests/site/program.test.ts`
Expected: FAIL — `Failed to load url ../../demo/src/engine/program`.

- [ ] **Step 3: Write the implementation**

`demo/src/engine/program.ts`:

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
export function renderCode(template: string, values: Record<string, ControlValue>): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    if (!(name in values)) {
      throw new Error(`No control named ${name} for ${placeholder}`);
    }
    return toLiteral(values[name]!);
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

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:nowatch tests/site/program.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/engine/program.ts tests/site/program.test.ts
git commit -m "Demo engine: render a scenario's code and compile it into actions

A scenario's code is a template: {{control}} placeholders become the
control values as literals, so the code panel shows exactly what runs,
and // ▶ Label lines start action blocks. compileProgram() turns it into
the body of an async function that runs the setup and returns each
action as a function sharing the setup's variables; imports from
@jcfigueiredo/evem become lookups in __modules.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The trace and the traced EvEm

**Files:**
- Create: `demo/src/engine/trace.ts`, `demo/src/engine/tracedEvEm.ts`
- Test: `tests/site/tracedEvEm.test.ts`

**Interfaces:**
- Produces:
  - `type SkipReason = 'filtered' | 'schema' | 'throttled' | 'debounced' | 'canceled' | 'not-called'`
  - `type TraceEntry` — `{ at: number; publish?: number }` and one of `subscribe`, `unsubscribe`, `publish` (`id`, `event`, `data`), `result` (`id`, `result`), `rejected`, `middleware` (`name`, `outcome`, `to?`), `schema`, `filter`, `call` (`subscription`, `data`, `later?`), `cancel`, `transform`, `skip` (`subscription`, `reason`), `error` (`message`, `subscription?`), `log` (`level`, `text`)
  - `class Trace { entries; currentPublish; openPublish(); closePublish(id); record(record) }` — `new Trace(bus?: EvEm)` publishes each entry as `trace.entry` on `bus`
  - `createTracedEvEm(trace: Trace, names?: ReadonlyMap<Function, string>): typeof EvEm`; `matchesPattern(evem: EvEm, event: string, pattern: string): boolean`

How it works: the subclass wraps what it's given (callbacks, filters, schema, transform, middleware) with functions that record and then call the original, unchanged; `publish` records the start, a state per publish (which subscriptions ran, which a filter or schema rejected, the event name after reroutes), and at the end a `skip` with a reason for each subscription that matched but didn't run. `matchesPattern` and the reroute check call EvEm's private `isEventMatch` / `isMiddlewareReroute`, so the timeline can't disagree with EvEm; the wildcard table in the test pins `matchesPattern`.

- [ ] **Step 1: Write the failing tests**

`tests/site/tracedEvEm.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:nowatch tests/site/tracedEvEm.test.ts`
Expected: FAIL — `Failed to load url ../../demo/src/engine/trace`.

- [ ] **Step 3: Write the implementation**

`demo/src/engine/trace.ts`:

```typescript
import type { EvEm } from '@jcfigueiredo/evem';

/** Why a subscription that matched an event didn't run */
export type SkipReason = 'filtered' | 'schema' | 'throttled' | 'debounced' | 'canceled' | 'not-called';

/** One thing EvEm did, as the timeline shows it. `publish` is the id of the publish it happened in, if any */
export type TraceEntry = { at: number; publish?: number } & (
  | { kind: 'subscribe'; subscription: string; pattern: string; options: string[] }
  | { kind: 'unsubscribe'; subscription: string }
  | { kind: 'publish'; id: number; event: string; data: unknown }
  | { kind: 'result'; id: number; result: boolean }
  | { kind: 'rejected'; id: number; error: string }
  | { kind: 'middleware'; name: string; outcome: 'continue' | 'cancel' | 'reroute'; to?: string }
  | { kind: 'schema'; subscription: string; valid: boolean }
  | { kind: 'filter'; subscription: string; name: string; passed: boolean }
  | { kind: 'call'; subscription: string; data: unknown; later?: boolean }
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
  private readonly started = performance.now();
  private nextPublishId = 1;
  private readonly open: number[] = [];

  constructor(private readonly bus?: EvEm) {}

  /** The innermost publish still running, if any */
  get currentPublish(): number | undefined {
    return this.open[this.open.length - 1];
  }

  /** Start a publish: returns its id, which entries recorded until `closePublish` are attributed to */
  openPublish(): number {
    const id = this.nextPublishId++;
    this.open.push(id);
    return id;
  }

  closePublish(id: number): void {
    const index = this.open.lastIndexOf(id);
    if (index !== -1) this.open.splice(index, 1);
  }

  record(record: TraceRecord): TraceEntry {
    const entry = {
      ...record,
      at: Math.round(performance.now() - this.started),
      publish: 'publish' in record ? record.publish : this.currentPublish
    } as TraceEntry;
    this.entries.push(entry);
    void this.bus?.publish('trace.entry', entry);
    return entry;
  }
}
```

`demo/src/engine/tracedEvEm.ts`:

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
export function createTracedEvEm(trace: Trace, names: ReadonlyMap<Function, string> = new Map()): typeof EvEm {
  /** A function's display name: the scenario's name for it, else its own (only code the reader wrote keeps one) */
  const nameOf = (fn: Function, fallback: string) => names.get(fn) ?? (fn.name || fallback);

  return class TracedEvEm extends EvEm {
    private readonly subscriptions = new Map<string, Subscription>();
    private readonly publishes = new Map<number, PublishState>();
    /** Recent publishes, newest last, to attribute calls that happen after their publish (debounce) */
    private readonly history: Array<{ id: number; event: string }> = [];
    private readonly middlewares = new Map<MiddlewareFunction<any>, MiddlewareFunction<any>>();

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
      const name = nameOf(callback, `subscriber ${this.subscriptions.size + 1}`);
      let id = '';
      const wrapped: EventCallback<T> = data => {
        const state = this.current();
        state?.called.add(id);
        const publish = state?.id ?? this.latestFor(event);
        trace.record({ kind: 'call', subscription: name, data, publish, ...(state ? {} : { later: true }) });
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
      id = super.subscribe(event, wrapped, traced);
      this.subscriptions.set(id, { id, name, pattern: event, options, original: callback, wrapped });
      trace.record({ kind: 'subscribe', subscription: name, pattern: event, options: describeOptions(options) });
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
          return (data: T) =>
            settle(filter(data), passed => {
              const state = this.current();
              if (!passed) state?.filtered.add(id());
              trace.record({ kind: 'filter', subscription: name, name: filterName, passed: Boolean(passed) });
            });
        });
        traced.filter = Array.isArray(options.filter) ? wrappedFilters : wrappedFilters[0];
      }
      if (options.schema) {
        const schema = options.schema;
        traced.schema = ((data: T) =>
          settle(schema(data), result => {
            const valid = typeof result === 'boolean' ? result : Boolean(result?.valid);
            if (!valid) this.current()?.invalid.add(id());
            trace.record({ kind: 'schema', subscription: name, valid });
          })) as typeof schema;
      }
      if (options.transform) {
        const transform = options.transform;
        traced.transform = (data: T) =>
          settle(transform(data), result => trace.record({ kind: 'transform', subscription: name, data: result }));
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
      if (subscription) this.forget(subscription);
    }

    private forget(subscription: Subscription): void {
      this.subscriptions.delete(subscription.id);
      trace.record({ kind: 'unsubscribe', subscription: subscription.name });
    }

    override use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
      const handler = typeof middleware === 'function' ? middleware : middleware.handler;
      const name = nameOf(handler, `middleware ${this.middlewares.size + 1}`);
      const traced: MiddlewareFunction<T> = (event, data) =>
        settle(handler(event, data), result => {
          const state = this.current();
          if (result === null) {
            trace.record({ kind: 'middleware', name, outcome: 'cancel' });
          } else if (result !== data && isReroute(this, result)) {
            if (state) state.event = result.event;
            trace.record({ kind: 'middleware', name, outcome: 'reroute', to: result.event });
          } else {
            trace.record({ kind: 'middleware', name, outcome: 'continue' });
          }
        });
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
      const id = trace.openPublish();
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
      this.history.push({ id, event });
      if (this.history.length > 50) this.history.shift();
      try {
        const result = await super.publish(event, args, options);
        this.recordSkips(state, result);
        trace.record({ kind: 'result', id, result, publish: parent });
        return result;
      } catch (error) {
        this.recordSkips(state, false);
        trace.record({ kind: 'rejected', id, error: messageOf(error), publish: parent });
        throw error;
      } finally {
        trace.closePublish(id);
        this.publishes.delete(id);
      }
    }

    /** For every subscription that matched the (final) event but didn't run, say why */
    private recordSkips(state: PublishState, result: boolean): void {
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
                : state.canceled || !result
                  ? 'canceled'
                  : 'not-called';
        trace.record({ kind: 'skip', subscription: subscription.name, reason, publish: state.id });
      }
    }
  };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:nowatch tests/site/tracedEvEm.test.ts`
Expected: PASS (19 tests: 10 behaviors and the 9-row wildcard table).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/engine/trace.ts demo/src/engine/tracedEvEm.ts tests/site/tracedEvEm.test.ts
git commit -m "Demo engine: record what EvEm did, and why a subscriber didn't run

createTracedEvEm() returns an EvEm subclass for the playground: it wraps
callbacks, filters, schemas, transforms and middleware with functions
that record into a Trace and call the originals unchanged. Each publish
gets an entry, the calls and verdicts during it are attributed to it
(nested publishes to theirs), and at its end every subscription that
matched the final event name but didn't run gets a reason: filtered,
schema, throttled, debounced (with the later call), canceled.

Display names come from the scenario's own map first, since a
production build minifies function names. Matching and reroute
detection use EvEm's own private methods, pinned by a test.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Scenario sessions

**Files:**
- Create: `demo/src/engine/session.ts`
- Test: `tests/site/session.test.ts`

**Interfaces:**
- Consumes: `compileProgram` (with its `imports`), `renderCode`, `Action`, `ControlValue`, `PackageImport` (Task 2); `Trace`, `createTracedEvEm` (Task 3).
- Produces:
  - `type Control` — `{ kind: 'select'; label; options; default }` | `{ kind: 'number'; label; min; max; step?; default }` | `{ kind: 'toggle'; label; default }`
  - `interface ScenarioCheck { values?; action: string; calls: string[]; result?: boolean }`
  - `interface Scenario { id; group; title; summary; docs; controls: Record<string, Control>; helpers: Record<string, (...args: any[]) => unknown>; code: string; checks: ScenarioCheck[] }`
  - `defaultValues(scenario)`; `class ScenarioSession { values; code; edited; actions; trace; constructor(scenario, bus?); setValue(name, value); edit(code); restoreTemplate(); reset(); run(actionId) }` — all async methods resolve after recording their errors in the trace (they never reject)
  - Before running the setup, `reset()` checks `compileProgram`'s `imports` against the modules it provides: an unknown entry point (`There's no <entry> entry point`) or name (`<entry> has no export named <name>`) is an error entry, as the spec asks, instead of a binding that's silently `undefined`
  - Each `reset()` works on its own trace and installs its program only if no newer reset started meanwhile (a slow setup can't overwrite newer code); while code runs, the session routes `console.warn` / `console.error` into the trace, and each capture undoes only itself, back to the page's console, so a run that never finishes can't keep the console

- [ ] **Step 1: Write the failing tests**

`tests/site/session.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { defaultValues, ScenarioSession, type Scenario } from '../../demo/src/engine/session';

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

  it('records an error thrown by an action', async () => {
    const session = new ScenarioSession({ ...scenario, code: '// ▶ Fail\nthrow new Error("no");' });
    await session.reset();
    await session.run('fail');
    expect(session.trace.entries).toEqual([expect.objectContaining({ kind: 'error', message: 'no' })]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:nowatch tests/site/session.test.ts`
Expected: FAIL — `Failed to load url ../../demo/src/engine/session`.

- [ ] **Step 3: Write the implementation**

`demo/src/engine/session.ts`:

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
  | { kind: 'select'; label: string; options: readonly ControlValue[]; default: ControlValue }
  | { kind: 'number'; label: string; min: number; max: number; step?: number; default: number }
  | { kind: 'toggle'; label: string; default: boolean };

/** A hand-checked expectation for one action, used by the scenario tests */
export interface ScenarioCheck {
  /** Control values for this check; the defaults otherwise */
  values?: Record<string, ControlValue>;
  action: string;
  /** Subscription names in the order their callbacks ran during the action */
  calls: string[];
  /** What the action's last publish resolved to */
  result?: boolean;
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
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...parameters: string[]
) => (...args: unknown[]) => Promise<unknown>;

/** The page's own console methods, which every run that replaces them puts back */
const pageConsole = { warn: console.warn, error: console.error };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
    this.code = renderCode(scenario.code, this.values);
    this.trace = new Trace(bus);
  }

  /** Change a control: the code is rendered again (unless it's being edited) and the scenario restarts */
  setValue(name: string, value: ControlValue): Promise<void> {
    this.values[name] = value;
    if (!this.edited) {
      this.code = renderCode(this.scenario.code, this.values);
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
    this.code = renderCode(this.scenario.code, this.values);
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
    try {
      const { body, actions, imports } = compileProgram(this.code);
      this.actions = actions;
      const modules: Record<string, object> = {
        '@jcfigueiredo/evem': { ...core, EvEm: createTracedEvEm(trace, this.helperNames()) },
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

  /** The `console` the scenario's code sees: what it logs goes to `trace` */
  private consoleForCode(trace: Trace): Pick<Console, 'log' | 'warn' | 'error'> {
    const record =
      (level: 'log' | 'warn' | 'error') =>
      (...args: unknown[]) =>
        trace.record({ kind: 'log', level, text: args.map(formatArgument).join(' ') });
    return { log: record('log'), warn: record('warn'), error: record('error') };
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
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:nowatch tests/site/session.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/engine/session.ts tests/site/session.test.ts
git commit -m "Demo engine: run a scenario, its edits and its actions

A ScenarioSession holds a scenario's control values and the code they
render (or the reader's edit), and runs it: every reset starts a new
trace and a fresh traced EvEm, runs the setup, and keeps the actions.
Errors (a syntax error in an edit, an import the package doesn't
provide, a missing action, a throwing action) become trace entries; the code's own console and what EvEm itself logs
during a run are recorded too. Each reset works on its own trace, so a
slow setup that finishes after a newer one can't overwrite it, and each
console capture undoes only itself, so an action that never finishes
can't keep the page's console.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Timeline rows and scenario addresses

**Files:**
- Create: `demo/src/timeline.ts`, `demo/src/routing.ts`
- Test: `tests/site/timeline.test.ts`, `tests/site/routing.test.ts`

**Interfaces:**
- Consumes: `TraceEntry`, `SkipReason` (Task 3); `slug` (Task 2).
- Produces:
  - `type Tone = 'primary' | 'neutral' | 'info' | 'success' | 'warning' | 'error'`; `interface TimelineRow { text: string; detail?: string; tone: Tone; depth: number; at: number }`
  - `preview(value: unknown, max = 72): string` (JSON, shortened with `…`); `describeEntry(entry): Omit<TimelineRow, 'depth' | 'at'>`; `timelineRows(entries: readonly TraceEntry[]): TimelineRow[]` — depth 0 outside publishes, one level deeper than the publish an entry belongs to
  - `interface Routable { id: string; group: string }`; `scenarioPath(scenario): string` (`#/<slug(group)>/<id>`); `scenarioForHash(hash, scenarios)` — the matching scenario, else the first; throws `There are no scenarios` for an empty list

- [ ] **Step 1: Write the failing tests**

`tests/site/timeline.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../demo/src/engine/trace';
import { describeEntry, preview, timelineRows } from '../../demo/src/timeline';

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
    [{ kind: 'error', subscription: 'save', message: 'boom', at: 0 }, 'save threw: boom', 'error'],
    [{ kind: 'log', level: 'warn', text: 'careful', at: 0 }, 'careful', 'warning']
  ] as Array<[TraceEntry, string, string]>)('%o reads "%s"', (entry, text, tone) => {
    expect(describeEntry(entry)).toMatchObject({ text, tone });
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
```

`tests/site/routing.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { scenarioForHash, scenarioPath } from '../../demo/src/routing';

const list = [
  { id: 'priorities', group: 'Core' },
  { id: 'throttle', group: 'Flow control' }
];

describe('scenarioPath', () => {
  it('is #/<group>/<id>, with the group as a slug', () => {
    expect(scenarioPath(list[1]!)).toBe('#/flow-control/throttle');
  });
});

describe('scenarioForHash', () => {
  it('finds the scenario a hash points to', () => {
    expect(scenarioForHash('#/flow-control/throttle', list)).toBe(list[1]);
  });

  it('falls back to the first scenario for an empty or unknown hash', () => {
    expect(scenarioForHash('', list)).toBe(list[0]);
    expect(scenarioForHash('#/nope/missing', list)).toBe(list[0]);
  });

  it('throws when there are no scenarios', () => {
    expect(() => scenarioForHash('', [])).toThrow('There are no scenarios');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:nowatch tests/site/timeline.test.ts tests/site/routing.test.ts`
Expected: FAIL — `Failed to load url ../../demo/src/timeline` and `Failed to load url ../../demo/src/routing`.

- [ ] **Step 3: Write the implementation**

`demo/src/timeline.ts`:

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
      return { text: `${entry.subscription} unsubscribed`, tone: 'neutral' };
    case 'publish':
      return { text: `publish ${entry.event}`, detail: preview(entry.data), tone: 'primary' };
    case 'result':
      return { text: `resolved ${entry.result}`, tone: entry.result ? 'success' : 'warning' };
    case 'rejected':
      return { text: `rejected: ${entry.error}`, tone: 'error' };
    case 'middleware':
      return entry.outcome === 'reroute'
        ? { text: `middleware ${entry.name} rerouted it to ${entry.to}`, tone: 'info' }
        : entry.outcome === 'cancel'
          ? { text: `middleware ${entry.name} canceled it`, tone: 'warning' }
          : { text: `middleware ${entry.name} passed it on`, tone: 'info' };
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
        text: `${entry.subscription} ran${entry.later ? ' (later)' : ''}`,
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
```

`demo/src/routing.ts`:

```typescript
import { slug } from './engine/program';

export interface Routable {
  id: string;
  group: string;
}

/** A scenario's address in the playground: #/<group>/<id> */
export function scenarioPath(scenario: Routable): string {
  return `#/${slug(scenario.group)}/${scenario.id}`;
}

/** The scenario a location hash points to, or the first one */
export function scenarioForHash<S extends Routable>(hash: string, scenarios: readonly S[]): S {
  const found = scenarios.find(scenario => scenarioPath(scenario) === hash);
  if (found) return found;
  if (scenarios.length === 0) throw new Error('There are no scenarios');
  return scenarios[0]!;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test:nowatch tests/site/timeline.test.ts tests/site/routing.test.ts`
Expected: PASS (15 tests: 11 and 4).

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/timeline.ts demo/src/routing.ts tests/site/timeline.test.ts tests/site/routing.test.ts
git commit -m "Demo: timeline rows from the trace, and scenario addresses

timelineRows() turns trace entries into the lines the workbench shows:
a sentence per entry (\"audit ran\", \"vip: isVip rejected it\", \"save
skipped: debounced …\"), a tone for its status dot, and a depth, so what
happened during a publish is indented under it and nested publishes one
level more. Scenarios live at #/<group>/<id>; an unknown address shows
the first scenario.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Priorities scenario

**Files:**
- Create: `demo/src/scenarios/priorities.ts`, `demo/src/scenarios/index.ts`
- Test: `tests/site/scenarios.test.ts`

**Interfaces:**
- Consumes: `Scenario`, `ScenarioSession`, `defaultValues` (Task 4); `renderCode` (Task 2); `scenarioPath` (Task 5); `typeCheck(files: VirtualFile[], declarationFiles?: string[]): TypeDiagnostic[]` from `tests/docs/typeCheck.ts` (phase 1: type-checks virtual files against `src/` with the repository's compiler options and the package names mapped).
- Produces: `priorities: Scenario`; `scenarios: readonly Scenario[]` — every scenario, in sidebar order (phase 3 adds to it).

The test is generic: every scenario in the list must have unique addresses and select defaults among their options, type-check with every value of every control (one control at a time, the others at their defaults; its helpers declared as globals), and pass its own `checks` (which subscribers ran, in order, and the result).

- [ ] **Step 1: Write the failing test**

`tests/site/scenarios.test.ts`:

```typescript
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { renderCode } from '../../demo/src/engine/program';
import { defaultValues, ScenarioSession, type Scenario } from '../../demo/src/engine/session';
import { scenarioPath } from '../../demo/src/routing';
import { scenarios } from '../../demo/src/scenarios';
import { typeCheck } from '../docs/typeCheck';

const scratch = mkdtempSync(join(tmpdir(), 'evem-scenarios-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The scenario's code with every value of every control, one control at a time (the others at their defaults) */
function variants(scenario: Scenario): string[] {
  const defaults = defaultValues(scenario);
  const codes = [renderCode(scenario.code, defaults)];
  for (const [name, control] of Object.entries(scenario.controls)) {
    const values =
      control.kind === 'select'
        ? control.options
        : control.kind === 'toggle'
          ? [true, false]
          : [control.min, control.max];
    for (const value of values) codes.push(renderCode(scenario.code, { ...defaults, [name]: value }));
  }
  return codes;
}

describe('the scenario list', () => {
  it('has unique ids and addresses', () => {
    expect(new Set(scenarios.map(scenario => scenario.id)).size).toBe(scenarios.length);
    expect(new Set(scenarios.map(scenarioPath)).size).toBe(scenarios.length);
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
    for (const check of scenario.checks) expect(actions).toContain(check.action);
  });

  it('type-checks against the package API with every control value', () => {
    const prelude = join(scratch, `${scenario.id}.d.ts`);
    const helpers = Object.keys(scenario.helpers).map(name => `  const ${name}: (...args: any[]) => any;`);
    writeFileSync(prelude, `declare global {\n${helpers.join('\n')}\n}\nexport {};\n`);
    const files = variants(scenario).map((code, index) => ({ path: `__scenarios__/${scenario.id}_${index}.ts`, code }));
    const problems = typeCheck(files, [prelude]).map(d => `${d.path}:${d.line}: TS${d.code} ${d.message}`);
    expect(problems).toEqual([]);
  }, 60_000);

  it.each(scenario.checks.map((check, index) => [index + 1, check] as const))(
    'check %i: the action calls its subscribers in the expected order',
    async (_index, check) => {
      const session = new ScenarioSession(scenario);
      for (const [name, value] of Object.entries(check.values ?? {})) {
        session.values[name] = value;
      }
      await session.restoreTemplate();
      const before = session.trace.entries.length;

      await session.run(check.action);

      const entries = session.trace.entries.slice(before);
      expect(entries.filter(entry => entry.kind === 'error')).toEqual([]);
      expect(entries.flatMap(entry => (entry.kind === 'call' ? [entry.subscription] : []))).toEqual(check.calls);
      if (check.result !== undefined) {
        expect(entries.filter(entry => entry.kind === 'result').at(-1)).toMatchObject({ result: check.result });
      }
    }
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: FAIL — `Failed to load url ../../demo/src/scenarios`.

- [ ] **Step 3: Write the scenario and the list**

`demo/src/scenarios/priorities.ts`:

```typescript
import type { Scenario } from '../engine/session';

const PRIORITIES = ['high', 'normal', 'low', 10, -10] as const;

export const priorities: Scenario = {
  id: 'priorities',
  group: 'Core',
  title: 'Priorities',
  summary:
    "Subscribers run highest priority first: 'high' is 100, 'normal' 0, 'low' -100, or any number. Equal priorities run in the order they subscribed.",
  docs: 'https://github.com/jcfigueiredo/evem#prioritizing-events',
  controls: {
    auditPriority: { kind: 'select', label: 'audit priority', options: PRIORITIES, default: 'low' },
    emailPriority: { kind: 'select', label: 'email priority', options: PRIORITIES, default: 'normal' },
    metricsPriority: { kind: 'select', label: 'metrics priority', options: PRIORITIES, default: 'high' }
  },
  helpers: {
    audit: () => {},
    email: () => {},
    metrics: () => {}
  },
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    "evem.subscribe('order.created', audit, { priority: {{auditPriority}} });",
    "evem.subscribe('order.created', email, { priority: {{emailPriority}} });",
    "evem.subscribe('order.created', metrics, { priority: {{metricsPriority}} });",
    '',
    '// ▶ Publish order.created',
    "await evem.publish('order.created', { id: 42, total: 99 });"
  ].join('\n'),
  checks: [
    { action: 'publish-order-created', calls: ['metrics', 'email', 'audit'], result: true },
    {
      values: { auditPriority: 'normal', emailPriority: 'normal', metricsPriority: 'normal' },
      action: 'publish-order-created',
      calls: ['audit', 'email', 'metrics'],
      result: true
    },
    {
      values: { auditPriority: 10, emailPriority: 'high', metricsPriority: -10 },
      action: 'publish-order-created',
      calls: ['email', 'audit', 'metrics'],
      result: true
    }
  ]
};
```

`demo/src/scenarios/index.ts`:

```typescript
import type { Scenario } from '../engine/session';
import { priorities } from './priorities';

/** Every scenario, in sidebar order (grouped as they follow each other) */
export const scenarios: readonly Scenario[] = [priorities];
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`
Expected: PASS (6 tests: the list, and for Priorities its defaults, the type check of 16 variants, and 3 checks). The type check takes a few seconds.

- [ ] **Step 5: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/scenarios tests/site/scenarios.test.ts
git commit -m "Demo: the Priorities scenario, and tests that hold every scenario to its code

The first scenario: three subscribers to order.created whose priorities
the reader sets ('high', 'normal', 'low', 10, -10), and a publish.

Every scenario in the list is type-checked against the package API with
each value of each control, through phase 1's compiler-API helper, and
runs its declared checks (which subscribers ran, in which order, and
the result), so a scenario can't show code that doesn't compile or
behavior the library doesn't have.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Themes and the showcase page

**Files:**
- Create: `demo/src/styles.css`, `demo/src/dom.ts`, `demo/src/theme.ts`
- Replace: `demo/index.html`, `demo/src/showcase/main.ts`, `demo/playground/index.html` (Task 1's placeholders; `demo/src/playground/main.ts` stays a placeholder until Task 8)
- Test: `tests/site/theme.test.ts`, `tests/site/themeBoot.test.ts`, `tests/site/contrast.test.ts`

**Interfaces:**
- Produces:
  - `el<K>(tag: K, attributes: Record<string, string> = {}, children: Array<Node | string | null | undefined | false> = []): HTMLElementTagNameMap[K]` — strings become text nodes, falsy children are skipped
  - `type Theme = 'signal' | 'signal-light'`; `type ThemeChoice = Theme | 'system'`; `THEME_STORAGE_KEY = 'evem-theme'`; `resolveTheme(choice, prefersLight): Theme`; `readChoice(storage: Pick<Storage, 'getItem'> | undefined): ThemeChoice` (Signal for nothing saved, an unknown value or storage that throws); `saveChoice(storage: Pick<Storage, 'setItem'> | undefined, choice)` (ignores storage that throws)
  - `mountThemePicker(container: HTMLElement, bus: EvEm, placement = 'dropdown-top'): void` — a daisyUI dropdown (Signal, Signal Light, Match system) that sets `<html data-theme>`, saves the choice, follows `prefers-color-scheme` live while Match system is chosen, and publishes `theme.changed` with the theme on `bus`
  - Both pages' `<head>` carry the same inline script, which applies the saved theme before the first paint with `resolveTheme`'s rules; `themeBoot.test.ts` runs it against `resolveTheme` / `readChoice` for every saved value (including a throwing `localStorage`) and both system preferences
  - The playground page's markup, which Task 8 fills: `#workbench` (main), `#scenario-menu` (sidebar `ul.menu`), `#theme-picker` (sidebar bottom), `#sidebar` (the drawer's checkbox)

The themes follow the spec: built-in daisyUI themes off, `signal` (default, `color-scheme: dark`) and `signal-light`, all colors as daisyUI semantic tokens; code panels use `neutral`, dark in both themes, with shared `--code-*` syntax colors; the Signal glow (`.signal-glow`) only in `signal`; no animations or transitions under `prefers-reduced-motion: reduce`. Tailwind scans only `demo/src` and the two pages (`source(none)` plus `@source`), so the old pages in `demo/examples/` don't add classes.

- [ ] **Step 1: Write the failing tests**

`tests/site/theme.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { readChoice, resolveTheme, saveChoice, THEME_STORAGE_KEY } from '../../demo/src/theme';

const storageWith = (value: string | null) => ({
  getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null)
});
const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: (): void => {
    throw new Error('blocked');
  }
};

describe('resolveTheme', () => {
  it.each([
    ['signal', false, 'signal'],
    ['signal', true, 'signal'],
    ['signal-light', false, 'signal-light'],
    ['system', true, 'signal-light'],
    ['system', false, 'signal']
  ] as const)('%s with prefers-light %s is %s', (choice, prefersLight, theme) => {
    expect(resolveTheme(choice, prefersLight)).toBe(theme);
  });
});

describe('readChoice', () => {
  it('returns a saved choice', () => {
    expect(readChoice(storageWith('system'))).toBe('system');
    expect(readChoice(storageWith('signal-light'))).toBe('signal-light');
  });

  it('falls back to Signal for nothing saved, an unknown value, blocked storage or no storage', () => {
    expect(readChoice(storageWith(null))).toBe('signal');
    expect(readChoice(storageWith('dracula'))).toBe('signal');
    expect(readChoice(throwing)).toBe('signal');
    expect(readChoice(undefined)).toBe('signal');
  });
});

describe('saveChoice', () => {
  it('saves the choice under its key, and ignores storage that throws', () => {
    const saved = new Map<string, string>();
    saveChoice({ setItem: (key, value) => saved.set(key, value) }, 'signal-light');
    expect(saved.get(THEME_STORAGE_KEY)).toBe('signal-light');
    expect(() => saveChoice(throwing, 'signal')).not.toThrow();
  });
});
```

`tests/site/themeBoot.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readChoice, resolveTheme } from '../../demo/src/theme';

/** The inline <script> (no src) in a page's <head>: it applies the saved theme before the page paints */
function bootScript(page: string): string {
  const html = readFileSync(new URL(`../../demo/${page}`, import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]!);
  if (scripts.length !== 1)
    throw new Error(`demo/${page} should have exactly one inline script, found ${scripts.length}`);
  return scripts[0]!;
}

/** Run a boot script with a saved value (or storage that throws) and a system preference; returns data-theme */
function boot(script: string, saved: string | null | 'throws', prefersLight: boolean): string | undefined {
  const attributes = new Map<string, string>();
  const localStorage = {
    getItem: () => {
      if (saved === 'throws') throw new Error('blocked');
      return saved;
    }
  };
  const window = {
    matchMedia: (query: string) => ({ matches: query === '(prefers-color-scheme: light)' && prefersLight })
  };
  const document = { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } };
  new Function('localStorage', 'window', 'document', script)(localStorage, window, document);
  return attributes.get('data-theme');
}

describe.each(['index.html', 'playground/index.html'])('the theme boot script in demo/%s', page => {
  const script = bootScript(page);
  const savedValues = [null, 'signal', 'signal-light', 'system', 'dracula', 'throws'] as const;

  it.each(savedValues.flatMap(saved => [true, false].map(prefersLight => [saved, prefersLight] as const)))(
    'saved %s, prefers light %s: picks the theme resolveTheme picks',
    (saved, prefersLight) => {
      const storage = {
        getItem: () => {
          if (saved === 'throws') throw new Error('blocked');
          return saved;
        }
      };
      expect(boot(script, saved, prefersLight)).toBe(resolveTheme(readChoice(storage), prefersLight));
    }
  );
});
```

`tests/site/contrast.test.ts` (WCAG 2.1 contrast of every text/background pair the UI uses, read from `styles.css`):

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../demo/src/styles.css', import.meta.url), 'utf8');

/** The `--color-*` values of each daisyUI theme in styles.css, by theme name */
function themes(): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  for (const block of css.matchAll(/@plugin "daisyui\/theme" \{([\s\S]*?)\n\}/g)) {
    const name = /name: ["']([^"']+)["']/.exec(block[1]!)![1]!;
    result.set(
      name,
      new Map([...block[1]!.matchAll(/--color-([\w-]+): (#[0-9a-f]{6});/g)].map(match => [match[1]!, match[2]!]))
    );
  }
  return result;
}

/** The shared code-panel colors (`--code-*`) */
const codeColors = new Map([...css.matchAll(/--code-([\w-]+): (#[0-9a-f]{6});/g)].map(match => [match[1]!, match[2]!]));

/** WCAG 2.1 contrast ratio of two #rrggbb colors */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe('theme colors', () => {
  it('defines Signal and Signal Light', () => {
    expect([...themes().keys()]).toEqual(['signal', 'signal-light']);
  });

  describe.each([...themes()])('%s', (_name, colors) => {
    const color = (token: string) => {
      const value = colors.get(token);
      if (!value) throw new Error(`--color-${token} missing`);
      return value;
    };
    const pairs: Array<[string, string]> = [
      ...['base-100', 'base-200', 'base-300'].map(base => ['base-content', base] as [string, string]),
      ...['primary', 'secondary', 'accent', 'neutral', 'info', 'success', 'warning', 'error'].map(
        token => [`${token}-content`, token] as [string, string]
      ),
      // Text in these colors on panels (links, timeline text)
      ...['primary', 'info', 'success', 'warning', 'error'].map(token => [token, 'base-100'] as [string, string])
    ];

    it.each(pairs)('%s on %s meets WCAG AA (4.5:1)', (foreground, background) => {
      expect(contrast(color(foreground), color(background))).toBeGreaterThanOrEqual(4.5);
    });

    it.each([...codeColors.keys()])('code color %s meets WCAG AA on the code panel', token => {
      expect(contrast(codeColors.get(token)!, color('neutral'))).toBeGreaterThanOrEqual(4.5);
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:nowatch tests/site/theme.test.ts tests/site/themeBoot.test.ts tests/site/contrast.test.ts`
Expected: FAIL — `Failed to load url ../../demo/src/theme` (theme and themeBoot) and `ENOENT: no such file or directory, open '…/demo/src/styles.css'` (contrast).

- [ ] **Step 3: Write the styles, `el()` and the theme module**

`demo/src/styles.css`:

```css
@import 'tailwindcss' source(none);
@source "./";
@source "../index.html";
@source "../playground/index.html";
@import '@fontsource-variable/inter';
@import '@fontsource-variable/jetbrains-mono';
@plugin "daisyui" {
  themes: false;
}
@plugin "daisyui/theme" {
  name: 'signal';
  default: true;
  prefersdark: false;
  color-scheme: dark;
  --color-base-100: #11151d;
  --color-base-200: #0d1016;
  --color-base-300: #0a0c10;
  --color-base-content: #e6e9f2;
  --color-primary: #22d3ee;
  --color-primary-content: #04161b;
  --color-secondary: #a78bfa;
  --color-secondary-content: #12082e;
  --color-accent: #a3e635;
  --color-accent-content: #0b1400;
  --color-neutral: #07090c;
  --color-neutral-content: #c9d1e6;
  --color-info: #38bdf8;
  --color-info-content: #031722;
  --color-success: #a3e635;
  --color-success-content: #0b1400;
  --color-warning: #fbbf24;
  --color-warning-content: #1f1400;
  --color-error: #fb7185;
  --color-error-content: #2a0510;
  --radius-selector: 0.5rem;
  --radius-field: 0.25rem;
  --radius-box: 0.5rem;
  --size-selector: 0.25rem;
  --size-field: 0.25rem;
  --border: 1px;
  --depth: 0;
  --noise: 0;
}
@plugin "daisyui/theme" {
  name: 'signal-light';
  default: false;
  prefersdark: false;
  color-scheme: light;
  --color-base-100: #ffffff;
  --color-base-200: #f5f7fa;
  --color-base-300: #eceff4;
  --color-base-content: #0d1320;
  --color-primary: #0e7490;
  --color-primary-content: #ffffff;
  --color-secondary: #6d28d9;
  --color-secondary-content: #ffffff;
  --color-accent: #4d7c0f;
  --color-accent-content: #ffffff;
  --color-neutral: #0d1117;
  --color-neutral-content: #d6dceb;
  --color-info: #0369a1;
  --color-info-content: #ffffff;
  --color-success: #4d7c0f;
  --color-success-content: #ffffff;
  --color-warning: #b45309;
  --color-warning-content: #ffffff;
  --color-error: #be123c;
  --color-error-content: #ffffff;
  --radius-selector: 0.5rem;
  --radius-field: 0.25rem;
  --radius-box: 0.5rem;
  --size-selector: 0.25rem;
  --size-field: 0.25rem;
  --border: 1px;
  --depth: 0;
  --noise: 0;
}
@theme {
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* Code panels use daisyUI's neutral, dark in both themes, so the syntax colors are shared */
:root {
  --code-keyword: #22d3ee;
  --code-string: #a3e635;
  --code-number: #fbbf24;
  --code-property: #7dd3fc;
  --code-function: #c4b5fd;
  --code-comment: #8b93a7;
}

/* Signal's glowing timeline dots */
[data-theme='signal'] .signal-glow {
  box-shadow: 0 0 8px currentColor;
}

@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation: none !important;
    transition: none !important;
  }
}
```

`demo/src/dom.ts`:

```typescript
type Child = Node | string | null | undefined | false;

/**
 * Create an element with attributes and children. Strings become text nodes (never HTML), so data shown in the
 * page can't inject markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  children: Child[] = []
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}
```

`demo/src/theme.ts`:

```typescript
import type { EvEm } from '@jcfigueiredo/evem';
import { el } from './dom';

/** The themes: Signal (dark, the default) and Signal Light */
export type Theme = 'signal' | 'signal-light';
/** What the picker offers: a theme, or following the operating system */
export type ThemeChoice = Theme | 'system';

export const THEME_STORAGE_KEY = 'evem-theme';

const CHOICES: Array<{ choice: ThemeChoice; label: string }> = [
  { choice: 'signal', label: 'Signal' },
  { choice: 'signal-light', label: 'Signal Light' },
  { choice: 'system', label: 'Match system' }
];

/** The theme a choice stands for; "system" follows prefers-color-scheme */
export function resolveTheme(choice: ThemeChoice, prefersLight: boolean): Theme {
  if (choice === 'system') return prefersLight ? 'signal-light' : 'signal';
  return choice;
}

/** The saved choice, or Signal when there's none, it's unknown, or storage can't be read */
export function readChoice(storage: Pick<Storage, 'getItem'> | undefined): ThemeChoice {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    return CHOICES.some(option => option.choice === saved) ? (saved as ThemeChoice) : 'signal';
  } catch {
    return 'signal';
  }
}

/** Save the choice; storage that can't be written (private mode, blocked) is ignored */
export function saveChoice(storage: Pick<Storage, 'setItem'> | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // The choice still applies to this page
  }
}

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * A theme picker in `container`: a dropdown with Signal, Signal Light and Match system. It applies the choice to
 * <html data-theme>, saves it, follows the system while "Match system" is chosen, and publishes `theme.changed`
 * with the theme on the playground's emitter.
 */
export function mountThemePicker(container: HTMLElement, bus: EvEm, placement = 'dropdown-top'): void {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  let choice = readChoice(storage());
  const label = el('span', {}, []);
  const summary = el('summary', { class: 'btn btn-sm btn-ghost w-full justify-between font-normal' }, [
    label,
    el('span', { 'aria-hidden': 'true' }, ['▾'])
  ]);
  const menu = el('ul', {
    class: 'dropdown-content menu bg-base-100 rounded-box z-10 w-48 p-2 shadow-lg border border-base-300'
  });
  const details = el('details', { class: `dropdown ${placement} w-full` }, [summary, menu]);

  const apply = () => {
    const theme = resolveTheme(choice, media.matches);
    document.documentElement.setAttribute('data-theme', theme);
    label.textContent = `Theme: ${CHOICES.find(option => option.choice === choice)!.label}`;
    for (const button of menu.querySelectorAll('button')) {
      button.classList.toggle('menu-active', button.dataset['choice'] === choice);
    }
    void bus.publish('theme.changed', theme);
  };

  for (const option of CHOICES) {
    const button = el('button', { type: 'button', 'data-choice': option.choice }, [option.label]);
    button.addEventListener('click', () => {
      choice = option.choice;
      saveChoice(storage(), choice);
      apply();
      details.removeAttribute('open');
    });
    menu.append(el('li', {}, [button]));
  }
  media.addEventListener('change', () => {
    if (choice === 'system') apply();
  });
  container.replaceChildren(details);
  apply();
}
```

- [ ] **Step 4: Write the pages and the showcase script**

`demo/index.html` (the showcase: a hero linking to the playground until phase 4 fills it in):

```html
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
    <header class="navbar mx-auto max-w-6xl px-4">
      <div class="navbar-start">
        <a href="./" class="flex items-center gap-2 font-mono text-lg font-bold">
          <span class="inline-block size-3.5 rounded bg-primary" aria-hidden="true"></span>evem
        </a>
      </div>
      <div class="navbar-end gap-1">
        <a class="btn btn-ghost btn-sm" href="./playground/">Playground</a>
        <a class="btn btn-ghost btn-sm" href="https://github.com/jcfigueiredo/evem">GitHub</a>
        <div id="theme-picker" class="w-44"></div>
      </div>
    </header>
    <main class="hero min-h-[70vh]">
      <div class="hero-content max-w-3xl flex-col text-center">
        <h1 class="font-mono text-4xl font-bold tracking-tight sm:text-6xl">Events, with intent.</h1>
        <p class="max-w-xl text-lg text-base-content/70">
          A small TypeScript event emitter with wildcards, priorities, middleware, flow control and history, plus
          WebSocket and Server-Sent Events adapters. No dependencies.
        </p>
        <code class="rounded-box bg-neutral px-4 py-2 font-mono text-sm text-neutral-content"
          >npm install @jcfigueiredo/evem</code
        >
        <div class="flex flex-wrap justify-center gap-2">
          <a class="btn btn-primary" href="./playground/">Open the playground</a>
          <a class="btn" href="https://github.com/jcfigueiredo/evem#readme">Read the docs</a>
        </div>
      </div>
    </main>
  </body>
</html>
```

`demo/src/showcase/main.ts`:

```typescript
import '../styles.css';
import { EvEm } from '@jcfigueiredo/evem';
import { mountThemePicker } from '../theme';

// The showcase's own events go through EvEm, like the playground's
const bus = new EvEm();
mountThemePicker(document.getElementById('theme-picker')!, bus, 'dropdown-end');
```

`demo/playground/index.html`:

```html
<!doctype html>
<html lang="en" data-theme="signal">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EvEm Playground</title>
    <meta name="description" content="Try every EvEm feature against the real library, and see what it did and why." />
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
    <script type="module" src="../src/playground/main.ts"></script>
  </head>
  <body>
    <div class="drawer lg:drawer-open">
      <input id="sidebar" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content min-h-screen bg-base-200">
        <header class="navbar bg-base-300 border-b border-base-300 lg:hidden">
          <label for="sidebar" class="btn btn-ghost btn-square drawer-button" aria-label="Open the feature list"
            >☰</label
          >
          <span class="font-mono font-bold">evem playground</span>
        </header>
        <main id="workbench" class="mx-auto max-w-6xl p-4 lg:p-8"></main>
      </div>
      <div class="drawer-side z-20">
        <label for="sidebar" aria-label="Close the feature list" class="drawer-overlay"></label>
        <nav class="flex min-h-full w-64 flex-col bg-base-300" aria-label="Features">
          <a href="../" class="flex items-center gap-2 px-5 pt-5 pb-2 font-mono text-lg font-bold">
            <span class="inline-block size-3.5 rounded bg-primary" aria-hidden="true"></span>evem
            <span class="text-xs font-normal text-base-content/50">playground</span>
          </a>
          <ul id="scenario-menu" class="menu w-full grow"></ul>
          <div id="theme-picker" class="p-3"></div>
        </nav>
      </div>
    </div>
  </body>
</html>
```

- [ ] **Step 5: Run the tests to verify they pass, and the build still works**

Run: `pnpm test:nowatch tests/site/theme.test.ts tests/site/themeBoot.test.ts tests/site/contrast.test.ts tests/site/build.test.ts`
Expected: PASS (78 tests: theme 8, themeBoot 24 (12 cases per page), contrast 45 (the theme list, and per theme 16 color pairs and 6 code colors), build 1).

Then check that the built CSS has both themes and nothing else:

```bash
pnpm demo:build && grep -o '\[data-theme=[a-z"-]*\]' demo/dist/assets/*.css | sort | uniq -c
```

Expected: only `[data-theme=signal]` and `[data-theme=signal-light]` selectors (no built-in daisyUI themes).

- [ ] **Step 6: Format, type-check and commit**

```bash
pnpm format && pnpm typecheck
git add demo/src/styles.css demo/src/dom.ts demo/src/theme.ts demo/src/showcase/main.ts demo/index.html demo/playground/index.html tests/site/theme.test.ts tests/site/themeBoot.test.ts tests/site/contrast.test.ts
git commit -m "Demo: the Signal themes, the theme picker, and the showcase page

Two daisyUI themes, Signal (default, dark) and Signal Light, with every
color a semantic token; code panels stay dark in both, with shared
syntax colors. A test computes the WCAG contrast of every text and
background pair the UI uses, in both themes, and requires AA (4.5:1).

The picker (Signal, Signal Light, Match system) saves the choice in
localStorage, tolerating storage that throws, and Match system follows
the OS live. Each page applies the saved theme in an inline script
before the first paint; a test runs that script against resolveTheme()
for every saved value and system preference, so the two can't drift.

The showcase is a hero linking to the playground until phase 4.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The playground workbench

**Files:**
- Create: `demo/src/editor.ts`, `demo/src/playground/menu.ts`, `demo/src/playground/workbench.ts`
- Replace: `demo/src/playground/main.ts` (Task 1's placeholder)

**Interfaces:**
- Consumes: `ScenarioSession`, `Scenario`, `Control` (Task 4); `ControlValue` (Task 2); `timelineRows`, `Tone` (Task 5); `scenarioPath`, `scenarioForHash` (Task 5); `scenarios` (Task 6); `el`, `mountThemePicker`, the playground page's ids (Task 7).
- Produces:
  - `createEditor(parent: HTMLElement, code: string, onRun: () => void): CodeEditor` with `CodeEditor { getCode(); setCode(code); setEditable(editable); focus(); destroy() }` — read-only until `setEditable(true)`; ⌘/Ctrl+Enter calls `onRun`; colors from the theme (`neutral`, `--code-*`)
  - `renderMenu(menu: HTMLElement, scenarios: readonly Scenario[], current: Scenario): void` — groups as `menu-title`s, the current link `menu-active` with `aria-current="page"`
  - `mountWorkbench(root: HTMLElement, scenario: Scenario, bus: EvEm): Promise<() => void>` — renders the scenario (header, controls and action buttons, the timeline, the code panel with Edit / Run edited code / Reset) and returns its teardown
  - `playground/main.ts`: the playground's own `EvEm` carries `playground.navigate` (the hash), `trace.entry` (each trace entry, which the timeline renders once per animation frame) and `theme.changed`

This task has no unit tests (ruling 8): its logic is in the modules tested in Tasks 2–7, and the DOM is checked in Chrome in steps 5 and 6. Use Claude in Chrome. Two things the prototype run taught: click Edit with a real click (`find` the button, then `computer` `left_click` on its ref), since a script's `.click()` doesn't always move focus into the editor; and compare `console.error` with a value stashed by the page script beforehand (`window.__pageError = console.error`), since the extension wraps the console itself, so it isn't native code.

- [ ] **Step 1: Write the code editor**

`demo/src/editor.ts` (loaded lazily by the workbench, so CodeMirror is its own chunk):

```typescript
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/** A code panel: read-only until `setEditable(true)`; Cmd/Ctrl+Enter calls `onRun` */
export interface CodeEditor {
  getCode(): string;
  setCode(code: string): void;
  setEditable(editable: boolean): void;
  focus(): void;
  destroy(): void;
}

// Code panels are dark in both themes (daisyUI's neutral), so the syntax colors are the same in both
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword],
    color: 'var(--code-keyword)'
  },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  { tag: [tags.propertyName], color: 'var(--code-property)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--code-function)' },
  { tag: [tags.comment, tags.lineComment], color: 'var(--code-comment)', fontStyle: 'italic' }
]);

const theme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-neutral)',
      color: 'var(--color-neutral-content)',
      fontSize: '13px',
      borderRadius: 'var(--radius-box)'
    },
    '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--code-keyword)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--code-comment)', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(255 255 255 / 0.04)' },
    '&.cm-focused': { outline: '2px solid var(--color-primary)', outlineOffset: '2px' },
    '.cm-cursor': { borderLeftColor: 'var(--code-keyword)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgb(34 211 238 / 0.25)' }
  },
  { dark: true }
);

export function createEditor(parent: HTMLElement, code: string, onRun: () => void): CodeEditor {
  const editable = new Compartment();
  const readOnly = (on: boolean) => [EditorView.editable.of(!on), EditorState.readOnly.of(on)];
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        javascript(),
        syntaxHighlighting(highlight),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': 'Scenario code' }),
        keymap.of([
          { key: 'Mod-Enter', run: () => (onRun(), true) },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap
        ]),
        editable.of(readOnly(true))
      ]
    })
  });
  return {
    getCode: () => view.state.doc.toString(),
    setCode: next => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } }),
    setEditable: on => view.dispatch({ effects: editable.reconfigure(readOnly(!on)) }),
    focus: () => view.focus(),
    destroy: () => view.destroy()
  };
}
```

- [ ] **Step 2: Write the sidebar menu and the workbench**

`demo/src/playground/menu.ts`:

```typescript
import { el } from '../dom';
import type { Scenario } from '../engine/session';
import { scenarioPath } from '../routing';

/** The sidebar: scenarios grouped as they are listed, the current one marked */
export function renderMenu(menu: HTMLElement, scenarios: readonly Scenario[], current: Scenario): void {
  const items: HTMLElement[] = [];
  let group = '';
  for (const scenario of scenarios) {
    if (scenario.group !== group) {
      group = scenario.group;
      items.push(el('li', { class: 'menu-title' }, [group]));
    }
    const active = scenario === current;
    items.push(
      el('li', {}, [
        el(
          'a',
          {
            href: scenarioPath(scenario),
            class: active ? 'menu-active' : '',
            ...(active ? { 'aria-current': 'page' } : {})
          },
          [scenario.title]
        )
      ])
    );
  }
  menu.replaceChildren(...items);
}
```

`demo/src/playground/workbench.ts`:

```typescript
import type { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import type { ControlValue } from '../engine/program';
import { ScenarioSession, type Control, type Scenario } from '../engine/session';
import { timelineRows, type Tone } from '../timeline';

// Full class names, so Tailwind finds them in the source
const TONE_CLASS: Record<Tone, string> = {
  primary: 'status-primary text-primary',
  neutral: 'bg-base-content/40 text-base-content/40',
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
    input.addEventListener('change', () => onChange(Number(input.value)));
    return el('fieldset', { class: 'fieldset py-1' }, [
      el('legend', { class: 'fieldset-legend' }, [control.label]),
      input
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

  const timeline = el('ol', { class: 'relative ms-2 border-s border-base-300 space-y-1.5', 'aria-live': 'polite' });
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
          el('span', { class: 'font-mono text-sm' }, [row.text]),
          row.detail
            ? el('span', { class: 'font-mono text-xs text-base-content/60 ms-2 break-all' }, [row.detail])
            : null,
          el('span', { class: 'text-xs text-base-content/40 ms-2' }, [`${row.at} ms`])
        ])
      )
    );
    if (rows.length === 0) {
      timeline.append(el('li', { class: 'ps-4 text-sm text-base-content/60' }, ['Nothing yet: run an action.']));
    }
    timelineBox.scrollTop = timelineBox.scrollHeight;
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
      el('p', { class: 'text-xs uppercase tracking-widest text-base-content/50' }, [scenario.group]),
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
          el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/50' }, ['Scenario']),
          controls,
          actions
        ])
      ]),
      el('section', { class: 'card bg-base-100 border border-base-300', 'aria-label': 'What EvEm did' }, [
        el('div', { class: 'card-body p-4 gap-3' }, [
          el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/50' }, ['What EvEm did']),
          timelineBox
        ])
      ])
    ]),
    el('section', { class: 'card bg-base-100 border border-base-300 mt-4', 'aria-label': 'Code' }, [
      el('div', { class: 'card-body p-4 gap-3' }, [
        el('div', { class: 'flex flex-wrap items-center gap-2' }, [
          el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/50 me-auto' }, [
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

- [ ] **Step 3: Write the playground's entry script**

`demo/src/playground/main.ts`:

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

bus.subscribe<string>('playground.navigate', async hash => {
  const scenario = scenarioForHash(hash, scenarios);
  renderMenu(menu, scenarios, scenario);
  document.title = `${scenario.title} · EvEm Playground`;
  sidebarToggle.checked = false;
  teardown?.();
  teardown = await mountWorkbench(workbench, scenario, bus);
});

window.addEventListener('hashchange', () => void bus.publish('playground.navigate', location.hash));
mountThemePicker(document.getElementById('theme-picker')!, bus);
void bus.publish('playground.navigate', location.hash);
```

- [ ] **Step 4: Static checks, the build, and the dev server**

```bash
pnpm format && pnpm typecheck && pnpm test:nowatch tests/site
pnpm demo:build
```

Expected: 136 tests pass; the build lists an `editor-<hash>.js` chunk of about 400 kB (about 138 kB gzipped) next to the two entry scripts, which don't include CodeMirror.

Start the dev server in the background (`--host 127.0.0.1`: on macOS, `localhost` alone binds IPv6 only):

```bash
pnpm demo --host 127.0.0.1 --port 5199 --strictPort
```

- [ ] **Step 5: Chrome: the main flow, and code that fails or never finishes**

Record steps a–f with `gif_creator` (`playground-priorities.gif`); exporting it downloads a file, so ask before exporting.

a. Open `http://127.0.0.1:5199/playground/#/core/priorities`. Expected: the tab title is `Priorities · EvEm Playground`; the sidebar shows the group `Core` with `Priorities` highlighted; the timeline shows `audit subscribed to order.created` (`priority low`), then `email …` (`priority normal`) and `metrics …` (`priority high`); the code panel shows the code with those three priorities.
b. Click **Publish order.created**. Expected: `publish order.created {"id":42,"total":99}`, then, indented, `metrics ran`, `email ran`, `audit ran`, then `resolved true`.
c. Set **audit priority** to `high`. Expected: the code panel shows `evem.subscribe('order.created', audit, { priority: 'high' });`, the timeline starts over with the three subscriptions; Publish runs `audit`, `metrics`, `email` (equal priorities run in subscription order).
d. Stash the console (`javascript_tool`: `window.__pageError = console.error`). Click **Edit** (a real click). Expected: the editor takes focus, **Run edited code** and the "The code is edited…" note appear, the controls are disabled. Select all, type `const = 1;`, press ⌘/Ctrl+Enter. Expected: one error row (a syntax error), no action buttons. Replace the code with `import { EvEmm } from '@jcfigueiredo/evem';` and run it. Expected: one error row, `@jcfigueiredo/evem has no export named EvEmm`.
e. Replace the code with

   ```js
   import { EvEm } from '@jcfigueiredo/evem';
   const evem = new EvEm();
   // ▶ Hang
   await new Promise(() => {});
   ```

   run it, and click **Hang**. Expected: the button is disabled and `console.error !== window.__pageError` (the run is capturing).
f. Click **Reset**. Expected: the template code is back, the controls are enabled, **Publish order.created** is enabled and publishes (`resolved true`), and `console.error === window.__pageError`.

- [ ] **Step 6: Chrome: themes, keyboard, narrow screens, the showcase**

a. The sidebar's bottom shows `Theme: Signal`. Choose **Signal Light**. Expected: `document.documentElement.dataset.theme === 'signal-light'`, light panels, the code panel still dark, no glow on the timeline dots, `localStorage.getItem('evem-theme') === 'signal-light'`. Reload: light from the first paint. Choose **Match system**: `data-theme` follows the OS setting. Choose **Signal** again.
b. Keyboard: from the top of the page, Tab reaches the menu link, the three selects, the action button, and Edit / Reset, each with a visible focus ring; Enter on the action button publishes.
c. Narrow screens: `resize_window` to 390 × 844. Expected: the sidebar is hidden and a navbar with ☰ shows; ☰ opens the drawer with the menu and the picker; choosing Priorities closes it; the panels stack; `document.documentElement.scrollWidth <= window.innerWidth` (nothing scrolls sideways). Restore the window size.
d. Reduced motion can't be emulated with these tools; check the rule is in the build instead: `grep -c prefers-reduced-motion demo/dist/assets/*.css` prints at least 1.
e. Open `http://127.0.0.1:5199/`. Expected: the hero `Events, with intent.`, the install command, and the navbar's theme picker, which opens downwards and switches the theme; **Open the playground** goes to `/playground/`.

- [ ] **Step 7: Check the console, stop the server and commit**

`read_console_messages`, errors only, on both pages. Expected: no errors (the scenario's own logs go to the timeline, not the console). Stop the dev server, close the tab.

```bash
git add demo/src/editor.ts demo/src/playground
git commit -m "Demo: the playground workbench

The playground shows a scenario as a workbench: its controls and action
buttons, a timeline of what EvEm did (rendered once per animation frame
from trace.entry events on the playground's own EvEm), and the exact
code that runs, in a CodeMirror panel that loads on demand. Edit makes
the code editable and turns the controls off; ⌘/Ctrl+Enter or Run
edited code runs it; Reset goes back to the template.

An action that never finishes keeps its button disabled only until the
scenario starts over (Reset, a control change, or running edited code),
so the workbench can't get stuck. The sidebar lists the scenarios by
group, addressed by #/<group>/<id>; below the lg breakpoint it becomes
a drawer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: GitHub Pages, and the docs

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `CLAUDE.md`, `README.md`, `docs/demo-revamp-design.md`

**Interfaces:**
- Consumes: `pnpm demo:build` and `DEMO_BASE` (Task 1).

- [ ] **Step 1: Write the Pages workflow**

`.github/workflows/pages.yml`:

```yaml
name: Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

# One deployment at a time; a newer push waits instead of canceling one in progress
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
      # Installs the pnpm version from package.json's packageManager field
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      # The site is served from https://jcfigueiredo.github.io/evem/
      - run: pnpm demo:build
        env:
          DEMO_BASE: /evem/
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: demo/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

CI (`ci.yml`) needs no change: `pnpm test:nowatch` runs `tests/site/build.test.ts`, which builds the site the same way (ruling 9).

- [ ] **Step 2: Update CLAUDE.md**

In `## Commands`, after the **Build** line, add:

```markdown
- **Demo site**: `pnpm demo` (Vite dev server for `demo/`: the showcase at `/`, the playground at `/playground/`; `/python` is proxied to the Python SSE examples on port 8000) and `pnpm demo:build` (static site into `demo/dist/`, git-ignored; `DEMO_BASE=/evem/` builds it for GitHub Pages)
```

and replace the **Format** line with:

```markdown
- **Format**: `pnpm format` (Prettier on `src/`, `tests/`, `scripts/`, `vitest.config.ts` and the demo site: `demo/src`, `demo/index.html`, `demo/playground`, `demo/vite.config.ts`); `pnpm format:check` only checks
```

In `## Packaging and Releases`, replace the words "tests can, through `vite-tsconfig-paths`" with "tests can, through `vitest.config.ts`'s aliases".

Before `## Code Style Guidelines`, add:

```markdown
### Demo Site (`demo/`)

Being rebuilt in phases (`docs/demo-revamp-design.md`; phase 2, the foundation, is done). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a hero until phase 4) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.

- **The real library**: `@jcfigueiredo/evem` and its three subpaths are aliased to `src/` in `demo/vite.config.ts`, `vitest.config.ts` and `tsconfig.json` (`paths`), so the site imports the package by name
- **Engine** (`demo/src/engine/`, no DOM, tested in Node): `program.ts` renders a scenario's code template (`{{control}}` → the value as a literal) and compiles it (`// ▶ Label` starts an action block; package imports become `__modules` lookups, listed in `imports`). `tracedEvEm.ts`: `createTracedEvEm(trace, names)` returns an `EvEm` subclass that wraps callbacks, filters, schemas, transforms and middleware to record into a `Trace` (`trace.ts`) without changing behavior, and after each publish records why each matching subscription didn't run (`SkipReason`), matching with EvEm's private `isEventMatch` / `isMiddlewareReroute` (`matchesPattern`, pinned by a test). `session.ts`: `ScenarioSession` runs a scenario; every reset is a new trace, a fresh traced `EvEm` and the setup run with `AsyncFunction` (imports checked first); errors become trace entries, never rejections; `console.warn` / `console.error` go to the trace while code runs
- **Scenarios** (`demo/src/scenarios/`): one module per feature (`Scenario`: id, group, title, summary, docs link, controls, helpers, code template, checks), listed in `index.ts` in sidebar order. Timeline names come from the `helpers` keys, since minification renames functions
- **UI**: `playground/main.ts` routes `#/<group>/<id>` (`routing.ts`) through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `theme.changed`); `playground/workbench.ts` shows a scenario (controls, actions, the timeline from `timeline.ts`, and the code panel, `editor.ts`, loaded lazily); `theme.ts` is the picker (`evem-theme` in `localStorage`); `dom.ts` has `el()`, which only ever adds text, not HTML. Each page has an inline `<head>` script that applies the saved theme before the first paint, with `resolveTheme`'s rules (tested)
- **Styles** (`styles.css`): Tailwind with `source(none)` and explicit `@source`s; daisyUI with its built-in themes off and two custom ones, `signal` (default, dark) and `signal-light`, plus `--code-*` syntax colors shared by both (code panels use `neutral`, dark in both). Class names must appear whole in the source (no `` `status-${tone}` ``)
- **The old demo**: the pages in `demo/examples/` (with their inline `EvEm` copies, checked by `tests/demo/`) stay until phase 5; they aren't part of the build
- **GitHub Pages**: `.github/workflows/pages.yml` builds the site with `DEMO_BASE=/evem/` on every push to `main` and deploys it
```

In `### Testing Strategy`, in the `tests/demo/` line, replace the words "tests for the demo pages in `demo/examples/`," with "tests for the old demo pages in `demo/examples/` (until phase 5),", and add after that line:

```markdown
- `tests/site/`: the demo site. The engine (`program`, `tracedEvEm`, `session`); every scenario (`scenarios.test.ts`: type-checked with each value of each control through `tests/docs/typeCheck.ts`, and its `checks` run); `timeline`, `routing` and `theme`; `themeBoot` (the pages' inline theme script against `resolveTheme`); `contrast` (WCAG AA for every text and background pair in both themes, read from `styles.css`); and `build` (a Pages build, which must contain the real library). The DOM code is checked in Chrome, not by tests
```

In `## Code Style Guidelines`, in the **Formatting** line, replace the words "Markdown and the demo pages aren't formatted (the `tests/demo/` tests read code out of the pages)" with "Markdown and the old demo pages in `demo/examples/` aren't formatted (the `tests/demo/` tests read code out of them)".

- [ ] **Step 3: Update the README and the spec**

In `README.md`'s `## Test It Out` block, after the `pnpm check` line, add:

```bash
pnpm demo            # The demo site (showcase and playground) on a local dev server
pnpm demo:build      # Build the demo site into demo/dist/
```

In `docs/demo-revamp-design.md`:
- the status line: replace `phase 1 (examples audit) implemented; phases 2–5 not started.` with `phases 1 (examples audit) and 2 (foundation) implemented; phases 3–5 not started.`
- under Phase 2 → Layout, **Dependencies**: replace `` `vite` 7 `` with `` `vite` 8 ``
- under Risks: replace `**Two Vite versions** (7 for the demo, 5 inside Vitest 1.0)` with `**Two Vite versions** (8 for the demo, 5 inside Vitest 1.0)`

- [ ] **Step 4: Run everything CI runs**

```bash
pnpm check
git status --short
```

Expected: `pnpm check` passes (format check, typecheck, the whole suite including `tests/site/`, the package check); `git status` shows only the files of this task (no `demo/dist/`).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/pages.yml CLAUDE.md README.md docs/demo-revamp-design.md
git commit -m "Deploy the demo site to GitHub Pages; document it

pages.yml builds the site with DEMO_BASE=/evem/ on every push to main
and deploys it with actions/deploy-pages. CI needs no new step: the
test suite already builds the site the same way.

CLAUDE.md describes the demo site (aliases, engine, scenarios, UI,
themes, tests) and its commands, the README lists pnpm demo and pnpm
demo:build, and the design marks phase 2 done (on Vite 8).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Enable GitHub Pages — ask first**

Pages isn't enabled on the repository yet, and `pages.yml`'s deploy fails on `main` until it is. Enabling it changes a repository setting, so ask the user before running:

```bash
command gh api -X POST repos/jcfigueiredo/evem/pages -f build_type=workflow
```

(`command gh`: the shell's `gh` function is broken in this environment.) Expected: JSON with `"build_type": "workflow"` and `"html_url": "https://jcfigueiredo.github.io/evem/"`. If the user declines, say so in the final report: the Pages workflow will fail on `main` until Pages is enabled (Settings → Pages → Source: GitHub Actions).
