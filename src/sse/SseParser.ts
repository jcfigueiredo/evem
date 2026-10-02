/**
 * An event dispatched from an SSE stream
 */
export interface SseParsedEvent {
  /** The `event:` field, or 'message' when absent */
  type: string;
  /** The `data:` lines joined with newlines */
  data: string;
  /** The last `id:` seen on the stream (or the initial last event id) */
  lastEventId: string;
}

export interface SseParserCallbacks {
  onEvent(event: SseParsedEvent): void;
  /** A `retry:` field: the server's reconnection delay in milliseconds */
  onRetry?(milliseconds: number): void;
  /** A comment line (`: text`), without the leading colon; servers use them as heartbeats */
  onComment?(text: string): void;
}

/**
 * Parser for the `text/event-stream` format, following the HTML specification's
 * "event stream interpretation" algorithm. It takes decoded text in chunks of any size;
 * one parser handles one stream.
 */
export class SseParser {
  private lineBuffer = '';
  private data = '';
  private eventType = '';
  private lastEventIdBuffer: string;
  private started = false;
  /** The previous chunk ended with CR, so an LF at the start of the next one ends the same line */
  private skipLeadingLineFeed = false;

  /**
   * @param callbacks - Receive dispatched events, retry values and comments
   * @param initialLastEventId - Last event id carried over from a previous connection, so events
   *   without an `id:` field keep reporting it
   */
  constructor(private readonly callbacks: SseParserCallbacks, initialLastEventId = '') {
    this.lastEventIdBuffer = initialLastEventId;
  }

  /**
   * Parse the next chunk of the stream
   */
  feed(chunk: string): void {
    let text = chunk;

    // A byte order mark is only allowed at the very start of the stream
    if (!this.started) {
      if (text.length === 0) {
        return;
      }
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
      }
      this.started = true;
    }

    if (this.skipLeadingLineFeed && text.startsWith('\n')) {
      text = text.slice(1);
    }
    this.skipLeadingLineFeed = false;

    let lineStart = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char !== '\r' && char !== '\n') {
        continue;
      }

      this.processLine(this.lineBuffer + text.slice(lineStart, i));
      this.lineBuffer = '';

      if (char === '\r') {
        if (i + 1 < text.length) {
          if (text[i + 1] === '\n') {
            i++;
          }
        } else {
          this.skipLeadingLineFeed = true;
        }
      }
      lineStart = i + 1;
    }

    this.lineBuffer += text.slice(lineStart);
  }

  /**
   * The stream ended: an event without its terminating blank line is discarded, as the spec requires
   */
  end(): void {
    this.lineBuffer = '';
    this.data = '';
    this.eventType = '';
    this.skipLeadingLineFeed = false;
  }

  private processLine(line: string): void {
    if (line === '') {
      this.dispatch();
      return;
    }

    if (line.startsWith(':')) {
      this.callbacks.onComment?.(line.slice(1));
      return;
    }

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    switch (field) {
      case 'event':
        this.eventType = value;
        break;
      case 'data':
        this.data += `${value}\n`;
        break;
      case 'id':
        if (!value.includes('\0')) {
          this.lastEventIdBuffer = value;
        }
        break;
      case 'retry':
        if (/^[0-9]+$/.test(value)) {
          this.callbacks.onRetry?.(Number(value));
        }
        break;
      default:
        // Unknown fields are ignored
        break;
    }
  }

  private dispatch(): void {
    const lastEventId = this.lastEventIdBuffer;
    if (this.data === '') {
      this.eventType = '';
      return;
    }

    const event: SseParsedEvent = {
      type: this.eventType || 'message',
      data: this.data.endsWith('\n') ? this.data.slice(0, -1) : this.data,
      lastEventId,
    };
    this.data = '';
    this.eventType = '';
    this.callbacks.onEvent(event);
  }
}
