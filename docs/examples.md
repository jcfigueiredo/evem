# EvEm Library - Comprehensive Examples

This document provides examples for the features of the EvEm library, illustrating its capabilities and usage in various scenarios. The snippets are TypeScript (they type-check under `strict`); where a snippet prints something, the output is shown in comments as Node.js prints it.

## Importing and Initializing EvEm

```bash
npm install @jcfigueiredo/evem
```

The package is ESM only, has no runtime dependencies and needs Node.js 22+ or a modern browser.

```typescript
import { EvEm } from "@jcfigueiredo/evem";
const evem = new EvEm();
```

The core examples below use this `evem` instance. The WebSocket adapter has its own entry point, `@jcfigueiredo/evem/websocket` (see [WebSocket Adapter Examples](#websocket-adapter-examples)).

## Basic Event Subscription and Publishing

### Subscribing to an Event

```typescript
const subId = evem.subscribe<string>("event.name", data => {
  console.log(`Event received with data: ${data}`);
});
```

### Publishing an Event

`publish` returns a promise that resolves once the matching subscribers have run (async callbacks are awaited): to `true`, or to `false` if the event was canceled (by a subscriber of a cancelable event, by middleware returning `null` or throwing, or by the `CANCEL_ON_ERROR` error policy).

```typescript
async function publishEvent() {
  await evem.publish("event.name", "Hello World!");
}
publishEvent();
// or
void evem.publish("event.name", "Hello World!");
```

## Asynchronous Callbacks and Timeouts

### Subscribing with an Asynchronous Callback

```typescript
evem.subscribe<string>("async.event", async data => {
  console.log(`Received data: ${data}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log("Async operation completed.");
});
```

`publish` awaits async callbacks one at a time, in priority order. Subscriptions have no timeout option: the timeout is set when publishing.

### Publishing with a Timeout

```typescript
async function publishAsyncEvent() {
  // Wait up to 3000 ms for each async callback (default: 5000 ms)
  await evem.publish("async.event", "Async Data", { timeout: 3000 });
  // A number works too: evem.publish("async.event", "Async Data", 3000)
}
publishAsyncEvent();
```

A callback (or async transform) that is still running when the timeout expires is handled by the publish `errorPolicy`, like an error it threw: logged by default (`LOG_AND_CONTINUE`, and the next subscriber runs), rejecting `publish` with `THROW`, skipping the remaining subscribers with `CANCEL_ON_ERROR` (`publish` resolves to `false`), ignored with `SILENT`. The timed-out callback itself can't be stopped and keeps running:

```typescript
import { ErrorPolicy } from "@jcfigueiredo/evem";

evem.subscribe<string>("report.generate", async name => {
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log(`Report ${name} done`);
});

try {
  await evem.publish("report.generate", "Q3", { timeout: 500, errorPolicy: ErrorPolicy.THROW });
} catch (error) {
  console.error((error as Error).message);
}
// Event handler timed out after 500ms
// ...and about 1.5 s later, because the callback keeps running:
// Report Q3 done
```

## Unsubscribing from Events

### Subscribing and then Unsubscribing

```typescript
const callback = (data: unknown) => console.log("Data:", data);

// Unsubscribe with the id that subscribe returns...
const subId = evem.subscribe("event.unsubscribe", callback);
evem.unsubscribeById(subId);

// ...or with the event name and the same callback (also for subscriptions created with options)
evem.subscribe("event.unsubscribe", callback, { priority: "high" });
evem.unsubscribe("event.unsubscribe", callback);
```

## Wildcard Event Names

### Subscribing to a Wildcard Event

```typescript
evem.subscribe("user.*", data => {
  console.log("User event occurred:", data);
});

await evem.publish("user.login", { username: "john_doe" });
await evem.publish("user.logout"); // a missing payload is delivered as {}
await evem.publish("user.profile.updated", { theme: "dark" });
await evem.publish("user"); // no match: "user.*" needs at least one more segment
// User event occurred: { username: 'john_doe' }
// User event occurred: {}
// User event occurred: { theme: 'dark' }
```

A `*` at the end of a pattern matches one or more segments; anywhere else it matches exactly one (`*.created` matches `user.created` but not `user.profile.created`). A pattern of just `*` matches every event.

## Namespace Support

### Using Namespaces for Event Organization

```typescript
evem.subscribe("namespace.eventName", data => {
  console.log(`Namespace event: ${data}`);
});

evem.publish("namespace.eventName", "Namespace Data");
```

## Customizable Recursion Depth

### Setting and Testing a Custom Recursion Depth

The constructor argument limits how deeply an event can be published from inside its own handlers (default: 3). Here a handler republishes its own event until the limit stops it:

```typescript
const customEvem = new EvEm(5); // Custom max recursion depth

let depth = 0;
customEvem.subscribe("event.recursive", async () => {
  depth++;
  console.log(`Recursive event triggered (depth ${depth})`);
  try {
    // Publish the same event again from inside its own handler
    await customEvem.publish("event.recursive");
  } catch (error) {
    console.error((error as Error).message);
  }
});

await customEvem.publish("event.recursive");
// Recursive event triggered (depth 1)
// Recursive event triggered (depth 2)
// Recursive event triggered (depth 3)
// Recursive event triggered (depth 4)
// Recursive event triggered (depth 5)
// Max recursion depth of 5 exceeded for event 'event.recursive'
```

The publish that goes over the limit returns a rejected promise. Without the `try`/`catch`, the rejection would make the handler fail, and the publish that called it would apply its `errorPolicy` (logging it, by default).

The limit counts publishes that a handler (callback, middleware or transform) starts before its first `await`. A publish started after an `await` begins a new chain and isn't counted, so guard such loops yourself. Independent publishes of the same event that merely overlap in time are not limited.

## Error Handling

### Error Handling in Subscriptions and Publishing

```typescript
// subscribe throws synchronously for an empty event name
try {
  evem.subscribe("", () => {});
} catch (error) {
  console.error(error); // Error: Event name cannot be empty.
}

// publish returns a rejected promise instead of throwing, so await it inside try...
try {
  await evem.publish("");
} catch (error) {
  console.error(error); // Error: Event name cannot be empty.
}

// ...or handle the rejection with .catch
evem.publish("").catch(error => console.error(error)); // Error: Event name cannot be empty.
```

### Errors Thrown by Subscribers

```typescript
import { ErrorPolicy } from "@jcfigueiredo/evem";

evem.subscribe("order.created", () => {
  throw new Error("Inventory service unavailable");
});

// Default (LOG_AND_CONTINUE): the error is logged, other subscribers still run, publish resolves to true
await evem.publish("order.created", { id: 1 });
// Error in event handler for "order.created": Error: Inventory service unavailable

// THROW: publish rejects with the subscriber's error
try {
  await evem.publish("order.created", { id: 2 }, { errorPolicy: ErrorPolicy.THROW });
} catch (error) {
  console.error((error as Error).message); // Inventory service unavailable
}
```

## Cancelable Events

### Basic Cancelable Event

Subscribers of a cancelable event receive the payload with a `cancel()` method and a read-only `canceled` flag added (plain objects and arrays are copied first; primitive payloads are delivered as they are, without `cancel()`). Canceling skips the remaining subscribers and makes `publish` resolve to `false`.

```typescript
import { type CancelableEvent } from "@jcfigueiredo/evem";

interface Payment {
  amount: number;
  availableBalance: number;
}

// Subscribe with a handler that might cancel the event
evem.subscribe<Payment & CancelableEvent>("payment.process", event => {
  // Check if there are sufficient funds
  if (event.amount > event.availableBalance) {
    console.log("Insufficient funds, canceling payment");
    event.cancel();
    return;
  }
  console.log("Payment approved");
});

// Another handler that will only run if the payment wasn't canceled
evem.subscribe<Payment>("payment.process", event => {
  console.log(`Processing payment of $${event.amount}`);
  // Process the payment...
});

// Publish a cancelable event
const paymentData: Payment = { amount: 100, availableBalance: 50 };
const result = await evem.publish("payment.process", paymentData, { cancelable: true });

if (!result) {
  console.log("Payment was canceled");
} else {
  console.log("Payment was processed successfully");
}
// Insufficient funds, canceling payment
// Payment was canceled
```

### Multi-step Validation with Cancelable Events

```typescript
import { type CancelableEvent } from "@jcfigueiredo/evem";

interface Registration {
  email: string;
  password: string;
}

// Step 1: Data validation
evem.subscribe<Registration & CancelableEvent>("account.register", event => {
  if (!event.email || !event.password) {
    console.log("Missing required fields");
    event.cancel();
    return;
  }
}, { priority: "high" });

// Step 2: Business rules
evem.subscribe<Registration & CancelableEvent>("account.register", event => {
  if (event.password.length < 8) {
    console.log("Password too short");
    event.cancel();
    return;
  }
}, { priority: "normal" });

// Step 3: The actual registration process
evem.subscribe<Registration>("account.register", event => {
  console.log("Registering user:", event.email);
  // Save user to database...
}, { priority: "low" });

// Publish with cancelable option
const userData: Registration = { email: "user@example.com", password: "short" };
const registrationComplete = await evem.publish("account.register", userData, { cancelable: true });

console.log(registrationComplete ? "User registered" : "Registration canceled");
// Password too short
// Registration canceled
```

### Timeout with Cancelable Events

A timeout doesn't cancel an event by itself: it goes through the publish `errorPolicy`. Use `ErrorPolicy.CANCEL_ON_ERROR` to have a timeout (or an error thrown by a subscriber) stop the event like `cancel()` does:

```typescript
import { ErrorPolicy, type CancelableEvent } from "@jcfigueiredo/evem";

interface ApiRequest {
  url: string;
  data?: unknown;
}

evem.subscribe<ApiRequest & CancelableEvent>("api.request", async event => {
  try {
    const response = await fetch(event.url);
    if (!response.ok) {
      console.log(`API request failed with status ${response.status}`);
      event.cancel();
      return;
    }
    // Every subscriber receives the same event object, so the next one sees this
    event.data = await response.json();
  } catch (error) {
    console.error("Error fetching API:", error);
    event.cancel();
  }
});

// Runs only if the request succeeded within the timeout
evem.subscribe<ApiRequest>("api.request", event => {
  console.log("Processing API response:", event.data);
});

const apiResult = await evem.publish("api.request",
  { url: "https://api.example.com/data" },
  { cancelable: true, timeout: 5000, errorPolicy: ErrorPolicy.CANCEL_ON_ERROR }
);

console.log(apiResult ? "API request succeeded" : "API request failed, timed out or was canceled");
```

If the first handler takes longer than 5 seconds, `CANCEL_ON_ERROR` logs `Error in event handler for "api.request": Error: Event handler timed out after 5000ms`, skips the second handler and `publish` resolves to `false`. With the default policy the timeout would only be logged: the second handler would run without `data` and `publish` would resolve to `true`. Either way the timed-out handler keeps running; to stop the request itself, give `fetch` a signal such as `AbortSignal.timeout(5000)`.

## WebSocket Adapter Examples

The adapter has its own entry point, `@jcfigueiredo/evem/websocket`. **`WebSocketHandler` is the recommended way to use it**: it connects a WebSocket to an EvEm instance and runs the adapter's other components for you.

- **Connection state**: publishes `ws.connection.state` changes; with `reconnect: true` it reconnects after unexpected closes and publishes `ws.reconnect.failed` when it gives up.
- **Outgoing messages**: sends `ws.send` and `ws.send.*` events (such as `ws.send.chat`) while connected and queues them while offline, sending the queue when the socket opens. Only the payload is sent, as JSON; the event name is not. Names containing `queued` are reserved for the queue.
- **Requests**: `handler.request(method, params?, options?)` sends a request and resolves with the server's response.
- **Incoming messages**: `{ "event": "chat.message", "data": ... }` (or the older `{ "type": "chat.message", "data": ... }`) is published as `server.chat.message`, with `data` as the payload, and responses to requests settle `request()`. Messages with neither field go to `ws.message`, messages that aren't valid JSON to `ws.parse.error`, and socket errors to `ws.error`.

Pass a URL: browsers and Node.js 22.4+ have a global `WebSocket`. To give the socket options the global one doesn't take (headers, say), pass a socket from the `ws` package, or a `WebSocketConstructor` option.

### Connecting with WebSocketHandler

```typescript
import { EvEm } from "@jcfigueiredo/evem";
import { WebSocketHandler, type ConnectionStateChangeEvent } from "@jcfigueiredo/evem/websocket";

const evem = new EvEm();
const handler = new WebSocketHandler("wss://api.example.com", evem);

evem.subscribe<ConnectionStateChangeEvent>("ws.connection.state", ({ from, to }) => {
  console.log(`Connection state: ${from} -> ${to}`);
});

// A server message {"event":"notification.new","data":{"message":"Hi"}} arrives as server.notification.new
evem.subscribe<{ message: string }>("server.notification.*", notification => {
  console.log("Notification:", notification.message);
});

// Sent right away while connected; queued while offline and sent when the socket opens
await evem.publish("ws.send", { type: "chat", text: "Hello!" });
await evem.publish("ws.send.typing", { type: "typing", user: "ana" });

console.log(`Queued: ${handler.getQueueSize()}`);
// Queued: 2   (the socket hasn't opened yet)
// Connection state: disconnected -> connected   (once it opens; both messages are sent then)

// When you're done: closes the socket (without reconnecting) and removes the handler's subscriptions
window.addEventListener("beforeunload", () => void handler.disconnect());
```

### Request-Response with Timeout

```typescript
import { EvEm } from "@jcfigueiredo/evem";
import { RequestTimeoutError, WebSocketHandler } from "@jcfigueiredo/evem/websocket";

interface User {
  id: number;
  name: string;
}

const evem = new EvEm();
const handler = new WebSocketHandler("wss://api.example.com", evem);

try {
  // Sends {"type":"request","id":"<generated id>","method":"getUser","params":{"id":123},"timestamp":...}
  // and resolves with the result of the reply {"type":"response","id":"<same id>","result":{...}}
  const user = await handler.request<User>("getUser", { id: 123 });
  console.log("User:", user.name);

  // Custom timeout (default: 5000 ms) and request id
  const profile = await handler.request("getProfile", { userId: 123 }, { timeout: 10000, id: "profile-123" });
  console.log("Profile:", profile);
} catch (error) {
  if (error instanceof RequestTimeoutError) {
    console.error(`Request ${error.requestId} (${error.method}) timed out after ${error.timeout}ms`);
  } else {
    // An error reply {"type":"response","id":"...","error":{"code":404,"message":"Not found"}}
    // rejects with an Error that has the server's message, code and data
    const { message, code } = error as Error & { code?: number };
    console.error(`Request failed (${code}): ${message}`);
  }
}
```

Requests made while offline are queued like other messages and sent when the socket opens, but their timeout starts when `request()` is called. A request that times out while it's still queued is sent anyway when the socket opens, and its response is ignored.

### Concurrent Requests

Each request has its own id, so responses can arrive in any order. This uses the `handler` from the previous example:

```typescript
interface User {
  id: number;
  name: string;
}

interface Post {
  id: number;
  title: string;
}

async function loadUserDashboard(userId: number) {
  try {
    // Make all requests in parallel
    const [user, posts, comments, notifications] = await Promise.all([
      handler.request<User>("getUser", { id: userId }),
      handler.request<Post[]>("getPosts", { userId }),
      handler.request<unknown[]>("getComments", { userId }),
      handler.request<unknown[]>("getNotifications", { userId })
    ]);

    console.log("User:", user.name);
    console.log("Posts:", posts.length);
    console.log("Comments:", comments.length);
    console.log("Notifications:", notifications.length);

    return { user, posts, comments, notifications };
  } catch (error) {
    console.error("Failed to load dashboard:", error);
    throw error;
  }
}

// Load dashboard for user 123
const dashboard = await loadUserDashboard(123);
```

### Complete WebSocket Chat Application

```typescript
import { EvEm } from "@jcfigueiredo/evem";
import {
  RequestTimeoutError,
  WebSocketHandler,
  type ConnectionStateChangeEvent
} from "@jcfigueiredo/evem/websocket";

interface ChatMessage {
  user: string;
  text: string;
}

class ChatClient {
  private readonly evem = new EvEm();
  private readonly handler: WebSocketHandler;

  constructor(url: string) {
    this.handler = new WebSocketHandler(url, this.evem, {
      queueSize: 100,           // messages kept while offline (the oldest is dropped when full)
      reconnect: true,          // reconnect after unexpected closes...
      reconnectDelay: 5000,     // ...5 seconds after each close
      maxReconnectAttempts: 10  // ...then give up (ws.reconnect.failed)
    });

    this.evem.subscribe<ConnectionStateChangeEvent>("ws.connection.state", ({ from, to }) => {
      console.log(`Connection: ${from} -> ${to}`);
    });

    this.evem.subscribe<{ attempts: number }>("ws.reconnect.failed", ({ attempts }) => {
      console.error(`Gave up reconnecting after ${attempts} attempts`);
    });

    this.evem.subscribe<{ maxSize: number; droppedMessage: unknown }>("ws.queue.overflow", event => {
      console.warn("Offline queue full, dropped:", event.droppedMessage);
    });
  }

  /** Sent right away while connected; queued while offline and sent once reconnected */
  async sendMessage(text: string): Promise<void> {
    // Only the payload goes over the wire, so it says what kind of message it is
    await this.evem.publish("ws.send.chat", { type: "message", text });
  }

  /** Request-response: resolves with the server's result (or rejects on error or timeout) */
  getHistory(limit = 50): Promise<ChatMessage[]> {
    return this.handler.request<ChatMessage[]>("getHistory", { limit }, { timeout: 10000 });
  }

  /** The server sends {"event":"chat.message","data":{...}}, which arrives as server.chat.message */
  onMessage(callback: (message: ChatMessage) => void): () => void {
    const id = this.evem.subscribe<ChatMessage>("server.chat.message", callback);
    return () => this.evem.unsubscribeById(id);
  }

  /** Closes the connection for good: no reconnection, pending requests are rejected */
  disconnect(): Promise<void> {
    return this.handler.disconnect();
  }
}

// Usage
const chat = new ChatClient("wss://chat.example.com");

// Listen for messages
const stopListening = chat.onMessage(message => {
  console.log(`${message.user}: ${message.text}`);
});

// Send messages (queued until the socket opens)
await chat.sendMessage("Hello, world!");

// Use request-response
try {
  const history = await chat.getHistory(50);
  console.log(`Loaded ${history.length} messages`);
} catch (error) {
  if (error instanceof RequestTimeoutError) {
    console.error(`getHistory timed out after ${error.timeout}ms`);
  } else {
    console.error("getHistory failed:", (error as Error).message);
  }
}

// Disconnect when done
stopListening();
await chat.disconnect();
// Connection: disconnected -> connected
// ...
// Connection: connected -> disconnecting
// Connection: disconnecting -> disconnected
```

### Using the Components Directly

`WebSocketHandler` is built from three components that also work on their own, for example to wire a transport yourself. Each takes the EvEm instance. Without the handler, your code drives the connection state, sends outgoing messages and publishes responses.

#### Connection State with ConnectionManager

```typescript
import { EvEm } from "@jcfigueiredo/evem";
import { ConnectionManager, type ConnectionStateChangeEvent } from "@jcfigueiredo/evem/websocket";

const evem = new EvEm();
const connectionManager = new ConnectionManager(evem); // starts 'disconnected'

// Track connection state changes
evem.subscribe<ConnectionStateChangeEvent>("ws.connection.state", event => {
  console.log(`Connection state: ${event.from} -> ${event.to}`);
});

// transitionTo publishes ws.connection.state and resolves once its subscribers have run.
// It accepts any state: the order of transitions is up to you.
await connectionManager.transitionTo("connecting");
// ... open the connection ...
await connectionManager.transitionTo("connected");

// Use state queries (also isConnecting, isDisconnected, isDisconnecting, isReconnecting, getState)
if (connectionManager.isConnected()) {
  console.log("Ready to send messages");
}
// Connection state: disconnected -> connecting
// Connection state: connecting -> connected
// Ready to send messages
```

#### Offline Queue with MessageQueue

```typescript
import { EvEm } from "@jcfigueiredo/evem";
import { ConnectionManager, MessageQueue } from "@jcfigueiredo/evem/websocket";

const evem = new EvEm();
const connectionManager = new ConnectionManager(evem); // starts 'disconnected'
const messageQueue = new MessageQueue(evem, connectionManager);

// Queue up to 2 messages while not connected, and flush them when the state changes to 'connected'
messageQueue.enable(2, { autoFlush: true });

// Flushed messages are published to ws.send.queued: send them to your connection here
evem.subscribe("ws.send.queued", data => {
  console.log("Sending queued message:", data);
});

// Handle queue overflow (the oldest message is dropped)
evem.subscribe<{ maxSize: number; droppedMessage: unknown }>("ws.queue.overflow", event => {
  console.warn(`Queue full (max ${event.maxSize}), dropped:`, event.droppedMessage);
});

// While not connected, ws.send and ws.send.* events are queued
await evem.publish("ws.send", { type: "chat", text: "Hello World!" });
await evem.publish("ws.send.chat", { type: "chat", text: "ws.send.* events are queued too" });
await evem.publish("ws.send", { type: "chat", text: "Third message" });

console.log(`Queue size: ${messageQueue.getQueueSize()}`);

// When the connection is established, the queue is flushed
await connectionManager.transitionTo("connected");
// Queue full (max 2), dropped: { type: 'chat', text: 'Hello World!' }
// Queue size: 2
// Sending queued message: { type: 'chat', text: 'ws.send.* events are queued too' }
// Sending queued message: { type: 'chat', text: 'Third message' }
```

The queue only stores messages published while not connected, and a flushed message keeps its payload but not its event name. Sending messages published while connected is up to you here; `WebSocketHandler` sends `ws.send`, `ws.send.*` and flushed messages for you.

#### Request-Response with RequestResponseManager

```typescript
import { EvEm } from "@jcfigueiredo/evem";
import { RequestResponseManager, type RequestMessage } from "@jcfigueiredo/evem/websocket";

const evem = new EvEm();
const requestResponse = new RequestResponseManager(evem);

// Requests are published to ws.send.request: send them to your connection here.
// This stand-in for the server answers right away, publishing ws.response with the same id
// (an error reply goes to ws.response.error as { id, error: { code, message }, timestamp })
evem.subscribe<RequestMessage>("ws.send.request", request => {
  console.log(`Sending request: ${request.method}`);
  void evem.publish("ws.response", {
    id: request.id,
    result: { sum: request.params.a + request.params.b },
    timestamp: Date.now()
  });
});

const result = await requestResponse.request("add", { a: 2, b: 3 }, { timeout: 1000 });
console.log("Result:", result);
// Sending request: add
// Result: { sum: 5 }

// Stop listening for responses and reject any pending requests
requestResponse.cleanup();
```

These examples demonstrate the WebSocket adapter's capabilities for building robust real-time applications with EvEm.
