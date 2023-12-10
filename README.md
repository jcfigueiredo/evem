# EvEm - Simple Event Emitter Library 📢

EvEm is a lightweight and flexible event emitter library for TypeScript, providing a simple yet powerful pub/sub system. It's designed to handle both synchronous and asynchronous event callbacks with ease.

## Features

- **🔗 Event Subscription**: Easily subscribe to events with callbacks. Each subscription returns a unique identifier (UUID) which can be used for unsubscribing.

  - `subscribe(event: string, callback: EventCallback<T>): string`

- **❌ Event Unsubscription**: Unsubscribe from events to stop receiving notifications.

  - `unsubscribe(event: string, callback: EventCallback<T>): void`
  - `unsubscribeById(id: string): void` - Unsubscribe using the unique ID returned by `subscribe`.

- **📣 Event Publishing**: Publish events with optional data.

  - `publish<T = unknown>(event: string, args?: T): Promise<void>`

- **📚 Namespace Support**: Organize events using a namespace pattern.

  - `subscribe("namespace.eventName", callback)`
  - Facilitates categorizing and managing events based on their namespace.

- **🌟 Wildcard Event Names**: Support for wildcard event names, allowing for flexible event listening.

  - Subscribe to events using patterns like `eventName.*`, `*.eventName`, or `namespace.*.events`.

- **⏱️ Timeout Management for Asynchronous Callbacks**: Ensures that asynchronous callbacks do not hang indefinitely.

  - `subscribe(event: string, callback: EventCallback<T>, timeout?: number): string`
  - A default timeout is set for each callback, but can be overridden per event in the `publish` method.
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
  console.log("Let’s get this party started!");
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
```

## Managing Timeouts in Callbacks

EvEm's flexible design allows for managing timeouts in asynchronous callbacks, ensuring they don't hang indefinitely.

### Setting a Default Timeout

When publishing an event, you can set a default timeout for all its callbacks. This is useful when you want to ensure that all callbacks complete within a specific time frame.

```typescript
// Set a 3000 ms timeout for all callbacks of this event
await evem.publish("network.request", requestData, 3000);
```

### Individual Callback Timeout

You can also manage timeouts on a per-callback basis, giving you finer control over each callback's execution time.

```typescript
// Subscribe to an event with a specific timeout for this callback
evem.subscribe(
  "data.process",
  async data => {
    // Process data
    await processData(data);
  },
  2000
); // 2000 ms timeout for this particular callback
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

For a comprehensive set of examples, check out the [examples](docs/examples.md) page.

## API at Your Fingertips

- `subscribe(event: string, callback: EventCallback<T>): string`
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

## License

**evem** is open-source and free, distributed under the MIT License. See [LICENSE](LICENSE.md) for more information.
