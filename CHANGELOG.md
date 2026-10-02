# Changelog

## 0.2.0 (unreleased)

First release published to npm, as `@jcfigueiredo/evem`.

### Packaging

- Published as an ES module with TypeScript declarations, built from `src/` into `dist/`.
- Two entry points: `@jcfigueiredo/evem` (core) and `@jcfigueiredo/evem/websocket` (WebSocket adapter).
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

### Added

- `WebSocketHandler.request(method, params?, options?)` for request-response calls through the handler.
- `WebSocketHandler.flush()` to send queued messages on demand (needed with `autoFlush: false`).
- `WebSocketHandler` reconnection: the `reconnect`, `reconnectDelay` and `maxReconnectAttempts` options now work (they were accepted but ignored), with a `ws.reconnect.failed` event after the last attempt and a `WebSocketConstructor` option.
- `MessageQueue.enqueue()` to queue a message explicitly.
- `event.canceled` on cancelable events.

### Fixed

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
