import type { SseCloseInfo, SseConnectRequest, SseTransport, SseTransportListener } from './types.js';

/**
 * The parts of the browser's EventSource that the transport uses (polyfills work too)
 */
export interface EventSourceLike {
  readonly readyState: number;
  onopen: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
  addEventListener(type: string, listener: (event: any) => void): void;
  close(): void;
}

export type EventSourceConstructorLike = new (url: string, init?: { withCredentials?: boolean }) => EventSourceLike;

export interface EventSourceSseTransportOptions {
  /** EventSource implementation (default: the global EventSource) */
  EventSourceConstructor?: EventSourceConstructorLike;
  /** Send cookies cross-origin */
  withCredentials?: boolean;
  /**
   * Named event types to listen for. EventSource can't listen to every type: unnamed (`message`)
   * events always arrive, named ones only if listed here
   */
  eventTypes?: string[];
  /**
   * Query parameter carrying the last event id when a new EventSource is created
   * (EventSource can't set the Last-Event-ID header itself)
   * @default 'lastEventId'
   */
  lastEventIdParam?: string;
}

const CLOSED = 2;

/**
 * Add a query parameter to a URL that may be relative and may have a fragment
 */
function withQueryParameter(url: string, name: string, value: string): string {
  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${encodeURIComponent(name)}=${encodeURIComponent(value)}${hash}`;
}

/**
 * SSE transport using the native EventSource. The browser reconnects by itself (reported through
 * `reconnecting`); when it gives up, connect() resolves with `{ reason: 'failed' }`.
 * It can't send headers or POST, and only receives the named event types listed in `eventTypes`.
 */
export class EventSourceSseTransport implements SseTransport {
  private finish?: (info: SseCloseInfo) => void;

  constructor(private readonly options: EventSourceSseTransportOptions = {}) {}

  connect(request: SseConnectRequest, listener: SseTransportListener): Promise<SseCloseInfo> {
    return new Promise(resolve => {
      const EventSourceImplementation =
        this.options.EventSourceConstructor ?? (globalThis as { EventSource?: EventSourceConstructorLike }).EventSource;
      if (!EventSourceImplementation) {
        resolve({
          reason: 'network-error',
          error: new Error('No EventSource implementation: pass EventSourceConstructor or use the fetch transport')
        });
        return;
      }

      const url = request.lastEventId
        ? withQueryParameter(request.url, this.options.lastEventIdParam ?? 'lastEventId', request.lastEventId)
        : request.url;
      let source: EventSourceLike;
      try {
        source = new EventSourceImplementation(url, { withCredentials: this.options.withCredentials ?? false });
      } catch (error) {
        resolve({ reason: 'network-error', error: error instanceof Error ? error : new Error(String(error)) });
        return;
      }

      const finish = (info: SseCloseInfo) => {
        source.onopen = null;
        source.onerror = null;
        source.onmessage = null;
        source.close();
        if (this.finish === finish) {
          this.finish = undefined;
        }
        resolve(info);
      };
      this.finish = finish;

      const onMessage = (event: MessageEvent) => {
        listener.activity();
        // EventSource can't pause, so a returned promise isn't awaited here
        void listener.event({ type: event.type, data: String(event.data), lastEventId: event.lastEventId ?? '' });
      };
      source.onopen = () => listener.open();
      source.onmessage = onMessage;
      for (const type of new Set(this.options.eventTypes ?? [])) {
        if (type !== 'message') {
          source.addEventListener(type, onMessage);
        }
      }
      source.onerror = () => {
        if (source.readyState === CLOSED) {
          finish({ reason: 'failed' });
        } else {
          listener.reconnecting?.();
        }
      };
    });
  }

  abort(): void {
    this.finish?.({ reason: 'aborted' });
  }
}
