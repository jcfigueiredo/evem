import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { SseHandler } from '../../src/sse/SseHandler';
import { formatSseComment, formatSseMessage, SSE_HEADERS } from '../../src/sse/server';

/**
 * A real SSE server on localhost: sends numbered events, resumes from Last-Event-ID,
 * and drops the first connection after three events
 */
function startServer(handle: (request: IncomingMessage, response: ServerResponse, connection: number) => void) {
  let connections = 0;
  const server = createServer((request, response) => handle(request, response, ++connections));
  return new Promise<{ server: Server; url: string; requests: IncomingMessage[] }>(resolve => {
    const requests: IncomingMessage[] = [];
    server.on('request', request => requests.push(request));
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}/events`, requests });
    });
  });
}

const waitFor = async (condition: () => boolean, timeout = 3000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for condition');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

describe('SseHandler against a real HTTP server', () => {
  let server: Server | undefined;
  let handler: SseHandler | undefined;

  afterEach(async () => {
    await handler?.disconnect();
    await new Promise(resolve => server?.close(resolve) ?? resolve(undefined));
  });

  it('receives events, reconnects after the server drops the stream, and resumes with Last-Event-ID', async () => {
    const started = await startServer((request, response, connection) => {
      response.writeHead(200, SSE_HEADERS);
      response.write(formatSseMessage({ retry: 50 })); // reconnect quickly
      response.write(formatSseComment('connected'));
      const from = Number(request.headers['last-event-id'] ?? 0) + 1;
      const to = connection === 1 ? 3 : 5;
      for (let id = from; id <= to; id++) {
        response.write(formatSseMessage({ event: 'tick', id, data: { n: id } }));
      }
      if (connection === 1) response.end(); // the server goes away mid-stream
    });
    server = started.server;
    const evem = new EvEm();
    const ticks: number[] = [];
    evem.subscribe('server.tick', ({ n }: { n: number }) => { ticks.push(n); });

    handler = new SseHandler(started.url, evem);
    await waitFor(() => ticks.length === 5);

    expect(ticks).toEqual([1, 2, 3, 4, 5]);
    expect(started.requests.map(request => request.headers['last-event-id'])).toEqual([undefined, '3']);
    expect(handler.getLastEventId()).toBe('5');
    expect(handler.isConnected()).toBe(true);
  });

  it('sends headers and a POST body, and stops on 401', async () => {
    const started = await startServer((request, response) => {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        if (request.headers.authorization !== 'Bearer good') {
          response.writeHead(401).end();
          return;
        }
        response.writeHead(200, SSE_HEADERS);
        response.write(formatSseMessage({ event: 'echo', data: JSON.parse(body) }));
      });
    });
    server = started.server;
    const evem = new EvEm();
    const echoes: unknown[] = [];
    const errors: unknown[] = [];
    evem.subscribe('server.echo', (data: unknown) => { echoes.push(data); });
    evem.subscribe('sse.error', (error: unknown) => { errors.push(error); });

    handler = new SseHandler(started.url, evem, {
      method: 'POST',
      headers: { Authorization: 'Bearer good', 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'orders' }),
    });
    await waitFor(() => echoes.length === 1);
    expect(echoes).toEqual([{ topic: 'orders' }]);
    await handler.disconnect();

    handler = new SseHandler(started.url, evem, { headers: { Authorization: 'Bearer bad' } });
    await waitFor(() => handler!.getConnectionState() === 'disconnected' && errors.length === 1);
    expect(errors).toEqual([expect.objectContaining({ reason: 'http-error', status: 401 })]);
  });
});
