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
  
- **📜 Event History**: Keep a history of events and replay them to new subscribers.

  - Enable with `enableHistory(maxEvents)` to start recording events
  - Replay the most recent event with `subscribe(event, callback, { replayLastEvent: true })`
  - Replay all matching historical events with `subscribe(event, callback, { replayHistory: true })`
  - Access recorded events with `getEventHistory()`

- **📣 Event Publishing**: Publish events with optional data and configuration.

  - `publish<T = unknown>(event: string, args?: T, options?: PublishOptions | number): Promise<boolean>`
  - Returns a boolean indicating whether the event completed (true) or was canceled (false)
  - Configure timeouts, error policies, and cancelable behavior

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
  
- **⚠️ Error Policies**: Configure how errors in event callbacks are handled.

  - Set different policies when publishing events using `errorPolicy: ErrorPolicy.OPTION`
  - Supports four policy modes: LOG_AND_CONTINUE (default), SILENT, CANCEL_ON_ERROR, and THROW
  - Control whether errors are logged, ignored, stop event propagation, or are rethrown
  - Provides flexibility in error handling strategies for different use cases
  
- **🔄 Middleware Support**: Process and transform events before they reach subscribers.

  - Register middleware functions that can intercept and modify events
  - Apply middleware to specific event patterns using wildcards (e.g., "user.*", "*.created")
  - Transform event data or redirect events to different event names
  - Cancel events based on custom conditions
  - Apply global or targeted processing logic across your application

- **⏱️ Timeout Management for Asynchronous Callbacks**: Ensures that asynchronous callbacks do not hang indefinitely.

  - A default timeout of 5000ms (5 seconds) is set for each callback, but can be overridden per event in the `publish` method.
  - Gracefully handles timeout exceedance.

- **⏱️ Asynchronous and Synchronous Callbacks**: Support for both synchronous and asynchronous callbacks.

  - Callbacks can be either a simple function or an `async` function.
  - Promises from async callbacks are properly awaited in the event chain

- **🌀 Customizable Recursion Depth**: Set a custom maximum recursion depth for event publishing to prevent stack overflow errors and infinite loops.

  - Constructor parameter to set the maximum recursion depth (default is 3).

- **🛠️ Error Handling**: Robust error handling for empty event names and exceptions in callbacks.

  - Throws an error if the event name is empty during subscription, unsubscription, or publishing.
  - Handles exceptions thrown in event callbacks gracefully.

- **🔍 Debugging Support**: Inspect and monitor the event system with the info method.

  - Get information about all registered subscriptions and middleware
  - Filter results by event pattern to focus on specific event types
  - See priorities, subscription IDs, and middleware patterns
  - Useful for debugging complex event setups and visualizing the event system state
  
- **🔄 Event Transformation**: Allow subscribers to transform event data before it's passed to subsequent subscribers.

  - Add additional data or modify existing data between handlers
  - Build data processing pipelines with multiple transform steps
  - Support for both synchronous and asynchronous transformations
  - Chain with other features like filtering and priorities for complex workflows

- **🔍 Memory Leak Detection**: Detect potential memory leaks from event handlers that aren't properly unsubscribed.

  - Enable with `enableMemoryLeakDetection(options)` 
  - Configure custom thresholds for warning detection
  - Detailed subscription information provided when potential leaks are detected
  - Helps identify events with too many subscriptions that might be leaking memory

- **🔒 Event Schema Validation**: Validate event data against schemas to ensure data integrity.

  - Define schema validators that check event data structure and types
  - Support for both simple validators (boolean result) and advanced validators (detailed error information)
  - Configurable error policies for validation failures (continue, silent, cancel, throw)
  - Seamlessly integrates with other features like filtering and transformations
  - Works with both synchronous and asynchronous validation

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

// Using event history and replay
evem.enableHistory();  // Start recording events

// Publish some events
await evem.publish('sensor.reading', { value: 42, unit: 'celsius' });
await evem.publish('sensor.reading', { value: 43, unit: 'celsius' });

// Later, a new subscriber can get the last reading immediately
evem.subscribe('sensor.reading', reading => {
  console.log(`Current temperature: ${reading.value}${reading.unit}`);
}, { replayLastEvent: true }); // Outputs "Current temperature: 43celsius" immediately

// Or replay the entire history
evem.subscribe('sensor.reading', reading => {
  console.log(`Historical reading: ${reading.value}${reading.unit}`);
}, { replayHistory: true }); // Replays all recorded sensor.reading events

// Using memory leak detection
evem.enableMemoryLeakDetection({
  threshold: 10,                 // Warn when an event has more than 10 subscribers (default)
  showSubscriptionDetails: true  // Show detailed info about subscriptions (default)
});

// Now if you create many subscriptions to the same event without unsubscribing,
// you'll get warnings in the console to help detect memory leaks
for (let i = 0; i < 15; i++) {
  evem.subscribe('button.click', () => console.log('Button clicked!')); 
}
// Warning: "Possible memory leak detected: 15 handlers added for event 'button.click'..."

// Disable memory leak detection when no longer needed
evem.disableMemoryLeakDetection();

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

// Using schema validation
// First, define an interface for your event data
interface UserData {
  id: number;
  name: string;
  email: string;
  age: number;
}

// Simple schema validator
const userSchema = (data: UserData) => {
  return (
    typeof data === 'object' &&
    typeof data.id === 'number' &&
    typeof data.name === 'string' &&
    typeof data.email === 'string' && 
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) && // Email validation
    typeof data.age === 'number' &&
    data.age >= 18 // Must be 18 or older
  );
};

// Advanced schema validator with detailed errors
const advancedUserSchema = (data: any) => {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ message: 'Data must be an object' }] };
  }
  
  if (typeof data.id !== 'number') {
    errors.push({ message: 'ID must be a number', path: 'id' });
  }
  
  if (typeof data.name !== 'string' || data.name.length < 2) {
    errors.push({ message: 'Name must be a string with at least 2 characters', path: 'name' });
  }
  
  if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push({ message: 'Email must be a valid email address', path: 'email' });
  }
  
  if (typeof data.age !== 'number' || data.age < 18) {
    errors.push({ message: 'Age must be a number and 18 or older', path: 'age' });
  }
  
  return { 
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
};

// Subscribe with schema validation
evem.subscribe<UserData>('user.register', (user) => {
  console.log(`User registered successfully: ${user.name}, ${user.email}`);
}, {
  schema: userSchema
});

// Subscribe with advanced schema validation and custom error policy
evem.subscribe<UserData>('user.register', (user) => {
  console.log(`Processing valid user registration: ${user.name}`);
}, {
  schema: advancedUserSchema,
  schemaErrorPolicy: ErrorPolicy.LOG_AND_CONTINUE // Log errors but still execute callback
});

// This will trigger the callback (valid data)
await evem.publish('user.register', {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',
  age: 25
});

// This will fail schema validation (invalid email and age)
await evem.publish('user.register', {
  id: 2,
  name: 'Bob',
  email: 'invalid-email',
  age: 16
});
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

## Middleware

EvEm allows you to register middleware functions that can intercept, transform, or cancel events before they reach subscribers.

### Basic Middleware Usage

```typescript
import { EvEm, MiddlewareFunction } from "evem";
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

// Register an event handler that can use the metadata
evem.subscribe('user.login', (data) => {
  console.log(`User logged in at ${new Date(data.timestamp).toISOString()}`);
  console.log(`Event: ${data.eventName}`);
  console.log(`Username: ${data.username}`);
});

// Publish an event
await evem.publish('user.login', { username: 'alice' });
// Output:
// User logged in at 2023-05-20T15:30:45.123Z
// Event: user.login
// Username: alice
```

### Pattern-Based Middleware

You can apply middleware to specific event patterns, allowing for more targeted event processing:

```typescript
import { EvEm, MiddlewareConfig } from "evem";
const evem = new EvEm();

// Middleware that only applies to user events
const userEventsMiddleware: MiddlewareConfig = {
  pattern: 'user.*',
  handler: (event, data) => {
    console.log(`Processing user event: ${event}`);
    return {
      ...data,
      audit: {
        processedAt: new Date(),
        eventType: 'user'
      }
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

// These events will trigger different middleware
await evem.publish('user.login', { id: 1 });  // Only triggers user middleware
await evem.publish('product.created', { id: 2 });  // Only triggers creation middleware
await evem.publish('user.created', { id: 3 });  // Triggers both middleware

// Subscribe to see the results
evem.subscribe('user.created', (data) => {
  console.log('User created:', data);
  // Output: User created: { id: 3, isNew: true, audit: { processedAt: "...", eventType: "user" } }
});
```

### Event Transformation and Redirection

Middleware can also transform events or redirect them to different event types:

```typescript
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

### Event Filtering with Middleware

Middleware can be used to filter or cancel events based on global conditions:

```typescript
// Create a middleware that implements a permissions system
const permissionsMiddleware: MiddlewareFunction = (event, data) => {
  // Check if this event requires permissions
  if (event.startsWith('secure.')) {
    // Check if the user has permissions
    if (!data.user || !data.user.permissions || !data.user.permissions.includes('admin')) {
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
// Output: Accessing secure data: { user: { name: 'alice', permissions: ['admin'] } }
```

## Error Policy Configuration

EvEm allows you to configure how errors in event callbacks are handled through different error policies.

### Using Different Error Policies

```typescript
import { EvEm, ErrorPolicy } from "evem";
const evem = new EvEm();

// Register handlers
evem.subscribe('process.data', data => {
  // This handler might throw
  if (!data.isValid) {
    throw new Error('Invalid data format');
  }
  console.log('Processing data:', data);
});

// Default behavior: Log errors and continue
await evem.publish('process.data', { isValid: false });
// Error is logged to console, but execution continues

// Silent policy: Ignore errors completely
await evem.publish('process.data', { isValid: false }, {
  errorPolicy: ErrorPolicy.SILENT
});
// No error logging, silently continues

// Cancel policy: Stop event propagation when an error occurs
await evem.publish('process.data', { isValid: false }, {
  errorPolicy: ErrorPolicy.CANCEL_ON_ERROR
});
// Error is logged, but propagation stops and returns false

// Throw policy: Rethrow the error to the caller
try {
  await evem.publish('process.data', { isValid: false }, {
    errorPolicy: ErrorPolicy.THROW
  });
} catch (error) {
  console.error('Caught error from event handler:', error);
  // Handle the error at the caller level
}
```

### Use Cases for Different Error Policies

Different error policies are useful in different scenarios:

- **LOG_AND_CONTINUE**: Good for non-critical handlers where failures should be noted but not impact other handlers
- **SILENT**: Useful for optional features where errors shouldn't clutter logs
- **CANCEL_ON_ERROR**: Good for validation chains where any failure should halt the process
- **THROW**: Useful when the caller needs to handle errors from event handlers directly

## Error Policy Configuration

EvEm allows you to configure how errors in event callbacks are handled through different error policies.

### Using Different Error Policies

```typescript
import { EvEm, ErrorPolicy } from "evem";
const evem = new EvEm();

// Register handlers
evem.subscribe('process.data', data => {
  // This handler might throw
  if (!data.isValid) {
    throw new Error('Invalid data format');
  }
  console.log('Processing data:', data);
});

// Default behavior: Log errors and continue
await evem.publish('process.data', { isValid: false });
// Error is logged to console, but execution continues

// Silent policy: Ignore errors completely
await evem.publish('process.data', { isValid: false }, {
  errorPolicy: ErrorPolicy.SILENT
});
// No error logging, silently continues

// Cancel policy: Stop event propagation when an error occurs
await evem.publish('process.data', { isValid: false }, {
  errorPolicy: ErrorPolicy.CANCEL_ON_ERROR
});
// Error is logged, but propagation stops and returns false

// Throw policy: Rethrow the error to the caller
try {
  await evem.publish('process.data', { isValid: false }, {
    errorPolicy: ErrorPolicy.THROW
  });
} catch (error) {
  console.error('Caught error from event handler:', error);
  // Handle the error at the caller level
}
```

### Use Cases for Different Error Policies

Different error policies are useful in different scenarios:

- **LOG_AND_CONTINUE**: Good for non-critical handlers where failures should be noted but not impact other handlers
- **SILENT**: Useful for optional features where errors shouldn't clutter logs
- **CANCEL_ON_ERROR**: Good for validation chains where any failure should halt the process
- **THROW**: Useful when the caller needs to handle errors from event handlers directly

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

## Event Transformation

EvEm allows you to transform event data before it's passed to the next subscriber in the chain. This is useful for enriching, modifying, or adapting event data in sequence.

### Basic Transformation

```typescript
// Create a subscriber that transforms event data
emitter.subscribe('user.login', (user) => {
  console.log(`User logged in: ${user.name}`);
}, {
  transform: (user) => {
    // Add timestamp and client info to the event
    return {
      ...user,
      timestamp: Date.now(),
      clientInfo: detectClientInfo()
    };
  }
});

// Next subscriber receives the transformed data
emitter.subscribe('user.login', (userData) => {
  console.log(`Login recorded at ${new Date(userData.timestamp).toISOString()}`);
  console.log(`Client: ${userData.clientInfo.browser} on ${userData.clientInfo.os}`);
});

// Publish with original data
await emitter.publish('user.login', { name: 'Alice', id: 123 });
```

### Transformation Chain

Multiple subscribers can transform the data in sequence, creating a data processing pipeline:

```typescript
// First subscriber normalizes the data
emitter.subscribe('message.received', (msg) => {
  console.log('Processing message...');
}, {
  priority: 'high',
  transform: (msg) => ({
    ...msg,
    content: msg.content.trim().toLowerCase()
  })
});

// Second subscriber enriches the data
emitter.subscribe('message.received', (msg) => {
  console.log('Enriching message...');
}, {
  priority: 'normal',
  transform: (msg) => ({
    ...msg,
    wordCount: msg.content.split(/\s+/).length,
    sentiment: analyzeSentiment(msg.content)
  })
});

// Final subscriber receives fully transformed data
emitter.subscribe('message.received', (msg) => {
  console.log(`Message: "${msg.content}"`);
  console.log(`Word count: ${msg.wordCount}`);
  console.log(`Sentiment: ${msg.sentiment}`);
}, { priority: 'low' });

// Original data is simple
await emitter.publish('message.received', { 
  content: '  Hello World!  ',
  sender: 'user1'
});
```

### Async Transformations

Transformations can be asynchronous, automatically waiting for completion before proceeding:

```typescript
emitter.subscribe('document.upload', (doc) => {
  console.log('Document received');
}, {
  transform: async (doc) => {
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
emitter.subscribe('document.upload', (doc) => {
  console.log(`Document processed at ${doc.processedAt}`);
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
- You're implementing a custom transformation pipeline for a specific event flow
- You want to maintain a clear data flow within a specific feature

**Use Middleware When:**
- You need global preprocessing that applies to many events
- You want to apply a consistent transformation across your entire application
- You need to potentially change the event name (redirecting events)
- You want to implement cross-cutting concerns like logging or authentication
- You need to potentially cancel events before they reach any subscribers

**Examples:**

```typescript
// MIDDLEWARE: Application-wide timestamp enrichment
evem.use((event, data) => {
  // Add timestamp to ALL events
  return { ...data, timestamp: Date.now() };
});

// TRANSFORMATION: Feature-specific data normalization
evem.subscribe('user.input', (data) => {
  console.log('Processing user input:', data.value);
}, {
  transform: (data) => {
    // Normalize this specific input stream
    return {
      ...data,
      value: data.value.trim().toLowerCase()
    };
  }
});
```

In general, middleware is better for application-wide concerns while transformations are better for feature-specific data processing.

**Combining Both:**

You can use both approaches together for more complex scenarios:

```typescript
// Middleware handles global concerns
evem.use((event, data) => {
  // Add request context to all events
  return { ...data, context: getCurrentRequestContext() };
});

// First subscriber does basic validation and enrichment
evem.subscribe('order.submit', validateOrder, {
  priority: 'high',
  transform: (order) => {
    // Normalize and enrich order data
    return {
      ...order,
      total: calculateTotal(order.items),
      normalizedItems: normalizeItems(order.items)
    };
  }
});

// Second subscriber processes the validated and enriched data
evem.subscribe('order.submit', processOrder, {
  priority: 'normal',
  transform: async (order) => {
    // Add payment processing results
    const paymentResult = await processPayment(order);
    return {
      ...order,
      payment: paymentResult
    };
  }
});

// Final subscriber receives fully processed data with all transformations
evem.subscribe('order.submit', finalizeOrder, { priority: 'low' });
```

This approach gives you flexibility to handle both global and specific concerns in a clean, modular way.

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

## Using Event History and Replay

EvEm can maintain a history of published events, allowing new subscribers to catch up on what they missed.

```typescript
import { EvEm } from "evem";
const evem = new EvEm();

// Enable history recording with a maximum of 100 events
evem.enableHistory(100);

// Publish some events that will be recorded
await evem.publish('user.login', { userId: 1, name: 'Alice' });
await evem.publish('notification', { message: 'New feature available!' });
await evem.publish('user.login', { userId: 2, name: 'Bob' });

// Retrieve all recorded events
const allHistory = evem.getEventHistory();
console.log(`Recorded ${allHistory.length} events`);

// Retrieve just user.login events
const loginHistory = evem.getEventHistory('user.login');
console.log(`${loginHistory.length} user logins recorded`);

// When a new component is initialized later, it can get the most recent notification
function initializeNotificationCenter() {
  evem.subscribe('notification', (notification) => {
    displayNotification(notification.message);
  }, { 
    replayLastEvent: true  // Will immediately receive 'New feature available!'
  });
}

// When a new analytics service connects, it can get all user login history
function initializeAnalytics() {
  evem.subscribe('user.login', (user) => {
    trackUserLogin(user.userId, user.name);
  }, { 
    replayHistory: true  // Will receive both Alice and Bob's logins in order
  });
}

// Clear history if needed
evem.clearEventHistory();

// Disable history recording when no longer needed
evem.disableHistory();
```

### Uses for Event History

Event history is particularly useful for:

1. **Late Subscribers**: Components that initialize after events have occurred can catch up 
2. **State Synchronization**: New components can immediately sync with the current application state
3. **Audit Trails**: Keep a record of important events for logging or debugging
4. **Replay Scenarios**: Test components by replaying the same sequence of events
5. **Event Sourcing**: Build event-sourced architectures where system state is derived from event history

## Using the Info Method for Debugging

The `info` method provides a convenient way to inspect the current state of the event emitter, which is useful for debugging and monitoring.

```typescript
import { EvEm } from "evem";
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
// Shows all subscriptions and middleware

// Get info about only user-related events and middleware
const userInfo = evem.info('user.*');
console.log('User-related events and middleware:', userInfo);
// Shows only user.login, user.logout subscriptions and relevant middleware
```

This feature is particularly useful for:
1. Debugging complex event setups
2. Visualizing the current state of the event system
3. Checking which middleware will be applied to specific events
4. Inspecting the priority order of event handlers

For a comprehensive set of examples, check out the [examples](docs/examples.md) page.

## API at Your Fingertips

- `subscribe(event: string, callback: EventCallback<T>, options?: SubscriptionOptions<T>): string`
  - `options.filter`: A predicate function or array of predicate functions that determine if the callback should be executed
  - `options.debounceTime`: Number of milliseconds to debounce the event (only process the last event within this time window)
  - `options.throttleTime`: Number of milliseconds to throttle the event (limit to at most one execution per time window)
  - `options.once`: When true, automatically unsubscribes after the callback is invoked for the first time
  - `options.priority`: Priority level ('high', 'normal', 'low'), number, or Priority enum value (Priority.HIGH) to control execution order (higher values execute first)
  - `options.transform`: A function that transforms the event data before it's passed to the next subscriber
  - `options.replayLastEvent`: When true, immediately trigger the callback with the most recent matching event from history
  - `options.replayHistory`: When true, immediately trigger the callback with all matching events from history
  - `options.schema`: A schema validator function to validate event data before the callback is executed
  - `options.schemaErrorPolicy`: How to handle schema validation errors (default: ErrorPolicy.CANCEL_ON_ERROR)
- `subscribeOnce(event: string, callback: EventCallback<T>, options?: Omit<SubscriptionOptions<T>, 'once'>): string`
- `unsubscribe(event: string, callback: EventCallback<T>): void`
- `unsubscribeById(id: string): void`
- `publish(event: string, args?: T, options?: PublishOptions | number): Promise<boolean>`
  - Returns `true` if the event completed without being canceled, `false` if it was canceled
  - `options.timeout`: Number of milliseconds before timing out async callbacks (default: 5000)
  - `options.cancelable`: Whether the event can be canceled by handlers (default: false)
  - `options.errorPolicy`: How to handle errors in callbacks (default: ErrorPolicy.LOG_AND_CONTINUE)
- `use(middleware: MiddlewareFunction | MiddlewareConfig)`: Register a middleware function to process events
  - Can provide a simple function that processes all events
  - Or a config object with `pattern` and `handler` to process only matching events
- `removeMiddleware(middleware: MiddlewareFunction | MiddlewareConfig)`: Remove a previously registered middleware function
- `info(pattern?: string): EventInfo[]`: Get information about subscriptions and middleware
  - Returns an array of EventInfo objects containing details about events and middleware
  - Can be filtered by providing an optional pattern parameter
  - Useful for debugging and inspecting the current state of the event emitter
- `enableHistory(maxEvents?: number)`: Start recording events in history (default max: 50)
- `disableHistory()`: Stop recording events in history (doesn't clear existing history)
- `clearEventHistory()`: Remove all events from history
- `getEventHistory(pattern?: string)`: Get recorded events, optionally filtered by pattern
- `enableMemoryLeakDetection(options?: MemoryLeakOptions)`: Enable memory leak detection with optional configuration
  - `options.threshold`: Number of handlers per event before warning (default: 10) 
  - `options.showSubscriptionDetails`: Whether to show detailed information about subscriptions (default: true)
- `disableMemoryLeakDetection()`: Disable memory leak detection

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

1. ~~**Event History/Replay**: Keep a history of recent events and allow new subscribers to optionally receive the most recent event immediately upon subscription.~~ ✅ Implemented in latest version!

2. **Subscription Lifecycle Hooks**: Add hooks for subscription creation and teardown, useful for cleanup operations.

3. ~~**Memory Leak Detection**: Add optional warnings when subscriptions might be leaking (e.g., too many subscriptions to the same event).~~ ✅ Implemented in latest version!

4. ~~**Event Schema Validation**: Add optional runtime validation of event data against schemas.~~ ✅ Implemented in latest version!

5. ~~**Event Transformation**: Allow subscribers to transform event data before it's passed to subsequent subscribers in the chain.~~ ✅ Implemented in latest version!

6. **Performance Metrics/Telemetry**: Built-in instrumentation for measuring event processing performance.
