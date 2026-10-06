# API

- `new EvEm(options?)`: Create an emitter.
  - `options.maxRecursionDepth` (default `3`): how deeply an event can re-publish itself from its own handlers. `new EvEm(5)`, the older form, sets it too.
  - `options.separator` (default `'.'`): what separates the segments of event names and patterns ([another separator](guide/events.md#another-separator)). An empty separator, or one containing `*`, throws a `TypeError`.
  - `options.events`: the declared events, from `defineEvents()`. The emitter's types are inferred from them, and so is the separator; a different `separator` throws a `TypeError`.
  - `options.devWarnings` (default `false`): with `events`, report with `console.warn`, once each, published names that aren't declared and patterns that match no declared event. Meant for development builds.
- `new EvEm<AppEvents>(options?)`: An emitter with a [typed event map](guide/typed-events.md). Names and payloads are checked, and wildcard subscribers get the union of the matching payloads. When the map declares a separator (`[SEPARATOR]: ':'`), `options.separator` is required and must match.
- `separator: string`: The emitter's separator (read-only)
- `addKnownEvents(names: readonly string[]): void`: Declare more event names for `devWarnings`. The adapters call it with their own events. It does nothing on an emitter without `events`.
- `defineEvents(definitions, { separator? })`: Declare events as a value: `defineEvents({ 'task.opened': payload<Task>() })`. Pass the result as `events`; `EventsOf<typeof definitions>` is the map's type. `payload<T>()` marks a payload type, with `payload()` for none.
- Types for maps: `Cancelable<T>` (a cancelable event), `SEPARATOR` (the key that declares a map's separator), `WithSeparator<Map, ':'>` (an adapter's map with another separator), `EventsOf`, `PayloadOf`, `MatchingNames` and `EventNames`
- `subscribe<T = unknown, R = any>(event: string, callback: EventCallback<T>, options?: SubscriptionOptions<T, R>): string`
  - Returns the subscription id. `event` can be a [wildcard pattern](guide/events.md#using-wildcards-in-event-subscription)
  - `options.schema`: A validator, `(data) => boolean` or `(data) => { valid, errors? }` (sync or async), checked before the filters and callback
  - `options.schemaErrorPolicy`: What to do when validation fails (default: `ErrorPolicy.CANCEL_ON_ERROR`, which logs and skips this subscriber only)
  - `options.filter`: A predicate function or array of predicates (sync or async); all must pass for the callback to run
  - `options.throttleTime`: Milliseconds; handle the first event, then drop events until the window ends
  - `options.debounceTime`: Milliseconds; handle only the last event, once none has arrived for this long
  - `options.once`: When true, unsubscribes just before the callback runs for the first time
  - `options.priority`: `'high'` (100), `'normal'` (0), `'low'` (-100), a number or a `Priority` value; higher runs first (default: 0)
  - `options.transform`: `(data: T) => R | Promise<R>`, run after this subscriber's callback; its result is what the following subscribers receive
  - `options.replayLastEvent`: When true and history is enabled, call the callback with the most recent matching event from history when you subscribe
  - `options.replayHistory`: When true and history is enabled, call the callback with every matching event from history when you subscribe, oldest first
- `subscribeOnce<T = unknown, R = any>(event: string, callback: EventCallback<T>, options?: Omit<SubscriptionOptions<T, R>, 'once'>): string`
- `unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void`: Remove the subscription to exactly `event` made with `callback`
- `unsubscribeById(id: string): void`
- `publish<T = unknown>(event: string, data?: T, options?: PublishOptions | number): Promise<boolean>`
  - Resolves to `true` if the event completed, `false` if it was canceled
  - Without data, subscribers receive `undefined`. A cancelable publish without data delivers `{}`, which can be canceled
  - A number in place of the options is the timeout
  - `options.timeout`: Milliseconds to wait for each async callback or transform (default: 5000)
  - `options.cancelable`: Whether handlers can cancel the event (default: false)
  - `options.errorPolicy`: How to handle errors in callbacks and transforms (default: `ErrorPolicy.LOG_AND_CONTINUE`)
  - A missing `data` is delivered as `{}`; `null` is delivered as `null`
- `use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void`: Register a middleware
  - A function processes all events
  - A `{ pattern, handler }` object processes only events matching `pattern`
  - The handler returns the (new) data, `null` to cancel, or a new `{ event, data }` object to reroute. Data returned unchanged never cancels or reroutes, so `null` data returned as it is passes through
- `removeMiddleware<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void`: Remove a middleware (the same function, or a config with the same handler and pattern)
- `info(pattern?: string): EventInfo[]`: List subscriptions (`{ event, isMiddleware: false, id, priority }`) and middleware (`{ event, isMiddleware: true, pattern }`), optionally only those matching `pattern`
- `enableHistory(maxEvents = 50): void`: Start recording events
- `disableHistory(): void`: Stop recording events (doesn't clear existing history)
- `clearEventHistory(): void`: Remove all events from history
- `getEventHistory<T = any>(pattern?: string): EventRecord<T>[]`: Get recorded events (`{ event, data, timestamp }`), optionally only those matching `pattern`
- `enableMemoryLeakDetection(options?: Partial<MemoryLeakOptions>): void`
  - `options.threshold`: Number of subscriptions to one event before warning (default: 10)
  - `options.showSubscriptionDetails`: Whether to also log the subscription details (default: true)
- `disableMemoryLeakDetection(): void`

The package also exports the `Priority` and `ErrorPolicy` enums and the types `CancelableEvent`, `EventCallback`, `EventInfo`, `EventRecord`, `FilterPredicate`, `MemoryLeakOptions`, `MiddlewareConfig`, `MiddlewareFunction`, `MiddlewareResult`, `PublishOptions`, `SchemaValidator`, `AdvancedSchemaValidator`, `SchemaValidationError`, `SubscriptionOptions`, `TransformFunction`, `PriorityLevel` and `IEventEmitter`.

`WebSocketHandler` (from `@jcfigueiredo/evem/websocket`):

- `new WebSocketHandler(urlOrSocket: string | IWebSocket, evem: EvEm, options?: WebSocketHandlerOptions)`
- `request<T = any>(method: string, params?: any, options?: { timeout?: number; id?: string }): Promise<T>`
- `isConnected(): boolean`, `getConnectionState(): string`, `getQueueSize(): number`
- `flush(): Promise<void>`: send the queued messages now (needed with `autoFlush: false`)
- `disconnect(): Promise<void>`

`SseHandler` (from `@jcfigueiredo/evem/sse`):

- `new SseHandler(url: string, evem: EvEm, options?: SseHandlerOptions)`: connects right away unless `autoConnect: false`
- `connect(): void`: start connecting (with `autoConnect: false`, or after `disconnect()` or a stop)
- `disconnect(): Promise<void>`
- `isConnected(): boolean`, `getConnectionState(): ConnectionState`, `getLastEventId(): string | undefined`

Server helpers (from `@jcfigueiredo/evem/sse/server`):

- `formatSseMessage(message: { event?, data?, id?, retry? }, options?: { raw?: boolean; envelope?: boolean }): string`
- `formatSseComment(text?: string): string`
- `SSE_HEADERS`: the response headers for an event stream
