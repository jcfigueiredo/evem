import type { EvEm as EvEmClass } from '@jcfigueiredo/evem';
import type { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

declare global {
  // docs/examples.md imports EvEm and creates `evem` once, in "Importing and Initializing EvEm"
  const EvEm: typeof EvEmClass;
  type EvEm = EvEmClass;
  const evem: EvEmClass;
  // "Concurrent Requests" uses the handler from the previous example
  const handler: WebSocketHandler;
}

export {};
