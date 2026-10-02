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
- **Package check**: `pnpm test:package` (builds, packs, installs the tarball into a temp project, imports both entry points from Node and type-checks a strict TypeScript consumer)

## Packaging and Releases
- Published to npm as `@jcfigueiredo/evem`: ESM only, no runtime dependencies, Node.js 20+
- Two entry points (`exports` in package.json): `.` → `src/index.ts`, `./websocket` → `src/websocket/index.ts`. New public exports must go through one of these index files
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
- `tests/demo/`: tests for the demo pages in `demo/examples/`, which embed their own simplified `EvEm` copies: the copies must dispatch, match wildcards and apply transforms like the library, and the pages' "View Code" samples may only use the real API (`demoPages.ts` extracts both from the HTML)
- Vitest with globals; common patterns: `vi.fn()` callbacks, fake or short real timers, `vi.spyOn(console, ...)` for logged errors
- Don't hard-code test counts in docs; they change with every fix

### WebSocket Adapter (Optional Extension)

Real-time communication patterns built on top of EvEm, in `src/websocket/` and published as `@jcfigueiredo/evem/websocket` (entry point `src/websocket/index.ts`). It uses only EvEm's public API (subscriptions and middleware); the core has no WebSocket-specific code. All components take an `EvEm` instance (composition, no subclassing).

**Components**:

1. **WebSocketHandler** (`WebSocketHandler.ts`) - the recommended entry point. `new WebSocketHandler(urlOrSocket, evem, options)` creates the three components below and wires the socket:
   - **Lifecycle**: `onopen` → `connected` (a socket that is already open starts `connected`); an unexpected `onclose` → `disconnected`, or with `reconnect: true` (and a URL, given or from `socket.url`) → `reconnecting` and a new socket (`WebSocketConstructor` or the global `WebSocket`) after `reconnectDelay`, giving up after `maxReconnectAttempts` consecutive failures (`disconnected` + `ws.reconnect.failed`); `onerror` → `ws.error` and the `onError` option. It never enters `connecting`.
   - **Outgoing**: subscriptions to `ws.send`, `ws.send.queued` and `ws.send.request` send while the socket is open (otherwise flushed messages, or messages published while the state still says `connected`, go back into the queue). Other `ws.send.*` events (e.g. `ws.send.chat`) are sent by a `ws.send.*` middleware, because subscribers don't receive the event name. Middleware order matters: request formatting (adds `type: 'request'`) → MessageQueue (queues while offline) → `ws.send.*` sender. Only the payload is sent (`messageFormatter`, default `JSON.stringify`).
   - **Incoming** (`messageParser`, default `JSON.parse`): `type: 'response'` → `ws.response` / `ws.response.error`; an `event` field → `<serverEventPrefix>.<event>` (default prefix `server`, not added twice); else a `type` field → `<prefix>.<type>`; else `ws.message`; parse failures → `ws.parse.error`.
   - `request(method, params?, options?)` delegates to RequestResponseManager (rejects if request-response is disabled or after `disconnect()`). `disconnect()` is async: cancels a pending reconnect, removes its subscriptions and middleware, clears and disables the queue, rejects pending requests, closes the socket, then transitions `disconnecting` → `disconnected`.

2. **ConnectionManager** (`ConnectionManager.ts`)
   - Holds the state (`disconnected` | `connecting` | `connected` | `reconnecting` | `disconnecting`), starting `disconnected`. `transitionTo()` accepts any state (no transition validation), publishes `ws.connection.state` with `{ from, to, timestamp }` and awaits it, swallowing handler errors
   - Helpers: `getState()`, `isConnected()`, `isConnecting()` (also true while reconnecting), `isDisconnected()`, `isDisconnecting()`, `isReconnecting()`

3. **MessageQueue** (`MessageQueue.ts`)
   - `enable(maxSize = 100, { autoFlush = true })` registers one handler as middleware twice, `{ pattern: 'ws.send' }` and `{ pattern: 'ws.send.*' }`, because `ws.send.*` doesn't match `ws.send`
   - The middleware queues as a side effect and returns the data unchanged; it queues only when enabled, not connected, not re-entrant (`isEnqueuing`), and the event name doesn't contain `queued`
   - FIFO with a size limit: when full, the oldest message is dropped and `ws.queue.overflow` (`{ maxSize, droppedMessage }`) published
   - `autoFlush` subscribes to `ws.connection.state` and flushes on any transition to `connected`; `flush()` publishes each payload, in order, to `ws.send.queued` (the original event name is not kept). `enqueue()` queues explicitly
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

**Type definitions** (`types.ts`): `IWebSocket` (browser `WebSocket` and Node.js `ws`; its optional `url` is used to reconnect), `ConnectionState`, message and option types, error classes. The `WebSocketEvents` interface is out of date (it lists `ws.connection.open/close/error`, `ws.receive` and `ws.queued`, which are never published, and omits several events above); `ConnectionError`, `QueueOverflowError` and `WebSocketAdapterOptions` are exported but unused.

## Code Style Guidelines
- **Imports**: Use named imports; sort imports alphabetically
- **Types**: Strong typing with TS; use interfaces for public APIs and types for internal structures
- **Naming**: camelCase for variables/methods; PascalCase for classes/interfaces; UPPERCASE for constants
- **Error Handling**: Use specific error messages; handle async errors with try/catch; use Promise rejection for async failures
- **Documentation**: JSDoc comments for public APIs
- **Testing**: TDD approach - write tests first to validate simple designs

## Development Approach
- No runtime dependencies (subscription and request IDs come from `crypto.randomUUID()`)
- Focus on performance with Map-based lookups and efficient iteration
- Maintain backward compatibility when adding features; record behavior changes in CHANGELOG.md
- Each feature should be independently testable and composable