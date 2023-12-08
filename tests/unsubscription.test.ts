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

    emitter.unsubscribe('test.event', callback);

    const eventData = { message: "Test Data" };
    emitter.publish('test.event', eventData);

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

  test('should unsubscribe from an event using a UUID', () => {
    const emitter = new EvEm();
    const callback = vi.fn();
    const subscriptionId = emitter.subscribe('test.event', callback);

    emitter.publish('test.event');
    emitter.unsubscribeById(subscriptionId, 'test.event');
    emitter.publish('test.event');

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('should unsubscribe from all events by UUID without specifying the event name', () => {
    const emitter = new EvEm();
    const callback = vi.fn();

    const subscriptionId1 = emitter.subscribe('event1', callback);
    emitter.subscribe('event2', callback);

    emitter.publish('event1');
    emitter.publish('event2');
    emitter.unsubscribeById(subscriptionId1); // Unsubscribe from all events with this ID
    emitter.publish('event1');
    emitter.publish('event2');

    expect(callback).toHaveBeenCalledTimes(3); // Called once for each event before unsubscription
  });

  test('should unsubscribe from a specific event by UUID', () => {
    const emitter = new EvEm();
    const callback = vi.fn();

    const subscriptionId = emitter.subscribe('event1', callback);
    emitter.publish('event1');
    emitter.unsubscribeById(subscriptionId, 'event1');
    emitter.publish('event1');

    expect(callback).toHaveBeenCalledTimes(1);
  });
  
  test('unsubscribing with an invalid UUID without specifying the event name should not affect other subscriptions', () => {
    const emitter = new EvEm();
    const callback = vi.fn();

    emitter.subscribe('event1', callback);
    emitter.unsubscribeById('invalid-uuid'); // Invalid UUID
    emitter.publish('event1');

    expect(callback).toHaveBeenCalledTimes(1);
});
});
