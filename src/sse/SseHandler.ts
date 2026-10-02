import type { EvEm } from '../eventEmitter.js';
import { ConnectionManager } from '../shared/ConnectionManager.js';
import { routeServerMessage, toServerEventName } from '../shared/routing.js';
import type { ConnectionState } from '../shared/types.js';
import { EventSourceSseTransport, type EventSourceConstructorLike } from './EventSourceSseTransport.js';
import { FetchSseTransport } from './FetchSseTransport.js';
import type { SseParsedEvent } from './SseParser.js';
import type { SseBody, SseCloseInfo, SseHeaders, SseTransport, SseTransportListener } from './types.js';

/**
 * What shouldReconnect receives: why the connection ended, and how many reconnection attempts
 * have been made since the last successful connection
 */
export type SseReconnectInfo = SseCloseInfo & { attempts: number };

/**
 * SseHandler options
 */
export interface SseHandlerOptions {
  /**
   * How to connect: 'fetch' (headers, POST, every event type, Node.js), 'eventsource' (the native
   * EventSource), or your own SseTransport
   * @default 'fetch'
   */
  transport?: 'fetch' | 'eventsource' | SseTransport;
  /** Request headers, or a function called before every connection attempt (fetch only) */
  headers?: SseHeaders;
  /** HTTP method (fetch only) @default 'GET' */
  method?: string;
  /** Request body, or a function called before every connection attempt (fetch only) */
  body?: SseBody;
  /** Send cookies cross-origin @default false */
  withCredentials?: boolean;
  /** fetch implementation (fetch only) @default the global fetch */
  fetch?: typeof fetch;
  /** EventSource implementation, e.g. a polyfill in Node.js (EventSource only) */
  EventSourceConstructor?: EventSourceConstructorLike;
  /** Named event types to listen for; unnamed events always arrive (EventSource only) */
  eventTypes?: string[];
  /** Query parameter carrying the last event id on reconnects (EventSource only) @default 'lastEventId' */
  lastEventIdParam?: string;
  /** Event id to resume from, e.g. one saved with getLastEventId() before a page reload */
  lastEventId?: string;
  /** Reconnect when the connection ends (see shouldReconnect for when) @default true */
  reconnect?: boolean;
  /** Base reconnection delay in ms; the server's `retry:` field replaces it @default 3000 */
  reconnectDelay?: number;
  /** Longest delay between attempts when backing off, in ms @default 30000 */
  maxReconnectDelay?: number;
  /** Double the delay after each failed attempt, with ±20% jitter; false keeps it fixed @default true */
  backoff?: boolean;
  /** Reconnection attempts without a successful connection before giving up @default Infinity */
  maxReconnectAttempts?: number;
  /**
   * Decide whether to reconnect. By default: yes when the stream ends, on network errors,
   * heartbeat timeouts and HTTP 408, 429 and 5xx; no on HTTP 204, other 4xx and a wrong content type.
   */
  shouldReconnect?: (info: SseReconnectInfo) => boolean;
  /** Reconnect if no bytes (comments included) arrive for this many ms; 0 turns it off (fetch only) @default 0 */
  heartbeatTimeout?: number;
  /** Prefix for server events ('order.updated' → 'server.order.updated'); '' uses names as-is @default 'server' */
  serverEventPrefix?: string;
  /** How to read event data: 'json', 'text', or a function @default 'json' */
  parseData?: 'json' | 'text' | ((data: string, eventType: string) => unknown);
  /** Publish unnamed `{ event, data }` messages as `<prefix>.<event>` @default true */
  unwrapEnvelope?: boolean;
  /** Also publish every message as `sse.event` with its metadata @default false */
  rawEvents?: boolean;
  /** Wait for each event's subscribers before handling the next event @default false */
  sequential?: boolean;
  /** Connect in the constructor; otherwise call connect() @default true */
  autoConnect?: boolean;
  /** Called with errors that are also published as `sse.error` / `sse.parse.error` */
  onError?: (error: Error) => void;
}

const FETCH_ONLY_OPTIONS = ['headers', 'method', 'body', 'fetch', 'heartbeatTimeout'] as const;
const EVENTSOURCE_ONLY_OPTIONS = ['EventSourceConstructor', 'eventTypes', 'lastEventIdParam'] as const;

/**
 * Build the transport, rejecting options the chosen transport can't honour (instead of ignoring them)
 */
function createTransport(options: SseHandlerOptions): SseTransport {
  const { transport = 'fetch' } = options;
  const given = (names: readonly (keyof SseHandlerOptions)[]) =>
    names.filter(name => options[name] !== undefined && !(name === 'heartbeatTimeout' && options[name] === 0));

  if (transport === 'eventsource') {
    const unsupported = given(FETCH_ONLY_OPTIONS);
    if (unsupported.length > 0) {
      throw new TypeError(`The EventSource transport doesn't support: ${unsupported.join(', ')}. Use the fetch transport.`);
    }
    return new EventSourceSseTransport({
      EventSourceConstructor: options.EventSourceConstructor,
      withCredentials: options.withCredentials,
      eventTypes: options.eventTypes,
      lastEventIdParam: options.lastEventIdParam,
    });
  }

  const unsupported = given(EVENTSOURCE_ONLY_OPTIONS);
  if (unsupported.length > 0) {
    throw new TypeError(`${unsupported.join(', ')} only apply to the EventSource transport.`);
  }
  if (transport === 'fetch') {
    return new FetchSseTransport({
      fetch: options.fetch,
      headers: options.headers,
      method: options.method,
      body: options.body,
      withCredentials: options.withCredentials,
    });
  }
  return transport;
}

function defaultShouldReconnect(info: SseCloseInfo): boolean {
  switch (info.reason) {
    case 'ended':
    case 'network-error':
    case 'failed':
    case 'heartbeat-timeout':
      return true;
    case 'http-error':
      return info.status === 408 || info.status === 429 || info.status >= 500;
    default:
      return false;
  }
}

/**
 * The error to report for a connection that ended, if it ended badly
 */
function errorFor(info: SseCloseInfo, heartbeatTimeout: number): Error | undefined {
  switch (info.reason) {
    case 'http-error':
      return new Error(`SSE request failed with HTTP ${info.status}`);
    case 'bad-content-type':
      return new Error(`Expected a text/event-stream response, got ${info.contentType ?? 'no content type'}`);
    case 'network-error':
      return info.error;
    case 'failed':
      return new Error('EventSource connection failed');
    case 'heartbeat-timeout':
      return new Error(`No data received for ${heartbeatTimeout}ms`);
    default:
      return undefined;
  }
}

/**
 * SseHandler - connects to a Server-Sent Events endpoint and publishes what the server sends as
 * EvEm events, with the same routing as WebSocketHandler:
 * - a named event (`event: order.updated`) → `server.order.updated`
 * - an unnamed `{ event, data }` envelope → `server.<event>`; other unnamed messages → `sse.message`
 * - connection states → `sse.connection.state`; errors → `sse.error` / `sse.parse.error`
 *
 * It reconnects automatically (resuming with Last-Event-ID), honours the server's `retry:`,
 * backs off on repeated failures and can detect dead connections with a heartbeat timeout.
 *
 * Usage:
 * ```typescript
 * const sse = new SseHandler('/api/events', evem, { headers: () => ({ Authorization: `Bearer ${token()}` }) });
 * evem.subscribe('server.order.updated', order => render(order));
 * ```
 */
export class SseHandler {
  private readonly transport: SseTransport;
  private readonly connectionManager: ConnectionManager;
  private readonly reconnect: boolean;
  private readonly reconnectDelay: number;
  private readonly maxReconnectDelay: number;
  private readonly backoff: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly heartbeatTimeout: number;
  private readonly serverEventPrefix: string;

  private lastEventId?: string;
  /** Reconnection delay sent by the server (`retry:`), which replaces reconnectDelay */
  private serverRetry?: number;
  /** Reconnection attempts since the last successful connection */
  private attempts = 0;
  /** Whether connect() has been called and disconnect() hasn't (connecting, connected or waiting to retry) */
  private active = false;
  /** Incremented by connect() and disconnect(), so callbacks from an older connection loop are ignored */
  private generation = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setTimeout>;
  private heartbeatExpired = false;
  /** Publishes of the previous events, awaited in order with `sequential` */
  private publishChain: Promise<void> = Promise.resolve();

  /**
   * @param url - URL of the SSE endpoint
   * @param evem - EvEm instance to publish to
   * @param options - Configuration options
   * @throws {TypeError} If an option doesn't apply to the chosen transport
   */
  constructor(
    private readonly url: string,
    private readonly evem: EvEm,
    private readonly options: SseHandlerOptions = {}
  ) {
    this.transport = createTransport(options);
    this.connectionManager = new ConnectionManager(evem, { stateEvent: 'sse.connection.state' });
    this.reconnect = options.reconnect ?? true;
    this.reconnectDelay = options.reconnectDelay ?? 3000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;
    this.backoff = options.backoff ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity;
    this.heartbeatTimeout = options.heartbeatTimeout ?? 0;
    this.serverEventPrefix = options.serverEventPrefix ?? 'server';
    this.lastEventId = options.lastEventId || undefined;

    if (options.autoConnect ?? true) {
      this.connect();
    }
  }

  /**
   * Start connecting. Does nothing if already connecting, connected or waiting to reconnect;
   * after disconnect(), connects again.
   */
  connect(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.attempts = 0;
    void this.openConnection(++this.generation);
  }

  /**
   * Close the connection and cancel any pending reconnect. The state moves through
   * `disconnecting` to `disconnected`; the returned promise resolves once those changes are handled.
   */
  async disconnect(): Promise<void> {
    this.active = false;
    this.generation++;
    this.clearTimers();
    this.transport.abort();

    if (!this.connectionManager.isDisconnected()) {
      await this.connectionManager.transitionTo('disconnecting');
      await this.connectionManager.transitionTo('disconnected');
    }
  }

  /** Whether the stream is open */
  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  /** The current connection state */
  getConnectionState(): ConnectionState {
    return this.connectionManager.getState();
  }

  /** The last event id received (sent as Last-Event-ID when reconnecting), if any */
  getLastEventId(): string | undefined {
    return this.lastEventId;
  }

  private async openConnection(generation: number): Promise<void> {
    await this.connectionManager.transitionTo('connecting');
    if (generation !== this.generation) {
      return;
    }

    const info = await this.transport.connect(
      { url: this.url, lastEventId: this.lastEventId },
      this.createListener(generation)
    );
    if (generation !== this.generation) {
      return;
    }
    clearTimeout(this.heartbeatTimer);
    await this.handleEnd(info, generation);
  }

  private createListener(generation: number): SseTransportListener {
    const isCurrent = () => generation === this.generation;
    return {
      open: () => {
        if (!isCurrent()) return;
        this.attempts = 0;
        this.resetHeartbeat(generation);
        void this.connectionManager.transitionTo('connected');
      },
      event: event => (isCurrent() ? this.handleEvent(event) : undefined),
      retry: milliseconds => {
        if (isCurrent()) this.serverRetry = milliseconds;
      },
      activity: () => {
        if (isCurrent()) this.resetHeartbeat(generation);
      },
      reconnecting: () => {
        if (!isCurrent()) return;
        clearTimeout(this.heartbeatTimer);
        void this.connectionManager.transitionTo('reconnecting');
      },
    };
  }

  /**
   * A connection ended: report it, then reconnect or stop
   */
  private async handleEnd(info: SseCloseInfo, generation: number): Promise<void> {
    let end = info;
    if (end.reason === 'aborted') {
      // disconnect() aborts too, but it also changes the generation, so it never gets here. What's left
      // is the heartbeat timeout, or a custom transport ending on its own, treated as the stream ending
      end = this.heartbeatExpired ? { reason: 'heartbeat-timeout' } : { reason: 'ended' };
      this.heartbeatExpired = false;
    }

    const error = errorFor(end, this.heartbeatTimeout);
    if (error) {
      const details = end.reason === 'http-error'
        ? { status: end.status }
        : end.reason === 'bad-content-type' ? { contentType: end.contentType } : {};
      void this.publishSafely('sse.error', { error, reason: end.reason, ...details });
      this.options.onError?.(error);
    }

    const shouldReconnect = this.options.shouldReconnect ?? defaultShouldReconnect;
    if (!this.reconnect || !shouldReconnect({ ...end, attempts: this.attempts })) {
      await this.stop();
      return;
    }

    if (this.attempts >= this.maxReconnectAttempts) {
      await this.stop();
      await this.publishSafely('sse.reconnect.failed', { attempts: this.attempts });
      return;
    }

    this.attempts++;
    // Scheduled before the state change is announced, so a disconnect() from a state handler cancels it
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (generation === this.generation) {
        void this.openConnection(generation);
      }
    }, this.delayFor(end));
    await this.connectionManager.transitionTo('reconnecting');
  }

  private async stop(): Promise<void> {
    this.active = false;
    await this.connectionManager.transitionTo('disconnected');
  }

  /**
   * Delay before the next attempt: the server's retry (or reconnectDelay), doubled per failed attempt
   * up to maxReconnectDelay with ±20% jitter, and at least as long as a Retry-After header asked
   */
  private delayFor(end: SseCloseInfo): number {
    const base = this.serverRetry ?? this.reconnectDelay;
    let delay = base;
    if (this.backoff) {
      const exponential = base * 2 ** (this.attempts - 1);
      delay = Math.min(this.maxReconnectDelay, exponential * (0.8 + Math.random() * 0.4));
    }
    if (end.reason === 'http-error' && end.retryAfter !== undefined) {
      delay = Math.max(delay, end.retryAfter);
    }
    return Math.round(delay);
  }

  private resetHeartbeat(generation: number): void {
    if (!this.heartbeatTimeout) {
      return;
    }
    clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.heartbeatExpired = true;
      this.transport.abort();
    }, this.heartbeatTimeout);
  }

  private clearTimers(): void {
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.heartbeatTimer);
    this.reconnectTimer = undefined;
    this.heartbeatTimer = undefined;
    this.heartbeatExpired = false;
  }

  /**
   * Parse and route one event. With `sequential`, returns a promise that settles once its
   * subscribers are done (the fetch transport waits for it before reading on).
   */
  private handleEvent(event: SseParsedEvent): void | Promise<void> {
    this.lastEventId = event.lastEventId || undefined;
    const publishes: Array<[string, unknown]> = [];

    try {
      const data = this.parse(event);
      if (this.options.rawEvents) {
        publishes.push(['sse.event', { type: event.type, data, rawData: event.data, lastEventId: event.lastEventId }]);
      }
      const routed = event.type !== 'message'
        ? { event: toServerEventName(event.type, this.serverEventPrefix), data }
        : this.options.unwrapEnvelope ?? true
          ? routeServerMessage(data, { prefix: this.serverEventPrefix, channel: 'sse', handleResponses: false })
          : { event: 'sse.message', data };
      publishes.push([routed.event, routed.data]);
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      publishes.push(['sse.parse.error', { error, rawData: event.data, eventType: event.type, lastEventId: event.lastEventId }]);
      this.options.onError?.(error);
    }

    if (this.options.sequential) {
      this.publishChain = this.publishChain.then(async () => {
        for (const [name, payload] of publishes) {
          await this.publishSafely(name, payload);
        }
      });
      return this.publishChain;
    }
    for (const [name, payload] of publishes) {
      void this.publishSafely(name, payload);
    }
  }

  private parse(event: SseParsedEvent): unknown {
    const { parseData = 'json' } = this.options;
    if (parseData === 'json') {
      return JSON.parse(event.data);
    }
    if (parseData === 'text') {
      return event.data;
    }
    return parseData(event.data, event.type);
  }

  /**
   * Publish without letting a rejection (e.g. a subscriber with schemaErrorPolicy THROW) go unhandled
   */
  private publishSafely(event: string, data: unknown): Promise<void> {
    return this.evem.publish(event, data).then(
      () => undefined,
      error => console.error(`Error publishing "${event}" from the SSE stream:`, error)
    );
  }
}
