import type { Scenario } from '../engine/session';

const PRIORITIES = ['high', 'normal', 'low', 10, -10] as const;

export const priorities: Scenario = {
  id: 'priorities',
  group: 'Core',
  title: 'Priorities',
  summary:
    "Subscribers run highest priority first: 'high' is 100, 'normal' 0, 'low' -100, or any number. Equal priorities run in the order they subscribed.",
  docs: 'https://github.com/jcfigueiredo/evem#prioritizing-events',
  controls: {
    auditPriority: { kind: 'select', label: 'audit priority', options: PRIORITIES, default: 'low' },
    emailPriority: { kind: 'select', label: 'email priority', options: PRIORITIES, default: 'normal' },
    metricsPriority: { kind: 'select', label: 'metrics priority', options: PRIORITIES, default: 'high' }
  },
  helpers: {
    audit: () => {},
    email: () => {},
    metrics: () => {}
  },
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    "evem.subscribe('order.created', audit, { priority: {{auditPriority}} });",
    "evem.subscribe('order.created', email, { priority: {{emailPriority}} });",
    "evem.subscribe('order.created', metrics, { priority: {{metricsPriority}} });",
    '',
    '// ▶ Publish order.created',
    "await evem.publish('order.created', { id: 42, total: 99 });"
  ].join('\n'),
  checks: [
    { action: 'publish-order-created', calls: ['metrics', 'email', 'audit'], result: true },
    {
      values: { auditPriority: 'normal', emailPriority: 'normal', metricsPriority: 'normal' },
      action: 'publish-order-created',
      calls: ['audit', 'email', 'metrics'],
      result: true
    },
    {
      values: { auditPriority: 10, emailPriority: 'high', metricsPriority: -10 },
      action: 'publish-order-created',
      calls: ['email', 'audit', 'metrics'],
      result: true
    }
  ]
};
