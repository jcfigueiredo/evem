/**
 * Server-side helpers that write the `text/event-stream` format correctly.
 * Pure functions with no I/O, usable in Node.js, Deno, Bun and edge runtimes.
 */

/**
 * One message to send on an SSE stream
 */
export interface SseMessage {
  /** Event type; the client publishes it as `<serverEventPrefix>.<event>` (e.g. `server.order.updated`) */
  event?: string;
  /** Payload; JSON-encoded unless `raw` is set and it's a string */
  data?: unknown;
  /** Event id, sent back by the client as `Last-Event-ID` when it reconnects */
  id?: string | number;
  /** Reconnection delay for the client, in milliseconds */
  retry?: number;
}

export interface FormatSseMessageOptions {
  /** Write string data as text, one `data:` line per line, for clients using `parseData: 'text'` */
  raw?: boolean;
  /**
   * Write an unnamed message whose data is `{ event, data }`, so clients using the native
   * EventSource receive it without listing every event type
   */
  envelope?: boolean;
}

/**
 * Response headers for an SSE stream: the content type, no caching or transforms (which would
 * buffer or compress the stream), and no nginx buffering. `Connection: keep-alive` is left out
 * on purpose: HTTP/2 servers reject it.
 */
export const SSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no'
});

const LINE_BREAK = /\r\n|\r|\n/;

function assertSingleLine(field: string, value: string): void {
  if (/[\r\n]/.test(value)) {
    throw new TypeError(`SSE ${field} must not contain line breaks: ${JSON.stringify(value)}`);
  }
}

/**
 * Format one SSE message, ending with the blank line that dispatches it.
 *
 * - `data` is JSON-encoded (strings included), matching the client's default `parseData: 'json'`.
 *   With `raw: true`, string data is written as text instead. Every line of data gets its own
 *   `data:` field, so the content can never end the event early or inject other fields.
 * - A named event without `data` is sent with `data: null`, because the client never dispatches an
 *   event without data. A message with neither `event` nor `data` only sets `id` / `retry`.
 *
 * @throws {TypeError} If `event` or `id` contains a line break, `id` contains NULL, or `envelope` is
 *   set without an `event`
 * @throws {RangeError} If `retry` isn't a non-negative safe integer
 */
export function formatSseMessage(message: SseMessage, options: FormatSseMessageOptions = {}): string {
  const { event, data, id, retry } = message;
  const lines: string[] = [];

  if (event !== undefined) {
    assertSingleLine('event', event);
  }
  if (options.envelope && !event) {
    throw new TypeError('SSE envelope messages need an event name');
  }

  if (event && !options.envelope) {
    lines.push(`event: ${event}`);
  }

  if (id !== undefined) {
    const idText = String(id);
    assertSingleLine('id', idText);
    if (idText.includes('\0')) {
      throw new TypeError('SSE id must not contain NULL characters');
    }
    lines.push(`id: ${idText}`);
  }

  if (retry !== undefined) {
    // Safe integers only: larger numbers are written in exponent notation (1e+21), which clients ignore
    if (!Number.isSafeInteger(retry) || retry < 0) {
      throw new RangeError(`SSE retry must be a non-negative integer, got ${retry}`);
    }
    lines.push(`retry: ${retry}`);
  }

  if (event || data !== undefined) {
    const payload = options.envelope ? { event, data: data ?? null } : data;
    const text = options.raw && typeof payload === 'string' ? payload : (JSON.stringify(payload) ?? 'null');
    for (const line of text.split(LINE_BREAK)) {
      lines.push(`data: ${line}`);
    }
  }

  return `${lines.join('\n')}\n\n`;
}

/**
 * Format a comment, e.g. a heartbeat (`: ping`). Clients ignore comments, but receiving them
 * keeps a heartbeat timeout from firing.
 */
export function formatSseComment(text = ''): string {
  const lines = text.split(LINE_BREAK).map(line => (line ? `: ${line}` : ':'));
  return `${lines.join('\n')}\n\n`;
}
