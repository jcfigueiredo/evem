import { SseParser, type SseParsedEvent } from './SseParser.js';
import type {
  SseBody,
  SseCloseInfo,
  SseConnectRequest,
  SseFetch,
  SseHeaders,
  SseTransport,
  SseTransportListener
} from './types.js';

export interface FetchSseTransportOptions {
  /** fetch implementation (default: the global fetch) */
  fetch?: SseFetch;
  /** Extra request headers, or a function called before every connection attempt */
  headers?: SseHeaders;
  /** HTTP method (default 'GET'); some streaming APIs open the stream with a POST */
  method?: string;
  /** Request body, or a function called before every connection attempt */
  body?: SseBody;
  /** Send cookies cross-origin (`credentials: 'include'`) */
  withCredentials?: boolean;
}

/**
 * Parse a Retry-After header (seconds or an HTTP date) into milliseconds
 */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  // Stryker disable next-line MethodExpression: a Response's headers come without surrounding spaces already
  if (/^\d+$/.test(value.trim())) {
    // Stryker disable next-line MethodExpression: Number() ignores the spaces too
    return Number(value.trim()) * 1000;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/**
 * Check the response before reading it as a stream; returns why it can't be used, if it can't
 */
function checkResponse(response: Response): SseCloseInfo | undefined {
  if (response.status === 204) {
    return { reason: 'no-content' };
  }
  if (response.status !== 200) {
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
    return retryAfter === undefined
      ? { reason: 'http-error', status: response.status }
      : { reason: 'http-error', status: response.status, retryAfter };
  }
  const contentType = response.headers.get('content-type');
  // Stryker disable next-line MethodExpression: a Response's headers come without surrounding spaces already
  if (!contentType || !/^text\/event-stream(\s*;|\s*$)/i.test(contentType.trim())) {
    return { reason: 'bad-content-type', contentType };
  }
  return undefined;
}

/**
 * SSE transport built on fetch: supports headers, POST and every event type, and works in
 * browsers and Node.js 22+. It reads the body as a stream and stops reading while the listener
 * is busy with an event (backpressure).
 */
export class FetchSseTransport implements SseTransport {
  private controller?: AbortController;

  constructor(private readonly options: FetchSseTransportOptions = {}) {}

  async connect(request: SseConnectRequest, listener: SseTransportListener): Promise<SseCloseInfo> {
    const controller = new AbortController();
    this.controller = controller;

    try {
      const response = await this.send(request, controller.signal);
      const failure = checkResponse(response);
      if (failure) {
        await response.body?.cancel().catch(() => undefined);
        return failure;
      }

      listener.open();
      if (response.body) {
        await this.read(response.body, request, listener);
      }
      return { reason: 'ended' };
    } catch (error) {
      if (controller.signal.aborted) {
        return { reason: 'aborted' };
      }
      return { reason: 'network-error', error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  abort(): void {
    this.controller?.abort();
  }

  private async send(request: SseConnectRequest, signal: AbortSignal): Promise<Response> {
    const { headers: headersOption, body: bodyOption, method = 'GET', withCredentials = false } = this.options;

    const headers = new Headers({ Accept: 'text/event-stream' });
    const extraHeaders = typeof headersOption === 'function' ? await headersOption() : headersOption;
    for (const [name, value] of Object.entries(extraHeaders ?? {})) {
      headers.set(name, value);
    }
    if (request.lastEventId) {
      headers.set('Last-Event-ID', request.lastEventId);
    }
    const body = typeof bodyOption === 'function' ? await bodyOption() : bodyOption;

    // Called as a plain function: browsers throw "Illegal invocation" when fetch is called as a
    // method of another object
    const fetchImplementation: SseFetch = this.options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    return fetchImplementation(request.url, {
      method,
      headers,
      body,
      credentials: withCredentials ? 'include' : 'same-origin',
      signal
    });
  }

  private async read(
    body: ReadableStream<Uint8Array>,
    request: SseConnectRequest,
    listener: SseTransportListener
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    // Events and id-only changes, delivered in stream order once each chunk is parsed
    const pending: Array<{ event: SseParsedEvent } | { lastEventId: string }> = [];
    const parser = new SseParser(
      {
        onEvent: event => pending.push({ event }),
        onLastEventId: lastEventId => pending.push({ lastEventId }),
        onRetry: milliseconds => listener.retry(milliseconds)
      },
      request.lastEventId ?? ''
    );
    const deliver = async () => {
      for (let item = pending.shift(); item; item = pending.shift()) {
        if ('event' in item) {
          await listener.event(item.event);
        } else {
          listener.lastEventId?.(item.lastEventId);
        }
      }
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      listener.activity();
      parser.feed(decoder.decode(value, { stream: true }));
      await deliver();
    }
    // Stryker disable next-line CallExpression: what's left in the decoder can only be part of an event the stream never finished
    parser.feed(decoder.decode());
    // Stryker disable next-line CallExpression: the parser is dropped with the connection, unfinished event and all
    parser.end();
    await deliver();
  }
}
