# SSE Adapter Design

> **Status: approved, phase 1 in progress.** This document describes the Server-Sent Events (SSE) adapter for EvEm. The decisions marked **(decision)** were agreed as recommended; see [Decisions](#decisions). Once implemented, user documentation lives in [sse-adapter.md](sse-adapter.md).

## Summary

A new optional entry point, `@jcfigueiredo/evem/sse`, with an `SseHandler` that connects to an SSE endpoint and publishes what the server sends as EvEm events, the same way `WebSocketHandler` does for WebSockets:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();
const sse = new SseHandler('/api/events', evem, {
  headers: () => ({ Authorization: `Bearer ${getToken()}` }), // evaluated on every (re)connect
});

evem.subscribe<Order>('server.order.updated', order => render(order));
evem.subscribe('sse.connection.state', ({ to }: { to: string }) => showStatus(to));

// later
await sse.disconnect();
```

Server events arrive under the same `server.*` names as with `WebSocketHandler`. An app can switch between SSE and WebSocket, or use SSE for updates and WebSocket elsewhere, without changing its subscriptions.

## Goals

- **Receive server events into EvEm** with the routing rules `WebSocketHandler` already uses (`serverEventPrefix`, the `{ event, data }` envelope).
- **Work where SSE is used in practice:**
  - in browsers and in Node.js 20+;
  - with auth headers, which the native `EventSource` can't send;
  - behind proxies that silently drop idle connections.
- **Be robust by default:** reconnect automatically, resume with `Last-Event-ID`, honour the server's `retry:`, and back off on errors.
- **Follow the project's constraints:**
  - no runtime dependencies;
  - ESM, Node 20+;
  - no changes to the EvEm core (the adapter uses only the public API);
  - every component testable on its own;
  - a separate entry point, so it adds nothing for apps that don't import it.

## Non-goals (phase 1)

- **Sending to the server.** SSE is one-way; apps send with `fetch`. An optional upstream channel (POST + request/response over SSE) is sketched in [Phase 2](#phase-2-upstream-and-rpc).
- **Pausing streams while a browser tab is hidden.** This can be added later as an option.
- **An offline queue.** There's nothing to queue when only receiving.
- **A common `RealtimeHandler` abstraction over WebSocket and SSE.** See [Alternatives considered](#alternatives-considered).

## SSE in one page (what the design has to handle)

The wire format is UTF-8 text (`Content-Type: text/event-stream`). Events are separated by a blank line, and each line is a `field: value` pair:

```text
: comments start with a colon (servers use them as heartbeats)
retry: 5000
id: 42
event: order.updated
data: {"id":7,"status":"shipped"}

data: unnamed events have the type "message"
data: and a data value can span several lines

```

- **Fields:**
  - `event`: the event type; `message` when absent.
  - `data`: one or more lines, joined with `\n`.
  - `id`: sets the last event ID.
  - `retry`: the reconnection delay in ms. Other fields are ignored.
- **Resuming:** on reconnect the client sends `Last-Event-ID: <last id>`, so the server can replay what was missed.
- **HTTP status:** `204 No Content` means "stop, don't reconnect". Any other non-200 status, or a wrong content type, fails the connection.
- **The native `EventSource`:**
  - GET only, with no custom headers (cookies via `withCredentials` only);
  - auto-reconnects with a fixed delay;
  - **only delivers named events you `addEventListener` for by name.** `onmessage` receives just the unnamed `message` events, so there's no "listen to every event type".
  - Node.js 20 has no `EventSource` at all.

Those native limitations drive the main decision: the default transport is **built on `fetch`**, with the native `EventSource` as an option.

## Architecture

```text
            ┌──────────────────────── SseHandler ────────────────────────┐
 server ──▶ │ transport ──▶ SseParser ──▶ routing ──▶ evem.publish(...)   │
            │ (fetch | EventSource)        (shared with WebSocketHandler) │
            │        ▲                                                    │
            │        └── reconnect / backoff / heartbeat ── ConnectionManager (shared)
            └────────────────────────────────────────────────────────────┘
```

| Component | File | Responsibility |
|-----------|------|----------------|
| `SseParser` | `src/sse/SseParser.ts` | Pure, spec-compliant parser for the event stream (no I/O). It takes text chunks and emits `{ type, data, lastEventId }` events plus `retry` values. |
| `FetchSseTransport` (default) | `src/sse/FetchSseTransport.ts` | Makes one HTTP request with `fetch` and an `AbortController`, checks the status and content type, and streams the body through `TextDecoder` into `SseParser`. Reports `open`, `event`, `retry`, `close` (with the reason) and `error`. |
| `EventSourceSseTransport` | `src/sse/EventSourceSseTransport.ts` | Wraps a native (or polyfilled) `EventSource`. Listens to `message` and to the configured `eventTypes`. |
| `SseHandler` | `src/sse/SseHandler.ts` | Owns the transport, reconnection, backoff, heartbeat, `Last-Event-ID` and routing, and publishes `sse.*` and `server.*` events. This is the public entry point. |
| `formatSseMessage` | `src/sse/format.ts` | Small server-side helper that writes the wire format correctly. Isomorphic, with no Node APIs. |
| `ConnectionManager` | `src/shared/ConnectionManager.ts` (moved) | The state holder already used by the WebSocket adapter. It gains a `stateEvent` option: `'ws.connection.state'` by default, `'sse.connection.state'` for SSE. |
| `routeServerMessage` | `src/shared/routing.ts` (extracted) | Today's incoming-message routing, extracted from `WebSocketHandler` so both adapters route identically. |

The transport interface keeps `SseHandler` independent of the transport, and lets tests use a fake:

```typescript
interface SseTransport {
  /** Open one connection. Resolves when the stream ends; never reconnects by itself. */
  connect(request: SseConnectRequest, listener: SseTransportListener): Promise<SseCloseInfo>;
  /** Abort the current connection (used by disconnect() and the heartbeat timeout). */
  abort(): void;
}

interface SseConnectRequest {
  url: string;
  lastEventId?: string;          // sent as the Last-Event-ID header (fetch) or query parameter (EventSource)
}

interface SseTransportListener {
  open(): void;
  event(event: { type: string; data: string; lastEventId: string }): void;
  retry(milliseconds: number): void;
  activity(): void;              // any bytes received, comments included (for the heartbeat timeout)
}

type SseCloseInfo =
  | { reason: 'ended' }                                       // stream finished normally
  | { reason: 'no-content' }                                  // HTTP 204: server says stop
  | { reason: 'http-error'; status: number; retryAfter?: number }
  | { reason: 'bad-content-type'; contentType: string | null }
  | { reason: 'network-error'; error: Error }
  | { reason: 'aborted' };                                    // abort() was called
```

Reconnection lives in `SseHandler`, not in the transports, so that both transports behave the same and it can be tested once. The one exception is the native `EventSource`'s own automatic reconnects. The adapter mirrors those as `reconnecting` → `connected` and takes over only when the browser gives up (see [Lifecycle](#lifecycle-and-reconnection)).

### SseParser

This implements the WHATWG "event stream interpretation" algorithm exactly. It's a class with `feed(chunk: string)` and `end()`, with callbacks for events and `retry`:

- **Decoding:** the byte stream is decoded with `TextDecoder('utf-8')` in streaming mode by the transport, and a leading BOM is skipped.
- **Line endings:** lines end with `\r\n`, `\n` or `\r`.
  - **Pitfall:** a `\r` at the end of one chunk followed by a `\n` at the start of the next is *one* line ending. The parser remembers the trailing `\r`. Without this, the stray `\n` reads as a blank line and dispatches a spurious event.
- **Comments:** a line starting with `:` is a comment and is ignored, but still counts as activity.
- **Fields:** `field: value` splits at the first colon and strips one leading space from the value. A line with no colon is a field with an empty value.
  - `event` sets the event type buffer.
  - `data` appends the value plus `\n`.
  - `id` sets the last-event-ID buffer, unless the value contains NULL.
  - `retry` is used only if it's all ASCII digits.
  - Anything else is ignored.
- **Blank line (dispatch):**
  1. Copy the last-event-ID buffer to `lastEventId`.
  2. If the data buffer is empty, reset and emit nothing.
  3. Otherwise strip the final `\n` and emit `{ type: eventType || 'message', data, lastEventId }`.
  4. Reset the data and type buffers. The ID buffer persists.
- **`end()`:** discards an incomplete event, as the spec requires.

It's about 100 lines and is tested with the spec's examples plus chunk-boundary cases.

## Routing: SSE messages → EvEm events

| SSE message | EvEm event | Payload |
|-------------|------------|---------|
| `event: order.updated` + `data: {"id":7}` | `server.order.updated` (prefix not added twice) | parsed data `{ id: 7 }` |
| unnamed (`message`) + `data: {"event":"order.updated","data":{"id":7}}` | `server.order.updated` (envelope, same as WebSocket) | `{ id: 7 }` |
| unnamed + `data: {"type":"order.updated","data":…}` (legacy) | `server.order.updated` | `data` |
| unnamed + any other data | `sse.message` | parsed data |
| data that fails `parseData` | `sse.parse.error` | `{ error, rawData, eventType, lastEventId }` |

- **Named events win:** if an event has a name, its data is not inspected for an envelope.
- **`serverEventPrefix`** (default `'server'`): `''` publishes under the server's own names. Same rule as `WebSocketHandler.toServerEventName`.
- **`parseData`** **(decision)** defaults to `'json'`, with failures going to `sse.parse.error`, as `messageParser` does for WebSocket. The other choices:
  - `'text'` delivers the string;
  - a function `(data, eventType) => unknown` decides per event, e.g. JSON for some types and text for others.

  An "auto" mode (JSON if it parses, otherwise text) was rejected: a payload like `"42"` would silently change type.
- **Envelope unwrapping** (`unwrapEnvelope`, default `true`) applies only to unnamed events. That keeps one server protocol working over both transports.
- **Shared code:** the envelope and prefix logic is the extracted `routeServerMessage`, so WebSocket and SSE can't drift apart. `WebSocketHandler` will use it unchanged; its existing tests guard the refactor.
- **Payloads only:** subscribers receive only the payload, as with WebSocket. For the metadata, `rawEvents: true` also publishes `sse.event` for every message with `{ type, data, rawData, lastEventId }`. `getLastEventId()` returns the current ID, e.g. to persist it across page loads.

## Lifecycle and reconnection

States reuse `ConnectionState` and are published as `sse.connection.state` (`{ from, to, timestamp }`):

```text
disconnected ──connect()──▶ connecting ──open──▶ connected
     ▲                          │                    │
     │            stop condition│                    │ stream ended / error / heartbeat timeout
     │                          ▼                    ▼
     └──────────── (no retry) ◀────── reconnecting ◀─┘ (retry allowed: wait, then connecting again)
disconnect() from any state: disconnecting ──▶ disconnected
```

Unlike `WebSocketHandler`, which never enters `connecting`, `SseHandler` reports `connecting` on every attempt. (`WebSocketHandler` could be aligned later; that would be a behavior change.)

### What happens when a connection ends (fetch transport)

| Outcome | Default | Published |
|---------|---------|-----------|
| `200` + `text/event-stream`, stream running | `connected` | — |
| Stream ended by the server, network error, or heartbeat timeout | reconnect | `sse.error` (except for a normal end) |
| `204 No Content` | stop: the server asked the client not to reconnect | state → `disconnected` |
| `200` with another content type | stop (as the spec says) | `sse.error` `{ error, contentType }` |
| `401`, `403`, `404` and other `4xx` | stop: retrying won't help, and hammering an auth endpoint is harmful | `sse.error` `{ error, status }` |
| `408`, `429`, `5xx` | reconnect, honouring `Retry-After` | `sse.error` `{ error, status }` |
| `maxReconnectAttempts` consecutive failures | stop | `sse.reconnect.failed` `{ attempts }` |

**Overriding the defaults:** `shouldReconnect(info) => boolean` replaces the defaults. For example, on a `401` it can refresh a token and return `true`. Because `headers` is a function evaluated on each attempt, the next request carries the new token.

**Delays (decision):**
- The base delay is the server's `retry:` if it sent one, else `reconnectDelay` (default 3000 ms, the common browser default).
- Consecutive failures back off exponentially with full jitter, up to `maxReconnectDelay` (default 30 s). This avoids every client reconnecting at once after an outage.
- The attempt count resets once a connection reaches `connected`.
- `backoff: false` gives the spec's fixed delay.
- `maxReconnectAttempts` defaults to `Infinity`, matching `EventSource`. This differs from `WebSocketHandler`'s default of 5 on purpose: SSE streams are expected to live forever.

**`Last-Event-ID`:** the fetch transport sends it on every reconnect with the last ID seen. It can be seeded with the `lastEventId` option to resume after a page reload.

**Heartbeat:** `heartbeatTimeout` (default `0`, off). If no bytes arrive, comments included, within that many milliseconds, the connection is treated as dead: it's aborted and reconnected. This needs a server that sends a comment such as `: ping` regularly, and catches proxies that silently stop forwarding. Fetch transport only.

### EventSource transport specifics

- **Event names:** `eventTypes: string[]` lists the named events to listen for, because `EventSource` can't listen to all of them. Envelope-format messages, which are unnamed, need no listing. The docs will say so prominently and recommend the envelope or the fetch transport.
- **Browser reconnects:** the browser reconnects by itself. An `error` with `readyState === CONNECTING` is mirrored as `reconnecting`, and the next `open` as `connected`.
- **When the browser gives up:** an `error` with `readyState === CLOSED` (e.g. a non-200 status) hands control to the handler's policy, which creates a new `EventSource` after the backoff.
  - A new `EventSource` can't set `Last-Event-ID`. The ID is passed as a query parameter instead (`lastEventIdParam`, default `'lastEventId'`); servers that want to resume read either.
- **Not available with this transport:** `headers`, `method`, `body` and `heartbeatTimeout`. Passing them throws a clear error at construction instead of being silently ignored.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `transport` | `'fetch'` | `'fetch'`, `'eventsource'`, or a custom `SseTransport` (for tests or special environments). **(decision)** |
| `headers` | none | Object, or a (sync or async) function called on each connection attempt. Fetch only. |
| `method` / `body` | `'GET'` / none | For endpoints that open a stream with a POST (common for LLM/streaming APIs). `body` can be a function. Fetch only. |
| `withCredentials` | `false` | Send cookies cross-origin (`credentials: 'include'` / `EventSource` `withCredentials`). |
| `fetch` | global `fetch` | Inject an implementation (tests, custom agents). |
| `EventSourceConstructor` | global `EventSource` | For `'eventsource'` in Node (e.g. the `eventsource` package), mirroring `WebSocketConstructor`. |
| `eventTypes` | `[]` | Named events to listen for. EventSource only. |
| `lastEventId` | none | Initial ID to resume from. |
| `lastEventIdParam` | `'lastEventId'` | Query parameter for handler-created `EventSource` reconnects. |
| `reconnect` | `true` | Reconnect after the connection ends (see the table above). |
| `reconnectDelay` | `3000` | Base delay in ms; the server's `retry:` replaces it. |
| `maxReconnectDelay` | `30000` | Backoff cap in ms. |
| `backoff` | `true` | Exponential backoff with jitter; `false` uses a fixed delay. |
| `maxReconnectAttempts` | `Infinity` | Consecutive failed attempts before giving up. |
| `shouldReconnect` | see table | `(info: SseCloseInfo & { attempts: number }) => boolean`. |
| `heartbeatTimeout` | `0` | Treat the connection as dead after this many ms without bytes. Fetch only. |
| `serverEventPrefix` | `'server'` | Same as `WebSocketHandler`. |
| `parseData` | `'json'` | `'json'`, `'text'`, or `(data, eventType) => unknown`. |
| `unwrapEnvelope` | `true` | Route unnamed `{ event, data }` messages to `server.<event>`. |
| `rawEvents` | `false` | Also publish `sse.event` with the metadata for every message. |
| `sequential` | `false` | Await each publish before handling the next message (see [Ordering](#ordering-and-backpressure)). |
| `autoConnect` | `true` | Connect in the constructor; with `false`, call `connect()`. |
| `onError` | none | Called with every error that is also published as `sse.error` / `sse.parse.error`. |

## Methods

| Method | Description |
|--------|-------------|
| `connect(): void` | Start connecting: needed with `autoConnect: false`, or to reconnect after `disconnect()`. |
| `disconnect(): Promise<void>` | Abort the connection, cancel any pending reconnect, transition `disconnecting` → `disconnected`. Removes nothing from the emitter except what it registered (it registers no subscriptions or middleware in phase 1). |
| `isConnected(): boolean` / `getConnectionState(): ConnectionState` | Same as `WebSocketHandler`. |
| `getLastEventId(): string \| undefined` | The last event ID received, e.g. to persist for resuming. |

## Events reference

| Event | Payload | When |
|-------|---------|------|
| `sse.connection.state` | `{ from, to, timestamp }` | Every state change. |
| `server.<name>` | parsed data | A named event, or an unnamed event with an `{ event, data }` envelope. |
| `sse.message` | parsed data | An unnamed event without an envelope. |
| `sse.event` | `{ type, data, rawData, lastEventId }` | Every message, only with `rawEvents: true`. |
| `sse.parse.error` | `{ error, rawData, eventType, lastEventId }` | `parseData` threw. |
| `sse.error` | `{ error, status?, contentType? }` | A connection error. |
| `sse.reconnect.failed` | `{ attempts }` | `maxReconnectAttempts` reached. |

`SseEvents` in `src/sse/types.ts` maps these to payload types, like `WebSocketEvents`.

## Ordering and backpressure

By default each message is published without waiting for its subscribers, so two messages' async handlers can overlap. That's the same as `WebSocketHandler`, and the core no longer treats concurrent publishes as recursion.

With `sequential: true`, the handler awaits each `publish` before dispatching the next message, so messages are handled strictly in order:
- **Fetch transport:** reading also pauses, which gives real backpressure (TCP flow control slows the server).
- **EventSource transport:** messages are buffered in an internal promise chain, because a native `EventSource` can't be paused.

## Server-side helper

Writing the wire format by hand is error-prone, and some of the mistakes are security bugs:

- **Forged events:** user content containing a blank line ends the event early, and following lines such as `event: admin.alert` are then read as a second, forged event.
- **Corrupt fields:** a line break in `event` or `id`, a NUL in `id`, or a non-integer `retry` corrupts the stream or is silently ignored by clients.
- **Delayed events:** an event without its terminating blank line is held by the client until the next event arrives.
- **Lost events:** an event without `data` is never dispatched.

A separate entry point, `@jcfigueiredo/evem/sse/server`, exports pure functions (no I/O, usable in Node, Deno, Bun or edge runtimes) so server code doesn't load the client:

```typescript
formatSseMessage(
  message: { event?: string; data?: unknown; id?: string | number; retry?: number },
  options?: { raw?: boolean; envelope?: boolean }
): string
formatSseComment(text?: string): string   // ": ping\n\n" for heartbeats
SSE_HEADERS: Readonly<Record<string, string>>
```

- **`data`** is `JSON.stringify`-ed by default, **strings included**, matching the client's default `parseData: 'json'`. `raw: true` writes a string as text, one `data:` line per line (for `parseData: 'text'` clients). Omitted data is written as `data: null`, so signal-only events still dispatch.
- **`envelope: true`** writes an unnamed message carrying `{ event, data }`. Clients using the native `EventSource` then receive every event without listing `eventTypes`.
- **Validation:** line breaks in `event` or `id`, NUL in `id`, and a `retry` that isn't a non-negative integer throw. Every result ends with the blank line that dispatches the event.
- **`SSE_HEADERS`** is `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` (stops nginx buffering). It deliberately omits `Connection: keep-alive`, which HTTP/2 servers reject.

```typescript
import { formatSseComment, formatSseMessage, SSE_HEADERS } from '@jcfigueiredo/evem/sse/server';

response.writeHead(200, SSE_HEADERS);
response.write(formatSseMessage({ event: 'order.updated', id: seq, data: order }));
setInterval(() => response.write(formatSseComment('ping')), 15_000);
```

A `createSseStream()` helper for `Request`/`Response`-style servers was considered and dropped.

### Python servers

The main server is expected to be Python, so Python is documented on equal footing:

- **Reference implementation:** `examples/python/evem_sse.py` mirrors the JS helper exactly (`format_sse_message`, `format_sse_comment`, `SSE_HEADERS`, same defaults and validation). It's a single stdlib-only file to copy into a project, not a published package.
- **Examples:** a runnable stdlib server (`examples/python/server.py`, also used by the tests) with resume via `Last-Event-ID` and heartbeats, plus FastAPI/Starlette (`StreamingResponse`) and Flask (streamed response) examples in the docs.
- **Tested across languages:** an integration test starts the Python server and connects `SseHandler` to it, and the Python helper's output goes through the round-trip test against `SseParser`. These tests are skipped when `python3` isn't installed.

## Packaging

- **New entry points:** add `"./sse"` and `"./sse/server"` to `exports` in package.json.
  - `src/sse/index.ts` exports `SseHandler`, the transports, `SseParser`, `ConnectionManager` and the types.
  - `src/sse/server.ts` exports `formatSseMessage`, `formatSseComment` and `SSE_HEADERS` only.
- **No dependencies:** only `fetch`, `ReadableStream`, `TextDecoder` and `AbortController`, all built into Node 20+ and modern browsers.
- **`scripts/check-package.mjs`:** gains the two entry points. It imports them from Node and type-checks a consumer that uses them.
- **Version:** 0.3.0, with CHANGELOG entries. The `ConnectionManager` move and the routing extraction are internal, so the `./websocket` exports stay identical.

## Testing plan

- **`tests/sse/parser.test.ts`:**
  - the spec's examples;
  - multi-line data, comments, `id` with NULL, non-digit `retry`, BOM;
  - every chunk boundary (feeding the same stream one character at a time must give the same events);
  - `\r\n` split across chunks;
  - an incomplete final event discarded.
- **`tests/sse/fetch-transport.test.ts`:** a fake `fetch` returning a `ReadableStream` the test controls (enqueue chunks, close, error). Covers:
  - status and content-type outcomes;
  - the `Last-Event-ID` header;
  - function headers called per attempt;
  - abort.
- **`tests/sse/eventsource-transport.test.ts`:** a `MockEventSource` like `MockWebSocket`. Covers:
  - named-event listeners;
  - the `readyState` handling;
  - the `lastEventIdParam` on re-creation.
- **`tests/sse/sse-handler.test.ts`:** a fake transport. Covers:
  - the routing table;
  - every state transition;
  - backoff and `retry:` (fake timers);
  - `shouldReconnect`, `maxReconnectAttempts`, the heartbeat timeout;
  - `sequential`, `rawEvents`;
  - `disconnect()` during connecting, connected and a pending reconnect;
  - nothing left registered on the emitter.
- **`tests/sse/format.test.ts`:** round trip `formatSseMessage` → `SseParser`.
- **Integration:** one test against a real `http` server on localhost, using the fetch transport and Node's global `fetch`: stream, server restart, resume with `Last-Event-ID`.
- **Shared refactor:** the existing WebSocket tests must pass unchanged after `routeServerMessage` and `ConnectionManager` move.
- **Package check:** covers the new entry point.

## Phase 2: upstream and RPC

These are sketched to make sure phase 1 doesn't block them. They're not part of the first release.

- **`SseHandler.send(path, payload)`** POSTs JSON with the same `headers` and `withCredentials`, publishing `sse.send` / `sse.send.error`. Optionally it's backed by the existing `MessageQueue` for offline queueing. That requires `MessageQueue` to take its event names as options, the same generalization as `ConnectionManager`.
- **Request/response over SSE + POST:**
  1. `request(method, params)` POSTs `{ type: 'request', id, method, params }`.
  2. The server answers asynchronously on the stream with `{ type: 'response', id, result | error }`.
  3. `routeServerMessage` already recognises that shape and publishes `sse.response` / `sse.response.error`.
  4. A `RequestResponseManager` generalized with an event prefix correlates the ids.

  This is the pattern used for long-running jobs, where the POST returns `202` and the result streams later.

## Alternatives considered

- **Native `EventSource` only.** This is the smallest option, but it has no auth headers, no POST, can't receive arbitrary event names, and doesn't work in Node 20. It's kept as an option, not as the default.
- **A third-party parser** (e.g. `eventsource-parser`) **or client** (`@microsoft/fetch-event-source`). Both are well tested, but they break the zero-dependency rule. The parser is small and specified precisely.
- **A generic `RealtimeHandler`** over WebSocket and SSE. Rejected: their capabilities differ too much (bidirectional vs. one-way, a queue vs. none, RPC vs. none), and a shared interface would be lowest-common-denominator. Sharing the routing and the connection state gives the consistency that matters (the same `server.*` events and state model) without a forced abstraction.
- **SSE behind `WebSocketHandler`** via a fake `IWebSocket`. Rejected: `send()` has nothing to map to, and the reconnection semantics differ.

## Decisions

All agreed as recommended:

1. **Default transport:** `fetch`; the native `EventSource` is an option.
2. **Reconnect defaults:** reconnect forever, with exponential backoff and jitter from 3 s up to 30 s, and the server's `retry:` as the base.
3. **Status handling:** stop on `204` and on `4xx` other than 408 and 429; retry on `5xx`, `408`, `429` and network errors. Overridable with `shouldReconnect`.
4. **`parseData` default:** strict `'json'`, failures published as `sse.parse.error`.
5. **Phase 1 scope:** receive-only plus the server helper; phase 2's upstream/RPC later.
6. **Reuse after `disconnect()`:** `connect()` may be called again.
7. **Shared code:** `ConnectionManager` and the routing move to `src/shared/`.
8. **Server helper:** a separate `./sse/server` entry point and the `envelope` option; no `createSseStream()`. Python is documented and tested alongside JS.
9. **Demo:** an SSE page in `demo/examples/`, like the other demos.

## Implementation plan

1. **Shared refactor (no behavior change):**
   - move `ConnectionManager` to `src/shared/` with a `stateEvent` option;
   - extract `routeServerMessage` from `WebSocketHandler`;
   - all existing tests pass.
2. **`SseParser`**, plus its tests (TDD against the spec).
3. **Fetch transport**, with the fake-`fetch` stream helper and its tests.
4. **`SseHandler`:** routing, lifecycle, reconnection, heartbeat, `sequential`, `rawEvents`, and its tests.
5. **EventSource transport:** `MockEventSource` and its tests.
6. **`formatSseMessage` / `formatSseComment`** and the round-trip tests.
7. **Packaging:**
   - the `./sse` entry point;
   - the package check;
   - a localhost integration test;
   - `docs/sse-adapter.md`, a README section, CLAUDE.md and the CHANGELOG (0.3.0).
8. **Python:** the reference helper, the runnable server, the FastAPI and Flask examples, and the cross-language tests.
9. **Demo:** `demo/examples/sse-demo.html` with a simulated server and a live view of the wire format, linked from the demo index and covered by `tests/demo/`.

Phase 1 is roughly the size of the WebSocket adapter: about 600–700 lines of source and a similar amount of tests.
