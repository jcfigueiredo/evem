import type { SseFetch } from '@jcfigueiredo/evem/sse';
import { chunkText, pageClock, WireLog, type FakeServer, type WireEntry } from './wire';

/** The global `fetch`, called as a plain function (browsers throw "Illegal invocation" otherwise) */
const pageFetch: SseFetch = (url, init) => fetch(url, init);

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Python mode: a real server (one of `examples/python/`, behind the dev server's `/events` proxy), with the same wire
 * log as the fake servers. Its `fetch` is the page's own, logging each request, the status it got, every chunk of the
 * body and how the stream ended. The real server has no controls here, so `run()` throws.
 */
export class LocalSseServer implements FakeServer {
  readonly fetch: SseFetch;
  private readonly log: WireLog;
  private open = 0;
  private connections = 0;

  constructor(baseFetch: SseFetch = pageFetch, now: () => number = pageClock, onWire?: (entry: WireEntry) => void) {
    this.log = new WireLog(now, onWire);
    this.fetch = async (url, init) => {
      const headers = new Headers(init.headers);
      const shown = [...headers].filter(([name]) => name !== 'accept').map(([name, value]) => `${name}: ${value}`);
      this.log.add('client', [`${init.method ?? 'GET'} ${url}`, ...shown].join(' · '));
      let response: Response;
      try {
        response = await baseFetch(url, init);
      } catch (error) {
        if (!init.signal?.aborted) this.log.add('note', `no answer: ${messageOf(error)}`);
        throw error;
      }
      const number = ++this.connections;
      const type = response.headers.get('content-type');
      this.log.add('note', `connection ${number} answered ${response.status}${type ? ` (${type})` : ''}`);
      if (!response.ok || !response.body) return response;
      return new Response(this.logged(response.body, number, init.signal), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    };
  }

  get wire(): WireEntry[] {
    return this.log.entries;
  }

  get openConnections(): number {
    return this.open;
  }

  run(command: string): void {
    throw new Error(`The local server has no ${command} control: stop or restart it in its terminal`);
  }

  close(): void {
    this.log.close();
  }

  /** The body, passed on chunk by chunk, each one logged */
  private logged(body: ReadableStream<Uint8Array>, number: number, signal: AbortSignal | null | undefined) {
    const reader = body.getReader();
    this.open++;
    let over = false;
    const finish = (how: string) => {
      if (over) return;
      over = true;
      this.open--;
      this.log.add('note', `connection ${number} ${how}`);
    };
    return new ReadableStream<Uint8Array>({
      pull: async controller => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            finish('ended by the server');
            controller.close();
            return;
          }
          this.log.add('server', chunkText(value));
          controller.enqueue(value);
        } catch (error) {
          finish(signal?.aborted ? 'closed by the client' : `broke: ${messageOf(error)}`);
          controller.error(error);
        }
      },
      cancel: reason => {
        finish('closed by the client');
        return reader.cancel(reason);
      }
    });
  }
}

/**
 * Whether a local SSE server answers at `url`: a request that's aborted as soon as the response arrives. Resolves
 * with `answering`, or with what happened instead (a status, or the network error).
 */
export async function checkLocalServer(url = '/events', baseFetch: SseFetch = pageFetch): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await baseFetch(url, { headers: { Accept: 'text/event-stream' }, signal: controller.signal });
    const type = response.headers.get('content-type') ?? '';
    if (response.ok && type.startsWith('text/event-stream')) return 'answering';
    return `answered ${response.status}${type ? ` (${type})` : ''}`;
  } catch (error) {
    return controller.signal.aborted ? 'no answer within 3 s' : `no answer: ${messageOf(error)}`;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
