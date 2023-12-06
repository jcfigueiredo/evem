import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '~/eventEmitter';

describe('EvEm - Error Handling Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should handle exceptions thrown in event callbacks', async () => {
    const erroringCallback = vi.fn(() => {
        throw new Error("Error in callback");
    });

    emitter.subscribe('error.event', erroringCallback);

    await expect(emitter.publish('error.event')).rejects.toThrow("Error in callback");
});

});
