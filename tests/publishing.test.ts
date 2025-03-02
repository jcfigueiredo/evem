import { EvEm } from '~/eventEmitter';
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('EvEm - Publishing Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should handle publishing an event with no subscribers', async () => {
    await expect(emitter.publish('no.subscribers', { data: 'Test' })).resolves.toBe(true);
  });

  test('should throw error when publishing with an empty event name', async () => {
    await expect(emitter.publish('')).rejects.toThrow("Event name cannot be empty.");
  });

  test('should notify multiple subscribers when an event is published', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    emitter.subscribe('event', callback1);
    emitter.subscribe('event', callback2);

    const eventData = { message: 'Hello' };
    emitter.publish('event', eventData);

    expect(callback1).toHaveBeenCalledWith(eventData);
    expect(callback2).toHaveBeenCalledWith(eventData);
  });

  test('should handle both synchronous and asynchronous subscribers', async () => {
    const syncCallback = vi.fn();
    const asyncCallback = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    emitter.subscribe('mixed.event', syncCallback);
    emitter.subscribe('mixed.event', asyncCallback);

    const eventData = { type: 'Mixed' };
    await emitter.publish('mixed.event', eventData);

    expect(syncCallback).toHaveBeenCalledWith(eventData);
    expect(asyncCallback).toHaveBeenCalledWith(eventData);
  });

  test('should call appropriate callbacks with the correct arguments', () => {
    const callback = vi.fn();

    emitter.subscribe('specific.event', callback);

    const eventData = { specific: 'Data' };
    emitter.publish('specific.event', eventData);

    expect(callback).toHaveBeenCalledWith(eventData);
  });

  test('should not call callbacks for events they did not subscribe to', () => {
    const callback = vi.fn();

    emitter.subscribe('subscribed.event', callback);
    emitter.publish('unsubscribed.event', { data: 'Test' });

    expect(callback).not.toHaveBeenCalled();
  });

  test('should publish events with different data types as arguments', () => {
    const callbackString = vi.fn();
    const callbackNumber = vi.fn();

    emitter.subscribe('event.string', callbackString);
    emitter.subscribe('event.number', callbackNumber);

    emitter.publish('event.string', 'Test String');
    emitter.publish('event.number', 123);

    expect(callbackString).toHaveBeenCalledWith('Test String');
    expect(callbackNumber).toHaveBeenCalledWith(123);
  });
});
