# Changelog

## 0.2.0 (unreleased)

First release published to npm, as `@jcfigueiredo/evem`.

### Packaging

- Published as an ES module with TypeScript declarations, built from `src/` into `dist/`.
- Two entry points: `@jcfigueiredo/evem` (core) and `@jcfigueiredo/evem/websocket` (WebSocket adapter).
- No runtime dependencies: `uuid` was replaced by the built-in `crypto.randomUUID()`. Requires Node.js 20+ or a modern browser.
- `EventRecord` and `MemoryLeakOptions` are now exported.

### Behavior changes to check when upgrading

- **Middleware rerouting**: a middleware result reroutes the event only if it is a *new* object with exactly two properties, `event` (a string) and `data`. Returning the data unchanged, or a copy with extra properties, no longer reroutes — previously any result with `event` and `data` fields did, which broke payloads like `{ event: 'chat.send', data }` sent over `ws.send`.
- **Recursion limit**: counts publishes of the same event started from inside its own handlers (callbacks, middleware, transforms). Independent concurrent publishes of the same event are no longer limited; previously a 4th overlapping publish was rejected as "recursion".
- **Subscription pipeline order**: schema validation → filters → throttle/debounce → once → callback. Events rejected by a filter or schema no longer start a throttle window or cancel a pending debounced call.
- **`once`**: unsubscribes before the callback runs (previously after an async callback settled), so it fires exactly once even under concurrent publishes or `replayHistory`.
- **Errors in debounced callbacks and history replay** are logged instead of being thrown from timers or becoming unhandled rejections.
- **Schema validation**: errors thrown by the handler itself now go through the publish `errorPolicy` (they were treated as schema errors and swallowed or retried). With `schemaErrorPolicy: THROW`, the error keeps the validator's own `validationErrors`. An async validator that rejects is handled by `schemaErrorPolicy`, like a sync validator that throws.
- **Cancelable events**: arrays stay arrays and class instances (Date, Map, …) keep their type; primitives are delivered unchanged (without `cancel`). Plain objects are copied as before. Handlers can read `event.canceled`, and `cancel()` still works after an earlier subscriber's transform.
- **Async transform timeouts** are handled by the publish `errorPolicy`; the next subscriber keeps the current data instead of receiving `undefined`.
- **History** records the data subscribers receive (after middleware). `enableHistory(0)` keeps nothing, and re-enabling with a smaller limit trims existing history.
- **Equal priorities** run in subscription order, also across different patterns.
- **`publish(event, null)`** delivers `null`; only a missing payload becomes `{}`.
- **`WebSocketHandler.disconnect()`** returns a promise and moves the state through `disconnecting` to `disconnected` (it used to stay `connected`).
- **`ws.send.request` payloads** include `type: 'request'` when a `WebSocketHandler` is attached, so requests queued while offline are sent in request format.
- **`RequestResponseManager.request()`** rejects immediately if a request with the same custom id is still pending.

### Added

- `WebSocketHandler` reconnection: the `reconnect`, `reconnectDelay` and `maxReconnectAttempts` options now work (they were accepted but ignored), with a `ws.reconnect.failed` event after the last attempt and a `WebSocketConstructor` option.
- `MessageQueue.enqueue()` to queue a message explicitly.
- `event.canceled` on cancelable events.

### Fixed

- `unsubscribe(event, callback)` now removes subscriptions created with options (filter, once, throttle, debounce, schema) and cancels their pending timers.
- Removing an event's last subscription frees its entry, so dynamic event names no longer accumulate.
- `WebSocketHandler`: an already-open socket starts `connected`; messages the socket can't take (closing, or dropped mid-flush) go back into the queue; `disconnect()` removes all of its subscriptions; an empty `serverEventPrefix` no longer routes to `.name`.
- `MessageQueue.disable()` and `RequestResponseManager.cleanup()` now remove their subscriptions and middleware.
- `RequestResponseManager`: an error response without details rejects instead of hanging forever.
- Demo pages: inline emitter copies no longer fire exact subscriptions twice, follow the library's wildcard and transform rules, and their code samples use the real API.
- `pnpm tsc --noEmit` passes.
