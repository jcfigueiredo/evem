import type { Scenario } from '../engine/session';

export const recursionProtection: Scenario = {
  id: 'recursion-protection',
  group: 'Control & errors',
  title: 'Recursion protection',
  summary:
    'A handler that publishes the event it is handling would loop forever. EvEm stops it at a maximum nesting depth: the publish over the limit rejects.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/errors.md#recursion-protection',
  controls: {
    depth: {
      kind: 'number',
      label: 'maximum depth',
      hint: 'How deep an event may publish itself (new EvEm(depth)); one level more rejects.',
      min: 1,
      max: 6,
      default: 3
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    '// How deeply an event can nest inside its own handlers (default 3)',
    'const evem = new EvEm({{depth}});',
    'let runs = 0;',
    '',
    '// This handler publishes the event it is handling',
    'const tick = async () => {',
    '  runs++;',
    "  await evem.publish('tick');",
    '};',
    "evem.subscribe('tick', tick);",
    '',
    '// ▶ Publish tick',
    'runs = 0;',
    "await evem.publish('tick');",
    "console.log(`tick ran ${runs} time${runs === 1 ? '' : 's'}`);"
  ].join('\n'),
  checks: [
    {
      action: 'publish-tick',
      calls: ['tick', 'tick', 'tick'],
      result: true,
      logs: ['Max recursion depth of 3 exceeded', 'tick ran 3 times']
    },
    { values: { depth: 1 }, action: 'publish-tick', calls: ['tick'], logs: ['tick ran 1 time'] }
  ]
};
