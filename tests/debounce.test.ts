import { describe, test, expect, vi, beforeEach } from 'vitest';
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