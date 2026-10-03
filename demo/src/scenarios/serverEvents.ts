import type { Scenario } from '../engine/session';

export const serverEvents: Scenario = {
  id: 'server-events',
  group: 'WebSocket',
  title: 'Server events & routing',
  summary:
    "Incoming messages are routed by their fields: an event (or the older type field) is published under a prefix, anything else as ws.message, and what doesn't parse as ws.parse.error. Send your own from the Server tab.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-server-events.md',
  controls: {
    prefix: { kind: 'select', label: 'serverEventPrefix', options: ['server', 'app', ''], default: 'server' }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    '',
    'const evem = new EvEm();',
    "// Server events are published as '<prefix>.<event>' ('' keeps their own names)",
    "const handler = new WebSocketHandler('wss://news.example.com/ws', evem, { serverEventPrefix: {{prefix}} });",
    'const prefix = {{prefix}};',
    '',
    "const news = item => console.log('news:', item.title);",
    "const other = message => console.log('other message:', message);",
    "const unreadable = ({ rawData }) => console.log('could not parse:', rawData);",
    "evem.subscribe(prefix ? `${prefix}.news.*` : 'news.*', news);",
    "evem.subscribe('ws.message', other);",
    "evem.subscribe('ws.parse.error', unreadable);",
    '',
    '// ▶ Subscribe to the news',
    "await evem.publish('ws.send', { event: 'news.subscribe' });"
  ].join('\n'),
  checks: [
    {
      action: 'subscribe-to-the-news',
      calls: ['WebSocketHandler', 'news', 'news', 'other', 'unreadable'],
      logs: [
        'news: EvEm adds a WebSocket adapter',
        'news: An older server uses type',
        'other message: {"ping":1}',
        'could not parse: this is not JSON'
      ]
    },
    {
      values: { prefix: '' },
      action: 'subscribe-to-the-news',
      calls: ['WebSocketHandler', 'news', 'news', 'other', 'unreadable']
    },
    {
      action: 'server:send {"event":"news.item","data":{"title":"From the Server tab"}}',
      calls: ['news'],
      logs: ['news: From the Server tab']
    }
  ],
  websocket: {
    latency: 30,
    sample: '{"event":"news.item","data":{"title":"From the Server tab"}}',
    onMessage: (message, server) => {
      if ((message as { event?: string }).event !== 'news.subscribe') return;
      server.send({ event: 'news.item', data: { title: 'EvEm adds a WebSocket adapter' } });
      server.send({ type: 'news.flash', data: { title: 'An older server uses type' } });
      server.send({ ping: 1 });
      server.send('this is not JSON');
    }
  }
};
