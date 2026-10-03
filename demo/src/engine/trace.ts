import type { EvEm } from '@jcfigueiredo/evem';

/** Why a subscription that matched an event didn't run */
export type SkipReason = 'filtered' | 'schema' | 'throttled' | 'debounced' | 'canceled' | 'stopped' | 'not-called';

/** One thing EvEm did, as the timeline shows it. `publish` is the id of the publish it happened in, if any */
export type TraceEntry = { at: number; publish?: number } & (
  | { kind: 'subscribe'; subscription: string; pattern: string; options: string[] }
  | { kind: 'unsubscribe'; subscription: string }
  | { kind: 'publish'; id: number; event: string; data: unknown }
  | { kind: 'result'; id: number; result: boolean }
  | { kind: 'rejected'; id: number; error: string }
  | { kind: 'middleware'; name: string; outcome: 'continue' | 'cancel' | 'reroute'; to?: string }
  | { kind: 'schema'; subscription: string; valid: boolean }
  | { kind: 'filter'; subscription: string; name: string; passed: boolean }
  | { kind: 'call'; subscription: string; data: unknown; later?: boolean }
  | { kind: 'cancel'; subscription: string }
  | { kind: 'transform'; subscription: string; data: unknown }
  | { kind: 'skip'; subscription: string; reason: SkipReason }
  | { kind: 'error'; message: string; subscription?: string }
  | { kind: 'log'; level: 'log' | 'warn' | 'error'; text: string }
);

/** A TraceEntry without the fields the trace fills in */
export type TraceRecord = TraceEntry extends infer Entry
  ? Entry extends TraceEntry
    ? Omit<Entry, 'at' | 'publish'> & { publish?: number }
    : never
  : never;

/**
 * What one scenario run did, in order. Each entry is also published on the playground's own emitter as
 * `trace.entry`, which is how the timeline hears about it.
 */
export class Trace {
  readonly entries: TraceEntry[] = [];
  /**
   * The publish whose handler (middleware, callback, filter, schema or transform) is running right now, if any.
   * The traced EvEm sets it while EvEm runs one, so entries recorded meanwhile belong to that publish, even when
   * publishes overlap.
   */
  currentPublish: number | undefined;
  private readonly started = performance.now();
  private nextPublishId = 1;
  /** Publishes still running, oldest first, each with the publish it was started in */
  private readonly running = new Map<number, number | undefined>();

  constructor(private readonly bus?: EvEm) {}

  /** Start a publish (in `parent`, if a handler started it): returns its id */
  startPublish(parent: number | undefined): number {
    const id = this.nextPublishId++;
    this.running.set(id, parent);
    return id;
  }

  endPublish(id: number): void {
    this.running.delete(id);
  }

  /**
   * The publish an entry recorded outside any handler belongs to (a log after a callback's await, EvEm's own error
   * log): the innermost running publish, if every running publish is nested in it, so there's no doubt
   */
  private soleRunningPublish(): number | undefined {
    const newest = [...this.running.keys()].at(-1);
    let nested = 0;
    for (let id = newest; id !== undefined && this.running.has(id); id = this.running.get(id)) nested++;
    return nested === this.running.size ? newest : undefined;
  }

  record(record: TraceRecord): TraceEntry {
    const entry = {
      ...record,
      at: Math.round(performance.now() - this.started),
      publish: 'publish' in record ? record.publish : (this.currentPublish ?? this.soleRunningPublish())
    } as TraceEntry;
    this.entries.push(entry);
    void this.bus?.publish('trace.entry', entry);
    return entry;
  }
}
