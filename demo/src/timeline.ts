import type { SkipReason, TraceEntry } from './engine/trace';

export type Tone = 'primary' | 'neutral' | 'info' | 'success' | 'warning' | 'error';

/** One line of the timeline */
export interface TimelineRow {
  text: string;
  /** Data shown after the text (JSON, shortened) */
  detail?: string;
  tone: Tone;
  /** 0 for top-level lines; lines recorded during a publish are one level deeper than it */
  depth: number;
  /** Milliseconds since the scenario started */
  at: number;
}

const SKIP_TEXT: Record<SkipReason, string> = {
  filtered: 'filtered out',
  schema: 'rejected by its schema',
  throttled: 'throttled',
  debounced: 'debounced (runs later if nothing else arrives)',
  canceled: 'the event was canceled first',
  stopped: 'the publish stopped on an error first',
  'not-called': 'not called'
};

/** JSON keeps none of an error's own fields: show its name and message */
const showErrors = (_key: string, value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : value;

/** Data as short JSON for the timeline */
export function preview(value: unknown, max = 72): string {
  let text: string;
  try {
    text = JSON.stringify(value, showErrors) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** What a trace entry says, in words */
export function describeEntry(entry: TraceEntry): Omit<TimelineRow, 'depth' | 'at'> {
  switch (entry.kind) {
    case 'subscribe':
      return {
        text: `${entry.subscription} subscribed to ${entry.pattern}`,
        ...(entry.options.length > 0 ? { detail: entry.options.join(', ') } : {}),
        tone: 'neutral'
      };
    case 'unsubscribe':
      return {
        text: entry.once
          ? `${entry.subscription} unsubscribed after its one run (once)`
          : `${entry.subscription} unsubscribed`,
        tone: 'neutral'
      };
    case 'publish':
      return {
        text: `publish ${entry.event}`,
        ...(entry.data === undefined ? {} : { detail: preview(entry.data) }),
        tone: 'primary'
      };
    case 'result':
      return { text: `resolved ${entry.result}`, tone: entry.result ? 'success' : 'warning' };
    case 'rejected':
      return { text: `rejected: ${entry.error}`, tone: 'error' };
    case 'middleware': {
      const detail = entry.data === undefined ? {} : { detail: preview(entry.data) };
      return entry.outcome === 'reroute'
        ? { text: `middleware ${entry.name} rerouted it to ${entry.to}`, ...detail, tone: 'info' }
        : entry.outcome === 'cancel'
          ? { text: `middleware ${entry.name} canceled it`, tone: 'warning' }
          : { text: `middleware ${entry.name} passed it on`, ...detail, tone: 'info' };
    }
    case 'match':
      return {
        text: `${entry.subscription}: "${entry.pattern}" ${entry.matched ? 'matches' : "doesn't match"} "${entry.event}"`,
        detail: entry.reason,
        tone: entry.matched ? 'info' : 'neutral'
      };
    case 'schema':
      return {
        text: `${entry.subscription}: data ${entry.valid ? 'valid' : 'invalid'}`,
        tone: entry.valid ? 'info' : 'warning'
      };
    case 'filter':
      return {
        text: `${entry.subscription}: ${entry.name} ${entry.passed ? 'passed it' : 'rejected it'}`,
        tone: entry.passed ? 'info' : 'warning'
      };
    case 'call':
      return {
        text: `${entry.subscription} ran${entry.replayed ? ' (replayed from history)' : entry.later ? ' (later)' : ''}`,
        detail: preview(entry.data),
        tone: 'success'
      };
    case 'cancel':
      return { text: `${entry.subscription} canceled the event`, tone: 'warning' };
    case 'transform':
      return { text: `${entry.subscription} transformed the data`, detail: preview(entry.data), tone: 'info' };
    case 'skip':
      return { text: `${entry.subscription} skipped: ${SKIP_TEXT[entry.reason]}`, tone: 'neutral' };
    case 'error':
      return {
        text: entry.subscription ? `${entry.subscription} threw: ${entry.message}` : `error: ${entry.message}`,
        tone: 'error'
      };
    case 'action':
      return { text: `▶ ${entry.label}`, tone: 'primary' };
    case 'log':
      return {
        text: entry.text,
        tone: entry.level === 'log' ? 'neutral' : entry.level === 'warn' ? 'warning' : 'error'
      };
  }
}

/** The trace as timeline rows, in order; what happened during a publish is indented under it */
export function timelineRows(entries: readonly TraceEntry[]): TimelineRow[] {
  const publishDepth = new Map<number, number>();
  const publishedAt = new Map<number, number>();
  return entries.map(entry => {
    if (entry.kind === 'call' && entry.later) {
      // A call that comes after its publish ended (debounce) stands on its own, and says which publish it came from
      const at = entry.publish === undefined ? undefined : publishedAt.get(entry.publish);
      const text = `${entry.subscription} ran later${at === undefined ? '' : `, with the data published at ${at} ms`}`;
      return { ...describeEntry(entry), text, depth: 0, at: entry.at };
    }
    const depth = entry.publish === undefined ? 0 : (publishDepth.get(entry.publish) ?? 0) + 1;
    if (entry.kind === 'publish') {
      publishDepth.set(entry.id, depth);
      publishedAt.set(entry.id, entry.at);
    }
    return { ...describeEntry(entry), depth, at: entry.at };
  });
}

/** Rows as a screen reader hears them: one short sentence each */
export function announcement(rows: readonly TimelineRow[]): string {
  return rows.map(row => `${row.text}.`).join(' ');
}

/**
 * The entries of the latest action, from its `action` entry on (none before the first action): what a compact view
 * shows, with the setup and earlier actions left out
 */
export function sinceLatestAction(entries: readonly TraceEntry[]): TraceEntry[] {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index]!.kind === 'action') return entries.slice(index);
  }
  return [];
}

/** How long after the reader's last click, change or key press new rows are still read out */
const ANNOUNCE_WINDOW = 5000;

/**
 * What the live region reads out for new rows: what the reader's own interaction caused, in the few seconds after it.
 * A stream that runs by itself (a tick every second) isn't read out, or it would talk over everything else.
 */
export function liveAnnouncement(rows: readonly TimelineRow[], msSinceInteraction: number): string | undefined {
  return rows.length > 0 && msSinceInteraction <= ANNOUNCE_WINDOW ? announcement(rows) : undefined;
}

/**
 * Whether a scrolled list shows its end (give or take a line): a list keeps following new content only for a reader
 * who was there, so scrolling up to read stays put
 */
export function isAtEnd(box: { scrollTop: number; scrollHeight: number; clientHeight: number }): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight < 24;
}
