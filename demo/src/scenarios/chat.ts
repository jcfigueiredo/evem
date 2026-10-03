import type { Scenario } from '../engine/session';

export const chat: Scenario = {
  id: 'chat',
  group: 'Recipes',
  title: 'Chat over WebSocket',
  summary:
    'A chat client: history by request, messages filtered to one room, and sends that wait in the queue while offline. Bo answers you; send messages from other rooms from the Server card.',
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/websocket-adapter.md#example-browser-chat',
  controls: { room: { kind: 'select', label: 'room', options: ['lobby', 'random'], default: 'lobby' } },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';",
    '',
    'const roomId = {{room}};',
    'const evem = new EvEm();',
    "const handler = new WebSocketHandler('wss://chat.example.com/ws', evem, { reconnect: true });",
    '',
    'const show = message => console.log(`${message.user}: ${message.text}`);',
    'const inThisRoom = message => message.roomId === roomId;',
    'const showState = ({ to }) => console.log(`(${to})`);',
    "evem.subscribe('ws.connection.state', showState);",
    "// The server sends every room's messages: keep this room's",
    "evem.subscribe('server.chat.message', show, { filter: inThisRoom });",
    '',
    '// ▶ Load the history',
    '// Waits for the connection: the 5 s timeout includes that wait',
    "const history = await handler.request('chat.history', { roomId, limit: 50 });",
    'history.forEach(show);',
    '',
    '// ▶ Say hello',
    '// Queued while offline, and sent when the connection is back',
    "await evem.publish('ws.send', { event: 'chat.send', data: { roomId, text: 'Hello!' } });"
  ].join('\n'),
  checks: [
    {
      action: 'load-the-history',
      calls: ['WebSocketHandler', 'WebSocketHandler'],
      logs: ['Bo: Welcome to lobby', 'Cy: Hi all']
    },
    {
      action: 'say-hello',
      calls: ['WebSocketHandler', 'show', 'show'],
      logs: ['you: Hello!', 'Bo: Hi! You said "Hello!"'],
      wire: ['client: {"event":"chat.send"', 'server: {"event":"chat.message"']
    },
    {
      values: { room: 'random' },
      action:
        'server:send {"event":"chat.message","data":{"roomId":"lobby","user":"Cy","text":"Anyone in the lobby?"}}',
      calls: [],
      skipped: ['show: filtered']
    }
  ],
  websocket: {
    latency: 40,
    sample: '{"event":"chat.message","data":{"roomId":"lobby","user":"Cy","text":"Anyone in the lobby?"}}',
    methods: {
      'chat.history': params => {
        const { roomId } = params as { roomId: string };
        return [
          { roomId, user: 'Bo', text: `Welcome to ${roomId}` },
          { roomId, user: 'Cy', text: 'Hi all' }
        ];
      }
    },
    onMessage: (message, server) => {
      const { event, data } = message as { event?: string; data?: { roomId: string; text: string } };
      if (event !== 'chat.send' || !data) return;
      server.send({ event: 'chat.message', data: { roomId: data.roomId, user: 'you', text: data.text } });
      setTimeout(
        () =>
          server.send({
            event: 'chat.message',
            data: { roomId: data.roomId, user: 'Bo', text: `Hi! You said "${data.text}"` }
          }),
        600
      );
    }
  }
};
