import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvEm, TransformFunction, ErrorPolicy } from '../src/eventEmitter';

describe('Event Transformation', () => {
  let evem: EvEm;

  beforeEach(() => {
    evem = new EvEm();
  });

  it('should transform event data for the next subscriber', async () => {
    // Setup a transform function that adds a property
    const transform: TransformFunction<any> = (data) => {
      return {
        ...data,
        transformed: true,
        value: data.value * 2
      };
    };

    // First subscriber with transform
    const firstHandler = vi.fn();
    evem.subscribe('test.event', firstHandler, {
      transform
    });

    // Second subscriber that receives transformed data
    const secondHandler = vi.fn((data) => {
      expect(data.transformed).toBe(true);
      expect(data.value).toBe(20); // Original value (10) * 2
    });
    evem.subscribe('test.event', secondHandler);

    // Publish the event
    await evem.publish('test.event', { value: 10 });

    // Verify both handlers were called
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);

    // Verify the first handler received original data
    expect(firstHandler).toHaveBeenCalledWith({ value: 10 });

    // Second handler assertions are in the handler itself
  });

  it('should handle multiple transforms in sequence', async () => {
    // First transform doubles the value
    const transform1: TransformFunction<any> = (data) => {
      return {
        ...data,
        value: data.value * 2,
        stages: [...(data.stages || []), 'doubled']
      };
    };

    // Second transform adds 5
    const transform2: TransformFunction<any> = (data) => {
      return {
        ...data,
        value: data.value + 5,
        stages: [...(data.stages || []), 'added']
      };
    };

    // Third transform converts to string
    const transform3: TransformFunction<any> = (data) => {
      return {
        ...data,
        value: String(data.value),
        stages: [...(data.stages || []), 'stringified']
      };
    };

    // Setup three subscribers with transforms
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const handler3 = vi.fn();
    const finalHandler = vi.fn();

    evem.subscribe('transform.chain', handler1, { transform: transform1, priority: 3 });
    evem.subscribe('transform.chain', handler2, { transform: transform2, priority: 2 });
    evem.subscribe('transform.chain', handler3, { transform: transform3, priority: 1 });
    evem.subscribe('transform.chain', finalHandler, { priority: 0 });

    // Initial event data
    const initialData = { value: 10, stages: [] };

    // Publish the event
    await evem.publish('transform.chain', initialData);

    // Verify all handlers were called
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler3).toHaveBeenCalledTimes(1);
    expect(finalHandler).toHaveBeenCalledTimes(1);

    // Check the progression of transformations
    // First handler gets original data
    expect(handler1).toHaveBeenCalledWith(initialData);

    // Second handler gets data after first transform
    expect(handler2).toHaveBeenCalledWith({
      value: 20,
      stages: ['doubled']
    });

    // Third handler gets data after second transform
    expect(handler3).toHaveBeenCalledWith({
      value: 25,
      stages: ['doubled', 'added']
    });

    // Final handler gets data after all transforms
    expect(finalHandler).toHaveBeenCalledWith({
      value: '25',
      stages: ['doubled', 'added', 'stringified']
    });
  });

  it('should handle async transforms', async () => {
    // Async transform function
    const asyncTransform: TransformFunction<any> = async (data) => {
      // Simulate async operation
      await new Promise<void>(resolve => setTimeout(resolve, 10));
      return {
        ...data,
        asyncTransformed: true,
        value: data.value + 100
      };
    };

    const handler1 = vi.fn();
    const handler2 = vi.fn();

    evem.subscribe('async.transform', handler1, { transform: asyncTransform });
    evem.subscribe('async.transform', handler2);

    await evem.publish('async.transform', { value: 50 });

    expect(handler1).toHaveBeenCalledWith({ value: 50 });
    expect(handler2).toHaveBeenCalledWith({
      value: 150, 
      asyncTransformed: true
    });
  });

  it('should handle transform errors according to error policy', async () => {
    // Transform that throws an error
    const errorTransform: TransformFunction<any> = () => {
      throw new Error('Transform error');
    };

    // Mock console.error to suppress output during test
    const originalConsoleError = console.error;
    console.error = vi.fn();

    try {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      evem.subscribe('error.transform', handler1, { transform: errorTransform });
      evem.subscribe('error.transform', handler2);

      await evem.publish('error.transform', { value: 10 });

      // Both handlers should still be called with default LOG_AND_CONTINUE policy
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // The error should have been logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in transform function for'),
        expect.any(Error)
      );

      // Second handler should receive the original data since transform failed
      expect(handler2).toHaveBeenCalledWith({ value: 10 });
    } finally {
      // Restore console.error
      console.error = originalConsoleError;
    }
  });

  it('should stop event propagation if transform throws with CANCEL_ON_ERROR policy', async () => {
    // Transform that throws an error
    const errorTransform: TransformFunction<any> = () => {
      throw new Error('Transform error');
    };

    // Mock console.error to suppress output during test
    const originalConsoleError = console.error;
    console.error = vi.fn();

    try {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      evem.subscribe('cancel.transform', handler1, { transform: errorTransform });
      evem.subscribe('cancel.transform', handler2);

      // Use CANCEL_ON_ERROR policy
      const result = await evem.publish('cancel.transform', { value: 10 }, {
        errorPolicy: ErrorPolicy.CANCEL_ON_ERROR
      });

      // First handler should be called
      expect(handler1).toHaveBeenCalledTimes(1);
      
      // Second handler should NOT be called due to cancellation
      expect(handler2).not.toHaveBeenCalled();
      
      // Result should be false indicating the event was canceled
      expect(result).toBe(false);

      // The error should have been logged
      expect(console.error).toHaveBeenCalled();
    } finally {
      // Restore console.error
      console.error = originalConsoleError;
    }
  });

  it('should work with other features like filtering', async () => {
    // Transform function
    const transform: TransformFunction<any> = (data) => {
      return {
        ...data,
        transformedBy: 'handler1',
        value: data.value + 5
      };
    };

    // Filter function
    const filter = (data: any) => data.value > 10;

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const handler3 = vi.fn();

    // First handler transforms the data
    evem.subscribe('combined.features', handler1, { transform });
    
    // Second handler has a filter and only processes transformed data where value > 10
    evem.subscribe('combined.features', handler2, { filter });
    
    // Third handler always receives the latest data
    evem.subscribe('combined.features', handler3);

    // Publish an event with value 7 (which becomes 12 after transform)
    await evem.publish('combined.features', { value: 7 });

    expect(handler1).toHaveBeenCalledWith({ value: 7 });
    
    // Second handler should be called because transformed value (12) passes filter
    expect(handler2).toHaveBeenCalledWith({
      value: 12,
      transformedBy: 'handler1'
    });
    
    expect(handler3).toHaveBeenCalledWith({
      value: 12,
      transformedBy: 'handler1'
    });

    // Reset mocks
    vi.clearAllMocks();

    // Publish an event with value 3 (which becomes 8 after transform)
    await evem.publish('combined.features', { value: 3 });

    expect(handler1).toHaveBeenCalledWith({ value: 3 });
    
    // Second handler should NOT be called because transformed value (8) fails filter
    expect(handler2).not.toHaveBeenCalled();
    
    // Third handler should still be called
    expect(handler3).toHaveBeenCalledWith({
      value: 8,
      transformedBy: 'handler1'
    });
  });
});