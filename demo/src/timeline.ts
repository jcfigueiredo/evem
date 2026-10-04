import type { ActionRun, SkipReason, TraceEntry } from './engine/trace';

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
  /** Milliseconds since the latest action started (none before the first action) */
  since?: number;
  /** The kind of trace entry the line shows (what the code logged reads differently from EvEm's own steps) */
  kind: TraceEntry['kind'];
  /** The subscription the line is about (who ran, was skipped, threw, subscribed or left), if any */
  subject?: string;
  /** The publish the line belongs to (a publish's own line and its result included), if any */
  publish?: number;
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
export function describeEntry(entry: TraceEntry): Omit<TimelineRow, 'depth' | 'at' | 'since' | 'kind'> {
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
  const publishedAt = new Map<number, string>();
  let actionAt: number | undefined;
  /** A time as the timeline shows it: since the latest action (`+N ms`), or since the start before any action */
  const shown = (at: number) => (actionAt === undefined ? `${at} ms` : `+${at - actionAt} ms`);
  return entries.map(entry => {
    if (entry.kind === 'action') actionAt = entry.at;
    const publish =
      entry.kind === 'publish' || entry.kind === 'result' || entry.kind === 'rejected' ? entry.id : entry.publish;
    const since = {
      ...(actionAt === undefined ? {} : { since: entry.at - actionAt }),
      ...('subscription' in entry && entry.subscription !== undefined ? { subject: entry.subscription } : {}),
      ...(publish === undefined ? {} : { publish })
    };
    if (entry.kind === 'call' && entry.later) {
      // A call that comes after its publish ended (debounce) stands on its own, and says which publish it came from
      const at = entry.publish === undefined ? undefined : publishedAt.get(entry.publish);
      const text = `${entry.subscription} ran later${at === undefined ? '' : `, with the data published at ${at}`}`;
      return { ...describeEntry(entry), text, depth: 0, at: entry.at, ...since, kind: entry.kind };
    }
    const depth = entry.publish === undefined ? 0 : (publishDepth.get(entry.publish) ?? 0) + 1;
    if (entry.kind === 'publish') {
      publishDepth.set(entry.id, depth);
      publishedAt.set(entry.id, shown(entry.at));
    }
    return { ...describeEntry(entry), depth, at: entry.at, ...since, kind: entry.kind };
  });
}

/** Timeline rows the reader takes in together; the first one is the group's header */
export interface RowGroup {
  rows: TimelineRow[];
}

/**
 * The rows in groups, in order: an action with everything that happened until its run ended (`runs`), so a run reads
 * from cause to effect; outside an action, each top-level row with the rows under it. Rows that belong to a publish
 * (its subscribers, its result, a debounced call) join its group, even when other rows came in between, and what the
 * code printed outside any publish after an action's run joins that action.
 */
export function groupRuns(rows: readonly TimelineRow[], runs: readonly ActionRun[]): RowGroup[] {
  const groups: RowGroup[] = [];
  const byPublish = new Map<number, RowGroup>();
  let action: { group: RowGroup; end: number } | undefined;
  // The latest action's group, even after its run ended: what the code prints later (a debounced callback, the rest of
  // an async one after its timeout) belongs to it, since only its code could have printed it
  let latestAction: RowGroup | undefined;
  const place = (group: RowGroup, row: TimelineRow) => {
    group.rows.push(row);
    if (row.kind === 'publish' && row.publish !== undefined) byPublish.set(row.publish, group);
  };
  const start = (row: TimelineRow) => {
    const group: RowGroup = { rows: [] };
    groups.push(group);
    place(group, row);
    return group;
  };
  for (const row of rows) {
    const owner = row.publish === undefined ? undefined : byPublish.get(row.publish);
    if (row.kind === 'action') {
      const run = runs.find(candidate => candidate.at === row.at);
      action = { group: start(row), end: run?.end ?? Number.POSITIVE_INFINITY };
      latestAction = action.group;
    } else if (owner && row.kind !== 'publish') {
      place(owner, row);
    } else if (row.depth > 0 && groups.length > 0) {
      place(groups.at(-1)!, row);
    } else if (action && row.at <= action.end) {
      place(action.group, row);
    } else if (latestAction && row.publish === undefined && (row.kind === 'log' || row.kind === 'error')) {
      place(latestAction, row);
    } else {
      action = undefined;
      start(row);
    }
  }
  return groups;
}

/**
 * Which groups (indexes) are open until the reader says otherwise: the latest action's, until the next action, and
 * the newest group that has something to fold (a stream's latest event, a response that came late). A single row
 * isn't a fold, so it never closes the run above it.
 */
export function openByDefault(groups: readonly RowGroup[]): Set<number> {
  const last = (matches: (group: RowGroup) => boolean) => {
    for (let index = groups.length - 1; index >= 0; index--) if (matches(groups[index]!)) return [index];
    return [];
  };
  return new Set([...last(group => group.rows[0]?.kind === 'action'), ...last(group => group.rows.length > 1)]);
}

/** Names as a sentence lists them: `a`, `a and b`, `a, b and c`, `a, b, c and 2 more` */
function listNames(names: readonly string[]): string {
  if (names.length > 3) return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * A folded group in one line: its header, then what it caused (how many publishes, who ran, was skipped, left or
 * joined, how many errors, and how the publishes resolved), e.g.
 * `▶ Publish user.registered · welcome, sendEmail and afterEmail ran · resolved true`
 */
export function groupSummary(rows: readonly TimelineRow[]): string {
  const [header] = rows;
  if (!header) return '';
  return [header.detail ? `${header.text} ${header.detail}` : header.text, ...groupFacts(rows)].join(' · ');
}

/** What a group's rows after its header caused, as `groupSummary` lists it */
export function groupFacts(rows: readonly TimelineRow[]): string[] {
  const [, ...rest] = rows;
  const subjects = (kind: TimelineRow['kind']) => [
    ...new Set(rest.flatMap(row => (row.kind === kind && row.subject !== undefined ? [row.subject] : [])))
  ];
  const publishes = rows.filter(row => row.kind === 'publish').length;
  const errors = rest.filter(row => row.kind === 'error' || row.kind === 'rejected').length;
  const results = [
    ...new Set(rest.flatMap(row => (row.kind === 'result' ? [row.text.replace(/^resolved /, '')] : [])))
  ];
  return [
    publishes > 1 ? `${publishes} publishes` : '',
    ...(
      [
        ['call', 'ran'],
        ['skip', 'skipped'],
        ['unsubscribe', 'unsubscribed'],
        ['subscribe', 'subscribed']
      ] as const
    ).map(([kind, verb]) => {
      const names = subjects(kind);
      return names.length > 0 ? `${listNames(names)} ${verb}` : '';
    }),
    errors > 0 ? `${errors} ${errors === 1 ? 'error' : 'errors'}` : '',
    results.length > 0 ? `resolved ${results.join(', ')}` : ''
  ].filter(fact => fact !== '');
}

/**
 * What a log (the timeline, the wire) showed before the scenario started over, and what started it over (a control,
 * Reset, …)
 */
export interface HistorySegment<Row = TimelineRow> {
  label: string;
  rows: Row[];
  /** The actions run in it, to group its rows as they were (see groupRuns) */
  runs?: ActionRun[];
  /** What names its folds, so the reader's opened ones stay open (see groupItems) */
  scope?: string;
}

/**
 * The timeline's history after one more restart: the earlier segments, then `segment`, keeping at most `maxRows`
 * rows in all (the oldest go first, and a segment left empty goes with them), so a long session stays quick
 */
export function keepHistory<Row>(
  history: readonly HistorySegment<Row>[],
  segment: HistorySegment<Row>,
  maxRows = 500
): HistorySegment<Row>[] {
  let room = maxRows;
  const kept: HistorySegment<Row>[] = [];
  for (const each of [...history, segment].reverse()) {
    if (room <= 0) break;
    const rows = each.rows.slice(Math.max(0, each.rows.length - room));
    room -= rows.length;
    kept.unshift({ ...each, rows });
  }
  return kept.filter(each => each.rows.length > 0);
}

/**
 * The state an adapter's connection last moved to among `entries` (the `to` of the latest `ws.connection.state` or
 * `sse.connection.state` publish), or undefined if it didn't change: an adapter's card announces it even when the
 * stream's own ticks aren't
 */
export function latestConnectionState(entries: readonly TraceEntry[]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (entry.kind !== 'publish' || !/^(ws|sse)\.connection\.state$/.test(entry.event)) continue;
    const to = (entry.data as { to?: unknown } | null)?.to;
    if (typeof to === 'string') return to;
  }
  return undefined;
}

/**
 * The rows of the entries from `from` on (after the setup, or after the reader cleared the timeline), computed over
 * the whole trace, so a row still nests under its publish and is timed from its action when those come before `from`
 */
export function rowsFrom(entries: readonly TraceEntry[], from: number): TimelineRow[] {
  return timelineRows(entries).slice(from);
}

/**
 * How many of `total` entries a hidden timeline tab counts as new: those after both where the timeline starts
 * (`from`) and what the reader last saw (`seen`), as entry indexes, so a setup whose end isn't known yet stops
 * counting once it is
 */
export function unseenRows(total: number, from: number, seen: number): number {
  return Math.max(0, total - Math.max(from, seen));
}

/** One line about a setup the timeline folds away: how many subscriptions, publishes, logs and errors it made */
export function setupSummary(entries: readonly TraceEntry[]): string {
  const count = (kind: TraceEntry['kind']) => entries.filter(entry => entry.kind === kind).length;
  const parts = (
    [
      ['subscribe', 'subscription', 'subscriptions'],
      ['publish', 'publish', 'publishes'],
      ['log', 'log', 'logs'],
      ['error', 'error', 'errors']
    ] as const
  ).flatMap(([kind, one, many]) => {
    const n = count(kind);
    return n === 0 ? [] : [`${n} ${n === 1 ? one : many}`];
  });
  return `Setup · ${parts.length > 0 ? parts.join(', ') : `${entries.length} steps`}`;
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

/**
 * Whether a newest-first list that grew should keep following its top: while its reader is there; a hidden one
 * (0 all round) keeps what it was doing. One that doesn't is held where its reader is (see `holdScroll`).
 */
export function keepsFollowingTop(
  box: { scrollTop: number; scrollHeight: number; clientHeight: number },
  wasFollowing: boolean
): boolean {
  return box.clientHeight === 0 ? wasFollowing : box.scrollTop < 24;
}

/**
 * Whether a list that grew should keep following its end. A box on screen is followed while its reader is at its
 * end; a hidden one (a tab that isn't shown) measures 0 all round, so it keeps what it was doing, and its tab scrolls
 * it to the end when it's shown again.
 */
export function keepsFollowing(
  box: { scrollTop: number; scrollHeight: number; clientHeight: number },
  wasFollowing: boolean
): boolean {
  return box.clientHeight === 0 ? wasFollowing : isAtEnd(box);
}
