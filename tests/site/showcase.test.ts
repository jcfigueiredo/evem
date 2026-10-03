import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScenarioSession } from '../../demo/src/engine/session';
import { scenarios } from '../../demo/src/scenarios';
import { createFlow, FLOW_EVENTS, FLOW_MIDDLEWARE, FLOW_SUBSCRIBERS } from '../../demo/src/showcase/flow';
import { WIDGET_HEIGHT } from '../../demo/src/showcase/widget';

const page = readFileSync(new URL('../../demo/index.html', import.meta.url), 'utf8');
/** The text of an element, tags stripped, whitespace collapsed */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('the showcase page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts a widget for each feature and adapter section, each one of the playground's scenarios with an action to run", async () => {
    const ids = [...page.matchAll(/data-scenario="([^"]+)"/g)].map(match => match[1]);
    expect(ids).toEqual([
      'wildcards',
      'priorities',
      'middleware',
      'throttle-debounce',
      'cancelable-events',
      'history-replay',
      'schema-validation',
      'connection-queue',
      'reconnect-resume'
    ]);
    // SseHandler takes relative URLs only where there's a page to resolve them against
    vi.stubGlobal('location', { href: 'http://localhost:5199/' });
    for (const id of ids) {
      const scenario = scenarios.find(candidate => candidate.id === id);
      expect(scenario, id).toBeDefined();
      const session = new ScenarioSession(scenario!);
      await session.reset();
      session.stop();
      expect(session.actions.length, id).toBeGreaterThan(0);
    }
  });

  it("reserves each widget's height in its slot, so a widget coming in never moves the page", () => {
    const slots = [...page.matchAll(/<div([^>]*)data-scenario="[^"]+"([^>]*)>/g)].map(match => match[1]! + match[2]!);
    expect(slots).toHaveLength(9);
    for (const slot of slots) {
      const classes = slot.match(/class="([^"]*)"/)?.[1]?.split(/\s+/);
      for (const height of WIDGET_HEIGHT.split(' ')) expect(classes).toContain(height);
    }
  });

  it("keeps the hero diagram's size from the first paint: nothing in it waits hidden for the script", () => {
    const figure = page.slice(page.indexOf('<figure id="flow"'), page.indexOf('</figure>'));
    expect(figure).not.toMatch(/\shidden[\s>]/);
    expect(figure).toContain('data-flow-label');
  });

  it('shows the still diagram as the flow delivers its first event: the subscribers it never reaches are dimmed', async () => {
    const figure = page.slice(page.indexOf('<figure id="flow"'), page.indexOf('</figure>'));
    expect(textOf(/data-flow-event>([^<]*)</.exec(figure)![1]!)).toBe(FLOW_EVENTS[0]);
    const { calls } = await createFlow()(FLOW_EVENTS[0]!);
    const dimmed = [...figure.matchAll(/class="([^"]*)"\s*data-flow-node="([^"]+)"/g)]
      .filter(match => match[1]!.split(/\s+/).includes('opacity-50'))
      .map(match => match[2]);
    expect(dimmed).toEqual(FLOW_SUBSCRIBERS.map(subscriber => subscriber.name).filter(name => !calls.includes(name)));
  });

  it("names the hero's Pause button by what it does, without aria-pressed (it reads Play while paused)", () => {
    const pause = /<button[^>]*data-flow-pause[^>]*>/.exec(page)![0];
    expect(pause).not.toContain('aria-pressed');
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
