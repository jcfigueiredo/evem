import type { Scenario } from '../engine/session';

export const historyReplay: Scenario = {
  id: 'history-replay',
  group: 'State & diagnostics',
  title: 'History & replay',
  summary:
    'With history on, EvEm keeps the last events. A late subscriber can replay the last matching one, or all of them, while it subscribes.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/history-and-debugging.md#using-event-history-and-replay',
  controls: { size: { kind: 'number', label: 'history size', min: 1, max: 10, default: 5 } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    '// Keep the last {{size}} events (the default is 50)',
    'evem.enableHistory({{size}});',
    '',
    '// ▶ Publish three events',
    "await evem.publish('user.login', { name: 'Ada' });",
    "await evem.publish('user.login', { name: 'Bo' });",
    "// The last event overall isn't a login: replayLastEvent still replays the last *matching* one",
    "await evem.publish('notification', { message: 'New feature!' });",
    "console.log('history:', evem.getEventHistory().map(record => record.event));",
    '',
    '// ▶ Subscribe late with replayLastEvent',
    'const latestLogin = user => console.log(`latest login: ${user.name}`);',
    "evem.subscribe('user.login', latestLogin, { replayLastEvent: true });",
    '',
    '// ▶ Subscribe late with replayHistory',
    'const everyLogin = user => console.log(`login: ${user.name}`);',
    "evem.subscribe('user.login', everyLogin, { replayHistory: true });",
    '',
    '// ▶ Clear the history',
    'evem.clearEventHistory();',
    "console.log('history:', evem.getEventHistory().length, 'events');"
  ].join('\n'),
  checks: [
    { action: 'publish-three-events', calls: [], logs: ['history: ["user.login","user.login","notification"]'] },
    {
      before: ['publish-three-events'],
      action: 'subscribe-late-with-replaylastevent',
      calls: ['latestLogin'],
      logs: ['latest login: Bo']
    },
    {
      before: ['publish-three-events'],
      action: 'subscribe-late-with-replayhistory',
      calls: ['everyLogin', 'everyLogin'],
      logs: ['login: Ada', 'login: Bo']
    },
    {
      values: { size: 2 },
      before: ['publish-three-events'],
      action: 'subscribe-late-with-replayhistory',
      calls: ['everyLogin'],
      logs: ['login: Bo']
    },
    { before: ['publish-three-events', 'clear-the-history'], action: 'subscribe-late-with-replayhistory', calls: [] }
  ]
};
