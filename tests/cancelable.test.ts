import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '../src';

describe('Cancelable Events Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should be able to cancel an event', async () => {
    const executed: string[] = [];

    // First handler that cancels the event
    emitter.subscribe('test.cancelable', (event: any) => {
      executed.push('first');
      event.cancel();
    });

    // Second handler that should not be executed due to cancellation
    emitter.subscribe('test.cancelable', () => {
      executed.push('second');
    });

    // Publish a cancelable event
    const result = await emitter.publish('test.cancelable', {}, { cancelable: true });

    // Verify only the first handler was executed
    expect(executed).toEqual(['first']);
    // Verify the result indicates the event was canceled
    expect(result).toBe(false);
  });

  test('canceling event should work with priorities', async () => {
    const executed: string[] = [];

    // High priority handler cancels the event
    emitter.subscribe(
      'priority.cancel',
      (event: any) => {
        executed.push('high');
        event.cancel();
      },
      { priority: 'high' }
    );

    // Normal priority handler should not execute
    emitter.subscribe('priority.cancel', () => {
      executed.push('normal');
    });

    // Low priority handler should not execute
    emitter.subscribe(
      'priority.cancel',
      () => {
        executed.push('low');
      },
      { priority: 'low' }
    );

    const result = await emitter.publish('priority.cancel', {}, { cancelable: true });

    expect(executed).toEqual(['high']);
    expect(result).toBe(false);
  });

  test('non-cancelable events should ignore cancel calls', async () => {
    const executed: string[] = [];

    // First handler tries to cancel a non-cancelable event
    emitter.subscribe('non.cancelable', (event: any) => {
      executed.push('first');
      // This should do nothing since the event is not cancelable
      if (typeof event.cancel === 'function') {
        event.cancel();
      }
    });

    // Second handler should still execute
    emitter.subscribe('non.cancelable', () => {
      executed.push('second');
    });

    // Publish without cancelable option
    const result = await emitter.publish('non.cancelable');

    // Both handlers should have executed
    expect(executed).toEqual(['first', 'second']);
    // Result should be true since the event was not canceled
    expect(result).toBe(true);
  });

  test('should work with async handlers', async () => {
    const executed: string[] = [];

    // First async handler that cancels
    emitter.subscribe('async.cancel', async (event: any) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      executed.push('first');
      event.cancel();
    });

    // Second async handler that should not execute
    emitter.subscribe('async.cancel', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      executed.push('second');
    });

    const result = await emitter.publish('async.cancel', {}, { cancelable: true });

    expect(executed).toEqual(['first']);
    expect(result).toBe(false);
  });

  test('should be able to access original event data with cancel method', async () => {
    // Handler that checks the event data and then cancels
    emitter.subscribe('data.cancel', (event: any) => {
      expect(event.id).toBe(123);
      expect(event.name).toBe('test');
      expect(typeof event.cancel).toBe('function');
      event.cancel();
    });

    const result = await emitter.publish('data.cancel', { id: 123, name: 'test' }, { cancelable: true });
    expect(result).toBe(false);
  });

  test('should support old signature with numeric timeout', async () => {
    const executed: string[] = [];

    // Handler that doesn't cancel
    emitter.subscribe('old.signature', () => {
      executed.push('executed');
    });

    // Using the old signature with numeric timeout
    const result = await emitter.publish('old.signature', {}, 1000);

    expect(executed).toEqual(['executed']);
    expect(result).toBe(true);
  });

  test('should handle timeout options', async () => {
    let executed = false;

    // Handler that takes longer than the timeout
    emitter.subscribe('timeout.test', async (event: any) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      executed = true;
      event.cancel();
    });

    // Publish with short timeout
    const result = await emitter.publish('timeout.test', {}, { cancelable: true, timeout: 20 });

    // The handler should have started but been cut off by the timeout
    // So the event is not considered canceled
    expect(result).toBe(true);
  });

  test('wildcards should work with cancelable events', async () => {
    const executed: string[] = [];

    // Handler for wildcard that cancels
    emitter.subscribe('wildcard.*', (event: any) => {
      executed.push('wildcard');
      event.cancel();
    });

    // More specific handler that should not execute
    emitter.subscribe('wildcard.specific', () => {
      executed.push('specific');
    });

    const result = await emitter.publish('wildcard.specific', {}, { cancelable: true });

    expect(executed).toEqual(['wildcard']);
    expect(result).toBe(false);
  });
});
describe('Cancelable events - preserving the payload', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('an array payload stays an array and can still be canceled', async () => {
    let received: any;
    emitter.subscribe('batch.items', (items: any) => {
      received = items;
      items.cancel();
    });

    const result = await emitter.publish('batch.items', [1, 2, 3], { cancelable: true });

    expect(Array.isArray(received)).toBe(true);
    expect([...received]).toEqual([1, 2, 3]);
    expect(result).toBe(false);
  });

  test('a class instance keeps its type and methods and can still be canceled', async () => {
    let received: any;
    emitter.subscribe('clock.tick', (date: any) => {
      received = { isDate: date instanceof Date, time: date.getTime() };
      date.cancel();
    });

    const result = await emitter.publish('clock.tick', new Date(1000), { cancelable: true });

    expect(received).toEqual({ isDate: true, time: 1000 });
    expect(result).toBe(false);
  });

  test('a primitive payload is delivered unchanged', async () => {
    const handler = vi.fn();
    emitter.subscribe('chat.text', handler);

    await emitter.publish('chat.text', 'hello', { cancelable: true });

    expect(handler).toHaveBeenCalledWith('hello');
  });

  test('handlers can read the canceled flag', async () => {
    const flags: boolean[] = [];
    emitter.subscribe('form.submit', (event: any) => {
      flags.push(event.canceled);
      event.cancel();
      flags.push(event.canceled);
    });

    await emitter.publish('form.submit', { id: 1 }, { cancelable: true });

    expect(flags).toEqual([false, true]);
  });

  test('cancel() still works after an earlier subscriber transformed the data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const lastHandler = vi.fn();
    emitter.subscribe('order.placed', () => {}, {
      priority: 10,
      transform: (order: any) => ({ total: order.total * 2 })
    });
    emitter.subscribe('order.placed', (order: any) => order.cancel(), { priority: 5 });
    emitter.subscribe('order.placed', lastHandler, { priority: 0 });

    const result = await emitter.publish('order.placed', { total: 1 }, { cancelable: true });

    expect(result).toBe(false);
    expect(lastHandler).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('Cancelable events - objects that are proxied', () => {
  test("answer 'cancel' in data and 'canceled' in data, as plain objects do", async () => {
    const emitter = new EvEm();
    const seen: boolean[] = [];
    emitter.subscribe('when', (data: Date) => {
      seen.push('cancel' in data, 'canceled' in data, 'getTime' in data, 'nope' in data);
    });

    await emitter.publish('when', new Date(0), { cancelable: true });

    expect(seen).toEqual([true, true, true, false]);
  });
});

describe('Cancelable events - payloads of every kind', () => {
  test('passes a primitive as it is: nothing to add cancel() to', async () => {
    const emitter = new EvEm();
    const received: unknown[] = [];
    emitter.subscribe('amount', (data: number) => {
      received.push(data);
    });
    expect(await emitter.publish('amount', 5000, { cancelable: true })).toBe(true);
    expect(received).toEqual([5000]);
  });

  test("copies a plain object, so a subscriber's changes don't reach the publisher's", async () => {
    const emitter = new EvEm();
    const order: { status: string; cancel?: () => void } = { status: 'new' };
    emitter.subscribe('order', (data: { status: string }) => {
      data.status = 'changed';
    });
    await emitter.publish('order', order, { cancelable: true });
    expect(order).toEqual({ status: 'new' });
    expect('cancel' in order).toBe(false);
  });

  test('copies an array as an array, and an object without a prototype as a plain object', async () => {
    const emitter = new EvEm();
    const seen: unknown[] = [];
    emitter.subscribe('list', (data: { n?: number; cancel?: unknown }) => {
      seen.push(Array.isArray(data), data.n, typeof data.cancel);
    });
    const bare = Object.create(null) as Record<string, number>;
    bare.n = 1;
    await emitter.publish('list', [1, 2], { cancelable: true });
    await emitter.publish('list', bare, { cancelable: true });
    expect(seen).toEqual([true, undefined, 'function', false, 1, 'function']);
    expect('cancel' in bare).toBe(false);
  });

  test("copies an object without a prototype, so a subscriber's changes don't reach the publisher's", async () => {
    const emitter = new EvEm();
    emitter.subscribe('list', (data: { n: number }) => {
      data.n = 2;
    });
    const bare = Object.create(null) as { n: number };
    bare.n = 1;
    await emitter.publish('list', bare, { cancelable: true });
    expect(bare.n).toBe(1);
  });

  test('passes null as it is', async () => {
    const emitter = new EvEm();
    const received: unknown[] = [];
    emitter.subscribe('maybe', (data: unknown) => {
      received.push(data);
    });
    expect(await emitter.publish('maybe', null, { cancelable: true })).toBe(true);
    expect(received).toEqual([null]);
  });

  test('a proxied object reports canceled, and reads its own fields and methods', async () => {
    class Order {
      id = 7;
      label() {
        return `order ${this.id}`;
      }
    }
    const emitter = new EvEm();
    const seen: unknown[] = [];
    emitter.subscribe('order', (data: Order & { canceled: boolean; cancel(): void }) => {
      seen.push(data.canceled, data.id, data.label());
      data.cancel();
      seen.push(data.canceled);
    });
    expect(await emitter.publish('order', new Order(), { cancelable: true })).toBe(false);
    expect(seen).toEqual([false, 7, 'order 7', true]);
  });

  test("doesn't run the transform of the subscriber that canceled", async () => {
    const emitter = new EvEm();
    const transform = vi.fn((data: object) => data);
    emitter.subscribe('pay', (data: { cancel(): void }) => data.cancel(), { transform });
    expect(await emitter.publish('pay', { amount: 1 }, { cancelable: true })).toBe(false);
    expect(transform).not.toHaveBeenCalled();
  });
});

describe('Cancelable events - arrays keep only their items as keys', () => {
  test("cancel and canceled aren't among an array's keys", async () => {
    const emitter = new EvEm();
    let keys: string[] = [];
    emitter.subscribe('list', (data: number[]) => {
      keys = Object.keys(data);
    });
    await emitter.publish('list', [1, 2], { cancelable: true });
    expect(keys).toEqual(['0', '1']);
  });
});
