# Server-Sent Events Adapter

The Server-Sent Events (SSE) adapter receives a server's event stream (`text/event-stream`) into an `EvEm` instance. It's an optional entry point, `@jcfigueiredo/evem/sse`, and doesn't change the core emitter. A second entry point, `@jcfigueiredo/evem/sse/server`, has small helpers for writing the stream on the server.

Use **`SseHandler`**. It covers the whole connection:

- **Incoming:** server events become EvEm events, under the same `server.<name>` names as with the [WebSocket adapter](websocket-adapter.md).
- **Auth and POST:** it's built on `fetch` by default, so it can send headers (from a function called before every reconnect, if you like) and open a stream with a POST.
- **Reconnect:** automatic, with exponential backoff and jitter, the server's `retry:` delay, and a different response to each HTTP status (stop on `401`, retry on `503`, …).
- **Resume:** it sends `Last-Event-ID` when it reconnects, so the server can replay what was missed.
- **Dead connections:** an optional heartbeat timeout catches streams that silently stop.
- **State:** connection state changes are published as events.

SSE is one-way: the server talks, the client listens. To send something to the server, use `fetch`, or the WebSocket adapter.

> **Writing the server in Python?** See [SSE servers in Python](sse-python.md). It covers the reference helper [`evem_sse.py`](../examples/python/evem_sse.py) (`format_sse_message`, `format_sse_comment`, `SSE_HEADERS`, the same output as the JavaScript helper), FastAPI, Flask and standard-library examples, and deployment notes (proxies, buffering, timeouts). For JavaScript and TypeScript servers, see [Writing servers](#writing-servers).

- [Installation](#installation)
- [Quick start](#quick-start)
- [Choosing a transport](#choosing-a-transport)
- [Options](#options)
- [Methods](#methods)
- [Events reference](#events-reference)
- [Routing](#routing)
- [Connection lifecycle and reconnection](#connection-lifecycle-and-reconnection)
- [Resuming with Last-Event-ID](#resuming-with-last-event-id)
- [Ordering and backpressure](#ordering-and-backpressure)
- [Node.js](#nodejs)
- [Writing servers](#writing-servers)
- [Testing](#testing)
- [Using SSE and WebSocket together](#using-sse-and-websocket-together)
- [Using the parser directly](#using-the-parser-directly)
- [Types](#types)

Try it in the [playground](https://jcfigueiredo.github.io/evem/playground/#/sse/stream-routing), against a server that runs in the page: [Stream & routing](https://jcfigueiredo.github.io/evem/playground/#/sse/stream-routing), [Reconnect & resume](https://jcfigueiredo.github.io/evem/playground/#/sse/reconnect-resume) and [Failures](https://jcfigueiredo.github.io/evem/playground/#/sse/failures).

## Installation

```bash
npm install @jcfigueiredo/evem
```

There's nothing else to install. The adapter only needs `fetch`, `ReadableStream`, `TextDecoder` and `AbortController`, which modern browsers and Node.js 22+ have built in. The package is ES modules only.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse'; // the client
import { formatSseMessage, SSE_HEADERS } from '@jcfigueiredo/evem/sse/server'; // for servers
```

The server entry point doesn't load the client, so server code stays small.

## Quick start

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler, type ConnectionStateChangeEvent, type SseEvents } from '@jcfigueiredo/evem/sse';

interface Order {
  id: number;
  status: string;
}

declare function getToken(): string;
declare function render(order: Order): void;

const evem = new EvEm();

// The server sends `event: order.updated` and `data: {"id":7,...}`; it's published as 'server.order.updated'
evem.subscribe<Order>('server.order.updated', (order) => render(order));

evem.subscribe<ConnectionStateChangeEvent>('sse.connection.state', ({ from, to }) => {
  console.log(`stream: ${from} -> ${to}`); // connecting, connected, reconnecting, ...
});

evem.subscribe<SseEvents['sse.error']>('sse.error', ({ error, reason }) => {
  console.warn(`stream problem (${reason}): ${error.message}`);
});

// Created after the subscriptions, which then see its first state change (connecting)
const sse = new SseHandler('/api/events', evem, {
  // A function is called before every connection attempt, so a reconnect sends a fresh token
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
});

// When you're done: aborts the request and cancels any pending reconnect
await sse.disconnect();
```

On the wire, the server sends:

```text
event: order.updated
id: 42
data: {"id":7,"status":"shipped"}

```

- **Connecting:** the handler connects as soon as it's created, and the first `connecting` state change is published right away, so subscribe to `sse.connection.state` before creating it. Or pass `autoConnect: false` and call `sse.connect()` once you're ready.
- **Types:** callbacks receive `unknown` unless you give a type argument (`subscribe<Order>(...)`). The type argument isn't checked at runtime; use the `schema` subscription option if you need validation.
- **Payloads:** subscribers receive only the parsed data. The event's metadata (its type and id) is available with [`rawEvents`](#options).

## Choosing a transport

### fetch (the default)

The default transport makes the request with `fetch` and parses the stream itself. Use it unless you have a reason not to:

- **Headers:** it can send `Authorization` and other headers. The native `EventSource` can't send any.
- **POST:** it can open a stream with a POST and a body, as many streaming APIs (LLM completions, for example) do.
- **Every event name:** it receives every named event, without listing them.
- **HTTP status:** it sees the response status, so it can stop on `204` or `401` and retry on `503`, waiting at least as long as `Retry-After` asks.
- **Heartbeat timeout:** it can detect a stream that silently stopped.
- **Backpressure:** with `sequential: true`, it stops reading while your subscribers are busy.
- **Node.js:** it works in Node.js 22+, which has `fetch` but no `EventSource` (except behind a flag).

### EventSource (`transport: 'eventsource'`)

`transport: 'eventsource'` uses the browser's native `EventSource` (or a polyfill passed as `EventSourceConstructor`). Consider it when cookies are all the auth you need and you'd rather use the browser's own client. The browser then reconnects by itself, sending the `Last-Event-ID` header, and the handler takes over only when the browser gives up.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();
const sse = new SseHandler('/api/events', evem, {
  transport: 'eventsource',
  withCredentials: true, // cookies for a cross-origin endpoint
  eventTypes: ['order.updated', 'order.deleted'], // named events arrive only if listed
});
```

Its limits:

- **Named events must be listed.** `EventSource` can't listen to every event type, so named events (`event: order.updated`) arrive only if they're in `eventTypes`; the others are silently dropped. Unnamed messages always arrive, including [envelopes](#routing). If the server sends envelopes, nothing needs listing; `formatSseMessage(..., { envelope: true })` writes them.
- **No headers, method, body or heartbeat.** Passing `headers`, `method`, `body`, `fetch` or a non-zero `heartbeatTimeout` throws a `TypeError` when the handler is created, instead of being silently ignored.
- **No HTTP status.** When the browser gives up (any non-200 status, `204` included, or a wrong content type), the handler only learns that it failed. It reports `sse.error` with `reason: 'failed'` and reconnects with backoff, by default forever. Set `maxReconnectAttempts` or `shouldReconnect` if that's not what you want.
- **Last-Event-ID as a query parameter.** The browser sends the `Last-Event-ID` header on its own retries. An `EventSource` the handler creates (on the first connection when you pass `lastEventId`, and after the browser gave up) can't set that header, so the id goes in a query parameter instead: `/api/events?lastEventId=42`. Change the name with `lastEventIdParam`. A server that supports resuming should read both, and prefer the header when both are sent: the browser's own retries keep the URL, query parameter included (see [Writing servers](#writing-servers)).
- **`retry:` stays with the browser.** The browser uses the server's `retry:` for its own retries. The handler doesn't see it and uses `reconnectDelay` once the browser gives up.
- **No pausing.** With `sequential: true`, events wait in memory instead of slowing the server down.
- **Node.js** has no `EventSource` in version 20, and only behind the `--experimental-eventsource` flag in version 22. Pass a polyfill as `EventSourceConstructor`, or use the fetch transport.

The `eventTypes`, `EventSourceConstructor` and `lastEventIdParam` options apply only to this transport. Passing them with the fetch transport (or your own) throws a `TypeError`.

## Options

`new SseHandler(url, evem, options?)`:

| Option | Default | Description |
|--------|---------|-------------|
| `transport` | `'fetch'` | `'fetch'`, `'eventsource'`, or your own [`SseTransport`](#testing). |
| `headers` | none | Request headers: an object, or a function (sync or async) called before every connection attempt. If the function throws, that attempt fails like a network error. fetch only. |
| `method` | `'GET'` | HTTP method. fetch only. |
| `body` | none | Request body (anything `fetch` accepts), or a function (sync or async) called before every attempt. fetch only. |
| `withCredentials` | `false` | Send cookies cross-origin: `credentials: 'include'` with fetch (otherwise `'same-origin'`), or `EventSource`'s `withCredentials`. |
| `fetch` | global `fetch` | The `fetch` implementation, e.g. for tests or a custom agent. fetch only. |
| `EventSourceConstructor` | global `EventSource` | The `EventSource` class, e.g. a polyfill in Node.js. EventSource only. |
| `eventTypes` | `[]` | Named event types to listen for. EventSource only. |
| `lastEventIdParam` | `'lastEventId'` | Query parameter for the last event id when the handler creates an `EventSource`. EventSource only. |
| `lastEventId` | none | Event id to resume from on the first connection, e.g. one saved with `getLastEventId()` before a page reload. |
| `reconnect` | `true` | Reconnect when a connection ends, as `shouldReconnect` decides. With `false`, the first end is final. |
| `reconnectDelay` | `3000` | Base delay before reconnecting, in ms. A `retry:` from the server replaces it. |
| `maxReconnectDelay` | `30000` | Cap for the backed-off delay, in ms, before jitter: with `backoff`, the actual delay can be up to 20% longer. |
| `backoff` | `true` | Double the delay after each failed attempt, with ±20% jitter. With `false`, the delay is fixed and has no jitter. |
| `maxReconnectAttempts` | `Infinity` | Reconnection attempts without a successful connection before giving up and publishing `sse.reconnect.failed`. |
| `shouldReconnect` | [the defaults](#how-a-connection-ends) | `(info: SseReconnectInfo) => boolean`. Replaces the default decision of whether to reconnect. |
| `heartbeatTimeout` | `0` (off) | Reconnect if the server takes longer than this many ms to respond, or if no bytes (comments included) arrive for this long once the stream is open. Not available with the EventSource transport. |
| `readyEvent` | none | The event that shows the stream is live: its name as the server sends it (`'keepalive'`), or `(event) => boolean` on the raw event. After every (re)connection, the handler is ready once it arrives; without it, as soon as the stream opens. See [Waiting until the stream is live](#waiting-until-the-stream-is-live). |
| `pageLifecycle` | `false` | Browsers only: disconnect on `pagehide`, reconnect when the page comes back from the back/forward cache, and report connection errors 3 s late, dropping them if the page goes away meanwhile. See [The page's lifecycle](#the-pages-lifecycle). |
| `serverEventPrefix` | `'server'` | Prefix for server events (`order.updated` → `server.order.updated`). With `''`, events are published under their own names. |
| `parseData` | `'json'` | How to read each event's data: `'json'`, `'text'`, or `(data, eventType) => unknown`. Failures are published as `sse.parse.error`. |
| `unwrapEnvelope` | `true` | Publish unnamed `{ event, data }` messages as `<prefix>.<event>`. With `false`, all unnamed messages go to `sse.message`. |
| `rawEvents` | `false` | Also publish every event as `sse.event`, with its type, raw data and id. |
| `sequential` | `false` | Wait for each event's subscribers before handling the next event (see [Ordering](#ordering-and-backpressure)). |
| `autoConnect` | `true` | Connect in the constructor. With `false`, call `connect()`. |
| `onError` | none | Called with each `Error` that's also published as `sse.error` or `sse.parse.error`. If it throws, the error is logged and the handler carries on. |

With your own transport, the transport makes the request, so passing `headers`, `method`, `body`, `fetch`, `withCredentials` or an EventSource option throws a `TypeError` when the handler is created. So does a configuration that could never connect: a relative URL outside a browser with the fetch transport, or the EventSource transport without an `EventSource` implementation.

## Methods

| Method | Description |
|--------|-------------|
| `connect(): void` | Starts connecting, with a fresh attempt count. Does nothing while connecting, connected or waiting to reconnect. Use it with `autoConnect: false`, after `disconnect()`, or after the handler stopped by itself (e.g. on a `401`). |
| `disconnect(): Promise<void>` | Aborts the connection and cancels any pending reconnect or heartbeat timer. Unless the state is already `disconnected`, it moves through `disconnecting` to `disconnected`, and the promise resolves once those state changes have been handled. The handler registers no subscriptions or middleware, so there's nothing else to remove. `connect()` works again afterwards. |
| `isConnected(): boolean` | `true` while the state is `connected`. |
| `getConnectionState(): ConnectionState` | `'disconnected'`, `'connecting'`, `'connected'`, `'reconnecting'` or `'disconnecting'`. |
| `isReady(): boolean` | `true` while the stream is live: open, and with `readyEvent`, that event has arrived since it opened. `false` again while reconnecting. |
| `whenReady(timeoutMs?): Promise<boolean>` | Resolves `true` once the stream is live (at once if it is), `false` if the handler stops first, isn't running, or `timeoutMs` passes. Without a timeout it waits through reconnections. |
| `getLastEventId(): string \| undefined` | The id of the last event received (or the `lastEventId` option, until an event brings one). It's sent when reconnecting; see [Resuming](#resuming-with-last-event-id). |

## Events reference

| Event | Payload | When |
|-------|---------|------|
| `sse.connection.state` | `{ from, to, timestamp }` | On every state change (see [Lifecycle](#connection-lifecycle-and-reconnection)). |
| `sse.ready` | `{ timestamp }` | The stream is live (see [Waiting until the stream is live](#waiting-until-the-stream-is-live)), after every (re)connection. With `readyEvent`, just before that event is published. |
| `server.<name>` | the parsed data | A named event, or an unnamed `{ event, data }` envelope (see [Routing](#routing)). |
| `sse.message` | the parsed data | An unnamed event that isn't an envelope. |
| `sse.event` | `{ type, data, rawData, lastEventId }` | Only with `rawEvents: true`: every event whose data parsed, just before its routed event. `data` is the parsed data, `rawData` the text. |
| `sse.parse.error` | `{ error, rawData, eventType, lastEventId }` | `parseData` threw. Nothing else is published for that event. |
| `sse.error` | `{ error, reason, status?, contentType? }` | A connection failed or ended badly. `reason` says why (see [How a connection ends](#how-a-connection-ends)); `status` is set for HTTP errors, `contentType` for a wrong content type. |
| `sse.reconnect.failed` | `{ attempts }` | `maxReconnectAttempts` was reached. The state is now `disconnected`. |

Subscriber errors are handled by EvEm's default error policy: they're logged, and the next subscriber runs. A publish that rejects (e.g. because of a `schemaErrorPolicy: THROW` subscriber) is logged with `console.error` rather than left as an unhandled rejection, except for `sse.connection.state`: a rejected state-change publish is ignored silently, and the state change still happens.

`SseEvents` maps each of these event names to its payload type, so you can type subscribers without repeating the shapes:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import type { SseEvents } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();

evem.subscribe<SseEvents['sse.error']>('sse.error', ({ error, reason, status, contentType }) => {
  if (reason === 'http-error' && status === 401) {
    console.warn('Not signed in');
  } else if (reason === 'bad-content-type') {
    console.error(`Not an event stream (${contentType ?? 'no content type'})`);
  } else {
    console.warn(error.message);
  }
});

evem.subscribe<SseEvents['sse.reconnect.failed']>('sse.reconnect.failed', ({ attempts }) => {
  console.error(`Gave up after ${attempts} attempts`);
});
```

Server events (`server.*`) aren't in `SseEvents`, because their names come from your server.

## Routing

Every event goes through `parseData` (JSON by default) and is then published by these rules, shown for the default `serverEventPrefix: 'server'`:

| The server sends | Published as | Subscribers receive |
|------------------|--------------|---------------------|
| `event: order.updated`<br>`data: {"id":7}` | `server.order.updated` | `{ id: 7 }` |
| `event: server.order.updated`<br>`data: {"id":7}` | `server.order.updated` (the prefix isn't added twice) | `{ id: 7 }` |
| `data: {"event":"order.updated","data":{"id":7}}`<br>(unnamed: an *envelope*) | `server.order.updated` | `{ id: 7 }` |
| `data: {"type":"order.updated","data":{"id":7}}`<br>(unnamed, legacy format) | `server.order.updated` | `{ id: 7 }` |
| any other unnamed event, e.g. `data: {"ping":1}`, `data: "text"` or `data: 42` | `sse.message` | the parsed data |
| `event: order.updated`<br>`data: not json` | `sse.parse.error` | `{ error, rawData: 'not json', eventType: 'order.updated', lastEventId }` |

The rules in detail:

- **Named events win.** An event with an `event:` field is published under that name, and its data isn't checked for an envelope. `event: message` counts as unnamed: `message` is the default type.
- **Envelopes** are the same `{ event, data }` messages the WebSocket adapter routes, so one server protocol works over both. `event` must be a non-empty string; it's checked before the legacy `type`. A `{ type: 'response' }` message goes to `sse.message`, since the SSE adapter has no request-response. If `data` is missing, subscribers receive `{}`. With `unwrapEnvelope: false`, every unnamed event goes to `sse.message` as it is.
- **Prefix:** `serverEventPrefix` is added unless the name already starts with it and a dot (`serverless.deploy` still becomes `server.serverless.deploy`). With `serverEventPrefix: ''`, events are published under the server's own names; the server could then also publish names like `sse.error`.
- **`parseData: 'json'`** (the default) is strict: `data: hello` is a parse error. Send strings JSON-encoded (`data: "hello"`), which `formatSseMessage` does. An event whose data is empty (`data:` with nothing after it), a common heartbeat, is published with `null`; an event with no `data:` line at all is never dispatched, as the SSE format requires.
- **`parseData: 'text'`** delivers the data as a string. Envelopes are then never unwrapped, because a string isn't an object, so every unnamed event goes to `sse.message`.
- **A `parseData` function** receives the data and the event type, so it can parse each type differently. Whatever it throws is published as `sse.parse.error`.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();
const sse = new SseHandler('/api/events', evem, {
  // Log lines are plain text; everything else is JSON
  parseData: (data, eventType) => (eventType === 'log.line' ? data : JSON.parse(data)),
});

evem.subscribe<string>('server.log.line', (line) => console.log(line));
```

Subscribing with wildcards, filters, priorities and transforms works as for WebSocket server events; see [Server Events](websocket-server-events.md#subscribing).

## Connection lifecycle and reconnection

The handler publishes `sse.connection.state` with `{ from, to, timestamp }` on each change:

```text
new SseHandler(url, ...) or connect()  → connecting
response 200 with text/event-stream    → connected      (attempt count reset)
the connection ends (see below)
  reconnect                            → reconnecting   (waits, then → connecting again)
  stop                                 → disconnected   (connect() starts again)
  maxReconnectAttempts reached         → disconnected   + sse.reconnect.failed { attempts }
await sse.disconnect()                 → disconnecting → disconnected
```

- **`connecting` on every attempt:** unlike `WebSocketHandler`, which never uses `connecting`, `SseHandler` reports it before every request. A reconnect goes `connected` → `reconnecting` → `connecting` → `connected`.
- **The browser's own retries** (EventSource transport) appear as `reconnecting` → `connected`, without `connecting` and without `sse.error`.
- **State subscribers delay the request:** the handler waits for the `connecting` change to be handled before it sends the request.

### How a connection ends

| How it ended | `reason` | By default | `sse.error` |
|--------------|----------|------------|-------------|
| The server closed the stream | `ended` | reconnect | no |
| `204 No Content` | `no-content` | stop: the server asks the client not to reconnect | no |
| `200` that isn't `text/event-stream` | `bad-content-type` | stop | yes, with `contentType` |
| `401`, `403`, `404` and any other status not listed below | `http-error` | stop: retrying won't help, and hammering an auth endpoint does harm | yes, with `status` |
| `408`, `429` and `5xx` | `http-error` | reconnect, waiting at least as long as `Retry-After` asks | yes, with `status` |
| Network error: the request failed, the stream broke, or the `headers` / `body` function threw | `network-error` | reconnect | yes, with the original error |
| No bytes within `heartbeatTimeout` | `heartbeat-timeout` | reconnect | yes |
| The browser's `EventSource` gave up (EventSource transport) | `failed` | reconnect | yes |
| `disconnect()` | — | stop | no |

Every `sse.error` is also passed to `onError`. With `reconnect: false`, every end stops the handler, and errors are still reported.

### Reconnect delays

The delay before attempt *n* (counting from 1 since the last successful connection) is:

- **Base:** the last `retry:` value the server sent, or else `reconnectDelay` (3000 ms).
- **Backoff** (default): base × 2<sup>n−1</sup>, times a random factor between 0.8 and 1.2, and at most `maxReconnectDelay` (30 s). With the defaults that's about 3, 6, 12 and 24 seconds, then 24–36 seconds for every later attempt: the jitter is applied after the cap, so that clients which all lost the connection at once keep spreading out instead of retrying together.
- **`backoff: false`:** always the base delay, with no jitter.
- **`Retry-After`:** for an HTTP error (fetch transport), the delay is at least what the header asks for, in seconds or as an HTTP date.
- **Limit:** delays longer than `setTimeout` supports (2<sup>31</sup>−1 ms, about 24.8 days) are shortened to that.

The attempt count goes back to zero whenever a connection opens, so a server that closes each stream normally is reconnected after about the base delay every time. `maxReconnectAttempts` (default `Infinity`, as with `EventSource`) counts consecutive attempts that didn't open a stream. When it's reached, the state goes to `disconnected` and `sse.reconnect.failed` is published with `{ attempts }`. With `maxReconnectAttempts: 5`, the handler gives up when the fifth reconnection attempt in a row fails.

### Deciding when to reconnect

`shouldReconnect(info)` replaces the defaults in the table above. It receives the `SseCloseInfo` (`reason`, plus `status` and `retryAfter`, `contentType` or `error` where they apply) and `attempts`, the number of reconnection attempts made since the last successful connection. It isn't called with `reconnect: false`, and `maxReconnectAttempts` still applies when it returns `true`. The default policy is exported as `defaultShouldReconnect`, so you can change one case and leave the rest to it. If `shouldReconnect` throws, the error is logged and the default policy decides.

Because `headers` can be an async function called before every attempt, a `401` can trigger a token refresh:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { defaultShouldReconnect, SseHandler } from '@jcfigueiredo/evem/sse';

declare function getToken(): string;
declare function refreshToken(): Promise<void>;

let tokenExpired = false;

const evem = new EvEm();
const sse = new SseHandler('/api/events', evem, {
  headers: async () => {
    if (tokenExpired) {
      await refreshToken(); // if this throws, the attempt fails like a network error and is retried
      tokenExpired = false;
    }
    return { Authorization: `Bearer ${getToken()}` };
  },
  shouldReconnect: (info) => {
    if (info.reason === 'http-error' && info.status === 401) {
      tokenExpired = true;
      return info.attempts < 2; // stop if fresh tokens are refused too
    }
    return defaultShouldReconnect(info);
  },
});
```

### Heartbeat timeout

Proxies and load balancers sometimes stop forwarding a stream without closing it, and servers sometimes accept a request but never answer it. The client then waits forever. `heartbeatTimeout` catches both: if the response or, once the stream is open, the next bytes don't arrive within that many milliseconds, the handler aborts the connection, publishes `sse.error` with `reason: 'heartbeat-timeout'`, and reconnects (by default).

It needs a server that sends something regularly, even when there are no events. Comments are made for this: `formatSseComment('ping')` writes `: ping`, which clients ignore. Set the timeout to two or three times the server's interval:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();
// The server sends ": ping" every 15 seconds
const sse = new SseHandler('/api/events', evem, { heartbeatTimeout: 45_000 });
```

The timer starts with the request and restarts when the response arrives and with every chunk received. It's off by default and isn't available with the EventSource transport. A custom transport supports it if it calls `activity()`. With `sequential: true`, the time spent waiting for an event's subscribers counts too, because nothing is read meanwhile: keep the timeout well above how long they can take.

### Waiting until the stream is live

An open stream doesn't always mean events will reach you. Many servers subscribe to their source (Redis pub/sub, Postgres `LISTEN`, a message broker) after sending the response headers, and whatever is published in between is lost. If your page loads the current state and then relies on the stream for changes, load it only once the server's subscription is in place, or a change can slip between the two.

Such servers usually send an event once they're subscribed, often their first keepalive. Name it with `readyEvent`, and the handler is ready only once it arrives, after every connection and reconnection:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const loadSnapshot = async () => {
  /* fetch the current state and render it */
};

const evem = new EvEm();
// The server sends `event: keepalive` once it has subscribed to its broker, then regularly
const sse = new SseHandler('/api/events', evem, { readyEvent: 'keepalive' });

// After every (re)connection, once nothing can be missed any more
evem.subscribe('sse.ready', () => loadSnapshot());

// Or wait once, with a deadline: false if it took longer, or if the handler stopped
const live = await sse.whenReady(5_000);
```

Without `readyEvent`, the handler is ready as soon as the stream opens. `readyEvent` can also be a predicate on the raw event, e.g. `(event) => event.type === 'status' && event.data === '"live"'`. It's checked before the data is parsed, so a ready event counts even if its data doesn't parse. `sse.ready` is published just before the ready event itself.

**Plain-text keepalives.** Some servers send pings whose data isn't JSON, such as `event: keepalive` with `data: connected` (sse-starlette does). With the default `parseData: 'json'`, each one is published as `sse.parse.error`. Read that event's data as text:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();
const sse = new SseHandler('/api/events', evem, {
  readyEvent: 'keepalive',
  parseData: (data, eventType) => (eventType === 'keepalive' ? data : JSON.parse(data)),
});
```

An empty `data:` needs nothing: it's published with `null`.

### The page's lifecycle

In a browser, a stream meets three situations a server-side client never does:

- **The back/forward cache.** When the user goes back to a page, the browser can restore it as it was, connection objects included. A stream restored this way can look open while nothing arrives on it any more.
- **Leaving the page.** The browser aborts the stream as it navigates away, which looks like a dropped connection. An app that shows "connection lost" when `sse.error` arrives flashes it on every link click.
- **Open connections keep a page out of the back/forward cache** in some browsers. Closing them when the page is hidden makes the page eligible.

`pageLifecycle: true` deals with all three:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();
const sse = new SseHandler('/api/events', evem, { pageLifecycle: true, readyEvent: 'keepalive' });
```

- **On `pagehide`,** the handler disconnects, as `disconnect()` would: the state goes to `disconnected`, without `sse.error`.
- **On `pageshow` from the back/forward cache** (`event.persisted`), it reconnects if it was running when the page was hidden, sending the last event id so the server can replay what the page missed. With `readyEvent`, `sse.ready` follows once the server is live again: a good moment to refresh what the page shows. A handler you disconnected yourself stays disconnected.
- **Connection errors are reported 3 seconds late,** as `sse.error` and to `onError`, and dropped if the page is hidden meanwhile, so a navigation that aborts the stream reports nothing. Reconnecting doesn't wait for the report. A real drop is still reported, 3 seconds later.

There's no `beforeunload` listener: Firefox keeps pages that have one out of the back/forward cache. The option needs a browser page; elsewhere the constructor throws a `TypeError`. `whenReady()` calls still waiting when the page is hidden resolve `false`, as with `disconnect()`.

To resume after a full reload rather than a restore from the cache, save the last event id; see [Resuming with Last-Event-ID](#resuming-with-last-event-id).

## Resuming with Last-Event-ID

When the server gives events an `id:`, the handler remembers the id of the last event it received, and sends it with the next connection so the server can replay what the client missed:

- **fetch transport:** as the `Last-Event-ID` request header, with every request once there's an id (the first request too, if you pass the `lastEventId` option).
- **EventSource transport:** the browser sends the header on its own retries; an `EventSource` the handler creates gets it as a query parameter (`?lastEventId=42`, see [EventSource](#eventsource-transport-eventsource)).

As in the SSE specification, an id carries over to later events that don't have one, and an empty `id:` line clears it. A message with an `id:` but no `data` isn't dispatched as an event, but the handler still records its id (fetch transport; `EventSource` doesn't report it).

With the EventSource transport, the id carries over only within one browser `EventSource`. In an `EventSource` the handler creates (the first one, with the `lastEventId` option, and each one after the browser gives up), an event without an `id:` clears the last event id, so give every event an id if you rely on resuming.

To resume after a page reload, save `getLastEventId()` and pass it back as `lastEventId`:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const STORAGE_KEY = 'orders-stream:last-event-id';

const evem = new EvEm();
const sse = new SseHandler('/api/orders/stream', evem, {
  lastEventId: sessionStorage.getItem(STORAGE_KEY) ?? undefined,
});

window.addEventListener('pagehide', () => {
  const lastEventId = sse.getLastEventId();
  if (lastEventId) {
    sessionStorage.setItem(STORAGE_KEY, lastEventId);
  }
});
```

On the server, replay the events after that id. If the id is older than anything the server still has, send an event that tells the client to reload its state instead.

## Ordering and backpressure

By default, each event is published as soon as it's parsed, without waiting for its subscribers. Events are delivered in order, but the async subscribers of consecutive events can overlap. That's the same as with `WebSocketHandler`.

With `sequential: true`, the handler waits for each event's publish to finish before it handles the next event, so events are processed strictly one after the other:

- **fetch transport:** it also stops reading the response while it waits. That's real backpressure: TCP flow control slows the server down instead of the events piling up in memory.
- **EventSource transport:** `EventSource` can't be paused, so the events wait in memory.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

interface Order {
  id: number;
  status: string;
}

declare function saveOrder(order: Order): Promise<void>;

const evem = new EvEm();
const sse = new SseHandler('/api/orders/stream', evem, { sequential: true });

evem.subscribe<Order>('server.order.updated', async (order) => {
  await saveOrder(order); // the next event waits for this
});
```

Each event is published with EvEm's default publish options, so an async subscriber is awaited for up to 5 seconds. After that it's reported as a timeout (logged by default), and the next event goes ahead while the slow subscriber keeps running.

## Node.js

Node.js has a global `fetch`, so the default transport works without any setup:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();
const sse = new SseHandler('https://api.example.com/events', evem, {
  headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
  heartbeatTimeout: 60_000,
});

evem.subscribe('server.*', (data) => console.log(data));

process.on('SIGINT', async () => {
  await sse.disconnect();
  process.exit(0);
});
```

- **Use an absolute URL.** Node.js has no page to resolve `/api/events` against, so a relative URL throws a `TypeError` when the handler is created.
- **Idle streams:** Node's built-in `fetch` gives up on a response whose body has been silent for 5 minutes. The handler then reconnects (`sse.error` with `reason: 'network-error'`). A server heartbeat more often than that avoids it.
- **A custom `fetch`** (the `fetch` option) lets you use a proxy agent, other timeouts or instrumentation.
- **EventSource transport:** Node.js 22 has an `EventSource` only behind `--experimental-eventsource`. Pass a polyfill such as the [`eventsource`](https://www.npmjs.com/package/eventsource) package as `EventSourceConstructor`, or simply use the default transport. Without an implementation, creating the handler throws a `TypeError`.

## Writing servers

An SSE endpoint is an HTTP response with `Content-Type: text/event-stream` that stays open while the server writes events to it. Writing the format by hand is error-prone, and some mistakes are security bugs:

- **Forged events:** user content containing a blank line ends the event early, and the lines after it (`event: admin.alert`, …) are read as a second event.
- **Corrupt fields:** a line break in `event` or `id`, a NUL character in `id`, or a `retry` that isn't an integer corrupts the stream or is silently ignored by clients.
- **Delayed events:** an event without its terminating blank line is held by the client until the next event arrives.
- **Lost events:** an event without `data` is never dispatched.

The helpers below avoid all of these.

### Python

For Python servers, see **[SSE servers in Python](sse-python.md)**. It has a stdlib-only helper to copy into your project, [`evem_sse.py`](../examples/python/evem_sse.py), which writes exactly what the JavaScript helper writes, with the same defaults and validation:

```python
from evem_sse import SSE_HEADERS, format_sse_comment, format_sse_message

format_sse_message("order.updated", {"id": 7}, id=42)  # 'event: order.updated\nid: 42\ndata: {"id":7}\n\n'
```

The guide has FastAPI, Flask and standard-library examples, and deployment notes. The example code is in [`examples/python/`](../examples/python/).

### JavaScript and TypeScript

`@jcfigueiredo/evem/sse/server` exports three helpers. They're pure (no I/O), so they work in Node.js, Deno, Bun and edge runtimes:

```typescript
import { formatSseComment, formatSseMessage, SSE_HEADERS } from '@jcfigueiredo/evem/sse/server';

formatSseMessage({ event: 'order.updated', id: 42, data: { id: 7 } });
// 'event: order.updated\nid: 42\ndata: {"id":7}\n\n'

formatSseMessage({ event: 'order.updated', data: { id: 7 } }, { envelope: true });
// 'data: {"event":"order.updated","data":{"id":7}}\n\n'

formatSseMessage({ data: 'line one\nline two' }, { raw: true });
// 'data: line one\ndata: line two\n\n'

formatSseMessage({ retry: 5000 }); // 'retry: 5000\n\n'
formatSseComment('ping'); // ': ping\n\n'
```

**`formatSseMessage({ event?, data?, id?, retry? }, { raw?, envelope? }?)`** returns one message, ending with the blank line that dispatches it:

- **`data`** is JSON-encoded, strings included, which matches the client's default `parseData: 'json'`. Each line of the encoded data gets its own `data:` field, so content can never end the event early or add fields.
- **A named event without `data`** is written with `data: null`, so it's still dispatched (subscribers receive `null`). A message with neither `event` nor `data` writes only `id` and `retry`, and dispatches nothing.
- **`id`** can be a string or a number. **`retry`** is the client's reconnection delay in milliseconds.
- **`raw: true`** writes string data as text, one `data:` line per line, for clients with `parseData: 'text'`. Line breaks arrive as `\n`. Data that isn't a string is still JSON-encoded.
- **`envelope: true`** writes an unnamed message whose data is `{ event, data }`. Clients publish it as `server.<event>` just like a named event, but clients using the EventSource transport receive it without listing `eventTypes`. `id` and `retry` are written as usual.

**Validation:** these throw instead of writing a broken stream:

- `TypeError`: `event` or `id` contains a line break, `id` contains a NUL character, or `envelope: true` without an `event`.
- `RangeError`: `retry` isn't a non-negative integer (up to `Number.MAX_SAFE_INTEGER`; larger numbers would be written in exponent notation, which clients ignore).

**`formatSseComment(text?)`** writes a comment (`: text`, one line per line of text, `:` alone for no text). Clients ignore comments; they're for heartbeats, which keep proxies from closing idle connections and the client's `heartbeatTimeout` from firing.

**`SSE_HEADERS`** is a frozen object with the response headers:

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

`no-transform` stops proxies from compressing (and so buffering) the stream, and `X-Accel-Buffering: no` turns off nginx's response buffering. It deliberately leaves out `Connection: keep-alive`, which HTTP/2 servers reject. To add headers, copy it: `{ ...SSE_HEADERS, 'Access-Control-Allow-Origin': origin }`.

#### Example: Node.js server with resume and heartbeats

```typescript
import { createServer, type ServerResponse } from 'node:http';
import { formatSseComment, formatSseMessage, SSE_HEADERS, type SseMessage } from '@jcfigueiredo/evem/sse/server';

interface StoredEvent extends SseMessage {
  id: number;
}

const recent: StoredEvent[] = []; // the last 1000 events, kept for clients that reconnect
const clients = new Set<ServerResponse>();
let nextId = 1;

export function broadcast(event: string, data: unknown): void {
  const stored: StoredEvent = { id: nextId++, event, data };
  recent.push(stored);
  if (recent.length > 1000) recent.shift();

  const message = formatSseMessage(stored);
  for (const client of clients) client.write(message);
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== '/events') {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, SSE_HEADERS);
  response.write(formatSseMessage({ retry: 5000 })); // the clients' base reconnection delay

  // Resume: the fetch transport (and the browser's own EventSource retries) send the
  // Last-Event-ID header; an EventSource created by SseHandler sends ?lastEventId= instead.
  // The header wins when both are there.
  const header = request.headers['last-event-id'];
  const resumeFrom = typeof header === 'string' ? header : url.searchParams.get('lastEventId');
  if (resumeFrom !== null) {
    for (const stored of recent) {
      if (stored.id > Number(resumeFrom)) response.write(formatSseMessage(stored));
    }
  }

  clients.add(response);
  const heartbeat = setInterval(() => response.write(formatSseComment('ping')), 15_000);

  response.on('close', () => {
    // The client went away (or disconnect() was called)
    clearInterval(heartbeat);
    clients.delete(response);
  });
}).listen(8080);

setInterval(() => broadcast('clock.tick', { now: new Date().toISOString() }), 1000);
```

A client subscribed to `server.clock.tick` receives `{ now: '…' }` every second. If its connection drops, it reconnects after about 5 seconds and gets the ticks it missed.

#### Example: Fetch API servers (Deno, Bun, edge runtimes)

Runtimes whose handlers return a `Response` can stream from a `ReadableStream`:

```typescript
import { formatSseComment, formatSseMessage, SSE_HEADERS, type SseMessage } from '@jcfigueiredo/evem/sse/server';

declare function eventsAfter(lastEventId: string | null): SseMessage[];

export function handleEvents(request: Request): Response {
  const lastEventId = request.headers.get('Last-Event-ID') ?? new URL(request.url).searchParams.get('lastEventId');
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      for (const message of eventsAfter(lastEventId)) send(formatSseMessage(message));
      heartbeat = setInterval(() => send(formatSseComment('ping')), 15_000);
    },
    cancel() {
      clearInterval(heartbeat); // the client went away
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
```

#### Server checklist

- **Return `204 No Content`** to tell a client to stop for good, and `401`/`403` for auth failures: the handler stops in both cases, and reports `401`/`403` as `sse.error` with the status (a `204` is a normal end and isn't reported). Clients using the EventSource transport can't see the status and retry instead.
- **Return `503` with `Retry-After`** to shed load: clients using the fetch transport wait at least that long.
- **Send a heartbeat comment** every 15–30 seconds, so proxies don't close idle connections and clients can use `heartbeatTimeout`.
- **Don't compress or buffer the stream.** Compression middleware holds data back until it has enough to compress; skip it for `text/event-stream`, or flush after every write.
- **Use HTTP/2 in browsers if you can.** Over HTTP/1.1, browsers allow only about six connections per host, and every open stream holds one.

## Testing

### A fake transport

Pass your own `SseTransport` as `transport` to drive the handler from a test, with no network. A transport makes one connection per `connect()` call, reports what happens to the listener, and resolves with an `SseCloseInfo` when the connection ends:

```typescript
import { expect, it } from 'vitest';
import { EvEm } from '@jcfigueiredo/evem';
import {
  SseHandler,
  type SseCloseInfo,
  type SseConnectRequest,
  type SseTransport,
  type SseTransportListener,
} from '@jcfigueiredo/evem/sse';

class FakeTransport implements SseTransport {
  requests: SseConnectRequest[] = [];
  private listener?: SseTransportListener;
  private finish?: (info: SseCloseInfo) => void;

  connect(request: SseConnectRequest, listener: SseTransportListener): Promise<SseCloseInfo> {
    this.requests.push(request);
    this.listener = listener;
    return new Promise((resolve) => {
      this.finish = resolve;
    });
  }

  abort(): void {
    this.finish?.({ reason: 'aborted' });
  }

  // Test helpers
  open(): void {
    this.listener?.open();
  }
  send(type: string, data: unknown, id = ''): void {
    this.listener?.activity();
    void this.listener?.event({ type, data: JSON.stringify(data), lastEventId: id });
  }
  end(info: SseCloseInfo = { reason: 'ended' }): void {
    this.finish?.(info);
  }
}

// State changes and publishes are async; let them finish
const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

it('routes server events and resumes from the last event id', async () => {
  const evem = new EvEm();
  const transport = new FakeTransport();
  const sse = new SseHandler('/api/events', evem, { transport, reconnectDelay: 10, backoff: false });

  const orders: unknown[] = [];
  evem.subscribe('server.order.updated', (order) => {
    orders.push(order);
  });

  await settle();
  transport.open();
  transport.send('order.updated', { id: 7 }, '42');
  await settle();
  expect(orders).toEqual([{ id: 7 }]);
  expect(sse.isConnected()).toBe(true);

  transport.end({ reason: 'network-error', error: new Error('connection reset') });
  await settle(30);
  expect(transport.requests).toEqual([{ url: '/api/events' }, { url: '/api/events', lastEventId: '42' }]);

  await sse.disconnect();
});
```

The transport contract:

- **`connect(request, listener)`** opens one connection to `request.url`, sending `request.lastEventId` if it's set. It never reconnects by itself; the handler decides.
- **The listener:** call `open()` once the server accepted the stream, `event({ type, data, lastEventId })` for each event, `retry(ms)` for a `retry:` field, `lastEventId(id)` (optional) when a message without data changes the last event id, and `activity()` whenever bytes arrive (for `heartbeatTimeout`). `event()` returns a promise with `sequential: true`; await it before reading more if your transport can pause. `reconnecting()` is optional, for transports that reconnect on their own, as `EventSource` does.
- **The result:** resolve `connect()` with an [`SseCloseInfo`](#types) saying why the connection ended. `abort()` ends the current connection, and its `connect()` then resolves with `{ reason: 'aborted' }`.

Use fake timers (`vi.useFakeTimers()` and `await vi.advanceTimersByTimeAsync(ms)`) to test reconnection delays without waiting. Backoff adds jitter, so either pass `backoff: false` or stub `Math.random`.

### A fake fetch

To run the real fetch transport and parser too, pass a `fetch` that returns a streaming response:

```typescript
import { expect, it } from 'vitest';
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';
import { formatSseMessage } from '@jcfigueiredo/evem/sse/server';

it('parses an event stream from fetch', async () => {
  const body = formatSseMessage({ event: 'order.updated', id: 1, data: { id: 7 } });
  const fetch = async (): Promise<Response> =>
    new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });

  const evem = new EvEm();
  const states: string[] = [];
  const orders: unknown[] = [];
  evem.subscribe('sse.connection.state', ({ to }: { to: string }) => {
    states.push(to);
  });
  evem.subscribe('server.order.updated', (order) => {
    orders.push(order);
  });

  const sse = new SseHandler('https://api.test/events', evem, { fetch, reconnect: false });
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(orders).toEqual([{ id: 7 }]);
  expect(states).toEqual(['connecting', 'connected', 'disconnected']); // the body ended
  expect(sse.getLastEventId()).toBe('1');
});
```

For a stream that stays open, build the body as a `ReadableStream` and keep its controller to `enqueue()` chunks, `close()` or `error()` it during the test. Make it honour `init.signal`: when the signal aborts, reject the pending `fetch` and `error()` the body's controller, as a real `fetch` does. Otherwise `disconnect()` and `heartbeatTimeout` can't end the connection. The repository's own `tests/sse/helpers/` has a `FakeTransport`, a controllable fake `fetch` and a `MockEventSource` built this way.

## Using SSE and WebSocket together

Both adapters route server messages with the same code, so the same server message becomes the same EvEm event over either connection: `{"event":"order.updated","data":…}` (or, over SSE, `event: order.updated`) is published as `server.order.updated`. You can move a stream from WebSocket to SSE, or use both, without changing subscriptions:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler, type ConnectionStateChangeEvent } from '@jcfigueiredo/evem/sse';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

const evem = new EvEm();

// One-way updates over SSE, with auth headers and resume
const updates = new SseHandler('/api/events', evem);
// Two-way chat over WebSocket, with the offline queue and request-response
const chat = new WebSocketHandler('wss://example.com/chat', evem, { reconnect: true });

evem.subscribe('server.order.*', (order) => console.log('order event', order));
evem.subscribe('server.chat.message', (message) => console.log('chat', message));

// Each adapter publishes its own state event
evem.subscribe<ConnectionStateChangeEvent>('sse.connection.state', ({ to }) => console.log('updates:', to));
evem.subscribe<ConnectionStateChangeEvent>('ws.connection.state', ({ to }) => console.log('chat:', to));

await evem.publish('ws.send', { event: 'chat.send', data: { text: 'Hello!' } });

window.addEventListener('pagehide', () => {
  void updates.disconnect();
  void chat.disconnect();
});
```

- **Same names, same envelope.** A server that writes `{ event, data }` envelopes (`formatSseMessage(..., { envelope: true })` over SSE) works over both adapters and both SSE transports.
- **Different adapter events.** The adapters' own events stay separate: `sse.*` and `ws.*`.
- **Telling them apart.** Subscribers can't tell which connection a `server.*` event came from. If that matters, give one handler a different `serverEventPrefix`.
- **Several SSE streams.** Several `SseHandler`s can share an `EvEm`, but they all publish the same `sse.*` events, so their states can't be told apart. Give each handler its own `EvEm` if you need that, and a different `serverEventPrefix` if their server events could clash.
- **Sending:** SSE has no `ws.send`. Send with `fetch` (`POST /api/orders`) and let the result arrive on the stream, or use the WebSocket adapter.

## Using the parser directly

`SseParser` is the spec-compliant parser the transports use. It does no I/O, so you can use it on any stream of text, e.g. a streaming response you read yourself:

```typescript
import { SseParser } from '@jcfigueiredo/evem/sse';

const parser = new SseParser({
  onEvent: ({ type, data, lastEventId }) => console.log(type, data, lastEventId),
  onRetry: (milliseconds) => console.log('server asks for a reconnection delay of', milliseconds),
  onComment: (text) => console.log('comment:', text), // the text after the colon, leading space included
});

const response = await fetch('https://api.example.com/stream', { method: 'POST', body: '{"prompt":"hi"}' });
const reader = response.body!.getReader();
const decoder = new TextDecoder();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  parser.feed(decoder.decode(value, { stream: true }));
}
parser.feed(decoder.decode());
parser.end(); // discards an unterminated last event, as the spec requires
```

- `feed()` takes decoded text in chunks of any size. A line ending split across chunks (`\r` then `\n`) and a leading byte order mark are handled.
- Events have `type` (`'message'` when unnamed), `data` (the `data:` lines joined with `\n`) and `lastEventId`.
- The constructor's second argument is an initial last event id, reported by events until the stream sends an `id:`.

## Types

`@jcfigueiredo/evem/sse` exports:

- **Classes:** `SseHandler`, `FetchSseTransport`, `EventSourceSseTransport`, `SseParser`, and `ConnectionManager`: the state holder shared with the WebSocket adapter, which `SseHandler` creates with `stateEvent: 'sse.connection.state'`.
- **Functions:** `defaultShouldReconnect`, the default reconnection policy.
- **Options:** `SseHandlerOptions`, `FetchSseTransportOptions`, `EventSourceSseTransportOptions`, `ConnectionManagerOptions`, `SseHeaders`, `SseBody`, `SseFetch` (the type of the `fetch` option: `(url: string, init: RequestInit) => Promise<Response>`, which the global `fetch` fits).
- **Events and state:** `SseEvents`, `ConnectionState`, `ConnectionStateChangeEvent`.
- **Transports:** `SseTransport`, `SseTransportListener`, `SseConnectRequest`, `SseCloseInfo`, `SseReconnectInfo`, `EventSourceLike`, `EventSourceConstructorLike`.
- **Parser:** `SseParsedEvent`, `SseParserCallbacks`.

`@jcfigueiredo/evem/sse/server` exports `formatSseMessage`, `formatSseComment`, `SSE_HEADERS`, and the types `SseMessage` and `FormatSseMessageOptions`.

The main shapes:

```typescript
import type { ConnectionStateChangeEvent } from '@jcfigueiredo/evem/sse';

type SseCloseInfo =
  | { reason: 'ended' } // the server closed the stream
  | { reason: 'no-content' } // HTTP 204
  | { reason: 'http-error'; status: number; retryAfter?: number } // retryAfter in ms
  | { reason: 'bad-content-type'; contentType: string | null }
  | { reason: 'network-error'; error: Error }
  | { reason: 'failed' } // the native EventSource gave up
  | { reason: 'heartbeat-timeout' }
  | { reason: 'aborted' }; // abort() was called

type SseReconnectInfo = SseCloseInfo & { attempts: number };

interface SseEvents {
  'sse.connection.state': ConnectionStateChangeEvent;
  'sse.message': unknown;
  'sse.event': { type: string; data: unknown; rawData: string; lastEventId: string };
  'sse.parse.error': { error: Error; rawData: string; eventType: string; lastEventId: string };
  'sse.error': { error: Error; reason: SseCloseInfo['reason']; status?: number; contentType?: string | null };
  'sse.reconnect.failed': { attempts: number };
  'sse.ready': { timestamp: number };
}

interface SseMessage {
  event?: string;
  data?: unknown;
  id?: string | number;
  retry?: number;
}
```

The design decisions behind the adapter are recorded in [SSE Adapter Design](sse-adapter-design.md).
