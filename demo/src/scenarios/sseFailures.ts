import type { Scenario } from '../engine/session';

export const sseFailures: Scenario = {
  id: 'failures',
  group: 'SSE',
  title: 'Failures',
  summary:
    'How a stream ends decides what SseHandler does: a 401 or 404 stops it, a 503 or 429 reconnects no sooner than Retry-After, a 204 stops it quietly, and a stream that goes silent past heartbeatTimeout is aborted and reconnected. The server sends : ping every second; restart it with a status, or make it go silent, from the Server tab.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#how-a-connection-ends',
  controls: {
    heartbeatTimeout: {
      kind: 'number',
      label: 'heartbeatTimeout (ms)',
      hint: 'A stream silent this long is aborted and reconnected: try Go silent on the Server tab.',
      min: 500,
      max: 10000,
      step: 500,
      default: 3000
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { SseHandler } from '@jcfigueiredo/evem/sse';",
    '',
    'const evem = new EvEm();',
    "const sse = new SseHandler('/api/events', evem, {",
    '  heartbeatTimeout: {{heartbeatTimeout}},',
    '  reconnectDelay: 1000,',
    '  backoff: false',
    '});',
    '',
    "const failed = ({ reason, status }) => console.log(`sse.error: ${reason}${status ? ` ${status}` : ''}`);",
    'const showState = ({ to }) => console.log(`(${to})`);',
    "evem.subscribe('sse.error', failed);",
    "evem.subscribe('sse.connection.state', showState);",
    '',
    '// ▶ Connect again',
    '// After a 401 or a 204 the handler stops; connect() starts over',
    'sse.connect();'
  ].join('\n'),
  checks: [
    {
      action: 'server:restart 401',
      wait: 1500,
      calls: ['showState', 'showState', 'failed', 'showState'],
      logs: ['(reconnecting)', '(connecting)', 'sse.error: http-error 401', '(disconnected)'],
      wire: [
        'note: will answer the next request with 401 Unauthorized',
        'note: connection 1 ended by the server',
        'client: GET /api/events',
        'note: connection 2 answered 401 Unauthorized'
      ]
    },
    {
      action: 'server:restart 503 2',
      wait: 3600,
      calls: ['showState', 'showState', 'failed', 'showState', 'showState', 'showState'],
      logs: [
        '(reconnecting)',
        '(connecting)',
        'sse.error: http-error 503',
        '(reconnecting)',
        '(connecting)',
        '(connected)'
      ],
      wire: ['note: connection 2 answered 503 Service Unavailable · Retry-After: 2', 'note: connection 3 opened']
    },
    {
      action: 'server:restart 204',
      wait: 1500,
      calls: ['showState', 'showState', 'showState'],
      logs: ['(reconnecting)', '(connecting)', '(disconnected)'],
      wire: ['note: connection 2 answered 204 No Content']
    },
    {
      action: 'server:silent',
      wait: 4500,
      calls: ['failed', 'showState', 'showState', 'showState'],
      logs: ['sse.error: heartbeat-timeout', '(reconnecting)', '(connecting)', '(connected)'],
      wire: [
        'note: connection 1: the server stops writing',
        'note: connection 1 closed by the client',
        'note: connection 2 opened'
      ]
    },
    {
      before: ['server:restart 401', 'wait:1500'],
      action: 'connect-again',
      wait: 500,
      calls: ['showState', 'showState'],
      logs: ['(connecting)', '(connected)']
    },
    {
      values: { heartbeatTimeout: 500 },
      action: 'wait:1000',
      calls: ['failed', 'showState'],
      logs: ['sse.error: heartbeat-timeout', '(reconnecting)']
    }
  ],
  sse: {
    latency: 30,
    heartbeat: 1000,
    samples: [{ label: 'A comment', text: ': comments keep the connection alive, and are no event\n\n' }]
  }
};
