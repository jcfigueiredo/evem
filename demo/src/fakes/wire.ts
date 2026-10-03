/** One line of the wire log: what the client or the server sent, or something that happened to a connection */
export interface WireEntry {
  /** Milliseconds since the scenario started */
  at: number;
  direction: 'client' | 'server' | 'note';
  text: string;
}

/** What the Server tab and the scenario checks need from a scenario's server */
export interface FakeServer {
  /** Everything sent each way, and what happened to connections, oldest first */
  readonly wire: WireEntry[];
  /** Connections open now */
  readonly openConnections: number;
  /**
   * Do what one of the Server tab's controls does: `send` a text, `drop` the connections, … (each server has its
   * own). A check's `server:<command> <argument>` step calls it too.
   */
  run(command: string, argument?: string): void;
  /** Stop for good, quietly: the scenario started over */
  close(): void;
}

/** A wire log the servers share: entries on the scenario's clock, reported as they're added, none after `close()` */
export class WireLog {
  readonly entries: WireEntry[] = [];
  private closed = false;

  constructor(
    private readonly now: () => number,
    private readonly onEntry?: (entry: WireEntry) => void
  ) {}

  add(direction: WireEntry['direction'], text: string): void {
    if (this.closed) return;
    const entry = { at: this.now(), direction, text };
    this.entries.push(entry);
    this.onEntry?.(entry);
  }

  close(): void {
    this.closed = true;
  }
}

/** The default clock: milliseconds since the page loaded */
export const pageClock = (): number => Math.round(performance.now());

/**
 * A chunk of a stream as text: UTF-8, with the bytes of a character split across chunks written as `\xNN`, so the
 * wire log shows where a chunk boundary fell inside a character
 */
export function chunkText(bytes: Uint8Array): string {
  // Continuation bytes (10xxxxxx) at the start belong to a character the previous chunk started
  let start = 0;
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
  // A lead byte near the end whose character needs more bytes than the chunk has left
  let end = bytes.length;
  for (let index = Math.max(start, bytes.length - 3); index < bytes.length; index++) {
    const byte = bytes[index]!;
    const length = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    if (length > 1 && index + length > bytes.length) {
      end = index;
      break;
    }
  }
  const hex = (part: Uint8Array) =>
    [...part].map(byte => `\\x${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');
  return (
    hex(bytes.subarray(0, start)) + new TextDecoder().decode(bytes.subarray(start, end)) + hex(bytes.subarray(end))
  );
}
