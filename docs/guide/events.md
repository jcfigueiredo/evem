# Events

How an event travels from `publish` to its subscribers, and the options that decide who receives it and in what order.

## How an Event Is Processed

When you call `publish(event, data, options)`:

1. **Middleware** runs in registration order. Each middleware whose pattern matches the event name (middleware without a pattern sees every event) receives the data returned by the previous one. Returning `null` cancels the event; returning a new `{ event, data }` object reroutes it (see [Middleware](middleware.md)).
2. The event is recorded in **history**, if enabled, with the data as the middleware left it.
3. If the event is **cancelable**, `cancel()` and `canceled` are added to the data.
4. **Subscribers** whose event name or pattern matches run one at a time, highest priority first. Equal priorities run in the order they subscribed, also across different patterns. For each subscriber, its options apply in this order:
   1. schema validation
   2. filters
   3. throttle/debounce
   4. once (the subscription is removed just before the callback runs)
   5. the callback (an async callback is awaited, up to the publish `timeout`)
   6. the subscriber's transform, whose result is what the following subscribers receive
5. The promise resolves to `true`, or to `false` if a middleware returned `null` (or threw), a subscriber called `cancel()`, or an error stopped the event under `ErrorPolicy.CANCEL_ON_ERROR`. It rejects when an error occurs under `ErrorPolicy.THROW`, when a schema check fails with `schemaErrorPolicy: ErrorPolicy.THROW`, and when the event name is empty or the [recursion limit](errors.md#recursion-protection) is exceeded.

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

Higher numbers run first, and subscribers with the same priority run in the order they subscribed. A priority of `NaN` (from a computation gone wrong, say) can't be ordered, so it counts as `normal` (0).

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
// Run once, with the last important notification of the first burst
evem.subscribeOnce<{ type: string; message: string }>('notification', (notification) => {
  showWelcomeDialog(notification.message);
}, {
  filter: (notification) => notification.type === 'important',
  debounceTime: 100 // Wait until important notifications stop arriving for 100ms
});
```

This is ideal for:
- One-time initialization
- Welcome messages or onboarding flows
- Alert dialogs that should only appear once
- Feature highlights that should only be shown on first encounter

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
