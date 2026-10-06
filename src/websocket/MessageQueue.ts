import type { AnyEvEm } from '../eventEmitter.js';
import { localName } from '../shared/names.js';
import { publishSafely } from '../shared/publishSafely.js';
import type { ConnectionManager } from './ConnectionManager.js';
import type { QueuedMessage } from './types.js';

/**
 * Options for MessageQueue
 */
export interface MessageQueueOptions {
  /**
   * Automatically flush queue when connection becomes established
   * @default true
   */
  autoFlush?: boolean;
}

/**
 * Manages message queueing for offline support
 * Queues messages while disconnected and replays them on reconnection
 */
export class MessageQueue {
  private enabled = false;
  private maxSize = 100;
  private queue: QueuedMessage[] = [];
  // Stryker disable next-line ObjectLiteral,BooleanLiteral: enable() sets the options before anything reads them
  private options: MessageQueueOptions = { autoFlush: true };
  private middlewareHandler?: (event: string, data: any) => any;
  private stateSubscriptionId?: string;
  /** Payload objects whose most recent publish the middleware queued (see wasQueued) */
  private queuedPayloads = new WeakSet<object>();

  constructor(
    private evem: AnyEvEm,
    private connectionManager: ConnectionManager
  ) {}

  /**
   * Enable message queueing
   */
  enable(maxSize: number = 100, options: MessageQueueOptions = {}): void {
    // Clean up existing middleware/subscriptions if re-enabling
    this.cleanup();

    this.maxSize = maxSize;
    // Set options with defaults, don't merge with previous
    this.options = { autoFlush: options.autoFlush ?? true };
    this.enabled = true;

    // Create a handler function for queueing and store it for later removal
    this.middlewareHandler = (event: string, data: any) => {
      // Flushed messages pass through untouched
      if (event.includes('queued')) {
        return data;
      }

      // Queue while not connected (the middleware is only registered while the queue is enabled)
      const shouldQueue = !this.connectionManager.isConnected();
      if (shouldQueue) {
        // Queue the message synchronously as a side effect
        this.enqueueSynchronous(data);
      }

      // Remember the decision, so senders later in this publish don't send a queued message too
      if (typeof data === 'object' && data !== null) {
        if (shouldQueue) {
          this.queuedPayloads.add(data);
        } else {
          this.queuedPayloads.delete(data);
        }
      }

      // Always return data unchanged to pass through to other handlers
      return data;
    };

    // Register middleware for exact 'ws.send' AND pattern 'ws.send.*'
    // We need both because 'ws.send*' doesn't match 'ws.send' exactly
    this.evem.use({
      pattern: localName(this.evem, 'ws.send'),
      handler: this.middlewareHandler
    });

    this.evem.use({
      pattern: localName(this.evem, 'ws.send.*'),
      handler: this.middlewareHandler
    });

    // Subscribe to connection state changes for auto-flush (only if enabled)
    if (this.options.autoFlush === true) {
      this.stateSubscriptionId = this.evem.subscribe(
        localName(this.evem, 'ws.connection.state'),
        async (event: any) => {
          if (event.to === 'connected') {
            await this.flush();
          }
        }
      );
    }
  }

  /**
   * Disable message queueing
   */
  disable(): void {
    this.enabled = false;
    this.cleanup();
  }

  /**
   * Clean up middleware and subscriptions
   */
  private cleanup(): void {
    // Remove both middleware registrations (ws.send and ws.send.*)
    // removeMiddleware removes a single registration, so remove each one by its pattern
    // Stryker disable next-line ConditionalExpression: removing a middleware that isn't registered does nothing
    if (this.middlewareHandler) {
      this.evem.removeMiddleware({ pattern: localName(this.evem, 'ws.send'), handler: this.middlewareHandler });
      this.evem.removeMiddleware({ pattern: localName(this.evem, 'ws.send.*'), handler: this.middlewareHandler });
      this.middlewareHandler = undefined;
    }

    // Unsubscribe from state changes
    if (this.stateSubscriptionId) {
      this.evem.unsubscribeById(this.stateSubscriptionId);
      this.stateSubscriptionId = undefined;
    }
  }

  /**
   * Check if queueing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get maximum queue size
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Queue a message explicitly, whatever the connection state
   * Use it for a message that could not be sent after all, e.g. because the socket closed
   * before the connection state changed. The maximum queue size applies; does nothing while disabled.
   */
  enqueue(data: any): void {
    this.enqueueSynchronous(data);
  }

  /**
   * Whether the middleware queued this payload the last time it was published
   * Senders that run later in the same publish (e.g. a ws.send subscriber, after the connection
   * opened in the meantime) use it to avoid sending a message the queue will also flush.
   * Always false for primitive payloads, which can't be tracked.
   */
  wasQueued(data: unknown): boolean {
    // A WeakSet holds only objects: for anything else, has() is false
    return this.queuedPayloads.has(data as object);
  }

  /**
   * Enqueue a message synchronously (for use in middleware)
   */
  private enqueueSynchronous(data: any): void {
    if (!this.enabled) {
      return;
    }

    const message: QueuedMessage = {
      // Stryker disable next-line StringLiteral: the original event name isn't kept: a flush publishes ws.send.queued
      event: localName(this.evem, 'ws.send'),
      data,
      timestamp: Date.now()
    };

    // Check if queue is full
    if (this.queue.length >= this.maxSize) {
      // Drop the oldest message
      const droppedMessage = this.queue.shift();

      // Emit overflow event with just the data part
      // This is safe to do synchronously because 'ws.queue.overflow' won't match our middleware pattern
      void publishSafely(
        this.evem,
        localName(this.evem, 'ws.queue.overflow'),
        // Stryker disable next-line OptionalChaining: a full queue (maxSize at least 1) always has a message to drop
        { maxSize: this.maxSize, droppedMessage: droppedMessage?.data },
        'the WebSocket connection'
      );
    }

    this.queue.push(message);
  }

  /**
   * Flush all queued messages
   */
  async flush(): Promise<void> {
    // Get all messages to flush (create a copy to avoid modification during iteration)
    const messagesToFlush = [...this.queue];

    // Clear the queue
    this.queue = [];

    // Publish each queued message to ws.send.queued
    // Middleware will ignore these because event name includes 'queued'
    for (const message of messagesToFlush) {
      await this.evem.publish(localName(this.evem, 'ws.send.queued'), message.data);
    }
  }

  /**
   * Clear all queued messages without flushing
   */
  clear(): void {
    this.queue = [];
  }
}
