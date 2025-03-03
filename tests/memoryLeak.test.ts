import { EvEm } from '../src/eventEmitter';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Memory Leak Detection', () => {
  let evem: EvEm;
  
  beforeEach(() => {
    evem = new EvEm();
    // Mock console.warn to capture warnings
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  it('should not warn when memory leak detection is disabled', () => {
    // Add more handlers than the default threshold
    for (let i = 0; i < 15; i++) {
      evem.subscribe('test.event', () => {});
    }
    
    // Should not have warned since memory leak detection is disabled by default
    expect(console.warn).not.toHaveBeenCalled();
  });
  
  it('should warn when too many handlers are added with default threshold', () => {
    // Enable memory leak detection
    evem.enableMemoryLeakDetection();
    
    // Add more handlers than the default threshold
    for (let i = 0; i < 15; i++) {
      evem.subscribe('test.event', () => {});
    }
    
    // Should have warned about memory leak
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Possible memory leak detected')
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('test.event')
    );
  });
  
  it('should use custom threshold when provided', () => {
    // Enable memory leak detection with custom threshold
    evem.enableMemoryLeakDetection({ threshold: 5 });
    
    // Add 5 handlers - should not trigger warning yet
    for (let i = 0; i < 5; i++) {
      evem.subscribe('test.event', () => {});
    }
    
    expect(console.warn).not.toHaveBeenCalled();
    
    // Add one more to exceed threshold
    evem.subscribe('test.event', () => {});
    
    // Should have warned about memory leak
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Possible memory leak detected')
    );
  });
  
  it('should not show detailed subscription info when disabled', () => {
    // Enable memory leak detection with subscription details disabled
    evem.enableMemoryLeakDetection({ 
      threshold: 5, 
      showSubscriptionDetails: false 
    });
    
    // Add handlers to exceed threshold
    for (let i = 0; i < 6; i++) {
      evem.subscribe('test.event', () => {});
    }
    
    // Should have warned, but not shown details
    expect(console.warn).toHaveBeenCalled();
    expect(console.group).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
  
  it('should only warn once per event', () => {
    // Enable memory leak detection
    evem.enableMemoryLeakDetection({ threshold: 5 });
    
    // Add 6 handlers to trigger warning
    for (let i = 0; i < 6; i++) {
      evem.subscribe('test.event', () => {});
    }
    
    expect(console.warn).toHaveBeenCalledTimes(1);
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Add more handlers to same event
    for (let i = 0; i < 3; i++) {
      evem.subscribe('test.event', () => {});
    }
    
    // Should not warn again for same event
    expect(console.warn).not.toHaveBeenCalled();
  });
  
  it('should warn separately for different events', () => {
    // Enable memory leak detection
    evem.enableMemoryLeakDetection({ threshold: 5 });
    
    // Add 6 handlers to first event
    for (let i = 0; i < 6; i++) {
      evem.subscribe('test.event1', () => {});
    }
    
    expect(console.warn).toHaveBeenCalledTimes(1);
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Add 6 handlers to second event
    for (let i = 0; i < 6; i++) {
      evem.subscribe('test.event2', () => {});
    }
    
    // Should warn for the second event
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
  
  it('should clear warning when subscriptions fall below threshold', () => {
    // Enable memory leak detection
    evem.enableMemoryLeakDetection({ threshold: 5 });
    
    // Create handlers we can reference for unsubscription
    const handlers = Array.from({ length: 7 }, () => () => {});
    
    // Subscribe all handlers
    const ids = handlers.map(handler => evem.subscribe('test.event', handler));
    
    // Should have warned
    expect(console.warn).toHaveBeenCalledTimes(1);
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Unsubscribe until we're below threshold
    for (let i = 0; i < 3; i++) {
      evem.unsubscribe('test.event', handlers[i]);
    }
    
    // Add several more handlers to ensure we cross the threshold again
    for (let i = 0; i < 3; i++) {
      evem.subscribe('test.event', () => {});
    }
    
    // Should warn again since it fell below threshold and then exceeded again
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
  
  it('should clear warning when unsubscribeById reduces count below threshold', () => {
    // Enable memory leak detection
    evem.enableMemoryLeakDetection({ threshold: 5 });
    
    // Create handlers
    const handlers = Array.from({ length: 7 }, () => () => {});
    
    // Subscribe all handlers and store IDs
    const ids = handlers.map(handler => evem.subscribe('test.event', handler));
    
    // Should have warned
    expect(console.warn).toHaveBeenCalledTimes(1);
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Unsubscribe by ID until we're below threshold
    for (let i = 0; i < 3; i++) {
      evem.unsubscribeById(ids[i]);
    }
    
    // Add several more handlers to ensure we cross the threshold again
    for (let i = 0; i < 3; i++) {
      evem.subscribe('test.event', () => {});
    }
    
    // Should warn again since it fell below threshold and then exceeded again
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});