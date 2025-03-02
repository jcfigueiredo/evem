# EvEm - Simple Event Emitter Library 📢

EvEm is a lightweight and flexible event emitter library for TypeScript, providing a simple yet powerful pub/sub system. It's designed to handle both synchronous and asynchronous event callbacks with ease.

## Features

- **🔗 Event Subscription**: Easily subscribe to events with callbacks. Each subscription returns a unique identifier (UUID) which can be used for unsubscribing.

  - `subscribe(event: string, callback: EventCallback<T>): string`

- **❌ Event Unsubscription**: Unsubscribe from events to stop receiving notifications.

  - `unsubscribe(event: string, callback: EventCallback<T>): void`
  - `unsubscribeById(id: string): void` - Unsubscribe using the unique ID returned by `subscribe`.

- **🔄 Once-only Events**: Subscribe to events that will automatically unsubscribe after the first occurrence.

  - `subscribeOnce(event: string, callback: EventCallback<T>): string`
  - Or use `subscribe(event, callback, { once: true })`

- **📣 Event Publishing**: Publish events with optional data.

  - `publish<T = unknown>(event: string, args?: T, timeout?: number): Promise<void>`

- **🥇 Event Priority**: Set priority levels for handlers to control execution order.

  - Use `subscribe(event, callback, { priority: 'high' | 'normal' | 'low' | number | Priority.HIGH })` 
  - Higher priority handlers execute before lower priority ones
  - Numeric priorities allow for fine-grained control (higher numbers = higher priority)
  - Built-in Priority enum provides better type safety (Priority.HIGH, Priority.NORMAL, Priority.LOW)

- **📚 Namespace Support**: Organize events using a namespace pattern.

  - `subscribe("namespace.eventName", callback)`
  - Facilitates categorizing and managing events based on their namespace.

- **🌟 Wildcard Event Names**: Support for wildcard event names, allowing for flexible event listening.

  - Subscribe to events using patterns like `eventName.*`, `*.eventName`, or `namespace.*.events`.

- **🔍 Event Filtering**: Filter events based on their data before processing them.

  - Apply predicates to event data that determine whether a callback should be invoked
  - Support for both synchronous and asynchronous filter functions
  - Chain multiple filters together to create complex filtering logic
  - Fully integrated with the existing subscription system

- **⏲️ Event Debouncing**: Prevent excessive event handling using debounce.

  - Set a debounce time to ensure callbacks are only invoked once within a specified time period
  - Useful for handling rapid-fire events like window resize, keyboard input, or API updates
  - Combine with filtering for powerful event stream control

- **🔄 Event Throttling**: Limit the frequency of event handler execution.

  - Set a throttle time to ensure callbacks are executed at most once per time window
  - First event in a throttle window is processed immediately, subsequent events are ignored until the window expires
  - Perfect for rate-limiting high-frequency events like scrolling, mouse movements, or API calls

- **🛑 Cancelable Events**: Allow events to be canceled by subscribers to prevent further processing.

  - Publish events with the `cancelable: true` option 
  - Event handlers can call `event.cancel()` to stop propagation to remaining handlers
  - Returns a boolean indicating whether the event completed (true) or was canceled (false)
  - Useful for validation chains, permission checks, or early termination of event processing

- **⏱️ Timeout Management for Asynchronous Callbacks**: Ensures that asynchronous callbacks do not hang indefinitely.

  - A default timeout of 5000ms (5 seconds) is set for each callback, but can be overridden per event in the `publish` method.
  - Gracefully handles timeout exceedance.

- **⏱️ Asynchronous and Synchronous Callbacks**: Support for both synchronous and asynchronous callbacks.

  - Callbacks can be either a simple function or an `async` function.

- **🌀 Customizable Recursion Depth**: Set a custom maximum recursion depth for event publishing to prevent stack overflow errors and infinite loops.

  - Constructor parameter to set the maximum recursion depth (default is 3).

- **🛠️ Error Handling**: Robust error handling for empty event names and exceptions in callbacks.

  - Throws an error if the event name is empty during subscription, unsubscription, or publishing.
  - Handles exceptions thrown in event callbacks gracefully.

## Getting on Board

### Installation

Pick your favorite package manager and get going:

**pnpm:**

```bash
pnpm add evem
```

## Quick Start

Jump right in!

```typescript
import { EvEm } from "evem";
const evem = new EvEm();

// Subscribe to a party start event
evem.subscribe("party.start", () => {
  console.log("Let's get this party started!");
});

// Publish the party start event
void evem.publish("party.start");

// Using Asynchronous Callbacks
evem.subscribe("party.end", async () => {
  console.log("Wrapping up the party...");
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulating async operation
  console.log("Party ended.");
});

await evem.publish("party.end");

// Unsubscribing from an Event
const danceCallback = () => console.log("Time to dance!");
const subId = evem.subscribe("party.dance", danceCallback);
const musicSubId = evem.subscribe("party.music", () => console.log("Music is playing!"));

// Later, to unsubscribe from the event
evem.unsubscribe("party.dance", danceCallback);
evem.unsubscribeById(musicSubId);

// Using Filters
evem.subscribe("user.login", 
  (user) => {
    console.log(`Admin user logged in: ${user.name}`);
  }, 
  {
    // Only receive events for admin users
    filter: (user) => user.role === 'admin'
  }
);

// Multiple filters can be applied together
evem.subscribe("payment.processed",
  (payment) => {
    console.log(`Large international payment processed: $${payment.amount}`);
  },
  {
    filter: [
      // Only large payments
      (payment) => payment.amount > 1000,
      // Only international payments
      (payment) => payment.type === 'international'
    ]
  }
);

// Async filters are also supported
evem.subscribe("document.created",
  (doc) => {
    console.log(`Valid document created: ${doc.id}`);
  },
  {
    filter: async (doc) => {
      // Simulate API validation check
      const result = await validateDocumentAsync(doc);
      return result.isValid;
    }
  }
);

// Using priority to control execution order
evem.subscribe("app.startup", () => {
  console.log("Initialize UI components");
}, { priority: 'normal' });

evem.subscribe("app.startup", () => {
  console.log("Load critical services FIRST");
}, { priority: 'high' });

evem.subscribe("app.startup", () => {
  console.log("Load non-essential resources LAST");
}, { priority: 'low' });

// The handlers will execute in order of priority: high, normal, low
await evem.publish("app.startup");

// Using cancelable events
evem.subscribe("form.submit", (event) => {
  console.log("Validating form...");
  if (!event.data.isValid) {
    console.log("Form validation failed, canceling submission.");
    event.cancel(); // Stop further processing
    return;
  }
  console.log("Form validation passed.");
});

evem.subscribe("form.submit", (event) => {
  console.log("Submitting form to server...");
  // This won't execute if the event is canceled by the first handler
});

// Publish a cancelable event
const formData = { isValid: false };
const eventCompleted = await evem.publish("form.submit", formData, { cancelable: true });

console.log(eventCompleted ? "Form submitted successfully" : "Form submission was canceled");
```

## Managing Timeouts in Callbacks

EvEm's flexible design allows for managing timeouts in asynchronous callbacks, ensuring they don't hang indefinitely.

### Setting a Default Timeout

When publishing an event, you can set a default timeout for all its callbacks. This is useful when you want to ensure that all callbacks complete within a specific time frame.

```typescript
// Set a 3000 ms timeout for all callbacks of this event
await evem.publish("network.request", requestData, 3000);
```

### Default Timeout Value

If no timeout is specified when publishing an event, a default timeout of 5000ms (5 seconds) is used.

```typescript
// Uses the default 5000ms timeout
await evem.publish("data.process", processData);
```

### Handling Timeout Exceedance

When a callback exceeds the specified timeout, it will be gracefully terminated, ensuring that your application remains responsive and avoids potential hang-ups.

```typescript
evem.subscribe("user.activity", async () => {
  try {
    await trackUserActivity();
  } catch (error) {
    console.error("User activity tracking timed out");
  }
});
```

These timeout management features make EvEm a robust solution for handling asynchronous operations in your applications.

## Using Wildcards in Event Subscription

EvEm supports wildcard patterns in event subscriptions, allowing for more dynamic and flexible event handling.

### Subscribe to All Events in a Category

You can subscribe to all events within a certain category using the wildcard `*`.

```typescript
// Subscribe to all events that start with 'network.'
evem.subscribe("network.*", data => {
  console.log("Network event occurred:", data);
});
```

### Using Wildcards for Multi-level Events

Wildcards can also be used for subscribing to multi-level events, providing great flexibility in handling event hierarchies.

```typescript
// Subscribe to any event that matches 'system.*.error'
evem.subscribe("system.*.error", error => {
  console.error("System error detected:", error);
});
```

These wildcard capabilities make EvEm an ideal choice for applications requiring complex event handling strategies.

## Throttling Events

EvEm provides built-in throttling, which is useful when you need to limit the rate at which events are processed.

### Basic Throttling

```typescript
// Handle scroll events at most once every 200ms
evem.subscribe('window.scroll', updateScrollIndicator, {
  throttleTime: 200
});

// Only the first event and events after the throttle window will be processed
evem.publish('window.scroll', { position: 100 }); // Processed immediately
evem.publish('window.scroll', { position: 120 }); // Ignored (within throttle window)
evem.publish('window.scroll', { position: 150 }); // Ignored (within throttle window)

// ... 200ms later ...

evem.publish('window.scroll', { position: 300 }); // Processed (new throttle window)
```

### Combining Throttle with Filters

Throttling can be combined with filters to control both the rate and conditions of event handling:

```typescript
// Process large value changes at most once every 500ms
evem.subscribe('sensor.reading', updateDisplay, {
  throttleTime: 500,
  filter: reading => Math.abs(reading.value - lastValue) > 5
});
```

Throttling is ideal for scenarios where you need to limit the frequency of potentially expensive operations while still ensuring responsive handling of the first event in a sequence.

## Debouncing Events

EvEm provides built-in debouncing, which is useful when you need to limit how often a callback is triggered in response to rapidly occurring events.

### Basic Debouncing

```typescript
// Only handle the last resize event in each 300ms window
evem.subscribe('window.resize', updateLayout, {
  debounceTime: 300
});

// These will all be collapsed into one call to updateLayout
evem.publish('window.resize', { width: 800, height: 600 });
evem.publish('window.resize', { width: 810, height: 600 });
evem.publish('window.resize', { width: 820, height: 610 });
```

### Combining Debounce with Filters

Debouncing can be combined with filtering for powerful control over event processing:

```typescript
// Debounce important notifications from a specific user
evem.subscribe('notification.received', showNotification, {
  debounceTime: 500,
  filter: notification => 
    notification.importance === 'high' && 
    notification.from === 'system'
});
```

### Combining Throttle and Debounce

For advanced control, you can combine both throttling and debouncing:

```typescript
// Process the first event immediately, then wait for a pause in events
evem.subscribe('user.typing', suggestCompletions, {
  throttleTime: 100,  // Process immediately, then throttle
  debounceTime: 500   // Wait for typing to pause before suggesting again
});
```

This combination is particularly useful for handling scenarios like:
- Autocomplete suggestions - show immediate results then wait for typing to pause
- Infinite scrolling - load immediately on first scroll, then wait for scrolling to stop
- Progress updates - show first update right away, then only show updates after activity pauses

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

Event handlers receive an object with a `cancel()` method that can be called to prevent further handlers from executing:

```typescript
// Permission check handler
evem.subscribe('user.delete', (event) => {
  if (event.user.role !== 'admin') {
    console.log('Permission denied: Only admins can delete users');
    event.cancel(); // Stop propagation
    return;
  }
  console.log('Permission granted');
});

// Action handler - will only execute if the event wasn't canceled
evem.subscribe('user.delete', (event) => {
  console.log('Deleting user:', event.user.id);
  deleteUser(event.user.id);
});
```

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
// High priority security check runs first
evem.subscribe('document.save', (event) => {
  if (!isAuthenticated()) {
    event.cancel();
    return;
  }
}, { priority: 'high' });

// Normal priority business logic only runs if security check passes
evem.subscribe('document.save', (event) => {
  // Process document
}, { priority: 'normal' });
```

## Using Once-Only Events

EvEm provides once-only events that automatically unsubscribe after being triggered once, perfect for one-time operations.

### Basic Once-Only Subscription

```typescript
// Using the dedicated method
evem.subscribeOnce('user.initial-login', userData => {
  console.log('Welcome to the app!', userData.name);
  showOnboardingTutorial();
});

// Or using the once option
evem.subscribe('app.ready', initializeApp, { once: true });
```

### Combining Once with Other Options

Once-only events can be combined with filters, throttling and debouncing:

```typescript
// Only execute once for the first important notification
evem.subscribeOnce('notification', showWelcomeDialog, {
  filter: notification => notification.type === 'important',
  debounceTime: 100 // In case multiple notifications arrive simultaneously
});
```

This is ideal for:
- One-time initialization
- Welcome messages or onboarding flows
- Alert dialogs that should only appear once
- Feature highlights that should only be shown on first encounter

## Prioritizing Events

EvEm allows you to assign priorities to event handlers, giving you control over the execution order when multiple callbacks are triggered by the same event.

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
```

### Using the Priority Enum

For better type safety and code readability, you can use the built-in Priority enum:

```typescript
import { EvEm, Priority } from 'evem';
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
// Priority with filter
evem.subscribe('user.action', (user) => {
  console.log('Critical admin action detected:', user.action);
}, {
  priority: 'high',
  filter: user => user.role === 'admin' && user.actionType === 'critical'
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

## Filtering Events

EvEm provides powerful filtering capabilities that let you filter events based on their data. This allows you to subscribe only to the specific events you care about.

### Basic Filtering

You can filter events by providing a predicate function in the subscription options:

```typescript
// Only receive user.login events for admin users
emitter.subscribe('user.login', (user) => {
  console.log(`Admin logged in: ${user.name}`);
}, {
  filter: (user) => user.role === 'admin'
});

// Will only trigger for admin users
await emitter.publish('user.login', { name: 'Alice', role: 'admin' }); // Triggers callback
await emitter.publish('user.login', { name: 'Bob', role: 'user' });    // Filtered out
```

### Multiple Filters

For more complex filtering logic, you can apply multiple filters as an array:

```typescript
// Only receive messages that are both important and from a specific user
emitter.subscribe('message.received', handleMessage, {
  filter: [
    msg => msg.priority === 'high',    // Only high priority messages
    msg => msg.from === 'system'       // Only from system
  ]
});
```

All filters must pass for the callback to be executed.

### Async Filters

Filters can also be asynchronous, which is useful for validation that requires database lookups or API calls:

```typescript
emitter.subscribe('document.updated', handleDocUpdate, {
  filter: async (doc) => {
    // Simulate checking permissions in database
    const userHasAccess = await checkUserPermissions(doc.id);
    return userHasAccess;
  }
});
```

Filtering provides a clean and declarative way to handle complex event processing logic without cluttering your event handlers.

For a comprehensive set of examples, check out the [examples](docs/examples.md) page.

## API at Your Fingertips

- `subscribe(event: string, callback: EventCallback<T>, options?: SubscriptionOptions<T>): string`
  - `options.filter`: A predicate function or array of predicate functions that determine if the callback should be executed
  - `options.debounceTime`: Number of milliseconds to debounce the event (only process the last event within this time window)
  - `options.throttleTime`: Number of milliseconds to throttle the event (limit to at most one execution per time window)
  - `options.once`: When true, automatically unsubscribes after the callback is invoked for the first time
  - `options.priority`: Priority level ('high', 'normal', 'low'), number, or Priority enum value (Priority.HIGH) to control execution order (higher values execute first)
- `subscribeOnce(event: string, callback: EventCallback<T>, options?: Omit<SubscriptionOptions<T>, 'once'>): string`
- `unsubscribe(event: string, callback: EventCallback<T>): void`
- `unsubscribeById(id: string): void`
- `publish(event: string, args?: T, options?: PublishOptions | number): Promise<boolean>`
  - Returns `true` if the event completed without being canceled, `false` if it was canceled
  - `options.timeout`: Number of milliseconds before timing out async callbacks (default: 5000)
  - `options.cancelable`: Whether the event can be canceled by handlers (default: false)

## Join the Party - Contribute!

Got awesome ideas? Want to make **evem** even better? Jump in and contribute! Open an issue or submit a pull request to get started.

## Test It Out

Run the tests and watch the magic:

```bash
pnpm test
```

## Comparison with Alternatives

Here's how EvEm compares to other popular event emitter libraries:

### EvEm vs Node.js EventEmitter

**Pros of EvEm:**
- TypeScript support with type safety
- Namespace and wildcard pattern support
- Built-in timeout management for async callbacks
- Protection against infinite recursion loops

**Cons of EvEm:**
- Not as widely adopted as Node's EventEmitter
- Additional dependency (whereas Node's EventEmitter is built-in)

### EvEm vs EventEmitter3

**Pros of EvEm:**
- Better TypeScript integration
- Namespace hierarchy support
- Built-in timeout handling for async operations
- Wildcard event pattern matching

**Cons of EvEm:**
- May not be as performance-optimized as EventEmitter3
- Smaller community and ecosystem

### EvEm vs Mitt

**Pros of EvEm:**
- More feature-rich (namespaces, wildcards, timeouts)
- Better handling of asynchronous events
- Subscription ID tracking for easier unsubscription
- Recursion depth control

**Cons of EvEm:**
- Larger bundle size than Mitt (which is ~200 bytes)
- More complex API compared to Mitt's minimalist approach

### EvEm vs RxJS

**Pros of EvEm:**
- Simpler learning curve
- Smaller bundle size
- Focused functionality for basic pub/sub patterns
- Less conceptual overhead

**Cons of EvEm:**
- Lacks advanced reactive programming features
- Less powerful for complex async workflows
- No oob extension support 

### EvEm vs tiny-emitter

**Pros of EvEm:**
- TypeScript support out of the box
- More features (namespaces, wildcards, async handling)
- Better error handling
- Subscription ID system

**Cons of EvEm:**
- Larger size compared to tiny-emitter's minimal footprint
- More complex implementation

### EvEm vs events (browserify)

**Pros of EvEm:**
- Modern TypeScript implementation
- Namespaces and wildcards not available in events
- Timeout handling for async callbacks
- Better designed for modern frontend applications

**Cons of EvEm:**
- Not a direct drop-in replacement for Node.js code
- Less community adoption

## License

**evem** is open-source and free, distributed under the MIT License. See [LICENSE](LICENSE.md) for more information.

## TODO Features

These are planned features for future releases:

1. **Event History/Replay**: Keep a history of recent events and allow new subscribers to optionally receive the most recent event immediately upon subscription.

2. **Middleware Support**: Allow registration of middleware functions that can intercept, modify, or cancel all events before they reach subscribers.

3. **Error Policies**: Add configurable policies for how errors in callbacks are handled (e.g., fail silently, cancel event propagation, etc.).

4. **Subscription Lifecycle Hooks**: Add hooks for subscription creation and teardown, useful for cleanup operations.

5. **Memory Leak Detection**: Add optional warnings when subscriptions might be leaking (e.g., too many subscriptions to the same event).

6. **Event Schema Validation**: Add optional runtime validation of event data against schemas.

✅ ~~7. **Cancelable Events**: Allow events to be canceled by subscribers to prevent further processing.~~

8. **Event Transformation**: Allow subscribers to transform event data before it's passed to subsequent subscribers in the chain.

9. **Performance Metrics/Telemetry**: Built-in instrumentation for measuring event processing performance.
