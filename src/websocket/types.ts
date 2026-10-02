import type { ConnectionState, ConnectionStateChangeEvent } from '../shared/types.js';

/**
 * Universal WebSocket interface that abstracts over browser WebSocket and Node.js 'ws'
 */
export interface IWebSocket {
  readonly readyState: number;
  readonly CONNECTING: number;
  readonly OPEN: number;
  readonly CLOSING: number;
  readonly CLOSED: number;

  /**
   * URL the socket connects to (exposed by browser WebSocket and Node.js `ws`)
   * WebSocketHandler uses it to reconnect a socket it was given
   */
  readonly url?: string;

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void;
  close(code?: number, reason?: string): void;

  // Event handlers
  onopen: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
}

// Shared with the SSE adapter
export type { ConnectionState, ConnectionStateChangeEvent };

/**
 * WebSocket adapter configuration options
 */
export interface WebSocketAdapterOptions {
  /**
   * Enable message queue for offline support
   * @default true
   */
  enableQueue?: boolean;

  /**
   * Maximum number of messages to queue while disconnected
   * @default 100
   */
  queueSize?: number;

  /**
   * Enable automatic reconnection on disconnect
   * @default false
   */
  autoReconnect?: boolean;

  /**
   * Reconnection delay in milliseconds
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Maximum number of reconnection attempts
   * @default 5
   */
  maxReconnectAttempts?: number;

  /**
   * WebSocket protocols to use
   */
  protocols?: string | string[];

  /**
   * Custom WebSocket constructor (for testing or custom implementations)
   */
  WebSocketConstructor?: new (url: string, protocols?: string | string[]) => IWebSocket;
}

/**
 * Request-response pattern message structure
 */
export interface RequestMessage {
  id: string;
  method: string;
  params?: any;
  timestamp: number;
}

/**
 * Response message structure
 */
export interface ResponseMessage {
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  timestamp: number;
}

/**
 * Pending request tracking
 */
export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeoutId: ReturnType<typeof setTimeout> | number;
  timestamp: number;
}

/**
 * Request options for request-response pattern
 */
export interface RequestOptions {
  /**
   * Timeout in milliseconds
   * @default 5000
   */
  timeout?: number;

  /**
   * Custom request ID (auto-generated if not provided)
   */
  id?: string;
}

/**
 * Message queue entry
 */
export interface QueuedMessage {
  event: string;
  data: any;
  timestamp: number;
}

/**
 * Events published by the WebSocket adapter, with their payloads
 * Server events are published as `<serverEventPrefix>.<name>` (e.g. `server.user.login`) with the
 * message's `data`; their names depend on the server, so they aren't listed here.
 */
export interface WebSocketEvents {
  // Connection lifecycle
  'ws.connection.state': ConnectionStateChangeEvent;
  'ws.error': { error: Error; event?: unknown };
  'ws.reconnect.failed': { attempts: number };

  // Outgoing messages (published by the app; other ws.send.* names are sent too)
  'ws.send': any;
  'ws.send.queued': any;
  'ws.queue.overflow': { maxSize: number; droppedMessage: any };

  // Request-response (`type: 'request'` is added when a WebSocketHandler is attached)
  'ws.send.request': RequestMessage & { type?: 'request' };
  'ws.response': Pick<ResponseMessage, 'id' | 'result' | 'timestamp'>;
  'ws.response.error': Pick<ResponseMessage, 'id' | 'error' | 'timestamp'>;

  // Incoming messages that aren't responses or server events, and ones that couldn't be parsed
  'ws.message': IncomingMessage;
  'ws.parse.error': { error: unknown; rawData: string };
}

/**
 * Error types for WebSocket operations
 */
export class WebSocketError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'WebSocketError';
  }
}

export class ConnectionError extends WebSocketError {
  constructor(message: string, originalError?: Error) {
    super(message, 'CONNECTION_ERROR', originalError);
    this.name = 'ConnectionError';
  }
}

export class RequestTimeoutError extends WebSocketError {
  constructor(
    public requestId: string,
    public method: string,
    public timeout: number
  ) {
    super(
      `Request ${method} (id: ${requestId}) timed out after ${timeout}ms`,
      'REQUEST_TIMEOUT'
    );
    this.name = 'RequestTimeoutError';
  }
}

export class QueueOverflowError extends WebSocketError {
  constructor(public maxSize: number, public attempted: number) {
    super(
      `Message queue overflow: attempted to queue ${attempted} messages, max is ${maxSize}`,
      'QUEUE_OVERFLOW'
    );
    this.name = 'QueueOverflowError';
  }
}

/**
 * WebSocketHandler options for automatic message handling
 */
export interface WebSocketHandlerOptions {
  /**
   * Enable message queue for offline support
   * @default true
   */
  enableQueue?: boolean;

  /**
   * Maximum number of messages to queue while disconnected
   * @default 100
   */
  queueSize?: number;

  /**
   * Automatically flush queue when connection is established
   * @default true
   */
  autoFlush?: boolean;

  /**
   * Enable request-response pattern support
   * @default true
   */
  enableRequestResponse?: boolean;

  /**
   * Prefix for server-sent events (e.g., 'server' for 'server.user.login')
   * @default 'server'
   */
  serverEventPrefix?: string;

  /**
   * Enable automatic reconnection when the connection closes unexpectedly (not through disconnect())
   * The state goes to 'reconnecting' and a new socket to the same URL is created after reconnectDelay;
   * messages sent meanwhile are queued and flushed once it opens. Needs a URL: either the handler was
   * created with one, or the given socket exposes `url`. Otherwise the state goes to 'disconnected'.
   * @default false
   */
  reconnect?: boolean;

  /**
   * Delay in milliseconds before each reconnection attempt
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Maximum number of consecutive failed reconnection attempts (the count resets when a socket opens)
   * When they are used up, the state goes to 'disconnected' and 'ws.reconnect.failed' is published
   * with `{ attempts }`
   * @default 5
   */
  maxReconnectAttempts?: number;

  /**
   * WebSocket constructor used to create sockets from a URL (for testing or custom implementations)
   * @default the global WebSocket
   */
  WebSocketConstructor?: new (url: string) => IWebSocket;

  /**
   * Custom error handler for WebSocket errors
   */
  onError?: (error: Error) => void;

  /**
   * Custom message parser for incoming messages
   * If not provided, uses default JSON.parse
   */
  messageParser?: (data: string) => any;

  /**
   * Custom message formatter for outgoing messages
   * If not provided, uses default JSON.stringify
   */
  messageFormatter?: (data: any) => string;
}

/**
 * Incoming message types
 */
export interface IncomingMessage {
  type?: string;
  event?: string;
  data?: any;
  id?: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  timestamp?: number;
}
