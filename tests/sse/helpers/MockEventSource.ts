/**
 * Controllable stand-in for the browser's EventSource
 */
export class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];

  readyState = MockEventSource.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(public url: string, public init?: { withCredentials?: boolean }) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }

  /** Test helpers */
  simulateOpen(): void {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string, { type = 'message', lastEventId = '' } = {}): void {
    const event = new MessageEvent(type, { data, lastEventId });
    if (type === 'message') this.onmessage?.(event);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  /** The browser retries by itself (CONNECTING) or gives up (CLOSED) */
  simulateError(readyState: number): void {
    this.readyState = readyState;
    this.onerror?.(new Event('error'));
  }
}
