/**
 * Connection states shared by the WebSocket and SSE adapters
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting';

/**
 * Connection state change event payload
 */
export interface ConnectionStateChangeEvent {
  from: ConnectionState;
  to: ConnectionState;
  timestamp: number;
}
