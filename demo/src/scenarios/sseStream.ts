import type { Scenario } from '../engine/session';

export const sseStream: Scenario = {
  id: 'stream-routing',
  group: 'SSE',
  title: 'Stream & routing',
  summary:
    "SseHandler reads a text/event-stream and publishes each event: a named one as server.<name>, an unnamed { event, data } envelope the same way, anything else as sse.message, and data that doesn't parse as sse.parse.error. Write events to the stream from the Server tab.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#routing',
  controls: {
    unwrapEnvelope: { kind: 'toggle', label: 'unwrapEnvelope', default: true },
    parseData: { kind: 'select', label: 'parseData', options: ['json', 'text'], default: 'json' }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { SseHandler } from '@jcfigueiredo/evem/sse';",
    '',
    'const evem = new EvEm();',
    "const sse = new SseHandler('/api/orders/stream', evem, { unwrapEnvelope: {{unwrapEnvelope}}, parseData: {{parseData}} });",
    '',
    "const order = data => console.log('order:', data);",
    "const message = data => console.log('message:', data);",
    'const unreadable = ({ eventType, rawData }) => console.log(`could not parse ${eventType}:`, rawData);',
    "evem.subscribe('server.order.*', order);",
    "evem.subscribe('sse.message', message);",
    "evem.subscribe('sse.parse.error', unreadable);",
    '',
    '// ▶ Show the last event id',
    '// The id of the latest event that had one: SseHandler sends it back as Last-Event-ID when it reconnects',
    "console.log('last event id:', sse.getLastEventId());"
  ].join('\n'),
  checks: [
    {
      action: 'server:send event: order.updated\nid: 1\ndata: {"id":7,"status":"shipped"}\n\n',
      wait: 100,
      calls: ['order'],
      logs: ['order: {"id":7,"status":"shipped"}'],
      wire: ['server: event: order.updated\nid: 1\ndata: {"id":7,"status":"shipped"}\n\n']
    },
    {
      action: 'server:send id: 2\ndata: {"event":"order.refunded","data":{"id":7}}\n\n',
      wait: 100,
      calls: ['order'],
      logs: ['order: {"id":7}']
    },
    {
      action: 'server:send data: {"type":"order.archived","data":{"id":7}}\n\n',
      wait: 100,
      calls: ['order'],
      logs: ['order: {"id":7}']
    },
    {
      action: 'server:send data: {"text":"Maintenance at 22:00"}\n\n',
      wait: 100,
      calls: ['message'],
      logs: ['message: {"text":"Maintenance at 22:00"}']
    },
    {
      action: 'server:send event: order.updated\ndata: not json\n\n',
      wait: 100,
      calls: ['unreadable'],
      logs: ['could not parse order.updated: not json']
    },
    {
      action: 'server:split event: order.note\ndata: {"id":7,"note":"Café ☕ at the door"}\n\n',
      wait: 100,
      calls: ['order'],
      logs: ['order: {"id":7,"note":"Café ☕ at the door"}'],
      wire: ['server: event: order.note\ndata: {"id":7,"note":"Caf\\xC3', 'server: \\xA9 ☕ at the door"}\n\n']
    },
    {
      action: 'server:send event: order.note\ndata: {"id":7,\ndata: "note":"two lines, one event"}\n\n',
      wait: 100,
      calls: ['order'],
      logs: ['order: {"id":7,"note":"two lines, one event"}']
    },
    {
      values: { unwrapEnvelope: false },
      action: 'server:send id: 2\ndata: {"event":"order.refunded","data":{"id":7}}\n\n',
      wait: 100,
      calls: ['message'],
      logs: ['message: {"event":"order.refunded","data":{"id":7}}']
    },
    {
      values: { parseData: 'text' },
      action: 'server:send event: order.updated\ndata: not json\n\n',
      wait: 100,
      calls: ['order'],
      logs: ['order: not json']
    },
    {
      before: [
        'server:send event: order.updated\nid: 1\ndata: {"id":7,"status":"shipped"}\n\n',
        'server:send id: 2\ndata: {"event":"order.refunded","data":{"id":7}}\n\n',
        'wait:100'
      ],
      action: 'show-the-last-event-id',
      calls: [],
      logs: ['last event id: 2']
    }
  ],
  sse: {
    latency: 30,
    samples: [
      { label: 'Named event', text: 'event: order.updated\nid: 1\ndata: {"id":7,"status":"shipped"}\n\n' },
      { label: 'Envelope, unnamed', text: 'id: 2\ndata: {"event":"order.refunded","data":{"id":7}}\n\n' },
      { label: 'Legacy type field', text: 'data: {"type":"order.archived","data":{"id":7}}\n\n' },
      { label: 'Plain message', text: 'data: {"text":"Maintenance at 22:00"}\n\n' },
      { label: 'Not JSON', text: 'event: order.updated\ndata: not json\n\n' },
      {
        label: 'Accents (write it in two chunks)',
        text: 'event: order.note\ndata: {"id":7,"note":"Café ☕ at the door"}\n\n'
      },
      {
        label: 'Data on two lines',
        text: 'event: order.note\ndata: {"id":7,\ndata: "note":"two lines, one event"}\n\n'
      }
    ]
  }
};
