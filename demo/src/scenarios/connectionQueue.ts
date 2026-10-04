import type { Scenario } from '../engine/session';

export const connectionQueue: Scenario = {
  id: 'connection-queue',
  group: 'WebSocket',
  title: 'Connection & offline queue',
  summary:
    'WebSocketHandler connects EvEm to a socket: ws.send messages go out while connected, and wait in a queue while not. Drop the connection or refuse the next one from the Server tab to see it reconnect and flush.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#offline-queue',
  controls: {
    reconnect: {
      kind: 'toggle',
      label: 'reconnect',
      hint: 'Whether the handler connects again after the server drops it (Server tab).',
      default: true
    },
    reconnectDelay: {
      kind: 'number',
      label: 'reconnectDelay (ms)',
      hint: 'How long it waits before each new attempt.',
      min: 200,
      max: 3000,
      step: 100,
      default: 1000
    },
    queueSize: {
      kind: 'number',
      label: 'queueSize',
      hint: 'Messages kept while offline; past it the oldest is dropped (ws.queue.overflow).',
      min: 1,
      max: 10,
      default: 3
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    '',
    'const evem = new EvEm();',
    "const handler = new WebSocketHandler('wss://chat.example.com/ws', evem, {",
    '  reconnect: {{reconnect}},',
    '  reconnectDelay: {{reconnectDelay}},',
    '  queueSize: {{queueSize}}',
    '});',
    'const showState = ({ from, to }) => console.log(`connection: ${from} → ${to}`);',
    "const queueFull = ({ droppedMessage }) => console.log('queue full, dropped', droppedMessage);",
    "evem.subscribe('ws.connection.state', showState);",
    "evem.subscribe('ws.queue.overflow', queueFull);",
    'let sent = 0;',
    '',
    '// ▶ Send a message',
    '// Sent at once while connected; while not, queued (up to {{queueSize}}) and sent when the connection is back',
    "await evem.publish('ws.send', { event: 'chat.send', data: { text: `message ${++sent}` } });",
    'console.log(`state: ${handler.getConnectionState()}, queued: ${handler.getQueueSize()}`);'
  ].join('\n'),
  checks: [
    {
      action: 'send-a-message',
      calls: ['WebSocketHandler'],
      result: true,
      logs: ['state: connected, queued: 0'],
      wire: ['client: {"event":"chat.send","data":{"text":"message 1"}}']
    },
    {
      values: { reconnect: false },
      before: ['server:drop'],
      action: 'send-a-message',
      calls: ['WebSocketHandler'],
      logs: ['state: disconnected, queued: 1']
    },
    {
      values: { reconnect: false, queueSize: 1 },
      before: ['server:drop', 'send-a-message'],
      action: 'send-a-message',
      calls: ['queueFull', 'WebSocketHandler'],
      logs: ['queue full, dropped {"event":"chat.send","data":{"text":"message 1"}}', 'state: disconnected, queued: 1']
    },
    {
      action: 'server:drop',
      calls: ['WebSocketHandler', 'showState', 'WebSocketHandler', 'showState'],
      logs: ['connection: connected → reconnecting', 'connection: reconnecting → connected'],
      wire: ['note: connection 1 dropped (1006)', 'note: connection 2 opened']
    },
    {
      before: ['server:refuse'],
      action: 'server:drop',
      calls: ['WebSocketHandler', 'showState', 'WebSocketHandler', 'showState'],
      wire: ['note: connection 1 dropped (1006)', 'note: refused a connection', 'note: connection 2 opened']
    }
  ],
  websocket: { latency: 30, sample: '{"event":"chat.message","data":{"user":"Bo","text":"hi"}}' }
};
