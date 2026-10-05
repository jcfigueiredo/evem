import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EvEm, Priority } from '../src/eventEmitter';

// 100 generated cases per property by default; FC_NUM_RUNS=5000 pnpm test:nowatch <this file> searches longer
fc.configureGlobal({ numRuns: Number(process.env['FC_NUM_RUNS'] ?? 100) });

type PriorityOption = number | 'high' | 'normal' | 'low' | Priority | undefined;

// Named levels, the enum, and numbers: equal ones often (ties), fractions, infinities and NaN
const priority: fc.Arbitrary<PriorityOption> = fc.oneof(
  fc.constantFrom<PriorityOption>('high', 'normal', 'low', undefined, Priority.HIGH, Priority.LOW, 0, 100, -100),
  fc.integer({ min: -3, max: 3 }),
  fc.double(),
  fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, -0)
);

/** The documented order: high is 100, normal (and no priority, and NaN) 0, low -100; numbers as they are */
const numeric = (option: PriorityOption) =>
  option === 'high' ? 100 : option === 'low' ? -100 : typeof option === 'number' && !Number.isNaN(option) ? option : 0;

describe('Priorities - properties', () => {
  it('runs subscribers highest priority first, and equal priorities in the order they subscribed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(priority, fc.constantFrom('order.created', 'order.*', '*')), { minLength: 1, maxLength: 12 }),
        async subscriptions => {
          const evem = new EvEm();
          const order: number[] = [];
          subscriptions.forEach(([option, pattern], index) => {
            evem.subscribe(
              pattern,
              () => {
                order.push(index);
              },
              option === undefined ? {} : { priority: option }
            );
          });
          await evem.publish('order.created');
          const expected = subscriptions
            .map(([option], index) => ({ index, value: numeric(option) }))
            .sort((a, b) => (a.value === b.value ? a.index - b.index : b.value - a.value))
            .map(each => each.index);
          expect(order).toEqual(expected);
        }
      )
    );
  });
});
