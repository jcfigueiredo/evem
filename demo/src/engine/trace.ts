import type { EvEm } from '@jcfigueiredo/evem';

/** Why a subscription that matched an event didn't run */
export type SkipReason = 'filtered' | 'schema' | 'throttled' | 'debounced' | 'canceled' | 'not-called';

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
  private readonly started = performance.now();
  private nextPublishId = 1;
  private readonly open: number[] = [];

  constructor(private readonly bus?: EvEm) {}

  /** The innermost publish still running, if any */
  get currentPublish(): number | undefined {
    return this.open[this.open.length - 1];
  }

  /** Start a publish: returns its id, which entries recorded until `closePublish` are attributed to */
  openPublish(): number {
    const id = this.nextPublishId++;
    this.open.push(id);
    return id;
  }

  closePublish(id: number): void {
    const index = this.open.lastIndexOf(id);
    if (index !== -1) this.open.splice(index, 1);
  }

  record(record: TraceRecord): TraceEntry {
    const entry = {
      ...record,
      at: Math.round(performance.now() - this.started),
      publish: 'publish' in record ? record.publish : this.currentPublish
    } as TraceEntry;
    this.entries.push(entry);
    void this.bus?.publish('trace.entry', entry);
    return entry;
  }
}
