import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { MessageQueue } from '../../src/websocket/MessageQueue';
import { ConnectionManager } from '../../src/websocket/ConnectionManager';

describe('MessageQueue', () => {
  let evem: EvEm;
  let connectionManager: ConnectionManager;
  let messageQueue: MessageQueue;

  beforeEach(() => {
    evem = new EvEm();
    connectionManager = new ConnectionManager(evem);
    messageQueue = new MessageQueue(evem, connectionManager);
  });

  describe('Initialization', () => {
    it('should initialize with history disabled by default', () => {
      expect(messageQueue.isEnabled()).toBe(false);
      expect(messageQueue.getQueueSize()).toBe(0);
    });

    it('should enable history when enable() is called', () => {
      messageQueue.enable(50);
      expect(messageQueue.isEnabled()).toBe(true);
    });

    it('should use default queue size of 100 if not specified', () => {
      messageQueue.enable();
      expect(messageQueue.getMaxSize()).toBe(100);
    });

    it('should use custom queue size when specified', () => {
      messageQueue.enable(250);
      expect(messageQueue.getMaxSize()).toBe(250);
    });
  });

  describe('Queueing Messages', () => {
    beforeEach(() => {
      messageQueue.enable(100);
    });

    it('should queue messages published to ws.send while disconnected', async () => {
      // Disconnected by default
      await evem.publish('ws.send', { type: 'message', data: 'hello' });
      await evem.publish('ws.send', { type: 'message', data: 'world' });

      expect(messageQueue.getQueueSize()).toBe(2);
    });

    it('should not queue messages when connected', async () => {
      await connectionManager.transitionTo('connected');

      await evem.publish('ws.send', { type: 'message', data: 'hello' });

      // Should not be queued since we're connected
      expect(messageQueue.getQueueSize()).toBe(0);
    });

    it('should queue messages in FIFO order', async () => {
      const messages: string[] = [];

      evem.subscribe('ws.send.queued', (data: any) => {
        messages.push(data.data);
      });

      await evem.publish('ws.send', { data: 'first' });
      await evem.publish('ws.send', { data: 'second' });
      await evem.publish('ws.send', { data: 'third' });

      // Flush should replay in order
      await messageQueue.flush();

      expect(messages).toEqual(['first', 'second', 'third']);
    });

    it('should queue messages with wildcards', async () => {
      await evem.publish('ws.send.message', { type: 'chat', text: 'hello' });
      await evem.publish('ws.send.command', { type: 'ping' });

      expect(messageQueue.getQueueSize()).toBe(2);
    });
  });

  describe('Flushing Queue', () => {
    beforeEach(() => {
      messageQueue.enable(100);
    });

    it('should flush queued messages', async () => {
      const flushedMessages: any[] = [];

      evem.subscribe('ws.send.queued', (data: any) => {
        flushedMessages.push(data);
      });

      await evem.publish('ws.send', { id: 1, text: 'msg1' });
      await evem.publish('ws.send', { id: 2, text: 'msg2' });

      await messageQueue.flush();

      expect(flushedMessages).toHaveLength(2);
      expect(flushedMessages[0]).toMatchObject({ id: 1, text: 'msg1' });
      expect(flushedMessages[1]).toMatchObject({ id: 2, text: 'msg2' });
    });

    it('should clear queue after flush', async () => {
      await evem.publish('ws.send', { data: 'test' });
      expect(messageQueue.getQueueSize()).toBe(1);

      await messageQueue.flush();

      expect(messageQueue.getQueueSize()).toBe(0);
    });

    it('should handle empty queue flush', async () => {
      await expect(messageQueue.flush()).resolves.not.toThrow();
    });

    it('should handle multiple flushes', async () => {
      const flushed: any[] = [];
      evem.subscribe('ws.send.queued', (data: any) => flushed.push(data));

      await evem.publish('ws.send', { msg: 1 });
      await messageQueue.flush();

      await evem.publish('ws.send', { msg: 2 });
      await messageQueue.flush();

      expect(flushed).toHaveLength(2);
      expect(flushed[0]).toMatchObject({ msg: 1 });
      expect(flushed[1]).toMatchObject({ msg: 2 });
    });
  });

  describe('Queue Size Limits', () => {
    it('should respect maximum queue size', async () => {
      messageQueue.enable(3); // Max 3 messages

      await evem.publish('ws.send', { id: 1 });
      await evem.publish('ws.send', { id: 2 });
      await evem.publish('ws.send', { id: 3 });

      expect(messageQueue.getQueueSize()).toBe(3);
    });

    it('should handle queue overflow by dropping oldest messages', async () => {
      messageQueue.enable(2); // Max 2 messages

      await evem.publish('ws.send', { id: 1 });
      await evem.publish('ws.send', { id: 2 });
      await evem.publish('ws.send', { id: 3 }); // Should drop id:1

      expect(messageQueue.getQueueSize()).toBe(2);

      const flushed: any[] = [];
      evem.subscribe('ws.send.queued', (data: any) => flushed.push(data));
      await messageQueue.flush();

      // Should have ids 2 and 3, not 1
      expect(flushed).toHaveLength(2);
      expect(flushed[0]).toMatchObject({ id: 2 });
      expect(flushed[1]).toMatchObject({ id: 3 });
    });

    it('should emit overflow event when queue is full', async () => {
      const overflowEvents: any[] = [];
      messageQueue.enable(2);

      evem.subscribe('ws.queue.overflow', (data: any) => {
        overflowEvents.push(data);
      });

      await evem.publish('ws.send', { id: 1 });
      await evem.publish('ws.send', { id: 2 });
      await evem.publish('ws.send', { id: 3 }); // Overflow

      expect(overflowEvents).toHaveLength(1);
      expect(overflowEvents[0]).toMatchObject({
        maxSize: 2,
        droppedMessage: expect.objectContaining({ id: 1 }),
      });
    });
  });

  describe('Clear Queue', () => {
    beforeEach(() => {
      messageQueue.enable(100);
    });

    it('should clear all queued messages', async () => {
      await evem.publish('ws.send', { msg: 1 });
      await evem.publish('ws.send', { msg: 2 });
      await evem.publish('ws.send', { msg: 3 });

      expect(messageQueue.getQueueSize()).toBe(3);

      messageQueue.clear();

      expect(messageQueue.getQueueSize()).toBe(0);
    });

    it('should allow queueing after clear', async () => {
      await evem.publish('ws.send', { msg: 1 });
      messageQueue.clear();

      await evem.publish('ws.send', { msg: 2 });

      expect(messageQueue.getQueueSize()).toBe(1);
    });
  });

  describe('Connection State Integration', () => {
    beforeEach(() => {
      messageQueue.enable(100);
    });

    it('should queue messages when disconnected', async () => {
      expect(connectionManager.isConnected()).toBe(false);

      await evem.publish('ws.send', { data: 'test' });

      expect(messageQueue.getQueueSize()).toBe(1);
    });

    it('should not queue messages when connected', async () => {
      await connectionManager.transitionTo('connected');

      await evem.publish('ws.send', { data: 'test' });

      expect(messageQueue.getQueueSize()).toBe(0);
    });

    it('should queue messages during connecting state', async () => {
      await connectionManager.transitionTo('connecting');

      await evem.publish('ws.send', { data: 'test' });

      expect(messageQueue.getQueueSize()).toBe(1);
    });

    it('should queue messages during reconnecting state', async () => {
      await connectionManager.transitionTo('reconnecting');

      await evem.publish('ws.send', { data: 'test' });

      expect(messageQueue.getQueueSize()).toBe(1);
    });

    it('should queue messages during disconnecting state', async () => {
      await connectionManager.transitionTo('disconnecting');

      await evem.publish('ws.send', { data: 'test' });

      expect(messageQueue.getQueueSize()).toBe(1);
    });
  });

  describe('Auto-flush on Connection', () => {
    beforeEach(() => {
      messageQueue.enable(100, { autoFlush: true });
    });

    it('should automatically flush queue when connecting to connected', async () => {
      const flushed: any[] = [];
      evem.subscribe('ws.send.queued', (data: any) => flushed.push(data));

      // Queue messages while disconnected
      await evem.publish('ws.send', { msg: 1 });
      await evem.publish('ws.send', { msg: 2 });

      expect(messageQueue.getQueueSize()).toBe(2);

      // Transition to connected should auto-flush
      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');

      expect(flushed).toHaveLength(2);
      expect(messageQueue.getQueueSize()).toBe(0);
    });

    it('should respect autoFlush configuration on initial enable', async () => {
      // NOTE: This test creates a fresh MessageQueue to avoid state from beforeEach
      // Edge case: disable/enable cycles may have subscription timing nuances
      const freshEvem = new EvEm();
      const freshConnectionManager = new ConnectionManager(freshEvem);
      const freshQueue = new MessageQueue(freshEvem, freshConnectionManager);

      // Enable with autoFlush: false from the start
      freshQueue.enable(100, { autoFlush: false });

      const flushed: any[] = [];
      freshEvem.subscribe('ws.send.queued', (data: any) => flushed.push(data));

      await freshEvem.publish('ws.send', { msg: 1 });

      await freshConnectionManager.transitionTo('connected');

      // Should not auto-flush since autoFlush was false on initial enable
      expect(flushed).toHaveLength(0);
      expect(freshQueue.getQueueSize()).toBe(1);
    });
  });

  describe('Disable/Enable', () => {
    it('should stop queueing when disabled', async () => {
      messageQueue.enable(100);
      await evem.publish('ws.send', { msg: 1 });

      expect(messageQueue.getQueueSize()).toBe(1);

      messageQueue.disable();

      await evem.publish('ws.send', { msg: 2 });

      // Should still be 1, not queuing anymore
      expect(messageQueue.getQueueSize()).toBe(1);
    });

    it('should preserve queue when disabled', async () => {
      messageQueue.enable(100);
      await evem.publish('ws.send', { msg: 1 });

      messageQueue.disable();

      expect(messageQueue.getQueueSize()).toBe(1);
    });

    it('should resume queueing when re-enabled', async () => {
      messageQueue.enable(100);
      await evem.publish('ws.send', { msg: 1 });

      messageQueue.disable();
      messageQueue.enable(100);

      await evem.publish('ws.send', { msg: 2 });

      expect(messageQueue.getQueueSize()).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapidly queued messages', async () => {
      // Create EvEm with higher recursion limit for this test
      const highLimitEvem = new EvEm(150);
      const highLimitConnectionManager = new ConnectionManager(highLimitEvem);
      const highLimitMessageQueue = new MessageQueue(highLimitEvem, highLimitConnectionManager);

      highLimitMessageQueue.enable(1000);

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(highLimitEvem.publish('ws.send', { id: i }));
      }

      await Promise.all(promises);

      expect(highLimitMessageQueue.getQueueSize()).toBe(100);
    });

    it('should handle large message payloads', async () => {
      messageQueue.enable(10);

      const largeData = { data: 'x'.repeat(10000) };
      await evem.publish('ws.send', largeData);

      expect(messageQueue.getQueueSize()).toBe(1);

      const flushed: any[] = [];
      evem.subscribe('ws.send.queued', (data: any) => flushed.push(data));
      await messageQueue.flush();

      expect(flushed[0].data).toHaveLength(10000);
    });

    it('should handle queue operations during flush', async () => {
      messageQueue.enable(100);

      await evem.publish('ws.send', { msg: 1 });

      // Start flush
      const flushPromise = messageQueue.flush();

      // Try to queue during flush
      await evem.publish('ws.send', { msg: 2 });

      await flushPromise;

      // msg2 should be queued separately
      expect(messageQueue.getQueueSize()).toBe(1);
    });
  });

  describe('Integration with EvEm Features', () => {
    beforeEach(() => {
      messageQueue.enable(100);
    });

    it('should work with event filters', async () => {
      const filtered: any[] = [];

      evem.subscribe(
        'ws.send.queued',
        (data: any) => filtered.push(data),
        {
          filter: (data: any) => data.priority === 'high',
        }
      );

      await evem.publish('ws.send', { id: 1, priority: 'low' });
      await evem.publish('ws.send', { id: 2, priority: 'high' });
      await evem.publish('ws.send', { id: 3, priority: 'low' });

      await messageQueue.flush();

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toMatchObject({ id: 2, priority: 'high' });
    });

    it('should work with transforms', async () => {
      const transformed: string[] = [];

      evem.subscribe(
        'ws.send.queued',
        (data: any) => {
          // First subscriber receives original
        },
        {
          transform: (data: any) => JSON.stringify(data),
        }
      );

      evem.subscribe('ws.send.queued', (data: string) => {
        transformed.push(data);
      });

      await evem.publish('ws.send', { msg: 'test' });
      await messageQueue.flush();

      expect(transformed).toHaveLength(1);
      expect(transformed[0]).toBe('{"msg":"test"}');
    });

    it('should work with priority subscribers', async () => {
      const executionOrder: string[] = [];

      evem.subscribe(
        'ws.send.queued',
        () => executionOrder.push('high'),
        { priority: 'high' }
      );
      evem.subscribe(
        'ws.send.queued',
        () => executionOrder.push('low'),
        { priority: 'low' }
      );
      evem.subscribe('ws.send.queued', () => executionOrder.push('normal'));

      await evem.publish('ws.send', { msg: 'test' });
      await messageQueue.flush();

      expect(executionOrder).toEqual(['high', 'normal', 'low']);
    });
  });
});
