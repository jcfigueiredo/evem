import { describe, expect, it } from 'vitest';
import type { TraceEntry } from '../../demo/src/engine/trace';
import { laneChart, timeAxis } from '../../demo/src/lanes';

describe('timeAxis', () => {
  it('spans the duration with a little room, at least 400 ms, with at most 8 steps of a round size', () => {
    expect(timeAxis(0)).toEqual({ span: 400, ticks: [0, 50, 100, 150, 200, 250, 300, 350, 400] });
    expect(timeAxis(1000)).toEqual({ span: 1050, ticks: [0, 200, 400, 600, 800, 1000] });
    expect(timeAxis(4000).ticks).toEqual([0, 1000, 2000, 3000, 4000]);
  });

  it('covers a long burst in at most 8 steps, and takes the smaller step when it fits exactly', () => {
    expect(timeAxis(12_000).ticks).toEqual([0, 2000, 4000, 6000, 8000, 10_000, 12_000]);
    // 800 ms × 1.05 = 840: 100 ms steps would be 8.4 intervals; 800 / 1.05 → span 800: exactly 8 steps of 100
    expect(timeAxis(800 / 1.05).ticks).toHaveLength(9);
  });

  it('takes fewer, larger steps when the track only has room for a few labels', () => {
    expect(timeAxis(1000, 3)).toEqual({ span: 1050, ticks: [0, 500, 1000] });
    expect(timeAxis(12_000, 2).ticks).toEqual([0, 10_000]);
  });
});

describe('laneChart', () => {
  const setup: TraceEntry[] = [
    { kind: 'subscribe', subscription: 'everyKey', pattern: 'typed', options: [], at: 0 },
    { kind: 'subscribe', subscription: 'search', pattern: 'typed', options: ['debounce 300 ms'], at: 0 },
    { kind: 'subscribe', subscription: 'never', pattern: 'other', options: [], at: 0 }
  ];

  it('is undefined before any action', () => {
    expect(laneChart(setup)).toBeUndefined();
  });

  it("shows the latest action's publishes, and each subscriber's runs and held-back calls, in subscription order", () => {
    const entries: TraceEntry[] = [
      ...setup,
      { kind: 'action', label: 'Type', at: 10 },
      { kind: 'publish', id: 1, event: 'typed', data: { q: 'e' }, at: 100 },
      { kind: 'call', subscription: 'everyKey', data: { q: 'e' }, publish: 1, at: 100 },
      { kind: 'skip', subscription: 'search', reason: 'debounced', publish: 1, at: 101 },
      { kind: 'action', label: 'Type', at: 1000 },
      { kind: 'publish', id: 2, event: 'typed', data: { q: 'ev' }, at: 1010 },
      { kind: 'call', subscription: 'everyKey', data: { q: 'ev' }, publish: 2, at: 1010 },
      { kind: 'skip', subscription: 'search', reason: 'debounced', publish: 2, at: 1011 },
      { kind: 'skip', subscription: 'everyKey', reason: 'filtered', publish: 2, at: 1011 },
      { kind: 'call', subscription: 'search', data: { q: 'ev' }, later: true, publish: 2, at: 1311 }
    ];

    expect(laneChart(entries)).toEqual({
      start: 1000,
      end: 1311,
      published: [{ at: 1010, kind: 'publish', title: 'typed {"q":"ev"}' }],
      lanes: [
        { name: 'everyKey', dots: [{ at: 1010, kind: 'ran', title: 'everyKey ran {"q":"ev"}' }] },
        {
          name: 'search',
          dots: [
            { at: 1011, kind: 'held', title: 'search: debounced' },
            { at: 1311, kind: 'ran', title: 'search ran later {"q":"ev"}' }
          ]
        },
        { name: 'never', dots: [] }
      ]
    });
  });
});
