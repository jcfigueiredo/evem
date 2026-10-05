import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EvEm } from '../src/eventEmitter';

// 100 generated cases per property by default; FC_NUM_RUNS=5000 pnpm test:nowatch <this file> searches longer
fc.configureGlobal({ numRuns: Number(process.env['FC_NUM_RUNS'] ?? 100) });

/**
 * Model-based tests: generated sequences of subscribe, subscribeOnce, unsubscribe (by id and by callback) and
 * publish, run on EvEm and on a plain model of who should get each event. Callbacks are shared between
 * subscriptions (so unsubscribing by callback has to pick the right one), and callback 3 unsubscribes the newest
 * subscription while it runs.
 */

const PATTERNS = ['a', 'a.b', 'a.*', '*.b', '*'] as const;
const EVENTS = ['a', 'a.b', 'a.c', 'b.b'] as const;
const PRIORITIES = ['high', 'normal', 'low', 5, -5, 0] as const;
const CALLBACKS = 4;

type Operation =
  | { kind: 'subscribe'; pattern: string; callback: number; priority: (typeof PRIORITIES)[number]; once: boolean }
  | { kind: 'unsubscribeById'; subscription: number }
  | { kind: 'unsubscribeByCallback'; pattern: string; callback: number }
  | { kind: 'publish'; event: string };

const operation: fc.Arbitrary<Operation> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constant('subscribe' as const),
      pattern: fc.constantFrom(...PATTERNS),
      callback: fc.integer({ min: 0, max: CALLBACKS - 1 }),
      priority: fc.oneof({ arbitrary: fc.constant('normal' as const), weight: 3 }, fc.constantFrom(...PRIORITIES)),
      once: fc.boolean()
    }),
    weight: 4
  },
  {
    arbitrary: fc.record({ kind: fc.constant('unsubscribeById' as const), subscription: fc.nat({ max: 20 }) }),
    weight: 1
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('unsubscribeByCallback' as const),
      pattern: fc.constantFrom(...PATTERNS),
      callback: fc.integer({ min: 0, max: CALLBACKS - 1 })
    }),
    weight: 1
  },
  { arbitrary: fc.record({ kind: fc.constant('publish' as const), event: fc.constantFrom(...EVENTS) }), weight: 3 }
);

/** Which events each pattern matches, written out (the wildcard rules have their own property tests) */
const MATCHES: Record<string, readonly string[]> = {
  a: ['a'],
  'a.b': ['a.b'],
  'a.*': ['a.b', 'a.c'],
  '*.b': ['a.b', 'b.b'],
  '*': EVENTS
};

const numeric = (priority: (typeof PRIORITIES)[number]) =>
  priority === 'high' ? 100 : priority === 'low' ? -100 : priority === 'normal' ? 0 : priority;

interface ModelSubscription {
  pattern: string;
  callback: number;
  priority: number;
  once: boolean;
  alive: boolean;
}

describe('Subscriptions - model-based', () => {
  it('calls exactly who the model says, in order, through any sequence of subscribes, unsubscribes and publishes', async () => {
    await fc.assert(
      // Long enough for the sequences that matter (the same callback twice on a pattern, ties across patterns)
      fc.asyncProperty(fc.array(operation, { minLength: 5, maxLength: 40 }), async operations => {
        const evem = new EvEm();
        const model: ModelSubscription[] = [];
        const ids: string[] = [];
        let calls: number[] = [];
        // Callback 3 also unsubscribes the newest subscription (still running in this publish: publishes work
        // on the subscriptions that matched when they started)
        const callbacks = Array.from({ length: CALLBACKS }, (_, index) => () => {
          calls.push(index);
          if (index === 3) evem.unsubscribeById(ids[ids.length - 1]!);
        });

        for (const step of operations) {
          if (step.kind === 'subscribe') {
            const options = { priority: step.priority };
            ids.push(
              step.once
                ? evem.subscribeOnce(step.pattern, callbacks[step.callback]!, options)
                : evem.subscribe(step.pattern, callbacks[step.callback]!, options)
            );
            model.push({
              pattern: step.pattern,
              callback: step.callback,
              priority: numeric(step.priority),
              once: step.once,
              alive: true
            });
          } else if (step.kind === 'unsubscribeById') {
            if (step.subscription < ids.length) {
              evem.unsubscribeById(ids[step.subscription]!);
              model[step.subscription]!.alive = false;
            }
          } else if (step.kind === 'unsubscribeByCallback') {
            const first = model.find(
              each => each.alive && each.pattern === step.pattern && each.callback === step.callback
            );
            // Unsubscribing from a pattern nobody subscribed to warns; that's not what this test is about
            if (model.some(each => each.alive && each.pattern === step.pattern)) {
              evem.unsubscribe(step.pattern, callbacks[step.callback]!);
            }
            if (first) first.alive = false;
          } else {
            // Highest priority first, then in the order they subscribed; once subscriptions leave as they run
            const matching = model
              .filter(each => each.alive && MATCHES[each.pattern]!.includes(step.event))
              .sort((a, b) => b.priority - a.priority || model.indexOf(a) - model.indexOf(b));
            const expected = matching.map(each => each.callback);
            for (const each of matching) {
              if (each.once) each.alive = false;
              if (each.callback === 3) model[model.length - 1]!.alive = false;
            }
            calls = [];
            await evem.publish(step.event);
            expect(calls).toEqual(expected);
          }
        }

        // And what info() lists is what's still subscribed
        const listed = evem
          .info()
          .filter(each => !each.isMiddleware)
          .map(each => ids.indexOf(each.id!))
          .sort((a, b) => a - b);
        const alive = model.flatMap((each, index) => (each.alive ? [index] : []));
        expect(listed).toEqual(alive);
      })
    );
  });
});
