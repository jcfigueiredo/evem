/* c8 ignore next */
export { ConnectionManager } from './ConnectionManager.js';
export { MessageQueue, type MessageQueueOptions } from './MessageQueue.js';
export { RequestResponseManager } from './RequestResponseManager.js';
export { WebSocketHandler } from './WebSocketHandler.js';
export {
  ConnectionError,
  QueueOverflowError,
  RequestTimeoutError,
  WebSocketError,
  type ConnectionState,
  type ConnectionStateChangeEvent,
  type IWebSocket,
  type IncomingMessage,
  type PendingRequest,
  type QueuedMessage,
  type RequestMessage,
  type RequestOptions,
  type ResponseMessage,
  type WebSocketAdapterOptions,
  type WebSocketEvents,
  type WebSocketHandlerOptions
} from './types.js';
