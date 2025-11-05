# WebSocket Adapter for EvEm

The WebSocket adapter provides common patterns for real-time communication built on top of EvEm. It's designed as a separate, optional module that doesn't modify the core library.

## Features

- **Auto-Wiring with WebSocketHandler**: Zero boilerplate - automatically connects WebSocket events to EvEm
- **Connection State Management**: Track connection lifecycle with state machine
- **Message Queue**: Automatic queueing of messages while disconnected
- **Request-Response Pattern**: RPC-style communication with correlation IDs
- **Universal Compatibility**: Works with browser WebSocket and Node.js `ws` library
- **Zero Core Modifications**: Completely separate from EvEm core
- **100% Test Coverage**: 115 comprehensive tests covering edge cases

## Installation

```typescript
// Core EvEm
import { EvEm } from 'evem';

// WebSocket components (future - when exports are configured)
import {
  WebSocketHandler,      // ✨ Recommended: auto-wiring
  ConnectionManager,
  MessageQueue,
  RequestResponseManager
} from 'evem/websocket';
```

## Quick Start with WebSocketHandler (Recommended)

The easiest way to integrate WebSocket with EvEm is using `WebSocketHandler`, which eliminates all manual wiring:

```typescript
import { EvEm } from 'evem';
import { WebSocketHandler } from 'evem/websocket';

// Create EvEm instance
const evem = new EvEm();

// Create WebSocketHandler - that's it!
const handler = new WebSocketHandler('wss://api.example.com', evem);

// Subscribe to server events - everything is auto-wired!
evem.subscribe('server.user.login', (data) => {
  console.log('User logged in:', data);
});

evem.subscribe('server.notification.*', (notification) => {
  showToast(notification.message);
});

// Send messages to server
await evem.publish('ws.send', { type: 'chat', text: 'Hello!' });

// Use the handler for state monitoring and lifecycle management
if (handler.isConnected()) {
  console.log('WebSocket is connected');
  console.log('Messages in queue:', handler.getQueueSize());
}

// Clean up when component unmounts or app closes
handler.disconnect();
```

**What WebSocketHandler handles automatically:**
- ✅ Wires `ws.onopen` → ConnectionManager → `'connected'` state
- ✅ Wires `ws.onclose` → ConnectionManager → `'disconnected'` state
- ✅ Wires `ws.onerror` → `'ws.error'` event
- ✅ Wires `ws.onmessage` → parses and routes to `server.*` events
- ✅ Wires `'ws.send'` events → `ws.send()` (with queueing when disconnected)
- ✅ Wires `'ws.send.queued'` events → `ws.send()` (when queue flushes)
- ✅ Integrates ConnectionManager, MessageQueue, and RequestResponseManager
- ✅ Provides customizable message parsing and formatting

### Configuration Options

```typescript
const handler = new WebSocketHandler('wss://api.example.com', evem, {
  // Message queue settings
  enableQueue: true,          // Enable queue (default: true)
  queueSize: 100,             // Max queued messages (default: 100)
  autoFlush: true,            // Auto-flush on reconnect (default: true)

  // Request-response pattern
  enableRequestResponse: true, // Enable RPC pattern (default: true)

  // Server event routing
  serverEventPrefix: 'server', // Prefix for server events (default: 'server')

  // Custom parsing/formatting
  messageParser: (data: string) => JSON.parse(data),
  messageFormatter: (data: any) => JSON.stringify(data),

  // Error handling
  onError: (error: Error) => {
    console.error('WebSocket error:', error);
    logToSentry(error);
  }
});

// Access integrated components
console.log('Connected:', handler.isConnected());
console.log('Queue size:', handler.getQueueSize());
console.log('State:', handler.getConnectionState());

// Clean up
handler.disconnect();
```

## Manual Setup (Advanced)

For more control, you can wire components manually:

```typescript
import { EvEm } from 'evem';
import { ConnectionManager, MessageQueue, RequestResponseManager } from './websocket';

// Create EvEm instance
const evem = new EvEm();

// Setup WebSocket components
const connectionManager = new ConnectionManager(evem);
const messageQueue = new MessageQueue(evem, connectionManager);
const requestResponse = new RequestResponseManager(evem);

// Enable message queue with auto-flush
messageQueue.enable(100, { autoFlush: true });

// Listen for connection state changes
evem.subscribe('ws.connection.state', (event) => {
  console.log(`Connection: ${event.from} -> ${event.to}`);
});

// Create WebSocket connection
const ws = new WebSocket('wss://example.com');

ws.onopen = async () => {
  await connectionManager.transitionTo('connected');
  // Queued messages automatically flushed when autoFlush is enabled
};

ws.onclose = async () => {
  await connectionManager.transitionTo('disconnected');
};

// Send messages (will be queued if disconnected)
evem.subscribe('ws.send.queued', (data) => {
  ws.send(JSON.stringify(data));
});

await evem.publish('ws.send', { type: 'chat', text: 'Hello!' });

// Request-response pattern
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'response') {
    evem.publish('ws.response', {
      id: message.id,
      result: message.result,
      timestamp: Date.now()
    });
  }
};

const result = await requestResponse.request('getUser', { id: 123 });
console.log('User:', result);
```

## Server-Side Event Subscriptions

The WebSocket adapter fully supports subscribing to server-sent events using EvEm's pattern matching. This allows you to:

- Subscribe to specific server events (e.g., `server.user.login`)
- Use wildcard patterns (e.g., `server.user.*` to match all user events)
- Filter events based on data properties
- Transform event data before handling
- Handle events with priority ordering

**Quick Example:**

```typescript
const evem = new EvEm();

// Subscribe to server events using EvEm patterns
evem.subscribe('server.user.login', (data) => {
  console.log('User logged in:', data);
});

evem.subscribe('server.notification.*', (notification) => {
  showToast(notification.message);
});

// In your WebSocket onmessage handler, publish server events to EvEm
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  // Route server events through EvEm
  if (message.event) {
    evem.publish(message.event, message.data);
  }
};
```

**Server Message Format:**

```json
{
  "event": "server.user.login",
  "data": {
    "userId": "123",
    "username": "john_doe"
  }
}
```

For complete examples, advanced patterns, and React integration, see the [Server-Side Event Subscriptions Guide](websocket-server-events.md).

## When to Use the WebSocket Adapter

### Use ConnectionManager When:
- ✅ You need to **track connection lifecycle** (connecting, connected, disconnected, reconnecting)
- ✅ You want to **trigger actions** based on connection state changes
- ✅ You need to **coordinate behavior** across different parts of your application based on connectivity
- ✅ You're building UI that shows connection status
- ✅ You want to **prevent operations** when disconnected

**Don't use if:** You only have a simple WebSocket connection with no state-dependent logic.

### Use MessageQueue When:
- ✅ You need **offline support** - queue messages while disconnected
- ✅ You want **automatic retry** - messages sent when connection is restored
- ✅ You need to **handle unreliable networks** (mobile, poor WiFi)
- ✅ You're building real-time features that must be resilient to disconnections
- ✅ You want to **prevent message loss** during brief disconnections

**Don't use if:** Messages are only valid in real-time and shouldn't be sent after reconnection (e.g., live video controls).

### Use RequestResponseManager When:
- ✅ You need **RPC-style communication** - send request, wait for specific response
- ✅ You want **timeout handling** - know when requests fail
- ✅ You need to **correlate requests and responses** by ID
- ✅ You're implementing API-like patterns over WebSocket
- ✅ You need **concurrent requests** with individual error handling

**Don't use if:** You only need one-way messaging or pub/sub patterns.

### Use All Three Together When:
- ✅ Building **production-grade WebSocket applications**
- ✅ Need both **pub/sub messaging** (MessageQueue) and **RPC calls** (RequestResponseManager)
- ✅ Want **comprehensive connection management** (ConnectionManager)
- ✅ Building **collaborative apps** (chat, docs, gaming)
- ✅ Need **resilient real-time features**

## Components

### 1. ConnectionManager

Manages connection state with a simple state machine.

**States:**
- `disconnected` - Initial state, no connection
- `connecting` - Connection attempt in progress
- `connected` - Successfully connected
- `reconnecting` - Reconnection attempt in progress
- `disconnecting` - Closing connection

**API:**

```typescript
class ConnectionManager {
  constructor(evem: EvEm);

  // State transitions
  async transitionTo(newState: ConnectionState): Promise<void>;

  // State queries
  getState(): ConnectionState;
  isConnected(): boolean;
  isConnecting(): boolean;
  isDisconnected(): boolean;
}
```

**Events:**

```typescript
// Listen for state changes
evem.subscribe('ws.connection.state', (event: ConnectionStateChangeEvent) => {
  console.log(`${event.from} -> ${event.to}`);
  console.log(`Timestamp: ${event.timestamp}`);
});
```

**Example:**

```typescript
const connectionManager = new ConnectionManager(evem);

// Track state changes
evem.subscribe('ws.connection.state', (event) => {
  if (event.to === 'connected') {
    console.log('Connected!');
  } else if (event.to === 'disconnected') {
    console.log('Disconnected!');
  }
});

// Transition states
await connectionManager.transitionTo('connecting');
await connectionManager.transitionTo('connected');

// Query state
if (connectionManager.isConnected()) {
  console.log('Ready to send messages');
}
```

### 2. MessageQueue

Queues messages while disconnected and replays them on reconnection.

**API:**

```typescript
class MessageQueue {
  constructor(evem: EvEm, connectionManager: ConnectionManager);

  // Enable/disable queueing
  enable(maxSize?: number, options?: MessageQueueOptions): void;
  disable(): void;

  // Queue operations
  async flush(): Promise<void>;
  clear(): void;

  // Status queries
  isEnabled(): boolean;
  getQueueSize(): number;
  getMaxSize(): number;
}

interface MessageQueueOptions {
  autoFlush?: boolean; // Auto-flush when connected (default: true)
}
```

**Events:**

```typescript
// Published when queue is flushed (subscribe to this to send messages)
evem.subscribe('ws.send.queued', (data) => {
  websocket.send(JSON.stringify(data));
});

// Emitted when queue overflows
evem.subscribe('ws.queue.overflow', (event) => {
  console.warn(`Queue full! Dropped message:`, event.droppedMessage);
  console.log(`Max size: ${event.maxSize}`);
});
```

**Example:**

```typescript
const messageQueue = new MessageQueue(evem, connectionManager);

// Enable with 100 message limit and auto-flush
messageQueue.enable(100, { autoFlush: true });

// Handle flushed messages
evem.subscribe('ws.send.queued', (data) => {
  websocket.send(JSON.stringify(data));
});

// Publish messages - they'll be queued if disconnected
await evem.publish('ws.send', { type: 'chat', text: 'Hello!' });
await evem.publish('ws.send.message', { text: 'Wildcard support!' });

console.log(`Queued: ${messageQueue.getQueueSize()} messages`);

// Manual flush (not needed with autoFlush)
await messageQueue.flush();

// Clear queue without flushing
messageQueue.clear();
```

**Important Implementation Details:**

The MessageQueue uses **middleware pattern** for clean interception:

- Registers TWO middleware handlers: `ws.send` (exact match) and `ws.send.*` (wildcard)
- Required because EvEm wildcards don't match exact event names
- Only queues when: enabled, not connected, and event doesn't include 'queued'
- Uses `isEnqueuing` flag to prevent re-entrancy during queue operations

### 3. RequestResponseManager

Implements RPC-style request-response pattern with correlation IDs.

**API:**

```typescript
class RequestResponseManager {
  constructor(evem: EvEm);

  // Send request and wait for response
  async request(
    method: string,
    params?: any,
    options?: RequestOptions
  ): Promise<any>;

  // Status
  getPendingRequestCount(): number;

  // Cleanup
  cleanup(): void;
}

interface RequestOptions {
  timeout?: number;    // Timeout in ms (default: 5000)
  id?: string;         // Custom request ID (default: auto-generated UUID)
}
```

**Events:**

```typescript
// Outgoing request (subscribe to this to send via WebSocket)
evem.subscribe('ws.send.request', (request: RequestMessage) => {
  websocket.send(JSON.stringify({
    id: request.id,
    method: request.method,
    params: request.params
  }));
});

// Incoming successful response (publish this from WebSocket onmessage)
await evem.publish('ws.response', {
  id: 'request-id',
  result: { /* response data */ },
  timestamp: Date.now()
});

// Incoming error response (publish this from WebSocket onmessage)
await evem.publish('ws.response.error', {
  id: 'request-id',
  error: {
    code: 404,
    message: 'Not found',
    data: { /* additional error info */ }
  },
  timestamp: Date.now()
});
```

**Example:**

```typescript
const requestResponse = new RequestResponseManager(evem);

// Handle outgoing requests
evem.subscribe('ws.send.request', (request) => {
  websocket.send(JSON.stringify({
    type: 'request',
    id: request.id,
    method: request.method,
    params: request.params
  }));
});

// Handle incoming responses
websocket.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'response') {
    if (message.error) {
      evem.publish('ws.response.error', {
        id: message.id,
        error: message.error,
        timestamp: Date.now()
      });
    } else {
      evem.publish('ws.response', {
        id: message.id,
        result: message.result,
        timestamp: Date.now()
      });
    }
  }
};

// Make requests
try {
  const user = await requestResponse.request('getUser', { id: 123 });
  console.log('User:', user);

  const profile = await requestResponse.request('getProfile', { userId: 123 }, {
    timeout: 10000 // 10 second timeout
  });
  console.log('Profile:', profile);

} catch (error) {
  if (error instanceof RequestTimeoutError) {
    console.error(`Request ${error.requestId} timed out after ${error.timeout}ms`);
  } else {
    console.error('Request failed:', error.message);
  }
}
```

**Concurrent Requests:**

```typescript
// Multiple concurrent requests are handled correctly
const [user, posts, comments] = await Promise.all([
  requestResponse.request('getUser', { id: 123 }),
  requestResponse.request('getPosts', { userId: 123 }),
  requestResponse.request('getComments', { userId: 123 })
]);
```

## Complete Example: WebSocket Chat Client

```typescript
import { EvEm } from 'evem';
import { ConnectionManager, MessageQueue, RequestResponseManager } from './websocket';

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

    // Enable message queue with auto-flush
    this.messageQueue.enable(100, { autoFlush: true });

    // Setup event handlers
    this.setupEventHandlers();

    // Connect
    this.connect(url);
  }

  private setupEventHandlers(): void {
    // Handle connection state changes
    this.evem.subscribe('ws.connection.state', (event) => {
      console.log(`Connection: ${event.from} -> ${event.to}`);

      if (event.to === 'disconnected') {
        // Attempt reconnection
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
      console.warn('Queue overflow! Dropped message:', event.droppedMessage);
    });
  }

  private connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = async () => {
      await this.connectionManager.transitionTo('connected');
    };

    this.ws.onclose = async () => {
      await this.connectionManager.transitionTo('disconnected');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      // Handle responses
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

      // Handle incoming messages
      if (message.type === 'message') {
        this.evem.publish('chat.message', message.data);
      }
    };
  }

  private async reconnect(): Promise<void> {
    if (this.connectionManager.isConnected()) return;

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

  async getHistory(): Promise<any[]> {
    return await this.requestResponse.request('getHistory', {
      limit: 50
    });
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

// Request-response pattern
const history = await chat.getHistory();
console.log('History:', history);
```

## Event Reference

| Event | Direction | Data | Description |
|-------|-----------|------|-------------|
| `ws.connection.state` | Internal | `ConnectionStateChangeEvent` | Connection state changes |
| `ws.send` | Outgoing | `any` | Messages to send (will be queued if disconnected) |
| `ws.send.*` | Outgoing | `any` | Wildcard for send messages |
| `ws.send.request` | Outgoing | `RequestMessage` | RPC requests to send |
| `ws.send.queued` | Internal | `any` | Queued messages being flushed |
| `ws.response` | Incoming | `ResponseMessage` | Successful RPC responses |
| `ws.response.error` | Incoming | `ResponseMessage` | Error RPC responses |
| `ws.queue.overflow` | Internal | `{ maxSize, droppedMessage }` | Queue overflow notification |

## Real-World Integration Examples

### Browser WebSocket Integration

Complete example for browser-based applications:

```typescript
import { EvEm } from 'evem';
import { ConnectionManager, MessageQueue, RequestResponseManager } from 'evem/websocket';

class BrowserWebSocketClient {
  private evem: EvEm;
  private ws: WebSocket | null = null;
  private connectionManager: ConnectionManager;
  private messageQueue: MessageQueue;
  private requestResponse: RequestResponseManager;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  constructor(private url: string) {
    this.evem = new EvEm();
    this.connectionManager = new ConnectionManager(this.evem);
    this.messageQueue = new MessageQueue(this.evem, this.connectionManager);
    this.requestResponse = new RequestResponseManager(this.evem);

    // Enable message queue with 100 message limit
    this.messageQueue.enable(100, { autoFlush: true });

    this.setupEventListeners();
    this.connect();
  }

  private setupEventListeners(): void {
    // Handle connection state changes
    this.evem.subscribe('ws.connection.state', (event) => {
      console.log(`[WebSocket] ${event.from} → ${event.to}`);

      // Update UI based on connection state
      this.updateConnectionUI(event.to);

      // Handle reconnection on disconnect
      if (event.to === 'disconnected' && this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts); // Exponential backoff
        console.log(`[WebSocket] Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
          this.reconnect();
        }, delay);
      }

      // Reset reconnect attempts on successful connection
      if (event.to === 'connected') {
        this.reconnectAttempts = 0;
      }
    });

    // Handle queued messages
    this.evem.subscribe('ws.send.queued', (data) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
        console.log('[WebSocket] Sent queued message:', data);
      }
    });

    // Handle outgoing requests
    this.evem.subscribe('ws.send.request', (request) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'request',
          ...request
        }));
        console.log('[WebSocket] Sent request:', request.method);
      }
    });

    // Handle queue overflow
    this.evem.subscribe('ws.queue.overflow', (event) => {
      console.warn('[WebSocket] Queue overflow! Dropped message:', event.droppedMessage);
      // Notify user that message was lost
      this.showNotification('Some messages were lost due to poor connection', 'warning');
    });
  }

  private connect(): void {
    this.connectionManager.transitionTo('connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = async () => {
        console.log('[WebSocket] Connection established');
        await this.connectionManager.transitionTo('connected');
        this.showNotification('Connected to server', 'success');
      };

      this.ws.onclose = async (event) => {
        console.log(`[WebSocket] Connection closed: ${event.code} ${event.reason}`);
        await this.connectionManager.transitionTo('disconnected');

        if (event.code !== 1000) { // Not a normal closure
          this.showNotification('Connection lost', 'error');
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.showNotification('Connection error', 'error');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleIncomingMessage(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      this.connectionManager.transitionTo('disconnected');
    }
  }

  private handleIncomingMessage(message: any): void {
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
      return;
    }

    // Handle regular messages
    if (message.type === 'message') {
      this.evem.publish('chat.message', message.data);
    }

    // Handle notifications
    if (message.type === 'notification') {
      this.evem.publish('server.notification', message.data);
    }
  }

  private async reconnect(): Promise<void> {
    if (this.connectionManager.isConnected() || this.connectionManager.isConnecting()) {
      return;
    }

    this.reconnectAttempts++;
    await this.connectionManager.transitionTo('reconnecting');

    // Close existing connection if any
    if (this.ws) {
      this.ws.onclose = null; // Prevent triggering reconnect loop
      this.ws.close();
      this.ws = null;
    }

    this.connect();
  }

  private updateConnectionUI(state: string): void {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
      statusElement.textContent = state;
      statusElement.className = `status-${state}`;
    }
  }

  private showNotification(message: string, type: 'success' | 'error' | 'warning'): void {
    // Implement your notification system here
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  // Public API
  async sendMessage(content: string): Promise<void> {
    await this.evem.publish('ws.send', {
      type: 'message',
      content,
      timestamp: Date.now()
    });
  }

  async getUserData(userId: string): Promise<any> {
    try {
      return await this.requestResponse.request('getUser', { userId }, {
        timeout: 10000
      });
    } catch (error) {
      console.error('Failed to get user data:', error);
      throw error;
    }
  }

  onMessage(callback: (message: any) => void): string {
    return this.evem.subscribe('chat.message', callback);
  }

  onServerNotification(callback: (notification: any) => void): string {
    return this.evem.subscribe('server.notification', callback);
  }

  getConnectionState(): string {
    return this.connectionManager.getState();
  }

  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  getQueuedMessageCount(): number {
    return this.messageQueue.getQueueSize();
  }

  disconnect(): void {
    this.messageQueue.disable();
    this.requestResponse.cleanup();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }
}

// Usage in a browser application
const client = new BrowserWebSocketClient('wss://api.example.com/ws');

// Listen for messages
client.onMessage((message) => {
  const messagesDiv = document.getElementById('messages');
  const messageEl = document.createElement('div');
  messageEl.textContent = `${message.user}: ${message.content}`;
  messagesDiv?.appendChild(messageEl);
});

// Send a message
document.getElementById('send-button')?.addEventListener('click', async () => {
  const input = document.getElementById('message-input') as HTMLInputElement;
  await client.sendMessage(input.value);
  input.value = '';
});

// Get user data
async function loadUserProfile(userId: string) {
  try {
    const userData = await client.getUserData(userId);
    console.log('User profile:', userData);
  } catch (error) {
    console.error('Failed to load user profile');
  }
}

// Show connection status
setInterval(() => {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = `Connected: ${client.isConnected()} | Queued: ${client.getQueuedMessageCount()}`;
  }
}, 1000);
```

### Node.js WebSocket Server Integration

Example using the `ws` library on Node.js:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { EvEm } from 'evem';
import { ConnectionManager, MessageQueue, RequestResponseManager } from 'evem/websocket';

class NodeWebSocketClient {
  private evem: EvEm;
  private ws: WebSocket;
  private connectionManager: ConnectionManager;
  private messageQueue: MessageQueue;
  private requestResponse: RequestResponseManager;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.evem = new EvEm();
    this.connectionManager = new ConnectionManager(this.evem);
    this.messageQueue = new MessageQueue(this.evem, this.connectionManager);
    this.requestResponse = new RequestResponseManager(this.evem);

    // Enable queue
    this.messageQueue.enable(100, { autoFlush: true });

    this.setupHandlers();

    // Connection is already open when passed to constructor
    this.connectionManager.transitionTo('connected');
  }

  private setupHandlers(): void {
    // Handle queued messages
    this.evem.subscribe('ws.send.queued', (data) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
      }
    });

    // Handle outgoing requests
    this.evem.subscribe('ws.send.request', (request) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'request',
          ...request
        }));
      }
    });

    // WebSocket event handlers
    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    this.ws.on('close', async () => {
      await this.connectionManager.transitionTo('disconnected');
      this.cleanup();
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  private handleMessage(message: any): void {
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
      return;
    }

    // Handle regular messages
    if (message.type === 'message') {
      this.evem.publish('client.message', message.data);
    }
  }

  async sendMessage(data: any): Promise<void> {
    await this.evem.publish('ws.send', {
      type: 'message',
      data,
      timestamp: Date.now()
    });
  }

  async request(method: string, params: any): Promise<any> {
    return await this.requestResponse.request(method, params);
  }

  onMessage(callback: (data: any) => void): string {
    return this.evem.subscribe('client.message', callback);
  }

  cleanup(): void {
    this.messageQueue.disable();
    this.requestResponse.cleanup();
  }
}

// Server setup
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  const client = new NodeWebSocketClient(ws);

  // Handle incoming messages
  client.onMessage((data) => {
    console.log('Received message:', data);

    // Broadcast to all clients
    wss.clients.forEach((clientWs) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'message',
          data
        }));
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    client.cleanup();
  });
});

console.log('WebSocket server running on ws://localhost:8080');
```

### React Integration Example

Using the WebSocket adapter in a React application:

```typescript
import React, { useEffect, useState, useRef } from 'react';
import { EvEm } from 'evem';
import { ConnectionManager, MessageQueue, RequestResponseManager } from 'evem/websocket';

interface Message {
  id: string;
  user: string;
  content: string;
  timestamp: number;
}

function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [connectionState, setConnectionState] = useState<string>('disconnected');

  const evemRef = useRef<EvEm>();
  const connectionManagerRef = useRef<ConnectionManager>();
  const messageQueueRef = useRef<MessageQueue>();
  const requestResponseRef = useRef<RequestResponseManager>();
  const wsRef = useRef<WebSocket>();

  useEffect(() => {
    // Initialize EvEm and adapters
    evemRef.current = new EvEm();
    connectionManagerRef.current = new ConnectionManager(evemRef.current);
    messageQueueRef.current = new MessageQueue(evemRef.current, connectionManagerRef.current);
    requestResponseRef.current = new RequestResponseManager(evemRef.current);

    // Enable message queue
    messageQueueRef.current.enable(100, { autoFlush: true });

    // Subscribe to connection state changes
    evemRef.current.subscribe('ws.connection.state', (event: any) => {
      setConnectionState(event.to);
      setIsConnected(event.to === 'connected');
    });

    // Subscribe to messages
    evemRef.current.subscribe('chat.message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    // Subscribe to queue size changes
    const queueInterval = setInterval(() => {
      if (messageQueueRef.current) {
        setQueuedCount(messageQueueRef.current.getQueueSize());
      }
    }, 500);

    // Handle queued messages
    evemRef.current.subscribe('ws.send.queued', (data: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
      }
    });

    // Handle RPC requests
    evemRef.current.subscribe('ws.send.request', (request: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'request', ...request }));
      }
    });

    // Connect WebSocket
    wsRef.current = new WebSocket(url);

    wsRef.current.onopen = () => {
      connectionManagerRef.current?.transitionTo('connected');
    };

    wsRef.current.onclose = () => {
      connectionManagerRef.current?.transitionTo('disconnected');
    };

    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'response') {
          evemRef.current?.publish('ws.response', {
            id: message.id,
            result: message.result,
            timestamp: Date.now()
          });
        } else if (message.type === 'message') {
          evemRef.current?.publish('chat.message', message.data);
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    // Cleanup on unmount
    return () => {
      clearInterval(queueInterval);
      messageQueueRef.current?.disable();
      requestResponseRef.current?.cleanup();
      wsRef.current?.close();
    };
  }, [url]);

  const sendMessage = async (content: string) => {
    await evemRef.current?.publish('ws.send', {
      type: 'message',
      content,
      user: 'currentUser',
      timestamp: Date.now()
    });
  };

  const requestData = async (method: string, params: any) => {
    return await requestResponseRef.current?.request(method, params);
  };

  return {
    isConnected,
    connectionState,
    messages,
    queuedCount,
    sendMessage,
    requestData
  };
}

// Component using the hook
function ChatApp() {
  const { isConnected, connectionState, messages, queuedCount, sendMessage, requestData } =
    useWebSocket('wss://chat.example.com');

  const [inputValue, setInputValue] = useState('');

  const handleSend = async () => {
    if (inputValue.trim()) {
      await sendMessage(inputValue);
      setInputValue('');
    }
  };

  const handleLoadHistory = async () => {
    try {
      const history = await requestData('getHistory', { limit: 50 });
      console.log('History:', history);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  return (
    <div className="chat-app">
      <div className="status-bar">
        <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          {connectionState}
        </span>
        {queuedCount > 0 && (
          <span className="queue-indicator">
            {queuedCount} messages queued
          </span>
        )}
      </div>

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className="message">
            <strong>{msg.user}:</strong> {msg.content}
          </div>
        ))}
      </div>

      <div className="input-area">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          disabled={!isConnected && queuedCount >= 100}
        />
        <button onClick={handleSend}>Send</button>
        <button onClick={handleLoadHistory}>Load History</button>
      </div>
    </div>
  );
}

export default ChatApp;
```

### Real-World Use Cases

#### 1. Collaborative Document Editor

```typescript
// Use all three components for a Google Docs-like application
const evem = new EvEm();
const connectionManager = new ConnectionManager(evem);
const messageQueue = new MessageQueue(evem, connectionManager);
const requestResponse = new RequestResponseManager(evem);

messageQueue.enable(500, { autoFlush: true }); // Large queue for offline editing

// Queue document edits while offline
evem.subscribe('document.edit', (edit) => {
  evem.publish('ws.send', {
    type: 'edit',
    documentId: currentDocId,
    edit
  });
});

// Request full document sync
async function syncDocument() {
  const document = await requestResponse.request('getDocument', {
    documentId: currentDocId
  });
  applyDocument(document);
}
```

#### 2. Real-Time Gaming

```typescript
// Use RequestResponseManager for game state, MessageQueue for player actions
const evem = new EvEm();
const connectionManager = new ConnectionManager(evem);
const messageQueue = new MessageQueue(evem, connectionManager);
const requestResponse = new RequestResponseManager(evem);

messageQueue.enable(50, { autoFlush: false }); // Don't auto-flush old moves

// Game actions are only valid in real-time
evem.subscribe('game.move', (move) => {
  if (connectionManager.isConnected()) {
    evem.publish('ws.send', { type: 'move', move });
  } else {
    console.log('Cannot make move while disconnected');
  }
});

// Request game state on reconnection
evem.subscribe('ws.connection.state', async (event) => {
  if (event.to === 'connected') {
    const gameState = await requestResponse.request('getGameState', {});
    updateGameState(gameState);
    messageQueue.clear(); // Clear old moves, they're no longer valid
  }
});
```

#### 3. IoT Device Monitoring

```typescript
// Use MessageQueue for sensor data, RequestResponseManager for device control
const evem = new EvEm();
const connectionManager = new ConnectionManager(evem);
const messageQueue = new MessageQueue(evem, connectionManager);
const requestResponse = new RequestResponseManager(evem);

messageQueue.enable(1000, { autoFlush: true }); // Buffer lots of sensor readings

// Queue sensor data while offline
setInterval(() => {
  const reading = readSensor();
  evem.publish('ws.send', {
    type: 'sensor-data',
    deviceId: 'device-123',
    reading
  });
}, 1000);

// Control device with RPC
async function setDeviceState(state: 'on' | 'off') {
  try {
    const result = await requestResponse.request('setDeviceState', {
      deviceId: 'device-123',
      state
    }, { timeout: 5000 });
    console.log('Device state changed:', result);
  } catch (error) {
    console.error('Failed to change device state:', error);
  }
}
```

#### 4. Live Dashboard with Metrics

```typescript
// Use ConnectionManager for status, RequestResponseManager for data queries
const evem = new EvEm();
const connectionManager = new ConnectionManager(evem);
const requestResponse = new RequestResponseManager(evem);

// Don't need MessageQueue - live data only, no offline support

evem.subscribe('ws.connection.state', (event) => {
  updateDashboardStatus(event.to);
});

// Fetch different metrics in parallel
async function refreshDashboard() {
  try {
    const [metrics, alerts, logs] = await Promise.all([
      requestResponse.request('getMetrics', { timeRange: '1h' }),
      requestResponse.request('getAlerts', { severity: 'high' }),
      requestResponse.request('getLogs', { limit: 100 })
    ]);

    updateMetricsDisplay(metrics);
    updateAlertsDisplay(alerts);
    updateLogsDisplay(logs);
  } catch (error) {
    console.error('Dashboard refresh failed:', error);
  }
}

setInterval(refreshDashboard, 30000); // Refresh every 30 seconds
```

## Type Definitions

```typescript
type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting';

interface ConnectionStateChangeEvent {
  from: ConnectionState;
  to: ConnectionState;
  timestamp: number;
}

interface RequestMessage {
  id: string;
  method: string;
  params?: any;
  timestamp: number;
}

interface ResponseMessage {
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  timestamp: number;
}

interface QueuedMessage {
  event: string;
  data: any;
  timestamp: number;
}

class RequestTimeoutError extends Error {
  constructor(
    public requestId: string,
    public method: string,
    public timeout: number
  );
}
```

## Testing

The WebSocket adapter has comprehensive test coverage:

- **ConnectionManager**: 27 tests covering state machine, transitions, and EvEm integration
- **MessageQueue**: 33 tests covering queueing, flushing, overflow, and lifecycle
- **RequestResponseManager**: 18 tests covering request-response, timeouts, and concurrent requests

Run WebSocket tests:

```bash
pnpm test:nowatch -- tests/websocket/
```

## Architecture Notes

### Why Middleware Pattern?

The MessageQueue uses middleware instead of subscriptions for several reasons:

1. **Cleaner lifecycle**: Single cleanup point with `removeMiddleware()`
2. **No double-triggering**: Subscriptions would fire twice for `ws.send` and `ws.send.*`
3. **Side effects**: Middleware can queue synchronously while passing data through unchanged

### Why Two Middleware Registrations?

EvEm's wildcard matching doesn't match exact event names:
- `ws.send.*` matches `ws.send.message` but NOT `ws.send`
- `ws.send` matches only `ws.send` exactly

Therefore, MessageQueue registers both to catch all variants.

### Why Async State Transitions?

EvEm's `publish()` method is async to support async middleware and handlers. ConnectionManager transitions must await the publish to ensure handlers complete before the next transition.

## Future Enhancements

Potential additions to the WebSocket adapter:

- **WebSocketAdapter**: High-level class that composes all three components
- **Reconnection Strategy**: Exponential backoff with jitter
- **Circuit Breaker**: Prevent cascading failures
- **Message Batching**: Batch multiple events for efficient transmission
- **Event Persistence**: Save queue to localStorage/IndexedDB
- **Metrics Collection**: Track message rates, latency, errors
- **Compression**: LZ4/Brotli compression for large messages
