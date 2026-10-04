# WebSocket Adapter

The WebSocket adapter connects a WebSocket to an `EvEm` instance. It's an optional entry point, `@jcfigueiredo/evem/websocket`, and doesn't change the core emitter.

Use **`WebSocketHandler`**. It covers the whole connection:

- **Outgoing:** events you publish to `ws.send` (or `ws.send.<name>`) are sent to the socket.
- **Incoming:** server messages become EvEm events (`server.<name>`).
- **Offline queue:** messages published while offline are queued and sent once the connection is up.
- **Request-response:** `handler.request()` sends a request and resolves with the server's reply.
- **Reconnect:** optional automatic reconnection.
- **State:** connection state changes are published as events.

`ConnectionManager`, `MessageQueue` and `RequestResponseManager` are the building blocks `WebSocketHandler` is made of. You only need them if you want a wire protocol the handler doesn't support (see [Using the components directly](#using-the-components-directly)).

- [Installation](#installation)
- [Quick start](#quick-start)
- [Options](#options)
- [Methods](#methods)
- [Events reference](#events-reference)
- [Wire format](#wire-format)
- [Request-response](#request-response)
- [Offline queue](#offline-queue)
- [Connection state and reconnection](#connection-state-and-reconnection)
- [Middleware on outgoing messages](#middleware-on-outgoing-messages)
- [Node.js](#nodejs)
- [Example: browser chat](#example-browser-chat)
- [Testing](#testing)
- [Using the components directly](#using-the-components-directly)
- [Types](#types)

Server-to-client routing is covered in more depth in [Server Events](websocket-server-events.md), which also includes a matching Node.js server and a React example.

Try it in the [playground](https://jcfigueiredo.github.io/evem/playground/#/websocket/connection-queue), against a server that runs in the page: [Connection & offline queue](https://jcfigueiredo.github.io/evem/playground/#/websocket/connection-queue), [Request–response](https://jcfigueiredo.github.io/evem/playground/#/websocket/requests), [Server events & routing](https://jcfigueiredo.github.io/evem/playground/#/websocket/server-events) and a [chat client](https://jcfigueiredo.github.io/evem/playground/#/recipes/chat).

The [Server-Sent Events adapter](sse-adapter.md) routes incoming messages with the same rules, so a server's `{ "event": …, "data": … }` messages become the same `server.*` events over either connection.

## Installation

```bash
npm install @jcfigueiredo/evem
npm install ws   # Node.js 20 only: it has no global WebSocket (see Node.js below)
```

The package is ES modules only and needs Node.js 20+ or a modern browser/bundler.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';
```

## Quick start

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler, type ConnectionStateChangeEvent } from '@jcfigueiredo/evem/websocket';

interface ChatMessage {
  user: string;
  text: string;
}

const evem = new EvEm();
const handler = new WebSocketHandler('wss://chat.example.com/ws', evem, { reconnect: true });

// The server sends {"event":"chat.message","data":{...}}; it's published as 'server.chat.message'
evem.subscribe<ChatMessage>('server.chat.message', (message) => {
  console.log(`${message.user}: ${message.text}`);
});

evem.subscribe<ConnectionStateChangeEvent>('ws.connection.state', ({ from, to }) => {
  console.log(`connection: ${from} -> ${to}`);
});

// Sent right away when connected; otherwise queued and sent once the socket opens
await evem.publish('ws.send', { event: 'chat.send', data: { text: 'Hello!' } });

// Request-response: resolves with the server's `result` (rejects after 5 s by default)
const history = await handler.request<ChatMessage[]>('chat.history', { limit: 50 });
console.log(`${history.length} earlier messages`);

// When you're done: closes the socket and removes everything the handler registered
await handler.disconnect();
```

Callbacks receive `unknown` unless you give a type argument (`subscribe<ChatMessage>(...)`). The type argument isn't checked at runtime; use the `schema` subscription option if you need validation.

Use **one `WebSocketHandler` per `EvEm` instance**. Two handlers on the same emitter both send every `ws.send`, `ws.send.*` and `ws.send.request` event, each on its own socket, so every message and request goes out twice. For several connections, give each its own `EvEm`.

## Options

`new WebSocketHandler(urlOrSocket, evem, options?)` takes a URL or an existing socket (anything implementing [`IWebSocket`](#types), such as a browser `WebSocket` or a socket from the `ws` package).

| Option | Default | Description |
|--------|---------|-------------|
| `enableQueue` | `true` | Queue messages while not connected. With `false`, messages published while offline are dropped. |
| `queueSize` | `100` | Maximum number of queued messages. When the queue is full, the oldest message is dropped and `ws.queue.overflow` is published. |
| `autoFlush` | `true` | Send queued messages whenever the state becomes `connected`, including the first connection. With `false`, call `handler.flush()` to send them. They're discarded by `disconnect()`. |
| `enableRequestResponse` | `true` | Enables `request()`, the request format for `ws.send.request`, and routing of `{"type":"response"}` messages. With `false`, `ws.send.request` is sent like any other `ws.send.*` event. |
| `serverEventPrefix` | `'server'` | Prefix for incoming server events (`chat.message` → `server.chat.message`). With `''`, events are published under their own names. |
| `reconnect` | `false` | Reconnect after an unexpected close. Never happens after `disconnect()`. |
| `reconnectDelay` | `1000` | Milliseconds to wait before each reconnection attempt. The delay is fixed; there is no backoff. |
| `maxReconnectAttempts` | `5` | How many consecutive failed attempts are allowed before giving up. The count resets when a socket opens. |
| `WebSocketConstructor` | global `WebSocket` | Class used to create sockets from a URL: for the URL you pass, and for every reconnection. Required in Node.js 20 when you pass a URL or enable `reconnect`. |
| `onError` | none | Called with an `Error` for socket errors, sockets that can't be created while reconnecting, and incoming messages that fail to parse. These are also published as `ws.error` / `ws.parse.error`. |
| `messageParser` | `JSON.parse` | Turns each incoming `event.data` into a message object. |
| `messageFormatter` | `JSON.stringify` | Turns each outgoing payload into the string that is sent. |

## Methods

| Method | Description |
|--------|-------------|
| `request<T>(method, params?, { timeout?, id? }?)` | Sends a request and resolves with the response's `result`. See [Request-response](#request-response). |
| `flush(): Promise<void>` | Sends the queued messages now, in order (needed with `autoFlush: false`). Messages the socket can't take go back into the queue. |
| `disconnect(): Promise<void>` | Cancels any pending reconnection and rejects pending requests. Discards queued messages, closes the socket with code 1000, removes all of the handler's subscriptions and middleware, and moves the state through `disconnecting` to `disconnected` (unless it's already `disconnected`). The handler can't be reused afterwards; create a new one to connect again. |
| `isConnected(): boolean` | `true` while the state is `connected`. |
| `getConnectionState(): string` | The current state: `'disconnected'`, `'connected'`, `'reconnecting'` or `'disconnecting'`. |
| `getQueueSize(): number` | Number of queued messages (0 when the queue is disabled). |

## Events reference

**You publish:**

| Event | Payload | What happens |
|-------|---------|--------------|
| `ws.send` | any | Sent through `messageFormatter`. If the handler isn't connected, the message is queued instead (or dropped, with `enableQueue: false`). |
| `ws.send.<name>` (e.g. `ws.send.chat`) | any | Same as `ws.send`. Only the payload is sent, not the event name. Names containing `queued` are reserved for the queue. |
| `ws.send.request` | `RequestMessage` | Published by `request()`; you normally don't publish it yourself. It's sent as `{ type: 'request', ...request }`. |

**The handler publishes:**

| Event | Payload | When |
|-------|---------|------|
| `ws.connection.state` | `{ from, to, timestamp }` | On every state change (see [Connection state](#connection-state-and-reconnection)). |
| `server.<name>` | the message's `data` | A server event arrives (see [Wire format](#wire-format)). |
| `ws.message` | the whole parsed message | An incoming message matches no other route (see [Wire format](#wire-format)). |
| `ws.parse.error` | `{ error, rawData }` | `messageParser` throws on an incoming message. |
| `ws.error` | `{ error, event }` | The socket reports an error. While reconnecting, it's also published as `{ error }` when a new socket can't be created. In browsers, `error` is a generic `Error('WebSocket error')`, because the browser error event carries no details. |
| `ws.send.queued` | the queued payload | For each queued message as the queue is flushed. Publishing it is what sends it (the handler's own subscriber sends it), so middleware sees it before it's sent and subscribers you add usually after. |
| `ws.queue.overflow` | `{ maxSize, droppedMessage }` | The queue was full and its oldest message was dropped. |
| `ws.reconnect.failed` | `{ attempts }` | `maxReconnectAttempts` consecutive attempts failed. The state is now `disconnected`. |
| `ws.response` / `ws.response.error` | `{ id, result, timestamp }` / `{ id, error, timestamp }` | A `{"type":"response"}` message arrives. Used internally by `request()`. |

Subscriber errors are handled by EvEm's default error policy: they're logged, and the next subscriber runs. Incoming messages are published as they arrive, without waiting for earlier async subscribers to finish.

## Wire format

**Outgoing:** the payload of each `ws.send` / `ws.send.*` event, passed through `messageFormatter` (JSON by default). The handler doesn't wrap it, so choose a shape your server understands. The examples here use `{ event, data }`:

```json
{"event":"chat.send","data":{"text":"Hello!"}}
```

**Incoming:** each message is passed through `messageParser` (JSON by default) and routed by its fields. These rules are for the default `serverEventPrefix: 'server'`:

| Server sends | Published as | Subscribers receive |
|--------------|--------------|---------------------|
| `{"event":"chat.message","data":{…}}` | `server.chat.message` | `data` |
| `{"event":"server.chat.message","data":{…}}` | `server.chat.message` (the prefix isn't added twice) | `data` |
| `{"type":"chat.message","data":{…}}` (legacy) | `server.chat.message` (same rule as `event`) | `data` |
| `{"type":"response","id":"…","result":…}` | `ws.response` | resolves the matching `request()` |
| `{"type":"response","id":"…","error":{"code":…,"message":"…"}}` | `ws.response.error` | rejects the matching `request()` |
| anything else, e.g. `{"ping":1}`, or JSON that isn't an object (`null`, `42`) | `ws.message` | the whole parsed message |
| invalid JSON | `ws.parse.error` | `{ error, rawData }` |

`event` takes precedence over `type`. If `data` is missing, subscribers receive `{}`. With `enableRequestResponse: false`, response messages go to `ws.message`. See [Server Events](websocket-server-events.md) for subscribing to these.

## Request-response

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { RequestTimeoutError, WebSocketHandler } from '@jcfigueiredo/evem/websocket';

interface User {
  id: number;
  name: string;
}

const evem = new EvEm();
const handler = new WebSocketHandler('wss://api.example.com/ws', evem);

try {
  const user = await handler.request<User>('users.get', { id: 42 }, { timeout: 10_000 });
  console.log(user.name);
} catch (error) {
  if (error instanceof RequestTimeoutError) {
    console.warn(`${error.method} (${error.requestId}) timed out after ${error.timeout} ms`);
  } else if (error instanceof Error) {
    // A {"type":"response","error":{...}} reply: the server's message, plus `code` and `data`
    const { code } = error as Error & { code?: number };
    console.error(`Request failed (${code}): ${error.message}`);
  }
}

// Requests are independent; run them concurrently
const [alice, bob] = await Promise.all([
  handler.request<User>('users.get', { id: 1 }),
  handler.request<User>('users.get', { id: 2 }),
]);
console.log(alice.name, bob.name);
```

- The request is sent as `{"type":"request","id":"<uuid>","method":"users.get","params":{"id":42},"timestamp":…}`. The server must reply with a `{"type":"response"}` message carrying the same `id` (see [Wire format](#wire-format)).
- `timeout` defaults to 5000 ms. It starts when you call `request()`, so time spent in the offline queue counts. A request that times out while queued is still sent when the queue flushes, and its response is ignored.
- `id` sets a custom request id. `request()` rejects immediately if a request with that id is still pending.
- Rejections:
  - `RequestTimeoutError` (extends `WebSocketError`, `code: 'REQUEST_TIMEOUT'`) when the timeout expires.
  - An `Error` with the server's `message`, `code` and `data` for an error response. The message is `'Request failed'` if the response has no error details.
  - An `Error` if request-response is disabled, if `request()` is called after `disconnect()`, or if the request is still pending when `disconnect()` is called.

## Offline queue

While the state isn't `connected`, `ws.send`, `ws.send.*` and request messages go into a FIFO queue instead of the socket. With `autoFlush` (the default), each transition to `connected` sends the queue in order: the first connection and every reconnection. Each flushed message is published as `ws.send.queued`, which sends it.

- **Full queue:** when `queueSize` messages are waiting, the oldest is dropped and `ws.queue.overflow` is published with `{ maxSize, droppedMessage }`.
- **Closed socket:** a message the socket can't take, because it's no longer open, is put back in the queue. This happens when the socket closed before `onclose` updated the state, or when the connection dropped in the middle of a flush.
- **Send errors:** if `messageFormatter` or `socket.send()` throws, the error is logged with `console.error` and that message is dropped.
- **No queue:** with `enableQueue: false`, messages published while offline are dropped silently.
- **Sent once:** a message queued while offline is sent only by the flush, even if the connection opens while that message's publish is still running (e.g. behind a slow async subscriber).
- **Disconnect:** `disconnect()` discards anything still queued.

Don't queue messages that are only meaningful in real time (cursor positions, live controls). Either disable the queue, or check `handler.isConnected()` before publishing them.

## Connection state and reconnection

The handler publishes `ws.connection.state` with `{ from, to, timestamp }` on each change:

```
new WebSocketHandler(url, ...)       disconnected   (the socket is still connecting)
socket opens                       → connected      (queue flushed)
socket closes unexpectedly
  reconnect: false                 → disconnected   (stays there; create a new handler to retry)
  reconnect: true                  → reconnecting   (a new socket to the same URL after reconnectDelay)
    a new socket opens             → connected      (queue flushed, attempt count reset)
    maxReconnectAttempts failures  → disconnected   + ws.reconnect.failed { attempts }
await handler.disconnect()         → disconnecting → disconnected
```

- A socket that is already open when you pass it starts in `connected`.
- The handler never uses the `connecting` state.
- With `reconnect: true`, an initial connection that fails also moves to `reconnecting`.
- Reconnecting needs a URL: the string you passed, or the `url` property of the socket you passed (browser and `ws` sockets have one). Without a URL, an unexpected close moves to `disconnected`.
- New sockets are created with `WebSocketConstructor`, or the global `WebSocket` if you didn't set one.
- Socket errors are published as `ws.error`. The state changes when the socket then closes.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler, type ConnectionStateChangeEvent } from '@jcfigueiredo/evem/websocket';

const evem = new EvEm();
const handler = new WebSocketHandler('wss://api.example.com/ws', evem, {
  reconnect: true,
  reconnectDelay: 2000,
  maxReconnectAttempts: 10,
});

evem.subscribe<ConnectionStateChangeEvent>('ws.connection.state', ({ to }) => {
  document.body.dataset.connection = to; // 'connected', 'reconnecting', ...
});

evem.subscribe<{ attempts: number }>('ws.reconnect.failed', ({ attempts }) => {
  console.warn(`Gave up after ${attempts} attempts; queued: ${handler.getQueueSize()}`);
});
```

## Middleware on outgoing messages

Middleware runs in registration order, and the handler registers its own `ws.send*` middleware when it's created.

**Register your middleware before you create the handler.** That way, messages are queued and sent as your middleware returns them. Middleware added later doesn't change messages published to `ws.send.*` names, and doesn't change what gets queued.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

const evem = new EvEm();
const token = 'session-token';

// Adds a token to every outgoing message. Flushed messages (ws.send.queued) already have it.
const addToken = (event: string, data: unknown) =>
  event === 'ws.send.queued' ? data : { ...(data as object), token };
evem.use({ pattern: 'ws.send', handler: addToken });
evem.use({ pattern: 'ws.send.*', handler: addToken });

const handler = new WebSocketHandler('wss://api.example.com/ws', evem);
```

Two things to watch for:

- **Use both patterns.** `ws.send.*` doesn't match `ws.send` itself, so register the middleware on both.
- **Don't return a bare `{ event, data }` copy.** If your middleware returns a new object with exactly two properties, `event` and `data`, EvEm treats it as a *reroute* to that event name. A message shaped like `{ event: 'chat.send', data }` would then be published as `chat.send` instead of being sent. Return the same object, or add a property, as above.

## Node.js

Node.js 22 and later have a global `WebSocket`, so a URL works as-is. Node.js 20 doesn't. On Node.js 20, a URL without `WebSocketConstructor` throws `ReferenceError: WebSocket is not defined`. Use the [`ws`](https://www.npmjs.com/package/ws) package instead:

```typescript
import WebSocket from 'ws';
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

const evem = new EvEm();

// Pass a URL plus the class to create sockets with (used again for each reconnection)
const handler = new WebSocketHandler('ws://localhost:8080', evem, {
  WebSocketConstructor: WebSocket,
  reconnect: true,
});

// Need headers or other socket options? Bake them into a subclass so reconnections keep them
class AuthenticatedSocket extends WebSocket {
  constructor(url: string) {
    super(url, { headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } });
  }
}
const api = new WebSocketHandler('wss://api.example.com/ws', new EvEm(), {
  WebSocketConstructor: AuthenticatedSocket,
  reconnect: true,
});

process.on('SIGINT', async () => {
  await Promise.all([handler.disconnect(), api.disconnect()]);
  process.exit(0);
});
```

You can also pass a `ws` socket you created yourself: `new WebSocketHandler(socket, evem)`. If you also want reconnection, set `reconnect: true` and `WebSocketConstructor`. Reconnections create new sockets with `new WebSocketConstructor(socket.url)` (or the global `WebSocket` if it isn't set, and Node.js 20 has no global `WebSocket`), so options you gave your socket, like headers or protocols, aren't reused: use a subclass like `AuthenticatedSocket` above.

## Example: browser chat

This example works with the Node.js server in [Server Events](websocket-server-events.md#example-chat-client-and-server).

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler, type ConnectionStateChangeEvent } from '@jcfigueiredo/evem/websocket';

interface ChatMessage {
  roomId: string;
  user: string;
  text: string;
}

const roomId = 'lobby';
const evem = new EvEm();
const handler = new WebSocketHandler('ws://localhost:8080', evem, { reconnect: true });

const status = document.querySelector<HTMLElement>('#status')!;
const list = document.querySelector<HTMLUListElement>('#messages')!;
const form = document.querySelector<HTMLFormElement>('#chat')!;
const input = form.querySelector<HTMLInputElement>('input')!;

function show(message: ChatMessage): void {
  const item = document.createElement('li');
  item.textContent = `${message.user}: ${message.text}`;
  list.append(item);
}

evem.subscribe<ConnectionStateChangeEvent>('ws.connection.state', ({ to }) => {
  status.textContent = to;
});
evem.subscribe('ws.reconnect.failed', () => {
  status.textContent = 'offline (reload to retry)';
});

// The server broadcasts every room's messages as 'chat.message'; keep this room's
evem.subscribe<ChatMessage>('server.chat.message', show, {
  filter: (message) => message.roomId === roomId,
});

form.addEventListener('submit', (submit) => {
  submit.preventDefault();
  // Queued while offline and sent on reconnect
  void evem.publish('ws.send', { event: 'chat.send', data: { roomId, text: input.value } });
  input.value = '';
});

// Waits for the connection (the 5 s timeout includes that wait)
handler
  .request<ChatMessage[]>('chat.history', { roomId, limit: 50 })
  .then((history) => history.forEach(show))
  .catch((error: unknown) => console.error('Could not load history', error));

window.addEventListener('pagehide', () => {
  void handler.disconnect();
});
```

For React, see [Using with React](websocket-server-events.md#using-with-react).

## Testing

Pass a fake socket instead of a URL. Anything that implements `IWebSocket` works:

```typescript
import { expect, it } from 'vitest';
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler, type IWebSocket } from '@jcfigueiredo/evem/websocket';

class FakeSocket implements IWebSocket {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState: number = this.CONNECTING;
  sent: string[] = [];
  onopen: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    this.sent.push(String(data));
  }
  close(): void {
    this.readyState = this.CLOSED;
  }

  // Test helpers
  open(): void {
    this.readyState = this.OPEN;
    this.onopen?.({});
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop(): void {
    this.readyState = this.CLOSED;
    this.onclose?.({ code: 1006 });
  }
}

// State changes and the queue flush are async; let them finish
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it('queues while offline, then sends and routes server events', async () => {
  const evem = new EvEm();
  const socket = new FakeSocket();
  const handler = new WebSocketHandler(socket, evem);

  await evem.publish('ws.send', { event: 'chat.send', data: { text: 'hi' } });
  expect(socket.sent).toEqual([]);
  expect(handler.getQueueSize()).toBe(1);

  socket.open();
  await settle();
  expect(socket.sent).toEqual(['{"event":"chat.send","data":{"text":"hi"}}']);

  const received: unknown[] = [];
  evem.subscribe('server.chat.message', (data) => {
    received.push(data);
  });
  socket.receive({ event: 'chat.message', data: { text: 'hello' } });
  await settle();
  expect(received).toEqual([{ text: 'hello' }]);

  await handler.disconnect();
});
```

Some other things to test:

- **`request()`:** the request is sent asynchronously, so `await settle()` first. Then read its `id` from `JSON.parse(socket.sent[0])` and reply with `socket.receive({ type: 'response', id, result })`.
- **Reconnection:** pass a URL with a fake class as `WebSocketConstructor`, so you can reach the sockets it creates. Use `vi.useFakeTimers()` and `await vi.advanceTimersByTimeAsync(reconnectDelay)`. A fake socket that never opens counts as a failed attempt once you call its `drop()`.

The repository's own `MockWebSocket` (`tests/websocket/mocks/MockWebSocket.ts`) is a fuller fake of this kind. Note that it opens itself on the next tick unless you set `autoConnect = false`.

## Using the components directly

`WebSocketHandler` is built from three components. You can wire them yourself if you need a different transport or wire protocol. You then have to forward messages to the socket yourself. The components only queue messages, track state and match responses; none of them sends anything.

### ConnectionManager

```typescript
import type { EvEm } from '@jcfigueiredo/evem';
import type { ConnectionState } from '@jcfigueiredo/evem/websocket';

declare class ConnectionManager {
  constructor(evem: EvEm);
  transitionTo(state: ConnectionState): Promise<void>; // publishes ws.connection.state { from, to, timestamp }
  getState(): ConnectionState;   // starts as 'disconnected'
  isConnected(): boolean;        // 'connected'
  isConnecting(): boolean;       // 'connecting' or 'reconnecting'
  isReconnecting(): boolean;     // 'reconnecting'
  isDisconnecting(): boolean;    // 'disconnecting'
  isDisconnected(): boolean;     // 'disconnected'
}
```

`ConnectionManager` records the state you give it and announces it. It doesn't enforce a state machine: any transition is accepted, including one to the current state. `transitionTo()` sets the state right away and always resolves. Subscriber errors are logged by EvEm's default error policy, and a rejected publish is ignored.

### MessageQueue

```typescript
import type { EvEm } from '@jcfigueiredo/evem';
import type { ConnectionManager } from '@jcfigueiredo/evem/websocket';

declare class MessageQueue {
  constructor(evem: EvEm, connectionManager: ConnectionManager);
  enable(maxSize?: number, options?: { autoFlush?: boolean }): void; // defaults: 100, autoFlush true
  disable(): void;          // stops queueing; removes its middleware and subscription; keeps queued messages
  enqueue(data: any): void; // queue explicitly, whatever the state (no-op while disabled)
  flush(): Promise<void>;   // publishes each queued message to ws.send.queued, in order
  clear(): void;            // drop queued messages
  isEnabled(): boolean;
  getQueueSize(): number;
  getMaxSize(): number;
  wasQueued(data: unknown): boolean; // whether the middleware queued this payload on its latest publish
}
```

When enabled, `MessageQueue` registers middleware on `ws.send` and on `ws.send.*` (needed because `ws.send.*` doesn't match `ws.send`). While the `ConnectionManager` isn't `connected`, it queues the payload of every such event, except names containing `queued`. The event itself still reaches subscribers.

With `autoFlush`, every transition to `connected` flushes the queue, including the first. A full queue drops its oldest message and publishes `ws.queue.overflow`.

### RequestResponseManager

```typescript
import type { EvEm } from '@jcfigueiredo/evem';

declare class RequestResponseManager {
  constructor(evem: EvEm);  // subscribes to ws.response and ws.response.error
  request(method: string, params?: any, options?: { timeout?: number; id?: string }): Promise<any>;
  getPendingRequestCount(): number;
  cleanup(): void;          // unsubscribes and rejects pending requests
}
```

`request()` publishes `ws.send.request` with `{ id, method, params, timestamp }` and no `type` field. It resolves when `ws.response` arrives with that `id`, and rejects on `ws.response.error`, on timeout (`RequestTimeoutError`), or for a duplicate pending `id`.

### Wiring them up

This is roughly what `WebSocketHandler` does for `ws.send` and requests:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import {
  ConnectionManager,
  MessageQueue,
  RequestResponseManager,
  type RequestMessage,
} from '@jcfigueiredo/evem/websocket';

const evem = new EvEm();
const connection = new ConnectionManager(evem);
const rpc = new RequestResponseManager(evem);

// Mark requests so the server can recognise them. Registered before the queue's middleware,
// so requests queued while offline are stored (and later sent) in this format too.
evem.use({
  pattern: 'ws.send.request',
  handler: (_event: string, request: RequestMessage) => ({ ...request, type: 'request' }),
});

const queue = new MessageQueue(evem, connection);
queue.enable(100); // autoFlush: flushed through ws.send.queued on every move to 'connected'

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

function sendOrQueue(message: unknown, fromQueue: boolean): void {
  // Queued by the middleware during this publish, because we were offline: the flush sends it,
  // even if the socket has opened since
  if (!fromQueue && queue.wasQueued(message)) return;
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else if (fromQueue || connection.isConnected()) {
    queue.enqueue(message); // the socket closed before onclose updated the state
  }
  // Otherwise we're offline and the queue's middleware has already queued it
}

evem.subscribe('ws.send', (message) => sendOrQueue(message, false));
evem.subscribe('ws.send.request', (request) => sendOrQueue(request, false));
evem.subscribe('ws.send.queued', (message) => sendOrQueue(message, true));

function connect(url: string): void {
  socket = new WebSocket(url);
  socket.onopen = () => {
    void connection.transitionTo('connected');
  };
  socket.onclose = () => {
    void connection.transitionTo('reconnecting');
    reconnectTimer = setTimeout(() => connect(url), 1000);
  };
  socket.onmessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data);
    if (message.type === 'response') {
      void evem.publish(message.error ? 'ws.response.error' : 'ws.response', message);
    } else if (message.event) {
      void evem.publish(`server.${message.event}`, message.data);
    }
  };
}

async function disconnect(): Promise<void> {
  clearTimeout(reconnectTimer);
  if (socket) {
    socket.onclose = null; // a close we asked for must not schedule a reconnect
    socket.close(1000);
    socket = null;
  }
  queue.disable();
  rpc.cleanup(); // rejects pending requests
  await connection.transitionTo('disconnected');
}

connect('wss://api.example.com/ws');
const user = await rpc.request('users.get', { id: 42 });
console.log(user);
await disconnect();
```

This wiring sends `ws.send` and requests only. Other `ws.send.*` names would be queued while offline but not sent while connected, because a subscriber doesn't see the event name. `WebSocketHandler` sends them from a middleware.

## Types

All of these are exported from `@jcfigueiredo/evem/websocket`:

```typescript
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'disconnecting';

interface ConnectionStateChangeEvent {
  from: ConnectionState;
  to: ConnectionState;
  timestamp: number;
}

interface RequestMessage {
  id: string;
  method: string;
  params?: any;
  timestamp: number;
}

interface ResponseMessage {
  id: string;
  result?: any;
  error?: { code: number; message: string; data?: any };
  timestamp: number;
}

interface RequestOptions {
  timeout?: number; // default 5000
  id?: string;      // default: a random UUID
}

declare class WebSocketError extends Error {
  code: string;
  originalError?: Error;
}

declare class RequestTimeoutError extends WebSocketError {
  // code: 'REQUEST_TIMEOUT'
  requestId: string;
  method: string;
  timeout: number;
}
```

There are also:

- `IWebSocket`: the socket interface. It has `readyState`, the four state constants, an optional `url`, `send`, `close`, and the four `on*` handlers.
- `WebSocketEvents`: the adapter's own event names mapped to their payload types. Server events (`server.*`) aren't included.
- `WebSocketHandlerOptions`, `IncomingMessage`, `QueuedMessage`, `PendingRequest` and `MessageQueueOptions`.

`ConnectionError`, `QueueOverflowError` and `WebSocketAdapterOptions` are exported too, but the adapter never throws or uses them.
