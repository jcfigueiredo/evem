# Server-Side Event Subscriptions with WebSocket Adapter

This guide shows how to subscribe to server-side events through the WebSocket adapter using EvEm's powerful pattern matching.

## Architecture Overview

```
Server                    WebSocket                 EvEm                   Your Code
  │                          │                       │                        │
  ├─ send event ───────────► │                       │                        │
  │  { event: "user.login",  │                       │                        │
  │    data: {...} }         │                       │                        │
  │                          ├─ publish ───────────► │                        │
  │                          │  ('user.login', data) │                        │
  │                          │                       ├─ route ──────────────► │
  │                          │                       │  (matches 'user.*')    │
  │                          │                       │                        ├─ handle event
```

## Basic Example

```typescript
import { EvEm } from 'evem';
import { ConnectionManager } from 'evem/websocket';

const evem = new EvEm();
const connectionManager = new ConnectionManager(evem);

// 1. Subscribe to server events using EvEm patterns
evem.subscribe('server.user.login', (data) => {
  console.log('User logged in:', data);
});

evem.subscribe('server.user.*', (data) => {
  console.log('User event:', data);
});

evem.subscribe('server.notification.*', (data) => {
  console.log('Notification:', data);
});

// 2. Setup WebSocket with server event routing
const ws = new WebSocket('wss://api.example.com');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  // Route server events to EvEm
  if (message.event) {
    evem.publish(message.event, message.data);
  }
};

ws.onopen = () => {
  connectionManager.transitionTo('connected');
};
```

### Server Message Format

The server should send messages in this format:

```json
{
  "event": "server.user.login",
  "data": {
    "userId": "123",
    "username": "john_doe",
    "timestamp": 1234567890
  }
}
```

## Complete WebSocket Client with Server Events

```typescript
import { EvEm } from 'evem';
import { ConnectionManager, MessageQueue, RequestResponseManager } from 'evem/websocket';

class WebSocketClient {
  private evem: EvEm;
  private ws: WebSocket | null = null;
  private connectionManager: ConnectionManager;
  private messageQueue: MessageQueue;
  private requestResponse: RequestResponseManager;

  constructor(private url: string) {
    this.evem = new EvEm();
    this.connectionManager = new ConnectionManager(this.evem);
    this.messageQueue = new MessageQueue(this.evem, this.connectionManager);
    this.requestResponse = new RequestResponseManager(this.evem);

    this.messageQueue.enable(100, { autoFlush: true });
    this.setupHandlers();
    this.connect();
  }

  private setupHandlers(): void {
    // Handle outgoing queued messages
    this.evem.subscribe('ws.send.queued', (data) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
      }
    });

    // Handle outgoing RPC requests
    this.evem.subscribe('ws.send.request', (request) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'request',
          ...request
        }));
      }
    });
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = async () => {
      await this.connectionManager.transitionTo('connected');
    };

    this.ws.onclose = async () => {
      await this.connectionManager.transitionTo('disconnected');
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
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

    // Handle server-sent events
    // This is the key part - route server events through EvEm!
    if (message.event) {
      this.evem.publish(message.event, message.data);
      return;
    }

    // Legacy handling for messages without event field
    if (message.type) {
      this.evem.publish(`server.${message.type}`, message.data);
    }
  }

  // Public API for subscribing to server events
  onServerEvent(pattern: string, callback: (data: any) => void): string {
    return this.evem.subscribe(pattern, callback);
  }

  // Convenience methods for common patterns
  onUserEvent(callback: (data: any) => void): string {
    return this.evem.subscribe('server.user.*', callback);
  }

  onNotification(callback: (data: any) => void): string {
    return this.evem.subscribe('server.notification.*', callback);
  }

  onSystemEvent(callback: (data: any) => void): string {
    return this.evem.subscribe('server.system.*', callback);
  }

  // Send message to server
  async send(event: string, data: any): Promise<void> {
    await this.evem.publish('ws.send', {
      event,
      data,
      timestamp: Date.now()
    });
  }

  // Make RPC request
  async request(method: string, params: any): Promise<any> {
    return await this.requestResponse.request(method, params);
  }

  off(subscriptionId: string): void {
    this.evem.unsubscribe(subscriptionId);
  }

  disconnect(): void {
    this.messageQueue.disable();
    this.requestResponse.cleanup();
    this.ws?.close();
  }
}

// Usage
const client = new WebSocketClient('wss://api.example.com');

// Subscribe to specific events
client.onServerEvent('server.user.login', (data) => {
  console.log('User logged in:', data.username);
  updateUserUI(data);
});

client.onServerEvent('server.user.logout', (data) => {
  console.log('User logged out:', data.username);
  clearUserUI();
});

// Subscribe to wildcard patterns
const subId = client.onUserEvent((data) => {
  console.log('Any user event:', data);
});

// Subscribe to notifications
client.onNotification((notification) => {
  showToast(notification.message, notification.type);
});

// Subscribe to system events
client.onSystemEvent((event) => {
  console.log('System event:', event);
});

// Unsubscribe when needed
client.off(subId);

// Send events to server
await client.send('client.action', { action: 'click', button: 'submit' });

// Make RPC requests
const userData = await client.request('getUser', { id: 123 });
```

## Advanced Patterns

### 1. Namespace Organization

Organize events by namespace:

```typescript
// Server sends:
// - server.user.login
// - server.user.logout
// - server.user.updated
// - server.chat.message
// - server.chat.typing
// - server.notification.info
// - server.notification.error

// Subscribe to all user events
evem.subscribe('server.user.*', (data) => {
  console.log('User event:', data);
});

// Subscribe to all chat events
evem.subscribe('server.chat.*', (data) => {
  console.log('Chat event:', data);
});

// Subscribe to all notifications
evem.subscribe('server.notification.*', (data) => {
  console.log('Notification:', data);
});

// Subscribe to ALL server events
evem.subscribe('server.*', (data) => {
  console.log('Any server event:', data);
});
```

### 2. Event Filtering

Use EvEm's filter feature to filter server events:

```typescript
// Only handle high-priority notifications
evem.subscribe('server.notification.*', (data) => {
  console.log('High priority notification:', data);
}, {
  filter: (data) => data.priority === 'high'
});

// Only handle messages from specific users
evem.subscribe('server.chat.message', (data) => {
  console.log('Message from admin:', data);
}, {
  filter: (data) => data.role === 'admin'
});

// Only handle events for current user
evem.subscribe('server.user.*', (data) => {
  console.log('My user event:', data);
}, {
  filter: (data) => data.userId === currentUserId
});
```

### 3. Event Transformation

Transform server events before handling:

```typescript
// Transform server timestamps
evem.subscribe('server.chat.message', (timestamp) => {
  console.log('Message at:', new Date(timestamp));
}, {
  transform: (data) => data.timestamp
});

// Extract and transform notification data
evem.subscribe('server.notification.*', (notification) => {
  displayNotification(notification);
}, {
  transform: (data) => ({
    title: data.title,
    body: data.message,
    type: data.severity || 'info'
  })
});
```

### 4. Priority-Based Handling

Handle server events with priority:

```typescript
// High priority: Log events first
evem.subscribe('server.user.login', (data) => {
  console.log('Logging user login:', data);
}, { priority: 'high' });

// Normal priority: Update UI
evem.subscribe('server.user.login', (data) => {
  updateUserUI(data);
}, { priority: 'normal' });

// Low priority: Analytics
evem.subscribe('server.user.login', (data) => {
  trackAnalytics('user_login', data);
}, { priority: 'low' });
```

### 5. Once-Only Events

Handle server events only once:

```typescript
// Wait for server ready event
evem.subscribe('server.system.ready', (data) => {
  console.log('Server is ready:', data);
  initializeApp();
}, { once: true });

// Wait for initial user data
evem.subscribe('server.user.initial', (data) => {
  console.log('Received initial user data:', data);
  loadUserProfile(data);
}, { once: true });
```

## React Integration

```typescript
import { useEffect, useState } from 'react';

function useServerEvents(client: WebSocketClient) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [userEvents, setUserEvents] = useState<any[]>([]);

  useEffect(() => {
    // Subscribe to notifications
    const notificationSub = client.onNotification((notification) => {
      setNotifications((prev) => [...prev, notification]);
    });

    // Subscribe to user events
    const userSub = client.onUserEvent((event) => {
      setUserEvents((prev) => [...prev, event]);
    });

    // Cleanup subscriptions
    return () => {
      client.off(notificationSub);
      client.off(userSub);
    };
  }, [client]);

  return { notifications, userEvents };
}

// Usage in component
function App() {
  const client = useRef(new WebSocketClient('wss://api.example.com')).current;
  const { notifications, userEvents } = useServerEvents(client);

  useEffect(() => {
    // Subscribe to specific events
    const loginSub = client.onServerEvent('server.user.login', (data) => {
      console.log('User logged in:', data);
    });

    return () => {
      client.off(loginSub);
      client.disconnect();
    };
  }, []);

  return (
    <div>
      <h2>Notifications</h2>
      {notifications.map((n, i) => (
        <div key={i}>{n.message}</div>
      ))}

      <h2>User Events</h2>
      {userEvents.map((e, i) => (
        <div key={i}>{JSON.stringify(e)}</div>
      ))}
    </div>
  );
}
```

## Server Message Format Conventions

### Recommended Format

```typescript
interface ServerMessage {
  event: string;      // Event name (e.g., "server.user.login")
  data: any;          // Event payload
  timestamp?: number; // Optional server timestamp
  id?: string;        // Optional message ID
}
```

### Examples

```json
// User login event
{
  "event": "server.user.login",
  "data": {
    "userId": "123",
    "username": "john_doe",
    "email": "john@example.com"
  },
  "timestamp": 1234567890
}

// Chat message event
{
  "event": "server.chat.message",
  "data": {
    "messageId": "msg-456",
    "roomId": "room-789",
    "userId": "123",
    "username": "john_doe",
    "text": "Hello everyone!",
    "timestamp": 1234567890
  }
}

// Notification event
{
  "event": "server.notification.info",
  "data": {
    "title": "System Update",
    "message": "The system will be updated in 5 minutes",
    "priority": "high"
  }
}

// User typing indicator
{
  "event": "server.chat.typing",
  "data": {
    "userId": "456",
    "roomId": "room-789",
    "isTyping": true
  }
}
```

## Complete Real-World Example: Chat Application

```typescript
import { EvEm } from 'evem';
import { ConnectionManager, MessageQueue } from 'evem/websocket';

class ChatClient {
  private evem: EvEm;
  private ws: WebSocket;
  private connectionManager: ConnectionManager;
  private messageQueue: MessageQueue;

  constructor(url: string) {
    this.evem = new EvEm();
    this.connectionManager = new ConnectionManager(this.evem);
    this.messageQueue = new MessageQueue(this.evem, this.connectionManager);

    this.messageQueue.enable(100, { autoFlush: true });
    this.setupHandlers();
    this.connect(url);
  }

  private setupHandlers(): void {
    // Handle outgoing messages
    this.evem.subscribe('ws.send.queued', (data) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
      }
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

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      // Route all server events through EvEm
      if (message.event) {
        this.evem.publish(message.event, message.data);
      }
    };
  }

  // Subscribe to chat messages in a specific room
  onRoomMessage(roomId: string, callback: (data: any) => void): string {
    return this.evem.subscribe(`server.chat.message.${roomId}`, callback);
  }

  // Subscribe to all chat messages
  onAnyMessage(callback: (data: any) => void): string {
    return this.evem.subscribe('server.chat.message.*', callback);
  }

  // Subscribe to typing indicators
  onTyping(callback: (data: any) => void): string {
    return this.evem.subscribe('server.chat.typing.*', callback);
  }

  // Subscribe to user presence
  onUserPresence(callback: (data: any) => void): string {
    return this.evem.subscribe('server.user.presence.*', callback);
  }

  // Subscribe to notifications
  onNotification(callback: (data: any) => void): string {
    return this.evem.subscribe('server.notification.*', callback);
  }

  // Send a message
  async sendMessage(roomId: string, text: string): Promise<void> {
    await this.evem.publish('ws.send', {
      event: 'client.chat.send',
      data: { roomId, text }
    });
  }

  // Send typing indicator
  async sendTyping(roomId: string, isTyping: boolean): Promise<void> {
    await this.evem.publish('ws.send', {
      event: 'client.chat.typing',
      data: { roomId, isTyping }
    });
  }

  off(subscriptionId: string): void {
    this.evem.unsubscribe(subscriptionId);
  }

  disconnect(): void {
    this.messageQueue.disable();
    this.ws?.close();
  }
}

// Usage
const chat = new ChatClient('wss://chat.example.com');

// Subscribe to messages in specific room
const roomSub = chat.onRoomMessage('room-123', (data) => {
  console.log(`${data.username}: ${data.text}`);
  appendMessageToUI(data);
});

// Subscribe to all messages (for notifications)
chat.onAnyMessage((data) => {
  updateUnreadCount(data.roomId);
});

// Subscribe to typing indicators
chat.onTyping((data) => {
  if (data.isTyping) {
    showTypingIndicator(data.userId);
  } else {
    hideTypingIndicator(data.userId);
  }
});

// Subscribe to user presence
chat.onUserPresence((data) => {
  updateUserStatus(data.userId, data.status);
});

// Subscribe to notifications
chat.onNotification((notification) => {
  showToast(notification.message);
});

// Send messages
await chat.sendMessage('room-123', 'Hello everyone!');

// Send typing indicator
await chat.sendTyping('room-123', true);
```

## Key Benefits

1. **Automatic Routing**: Server events are automatically routed to subscribers
2. **Pattern Matching**: Use wildcards to subscribe to multiple events
3. **Filtering**: Filter events based on data properties
4. **Transformation**: Transform event data before handling
5. **Priority**: Control execution order with priorities
6. **Once**: Handle events only once with `once` option
7. **Type Safety**: Strong typing with TypeScript
8. **Decoupling**: Clean separation between WebSocket and application logic

## Best Practices

1. **Namespace your events**: Use clear namespaces like `server.user.*`, `server.chat.*`
2. **Consistent format**: Use the same message format across all server events
3. **Include metadata**: Add timestamps, IDs, etc. to messages
4. **Handle errors**: Always handle parse errors in `onmessage`
5. **Cleanup subscriptions**: Unsubscribe when components unmount
6. **Use filters**: Filter at the subscription level for better performance
7. **Document events**: Keep a registry of all server event types
