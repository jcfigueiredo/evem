import { describe, expect, it } from 'vitest';
import { splitActions } from '../../demo/src/engine/program';
import type { TraceEntry } from '../../demo/src/engine/trace';
import { scenarios } from '../../demo/src/scenarios';
import { toggleActions, toggleState } from '../../demo/src/toggles';

const subscribe = (subscription: string, at: number): TraceEntry => ({
  kind: 'subscribe',
  subscription,
  pattern: 'user.registered',
  options: [],
  at
});
const unsubscribe = (subscription: string, at: number): TraceEntry => ({ kind: 'unsubscribe', subscription, at });
const state = (to: string, at: number): TraceEntry => ({
  kind: 'publish',
  id: at,
  event: 'sse.connection.state',
  data: { from: 'x', to, timestamp: 0 },
  at
});

describe('toggleState', () => {
  const welcome = {
    label: 'welcome subscribed',
    on: 'Subscribe welcome',
    off: 'Unsubscribe welcome',
    state: { subscription: 'welcome' }
  };

  it('is on while the subscription was last subscribed, by whatever ran it (a switch, ▶ in the code, edited code)', () => {
    expect(toggleState(welcome, [])).toBe(false);
    expect(toggleState(welcome, [subscribe('welcome', 0)])).toBe(true);
    expect(toggleState(welcome, [subscribe('welcome', 0), unsubscribe('welcome', 1)])).toBe(false);
    expect(toggleState(welcome, [subscribe('welcome', 0), unsubscribe('welcome', 1), subscribe('welcome', 2)])).toBe(
      true
    );
    expect(toggleState(welcome, [subscribe('welcome', 0), unsubscribe('other', 1)])).toBe(true);
  });

  it("follows an adapter's connection: on unless it's disconnected (or disconnecting)", () => {
    const connected = { label: 'Connected', on: 'Connect', off: 'Disconnect', state: 'connection' } as const;
    expect(toggleState(connected, [])).toBe(false);
    expect(toggleState(connected, [state('connecting', 0)])).toBe(true);
    expect(toggleState(connected, [state('connected', 0), state('reconnecting', 1)])).toBe(true);
    expect(toggleState(connected, [state('connected', 0), state('disconnecting', 1)])).toBe(false);
    expect(toggleState(connected, [state('disconnected', 0)])).toBe(false);
  });
});

describe("the scenarios' switches", () => {
  it('each turn on and off with actions their code has, which the action buttons then leave out', () => {
    for (const scenario of scenarios) {
      const labels = splitActions(scenario.code).actions.map(action => action.label);
      for (const toggle of scenario.toggles ?? []) {
        expect(labels, `${scenario.id}: ${toggle.label}`).toContain(toggle.on);
        expect(labels, `${scenario.id}: ${toggle.label}`).toContain(toggle.off);
      }
      const inSwitches = toggleActions(scenario);
      expect([...inSwitches].sort()).toEqual(
        (scenario.toggles ?? []).flatMap(toggle => [toggle.on, toggle.off]).sort()
      );
    }
  });

  it('cover the actions that undo each other', () => {
    const switched = (id: string) =>
      (scenarios.find(scenario => scenario.id === id)?.toggles ?? []).map(toggle => toggle.label);
    expect(switched('publish-subscribe')).toEqual(['welcome subscribed', 'sendEmail subscribed']);
    expect(switched('reconnect-resume')).toEqual(['Connected']);
  });
});
