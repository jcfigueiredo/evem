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

/** The longest delay setTimeout supports (2^31 - 1 ms, about 24.8 days) */
const MAX_TIMEOUT = 2_147_483_647;

const FETCH_ONLY_OPTIONS = ['headers', 'method', 'body', 'fetch', 'heartbeatTimeout'] as const;
const EVENTSOURCE_ONLY_OPTIONS = ['EventSourceConstructor', 'eventTypes', 'lastEventIdParam'] as const;
const BUILT_IN_TRANSPORT_OPTIONS = ['headers', 'method', 'body', 'fetch', 'withCredentials', ...EVENTSOURCE_ONLY_OPTIONS] as const;

/**
 * Build the transport. Options the chosen transport can't honour, and configurations that could
 * never connect, throw here instead of being ignored or retried forever.
 */
function createTransport(url: string, options: SseHandlerOptions): SseTransport {
  const { transport = 'fetch' } = options;
  const given = (names: readonly (keyof SseHandlerOptions)[]) =>
    names.filter(name => options[name] !== undefined && !(name === 'heartbeatTimeout' && options[name] === 0));

  if (typeof transport === 'object') {
    const ignored = given(BUILT_IN_TRANSPORT_OPTIONS);
    if (ignored.length > 0) {
      throw new TypeError(`${ignored.join(', ')} would be ignored with a custom transport; configure the transport instead.`);
    }
    return transport;
  }

  if (transport === 'eventsource') {
    const unsupported = given(FETCH_ONLY_OPTIONS);
    if (unsupported.length > 0) {
      throw new TypeError(`The EventSource transport doesn't support: ${unsupported.join(', ')}. Use the fetch transport.`);
    }
    if (!options.EventSourceConstructor && typeof (globalThis as { EventSource?: unknown }).EventSource !== 'function') {
      throw new TypeError('There is no global EventSource (e.g. in Node.js): pass EventSourceConstructor or use the fetch transport.');
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
  if (!options.fetch && typeof globalThis.fetch !== 'function') {
    throw new TypeError('There is no global fetch: pass the fetch option.');
  }
  // Outside browsers there's no page to resolve a relative URL against
  const base = (globalThis as { location?: { href?: string } }).location?.href;
  try {
    new URL(url, base);
  } catch {
    throw new TypeError(`SseHandler needs an absolute URL outside browsers, got "${url}".`);
  }
  return new FetchSseTransport({
    fetch: options.fetch,
    headers: options.headers,
    method: options.method,
    body: options.body,
    withCredentials: options.withCredentials,
  });
}

/**
 * The default reconnection policy: reconnect when the stream ends, on network errors, heartbeat
 * timeouts, a failed EventSource and HTTP 408, 429 and 5xx; stop on HTTP 204, other statuses and a
 * wrong content type. Exported so a custom shouldReconnect can override one case and defer the rest.
 */
export function defaultShouldReconnect(info: SseCloseInfo): boolean {
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
    this.transport = createTransport(url, options);
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
    this.startConnection(++this.generation);
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

  private startConnection(generation: number): void {
    this.openConnection(generation).catch(error => {
      console.error('SseHandler connection loop failed:', error);
    });
  }

  private async openConnection(generation: number): Promise<void> {
    await this.connectionManager.transitionTo('connecting');
    if (generation !== this.generation) {
      return;
    }

    // Started before the request, so a server that never answers is timed out too
    this.resetHeartbeat(generation);
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
      lastEventId: id => {
        if (isCurrent()) this.lastEventId = id || undefined;
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
      this.callOnError(error);
    }

    if (!this.reconnect || !this.shouldReconnect({ ...end, attempts: this.attempts })) {
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
        this.startConnection(generation);
      }
    }, this.delayFor(end));
    await this.connectionManager.transitionTo('reconnecting');
  }

  /** shouldReconnect, falling back to the default policy if it throws */
  private shouldReconnect(info: SseReconnectInfo): boolean {
    if (!this.options.shouldReconnect) {
      return defaultShouldReconnect(info);
    }
    try {
      return this.options.shouldReconnect(info);
    } catch (error) {
      console.error('SseHandler shouldReconnect threw; using the default policy:', error);
      return defaultShouldReconnect(info);
    }
  }

  /** onError, which must not break the connection loop if it throws */
  private callOnError(error: Error): void {
    try {
      this.options.onError?.(error);
    } catch (thrown) {
      console.error('SseHandler onError threw:', thrown);
    }
  }

  private async stop(): Promise<void> {
    this.active = false;
    await this.connectionManager.transitionTo('disconnected');
  }

  /**
   * Delay before the next attempt: the server's retry (or reconnectDelay), doubled per failed attempt
   * up to maxReconnectDelay, then ±20% jitter (also at the cap, so clients that lost the connection
   * together don't retry together), and at least as long as a Retry-After header asked
   */
  private delayFor(end: SseCloseInfo): number {
    const base = this.serverRetry ?? this.reconnectDelay;
    let delay = base;
    if (this.backoff) {
      const exponential = Math.min(this.maxReconnectDelay, base * 2 ** (this.attempts - 1));
      delay = exponential * (0.8 + Math.random() * 0.4);
    }
    if (end.reason === 'http-error' && end.retryAfter !== undefined) {
      delay = Math.max(delay, end.retryAfter);
    }
    // setTimeout runs longer delays at once
    return Math.min(MAX_TIMEOUT, Math.round(delay));
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
    }, Math.min(MAX_TIMEOUT, this.heartbeatTimeout));
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
      this.callOnError(error);
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
