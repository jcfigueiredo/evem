import type { EvEm } from '../eventEmitter';
import { ConnectionManager } from './ConnectionManager';
import { MessageQueue } from './MessageQueue';
import { RequestResponseManager } from './RequestResponseManager';
import type {
  IWebSocket,
  WebSocketHandlerOptions,
  IncomingMessage,
} from './types';

/**
 * WebSocketHandler - Automatically wires WebSocket events to EvEm
 *
 * This component eliminates manual boilerplate by automatically:
 * - Wiring WebSocket lifecycle events (onopen, onclose, onerror) to ConnectionManager
 * - Wiring outgoing EvEm events to WebSocket.send()
 * - Parsing and routing incoming WebSocket messages to EvEm events
 * - Managing MessageQueue and RequestResponseManager integration
 *
 * Usage:
 * ```typescript
 * const evem = new EvEm();
 * const handler = new WebSocketHandler('wss://api.example.com', evem);
 *
 * // Now just subscribe to server events - everything is auto-wired!
 * evem.subscribe('server.user.*', (data) => {
 *   console.log('User event:', data);
 * });
 * ```
 */
export class WebSocketHandler {
  private ws: IWebSocket;
  private evem: EvEm;
  private connectionManager: ConnectionManager;
  private messageQueue?: MessageQueue;
  private requestResponse?: RequestResponseManager;
  private options: Required<WebSocketHandlerOptions>;
  private subscriptionIds: string[] = [];
  private isDisconnecting = false;

  /**
   * Create a new WebSocketHandler
   *
   * @param urlOrSocket - WebSocket URL string or WebSocket instance
   * @param evem - EvEm instance for event management
   * @param options - Configuration options
   */
  constructor(
    urlOrSocket: string | IWebSocket,
    evem: EvEm,
    options: WebSocketHandlerOptions = {}
  ) {
    this.evem = evem;

    // Set default options
    this.options = {
      enableQueue: options.enableQueue ?? true,
      queueSize: options.queueSize ?? 100,
      autoFlush: options.autoFlush ?? true,
      enableRequestResponse: options.enableRequestResponse ?? true,
      serverEventPrefix: options.serverEventPrefix ?? 'server',
      reconnect: options.reconnect ?? false,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      onError: options.onError,
      messageParser: options.messageParser ?? ((data: string) => JSON.parse(data)),
      messageFormatter: options.messageFormatter ?? ((data: any) => JSON.stringify(data)),
    };

    // Initialize ConnectionManager
    this.connectionManager = new ConnectionManager(evem);

    // Initialize MessageQueue if enabled
    if (this.options.enableQueue) {
      this.messageQueue = new MessageQueue(evem, this.connectionManager);
      this.messageQueue.enable(this.options.queueSize, {
        autoFlush: this.options.autoFlush,
      });
    }

    // Initialize RequestResponseManager if enabled
    if (this.options.enableRequestResponse) {
      this.requestResponse = new RequestResponseManager(evem);
    }

    // Create or use provided WebSocket
    if (typeof urlOrSocket === 'string') {
      this.ws = new WebSocket(urlOrSocket) as IWebSocket;
    } else {
      this.ws = urlOrSocket;
    }

    // Auto-wire all events
    this.autoWireWebSocketEvents();
    this.autoWireOutgoingMessages();
  }

  /**
   * Auto-wire WebSocket lifecycle events to EvEm and ConnectionManager
   */
  private autoWireWebSocketEvents(): void {
    // Wire onopen
    this.ws.onopen = async (event) => {
      await this.connectionManager.transitionTo('connected');
    };

    // Wire onclose
    this.ws.onclose = async (event) => {
      if (!this.isDisconnecting) {
        await this.connectionManager.transitionTo('disconnected');
      }
    };

    // Wire onerror
    this.ws.onerror = (event: any) => {
      // Extract error from event object (MockWebSocket format) or create generic error
      const error = event.error || (event instanceof Error ? event : new Error('WebSocket error'));

      // Emit error event
      this.evem.publish('ws.error', { error, event });

      // Call custom error handler if provided
      if (this.options.onError) {
        this.options.onError(error);
      }
    };

    // Wire onmessage
    this.ws.onmessage = (event) => {
      this.handleIncomingMessage(event.data);
    };
  }

  /**
   * Auto-wire outgoing EvEm events to WebSocket.send()
   */
  private autoWireOutgoingMessages(): void {
    // Wire regular messages sent via ws.send
    // Note: MessageQueue middleware passes through when connected, so we need to handle both:
    // - ws.send: Messages that pass through middleware when connected
    // - ws.send.queued: Messages flushed from queue after reconnection
    const sendHandler = (data: any) => {
      if (this.ws.readyState === this.ws.OPEN) {
        try {
          const formatted = this.options.messageFormatter(data);
          this.ws.send(formatted);
        } catch (error) {
          console.error('Failed to send message:', error);
        }
      }
    };

    // Subscribe to ws.send for messages (middleware passes through when connected)
    const sendSub = this.evem.subscribe('ws.send', sendHandler);
    this.subscriptionIds.push(sendSub);

    // Subscribe to ws.send.queued for flushed queue messages
    const queuedSub = this.evem.subscribe('ws.send.queued', sendHandler);
    this.subscriptionIds.push(queuedSub);

    // Wire request messages if request-response is enabled
    if (this.options.enableRequestResponse) {
      const requestSub = this.evem.subscribe('ws.send.request', (request: any) => {
        if (this.ws.readyState === this.ws.OPEN) {
          try {
            const formatted = this.options.messageFormatter({
              type: 'request',
              ...request,
            });
            this.ws.send(formatted);
          } catch (error) {
            console.error('Failed to send request:', error);
          }
        }
      });
      this.subscriptionIds.push(requestSub);
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleIncomingMessage(rawData: string): void {
    try {
      const message: IncomingMessage = this.options.messageParser(rawData);

      // Route RPC responses
      if (message.type === 'response' && this.options.enableRequestResponse) {
        if (message.error) {
          this.evem.publish('ws.response.error', {
            id: message.id,
            error: message.error,
            timestamp: message.timestamp ?? Date.now(),
          });
        } else {
          this.evem.publish('ws.response', {
            id: message.id,
            result: message.result,
            timestamp: message.timestamp ?? Date.now(),
          });
        }
        return;
      }

      // Route server-sent events (recommended format)
      if (message.event) {
        // If event already has the prefix, use it as-is
        // Otherwise, add the prefix unless it starts with the prefix already
        let eventName = message.event;
        if (!eventName.startsWith(this.options.serverEventPrefix + '.')) {
          // Check if the event name needs the prefix
          // If it's just "notification", make it "server.notification"
          // If it's already "server.notification", keep it as-is
          eventName = this.options.serverEventPrefix
            ? `${this.options.serverEventPrefix}.${eventName}`
            : eventName;
        }

        this.evem.publish(eventName, message.data);
        return;
      }

      // Legacy format: use type field (but not for responses)
      if (message.type && message.type !== 'response') {
        const eventName = `${this.options.serverEventPrefix}.${message.type}`;
        this.evem.publish(eventName, message.data);
        return;
      }

      // If no routing matched, emit a generic message event
      this.evem.publish('ws.message', message);

    } catch (error) {
      // Emit parse error event
      this.evem.publish('ws.parse.error', {
        error,
        rawData,
      });

      if (this.options.onError && error instanceof Error) {
        this.options.onError(error);
      }
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  /**
   * Get current connection state
   */
  getConnectionState(): string {
    return this.connectionManager.getState();
  }

  /**
   * Get current queue size (if queue is enabled)
   */
  getQueueSize(): number {
    return this.messageQueue?.getQueueSize() ?? 0;
  }

  /**
   * Disconnect and clean up all resources
   */
  disconnect(): void {
    if (this.isDisconnecting) {
      return;
    }

    this.isDisconnecting = true;

    // Unsubscribe from all EvEm events
    for (const subId of this.subscriptionIds) {
      try {
        this.evem.unsubscribe(subId);
      } catch (error) {
        // Ignore unsubscribe errors during cleanup
      }
    }
    this.subscriptionIds = [];

    // Clean up MessageQueue
    if (this.messageQueue) {
      this.messageQueue.clear();
      this.messageQueue.disable();
    }

    // Clean up RequestResponseManager
    if (this.requestResponse) {
      this.requestResponse.cleanup();
    }

    // Close WebSocket
    if (this.ws && this.ws.readyState !== this.ws.CLOSED) {
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch (error) {
        // Ignore close errors
      }
    }

    // Clear handlers to prevent memory leaks
    this.ws.onopen = null;
    this.ws.onclose = null;
    this.ws.onerror = null;
    this.ws.onmessage = null;
  }
}
