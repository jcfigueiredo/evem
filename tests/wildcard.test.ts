import { EvEm } from '~/eventEmitter';
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('EvEm - Wildcard Subscription Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should receive events for wildcard type subscription (*.type)', () => {
    const wildcardCallback = vi.fn();

    emitter.subscribe('*.type', wildcardCallback);

    const eventData = { data: 'Event Data' };
    emitter.publish('event.type', eventData);

    expect(wildcardCallback).toHaveBeenCalledWith(eventData);
  });

  test('should receive events for wildcard source subscription (source.*)', () => {
    const wildcardCallback = vi.fn();

    emitter.subscribe('source.*', wildcardCallback);

    const eventData = { data: 'Event Data' };
    emitter.publish('source.event', eventData);

    expect(wildcardCallback).toHaveBeenCalledWith(eventData);
  });

  test('should not receive events that do not match the wildcard pattern', () => {
    const wildcardCallback = vi.fn();

    emitter.subscribe('unmatched.*', wildcardCallback);
    emitter.publish('matched.event', { data: 'Test' });

    expect(wildcardCallback).not.toHaveBeenCalled();
  });

  test('should handle multiple wildcard patterns and combinations', () => {
    const wildcardCallback1 = vi.fn();
    const wildcardCallback2 = vi.fn();

    emitter.subscribe('*.event', wildcardCallback1);
    emitter.subscribe('test.*', wildcardCallback2);

    const eventData1 = { type: 'Event1' };
    const eventData2 = { type: 'Event2' };

    emitter.publish('test.event', eventData1);
    emitter.publish('demo.event', eventData2);

    expect(wildcardCallback1).toHaveBeenCalledWith(eventData1);
    expect(wildcardCallback1).toHaveBeenCalledWith(eventData2);
    expect(wildcardCallback2).toHaveBeenCalledWith(eventData1);
    expect(wildcardCallback2).not.toHaveBeenCalledWith(eventData2);
  });

  test('should handle wildcard in between (e.g., system.*.error) events', () => {
    const callback = vi.fn();
    emitter.subscribe('system.*.error', callback);

    const eventData = { message: 'Test Error' };
    emitter.publish('system.test.error', eventData);

    expect(callback).toHaveBeenCalledWith(eventData);
  });
});

describe('Wildcards - patterns and longer events', () => {
  const matches = async (pattern: string, event: string) => {
    const emitter = new EvEm();
    const callback = vi.fn();
    emitter.subscribe(pattern, callback);
    await emitter.publish(event);
    return callback.mock.calls.length === 1;
  };

  test('a pattern without a trailing * matches only events with as many segments', async () => {
    expect(await matches('user', 'user.login')).toBe(false);
    expect(await matches('user.login', 'user.login.extra')).toBe(false);
    expect(await matches('user.*', 'user')).toBe(false);
  });

  test('a * in the middle of a pattern that ends in * still matches any segment', async () => {
    expect(await matches('order.*.*', 'order.a.b.c')).toBe(true);
    expect(await matches('order.*.*', 'other.a.b.c')).toBe(false);
  });
});
