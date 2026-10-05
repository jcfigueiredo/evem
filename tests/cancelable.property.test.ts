import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EvEm } from '../src/eventEmitter';

// 100 generated cases per property by default; FC_NUM_RUNS=5000 pnpm test:nowatch <this file> searches longer
fc.configureGlobal({ numRuns: Number(process.env['FC_NUM_RUNS'] ?? 100) });

/**
 * Any value: primitives, plain and prototype-less objects, sparse and typed arrays, Map, Set, Date, boxed values,
 * odd keys. Not `cancel` and `canceled`, which a cancelable event takes over on purpose
 */
const payload = fc.anything({
  key: fc.string().filter(key => key !== 'cancel' && key !== 'canceled'),
  withBoxedValues: true,
  withMap: true,
  withSet: true,
  withDate: true,
  withTypedArray: true,
  withSparseArray: true,
  withNullPrototype: true
});

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;
/**
 * What a subscriber reads from an object through its own methods. Not toEqual on the proxy itself: a proxy has
 * none of its target's internal slots, so brand checks (which toEqual uses) see a plain object
 */
const TypedArray = Object.getPrototypeOf(Int8Array) as abstract new () => object; // ArrayBuffer.isView is a brand check too
const view = (value: any): unknown =>
  value instanceof Map
    ? [...value.entries()]
    : value instanceof Set
      ? [...value.values()]
      : value instanceof Date
        ? value.getTime()
        : value instanceof TypedArray
          ? [...(value as unknown as Iterable<unknown>)]
          : value instanceof Number || value instanceof String || value instanceof Boolean
            ? value.valueOf()
            : undefined;
const isCopied = (value: object) =>
  Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null);

describe('Cancelable events - any payload', () => {
  it('delivers the payload as it is (primitives), as a copy (plain objects, arrays) or a proxy (the rest), cancelable', async () => {
    await fc.assert(
      fc.asyncProperty(payload, async published => {
        const evem = new EvEm();
        let seen: any;
        let canceledBefore: unknown;
        evem.subscribe('p', (data: any) => {
          seen = data;
          canceledBefore = isObject(data) ? (data as { canceled?: unknown }).canceled : undefined;
        });

        expect(await evem.publish('p', published, { cancelable: true })).toBe(true);

        // A publish without data delivers {} (so it can be canceled too); other primitives as they are
        if (published === undefined) {
          expect(typeof seen.cancel).toBe('function');
          expect({ ...seen, cancel: undefined }).toEqual({ cancel: undefined });
          return;
        }
        if (!isObject(published)) {
          expect(Object.is(seen, published)).toBe(true);
          return;
        }
        expect(typeof seen.cancel).toBe('function');
        expect(canceledBefore).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(published, 'cancel')).toBe(false); // the publisher's is untouched
        if (isCopied(published)) {
          expect(seen).not.toBe(published);
          const { cancel: _cancel, ...fields } = seen;
          expect(Array.isArray(published) ? [...seen] : fields).toEqual(
            Array.isArray(published) ? [...published] : { ...published }
          );
        } else {
          expect(Object.getPrototypeOf(seen)).toBe(Object.getPrototypeOf(published));
          expect(view(seen)).toEqual(view(published));
          for (const key of Reflect.ownKeys(published)) {
            const value = (published as Record<PropertyKey, unknown>)[key];
            if (typeof value !== 'function') expect(Object.is(seen[key], value)).toBe(true);
          }
        }
      })
    );
  });

  it('lets a subscriber cancel any object payload, so the ones after it never get it', async () => {
    await fc.assert(
      fc.asyncProperty(payload.filter(isObject), async published => {
        const evem = new EvEm();
        let later = false;
        evem.subscribe(
          'p',
          (data: { cancel(): void; canceled: boolean }) => {
            data.cancel();
            expect(data.canceled).toBe(true);
          },
          { priority: 'high' }
        );
        evem.subscribe('p', () => {
          later = true;
        });
        expect(await evem.publish('p', published, { cancelable: true })).toBe(false);
        expect(later).toBe(false);
      })
    );
  });
});
