import type { Scenario } from '../engine/session';

export const middleware: Scenario = {
  id: 'middleware',
  group: 'Middleware',
  title: 'Middleware',
  summary:
    'Middleware sees every event before its subscribers, in the order it was added: it can change the data, cancel the event with null, or reroute it. A pattern limits it to matching events.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/middleware.md',
  controls: {
    role: {
      kind: 'select',
      label: 'role',
      hint: "A guest's event is canceled by blockGuests; an admin's is rerouted to admin.action.",
      options: ['user', 'admin', 'guest'],
      default: 'user'
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    '',
    '// Global middleware runs for every event: this one changes the data',
    "const stamp = (event, data) => ({ ...data, checkedAt: '10:42' });",
    '// Returning null cancels the event',
    "const blockGuests = (event, data) => (data.role === 'guest' ? null : data);",
    '// Returning a new { event, data } object reroutes it',
    "const routeAdmins = (event, data) => (data.role === 'admin' ? { event: 'admin.action', data } : data);",
    '',
    'evem.use(stamp);',
    '// Pattern middleware only runs for the events its pattern matches',
    "evem.use({ pattern: 'user.*', handler: blockGuests });",
    "evem.use({ pattern: 'user.action', handler: routeAdmins });",
    '',
    "const userAction = action => console.log('user action:', action);",
    "const adminAction = action => console.log('admin action:', action);",
    "evem.subscribe('user.action', userAction);",
    "evem.subscribe('admin.action', adminAction);",
    '',
    '// ▶ Publish user.action',
    "const delivered = await evem.publish('user.action', { role: {{role}}, action: 'delete' });",
    "console.log(delivered ? 'delivered' : 'canceled by middleware');",
    '',
    '// ▶ Publish order.created',
    "await evem.publish('order.created', { id: 1 });"
  ].join('\n'),
  checks: [
    { action: 'publish-user-action', calls: ['userAction'], result: true, logs: ['user action:', 'delivered'] },
    { values: { role: 'admin' }, action: 'publish-user-action', calls: ['adminAction'], result: true },
    {
      values: { role: 'guest' },
      action: 'publish-user-action',
      calls: [],
      result: false,
      logs: ['canceled by middleware']
    },
    { action: 'publish-order-created', calls: [], result: true }
  ]
};
