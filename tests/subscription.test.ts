import { EvEm } from '~/eventEmitter';
import { describe, test, expect, vi, beforeEach } from 'vitest';

describe('EvEm - Subscription Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should subscribe to an event with a synchronous callback and receive parameters', () => {
    const callback = vi.fn();
    emitter.subscribe('test.event', callback);

    const eventData = { message: "Hello, World!" };
    void emitter.publish('test.event', eventData);

    expect(callback).toHaveBeenCalledWith(eventData);
  });

  test('should throw error when subscribing with an empty event name', () => {
    const callback = vi.fn();
    expect(() => emitter.subscribe('', callback)).toThrow("Event name cannot be empty.");
  });

  test('should handle exceptions thrown in event callbacks', async () => {
    const erroringCallback = vi.fn(() => {
        throw new Error("Error in callback");
    });

    emitter.subscribe('error.event', erroringCallback);

    await expect(emitter.publish('error.event')).rejects.toThrow("Error in callback");
  });

  test('should subscribe to an event with an asynchronous callback', async () => {
    const callback = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async operation
    });
    emitter.subscribe('async.event', callback);

    await emitter.publish('async.event');
    expect(callback).toHaveBeenCalled();
  });

  test('should subscribe to multiple events with different callbacks and receive parameters', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    emitter.subscribe('event1', callback1);
    emitter.subscribe('event2', callback2);

    const eventData1 = { data: 'Data1' };
    const eventData2 = { data: 'Data2' };

    emitter.publish('event1', eventData1);
    emitter.publish('event2', eventData2);

    expect(callback1).toHaveBeenCalledWith(eventData1);
    expect(callback2).toHaveBeenCalledWith(eventData2);
  });

   test('should subscribe to the same event multiple times with different callbacks and receive parameters', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    emitter.subscribe('shared.event', callback1);
    emitter.subscribe('shared.event', callback2);

    const eventData = { data: 'Shared Data' };

    emitter.publish('shared.event', eventData);

    expect(callback1).toHaveBeenCalledWith(eventData);
    expect(callback2).toHaveBeenCalledWith(eventData);
  });
});
