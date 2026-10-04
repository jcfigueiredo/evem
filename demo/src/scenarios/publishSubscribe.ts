import type { Scenario } from '../engine/session';

export const publishSubscribe: Scenario = {
  id: 'publish-subscribe',
  group: 'Core',
  title: 'Publish & subscribe',
  summary:
    'Subscribers run in order for each publish, and publish waits for async ones. Unsubscribe with the callback, or with the id subscribe() returned.',
  docs: 'https://github.com/jcfigueiredo/evem#quick-start',
  controls: {
    delay: {
      kind: 'number',
      label: 'email delay (ms)',
      hint: 'How long sendEmail takes. publish waits for it, so afterEmail runs that much later.',
      min: 0,
      max: 2000,
      step: 100,
      default: 300
    }
  },
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
    "let emailId = evem.subscribe('user.registered', sendEmail);",
    "evem.subscribe('user.registered', afterEmail);",
    '',
    '// ▶ Publish user.registered',
    "await evem.publish('user.registered', { name: 'Ada' });",
    '',
    '// ▶ Unsubscribe welcome by callback',
    "evem.unsubscribe('user.registered', welcome);",
    '',
    '// ▶ Subscribe welcome again',
    '// It runs last now: subscribers with the same priority run in the order they subscribed',
    "evem.subscribe('user.registered', welcome);",
    '',
    '// ▶ Unsubscribe sendEmail by id',
    'evem.unsubscribeById(emailId);',
    '',
    '// ▶ Subscribe sendEmail again',
    '// A new subscription, with a new id',
    "emailId = evem.subscribe('user.registered', sendEmail);"
  ].join('\n'),
  toggles: [
    {
      label: 'welcome subscribed',
      on: 'Subscribe welcome again',
      off: 'Unsubscribe welcome by callback',
      state: { subscription: 'welcome' }
    },
    {
      label: 'sendEmail subscribed',
      on: 'Subscribe sendEmail again',
      off: 'Unsubscribe sendEmail by id',
      state: { subscription: 'sendEmail' }
    }
  ],
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
    { before: ['unsubscribe-sendemail-by-id'], action: 'publish-user-registered', calls: ['welcome', 'afterEmail'] },
    {
      before: ['unsubscribe-welcome-by-callback', 'subscribe-welcome-again'],
      action: 'publish-user-registered',
      calls: ['sendEmail', 'afterEmail', 'welcome']
    },
    {
      before: ['unsubscribe-sendemail-by-id', 'subscribe-sendemail-again'],
      action: 'publish-user-registered',
      calls: ['welcome', 'afterEmail', 'sendEmail']
    }
  ]
};
