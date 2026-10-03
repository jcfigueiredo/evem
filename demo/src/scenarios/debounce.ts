import type { Scenario } from '../engine/session';

export const debounce: Scenario = {
  id: 'debounce',
  group: 'Flow control',
  title: 'Debounce',
  summary:
    'Each event restarts a debounced subscriber’s timer: it runs once the events pause for debounceTime, with the last one. The run comes after its publish has finished.',
  docs: 'https://github.com/jcfigueiredo/evem#debouncing-events',
  controls: {
    debounce: { kind: 'number', label: 'debounceTime (ms)', min: 50, max: 1000, step: 50, default: 300 },
    gap: { kind: 'number', label: 'time between events (ms)', min: 10, max: 600, step: 10, default: 100 }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const everyKey = () => {};',
    'const search = query => console.log(`searching for "${query.q}"`);',
    '',
    "evem.subscribe('search.typed', everyKey);",
    '// Each event restarts a {{debounce}} ms timer: search runs once typing pauses, with the last event',
    "evem.subscribe('search.typed', search, { debounceTime: {{debounce}} });",
    '',
    '// ▶ Type "events"',
    "const word = 'events';",
    'for (let i = 1; i <= word.length; i++) {',
    "  await evem.publish('search.typed', { q: word.slice(0, i) });",
    '  await sleep({{gap}});',
    '}'
  ].join('\n'),
  checks: [
    {
      action: 'type-events',
      calls: ['everyKey', 'everyKey', 'everyKey', 'everyKey', 'everyKey', 'everyKey', 'search'],
      logs: ['searching for "events"']
    },
    {
      values: { gap: 400 },
      action: 'type-events',
      calls: [
        'everyKey',
        'search',
        'everyKey',
        'search',
        'everyKey',
        'search',
        'everyKey',
        'search',
        'everyKey',
        'search',
        'everyKey',
        'search'
      ],
      logs: ['searching for "e"', 'searching for "events"']
    },
    {
      values: { debounce: 1000 },
      action: 'type-events',
      calls: ['everyKey', 'everyKey', 'everyKey', 'everyKey', 'everyKey', 'everyKey', 'search'],
      logs: ['searching for "events"']
    }
  ],
  lanes: true
};
