import { describe, test, expect, vi, beforeEach } from 'vitest';
import { EvEm } from '../src';

describe('Event throttling', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('throttleTime should limit event frequency', async () => {
    const handler = vi.fn();
    
    // Subscribe with a 100ms throttle
    emitter.subscribe(
      'throttled.event', 
      handler,
      { throttleTime: 100 }
    );
    
    // Publish multiple events in rapid succession
    await emitter.publish('throttled.event', 1); // This one should be processed immediately
    await emitter.publish('throttled.event', 2); // This one should be ignored (within throttle window)
    await emitter.publish('throttled.event', 3); // This one should be ignored (within throttle window)
    
    // First event should be processed immediately
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
    
    // Wait for throttle window to expire
    await new Promise(resolve => setTimeout(resolve, 110));
    
    // Publish another event after throttle window
    await emitter.publish('throttled.event', 4); // This one should be processed
    
    // Now we should have processed 1 and 4
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(4);
  });

  test('throttleTime should process first event of each window', async () => {
    const handler = vi.fn();
    
    // Subscribe with a throttle
    emitter.subscribe(
      'throttled.sequence', 
      handler,
      { throttleTime: 50 }
    );
    
    // First window
    await emitter.publish('throttled.sequence', 'A1'); // Should be processed immediately
    await emitter.publish('throttled.sequence', 'A2'); // Should be ignored
    await emitter.publish('throttled.sequence', 'A3'); // Should be ignored
    
    // Wait for throttle window to expire
    await new Promise(resolve => setTimeout(resolve, 60));
    
    // Second window
    await emitter.publish('throttled.sequence', 'B1'); // Should be processed immediately
    await emitter.publish('throttled.sequence', 'B2'); // Should be ignored
    
    // Wait for throttle window to expire
    await new Promise(resolve => setTimeout(resolve, 60));
    
    // Third window
    await emitter.publish('throttled.sequence', 'C1'); // Should be processed immediately
    
    // First event of each window should be processed
    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(1, 'A1');
    expect(handler).toHaveBeenNthCalledWith(2, 'B1');
    expect(handler).toHaveBeenNthCalledWith(3, 'C1');
  });

  test('throttleTime should work with filters', async () => {
    const handler = vi.fn();
    
    // Subscribe with throttle and filter
    emitter.subscribe(
      'data.stream', 
      handler,
      { 
        throttleTime: 100,
        filter: (data: { value: number }) => data.value > 10 // Only process values > 10
      }
    );
    
    // First, let's send an event that should pass both filter and throttle
    await emitter.publish('data.stream', { value: 15 }); // Passes filter, processed immediately
    
    // Verify it was processed
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 15 });
    handler.mockClear();
    
    // Send events that should be filtered out
    await emitter.publish('data.stream', { value: 5 });  // Filtered out (< 10)
    await emitter.publish('data.stream', { value: 8 });  // Filtered out (< 10)
    
    // No calls should have happened
    expect(handler).not.toHaveBeenCalled();
    
    // Send more events within throttle window
    await emitter.publish('data.stream', { value: 20 }); // Filtered in, but throttled out
    await emitter.publish('data.stream', { value: 25 }); // Filtered in, but throttled out
    
    // Still no calls because of throttling
    expect(handler).not.toHaveBeenCalled();
    
    // Wait for throttle window to expire
    await new Promise(resolve => setTimeout(resolve, 110));
    
    // New throttle window - this should go through
    await emitter.publish('data.stream', { value: 30 }); // Passes filter, processed
    
    // Verify it was processed
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 30 });
  });

  test('unsubscribing should clean up throttle timers', async () => {
    const handler = vi.fn();
    
    // Subscribe with throttle
    const subId = emitter.subscribe(
      'throttled.unsub', 
      handler,
      { throttleTime: 100 }
    );
    
    // Publish first event
    await emitter.publish('throttled.unsub', 'first');
    expect(handler).toHaveBeenCalledTimes(1);
    
    // Unsubscribe
    emitter.unsubscribeById(subId);
    
    // Wait for throttle window to expire
    await new Promise(resolve => setTimeout(resolve, 110));
    
    // Publish another event
    await emitter.publish('throttled.unsub', 'second');
    
    // Should not receive any more events
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalledWith('second');
  });

  test('throttle and debounce can be used in the same subscription', async () => {
    const handler = vi.fn();
    
    // Subscribe with both throttle and debounce
    emitter.subscribe(
      'both.event', 
      handler, 
      { 
        throttleTime: 100,
        debounceTime: 100
      }
    );
    
    // First event is processed immediately due to throttle
    await emitter.publish('both.event', 'first');
    
    // Check that it's been processed (throttle lets first event through immediately)
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('first');
    handler.mockClear();
    
    // These events will be throttled and last one will be debounced
    await emitter.publish('both.event', 'second');
    await emitter.publish('both.event', 'third');
    
    // Nothing processed yet due to debounce
    expect(handler).not.toHaveBeenCalled();
    
    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Last event should be processed after debounce
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('third');
  });
});