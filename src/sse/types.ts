import type { SseParsedEvent } from './SseParser.js';

/**
 * What a transport needs to open one connection
 */
export interface SseConnectRequest {
  url: string;
  /** Sent so the server can resume: as the Last-Event-ID header (fetch) or a query parameter (EventSource) */
  lastEventId?: string;
}

/**
 * Receives what happens on one connection
 */
export interface SseTransportListener {
  /** The server accepted the stream */
  open(): void;
  /**
   * An event arrived. May return a promise: transports that can pause reading (fetch) wait for it
   * before reading more, which slows the server down when subscribers can't keep up.
   */
  event(event: SseParsedEvent): void | Promise<void>;
  /** The server sent a `retry:` field */
  retry(milliseconds: number): void;
  /** Bytes arrived, comments included (for heartbeat timeouts) */
  activity(): void;
  /** The transport is reconnecting by itself (the native EventSource does this) */
  reconnecting?(): void;
}

/**
 * Why a connection ended
 */
export type SseCloseInfo =
  /** The server closed the stream */
  | { reason: 'ended' }
  /** HTTP 204: the server asks the client not to reconnect */
  | { reason: 'no-content' }
  /** Any status other than 200 or 204; `retryAfter` (ms) comes from a Retry-After header */
  | { reason: 'http-error'; status: number; retryAfter?: number }
  /** A 200 response that isn't `text/event-stream` */
  | { reason: 'bad-content-type'; contentType: string | null }
  /** The request or the stream failed */
  | { reason: 'network-error'; error: Error }
  /** The native EventSource gave up (it doesn't say why) */
  | { reason: 'failed' }
  /** No bytes arrived within `heartbeatTimeout` (reported by SseHandler, not by transports) */
  | { reason: 'heartbeat-timeout' }
  /** abort() was called */
  | { reason: 'aborted' };

/**
 * Opens connections to an SSE endpoint. A transport never reconnects by itself (except the native
 * EventSource's own retries, reported through `reconnecting`); SseHandler decides what happens next.
 */
export interface SseTransport {
  /** Open one connection; resolves when it ends */
  connect(request: SseConnectRequest, listener: SseTransportListener): Promise<SseCloseInfo>;
  /** End the current connection; its connect() resolves with `{ reason: 'aborted' }` */
  abort(): void;
}

/** Request headers, or a function called before every connection attempt (e.g. to refresh a token) */
export type SseHeaders = Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);

/** Request body, or a function called before every connection attempt */
export type SseBody = BodyInit | (() => BodyInit | Promise<BodyInit>);
