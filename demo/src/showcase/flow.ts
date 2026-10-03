import { EvEm } from '@jcfigueiredo/evem';

/** A subscriber in the hero's diagram: what it listens to, and how early it runs */
export interface FlowSubscriber {
  name: string;
  pattern: string;
  priority: number;
}

/** The diagram's subscribers, highest priority first */
export const FLOW_SUBSCRIBERS: readonly FlowSubscriber[] = [
  { name: 'audit', pattern: '*', priority: 10 },
  { name: 'billing', pattern: 'order.*', priority: 5 },
  { name: 'welcome', pattern: 'user.signup', priority: 0 }
];

/** The events the hero publishes, in turn */
export const FLOW_EVENTS: readonly string[] = ['order.created', 'user.signup', 'order.paid', 'debug.ping'];

/** The middleware's rule, as the diagram shows it */
export const FLOW_MIDDLEWARE = 'drops debug.*';

/** What happened to one published event: whether the middleware dropped it, and which subscribers ran, in order */
export interface FlowRun {
  event: string;
  dropped: boolean;
  calls: string[];
}

/**
 * A real EvEm wired like the hero's diagram: a middleware that drops `debug.*` events, and the subscribers above.
 * Each call publishes one event and resolves with what happened to it, which the animation then draws.
 */
export function createFlow(): (event: string) => Promise<FlowRun> {
  const evem = new EvEm();
  let calls: string[] = [];
  evem.use((event, data) => (event.startsWith('debug.') ? null : data));
  for (const subscriber of FLOW_SUBSCRIBERS) {
    evem.subscribe(subscriber.pattern, () => void calls.push(subscriber.name), { priority: subscriber.priority });
  }
  return async event => {
    calls = [];
    const delivered = await evem.publish(event, { at: Date.now() });
    return { event, dropped: !delivered, calls };
  };
}
