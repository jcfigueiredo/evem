import { describe, it, expect } from 'vitest';
import * as websocket from '../../src/websocket';
import { ConnectionManager } from '../../src/websocket/ConnectionManager';
import { MessageQueue } from '../../src/websocket/MessageQueue';
import { RequestResponseManager } from '../../src/websocket/RequestResponseManager';
import { WebSocketHandler } from '../../src/websocket/WebSocketHandler';
import { RequestTimeoutError, WebSocketError } from '../../src/websocket/types';

describe('WebSocket adapter entry point', () => {
  it('should export the adapter components and error classes', () => {
    expect(websocket.ConnectionManager).toBe(ConnectionManager);
    expect(websocket.MessageQueue).toBe(MessageQueue);
    expect(websocket.RequestResponseManager).toBe(RequestResponseManager);
    expect(websocket.WebSocketHandler).toBe(WebSocketHandler);
    expect(websocket.RequestTimeoutError).toBe(RequestTimeoutError);
    expect(websocket.WebSocketError).toBe(WebSocketError);
  });
});
