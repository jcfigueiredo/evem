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

## Cancelable Events

### Basic Cancelable Event

```typescript
// Subscribe with a handler that might cancel the event
evem.subscribe("payment.process", (event) => {
  // Check if there are sufficient funds
  if (event.amount > event.availableBalance) {
    console.log("Insufficient funds, canceling payment");
    event.cancel();
    return;
  }
  console.log("Payment approved");
});

// Another handler that will only run if the payment wasn't canceled
evem.subscribe("payment.process", (event) => {
  console.log(`Processing payment of $${event.amount}`);
  // Process the payment...
});

// Publish a cancelable event
const paymentData = { amount: 100, availableBalance: 50 };
const result = await evem.publish("payment.process", paymentData, { cancelable: true });

if (!result) {
  console.log("Payment was canceled");
} else {
  console.log("Payment was processed successfully");
}
```

### Multi-step Validation with Cancelable Events

```typescript
// Step 1: Data validation
evem.subscribe("user.register", (event) => {
  if (!event.email || !event.password) {
    console.log("Missing required fields");
    event.cancel();
    return;
  }
}, { priority: 'high' });

// Step 2: Business rules
evem.subscribe("user.register", (event) => {
  if (event.password.length < 8) {
    console.log("Password too short");
    event.cancel();
    return;
  }
}, { priority: 'normal' });

// Step 3: The actual registration process
evem.subscribe("user.register", (event) => {
  console.log("Registering user:", event.email);
  // Save user to database...
}, { priority: 'low' });

// Publish with cancelable option
const userData = { email: "user@example.com", password: "short" };
const registrationComplete = await evem.publish("user.register", userData, { cancelable: true });

console.log(registrationComplete ? "User registered" : "Registration canceled");
```

### Timeout with Cancelable Events

```typescript
// This example shows using both timeout and cancelable options
evem.subscribe("api.request", async (event) => {
  try {
    const response = await fetch(event.url);
    if (!response.ok) {
      console.log(`API request failed with status ${response.status}`);
      event.cancel();
      return;
    }
    event.data = await response.json();
  } catch (error) {
    console.error("Error fetching API:", error);
    event.cancel();
  }
});

// Process the API response if the request was successful
evem.subscribe("api.request", (event) => {
  console.log("Processing API response:", event.data);
});

// Publish with both cancelable and timeout options
const apiResult = await evem.publish("api.request", 
  { url: "https://api.example.com/data" }, 
  { cancelable: true, timeout: 5000 }
);

console.log(apiResult ? "API request succeeded" : "API request failed or was canceled");
```

## WebSocket Adapter Examples

### Basic WebSocket Connection with State Management

```typescript
import { EvEm } from 'evem';
import { ConnectionManager } from '../src/websocket/ConnectionManager';

const evem = new EvEm();
const connectionManager = new ConnectionManager(evem);

// Track connection state changes
evem.subscribe('ws.connection.state', (event) => {
  console.log(`Connection state: ${event.from} -> ${event.to}`);
  console.log(`Timestamp: ${new Date(event.timestamp).toISOString()}`);

  if (event.to === 'connected') {
    console.log('WebSocket is now connected');
  } else if (event.to === 'disconnected') {
    console.log('WebSocket is now disconnected');
  }
});

// Simulate connection lifecycle
async function connectWebSocket() {
  await connectionManager.transitionTo('connecting');
  // ... perform actual connection ...
  await connectionManager.transitionTo('connected');
}

async function disconnectWebSocket() {
  await connectionManager.transitionTo('disconnecting');
  // ... perform actual disconnection ...
  await connectionManager.transitionTo('disconnected');
}

// Use state queries
if (connectionManager.isConnected()) {
  console.log('Ready to send messages');
}
```

### Message Queue with Auto-Flush

```typescript
import { EvEm } from 'evem';
import { ConnectionManager, MessageQueue } from '../src/websocket';

const evem = new EvEm();
const connectionManager = new ConnectionManager(evem);
const messageQueue = new MessageQueue(evem, connectionManager);

// Enable queue with auto-flush
messageQueue.enable(100, { autoFlush: true });

// Handle queued messages when they're flushed
evem.subscribe('ws.send.queued', (data) => {
  console.log('Sending queued message:', data);
  websocket.send(JSON.stringify(data));
});

// Handle queue overflow
evem.subscribe('ws.queue.overflow', (event) => {
  console.warn(`Queue full! Dropped message:`, event.droppedMessage);
  console.log(`Max queue size: ${event.maxSize}`);
});

// Publish messages - they'll be queued if disconnected
await evem.publish('ws.send', { type: 'chat', text: 'Hello World!' });
await evem.publish('ws.send.message', { text: 'This supports wildcards!' });

console.log(`Queue size: ${messageQueue.getQueueSize()}`);

// When connection is established, messages are auto-flushed
await connectionManager.transitionTo('connected');
```

### Request-Response Pattern with Timeout

```typescript
import { EvEm } from 'evem';
import { RequestResponseManager, RequestTimeoutError } from '../src/websocket';

const evem = new EvEm();
const requestResponse = new RequestResponseManager(evem);

// Handle outgoing requests
evem.subscribe('ws.send.request', (request) => {
  console.log(`Sending request: ${request.method}`);
  websocket.send(JSON.stringify({
    type: 'request',
    id: request.id,
    method: request.method,
    params: request.params
  }));
});

// Simulate incoming WebSocket responses
websocket.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'response') {
    if (message.error) {
      // Error response
      evem.publish('ws.response.error', {
        id: message.id,
        error: message.error,
        timestamp: Date.now()
      });
    } else {
      // Success response
      evem.publish('ws.response', {
        id: message.id,
        result: message.result,
        timestamp: Date.now()
      });
    }
  }
};

// Make requests with automatic timeout handling
try {
  const user = await requestResponse.request('getUser', { id: 123 });
  console.log('User:', user);

  const profile = await requestResponse.request('getProfile', { userId: 123 }, {
    timeout: 10000 // Custom timeout
  });
  console.log('Profile:', profile);

} catch (error) {
  if (error instanceof RequestTimeoutError) {
    console.error(`Request ${error.requestId} timed out after ${error.timeout}ms`);
    console.error(`Method: ${error.method}`);
  } else {
    console.error('Request failed:', error.message);
  }
}
```

### Complete WebSocket Chat Application

```typescript
import { EvEm } from 'evem';
import { ConnectionManager, MessageQueue, RequestResponseManager } from '../src/websocket';

class ChatClient {
  private evem: EvEm;
  private ws: WebSocket | null = null;
  private connectionManager: ConnectionManager;
  private messageQueue: MessageQueue;
  private requestResponse: RequestResponseManager;

  constructor(url: string) {
    this.evem = new EvEm();
    this.connectionManager = new ConnectionManager(this.evem);
    this.messageQueue = new MessageQueue(this.evem, this.connectionManager);
    this.requestResponse = new RequestResponseManager(this.evem);

    // Enable message queue
    this.messageQueue.enable(100, { autoFlush: true });

    this.setupEventHandlers();
    this.connect(url);
  }

  private setupEventHandlers(): void {
    // Track connection state
    this.evem.subscribe('ws.connection.state', (event) => {
      console.log(`Connection: ${event.from} -> ${event.to}`);

      if (event.to === 'disconnected') {
        // Attempt reconnection after 5 seconds
        setTimeout(() => this.reconnect(), 5000);
      }
    });

    // Handle queued messages
    this.evem.subscribe('ws.send.queued', (data) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
      }
    });

    // Handle outgoing requests
    this.evem.subscribe('ws.send.request', (request) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'request',
          id: request.id,
          method: request.method,
          params: request.params
        }));
      }
    });

    // Handle queue overflow
    this.evem.subscribe('ws.queue.overflow', (event) => {
      console.warn('Message queue overflow:', event.droppedMessage);
    });
  }

  private connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = async () => {
      await this.connectionManager.transitionTo('connected');
      console.log('Connected to chat server');
    };

    this.ws.onclose = async () => {
      await this.connectionManager.transitionTo('disconnected');
      console.log('Disconnected from chat server');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      // Handle RPC responses
      if (message.type === 'response') {
        if (message.error) {
          this.evem.publish('ws.response.error', {
            id: message.id,
            error: message.error,
            timestamp: Date.now()
          });
        } else {
          this.evem.publish('ws.response', {
            id: message.id,
            result: message.result,
            timestamp: Date.now()
          });
        }
      }

      // Handle incoming chat messages
      if (message.type === 'message') {
        this.evem.publish('chat.message', message.data);
      }
    };
  }

  private async reconnect(): Promise<void> {
    if (this.connectionManager.isConnected()) return;

    console.log('Attempting to reconnect...');
    await this.connectionManager.transitionTo('reconnecting');
    // Reconnection logic...
  }

  // Public API
  async sendMessage(text: string): Promise<void> {
    await this.evem.publish('ws.send', {
      type: 'message',
      text,
      timestamp: Date.now()
    });
  }

  async getHistory(limit: number = 50): Promise<any[]> {
    return await this.requestResponse.request('getHistory', { limit });
  }

  onMessage(callback: (message: any) => void): string {
    return this.evem.subscribe('chat.message', callback);
  }

  disconnect(): void {
    this.messageQueue.disable();
    this.requestResponse.cleanup();
    this.ws?.close();
  }
}

// Usage
const chat = new ChatClient('wss://chat.example.com');

// Listen for messages
chat.onMessage((message) => {
  console.log(`${message.user}: ${message.text}`);
});

// Send messages (queued if disconnected)
await chat.sendMessage('Hello, world!');

// Use request-response pattern
const history = await chat.getHistory(50);
console.log('Message history:', history);

// Disconnect when done
chat.disconnect();
```

### Concurrent Requests Example

```typescript
import { EvEm } from 'evem';
import { RequestResponseManager } from '../src/websocket';

const evem = new EvEm();
const requestResponse = new RequestResponseManager(evem);

// Setup request/response handlers (same as previous example)
evem.subscribe('ws.send.request', (request) => {
  websocket.send(JSON.stringify({ ...request, type: 'request' }));
});

// Handle multiple concurrent requests
async function loadUserDashboard(userId: number) {
  try {
    // Make all requests in parallel
    const [user, posts, comments, notifications] = await Promise.all([
      requestResponse.request('getUser', { id: userId }),
      requestResponse.request('getPosts', { userId }),
      requestResponse.request('getComments', { userId }),
      requestResponse.request('getNotifications', { userId })
    ]);

    console.log('User:', user);
    console.log('Posts:', posts.length);
    console.log('Comments:', comments.length);
    console.log('Notifications:', notifications.length);

    return { user, posts, comments, notifications };
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    throw error;
  }
}

// Load dashboard for user 123
const dashboard = await loadUserDashboard(123);
```

These examples demonstrate the WebSocket adapter's capabilities for building robust real-time applications with EvEm.
