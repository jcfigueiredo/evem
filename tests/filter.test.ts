import { describe, test, expect, vi, beforeEach } from 'vitest';
import { EvEm } from '../src';

describe('Event filtering', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('filter should create a filtered event stream', async () => {
    const handler = vi.fn();
    
    // Subscribe with a filter that only processes events with data.value > 10
    const subscriptionId = emitter.subscribe(
      'data.received', 
      handler,
      { filter: (data: { value: number }) => data.value > 10 }
    );
    
    // These should be filtered out
    await emitter.publish('data.received', { value: 5 });
    await emitter.publish('data.received', { value: 10 });
    
    // These should pass through the filter
    await emitter.publish('data.received', { value: 11 });
    await emitter.publish('data.received', { value: 20 });
    
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({ value: 11 });
    expect(handler).toHaveBeenCalledWith({ value: 20 });
    
    // Cleanup
    emitter.unsubscribeById(subscriptionId);
  });

  test('filter should work with wildcard events', async () => {
    const handler = vi.fn();
    
    emitter.subscribe(
      'data.*', 
      handler,
      { 
        filter: (data: { type: string, value: number }) => 
          data.type === 'important' && data.value > 5 
      }
    );
    
    // Should be filtered out (wrong type)
    await emitter.publish('data.received', { type: 'normal', value: 10 });
    
    // Should be filtered out (value too low)
    await emitter.publish('data.received', { type: 'important', value: 3 });
    
    // Should pass through
    await emitter.publish('data.received', { type: 'important', value: 10 });
    await emitter.publish('data.updated', { type: 'important', value: 7 });
    
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('filtered subscriptions should be unsubscribable', async () => {
    const handler = vi.fn();
    
    const id = emitter.subscribe(
      'test.event', 
      handler, 
      { filter: (data: number) => data > 5 }
    );
    
    await emitter.publish('test.event', 10);
    expect(handler).toHaveBeenCalledTimes(1);
    
    emitter.unsubscribeById(id);
    
    await emitter.publish('test.event', 10);
    expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
  });

  test('filtered subscription should handle async predicates', async () => {
    const handler = vi.fn();
    
    // Create an async filter predicate
    emitter.subscribe(
      'async.data', 
      handler,
      {
        filter: async (data: number) => {
          // simulate async validation
          await new Promise(resolve => setTimeout(resolve, 10));
          return data % 2 === 0; // only even numbers
        }
      }
    );
    
    await emitter.publish('async.data', 1);
    await emitter.publish('async.data', 2);
    await emitter.publish('async.data', 3);
    await emitter.publish('async.data', 4);
    
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(2);
    expect(handler).toHaveBeenCalledWith(4);
  });

  test('multiple filters should work correctly', async () => {
    const handler = vi.fn();
    
    // Subscribe with multiple filters
    emitter.subscribe(
      'numbers', 
      handler,
      { 
        filter: [
          // First filter: only numbers > 5
          (n: number) => n > 5,
          // Second filter: only even numbers
          (n: number) => n % 2 === 0
        ]
      }
    );
    
    await emitter.publish('numbers', 2); // Too small
    await emitter.publish('numbers', 7); // Not even
    await emitter.publish('numbers', 8); // Should pass both filters
    await emitter.publish('numbers', 10); // Should pass both filters
    
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(8);
    expect(handler).toHaveBeenCalledWith(10);
  });
});