
# EvEm - Simple Event Emitter Library 📢

EvEm is a lightweight and flexible event emitter library for TypeScript, providing a simple yet powerful pub/sub system. It's designed to handle both synchronous and asynchronous event callbacks with ease.

## Features

- **🔗 Event Subscription**: Easily subscribe to events with callbacks.
  - `subscribe(event: string, callback: EventCallback<T>): void`

- **❌ Event Unsubscription**: Unsubscribe from events to stop receiving notifications.
  - `unsubscribe(event: string, callback: EventCallback<T>): void`

- **📣 Event Publishing**: Publish events with optional data.
  - `publish<T = unknown>(event: string, args?: T): Promise<void>`

- **⏱️ Asynchronous and Synchronous Callbacks**: Support for both synchronous and asynchronous callbacks.
  - Callbacks can be either a simple function or an `async` function.

- **🌀 Customizable Recursion Depth**: Set a custom maximum recursion depth for event publishing to prevent stack overflow errors and infinite loops.
  - Constructor parameter to set the maximum recursion depth (default is 3).

- **🛠️ Error Handling**: Robust error handling for empty event names and exceptions in callbacks.
  - Throws an error if the event name is empty during subscription, unsubscription, or publishing.
  - Handles exceptions thrown in event callbacks gracefully.

- **🌟 Wildcard Event Names**: Support for wildcard event names, allowing for flexible event listening.
  - Subscribe to events using patterns like `*.eventName` or `eventName.*`.

- **📚 Namespace Support**: Organize events using a namespace pattern.
  - Facilitates categorizing and managing events based on their namespace.


## Getting on Board

### Installation

Pick your favorite package manager and get going:

**pnpm:**

```bash
pnpm add evem
```

### Quick Start

Jump right in! 

```typescript
import { EvEm } from 'evem';
const evem = new EvEm();

// Subscribe to a party start event
evem.subscribe('party.start', () => {
    console.log('Let’s get this party started!');
});

// Publish the party start event
void evem.publish('party.start');

// Using Asynchronous Callbacks
evem.subscribe('party.end', async () => {
    console.log('Wrapping up the party...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulating async operation
    console.log('Party ended.');
});

awit evem.publish('party.end');

// Unsubscribing from an Event
const danceCallback = () => console.log('Time to dance!');
evem.subscribe('party.dance', danceCallback);

// Later, to unsubscribe from the event
evem.unsubscribe('party.dance', danceCallback);
```

For a comprehensive set of examples, check out the [examples](docs/examples.md) page.

## API at Your Fingertips

- `subscribe(event: string, callback: EventCallback<T>): void`
- `unsubscribe(event: string, callback: EventCallback<T>): void`
- `publish(event: string, args?: T): Promise<void>`

## Join the Party - Contribute!

Got awesome ideas? Want to make **evem** even better? Jump in and contribute! Open an issue or submit a pull request to get started.

## Test It Out

Run the tests and watch the magic:

```bash
pnpm test
```

## License

**evem** is open-source and free, distributed under the MIT License. See [LICENSE](LICENSE.md) for more information.

