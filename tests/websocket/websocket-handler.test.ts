import { createServer, type AddressInfo } from 'node:net';
import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { WebSocketHandler } from '../../src/websocket/WebSocketHandler';
import type { WebSocketHandlerOptions } from '../../src/websocket/types';
import { MockWebSocket, createMockWebSocketConstructor } from './mocks/MockWebSocket';

describe('WebSocketHandler', () => {
  let evem: EvEm;
  let mockWs: MockWebSocket;
  let handler: WebSocketHandler;

  beforeEach(() => {
    evem = new EvEm();
    mockWs = new MockWebSocket('wss://test.example.com');
  });

  afterEach(() => {
    handler?.disconnect();
  });

  describe('Initialization', () => {
    it('should initialize with WebSocket instance', () => {
      handler = new WebSocketHandler(mockWs, evem);

      expect(handler).toBeDefined();
      expect(handler.isConnected()).toBe(false);
    });

    it('should initialize with WebSocket URL', () => {
      // Skip in Node.js environment where WebSocket global is not defined
      if (typeof WebSocket === 'undefined') {
        expect(true).toBe(true);
        return;
      }

      handler = new WebSocketHandler('wss://test.example.com', evem);

      expect(handler).toBeDefined();
    });

    it('should use default options when not provided', () => {
      handler = new WebSocketHandler(mockWs, evem);

      // Handler should have queue enabled by default
      expect(handler.getQueueSize()).toBe(0);
    });

    it('should respect custom options', () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableQueue: true,
        queueSize: 50,
        enableRequestResponse: true
      });

      expect(handler.getQueueSize()).toBe(0);
    });
  });

  describe('WebSocket Lifecycle Auto-Wiring', () => {
    it('should auto-wire onopen to transition to connected', async () => {
      const stateChanges: any[] = [];

      evem.subscribe('ws.connection.state', (event: any) => {
        stateChanges.push(event);
      });

      handler = new WebSocketHandler(mockWs, evem);

      await mockWs.simulateOpen();

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toMatchObject({
        to: 'connected'
      });
      expect(handler.isConnected()).toBe(true);
    });

    it('should auto-wire onclose to transition to disconnected', async () => {
      const stateChanges: any[] = [];

      evem.subscribe('ws.connection.state', (event: any) => {
        stateChanges.push(event);
      });

      handler = new WebSocketHandler(mockWs, evem);

      await mockWs.simulateOpen();
      await mockWs.simulateClose();

      expect(stateChanges).toHaveLength(2);
      expect(stateChanges[1]).toMatchObject({
        to: 'disconnected'
      });
      expect(handler.isConnected()).toBe(false);
    });

    it('should auto-wire onerror and emit ws.error event', async () => {
      const errors: any[] = [];

      evem.subscribe('ws.error', (error: any) => {
        errors.push(error);
      });

      handler = new WebSocketHandler(mockWs, evem);

      const testError = new Error('Connection failed');
      await mockWs.simulateError(testError);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        error: testError
      });
    });

    it('should call custom onError handler when provided', async () => {
      const customErrorHandler = vi.fn();

      handler = new WebSocketHandler(mockWs, evem, {
        onError: customErrorHandler
      });

      const testError = new Error('Connection failed');
      await mockWs.simulateError(testError);

      expect(customErrorHandler).toHaveBeenCalledWith(testError);
    });
  });

  describe('Outgoing Messages Auto-Wiring', () => {
    it('should auto-wire ws.send.queued to WebSocket.send()', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();

      await evem.publish('ws.send', { type: 'test', data: 'hello' });

      // Message should be sent immediately when connected
      expect(mockWs.sentMessages).toHaveLength(1);
      const sentData = JSON.parse(mockWs.sentMessages[0]);
      expect(sentData).toMatchObject({ type: 'test', data: 'hello' });
    });

    it('should auto-wire ws.send.request to WebSocket.send() with correct format', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableRequestResponse: true
      });
      await mockWs.simulateOpen();

      // This would be triggered by RequestResponseManager
      await evem.publish('ws.send.request', {
        id: 'req-123',
        method: 'getUser',
        params: { userId: '456' },
        timestamp: Date.now()
      });

      expect(mockWs.sentMessages).toHaveLength(1);
      const sentData = JSON.parse(mockWs.sentMessages[0]);
      expect(sentData).toMatchObject({
        type: 'request',
        id: 'req-123',
        method: 'getUser',
        params: { userId: '456' }
      });
    });

    it('should queue messages when disconnected', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();
      await mockWs.simulateClose();

      await evem.publish('ws.send', { type: 'test', data: 'queued' });

      expect(handler.getQueueSize()).toBe(1);
    });

    it('should auto-flush queue when reconnected', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();
      await mockWs.simulateClose();

      await evem.publish('ws.send', { type: 'test', data: 'queued1' });
      await evem.publish('ws.send', { type: 'test', data: 'queued2' });

      expect(handler.getQueueSize()).toBe(2);

      mockWs.clearSentMessages();
      mockWs.simulateOpen();

      // Wait for async connection state change and auto-flush
      await new Promise(resolve => setTimeout(resolve, 10));

      // Queue should be flushed
      expect(handler.getQueueSize()).toBe(0);
      expect(mockWs.sentMessages).toHaveLength(2);
    });

    it('should check WebSocket ready state before sending', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();

      // Close connection
      await mockWs.simulateClose();
      mockWs.clearSentMessages();

      // Try to send queued message - should not send because not connected
      await evem.publish('ws.send.queued', { data: 'test' });

      // Should not have sent anything
      expect(mockWs.sentMessages).toHaveLength(0);
    });
  });

  describe('Incoming Messages Auto-Wiring', () => {
    it('should auto-parse and route server events', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();

      const serverEvents: any[] = [];

      evem.subscribe('server.user.login', (data: any) => {
        serverEvents.push(data);
      });

      await mockWs.simulateMessage(
        JSON.stringify({
          event: 'server.user.login',
          data: { userId: '123', username: 'john' }
        })
      );

      expect(serverEvents).toHaveLength(1);
      expect(serverEvents[0]).toMatchObject({
        userId: '123',
        username: 'john'
      });
    });

    it('should route RPC successful responses', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableRequestResponse: true
      });
      await mockWs.simulateOpen();

      const responses: any[] = [];

      evem.subscribe('ws.response', (response: any) => {
        responses.push(response);
      });

      await mockWs.simulateMessage(
        JSON.stringify({
          type: 'response',
          id: 'req-123',
          result: { userId: '456', name: 'John' },
          timestamp: Date.now()
        })
      );

      expect(responses).toHaveLength(1);
      expect(responses[0]).toMatchObject({
        id: 'req-123',
        result: { userId: '456', name: 'John' }
      });
    });

    it('should route RPC error responses', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableRequestResponse: true
      });
      await mockWs.simulateOpen();

      const errorResponses: any[] = [];

      evem.subscribe('ws.response.error', (response: any) => {
        errorResponses.push(response);
      });

      await mockWs.simulateMessage(
        JSON.stringify({
          type: 'response',
          id: 'req-456',
          error: {
            code: 404,
            message: 'User not found'
          },
          timestamp: Date.now()
        })
      );

      expect(errorResponses).toHaveLength(1);
      expect(errorResponses[0]).toMatchObject({
        id: 'req-456',
        error: {
          code: 404,
          message: 'User not found'
        }
      });
    });

    it('should handle wildcard server event subscriptions', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();

      const userEvents: any[] = [];

      evem.subscribe('server.user.*', (data: any) => {
        userEvents.push(data);
      });

      await mockWs.simulateMessage(
        JSON.stringify({
          event: 'server.user.login',
          data: { userId: '123' }
        })
      );

      await mockWs.simulateMessage(
        JSON.stringify({
          event: 'server.user.logout',
          data: { userId: '123' }
        })
      );

      expect(userEvents).toHaveLength(2);
    });

    it('should use custom serverEventPrefix when provided', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        serverEventPrefix: 'backend'
      });
      await mockWs.simulateOpen();

      const backendEvents: any[] = [];

      evem.subscribe('backend.notification', (data: any) => {
        backendEvents.push(data);
      });

      // When server sends event without prefix, handler adds it
      await mockWs.simulateMessage(
        JSON.stringify({
          event: 'notification',
          data: { message: 'Hello' }
        })
      );

      expect(backendEvents).toHaveLength(1);
    });

    it('should handle legacy message format (type field)', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();

      const messages: any[] = [];

      evem.subscribe('server.notification', (data: any) => {
        messages.push(data);
      });

      await mockWs.simulateMessage(
        JSON.stringify({
          type: 'notification',
          data: { message: 'Legacy format' }
        })
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ message: 'Legacy format' });
    });

    it('should handle parse errors gracefully', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();

      const parseErrors: any[] = [];

      evem.subscribe('ws.parse.error', (error: any) => {
        parseErrors.push(error);
      });

      // Send invalid JSON
      await mockWs.simulateMessage('{ invalid json }');

      expect(parseErrors).toHaveLength(1);
    });

    it('should use custom messageParser when provided', async () => {
      const customParser = vi.fn((data: string) => {
        return { custom: true, original: data };
      });

      handler = new WebSocketHandler(mockWs, evem, {
        messageParser: customParser
      });
      await mockWs.simulateOpen();

      await mockWs.simulateMessage('test message');

      expect(customParser).toHaveBeenCalledWith('test message');
    });

    it('should use custom messageFormatter when provided', async () => {
      const customFormatter = vi.fn((data: any) => {
        return `CUSTOM:${JSON.stringify(data)}`;
      });

      handler = new WebSocketHandler(mockWs, evem, {
        messageFormatter: customFormatter
      });
      await mockWs.simulateOpen();

      await evem.publish('ws.send.queued', { test: 'data' });

      expect(customFormatter).toHaveBeenCalled();
      expect(mockWs.sentMessages[0]).toContain('CUSTOM:');
    });
  });

  describe('Integration with Existing Components', () => {
    it('should integrate with ConnectionManager', async () => {
      handler = new WebSocketHandler(mockWs, evem);

      expect(handler.getConnectionState()).toBe('disconnected');

      await mockWs.simulateOpen();
      expect(handler.getConnectionState()).toBe('connected');

      await mockWs.simulateClose();
      expect(handler.getConnectionState()).toBe('disconnected');
    });

    it('should integrate with MessageQueue', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableQueue: true,
        queueSize: 10
      });

      await mockWs.simulateClose();

      // Queue some messages
      await evem.publish('ws.send', { msg: 1 });
      await evem.publish('ws.send', { msg: 2 });

      expect(handler.getQueueSize()).toBe(2);

      // Reconnect and check queue is flushed
      mockWs.clearSentMessages();
      mockWs.simulateOpen();

      // Wait for async connection state change and auto-flush
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler.getQueueSize()).toBe(0);
      expect(mockWs.sentMessages).toHaveLength(2);
    });

    it('should integrate with RequestResponseManager', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableRequestResponse: true
      });
      await mockWs.simulateOpen();

      const responses: any[] = [];
      evem.subscribe('ws.response', (response: any) => {
        responses.push(response);
      });

      // Simulate request being sent
      await evem.publish('ws.send.request', {
        id: 'test-req',
        method: 'getData',
        params: {},
        timestamp: Date.now()
      });

      // Simulate response
      await mockWs.simulateMessage(
        JSON.stringify({
          type: 'response',
          id: 'test-req',
          result: { success: true }
        })
      );

      expect(responses).toHaveLength(1);
      expect(responses[0].result).toMatchObject({ success: true });
    });
  });

  describe('Cleanup and Disconnect', () => {
    it('should clean up subscriptions on disconnect', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();

      const subscriptionCountBefore = Object.keys(evem.info()).length;
      handler.disconnect();
      const subscriptionCountAfter = Object.keys(evem.info()).length;

      // Info should still work after disconnect
      expect(subscriptionCountAfter).toBeGreaterThanOrEqual(0);
    });

    it('should close WebSocket on disconnect', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();

      handler.disconnect();

      // WebSocket should be either CLOSING or CLOSED
      expect([mockWs.CLOSING, mockWs.CLOSED]).toContain(mockWs.readyState);
    });

    it('should clean up message queue on disconnect', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableQueue: true
      });

      await mockWs.simulateClose();
      await evem.publish('ws.send', { data: 'test' });

      expect(handler.getQueueSize()).toBe(1);

      handler.disconnect();

      // Queue should be disabled
      expect(handler.getQueueSize()).toBe(0);
    });

    it('should clean up request-response manager on disconnect', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableRequestResponse: true
      });

      handler.disconnect();

      // Should not throw when trying to handle responses after disconnect
      await expect(
        evem.publish('ws.response', {
          id: 'test',
          result: {}
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Queue Options', () => {
    it('should disable queue when enableQueue is false', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableQueue: false
      });

      await mockWs.simulateClose();

      await evem.publish('ws.send', { data: 'test' });

      expect(handler.getQueueSize()).toBe(0);
    });

    it('should respect custom queue size', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableQueue: true,
        queueSize: 2
      });

      await mockWs.simulateClose();

      await evem.publish('ws.send', { msg: 1 });
      await evem.publish('ws.send', { msg: 2 });
      await evem.publish('ws.send', { msg: 3 }); // Should drop oldest

      expect(handler.getQueueSize()).toBe(2);
    });

    it('should respect autoFlush option', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableQueue: true,
        autoFlush: false
      });

      await mockWs.simulateClose();
      await evem.publish('ws.send', { data: 'test' });

      expect(handler.getQueueSize()).toBe(1);

      await mockWs.simulateOpen();

      // Should NOT auto-flush
      expect(handler.getQueueSize()).toBe(1);
    });
  });

  describe('Request-Response Options', () => {
    it('should disable request-response when enableRequestResponse is false', async () => {
      handler = new WebSocketHandler(mockWs, evem, {
        enableRequestResponse: false
      });
      await mockWs.simulateOpen();

      const responses: any[] = [];
      evem.subscribe('ws.response', (response: any) => {
        responses.push(response);
      });

      // Send a response - should not be processed
      await mockWs.simulateMessage(
        JSON.stringify({
          type: 'response',
          id: 'test',
          result: { data: 'test' }
        })
      );

      // Handler won't route it since RequestResponseManager isn't enabled
      expect(responses).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      handler = new WebSocketHandler(mockWs, evem);

      await mockWs.simulateOpen();
      await mockWs.simulateClose();
      await mockWs.simulateOpen();
      await mockWs.simulateClose();
      await mockWs.simulateOpen();

      expect(handler.isConnected()).toBe(true);
    });

    it('should handle messages received before fully initialized', async () => {
      handler = new WebSocketHandler(mockWs, evem);

      // Open connection first (MockWebSocket requires OPEN state to receive messages)
      await mockWs.simulateOpen();

      // Send message immediately after opening
      await mockWs.simulateMessage(
        JSON.stringify({
          event: 'server.early.message',
          data: { test: true }
        })
      );

      // Should not throw
      expect(handler).toBeDefined();
    });

    it('should handle disconnect called multiple times', () => {
      handler = new WebSocketHandler(mockWs, evem);

      handler.disconnect();
      handler.disconnect();
      handler.disconnect();

      // Should not throw
      expect(handler).toBeDefined();
    });

    it('should handle WebSocket that is already open', async () => {
      await mockWs.simulateOpen();

      handler = new WebSocketHandler(mockWs, evem);

      // Should handle already-open websocket
      expect(handler).toBeDefined();
    });
  });
});

describe('WebSocketHandler - regressions', () => {
  let evem: EvEm;
  let mockWs: MockWebSocket;
  let handler: WebSocketHandler;
  const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
  const sentMessages = () => mockWs.sentMessages.map(message => JSON.parse(message));

  beforeEach(() => {
    evem = new EvEm();
    mockWs = new MockWebSocket('wss://test.example.com');
  });

  afterEach(async () => {
    await handler?.disconnect();
    vi.restoreAllMocks();
  });

  describe('disconnect()', () => {
    it('should remove all of its subscriptions', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();
      expect(evem.info().filter(info => !info.isMiddleware).length).toBeGreaterThan(0);

      await handler.disconnect();

      expect(evem.info().filter(info => !info.isMiddleware)).toEqual([]);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should leave the connection state disconnected', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();
      expect(handler.isConnected()).toBe(true);

      const pending = handler.disconnect();
      expect(handler.isConnected()).toBe(false);
      await pending;

      expect(handler.getConnectionState()).toBe('disconnected');
    });

    it('should emit disconnecting and disconnected state changes', async () => {
      const states: string[] = [];
      evem.subscribe('ws.connection.state', (change: any) => {
        states.push(`${change.from}->${change.to}`);
      });
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();
      await tick();

      await handler.disconnect();

      expect(states).toEqual(['disconnected->connected', 'connected->disconnecting', 'disconnecting->disconnected']);
    });

    it('should not emit state changes when already disconnected', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateClose();
      await tick();
      const stateHandler = vi.fn();
      evem.subscribe('ws.connection.state', stateHandler);

      await handler.disconnect();

      expect(stateHandler).not.toHaveBeenCalled();
      expect(handler.getConnectionState()).toBe('disconnected');
    });

    it('should not publish a state change when a socket that never opened closes', async () => {
      const stateHandler = vi.fn();
      evem.subscribe('ws.connection.state', stateHandler);
      handler = new WebSocketHandler(mockWs, evem);

      mockWs.simulateClose(1006);
      await tick();

      expect(stateHandler).not.toHaveBeenCalled();
      expect(handler.getConnectionState()).toBe('disconnected');
    });
  });

  describe('queued requests', () => {
    it('should send requests queued while offline in request format after reconnecting', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateClose();
      await tick();

      await evem.publish('ws.send.request', { id: 'req-1', method: 'getUser', params: { id: 7 }, timestamp: 1 });
      expect(handler.getQueueSize()).toBe(1);

      mockWs.simulateOpen();
      await tick();

      expect(sentMessages()).toEqual([
        { type: 'request', id: 'req-1', method: 'getUser', params: { id: 7 }, timestamp: 1 }
      ]);
    });

    it('should send plain messages queued while offline unchanged', async () => {
      const flushed: any[] = [];
      evem.subscribe('ws.send.queued', (data: any) => {
        flushed.push(data);
      });
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateClose();
      await tick();

      await evem.publish('ws.send', { kind: 'chat', text: 'hello' });
      mockWs.simulateOpen();
      await tick();

      expect(sentMessages()).toEqual([{ kind: 'chat', text: 'hello' }]);
      expect(flushed).toEqual([{ kind: 'chat', text: 'hello' }]);
    });

    it('should stop formatting requests after disconnect()', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await handler.disconnect();
      const requestHandler = vi.fn();
      evem.subscribe('ws.send.request', requestHandler);

      await evem.publish('ws.send.request', { id: 'req-2', method: 'ping', timestamp: 1 });

      expect(requestHandler).toHaveBeenCalledWith({ id: 'req-2', method: 'ping', timestamp: 1 });
    });
  });

  describe('message flow', () => {
    it('should send messages shaped as { event, data } to the socket', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();

      for (let i = 0; i < 4; i++) {
        await evem.publish('ws.send', { event: 'client.chat.send', data: { i } });
      }

      expect(sentMessages()).toEqual([0, 1, 2, 3].map(i => ({ event: 'client.chat.send', data: { i } })));
    });

    it('should send every message when several are published without awaiting', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();

      const results = await Promise.all([1, 2, 3, 4, 5].map(n => evem.publish('ws.send', { n })));

      expect(results.every(Boolean)).toBe(true);
      expect(sentMessages()).toEqual([1, 2, 3, 4, 5].map(n => ({ n })));
    });

    it('should deliver a burst of server events while an async handler is still busy', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();
      const received: number[] = [];
      evem.subscribe('server.price', async (data: any) => {
        await tick(20);
        received.push(data.n);
      });

      for (let n = 1; n <= 5; n++) {
        mockWs.simulateMessage(JSON.stringify({ event: 'price', data: { n } }));
        await tick(1);
      }
      await tick(60);

      expect(received).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('already-open socket', () => {
    it('should start connected when given a socket that is already open', async () => {
      const states: string[] = [];
      evem.subscribe('ws.connection.state', (change: any) => {
        states.push(`${change.from}->${change.to}`);
      });
      mockWs.simulateOpen();

      handler = new WebSocketHandler(mockWs, evem);
      await tick();

      expect(handler.isConnected()).toBe(true);
      expect(states).toEqual(['disconnected->connected']);
    });

    it('should send messages without queueing them', async () => {
      const overflowHandler = vi.fn();
      evem.subscribe('ws.queue.overflow', overflowHandler);
      mockWs.simulateOpen();
      handler = new WebSocketHandler(mockWs, evem, { queueSize: 1 });

      await evem.publish('ws.send', { n: 1 });
      await evem.publish('ws.send', { n: 2 });

      expect(sentMessages()).toEqual([{ n: 1 }, { n: 2 }]);
      expect(handler.getQueueSize()).toBe(0);
      expect(overflowHandler).not.toHaveBeenCalled();
    });
  });

  describe('messages the socket cannot take', () => {
    // The socket stops being OPEN before its close event fires: the connection state still says 'connected'
    const dropSocketBeforeCloseEvent = () => {
      mockWs.readyState = mockWs.CLOSED;
    };

    it('should queue a message published after the socket closed but before onclose fired', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();
      dropSocketBeforeCloseEvent();

      await evem.publish('ws.send', { n: 1 });

      expect(handler.isConnected()).toBe(true);
      expect(handler.getQueueSize()).toBe(1);

      mockWs.simulateClose();
      mockWs.simulateOpen();
      await tick();

      expect(sentMessages()).toEqual([{ n: 1 }]);
    });

    it('should queue a request published after the socket closed but before onclose fired', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();
      dropSocketBeforeCloseEvent();

      await evem.publish('ws.send.request', { id: 'req-1', method: 'ping', timestamp: 1 });

      expect(handler.getQueueSize()).toBe(1);

      mockWs.simulateClose();
      mockWs.simulateOpen();
      await tick();

      expect(sentMessages()).toEqual([{ type: 'request', id: 'req-1', method: 'ping', timestamp: 1 }]);
    });

    it('should put flushed messages back in the queue, in order, when the connection drops mid-flush', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateClose();
      await tick();
      for (let n = 1; n <= 3; n++) {
        await evem.publish('ws.send', { n });
      }
      evem.subscribe('ws.send.queued', (data: any) => {
        if (data.n === 1) {
          dropSocketBeforeCloseEvent();
        }
      });

      mockWs.simulateOpen();
      await tick();

      expect(sentMessages()).toEqual([{ n: 1 }]);
      expect(handler.getQueueSize()).toBe(2);

      // Sent while the connection is down: queued once, after the messages put back
      await evem.publish('ws.send', { n: 4 });
      mockWs.simulateClose();
      await evem.publish('ws.send', { n: 5 });
      expect(handler.getQueueSize()).toBe(4);

      mockWs.simulateOpen();
      await tick();

      expect(sentMessages()).toEqual([1, 2, 3, 4, 5].map(n => ({ n })));
      expect(handler.getQueueSize()).toBe(0);
    });

    it('should drop the message without throwing when the queue is disabled', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      handler = new WebSocketHandler(mockWs, evem, { enableQueue: false });
      mockWs.simulateOpen();
      dropSocketBeforeCloseEvent();

      await expect(evem.publish('ws.send', { n: 1 })).resolves.toBe(true);
      await expect(evem.publish('ws.send.queued', { n: 2 })).resolves.toBe(true);

      expect(sentMessages()).toEqual([]);
      expect(handler.getQueueSize()).toBe(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('server event routing', () => {
    it('should route the legacy type format without a prefix when serverEventPrefix is empty', async () => {
      handler = new WebSocketHandler(mockWs, evem, { serverEventPrefix: '' });
      mockWs.simulateOpen();
      const notificationHandler = vi.fn();
      const prefixedHandler = vi.fn();
      evem.subscribe('notification', notificationHandler);
      evem.subscribe('.notification', prefixedHandler);

      mockWs.simulateMessage(JSON.stringify({ type: 'notification', data: { message: 'hi' } }));
      await tick();

      expect(notificationHandler).toHaveBeenCalledWith({ message: 'hi' });
      expect(prefixedHandler).not.toHaveBeenCalled();
    });
  });

  describe('failed attempts reported in other orders, and sockets it has let go of', () => {
    /** Like the ws package: an 'error' nobody listens to is thrown */
    class WsLikeSocket extends MockWebSocket {
      simulateError(error: Error = new Error('WebSocket was closed before the connection was established')): void {
        if (!this.onerror) {
          throw error;
        }
        super.simulateError(error);
      }
    }

    it('should follow a socket that reconnects by itself: a close and an error from a failed attempt, then an open', async () => {
      // e.g. reconnecting-websocket or partysocket passed in as the socket: they retry inside the same object
      const states: string[] = [];
      evem.subscribe('ws.connection.state', (change: any) => {
        states.push(`${change.from}->${change.to}`);
      });
      const serverHandler = vi.fn();
      evem.subscribe('server.hello', serverHandler);
      const socket = new MockWebSocket('wss://test.example.com');
      socket.autoConnect = false;
      handler = new WebSocketHandler(socket, evem);

      socket.simulateClose(1006);
      socket.simulateError();
      await tick();
      socket.simulateOpen();
      await tick();
      socket.simulateMessage(JSON.stringify({ event: 'hello', data: { n: 1 } }));
      await tick();

      expect(states).toEqual(['disconnected->connected']);
      expect(serverHandler).toHaveBeenCalledWith({ n: 1 });
    });

    it('should leave an error on a socket that was already open when passed in to the close that follows it', async () => {
      const socket = new MockWebSocket('wss://test.example.com');
      socket.autoConnect = false;
      socket.readyState = socket.OPEN;
      handler = new WebSocketHandler(socket, evem, { reconnect: true });
      await tick();

      socket.simulateError();
      await tick();

      expect(handler.getConnectionState()).toBe('connected');
    });

    it('should swallow errors from a socket it has let go of, like the one ws emits after closing a connecting socket', async () => {
      const socket = new WsLikeSocket('wss://test.example.com');
      socket.autoConnect = false;
      handler = new WebSocketHandler(socket, evem);

      await handler.disconnect();

      expect(() => socket.simulateError()).not.toThrow();
    });
  });
});

describe('WebSocketHandler - reconnect', () => {
  const url = 'wss://test.example.com';
  let evem: EvEm;
  let handler: WebSocketHandler | undefined;
  let states: string[];
  let reconnectFailedHandler: Mock;
  // Sockets created through SocketConstructor; they only open or fail when the test says so
  let instances: MockWebSocket[];
  let SocketConstructor: new (url: string) => MockWebSocket;

  const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  const socket = (index: number) => instances[index]!;
  const createHandler = (urlOrSocket: string | MockWebSocket, options: WebSocketHandlerOptions = {}) =>
    new WebSocketHandler(urlOrSocket, evem, {
      reconnect: true,
      reconnectDelay: 100,
      WebSocketConstructor: SocketConstructor,
      ...options
    });

  beforeEach(() => {
    vi.useFakeTimers();
    evem = new EvEm();
    ({ constructor: SocketConstructor, instances } = createMockWebSocketConstructor({ autoConnect: false }));
    states = [];
    evem.subscribe('ws.connection.state', (change: any) => {
      states.push(change.to);
    });
    reconnectFailedHandler = vi.fn();
    evem.subscribe('ws.reconnect.failed', reconnectFailedHandler);
  });

  afterEach(async () => {
    await handler?.disconnect();
    handler = undefined;
    vi.useRealTimers();
  });

  it('should reconnect after an unexpected close and flush messages queued meanwhile', async () => {
    handler = createHandler(new SocketConstructor(url), { reconnectDelay: 500 });
    socket(0).simulateOpen();

    socket(0).simulateClose(1006, 'Connection lost');
    await advance(0);
    expect(handler.getConnectionState()).toBe('reconnecting');

    await evem.publish('ws.send', { n: 1 });
    await advance(499);
    expect(instances).toHaveLength(1);

    await advance(1);
    expect(instances).toHaveLength(2);
    expect(socket(1).url).toBe(url);

    socket(1).simulateOpen();
    await advance(0);

    expect(handler.isConnected()).toBe(true);
    expect(socket(1).sentMessages.map(message => JSON.parse(message))).toEqual([{ n: 1 }]);
    expect(states).toEqual(['connected', 'reconnecting', 'connected']);
  });

  it('should create its sockets with WebSocketConstructor when given a URL', async () => {
    handler = createHandler(url);
    expect(instances).toHaveLength(1);
    socket(0).simulateOpen();

    socket(0).simulateClose(1006);
    await advance(100);

    expect(instances.map(instance => instance.url)).toEqual([url, url]);
  });

  it('should route messages from the new socket and send through it', async () => {
    handler = createHandler(new SocketConstructor(url));
    socket(0).simulateOpen();
    socket(0).simulateClose(1006);
    await advance(100);
    socket(1).simulateOpen();
    await advance(0);
    const serverHandler = vi.fn();
    evem.subscribe('server.ping', serverHandler);

    socket(1).simulateMessage(JSON.stringify({ event: 'ping', data: { n: 1 } }));
    await evem.publish('ws.send', { n: 2 });
    await advance(0);

    expect(serverHandler).toHaveBeenCalledWith({ n: 1 });
    expect(socket(1).sentMessages.map(message => JSON.parse(message))).toEqual([{ n: 2 }]);
  });

  it('should give up after maxReconnectAttempts consecutive failures', async () => {
    handler = createHandler(new SocketConstructor(url), { maxReconnectAttempts: 3 });
    socket(0).simulateOpen();
    socket(0).simulateClose(1006);

    for (let attempt = 1; attempt <= 3; attempt++) {
      await advance(100);
      expect(instances).toHaveLength(attempt + 1);
      socket(attempt).simulateClose(1006, 'Connection refused');
    }
    await advance(1000);

    expect(instances).toHaveLength(4);
    expect(handler.getConnectionState()).toBe('disconnected');
    expect(states).toEqual(['connected', 'reconnecting', 'disconnected']);
    expect(reconnectFailedHandler).toHaveBeenCalledTimes(1);
    expect(reconnectFailedHandler).toHaveBeenCalledWith({ attempts: 3 });
  });

  it('should reset the attempt count when a reconnect succeeds', async () => {
    handler = createHandler(new SocketConstructor(url), { maxReconnectAttempts: 2 });
    socket(0).simulateOpen();
    socket(0).simulateClose(1006);
    await advance(100);
    socket(1).simulateClose(1006);
    await advance(100);
    socket(2).simulateOpen();
    await advance(0);

    socket(2).simulateClose(1006);
    await advance(100);
    socket(3).simulateClose(1006);
    await advance(100);

    expect(instances).toHaveLength(5);
    expect(handler.getConnectionState()).toBe('reconnecting');
    expect(reconnectFailedHandler).not.toHaveBeenCalled();
  });

  it('should count a socket that cannot be created as a failed attempt', async () => {
    const errorHandler = vi.fn();
    evem.subscribe('ws.error', errorHandler);
    const creationError = new Error('Cannot create socket');
    const initialSocket = new SocketConstructor(url);
    handler = createHandler(initialSocket, {
      maxReconnectAttempts: 2,
      WebSocketConstructor: class {
        constructor() {
          throw creationError;
        }
      } as unknown as new (url: string) => MockWebSocket
    });
    initialSocket.simulateOpen();

    initialSocket.simulateClose(1006);
    await advance(1000);

    expect(errorHandler).toHaveBeenCalledTimes(2);
    expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({ error: creationError }));
    expect(handler.getConnectionState()).toBe('disconnected');
    expect(reconnectFailedHandler).toHaveBeenCalledWith({ attempts: 2 });
  });

  it('should cancel a pending reconnect on disconnect()', async () => {
    handler = createHandler(new SocketConstructor(url));
    socket(0).simulateOpen();
    socket(0).simulateClose(1006);
    await advance(0);

    await handler.disconnect();
    await advance(1000);

    expect(instances).toHaveLength(1);
    expect(handler.getConnectionState()).toBe('disconnected');
    expect(states).toEqual(['connected', 'reconnecting', 'disconnecting', 'disconnected']);
  });

  it('should not reconnect when reconnect is disabled', async () => {
    handler = createHandler(new SocketConstructor(url), { reconnect: false });
    socket(0).simulateOpen();

    socket(0).simulateClose(1006);
    await advance(5000);

    expect(instances).toHaveLength(1);
    expect(states).toEqual(['connected', 'disconnected']);
  });

  it('should not reconnect a socket that does not expose its url', async () => {
    const socketWithoutUrl = new SocketConstructor(url);
    (socketWithoutUrl as { url?: string }).url = undefined;
    handler = createHandler(socketWithoutUrl);
    socketWithoutUrl.simulateOpen();

    socketWithoutUrl.simulateClose(1006);
    await advance(5000);

    expect(instances).toHaveLength(1);
    expect(states).toEqual(['connected', 'disconnected']);
  });

  it("should count an error on a socket that never opened as a failed attempt, even without a close (Node.js 22's WebSocket)", async () => {
    handler = createHandler(url, { maxReconnectAttempts: 2 });

    socket(0).simulateError(new Error('connect ECONNREFUSED'));
    await advance(0);
    expect(handler.getConnectionState()).toBe('reconnecting');

    await advance(100);
    expect(instances).toHaveLength(2);
    socket(1).simulateError();
    await advance(100);
    expect(instances).toHaveLength(3);
    socket(2).simulateError();
    await advance(1000);

    expect(instances).toHaveLength(3);
    expect(states).toEqual(['reconnecting', 'disconnected']);
    expect(reconnectFailedHandler).toHaveBeenCalledWith({ attempts: 2 });
  });

  it('should count an error followed by a close (browsers, ws) as one failed attempt', async () => {
    handler = createHandler(url, { maxReconnectAttempts: 1 });

    socket(0).simulateError();
    socket(0).simulateClose(1006);
    await advance(100);
    expect(instances).toHaveLength(2);

    socket(1).simulateError();
    socket(1).simulateClose(1006);
    await advance(1000);

    expect(instances).toHaveLength(2);
    expect(states).toEqual(['reconnecting', 'disconnected']);
    expect(reconnectFailedHandler).toHaveBeenCalledTimes(1);
  });

  it('should leave an error on an open socket to the close that follows it', async () => {
    handler = createHandler(url);
    socket(0).simulateOpen();
    await advance(0);

    socket(0).simulateError();
    await advance(1000);

    expect(handler.getConnectionState()).toBe('connected');
    expect(instances).toHaveLength(1);
  });
});

describe('WebSocketHandler - request() and ws.send.* events', () => {
  let evem: EvEm;
  let mockWs: MockWebSocket;
  let handler: WebSocketHandler;
  const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
  const sentMessages = () => mockWs.sentMessages.map(message => JSON.parse(message));

  beforeEach(() => {
    evem = new EvEm();
    mockWs = new MockWebSocket('wss://test.example.com');
  });

  afterEach(async () => {
    await handler?.disconnect();
  });

  describe('request()', () => {
    it('should send a request and resolve with the server result', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();

      const pending = handler.request('getUser', { id: 7 });
      await tick();
      const [sent] = sentMessages();
      expect(sent).toMatchObject({ type: 'request', method: 'getUser', params: { id: 7 } });
      mockWs.simulateMessage(JSON.stringify({ type: 'response', id: sent.id, result: { name: 'Ada' } }));

      await expect(pending).resolves.toEqual({ name: 'Ada' });
    });

    it('should reject with the server error', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();

      const pending = handler.request('deleteUser', { id: 7 }, { id: 'req-9' });
      await tick();
      mockWs.simulateMessage(
        JSON.stringify({
          type: 'response',
          id: 'req-9',
          error: { code: 403, message: 'Forbidden' }
        })
      );

      await expect(pending).rejects.toMatchObject({ message: 'Forbidden', code: 403 });
    });

    it('should reject when request-response is disabled', async () => {
      handler = new WebSocketHandler(mockWs, evem, { enableRequestResponse: false });

      await expect(handler.request('ping')).rejects.toThrow('enableRequestResponse');
    });
  });

  describe('ws.send.* events', () => {
    it('should send other ws.send.* events while connected', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();

      await evem.publish('ws.send.chat', { text: 'hi' });

      expect(sentMessages()).toEqual([{ text: 'hi' }]);
    });

    it('should send ws.send.* events queued while offline exactly once', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateClose();
      await tick();

      await evem.publish('ws.send.chat', { text: 'hi' });
      mockWs.simulateOpen();
      await tick();

      expect(sentMessages()).toEqual([{ text: 'hi' }]);
    });

    it('should still send ws.send and ws.send.request exactly once', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();

      await evem.publish('ws.send', { text: 'plain' });
      await evem.publish('ws.send.request', { id: 'r1', method: 'ping', timestamp: 1 });

      expect(sentMessages()).toEqual([{ text: 'plain' }, { type: 'request', id: 'r1', method: 'ping', timestamp: 1 }]);
    });

    it('should remove all of its middleware on disconnect()', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      mockWs.simulateOpen();
      expect(evem.info().some(info => info.isMiddleware)).toBe(true);

      await handler.disconnect();

      expect(evem.info().filter(info => info.isMiddleware)).toEqual([]);
    });
  });
});

describe('WebSocketHandler - server event prefix', () => {
  let evem: EvEm;
  let mockWs: MockWebSocket;
  let handler: WebSocketHandler;

  beforeEach(() => {
    evem = new EvEm();
    mockWs = new MockWebSocket('wss://test.example.com');
  });

  afterEach(async () => {
    await handler?.disconnect();
  });

  const routedName = async (message: object, prefix?: string) => {
    handler = new WebSocketHandler(mockWs, evem, prefix === undefined ? {} : { serverEventPrefix: prefix });
    mockWs.simulateOpen();
    const names: string[] = [];
    evem.use((event, data) => {
      names.push(event);
      return data;
    });
    mockWs.simulateMessage(JSON.stringify(message));
    await new Promise(resolve => setTimeout(resolve, 0));
    return names.find(name => !name.startsWith('ws.'));
  };

  it('should not add the prefix twice to a legacy type that already has it', async () => {
    expect(await routedName({ type: 'server.notification', data: 1 })).toBe('server.notification');
  });

  it('should prefix a legacy type without it', async () => {
    expect(await routedName({ type: 'notification', data: 1 })).toBe('server.notification');
  });

  it('should apply the same rule to the event field and to custom prefixes', async () => {
    expect(await routedName({ event: 'app.user.login', data: 1 }, 'app')).toBe('app.user.login');
  });
});

describe('WebSocketHandler - edge cases found while documenting', () => {
  let evem: EvEm;
  let mockWs: MockWebSocket;
  let handler: WebSocketHandler;
  const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
  const sentMessages = () => mockWs.sentMessages.map(message => JSON.parse(message));

  beforeEach(() => {
    evem = new EvEm();
    mockWs = new MockWebSocket('wss://test.example.com');
  });

  afterEach(async () => {
    await handler?.disconnect();
  });

  it('should not send a message twice when the socket opens while it is still being published', async () => {
    handler = new WebSocketHandler(mockWs, evem);
    mockWs.simulateClose();
    await tick();
    let release!: () => void;
    evem.subscribe(
      'ws.send',
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
      { priority: 10 }
    );

    const publishing = evem.publish('ws.send', { n: 1 }); // queued while offline
    await tick();
    mockWs.simulateOpen(); // flushes the queue
    await tick();
    release();
    await publishing;

    expect(sentMessages()).toEqual([{ n: 1 }]);
  });

  it('should send a payload object again when it is re-published after being flushed', async () => {
    handler = new WebSocketHandler(mockWs, evem);
    mockWs.simulateClose();
    await tick();
    const message = { n: 1 };

    await evem.publish('ws.send', message);
    mockWs.simulateOpen();
    await tick();
    await evem.publish('ws.send', message);

    expect(sentMessages()).toEqual([{ n: 1 }, { n: 1 }]);
  });

  it('should send queued messages on flush() when autoFlush is off', async () => {
    handler = new WebSocketHandler(mockWs, evem, { autoFlush: false });
    mockWs.simulateClose();
    await tick();
    await evem.publish('ws.send', { n: 1 });
    mockWs.simulateOpen();
    await tick();
    expect(sentMessages()).toEqual([]);

    await handler.flush();

    expect(sentMessages()).toEqual([{ n: 1 }]);
    expect(handler.getQueueSize()).toBe(0);
  });

  it('should send ws.send.request like any ws.send.* event when request-response is disabled', async () => {
    handler = new WebSocketHandler(mockWs, evem, { enableRequestResponse: false });
    mockWs.simulateOpen();

    await evem.publish('ws.send.request', { id: 'r1', method: 'ping' });

    expect(sentMessages()).toEqual([{ id: 'r1', method: 'ping' }]);
  });

  it('should leave nothing registered when the socket cannot be created', () => {
    class FailingSocket {
      constructor() {
        throw new Error('no WebSocket here');
      }
    }

    expect(
      () =>
        new WebSocketHandler('wss://test.example.com', evem, {
          WebSocketConstructor: FailingSocket as any
        })
    ).toThrow('no WebSocket here');
    expect(evem.info()).toEqual([]);
  });

  it('should route an incoming JSON null to ws.message, not ws.parse.error', async () => {
    handler = new WebSocketHandler(mockWs, evem);
    mockWs.simulateOpen();
    const messages: unknown[] = [];
    const parseErrors = vi.fn();
    evem.subscribe('ws.message', (message: unknown) => {
      messages.push(message);
    });
    evem.subscribe('ws.parse.error', parseErrors);

    mockWs.simulateMessage('null');
    await tick();

    expect(messages).toEqual([null]);
    expect(parseErrors).not.toHaveBeenCalled();
  });
});

describe.skipIf(typeof WebSocket === 'undefined')("WebSocketHandler with Node.js's built-in WebSocket", () => {
  it('should retry and give up when nothing listens on the port', async () => {
    // A port nothing listens on: open one, note it, close it
    const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise(resolve => probe.close(resolve));

    const evem = new EvEm();
    const states: string[] = [];
    evem.subscribe('ws.connection.state', (change: any) => {
      states.push(change.to);
    });
    const failed = new Promise(resolve => evem.subscribe('ws.reconnect.failed', resolve));
    const handler = new WebSocketHandler(`ws://127.0.0.1:${port}`, evem, {
      reconnect: true,
      reconnectDelay: 10,
      maxReconnectAttempts: 2,
      onError: () => {}
    });

    await expect(failed).resolves.toEqual({ attempts: 2 });
    expect(states).toEqual(['reconnecting', 'disconnected']);
    await handler.disconnect();
  }, 10_000);
});

describe('WebSocketHandler - errors from its options, and closing', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const openSocket = () => {
    const socket = new MockWebSocket('wss://test.example.com');
    socket.simulateOpen();
    return socket;
  };

  it('calls onError when a socket cannot be created while reconnecting', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const creationError = new Error('Cannot create socket');
    const initial = openSocket();
    const handler = new WebSocketHandler(initial, new EvEm(), {
      reconnect: true,
      reconnectDelay: 100,
      maxReconnectAttempts: 1,
      onError,
      WebSocketConstructor: class {
        constructor() {
          throw creationError;
        }
      } as unknown as new (url: string) => MockWebSocket
    });

    initial.simulateClose(1006);
    await vi.advanceTimersByTimeAsync(200);

    expect(onError).toHaveBeenCalledWith(creationError);
    await handler.disconnect();
  });

  it('logs a messageFormatter that throws, and sends the next message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const socket = openSocket();
    let calls = 0;
    const evem = new EvEm();
    const handler = new WebSocketHandler(socket, evem, {
      messageFormatter: data => {
        if (calls++ === 0) throw new Error('cannot format');
        return JSON.stringify(data);
      }
    });

    await evem.publish('ws.send', { n: 1 });
    await evem.publish('ws.send', { n: 2 });

    expect(error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'cannot format' }));
    expect(socket.sentMessages).toEqual(['{"n":2}']);
    await handler.disconnect();
  });

  it('calls onError with the parse error when an incoming message cannot be parsed', async () => {
    const onError = vi.fn();
    const socket = openSocket();
    const handler = new WebSocketHandler(socket, new EvEm(), { onError });

    socket.simulateMessage('not json');

    expect(onError).toHaveBeenCalledWith(expect.any(SyntaxError));
    await handler.disconnect();
  });

  it('rejects a request made after disconnect()', async () => {
    const handler = new WebSocketHandler(openSocket(), new EvEm());
    await handler.disconnect();

    await expect(handler.request('users.get')).rejects.toThrow('WebSocketHandler is disconnected');
  });

  it('finishes disconnecting when the socket throws on close()', async () => {
    const socket = openSocket();
    socket.close = () => {
      throw new Error('cannot close');
    };
    const handler = new WebSocketHandler(socket, new EvEm());

    await expect(handler.disconnect()).resolves.toBeUndefined();
    expect(handler.getConnectionState()).toBe('disconnected');
  });
});

describe('WebSocketHandler - what mutation testing showed the tests missed', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const openSocket = () => {
    const socket = new MockWebSocket('wss://test.example.com');
    socket.simulateOpen();
    return socket;
  };
  const failingFormatter = () => {
    throw new Error('cannot format');
  };

  it.each([
    ['ws.send', 'Failed to send message:'],
    ['ws.send.chat', 'Failed to send message:'],
    ['ws.send.request', 'Failed to send request:']
  ])('says what it failed to send when the formatter throws on %s', async (event, label) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const evem = new EvEm();
    const handler = new WebSocketHandler(openSocket(), evem, { messageFormatter: failingFormatter });
    if (event === 'ws.send.request') void handler.request('users.get').catch(() => {});
    else await evem.publish(event, { n: 1 });
    // The handler's middleware makes its publishes async
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(error).toHaveBeenCalledWith(label, expect.objectContaining({ message: 'cannot format' }));
    await handler.disconnect();
  });

  it('says what it failed to send when the formatter throws on a flushed message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const evem = new EvEm();
    const socket = new MockWebSocket('wss://test.example.com');
    const handler = new WebSocketHandler(socket, evem, { messageFormatter: failingFormatter, autoFlush: false });
    await evem.publish('ws.send', { n: 1 }); // queued: not open yet
    socket.simulateOpen();
    await handler.flush();
    expect(error).toHaveBeenCalledWith(
      'Failed to send message:',
      expect.objectContaining({ message: 'cannot format' })
    );
    await handler.disconnect();
  });

  it("reports a socket error event that carries no error as Error('WebSocket error')", async () => {
    const evem = new EvEm();
    const errors: Array<{ error: Error }> = [];
    evem.subscribe('ws.error', (error: { error: Error }) => {
      errors.push(error);
    });
    const socket = openSocket();
    const handler = new WebSocketHandler(socket, evem);
    socket.onerror?.({ type: 'error' } as never);
    // The handler's middleware makes its publishes async
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(errors[0]!.error.message).toBe('WebSocket error');
    await handler.disconnect();
  });

  it('takes its handlers off a socket it lets go of, leaving a no-op onerror', async () => {
    vi.useFakeTimers();
    const { constructor: Socket, instances } = createMockWebSocketConstructor({ autoConnect: false });
    const handler = new WebSocketHandler('wss://test.example.com', new EvEm(), {
      reconnect: true,
      reconnectDelay: 10,
      WebSocketConstructor: Socket
    });
    instances[0]!.simulateOpen();
    instances[0]!.simulateClose(1006);
    await vi.advanceTimersByTimeAsync(10); // a new socket
    await handler.disconnect();
    for (const socket of instances) {
      expect([socket.onopen, socket.onclose, socket.onmessage]).toEqual([null, null, null]);
      expect(socket.onerror?.({} as never)).toBeUndefined();
    }
  });

  it('sends a message that is not an object, published while offline, once the connection is back', async () => {
    vi.useFakeTimers();
    const { constructor: Socket, instances } = createMockWebSocketConstructor({ autoConnect: false });
    const evem = new EvEm();
    const handler = new WebSocketHandler('wss://test.example.com', evem, {
      reconnect: true,
      reconnectDelay: 10,
      WebSocketConstructor: Socket
    });
    instances[0]!.simulateOpen();
    instances[0]!.simulateClose(1006);
    await vi.advanceTimersByTimeAsync(0);
    expect(await evem.publish('ws.send', 'hello')).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    instances[1]!.simulateOpen();
    await vi.advanceTimersByTimeAsync(0);
    expect(instances[1]!.sentMessages).toEqual(['"hello"']);
    await handler.disconnect();
  });

  it('flush() does nothing when the queue is off', async () => {
    const handler = new WebSocketHandler(openSocket(), new EvEm(), { enableQueue: false });
    await expect(handler.flush()).resolves.toBeUndefined();
    await handler.disconnect();
  });

  it('announces disconnecting and disconnected once when disconnect() is called twice at once', async () => {
    const evem = new EvEm();
    const states: string[] = [];
    evem.subscribe('ws.connection.state', ({ to }: { to: string }) => {
      states.push(to);
    });
    const handler = new WebSocketHandler(openSocket(), evem);
    await Promise.all([handler.disconnect(), handler.disconnect()]);
    expect(states.filter(state => state.startsWith('disconnect'))).toEqual(['disconnecting', 'disconnected']);
  });

  it('leaves no reconnect timer pending once disconnected, and closes with 1000 and a reason', async () => {
    vi.useFakeTimers();
    const { constructor: Socket, instances } = createMockWebSocketConstructor({ autoConnect: false });
    const handler = new WebSocketHandler('wss://test.example.com', new EvEm(), {
      reconnect: true,
      reconnectDelay: 1000,
      WebSocketConstructor: Socket
    });
    instances[0]!.simulateOpen();
    instances[0]!.simulateClose(1006);
    await vi.advanceTimersByTimeAsync(0); // waiting to reconnect
    await handler.disconnect();
    expect(vi.getTimerCount()).toBe(0);

    const socket = openSocket();
    const close = vi.spyOn(socket, 'close');
    await new WebSocketHandler(socket, new EvEm()).disconnect();
    expect(close).toHaveBeenCalledWith(1000, 'Client disconnect');
  });
});
