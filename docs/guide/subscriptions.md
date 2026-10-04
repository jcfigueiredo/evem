# Subscription options

What a subscription can do with the events it receives: filter them, slow them down, transform them for the subscribers after it, and validate them.

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

A debounced call runs on its own timer, not as part of the publish (usually after `publish` has resolved, but a slow subscriber can keep a publish running past `debounceTime`): `publish` doesn't wait for it, its errors are logged instead of going through the error policy, and the subscriber's transform isn't applied.

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

With both options, an event is handled immediately when more than `throttleTime` ms have passed since the last event that was handled immediately. Other events are debounced: the latest one is handled `debounceTime` ms after it arrived, unless an event is handled immediately first. Debounced calls don't count as handled immediately, so one can be followed closely by an immediate call. While events keep coming, the callback runs at the start of each throttle window, and once they stop, one more time with the last event, unless that event was handled immediately:

```typescript
// While the user types: suggest right away at the start of each 300ms window, and with the last
// keystroke once typing pauses for 500ms
evem.subscribe('user.typing', suggestCompletions, {
  throttleTime: 300,
  debounceTime: 500
});
```

This combination is particularly useful for handling scenarios like:
- Autocomplete suggestions - show results while the user types, and for the final input
- Infinite scrolling - load while the user scrolls, and once more where scrolling stops
- Progress updates - show updates at a steady rate, and always the final one

## Event Transformation

A subscriber can have a `transform` function. It runs right after that subscriber's callback, and its result is the data that the subscribers after it (lower priority, or subscribed later with the same priority) receive. This is useful for enriching, modifying, or adapting event data in sequence.

A transform only applies when its subscriber handled the event: not when the subscriber's filter or schema rejected it, while the subscriber is throttled, for debounced calls, or after a `once` subscription has fired. It doesn't run when its callback canceled the event, threw or timed out; the next subscriber then gets the data unchanged. History keeps the data as the middleware left it, before any transform.

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
evem.use((event: string, data: unknown) => {
  // Add a timestamp to every object payload, and leave other payloads as they are
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }
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
// Logs: Schema validation failed for event 'user.register'  <- from the first subscriber
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
