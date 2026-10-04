import type { Scenario, ScenarioToggle } from './engine/session';
import type { TraceEntry } from './engine/trace';
import { latestConnectionState } from './timeline';

/**
 * Whether a scenario's switch is on, read from what EvEm did, so it's right however its actions ran (the switch, ▶ in
 * the code, edited code): a subscription is on while it was last subscribed; an adapter's connection, unless it's
 * disconnected or disconnecting
 */
export function toggleState(toggle: ScenarioToggle, entries: readonly TraceEntry[]): boolean {
  if (toggle.state === 'connection') {
    const state = latestConnectionState(entries);
    return state !== undefined && state !== 'disconnected' && state !== 'disconnecting';
  }
  const { subscription } = toggle.state;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (entry.kind === 'subscribe' && entry.subscription === subscription) return true;
    if (entry.kind === 'unsubscribe' && entry.subscription === subscription) return false;
  }
  return false;
}

/** The labels of the actions a scenario's switches run, which its action buttons leave out */
export function toggleActions(scenario: Scenario): Set<string> {
  return new Set((scenario.toggles ?? []).flatMap(toggle => [toggle.on, toggle.off]));
}
