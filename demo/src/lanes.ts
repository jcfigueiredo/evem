import type { TraceEntry } from './engine/trace';
import { preview } from './timeline';

/** One mark on a lane: a publish, a subscriber's run, or a run that throttle or debounce held back */
export interface LaneDot {
  /** Milliseconds since the scenario started */
  at: number;
  kind: 'publish' | 'ran' | 'held';
  /** What the mark is, for its tooltip */
  title: string;
}

export interface Lane {
  name: string;
  dots: LaneDot[];
}

/** The latest action on a time line: every publish on one lane, then a lane per subscriber */
export interface LaneChart {
  /** When the action started, and the last thing that happened since */
  start: number;
  end: number;
  published: LaneDot[];
  lanes: Lane[];
}

/**
 * The time axis for a chart lasting `duration` ms: its span (a little longer), and readable ticks, at most
 * `maxIntervals` of them apart (fewer on a narrow chart, so their labels don't collide)
 */
export function timeAxis(duration: number, maxIntervals = 8): { span: number; ticks: number[] } {
  const span = Math.max(Math.ceil(duration * 1.05), 400);
  const step =
    [50, 100, 200, 250, 500, 1000, 2000, 5000, 10_000, 30_000].find(size => span / size <= maxIntervals) ?? 60_000;
  const ticks: number[] = [];
  for (let tick = 0; tick <= span; tick += step) ticks.push(tick);
  return { span, ticks };
}

/** The subscriber names found so far in each trace's entries, which only grow: a render scans just what's new */
const subscriberNames = new WeakMap<readonly TraceEntry[], { scanned: number; names: Set<string> }>();

/** Every subscriber's name in `entries`, in subscription order */
function subscribersOf(entries: readonly TraceEntry[]): string[] {
  let known = subscriberNames.get(entries);
  if (!known || known.scanned > entries.length) known = { scanned: 0, names: new Set<string>() };
  for (let index = known.scanned; index < entries.length; index++) {
    const entry = entries[index]!;
    if (entry.kind === 'subscribe') known.names.add(entry.subscription);
  }
  known.scanned = entries.length;
  subscriberNames.set(entries, known);
  return [...known.names];
}

/**
 * The lanes for the latest action in `entries` (undefined before any): its publishes, and for each subscriber of the
 * scenario, in subscription order, when it ran and when throttle or debounce held it back
 */
export function laneChart(entries: readonly TraceEntry[]): LaneChart | undefined {
  let from = -1;
  for (let index = entries.length - 1; index >= 0 && from === -1; index--) {
    if (entries[index]!.kind === 'action') from = index;
  }
  if (from === -1) return undefined;
  const recent = entries.slice(from);
  const names = subscribersOf(entries);
  const published = recent.flatMap(entry =>
    entry.kind === 'publish'
      ? [{ at: entry.at, kind: 'publish' as const, title: `${entry.event} ${preview(entry.data)}` }]
      : []
  );
  const lanes = names.map(name => ({
    name,
    dots: recent.flatMap((entry): LaneDot[] => {
      if (entry.kind === 'call' && entry.subscription === name) {
        return [
          { at: entry.at, kind: 'ran', title: `${name} ran${entry.later ? ' later' : ''} ${preview(entry.data)}` }
        ];
      }
      if (
        entry.kind === 'skip' &&
        entry.subscription === name &&
        (entry.reason === 'throttled' || entry.reason === 'debounced')
      ) {
        return [{ at: entry.at, kind: 'held', title: `${name}: ${entry.reason}` }];
      }
      return [];
    })
  }));
  return { start: recent[0]!.at, end: Math.max(...recent.map(entry => entry.at)), published, lanes };
}
