import type { SseFetch } from '@jcfigueiredo/evem/sse';
import { formatSseComment, formatSseMessage, SSE_HEADERS, type SseMessage } from '@jcfigueiredo/evem/sse/server';
import { chunkText, pageClock, WireLog, type FakeServer, type WireEntry } from './wire';

/** One open `text/event-stream` response, as a scenario's server writes to it */
export interface SseStream {
  /** The connection's number, from 1 */
  readonly number: number;
  /** The `Last-Event-ID` the client sent with this request, if any */
  readonly lastEventId: string | undefined;
  /** Write text to the stream as it is */
  write(text: string): void;
  /** Write one message, formatted with the library's `formatSseMessage` */
  send(message: SseMessage): void;
  /** End the stream, as a server that's done does */
  end(): void;
}

/** How the fake SSE server behaves; each scenario gives its own */
export interface FakeSseBehavior {
  /** Milliseconds a response, and then each chunk, takes to arrive (default 20) */
  latency?: number;
  /** Send a `: ping` comment this often while a stream is open, in ms (default: never) */
  heartbeat?: number;
  /** What the server does when a stream opens; it may return a function that stops it (a timer, say) */
  onOpen?: (stream: SseStream) => (() => void) | void;
}

const STATUS_TEXT: Record<number, string> = {
  204: 'No Content',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  408: 'Request Timeout',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable'
};

const encoder = new TextEncoder();

/** The path and query of a request's URL, relative or absolute */
function pathOf(url: string): string {
  const parsed = new URL(url, 'http://localhost');
  return parsed.pathname + parsed.search;
}

/** Wait `ms`, or reject as `fetch` does if the request is aborted first */
function wait(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, ms);
    if (signal?.aborted) aborted();
    else signal?.addEventListener('abort', aborted, { once: true });
  });
}

/**
 * An in-page SSE server for the playground: its `fetch` answers like a real server, with a `text/event-stream`
 * response whose body it writes with the library's `formatSseMessage` / `formatSseComment`, or with the status the
 * Server tab asked for. It sends text whole or split mid-character, sends heartbeats, ends or drops its streams,
 * refuses connections or goes silent, and logs the requests, every chunk and what happened to each connection.
 */
export class FakeSseServer implements FakeServer {
  /** A `fetch` that connects to this server (`SseHandler`'s `fetch` option) */
  readonly fetch: SseFetch = (url, init) => this.request(url, init);
  private readonly log: WireLog;
  private readonly streams = new Set<Stream>();
  private readonly latency: number;
  private connections = 0;
  private refusals = 0;
  private failure: { status: number; retryAfter?: number } | undefined;
  private closed = false;

  constructor(
    private readonly behavior: FakeSseBehavior = {},
    now: () => number = pageClock,
    onWire?: (entry: WireEntry) => void
  ) {
    this.log = new WireLog(now, onWire);
    this.latency = behavior.latency ?? 20;
  }

  get wire(): WireEntry[] {
    return this.log.entries;
  }

  get openConnections(): number {
    return this.streams.size;
  }

  /**
   * The Server tab's controls: `send <text>`, `split <text>` (in two chunks, mid-character if it can), `ping`,
   * `end`, `drop`, `refuse`, `silent`, and `restart <status> [<Retry-After seconds>]`
   */
  run(command: string, argument = ''): void {
    if (command === 'send') this.send(argument);
    else if (command === 'split') this.sendSplit(argument);
    else if (command === 'ping') this.ping();
    else if (command === 'end') this.end();
    else if (command === 'drop') this.drop();
    else if (command === 'refuse') this.refuseNext();
    else if (command === 'silent') this.silence();
    else if (command === 'restart') {
      const [status, retryAfter] = argument.split(/\s+/).filter(Boolean).map(Number);
      this.restart(status ?? 503, retryAfter);
    } else throw new Error(`The SSE server has no command ${command}`);
  }

  /** Write text to every open stream, as it is (the blank line that ends an event is up to the text) */
  send(text: string): void {
    if (!this.anyOpen('nothing sent')) return;
    for (const stream of this.streams) stream.write(text);
  }

  /** Write text in two chunks: inside its first character of more than one byte, else in the middle */
  sendSplit(text: string): void {
    if (!this.anyOpen('nothing sent')) return;
    const bytes = encoder.encode(text);
    const lead = bytes.findIndex(byte => byte >= 0xc0);
    const at = lead >= 0 ? lead + 1 : Math.floor(bytes.length / 2);
    for (const stream of this.streams) stream.writeChunks([bytes.subarray(0, at), bytes.subarray(at)]);
  }

  /** A `: ping` comment on every open stream: bytes, but no event */
  ping(): void {
    if (!this.anyOpen('no ping sent')) return;
    for (const stream of this.streams) stream.write(formatSseComment('ping'));
  }

  /** End every open stream, as a server that's done does */
  end(): void {
    if (!this.anyOpen('nothing to end')) return;
    for (const stream of [...this.streams]) stream.end();
  }

  /** Break every open stream, as a network failure does */
  drop(): void {
    if (!this.anyOpen('nothing to drop')) return;
    for (const stream of [...this.streams]) stream.drop();
  }

  /** Make the next request fail like a network error (call again to refuse more) */
  refuseNext(): void {
    this.refusals++;
    this.note(`will refuse the next ${this.refusals === 1 ? 'connection' : `${this.refusals} connections`}`);
  }

  /** Stop writing to the open streams but keep them open, as a stuck proxy does */
  silence(): void {
    if (!this.anyOpen('nothing to silence')) return;
    for (const stream of this.streams) stream.silence();
  }

  /** Answer the next request with `status` (and `Retry-After`, in seconds), and end the open streams */
  restart(status: number, retryAfter?: number): void {
    this.failure = { status, ...(retryAfter === undefined || Number.isNaN(retryAfter) ? {} : { retryAfter }) };
    this.note(`will answer the next request with ${this.statusLine(this.failure)}`);
    for (const stream of [...this.streams]) stream.end();
  }

  /** Stop for good, quietly: the scenario started over */
  close(): void {
    this.closed = true;
    this.log.close();
    for (const stream of [...this.streams]) stream.closeQuietly();
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    const shown = [...headers].filter(([name]) => name !== 'accept').map(([name, value]) => `${name}: ${value}`);
    this.log.add('client', [`${init.method ?? 'GET'} ${pathOf(url)}`, ...shown].join(' · '));
    await wait(this.latency, init.signal);
    if (this.closed) throw new TypeError('Failed to fetch');
    if (this.refusals > 0) {
      this.refusals--;
      this.note('refused a connection (network error)');
      throw new TypeError('Failed to fetch');
    }
    const number = ++this.connections;
    if (this.failure) {
      const failure = this.failure;
      this.failure = undefined;
      this.note(`connection ${number} answered ${this.statusLine(failure)}`);
      return new Response(failure.status === 204 ? null : (STATUS_TEXT[failure.status] ?? 'Error'), {
        status: failure.status,
        headers: failure.retryAfter === undefined ? {} : { 'Retry-After': String(failure.retryAfter) }
      });
    }
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: c => void (controller = c) });
    const stream = new Stream(this, number, headers.get('last-event-id') ?? undefined, controller, this.latency);
    this.streams.add(stream);
    init.signal?.addEventListener('abort', () => stream.closeByClient(), { once: true });
    this.note(`connection ${number} opened (200, text/event-stream)`);
    stream.start(this.behavior);
    return new Response(body, { status: 200, headers: SSE_HEADERS });
  }

  private statusLine({ status, retryAfter }: { status: number; retryAfter?: number }): string {
    return (
      `${status} ${STATUS_TEXT[status] ?? ''}`.trim() +
      (retryAfter === undefined ? '' : ` · Retry-After: ${retryAfter}`)
    );
  }

  /** Whether a stream is open; if not, note that `what` didn't happen */
  private anyOpen(what: string): boolean {
    if (this.streams.size === 0) this.note(`no open stream: ${what}`);
    return this.streams.size > 0;
  }

  /** @internal */
  record(direction: WireEntry['direction'], text: string): void {
    this.log.add(direction, text);
  }

  /** @internal */
  note(text: string): void {
    this.log.add('note', text);
  }

  /** @internal A stream is over */
  forget(stream: Stream): void {
    this.streams.delete(stream);
  }
}

/** One response body being written: chunks arrive after the server's latency, in order */
class Stream implements SseStream {
  /** `open`: writing; `ending`: the last chunks are on their way; `gone`: nothing more arrives */
  private state: 'open' | 'ending' | 'gone' = 'open';
  private silent = false;
  private stops: Array<() => void> = [];

  constructor(
    private readonly server: FakeSseServer,
    readonly number: number,
    readonly lastEventId: string | undefined,
    private readonly controller: ReadableStreamDefaultController<Uint8Array>,
    private readonly latency: number
  ) {}

  start(behavior: FakeSseBehavior): void {
    if (behavior.heartbeat) {
      const timer = setInterval(() => this.write(formatSseComment('ping')), behavior.heartbeat);
      this.stops.push(() => clearInterval(timer));
    }
    const stop = behavior.onOpen?.(this);
    if (stop) this.stops.push(stop);
  }

  write(text: string): void {
    this.writeChunks([encoder.encode(text)]);
  }

  send(message: SseMessage): void {
    this.write(formatSseMessage(message));
  }

  writeChunks(chunks: Uint8Array[]): void {
    if (this.state !== 'open' || this.silent) return;
    for (const chunk of chunks) {
      this.server.record('server', chunkText(chunk));
      setTimeout(() => {
        if (this.state !== 'gone') this.controller.enqueue(chunk);
      }, this.latency);
    }
  }

  end(): void {
    if (!this.finish('ending')) return;
    this.server.note(`connection ${this.number} ended by the server`);
    // After the chunks already on their way
    setTimeout(() => {
      this.state = 'gone';
      this.controller.close();
    }, this.latency);
  }

  drop(): void {
    if (!this.finish('gone')) return;
    this.server.note(`connection ${this.number} dropped (network error)`);
    this.controller.error(new TypeError('network error'));
  }

  silence(): void {
    if (this.state !== 'open' || this.silent) return;
    this.silent = true;
    this.server.note(`connection ${this.number}: the server stops writing, and keeps it open`);
  }

  closeByClient(): void {
    if (!this.finish('gone')) return;
    this.server.note(`connection ${this.number} closed by the client`);
    this.controller.error(new DOMException('The operation was aborted.', 'AbortError'));
  }

  closeQuietly(): void {
    if (!this.finish('gone')) return;
    this.controller.close();
  }

  /** Stop writing (once): the timers stop and the server forgets the stream */
  private finish(state: 'ending' | 'gone'): boolean {
    if (this.state !== 'open') return false;
    this.state = state;
    for (const stop of this.stops.splice(0)) stop();
    this.server.forget(this);
    return true;
  }
}
