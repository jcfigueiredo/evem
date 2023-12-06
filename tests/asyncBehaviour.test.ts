import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '~/eventEmitter';

describe('EvEm - Asynchronous Behavior Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should wait for all asynchronous callbacks to complete before resolving publish', async () => {
    const asyncCallback1 = vi.fn<void[]>(async () => new Promise(resolve => setTimeout(resolve, 100)));
    const asyncCallback2 = vi.fn<void[]>(async () => new Promise(resolve => setTimeout(resolve, 200)));

    emitter.subscribe('async.event', asyncCallback1);
    emitter.subscribe('async.event', asyncCallback2);

    const startTime = Date.now();
    await emitter.publish('async.event');
    const endTime = Date.now();

    expect(asyncCallback1).toHaveBeenCalled();
    expect(asyncCallback2).toHaveBeenCalled();
    expect(endTime - startTime).toBeGreaterThanOrEqual(200);
  });

  test('should maintain order of execution for mixed synchronous and asynchronous callbacks', async () => {
    const callOrder: string[] = [];

    const syncCallback = vi.fn<void[]>(() => callOrder.push('sync'));
    const asyncCallback = vi.fn<void[]>(async () => {
      callOrder.push('before async');
      await new Promise(resolve => setTimeout(resolve, 100));
      callOrder.push('after async');
    });

    emitter.subscribe('mixed.event', syncCallback);
    emitter.subscribe('mixed.event', asyncCallback);

    await emitter.publish('mixed.event');

    expect(callOrder).toEqual(['sync', 'before async', 'after async']);
  });

 test('should execute synchronous callbacks before the continuation of asynchronous callbacks', async () => {
    const callOrder: string[] = [];

    const syncCallback1 = vi.fn<void[]>(() => { callOrder.push('sync1'); });

    const asyncCallback = vi.fn<void[]>(async () => {
      callOrder.push('before async');
      await new Promise(resolve => setTimeout(resolve, 100));
      callOrder.push('after async');
    });

    const syncCallback2 = vi.fn<void[]>(() => {
      callOrder.push('sync2');
    });

    emitter.subscribe('mixed.event', syncCallback1);
    emitter.subscribe('mixed.event', asyncCallback);
    emitter.subscribe('mixed.event', syncCallback2);

    await emitter.publish('mixed.event');

    expect(callOrder).toEqual(['sync1', 'before async', 'sync2', 'after async']);
  });
});
