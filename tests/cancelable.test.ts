import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '../src';

describe('Cancelable Events Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should be able to cancel an event', async () => {
    const executed: string[] = [];
    
    // First handler that cancels the event
    emitter.subscribe('test.cancelable', (event) => {
      executed.push('first');
      event.cancel();
    });
    
    // Second handler that should not be executed due to cancellation
    emitter.subscribe('test.cancelable', () => {
      executed.push('second');
    });
    
    // Publish a cancelable event
    const result = await emitter.publish('test.cancelable', {}, { cancelable: true });
    
    // Verify only the first handler was executed
    expect(executed).toEqual(['first']);
    // Verify the result indicates the event was canceled
    expect(result).toBe(false);
  });

  test('canceling event should work with priorities', async () => {
    const executed: string[] = [];
    
    // High priority handler cancels the event
    emitter.subscribe('priority.cancel', (event) => {
      executed.push('high');
      event.cancel();
    }, { priority: 'high' });
    
    // Normal priority handler should not execute
    emitter.subscribe('priority.cancel', () => {
      executed.push('normal');
    });
    
    // Low priority handler should not execute
    emitter.subscribe('priority.cancel', () => {
      executed.push('low');
    }, { priority: 'low' });
    
    const result = await emitter.publish('priority.cancel', {}, { cancelable: true });
    
    expect(executed).toEqual(['high']);
    expect(result).toBe(false);
  });

  test('non-cancelable events should ignore cancel calls', async () => {
    const executed: string[] = [];
    
    // First handler tries to cancel a non-cancelable event
    emitter.subscribe('non.cancelable', (event) => {
      executed.push('first');
      // This should do nothing since the event is not cancelable
      if (typeof event.cancel === 'function') {
        event.cancel();
      }
    });
    
    // Second handler should still execute
    emitter.subscribe('non.cancelable', () => {
      executed.push('second');
    });
    
    // Publish without cancelable option
    const result = await emitter.publish('non.cancelable');
    
    // Both handlers should have executed
    expect(executed).toEqual(['first', 'second']);
    // Result should be true since the event was not canceled
    expect(result).toBe(true);
  });

  test('should work with async handlers', async () => {
    const executed: string[] = [];
    
    // First async handler that cancels
    emitter.subscribe('async.cancel', async (event) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      executed.push('first');
      event.cancel();
    });
    
    // Second async handler that should not execute
    emitter.subscribe('async.cancel', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      executed.push('second');
    });
    
    const result = await emitter.publish('async.cancel', {}, { cancelable: true });
    
    expect(executed).toEqual(['first']);
    expect(result).toBe(false);
  });

  test('should be able to access original event data with cancel method', async () => {
    // Handler that checks the event data and then cancels
    emitter.subscribe('data.cancel', (event) => {
      expect(event.id).toBe(123);
      expect(event.name).toBe('test');
      expect(typeof event.cancel).toBe('function');
      event.cancel();
    });
    
    const result = await emitter.publish('data.cancel', { id: 123, name: 'test' }, { cancelable: true });
    expect(result).toBe(false);
  });

  test('should support old signature with numeric timeout', async () => {
    const executed: string[] = [];
    
    // Handler that doesn't cancel
    emitter.subscribe('old.signature', () => {
      executed.push('executed');
    });
    
    // Using the old signature with numeric timeout
    const result = await emitter.publish('old.signature', {}, 1000);
    
    expect(executed).toEqual(['executed']);
    expect(result).toBe(true);
  });

  test('should handle timeout options', async () => {
    let executed = false;
    
    // Handler that takes longer than the timeout
    emitter.subscribe('timeout.test', async (event) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      executed = true;
      event.cancel();
    });
    
    // Publish with short timeout
    const result = await emitter.publish('timeout.test', {}, { cancelable: true, timeout: 20 });
    
    // The handler should have started but been cut off by the timeout
    // So the event is not considered canceled
    expect(result).toBe(true);
  });

  test('wildcards should work with cancelable events', async () => {
    const executed: string[] = [];
    
    // Handler for wildcard that cancels
    emitter.subscribe('wildcard.*', (event) => {
      executed.push('wildcard');
      event.cancel();
    });
    
    // More specific handler that should not execute
    emitter.subscribe('wildcard.specific', () => {
      executed.push('specific');
    });
    
    const result = await emitter.publish('wildcard.specific', {}, { cancelable: true });
    
    expect(executed).toEqual(['wildcard']);
    expect(result).toBe(false);
  });
});