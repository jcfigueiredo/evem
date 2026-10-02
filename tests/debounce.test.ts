import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { EvEm } from '../src';

describe('Event debouncing', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('debounceTime should debounce events', async () => {
    const handler = vi.fn();
    
    // Subscribe with a 100ms debounce
    emitter.subscribe(
      'debounced.event', 
      handler,
      { debounceTime: 100 }
    );
    
    // Publish events in rapid succession
    await emitter.publish('debounced.event', 1);
    await emitter.publish('debounced.event', 2);
    await emitter.publish('debounced.event', 3);
    
    // Wait for debounce to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Only the last event should be processed
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(3);
  });

  test('debounceTime should work with multiple subscriptions independently', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    
    // Two subscriptions to the same event with different debounce times
    emitter.subscribe(
      'data.update', 
      handler1,
      { debounceTime: 50 }
    );
    
    emitter.subscribe(
      'data.update', 
      handler2,
      { debounceTime: 150 }
    );
    
    // Publish events in sequence
    await emitter.publish('data.update', 'first');
    
    // Wait for first debounce to complete but not second
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // First handler should have fired, second should still be waiting
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(0);
    
    // Publish another event
    await emitter.publish('data.update', 'second');
    
    // Wait for all debounces to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // First handler should have fired twice, second should have fired once with the latest value
    expect(handler1).toHaveBeenCalledTimes(2);
    expect(handler1).toHaveBeenCalledWith('first');
    expect(handler1).toHaveBeenCalledWith('second');
    
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith('second');
  });

  test('unsubscribing should cancel debounced events', async () => {
    const handler = vi.fn();
    
    // Subscribe with a longer debounce time
    const subId = emitter.subscribe(
      'debounced.cancel', 
      handler,
      { debounceTime: 200 }
    );
    
    // Publish an event
    await emitter.publish('debounced.cancel', 'test');
    
    // Unsubscribe before the debounce timer completes
    emitter.unsubscribeById(subId);
    
    // Wait longer than the debounce time
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Handler should never have been called
    expect(handler).not.toHaveBeenCalled();
  });
});
describe('Event debouncing - filters run first and errors are contained', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('an event rejected by a filter does not cancel a pending debounced event', async () => {
    const handler = vi.fn();
    emitter.subscribe('notification.received', handler, {
      debounceTime: 100,
      filter: (notification: { importance: string }) => notification.importance === 'high'
    });

    await emitter.publish('notification.received', { importance: 'high' });
    await emitter.publish('notification.received', { importance: 'low' });
    await vi.advanceTimersByTimeAsync(150);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ importance: 'high' });
  });

  test('a debounced callback that throws is logged instead of escaping the timer', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('handler bug');
    emitter.subscribe('window.resize', () => {
      throw error;
    }, { debounceTime: 50 });

    await emitter.publish('window.resize', { width: 800 });

    expect(() => vi.advanceTimersByTime(60)).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"window.resize"'), error);
  });

  test('an async debounced callback that rejects is logged instead of becoming unhandled', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const error = new Error('async handler bug');
    emitter.subscribe('window.resize', async () => {
      throw error;
    }, { debounceTime: 50 });

    await emitter.publish('window.resize', { width: 800 });
    await vi.advanceTimersByTimeAsync(60);
    vi.useRealTimers();
    await new Promise(resolve => setTimeout(resolve, 10));
    process.off('unhandledRejection', unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"window.resize"'), error);
  });

  test('a trailing throttle+debounce callback that throws is logged instead of escaping the timer', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    emitter.subscribe('user.typing', () => {
      if (++calls > 1) throw new Error('trailing bug');
    }, { throttleTime: 100, debounceTime: 50 });

    await emitter.publish('user.typing', 'a'); // Processed immediately
    await emitter.publish('user.typing', 'ab'); // Debounced (trailing)

    expect(() => vi.advanceTimersByTime(60)).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
