import type { Scenario } from '../engine/session';

export const cancelableEvents: Scenario = {
  id: 'cancelable-events',
  group: 'Control & errors',
  title: 'Cancelable events',
  summary:
    "Publish with cancelable: true and subscribers get cancel(), which stops the ones after them. Objects and arrays are copied to carry it; primitives can't.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/events.md#using-cancelable-events',
  controls: {
    payload: {
      kind: 'select',
      label: 'payload',
      options: ['{ amount: 50 }', '{ amount: 5000 }', '[50, 5000]', '5000'],
      default: '{ amount: 5000 }',
      raw: true
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const tooBig = payment =>',
    '  Array.isArray(payment) ? payment.some(amount => amount > 1000) : (payment.amount ?? payment) > 1000;',
    '',
    'const fraudCheck = payment => {',
    '  if (!tooBig(payment)) return;',
    "  if (typeof payment.cancel === 'function') payment.cancel();",
    '  else console.log("too big, but a primitive payload has no cancel()");',
    '};',
    "const charge = payment => console.log('charged', payment);",
    '',
    "evem.subscribe('payment.requested', fraudCheck, { priority: 'high' });",
    "evem.subscribe('payment.requested', charge);",
    '',
    '// ▶ Publish payment.requested',
    "const completed = await evem.publish('payment.requested', {{payload}}, { cancelable: true });",
    "console.log(completed ? 'payment completed' : 'payment canceled');"
  ].join('\n'),
  checks: [
    {
      action: 'publish-payment-requested',
      calls: ['fraudCheck'],
      result: false,
      skipped: ['charge: canceled'],
      logs: ['payment canceled']
    },
    {
      values: { payload: '{ amount: 50 }' },
      action: 'publish-payment-requested',
      calls: ['fraudCheck', 'charge'],
      result: true
    },
    { values: { payload: '[50, 5000]' }, action: 'publish-payment-requested', calls: ['fraudCheck'], result: false },
    {
      values: { payload: '5000' },
      action: 'publish-payment-requested',
      calls: ['fraudCheck', 'charge'],
      result: true,
      logs: ['a primitive payload has no cancel()', 'payment completed']
    }
  ]
};
