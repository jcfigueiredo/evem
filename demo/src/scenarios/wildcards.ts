import type { Scenario } from '../engine/session';

export const wildcards: Scenario = {
  id: 'wildcards',
  group: 'Core',
  title: 'Wildcards',
  summary:
    'Event names are split on dots, or on the separator you choose. * alone matches every event, a * at the end matches one or more segments, and any other * exactly one. Type a pattern and an event to see what matches, and why.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/events.md#using-wildcards-in-event-subscription',
  controls: {
    pattern: {
      kind: 'text',
      label: 'your pattern',
      hint: 'What your subscriber listens to: a * in the middle matches one segment; at the end, one or more.',
      default: 'user.*',
      suggestions: ['*', 'user.*', '*.created', 'system.*.error', 'user.login', 'user:*', 'server:*']
    },
    event: {
      kind: 'text',
      label: 'event to publish',
      hint: 'The event published: see which patterns match it, and why.',
      default: 'user.login',
      suggestions: [
        'user.login',
        'user',
        'user.profile.updated',
        'admin.user.created',
        'system.db.error',
        'system.error',
        'user:login',
        'server:task-changed'
      ]
    },
    separator: {
      kind: 'select',
      label: 'separator',
      hint: "What splits names into segments. With ':', dots are ordinary characters.",
      options: ['.', ':'],
      default: '.'
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm({ separator: {{separator}} });',
    'const yours = () => {};',
    'const everything = () => {};',
    '',
    'evem.subscribe({{pattern}}, yours);',
    "evem.subscribe('*', everything);",
    '',
    '// ▶ Publish',
    'await evem.publish({{event}});'
  ].join('\n'),
  checks: [
    { action: 'publish', calls: ['yours', 'everything'], result: true },
    { values: { event: 'user' }, action: 'publish', calls: ['everything'] },
    { values: { event: 'user.profile.updated' }, action: 'publish', calls: ['yours', 'everything'] },
    {
      values: { pattern: 'system.*.error', event: 'system.db.error' },
      action: 'publish',
      calls: ['yours', 'everything']
    },
    { values: { pattern: '*.created', event: 'admin.user.created' }, action: 'publish', calls: ['everything'] },
    {
      values: { separator: ':', pattern: 'user:*', event: 'user:login' },
      action: 'publish',
      calls: ['yours', 'everything']
    },
    { values: { separator: ':', pattern: 'user.*', event: 'user.login' }, action: 'publish', calls: ['everything'] },
    {
      values: { separator: ':', pattern: 'server:*', event: 'server:task-changed' },
      action: 'publish',
      calls: ['yours', 'everything']
    }
  ],
  explainMatches: true
};
