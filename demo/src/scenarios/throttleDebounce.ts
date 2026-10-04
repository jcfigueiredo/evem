import type { Scenario } from '../engine/session';

export const throttleDebounce: Scenario = {
  id: 'throttle-debounce',
  group: 'Flow control',
  title: 'Throttle + debounce',
  summary:
    'With both, an event runs at once when more than throttleTime has passed since the last immediate run; the others are debounced, so the last event still gets a run. Compare each option alone in the lanes.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/subscriptions.md#combining-throttle-and-debounce',
  controls: {
    throttle: {
      kind: 'number',
      label: 'throttleTime (ms)',
      hint: 'throttled and suggest run at once when this long has passed since their last run.',
      min: 50,
      max: 1000,
      step: 50,
      default: 300
    },
    debounce: {
      kind: 'number',
      label: 'debounceTime (ms)',
      hint: 'debounced runs once typing pauses this long; so does suggest, for what it held back.',
      min: 50,
      max: 1000,
      step: 50,
      default: 500
    },
    gap: {
      kind: 'number',
      label: 'time between events (ms)',
      hint: 'Time between keystrokes: compare it with the two times above.',
      min: 10,
      max: 600,
      step: 10,
      default: 100
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const everyKey = () => {};',
    'const throttled = () => {};',
    'const debounced = () => {};',
    'const suggest = typing => console.log(`suggestions for "${typing.q}"`);',
    '',
    "evem.subscribe('user.typing', everyKey);",
    "evem.subscribe('user.typing', throttled, { throttleTime: {{throttle}} });",
    "evem.subscribe('user.typing', debounced, { debounceTime: {{debounce}} });",
    '// Both: at once at the start of each throttle window, and once more with the last event when typing pauses',
    "evem.subscribe('user.typing', suggest, { throttleTime: {{throttle}}, debounceTime: {{debounce}} });",
    '',
    '// ▶ Type "hello world"',
    "const text = 'hello world';",
    'for (let i = 1; i <= text.length; i++) {',
    "  await evem.publish('user.typing', { q: text.slice(0, i) });",
    '  await sleep({{gap}});',
    '}'
  ].join('\n'),
  checks: [
    {
      action: 'type-hello-world',
      calls: [
        'everyKey',
        'throttled',
        'suggest',
        'everyKey',
        'everyKey',
        'everyKey',
        'throttled',
        'everyKey',
        'suggest',
        'everyKey',
        'everyKey',
        'throttled',
        'everyKey',
        'everyKey',
        'suggest',
        'everyKey',
        'throttled',
        'everyKey',
        'debounced',
        'suggest'
      ],
      logs: [
        'suggestions for "h"',
        'suggestions for "hello"',
        'suggestions for "hello wor"',
        'suggestions for "hello world"'
      ]
    },
    {
      values: { throttle: 1000 },
      action: 'type-hello-world',
      calls: [
        'everyKey',
        'throttled',
        'suggest',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'everyKey',
        'throttled',
        'debounced',
        'suggest'
      ],
      logs: ['suggestions for "h"', 'suggestions for "hello world"']
    }
  ],
  lanes: true
};
