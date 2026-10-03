import { describe, expect, it } from 'vitest';
import { createFlow, FLOW_EVENTS, FLOW_SUBSCRIBERS } from '../../demo/src/showcase/flow';

describe('createFlow', () => {
  it('publishes through a real EvEm: the middleware drops debug.*, and matching subscribers run by priority', async () => {
    const flow = createFlow();
    expect(await flow('order.created')).toEqual({
      event: 'order.created',
      dropped: false,
      calls: ['audit', 'billing']
    });
    expect(await flow('user.signup')).toEqual({ event: 'user.signup', dropped: false, calls: ['audit', 'welcome'] });
    expect(await flow('debug.ping')).toEqual({ event: 'debug.ping', dropped: true, calls: [] });
  });

  it('cycles through events that show each part of the diagram, with subscribers listed highest priority first', async () => {
    const flow = createFlow();
    const runs = [];
    for (const event of FLOW_EVENTS) runs.push(await flow(event));
    expect(runs.some(run => run.dropped)).toBe(true);
    for (const subscriber of FLOW_SUBSCRIBERS) expect(runs.some(run => run.calls.includes(subscriber.name))).toBe(true);
    const priorities = FLOW_SUBSCRIBERS.map(subscriber => subscriber.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});
