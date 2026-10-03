# Changelog

## 0.3.0 (unreleased)

First release published to npm, as `@jcfigueiredo/evem`. Version 0.2.0 was never published; its changes are included here. Behavior changes are relative to 0.1.0, the previous version in this repository.

### Packaging

- Published as an ES module with TypeScript declarations, built from `src/` into `dist/`.
- Four entry points: `@jcfigueiredo/evem` (core), `@jcfigueiredo/evem/websocket` (WebSocket adapter), `@jcfigueiredo/evem/sse` (Server-Sent Events client) and `@jcfigueiredo/evem/sse/server` (helpers for SSE servers, without the client).
- No runtime dependencies: `uuid` was replaced by the built-in Web Crypto API (`crypto.randomUUID()`, falling back to `crypto.getRandomValues()` on plain-HTTP pages, where browsers don't provide `randomUUID`). Requires Node.js 20+ or a modern browser.
- `EventRecord` and `MemoryLeakOptions` are now exported.

### Behavior changes to check when upgrading

- **Middleware rerouting**: a middleware result reroutes the event only if it is a *new* object with exactly two properties, `event` (a string) and `data`. Returning the data unchanged, or a copy with extra properties, no longer reroutes — previously any result with `event` and `data` fields did, which broke payloads like `{ event: 'chat.send', data }` sent over `ws.send`.
- **Recursion limit**: counts publishes of the same event started from inside its own handlers (callbacks, middleware, transforms). Independent concurrent publishes of the same event are no longer limited; previously a 4th overlapping publish was rejected as "recursion".
- **Subscription pipeline order**: schema validation → filters → throttle/debounce → once → callback. Events rejected by a filter or schema no longer start a throttle window or cancel a pending debounced call.
- **`once`**: unsubscribes before the callback runs (previously after an async callback settled), so it fires exactly once even under concurrent publishes or `replayHistory`.
- **Errors in debounced callbacks and history replay** are logged instead of being thrown from timers or becoming unhandled rejections.
- **Schema validation**: errors thrown by the handler itself now go through the publish `errorPolicy` (they were treated as schema errors and swallowed or retried). With `schemaErrorPolicy: THROW`, the error keeps the validator's own `validationErrors`. An async validator that rejects is handled by `schemaErrorPolicy`, like a sync validator that throws.
- **Cancelable events**: arrays stay arrays and class instances (Date, Map, …) keep their type; primitives are delivered unchanged (without `cancel`). Plain objects are copied as before. Handlers can read `event.canceled`, and `cancel()` still works after an earlier subscriber's transform.
- **Timeouts**: an async callback or transform that exceeds the publish `timeout` is now handled by the publish `errorPolicy` (logged by default, rejects with `THROW`, cancels with `CANCEL_ON_ERROR`). It used to pass silently, and a timed-out transform passed `undefined` to the next subscriber. The timed-out function itself keeps running; it can't be stopped.
- **`schemaErrorPolicy: THROW`** rejects `publish` (and stops propagation) on its own; before, it only did so if the publish `errorPolicy` was also `THROW`. Schema errors are now recognised by a marker, not by their message text.
- **Transforms** apply only when their subscriber handled the event: not when its filter or schema rejected the event, while it's throttled, for debounced calls, or after a `once` subscriber has fired.
- **History** records the data subscribers receive (after middleware). `enableHistory(0)` keeps nothing, and re-enabling with a smaller limit trims existing history.
- **Equal priorities** run in subscription order, also across different patterns.
- **`publish(event, null)`** delivers `null`; only a missing payload becomes `{}`.
- **`WebSocketHandler.disconnect()`** returns a promise and moves the state through `disconnecting` to `disconnected` (it used to stay `connected`).
- **`ws.send.request` payloads** include `type: 'request'` when a `WebSocketHandler` is attached, so requests queued while offline are sent in request format.
- **`ws.send.*` events** (e.g. `ws.send.chat`) are sent by `WebSocketHandler` while connected, like `ws.send`; before, they were only sent after being queued offline. If you forwarded them to the socket yourself, remove that code.
- **`RequestResponseManager.request()`** rejects immediately if a request with the same custom id is still pending.
- **Incoming WebSocket messages whose `event` or `type` isn't a non-empty string** (e.g. `{"event": 42}`) go to `ws.message`. Before, a non-string `event` was published as `ws.parse.error`, and a non-string `type` as `server.<value>`.

### Added

- **Server-Sent Events adapter** (`@jcfigueiredo/evem/sse`, see `docs/sse-adapter.md`):
  - `SseHandler` connects to an SSE endpoint and publishes server events as `server.<name>`, routed by the same code as `WebSocketHandler` (named events, `{ event, data }` envelopes and the legacy `{ type, data }`). It also publishes `sse.connection.state`, `sse.message`, `sse.error`, `sse.parse.error`, `sse.reconnect.failed`, and `sse.event` with `rawEvents`.
  - Reconnection by default, with exponential backoff and jitter, the server's `retry:`, `Retry-After`, and per-status defaults (stop on `204` and most `4xx`, retry on `408`, `429`, `5xx` and network errors) that `shouldReconnect` can override, deferring the rest to the exported `defaultShouldReconnect`. Resuming with `Last-Event-ID`, an optional heartbeat timeout, and `sequential` handling with backpressure.
  - Headers (an object, or a function called before every attempt), `method` and `body`, so streams can use token auth and POST.
  - Transports: `FetchSseTransport` (the default; browsers and Node.js 20+), `EventSourceSseTransport` (the native `EventSource`), or your own `SseTransport`.
  - `SseParser`, a spec-compliant `text/event-stream` parser with no I/O, and `SseEvents`, which maps the adapter's events to their payload types.
- **SSE server helpers** (`@jcfigueiredo/evem/sse/server`): `formatSseMessage` (JSON data by default, `raw` and `envelope` options, and validation that rules out forged or corrupt events), `formatSseComment` for heartbeats, and `SSE_HEADERS`.
- **Python reference helper**: `examples/python/evem_sse.py`, a standard-library-only module to copy into Python servers, which writes the same output as `formatSseMessage`. `docs/sse-python.md` has standard-library, FastAPI and Flask examples. When `python3` is installed, the tests check the helper against `SseParser` and connect `SseHandler` to a Python server.
- **SSE demo page**: `demo/examples/sse-demo.html`.
- `ConnectionManager` takes a `stateEvent` option (default `'ws.connection.state'`), so both adapters can use it. It's also exported from `@jcfigueiredo/evem/sse`; imports from `@jcfigueiredo/evem/websocket` are unchanged.
- `WebSocketHandler.request(method, params?, options?)` for request-response calls through the handler.
- `WebSocketHandler.flush()` to send queued messages on demand (needed with `autoFlush: false`).
- `WebSocketHandler` reconnection: the `reconnect`, `reconnectDelay` and `maxReconnectAttempts` options now work (they were accepted but ignored), with a `ws.reconnect.failed` event after the last attempt and a `WebSocketConstructor` option.
- `MessageQueue.enqueue()` to queue a message explicitly.
- `event.canceled` on cancelable events.

### Fixed

- **`WebSocketHandler` with Node.js 22's built-in `WebSocket`**: a refused connection attempt fires only `error` there, never `close`, so with `reconnect: true` the handler didn't retry, stayed in `reconnecting` and never published `ws.reconnect.failed`. An error on a socket that isn't open now counts as the failed attempt: whichever of `error` and `close` comes first counts, once per attempt, and the handler keeps listening, so sockets that reconnect by themselves (`close` then `error`, then `open` again) are still followed.
- **`WebSocketHandler.disconnect()`** (and replacing a socket while reconnecting) no longer crashes Node.js with a `ws` socket that's still connecting: `ws` emits an error after `close()`, and throws it when nothing listens. Sockets the handler lets go of now keep a no-op error listener.
- **`ws.connection.state`** is no longer published as `disconnected` → `disconnected` when a socket that never opened closes without `reconnect`.
- **Memory-leak warning details** list the subscriptions the warning counted (those to that exact event name or pattern). They used to list every subscription whose name matched it, and to count middleware in the total.
- `unsubscribe(event, callback)` now removes subscriptions created with options (filter, once, throttle, debounce, schema) and cancels their pending timers.
- Removing an event's last subscription frees its entry, so dynamic event names no longer accumulate.
- `WebSocketEvents` lists the events the adapter actually publishes (`ws.error`, `ws.message`, `ws.parse.error`, `ws.queue.overflow`, `ws.send.queued`, …) with their payloads; it listed events that were never published.
- `WebSocketHandler`: a message queued while offline is no longer sent twice when the connection opens while its publish is still running; with `enableRequestResponse: false`, `ws.send.request` is sent like other `ws.send.*` events (it was only sent after being queued); a constructor that can't create its socket no longer leaves middleware and subscriptions behind; an incoming message that is valid JSON but not an object (e.g. `null`) goes to `ws.message` instead of `ws.parse.error`.
- A legacy `{ type: 'server.x' }` message is routed to `server.x`, like `{ event: 'server.x' }`, instead of `server.server.x`.
- `WebSocketHandler`: an already-open socket starts `connected`; messages the socket can't take (closing, or dropped mid-flush) go back into the queue; `disconnect()` removes all of its subscriptions; an empty `serverEventPrefix` no longer routes to `.name`.
- `MessageQueue.disable()` and `RequestResponseManager.cleanup()` now remove their subscriptions and middleware.
- `RequestResponseManager`: an error response without details rejects instead of hanging forever.
- Demo pages: inline emitter copies no longer fire exact subscriptions twice, follow the library's wildcard and transform rules, and their code samples use the real API.
- `pnpm tsc --noEmit` passes.
