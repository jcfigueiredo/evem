import { EvEm } from '~/eventEmitter';
import { loadInlineEvEm } from './demoPages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests: the flow-control demo's inline EvEm must combine throttle and debounce like the
 * real library ("process first event immediately, then wait for pause"). An event passes right away
 * if the throttle window has expired; otherwise it is debounced, so the last event of a burst is
 * still handled once events stop. The inline copy throttled first and dropped every event inside the
 * window, so the first event was only handled after the debounce delay and the last one never was.
 */

type Emitter = { subscribe: (...args: any[]) => unknown; publish: (...args: any[]) => unknown };

interface Handled {
  value: number;
  /** Milliseconds after the first publish */
  at: number;
}

/** The demo's burst: publish 1..20 every 50ms to a subscriber with throttleTime 300 + debounceTime 300 */
async function runCombinedBurst(evem: Emitter): Promise<Handled[]> {
  const handled: Handled[] = [];
  const start = Date.now();
  evem.subscribe(
    'combined.event',
    (value: number) => {
      handled.push({ value, at: Date.now() - start });
    },
    { throttleTime: 300, debounceTime: 300 }
  );

  for (let value = 1; value <= 20; value++) {
    void evem.publish('combined.event', value);
    await vi.advanceTimersByTimeAsync(50);
  }
  await vi.advanceTimersByTimeAsync(1000);
  return handled;
}

/** Events at 0, 350 and 700ms each start a new throttle window; the last event (20, at 950ms) is debounced */
const EXPECTED_COMBINED: Handled[] = [
  { value: 1, at: 0 },
  { value: 8, at: 350 },
  { value: 15, at: 700 },
  { value: 20, at: 1250 }
];

describe('demo pages: flow-control.html throttle + debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the expected timeline matches the real library', async () => {
    expect(await runCombinedBurst(new EvEm())).toEqual(EXPECTED_COMBINED);
  });

  it('handles the first event immediately and the last event after the pause, like the real library', async () => {
    const { EvEm: InlineEvEm } = loadInlineEvEm('flow-control.html');
    const handled = await runCombinedBurst(new InlineEvEm());

    expect(handled[0]).toEqual({ value: 1, at: 0 });
    expect(handled[handled.length - 1]).toEqual({ value: 20, at: 1250 });
    expect(handled).toEqual(EXPECTED_COMBINED);
  });

  it('still throttles and debounces on their own', async () => {
    const { EvEm: InlineEvEm } = loadInlineEvEm('flow-control.html');
    const evem = new InlineEvEm();
    const throttled: number[] = [];
    const debounced: number[] = [];
    evem.subscribe(
      'throttle.event',
      (value: number) => {
        throttled.push(value);
      },
      { throttleTime: 500 }
    );
    evem.subscribe(
      'debounce.event',
      (value: number) => {
        debounced.push(value);
      },
      { debounceTime: 500 }
    );

    for (let value = 1; value <= 20; value++) {
      void evem.publish('throttle.event', value);
      void evem.publish('debounce.event', value);
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(1000);

    expect(throttled).toEqual([1, 11]);
    expect(debounced).toEqual([20]);
  });
});
