import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvEm, ErrorPolicy } from '../src/eventEmitter';

describe('Error Policy', () => {
  let evem: EvEm;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    evem = new EvEm();
    // Save original console.error and replace it with a mock
    originalConsoleError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    // Restore original console.error
    console.error = originalConsoleError;
  });

  describe('LOG_AND_CONTINUE policy (default)', () => {
    it('should log errors and continue executing callbacks', async () => {
      // Set up handlers, including one that will throw
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const mockHandler3 = vi.fn();

      evem.subscribe('test.event', mockHandler1);
      evem.subscribe('test.event', mockHandler2);
      evem.subscribe('test.event', mockHandler3);

      // Publish with default error policy (LOG_AND_CONTINUE)
      await evem.publish('test.event');

      // Assert that all handlers were called
      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(mockHandler2).toHaveBeenCalledTimes(1);
      expect(mockHandler3).toHaveBeenCalledTimes(1);
      
      // Assert that the error was logged
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in event handler for "test.event":'),
        expect.any(Error)
      );
    });

    it('should log errors and continue when explicitly using LOG_AND_CONTINUE', async () => {
      // Set up handlers, including one that will throw
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const mockHandler3 = vi.fn();

      evem.subscribe('test.event', mockHandler1);
      evem.subscribe('test.event', mockHandler2);
      evem.subscribe('test.event', mockHandler3);

      // Publish with explicit LOG_AND_CONTINUE policy
      await evem.publish('test.event', undefined, { errorPolicy: ErrorPolicy.LOG_AND_CONTINUE });

      // Assert that all handlers were called
      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(mockHandler2).toHaveBeenCalledTimes(1);
      expect(mockHandler3).toHaveBeenCalledTimes(1);
      
      // Assert that the error was logged
      expect(console.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('SILENT policy', () => {
    it('should ignore errors and not log them', async () => {
      // Set up handlers, including one that will throw
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const mockHandler3 = vi.fn();

      evem.subscribe('test.event', mockHandler1);
      evem.subscribe('test.event', mockHandler2);
      evem.subscribe('test.event', mockHandler3);

      // Publish with SILENT policy
      await evem.publish('test.event', undefined, { errorPolicy: ErrorPolicy.SILENT });

      // Assert that all handlers were called
      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(mockHandler2).toHaveBeenCalledTimes(1);
      expect(mockHandler3).toHaveBeenCalledTimes(1);
      
      // Assert that no error was logged
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('CANCEL_ON_ERROR policy', () => {
    it('should stop event propagation when an error occurs', async () => {
      // Set up handlers, including one that will throw
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const mockHandler3 = vi.fn();

      evem.subscribe('test.event', mockHandler1);
      evem.subscribe('test.event', mockHandler2);
      evem.subscribe('test.event', mockHandler3);

      // Publish with CANCEL_ON_ERROR policy
      await evem.publish('test.event', undefined, { errorPolicy: ErrorPolicy.CANCEL_ON_ERROR });

      // Assert that only handlers before the error were called
      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(mockHandler2).toHaveBeenCalledTimes(1);
      expect(mockHandler3).not.toHaveBeenCalled();
      
      // Assert that the error was logged
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should return false when event is canceled due to an error', async () => {
      // Set up a handler that will throw
      evem.subscribe('test.event', () => {
        throw new Error('Test error');
      });

      // Publish with CANCEL_ON_ERROR policy
      const result = await evem.publish('test.event', undefined, { 
        errorPolicy: ErrorPolicy.CANCEL_ON_ERROR 
      });

      // Assert that the result is false (event canceled)
      expect(result).toBe(false);
    });
  });

  describe('THROW policy', () => {
    it('should rethrow the error and stop event propagation', async () => {
      // Set up handlers, including one that will throw
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const mockHandler3 = vi.fn();

      evem.subscribe('test.event', mockHandler1);
      evem.subscribe('test.event', mockHandler2);
      evem.subscribe('test.event', mockHandler3);

      // Publish with THROW policy and expect it to throw
      await expect(
        evem.publish('test.event', undefined, { errorPolicy: ErrorPolicy.THROW })
      ).rejects.toThrow('Test error');

      // Assert that only handlers before the error were called
      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(mockHandler2).toHaveBeenCalledTimes(1);
      expect(mockHandler3).not.toHaveBeenCalled();
      
      // Assert that no error was logged (since it's thrown instead)
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('Async error handling', () => {
    it('should handle errors in async callbacks with LOG_AND_CONTINUE', async () => {
      // Set up handlers, including one that will throw asynchronously
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn().mockImplementation(async () => {
        throw new Error('Async test error');
      });
      const mockHandler3 = vi.fn();

      evem.subscribe('test.event', mockHandler1);
      evem.subscribe('test.event', mockHandler2);
      evem.subscribe('test.event', mockHandler3);

      // Publish with default error policy
      await evem.publish('test.event');

      // Assert that all handlers were called
      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(mockHandler2).toHaveBeenCalledTimes(1);
      expect(mockHandler3).toHaveBeenCalledTimes(1);
      
      // Assert that the error was logged
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in async callbacks with THROW policy', async () => {
      // Set up handlers, including one that will throw asynchronously
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn().mockImplementation(async () => {
        throw new Error('Async test error');
      });
      const mockHandler3 = vi.fn();

      evem.subscribe('test.event', mockHandler1);
      evem.subscribe('test.event', mockHandler2);
      evem.subscribe('test.event', mockHandler3);

      // Publish with THROW policy and expect it to throw
      await expect(
        evem.publish('test.event', undefined, { errorPolicy: ErrorPolicy.THROW })
      ).rejects.toThrow('Async test error');

      // Assert that only handlers before the error were called
      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(mockHandler2).toHaveBeenCalledTimes(1);
      expect(mockHandler3).not.toHaveBeenCalled();
    });
  });

  describe('Interaction with cancelable events', () => {
    it('should handle both cancellation and errors correctly', async () => {
      // First handler cancels the event
      const cancelHandler = vi.fn().mockImplementation((event) => {
        event.cancel();
      });
      
      // Second handler throws an error (but won't be called due to cancellation)
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('This should not be called');
      });

      evem.subscribe('test.event', cancelHandler);
      evem.subscribe('test.event', errorHandler);

      // Publish with cancelable:true and THROW error policy
      const result = await evem.publish('test.event', undefined, { 
        cancelable: true,
        errorPolicy: ErrorPolicy.THROW
      });

      // Event was canceled
      expect(result).toBe(false);
      
      // First handler was called
      expect(cancelHandler).toHaveBeenCalledTimes(1);
      
      // Second handler was not called due to cancellation
      expect(errorHandler).not.toHaveBeenCalled();
      
      // No errors were logged
      expect(console.error).not.toHaveBeenCalled();
    });
  });
});