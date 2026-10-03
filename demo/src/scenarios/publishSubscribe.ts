import type { Scenario } from '../engine/session';

export const publishSubscribe: Scenario = {
  id: 'publish-subscribe',
  group: 'Core',
  title: 'Publish & subscribe',
  summary:
    'Subscribers run in order for each publish, and publish waits for async ones. Unsubscribe with the callback, or with the id subscribe() returned.',
  docs: 'https://github.com/jcfigueiredo/evem#quick-start',
  controls: { delay: { kind: 'number', label: 'email delay (ms)', min: 0, max: 2000, step: 100, default: 300 } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const welcome = user => console.log(`Welcome, ${user.name}!`);',
    '// An async callback: publish waits for it before running the next subscriber',
    'const sendEmail = async user => {',
    '  await sleep({{delay}});',
    '  console.log(`Email sent to ${user.name}`);',
    '};',
    "const afterEmail = () => console.log('This runs after the email is sent');",
    '',
    "evem.subscribe('user.registered', welcome);",
    "const emailId = evem.subscribe('user.registered', sendEmail);",
    "evem.subscribe('user.registered', afterEmail);",
    '',
    '// ▶ Publish user.registered',
    "await evem.publish('user.registered', { name: 'Ada' });",
    '',
    '// ▶ Unsubscribe welcome by callback',
    "evem.unsubscribe('user.registered', welcome);",
    '',
    '// ▶ Unsubscribe sendEmail by id',
    'evem.unsubscribeById(emailId);'
  ].join('\n'),
  checks: [
    {
      action: 'publish-user-registered',
      calls: ['welcome', 'sendEmail', 'afterEmail'],
      result: true,
      logs: ['Welcome, Ada!', 'Email sent to Ada', 'This runs after the email is sent']
    },
    {
      before: ['unsubscribe-welcome-by-callback'],
      action: 'publish-user-registered',
      calls: ['sendEmail', 'afterEmail']
    },
    { before: ['unsubscribe-sendemail-by-id'], action: 'publish-user-registered', calls: ['welcome', 'afterEmail'] }
  ]
};
