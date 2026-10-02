import { loadInlineClasses } from './demoPages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for the WebSocket demo pages' inline adapter classes.
 *
 * websocket-demo.html: "Request (2s timeout)" sent nothing and always logged "Request timed out!"
 * after 2s. It now goes through an inline RequestResponseManager (like src/websocket's) that
 * correlates the response by request id, resolves on it, clears its timer, and rejects on timeout.
 *
 * chat-demo.html: with lag simulated, a message sent just before the connection dropped was lost
 * (never shown, not queued). Messages still in flight now go back to the queue and are delivered
 * after reconnecting.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('demo pages: websocket-demo.html request-response', () => {
  function setup() {
    const { classes } = loadInlineClasses('websocket-demo.html', ['EvEm', 'RequestResponseManager']);
    const evem = new classes.EvEm!();
    const requestManager = new classes.RequestResponseManager!(evem);
    const sent: any[] = [];
    evem.subscribe('ws.send', (message: unknown) => {
      sent.push(message);
    });
    return { evem, requestManager, sent };
  }

  it('sends the request and resolves with the result of the response that has its id', async () => {
    const { evem, requestManager, sent } = setup();

    const response = requestManager.request('getUser', { id: 123 }, { id: 'req-1', timeout: 2000 });
    expect(sent).toEqual([{ type: 'request', id: 'req-1', method: 'getUser', params: { id: 123 } }]);
    expect(requestManager.getPendingRequestCount()).toBe(1);

    // A response to another request is ignored
    await evem.publish('ws.response', { type: 'response', id: 'req-other', result: 'wrong' });
    expect(requestManager.getPendingRequestCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    await evem.publish('ws.response', { type: 'response', id: 'req-1', result: { user: 'John Doe', id: 123 } });

    await expect(response).resolves.toEqual({ user: 'John Doe', id: 123 });
    expect(requestManager.getPendingRequestCount()).toBe(0);
    // The timeout was cleared: nothing is left to fire
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects when no response arrives within the timeout, and ignores a late response', async () => {
    const { evem, requestManager } = setup();

    const response = requestManager.request('getUser', { id: 123 }, { id: 'req-1', timeout: 2000 });
    const outcome = response.then(
      () => 'resolved',
      (error: Error) => error.message
    );

    await vi.advanceTimersByTimeAsync(1999);
    expect(requestManager.getPendingRequestCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await outcome).toBe('No response to req-1 within 2000ms');
    expect(requestManager.getPendingRequestCount()).toBe(0);

    await evem.publish('ws.response', { type: 'response', id: 'req-1', result: 'late' });
    expect(requestManager.getPendingRequestCount()).toBe(0);
  });
});

describe('demo pages: chat-demo.html offline delivery', () => {
  const LAG = 2000;

  /** The chat page's wiring: queue offline, deliver after the simulated lag, requeue on disconnect */
  function setup() {
    const { classes } = loadInlineClasses('chat-demo.html', [
      'EvEm',
      'ConnectionManager',
      'MessageQueue',
      'SimulatedLink'
    ]);
    const evem = new classes.EvEm!();
    const connectionManager = new classes.ConnectionManager!(evem);
    const messageQueue = new classes.MessageQueue!(evem, connectionManager);
    const delivered: string[] = [];
    const link = new classes.SimulatedLink!(connectionManager, messageQueue, (message: { text: string }) => {
      delivered.push(message.text);
    });

    messageQueue.enable();
    evem.subscribe('ws.send.queued', (message: unknown) => {
      link.send(message, LAG);
    });
    evem.subscribe('ws.connection.state', (event: { to: string }) => {
      if (event.to === 'disconnected') link.requeueInFlight();
    });

    const send = (text: string) => evem.publish('ws.send', { user: 'You', text, timestamp: Date.now() });
    /** Change the connection state, letting the timers of a flush run */
    const transitionTo = async (state: string) => {
      const done = connectionManager.transitionTo(state);
      await vi.advanceTimersByTimeAsync(500);
      await done;
    };
    return { connectionManager, messageQueue, delivered, send, transitionTo };
  }

  it('delivers a message after the lag while connected', async () => {
    const { messageQueue, delivered, send, transitionTo } = setup();
    await transitionTo('connected');

    await send('hello');
    await vi.advanceTimersByTimeAsync(LAG);

    expect(delivered).toEqual(['hello']);
    expect(messageQueue.getQueueSize()).toBe(0);
  });

  it('puts a message still in flight back in the queue when the connection drops, and delivers it after reconnecting', async () => {
    const { messageQueue, delivered, send, transitionTo } = setup();
    await transitionTo('connected');

    await send('in flight');
    await vi.advanceTimersByTimeAsync(LAG / 2);
    await transitionTo('disconnected');

    expect(messageQueue.getQueueSize()).toBe(1);
    await send('sent offline');
    await vi.advanceTimersByTimeAsync(LAG * 2);
    expect(delivered).toEqual([]);
    expect(messageQueue.queue.map((message: { text: string }) => message.text)).toEqual(['in flight', 'sent offline']);

    await transitionTo('connected');
    await vi.advanceTimersByTimeAsync(LAG * 2);

    expect(delivered).toEqual(['in flight', 'sent offline']);
    expect(messageQueue.getQueueSize()).toBe(0);
  });

  it('keeps the rest of the queue when the connection drops during a flush', async () => {
    const { connectionManager, messageQueue, delivered, send, transitionTo } = setup();
    for (const text of ['one', 'two', 'three']) {
      await send(text);
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(messageQueue.getQueueSize()).toBe(3);

    // The flush sends a message every 100ms: drop the connection after "one" and "two" went out
    const connecting = connectionManager.transitionTo('connected');
    await vi.advanceTimersByTimeAsync(150);
    await transitionTo('disconnected');
    await connecting;
    await vi.advanceTimersByTimeAsync(LAG * 2);

    expect(delivered).toEqual([]);
    expect(messageQueue.queue.map((message: { text: string }) => message.text)).toEqual(['one', 'two', 'three']);

    await transitionTo('connected');
    await vi.advanceTimersByTimeAsync(LAG * 2);
    expect(delivered).toEqual(['one', 'two', 'three']);
    expect(messageQueue.getQueueSize()).toBe(0);
  });
});
