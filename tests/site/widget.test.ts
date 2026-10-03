import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScenarioSession } from '../../demo/src/engine/session';
import type { TraceEntry } from '../../demo/src/engine/trace';
import { scenarios } from '../../demo/src/scenarios';
import { OUTPUT_SHOWN, serverControls, widgetEntries } from '../../demo/src/showcase/widget';

const scenario = (id: string) => scenarios.find(candidate => candidate.id === id)!;
const at = { at: 0 };
const entries: TraceEntry[] = [
  { kind: 'subscribe', subscription: 'tick', pattern: 'server.tick', options: [], ...at },
  { kind: 'publish', id: 1, event: 'server.tick', data: { n: 1 }, ...at },
  { kind: 'action', label: 'Show the last event id', ...at },
  { kind: 'log', level: 'log', text: 'last event id: 1', ...at },
  { kind: 'publish', id: 2, event: 'server.tick', data: { n: 2 }, ...at }
];

describe('widgetEntries', () => {
  it("shows a feature's latest action, and an adapter's whole stream after its setup (a stream doesn't wait for a button)", () => {
    expect(widgetEntries(scenario('priorities'), entries, 1)).toEqual(entries.slice(2));
    expect(widgetEntries(scenario('reconnect-resume'), entries, 1)).toEqual(entries.slice(1));
    expect(widgetEntries(scenario('connection-queue'), entries, 1)).toEqual(entries.slice(1));
  });
});

describe("an adapter card's stream", () => {
  it('keeps only its latest entries, so a card left open for hours stays as quick as a new one', () => {
    const stream: TraceEntry[] = Array.from({ length: OUTPUT_SHOWN * 3 }, (_, n) => ({
      kind: 'log',
      level: 'log',
      text: `tick ${n}`,
      at: n
    }));
    const shown = widgetEntries(scenario('reconnect-resume'), [entries[0]!, ...stream], 1);
    expect(shown).toHaveLength(OUTPUT_SHOWN);
    expect(shown.at(-1)).toBe(stream.at(-1));
  });
});

describe('serverControls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers no server controls for a feature', () => {
    expect(serverControls(scenario('priorities'))).toEqual([]);
  });

  it.each(['connection-queue', 'reconnect-resume'])("offers %s's card a drop button that its server runs", async id => {
    vi.stubGlobal('location', { href: 'http://localhost:5199/' });
    const controls = serverControls(scenario(id));
    expect(controls.map(control => control.command)).toEqual(['drop']);
    const session = new ScenarioSession(scenario(id));
    await session.reset();
    // The fake connection opens after its latency: wait for it, however loaded the machine
    await vi.waitFor(() => expect(session.server!.openConnections).toBe(1));
    for (const { command } of controls) session.server!.run(command);
    expect(session.server!.wire.at(-1)?.text).toMatch(/connection 1 dropped/);
    session.stop();
  });
});
