import type { EvEm, MiddlewareConfig } from '../eventEmitter';
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
  private options: Required<Omit<WebSocketHandlerOptions, 'onError' | 'WebSocketConstructor'>> &
    Pick<WebSocketHandlerOptions, 'onError' | 'WebSocketConstructor'>;
  private subscriptionIds: string[] = [];
  private isDisconnecting = false;

  /** URL for new sockets when reconnecting (undefined if the given socket doesn't expose one) */
  private readonly url?: string;
  /** Reconnection attempts since the last successful open */
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  /**
   * Puts outgoing requests in wire format before the MessageQueue sees them,
   * so requests queued while offline are still sent as requests when the queue flushes
   */
  private readonly requestFormatMiddleware: MiddlewareConfig = {
    pattern: 'ws.send.request',
    handler: (_event: string, request: any) => ({ type: 'request', ...request }),
  };

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
      WebSocketConstructor: options.WebSocketConstructor,
      onError: options.onError,
      messageParser: options.messageParser ?? ((data: string) => JSON.parse(data)),
      messageFormatter: options.messageFormatter ?? ((data: any) => JSON.stringify(data)),
    };

    // Initialize ConnectionManager
    this.connectionManager = new ConnectionManager(evem);

    // Must be registered before the MessageQueue middleware so queued requests are already formatted
    if (this.options.enableRequestResponse) {
      this.evem.use(this.requestFormatMiddleware);
    }

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
      this.url = urlOrSocket;
      this.ws = this.createWebSocket(urlOrSocket);
    } else {
      this.url = urlOrSocket.url;
      this.ws = urlOrSocket;
    }

    // Auto-wire all events
    this.autoWireWebSocketEvents();
    this.autoWireOutgoingMessages();

    // onopen won't fire for a socket that is already open
    if (this.ws.readyState === this.ws.OPEN) {
      this.connectionManager.transitionTo('connected');
    }
  }

  /**
   * Create a socket with the configured WebSocketConstructor (or the global WebSocket)
   */
  private createWebSocket(url: string): IWebSocket {
    return this.options.WebSocketConstructor
      ? new this.options.WebSocketConstructor(url)
      : (new WebSocket(url) as IWebSocket);
  }

  /**
   * Auto-wire WebSocket lifecycle events to EvEm and ConnectionManager
   */
  private autoWireWebSocketEvents(): void {
    // Wire onopen
    this.ws.onopen = async (event) => {
      this.reconnectAttempts = 0;
      await this.connectionManager.transitionTo('connected');
    };

    // Wire onclose
    this.ws.onclose = async (event) => {
      if (!this.isDisconnecting) {
        await this.handleUnexpectedClose();
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
   * Detach the lifecycle and message handlers from the current socket
   */
  private detachWebSocketEvents(): void {
    this.ws.onopen = null;
    this.ws.onclose = null;
    this.ws.onerror = null;
    this.ws.onmessage = null;
  }

  /**
   * Handle a close that disconnect() didn't cause: schedule a reconnection attempt if enabled,
   * otherwise (or once maxReconnectAttempts consecutive attempts have failed) go to 'disconnected'
   */
  private async handleUnexpectedClose(): Promise<void> {
    if (!this.options.reconnect || !this.url) {
      await this.connectionManager.transitionTo('disconnected');
      return;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      await this.connectionManager.transitionTo('disconnected');
      await this.evem.publish('ws.reconnect.failed', { attempts: this.reconnectAttempts });
      return;
    }

    // Scheduled before the state change is announced, so a disconnect() from a state handler cancels it
    this.reconnectTimer = setTimeout(() => this.reconnect(), this.options.reconnectDelay);
    if (!this.connectionManager.isReconnecting()) {
      await this.connectionManager.transitionTo('reconnecting');
    }
  }

  /**
   * Replace the closed socket with a new one to the same URL
   * Its onopen leads to 'connected' (which flushes the queue); its onclose to the next attempt
   */
  private reconnect(): void {
    this.reconnectTimer = undefined;
    if (this.isDisconnecting || !this.url) {
      return;
    }

    this.reconnectAttempts++;
    this.detachWebSocketEvents();

    try {
      this.ws = this.createWebSocket(this.url);
    } catch (caught) {
      // A socket that can't even be created counts as a failed attempt
      const error = caught instanceof Error ? caught : new Error(String(caught));
      this.evem.publish('ws.error', { error });
      if (this.options.onError) {
        this.options.onError(error);
      }
      this.handleUnexpectedClose();
      return;
    }

    this.autoWireWebSocketEvents();
  }

  /**
   * Auto-wire outgoing EvEm events to WebSocket.send()
   */
  private autoWireOutgoingMessages(): void {
    // Wire regular messages sent via ws.send
    // Note: MessageQueue middleware passes through when connected, so we need to handle both:
    // - ws.send: Messages that pass through middleware when connected
    // - ws.send.queued: Messages flushed from queue after reconnection
    const sendSub = this.evem.subscribe('ws.send', (data: any) => {
      this.sendOrQueue(data, false, 'Failed to send message:');
    });
    this.subscriptionIds.push(sendSub);

    // Subscribe to ws.send.queued for flushed queue messages
    const queuedSub = this.evem.subscribe('ws.send.queued', (data: any) => {
      this.sendOrQueue(data, true, 'Failed to send message:');
    });
    this.subscriptionIds.push(queuedSub);

    // Wire request messages if request-response is enabled
    if (this.options.enableRequestResponse) {
      const requestSub = this.evem.subscribe('ws.send.request', (request: any) => {
        this.sendOrQueue({ type: 'request', ...request }, false, 'Failed to send request:');
      });
      this.subscriptionIds.push(requestSub);
    }
  }

  /**
   * Send a message if the socket is open, otherwise put it (back) in the queue if the queue is enabled
   * The socket can stop being open before onclose updates the connection state, e.g. mid-flush
   *
   * @param data - Message to send
   * @param fromQueue - Whether the message is being flushed from the queue
   * @param errorLabel - Prefix for the error logged when sending fails
   */
  private sendOrQueue(data: any, fromQueue: boolean, errorLabel: string): void {
    if (this.ws.readyState === this.ws.OPEN) {
      try {
        const formatted = this.options.messageFormatter(data);
        this.ws.send(formatted);
      } catch (error) {
        console.error(errorLabel, error);
      }
      return;
    }

    // The queue middleware has already queued new messages unless the state says 'connected'
    if (fromQueue || this.connectionManager.isConnected()) {
      this.messageQueue?.enqueue(data);
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
        const eventName = this.options.serverEventPrefix
          ? `${this.options.serverEventPrefix}.${message.type}`
          : message.type;
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
   * The connection state leaves 'connected' immediately; the returned promise resolves
   * once the 'disconnecting' and 'disconnected' state changes have been handled
   */
  async disconnect(): Promise<void> {
    if (this.isDisconnecting) {
      return;
    }

    this.isDisconnecting = true;

    // Cancel a pending reconnection attempt
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Unsubscribe from all EvEm events
    for (const subId of this.subscriptionIds) {
      try {
        this.evem.unsubscribeById(subId);
      } catch (error) {
        // Ignore unsubscribe errors during cleanup
      }
    }
    this.subscriptionIds = [];
    this.evem.removeMiddleware(this.requestFormatMiddleware);

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
    this.detachWebSocketEvents();

    // onclose is detached above, so report the disconnect ourselves
    if (!this.connectionManager.isDisconnected()) {
      await this.connectionManager.transitionTo('disconnecting');
      await this.connectionManager.transitionTo('disconnected');
    }
  }
}
