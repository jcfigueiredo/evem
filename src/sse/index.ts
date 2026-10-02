/* c8 ignore next */
// Entry point for the SSE client (`@jcfigueiredo/evem/sse`). Server-side formatting helpers live in
// `@jcfigueiredo/evem/sse/server`.
export { defaultShouldReconnect, SseHandler, type SseHandlerOptions, type SseReconnectInfo } from "./SseHandler.js";
export { FetchSseTransport, type FetchSseTransportOptions } from "./FetchSseTransport.js";
export {
  EventSourceSseTransport,
  type EventSourceConstructorLike,
  type EventSourceLike,
  type EventSourceSseTransportOptions
} from "./EventSourceSseTransport.js";
export { SseParser, type SseParsedEvent, type SseParserCallbacks } from "./SseParser.js";
export { ConnectionManager, type ConnectionManagerOptions } from "../shared/ConnectionManager.js";
export type { ConnectionState, ConnectionStateChangeEvent } from "../shared/types.js";
export type {
  SseBody,
  SseCloseInfo,
  SseConnectRequest,
  SseEvents,
  SseHeaders,
  SseTransport,
  SseTransportListener
} from "./types.js";
