# Demo Revamp Design

> **Status: phases 1 (examples audit), 2 (foundation), 3a (core scenarios), 3b (flow control) and 3c-1 (WebSocket and Recipes) implemented; 3c-2 (SSE and Python mode), 4 and 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.

## Summary

Today's demo is ten static HTML pages (about 9,900 lines). Each page carries its own CSS and a simplified inline copy of `EvEm`, and `tests/demo/` checks those copies against the library. The pages aren't deployed or linked from the README.

After the revamp:

- **Playground** (`/playground/`): a workbench app with a sidebar of every feature. Each feature is a scenario you change with controls; a timeline shows what EvEm did (middleware, each subscriber run or skipped and why, transforms, cancel, errors, result), and a code panel shows the exact code that ran, which you can edit and run again. Run locally with `pnpm demo`.
- **Showcase** (site root): a scroll-tour landing page that introduces the features with small live widgets and links into the playground.
- Both run the **real library** (its `src/`, through Vite), in the **Signal** visual style (dark-first, with a Signal Light theme and a theme picker), and are published to **GitHub Pages**.
- Every TypeScript sample in the README and the docs is type-checked in CI, and the README's `// Output:` comments are checked by running the samples.

## Goals

- **One source of truth:** what a page shows is what the library does. No simplified copies; code panels show the code that runs.
- **Explain, don't just log:** the timeline shows why each subscriber ran or didn't.
- **Everything EvEm does is in the playground**, including both adapters against in-page fake servers, and (locally) the Python example servers.
- **A showcase that sells the library in one scroll**, for people deciding whether to use it.
- **Published examples that stay correct**, enforced by `pnpm check`.
- **Accessible and responsive:** WCAG AA contrast in both themes, keyboard navigation, visible focus, `prefers-reduced-motion`; the playground works down to tablet width (sidebar becomes a drawer), the showcase on phones.

## Non-goals

- No library features. In particular, no tracing or lifecycle hooks: the timeline is built from traced helpers and a thin subclass (see [Tracing](#tracing)). Library **bug fixes** found along the way are in scope.
- No real WebSocket server (Node has no built-in one; adding `ws` isn't worth it for a demo). WebSocket scenarios use an in-page fake server.
- No npm publishing. The showcase shows the install command; 0.3.0 should be on npm before the site is announced.
- No sharing edited code through URLs: the playground runs code typed into it, and links that carry code would run someone else's code.
- `docs/websocket-features-proposal.md` isn't audited: it describes possible future APIs.

## Decisions

| Question | Decision |
|---|---|
| Audience | A local playground covering everything, plus a simpler showcase on GitHub Pages. Pages hosts both: showcase at the root, playground at `/playground/`. |
| Engine | The real library, not inline copies. |
| Toolchain | Vite + vanilla TypeScript. The playground's own UI events go through an internal `EvEm` (it dogfoods the library). |
| Styling | Tailwind 4 + daisyUI 5, compiled by Vite (dev dependencies only). |
| Playground layout | Workbench: sidebar · scenario controls · timeline · code. |
| Visual style | **Signal**: near-black panels, cyan for events in flight, lime for handled, glowing timeline dots, monospace headings. |
| Themes | Signal (default), Signal Light, Match system. More themes later are one CSS block each. |
| Showcase layout | Scroll tour: hero with a live flow animation, one short section per feature, adapters, why EvEm. |
| Phases | 1 examples audit · 2 foundation · 3 playground · 4 showcase · 5 cleanup. Each gets its own plan and PR, and updates CLAUDE.md and the user docs for what it adds, in the same PR. |

## Phase 1: Examples audit

In scope: `README.md`, `docs/examples.md`, `docs/websocket-adapter.md`, `docs/websocket-server-events.md`, `docs/sse-adapter.md`, `docs/sse-python.md` and `examples/python/`. About 100 TypeScript samples, 9 Python samples and 27 `// Output:` comments.

### Automatic checks (`tests/docs/`)

- **Type-check every TypeScript sample** (```` ```typescript ````, ```` ```ts ````, ```` ```tsx ````) with the TypeScript compiler API, against the real entry points (`@jcfigueiredo/evem`, `/websocket`, `/sse`, `/sse/server` mapped to `src/`).
  - Each block is checked as its own module (an `export {}` is appended), so blocks don't see each other's declarations.
  - Each document has a small **prelude** that declares only what its samples assume without defining: an `evem: EvEm`, and placeholders such as `saveDocument` or `updateLayout`, typed loosely (`any`) so the check targets EvEm's API, not the placeholders.
  - A block that is deliberately a fragment (e.g. an options object on its own) carries a marker comment, `// docs-check: fragment`, and is skipped visibly. The test fails if a block is neither valid nor marked.
- **Run the samples that have `// Output:` comments** (the README's) in Node against the real library, capturing `console.log` / `console.error`, and compare with the comments.
  - Fake timers make delays (`setTimeout(resolve, 1000)` and similar) instant.
  - Output shown "with the current time" or with ids (`'…'`) is matched loosely; the rule is documented in the test.
- **Python:** `tests/sse/python.test.ts` already checks `evem_sse.py` and `server.py`. It gains Flask and FastAPI cases that start each app and connect a real `SseHandler`, skipped (like today's Python test) when `flask` / `fastapi` + `uvicorn` aren't importable.

These run in `pnpm test:nowatch`, so `pnpm check` and CI keep the samples correct. CLAUDE.md's testing section describes `tests/docs/` and the fragment marker.

### Manual review

Type-checks can't catch prose and comments that contradict the behavior, wrong defaults, or server snippets that don't follow the protocol. One reviewer per document reads it against the source, in parallel; each finding is verified against the code (or by running it) before anything is changed.

### Fixes

- Documentation errors: fixed in the docs.
- Library bugs: fixed test-first, one commit each, with a CHANGELOG entry under the unreleased section.

## Phase 2: Foundation

### Layout

```
demo/
  index.html              showcase (site root)
  playground/index.html   playground
  vite.config.ts          root demo/, multi-page build → demo/dist (gitignored)
  src/
    styles.css            Tailwind 4 + daisyUI 5: themes `signal` (default) and `signal-light`
    theme.ts              theme picker
    engine/               scenario engine
    scenarios/            one module per feature, shared by playground and showcase
    fakes/                in-page WebSocket server and SSE fetch
    playground/           playground UI
    showcase/             showcase UI
```

- **Coexisting with the old demo until phase 5:** phase 2 replaces the old `demo/index.html` (the card index) with the showcase, a minimal hero linking to the playground until phase 4 fills it in, and removes `tests/demo/demoIndex.test.ts`, which only checked that index. The old feature pages in `demo/examples/` and their tests stay, and can still be opened directly, until phase 5 deletes them; they aren't part of the Vite build.
- **The real library, imported like users do:** Vite aliases `@jcfigueiredo/evem`, `@jcfigueiredo/evem/websocket`, `@jcfigueiredo/evem/sse` and `@jcfigueiredo/evem/sse/server` to the matching files in `src/`. Code samples use the published package name, and library edits show up in the playground at once.
- **Scripts:** `pnpm demo` (dev server), `pnpm demo:build` (static site into `demo/dist/`, also part of `pnpm check` and CI). Prettier's `format` / `format:check` cover `demo/src`, `demo/*.html`, `demo/playground` and `demo/vite.config.ts`, not the old pages in `demo/examples/` (deleted in phase 5).
- **Dependencies (dev only):** `vite` 8, `tailwindcss` 4, `@tailwindcss/vite`, `daisyui` 5, CodeMirror 6 (`@codemirror/*`), `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`. Vitest 1.0 keeps its own Vite 5; upgrading Vitest is a separate change.
- **TypeScript:** `tsconfig.json` already includes `**/*.ts`, so `pnpm typecheck` covers the demo; `vite/client` types are added for `?raw` imports.

### Themes

- Two custom daisyUI themes, `signal` (`default: true`, `color-scheme: dark`) and `signal-light`, with built-in themes disabled (`themes: false`).
- Everything uses daisyUI semantic colors (`primary` cyan, `success` lime, `error` rose, `base-*`), including the CodeMirror theme and the timeline, so every element follows the theme. Code panels use `neutral` and stay dark in both themes.
- Signal Light uses darker cyan and lime for contrast and no glow.
- The picker (bottom of the playground sidebar, showcase navbar) offers Signal, Signal Light and Match system. It sets `data-theme` on `<html>` and saves the choice in `localStorage` (reads and writes wrapped in `try`/`catch`). Match system follows `prefers-color-scheme` live. An inline script in `<head>` applies the saved theme before first paint.

### Python mode

The Python example servers send no CORS headers, so `pnpm demo`'s Vite server proxies `/python/*` to `http://127.0.0.1:8000`, and the SSE scenarios can connect to `examples/python/server.py` (or the Flask / FastAPI apps) unchanged. The switch only exists in development builds (`import.meta.env.DEV`).

### GitHub Pages

`.github/workflows/pages.yml` builds the site with `base: '/evem/'` on every push to `main` and deploys it with `actions/upload-pages-artifact` and `actions/deploy-pages`. Pages has to be enabled once in the repository settings (Source: GitHub Actions); the repository owner does that, or approves it being done.

### Scenario engine

A scenario is a TypeScript module:

- **Metadata:** `id`, `group`, `title`, `summary`, a link to its documentation.
- **Controls:** selects, toggles and numbers, with defaults.
- **Helpers:** the traced functions its code uses (`audit`, `isBig`, …), with optional behavior (async with a delay, throw, call `cancel()`).
- **Code template:** a setup part, then named **action blocks**, each with a button. Control values are written into the code as literals, so the code panel always shows the exact program that runs:

```js
import { EvEm } from '@jcfigueiredo/evem';
const evem = new EvEm();
evem.subscribe('order.created', audit, { priority: '${auditPriority}' });
evem.subscribe('order.created', email);
evem.subscribe('order.created', metrics, { priority: 'low', filter: isBig });

// ▶ Publish order.created
await evem.publish('order.created', { id: 42, total: ${total} });
```

**Running:** the engine runs the rendered text with `AsyncFunction`, with the package's exports and the scenario's helpers as parameters. `import` lines are displayed and resolved by the engine: a line that imports names the engine doesn't provide is reported as an error.

**Lifecycle:** changing a control, or Reset, creates a fresh `EvEm` and runs setup again. Each action button runs its block against the current instance. Syntax and runtime errors become error entries in the timeline. Code runs in the page, so an infinite loop freezes the tab, as it would in any browser console.

**Editing:** Edit unlocks the CodeMirror panel; Run executes the edited text with the same scope. While the code is edited, the controls are disabled (a banner says so); Reset restores the template.

#### Tracing

The timeline is built without changing the library:

- **Traced helpers** record each call with its data and timing, filter and schema verdicts, middleware input and output, transforms, thrown errors and `cancel()` calls.
- **`EvEm` in a scenario's scope is a thin subclass** that records calls to `publish`, `subscribe`, `unsubscribe`, `unsubscribeById` and `use` and their results (resolved value or rejection), then calls the real methods. It doesn't change behavior.
- **Skipped subscribers:** after each publish, a subscription whose pattern matched the event but whose callback didn't run is shown with its reason: filtered, rejected by its schema, throttled, debounced (with the later call when it happens), or a `once` that was already used. Matching uses EvEm's own `isEventMatch`, which is private: it's reached in one engine function, and a test pins it to the wildcard rules.
- **The timeline** shows a row per step, nested under its publish in order; delayed calls (debounce) are rows of their own when they happen, labeled with the time of the publish whose data they got.

#### Engine and scenario tests

- Engine unit tests (Vitest, Node): rendering, running with the scope, tracing, skip reasons.
- For every scenario: the code is rendered with each control's values and **type-checked** against the real API (the same compiler-API helper as phase 1), and each action is **run in Node with fake timers** and its trace compared with what the scenario declares (`expect`: which helpers run, in what order, the result). That makes every scenario a regression test of the documented behavior.

## Phase 3: Playground

The sidebar groups follow the README. Each entry is a scenario with a deep link (`/playground/#/core/priorities`) and a link to its docs.

Phase 3 ships in three parts, each with its own plan and pull request: **3a**, the engine upgrades and the Core, Data, Middleware, Control & errors and State & diagnostics groups; **3b**, Flow control, with the burst buttons and lane charts; **3c**, the WebSocket, SSE and Recipes groups, with the fake servers, the server pane and Python mode. 3c is in two parts as well: **3c-1**, the WebSocket and Recipes groups, with the fake WebSocket server and the server pane; **3c-2**, the SSE group, with the fake SSE server and Python mode.

| Group | Scenarios |
|---|---|
| Core | Publish & subscribe (sync and async callbacks; unsubscribe by callback or id) · Wildcards (type a pattern, publish events, see what matches and why) · Priorities · Filters (sync, async, several) · Once |
| Flow control | Throttle · Debounce · Throttle + debounce, each with a burst button and an in/out lane chart |
| Data | Transforms (chains; a transform only applies when its subscriber ran) · Schema validation (simple and advanced validators, every `schemaErrorPolicy`) |
| Middleware | Global and pattern middleware: change data, cancel with `null`, reroute |
| Control & errors | Cancelable events (objects, arrays, primitives) · Error policies and timeouts · Recursion protection |
| State & diagnostics | History & replay · Memory-leak warnings with the `info()` inspector |
| WebSocket | Connection & offline queue · Request–response (timeouts, errors) · Server events and routing |
| SSE | Stream & routing (named events, envelopes, parse errors) · Reconnect & resume (backoff, `Last-Event-ID`) · Failures (heartbeat timeout, 401 / 503 / 204) |
| Recipes | Chat app over WebSocket |

### Adapter scenarios

- They add a **Server pane**: the raw wire log (WebSocket frames, or the `text/event-stream` text, with chunk boundaries) and server controls (send, drop the connection, refuse the next connection, restart with a given status and `Retry-After`).
- The code panel shows client code as a user writes it, e.g. `new SseHandler('/events', evem, { headers: () => ({ … }) })`. In the scenario scope, `SseHandler` and `WebSocketHandler` are thin subclasses that only add the fake `fetch` / `WebSocketConstructor` when the code doesn't pass one.
- **Fake SSE server** (`fakes/`): a `fetch` returning a `Response` whose `ReadableStream` the server writes with the real `formatSseMessage` / `formatSseComment`; keeps an event log for `Last-Event-ID` resume; can send heartbeats, split chunks mid-line and mid-character, fail with a status, or end.
- **Fake WebSocket server**: a class implementing `IWebSocket`, connected to an in-page server that echoes, answers requests (`{ type: 'response' }`), sends server events, closes, or refuses connections.
- **Python mode** (development only): the SSE scenarios get a server switch, Simulated or Local Python, showing the command to start the server and whether it answers.

## Follow-ups

Findings that reviews deferred, with the phase that takes each. A follow-up leaves this list with the pull request that fixes it.

| From | Follow-up | Phase |
|---|---|---|
| Phase 2, ruling 13 | `vite/client` types, for `import.meta.env` in Python mode | 3c-2 |
| 3b review | The lane chart has no legend: filled (ran) and hollow (held back) are explained only in tooltips | 4 |
| 3b review | The site has no favicon (a 404 in the console) | 4 |
| Note, 2026-10-03 | The public site builds the library from `src/` on every push to `main`, not from the npm release, so the playground can show unreleased behavior (phase 1's fixes are still under Unreleased) while the showcase says `npm install`: show which code the site runs, and release a version when the playground depends on unreleased behavior | 4 |
| Phase 2 review | Check narrow layouts below 513 px, with device emulation | 5 |

## Phase 4: Showcase

A scroll tour at the site root:

- **Navbar:** `evem` wordmark; Features, Adapters, Playground, GitHub; theme picker.
- **Hero:** tagline and a one-line description (zero dependencies, TypeScript, ESM); the install command with a copy button; "Open the playground" and "GitHub" buttons; a live animation in which a real `EvEm` publishes sample events on a timer and they flow through middleware into prioritized subscribers (a static diagram with reduced motion).
- **About seven feature sections**, each with a sentence, a small live widget, "Show code" (the code the widget runs) and "Explore in the playground →": Wildcards, Priorities, Middleware, Throttle & debounce, Cancelable events, History & replay, Schema validation.
- **Adapters:** two live cards. WebSocket: drop the connection, keep publishing, watch the queue flush. SSE: a live stream with a drop button and the resume from `Last-Event-ID`.
- **Why EvEm** (short, from the README's comparison) and a footer.
- Widgets are the playground's scenario modules with a compact view, so the two sites can't disagree. CodeMirror loads only when "Show code" is opened.
- `<title>`, meta description, Open Graph title and description.

## Phase 5: Cleanup

> Not yet discussed section by section; review it here.

- Delete the old feature pages (`demo/examples/*.html`; the old index is already gone in phase 2) and the tests for their inline copies and code samples (the rest of `tests/demo/`), which phases 2–3 replace with engine and scenario tests.
- Link the site: a "Try it" section near the top of the README (showcase and playground URLs), the playground's SSE pages from `docs/sse-adapter.md` (replacing the link to `demo/examples/sse-demo.html`), and the matching pages from `docs/websocket-adapter.md`.
- Update CLAUDE.md: the demo's architecture (engine, scenarios, fakes, themes), `pnpm demo` / `pnpm demo:build`, the docs checks, and the new tests, replacing the inline-copy description.
- Remove `demo/examples/` from the Prettier exclusions (nothing left to exclude).
- CHANGELOG: the demo isn't part of the npm package (`files: ["dist"]`), so it gets no entry; library fixes from phase 1 already have theirs.

## Testing

| What | How |
|---|---|
| Doc samples | Type-checked against the real API; README `// Output:` comments compared with real runs (phase 1) |
| Python servers | `tests/sse/python.test.ts`, extended to Flask and FastAPI (skipped when not installed) |
| Engine | Vitest unit tests in Node |
| Scenarios | Rendered with each control value, type-checked, run with fake timers, traces compared with declared expectations |
| Fake servers | Unit tests; the fake SSE server's output is parsed by the real `SseParser` |
| The built site | `pnpm demo:build` in `pnpm check` and CI |
| UI and UX | Checked in Chrome during development (both themes, keyboard, narrow widths, reduced motion), with the main flows recorded as GIFs for review |

## Risks

- **The engine reaches private `EvEm` methods**: `isEventMatch` and `isMiddlewareReroute` (matching and reroutes, decided as EvEm decides them) and `enterPublishChain` / `runInPublishChain` (each publish has its own chain and EvEm runs every handler in it, which tells the trace which publish a handler belongs to when publishes overlap). Tests pin each; if one is renamed or changes, they fail rather than the timeline silently lying.
- **Two Vite versions** (8 for the demo, 5 inside Vitest 1.0). Harmless, but upgrading Vitest later removes the duplicate.
- **Streaming through Vite's proxy** (Python mode): if the proxy buffers the stream, the fallback is to add CORS headers to the Python examples behind a `--cors` flag.
- **Doc samples as tests** can make documentation edits fail CI. That's the point, and the fragment marker keeps intentional fragments cheap.
- **Bundle size** of CodeMirror on the showcase: loaded lazily, only when "Show code" is opened.
