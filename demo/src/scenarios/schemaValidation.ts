import type { Scenario } from '../engine/session';

export const schemaValidation: Scenario = {
  id: 'schema-validation',
  group: 'Data',
  title: 'Schema validation',
  summary:
    "A schema checks the data before a subscriber's filters and callback. Each subscription's schemaErrorPolicy decides what invalid data does.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/subscriptions.md#schema-validation',
  controls: {
    policy: {
      kind: 'select',
      label: "sendWelcome's schemaErrorPolicy",
      hint: 'What invalid data does: skip sendWelcome, log and run it anyway, skip quietly, or reject the publish.',
      options: [
        'ErrorPolicy.CANCEL_ON_ERROR',
        'ErrorPolicy.LOG_AND_CONTINUE',
        'ErrorPolicy.SILENT',
        'ErrorPolicy.THROW'
      ],
      default: 'ErrorPolicy.CANCEL_ON_ERROR',
      raw: true
    }
  },
  helpers: {},
  code: [
    "import { EvEm, ErrorPolicy } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    '',
    '// A simple validator returns true or false',
    "const isAdult = user => typeof user.age === 'number' && user.age >= 18;",
    '// An advanced one returns { valid, errors }',
    'const checkUser = user => {',
    '  const errors = [',
    "    { path: 'email', message: 'Email must contain @', failed: !String(user.email).includes('@') },",
    "    { path: 'age', message: 'Must be 18 or older', failed: user.age < 18 }",
    '  ].filter(error => error.failed);',
    '  return { valid: errors.length === 0, errors };',
    '};',
    'const register = user => console.log(`Registered ${user.name}`);',
    'const sendWelcome = user => console.log(`Welcome email to ${user.email}`);',
    '',
    '// The default schemaErrorPolicy, CANCEL_ON_ERROR, logs and skips this subscriber only',
    "evem.subscribe('user.register', register, { schema: isAdult });",
    "evem.subscribe('user.register', sendWelcome, { schema: checkUser, schemaErrorPolicy: {{policy}} });",
    '',
    '// ▶ Register a valid user',
    "await evem.publish('user.register', { name: 'Ada', email: 'ada@example.com', age: 36 });",
    '',
    '// ▶ Register an invalid user',
    'await evem',
    "  .publish('user.register', { name: 'Bo', email: 'bo', age: 16 })",
    "  .catch(error => console.log('publish rejected:', error.validationErrors.map(problem => problem.path)));"
  ].join('\n'),
  checks: [
    { action: 'register-a-valid-user', calls: ['register', 'sendWelcome'], result: true },
    {
      action: 'register-an-invalid-user',
      calls: [],
      result: true,
      skipped: ['register: schema', 'sendWelcome: schema'],
      logs: ['Schema validation failed', 'Schema validation failed']
    },
    {
      values: { policy: 'ErrorPolicy.LOG_AND_CONTINUE' },
      action: 'register-an-invalid-user',
      calls: ['sendWelcome'],
      skipped: ['register: schema']
    },
    {
      values: { policy: 'ErrorPolicy.SILENT' },
      action: 'register-an-invalid-user',
      calls: [],
      skipped: ['register: schema', 'sendWelcome: schema']
    },
    {
      values: { policy: 'ErrorPolicy.THROW' },
      action: 'register-an-invalid-user',
      calls: [],
      rejects: 'Schema validation failed',
      logs: ['publish rejected: ["email","age"]']
    }
  ]
};
