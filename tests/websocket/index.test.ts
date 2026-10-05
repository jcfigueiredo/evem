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

describe('WebSocket adapter error classes', () => {
  it('ConnectionError carries its code and the error that caused it', () => {
    const cause = new Error('refused');
    const error = new websocket.ConnectionError('Could not connect', cause);
    expect(error).toBeInstanceOf(WebSocketError);
    expect(error).toMatchObject({ name: 'ConnectionError', code: 'CONNECTION_ERROR', originalError: cause });
    expect(error.message).toBe('Could not connect');
  });

  it('QueueOverflowError says how many messages were attempted against the limit', () => {
    const error = new websocket.QueueOverflowError(100, 101);
    expect(error).toBeInstanceOf(WebSocketError);
    expect(error).toMatchObject({ name: 'QueueOverflowError', code: 'QUEUE_OVERFLOW', maxSize: 100, attempted: 101 });
    expect(error.message).toBe('Message queue overflow: attempted to queue 101 messages, max is 100');
  });
});
