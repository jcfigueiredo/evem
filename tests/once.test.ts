import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '../src';

describe('Once-only events', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('subscribeOnce should automatically unsubscribe after the first event', async () => {
    const handler = vi.fn();
    
    // Subscribe with subscribeOnce
    emitter.subscribeOnce('test.once', handler);
    
    // Publish the event twice
    await emitter.publish('test.once', 'first call');
    await emitter.publish('test.once', 'second call');
    
    // Handler should only be called once with the first event
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('first call');
    expect(handler).not.toHaveBeenCalledWith('second call');
  });

  test('subscribe with { once: true } should automatically unsubscribe after the first event', async () => {
    const handler = vi.fn();
    
    // Subscribe with once: true option
    emitter.subscribe('test.once.option', handler, { once: true });
    
    // Publish the event twice
    await emitter.publish('test.once.option', 'first call');
    await emitter.publish('test.once.option', 'second call');
    
    // Handler should only be called once with the first event
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('first call');
    expect(handler).not.toHaveBeenCalledWith('second call');
  });

  test('once should work with wildcards', async () => {
    const handler = vi.fn();
    
    // Subscribe with wildcards
    emitter.subscribeOnce('test.*.once', handler);
    
    // Publish multiple matching events
    await emitter.publish('test.first.once', 'data1');
    await emitter.publish('test.second.once', 'data2');
    
    // Handler should be called once for the first matching event
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('data1');
  });

  test('once should work with a simple filter', async () => {
    const handler = vi.fn();
    
    // Simple higher-order function to create a filter
    const createFilter = (threshold: number) => (data: number): boolean => data > threshold;
    
    // Subscribe with once and filter
    emitter.subscribe('simple.filtered.once', handler, {
      once: true,
      filter: createFilter(10)
    });
    
    // First event is filtered out
    await emitter.publish('simple.filtered.once', 5);
    
    // Handler should not be called yet
    expect(handler).not.toHaveBeenCalled();
    
    // Second event passes the filter
    await emitter.publish('simple.filtered.once', 15);
    
    // Handler should be called once
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(15);
    
    // Reset handler mock to clearly see next call
    handler.mockClear();
    
    // Third event should not be received since we unsubscribed
    await emitter.publish('simple.filtered.once', 20);
    
    // Handler should not be called again
    expect(handler).not.toHaveBeenCalled();
  });

  test('once should work with debouncing', async () => {
    const handler = vi.fn();
    
    // Subscribe with once and debounce
    emitter.subscribeOnce('debounced.once', handler, {
      debounceTime: 50
    });
    
    // Publish multiple events in rapid succession
    await emitter.publish('debounced.once', 'first');
    await emitter.publish('debounced.once', 'second');
    await emitter.publish('debounced.once', 'third');
    
    // None should be processed yet due to debounce
    expect(handler).not.toHaveBeenCalled();
    
    // Wait for debounce to complete
    await new Promise(resolve => setTimeout(resolve, 60));
    
    // Only the last event should be processed, and then unsubscribed
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('third');
    
    // Additional event should not be processed
    await emitter.publish('debounced.once', 'fourth');
    
    // Wait again to ensure debounce completes
    await new Promise(resolve => setTimeout(resolve, 60));
    
    // Still only called once
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('once should work with throttling', async () => {
    const handler = vi.fn();
    
    // Subscribe with once and throttle
    emitter.subscribeOnce('throttled.once', handler, {
      throttleTime: 100
    });
    
    // First event should be processed immediately and unsubscribe
    await emitter.publish('throttled.once', 'first');
    
    // Handler should be called and unsubscribed
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('first');
    
    // Additional events should not trigger anything
    await emitter.publish('throttled.once', 'second');
    
    // Wait for throttle window to expire
    await new Promise(resolve => setTimeout(resolve, 110));
    
    // Still only called once
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('unsubscribing should work before the once event is triggered', async () => {
    const handler = vi.fn();
    
    // Subscribe with once
    const id = emitter.subscribeOnce('test.cancel.once', handler);
    
    // Unsubscribe before the event is triggered
    emitter.unsubscribeById(id);
    
    // Publish an event
    await emitter.publish('test.cancel.once', 'data');
    
    // Handler should not be called
    expect(handler).not.toHaveBeenCalled();
  });
  
  test('once should properly handle async callbacks', async () => {
    const handler = vi.fn(async (data: string) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      // Process data but don't return anything
    });
    
    // Subscribe with once
    emitter.subscribeOnce('async.once', handler);
    
    // Publish event
    await emitter.publish('async.once', 'data');
    
    // Handler should be called once
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('data');
    
    // Publish again
    await emitter.publish('async.once', 'more-data');
    
    // Still only called once
    expect(handler).toHaveBeenCalledTimes(1);
  });
});