# EvEm - Simple Event Emitter Library 📢

EvEm is a lightweight and flexible event emitter library for TypeScript, providing a simple yet powerful pub/sub system. It handles both synchronous and asynchronous callbacks, and adds wildcards, priorities, middleware, filters, throttling, debouncing, schema validation and event history on top. Optional adapters connect it to a server over WebSocket or Server-Sent Events.

## Features

- **🔗 Event Subscription**: Subscribe to events with callbacks. Each subscription returns a unique id (a UUID) that you can use to unsubscribe.
  - `subscribe<T>(event, callback, options?): string`
- **❌ Event Unsubscription**: Stop receiving an event.
  - `unsubscribe(event, callback)` removes the subscription made with that callback, with or without options
  - `unsubscribeById(id)` removes the subscription with the id returned by `subscribe`
- **🔄 Once-only Events**: `subscribeOnce(event, callback)` or `subscribe(event, callback, { once: true })` unsubscribes after the first event it handles.
- **📣 Event Publishing**: `publish<T>(event, data?, options?)` returns a promise that resolves to `true` once the subscribers have run, or `false` if the event was canceled. Options set the timeout, the error policy and whether the event is cancelable.
- **⏱️ Asynchronous and Synchronous Callbacks**: Callbacks can be plain or `async` functions. Async callbacks are awaited one after the other, in priority order.
- **📚 Namespace Support**: Organize events with dot-separated names such as `user.profile.updated`.
- **🌟 Wildcard Event Names**: Subscribe to patterns such as `user.*`, `*.created` or `system.*.error` (see [the rules](#using-wildcards-in-event-subscription)).
- **🥇 Event Priority**: Control the order subscribers run in with `'high'`, `'normal'`, `'low'`, the `Priority` enum or any number (higher runs first).
- **🔍 Event Filtering**: Run a callback only for events whose data passes one or more predicates, sync or async.
- **🔄 Event Throttling**: Handle at most one event per time window. The first one is handled immediately.
- **⏲️ Event Debouncing**: Handle only the last event of a burst, once events have stopped arriving for a while.
- **🛑 Cancelable Events**: Publish with `cancelable: true`, and any subscriber can call `cancel()` to stop the subscribers after it.
- **🔄 Event Transformation**: A subscriber can transform the data that the subscribers after it receive.
- **🔄 Middleware Support**: Intercept events before they reach subscribers to modify their data, reroute them to another event name or cancel them, for all events or for event patterns.
- **⚠️ Error Policies**: Choose per publish whether callback errors are logged, ignored, stop the event or reject the `publish` promise.
- **⏱️ Timeouts for Asynchronous Callbacks**: `publish` waits up to 5 seconds (configurable) for each async callback, then reports it through the error policy and moves on.
- **🔒 Event Schema Validation**: Validate event data per subscriber, with simple (boolean) or detailed validators, sync or async.
- **📜 Event History**: Record events and replay them to late subscribers.
- **🔍 Memory Leak Detection**: Get a warning when an event collects more subscriptions than expected.
- **🌀 Recursion Protection**: Limit how deeply an event can re-publish itself from its own handlers (default depth 3, set in the constructor).
- **🔍 Debugging Support**: Inspect subscriptions and middleware with `info()`.
- **🛠️ Error Handling**: Empty event names throw (`subscribe`, `unsubscribe`) or reject (`publish`). Errors in callbacks are handled by the error policy.
- **🔌 WebSocket Adapter**: An optional entry point that connects EvEm to a WebSocket server, with offline queueing, reconnection and request-response calls.
- **📡 Server-Sent Events Adapter**: An optional entry point that receives a server's event stream as EvEm events, with auth headers, reconnection with backoff and resuming with `Last-Event-ID`, plus helpers that write the stream format on JavaScript and Python servers.

## Getting on Board

### Installation

EvEm is published on npm as `@jcfigueiredo/evem`. It's an ES module with TypeScript types and no runtime dependencies, and needs Node.js 20 or later (or any modern browser or bundler).

```bash
pnpm add @jcfigueiredo/evem
# or
npm install @jcfigueiredo/evem
# or
yarn add @jcfigueiredo/evem
```

The core lives in the main entry point, and each optional adapter in its own:

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';
import { SseHandler } from '@jcfigueiredo/evem/sse';
import { formatSseMessage, SSE_HEADERS } from '@jcfigueiredo/evem/sse/server'; // for servers
```

## Quick Start

Jump right in!

```typescript
import { EvEm, type CancelableEvent } from "@jcfigueiredo/evem";

const evem = new EvEm();

// Subscribe to a party start event
evem.subscribe("party.start", () => {
  console.log("Let's get this party started!");
});

// Publish the party start event. The promise resolves once the callbacks have run
await evem.publish("party.start");
// Output: Let's get this party started!

// Callbacks receive the published data. Its type is `unknown` unless you give one
interface Guest {
  name: string;
  vip: boolean;
}

evem.subscribe<Guest>("party.guest.arrived", (guest) => {
  console.log(`Welcome, ${guest.name}!`);
});

await evem.publish<Guest>("party.guest.arrived", { name: "Alice", vip: false });
// Output: Welcome, Alice!

// Async callbacks are awaited before the next one runs
evem.subscribe("party.end", async () => {
  console.log("Wrapping up the party...");
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulating async work
  console.log("Party ended.");
});

await evem.publish("party.end");
// Output:
// Wrapping up the party...
// Party ended.

// Unsubscribe with the callback, or with the id subscribe() returned
const danceCallback = () => console.log("Time to dance!");
evem.subscribe("party.dance", danceCallback);
const musicSubId = evem.subscribe("party.music", () => console.log("Music is playing!"));

evem.unsubscribe("party.dance", danceCallback);
evem.unsubscribeById(musicSubId);

// Wildcards: "party.*" matches party.start, party.guest.arrived, ...
evem.subscribe("party.*", () => console.log("Something happened at the party"));

// Filters: only VIP guests
evem.subscribe<Guest>("party.guest.arrived", (guest) => {
  console.log(`VIP alert: ${guest.name}`);
}, {
  filter: (guest) => guest.vip
});

// Priorities: higher runs first ('high' = 100, 'normal' = 0, 'low' = -100);
// equal priorities run in the order they subscribed
evem.subscribe("party.guest.arrived", () => {
  console.log("Open the door");
}, { priority: 'high' });

await evem.publish<Guest>("party.guest.arrived", { name: "Bob", vip: true });
// Output:
// Open the door
// Welcome, Bob!
// Something happened at the party
// VIP alert: Bob

// Cancelable events: a subscriber can stop the ones after it
interface SignupForm {
  email: string;
  isValid: boolean;
}

evem.subscribe<SignupForm & CancelableEvent>("form.submit", (form) => {
  console.log("Validating form...");
  if (!form.isValid) {
    console.log("Form validation failed, canceling submission.");
    form.cancel(); // Stop further processing
    return;
  }
  console.log("Form validation passed.");
});

evem.subscribe<SignupForm>("form.submit", (form) => {
  // Doesn't run when the first subscriber cancels the event
  console.log(`Submitting ${form.email} to the server...`);
});

const formData: SignupForm = { email: "alice@example.com", isValid: false };
const eventCompleted = await evem.publish("form.submit", formData, { cancelable: true });

console.log(eventCompleted ? "Form submitted successfully" : "Form submission was canceled");
// Output:
// Validating form...
// Form validation failed, canceling submission.
// Form submission was canceled
```

The sections below cover each feature in detail, including schema validation, event history and memory leak detection.

## How an Event Is Processed

When you call `publish(event, data, options)`:

1. **Middleware** runs in registration order. Each middleware whose pattern matches the event name (middleware without a pattern sees every event) receives the data returned by the previous one. Returning `null` cancels the event; returning a new `{ event, data }` object reroutes it (see [Middleware](#middleware)).
2. The event is recorded in **history**, if enabled, with the data as the middleware left it.
3. If the event is **cancelable**, `cancel()` and `canceled` are added to the data.
4. **Subscribers** whose event name or pattern matches run one at a time, highest priority first. Equal priorities run in the order they subscribed, also across different patterns. For each subscriber, its options apply in this order:
   1. schema validation
   2. filters
   3. throttle/debounce
   4. once (the subscription is removed just before the callback runs)
   5. the callback (an async callback is awaited, up to the publish `timeout`)
   6. the subscriber's transform, whose result is what the following subscribers receive
5. The promise resolves to `true`, or to `false` if a middleware returned `null` (or threw), a subscriber called `cancel()`, or an error stopped the event under `ErrorPolicy.CANCEL_ON_ERROR`. It rejects when an error occurs under `ErrorPolicy.THROW`, when a schema check fails with `schemaErrorPolicy: ErrorPolicy.THROW`, and when the event name is empty or the [recursion limit](#recursion-protection) is exceeded.

An event stopped at one step doesn't reach the later steps of that subscriber: an event rejected by a filter doesn't start a throttle window or use up a `once` subscription, and a transform only applies when its own callback handled the event during the publish.

## Using Wildcards in Event Subscription

EvEm supports wildcard patterns in event subscriptions, allowing for more dynamic and flexible event handling. Event names are split on dots into segments, and `*` stands for segments:

| Pattern | Matches | Doesn't match |
|---|---|---|
| `*` | every event | |
| `user.*` | `user.login`, `user.profile.updated` | `user` |
| `*.created` | `user.created` | `admin.user.created` |
| `system.*.error` | `system.db.error` | `system.error`, `system.db.pool.error` |

- `*` on its own matches every event.
- A `*` at the end of a pattern matches **one or more** segments. `user.*` doesn't match `user` itself; subscribe to both if you need both.
- A `*` at the start or in the middle of a pattern matches **exactly one** segment.
- Wildcards work in subscription patterns, middleware patterns, `getEventHistory()` and `info()`. Publish concrete event names.

### Subscribe to All Events in a Category

```typescript
// Subscribe to all events that start with 'network.'
evem.subscribe("network.*", data => {
  console.log("Network event occurred:", data);
});
```

### Using Wildcards for Multi-level Events

```typescript
// Subscribe to events like 'system.db.error' or 'system.cache.error'
evem.subscribe("system.*.error", error => {
  console.error("System error detected:", error);
});
```

## Middleware

EvEm allows you to register middleware functions that can intercept, transform, or cancel events before they reach subscribers. Middleware runs in registration order; each one receives the event name and the data returned by the previous one.

### Basic Middleware Usage

```typescript
import { EvEm, type MiddlewareFunction } from "@jcfigueiredo/evem";
const evem = new EvEm();

// Create a middleware that adds metadata to all events
const addMetadataMiddleware: MiddlewareFunction = (event, data) => {
  return {
    ...data,
    timestamp: Date.now(),
    eventName: event
  };
};

// Register the middleware
evem.use(addMetadataMiddleware);

interface LoginEvent {
  username: string;
  timestamp: number;
  eventName: string;
}

// Register an event handler that can use the metadata
evem.subscribe<LoginEvent>('user.login', (data) => {
  console.log(`User logged in at ${new Date(data.timestamp).toISOString()}`);
  console.log(`Event: ${data.eventName}`);
  console.log(`Username: ${data.username}`);
});

// Publish an event
await evem.publish('user.login', { username: 'alice' });
// Output (with the current time):
// User logged in at 2026-10-02T15:30:45.123Z
// Event: user.login
// Username: alice
```

### Pattern-Based Middleware

You can apply middleware to specific event patterns, allowing for more targeted event processing:

```typescript
import { EvEm, type MiddlewareConfig } from "@jcfigueiredo/evem";
const evem = new EvEm();

// Middleware that only applies to user events
const userEventsMiddleware: MiddlewareConfig = {
  pattern: 'user.*',
  handler: (event, data) => {
    console.log(`Processing user event: ${event}`);
    return {
      ...data,
      audit: { eventType: 'user' }
    };
  }
};

// Middleware that only applies to creation events
const creationEventsMiddleware: MiddlewareConfig = {
  pattern: '*.created',
  handler: (event, data) => {
    console.log(`Processing creation event: ${event}`);
    return {
      ...data,
      isNew: true
    };
  }
};

// Register both middleware with their patterns
evem.use(userEventsMiddleware);
evem.use(creationEventsMiddleware);

// Subscribe to see the results
evem.subscribe('user.created', (data) => {
  console.log('User created:', data);
});

// These events will trigger different middleware
await evem.publish('user.login', { id: 1 });      // Only the user middleware runs
await evem.publish('product.created', { id: 2 }); // Only the creation middleware runs
await evem.publish('user.created', { id: 3 });    // Both run, in registration order
// Output:
// Processing user event: user.login
// Processing creation event: product.created
// Processing user event: user.created
// Processing creation event: user.created
// User created: { id: 3, audit: { eventType: 'user' }, isNew: true }
```

### Event Transformation and Redirection

Middleware can also redirect events to a different event name:

```typescript
import type { MiddlewareFunction } from "@jcfigueiredo/evem";

// Create a middleware that redirects events based on roles
const routingMiddleware: MiddlewareFunction = (event, data) => {
  if (event === 'user.action' && data.role === 'admin') {
    // Redirect admin actions to a special admin event
    return {
      event: 'admin.action',
      data
    };
  }
  return data;
};

// Register the middleware
evem.use(routingMiddleware);

// Set up handlers for both regular user actions and admin actions
evem.subscribe('user.action', (data) => {
  console.log('Regular user action:', data);
});

evem.subscribe('admin.action', (data) => {
  console.log('Admin action (redirected):', data);
});

// Publish events - they will be routed based on the role
await evem.publish('user.action', { role: 'user', action: 'view' });
// Output: Regular user action: { role: 'user', action: 'view' }

await evem.publish('user.action', { role: 'admin', action: 'delete' });
// Output: Admin action (redirected): { role: 'admin', action: 'delete' }
```

A redirect is a **new** object with **exactly two** properties, `event` (a string) and `data`. Returning the original data unchanged, or a copy with extra properties, never redirects, even when the payload itself has `event` and `data` fields, like `{ event: 'chat.send', data: {...} }` messages sent over `ws.send`. After a redirect, later middleware is matched against the new event name, the subscribers of the new event receive it, and history records it under the new name.

### Event Filtering with Middleware

Middleware can be used to filter or cancel events based on global conditions. Returning `null` cancels the event: no subscriber receives it and `publish` resolves to `false`. A middleware that throws also cancels the event (the error is logged).

```typescript
import type { MiddlewareFunction } from "@jcfigueiredo/evem";

// Create a middleware that implements a permissions system
const permissionsMiddleware: MiddlewareFunction = (event, data) => {
  // Check if this event requires permissions
  if (event.startsWith('secure.')) {
    // Check if the user has permissions
    if (!data.user?.permissions?.includes('admin')) {
      // Cancel the event by returning null
      console.log('Access denied: Admin permission required');
      return null;
    }
  }
  return data;
};

// Register the middleware
evem.use(permissionsMiddleware);

// Handler will only be called if permissions check passes
evem.subscribe('secure.data.access', (data) => {
  console.log('Accessing secure data:', data);
});

// This will be canceled by the middleware
await evem.publish('secure.data.access', { user: { name: 'bob', permissions: ['user'] } });
// Output: Access denied: Admin permission required

// This will pass the middleware check
await evem.publish('secure.data.access', { user: { name: 'alice', permissions: ['admin'] } });
// Output: Accessing secure data: { user: { name: 'alice', permissions: [ 'admin' ] } }
```

## Error Policy Configuration

EvEm allows you to configure, per publish, how errors in event callbacks are handled through different error policies.

### Using Different Error Policies

```typescript
import { EvEm, ErrorPolicy } from "@jcfigueiredo/evem";
const evem = new EvEm();

// Register handlers
evem.subscribe<{ isValid: boolean }>('process.data', (data) => {
  // This handler might throw
  if (!data.isValid) {
    throw new Error('Invalid data format');
  }
  console.log('Processing data:', data);
});

evem.subscribe('process.data', () => {
  console.log('Second handler ran');
});

// Default behavior: log the error and continue
await evem.publish('process.data', { isValid: false });
// Logs: Error in event handler for "process.data": Error: Invalid data format ...
// Output: Second handler ran

// Silent policy: ignore errors completely
await evem.publish('process.data', { isValid: false }, {
  errorPolicy: ErrorPolicy.SILENT
});
// Output: Second handler ran

// Cancel policy: log the error and stop the event
const completed = await evem.publish('process.data', { isValid: false }, {
  errorPolicy: ErrorPolicy.CANCEL_ON_ERROR
});
// Logs: Error in event handler for "process.data": Error: Invalid data format ...
console.log(completed);
// Output: false

// Throw policy: stop the event and reject with the error
try {
  await evem.publish('process.data', { isValid: false }, {
    errorPolicy: ErrorPolicy.THROW
  });
} catch (error) {
  console.error('Caught error from event handler:', error);
  // Handle the error at the caller level
}
```

| Policy | The error | Remaining subscribers | `publish` |
|---|---|---|---|
| `LOG_AND_CONTINUE` (default) | logged with `console.error` | run | resolves `true` |
| `SILENT` | ignored | run | resolves `true` |
| `CANCEL_ON_ERROR` | logged | skipped | resolves `false` |
| `THROW` | passed to the caller | skipped | rejects with the error |

The policy applies to errors thrown by callbacks and transforms (including rejected promises), and to [timeouts](#managing-timeouts-in-callbacks). When a transform fails and the event continues, the next subscribers receive the data unchanged. Other errors are handled where they happen:

- A filter that throws is logged and counts as rejecting the event.
- A middleware that throws is logged and cancels the event (`publish` resolves `false`).
- A failed schema validation follows the subscription's `schemaErrorPolicy` (see [Schema Validation](#schema-validation)).
- Debounced calls and history replays run outside any `publish`, so their errors are logged.

### Use Cases for Different Error Policies

Different error policies are useful in different scenarios:

- **LOG_AND_CONTINUE**: Good for non-critical handlers where failures should be noted but not impact other handlers
- **SILENT**: Useful for optional features where errors shouldn't clutter logs
- **CANCEL_ON_ERROR**: Good for validation chains where any failure should halt the process
- **THROW**: Useful when the caller needs to handle errors from event handlers directly

## Managing Timeouts in Callbacks

`publish` waits for each async callback (and each async transform) before running the next subscriber, but only up to a timeout: 5000 ms by default, or the `timeout` you pass. The timeout applies to each callback separately, not to the whole publish.

```typescript
import { ErrorPolicy } from "@jcfigueiredo/evem";

// Wait up to 3000 ms for each callback of this event
await evem.publish("network.request", requestData, 3000);

// The same, combined with other options
await evem.publish("network.request", requestData, {
  timeout: 3000,
  errorPolicy: ErrorPolicy.THROW
});

// Uses the default 5000 ms timeout
await evem.publish("data.process", processData);
```

### Handling Timeout Exceedance

A callback that takes longer than the timeout is reported as an error, `Event handler timed out after 3000ms`, and handled by the publish [error policy](#error-policy-configuration): logged by default, ignored with `SILENT`, stopping the event with `CANCEL_ON_ERROR` and rejecting `publish` with `THROW`. `publish` stops waiting for it, but **the callback itself keeps running**: JavaScript can't stop a running function. If the work should stop too, give it its own deadline, for example with `fetch(url, { signal: AbortSignal.timeout(3000) })`.

```typescript
import { EvEm, ErrorPolicy } from "@jcfigueiredo/evem";
const evem = new EvEm();

evem.subscribe("report.generate", async () => {
  await new Promise(resolve => setTimeout(resolve, 2000)); // Slow work
  console.log("Report finished");
});

try {
  await evem.publish("report.generate", undefined, {
    timeout: 500,
    errorPolicy: ErrorPolicy.THROW
  });
} catch (error) {
  console.log((error as Error).message);
}
// Output:
// Event handler timed out after 500ms
// Report finished   <- 1.5 seconds later: the callback wasn't stopped
```

A transform that times out is handled the same way (`Transform timed out after 500ms`), and the next subscribers receive the data unchanged.

## Throttling Events

EvEm provides built-in throttling, which is useful when you need to limit the rate at which events are processed.

### Basic Throttling

The first event is handled immediately and starts a time window; events published during the window are dropped (not delayed).

```typescript
// Handle scroll events at most once every 200ms
evem.subscribe('window.scroll', updateScrollIndicator, {
  throttleTime: 200
});

await evem.publish('window.scroll', { position: 100 }); // Handled immediately
await evem.publish('window.scroll', { position: 120 }); // Dropped (within the throttle window)
await evem.publish('window.scroll', { position: 150 }); // Dropped (within the throttle window)

await new Promise(resolve => setTimeout(resolve, 200)); // ... 200ms later ...

await evem.publish('window.scroll', { position: 300 }); // Handled (new throttle window)
```

### Combining Throttle with Filters

Throttling can be combined with filters to control both the rate and conditions of event handling. Filters run first, so events they reject don't start a throttle window:

```typescript
let lastValue = 0;

// Process large value changes at most once every 500ms
evem.subscribe<{ value: number }>('sensor.reading', (reading) => {
  lastValue = reading.value;
  updateDisplay(reading);
}, {
  throttleTime: 500,
  filter: (reading) => Math.abs(reading.value - lastValue) > 5
});
```

Throttling is ideal for scenarios where you need to limit the frequency of potentially expensive operations while still ensuring responsive handling of the first event in a sequence.

## Debouncing Events

EvEm provides built-in debouncing, which is useful when you need to limit how often a callback is triggered in response to rapidly occurring events.

### Basic Debouncing

Each event restarts the timer; the callback runs once, `debounceTime` ms after the last event, with that event's data.

```typescript
// Only handle the last resize event once resizing pauses for 300ms
evem.subscribe('window.resize', updateLayout, {
  debounceTime: 300
});

// These will all be collapsed into one call: updateLayout({ width: 820, height: 610 }), 300ms later
await evem.publish('window.resize', { width: 800, height: 600 });
await evem.publish('window.resize', { width: 810, height: 600 });
await evem.publish('window.resize', { width: 820, height: 610 });
```

A debounced call happens after `publish` has resolved, so it's outside the publish: `publish` doesn't wait for it, its errors are logged instead of going through the error policy, and the subscriber's transform isn't applied.

### Combining Debounce with Filters

Debouncing can be combined with filtering for powerful control over event processing. Events the filters reject don't restart the timer:

```typescript
interface AppNotification {
  importance: 'high' | 'low';
  from: string;
  text: string;
}

// Debounce important notifications from the system
evem.subscribe<AppNotification>('notification.received', (notification) => {
  showNotification(notification.text);
}, {
  debounceTime: 500,
  filter: (notification) =>
    notification.importance === 'high' &&
    notification.from === 'system'
});
```

### Combining Throttle and Debounce

With both options, an event is handled immediately when more than `throttleTime` ms have passed since the last event that was handled immediately. Other events are debounced: the latest one is handled `debounceTime` ms after it arrived, unless an event is handled immediately first. While events keep coming, the callback runs at the start of each throttle window, and once they stop, one more time with the last event:

```typescript
// While the user types: suggest at most every 300ms, and once more 500ms after the last keystroke
evem.subscribe('user.typing', suggestCompletions, {
  throttleTime: 300,
  debounceTime: 500
});
```

This combination is particularly useful for handling scenarios like:
- Autocomplete suggestions - show results while the user types, and for the final input
- Infinite scrolling - load while the user scrolls, and once more where scrolling stops
- Progress updates - show updates at a steady rate, and always the final one

## Using Cancelable Events

EvEm provides support for cancelable events, allowing event handlers to stop the propagation of events to other handlers.

### Publishing Cancelable Events

```typescript
// Publish an event with the cancelable option
const result = await evem.publish('user.login', userData, { cancelable: true });

// Check if the event completed or was canceled
if (!result) {
  console.log('Login was canceled by one of the handlers');
}
```

### Canceling Events in Handlers

Subscribers of a cancelable event receive the published data with two extra members: `cancel()`, which stops the subscribers after this one (and this subscriber's own transform), and `canceled`, which tells whether the event has been canceled. The `CancelableEvent` type describes them.

```typescript
import { EvEm, type CancelableEvent } from "@jcfigueiredo/evem";
const evem = new EvEm();

interface DeleteRequest {
  userId: number;
  requestedBy: { role: string };
}

// Permission check handler (high priority, so it runs first)
evem.subscribe<DeleteRequest & CancelableEvent>('user.delete', (event) => {
  if (event.requestedBy.role !== 'admin') {
    console.log('Permission denied: Only admins can delete users');
    event.cancel(); // Stop propagation
    return;
  }
  console.log('Permission granted');
}, { priority: 'high' });

// Action handler - will only execute if the event wasn't canceled
evem.subscribe<DeleteRequest>('user.delete', (event) => {
  console.log('Deleting user:', event.userId);
});

const deleted = await evem.publish<DeleteRequest>('user.delete', {
  userId: 42,
  requestedBy: { role: 'editor' }
}, { cancelable: true });
console.log(deleted);
// Output:
// Permission denied: Only admins can delete users
// false
```

How the data is delivered depends on its type:

- **Plain objects** are shallow-copied, and the copy gets `cancel()` and `canceled`. A missing payload becomes `{}`, so it can be canceled too.
- **Arrays** are copied and stay arrays.
- **Other objects** (`Date`, `Map`, class instances) are wrapped in a proxy that keeps their type and methods.
- **Primitives** (strings, numbers, booleans, `null`) are delivered unchanged, without `cancel()`. Wrap them in an object if a subscriber needs to cancel.

History records the data without `cancel()` and `canceled`.

### Use Cases for Cancelable Events

Cancelable events are ideal for:

- **Validation Chains**: Cancel if data fails validation
- **Permission Systems**: Stop operations if user lacks permissions
- **Multi-step Processes**: Halt a process if any step fails
- **Confirmation Flows**: Allow user to reject an action
- **Interceptors**: Let monitoring systems block actions under certain conditions

### Combining with Priority

Cancelable events work well with priorities to ensure critical checks happen before resource-intensive operations:

```typescript
import type { CancelableEvent } from "@jcfigueiredo/evem";

// High priority security check runs first
evem.subscribe<CancelableEvent>('document.save', (event) => {
  if (!isAuthenticated()) {
    event.cancel();
  }
}, { priority: 'high' });

// Normal priority business logic only runs if security check passes
evem.subscribe('document.save', (document) => {
  saveDocument(document);
}, { priority: 'normal' });
```

## Using Once-Only Events

EvEm provides once-only events that automatically unsubscribe after being triggered once, perfect for one-time operations.

### Basic Once-Only Subscription

```typescript
// Using the dedicated method
evem.subscribeOnce<{ name: string }>('user.initial-login', (userData) => {
  console.log('Welcome to the app!', userData.name);
  showOnboardingTutorial();
});

// Or using the once option
evem.subscribe('app.ready', initializeApp, { once: true });
```

The subscription is removed just before the callback runs, so it fires exactly once, even when events arrive concurrently or are replayed from history.

### Combining Once with Other Options

Once-only events can be combined with filters, throttling and debouncing. Only an event that gets through them uses up the subscription:

```typescript
// Only execute once, for the first important notification
evem.subscribeOnce<{ type: string; message: string }>('notification', (notification) => {
  showWelcomeDialog(notification.message);
}, {
  filter: (notification) => notification.type === 'important',
  debounceTime: 100 // In case multiple notifications arrive simultaneously
});
```

This is ideal for:
- One-time initialization
- Welcome messages or onboarding flows
- Alert dialogs that should only appear once
- Feature highlights that should only be shown on first encounter

## Prioritizing Events

EvEm allows you to assign priorities to event handlers, giving you control over the execution order when multiple callbacks are triggered by the same event. Handlers with equal priority run in the order they subscribed, also when they subscribed with different patterns.

### Basic Priority Levels

```typescript
// Subscribe with different priority levels
evem.subscribe('system.startup', () => {
  console.log('Database connection established');
}, { priority: 'high' }); // Executes first

evem.subscribe('system.startup', () => {
  console.log('Middleware initialized');
}, { priority: 'normal' }); // Executes second

evem.subscribe('system.startup', () => {
  console.log('Analytics tracking started');
}, { priority: 'low' }); // Executes last

// Publish the event
await evem.publish('system.startup');
// Output:
// Database connection established
// Middleware initialized
// Analytics tracking started
```

### Using the Priority Enum

For better type safety and code readability, you can use the built-in Priority enum:

```typescript
import { EvEm, Priority } from '@jcfigueiredo/evem';
const evem = new EvEm();

// Subscribe with Priority enum values
evem.subscribe('app.init', () => {
  console.log('Load core services');
}, { priority: Priority.HIGH });  // Same as 100

evem.subscribe('app.init', () => {
  console.log('Initialize UI components');
}, { priority: Priority.NORMAL }); // Same as 0

evem.subscribe('app.init', () => {
  console.log('Start analytics');
}, { priority: Priority.LOW });  // Same as -100

await evem.publish('app.init');
```

### Fine-Grained Control with Numeric Priorities

For more granular control, you can use numeric priorities:

```typescript
// More precise control with numeric priorities
evem.subscribe('render', () => {
  console.log('Draw background');
}, { priority: 100 });  // Highest priority - executes first

evem.subscribe('render', () => {
  console.log('Draw main content');
}, { priority: 50 });   // Medium priority - executes second

evem.subscribe('render', () => {
  console.log('Draw UI overlay');
}, { priority: 20 });   // Low priority - executes third

evem.subscribe('render', () => {
  console.log('Draw debug information');
}, { priority: -10 });  // Negative priority - executes last

await evem.publish('render');
```

### Combining Priority with Other Features

Priority can be combined with other features like filters, throttling, or debouncing:

```typescript
interface UserAction {
  role: string;
  action: string;
  actionType: string;
}

// Priority with filter
evem.subscribe<UserAction>('user.action', (user) => {
  console.log('Critical admin action detected:', user.action);
}, {
  priority: 'high',
  filter: (user) => user.role === 'admin' && user.actionType === 'critical'
});

// Priority with once
evem.subscribe('app.initialize', () => {
  console.log('Core services initialized');
}, {
  priority: 'high',
  once: true  // High priority and only executes once
});
```

The priority system ensures that your most critical handlers execute first, providing predictable ordering when needed.

## Event Transformation

A subscriber can have a `transform` function. It runs right after that subscriber's callback, and its result is the data that the subscribers after it (lower priority, or subscribed later with the same priority) receive. This is useful for enriching, modifying, or adapting event data in sequence.

A transform only applies when its subscriber handled the event: not when the subscriber's filter or schema rejected it, while the subscriber is throttled, for debounced calls, or after a `once` subscription has fired. It doesn't run when its callback canceled the event. History keeps the data as the middleware left it, before any transform.

### Basic Transformation

```typescript
interface LoginEvent {
  name: string;
  id: number;
}

interface EnrichedLogin extends LoginEvent {
  timestamp: number;
  clientInfo: { browser: string; os: string };
}

// A subscriber that also transforms the event data for the subscribers after it
evem.subscribe<LoginEvent>('user.login', (user) => {
  console.log(`User logged in: ${user.name}`);
}, {
  transform: (user): EnrichedLogin => ({
    ...user,
    timestamp: Date.now(),
    clientInfo: detectClientInfo()
  })
});

// Next subscriber receives the transformed data
evem.subscribe<EnrichedLogin>('user.login', (userData) => {
  console.log(`Login recorded at ${new Date(userData.timestamp).toISOString()}`);
  console.log(`Client: ${userData.clientInfo.browser} on ${userData.clientInfo.os}`);
});

// Publish with original data
await evem.publish<LoginEvent>('user.login', { name: 'Alice', id: 123 });
```

### Transformation Chain

Multiple subscribers can transform the data in sequence, creating a data processing pipeline:

```typescript
interface Message {
  content: string;
  sender: string;
}

interface CountedMessage extends Message {
  wordCount: number;
}

// First subscriber normalizes the data
evem.subscribe<Message>('message.received', () => {
  console.log('Processing message...');
}, {
  priority: 'high',
  transform: (msg) => ({
    ...msg,
    content: msg.content.trim().toLowerCase()
  })
});

// Second subscriber enriches the data
evem.subscribe<Message>('message.received', () => {
  console.log('Enriching message...');
}, {
  priority: 'normal',
  transform: (msg): CountedMessage => ({
    ...msg,
    wordCount: msg.content.split(/\s+/).length
  })
});

// Final subscriber receives the data transformed by both
evem.subscribe<CountedMessage>('message.received', (msg) => {
  console.log(`Message: "${msg.content}"`);
  console.log(`Word count: ${msg.wordCount}`);
}, { priority: 'low' });

// Original data is simple
await evem.publish<Message>('message.received', {
  content: '  Hello World!  ',
  sender: 'user1'
});
// Output:
// Processing message...
// Enriching message...
// Message: "hello world!"
// Word count: 2
```

### Async Transformations

Transformations can be asynchronous; `publish` waits for them (up to its timeout) before running the next subscriber:

```typescript
interface UploadedDocument {
  content: string;
}

interface ProcessedDocument extends UploadedDocument {
  metadata: { author: string };
  tags: string[];
  processedAt: Date;
}

evem.subscribe<UploadedDocument>('document.upload', () => {
  console.log('Document received');
}, {
  transform: async (doc): Promise<ProcessedDocument> => {
    // Perform async enrichment
    const metadata = await extractMetadata(doc.content);
    const tags = await autoTagDocument(doc.content);

    return {
      ...doc,
      metadata,
      tags,
      processedAt: new Date()
    };
  }
});

// Next subscriber gets the enriched document
evem.subscribe<ProcessedDocument>('document.upload', (doc) => {
  console.log(`Document processed at ${doc.processedAt.toISOString()}`);
  console.log(`Tags: ${doc.tags.join(', ')}`);
  console.log(`Author: ${doc.metadata.author}`);
});
```

Transformations provide a powerful way to process event data sequentially, letting each subscriber focus on a specific aspect of data enhancement or modification.

### When to Use Transformations vs. Middleware

Both transformations and middleware can modify event data, but they serve different purposes:

**Use Transformations When:**
- You want the modification to be tied to a specific subscriber
- You need to modify data between subscribers in a chain
- You want sequential processing where each step can see previous modifications

**Use Middleware When:**
- You need preprocessing that applies to many events, before any subscriber sees them
- You need to change the event name (redirecting events)
- You want to implement cross-cutting concerns like logging or authentication
- You need to cancel events before they reach any subscribers

**Examples:**

```typescript
// MIDDLEWARE: Application-wide timestamp enrichment
evem.use((event: string, data: Record<string, unknown>) => {
  // Add timestamp to ALL events
  return { ...data, timestamp: Date.now() };
});

// TRANSFORMATION: Feature-specific data normalization
evem.subscribe<{ value: string }>('user.input', (data) => {
  console.log('Processing user input:', data.value);
}, {
  transform: (data) => {
    // Normalize this specific input stream for the subscribers after this one
    return {
      ...data,
      value: data.value.trim().toLowerCase()
    };
  }
});
```

In general, middleware is better for application-wide concerns while transformations are better for feature-specific data processing.

## Filtering Events

EvEm provides powerful filtering capabilities that let you filter events based on their data. This allows you to subscribe only to the specific events you care about.

### Basic Filtering

You can filter events by providing a predicate function in the subscription options:

```typescript
interface User {
  name: string;
  role: string;
}

// Only receive user.login events for admin users
evem.subscribe<User>('user.login', (user) => {
  console.log(`Admin logged in: ${user.name}`);
}, {
  filter: (user) => user.role === 'admin'
});

// Will only trigger for admin users
await evem.publish<User>('user.login', { name: 'Alice', role: 'admin' }); // Triggers callback
await evem.publish<User>('user.login', { name: 'Bob', role: 'user' });    // Filtered out
// Output: Admin logged in: Alice
```

### Multiple Filters

For more complex filtering logic, you can apply multiple filters as an array. They run in order, stop at the first one that returns `false`, and all must pass for the callback to be executed:

```typescript
interface ChatMessage {
  priority: 'high' | 'normal';
  from: string;
  text: string;
}

// Only receive messages that are both important and from a specific sender
evem.subscribe<ChatMessage>('message.received', (msg) => {
  console.log(`Important system message: ${msg.text}`);
}, {
  filter: [
    (msg) => msg.priority === 'high',    // Only high priority messages
    (msg) => msg.from === 'system'       // Only from system
  ]
});
```

### Async Filters

Filters can also be asynchronous, which is useful for validation that requires database lookups or API calls:

```typescript
evem.subscribe<{ id: string }>('document.updated', handleDocUpdate, {
  filter: async (doc) => {
    // Check permissions in the database
    const userHasAccess = await checkUserPermissions(doc.id);
    return userHasAccess;
  }
});
```

A filter that throws (or rejects) is logged and treated as returning `false`. Filters run after schema validation and before throttle/debounce and once, so a filtered-out event doesn't start a throttle window, restart a debounce timer or use up a `once` subscription.

Filtering provides a clean and declarative way to handle complex event processing logic without cluttering your event handlers.

## Schema Validation

A subscription can validate event data with a `schema` function before its filters and callback run. A simple validator returns `true` or `false`; an advanced validator returns `{ valid, errors }` with details. Both can be async.

```typescript
import {
  EvEm,
  ErrorPolicy,
  type AdvancedSchemaValidator,
  type SchemaValidationError,
  type SchemaValidator
} from "@jcfigueiredo/evem";
const evem = new EvEm();

interface UserData {
  id: number;
  name: string;
  email: string;
  age: number;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple schema validator
const isAdultUser: SchemaValidator<UserData> = (data) =>
  typeof data === 'object' &&
  data !== null &&
  typeof data.id === 'number' &&
  typeof data.name === 'string' &&
  typeof data.email === 'string' &&
  emailPattern.test(data.email) &&
  typeof data.age === 'number' &&
  data.age >= 18;

// Advanced schema validator with detailed errors
const validateUser: AdvancedSchemaValidator<UserData> = (data) => {
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ message: 'Data must be an object' }] };
  }

  const errors: SchemaValidationError[] = [];
  if (typeof data.id !== 'number') {
    errors.push({ message: 'ID must be a number', path: 'id' });
  }
  if (typeof data.name !== 'string' || data.name.length < 2) {
    errors.push({ message: 'Name must be a string with at least 2 characters', path: 'name' });
  }
  if (typeof data.email !== 'string' || !emailPattern.test(data.email)) {
    errors.push({ message: 'Email must be a valid email address', path: 'email' });
  }
  if (typeof data.age !== 'number' || data.age < 18) {
    errors.push({ message: 'Age must be a number and 18 or older', path: 'age' });
  }

  return { valid: errors.length === 0, errors };
};

// Default policy (CANCEL_ON_ERROR): invalid data is logged and skips this subscriber only
evem.subscribe<UserData>('user.register', (user) => {
  console.log(`User registered: ${user.name}`);
}, {
  schema: isAdultUser
});

// THROW: invalid data rejects publish with the validator's errors
evem.subscribe<UserData>('user.register', (user) => {
  console.log(`Welcome email sent to ${user.email}`);
}, {
  schema: validateUser,
  schemaErrorPolicy: ErrorPolicy.THROW
});

// Valid data reaches both subscribers
await evem.publish<UserData>('user.register', {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',
  age: 25
});
// Output:
// User registered: Alice
// Welcome email sent to alice@example.com

// Invalid data (bad email, under 18)
try {
  await evem.publish<UserData>('user.register', {
    id: 2,
    name: 'Bob',
    email: 'invalid-email',
    age: 16
  });
} catch (error) {
  const { validationErrors } = error as { validationErrors: SchemaValidationError[] };
  console.log(validationErrors.map(e => e.path));
}
// Logs: Schema validation failed for event 'user.register' (from the first subscriber)
// Output: [ 'email', 'age' ]
```

`schemaErrorPolicy` decides what happens when validation fails for that subscriber. It's separate from the publish `errorPolicy`:

| `schemaErrorPolicy` | On invalid data |
|---|---|
| `CANCEL_ON_ERROR` (default) | Logs the failure and skips **this subscriber only**. Other subscribers still run, and `publish` resolves `true`. |
| `LOG_AND_CONTINUE` | Logs the failure and runs the callback anyway. |
| `SILENT` | Skips this subscriber without logging. |
| `THROW` | Rejects `publish` with an `Error` whose `validationErrors` holds the validator's errors (`null` for a simple validator). The remaining subscribers don't run. This happens whatever the publish `errorPolicy` is. |

A validator that throws or rejects counts as a failed validation. Errors thrown by the callback itself go through the publish error policy.

## Using Event History and Replay

EvEm can maintain a history of published events, allowing new subscribers to catch up on what they missed.

```typescript
import { EvEm } from "@jcfigueiredo/evem";
const evem = new EvEm();

interface Login {
  userId: number;
  name: string;
}

// Enable history recording, keeping at most the last 100 events (default: 50)
evem.enableHistory(100);

// Publish some events that will be recorded
await evem.publish<Login>('user.login', { userId: 1, name: 'Alice' });
await evem.publish('notification', { message: 'New feature available!' });
await evem.publish<Login>('user.login', { userId: 2, name: 'Bob' });

// Retrieve all recorded events: { event, data, timestamp } records, oldest first
const allHistory = evem.getEventHistory();
console.log(`Recorded ${allHistory.length} events`);
// Output: Recorded 3 events

// Retrieve just user.login events (patterns like 'user.*' work too)
const loginHistory = evem.getEventHistory<Login>('user.login');
console.log(`${loginHistory.length} user logins recorded`);
// Output: 2 user logins recorded

// A component initialized later can get the most recent notification immediately
evem.subscribe<{ message: string }>('notification', (notification) => {
  console.log(`Latest notification: ${notification.message}`);
}, {
  replayLastEvent: true
});
// Output: Latest notification: New feature available!

// An analytics service connecting later can get every login, in order
evem.subscribe<Login>('user.login', (user) => {
  console.log(`Login: ${user.name} (#${user.userId})`);
}, {
  replayHistory: true
});
// Output:
// Login: Alice (#1)
// Login: Bob (#2)

// Clear history if needed
evem.clearEventHistory();

// Disable history recording when no longer needed (doesn't clear existing history)
evem.disableHistory();
```

What gets recorded and replayed:

- History records the data subscribers receive, after middleware (and under the new name if a middleware rerouted the event), without the `cancel()` of cancelable events. Events canceled by middleware aren't recorded.
- `enableHistory(maxEvents)` keeps the most recent `maxEvents` events (default 50). `enableHistory(0)` keeps nothing, and re-enabling with a smaller limit drops the oldest events.
- Replay only happens if history is enabled when you subscribe. The callback is called right away, during `subscribe`, once for the last matching event (`replayLastEvent`) or for every matching event (`replayHistory`). A wildcard subscription replays every event its pattern matches.
- Replayed events go through the subscription's schema, filters, throttle/debounce and once (a `once` subscription fires only once), but not its transform. Replay happens outside any `publish`: async callbacks aren't awaited, and errors are logged.

### Uses for Event History

Event history is particularly useful for:

1. **Late Subscribers**: Components that initialize after events have occurred can catch up
2. **State Synchronization**: New components can immediately sync with the current application state
3. **Audit Trails**: Keep a record of important events for logging or debugging
4. **Replay Scenarios**: Test components by replaying the same sequence of events
5. **Event Sourcing**: Build event-sourced architectures where system state is derived from event history

## Memory Leak Detection

EvEm can warn you when an event collects more subscriptions than expected, which usually means handlers aren't being unsubscribed.

```typescript
import { EvEm } from "@jcfigueiredo/evem";
const evem = new EvEm();

evem.enableMemoryLeakDetection({
  threshold: 10,                 // Warn when an event has more than 10 subscriptions (default)
  showSubscriptionDetails: true  // Also log the subscription ids and some tips (default)
});

// Now if you create many subscriptions to the same event without unsubscribing,
// you'll get a warning in the console
for (let i = 0; i < 15; i++) {
  evem.subscribe('button.click', () => console.log('Button clicked!'));
}
// Warns once, when the 11th subscription is added:
// Possible memory leak detected: 11 handlers added for event "button.click". This exceeds the threshold of 10. This could indicate event handlers are not being properly unsubscribed.
// (followed by the subscription details)

// Disable memory leak detection when no longer needed
evem.disableMemoryLeakDetection();
```

Both options are optional. The check runs when a subscription is added, and counts the subscriptions to that exact event name or pattern (a `user.*` subscription counts for `user.*`, not for each event it receives). Each event is reported once; it can be reported again after its count drops back to the threshold, or after detection is re-enabled.

## Recursion Protection

A handler that publishes the event it's handling can loop forever. EvEm limits how deeply that can nest: 3 levels by default, or the depth you pass to the constructor (`new EvEm(5)`).

```typescript
import { EvEm } from "@jcfigueiredo/evem";
const evem = new EvEm(); // Same as new EvEm(3)

let calls = 0;
evem.subscribe('tick', async () => {
  calls++;
  await evem.publish('tick'); // Re-publishes the event it's handling
});

await evem.publish('tick');
console.log(calls);
// Logs: Error in event handler for "tick": Error: Max recursion depth of 3 exceeded for event 'tick'
// Output: 3
```

The publish that goes over the limit rejects with that error. Here the third handler awaits it, so the rejection becomes that handler's error and is handled by the outer publish's error policy.

- The depth counts publishes of the same event started from inside its own handlers (callbacks, middleware and transforms), directly or through the handlers of other events.
- Independent publishes of the same event are not limited, even when they overlap.
- A publish started after the handler has awaited other work can't be traced back to it, so it starts a new chain. Loops like that aren't caught.
- Await (or catch) publishes you start from handlers: one that goes over the limit without being awaited is an unhandled promise rejection.

## Using the Info Method for Debugging

The `info` method provides a convenient way to inspect the current state of the event emitter, which is useful for debugging and monitoring.

```typescript
import { EvEm } from "@jcfigueiredo/evem";
const evem = new EvEm();

// Set up some subscriptions and middleware
evem.subscribe('user.login', () => console.log('User logged in'));
evem.subscribe('user.logout', () => console.log('User logged out'));
evem.subscribe('system.error', () => console.log('System error occurred'), { priority: 'high' });

evem.use((event, data) => {
  console.log(`Global middleware handling: ${event}`);
  return data;
});

evem.use({
  pattern: 'user.*',
  handler: (event, data) => {
    console.log(`User event middleware: ${event}`);
    return data;
  }
});

// Get info about all events and middleware
const allInfo = evem.info();
console.log('All events and middleware:', allInfo);
// Shows all three subscriptions and both middleware

// Get info about only user-related events and middleware
const userInfo = evem.info('user.*');
console.log(userInfo);
// Output:
// [
//   { event: 'user.login', isMiddleware: false, id: '…', priority: 0 },
//   { event: 'user.logout', isMiddleware: false, id: '…', priority: 0 },
//   { event: '*', isMiddleware: true, pattern: undefined },
//   { event: 'user.*', isMiddleware: true, pattern: 'user.*' }
// ]
```

With a pattern, `info(pattern)` lists the subscriptions whose registered event name or pattern matches it, and the middleware that would run for it (including middleware without a pattern, shown as `'*'`). It matches registered names against your pattern, not the other way around: `info('user.login')` doesn't list a `user.*` subscription, even though that subscription receives `user.login` events.

This feature is particularly useful for:
1. Debugging complex event setups
2. Visualizing the current state of the event system
3. Checking which middleware will be applied to specific events
4. Inspecting the priority order of event handlers

For a comprehensive set of examples, check out the [examples](docs/examples.md) page.

## WebSocket Adapter (Optional Extension)

The `@jcfigueiredo/evem/websocket` entry point connects an EvEm instance to a WebSocket server. It's built on EvEm's public API and doesn't change the core. `WebSocketHandler` is the recommended way to use it: it wires the socket to EvEm events, queues outgoing messages while offline, reconnects if you ask it to, and makes request-response calls.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

const evem = new EvEm();
const handler = new WebSocketHandler('wss://api.example.com', evem, {
  reconnect: true // Reconnect after unexpected closes (default: false)
});

// Incoming: a message like { "event": "user.joined", "data": {...} } is published as 'server.user.joined'
evem.subscribe<{ name: string }>('server.user.*', (user) => {
  console.log('User event from server:', user.name);
});

// Outgoing: the data of 'ws.send' (and of other 'ws.send.*' events) is sent as JSON.
// While the socket isn't open, messages are queued and sent once it connects
await evem.publish('ws.send', { type: 'chat', text: 'Hello!' });

// Request-response: sends { type: 'request', id, method, params, timestamp } and resolves with the
// `result` of the server's { type: 'response', id, result } reply (rejects on `error` or after the timeout)
const user = await handler.request<{ id: number; name: string }>('getUser', { id: 123 }, { timeout: 5000 });
console.log('User data:', user);

// Connection state and queue
console.log(handler.isConnected(), handler.getConnectionState(), handler.getQueueSize());

// Close the socket and remove the handler's subscriptions and middleware
await handler.disconnect();
```

**What it publishes:**
- `ws.connection.state` with `{ from, to, timestamp }` when the state changes (`disconnected`, `connected`, `reconnecting`, `disconnecting`). With `reconnect`, after `maxReconnectAttempts` failed attempts in a row the state goes to `disconnected` and `ws.reconnect.failed` is published with `{ attempts }`.
- Incoming messages: `{ event, data }` as `server.<event>`, `{ type, data }` as `server.<type>`, responses as `ws.response` / `ws.response.error`, anything else as `ws.message`, and unparseable messages as `ws.parse.error`. Socket errors are published as `ws.error`.
- `ws.queue.overflow` when the queue is full and the oldest message is dropped.

**Configuration options:**

```typescript
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

const handler = new WebSocketHandler('wss://api.example.com', evem, {
  enableQueue: true,           // Queue outgoing messages while not connected (default: true)
  queueSize: 100,              // Maximum queued messages; the oldest is dropped (default: 100)
  autoFlush: true,             // Send queued messages once connected (default: true)
  enableRequestResponse: true, // Enable handler.request() (default: true)
  serverEventPrefix: 'server', // Prefix for incoming events (default: 'server')
  reconnect: true,             // Reconnect after an unexpected close (default: false)
  reconnectDelay: 1000,        // ms before each attempt (default: 1000)
  maxReconnectAttempts: 5,     // Consecutive failed attempts before giving up (default: 5)
  messageParser: (data) => JSON.parse(data),        // Default
  messageFormatter: (data) => JSON.stringify(data), // Default
  onError: (error) => console.error('WebSocket error:', error)
});
```

**Node.js:** Node 22 and later have a global `WebSocket`, but Node 20 doesn't. There, pass the [`ws`](https://www.npmjs.com/package/ws) package's class as `WebSocketConstructor`. You can also pass a socket created with it (`new WebSocket(url)`) in place of the URL, but keep the option: reconnecting creates new sockets with it.

```typescript
import WebSocket from 'ws';
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

const evem = new EvEm();
const handler = new WebSocketHandler('wss://api.example.com', evem, {
  WebSocketConstructor: WebSocket
});
```

The building blocks (`ConnectionManager`, `MessageQueue` and `RequestResponseManager`) are exported too, for wiring a socket yourself. See the [WebSocket Adapter documentation](docs/websocket-adapter.md) for message formats, the full event reference and more examples.

## Server-Sent Events Adapter (Optional Extension)

The `@jcfigueiredo/evem/sse` entry point receives a server's event stream ([Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)) into an EvEm instance. `SseHandler` publishes server events under the same `server.*` names as the WebSocket adapter. It connects with `fetch` by default, so it can send auth headers and works in Node.js 20+. It reconnects with exponential backoff, and resumes with `Last-Event-ID` so the server can replay what was missed.

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';

const evem = new EvEm();

// `event: order.updated` + `data: {"id":7}`, or an unnamed {"event":"order.updated","data":{...}},
// is published as 'server.order.updated'
evem.subscribe<{ id: number }>('server.order.updated', (order) => {
  console.log('Order updated:', order.id);
});

evem.subscribe<{ to: string }>('sse.connection.state', ({ to }) => {
  console.log('Stream:', to); // connecting, connected, reconnecting, disconnecting, disconnected
});

// Created after the subscriptions, which then see its first state change (connecting)
const sse = new SseHandler('/api/events', evem, {
  // Called before every connection attempt, so reconnects send the current token
  headers: () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
});

// Abort the stream and cancel any pending reconnect
await sse.disconnect();
```

**What it publishes:** `sse.connection.state` with `{ from, to, timestamp }`; server events as `server.<name>`; other unnamed messages as `sse.message`; data that isn't valid JSON as `sse.parse.error`; connection problems as `sse.error` with `{ error, reason, status?, contentType? }`; and `sse.reconnect.failed` if you set `maxReconnectAttempts` and it's reached. By default the handler stops on `204`, on a response that isn't an event stream, and on `4xx` statuses other than `408` and `429`. Otherwise it reconnects after about 3 seconds (or the server's `retry:` delay), doubling the delay after each failed attempt up to about 30 seconds.

**Servers:** `@jcfigueiredo/evem/sse/server` writes the wire format safely (no forged events from user content) and has the right response headers:

```typescript
import { createServer } from 'node:http';
import { formatSseComment, formatSseMessage, SSE_HEADERS } from '@jcfigueiredo/evem/sse/server';

createServer((request, response) => {
  response.writeHead(200, SSE_HEADERS);
  response.write(formatSseMessage({ event: 'order.updated', id: 42, data: { id: 7, status: 'shipped' } }));
  const heartbeat = setInterval(() => response.write(formatSseComment('ping')), 15_000);
  response.on('close', () => clearInterval(heartbeat));
}).listen(8080);
```

For Python servers (FastAPI, Flask or the standard library), see [SSE servers in Python](docs/sse-python.md), with a copy-in helper that writes the same format. The [SSE Adapter documentation](docs/sse-adapter.md) covers the options, the two transports (`fetch`, or the browser's native `EventSource`), reconnection, resuming, heartbeats, backpressure and testing.

## API at Your Fingertips

- `new EvEm(maxRecursionDepth = 3)`: Create an emitter; `maxRecursionDepth` limits how deeply an event can re-publish itself from its own handlers
- `subscribe<T = unknown, R = any>(event: string, callback: EventCallback<T>, options?: SubscriptionOptions<T, R>): string`
  - Returns the subscription id. `event` can be a [wildcard pattern](#using-wildcards-in-event-subscription)
  - `options.schema`: A validator, `(data) => boolean` or `(data) => { valid, errors? }` (sync or async), checked before the filters and callback
  - `options.schemaErrorPolicy`: What to do when validation fails (default: `ErrorPolicy.CANCEL_ON_ERROR`, which logs and skips this subscriber only)
  - `options.filter`: A predicate function or array of predicates (sync or async); all must pass for the callback to run
  - `options.throttleTime`: Milliseconds; handle the first event, then drop events until the window ends
  - `options.debounceTime`: Milliseconds; handle only the last event, once none has arrived for this long
  - `options.once`: When true, unsubscribes just before the callback runs for the first time
  - `options.priority`: `'high'` (100), `'normal'` (0), `'low'` (-100), a number or a `Priority` value; higher runs first (default: 0)
  - `options.transform`: `(data: T) => R | Promise<R>`, run after this subscriber's callback; its result is what the following subscribers receive
  - `options.replayLastEvent`: When true and history is enabled, immediately call the callback with the most recent matching event from history
  - `options.replayHistory`: When true and history is enabled, immediately call the callback with every matching event from history, oldest first
- `subscribeOnce<T = unknown, R = any>(event: string, callback: EventCallback<T>, options?: Omit<SubscriptionOptions<T, R>, 'once'>): string`
- `unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void`: Remove the subscription to exactly `event` made with `callback`
- `unsubscribeById(id: string): void`
- `publish<T = unknown>(event: string, data?: T, options?: PublishOptions | number): Promise<boolean>`
  - Resolves to `true` if the event completed, `false` if it was canceled
  - A number in place of the options is the timeout
  - `options.timeout`: Milliseconds to wait for each async callback or transform (default: 5000)
  - `options.cancelable`: Whether handlers can cancel the event (default: false)
  - `options.errorPolicy`: How to handle errors in callbacks and transforms (default: `ErrorPolicy.LOG_AND_CONTINUE`)
  - A missing `data` is delivered as `{}`; `null` is delivered as `null`
- `use<T = unknown>(middleware: MiddlewareFunction<T> | MiddlewareConfig<T>): void`: Register a middleware
  - A function processes all events
  - A `{ pattern, handler }` object processes only events matching `pattern`
  - The handler returns the (new) data, `null` to cancel, or a new `{ event, data }` object to reroute
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

## Join the Party - Contribute!

Got awesome ideas? Want to make **evem** even better? Jump in and contribute! Open an issue or submit a pull request to get started.

## Test It Out

Run the tests and watch the magic:

```bash
pnpm test            # Watch mode
pnpm test:nowatch    # Run once
pnpm test:coverage   # With a coverage report
pnpm typecheck       # TypeScript check
```

## Comparison with Alternatives

Here's how EvEm compares to other popular event emitter libraries. EvEm is written in TypeScript and ships its own type declarations. You type payloads per subscription and publish (`subscribe<T>`, `publish<T>`), but there is no typed event map: event names are plain strings, and the compiler doesn't check that what you publish matches what subscribers expect.

### EvEm vs Node.js EventEmitter

**Pros of EvEm:**
- Namespace and wildcard pattern support
- Async callbacks are awaited in priority order, with timeouts
- Priorities, filters, middleware, throttle/debounce, schema validation and history built in
- Recursion depth limit for events that re-publish themselves
- Runs in browsers as well as Node.js

**Cons of EvEm:**
- Not as widely adopted as Node's EventEmitter
- An extra package (with no dependencies of its own), whereas Node's EventEmitter is built in
- `publish` always returns a promise, while `emit` is synchronous

### EvEm vs EventEmitter3

**Pros of EvEm:**
- Namespace hierarchy support
- Wildcard event pattern matching
- Built-in handling of async callbacks, with timeouts
- Priorities, filters, middleware and history built in

**Cons of EvEm:**
- EventEmitter3 is focused on raw performance, which EvEm doesn't match
- EventEmitter3 supports a typed event map (`new EventEmitter<Events>()`); EvEm doesn't
- Smaller community and ecosystem

### EvEm vs Mitt

**Pros of EvEm:**
- More feature-rich (wildcard patterns, priorities, middleware, history)
- Awaits async callbacks, with timeouts and error policies
- Subscription ID tracking for easier unsubscription
- Recursion depth control

**Cons of EvEm:**
- Larger bundle size than Mitt (which is ~200 bytes)
- More complex API compared to Mitt's minimalist approach
- Mitt supports a typed event map (`mitt<Events>()`); EvEm doesn't

### EvEm vs RxJS

**Pros of EvEm:**
- Simpler learning curve
- Smaller bundle size
- Focused functionality for pub/sub patterns
- Less conceptual overhead

**Cons of EvEm:**
- Lacks reactive programming features such as composable operators over streams
- Less powerful for complex async workflows

### EvEm vs tiny-emitter

**Pros of EvEm:**
- Written in TypeScript
- More features (namespaces, wildcards, async handling)
- Configurable error policies
- Subscription ID system

**Cons of EvEm:**
- Larger size compared to tiny-emitter's minimal footprint
- More complex implementation

### EvEm vs events (browserify)

**Pros of EvEm:**
- Modern TypeScript implementation
- Namespaces and wildcards not available in events
- Timeout handling for async callbacks

**Cons of EvEm:**
- Not a direct drop-in replacement for Node.js code
- Less community adoption

## License

**evem** is open-source and free, distributed under the MIT License. See [LICENSE](LICENSE.md) for more information.

## TODO Features

These are planned features for future releases:

1. **Subscription Lifecycle Hooks**: Add hooks for subscription creation and teardown, useful for cleanup operations.

2. **Performance Metrics/Telemetry**: Built-in instrumentation for measuring event processing performance.
