import type { Scenario } from '../engine/session';

export const transforms: Scenario = {
  id: 'transforms',
  group: 'Data',
  title: 'Transforms',
  summary:
    "A subscriber's transform turns the data the subscribers after it receive. It only applies when its subscriber ran.",
  docs: 'https://github.com/jcfigueiredo/evem#event-transformation',
  controls: { sender: { kind: 'select', label: 'sender', options: ['ada', 'bot'], default: 'ada' } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const normalize = () => {};',
    'const count = () => {};',
    'const lowercase = message => ({ ...message, content: message.content.trim().toLowerCase() });',
    "const fromPeople = message => message.sender !== 'bot';",
    "const countWords = message => ({ ...message, words: message.content.split(' ').length });",
    'const display = message => {',
    "  const words = message.words === undefined ? 'no word count' : `${message.words} words`;",
    '  console.log(`"${message.content}", ${words}`);',
    '};',
    '',
    "// Each transform's result is the data the subscribers after it receive",
    "evem.subscribe('message.received', normalize, { priority: 'high', transform: lowercase });",
    '// A transform only applies when its subscriber ran: here, not for the bot',
    "evem.subscribe('message.received', count, { filter: fromPeople, transform: countWords });",
    "evem.subscribe('message.received', display, { priority: 'low' });",
    '',
    '// ▶ Publish a message',
    "await evem.publish('message.received', { content: '  Hello World Again  ', sender: {{sender}} });"
  ].join('\n'),
  checks: [
    { action: 'publish-a-message', calls: ['normalize', 'count', 'display'], logs: ['"hello world again", 3 words'] },
    {
      values: { sender: 'bot' },
      action: 'publish-a-message',
      calls: ['normalize', 'display'],
      skipped: ['count: filtered'],
      logs: ['"hello world again", no word count']
    }
  ]
};
