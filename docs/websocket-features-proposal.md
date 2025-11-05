# WebSocket Features Proposal for EVEM

> **Status Update**: The high-priority features (Connection State Management, Message Queue, and Request-Response Pattern) have been **fully implemented** as a separate WebSocket adapter module. See [WebSocket Adapter Documentation](websocket-adapter.md) for complete usage guide.

## Implementation Status

### ✅ Implemented Features (v1.0)

1. **Connection State Management** - Fully implemented
   - State machine with transitions: disconnected → connecting → connected → reconnecting → disconnecting
   - Event emission on state changes via `ws.connection.state`
   - Helper methods: `isConnected()`, `isConnecting()`, `isDisconnected()`
   - See: `src/websocket/ConnectionManager.ts`

2. **Message Queue** - Fully implemented
   - FIFO queue with configurable size limits
   - Auto-flush on reconnection (configurable)
   - Overflow handling with event emission
   - Middleware-based interception for clean architecture
   - See: `src/websocket/MessageQueue.ts`

3. **Request-Response Pattern** - Fully implemented
   - RPC-style communication with correlation IDs
   - Configurable timeouts with `RequestTimeoutError`
   - Support for concurrent requests
   - Error handling with typed error responses
   - See: `src/websocket/RequestResponseManager.ts`

### 🚧 Future Enhancements (Not Yet Implemented)

The following features from the original proposal are **not yet implemented** but remain as potential future additions:

## 1. Connection State Management
Add built-in connection state tracking to handle online/offline scenarios:

```typescript
export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected', 
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting'
}

export interface ConnectionAwareOptions extends SubscriptionOptions {
  requiresConnection?: boolean;  // Only execute when connected
  queueWhileDisconnected?: boolean;  // Queue events while disconnected
  executeOnReconnect?: boolean;  // Re-execute when connection restored
}
```

## 2. Message Queue Feature
Add a message queue for offline/reconnection scenarios:

```typescript
export interface QueueOptions {
  maxQueueSize?: number;  // Maximum messages to queue
  queueTTL?: number;  // Time-to-live for queued messages
  persistQueue?: boolean;  // Persist queue to localStorage
  deduplication?: boolean;  // Remove duplicate messages
}

class EvEm {
  private messageQueue = new Map<string, QueuedMessage[]>();
  
  publishQueued<T>(event: string, data: T, options?: QueueOptions): string;
  flushQueue(pattern?: string): Promise<void>;
  clearQueue(pattern?: string): void;
  getQueuedMessages(pattern?: string): QueuedMessage[];
}
```

## 3. Bidirectional Event Binding
Support request-response patterns common in WebSockets:

```typescript
export interface RequestOptions extends PublishOptions {
  responseEvent?: string;  // Event to listen for response
  responseTimeout?: number;  // Timeout waiting for response
  correlationId?: string;  // Match request with response
}

class EvEm {
  // Publish and wait for response
  async request<T, R>(
    event: string, 
    data: T, 
    options?: RequestOptions
  ): Promise<R>;
  
  // Register a responder
  respond<T, R>(
    event: string,
    handler: (data: T) => R | Promise<R>,
    options?: SubscriptionOptions
  ): string;
}
```

## 4. Event Replay with Acknowledgment
Enhanced replay for reliable message delivery:

```typescript
export interface ReliableDeliveryOptions {
  requireAck?: boolean;  // Require acknowledgment
  ackTimeout?: number;  // Timeout for acknowledgment
  maxRetries?: number;  // Maximum retry attempts
  retryDelay?: number;  // Delay between retries
}

class EvEm {
  // Publish with acknowledgment tracking
  publishReliable<T>(
    event: string,
    data: T,
    options?: ReliableDeliveryOptions
  ): Promise<AckResult>;
  
  // Acknowledge receipt of an event
  acknowledge(eventId: string): void;
}
```

## 5. Circuit Breaker Pattern
Prevent cascading failures in distributed systems:

```typescript
export interface CircuitBreakerOptions {
  failureThreshold?: number;  // Failures before opening circuit
  resetTimeout?: number;  // Time before attempting to close circuit
  halfOpenLimit?: number;  // Requests allowed in half-open state
}

class EvEm {
  // Configure circuit breaker for event pattern
  configureCircuitBreaker(
    pattern: string,
    options: CircuitBreakerOptions
  ): void;
  
  // Get circuit state
  getCircuitState(event: string): 'closed' | 'open' | 'half-open';
}
```

## 6. Event Batching
Batch multiple events for efficient transmission:

```typescript
export interface BatchOptions {
  batchSize?: number;  // Maximum batch size
  batchTimeout?: number;  // Maximum time to wait before sending
  compression?: boolean;  // Compress batch data
}

class EvEm {
  // Enable batching for pattern
  enableBatching(pattern: string, options: BatchOptions): void;
  
  // Force flush batched events
  flushBatch(pattern?: string): Promise<void>;
}
```

## 7. Automatic Reconnection with Exponential Backoff
Built-in reconnection strategy:

```typescript
export interface ReconnectionStrategy {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;  // Add random jitter to prevent thundering herd
}

class EvEm {
  // Configure reconnection behavior
  configureReconnection(
    pattern: string,
    strategy: ReconnectionStrategy
  ): void;
}
```

## 8. Metrics and Monitoring
Built-in metrics for production monitoring:

```typescript
export interface EventMetrics {
  eventName: string;
  publishCount: number;
  subscriptionCount: number;
  averageProcessingTime: number;
  errorCount: number;
  lastError?: Error;
  lastPublished?: number;
}

class EvEm {
  // Enable metrics collection
  enableMetrics(options?: MetricsOptions): void;
  
  // Get metrics for events
  getMetrics(pattern?: string): EventMetrics[];
  
  // Reset metrics
  resetMetrics(pattern?: string): void;
}
```

## Implementation Priority

### ✅ High Priority (Core WebSocket needs) - COMPLETED:
1. **Connection State Management** - ✅ Implemented in `src/websocket/ConnectionManager.ts`
2. **Message Queue** - ✅ Implemented in `src/websocket/MessageQueue.ts`
3. **Request-Response Pattern** - ✅ Implemented in `src/websocket/RequestResponseManager.ts`

### 🚧 Medium Priority (Reliability) - NOT YET IMPLEMENTED:
4. **Circuit Breaker** - Important for production systems
5. **Reliable Delivery** - For critical messages
6. **Event Batching** - Performance optimization

### 🚧 Low Priority (Nice to have) - NOT YET IMPLEMENTED:
7. **Automatic Reconnection** - Can be implemented externally
8. **Metrics and Monitoring** - Can use external tools

## Example: Complete WebSocket Integration

> **Note**: This example shows the original proposal's API design. For the **actual implemented API**, see the [WebSocket Adapter Documentation](websocket-adapter.md) which provides working examples of the implemented features.

```typescript
import { EvEm, ConnectionState } from 'evem';

class WebSocketClient {
  private evem: EvEm;
  private ws: WebSocket | null = null;

  constructor(url: string) {
    this.evem = new EvEm();

    // Configure features
    this.evem.enableHistory(100);
    this.evem.enableMetrics();
    this.evem.configureCircuitBreaker('ws.send.*', {
      failureThreshold: 5,
      resetTimeout: 30000
    });

    // Enable batching for non-critical messages
    this.evem.enableBatching('ws.analytics.*', {
      batchSize: 50,
      batchTimeout: 5000
    });

    // Setup connection state management
    this.evem.on('connection.state', (state: ConnectionState) => {
      if (state === ConnectionState.CONNECTED) {
        // Flush queued messages
        this.evem.flushQueue('ws.send.*');
      }
    });
  }

  // Send with reliability
  async sendReliable(type: string, data: any) {
    return this.evem.publishReliable(`ws.send.${type}`, data, {
      requireAck: true,
      ackTimeout: 5000,
      maxRetries: 3
    });
  }

  // Request-response pattern
  async request(type: string, data: any) {
    return this.evem.request(`ws.request.${type}`, data, {
      responseEvent: `ws.response.${type}`,
      responseTimeout: 10000
    });
  }

  // Queue messages while disconnected
  queueMessage(type: string, data: any) {
    return this.evem.publishQueued(`ws.send.${type}`, data, {
      maxQueueSize: 100,
      queueTTL: 60000,
      persistQueue: true
    });
  }
}
```

---

## Actual Implementation

The high-priority features have been implemented as a separate WebSocket adapter module with the following architecture:

**Implemented Components:**
- `ConnectionManager` - Connection state machine
- `MessageQueue` - Message queueing with auto-flush
- `RequestResponseManager` - RPC-style request-response pattern

**Key Differences from Proposal:**
- Implemented as **optional adapter module** rather than core EvEm modifications
- Uses **middleware pattern** for clean event interception
- **Zero modifications** to EvEm core codebase
- **Composition-based architecture** (components take EvEm instance)

**Documentation:**
- **Full API Reference**: [WebSocket Adapter Documentation](websocket-adapter.md)
- **Working Examples**: [Examples Documentation](examples.md#websocket-adapter-examples)
- **Architecture Notes**: [CLAUDE.md](../CLAUDE.md#websocket-adapter-optional-extension)

**Test Coverage:**
- 78 comprehensive tests (100% passing)
- Tests located in `tests/websocket/` directory
- Run with: `pnpm test:nowatch -- tests/websocket/`