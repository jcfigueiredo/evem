import type { EvEm } from '../eventEmitter';
import type { ConnectionState, ConnectionStateChangeEvent } from './types';

/**
 * Manages WebSocket connection state transitions and emits state change events
 * Uses a state machine pattern to track connection lifecycle
 */
export class ConnectionManager {
  private currentState: ConnectionState = 'disconnected';

  constructor(private evem: EvEm) {}

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
      timestamp: Date.now(),
    };

    // Emit state change event through EvEm
    // State transition should succeed even if event handlers throw
    try {
      await this.evem.publish('ws.connection.state', event);
    } catch (error) {
      // The error will be handled by EvEm's error handling
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
