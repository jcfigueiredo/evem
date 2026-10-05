import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { EvEm } from '../src/eventEmitter';

// 100 generated cases per property by default; FC_NUM_RUNS=5000 pnpm test:nowatch <this file> searches longer
fc.configureGlobal({ numRuns: Number(process.env['FC_NUM_RUNS'] ?? 100) });

/** A call the subscriber got: which event's data, and when */
type Call = [data: number, at: number];

/**
 * The times of a burst of events, from the gaps between them. Small numbers, so events often land exactly at the
 * end of a window or a delay, where off-by-one mistakes show
 */
const gaps = fc.array(fc.integer({ min: 0, max: 40 }), { minLength: 1, maxLength: 15 });
const time = fc.integer({ min: 1, max: 40 });
const START = 1_000_000;

/** Publish event i (data i) after each gap, with fake timers; then let every pending timer run */
async function run(
  options: { throttleTime?: number; debounceTime?: number },
  between: readonly number[]
): Promise<Call[]> {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  try {
    const evem = new EvEm();
    const calls: Call[] = [];
    evem.subscribe(
      'scroll',
      (data: number) => {
        calls.push([data, Date.now() - START]);
      },
      options
    );
    for (const [index, gap] of between.entries()) {
      if (index > 0) await vi.advanceTimersByTimeAsync(gap);
      await evem.publish('scroll', index);
    }
    await vi.advanceTimersByTimeAsync(10_000);
    return calls;
  } finally {
    vi.useRealTimers();
  }
}

/** The event times, from the gaps (the first gap is ignored: the first event is at 0) */
const timesOf = (between: readonly number[]) =>
  between.map((_, index) => between.slice(1, index + 1).reduce((a, b) => a + b, 0));

/** Throttle: an event runs when at least throttleTime has passed since the last run; the others are dropped */
function throttleModel(times: readonly number[], throttleTime: number): Call[] {
  const calls: Call[] = [];
  let lastRun = Number.NEGATIVE_INFINITY;
  times.forEach((at, index) => {
    if (at >= lastRun + throttleTime) {
      lastRun = at;
      calls.push([index, at]);
    }
  });
  return calls;
}

/**
 * Debounce: an event runs debounceTime after it, with its data, unless another comes first (one exactly
 * debounceTime later comes after the timer has fired)
 */
function debounceModel(times: readonly number[], debounceTime: number): Call[] {
  return times.flatMap((at, index): Call[] => {
    const next = times[index + 1];
    return next === undefined || next >= at + debounceTime ? [[index, at + debounceTime]] : [];
  });
}

/**
 * Both: an event runs at once when more than throttleTime has passed since the last immediate run; otherwise it's
 * debounced, replacing a call still pending. Any event clears the pending call, even one that runs at once
 */
function throttleDebounceModel(times: readonly number[], throttleTime: number, debounceTime: number): Call[] {
  const calls: Call[] = [];
  let lastImmediate = Number.NEGATIVE_INFINITY;
  let pending: Call | undefined;
  times.forEach((at, index) => {
    if (pending && pending[1] <= at) calls.push(pending); // fired before this event
    pending = undefined;
    if (at - lastImmediate > throttleTime) {
      lastImmediate = at;
      calls.push([index, at]);
    } else {
      pending = [index, at + debounceTime];
    }
  });
  if (pending) calls.push(pending);
  return calls;
}

describe('Throttle and debounce - properties', () => {
  it('throttle runs exactly the events at least throttleTime after the last run', async () => {
    await fc.assert(
      fc.asyncProperty(gaps, time, async (between, throttleTime) => {
        expect(await run({ throttleTime }, between)).toEqual(throttleModel(timesOf(between), throttleTime));
      })
    );
  });

  it('debounce runs each event that no other followed within debounceTime, debounceTime later, with its data', async () => {
    await fc.assert(
      fc.asyncProperty(gaps, time, async (between, debounceTime) => {
        expect(await run({ debounceTime }, between)).toEqual(debounceModel(timesOf(between), debounceTime));
      })
    );
  });

  it('both together run an event at once or debounce it, as the rules say', async () => {
    await fc.assert(
      fc.asyncProperty(gaps, time, time, async (between, throttleTime, debounceTime) => {
        expect(await run({ throttleTime, debounceTime }, between)).toEqual(
          throttleDebounceModel(timesOf(between), throttleTime, debounceTime)
        );
      })
    );
  });
});
