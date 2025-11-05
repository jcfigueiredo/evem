import { IWebSocket } from '../../../src/websocket/types';

/**
 * Mock WebSocket implementation for testing
 * Provides controllable event triggering for testing various scenarios
 */
export class MockWebSocket implements IWebSocket {
  // WebSocket ready states
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState: number = this.CONNECTING;

  // Event handlers
  onopen: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;

  // Track sent messages for testing
  sentMessages: any[] = [];

  // Track close calls
  closeCalled = false;
  closeCode?: number;
  closeReason?: string;

  constructor(
    public url: string,
    public protocols?: string | string[]
  ) {
    // Simulate async connection in next tick
    if (this.autoConnect) {
      setTimeout(() => {
        if (this.readyState === this.CONNECTING) {
          this.simulateOpen();
        }
      }, 0);
    }
  }

  /**
   * Whether to automatically simulate connection on construction
   * Can be disabled for testing connection failures
   */
  autoConnect = true;

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    if (this.readyState !== this.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalled = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = this.CLOSING;

    // Simulate async close
    setTimeout(() => {
      this.simulateClose(code || 1000, reason || 'Normal closure');
    }, 0);
  }

  // Test helper methods

  /**
   * Simulate the WebSocket opening
   */
  simulateOpen(): void {
    this.readyState = this.OPEN;
    if (this.onopen) {
      this.onopen({ type: 'open' });
    }
  }

  /**
   * Simulate the WebSocket closing
   */
  simulateClose(code: number = 1000, reason: string = 'Normal closure'): void {
    this.readyState = this.CLOSED;
    if (this.onclose) {
      this.onclose({ type: 'close', code, reason });
    }
  }

  /**
   * Simulate a WebSocket error
   */
  simulateError(error: Error = new Error('WebSocket error')): void {
    if (this.onerror) {
      this.onerror({ type: 'error', error });
    }
  }

  /**
   * Simulate receiving a message
   */
  simulateMessage(data: any): void {
    if (this.readyState !== this.OPEN) {
      throw new Error('Cannot simulate message on non-open WebSocket');
    }
    if (this.onmessage) {
      this.onmessage({ type: 'message', data });
    }
  }

  /**
   * Reset the mock for reuse
   */
  reset(): void {
    this.sentMessages = [];
    this.closeCalled = false;
    this.closeCode = undefined;
    this.closeReason = undefined;
    this.readyState = this.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
  }

  /**
   * Get the last sent message
   */
  getLastSentMessage(): any {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /**
   * Clear sent messages history
   */
  clearSentMessages(): void {
    this.sentMessages = [];
  }
}

/**
 * Create a mock WebSocket constructor for testing
 */
export function createMockWebSocketConstructor(): {
  constructor: new (url: string, protocols?: string | string[]) => MockWebSocket;
  instances: MockWebSocket[];
} {
  const instances: MockWebSocket[] = [];

  const constructor = class extends MockWebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols);
      instances.push(this);
    }
  };

  return { constructor, instances };
}
