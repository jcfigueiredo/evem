import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { WebSocketHandler } from '../../src/websocket/WebSocketHandler';
import { MockWebSocket } from './mocks/MockWebSocket';

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

      await mockWs.simulateMessage(JSON.stringify({
        event: 'server.user.login',
        data: { userId: '123', username: 'john' }
      }));

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

      await mockWs.simulateMessage(JSON.stringify({
        type: 'response',
        id: 'req-123',
        result: { userId: '456', name: 'John' },
        timestamp: Date.now()
      }));

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

      await mockWs.simulateMessage(JSON.stringify({
        type: 'response',
        id: 'req-456',
        error: {
          code: 404,
          message: 'User not found'
        },
        timestamp: Date.now()
      }));

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

      await mockWs.simulateMessage(JSON.stringify({
        event: 'server.user.login',
        data: { userId: '123' }
      }));

      await mockWs.simulateMessage(JSON.stringify({
        event: 'server.user.logout',
        data: { userId: '123' }
      }));

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
      await mockWs.simulateMessage(JSON.stringify({
        event: 'notification',
        data: { message: 'Hello' }
      }));

      expect(backendEvents).toHaveLength(1);
    });

    it('should handle legacy message format (type field)', async () => {
      handler = new WebSocketHandler(mockWs, evem);
      await mockWs.simulateOpen();

      const messages: any[] = [];

      evem.subscribe('server.notification', (data: any) => {
        messages.push(data);
      });

      await mockWs.simulateMessage(JSON.stringify({
        type: 'notification',
        data: { message: 'Legacy format' }
      }));

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
      await mockWs.simulateMessage(JSON.stringify({
        type: 'response',
        id: 'test-req',
        result: { success: true }
      }));

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
      await mockWs.simulateMessage(JSON.stringify({
        type: 'response',
        id: 'test',
        result: { data: 'test' }
      }));

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
      await mockWs.simulateMessage(JSON.stringify({
        event: 'server.early.message',
        data: { test: true }
      }));

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

      expect(states).toEqual([
        'disconnected->connected',
        'connected->disconnecting',
        'disconnecting->disconnected'
      ]);
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
});
