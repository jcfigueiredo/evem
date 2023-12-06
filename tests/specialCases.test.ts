
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '~/eventEmitter';

describe('EvEm - Edge Cases and Special Scenarios Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should handle a callback that subscribes to another event', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn(() => {
      emitter.subscribe('event2', callback1);
    });

    emitter.subscribe('event1', callback2);
    emitter.publish('event1');

    emitter.publish('event2');
    expect(callback1).toHaveBeenCalled();
  });

  test('should handle a callback that unsubscribes another callback', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn(() => {
      emitter.unsubscribe('event', callback1);
    });

    emitter.subscribe('event', callback1);
    emitter.subscribe('event', callback2);

    emitter.publish('event');
    emitter.publish('event');

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(2);
  });

  test('should throw an error when maximum recursion depth is exceeded', async () => {
    let recursionCount = 0;
    emitter.subscribe('recursive.event', async () => {
      if (++recursionCount < 4) {
        await emitter.publish('recursive.event');
      }
    });

    try {
      await emitter.publish('recursive.event');
      expect.fail('Should have thrown an error due to max recursion depth');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Max recursion depth of 3 exceeded for event 'recursive.event'");
    }
  });

  test('should handle unexpected input types gracefully', () => {

    const callback = vi.fn(() => {
      throw new Error('Callback Error');
    });

    expect(() => emitter.subscribe('event', callback)).not.toThrow();
    expect(() => emitter.unsubscribe('event', callback)).not.toThrow();

    expect(() => emitter.publish('event', null));

  });
});

describe('EvEm - Custom Recursion Limit Tests', () => {
  test('should allow setting a custom maximum recursion depth', async () => {
    const customMaxDepth = 5;
    const emitter = new EvEm(customMaxDepth);
    let recursionCount = 0;

    emitter.subscribe('recursive.event', async () => {
      if (++recursionCount < customMaxDepth + 1) {
        await emitter.publish('recursive.event');
      }
    });

    try {
      await emitter.publish('recursive.event');
      expect.fail('Should have thrown an error due to custom max recursion depth');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(`Max recursion depth of ${customMaxDepth} exceeded for event 'recursive.event'`);
    }
  });
});