import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { RequestResponseManager } from '../../src/websocket/RequestResponseManager';
import { RequestTimeoutError } from '../../src/websocket/types';

describe('RequestResponseManager', () => {
  let evem: EvEm;
  let requestResponseManager: RequestResponseManager;

  beforeEach(() => {
    evem = new EvEm();
    requestResponseManager = new RequestResponseManager(evem);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Request-Response', () => {
    it('should send request and receive response', async () => {
      const requestData = { method: 'getUser', params: { id: 123 } };
      const responseData = { name: 'John', id: 123 };

      // Simulate server response
      evem.subscribe('ws.send.request', (req: any) => {
        setTimeout(() => {
          evem.publish('ws.response', {
            id: req.id,
            result: responseData,
            timestamp: Date.now(),
          });
        }, 100);
      });

      const responsePromise = requestResponseManager.request('getUser', { id: 123 });

      vi.advanceTimersByTime(100);

      const result = await responsePromise;
      expect(result).toEqual(responseData);
    });

    it('should generate unique request IDs', async () => {
      const requestIds: string[] = [];

      evem.subscribe('ws.send.request', (req: any) => {
        requestIds.push(req.id);
      });

      requestResponseManager.request('method1', {});
      requestResponseManager.request('method2', {});
      requestResponseManager.request('method3', {});

      expect(requestIds).toHaveLength(3);
      expect(new Set(requestIds).size).toBe(3); // All unique
    });

    it('should include method and params in request', async () => {
      const capturedRequests: any[] = [];

      evem.subscribe('ws.send.request', (req: any) => {
        capturedRequests.push(req);
      });

      requestResponseManager.request('testMethod', { param1: 'value1', param2: 42 });

      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0]).toMatchObject({
        method: 'testMethod',
        params: { param1: 'value1', param2: 42 },
        id: expect.any(String),
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Timeout Handling', () => {
    it('should reject request after timeout', async () => {
      const responsePromise = requestResponseManager.request('slowMethod', {}, {
        timeout: 1000,
      });

      vi.advanceTimersByTime(1000);

      await expect(responsePromise).rejects.toThrow(RequestTimeoutError);
    });

    it('should use default timeout of 5000ms', async () => {
      const responsePromise = requestResponseManager.request('method', {});

      vi.advanceTimersByTime(4999);
      // Should not reject yet

      vi.advanceTimersByTime(1);
      // Should reject now

      await expect(responsePromise).rejects.toThrow(RequestTimeoutError);
    });

    it('should clear timeout timer when response arrives', async () => {
      evem.subscribe('ws.send.request', (req: any) => {
        setTimeout(() => {
          evem.publish('ws.response', {
            id: req.id,
            result: { success: true },
            timestamp: Date.now(),
          });
        }, 500);
      });

      const responsePromise = requestResponseManager.request('method', {}, {
        timeout: 1000,
      });

      vi.advanceTimersByTime(500);
      const result = await responsePromise;

      expect(result).toEqual({ success: true });

      // Advance past timeout to ensure timer was cleared
      vi.advanceTimersByTime(1000);
      // Should not throw
    });

    it('should include request info in timeout error', async () => {
      const responsePromise = requestResponseManager.request('myMethod', { id: 123 }, {
        timeout: 2000,
      });

      vi.advanceTimersByTime(2000);

      try {
        await responsePromise;
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(RequestTimeoutError);
        expect(error.method).toBe('myMethod');
        expect(error.timeout).toBe(2000);
        expect(error.requestId).toBeDefined();
      }
    });
  });

  describe('Multiple Concurrent Requests', () => {
    it('should handle multiple concurrent requests', async () => {
      evem.subscribe('ws.send.request', (req: any) => {
        setTimeout(() => {
          evem.publish('ws.response', {
            id: req.id,
            result: { method: req.method, processed: true },
            timestamp: Date.now(),
          });
        }, 100);
      });

      const promises = [
        requestResponseManager.request('method1', {}),
        requestResponseManager.request('method2', {}),
        requestResponseManager.request('method3', {}),
      ];

      vi.advanceTimersByTime(100);

      const results = await Promise.all(promises);

      expect(results).toEqual([
        { method: 'method1', processed: true },
        { method: 'method2', processed: true },
        { method: 'method3', processed: true },
      ]);
    });

    it('should match responses to correct requests', async () => {
      const requestMap = new Map<string, string>();

      evem.subscribe('ws.send.request', (req: any) => {
        requestMap.set(req.id, req.method);

        // Respond in reverse order
        setTimeout(() => {
          evem.publish('ws.response', {
            id: req.id,
            result: { originalMethod: req.method },
            timestamp: Date.now(),
          });
        }, req.method === 'first' ? 300 : req.method === 'second' ? 200 : 100);
      });

      const first = requestResponseManager.request('first', {});
      const second = requestResponseManager.request('second', {});
      const third = requestResponseManager.request('third', {});

      vi.advanceTimersByTime(300);

      const results = await Promise.all([first, second, third]);

      expect(results).toEqual([
        { originalMethod: 'first' },
        { originalMethod: 'second' },
        { originalMethod: 'third' },
      ]);
    });
  });

  describe('Error Responses', () => {
    it('should reject on error response', async () => {
      evem.subscribe('ws.send.request', (req: any) => {
        setTimeout(() => {
          evem.publish('ws.response.error', {
            id: req.id,
            error: {
              code: 404,
              message: 'Not found',
            },
            timestamp: Date.now(),
          });
        }, 100);
      });

      const responsePromise = requestResponseManager.request('getUser', { id: 999 });

      vi.advanceTimersByTime(100);

      await expect(responsePromise).rejects.toThrow('Not found');
    });

    it('should include error code and data in rejection', async () => {
      evem.subscribe('ws.send.request', (req: any) => {
        setTimeout(() => {
          evem.publish('ws.response.error', {
            id: req.id,
            error: {
              code: 400,
              message: 'Invalid input',
              data: { field: 'email', reason: 'invalid format' },
            },
            timestamp: Date.now(),
          });
        }, 100);
      });

      const responsePromise = requestResponseManager.request('updateUser', {});

      vi.advanceTimersByTime(100);

      try {
        await responsePromise;
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.message).toBe('Invalid input');
        expect(error.code).toBe(400);
        expect(error.data).toEqual({ field: 'email', reason: 'invalid format' });
      }
    });
  });

  describe('Response After Timeout', () => {
    it('should ignore response that arrives after timeout', async () => {
      let responseId: string;

      evem.subscribe('ws.send.request', (req: any) => {
        responseId = req.id;
      });

      const responsePromise = requestResponseManager.request('slowMethod', {}, {
        timeout: 100,
      });

      vi.advanceTimersByTime(100);

      await expect(responsePromise).rejects.toThrow(RequestTimeoutError);

      // Now send a late response
      await evem.publish('ws.response', {
        id: responseId!,
        result: { data: 'late' },
        timestamp: Date.now(),
      });

      // Should not cause any issues (response is ignored)
    });
  });

  describe('Custom Request IDs', () => {
    it('should allow custom request ID', async () => {
      const customId = 'custom-request-id-123';
      let capturedId: string;

      evem.subscribe('ws.send.request', (req: any) => {
        capturedId = req.id;
        setTimeout(() => {
          evem.publish('ws.response', {
            id: req.id,
            result: { success: true },
            timestamp: Date.now(),
          });
        }, 100);
      });

      const responsePromise = requestResponseManager.request('method', {}, {
        id: customId,
      });

      vi.advanceTimersByTime(100);
      await responsePromise;

      expect(capturedId!).toBe(customId);
    });
  });

  describe('Cleanup', () => {
    it('should clean up pending request after timeout', async () => {
      const pendingCountBefore = requestResponseManager.getPendingRequestCount();

      const responsePromise = requestResponseManager.request('method', {}, {
        timeout: 100,
      });

      expect(requestResponseManager.getPendingRequestCount()).toBe(pendingCountBefore + 1);

      vi.advanceTimersByTime(100);

      await expect(responsePromise).rejects.toThrow();

      expect(requestResponseManager.getPendingRequestCount()).toBe(pendingCountBefore);
    });

    it('should clean up pending request after response', async () => {
      const pendingCountBefore = requestResponseManager.getPendingRequestCount();

      evem.subscribe('ws.send.request', (req: any) => {
        setTimeout(() => {
          evem.publish('ws.response', {
            id: req.id,
            result: {},
            timestamp: Date.now(),
          });
        }, 100);
      });

      const responsePromise = requestResponseManager.request('method', {});

      expect(requestResponseManager.getPendingRequestCount()).toBe(pendingCountBefore + 1);

      vi.advanceTimersByTime(100);
      await responsePromise;

      expect(requestResponseManager.getPendingRequestCount()).toBe(pendingCountBefore);
    });
  });

  describe('Edge Cases', () => {
    it('should handle response with no result field', async () => {
      evem.subscribe('ws.send.request', (req: any) => {
        setTimeout(() => {
          evem.publish('ws.response', {
            id: req.id,
            timestamp: Date.now(),
          });
        }, 100);
      });

      const responsePromise = requestResponseManager.request('method', {});

      vi.advanceTimersByTime(100);
      const result = await responsePromise;

      expect(result).toBeUndefined();
    });

    it('should handle response for unknown request ID gracefully', async () => {
      // Should not throw
      await expect(
        evem.publish('ws.response', {
          id: 'unknown-id',
          result: {},
          timestamp: Date.now(),
        })
      ).resolves.not.toThrow();
    });

    it('should handle empty params', () => {
      const capturedRequests: any[] = [];

      evem.subscribe('ws.send.request', (req: any) => {
        capturedRequests.push(req);
      });

      // Don't await - we're just testing the request structure
      requestResponseManager.request('method');

      expect(capturedRequests[0].params).toBeUndefined();
    });
  });
});
