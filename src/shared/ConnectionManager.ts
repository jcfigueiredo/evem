import type { EvEm } from '../eventEmitter.js';
import { localName } from './names.js';
import type { ConnectionState, ConnectionStateChangeEvent } from './types.js';

/**
 * Options for ConnectionManager
 */
export interface ConnectionManagerOptions {
  /**
   * Event the state changes are published to
   * @default 'ws.connection.state'
   */
  stateEvent?: string;
}

/**
 * Tracks a connection's state (shared by the WebSocket and SSE adapters) and publishes every
 * change as `{ from, to, timestamp }`. Transitions aren't validated: any state can follow any other.
 */
export class ConnectionManager {
  private currentState: ConnectionState = 'disconnected';
  private readonly stateEvent: string;

  constructor(
    private evem: EvEm,
    options: ConnectionManagerOptions = {}
  ) {
    this.stateEvent = options.stateEvent ?? localName(evem, 'ws.connection.state');
  }

  /**
   * Transition to a new connection state
   * Emits a state change event via EvEm
   * Returns a promise that resolves when event handlers complete
   */
  async transitionTo(newState: ConnectionState): Promise<void> {
    const oldState = this.currentState;
    this.currentState = newState;

    const event: ConnectionStateChangeEvent = {
      from: oldState,
      to: newState,
      timestamp: Date.now()
    };

    // Emit state change event through EvEm
    // State transition should succeed even if event handlers throw
    try {
      await this.evem.publish(this.stateEvent, event);
    } catch (error) {
      // Errors from state handlers are deliberately ignored here
      // State transition completes successfully
    }
  }

  /**
   * Get the current connection state
   */
  getState(): ConnectionState {
    return this.currentState;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.currentState === 'connected';
  }

  /**
   * Check if currently connecting (includes reconnecting)
   */
  isConnecting(): boolean {
    return this.currentState === 'connecting' || this.currentState === 'reconnecting';
  }

  /**
   * Check if currently disconnected
   */
  isDisconnected(): boolean {
    return this.currentState === 'disconnected';
  }

  /**
   * Check if currently disconnecting
   */
  isDisconnecting(): boolean {
    return this.currentState === 'disconnecting';
  }

  /**
   * Check if currently reconnecting
   */
  isReconnecting(): boolean {
    return this.currentState === 'reconnecting';
  }
}
