# Demo Cleanup Implementation Plan (Demo Revamp, Phase 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the demo revamp: retire the old demo pages and their tests, link the playground from the adapter docs, and close the nine follow-ups left for phase 5 (narrow phones, an adapter card's connection announcements, the fake SSE server's edge cases, exact waits in the scenario checks, and three small fixes).

**Architecture:** Mostly local fixes, each test-first where it has logic. The fake SSE server notes what it didn't write (a silenced stream, an empty text) and logs a request's URL as given. The scenario checks run `wait:` steps outside `settle()`. `latestConnectionState` finds an adapter's last connection change, so an adapter card announces it even when the stream's ticks aren't announced; the card counts what it announced by trace entry, since its rows stop growing at `OUTPUT_SHOWN`. Then the old pages and tests go, and the docs say the revamp is done.

**Tech Stack:** As phase 4b-2; no new dependencies.

**Spec:** `docs/demo-revamp-design.md`: "Phase 5: Cleanup" (reviewed with the user on 2026-10-03: retire the old demo, and fix the follow-ups for phase 5) and the Follow-ups rows for phase 5, which this plan removes.

## Global Constraints

- No runtime dependencies, and no new dev dependencies. Development needs Node.js 20.19+ or 22.12+ (Vite 8); the package's `engines` (`>=20`) don't change.
- The site imports the library only as `@jcfigueiredo/evem` and its subpaths (aliased to `src/`); `src/` isn't touched.
- Colors only through daisyUI semantic tokens (plus `--code-*`); every text pair meets WCAG AA (`tests/site/contrast.test.ts`).
- Class names Tailwind must generate are written out in full in the source.
- DOM content from data goes through `el()`: strings become text nodes, never HTML.
- The demo isn't part of the npm package (`files: ["dist"]`): no CHANGELOG entry.
- Code style: Prettier (`pnpm format`), single quotes, 120 columns, no trailing commas.
- Commit messages: subject, a body that explains why, and the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW`.
- New tests go in `tests/site/`.

## Rulings made while planning (for review)

Every file in this plan was written and run first: `pnpm check` passed on the result (67 test files, 1,014 tests passed, 2 skipped, and the package check; the old demo's seven test files are gone). The showcase and the playground were checked with Playwright's Chromium, with device emulation at 320, 360, 375 and 412 px, and an adapter card was left running for 45 s. A dry run of the tasks in order, from `main`, confirmed each step's Expected result below and that the end state equals the validated files.

1. **Narrow phones:** device emulation (a mobile viewport, touch and a device pixel ratio of 3) found the showcase's hero 368 px wide on 320 and 360 px screens, so the page scrolled sideways. The cause was the install command: a flex item with `whitespace-nowrap` still reports its whole text as its minimum width, even with `min-w-0`. `w-0 min-w-0 flex-1` lets it shrink and scroll inside its box. Earlier checks used a 375 px viewport, where it fit. The playground and the rest of the showcase have no overflow at 320 px.
2. **An adapter card's announcements:** it announces once what followed the reader's click (as in 4b-2) and, click or not, when its connection changes (`Connection: connected.`), so a screen-reader user hears the resume after a drop. While wiring it, the card's row-count announcer turned out to stop for good once the output reached its 150-row cap (about 35 s of SSE ticks); it now counts by trace entry.
3. **The fake SSE server** notes `connection N is silent: nothing sent` (or `no ping sent`) instead of dropping a write to a silenced stream, notes `nothing to write: the text is empty` instead of writing empty chunks, and logs a request's URL as given, like `LocalSseServer`: an absolute URL in edited code shows where it was meant to go. Its own tests used an absolute URL, so their expected request lines change.
4. **`wait:` steps** let exactly their time pass: they ran inside `settle()`, whose bounded 50 ms steps added to them (a `wait:120` let 170 ms pass). The test that pins it first runs against today's behavior (`runStep` defined as `settle(step(...))`) to see that failure.
5. **The old demo pages** have counterparts in the playground for every feature (core, flow control, history, middleware and transforms, schema validation, cancelable events and errors, WebSocket, SSE, the chat), so they go with their tests; the adapter docs link the playground's scenarios.
6. **Small fixes:** the workbench resets `seen` for a new trace before it sets the hidden tabs' counts; `Scenario.sse.local`'s doc says to set it only where the simulated server serves what the Python examples serve; CLAUDE.md's status line (and its missing comma) says the revamp is done.

## Review Focus

1. **Phones at 320 to 412 px, with device emulation:** neither page scrolls sideways, the install command scrolls inside its box, and the adapter cards' tab rows stay on one line. Playwright, Task 4.
2. **An adapter card over minutes:** one announcement per click, the connection changes announced after it, and both still working after the output reaches its cap. Chrome, Task 3.
3. **The Server tab's notes:** *Go silent* then a write or a heartbeat, an empty send box, and an edited absolute URL each show a note in the wire log, and nothing is written. Chrome, Task 1.
4. **Nothing left pointing at the old pages:** links, docs, CLAUDE.md, the test list. `grep`, Task 5.
5. **The scenario checks' timing:** every check still passes with exact waits, the SSE ones included (bounded time). `tests/site/scenarios.test.ts`, Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `demo/src/fakes/sseServer.ts` | Notes for writes to silenced streams and empty writes; the request URL as given |
| `tests/site/scenarios.test.ts` | `runStep`: exact `wait:` steps |
| `demo/src/timeline.ts` | `latestConnectionState` |
| `demo/src/showcase/widget.ts` | An adapter card announces by trace entry, and its connection changes |
| `demo/src/playground/workbench.ts`, `demo/src/engine/session.ts`, `demo/index.html` | The count reset's order; `sse.local`'s doc; the install command on narrow phones |
| `demo/examples/`, `tests/demo/` (deleted) | The old demo pages and their tests |
| `docs/sse-adapter.md`, `docs/websocket-adapter.md` | Links to the playground's scenarios |
| `tests/site/*.test.ts` | `sseServer`, `scenarios`, `timeline` |
| `CLAUDE.md`, `docs/demo-revamp-design.md` | The revamp done; the old demo gone; no open follow-ups |

---

### Task 1: The fake SSE server's notes, and the URL as given

**Files:**
- Modify: `demo/src/fakes/sseServer.ts`
- Test: `tests/site/sseServer.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: the wire notes `connection N is silent: <what>` and `nothing to write: the text is empty`; request lines show the URL as given; `Stream.silenced` (getter)

- [ ] **Step 1: Write the failing tests**

In `tests/site/sseServer.test.ts`, replace:

```ts
    expect(published).toEqual(['state connecting', 'state connected', 'server.hello']);
    expect(wire()).toEqual([
      'client: GET /events',
      'note: connection 1 opened (200, text/event-stream)',
      'server: event: hello\nid: 1\ndata: {"n":1}\n\n'
```

with:

```ts
    expect(published).toEqual(['state connecting', 'state connected', 'server.hello']);
    expect(wire()).toEqual([
      'client: GET https://api.test/events',
      'note: connection 1 opened (200, text/event-stream)',
      'server: event: hello\nid: 1\ndata: {"n":1}\n\n'
```

In `tests/site/sseServer.test.ts`, replace:

```ts
    expect(published.filter(event => event === 'server.tick')).toHaveLength(3);
    expect(wire()).toEqual([
      'client: GET /events',
      'note: connection 1 opened (200, text/event-stream)',
      'server: event: tick\nid: 1\ndata: 1\n\n',
      'note: connection 1 ended by the server',
      'client: GET /events · last-event-id: 1',
      'note: connection 2 opened (200, text/event-stream)',
      'server: event: tick\nid: 2\ndata: 2\n\n',
      'note: will refuse the next connection',
      'note: connection 2 dropped (network error)',
      'client: GET /events · last-event-id: 2',
      'note: refused a connection (network error)',
      'client: GET /events · last-event-id: 2',
      'note: connection 3 opened (200, text/event-stream)',
      'server: event: tick\nid: 3\ndata: 3\n\n'
```

with:

```ts
    expect(published.filter(event => event === 'server.tick')).toHaveLength(3);
    expect(wire()).toEqual([
      'client: GET https://api.test/events',
      'note: connection 1 opened (200, text/event-stream)',
      'server: event: tick\nid: 1\ndata: 1\n\n',
      'note: connection 1 ended by the server',
      'client: GET https://api.test/events · last-event-id: 1',
      'note: connection 2 opened (200, text/event-stream)',
      'server: event: tick\nid: 2\ndata: 2\n\n',
      'note: will refuse the next connection',
      'note: connection 2 dropped (network error)',
      'client: GET https://api.test/events · last-event-id: 2',
      'note: refused a connection (network error)',
      'client: GET https://api.test/events · last-event-id: 2',
      'note: connection 3 opened (200, text/event-stream)',
      'server: event: tick\nid: 3\ndata: 3\n\n'
```

In `tests/site/sseServer.test.ts`, replace:

```ts
      'note: will answer the next request with 503 Service Unavailable · Retry-After: 1',
      'note: connection 1 ended by the server',
      'client: GET /events',
      'note: connection 2 answered 503 Service Unavailable · Retry-After: 1'
    ]);
```

with:

```ts
      'note: will answer the next request with 503 Service Unavailable · Retry-After: 1',
      'note: connection 1 ended by the server',
      'client: GET https://api.test/events',
      'note: connection 2 answered 503 Service Unavailable · Retry-After: 1'
    ]);
```

In `tests/site/sseServer.test.ts`, replace:

```ts
    server.run('end');
    expect(wire()).toEqual([
      'client: GET /events · authorization: Bearer t0ken',
      'note: connection 1 opened (200, text/event-stream)',
      'note: connection 1 closed by the client',
```

with:

```ts
    server.run('end');
    expect(wire()).toEqual([
      'client: GET https://api.test/events · authorization: Bearer t0ken',
      'note: connection 1 opened (200, text/event-stream)',
      'note: connection 1 closed by the client',
```

In `tests/site/sseServer.test.ts`, replace:

```ts
    ]);
    expect(() => server.run('explode')).toThrow('The SSE server has no command explode');
  });

```

with:

```ts
    ]);
    expect(() => server.run('explode')).toThrow('The SSE server has no command explode');
  });

  it("logs a request's URL as given, so an absolute URL in edited code shows where it was meant to go", async () => {
    const { wire } = setup();
    await vi.advanceTimersByTimeAsync(20);
    expect(wire()[0]).toBe('client: GET https://api.test/events');
  });

  it('notes a write to a silenced stream, and an empty write, instead of writing nothing quietly', async () => {
    const { server, wire } = setup();
    await vi.advanceTimersByTimeAsync(20);
    server.run('silent');
    server.run('send', 'event: note\ndata: "lost"\n\n');
    server.run('ping');
    expect(wire().slice(-2)).toEqual([
      'note: connection 1 is silent: nothing sent',
      'note: connection 1 is silent: no ping sent'
    ]);

    server.run('send', '');
    server.run('split', '');
    expect(wire().slice(-2)).toEqual([
      'note: nothing to write: the text is empty',
      'note: nothing to write: the text is empty'
    ]);
  });

```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:nowatch tests/site/sseServer.test.ts`

Expected: FAIL, 6 failed | 4 passed (10): the request lines still show the path (`expected [ 'client: GET /events', … ] to deeply equal …`, in four tests), the new URL test, and the notes test.

- [ ] **Step 3: Note what the server doesn't write, and log the URL as given**

In `demo/src/fakes/sseServer.ts`, replace:

```ts

const encoder = new TextEncoder();

/** The path and query of a request's URL, relative or absolute */
function pathOf(url: string): string {
  const parsed = new URL(url, 'http://localhost');
  return parsed.pathname + parsed.search;
}

/** Wait `ms`, or reject as `fetch` does if the request is aborted first */
```

with:

```ts

const encoder = new TextEncoder();

/** Wait `ms`, or reject as `fetch` does if the request is aborted first */
```

In `demo/src/fakes/sseServer.ts`, replace:

```ts
  /** Write text to every open stream, as it is (the blank line that ends an event is up to the text) */
  send(text: string): void {
    if (!this.anyOpen('nothing sent')) return;
    for (const stream of this.streams) stream.write(text);
  }

  /** Write text in two chunks: inside its first character of more than one byte, else in the middle */
  sendSplit(text: string): void {
    if (!this.anyOpen('nothing sent')) return;
    const bytes = encoder.encode(text);
    const lead = bytes.findIndex(byte => byte >= 0xc0);
    const at = lead >= 0 ? lead + 1 : Math.floor(bytes.length / 2);
    for (const stream of this.streams) stream.writeChunks([bytes.subarray(0, at), bytes.subarray(at)]);
  }

```

with:

```ts
  /** Write text to every open stream, as it is (the blank line that ends an event is up to the text) */
  send(text: string): void {
    if (!this.hasText(text) || !this.anyOpen('nothing sent')) return;
    for (const stream of this.writable('nothing sent')) stream.write(text);
  }

  /** Write text in two chunks: inside its first character of more than one byte, else in the middle */
  sendSplit(text: string): void {
    if (!this.hasText(text) || !this.anyOpen('nothing sent')) return;
    const bytes = encoder.encode(text);
    const lead = bytes.findIndex(byte => byte >= 0xc0);
    const at = lead >= 0 ? lead + 1 : Math.floor(bytes.length / 2);
    for (const stream of this.writable('nothing sent')) stream.writeChunks([bytes.subarray(0, at), bytes.subarray(at)]);
  }

```

In `demo/src/fakes/sseServer.ts`, replace:

```ts
  ping(): void {
    if (!this.anyOpen('no ping sent')) return;
    for (const stream of this.streams) stream.write(formatSseComment('ping'));
  }

```

with:

```ts
  ping(): void {
    if (!this.anyOpen('no ping sent')) return;
    for (const stream of this.writable('no ping sent')) stream.write(formatSseComment('ping'));
  }

  /** Whether there's text to write; if not, note it rather than writing empty chunks */
  private hasText(text: string): boolean {
    if (text === '') this.note('nothing to write: the text is empty');
    return text !== '';
  }

  /** The open streams that still take writes, noting that `what` didn't happen on the silenced ones */
  private writable(what: string): Stream[] {
    return [...this.streams].filter(stream => {
      if (stream.silenced) this.note(`connection ${stream.number} is silent: ${what}`);
      return !stream.silenced;
    });
  }

```

In `demo/src/fakes/sseServer.ts`, replace:

```ts
    const headers = new Headers(init.headers);
    const shown = [...headers].filter(([name]) => name !== 'accept').map(([name, value]) => `${name}: ${value}`);
    this.log.add('client', [`${init.method ?? 'GET'} ${pathOf(url)}`, ...shown].join(' · '));
    await wait(this.latency, init.signal);
    if (this.closed) throw new TypeError('Failed to fetch');
```

with:

```ts
    const headers = new Headers(init.headers);
    const shown = [...headers].filter(([name]) => name !== 'accept').map(([name, value]) => `${name}: ${value}`);
    // The URL as given, like LocalSseServer: an absolute one in edited code shows where it was meant to go
    this.log.add('client', [`${init.method ?? 'GET'} ${url}`, ...shown].join(' · '));
    await wait(this.latency, init.signal);
    if (this.closed) throw new TypeError('Failed to fetch');
```

In `demo/src/fakes/sseServer.ts`, replace:

```ts
  private silent = false;
  private stops: Array<() => void> = [];

  constructor(
```

with:

```ts
  private silent = false;
  private stops: Array<() => void> = [];

  /** Whether the server stopped writing to this stream (*Go silent*), which stays open */
  get silenced(): boolean {
    return this.silent;
  }

  constructor(
```

- [ ] **Step 4: Run the server tests and the scenario checks**

Run: `pnpm test:nowatch tests/site/sseServer.test.ts tests/site/scenarios.test.ts`

Expected: PASS, 2 files, 156 tests (the scenario checks use relative URLs, which are logged as before).

- [ ] **Step 5: Check it in the browser**

With `pnpm demo`, in the playground's *Stream & routing* (SSE), on the Server tab: press *Go silent*, then *Write to the stream* and *Heartbeat*: the wire log notes `connection 1 is silent: nothing sent` and `… no ping sent`; empty the send box and write: `nothing to write: the text is empty`. Edit the code to `new SseHandler('https://api.example.com/events', …)`, run it: the request line shows that URL.

- [ ] **Step 6: Commit**

```bash
git add demo/src/fakes/sseServer.ts tests/site/sseServer.test.ts
git commit -F - <<'EOF'
Demo: the fake SSE server says what it didn't write, and logs the URL as given

A write after Go silent vanished without a word (the silenced stream still counts as open), an empty send box wrote empty chunks and logged blank lines, and an absolute URL in edited code was logged as a path, as if it had reached that host. The server now notes 'connection N is silent: nothing sent' and 'nothing to write: the text is empty', and logs the request's URL as given, like LocalSseServer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 2: Exact waits in the scenario checks

**Files:**
- Modify: `tests/site/scenarios.test.ts` (`runStep`; `step` no longer handles waits)

**Interfaces:**
- Consumes: nothing new
- Produces: `runStep(session, action, bounded)` in the test file: `wait:<ms>` advances exactly that much; anything else is settled

- [ ] **Step 1: Write the test, against today's behavior**

`runStep` starts as what the checks do today, `settle(step(...))`, so the test shows the problem.

In `tests/site/scenarios.test.ts`, replace:

```ts
  await step;
}

describe('the scenario list', () => {
```

with:

```ts
  await step;
}

/** Run a check's step and let it finish (today's behavior: every step goes through settle) */
async function runStep(session: ScenarioSession, action: string, bounded: boolean): Promise<void> {
  await settle(step(session, action), bounded);
}

describe('the check runner', () => {
  it('lets exactly the time a wait: step asks for pass, bounded or not', async () => {
    vi.useFakeTimers();
    const session = new ScenarioSession(scenarios[0]!);
    for (const bounded of [true, false]) {
      const start = Date.now();
      await runStep(session, 'wait:120', bounded);
      expect(Date.now() - start, bounded ? 'bounded' : 'unbounded').toBe(120);
    }
    vi.useRealTimers();
  });
});

describe('the scenario list', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/scenarios.test.ts -t "check runner"`

Expected: FAIL, 1 failed | 146 skipped (147): `bounded: expected 170 to be 120`.

- [ ] **Step 3: Run waits outside settle**

In `tests/site/scenarios.test.ts`, replace:

```ts
/** Run a check's step and let it finish (today's behavior: every step goes through settle) */
async function runStep(session: ScenarioSession, action: string, bounded: boolean): Promise<void> {
  await settle(step(session, action), bounded);
}


```

with:

```ts
/**
 * Run a check's step and let it finish: `wait:<ms>` lets exactly that much time pass; anything else is settled.
 * A wait doesn't go through `settle`, whose bounded steps of 50 ms would add to it.
 */
async function runStep(session: ScenarioSession, action: string, bounded: boolean): Promise<void> {
  if (action.startsWith('wait:')) await vi.advanceTimersByTimeAsync(Number(action.slice('wait:'.length)));
  else await settle(step(session, action), bounded);
}


```

In `tests/site/scenarios.test.ts`, replace:

```ts

/**
 * Run an action; a command to the scenario's server, `server:<command> <argument>` (what the Server tab's controls
 * do: `server:drop`, `server:send <text>`, …); or `wait:<ms>`, which lets that much time pass
 */
async function step(session: ScenarioSession, action: string): Promise<void> {
  if (action.startsWith('wait:')) {
    await vi.advanceTimersByTimeAsync(Number(action.slice('wait:'.length)));
    return;
  }
  if (!action.startsWith('server:')) return session.run(action);
  const server = session.server;
```

with:

```ts

/**
 * Run an action, or a command to the scenario's server, `server:<command> <argument>` (what the Server tab's
 * controls do: `server:drop`, `server:send <text>`, …)
 */
async function step(session: ScenarioSession, action: string): Promise<void> {
  if (!action.startsWith('server:')) return session.run(action);
  const server = session.server;
```

In `tests/site/scenarios.test.ts`, replace:

```ts
      Object.assign(session.values, check.values ?? {});
      await settle(session.restoreTemplate(), bounded);
      for (const action of check.before ?? []) await settle(step(session, action), bounded);
      const before = session.trace.entries.length;
      const wireBefore = session.server?.wire.length ?? 0;

      await settle(step(session, check.action), bounded);
      if (check.wait) await vi.advanceTimersByTimeAsync(check.wait);

```

with:

```ts
      Object.assign(session.values, check.values ?? {});
      await settle(session.restoreTemplate(), bounded);
      for (const action of check.before ?? []) await runStep(session, action, bounded);
      const before = session.trace.entries.length;
      const wireBefore = session.server?.wire.length ?? 0;

      await runStep(session, check.action, bounded);
      if (check.wait) await vi.advanceTimersByTimeAsync(check.wait);

```

- [ ] **Step 4: Run every scenario check**

Run: `pnpm typecheck && pnpm test:nowatch tests/site/scenarios.test.ts`

Expected: the type check exits 0; PASS, 147 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/site/scenarios.test.ts
git commit -F - <<'EOF'
Test: a scenario check's wait: step lets exactly its time pass

A wait: step ran inside settle(), whose bounded 50 ms steps advanced the fake clock alongside it, so a bounded wait:120 let 170 ms pass. Deterministic, but fragile across fake-timer changes. runStep now advances a wait directly, and settles everything else; a test pins it, bounded and not.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 3: An adapter card announces its connection

**Files:**
- Modify: `demo/src/timeline.ts` (`latestConnectionState`)
- Modify: `demo/src/showcase/widget.ts`
- Test: `tests/site/timeline.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `latestConnectionState(entries: readonly TraceEntry[]): string | undefined` (the `to` of the latest `ws.connection.state` / `sse.connection.state` publish)

- [ ] **Step 1: Write the failing test**

In `tests/site/timeline.test.ts`, replace:

```ts
  describeEntry,
  isAtEnd,
  keepsFollowing,
  liveAnnouncement,
```

with:

```ts
  describeEntry,
  isAtEnd,
  latestConnectionState,
  keepsFollowing,
  liveAnnouncement,
```

In `tests/site/timeline.test.ts`, replace:

```ts
});

describe('rowsFrom', () => {
  it('times the rows it keeps from their action, even when the action is before where it starts (after Clear)', () => {
```

with:

```ts
});

describe('latestConnectionState', () => {
  it("is the state an adapter's connection last moved to among the entries, for either adapter", () => {
    const at = { at: 0 };
    const state = (event: string, to: string, id: number): TraceEntry => ({
      kind: 'publish',
      id,
      event,
      data: { from: 'x', to, timestamp: 0 },
      ...at
    });
    expect(
      latestConnectionState([
        state('sse.connection.state', 'reconnecting', 1),
        state('sse.connection.state', 'connected', 2)
      ])
    ).toBe('connected');
    expect(latestConnectionState([state('ws.connection.state', 'disconnected', 1)])).toBe('disconnected');
    expect(
      latestConnectionState([{ kind: 'publish', id: 1, event: 'server.tick', data: { n: 1 }, ...at }])
    ).toBeUndefined();
    expect(latestConnectionState([state('my.connection.state.extra', 'connected', 1)])).toBeUndefined();
  });
});

describe('rowsFrom', () => {
  it('times the rows it keeps from their action, even when the action is before where it starts (after Clear)', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:nowatch tests/site/timeline.test.ts`

Expected: FAIL, 1 failed | 30 passed (31): `TypeError: latestConnectionState is not a function`.

- [ ] **Step 3: Write `latestConnectionState`**

In `demo/src/timeline.ts`, replace:

```ts

/**
 * The rows of the entries from `from` on (after the setup, or after the reader cleared the timeline), computed over
 * the whole trace, so a row still nests under its publish and is timed from its action when those come before `from`
```

with:

```ts

/**
 * The state an adapter's connection last moved to among `entries` (the `to` of the latest `ws.connection.state` or
 * `sse.connection.state` publish), or undefined if it didn't change: an adapter's card announces it even when the
 * stream's own ticks aren't
 */
export function latestConnectionState(entries: readonly TraceEntry[]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (entry.kind !== 'publish' || !/^(ws|sse)\.connection\.state$/.test(entry.event)) continue;
    const to = (entry.data as { to?: unknown } | null)?.to;
    if (typeof to === 'string') return to;
  }
  return undefined;
}

/**
 * The rows of the entries from `from` on (after the setup, or after the reader cleared the timeline), computed over
 * the whole trace, so a row still nests under its publish and is timed from its action when those come before `from`
```

- [ ] **Step 4: Run the test again**

Run: `pnpm test:nowatch tests/site/timeline.test.ts`

Expected: PASS, 31 tests.

- [ ] **Step 5: Announce by trace entry, with the connection changes**

An adapter's card keeps the trace and entry count it announced up to; new entries are announced once after a click (`liveAnnouncement`), or, if not, their latest connection state.

In `demo/src/showcase/widget.ts`, replace:

```ts
import { BUTTON, controlField, tabList, timelineItem, wireItem, type Tab } from '../playground/views';
import { scenarioPath } from '../routing';
import { keepsFollowing, liveAnnouncement, sinceLatestAction, timelineRows } from '../timeline';

/**
```

with:

```ts
import { BUTTON, controlField, tabList, timelineItem, wireItem, type Tab } from '../playground/views';
import { scenarioPath } from '../routing';
import { keepsFollowing, latestConnectionState, liveAnnouncement, sinceLatestAction, timelineRows } from '../timeline';

/**
```

In `demo/src/showcase/widget.ts`, replace:

```ts

  let announced = 0;
  let wireShown: { server: unknown; length: number } = { server: undefined, length: -1 };
  const render = () => {
```

with:

```ts

  let announced = 0;
  // An adapter's card announces by trace entry, not by row: its rows stop growing at OUTPUT_SHOWN
  let announcedTrace: unknown;
  let announcedEntries = 0;
  let wireShown: { server: unknown; length: number } = { server: undefined, length: -1 };
  const render = () => {
```

In `demo/src/showcase/widget.ts`, replace:

```ts
      wireShown = { server: session.server, length: lines.length };
    }
    if (rows.length > announced) {
      const text = liveAnnouncement(rows.slice(announced), performance.now() - lastInteraction);
      if (text !== undefined) {
        announcer.textContent = text;
        // A stream never stops: an adapter's card says once what followed the reader's click, not every tick after
        if (adapter) lastInteraction = Number.NEGATIVE_INFINITY;
      }
    }
    announced = rows.length;
  };
  // One render per frame, however many entries, wire lines or resizes came in it
```

with:

```ts
      wireShown = { server: session.server, length: lines.length };
    }
    if (adapter) announceStream();
    else if (rows.length > announced) {
      const text = liveAnnouncement(rows.slice(announced), performance.now() - lastInteraction);
      if (text !== undefined) announcer.textContent = text;
    }
    announced = rows.length;
  };
  /**
   * A stream never stops, so an adapter's card says once what followed the reader's click, not every tick after it;
   * and when its connection changes (a drop, the reconnect), it says so, click or not
   */
  const announceStream = () => {
    const all = session.trace.entries;
    if (session.trace !== announcedTrace) {
      announcedTrace = session.trace;
      announcedEntries = 0;
    }
    const fresh = all.slice(Math.max(announcedEntries, session.setupEnd));
    announcedEntries = all.length;
    if (fresh.length === 0) return;
    const text = liveAnnouncement(timelineRows(fresh), performance.now() - lastInteraction);
    if (text !== undefined) {
      announcer.textContent = text;
      lastInteraction = Number.NEGATIVE_INFINITY;
      return;
    }
    const state = latestConnectionState(fresh);
    if (state !== undefined) announcer.textContent = `Connection: ${state}.`;
  };
  // One render per frame, however many entries, wire lines or resizes came in it
```

- [ ] **Step 6: Run the type check and the site tests**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 25 files, 417 tests.

- [ ] **Step 7: Check it in the browser**

In the showcase's Adapters section, on the SSE card: press *Drop the stream*: the card's live region (`[aria-live]` inside it) says what followed the click, then, a few seconds later, `Connection: connected.`; the ticks after it aren't announced. Leave the card running for 45 s (its output reaches 150 rows), drop again: the same two announcements.

- [ ] **Step 8: Commit**

```bash
git add demo/src/timeline.ts demo/src/showcase/widget.ts tests/site/timeline.test.ts
git commit -F - <<'EOF'
Demo: an adapter card announces its connection changes

An adapter card announced once per click, so after Drop the stream a screen-reader user heard the drop but not the resume. It now also announces the connection's latest state when it changes (latestConnectionState). And it counts what it announced by trace entry: its rows stop growing at the 150-row cap, and the row-count announcer went quiet for good after about 35 s of ticks.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 4: Narrow phones, and two small fixes

**Files:**
- Modify: `demo/index.html` (the install command)
- Modify: `demo/src/playground/workbench.ts` (the count reset first)
- Modify: `demo/src/engine/session.ts` (`sse.local`'s doc)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new

- [ ] **Step 1: Let the install command shrink on narrow phones**

In `demo/index.html`, replace:

```html
              class="mx-auto mt-6 flex max-w-md items-center gap-2 rounded-box bg-neutral py-1 ps-4 pe-1 text-neutral-content lg:mx-0"
            >
              <code class="flex-1 overflow-x-auto py-2 font-mono text-sm whitespace-nowrap"
                >npm install @jcfigueiredo/evem</code
              >
```

with:

```html
              class="mx-auto mt-6 flex max-w-md items-center gap-2 rounded-box bg-neutral py-1 ps-4 pe-1 text-neutral-content lg:mx-0"
            >
              <code class="w-0 min-w-0 flex-1 overflow-x-auto py-2 font-mono text-sm whitespace-nowrap"
                >npm install @jcfigueiredo/evem</code
              >
```

- [ ] **Step 2: Check phones with device emulation**

Playwright with device emulation (a new context with `isMobile: true`, `hasTouch: true`, `deviceScaleFactor: 3`) at 320×568, 360×740, 375×667 and 412×915: on the showcase (scroll through every widget) and the playground (an SSE and a flow control scenario), `document.documentElement.scrollWidth` equals the viewport's width; the install command scrolls inside its box at 320 and 360 px (its `scrollWidth` larger than its `clientWidth`).

- [ ] **Step 3: Reset the counts' baseline first, and document `sse.local`**

In `demo/src/playground/workbench.ts`, replace:

```ts
    server?.render();

    // Counts on the tabs the reader isn't looking at
    const wire = server ? (session.server?.wire.length ?? 0) : 0;
    if (tabs.selected() === 'timeline') seen.timeline = entries.length;
    if (tabs.selected() === 'server') seen.server = wire;
```

with:

```ts
    server?.render();

    // A new trace means the reader started over (a control, Reset, edited code): what it holds isn't news (seen is an
    // entry index, so the rest of a setup still running drops out once its end is known). Reset before the counts
    const wire = server ? (session.server?.wire.length ?? 0) : 0;
    const newTrace = session.trace !== announcedTrace;
    if (newTrace) {
      announcedTrace = session.trace;
      seen.timeline = entries.length;
      seen.server = wire;
    }

    // Counts on the tabs the reader isn't looking at
    if (tabs.selected() === 'timeline') seen.timeline = entries.length;
    if (tabs.selected() === 'server') seen.server = wire;
```

In `demo/src/playground/workbench.ts`, replace:

```ts
    if (server) tabs.setCount('server', wire - seen.server);

    // A new trace means the reader started over (a control, Reset, edited code): what it holds isn't news (seen is an
    // entry index, so the rest of a setup still running drops out once its end is known)
    if (session.trace !== announcedTrace) {
      announcedTrace = session.trace;
      seen.timeline = entries.length;
      seen.server = wire;
    } else if (rows.length > announcedRows) {
      const text = liveAnnouncement(rows.slice(announcedRows), performance.now() - lastInteraction);
      if (text !== undefined) announcer.textContent = text;
```

with:

```ts
    if (server) tabs.setCount('server', wire - seen.server);

    if (!newTrace && rows.length > announcedRows) {
      const text = liveAnnouncement(rows.slice(announcedRows), performance.now() - lastInteraction);
      if (text !== undefined) announcer.textContent = text;
```

In `demo/src/engine/session.ts`, replace:

```ts
   * `SseHandler` reads from it unless the code passes its own `fetch` or another transport. With `local`, the
   * development server can switch to a real SSE server instead (`/events` is proxied to port 8000), and the Server tab
   * shows `local.command` to start one.
   */
  sse?: FakeSseBehavior & { samples?: ServerSample[]; local?: { command: string } };
```

with:

```ts
   * `SseHandler` reads from it unless the code passes its own `fetch` or another transport. With `local`, the
   * development server can switch to a real SSE server instead (`/events` is proxied to port 8000), and the Server tab
   * shows `local.command` to start one. Set it only on a scenario whose simulated server serves what that real server
   * does (the Python examples' tick stream at `/events`), or the switch would show a different scenario.
   */
  sse?: FakeSseBehavior & { samples?: ServerSample[]; local?: { command: string } };
```

- [ ] **Step 4: Run the type check and the site tests**

Run: `pnpm typecheck && pnpm test:nowatch tests/site`

Expected: the type check exits 0; PASS, 25 files, 417 tests.

- [ ] **Step 5: Commit**

```bash
git add demo/index.html demo/src/playground/workbench.ts demo/src/engine/session.ts
git commit -F - <<'EOF'
Demo: the hero fits narrow phones, and two small fixes

With device emulation, the showcase's hero was 368 px wide on 320 and 360 px screens, so the page scrolled sideways: the install command, a nowrap flex item, reports its whole text as its minimum width even with min-w-0; w-0 lets it shrink and scroll inside its box. The workbench now resets a new trace's baseline before it sets the hidden tabs' counts, and Scenario.sse.local says which scenarios may set it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 5: Retire the old demo

**Files:**
- Delete: `demo/examples/` (9 pages), `tests/demo/` (7 files)
- Modify: `docs/sse-adapter.md`, `docs/websocket-adapter.md` (links to the playground)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new

- [ ] **Step 1: Delete the old pages and their tests**

Run:

```bash
git rm -r -q demo/examples tests/demo
```

- [ ] **Step 2: Link the playground from the adapter docs**

In `docs/sse-adapter.md`, replace:

```markdown
- [Types](#types)

There's also an [interactive demo](../demo/examples/sse-demo.html) that runs in the browser without a server.

## Installation
```

with:

```markdown
- [Types](#types)

Try it in the [playground](https://jcfigueiredo.github.io/evem/playground/#/sse/stream-routing), against a server that runs in the page: [Stream & routing](https://jcfigueiredo.github.io/evem/playground/#/sse/stream-routing), [Reconnect & resume](https://jcfigueiredo.github.io/evem/playground/#/sse/reconnect-resume) and [Failures](https://jcfigueiredo.github.io/evem/playground/#/sse/failures).

## Installation
```

In `docs/websocket-adapter.md`, replace:

```markdown

Server-to-client routing is covered in more depth in [Server Events](websocket-server-events.md), which also includes a matching Node.js server and a React example.

The [Server-Sent Events adapter](sse-adapter.md) routes incoming messages with the same rules, so a server's `{ "event": …, "data": … }` messages become the same `server.*` events over either connection.
```

with:

```markdown

Server-to-client routing is covered in more depth in [Server Events](websocket-server-events.md), which also includes a matching Node.js server and a React example.

Try it in the [playground](https://jcfigueiredo.github.io/evem/playground/#/websocket/connection-queue), against a server that runs in the page: [Connection & offline queue](https://jcfigueiredo.github.io/evem/playground/#/websocket/connection-queue), [Request–response](https://jcfigueiredo.github.io/evem/playground/#/websocket/requests), [Server events & routing](https://jcfigueiredo.github.io/evem/playground/#/websocket/server-events) and a [chat client](https://jcfigueiredo.github.io/evem/playground/#/recipes/chat).

The [Server-Sent Events adapter](sse-adapter.md) routes incoming messages with the same rules, so a server's `{ "event": …, "data": … }` messages become the same `server.*` events over either connection.
```

- [ ] **Step 3: Check nothing else points at them**

Run: `git grep -n 'demo/examples\|tests/demo\|sse-demo' -- . ':!docs/superpowers' ':!docs/demo-revamp-design.md' ':!docs/sse-adapter-design.md' ':!CHANGELOG.md' ':!CLAUDE.md' || echo 'nothing points at them'`

Expected: `nothing points at them` (only the excluded design notes, the 0.3.0 changelog and CLAUDE.md, which Task 6 updates, still mention them).

- [ ] **Step 4: Run all the tests**

Run: `pnpm test:nowatch`

Expected: PASS, 67 files, 1,014 tests (2 skipped); the old demo's 7 test files are gone. Errors logged by tests that throw on purpose are expected.

- [ ] **Step 5: Commit**

```bash
git add docs/sse-adapter.md docs/websocket-adapter.md
git commit -F - <<'EOF'
Demo: retire the old demo pages

The pages in demo/examples/ (with their inline EvEm copies, and the tests in tests/demo/ that checked those copies and their code samples) have counterparts in the playground for every feature, built on the real library and tested through its scenarios. They go; the adapter docs link the playground's WebSocket and SSE scenarios instead of the old SSE page. (CLAUDE.md and the design doc follow in the docs commit; the design notes and the 0.3.0 changelog keep their history.)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```

---

### Task 6: Docs, and everything CI runs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/demo-revamp-design.md`

**Interfaces:**
- Consumes: everything above
- Produces: nothing new

- [ ] **Step 1: Update the docs**

CLAUDE.md says the revamp is done and drops the old demo (its tests, its pages, the formatting note); the design doc marks phase 5 done, records its reviewed scope, and its Follow-ups table is empty.

In `CLAUDE.md`, delete:

```markdown
- `tests/demo/`: tests for the old demo pages in `demo/examples/` (until phase 5), which embed their own simplified `EvEm` copies: the copies must dispatch, match wildcards and apply transforms like the library, and the pages' "View Code" samples may only use the real API (`demoPages.ts` extracts both from the HTML)
```

In `CLAUDE.md`, replace:

```markdown
Being rebuilt in phases (`docs/demo-revamp-design.md`; phases 2 (the foundation), 3 (the playground: 3a core scenarios, 3b flow control, 3c WebSocket, SSE and Recipes) 4a (the showcase's hero and features), the UX pass (code beside output) 4b-1 (the adapter cards, Why EvEm, the footer) and 4b-2 (the playground's follow-ups) are done; 0.3.0's release and phase 5, the cleanup, are next). A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a scroll tour: the hero, the feature sections, the adapter cards, Why EvEm and the footer) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

with:

```markdown
Rebuilt in phases (`docs/demo-revamp-design.md`: 1, the examples audit; 2, the foundation; 3, the playground; 4, the showcase, with a UX pass after 4a; 5, the cleanup), all done; the design doc's Follow-ups table lists what's left. A two-page Vite site (`demo/vite.config.ts`, root `demo/`): the showcase (`index.html`, a scroll tour: the hero, the feature sections, the adapter cards, Why EvEm and the footer) and the playground (`playground/index.html`). Dev dependencies only: Vite 8, Tailwind 4 with daisyUI 5, CodeMirror 6, Fontsource; Vitest 1.0 keeps its own Vite 5.
```

In `CLAUDE.md`, delete:

```markdown
- **The old demo**: the pages in `demo/examples/` (with their inline `EvEm` copies, checked by `tests/demo/`) stay until phase 5; they aren't part of the build
```

In `CLAUDE.md`, replace:

```markdown
- **Formatting**: run `pnpm format` before committing (`.prettierrc`: single quotes, 120 columns, no trailing commas); `pnpm check` and CI fail on unformatted code. Markdown and the old demo pages in `demo/examples/` aren't formatted (the `tests/demo/` tests read code out of them). Formatting-only commits go in `.git-blame-ignore-revs`
```

with:

```markdown
- **Formatting**: run `pnpm format` before committing (`.prettierrc`: single quotes, 120 columns, no trailing commas); `pnpm check` and CI fail on unformatted code. Markdown isn't formatted. Formatting-only commits go in `.git-blame-ignore-revs`
```

In `docs/demo-revamp-design.md`, replace:

```markdown
> **Status: phases 1 (examples audit), 2 (foundation), 3 (playground: 3a core scenarios, 3b flow control, 3c-1 WebSocket and Recipes, 3c-2 SSE and the local server switch), 4 (showcase: 4a navbar, hero, features; 4b-1 adapter cards, Why EvEm, footer, metadata; 4b-2 the playground's follow-ups) and the UX pass after 4a implemented; the 0.3.0 release and phase 5 not started.** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

with:

```markdown
> **Status: all five phases implemented: 1 (examples audit), 2 (foundation), 3 (playground), 4 (showcase, with a UX pass after 4a) and 5 (cleanup).** This document replaces the demo suite in `demo/` with a local playground and a public showcase that run the real library, and makes every published code sample correct. It's built in five phases, each with its own implementation plan and pull request. Sections 1–6 were agreed one by one; [Phase 5](#phase-5-cleanup) was written straight into this document and is open for review here.
```

In `docs/demo-revamp-design.md`, replace:

```markdown
Findings that reviews deferred, with the phase that takes each. A follow-up leaves this list with the pull request that fixes it.
```

with:

```markdown
Findings that reviews deferred, with the phase that takes each. A follow-up leaves this list with the pull request that fixes it. None are open: phase 5 closed the last of them.
```

In `docs/demo-revamp-design.md`, delete:

```markdown
| Note, 2026-10-03 | The site runs the library from source (its footer and the playground's sidebar now say which version and commit), and the package isn't on npm yet though the hero says `npm install`: release 0.3.0 (`pnpm release 0.3.0 --dry-run` first, then the user's OK) | after 4b |
| Phase 2 review | Check narrow layouts below 513 px, with device emulation | 5 |
| 4b-2 review | After *Drop the stream*, an adapter card announces the drop but not the resume a few seconds later (it announces once per click): announce connection changes too, or keep the window and leave out the stream's own ticks | 5 |
| 4b-2 review | The workbench sets a hidden tab's count before it resets `seen` for a new trace; harmless while setups are synchronous, but move the reset above the counts | 5 |
| 4b-2 review | CLAUDE.md's demo status line misses a comma after "the UX pass (code beside output)" | 5 |
| 3c-2 review | A write after *Go silent* vanishes without a note: the silenced stream still counts as open, and the write is dropped quietly | 5 |
| 3c-2 review | An empty send box writes empty chunks (one, or two with *Write it in two chunks*) and logs blank lines: note that there's nothing to write instead | 5 |
| 3c-2 review | The fake SSE server logs a request's path only, so an absolute URL in edited code (`https://api.example.com/events`) looks as if it reached that host: log the URL as given, as `LocalSseServer` does | 5 |
| 3c-2 review | A check whose `action` is `wait:<ms>` runs inside the bounded `settle()`, whose 50 ms slices add to the wait: deterministic today, but fragile across fake-timer upgrades. Await `wait:` steps directly | 5 |
| 3c-2 review | `Scenario.sse.local` can be set on any SSE scenario, though only one whose simulated server matches what the Python examples serve should have it: say so on the field | 5 |
```

In `docs/demo-revamp-design.md`, replace:

```markdown
> Not yet discussed section by section; review it here.
```

with:

```markdown
Reviewed with the user on 2026-10-03, against what the earlier phases had already done (the README links the showcase and the playground; CLAUDE.md describes the new demo; there's no Prettier exclusion to remove, since the format command never listed the old pages):
```

In `docs/demo-revamp-design.md`, replace:

```markdown
- Delete the old feature pages (`demo/examples/*.html`; the old index is already gone in phase 2) and the tests for their inline copies and code samples (the rest of `tests/demo/`), which phases 2–3 replace with engine and scenario tests.
- Link the site: a "Try it" section near the top of the README (showcase and playground URLs), the playground's SSE pages from `docs/sse-adapter.md` (replacing the link to `demo/examples/sse-demo.html`), and the matching pages from `docs/websocket-adapter.md`.
- Update CLAUDE.md: the demo's architecture (engine, scenarios, fakes, themes), `pnpm demo` / `pnpm demo:build`, the docs checks, and the new tests, replacing the inline-copy description.
- Remove `demo/examples/` from the Prettier exclusions (nothing left to exclude).
- CHANGELOG: the demo isn't part of the npm package (`files: ["dist"]`), so it gets no entry; library fixes from phase 1 already have theirs.
```

with:

```markdown
- **Retire the old demo:** delete the old feature pages (`demo/examples/*.html`) and the tests for their inline copies and code samples (`tests/demo/`), which the engine and scenario tests replace; link the playground's pages from `docs/sse-adapter.md` (replacing the link to `demo/examples/sse-demo.html`) and from `docs/websocket-adapter.md`; and drop the old demo from CLAUDE.md.
- **The follow-ups for phase 5:** narrow layouts with device emulation, an adapter card's connection announcements, the order of the workbench's count reset, the fake SSE server's edge cases (writes to a silenced stream, empty writes, the request URL), exact `wait:` steps in the scenario checks, and the doc comment on `Scenario.sse.local`.
- CHANGELOG: the demo isn't part of the npm package (`files: ["dist"]`), so it gets no entry.
```

- [ ] **Step 2: Run everything CI runs**

Run: `pnpm check`

Expected: exit 0: the format check, the type check, 67 test files (1,014 passed, 2 skipped) and the package check.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/demo-revamp-design.md
git commit -F - <<'EOF'
Docs: the demo revamp is done (phase 5)

The design doc marks all five phases done, records phase 5's scope as reviewed with the user, and has no open follow-ups. CLAUDE.md says the revamp is done and drops the old demo pages, their tests and the formatting note about them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QMbxjvQP7cbv3Q7dFma5cW
EOF
```
