import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ScenarioSession } from '../../demo/src/engine/session';
import { scenarios } from '../../demo/src/scenarios';
import { FLOW_MIDDLEWARE, FLOW_SUBSCRIBERS } from '../../demo/src/showcase/flow';

const page = readFileSync(new URL('../../demo/index.html', import.meta.url), 'utf8');
/** The text of an element, tags stripped, whitespace collapsed */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('the showcase page', () => {
  it("mounts a widget for each feature section, each one of the playground's scenarios with an action to run", async () => {
    const ids = [...page.matchAll(/data-scenario="([^"]+)"/g)].map(match => match[1]);
    expect(ids).toEqual([
      'wildcards',
      'priorities',
      'middleware',
      'throttle-debounce',
      'cancelable-events',
      'history-replay',
      'schema-validation'
    ]);
    for (const id of ids) {
      const scenario = scenarios.find(candidate => candidate.id === id);
      expect(scenario, id).toBeDefined();
      const session = new ScenarioSession(scenario!);
      await session.reset();
      session.stop();
      expect(session.actions.length, id).toBeGreaterThan(0);
    }
  });

  it('draws the hero diagram as the flow is wired: its middleware, and each subscriber with its pattern and priority', () => {
    const nodes = new Map(
      [...page.matchAll(/data-flow-node="([^"]+)"\s*>([\s\S]*?)<\/div>/g)].map(match => [match[1], textOf(match[2]!)])
    );
    expect([...nodes.keys()]).toEqual([
      'publish',
      'middleware',
      ...FLOW_SUBSCRIBERS.map(subscriber => subscriber.name)
    ]);
    expect(nodes.get('middleware')).toContain(FLOW_MIDDLEWARE);
    for (const { name, pattern, priority } of FLOW_SUBSCRIBERS) {
      expect(nodes.get(name)).toBe(`${name} ${pattern} priority ${priority}`);
    }
  });
});
