# Demo WebSocket Scenarios Implementation Plan (Demo Revamp, Phase 3c-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The WebSocket group (Connection & offline queue, Request–response, Server events & routing) and the Recipes group (Chat over WebSocket), running the library's real `WebSocketHandler` against a fake in-page server shown in a Server card, plus the 3c follow-ups that fit this part.

**Architecture:** Builds on phases 2, 3a and 3b. A fake server (`demo/src/fakes/webSocketServer.ts`) gives each scenario a socket class with a browser WebSocket's lifecycle and logs every frame. In the code's scope, `WebSocketHandler` is a thin subclass that passes that socket class unless the code brings its own, and names what it registers in the timeline. The session makes a new server at every reset and ends the previous run's connections. The workbench shows a Server card (wire log and controls) for scenarios with a `websocket` server. The scenarios' checks drive the server under fake timers and compare its wire log, so every scenario pins the adapter's documented behavior.

**Tech Stack:** As phases 2, 3a and 3b; no new dependencies.

**Spec:** `docs/demo-revamp-design.md`: "Phase 3: Playground" (the WebSocket and Recipes rows, the three-part split), "Adapter scenarios" (the Server pane, the thin subclass, the fake WebSocket server), "Phase 2 → Testing", "Follow-ups" (the rows for 3c). Split agreed with the user on 2026-10-03: 3c-1 is WebSocket and Recipes; 3c-2 is SSE and Python mode.

## Global Constraints

- No runtime dependencies, and no new dev dependencies. Development needs Node.js 20.19+ or 22.12+ (Vite 8); the package's `engines` (`>=20`) don't change.
- The site imports the library only as `@jcfigueiredo/evem` and its subpaths (aliased to `src/`); `src/` isn't touched.
- Colors only through daisyUI semantic tokens (plus `--code-*`); every text pair meets WCAG AA, faded text included (`tests/site/contrast.test.ts` reads every `text-base-content/NN` and `bg-base-content/NN` the site uses, and checks `info` and `success` text on `base-100`).
- Class names Tailwind must generate are written out in full in the source.
- DOM content from data goes through `el()`: strings become text nodes, never HTML.
- Scenario code is plain JavaScript: it runs with `AsyncFunction` and must also type-check as TypeScript with `noImplicitAny` off.
- Code style: Prettier (`pnpm format`), single quotes, 120 columns, no trailing commas; imports in the order packages, `../` paths, `./` paths.
- Commit messages: subject, a body that explains why, and the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW`.
- New tests go in `tests/site/`.

## Rulings made while planning (for review)

Every file in this plan was written and run first: `pnpm check` passed on the result (62 test files, 1,306 tests, the package check), the four scenarios were used in Chrome (and the Server card measured at 375 px), and a dry run of the tasks in order, from `main`, confirmed each step's Expected result below and that the end state equals the validated files.

1. **The fake server is driven by the real adapter.** Its `socketClass` behaves like a browser WebSocket: it opens after `latency` ms, `send()` throws while connecting, a refused connection reports `error` then `close` (1006), and a dropped one closes with 1006, not clean. `WebSocketHandler`, its queue, its reconnects and its request manager are the library's own; nothing in the timeline is simulated.
2. **What the handler registers is named `WebSocketHandler`** in the timeline (`trace.owner`, set while its constructor runs), instead of `subscriber N` or the library's internal function names (which a production build renames). Its six subscriptions at the top of the timeline, and its middleware's rows in publishes (`middleware WebSocketHandler passed it on`), show that the adapter is built from ordinary subscriptions and middleware.
3. **The Server card's controls are send, drop and refuse the next connection.** Send takes the textarea's text as it is, so a frame can be something other than JSON (a `ws.parse.error`). "Restart with a given status and `Retry-After`" is an HTTP control, for SSE (3c-2). A send or a drop with no open connection is noted in the log, so the buttons always answer. The log keeps the newest 200 lines, on the timeline's clock.
4. **Checks drive the server.** A check's `before` and `action` take `server:drop`, `server:refuse` and `server:send <text>`, and `wire` matches parts of `<direction>: <text>` lines in order. The checks run under fake timers, so the latency, the reconnect delay and the request timeouts are exact.
5. **Each reset makes a new server, and `stop()` ends the run's connections** (handlers disconnect, the old server closes quietly) on every reset and when the page leaves the scenario. A handler from an earlier run that is still reconnecting reaches only its own closed server, which refuses it, and its handler gives up after its attempts.
6. **Docs links**: Connection & offline queue → `websocket-adapter.md#offline-queue`; Request–response → `#request-response`; Server events & routing → `websocket-server-events.md`; Chat → `#example-browser-chat`.
7. **The 3c follow-ups in this part** (Task 1 and Task 6): primitives no longer match a debounced call to an unrelated publish; the lane chart reads only new entries for names; two tests pin a burst's single debounced call and the time axis of a 12-second burst (both pass before any change: guards); the spec's Tracing sentence describes the rows that shipped. `vite/client` types move to 3c-2, where Python mode uses `import.meta.env`.
8. **Errors in data show by name and message** (Task 5): `ws.parse.error` carries a `SyntaxError`, which JSON previews as `{}`. Found while using the Server events scenario.
9. **Sidebar order**: WebSocket, then Recipes, after State & diagnostics. 3c-2 adds SSE between them.

## Review Focus

1. **Resetting or leaving a scenario while a handler reconnects:** nothing from the earlier run keeps running or writes into the new run's wire log or timeline. Session test "ends the previous run's connections on reset, and stop() ends the current ones" (Task 3); Chrome, Task 6 step 4.
2. **Edited code that brings its own `WebSocketConstructor` (or socket), or whose handler's constructor throws:** the subclass leaves the code's choice alone, and the code's own subscriptions keep their names. Session tests "leaves a WebSocketConstructor the code passes alone" and "names the code's own subscriptions after them again when a handler's constructor throws" (Task 3).
3. **Frames the client can't use:** text that isn't JSON (`ws.parse.error`, its error shown by name), an answer to a request that already timed out (ignored), a send with no connection (noted). Server tests (Task 2), the Server events checks (Task 4), the `preview` test (Task 5); Chrome, Task 6 step 4.
4. **Many frames:** the log keeps the newest 200 lines and stays scrolled to the end; redraws are batched with the timeline's. Chrome, Task 6 step 4.
5. **Narrow screens:** the Server card's controls stack under the log, long frames wrap, and the page doesn't scroll sideways. Task 6 step 4, at 375 px.

---

## File Structure

| File | Responsibility |
|---|---|
| `demo/src/fakes/webSocketServer.ts` (new) | `FakeWebSocketServer`: the in-page server, its socket class and its wire log |
| `demo/src/engine/trace.ts` | `owner` (who is registering), `now()` |
| `demo/src/engine/tracedEvEm.ts` | Names from `trace.owner`; later calls matched by identity only for objects |
| `demo/src/engine/session.ts` | `Scenario.websocket`, `ScenarioCheck.wire`, `server`, `stop()`, the `WebSocketHandler` subclass |
| `demo/src/scenarios/connectionQueue.ts`, `requests.ts`, `serverEvents.ts`, `chat.ts` (new), `index.ts` | The WebSocket and Recipes groups |
| `demo/src/playground/serverPane.ts` (new) | The Server card: wire log, legend, controls |
| `demo/src/playground/workbench.ts` | The card for scenarios with a server; `wire.entry` redraws; `stop()` on leaving |
| `demo/src/timeline.ts` | Errors in data previewed by name and message |
| `demo/src/lanes.ts` | Subscriber names read incrementally |
| `tests/site/*.test.ts` | `webSocketServer` (new), `session`, `scenarios`, `timeline`, `tracedEvEm`, `lanes` |
| `CLAUDE.md`, `docs/demo-revamp-design.md` | The fake server, the subclass, wire checks, the Server card; 3c-1's status, the split, the follow-ups |

---

### Task 1: The 3c follow-ups: debounced primitives, the lane chart's names, the time axis

**Files:**
- Modify: `demo/src/engine/tracedEvEm.ts` (`publishFor`)
- Modify: `demo/src/lanes.ts` (`laneChart`'s subscriber names)
- Test: `tests/site/tracedEvEm.test.ts`, `tests/site/lanes.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: no new names. `publishFor` matches a later call to a publish by identity only for objects and functions (a primitive falls back to the latest publish of a matching event); `laneChart` keeps the names it has seen per entries array in a module-level `WeakMap` (`subscribersOf`, not exported) and reads only entries added since

- [ ] **Step 1: Write the failing tests**

In `tests/site/tracedEvEm.test.ts`, replace:

```ts
  });

  it('records the data each middleware passes on', async () => {
    const { trace, evem } = traced();
```

with:

```ts
  });

  it('matches a debounced call to its publish by identity only for objects: a primitive matches by event', async () => {
    vi.useFakeTimers();
    const { trace, evem } = traced();
    evem.subscribe('count', function counter() {}, { debounceTime: 100 });
    await evem.publish('count', 1);
    // Same value, another event: not where the debounced call's 1 came from
    await evem.publish('other', 1);
    await vi.advanceTimersByTimeAsync(100);
    expect(lines(trace, ['call'])).toEqual(['call counter later @1']);
  });

  it('runs a debounced subscriber once for a burst: each publish replaces the pending call', async () => {
    vi.useFakeTimers();
    const { trace, evem } = traced();
    evem.subscribe('typed', function search() {}, { debounceTime: 100 });
    await evem.publish('typed', { q: 'e' });
    await vi.advanceTimersByTimeAsync(50);
    await evem.publish('typed', { q: 'ev' });
    await vi.advanceTimersByTimeAsync(100);
    expect(lines(trace, ['call', 'skip'])).toEqual([
      'skip search debounced @1',
      'skip search debounced @2',
      'call search later @2'
    ]);
  });

  it('records the data each middleware passes on', async () => {
    const { trace, evem } = traced();
```

In `tests/site/lanes.test.ts`, replace:

```ts
    expect(timeAxis(1000)).toEqual({ span: 1050, ticks: [0, 200, 400, 600, 800, 1000] });
    expect(timeAxis(4000).ticks).toEqual([0, 1000, 2000, 3000, 4000]);
  });

```

with:

```ts
    expect(timeAxis(1000)).toEqual({ span: 1050, ticks: [0, 200, 400, 600, 800, 1000] });
    expect(timeAxis(4000).ticks).toEqual([0, 1000, 2000, 3000, 4000]);
  });

  it('covers a long burst in at most 8 steps, and takes the smaller step when it fits exactly', () => {
    expect(timeAxis(12_000).ticks).toEqual([0, 2000, 4000, 6000, 8000, 10_000, 12_000]);
    // 800 ms × 1.05 = 840: 100 ms steps would be 8.4 intervals; 800 / 1.05 → span 800: exactly 8 steps of 100
    expect(timeAxis(800 / 1.05).ticks).toHaveLength(9);
  });

```

- [ ] **Step 2: Run them to see the first one fail**

Run: `pnpm test:nowatch tests/site/tracedEvEm.test.ts tests/site/lanes.test.ts`

Expected: FAIL, 1 failed | 37 passed (38): `matches a debounced call to its publish by identity only for objects: a primitive matches by event`, with `expected [ 'call counter later @2' ] to deeply equal [ 'call counter later @1' ]` (the debounced `1` is attributed to the unrelated `other` publish of `1`).

The burst test and the `timeAxis` test pass already: they pin behavior the 3b review asked to pin (guards), so they pass before any change.

- [ ] **Step 3: Match only objects by identity**

In `demo/src/engine/tracedEvEm.ts`, replace:

```ts
     */
    private publishFor(pattern: string, data: unknown): number | undefined {
      for (let index = this.history.length - 1; index >= 0; index--) {
        if (this.history[index]!.data === data && data !== undefined) return this.history[index]!.id;
      }
      for (let index = this.history.length - 1; index >= 0; index--) {
```

with:

```ts
     */
    private publishFor(pattern: string, data: unknown): number | undefined {
      // Only an object is the same one EvEm passed along; equal primitives (the same number, say) prove nothing. A
      // cancelable publish's copy, or data a middleware or transform replaced, falls back to the event too
      const identifiable = (typeof data === 'object' && data !== null) || typeof data === 'function';
      for (let index = this.history.length - 1; identifiable && index >= 0; index--) {
        if (this.history[index]!.data === data) return this.history[index]!.id;
      }
      for (let index = this.history.length - 1; index >= 0; index--) {
```

- [ ] **Step 4: Run the tests again**

Run: `pnpm test:nowatch tests/site/tracedEvEm.test.ts tests/site/lanes.test.ts`

Expected: PASS, 2 files, 38 tests.

- [ ] **Step 5: Read only new entries for the lane names**

A refactor: the lane tests already cover the names (order, and a subscriber with no calls).

In `demo/src/lanes.ts`, replace:

```ts
}

/**
 * The lanes for the latest action in `entries` (undefined before any): its publishes, and for each subscriber of the
```

with:

```ts
}

/** The subscriber names found so far in each trace's entries, which only grow: a render scans just what's new */
const subscriberNames = new WeakMap<readonly TraceEntry[], { scanned: number; names: Set<string> }>();

/** Every subscriber's name in `entries`, in subscription order */
function subscribersOf(entries: readonly TraceEntry[]): string[] {
  let known = subscriberNames.get(entries);
  if (!known || known.scanned > entries.length) known = { scanned: 0, names: new Set<string>() };
  for (let index = known.scanned; index < entries.length; index++) {
    const entry = entries[index]!;
    if (entry.kind === 'subscribe') known.names.add(entry.subscription);
  }
  known.scanned = entries.length;
  subscriberNames.set(entries, known);
  return [...known.names];
}

/**
 * The lanes for the latest action in `entries` (undefined before any): its publishes, and for each subscriber of the
```

In `demo/src/lanes.ts`, replace:

```ts
  if (from === -1) return undefined;
  const recent = entries.slice(from);
  const names = [...new Set(entries.flatMap(entry => (entry.kind === 'subscribe' ? [entry.subscription] : [])))];
  const published = recent.flatMap(entry =>
    entry.kind === 'publish'
```

with:

```ts
  if (from === -1) return undefined;
  const recent = entries.slice(from);
  const names = subscribersOf(entries);
  const published = recent.flatMap(entry =>
    entry.kind === 'publish'
```

- [ ] **Step 6: Run the tests and the type check**

Run: `pnpm test:nowatch tests/site/lanes.test.ts tests/site/tracedEvEm.test.ts && pnpm typecheck`

Expected: PASS, 2 files, 38 tests; the type check exits 0.

- [ ] **Step 7: Commit**

```bash
git add demo/src/engine/tracedEvEm.ts demo/src/lanes.ts tests/site/tracedEvEm.test.ts tests/site/lanes.test.ts
git commit -F - <<'EOF'
Demo: debounced calls match their publish by identity only for objects

A debounced call is attributed to the publish whose data it got. Equal primitives are not the same publish, so a 1 published to another event no longer claims the call. The lane chart keeps the subscriber names it has seen per trace and reads only new entries, since the WebSocket scenarios make long traces. Two tests pin behavior the 3b review asked about: a burst leaves one debounced call, and the time axis of a 12-second burst.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 2: The fake WebSocket server

**Files:**
- Create: `demo/src/fakes/webSocketServer.ts`
- Test: `tests/site/webSocketServer.test.ts` (new)

**Interfaces:**
- Consumes: `IWebSocket` from `@jcfigueiredo/evem/websocket`
- Produces:
  - `interface WireEntry { at: number; direction: 'client' | 'server' | 'note'; text: string }`
  - `interface FakeWebSocketBehavior { latency?: number; methods?: Record<string, (params: unknown) => unknown>; onMessage?: (message: unknown, server: FakeWebSocketServer) => void }`
  - `class FakeWebSocketServer`: `constructor(behavior = {}, now = () => Math.round(performance.now()), onWire?: (entry: WireEntry) => void)`; `wire: WireEntry[]`; `socketClass: new (url: string) => IWebSocket`; `openConnections: number` (getter); `send(message: unknown)` (a string as it is, anything else as JSON); `drop()`; `refuseNext()`; `close()` (quietly: no more wire entries)
  - Note texts: `connection N opened`, `connection N dropped (1006)`, `connection N closed by the client (<code>)`, `will refuse the next connection` (`… next K connections`), `refused a connection`, `no open connection to drop`, `no open connection: nothing sent`

- [ ] **Step 1: Write the failing test**

Create `tests/site/webSocketServer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvEm } from '../../src/index';
import { WebSocketHandler } from '../../src/websocket/index';
import { FakeWebSocketServer, type FakeWebSocketBehavior } from '../../demo/src/fakes/webSocketServer';

afterEach(() => {
  vi.useRealTimers();
});

/** A server whose clock is the fake one, a handler connected to it, and the wire log as short lines */
function setup(behavior: FakeWebSocketBehavior = {}, options: ConstructorParameters<typeof WebSocketHandler>[2] = {}) {
  vi.useFakeTimers();
  const server = new FakeWebSocketServer(behavior, () => Date.now());
  const evem = new EvEm();
  const handler = new WebSocketHandler('wss://example.test/ws', evem, {
    ...options,
    WebSocketConstructor: server.socketClass
  });
  const wire = () => server.wire.map(entry => `${entry.direction}: ${entry.text}`);
  return { server, evem, handler, wire };
}

describe('FakeWebSocketServer', () => {
  it('opens a connection after its latency, like a browser socket', async () => {
    vi.useFakeTimers();
    const server = new FakeWebSocketServer({ latency: 50 });
    const socket = new server.socketClass('wss://example.test/ws');
    const opened = vi.fn();
    socket.onopen = opened;

    expect(socket.readyState).toBe(socket.CONNECTING);
    expect(() => socket.send('too early')).toThrow('CONNECTING');
    await vi.advanceTimersByTimeAsync(50);

    expect(socket.readyState).toBe(socket.OPEN);
    expect(opened).toHaveBeenCalledOnce();
    expect(server.openConnections).toBe(1);
    expect(server.wire.map(entry => entry.text)).toEqual(['connection 1 opened']);
  });

  it('answers requests by method: results, error responses, and a 404 for a method it lacks', async () => {
    const { handler } = setup({
      methods: {
        'users.get': params => ({ ...(params as object), name: 'Ada' }),
        'users.delete': () => {
          throw { code: 403, message: 'Not allowed' };
        }
      }
    });
    await vi.advanceTimersByTimeAsync(20);

    const user = handler.request('users.get', { id: 1 });
    const denied = handler.request('users.delete', { id: 1 });
    const missing = handler.request('users.rename', {});
    const outcomes = Promise.allSettled([user, denied, missing]);
    await vi.advanceTimersByTimeAsync(100);

    const [got, forbidden, notFound] = await outcomes;
    expect(got).toEqual({ status: 'fulfilled', value: { id: 1, name: 'Ada' } });
    expect(forbidden).toMatchObject({ status: 'rejected', reason: { message: 'Not allowed', code: 403 } });
    expect(notFound).toMatchObject({ status: 'rejected', reason: { message: 'No method users.rename', code: 404 } });
  });

  it('sends its own messages to every open connection: JSON, or a string as it is', async () => {
    const { server, evem } = setup();
    const news = vi.fn();
    const parseErrors = vi.fn();
    evem.subscribe('server.news', news);
    evem.subscribe('ws.parse.error', parseErrors);
    await vi.advanceTimersByTimeAsync(20);

    server.send({ event: 'news', data: { title: 'Hi' } });
    server.send('not json');
    await vi.advanceTimersByTimeAsync(20);

    expect(news).toHaveBeenCalledWith({ title: 'Hi' });
    expect(parseErrors).toHaveBeenCalledWith(expect.objectContaining({ rawData: 'not json' }));
  });

  it("logs the client's frames, and lets the scenario's onMessage answer them", async () => {
    const { evem, wire } = setup({
      onMessage: (message, server) => server.send({ event: 'echo', data: (message as { data: unknown }).data })
    });
    const echoed = vi.fn();
    evem.subscribe('server.echo', echoed);
    await vi.advanceTimersByTimeAsync(20);

    await evem.publish('ws.send', { event: 'say', data: 'hello' });
    await vi.advanceTimersByTimeAsync(40);

    expect(echoed).toHaveBeenCalledWith('hello');
    expect(wire()).toEqual([
      'note: connection 1 opened',
      'client: {"event":"say","data":"hello"}',
      'server: {"event":"echo","data":"hello"}'
    ]);
  });

  it('drops its connections and refuses the next ones, which WebSocketHandler reconnects through', async () => {
    const { server, handler, wire } = setup({}, { reconnect: true, reconnectDelay: 100 });
    await vi.advanceTimersByTimeAsync(20);
    expect(handler.getConnectionState()).toBe('connected');

    server.refuseNext();
    server.drop();
    await vi.advanceTimersByTimeAsync(0);
    expect(handler.getConnectionState()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(120);
    expect(handler.getConnectionState()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(120);
    expect(handler.getConnectionState()).toBe('connected');

    expect(wire()).toEqual([
      'note: connection 1 opened',
      'note: will refuse the next connection',
      'note: connection 1 dropped (1006)',
      'note: refused a connection',
      'note: connection 2 opened'
    ]);
  });

  it('notes a send or a drop when no connection is open, instead of doing nothing', async () => {
    const { server, wire } = setup({}, { reconnect: false });
    await vi.advanceTimersByTimeAsync(20);
    server.drop();
    server.drop();
    server.send({ event: 'news' });

    expect(wire().slice(-3)).toEqual([
      'note: connection 1 dropped (1006)',
      'note: no open connection to drop',
      'note: no open connection: nothing sent'
    ]);
  });

  it('logs a client closing its connection, and close() stops it quietly', async () => {
    const { server, handler, wire } = setup();
    await vi.advanceTimersByTimeAsync(20);

    await handler.disconnect();
    expect(wire().at(-1)).toBe('note: connection 1 closed by the client (1000)');

    server.close();
    const late = new server.socketClass('wss://example.test/ws');
    const closed = vi.fn();
    late.onclose = closed;
    await vi.advanceTimersByTimeAsync(20);
    expect(closed).toHaveBeenCalled();
    expect(server.wire).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/webSocketServer.test.ts`

Expected: FAIL: `Failed to load url ../../demo/src/fakes/webSocketServer`, no tests run.

- [ ] **Step 3: Write the server**

Create `demo/src/fakes/webSocketServer.ts`:

```ts
import type { IWebSocket } from '@jcfigueiredo/evem/websocket';

/** One line of the wire log: a frame the client or the server sent, or something that happened to a connection */
export interface WireEntry {
  /** Milliseconds since the scenario started */
  at: number;
  direction: 'client' | 'server' | 'note';
  text: string;
}

/** How the fake server behaves; each scenario gives its own */
export interface FakeWebSocketBehavior {
  /** Milliseconds a connection or a frame takes to arrive (default 20) */
  latency?: number;
  /**
   * Answers to `{ type: 'request' }` messages, by method: what the function returns (or resolves to) is the result;
   * what it throws (`{ code, message }`) is an error response. A method the server doesn't have is a 404 error.
   */
  methods?: Record<string, (params: unknown) => unknown>;
  /** What the server does with any other message (a chat message to broadcast, say) */
  onMessage?: (message: unknown, server: FakeWebSocketServer) => void;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** The error a method throws to answer with an error response */
interface MethodError {
  code?: number;
  message?: string;
  data?: unknown;
}

/**
 * An in-page WebSocket server for the playground: its `socketClass` creates sockets (an `IWebSocket`) that connect to
 * it, after `latency` ms. It answers requests, reacts to messages, can drop its connections or refuse the next ones,
 * and logs every frame and connection event in `wire`.
 */
export class FakeWebSocketServer {
  readonly wire: WireEntry[] = [];
  /** A WebSocket class whose sockets connect to this server (`WebSocketConstructor`) */
  readonly socketClass: new (url: string) => IWebSocket;
  private readonly sockets = new Set<FakeSocket>();
  private readonly latency: number;
  private refusals = 0;
  private connections = 0;
  private closed = false;

  constructor(
    private readonly behavior: FakeWebSocketBehavior = {},
    private readonly now: () => number = () => Math.round(performance.now()),
    private readonly onWire?: (entry: WireEntry) => void
  ) {
    this.latency = behavior.latency ?? 20;
    const server = this;
    this.socketClass = class extends FakeSocket {
      constructor(url: string) {
        super(url, server);
      }
    };
  }

  /** Connections open now */
  get openConnections(): number {
    return this.sockets.size;
  }

  /** Send a message to every open connection: a string as it is (it may not even be JSON), anything else as JSON */
  send(message: unknown): void {
    if (this.sockets.size === 0) this.note('no open connection: nothing sent');
    for (const socket of this.sockets) this.reply(socket, message);
  }

  /** Close every open connection the way a network failure does (code 1006, not clean) */
  drop(): void {
    if (this.sockets.size === 0) this.note('no open connection to drop');
    for (const socket of [...this.sockets]) {
      this.sockets.delete(socket);
      this.note(`connection ${socket.number} dropped (1006)`);
      socket.closeFromServer(1006);
    }
  }

  /** Refuse the next connection attempt (call again to refuse more) */
  refuseNext(): void {
    this.refusals++;
    this.note(`will refuse the next ${this.refusals === 1 ? 'connection' : `${this.refusals} connections`}`);
  }

  /** Stop for good, quietly: the scenario started over */
  close(): void {
    this.closed = true;
    for (const socket of [...this.sockets]) socket.closeFromServer(1001);
    this.sockets.clear();
  }

  /** @internal A socket finished connecting: accept it, or refuse it */
  connect(socket: FakeSocket): boolean {
    if (this.closed) return false;
    if (this.refusals > 0) {
      this.refusals--;
      this.note('refused a connection');
      return false;
    }
    socket.number = ++this.connections;
    this.sockets.add(socket);
    this.note(`connection ${socket.number} opened`);
    return true;
  }

  /** @internal The client closed a socket */
  disconnect(socket: FakeSocket, code: number): void {
    if (this.sockets.delete(socket)) this.note(`connection ${socket.number} closed by the client (${code})`);
  }

  /** @internal A frame from a client arrives */
  receive(socket: FakeSocket, text: string): void {
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    const request = message as { type?: unknown; id?: unknown; method?: unknown; params?: unknown };
    if (request?.type === 'request' && typeof request.method === 'string') {
      const method = this.behavior.methods?.[request.method];
      const respond = (response: object) => this.reply(socket, { type: 'response', id: request.id, ...response });
      if (!method) {
        respond({ error: { code: 404, message: `No method ${request.method}` } });
        return;
      }
      Promise.resolve()
        .then(() => method(request.params))
        .then(
          result => respond({ result }),
          (error: MethodError) =>
            respond({ error: { code: error?.code ?? 500, message: error?.message ?? 'Failed', data: error?.data } })
        );
      return;
    }
    this.behavior.onMessage?.(message, this);
  }

  /** @internal A frame from the server to one client */
  reply(socket: FakeSocket, message: unknown): void {
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    this.log('server', text);
    setTimeout(() => socket.deliver(text), this.latency);
  }

  /** @internal */
  log(direction: WireEntry['direction'], text: string): void {
    if (this.closed) return;
    const entry = { at: this.now(), direction, text };
    this.wire.push(entry);
    this.onWire?.(entry);
  }

  /** @internal */
  note(text: string): void {
    this.log('note', text);
  }

  /** @internal */
  get delay(): number {
    return this.latency;
  }
}

/** A socket connected to a FakeWebSocketServer: the browser WebSocket's states and events */
class FakeSocket implements IWebSocket {
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;
  readyState = CONNECTING;
  number = 0;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;

  constructor(
    readonly url: string,
    private readonly server: FakeWebSocketServer
  ) {
    setTimeout(() => {
      if (this.readyState !== CONNECTING) return;
      if (this.server.connect(this)) {
        this.readyState = OPEN;
        this.onopen?.({ type: 'open' });
      } else {
        // A refused connection: the browser reports an error, then the close
        this.readyState = CLOSED;
        this.onerror?.({ type: 'error' });
        this.onclose?.({ type: 'close', code: 1006, reason: '', wasClean: false });
      }
    }, this.server.delay);
  }

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    // Like the browser: an error while connecting, nothing once closing or closed
    if (this.readyState === CONNECTING)
      throw new Error("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.");
    if (this.readyState !== OPEN) return;
    const text = String(data);
    this.server.log('client', text);
    setTimeout(() => {
      if (this.readyState === OPEN) this.server.receive(this, text);
    }, this.server.delay);
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === CLOSING || this.readyState === CLOSED) return;
    if (this.readyState === CONNECTING) {
      this.readyState = CLOSED;
      this.onclose?.({ type: 'close', code, reason, wasClean: false });
      return;
    }
    this.readyState = CLOSING;
    this.server.disconnect(this, code);
    setTimeout(() => {
      this.readyState = CLOSED;
      this.onclose?.({ type: 'close', code, reason, wasClean: true });
    }, this.server.delay);
  }

  /** The server closed this connection */
  closeFromServer(code: number): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.onclose?.({ type: 'close', code, reason: '', wasClean: code !== 1006 });
  }

  /** A frame from the server arrives */
  deliver(text: string): void {
    if (this.readyState === OPEN) this.onmessage?.({ type: 'message', data: text });
  }
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `pnpm test:nowatch tests/site/webSocketServer.test.ts && pnpm typecheck`

Expected: PASS, 7 tests; the type check exits 0.

- [ ] **Step 5: Commit**

```bash
git add demo/src/fakes/webSocketServer.ts tests/site/webSocketServer.test.ts
git commit -F - <<'EOF'
Demo: a fake WebSocket server for the playground

The WebSocket scenarios need a server that runs in the page. Its socket class follows a browser WebSocket's lifecycle, so the library's real WebSocketHandler drives it unchanged: it opens after a latency, answers requests by method, drops connections, refuses the next ones, and logs every frame and connection event for the server pane. A send or a drop with no open connection is noted, so the pane's buttons always answer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 3: The code's WebSocketHandler connects to the scenario's server

**Files:**
- Modify: `demo/src/engine/trace.ts` (`owner`, `now()`)
- Modify: `demo/src/engine/tracedEvEm.ts` (names in `subscribe` and `use`)
- Modify: `demo/src/engine/session.ts` (`Scenario.websocket`, `server`, `stop()`, `reset()`, the handler subclass)
- Test: `tests/site/session.test.ts`

**Interfaces:**
- Consumes: Task 2's `FakeWebSocketServer`, `FakeWebSocketBehavior` and `WireEntry`
- Produces:
  - `Trace.owner: string | undefined` (who is registering, when it is not the code); `Trace.now(): number` (ms since the trace started, the clock entries use)
  - `Scenario.websocket?: FakeWebSocketBehavior & { sample?: string }`
  - `ScenarioSession.server: FakeWebSocketServer | undefined`, new at every reset; each wire entry is published on the session's bus as `wire.entry`
  - `ScenarioSession.stop(): void`: disconnects the code's handlers and closes the server (also run at the start of every reset)
  - In the code's scope, `WebSocketHandler` is `PlaygroundWebSocketHandler`: it adds `WebSocketConstructor: server.socketClass` when the code passes a URL and no constructor, and names what it registers `WebSocketHandler`

- [ ] **Step 1: Write the failing tests**

In `tests/site/session.test.ts`, replace:

```ts
  session.trace.entries.flatMap(entry => (entry.kind === 'log' ? [entry.text] : []));

afterEach(() => {
  vi.restoreAllMocks();
});

```

with:

```ts
  session.trace.entries.flatMap(entry => (entry.kind === 'log' ? [entry.text] : []));

/** A scenario with a fake WebSocket server, whose code connects a WebSocketHandler to it (or to `options`) */
const websocketScenario = (options = '{}'): Scenario => ({
  ...scenario,
  id: 'socket',
  controls: {},
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    'const evem = new EvEm();',
    `const handler = new WebSocketHandler('wss://example.test/ws', evem, ${options});`,
    "evem.subscribe('server.news', function news() {});"
  ].join('\n'),
  websocket: { latency: 10 }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

```

In `tests/site/session.test.ts`, replace:

```ts
});

describe('numberInput', () => {
  const control = { min: 0, max: 100 };
```

with:

```ts
});

describe('ScenarioSession with a fake WebSocket server', () => {
  it("connects the code's WebSocketHandler to the scenario's server, and names what the handler registers after it", async () => {
    vi.useFakeTimers();
    const session = new ScenarioSession(websocketScenario());
    await session.reset();
    await vi.advanceTimersByTimeAsync(10);

    expect(session.server?.openConnections).toBe(1);
    const subscribers = session.trace.entries.flatMap(entry =>
      entry.kind === 'subscribe' ? [entry.subscription] : []
    );
    expect(new Set(subscribers)).toEqual(new Set(['WebSocketHandler', 'news']));
    expect(subscribers.at(-1)).toBe('news');
  });

  it('leaves a WebSocketConstructor the code passes alone', async () => {
    vi.useFakeTimers();
    const ownSocket = [
      '{ WebSocketConstructor: class OwnSocket {',
      '  constructor(url) { console.log("own socket for", url); this.readyState = 0; }',
      '  send() {}',
      '  close() {}',
      '} }'
    ].join(' ');
    const session = new ScenarioSession(websocketScenario(ownSocket));
    await session.reset();
    await vi.advanceTimersByTimeAsync(10);

    expect(logs(session)).toEqual(['own socket for wss://example.test/ws']);
    expect(session.server?.openConnections).toBe(0);
  });

  it("names the code's own subscriptions after them again when a handler's constructor throws", async () => {
    const failing = "{ WebSocketConstructor: class Offline { constructor() { throw new Error('offline'); } } }";
    const code = websocketScenario(failing).code.replace(
      /const handler = (new WebSocketHandler\(.*\));/,
      "try { $1; } catch (error) { console.log('no handler:', error.message); }"
    );
    const session = new ScenarioSession({ ...websocketScenario(), code });
    await session.reset();

    expect(logs(session)).toEqual(['no handler: offline']);
    expect(session.trace.entries.filter(entry => entry.kind === 'subscribe')).toMatchObject([{ subscription: 'news' }]);
  });

  it("ends the previous run's connections on reset, and stop() ends the current ones", async () => {
    vi.useFakeTimers();
    const session = new ScenarioSession(websocketScenario('{ reconnect: true, reconnectDelay: 50 }'));
    await session.reset();
    await vi.advanceTimersByTimeAsync(10);
    const first = session.server!;

    await session.reset();
    await vi.advanceTimersByTimeAsync(200);
    expect(first.openConnections).toBe(0);
    expect(session.server).not.toBe(first);
    expect(session.server?.openConnections).toBe(1);

    const second = session.server!;
    session.stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(second.openConnections).toBe(0);
  });
});

describe('numberInput', () => {
  const control = { min: 0, max: 100 };
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:nowatch tests/site/session.test.ts`

Expected: FAIL, 3 failed | 19 passed (22): `connects the code's WebSocketHandler…` (`expected undefined to be 1`: there's no `session.server`), `leaves a WebSocketConstructor the code passes alone` (`expected undefined to be +0`) and `ends the previous run's connections…` (`TypeError: Cannot read properties of undefined (reading 'openConnections')`).

The throwing-constructor test passes already (a guard: before this task nothing sets `trace.owner`); it fails if the subclass leaves `trace.owner` set when `super()` throws.

- [ ] **Step 3: Add `owner` and `now()` to the trace, and use `owner` for names**

In `demo/src/engine/trace.ts`, replace:

```ts
   */
  currentPublish: number | undefined;
  private readonly started = performance.now();
  private nextPublishId = 1;
```

with:

```ts
   */
  currentPublish: number | undefined;
  /**
   * Who is subscribing or adding middleware right now, when it isn't the scenario's code (`WebSocketHandler` while it
   * sets itself up): what it registers is named after it
   */
  owner: string | undefined;
  private readonly started = performance.now();
  private nextPublishId = 1;
```

In `demo/src/engine/trace.ts`, replace:

```ts
  }

  record(record: TraceRecord): TraceEntry {
    const entry = {
      ...record,
      at: Math.round(performance.now() - this.started),
      publish: 'publish' in record ? record.publish : (this.currentPublish ?? this.soleRunningPublish())
    } as TraceEntry;
```

with:

```ts
  }

  /** Milliseconds since the trace started, as entries record them */
  now(): number {
    return Math.round(performance.now() - this.started);
  }

  record(record: TraceRecord): TraceEntry {
    const entry = {
      ...record,
      at: this.now(),
      publish: 'publish' in record ? record.publish : (this.currentPublish ?? this.soleRunningPublish())
    } as TraceEntry;
```

In `demo/src/engine/tracedEvEm.ts`, replace:

```ts
      // EvEm refuses an empty name before doing anything: so does the trace
      if (!event) return super.subscribe(event, callback, options);
      const name = nameOf(callback, () => `subscriber ${++this.anonymous}`);
      let id = '';
      const wrapped: EventCallback<T> = data => {
```

with:

```ts
      // EvEm refuses an empty name before doing anything: so does the trace
      if (!event) return super.subscribe(event, callback, options);
      const name = trace.owner ?? nameOf(callback, () => `subscriber ${++this.anonymous}`);
      let id = '';
      const wrapped: EventCallback<T> = data => {
```

In `demo/src/engine/tracedEvEm.ts`, replace:

```ts
    override use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
      const handler = typeof middleware === 'function' ? middleware : middleware.handler;
      const name = nameOf(handler, `middleware ${this.middlewares.size + 1}`);
      const traced: MiddlewareFunction<T> = (event, data) => {
        const state = this.current();
```

with:

```ts
    override use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void {
      const handler = typeof middleware === 'function' ? middleware : middleware.handler;
      const name = trace.owner ?? nameOf(handler, `middleware ${this.middlewares.size + 1}`);
      const traced: MiddlewareFunction<T> = (event, data) => {
        const state = this.current();
```

- [ ] **Step 4: Give the session its server, `stop()` and the handler subclass**

In `demo/src/engine/session.ts`, replace:

```ts
import * as sseServer from '@jcfigueiredo/evem/sse/server';
import * as websocket from '@jcfigueiredo/evem/websocket';
import { compileProgram, renderCode, type Action, type ControlValue, type PackageImport } from './program';
import { Trace } from './trace';
```

with:

```ts
import * as sseServer from '@jcfigueiredo/evem/sse/server';
import * as websocket from '@jcfigueiredo/evem/websocket';
import { FakeWebSocketServer, type FakeWebSocketBehavior } from '../fakes/webSocketServer';
import { compileProgram, renderCode, type Action, type ControlValue, type PackageImport } from './program';
import { Trace } from './trace';
```

In `demo/src/engine/session.ts`, replace:

```ts
  /** Show the latest action over time: a lane for its publishes and one per subscriber (flow control) */
  lanes?: boolean;
}

```

with:

```ts
  /** Show the latest action over time: a lane for its publishes and one per subscriber (flow control) */
  lanes?: boolean;
  /**
   * A fake WebSocket server for the scenario: how it behaves, and a sample frame for the server pane's send box. The
   * code's `WebSocketHandler` connects to it unless the code passes its own `WebSocketConstructor`.
   */
  websocket?: FakeWebSocketBehavior & { sample?: string };
}

```

In `demo/src/engine/session.ts`, replace:

```ts
  actions: Action[] = [];
  trace: Trace;
  private program: Record<string, () => Promise<void>> | undefined;

  constructor(
```

with:

```ts
  actions: Action[] = [];
  trace: Trace;
  /** The scenario's fake WebSocket server, new at every reset (scenarios with `websocket`) */
  server: FakeWebSocketServer | undefined;
  private program: Record<string, () => Promise<void>> | undefined;
  /** The WebSocket handlers the code created, disconnected when the scenario starts over */
  private handlers: websocket.WebSocketHandler[] = [];

  constructor(
```

In `demo/src/engine/session.ts`, replace:

```ts
  }

  /**
   * Start over: a new trace, a fresh EvEm, and the setup code run again. A setup that finishes after a newer reset
   * started (a slow one) leaves the newer program and trace alone.
   */
  async reset(): Promise<void> {
```

with:

```ts
  }

  /** End the run's connections: the code's WebSocket handlers disconnect, and the fake server closes */
  stop(): void {
    for (const handler of this.handlers.splice(0)) void handler.disconnect().catch(() => undefined);
    this.server?.close();
  }

  /**
   * Start over: a new trace, a fresh EvEm, and the setup code run again (and a new fake server, for a scenario with
   * one). A setup that finishes after a newer reset started (a slow one) leaves the newer program and trace alone.
   */
  async reset(): Promise<void> {
```

In `demo/src/engine/session.ts`, replace:

```ts
    this.trace = trace;
    this.program = undefined;
    this.actions = [];
    try {
```

with:

```ts
    this.trace = trace;
    this.program = undefined;
    this.stop();
    this.server = this.scenario.websocket
      ? new FakeWebSocketServer(
          this.scenario.websocket,
          () => trace.now(),
          entry => void this.bus?.publish('wire.entry', entry)
        )
      : undefined;
    this.actions = [];
    try {
```

In `demo/src/engine/session.ts`, replace:

```ts
          EvEm: createTracedEvEm(trace, this.helperNames(), { explainMatches: this.scenario.explainMatches })
        },
        '@jcfigueiredo/evem/websocket': websocket,
        '@jcfigueiredo/evem/sse': sse,
        '@jcfigueiredo/evem/sse/server': sseServer
```

with:

```ts
          EvEm: createTracedEvEm(trace, this.helperNames(), { explainMatches: this.scenario.explainMatches })
        },
        '@jcfigueiredo/evem/websocket': { ...websocket, WebSocketHandler: this.playgroundWebSocketHandler(trace) },
        '@jcfigueiredo/evem/sse': sse,
        '@jcfigueiredo/evem/sse/server': sseServer
```

In `demo/src/engine/session.ts`, replace:

```ts
    } catch (error) {
      trace.record({ kind: 'error', message: messageOf(error) });
    }
  }

```

with:

```ts
    } catch (error) {
      trace.record({ kind: 'error', message: messageOf(error) });
    }
  }

  /**
   * The code's WebSocketHandler: the library's, connecting to the scenario's fake server unless the code passes its own
   * WebSocketConstructor (or a socket), and naming what it registers on the emitter after itself in the timeline
   */
  private playgroundWebSocketHandler(trace: Trace): typeof websocket.WebSocketHandler {
    const server = this.server;
    const handlers = this.handlers;
    return class PlaygroundWebSocketHandler extends websocket.WebSocketHandler {
      constructor(...[urlOrSocket, evem, options = {}]: ConstructorParameters<typeof websocket.WebSocketHandler>) {
        const connect =
          server && typeof urlOrSocket === 'string' && !options.WebSocketConstructor
            ? { ...options, WebSocketConstructor: server.socketClass }
            : options;
        trace.owner = 'WebSocketHandler';
        try {
          super(urlOrSocket, evem, connect);
        } finally {
          trace.owner = undefined;
        }
        handlers.push(this);
      }
    };
  }

```

- [ ] **Step 5: Run the tests and the type check**

Run: `pnpm test:nowatch tests/site/session.test.ts tests/site/tracedEvEm.test.ts && pnpm typecheck`

Expected: PASS, 2 files, 55 tests; the type check exits 0.

- [ ] **Step 6: Commit**

```bash
git add demo/src/engine/trace.ts demo/src/engine/tracedEvEm.ts demo/src/engine/session.ts tests/site/session.test.ts
git commit -F - <<'EOF'
Demo: the code's WebSocketHandler connects to the scenario's fake server

Scenarios show client code as a user writes it, so WebSocketHandler in their scope is a subclass that only adds the fake server's socket class when the code passes none. What the handler registers is named after it in the timeline. Each reset makes a new server and ends the previous run's connections, so a handler that is still reconnecting never reaches the new run.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 4: The WebSocket and Recipes scenarios

**Files:**
- Create: `demo/src/scenarios/connectionQueue.ts`, `requests.ts`, `serverEvents.ts`, `chat.ts`
- Modify: `demo/src/scenarios/index.ts` (WebSocket, then Recipes, after State & diagnostics)
- Modify: `demo/src/engine/session.ts` (`ScenarioCheck.wire`)
- Test: `tests/site/scenarios.test.ts`

**Interfaces:**
- Consumes: Task 3's `Scenario.websocket` and `ScenarioSession.server`; Task 2's `drop()`, `refuseNext()`, `send()` and `wire`
- Produces: `ScenarioCheck.wire?: string[]` (parts of `<direction>: <text>` lines, in order); `server:drop`, `server:refuse` and `server:send <text>` in a check's `before` and `action`; the scenario ids `connection-queue`, `requests`, `server-events` (group WebSocket) and `chat` (group Recipes)

- [ ] **Step 1: Teach the checks the server commands and `wire`**

In `scenarios.test.ts`, `step()` runs an action or a `server:` command, and `expectInOrder()` checks `logs` and `wire` the same way (the logs check moves into it unchanged).

In `demo/src/engine/session.ts`, replace:

```ts
  /** `name: reason` for each subscription the action's publishes skipped, in order */
  skipped?: string[];
}

```

with:

```ts
  /** `name: reason` for each subscription the action's publishes skipped, in order */
  skipped?: string[];
  /** Parts of the fake server's wire log during the action, in order (`client: …`, `server: …`, `note: …`) */
  wire?: string[];
}

```

In `tests/site/scenarios.test.ts`, replace:

```ts
}

/** Finish a session step under fake timers, firing every timer it starts (delays, timeouts, slow callbacks) */
async function settle(step: Promise<void>): Promise<void> {
```

with:

```ts
}

/** Run an action, or a command to the scenario's fake server: `server:drop`, `server:refuse`, `server:send <text>` */
function step(session: ScenarioSession, action: string): Promise<void> {
  if (!action.startsWith('server:')) return session.run(action);
  const server = session.server;
  if (!server) throw new Error(`${action}: the scenario has no server`);
  const [command, ...text] = action.slice('server:'.length).split(' ');
  if (command === 'drop') server.drop();
  else if (command === 'refuse') server.refuseNext();
  else if (command === 'send') server.send(text.join(' '));
  else throw new Error(`Unknown server command: ${action}`);
  return Promise.resolve();
}

/** In order: each expected part appears in a later line than the one before */
function expectInOrder(lines: string[], expected: string[] | undefined, what: string): void {
  let from = 0;
  for (const part of expected ?? []) {
    const index = lines.findIndex((line, position) => position >= from && line.includes(part));
    expect(index, `${what} containing ${JSON.stringify(part)}, in order, in ${JSON.stringify(lines)}`).not.toBe(-1);
    from = index + 1;
  }
}

/** Finish a session step under fake timers, firing every timer it starts (delays, timeouts, slow callbacks) */
async function settle(step: Promise<void>): Promise<void> {
```

In `tests/site/scenarios.test.ts`, replace:

```ts
    expect(scenario.checks.length).toBeGreaterThan(0);
    for (const check of scenario.checks) {
      for (const action of [...(check.before ?? []), check.action]) expect(actions).toContain(action);
    }
  });
```

with:

```ts
    expect(scenario.checks.length).toBeGreaterThan(0);
    for (const check of scenario.checks) {
      for (const action of [...(check.before ?? []), check.action]) {
        if (!action.startsWith('server:')) expect(actions).toContain(action);
      }
    }
  });
```

In `tests/site/scenarios.test.ts`, replace:

```ts
      Object.assign(session.values, check.values ?? {});
      await settle(session.restoreTemplate());
      for (const action of check.before ?? []) await settle(session.run(action));
      const before = session.trace.entries.length;

      await settle(session.run(check.action));

      const entries = session.trace.entries.slice(before);
```

with:

```ts
      Object.assign(session.values, check.values ?? {});
      await settle(session.restoreTemplate());
      for (const action of check.before ?? []) await settle(step(session, action));
      const before = session.trace.entries.length;
      const wireBefore = session.server?.wire.length ?? 0;

      await settle(step(session, check.action));

      const entries = session.trace.entries.slice(before);
```

In `tests/site/scenarios.test.ts`, replace:

```ts
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
```

with:

```ts
      }
      const logs = entries.flatMap(entry => (entry.kind === 'log' ? [entry.text] : []));
      expectInOrder(logs, check.logs, 'a log');
      const wire = (session.server?.wire ?? []).slice(wireBefore).map(entry => `${entry.direction}: ${entry.text}`);
      expectInOrder(wire, check.wire, 'a wire line');
    }
  );
```

- [ ] **Step 2: Run the scenario tests: the existing checks still pass**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`

Expected: PASS, 94 tests (the same as before: the logs checks run through `expectInOrder` unchanged).

- [ ] **Step 3: List the new scenarios**

In `demo/src/scenarios/index.ts`, replace:

```ts
import type { Scenario } from '../engine/session';
import { cancelableEvents } from './cancelableEvents';
import { debounce } from './debounce';
import { errorPolicies } from './errorPolicies';
```

with:

```ts
import type { Scenario } from '../engine/session';
import { cancelableEvents } from './cancelableEvents';
import { chat } from './chat';
import { connectionQueue } from './connectionQueue';
import { debounce } from './debounce';
import { errorPolicies } from './errorPolicies';
```

In `demo/src/scenarios/index.ts`, replace:

```ts
import { publishSubscribe } from './publishSubscribe';
import { recursionProtection } from './recursionProtection';
import { schemaValidation } from './schemaValidation';
import { throttle } from './throttle';
```

with:

```ts
import { publishSubscribe } from './publishSubscribe';
import { recursionProtection } from './recursionProtection';
import { requests } from './requests';
import { serverEvents } from './serverEvents';
import { schemaValidation } from './schemaValidation';
import { throttle } from './throttle';
```

In `demo/src/scenarios/index.ts`, replace:

```ts
  recursionProtection,
  historyReplay,
  memoryLeaks
];

```

with:

```ts
  recursionProtection,
  historyReplay,
  memoryLeaks,
  connectionQueue,
  requests,
  serverEvents,
  chat
];

```

- [ ] **Step 4: Run the scenario tests to see them fail**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts`

Expected: FAIL: `Failed to load url ./chat … in demo/src/scenarios/index.ts`, no tests run.

- [ ] **Step 5: Write the scenarios**

Create `demo/src/scenarios/connectionQueue.ts`:

```ts
import type { Scenario } from '../engine/session';

export const connectionQueue: Scenario = {
  id: 'connection-queue',
  group: 'WebSocket',
  title: 'Connection & offline queue',
  summary:
    'WebSocketHandler connects EvEm to a socket: ws.send messages go out while connected, and wait in a queue while not. Drop the connection or refuse the next one from the Server card to see it reconnect and flush.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#offline-queue',
  controls: {
    reconnect: { kind: 'toggle', label: 'reconnect', default: true },
    reconnectDelay: { kind: 'number', label: 'reconnectDelay (ms)', min: 200, max: 3000, step: 100, default: 1000 },
    queueSize: { kind: 'number', label: 'queueSize', min: 1, max: 10, default: 3 }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    '',
    'const evem = new EvEm();',
    "const handler = new WebSocketHandler('wss://chat.example.com/ws', evem, {",
    '  reconnect: {{reconnect}},',
    '  reconnectDelay: {{reconnectDelay}},',
    '  queueSize: {{queueSize}}',
    '});',
    'const showState = ({ from, to }) => console.log(`connection: ${from} → ${to}`);',
    "const queueFull = ({ droppedMessage }) => console.log('queue full, dropped', droppedMessage);",
    "evem.subscribe('ws.connection.state', showState);",
    "evem.subscribe('ws.queue.overflow', queueFull);",
    'let sent = 0;',
    '',
    '// ▶ Send a message',
    '// Sent at once while connected; while not, queued (up to {{queueSize}}) and sent when the connection is back',
    "await evem.publish('ws.send', { event: 'chat.send', data: { text: `message ${++sent}` } });",
    'console.log(`state: ${handler.getConnectionState()}, queued: ${handler.getQueueSize()}`);'
  ].join('\n'),
  checks: [
    {
      action: 'send-a-message',
      calls: ['WebSocketHandler'],
      result: true,
      logs: ['state: connected, queued: 0'],
      wire: ['client: {"event":"chat.send","data":{"text":"message 1"}}']
    },
    {
      values: { reconnect: false },
      before: ['server:drop'],
      action: 'send-a-message',
      calls: ['WebSocketHandler'],
      logs: ['state: disconnected, queued: 1']
    },
    {
      values: { reconnect: false, queueSize: 1 },
      before: ['server:drop', 'send-a-message'],
      action: 'send-a-message',
      calls: ['queueFull', 'WebSocketHandler'],
      logs: ['queue full, dropped {"event":"chat.send","data":{"text":"message 1"}}', 'state: disconnected, queued: 1']
    },
    {
      action: 'server:drop',
      calls: ['WebSocketHandler', 'showState', 'WebSocketHandler', 'showState'],
      logs: ['connection: connected → reconnecting', 'connection: reconnecting → connected'],
      wire: ['note: connection 1 dropped (1006)', 'note: connection 2 opened']
    },
    {
      before: ['server:refuse'],
      action: 'server:drop',
      calls: ['WebSocketHandler', 'showState', 'WebSocketHandler', 'showState'],
      wire: ['note: connection 1 dropped (1006)', 'note: refused a connection', 'note: connection 2 opened']
    }
  ],
  websocket: { latency: 30, sample: '{"event":"chat.message","data":{"user":"Bo","text":"hi"}}' }
};
```

Create `demo/src/scenarios/requests.ts`:

```ts
import type { Scenario } from '../engine/session';

const USERS: Record<number, string> = { 1: 'Ada', 2: 'Bo', 42: 'Cy' };

export const requests: Scenario = {
  id: 'requests',
  group: 'WebSocket',
  title: 'Request\u2013response',
  summary:
    "handler.request() sends a request and resolves with the server's result: it rejects with the server's error, or with a RequestTimeoutError when no answer comes in time. Requests are independent and can run at once.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#request-response',
  controls: { timeout: { kind: 'number', label: 'timeout (ms)', min: 500, max: 5000, step: 500, default: 1000 } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    '',
    'const evem = new EvEm();',
    "const handler = new WebSocketHandler('wss://api.example.com/ws', evem);",
    '',
    '// ▶ Get a user',
    "const user = await handler.request('users.get', { id: 42 }, { timeout: {{timeout}} });",
    "console.log('got', user);",
    '',
    "// ▶ Get a user who doesn't exist",
    '// The server answers with an error: request() rejects with its message, code and data',
    'await handler',
    "  .request('users.get', { id: 7 }, { timeout: {{timeout}} })",
    '  .catch(error => console.log(`failed (${error.code}): ${error.message}`));',
    '',
    '// ▶ Build a slow report',
    '// The server takes 3 s: past the timeout, request() rejects with a RequestTimeoutError, and the late answer is ignored',
    'await handler',
    "  .request('reports.build', {}, { timeout: {{timeout}} })",
    "  .then(report => console.log('report', report))",
    '  .catch(error => console.log(`${error.name}: ${error.message}`));',
    '',
    '// ▶ Two requests at once',
    "const [ada, bo] = await Promise.all([handler.request('users.get', { id: 1 }), handler.request('users.get', { id: 2 })]);",
    "console.log(ada.name, 'and', bo.name);"
  ].join('\n'),
  checks: [
    {
      action: 'get-a-user',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['got {"id":42,"name":"Cy"}'],
      wire: ['client: {"type":"request"', 'server: {"type":"response"']
    },
    {
      action: 'get-a-user-who-doesn-t-exist',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['failed (404): No user 7']
    },
    {
      action: 'build-a-slow-report',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['RequestTimeoutError: Request reports.build']
    },
    {
      values: { timeout: 5000 },
      action: 'build-a-slow-report',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['report {"rows":120}']
    },
    {
      action: 'two-requests-at-once',
      calls: ['WebSocketHandler', 'WebSocketHandler', 'WebSocketHandler', 'WebSocketHandler'],
      logs: ['Ada and Bo']
    }
  ],
  websocket: {
    latency: 30,
    methods: {
      'users.get': params => {
        const { id } = params as { id: number };
        if (!USERS[id]) throw { code: 404, message: `No user ${id}` };
        return { id, name: USERS[id] };
      },
      // Three seconds: longer than the default timeout
      'reports.build': () => new Promise(resolve => setTimeout(() => resolve({ rows: 120 }), 3000))
    }
  }
};
```

Create `demo/src/scenarios/serverEvents.ts`:

```ts
import type { Scenario } from '../engine/session';

export const serverEvents: Scenario = {
  id: 'server-events',
  group: 'WebSocket',
  title: 'Server events & routing',
  summary:
    "Incoming messages are routed by their fields: an event (or the older type field) is published under a prefix, anything else as ws.message, and what doesn't parse as ws.parse.error. Send your own from the Server card.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-server-events.md',
  controls: {
    prefix: { kind: 'select', label: 'serverEventPrefix', options: ['server', 'app', ''], default: 'server' }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    '',
    'const evem = new EvEm();',
    "// Server events are published as '<prefix>.<event>' ('' keeps their own names)",
    "const handler = new WebSocketHandler('wss://news.example.com/ws', evem, { serverEventPrefix: {{prefix}} });",
    'const prefix = {{prefix}};',
    '',
    "const news = item => console.log('news:', item.title);",
    "const other = message => console.log('other message:', message);",
    "const unreadable = ({ rawData }) => console.log('could not parse:', rawData);",
    "evem.subscribe(prefix ? `${prefix}.news.*` : 'news.*', news);",
    "evem.subscribe('ws.message', other);",
    "evem.subscribe('ws.parse.error', unreadable);",
    '',
    '// ▶ Subscribe to the news',
    "await evem.publish('ws.send', { event: 'news.subscribe' });"
  ].join('\n'),
  checks: [
    {
      action: 'subscribe-to-the-news',
      calls: ['WebSocketHandler', 'news', 'news', 'other', 'unreadable'],
      logs: [
        'news: EvEm adds a WebSocket adapter',
        'news: An older server uses type',
        'other message: {"ping":1}',
        'could not parse: this is not JSON'
      ]
    },
    {
      values: { prefix: '' },
      action: 'subscribe-to-the-news',
      calls: ['WebSocketHandler', 'news', 'news', 'other', 'unreadable']
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
      server.send({ event: 'news.item', data: { title: 'EvEm adds a WebSocket adapter' } });
      server.send({ type: 'news.flash', data: { title: 'An older server uses type' } });
      server.send({ ping: 1 });
      server.send('this is not JSON');
    }
  }
};
```

Create `demo/src/scenarios/chat.ts`:

```ts
import type { Scenario } from '../engine/session';

export const chat: Scenario = {
  id: 'chat',
  group: 'Recipes',
  title: 'Chat over WebSocket',
  summary:
    'A chat client: history by request, messages filtered to one room, and sends that wait in the queue while offline. Bo answers you; send messages from other rooms from the Server card.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#example-browser-chat',
  controls: { room: { kind: 'select', label: 'room', options: ['lobby', 'random'], default: 'lobby' } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    '',
    'const roomId = {{room}};',
    'const evem = new EvEm();',
    "const handler = new WebSocketHandler('wss://chat.example.com/ws', evem, { reconnect: true });",
    '',
    'const show = message => console.log(`${message.user}: ${message.text}`);',
    'const inThisRoom = message => message.roomId === roomId;',
    'const showState = ({ to }) => console.log(`(${to})`);',
    "evem.subscribe('ws.connection.state', showState);",
    "// The server sends every room's messages: keep this room's",
    "evem.subscribe('server.chat.message', show, { filter: inThisRoom });",
    '',
    '// ▶ Load the history',
    '// Waits for the connection: the 5 s timeout includes that wait',
    "const history = await handler.request('chat.history', { roomId, limit: 50 });",
    'history.forEach(show);',
    '',
    '// ▶ Say hello',
    '// Queued while offline, and sent when the connection is back',
    "await evem.publish('ws.send', { event: 'chat.send', data: { roomId, text: 'Hello!' } });"
  ].join('\n'),
  checks: [
    {
      action: 'load-the-history',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['Bo: Welcome to lobby', 'Cy: Hi all']
    },
    {
      action: 'say-hello',
      calls: ['WebSocketHandler', 'show', 'show'],
      logs: ['you: Hello!', 'Bo: Hi! You said "Hello!"'],
      wire: ['client: {"event":"chat.send"', 'server: {"event":"chat.message"']
    },
    {
      values: { room: 'random' },
      action:
        'server:send {"event":"chat.message","data":{"roomId":"lobby","user":"Cy","text":"Anyone in the lobby?"}}',
      calls: [],
      skipped: ['show: filtered']
    }
  ],
  websocket: {
    latency: 40,
    sample: '{"event":"chat.message","data":{"roomId":"lobby","user":"Cy","text":"Anyone in the lobby?"}}',
    methods: {
      'chat.history': params => {
        const { roomId } = params as { roomId: string };
        return [
          { roomId, user: 'Bo', text: `Welcome to ${roomId}` },
          { roomId, user: 'Cy', text: 'Hi all' }
        ];
      }
    },
    onMessage: (message, server) => {
      const { event, data } = message as { event?: string; data?: { roomId: string; text: string } };
      if (event !== 'chat.send' || !data) return;
      server.send({ event: 'chat.message', data: { roomId: data.roomId, user: 'you', text: data.text } });
      setTimeout(
        () =>
          server.send({
            event: 'chat.message',
            data: { roomId: data.roomId, user: 'Bo', text: `Hi! You said "${data.text}"` }
          }),
        600
      );
    }
  }
};
```

- [ ] **Step 6: Run the scenario tests and the type check**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts && pnpm typecheck`

Expected: PASS, 118 tests (24 more: each new scenario is type-checked once per control value, and runs its checks); the type check exits 0.

- [ ] **Step 7: Commit**

```bash
git add demo/src/scenarios/connectionQueue.ts demo/src/scenarios/requests.ts demo/src/scenarios/serverEvents.ts demo/src/scenarios/chat.ts demo/src/scenarios/index.ts demo/src/engine/session.ts tests/site/scenarios.test.ts
git commit -F - <<'EOF'
Demo: the WebSocket and Recipes scenarios

Connection & offline queue, Request-response, Server events & routing and a chat recipe. Their checks drive the fake server (drop, refuse, send) under fake timers and compare its wire log, so each one pins the adapter's documented behavior: the queue and its overflow, reconnecting, results, error responses and timeouts, routing by event or type, parse errors, and a filter per room.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 5: The Server card, and errors in the timeline by name

**Files:**
- Create: `demo/src/playground/serverPane.ts`
- Modify: `demo/src/playground/workbench.ts` (the card, `wire.entry` redraws, `session.stop()` on leaving)
- Modify: `demo/src/timeline.ts` (`preview`)
- Test: `tests/site/timeline.test.ts`

**Interfaces:**
- Consumes: Task 3's `ScenarioSession.server`, `stop()` and the `wire.entry` bus event; Task 2's `WireEntry`, `send()`, `drop()`, `refuseNext()` and `openConnections`
- Produces: `serverPane(session: ScenarioSession, sample: string): { element: HTMLElement; render: () => void }`; `preview()` shows an `Error` anywhere in the data as `"<name>: <message>"`

- [ ] **Step 1: Write the failing test**

In `tests/site/timeline.test.ts`, replace:

```ts
    expect(preview(undefined)).toBe('undefined');
    expect(preview('x'.repeat(100), 10)).toBe(`"${'x'.repeat(8)}…`);
  });
});
```

with:

```ts
    expect(preview(undefined)).toBe('undefined');
    expect(preview('x'.repeat(100), 10)).toBe(`"${'x'.repeat(8)}…`);
  });

  it('shows an error by its name and message, which JSON would drop', () => {
    const error = new SyntaxError('Unexpected token');
    expect(preview({ error, rawData: 'oops' })).toBe('{"error":"SyntaxError: Unexpected token","rawData":"oops"}');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/timeline.test.ts`

Expected: FAIL, 1 failed | 20 passed (21): `shows an error by its name and message, which JSON would drop`, with `expected '{"error":{},"rawData":"oops"}' to be '{"error":"SyntaxError: Unexpected tok…'`.

- [ ] **Step 3: Show errors by name and message**

In `demo/src/timeline.ts`, replace:

```ts
};

/** Data as short JSON for the timeline */
export function preview(value: unknown, max = 72): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
```

with:

```ts
};

/** JSON keeps none of an error's own fields: show its name and message */
const showErrors = (_key: string, value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : value;

/** Data as short JSON for the timeline */
export function preview(value: unknown, max = 72): string {
  let text: string;
  try {
    text = JSON.stringify(value, showErrors) ?? String(value);
  } catch {
    text = String(value);
```

- [ ] **Step 4: Run the test again**

Run: `pnpm test:nowatch tests/site/timeline.test.ts`

Expected: PASS, 21 tests.

- [ ] **Step 5: Write the Server card**

The DOM is checked in Chrome (Task 6), like the rest of the UI.

Create `demo/src/playground/serverPane.ts`:

```ts
import { el } from '../dom';
import type { ScenarioSession } from '../engine/session';
import type { WireEntry } from '../fakes/webSocketServer';

// Full class names, so Tailwind finds them in the source
const DIRECTION: Record<WireEntry['direction'], { mark: string; label: string; className: string }> = {
  client: { mark: '→', label: 'client sent', className: 'text-info' },
  server: { mark: '←', label: 'server sent', className: 'text-success' },
  note: { mark: '·', label: 'connection', className: 'text-base-content/70' }
};

/** How many wire lines the pane keeps on screen */
const SHOWN = 200;

/**
 * The scenario's fake server, as a card: its wire log (frames each way, and what happened to connections) and controls
 * to send a frame to the client, drop the connection or refuse the next one. The controls act on the session's
 * current server, so they keep working when the scenario starts over; `render()` redraws the log.
 */
export function serverPane(session: ScenarioSession, sample: string): { element: HTMLElement; render: () => void } {
  const log = el('ol', { class: 'space-y-0.5 font-mono text-xs' });
  const logBox = el('div', { class: 'max-h-64 overflow-y-auto pe-2' }, [log]);
  const status = el('p', { class: 'text-sm text-base-content/70' });
  const frame = el('textarea', {
    class: 'textarea textarea-sm w-full font-mono text-xs',
    rows: '4',
    spellcheck: 'false',
    'aria-label': 'Frame to send to the client'
  });
  frame.value = sample;
  const button = (label: string, className: string, onClick: () => void) => {
    const element = el('button', { type: 'button', class: className }, [label]);
    element.addEventListener('click', onClick);
    return element;
  };

  const render = () => {
    const wire = session.server?.wire ?? [];
    log.replaceChildren(
      ...wire.slice(-SHOWN).map(entry => {
        const direction = DIRECTION[entry.direction];
        return el('li', { class: 'flex gap-2' }, [
          el(
            'span',
            { class: `${direction.className} shrink-0`, title: direction.label, 'aria-label': direction.label },
            [direction.mark]
          ),
          el('span', { class: 'break-all' }, [entry.text]),
          el('span', { class: 'shrink-0 text-base-content/70' }, [`${entry.at} ms`])
        ]);
      })
    );
    if (wire.length === 0) log.append(el('li', { class: 'text-base-content/70' }, ['Nothing on the wire yet.']));
    logBox.scrollTop = logBox.scrollHeight;
    const open = session.server?.openConnections ?? 0;
    status.textContent = `${open} open connection${open === 1 ? '' : 's'}`;
  };

  const legend = el(
    'p',
    { class: 'mb-2 flex flex-wrap gap-x-4 text-xs text-base-content/70' },
    (['client', 'server', 'note'] as const).map(direction =>
      el('span', {}, [
        el('span', { class: DIRECTION[direction].className }, [DIRECTION[direction].mark]),
        ` ${DIRECTION[direction].label}`
      ])
    )
  );

  const element = el('div', { class: 'grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]' }, [
    el('div', { class: 'min-w-0' }, [legend, logBox]),
    el('div', { class: 'flex flex-col gap-2' }, [
      status,
      frame,
      button('Send to the client', 'btn btn-sm btn-primary', () => session.server?.send(frame.value)),
      button('Drop the connection', 'btn btn-sm', () => session.server?.drop()),
      button('Refuse the next connection', 'btn btn-sm', () => session.server?.refuseNext())
    ])
  ]);
  render();
  return { element, render };
}
```

- [ ] **Step 6: Show it in the workbench**

In `demo/src/playground/workbench.ts`, replace:

```ts
import { announcement, timelineRows, type Tone } from '../timeline';
import { renderLaneChart } from './laneChart';

// Full class names, so Tailwind finds them in the source
```

with:

```ts
import { announcement, timelineRows, type Tone } from '../timeline';
import { renderLaneChart } from './laneChart';
import { serverPane } from './serverPane';

// Full class names, so Tailwind finds them in the source
```

In `demo/src/playground/workbench.ts`, replace:

```ts
  // Flow control scenarios show the latest action over time too
  const lanesHost = scenario.lanes ? el('div', {}) : undefined;

  const renderTimeline = () => {
```

with:

```ts
  // Flow control scenarios show the latest action over time too
  const lanesHost = scenario.lanes ? el('div', {}) : undefined;
  // Adapter scenarios show their fake server: the wire log, and controls
  const server = scenario.websocket ? serverPane(session, scenario.websocket.sample ?? '') : undefined;

  const renderTimeline = () => {
```

In `demo/src/playground/workbench.ts`, replace:

```ts
    timelineBox.scrollTop = timelineBox.scrollHeight;
    if (lanesHost) renderLaneChart(lanesHost, laneChart(session.trace.entries));
    // A new trace means the reader started over (a control, Reset, edited code): its setup isn't announced
    if (session.trace !== announcedTrace) {
```

with:

```ts
    timelineBox.scrollTop = timelineBox.scrollHeight;
    if (lanesHost) renderLaneChart(lanesHost, laneChart(session.trace.entries));
    server?.render();
    // A new trace means the reader started over (a control, Reset, edited code): its setup isn't announced
    if (session.trace !== announcedTrace) {
```

In `demo/src/playground/workbench.ts`, replace:

```ts
  };
  const traceSubscription = bus.subscribe('trace.entry', scheduleRender);
  // The chart's tick labels depend on its width: draw it again when that changes
  const resizes = lanesHost ? new ResizeObserver(() => scheduleRender()) : undefined;
```

with:

```ts
  };
  const traceSubscription = bus.subscribe('trace.entry', scheduleRender);
  const wireSubscription = bus.subscribe('wire.entry', scheduleRender);
  // The chart's tick labels depend on its width: draw it again when that changes
  const resizes = lanesHost ? new ResizeObserver(() => scheduleRender()) : undefined;
```

In `demo/src/playground/workbench.ts`, replace:

```ts
        ]
      : []),
    el('section', { class: 'card bg-base-100 border border-base-300 mt-4', 'aria-label': 'Code' }, [
      el('div', { class: 'card-body p-4 gap-3' }, [
```

with:

```ts
        ]
      : []),
    ...(server
      ? [
          el('section', { class: 'card bg-base-100 border border-base-300 mt-4', 'aria-label': 'Server' }, [
            el('div', { class: 'card-body p-4 gap-3' }, [
              el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, ['Server']),
              server.element
            ])
          ])
        ]
      : []),
    el('section', { class: 'card bg-base-100 border border-base-300 mt-4', 'aria-label': 'Code' }, [
      el('div', { class: 'card-body p-4 gap-3' }, [
```

In `demo/src/playground/workbench.ts`, replace:

```ts
  return () => {
    bus.unsubscribeById(traceSubscription);
    resizes?.disconnect();
    editor.destroy();
  };
}
```

with:

```ts
  return () => {
    bus.unsubscribeById(traceSubscription);
    bus.unsubscribeById(wireSubscription);
    resizes?.disconnect();
    editor.destroy();
    // Leaving the scenario ends its connections, which would otherwise keep reconnecting
    session.stop();
  };
}
```

- [ ] **Step 7: Run the site tests and the type check**

Run: `pnpm test:nowatch tests/site && pnpm typecheck`

Expected: PASS, 13 files, 321 tests; the type check exits 0.

- [ ] **Step 8: Commit**

```bash
git add demo/src/playground/serverPane.ts demo/src/playground/workbench.ts demo/src/timeline.ts tests/site/timeline.test.ts
git commit -F - <<'EOF'
Demo: the Server card, and errors shown by name in the timeline

Adapter scenarios get a Server card: the wire log with a legend, and controls to send a frame, drop the connection or refuse the next one. Leaving a scenario ends its connections, which would otherwise keep reconnecting. JSON keeps none of an Error's fields, so ws.parse.error showed {"error":{}}; the timeline now shows the error's name and message.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 6: Docs, the full check and the browser check

**Files:**
- Modify: `CLAUDE.md` (Demo Site)
- Modify: `docs/demo-revamp-design.md` (status, Tracing, Phase 3, Follow-ups)

**Interfaces:**
- Consumes: everything above
- Produces: nothing new

- [ ] **Step 1: Update CLAUDE.md's Demo Site section**

In `CLAUDE.md`, replace:

```markdown
phases 2 (the foundation), 3a (the core scenarios) and 3b (flow control) are done)
```

with:

```markdown
phases 2 (the foundation), 3a (the core scenarios), 3b (flow control) and 3c-1 (WebSocket and Recipes) are done)
```

In `CLAUDE.md`, replace:

```markdown
Like EvEm, the trace refuses an empty event name before recording anything.
```

with:

```markdown
Like EvEm, the trace refuses an empty event name before recording anything. What `WebSocketHandler` registers is named after it (`trace.owner`, set while its constructor runs).
```

In `CLAUDE.md`, replace:

```markdown
A check gives control `values`, `before` actions, the `action` and its `calls` in order, and optionally `result`, `rejects`, `logs` (in order) and `skipped` (`name: reason`)
```

with:

```markdown
A check gives control `values`, `before` actions, the `action` and its `calls` in order, and optionally `result`, `rejects`, `logs` (in order), `skipped` (`name: reason`) and `wire` (parts of the fake server's wire log, in order); in `before` and `action`, `server:drop`, `server:refuse` and `server:send <text>` act on the fake server
- **Fake servers** (`demo/src/fakes/`): a scenario's `websocket` (`FakeWebSocketBehavior`: `latency`, request `methods`, `onMessage`, and the server pane's `sample` frame) gives it a `FakeWebSocketServer` (`webSocketServer.ts`), new at every reset: its `socketClass` makes `IWebSocket`s that open after the latency, like a browser's; it answers `{ type: 'request' }` by method (a thrown `{ code, message }` is an error response, a missing method a 404), drops connections (1006), refuses the next ones, and logs every frame and connection event in `wire`. In the code's scope, `WebSocketHandler` is a subclass that passes the server's `socketClass` unless the code gives its own `WebSocketConstructor` or socket; `session.stop()` (on every reset, and when the page leaves the scenario) disconnects the code's handlers and closes the server
```

In `CLAUDE.md`, replace:

```markdown
through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `theme.changed`)
```

with:

```markdown
through the playground's own `EvEm` (`playground.navigate`, `trace.entry`, `wire.entry`, `theme.changed`)
```

In `CLAUDE.md`, replace:

```markdown
a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back)
```

with:

```markdown
a lane of publishes, then one per subscriber with its runs and the calls throttle or debounce held back; with a scenario's `websocket`, `playground/serverPane.ts` is the Server card: the wire log, and controls to send a frame, drop the connection or refuse the next one)
```

In `CLAUDE.md`, replace:

```markdown
`lanes` (the lane model and time axis);
```

with:

```markdown
`lanes` (the lane model and time axis); `webSocketServer` (the fake server, driven by the real `WebSocketHandler`);
```

- [ ] **Step 2: Update the design**

The five 3c follow-ups this part fixes leave the table; `vite/client` moves to 3c-2, where Python mode needs it.

In `docs/demo-revamp-design.md`, replace:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3a (core scenarios) and 3b (flow control) implemented; 3c, 4 and 5 not started.**
```

with:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3a (core scenarios), 3b (flow control) and 3c-1 (WebSocket and Recipes) implemented; 3c-2 (SSE and Python mode), 4 and 5 not started.**
```

In `docs/demo-revamp-design.md`, replace:

```markdown
- **The timeline** shows one card per publish, with its steps nested in order; delayed calls (debounce) appear when they happen, labeled with the publish that caused them.
```

with:

```markdown
- **The timeline** shows a row per step, nested under its publish in order; delayed calls (debounce) are rows of their own when they happen, labeled with the time of the publish whose data they got.
```

In `docs/demo-revamp-design.md`, replace:

```markdown
**3c**, the WebSocket, SSE and Recipes groups, with the fake servers, the server pane and Python mode.
```

with:

```markdown
**3c**, the WebSocket, SSE and Recipes groups, with the fake servers, the server pane and Python mode. 3c is in two parts as well: **3c-1**, the WebSocket and Recipes groups, with the fake WebSocket server and the server pane; **3c-2**, the SSE group, with the fake SSE server and Python mode.
```

In `docs/demo-revamp-design.md`, replace:

```markdown
| Phase 2, ruling 13 | `vite/client` types, for `import.meta.env` in Python mode | 3c |
```

with:

```markdown
| Phase 2, ruling 13 | `vite/client` types, for `import.meta.env` in Python mode | 3c-2 |
```

In `docs/demo-revamp-design.md`, delete:

```markdown
| 3b review | `publishFor` attributes a debounced call by value for primitives too (a `1` could be matched to an unrelated publish of `1`): only objects should match by identity | 3c |
| 3b review | The lane chart scans the whole trace for subscriber names on every render (fine now; 3c's server scenarios make long traces) | 3c |
| 3b review | A test pinning that a second burst replaces the first's pending debounced call (one later call) | 3c |
| 3b review | `timeAxis` tests at the 12-second long-burst case and where span / step is exactly 8 | 3c |
| 3b review | The spec's Tracing section still says "one card per publish": rows labeled with their publish's time shipped (3b, ruling 2) | 3c |
```

- [ ] **Step 3: Run everything CI runs**

Run: `pnpm check`

Expected: exit 0: the format check, the type check, 62 test files (1,306 passed, 12 skipped, as on `main`: old demo pages without the feature a test needs, and optional Python modules) and the package check.

- [ ] **Step 4: Check the playground in the browser**

Start the dev server with `pnpm demo` and open http://127.0.0.1:5199/playground/ in Chrome (Claude in Chrome). First check `document.visibilityState === 'visible'`: a hidden window throttles timers to about a second, so everything below still happens, only slower. Then:

- **Connection & offline queue** (`#/websocket/connection-queue`): *Send a message*: a `→` frame in the Server card, `state: connected, queued: 0`. *Drop the connection*, then *Send a message* while it reconnects: `queued: 1`, and the frame goes out right after `connection 2 opened`. *Refuse the next connection*, then *Drop the connection*: `refused a connection`, then the next connection opens. With `reconnect` off: drop, then *Drop the connection* again (`no open connection to drop`) and *Send to the client* (`no open connection: nothing sent`).
- **Reset in the middle of a reconnect**: drop, then *Reset* at once. The new wire log has only `connection 1 opened`, and the timeline one `disconnected → connected`: nothing from the earlier run.
- **Request–response**: the four actions log `got {"id":42,"name":"Cy"}`, `failed (404): No user 7`, `RequestTimeoutError: …` and `Ada and Bo`; the slow report's answer still arrives about 3 s after its request (a `ws.response` row) and changes nothing.
- **Server events & routing**: *Subscribe to the news*: two `news:` lines, `other message: {"ping":1}` and `could not parse: this is not JSON`, whose `ws.parse.error` row shows `"error":"SyntaxError: …"`. *Send to the client* with the sample frame: `news: From the Server card`. The same with `serverEventPrefix` set to `''`.
- **Chat over WebSocket** (`#/recipes/chat`): *Load the history* (two lines), *Say hello* (`you: Hello!`, then Bo about 0.6 s later); *Drop the connection* and *Say hello* at once: `(reconnecting)`, then the message goes out after `(connected)`. In room `random`, *Send to the client* (a lobby message): `show` is filtered out.
- **Many frames**: on Server events, send 250 frames from the card (a loop in the console that sets the textarea and clicks *Send to the client*): the log shows the newest 200, scrolled to the end.
- **Narrow screens**: at 375 px wide (Playwright: a hidden Chrome window ignores resizing), the Server card's controls stack under the log, long frames wrap, and the page doesn't scroll sideways.
- Leave a WebSocket scenario for another one: no errors in the console (the favicon's 404 is a phase 4 follow-up).

Stop the dev server afterwards (`kill $(lsof -t -nP -iTCP:5199 -sTCP:LISTEN)`).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/demo-revamp-design.md
git commit -F - <<'EOF'
Docs: the WebSocket scenarios, the fake server and the Server card; 3c's follow-ups done

CLAUDE.md describes the fake server, the handler subclass, wire checks and the Server card. The design marks 3c-1 done and splits 3c in two, its Tracing section describes the rows that shipped, and the follow-ups this part fixed leave the table; vite/client types move to 3c-2.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```
