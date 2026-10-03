import type { EvEm, MiddlewareConfig } from '../eventEmitter.js';
import { ConnectionManager } from './ConnectionManager.js';
import { MessageQueue } from './MessageQueue.js';
import { RequestResponseManager } from './RequestResponseManager.js';
import { routeServerMessage } from '../shared/routing.js';
import type { IWebSocket, WebSocketHandlerOptions, RequestOptions } from './types.js';

/**
 * WebSocketHandler - Automatically wires WebSocket events to EvEm
 *
 * This component eliminates manual boilerplate by automatically:
 * - Wiring WebSocket lifecycle events (onopen, onclose) to ConnectionManager and onerror to 'ws.error'
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
    handler: (_event: string, request: any) => ({ type: 'request', ...request })
  };

  /**
   * Sends ws.send.* events other than requests (e.g. ws.send.chat), like ws.send itself.
   * Subscribers don't receive the event name, so this has to be a middleware. It's registered after
   * the MessageQueue middleware, which has already queued the message if we're disconnected.
   * Requests (when request-response is enabled) and flushed messages (ws.send.queued) have their
   * own subscribers.
   */
  private readonly subEventSendMiddleware: MiddlewareConfig = {
    pattern: 'ws.send.*',
    handler: (event: string, data: any) => {
      const hasRequestSubscriber = event === 'ws.send.request' && this.options.enableRequestResponse;
      if (!hasRequestSubscriber && !event.includes('queued')) {
        this.sendOrQueue(data, false, 'Failed to send message:');
      }
      return data;
    }
  };

  /**
   * Create a new WebSocketHandler
   *
   * @param urlOrSocket - WebSocket URL string or WebSocket instance
   * @param evem - EvEm instance for event management
   * @param options - Configuration options
   */
  constructor(urlOrSocket: string | IWebSocket, evem: EvEm, options: WebSocketHandlerOptions = {}) {
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
      messageFormatter: options.messageFormatter ?? ((data: any) => JSON.stringify(data))
    };

    // Create or use provided WebSocket. First, so that if the socket can't be created,
    // nothing has been registered on the emitter yet
    if (typeof urlOrSocket === 'string') {
      this.url = urlOrSocket;
      this.ws = this.createWebSocket(urlOrSocket);
    } else {
      this.url = urlOrSocket.url;
      this.ws = urlOrSocket;
    }

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
        autoFlush: this.options.autoFlush
      });
    }

    // Initialize RequestResponseManager if enabled
    if (this.options.enableRequestResponse) {
      this.requestResponse = new RequestResponseManager(evem);
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
    const socket = this.ws;
    // A connection attempt that fails may report only an error (see onerror)
    let opened = socket.readyState === socket.OPEN;

    // Wire onopen
    this.ws.onopen = async event => {
      opened = true;
      this.reconnectAttempts = 0;
      await this.connectionManager.transitionTo('connected');
    };

    // Wire onclose
    this.ws.onclose = async event => {
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

      // A failed connection attempt gets an error and then, per the WebSocket standard, a close. Node.js 22's
      // built-in WebSocket never sends that close, so the attempt counts as failed here, once: this socket's
      // handlers come off (a close that does follow is ignored) and its further errors are swallowed, since a
      // `ws` socket without an error listener throws
      if (!opened && !this.isDisconnecting) {
        this.detachWebSocketEvents();
        socket.onerror = () => undefined;
        void this.handleUnexpectedClose();
      }
    };

    // Wire onmessage
    this.ws.onmessage = event => {
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
      // A socket that never opened leaves the state at 'disconnected': there's no change to announce
      if (!this.connectionManager.isDisconnected()) {
        await this.connectionManager.transitionTo('disconnected');
      }
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
    // Other ws.send.* events (see subEventSendMiddleware)
    this.evem.use(this.subEventSendMiddleware);

    // Wire regular messages sent via ws.send
    // The MessageQueue middleware always passes messages through (it queues them as a side
    // effect while disconnected), so we handle both:
    // - ws.send: Messages published by the app
    // - ws.send.queued: Messages flushed from the queue once connected
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
        // Already in wire format (requestFormatMiddleware)
        this.sendOrQueue(request, false, 'Failed to send request:');
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
    // The queue middleware queued this message when it was published (we were offline); the
    // connection may have opened since, but the queue sends it, so don't send it twice
    if (!fromQueue && this.messageQueue?.wasQueued(data)) {
      return;
    }

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
      const message: unknown = this.options.messageParser(rawData);
      const routed = routeServerMessage(message, {
        prefix: this.options.serverEventPrefix,
        channel: 'ws',
        handleResponses: this.options.enableRequestResponse
      });
      this.evem.publish(routed.event, routed.data);
    } catch (error) {
      // Emit parse error event
      this.evem.publish('ws.parse.error', {
        error,
        rawData
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
   * Send the messages queued while offline now (the only way to send them with autoFlush: false)
   * Messages the socket can't take go back into the queue. Does nothing if the queue is disabled.
   */
  async flush(): Promise<void> {
    await this.messageQueue?.flush();
  }

  /**
   * Send a request to the server and wait for its response (request-response pattern)
   * The request is queued while disconnected, like other messages.
   *
   * @param method - Method name sent to the server
   * @param params - Optional request parameters
   * @param options - Timeout (default 5000ms) and optional custom request id
   * @returns The response's `result`; rejects with the server's error, a RequestTimeoutError,
   *   or an Error if request-response is disabled or the handler is disconnected
   */
  request<T = any>(method: string, params?: any, options?: RequestOptions): Promise<T> {
    if (!this.requestResponse) {
      return Promise.reject(new Error('Request-response is disabled (enableRequestResponse: false)'));
    }
    if (this.isDisconnecting) {
      return Promise.reject(new Error('WebSocketHandler is disconnected'));
    }
    return this.requestResponse.request(method, params, options);
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
    this.evem.removeMiddleware(this.subEventSendMiddleware);

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
