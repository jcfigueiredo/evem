import type { Scenario } from '../engine/session';

export const once: Scenario = {
  id: 'once',
  group: 'Core',
  title: 'Once',
  summary:
    'A once subscription runs a single time, then unsubscribes. Only an event that gets through its filter uses it up.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/events.md#using-once-only-events',
  controls: {
    bigOver: {
      kind: 'number',
      label: 'a big order is over',
      hint: 'firstBigOrder runs once, for the first order over this total.',
      min: 0,
      max: 1000,
      step: 10,
      default: 100
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const welcome = user => console.log(`Welcome, ${user.name}: this shows once`);',
    'const firstBigOrder = order => console.log(`The first big order: ${order.total}`);',
    '',
    "evem.subscribeOnce('user.login', welcome);",
    '// Only an event that gets through the filter uses up a once subscription',
    "evem.subscribe('order.created', firstBigOrder, { once: true, filter: order => order.total > {{bigOver}} });",
    '',
    '// ▶ Log in',
    "await evem.publish('user.login', { name: 'Ada' });",
    '',
    '// ▶ Small order',
    "await evem.publish('order.created', { total: 20 });",
    '',
    '// ▶ Big order',
    "await evem.publish('order.created', { total: 500 });"
  ].join('\n'),
  checks: [
    { action: 'log-in', calls: ['welcome'], logs: ['Welcome, Ada: this shows once'] },
    { before: ['log-in'], action: 'log-in', calls: [], skipped: [] },
    { action: 'small-order', calls: [], skipped: ['firstBigOrder: filtered'] },
    { before: ['small-order'], action: 'big-order', calls: ['firstBigOrder'] },
    { before: ['big-order'], action: 'big-order', calls: [], skipped: [] }
  ]
};
