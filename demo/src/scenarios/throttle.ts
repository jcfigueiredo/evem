import type { Scenario } from '../engine/session';

export const throttle: Scenario = {
  id: 'throttle',
  group: 'Flow control',
  title: 'Throttle',
  summary:
    'A throttled subscriber runs the first event at once and opens a time window; events during the window are dropped, not delayed. The lanes show which events got through.',
  docs: 'https://github.com/jcfigueiredo/evem#throttling-events',
  controls: {
    throttle: { kind: 'number', label: 'throttleTime (ms)', min: 50, max: 1000, step: 50, default: 250 },
    count: { kind: 'number', label: 'events', min: 2, max: 20, default: 5 },
    gap: { kind: 'number', label: 'time between events (ms)', min: 10, max: 600, step: 10, default: 100 }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const everyScroll = () => {};',
    'const updateIndicator = scroll => console.log(`indicator at ${scroll.position}`);',
    '',
    "evem.subscribe('window.scroll', everyScroll);",
    '// The first event runs at once and opens a {{throttle}} ms window; events during it are dropped',
    "evem.subscribe('window.scroll', updateIndicator, { throttleTime: {{throttle}} });",
    '',
    '// ▶ Scroll',
    'for (let i = 1; i <= {{count}}; i++) {',
    "  await evem.publish('window.scroll', { position: i * 100 });",
    '  await sleep({{gap}});',
    '}'
  ].join('\n'),
  checks: [
    {
      action: 'scroll',
      calls: [
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'everyScroll',
        'everyScroll',
        'updateIndicator',
        'everyScroll'
      ],
      skipped: ['updateIndicator: throttled', 'updateIndicator: throttled', 'updateIndicator: throttled'],
      logs: ['indicator at 100', 'indicator at 400']
    },
    {
      values: { gap: 300 },
      action: 'scroll',
      calls: [
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'updateIndicator',
        'everyScroll',
        'updateIndicator'
      ],
      skipped: []
    },
    {
      values: { throttle: 1000 },
      action: 'scroll',
      calls: ['everyScroll', 'updateIndicator', 'everyScroll', 'everyScroll', 'everyScroll', 'everyScroll'],
      logs: ['indicator at 100']
    }
  ],
  lanes: true
};
