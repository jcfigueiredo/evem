/**
 * A fetch replacement for SSE tests: each call returns a response whose body the test controls.
 */
export interface FakeStream {
  push(text: string): void;
  close(): void;
  fail(error: Error): void;
}

export interface FakeFetchCall {
  url: string;
  init: RequestInit;
  stream: FakeStream;
}

export interface FakeResponseOptions {
  status?: number;
  contentType?: string | null;
  headers?: Record<string, string>;
}

export function createFakeFetch(responseFor: (call: number) => FakeResponseOptions = () => ({})) {
  const calls: FakeFetchCall[] = [];
  const encoder = new TextEncoder();

  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: c => { controller = c; } });
    const stream: FakeStream = {
      push: text => controller.enqueue(encoder.encode(text)),
      close: () => controller.close(),
      fail: error => controller.error(error),
    };
    init.signal?.addEventListener('abort', () => {
      try {
        controller.error(new DOMException('The operation was aborted.', 'AbortError'));
      } catch {
        // Already closed
      }
    });
    calls.push({ url: String(input), init, stream });

    const { status = 200, contentType = 'text/event-stream', headers = {} } = responseFor(calls.length);
    const responseHeaders = new Headers(headers);
    if (contentType !== null) responseHeaders.set('content-type', contentType);
    return new Response(status === 204 ? null : body, { status, headers: responseHeaders });
  };

  return { fetch, calls };
}

/** Let pending promise callbacks (stream reads, publishes) run */
export const flush = async (times = 5) => {
  for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 0));
};
