import type { EvEm } from '../eventEmitter.js';
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
  private options: MessageQueueOptions = { autoFlush: true };
  private middlewareHandler?: (event: string, data: any) => any;
  private stateSubscriptionId?: string;
  private isEnqueuing = false;
  /** Payload objects whose most recent publish the middleware queued (see wasQueued) */
  private queuedPayloads = new WeakSet<object>();

  constructor(
    private evem: EvEm,
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

      // Only queue if enabled, not already enqueuing and not connected
      const shouldQueue = this.enabled && !this.isEnqueuing && !this.connectionManager.isConnected();
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
      pattern: 'ws.send',
      handler: this.middlewareHandler
    });

    this.evem.use({
      pattern: 'ws.send.*',
      handler: this.middlewareHandler
    });

    // Subscribe to connection state changes for auto-flush (only if enabled)
    if (this.options.autoFlush === true) {
      this.stateSubscriptionId = this.evem.subscribe('ws.connection.state', async (event: any) => {
        if (event.to === 'connected' && this.queue.length > 0) {
          await this.flush();
        }
      });
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
    if (this.middlewareHandler) {
      this.evem.removeMiddleware({ pattern: 'ws.send', handler: this.middlewareHandler });
      this.evem.removeMiddleware({ pattern: 'ws.send.*', handler: this.middlewareHandler });
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
    return typeof data === 'object' && data !== null && this.queuedPayloads.has(data);
  }

  /**
   * Enqueue a message synchronously (for use in middleware)
   */
  private enqueueSynchronous(data: any): void {
    if (!this.enabled) {
      return;
    }

    this.isEnqueuing = true;

    try {
      const message: QueuedMessage = {
        event: 'ws.send',
        data,
        timestamp: Date.now()
      };

      // Check if queue is full
      if (this.queue.length >= this.maxSize) {
        // Drop the oldest message
        const droppedMessage = this.queue.shift();

        // Emit overflow event with just the data part
        // This is safe to do synchronously because 'ws.queue.overflow' won't match our middleware pattern
        this.evem.publish('ws.queue.overflow', {
          maxSize: this.maxSize,
          droppedMessage: droppedMessage?.data
        });
      }

      this.queue.push(message);
    } finally {
      this.isEnqueuing = false;
    }
  }

  /**
   * Flush all queued messages
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    // Get all messages to flush (create a copy to avoid modification during iteration)
    const messagesToFlush = [...this.queue];

    // Clear the queue
    this.queue = [];

    // Publish each queued message to ws.send.queued
    // Middleware will ignore these because event name includes 'queued'
    for (const message of messagesToFlush) {
      await this.evem.publish('ws.send.queued', message.data);
    }
  }

  /**
   * Clear all queued messages without flushing
   */
  clear(): void {
    this.queue = [];
  }
}
