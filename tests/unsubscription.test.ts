import { EvEm } from '~/eventEmitter';
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('EvEm - Unsubscription Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should unsubscribe a previously subscribed callback and stop receiving events', () => {
    const callback = vi.fn();
    emitter.subscribe('test.event', callback);

    emitter.unsubscribe('test.event', callback);

    const eventData = { message: "Test Data" };
    emitter.publish('test.event', eventData);

    expect(callback).not.toHaveBeenCalled();
  });

  test('should throw error when unsubscribing with an empty event name', () => {
    const callback = vi.fn();
    expect(() => emitter.unsubscribe('', callback)).toThrow("You can't subscribe to an event with an empty name.");
  });

  test('should handle unsubscribing a callback that was never subscribed', () => {
    const callback = vi.fn();
    // Not subscribing the callback here

    // Attempt to unsubscribe the non-subscribed callback
    emitter.unsubscribe('test.event', callback);

    const eventData = { message: "Test Data" };
    emitter.publish('test.event', eventData);

    // Callback should not be called as it was never subscribed
    expect(callback).not.toHaveBeenCalled();
  });

  test('should unsubscribe only the specified callback among multiple', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    emitter.subscribe('multi.event', callback1);
    emitter.subscribe('multi.event', callback2);

    emitter.unsubscribe('multi.event', callback1);

    const eventData = { data: 'Event Data' };
    emitter.publish('multi.event', eventData);

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledWith(eventData);
  });
});
