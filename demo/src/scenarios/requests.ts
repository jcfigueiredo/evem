import type { Scenario } from '../engine/session';

const USERS: Record<number, string> = { 1: 'Ada', 2: 'Bo', 42: 'Cy' };

export const requests: Scenario = {
  id: 'requests',
  group: 'WebSocket',
  title: 'Request\u2013response',
  summary:
    "handler.request() sends a request and resolves with the server's result: it rejects with the server's error, or with a RequestTimeoutError when no answer comes in time. Requests are independent and can run at once.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#request-response',
  controls: {
    timeout: {
      kind: 'number',
      label: 'timeout (ms)',
      hint: 'How long a request waits for its answer; the slow report takes 3000 ms.',
      min: 500,
      max: 5000,
      step: 500,
      default: 1000
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    '',
    'const evem = new EvEm();',
    "const handler = new WebSocketHandler('wss://api.example.com/ws', evem);",
    '',
    '// ▶ Get a user',
    "const user = await handler.request('users.get', { id: 42 }, { timeout: {{timeout}} });",
    "console.log('got', user);",
    '',
    "// ▶ Get a user who doesn't exist",
    '// The server answers with an error: request() rejects with its message, code and data',
    'await handler',
    "  .request('users.get', { id: 7 }, { timeout: {{timeout}} })",
    '  .catch(error => console.log(`failed (${error.code}): ${error.message}`));',
    '',
    '// ▶ Build a slow report',
    '// The server takes 3 s: past the timeout, request() rejects with a RequestTimeoutError, and the late answer is ignored',
    'await handler',
    "  .request('reports.build', {}, { timeout: {{timeout}} })",
    "  .then(report => console.log('report', report))",
    '  .catch(error => console.log(`${error.name}: ${error.message}`));',
    '',
    '// ▶ Two requests at once',
    "const [ada, bo] = await Promise.all([handler.request('users.get', { id: 1 }), handler.request('users.get', { id: 2 })]);",
    "console.log(ada.name, 'and', bo.name);"
  ].join('\n'),
  checks: [
    {
      action: 'get-a-user',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['got {"id":42,"name":"Cy"}'],
      wire: ['client: {"type":"request"', 'server: {"type":"response"']
    },
    {
      action: 'get-a-user-who-doesn-t-exist',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['failed (404): No user 7']
    },
    {
      action: 'build-a-slow-report',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['RequestTimeoutError: Request reports.build']
    },
    {
      values: { timeout: 5000 },
      action: 'build-a-slow-report',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['report {"rows":120}']
    },
    {
      action: 'two-requests-at-once',
      calls: ['WebSocketHandler', 'WebSocketHandler', 'WebSocketHandler', 'WebSocketHandler'],
      logs: ['Ada and Bo']
    }
  ],
  websocket: {
    latency: 30,
    methods: {
      'users.get': params => {
        const { id } = params as { id: number };
        // A thrown { code, message } is how a fake server's method answers with an error response
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- the fake server's contract (FakeWebSocketBehavior)
        if (!USERS[id]) throw { code: 404, message: `No user ${id}` };
        return { id, name: USERS[id] };
      },
      // Three seconds: longer than the default timeout
      'reports.build': () => new Promise(resolve => setTimeout(() => resolve({ rows: 120 }), 3000))
    }
  }
};
