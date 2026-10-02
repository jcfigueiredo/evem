# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- **Run all tests**: `pnpm test:nowatch`
- **Run single test file**: `pnpm test:nowatch tests/priority.test.ts`
- **Run specific test by name**: `pnpm test:nowatch -t "callbacks should be executed in priority order"`
- **Coverage report**: `pnpm test:coverage`
- **Watch mode tests**: `pnpm test`
- **TypeScript check**: `pnpm typecheck` (same as `pnpm tsc --noEmit`)
- **Build**: `pnpm build` (compiles `src/` to `dist/` as ES modules with `.d.ts` files, via `tsconfig.build.json`)
- **Package check**: `pnpm test:package` (builds, packs, installs the tarball into a temp project, imports every entry point from Node and type-checks a strict TypeScript consumer)

## Packaging and Releases
- Published to npm as `@jcfigueiredo/evem`: ESM only, no runtime dependencies, Node.js 20+
- Four entry points (`exports` in package.json): `.` → `src/index.ts`, `./websocket` → `src/websocket/index.ts`, `./sse` → `src/sse/index.ts`, `./sse/server` → `src/sse/server.ts`. New public exports must go through one of these files; `./sse/server` exports only the formatting helpers, so servers don't load the client
- Relative imports in `src/` must use `.js` extensions (Node ESM output); public types must not reference `NodeJS.*` (browser consumers have no Node types) — `pnpm test:package` catches both
- Releasing: bump `version` in package.json and update CHANGELOG.md, merge to main, then publish a GitHub release tagged `v<version>`. `.github/workflows/release.yml` checks the tag, runs `prepublishOnly` (typecheck, tests, package check) and publishes with provenance using the `NPM_TOKEN` secret

## Architecture

### Core Implementation
The event emitter is a single class, `EvEm`, in `src/eventEmitter.ts`, together with its public types; `src/index.ts` re-exports the public API.

- **Subscription storage**: `Map<pattern, Map<subscriptionId, CallbackInfo>>`, keyed by the event name or pattern exactly as subscribed. Lookups are not O(1): `publish` runs `isEventMatch` against every registered pattern, `unsubscribeById` scans every event, and `unsubscribe(event, callback)` scans that event's subscriptions. An event's entry is deleted when its last subscription goes.
- **IDs**: subscription (and request) ids come from `crypto.randomUUID()`.
- **Wildcards** (`isEventMatch`): `*` alone matches everything; a trailing `*` matches one or more segments; a `*` elsewhere matches exactly one; `user.*` does not match `user`.
- **`publish` pipeline**:
  1. Empty event name → rejected promise (`publish` never throws synchronously)
  2. Recursion check (`enterPublishChain`, see below)
  3. Middleware, in registration order, each filtered by its pattern against the current event name. `null` cancels (`publish` resolves `false`); a *new* object with exactly `event` (string) and `data` reroutes; any other result replaces the data. A middleware error is logged and cancels the event
  4. History record (data after middleware, before cancel support is added)
  5. Cancelable events: `addCancelSupport` adds `cancel()` and a `canceled` getter (plain objects and arrays are copied, other objects proxied, primitives left as they are)
  6. Collect subscriptions from every matching pattern; sort by priority (highest first), then subscription order (`sequence`)
  7. Per subscriber, in order, until canceled: its wrapped callback (schema → filters → throttle/debounce → once → user callback). Async results are awaited up to the publish `timeout`; a timeout is an error for `errorPolicy` (the callback keeps running). Then its transform, only if the subscriber handled the event (the wrappers return the `SKIPPED` sentinel when they don't call the callback); the result is the data for later subscribers
  8. Callback and transform errors (including timeouts) go through the publish `errorPolicy`; schema errors with `schemaErrorPolicy: THROW` (marked with `SCHEMA_THROW`) always reject. Resolves `!isCanceled`
- **Subscription wrappers**: built in `subscribe()` from the inside out (once innermost, schema outermost), so a filtered or invalid event never starts a throttle window, resets a debounce timer or consumes a `once`. Schema `CANCEL_ON_ERROR` (the default) skips only that subscriber. Debounced calls and history replay (`replayLastEvent` / `replayHistory`, run at subscribe time) go through `invokeDetached`, which logs errors since there's no publish to report them to.
- **Recursion tracking** is per publish chain, not global. `activePublishChain` (a `Map<event, depth>`) is set while a handler (callback, middleware, transform) runs synchronously, via `runInPublishChain`; a publish started there inherits it, and `enterPublishChain` throws (so that `publish` rejects) when the event's depth would exceed `maxRecursionDepth` (constructor argument, default 3). `bindToActivePublishChain` carries the chain through async filters and validators. Publishes started after a handler's own `await`, and unrelated concurrent publishes, start a fresh chain.

### Feature Layers
The implementation has distinct layers that can be composed:

1. **Core Pub/Sub**: Basic event emission with namespace/wildcard support
2. **Flow Control**: Throttling, debouncing, priority ordering
3. **Data Processing**: Filters, transforms, schema validation
4. **Middleware System**: Global event interception and modification
5. **History/Replay**: Event recording and replay for late subscribers
6. **Diagnostics**: Memory leak detection, info/debugging methods

### Key Data Structures
- `CallbackInfo`: `callback` (the user callback wrapped by its options), `originalCallback` (for `unsubscribe(event, callback)`), `priority`, `sequence` (tie-breaker for equal priorities), `transform`
- `EventRecord`: event name, data and timestamp, for history
- `CancelableEvent`: the `cancel()` / `canceled` members added to cancelable event data
- Timer maps: `debounceTimers` (keys `debounce_<event>_<id>` and `combined_<event>_<id>`) and `throttleTimers` (`throttle_<event>_<id>` → `{ timer, expiresAt }`); `removeSubscription` clears a subscription's timers
- Sentinels: `SKIPPED` (wrapper didn't call the callback), `TIMED_OUT`, `SCHEMA_THROW`

### Testing Strategy
- `tests/*.test.ts`: core tests, one file per feature (priority, middleware, schemaValidation, errorPolicy, ...)
- `tests/websocket/`: one file per adapter component plus `index.test.ts` for the entry point's exports; `mocks/MockWebSocket.ts` has a controllable socket and `createMockWebSocketConstructor()` for reconnect tests
- `tests/shared/`: `routeServerMessage` / `toServerEventName`; `ConnectionManager`'s `stateEvent` is covered in `tests/websocket/connection-manager.test.ts`
- `tests/sse/`: one file per component (`parser`, `fetch-transport`, `eventsource-transport`, `sse-handler`, and `format`, which round-trips generated strings through the parser). Helpers in `tests/sse/helpers/`: `FakeTransport` (open / send / end connections by hand), `fakeFetch.ts` (`createFakeFetch()`: responses whose body the test pushes to, closes or fails, honouring abort; `flush()`) and `MockEventSource` (`simulateOpen` / `simulateMessage` / `simulateError(readyState)`). `sse-handler` tests stub `Math.random` (0.5 means no jitter) and use fake timers for delays
- `tests/sse/integration.test.ts` runs `SseHandler` against a real `node:http` server with Node's global `fetch` (stream, server drop, resume with `Last-Event-ID`, headers and POST, 401); `tests/sse/python.test.ts` checks `examples/python/evem_sse.py` against the JS helper and parser and connects `SseHandler` to the Python example server, and is skipped when `python3` isn't installed
- `tests/demo/`: tests for the demo pages in `demo/examples/`, which embed their own simplified `EvEm` copies: the copies must dispatch, match wildcards and apply transforms like the library, and the pages' "View Code" samples may only use the real API (`demoPages.ts` extracts both from the HTML)
- Vitest with globals; common patterns: `vi.fn()` callbacks, fake or short real timers, `vi.spyOn(console, ...)` for logged errors
- Don't hard-code test counts in docs; they change with every fix

### Shared Adapter Code (`src/shared/`)

Used by both adapters, so the same server protocol produces the same events over WebSocket and SSE:
- `ConnectionManager.ts`: the connection state holder (described under the WebSocket adapter), with a `stateEvent` option: `'ws.connection.state'` by default, `'sse.connection.state'` for SSE. `src/websocket/ConnectionManager.ts` re-exports it so the old path keeps working; both `./websocket` and `./sse` export it
- `routing.ts`: `toServerEventName(name, prefix)` adds the prefix unless the name already starts with `<prefix>.` (`''` keeps names as they are). `routeServerMessage(message, { prefix, channel, handleResponses })`: `{ type: 'response' }` → `<channel>.response` / `<channel>.response.error` (only with `handleResponses`, i.e. WebSocket request-response); a non-empty string `event` → `toServerEventName(event)` with `data`; else a non-empty string `type` other than `response` → the same; anything else, non-objects included → `<channel>.message` with the whole message
- `types.ts`: `ConnectionState`, `ConnectionStateChangeEvent` (re-exported by both adapters)

### WebSocket Adapter (Optional Extension)

Real-time communication patterns built on top of EvEm, in `src/websocket/` and published as `@jcfigueiredo/evem/websocket` (entry point `src/websocket/index.ts`). It uses only EvEm's public API (subscriptions and middleware); the core has no WebSocket-specific code. All components take an `EvEm` instance (composition, no subclassing).

**Components**:

1. **WebSocketHandler** (`WebSocketHandler.ts`) - the recommended entry point. `new WebSocketHandler(urlOrSocket, evem, options)` creates the three components below and wires the socket:
   - **Lifecycle**: `onopen` → `connected` (a socket that is already open starts `connected`); an unexpected `onclose` → `disconnected`, or with `reconnect: true` (and a URL, given or from `socket.url`) → `reconnecting` and a new socket (`WebSocketConstructor` or the global `WebSocket`) after `reconnectDelay`, giving up after `maxReconnectAttempts` consecutive failures (`disconnected` + `ws.reconnect.failed`); `onerror` → `ws.error` and the `onError` option. It never enters `connecting`.
   - **Outgoing**: subscriptions to `ws.send`, `ws.send.queued` and `ws.send.request` send while the socket is open (otherwise flushed messages, or messages published while the state still says `connected`, go back into the queue). Other `ws.send.*` events (e.g. `ws.send.chat`) are sent by a `ws.send.*` middleware, because subscribers don't receive the event name. Middleware order matters: request formatting (adds `type: 'request'`) → MessageQueue (queues while offline) → `ws.send.*` sender. Only the payload is sent (`messageFormatter`, default `JSON.stringify`). A message the queue middleware queued when it was published (`MessageQueue.wasQueued`) is never also sent by these senders, even if the connection opened during that publish. With `enableRequestResponse: false` there's no `ws.send.request` subscriber, so the `ws.send.*` middleware sends requests like any other event.
   - **Incoming** (`messageParser`, default `JSON.parse`), routed by `routeServerMessage` (channel `ws`): `type: 'response'` → `ws.response` / `ws.response.error`; a non-empty string `event` → `<serverEventPrefix>.<event>` (default prefix `server`, not added twice); else a non-empty string `type` → `<prefix>.<type>`; else (non-objects too) `ws.message`; parse failures → `ws.parse.error`.
   - `request(method, params?, options?)` delegates to RequestResponseManager (rejects if request-response is disabled or after `disconnect()`). `disconnect()` is async: cancels a pending reconnect, removes its subscriptions and middleware, clears and disables the queue, rejects pending requests, closes the socket, then transitions `disconnecting` → `disconnected`. `flush()` sends the queue now (the only way with `autoFlush: false`). The socket is created before anything is registered on the emitter, so a constructor that throws leaves nothing behind.

2. **ConnectionManager** (`src/shared/ConnectionManager.ts`)
   - Holds the state (`disconnected` | `connecting` | `connected` | `reconnecting` | `disconnecting`), starting `disconnected`. `transitionTo()` accepts any state (no transition validation), publishes its `stateEvent` (`ws.connection.state` here) with `{ from, to, timestamp }` and awaits it, swallowing handler errors
   - Helpers: `getState()`, `isConnected()`, `isConnecting()` (also true while reconnecting), `isDisconnected()`, `isDisconnecting()`, `isReconnecting()`

3. **MessageQueue** (`MessageQueue.ts`)
   - `enable(maxSize = 100, { autoFlush = true })` registers one handler as middleware twice, `{ pattern: 'ws.send' }` and `{ pattern: 'ws.send.*' }`, because `ws.send.*` doesn't match `ws.send`
   - The middleware queues as a side effect and returns the data unchanged; it queues only when enabled, not connected, not re-entrant (`isEnqueuing`), and the event name doesn't contain `queued`
   - FIFO with a size limit: when full, the oldest message is dropped and `ws.queue.overflow` (`{ maxSize, droppedMessage }`) published
   - `autoFlush` subscribes to `ws.connection.state` and flushes on any transition to `connected`; `flush()` publishes each payload, in order, to `ws.send.queued` (the original event name is not kept). `enqueue()` queues explicitly. `wasQueued(data)` tells whether the middleware queued a payload object on its latest publish
   - `removeMiddleware` removes a single registration (the first match), so `disable()` removes each one by `{ pattern, handler }`, plus the autoFlush subscription

4. **RequestResponseManager** (`RequestResponseManager.ts`)
   - `request(method, params?, { timeout = 5000, id })` publishes `ws.send.request` (`{ id, method, params, timestamp }`); the id is generated unless given, and a duplicate pending id rejects
   - Settled by `ws.response` (resolves with `result`) and `ws.response.error` (rejects with an `Error` carrying `code` and `data`); `RequestTimeoutError` on timeout
   - `cleanup()` unsubscribes and rejects pending requests

**Events**:
- `ws.connection.state` - state changes `{ from, to, timestamp }`
- `ws.send` - outgoing message (exact name)
- `ws.send.<name>` (e.g. `ws.send.chat`) - outgoing message; queued and sent like `ws.send`
- `ws.send.request` - outgoing RPC request
- `ws.send.queued` - message flushed from the queue
- `ws.queue.overflow` - queue full, oldest message dropped
- `ws.response` / `ws.response.error` - incoming RPC responses
- `server.<event>` - incoming server events (prefix set by `serverEventPrefix`)
- `ws.message` - incoming message with neither `event` nor `type`
- `ws.parse.error` - `{ error, rawData }` for messages the parser rejects
- `ws.error` - socket errors (and sockets that can't be created when reconnecting)
- `ws.reconnect.failed` - `{ attempts }` after the last reconnection attempt

**Type definitions** (`types.ts`): `IWebSocket` (browser `WebSocket` and Node.js `ws`; its optional `url` is used to reconnect), `ConnectionState`, message and option types, error classes. `WebSocketEvents` maps each event the adapter publishes to its payload type; keep it in sync when adding events. `ConnectionError`, `QueueOverflowError` and `WebSocketAdapterOptions` are exported but unused.

### SSE Adapter (Optional Extension)

A receive-only Server-Sent Events client in `src/sse/`, published as `@jcfigueiredo/evem/sse` (entry point `src/sse/index.ts`), plus `@jcfigueiredo/evem/sse/server` (`src/sse/server.ts`, re-exporting `format.ts` only). User docs: `docs/sse-adapter.md`; design and decisions: `docs/sse-adapter-design.md`. It uses only `evem.publish` and registers nothing on the emitter (no subscriptions or middleware). No dependencies: `fetch`, `ReadableStream`, `TextDecoder`, `AbortController`.

**Components**:

1. **SseHandler** (`SseHandler.ts`) - the public entry point, `new SseHandler(url, evem, options)`; connects in the constructor unless `autoConnect: false`
   - `createTransport()` picks `'fetch'` (default), `'eventsource'` or a custom `SseTransport`, and throws `TypeError` for options the transport can't honour: `headers` / `method` / `body` / `fetch` / non-zero `heartbeatTimeout` with `'eventsource'`; `EventSourceConstructor` / `eventTypes` / `lastEventIdParam` with `'fetch'`; any of those (except `heartbeatTimeout`) or `withCredentials` with a custom transport. It also throws for setups that could never connect: no `EventSource` for `'eventsource'`, no `fetch` or a URL `new URL(url, location?.href)` can't resolve (relative URLs outside browsers) for `'fetch'`
   - **Connection loop**: `connect()` (a no-op while `active`) resets `attempts` and runs `openConnection(++generation)`: `transitionTo('connecting')` (awaited) → `transport.connect()` → `handleEnd()`. Listener callbacks, timers and the loop all check their `generation`, and `disconnect()` increments it (then clears timers, aborts and goes `disconnecting` → `disconnected` unless already `disconnected`), so a stale connection's events, end and reconnect timer are ignored
   - **`handleEnd`**: an `aborted` end that reaches it (`disconnect()` changes the generation first) becomes `heartbeat-timeout` if `heartbeatExpired`, else `ended` (a custom transport ending on its own). Every end except `ended` / `no-content` publishes `sse.error` `{ error, reason, status?, contentType? }` (not awaited) and calls `onError`. `onError` and `shouldReconnect` are called through wrappers that log what they throw (a throwing `shouldReconnect` falls back to the default). Then: `reconnect: false` or `shouldReconnect` (default: the exported `defaultShouldReconnect`, yes for `ended`, `network-error`, `failed`, `heartbeat-timeout` and HTTP 408 / 429 / 5xx) says no → `stop()` (`disconnected`, `active = false`); `attempts >= maxReconnectAttempts` (default `Infinity`) → stop + `sse.reconnect.failed` `{ attempts }`; else `attempts++` and the reconnect timer is scheduled *before* announcing `reconnecting`, so a `disconnect()` from a state subscriber cancels it
   - **Delays** (`delayFor`): base = the server's last `retry:` (`serverRetry`, kept for the handler's lifetime) or `reconnectDelay` (3000); with `backoff`, `min(maxReconnectDelay, base * 2^(attempts-1)) * (0.8 + random * 0.4)` (jitter after the cap); at least `retryAfter` for HTTP errors; at most `MAX_TIMEOUT` (2^31 − 1 ms, setTimeout's limit; the heartbeat is clamped too). `listener.open()` resets `attempts` to 0
   - **Heartbeat** (`heartbeatTimeout`, default 0 = off): `resetHeartbeat()` before `transport.connect()` (so a request that never gets a response times out), on `open()` and on every `activity()`; on expiry it sets `heartbeatExpired` and calls `transport.abort()`
   - **Events** (`handleEvent`): sets `lastEventId` (`''` → `undefined`), parses with `parseData` (`'json'` default, `'text'` or a function), then routes: a named event (type other than `message`) → `toServerEventName(type, prefix)`; an unnamed one → `routeServerMessage(data, { channel: 'sse', handleResponses: false })`, or `sse.message` with `unwrapEnvelope: false`. `rawEvents` publishes `sse.event` first; parse failures publish `sse.parse.error` and call `onError`. Publishes go through `publishSafely` (rejections are logged, never unhandled). With `sequential`, they're chained on `publishChain` and the chain is returned to the transport, which the fetch transport awaits before reading on (backpressure)
   - The native EventSource's own retries arrive as `listener.reconnecting()` → `reconnecting` (no attempt counted, no `sse.error`); its next `open()` → `connected`
2. **Transports** - the `SseTransport` contract (`types.ts`): `connect(request, listener)` opens one connection and resolves with an `SseCloseInfo` when it ends (`ended`, `no-content`, `http-error` with `status` / `retryAfter` ms, `bad-content-type`, `network-error`, `failed`, `aborted`; `heartbeat-timeout` comes only from the handler); it never reconnects. `abort()` makes it resolve `aborted`. The listener has `open`, `event` (may return a promise), `retry`, `activity` and the optional `lastEventId` (a message with an `id:` but no data, reported by the parser's `onLastEventId`; the fetch transport delivers it in order with the events) and `reconnecting`
   - **FetchSseTransport** (`FetchSseTransport.ts`, the default): sends `Accept: text/event-stream`, the `headers` (a function is awaited per attempt; a throw becomes `network-error`), `Last-Event-ID`, `method` / `body`, and `credentials` (`include` with `withCredentials`, else `same-origin`), with an `AbortController`. Calls `fetch` as a plain function (browsers throw "Illegal invocation" otherwise). 204 → `no-content`; any other non-200 → `http-error` with `Retry-After` (seconds or an HTTP date); a content type other than `text/event-stream` (parameters allowed) → `bad-content-type`. Then `open()`, and the body is decoded with a streaming `TextDecoder` into an `SseParser` seeded with the request's last event id; `activity()` per chunk, and each event's `listener.event()` is awaited before the next read
   - **EventSourceSseTransport** (`EventSourceSseTransport.ts`): wraps the global or injected `EventSource`; `onmessage` plus `addEventListener` for each `eventTypes` entry; an `error` with `readyState === CLOSED` → `failed`, otherwise `reconnecting()`. The last event id goes in a query parameter (`lastEventIdParam`, default `lastEventId`, inserted before any `#fragment`); no implementation → `network-error`. It never reports `retry` and can't pause
3. **SseParser** (`SseParser.ts`) - the WHATWG "event stream interpretation" algorithm, with no I/O: `feed(text)` in chunks of any size and `end()`, which discards an unterminated event. CRLF, CR and LF line endings, with a CR at the end of a chunk remembered (`skipLeadingLineFeed`) so the next chunk's LF isn't read as a blank line; a BOM is skipped only at the very start; `:` lines → `onComment`; fields split at the first colon with one leading space stripped; `data` lines joined with `\n`; an `id` containing NUL is ignored, and the id persists across events (an empty `id` clears it); `retry` only if all ASCII digits; a blank line dispatches `{ type: eventType || 'message', data, lastEventId }`, or nothing when there's no data (then `onLastEventId` if the id changed since the last dispatch)
4. **Server helpers** (`format.ts`, exported by `server.ts`): `formatSseMessage({ event, data, id, retry }, { raw, envelope })`: data JSON-encoded (strings too) unless `raw` and a string, one `data:` line per line; a named event without data gets `data: null`; `envelope` writes an unnamed `{ event, data }`; throws `TypeError` for line breaks in `event` / `id`, NUL in `id` or `envelope` without `event`, and `RangeError` for a `retry` that isn't a non-negative safe integer. `formatSseComment(text)` and the frozen `SSE_HEADERS`. Pure, so they run in any runtime. `examples/python/evem_sse.py` is the Python port and must keep producing the same output

**Events**:
- `sse.connection.state` - state changes `{ from, to, timestamp }`; `connecting` on every attempt (unlike `WebSocketHandler`)
- `server.<event>` - named events and unnamed `{ event, data }` / `{ type, data }` envelopes (prefix set by `serverEventPrefix`)
- `sse.message` - unnamed events that aren't envelopes
- `sse.event` - every event with `{ type, data, rawData, lastEventId }` (only with `rawEvents`)
- `sse.parse.error` - `{ error, rawData, eventType, lastEventId }` when `parseData` throws
- `sse.error` - `{ error, reason, status?, contentType? }` for connections that failed or ended badly
- `sse.reconnect.failed` - `{ attempts }` when `maxReconnectAttempts` is reached

**Type definitions** (`types.ts`): the transport contract (`SseTransport`, `SseTransportListener`, `SseConnectRequest`, `SseCloseInfo`), `SseHeaders`, `SseBody`, and `SseEvents`, which maps each event the adapter publishes to its payload type; keep it in sync when adding events.

## Code Style Guidelines
- **Imports**: Use named imports; sort imports alphabetically
- **Types**: Strong typing with TS; use interfaces for public APIs and types for internal structures
- **Naming**: camelCase for variables/methods; PascalCase for classes/interfaces; UPPERCASE for constants
- **Error Handling**: Use specific error messages; handle async errors with try/catch; use Promise rejection for async failures
- **Documentation**: JSDoc comments for public APIs
- **Testing**: TDD approach - write tests first to validate simple designs

## Development Approach
- No runtime dependencies (subscription and request IDs come from `generateId()` in `src/id.ts`: `crypto.randomUUID()`, or `crypto.getRandomValues()` where browsers don't expose it outside secure contexts)
- Focus on performance with Map-based lookups and efficient iteration
- Maintain backward compatibility when adding features; record behavior changes in CHANGELOG.md
- Each feature should be independently testable and composable