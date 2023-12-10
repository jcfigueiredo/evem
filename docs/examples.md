# EvEm Library - Comprehensive Examples

This document provides a comprehensive list of examples for all the features of the EvEm library, illustrating its capabilities and usage in various scenarios.

## Importing and Initializing EvEm

```typescript
import { EvEm } from "evem";
const evem = new EvEm();
```

## Basic Event Subscription and Publishing

### Subscribing to an Event

```typescript
const subId = evem.subscribe("event.name", data => {
  console.log(`Event received with data: ${data}`);
});
```

### Publishing an Event

```typescript
async function publishEvent() {
  await evem.publish("event.name", "Hello World!");
}
publishEvent();
// or
void evem.publish("event.name", "Hello World!");
```

## Asynchronous Callbacks and Timeout Management

### Subscribing with an Asynchronous Callback

```typescript
evem.subscribe(
  "async.event",
  async data => {
    console.log(`Received data: ${data}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("Async operation completed.");
  },
  5000
); // 5000 ms timeout for this callback
```

### Publishing to Asynchronous Subscribers

```typescript
async function publishAsyncEvent() {
  await evem.publish("async.event", "Async Data", 3000); // 3000 ms timeout for all callbacks
}
publishAsyncEvent();
```

## Unsubscribing from Events

### Subscribing and then Unsubscribing

```typescript
const callback = data => console.log(`Data: ${data}`);

const subId = evem.subscribe("event.unsubscribe", callback);

// To unsubscribe later
evem.unsubscribeById(subId);
// Or unsubscribe by event name and callback
evem.unsubscribe("event.unsubscribe", callback);
```

## Wildcard Event Names

### Subscribing to a Wildcard Event

```typescript
evem.subscribe("user.*", data => {
  console.log(`User event occurred: ${data}`);
});

evem.publish("user.login", { username: "john_doe" });
evem.publish("user.logout");
```

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

```typescript
const customEvem = new EvEm(5); // Custom max recursion depth

customEvem.subscribe("event.recursive", () => {
  console.log("Recursive event triggered");
  // Recursive event logic
});

// Publish the event that triggers recursion
customEvem.publish("event.recursive");
```

## Error Handling

### Error Handling in Subscriptions and Publishing

```typescript
// Attempting to subscribe with an empty event name
try {
  evem.subscribe("", () => {});
} catch (error) {
  console.error(error);
}

// Attempting to publish with an empty event name
try {
  evem.publish("");
} catch (error) {
  console.error(error);
}
```

These examples cover all the major features of the EvEm library, demonstrating its versatility and ease of use in different scenarios.
