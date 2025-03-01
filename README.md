# EvEm - Simple Event Emitter Library 📢

EvEm is a lightweight and flexible event emitter library for TypeScript, providing a simple yet powerful pub/sub system. It's designed to handle both synchronous and asynchronous event callbacks with ease.

## Features

- **🔗 Event Subscription**: Easily subscribe to events with callbacks. Each subscription returns a unique identifier (UUID) which can be used for unsubscribing.

  - `subscribe(event: string, callback: EventCallback<T>): string`

- **❌ Event Unsubscription**: Unsubscribe from events to stop receiving notifications.

  - `unsubscribe(event: string, callback: EventCallback<T>): void`
  - `unsubscribeById(id: string): void` - Unsubscribe using the unique ID returned by `subscribe`.

- **📣 Event Publishing**: Publish events with optional data.

  - `publish<T = unknown>(event: string, args?: T, timeout?: number): Promise<void>`

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

This combination is particularly useful for handling things like form input validation, search-as-you-type, or any scenario where you want to process only the most recent event after a period of inactivity.

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
- `unsubscribe(event: string, callback: EventCallback<T>): void`
- `unsubscribeById(id: string): void`
- `publish(event: string, args?: T, timeout?: number): Promise<void>`

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
- No operators for transforming event streams
- Less powerful for complex async workflows
- Smaller ecosystem of extensions

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
