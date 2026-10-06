import type { Scenario } from '../engine/session';

export const devWarnings: Scenario = {
  id: 'dev-warnings',
  group: 'State & diagnostics',
  title: 'Declared events & warnings',
  summary:
    "Declare the app's events once with defineEvents. With devWarnings, EvEm reports a subscription whose pattern matches no declared event, and a publish of an undeclared name: misspellings that would otherwise go nowhere. In TypeScript, a typed event map makes both compile errors; the warnings cover what the compiler can't see.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/typed-events.md#declaring-once-with-a-runtime-list',
  controls: {
    pattern: {
      kind: 'text',
      label: 'pattern to subscribe to',
      hint: 'tasks.* is misspelled: no declared event matches it.',
      default: 'tasks.*',
      suggestions: ['tasks.*', 'task.*', 'task.opened', '*', 'billing.*']
    },
    event: {
      kind: 'text',
      label: 'event to publish',
      hint: 'A declared name, or one that is not.',
      default: 'task.opened',
      suggestions: ['task.opened', 'task.closed', 'task.openned', 'toast']
    },
    devWarnings: {
      kind: 'toggle',
      label: 'devWarnings',
      hint: 'Report undeclared names and patterns that match nothing; meant for development builds.',
      default: true
    }
  },
  helpers: {},
  code: [
    "import { EvEm, defineEvents, payload } from '@jcfigueiredo/evem';",
    '',
    "// The app's events, declared once (in TypeScript, payload<Task>() would also give each one its payload type)",
    'const appEvents = defineEvents({',
    "  'task.opened': payload(),",
    "  'task.closed': payload(),",
    "  'toast': payload()",
    '});',
    'const evem = new EvEm({ events: appEvents, devWarnings: {{devWarnings}} });',
    '',
    "const onTask = task => console.log('task', task.id);",
    '',
    '// ▶ Subscribe',
    "// In TypeScript, a pattern that matches no declared event doesn't compile; here it runs, and devWarnings reports it",
    '// @ts-ignore',
    'evem.subscribe({{pattern}}, onTask);',
    '',
    '// ▶ Publish',
    "// Likewise, an undeclared name doesn't compile in TypeScript",
    '// @ts-ignore',
    'await evem.publish({{event}}, { id: 7 });'
  ].join('\n'),
  checks: [
    { action: 'subscribe', calls: [], logs: ['EvEm: no declared event matches "tasks.*".'] },
    {
      values: { pattern: 'task.*' },
      before: ['subscribe'],
      action: 'publish',
      calls: ['onTask'],
      logs: ['task 7']
    },
    {
      values: { pattern: 'task.opened', event: 'task.openned' },
      before: ['subscribe'],
      action: 'publish',
      calls: [],
      logs: ['EvEm: "task.openned" is not a declared event.']
    },
    {
      values: { pattern: 'tasks.*', event: 'tasks.opened', devWarnings: false },
      before: ['subscribe'],
      action: 'publish',
      calls: ['onTask'],
      logs: ['task 7']
    }
  ]
};
