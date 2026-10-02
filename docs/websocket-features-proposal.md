# WebSocket Features Proposal for EVEM

This is the original proposal for WebSocket-oriented features, kept for reference. Most of it proposed new methods on `EvEm` itself; what was built instead is an optional adapter, `@jcfigueiredo/evem/websocket` (`src/websocket/`), that leaves the core unchanged. For how to use what exists, see the [WebSocket Adapter Documentation](websocket-adapter.md) and the [examples](examples.md#websocket-adapter-examples).

## Status

| Proposed feature | Status | What exists today |
|---|---|---|
| 1. Connection State Management | Partially | `ConnectionManager` tracks the five states and publishes `ws.connection.state` (`{ from, to, timestamp }`), with `isConnected()`, `isConnecting()`, `isDisconnected()`, `isDisconnecting()`, `isReconnecting()`. It doesn't validate transitions. The connection-aware subscription options (`requiresConnection`, `queueWhileDisconnected`, `executeOnReconnect`) were not built. |
| 2. Message Queue | Partially | `MessageQueue`: a FIFO queue of `ws.send` / `ws.send.*` messages published while not connected, with a size limit (the oldest message is dropped and `ws.queue.overflow` published) and a flush to `ws.send.queued` when the state changes to `connected` (`autoFlush`). Not built: `queueTTL`, `persistQueue`, `deduplication`, per-pattern queues, and the `publishQueued` / `flushQueue` / `clearQueue` / `getQueuedMessages` methods on `EvEm`. |
| 3. Bidirectional Event Binding (request-response) | Partially | `WebSocketHandler.request(method, params?, { timeout, id })`, built on `RequestResponseManager`: requests go out on `ws.send.request` with a correlation id, `ws.response` / `ws.response.error` settle them, and `RequestTimeoutError` reports timeouts. Not built: `EvEm.request()` on arbitrary events with a `responseEvent`, and `respond()` for registering responders. |
| 4. Event Replay with Acknowledgment | Partially | No acknowledgments, retries or `publishReliable()`. The core has event history (`enableHistory`, `getEventHistory`) and replays it to late subscribers with the `replayLastEvent` and `replayHistory` subscription options. |
| 5. Circuit Breaker | Not implemented | |
| 6. Event Batching | Not implemented | |
| 7. Automatic Reconnection with Exponential Backoff | Partially | Reconnection is implemented in `WebSocketHandler` (options `reconnect`, `reconnectDelay`, `maxReconnectAttempts`): after an unexpected close it goes to `reconnecting`, opens a new socket to the same URL after a fixed delay, flushes the queue once connected, and publishes `ws.reconnect.failed` (`{ attempts }`) when the attempts are used up. Not built: exponential backoff, maximum delay, jitter, and per-pattern configuration on `EvEm`. |
| 8. Metrics and Monitoring | Partially | No counters or timings (`enableMetrics`, `getMetrics`). The core's `info(pattern?)` lists subscriptions and middleware, and memory leak detection (`enableMemoryLeakDetection`) warns when an event's subscriptions pass a threshold. |
| Not in this proposal: `WebSocketHandler` | Implemented | The recommended entry point. It connects a socket to an `EvEm` instance and runs the components above: it sends `ws.send` and `ws.send.*` events while connected and queues them while offline, routes incoming `{ event, data }` messages to `server.*` events (and unrecognised ones to `ws.message`), publishes `ws.error` and `ws.parse.error`, and provides `request()` and reconnection. |

The sections below are the original proposal. The APIs they show were not built as written; the table says what exists instead.

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

The priorities as proposed, with their status (see the [table](#status) for details):

### High Priority (Core WebSocket needs)
1. **Connection State Management** - partially implemented: `src/websocket/ConnectionManager.ts`
2. **Message Queue** - partially implemented: `src/websocket/MessageQueue.ts`
3. **Request-Response Pattern** - partially implemented: `src/websocket/RequestResponseManager.ts`, exposed as `WebSocketHandler.request()`

### Medium Priority (Reliability)
4. **Circuit Breaker** - not implemented
5. **Reliable Delivery** - not implemented (the core replays event history to late subscribers, without acknowledgments)
6. **Event Batching** - not implemented

### Low Priority (Nice to have)
7. **Automatic Reconnection** - implemented in `WebSocketHandler` with a fixed delay; exponential backoff and jitter are not
8. **Metrics and Monitoring** - not implemented (the core has `info()` and memory leak detection)

## Example: Complete WebSocket Integration

> **Note**: This sketches the API as originally proposed. None of the `EvEm` methods it calls (`on`, `enableMetrics`, `configureCircuitBreaker`, `enableBatching`, `flushQueue`, `publishReliable`, `request`, `publishQueued`) exist, and `ConnectionState` is a string union type exported from `@jcfigueiredo/evem/websocket`, not an enum. For working code, see the [examples](examples.md#websocket-adapter-examples).

```typescript
import { EvEm, ConnectionState } from '@jcfigueiredo/evem';

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

The features were built as a separate WebSocket adapter module (`src/websocket/`, published as `@jcfigueiredo/evem/websocket`):

**Components:**
- `WebSocketHandler` - Recommended entry point: wires a socket to EvEm (sending, queueing, routing, `request()`, reconnection)
- `ConnectionManager` - Connection state tracking with `ws.connection.state` events
- `MessageQueue` - Message queueing with auto-flush
- `RequestResponseManager` - RPC-style request-response pattern

**Key Differences from Proposal:**
- Implemented as an **optional adapter module** rather than core EvEm modifications
- Uses **middleware** to intercept outgoing `ws.send` / `ws.send.*` events
- Uses only EvEm's **public API** (subscriptions and middleware); the core has no WebSocket-specific code
- **Composition-based architecture** (components take an EvEm instance)

**Documentation:**
- **Full API Reference**: [WebSocket Adapter Documentation](websocket-adapter.md)
- **Working Examples**: [Examples Documentation](examples.md#websocket-adapter-examples)
- **Architecture Notes**: [CLAUDE.md](../CLAUDE.md#websocket-adapter-optional-extension)

**Tests:**
- Located in `tests/websocket/` (one file per component, plus the entry point exports)
- Run with: `pnpm test:nowatch tests/websocket/`
