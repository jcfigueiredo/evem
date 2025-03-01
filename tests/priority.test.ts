import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '../src';

describe('Event Priority Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('callbacks should be executed in priority order (high to low)', async () => {
    // Setup to capture execution order
    const executed: string[] = [];
    
    // Subscribe callbacks with different priorities
    emitter.subscribe('test.priority', () => {
      executed.push('low');
    }, { priority: 'low' });
    
    emitter.subscribe('test.priority', () => {
      executed.push('normal');
    }, { priority: 'normal' });
    
    emitter.subscribe('test.priority', () => {
      executed.push('high');
    }, { priority: 'high' });

    // Publish the event
    await emitter.publish('test.priority');
    
    // Check execution order - should be high, normal, low
    expect(executed).toEqual(['high', 'normal', 'low']);
  });

  test('numeric priorities should work correctly', async () => {
    const executed: string[] = [];
    
    // Subscribe with numeric priorities
    emitter.subscribe('numeric.priority', () => {
      executed.push('zero');
    }, { priority: 0 });
    
    emitter.subscribe('numeric.priority', () => {
      executed.push('ten');
    }, { priority: 10 });
    
    emitter.subscribe('numeric.priority', () => {
      executed.push('negative');
    }, { priority: -10 });
    
    emitter.subscribe('numeric.priority', () => {
      executed.push('hundred');
    }, { priority: 100 });

    // Publish the event
    await emitter.publish('numeric.priority');
    
    // Check order - highest number to lowest
    expect(executed).toEqual(['hundred', 'ten', 'zero', 'negative']);
  });

  test('default priority should be normal/0 when not specified', async () => {
    const executed: string[] = [];
    
    // Subscribe with explicit normal priority
    emitter.subscribe('default.priority', () => {
      executed.push('explicit-normal');
    }, { priority: 'normal' });
    
    // Subscribe with no priority (should default to normal)
    emitter.subscribe('default.priority', () => {
      executed.push('default');
    });
    
    // Subscribe with explicit 0 priority
    emitter.subscribe('default.priority', () => {
      executed.push('zero');
    }, { priority: 0 });
    
    // Higher and lower priority for comparison
    emitter.subscribe('default.priority', () => {
      executed.push('high');
    }, { priority: 'high' });
    
    emitter.subscribe('default.priority', () => {
      executed.push('low');
    }, { priority: 'low' });

    // Publish the event
    await emitter.publish('default.priority');
    
    // High should be first, low should be last, and the three normal priority
    // ones could be in any order relative to each other but between high and low
    expect(executed[0]).toBe('high');
    expect(executed[executed.length - 1]).toBe('low');
    
    // Check that all three normal priority callbacks were executed somewhere in the middle
    const normalPriorityItems = executed.slice(1, -1);
    expect(normalPriorityItems).toContain('explicit-normal');
    expect(normalPriorityItems).toContain('default');
    expect(normalPriorityItems).toContain('zero');
  });

  test('priority should work with wildcards', async () => {
    const executed: string[] = [];
    
    // Subscribe to wildcard event with priorities
    emitter.subscribe('priority.*', () => {
      executed.push('low');
    }, { priority: 'low' });
    
    emitter.subscribe('priority.*', () => {
      executed.push('high');
    }, { priority: 'high' });
    
    // Publish matching event
    await emitter.publish('priority.test');
    
    // High priority should be executed first
    expect(executed).toEqual(['high', 'low']);
  });

  test('priority should work with filters', async () => {
    const executed: string[] = [];
    
    // Subscribe with both priority and filter
    emitter.subscribe('filtered.priority', (data: number) => {
      executed.push(`high-${data}`);
    }, { 
      priority: 'high',
      filter: data => data > 10
    });
    
    emitter.subscribe('filtered.priority', (data: number) => {
      executed.push(`low-${data}`);
    }, { 
      priority: 'low',
      filter: data => data > 5
    });
    
    // This should trigger both callbacks (data > 10)
    await emitter.publish('filtered.priority', 20);
    
    // High priority should be executed first
    expect(executed).toEqual(['high-20', 'low-20']);
    
    // Reset executed array
    executed.length = 0;
    
    // This should only trigger the low priority callback (5 < data < 10)
    await emitter.publish('filtered.priority', 7);
    
    expect(executed).toEqual(['low-7']);
  });

  test('priority should work with once', async () => {
    const executed: string[] = [];
    
    // Subscribe with both priority and once
    emitter.subscribe('once.priority', () => {
      executed.push('high');
    }, { 
      priority: 'high',
      once: true
    });
    
    emitter.subscribe('once.priority', () => {
      executed.push('low');
    }, { 
      priority: 'low',
      once: true
    });
    
    // First publish should trigger both
    await emitter.publish('once.priority');
    expect(executed).toEqual(['high', 'low']);
    
    // Reset executed array
    executed.length = 0;
    
    // Second publish should trigger neither (both unsubscribed after first publish)
    await emitter.publish('once.priority');
    expect(executed).toEqual([]);
  });

  test('priority should work with async callbacks', async () => {
    const executed: string[] = [];
    
    // Subscribe with async callbacks at different priorities
    emitter.subscribe('async.priority', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      executed.push('low-async');
    }, { priority: 'low' });
    
    emitter.subscribe('async.priority', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      executed.push('high-async');
    }, { priority: 'high' });
    
    // Publish event
    await emitter.publish('async.priority');
    
    // Despite different execution times, high priority should still be first in the results
    expect(executed).toEqual(['high-async', 'low-async']);
  });
});