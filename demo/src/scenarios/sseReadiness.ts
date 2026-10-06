import type { Scenario } from '../engine/session';
import type { SseStream } from '../fakes/sseServer';

/** The server's "database": the order the page shows. Each first connection starts it over */
const order = { id: 7, status: 'packed' };

/**
 * A server that answers at once but subscribes to its broker 300 ms later, as one on Redis pub/sub or Postgres LISTEN
 * does: the change at 150 ms is published while nobody listens, so it's never streamed. Once subscribed, it says so
 * with a keepalive, and streams the next change.
 */
function subscribesLate(stream: SseStream): () => void {
  if (stream.number === 1) order.status = 'packed';
  const timers = [
    setTimeout(() => {
      order.status = 'shipped';
      stream.write(': (order 7 shipped meanwhile; not streamed: the server is still subscribing)\n\n');
    }, 150),
    setTimeout(() => stream.write('event: keepalive\ndata: connected\n\n'), 300),
    setTimeout(() => {
      order.status = 'delivered';
      stream.send({ event: 'order.updated', data: { ...order } });
    }, 1500)
  ];
  return () => timers.forEach(clearTimeout);
}

export const sseReadiness: Scenario = {
  id: 'readiness',
  group: 'SSE',
  title: 'Readiness',
  summary:
    "An open stream isn't a live one. This server answers at once but subscribes to its source 300 ms later, and the order changes at 150 ms, unstreamed. The page loads a snapshot once ready: on the open, it reads too early and stays stale; with readyEvent, it waits for the server's keepalive and reads the change.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/sse-adapter.md#waiting-until-the-stream-is-live',
  controls: {
    readyEvent: {
      kind: 'select',
      label: 'readyEvent',
      hint: "'keepalive' waits for the server's keepalive; undefined counts the open as ready.",
      options: ["'keepalive'", 'undefined'],
      raw: true,
      default: "'keepalive'"
    }
  },
  helpers: {
    loadSnapshot: () => ({ ...order })
  },
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { SseHandler } from '@jcfigueiredo/evem/sse';",
    '',
    'const evem = new EvEm();',
    "const sse = new SseHandler('/events', evem, {",
    '  autoConnect: false,',
    '  readyEvent: {{readyEvent}},',
    '  // The keepalive is plain text; everything else is JSON',
    "  parseData: (data, type) => (type === 'keepalive' ? data : JSON.parse(data))",
    '});',
    '',
    'let shown;',
    "const live = () => console.log('(live)');",
    "const update = order => { shown = order; console.log('update: order 7 is', shown.status); };",
    "evem.subscribe('sse.ready', live);",
    "evem.subscribe('server.order.updated', update);",
    '',
    '// ▶ Open the page',
    "// Connect, and load what the stream won't send: the current state, once the stream is live",
    'sse.connect();',
    'await sse.whenReady();',
    'shown = loadSnapshot();',
    "console.log('snapshot: order 7 is', shown.status);"
  ].join('\n'),
  checks: [
    {
      action: 'open-the-page',
      wait: 2000,
      calls: ['live', 'update'],
      logs: ['(live)', 'snapshot: order 7 is shipped', 'update: order 7 is delivered'],
      wire: [
        'server: : (order 7 shipped meanwhile; not streamed: the server is still subscribing)',
        'server: event: keepalive\ndata: connected'
      ]
    },
    {
      values: { readyEvent: 'undefined' },
      action: 'open-the-page',
      wait: 2000,
      calls: ['live', 'update'],
      // Ready at the open: the snapshot comes before sse.ready is even announced, and misses the change at 150 ms
      logs: ['snapshot: order 7 is packed', 'update: order 7 is delivered']
    }
  ],
  sse: {
    latency: 20,
    onOpen: subscribesLate,
    samples: [{ label: 'Order update', text: 'event: order.updated\ndata: {"id":7,"status":"returned"}\n\n' }]
  }
};
