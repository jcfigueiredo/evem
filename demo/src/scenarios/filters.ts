import type { Scenario } from '../engine/session';

export const filters: Scenario = {
  id: 'filters',
  group: 'Core',
  title: 'Filters',
  summary:
    'A filter decides, from the data, whether a subscriber runs. Filters can be async, and several in an array must all pass, in order.',
  docs: 'https://github.com/jcfigueiredo/evem#filtering-events',
  controls: {
    total: { kind: 'number', label: 'order total', min: 0, max: 1000, step: 10, default: 250 },
    vip: { kind: 'toggle', label: 'VIP customer', default: false },
    test: { kind: 'toggle', label: 'test order', default: false }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const isBig = order => order.total > 100;',
    '// An async filter: publish waits for its answer',
    'const isVip = async order => {',
    '  await sleep(100);',
    '  return order.vip;',
    '};',
    'const isReal = order => !order.test;',
    '',
    'const bigOrders = order => console.log(`Big order: ${order.total}`);',
    "const vipOrders = () => console.log('VIP order');",
    "const realBigOrders = () => console.log('A real big order');",
    '',
    "evem.subscribe('order.created', bigOrders, { filter: isBig });",
    "evem.subscribe('order.created', vipOrders, { filter: isVip });",
    '// Several filters run in order, stop at the first that says no, and must all pass',
    "evem.subscribe('order.created', realBigOrders, { filter: [isReal, isBig] });",
    '',
    '// ▶ Publish order.created',
    "await evem.publish('order.created', { id: 7, total: {{total}}, vip: {{vip}}, test: {{test}} });"
  ].join('\n'),
  checks: [
    { action: 'publish-order-created', calls: ['bigOrders', 'realBigOrders'], skipped: ['vipOrders: filtered'] },
    {
      values: { total: 50 },
      action: 'publish-order-created',
      calls: [],
      skipped: ['bigOrders: filtered', 'vipOrders: filtered', 'realBigOrders: filtered']
    },
    {
      values: { vip: true, test: true },
      action: 'publish-order-created',
      calls: ['bigOrders', 'vipOrders'],
      skipped: ['realBigOrders: filtered']
    }
  ]
};
