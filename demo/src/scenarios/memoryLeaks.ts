import type { Scenario } from '../engine/session';

export const memoryLeaks: Scenario = {
  id: 'memory-leaks',
  group: 'State & diagnostics',
  title: 'Memory leaks & info()',
  summary:
    "Leak detection warns when an event collects more subscriptions than a threshold, a sign they aren't unsubscribed. info() lists the subscriptions and middleware, optionally for a pattern.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/history-and-debugging.md#memory-leak-detection',
  controls: {
    threshold: { kind: 'number', label: 'warn above', min: 1, max: 10, default: 3 },
    handlers: { kind: 'number', label: 'handlers to add', min: 1, max: 10, default: 5 },
    details: { kind: 'toggle', label: 'show subscription details', default: false }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    '// Warn when an event or pattern has more than {{threshold}} subscriptions',
    'evem.enableMemoryLeakDetection({ threshold: {{threshold}}, showSubscriptionDetails: {{details}} });',
    "evem.subscribe('user.login', () => {}, { priority: 'high' });",
    "evem.use({ pattern: 'button.*', handler: (event, data) => data });",
    '',
    '// ▶ Add click handlers',
    'for (let i = 0; i < {{handlers}}; i++) {',
    "  evem.subscribe('button.click', () => {});",
    '}',
    '',
    '// ▶ Inspect everything with info()',
    'console.log(evem.info());',
    '',
    '// ▶ Inspect button.* with info()',
    "console.log(evem.info('button.*'));"
  ].join('\n'),
  checks: [
    {
      values: { details: true },
      action: 'add-click-handlers',
      calls: [],
      logs: ['Possible memory leak detected', 'Event subscription details:', '  Subscriptions to "button.click": 4']
    },
    {
      action: 'add-click-handlers',
      calls: [],
      logs: ['Possible memory leak detected: 4 handlers added for event "button.click"']
    },
    { action: 'inspect-everything-with-info', calls: [], logs: ['"event": "user.login"'] },
    { before: ['add-click-handlers'], action: 'inspect-button-with-info', calls: [], logs: ['"event": "button.click"'] }
  ]
};
