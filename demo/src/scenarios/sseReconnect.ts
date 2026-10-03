import type { Scenario } from '../engine/session';
import type { SseStream } from '../fakes/sseServer';

/** The tick server from examples/python/server.py (`--drop-after 5`): ticks after the client's Last-Event-ID */
function ticks(stream: SseStream): () => void {
  let last = /^[0-9]+$/.test(stream.lastEventId ?? '') ? Number(stream.lastEventId) : 0;
  let sent = 0;
  stream.send({ retry: 1000 });
  const timer = setInterval(() => {
    last++;
    sent++;
    stream.send({ event: 'tick', data: { n: last }, id: last });
    if (stream.number === 1 && sent === 5) stream.end();
  }, 1000);
  return () => clearInterval(timer);
}

export const sseReconnect: Scenario = {
  id: 'reconnect-resume',
  group: 'SSE',
  title: 'Reconnect & resume',
  summary:
    "The server streams numbered ticks, each with its number as id, and ends the first stream after 5 (like examples/python/server.py --drop-after 5). SseHandler reconnects after the server's retry: delay and sends Last-Event-ID, so the ticks go on where they stopped. Drop or refuse connections from the Server card to see the backoff.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#resuming-with-last-event-id',
  controls: {
    backoff: { kind: 'toggle', label: 'backoff', default: true },
    maxReconnectAttempts: { kind: 'number', label: 'maxReconnectAttempts', min: 1, max: 10, default: 3 }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { SseHandler } from '@jcfigueiredo/evem/sse';",
    '',
    'const evem = new EvEm();',
    "// The server's retry: sets the delay before reconnecting; with backoff, each failed attempt in a row doubles it",
    "const sse = new SseHandler('/events', evem, { backoff: {{backoff}}, maxReconnectAttempts: {{maxReconnectAttempts}} });",
    '',
    "const tick = ({ n }) => console.log('tick', n);",
    'const showState = ({ to }) => console.log(`(${to})`);',
    'const gaveUp = ({ attempts }) => console.log(`gave up after ${attempts} attempts`);',
    "evem.subscribe('server.tick', tick);",
    "evem.subscribe('sse.connection.state', showState);",
    "evem.subscribe('sse.reconnect.failed', gaveUp);",
    '',
    '// ▶ Show the last event id',
    "console.log('last event id:', sse.getLastEventId());",
    '',
    '// ▶ Disconnect',
    'await sse.disconnect();',
    '',
    '// ▶ Connect',
    '// It sends the last event id, so the ticks go on where they stopped',
    'sse.connect();'
  ].join('\n'),
  checks: [
    {
      action: 'wait:7300',
      calls: ['tick', 'tick', 'tick', 'tick', 'tick', 'showState', 'showState', 'showState', 'tick'],
      logs: ['tick 1', 'tick 5', '(reconnecting)', '(connecting)', '(connected)', 'tick 6'],
      wire: [
        'note: connection 1 ended by the server',
        'client: GET /events · last-event-id: 5',
        'note: connection 2 opened',
        'server: event: tick\nid: 6'
      ]
    },
    {
      before: ['wait:2500'],
      action: 'server:drop',
      wait: 1500,
      calls: ['showState', 'showState', 'showState'],
      logs: ['(reconnecting)', '(connecting)', '(connected)'],
      wire: [
        'note: connection 1 dropped (network error)',
        'client: GET /events · last-event-id: 2',
        'note: connection 2 opened'
      ]
    },
    {
      before: ['wait:1500', 'server:refuse', 'server:refuse', 'server:refuse'],
      action: 'server:drop',
      wait: 8000,
      calls: ['showState', 'showState', 'showState', 'showState', 'showState', 'showState', 'showState', 'gaveUp'],
      logs: [
        '(reconnecting)',
        '(connecting)',
        '(reconnecting)',
        '(connecting)',
        '(reconnecting)',
        '(connecting)',
        '(disconnected)',
        'gave up after 3 attempts'
      ],
      wire: ['note: refused a connection', 'note: refused a connection', 'note: refused a connection']
    },
    {
      values: { backoff: false },
      before: ['wait:1500', 'server:refuse', 'server:refuse', 'server:refuse'],
      action: 'server:drop',
      wait: 3500,
      calls: ['showState', 'showState', 'showState', 'showState', 'showState', 'showState', 'showState', 'gaveUp'],
      logs: ['gave up after 3 attempts']
    },
    {
      before: ['wait:2500', 'disconnect'],
      action: 'connect',
      wait: 1500,
      calls: ['showState', 'showState', 'tick'],
      logs: ['(connecting)', '(connected)', 'tick 3'],
      wire: ['client: GET /events · last-event-id: 2']
    },
    { before: ['wait:3500'], action: 'show-the-last-event-id', calls: [], logs: ['last event id: 3'] }
  ],
  sse: {
    latency: 30,
    onOpen: ticks,
    samples: [
      { label: 'Slower reconnects', text: 'retry: 3000\n\n' },
      { label: 'A tick from the future', text: 'event: tick\nid: 100\ndata: {"n":100}\n\n' }
    ],
    local: { command: 'python3 examples/python/server.py --port 8000 --drop-after 5' }
  }
};
