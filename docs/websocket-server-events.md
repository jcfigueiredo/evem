# Server Events

This guide covers messages sent from the server to the client. It explains how `WebSocketHandler` turns them into EvEm events, and how to subscribe to those events with wildcards, filters, priorities and transforms. Setup, options and the rest of the adapter are covered in the [WebSocket Adapter](websocket-adapter.md) guide.

- [How messages are routed](#how-messages-are-routed)
- [Subscribing](#subscribing)
- [Filters, priorities, once and transforms](#filters-priorities-once-and-transforms)
- [Example: chat client and server](#example-chat-client-and-server)
- [Using with React](#using-with-react)
- [Tips](#tips)

## How messages are routed

```
Server                                   WebSocketHandler                            Subscribers
{"event":"user.login","data":{…}}  ──►   evem.publish('server.user.login', data)  ──►  'server.user.login'
                                                                                       'server.user.*'
                                                                                       'server.*'
```

The handler parses each incoming message with `messageParser` (`JSON.parse` by default) and publishes it according to its fields:

| Server sends | Published as | Subscribers receive |
|--------------|--------------|---------------------|
| `{"event":"user.login","data":{…}}` | `server.user.login` | `data` |
| `{"event":"server.user.login","data":{…}}` | `server.user.login` (the prefix isn't added twice) | `data` |
| `{"type":"user.login","data":{…}}` (legacy) | `server.user.login` (same rule as `event`) | `data` |
| `{"type":"response","id":"…","result":…}` | `ws.response`: resolves `handler.request()` | — |
| `{"type":"response","id":"…","error":{"code":404,"message":"…"}}` | `ws.response.error`: rejects `handler.request()` | — |
| anything else, e.g. `{"ping":1}` | `ws.message` | the whole parsed message |
| a message `messageParser` can't parse | `ws.parse.error` | `{ error, rawData }` |

Some details of these rules:

- `event` is checked before `type`. Use `event` for new servers; `type` is kept for older ones.
- If `data` is missing, subscribers receive `{}`.
- The prefix comes from the `serverEventPrefix` option (default `'server'`). It's added unless the name already starts with `<prefix>.`: `server.user.login` stays as it is, and `serverless.deploy` becomes `server.serverless.deploy`.
  - With `serverEventPrefix: 'api'`, `{"event":"user.login"}` is published as `api.user.login`.
  - With `serverEventPrefix: ''`, events are published under their own names: `user.login`.
- Response messages are only routed this way while `enableRequestResponse` is on (the default). Otherwise they go to `ws.message`.

### Message format for servers

```typescript
// Server -> client
type ServerMessage =
  | { event: string; data?: unknown } // published as `${serverEventPrefix}.${event}` (prefix not doubled)
  | { type: 'response'; id: string; result: unknown }
  | { type: 'response'; id: string; error: { code: number; message: string; data?: unknown } };

// Client -> server, from handler.request()
interface RequestFrame {
  type: 'request';
  id: string;
  method: string;
  params?: unknown;
  timestamp: number;
}
```

Everything else the client sends is the payload of a `ws.send` / `ws.send.*` event, exactly as published, so its shape is up to you. The examples below use `{ event, data }` in both directions.

Some example server messages:

```json
{"event":"user.login","data":{"userId":"123","username":"jane"}}
{"event":"chat.message","data":{"roomId":"lobby","user":"jane","text":"Hello everyone!"}}
{"event":"notification.info","data":{"title":"Maintenance","message":"Back in 5 minutes"}}
{"type":"response","id":"4f1c…","result":[{"roomId":"lobby","user":"jane","text":"hi"}]}
```

## Subscribing

```typescript
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

interface UserEvent {
  userId: string;
  username: string;
}

const evem = new EvEm();
const handler = new WebSocketHandler('wss://api.example.com/ws', evem);

// One event
evem.subscribe<UserEvent>('server.user.login', (user) => {
  console.log(`${user.username} logged in`);
});

// Every user event: server.user.login, server.user.logout, server.user.profile.updated, ...
evem.subscribe<UserEvent>('server.user.*', (user) => {
  console.log('user event for', user.userId);
});

// Every server event
evem.subscribe('server.*', (data) => {
  console.debug('server event', data);
});

// Anything that didn't match a route, and messages that couldn't be parsed
evem.subscribe('ws.message', (message) => console.debug('unrouted message', message));
evem.subscribe<{ error: unknown; rawData: unknown }>('ws.parse.error', ({ rawData }) => {
  console.warn('could not parse', rawData);
});

// Later: removes the handler's own subscriptions, not these
await handler.disconnect();
```

Subscribers don't receive the event name, only the data. If one subscriber needs to tell events apart, include that information in `data`, or use separate subscriptions.

### Wildcard rules

| Pattern | Matches | Doesn't match |
|---------|---------|---------------|
| `server.user.*` | `server.user.login`, `server.user.profile.updated` | `server.user` |
| `server.*.login` | `server.user.login`, `server.admin.login` | `server.user.sso.login` |
| `server.*` | every `server.…` event | `server` |
| `*` | every event | — |

A trailing `*` matches one or more segments. A `*` anywhere else matches exactly one segment. **`x.*` never matches `x` itself.** If the server sends `chat.message`, a subscription to `server.chat.message.*` receives nothing; subscribe to `server.chat.message`.

## Filters, priorities, once and transforms

All of EvEm's subscription options work on server events:

```typescript
import { EvEm } from '@jcfigueiredo/evem';

interface Notice {
  title: string;
  message: string;
  priority?: 'low' | 'high';
}

const evem = new EvEm();
const currentUserId = '123';

// Filter: only high-priority notices
evem.subscribe<Notice>('server.notification.*', (notice) => {
  console.log('Important:', notice.title);
}, {
  filter: (notice) => notice.priority === 'high',
});

// Filter on the payload, e.g. only events about the current user
evem.subscribe<{ userId: string }>('server.user.*', (event) => {
  console.log('about me:', event);
}, {
  filter: (event) => event.userId === currentUserId,
});

// Priority: 'high' runs before 'normal' (the default), which runs before 'low'.
// Equal priorities run in the order they subscribed.
evem.subscribe('server.user.login', (data) => console.log('audit', data), { priority: 'high' });
evem.subscribe('server.user.login', (data) => console.log('update UI', data));
evem.subscribe('server.user.login', (data) => console.log('analytics', data), { priority: 'low' });

// Once: unsubscribes itself after the first matching event
evem.subscribe('server.system.ready', () => {
  console.log('server is ready');
}, { once: true });
```

### Transforms

A `transform` doesn't change what its own subscriber receives. It runs **after** its subscriber's callback, and its return value is passed on to the subscribers that run later in the same publish. Those are subscribers with a lower priority, or with the same priority that subscribed later, on any matching pattern.

A transform doesn't run when its subscriber was skipped: rejected by a filter or schema, throttled or debounced, or a `once` subscriber that has already fired.

```typescript
import { EvEm } from '@jcfigueiredo/evem';

interface ChatMessage {
  roomId: string;
  user: string;
  text: string;
}

const evem = new EvEm();
const auditLog: ChatMessage[] = [];

// Runs first and records the original message; later subscribers get the redacted copy
evem.subscribe<ChatMessage>('server.chat.message', (message) => {
  auditLog.push(message);
}, {
  priority: 'high',
  transform: (message) => ({ ...message, text: message.text.replace(/\d{12,19}/g, '[redacted]') }),
});

// Normal priority: receives the redacted message
evem.subscribe<ChatMessage>('server.chat.message', (message) => {
  console.log(`${message.user}: ${message.text}`);
});
```

To change what **every** subscriber of an event receives, use middleware instead. Middleware runs before any subscriber:

```typescript
import { EvEm } from '@jcfigueiredo/evem';

interface RawNotice {
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'error';
}

const evem = new EvEm();

// Every server.notification.* subscriber receives { title, body, level }
evem.use({
  pattern: 'server.notification.*',
  handler: (_event, data) => {
    const raw = data as RawNotice;
    return { title: raw.title, body: raw.message, level: raw.severity ?? 'info' };
  },
});
```

Middleware results work like this:

- `null` cancels the event.
- A new object with exactly two properties, `event` and `data`, reroutes the event to that name.
- Any other result replaces the data.

## Example: chat client and server

The server below uses the [`ws`](https://www.npmjs.com/package/ws) package. It sends `{ event, data }` messages and answers `handler.request()` calls with `{ type: 'response' }` messages:

```typescript
// server.ts (Node.js)
import { WebSocket, WebSocketServer } from 'ws';

interface ChatMessage {
  roomId: string;
  user: string;
  text: string;
}

// What the client sends: ws.send payloads ({ event, data }) and handler.request() calls
interface ClientFrame {
  type?: 'request';
  id?: string;
  method?: string;
  params?: { roomId?: string; limit?: number };
  event?: string;
  data?: { roomId: string; text: string };
}

const history: ChatMessage[] = [];
const wss = new WebSocketServer({ port: 8080 });

// The client publishes this as `server.${event}`
function broadcast(event: string, data: unknown): void {
  const frame = JSON.stringify({ event, data });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(frame);
    }
  }
}

wss.on('connection', (socket) => {
  const user = `guest-${Math.floor(Math.random() * 1000)}`;
  socket.send(JSON.stringify({ event: 'system.ready', data: { user } }));
  broadcast('user.joined', { user });

  socket.on('message', (raw) => {
    let frame: ClientFrame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return; // not JSON
    }

    // handler.request('chat.history', { roomId, limit })
    if (frame.type === 'request') {
      if (frame.method === 'chat.history') {
        const { roomId, limit = 50 } = frame.params ?? {};
        const result = history.filter((m) => m.roomId === roomId).slice(-limit);
        socket.send(JSON.stringify({ type: 'response', id: frame.id, result }));
      } else {
        const error = { code: 404, message: `Unknown method: ${frame.method}` };
        socket.send(JSON.stringify({ type: 'response', id: frame.id, error }));
      }
      return;
    }

    // evem.publish('ws.send', { event: 'chat.send', data: { roomId, text } })
    if (frame.event === 'chat.send' && frame.data) {
      const message: ChatMessage = { roomId: frame.data.roomId, user, text: frame.data.text };
      history.push(message);
      broadcast('chat.message', message);
    }
  });

  socket.on('close', () => broadcast('user.left', { user }));
});
```

The client below works in browsers and in Node.js 22+. For Node.js 20, see [Node.js](websocket-adapter.md#nodejs).

```typescript
// client.ts
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler } from '@jcfigueiredo/evem/websocket';

interface ChatMessage {
  roomId: string;
  user: string;
  text: string;
}

const evem = new EvEm();
const handler = new WebSocketHandler('ws://localhost:8080', evem, { reconnect: true });

// The server sends 'chat.message' for every room, so filter by room.
// (Subscribing to `server.chat.message.${roomId}` would never fire: the server doesn't put the
// room in the event name, and 'server.chat.message.*' doesn't match 'server.chat.message'.)
function onRoomMessage(roomId: string, callback: (message: ChatMessage) => void): string {
  return evem.subscribe<ChatMessage>('server.chat.message', callback, {
    filter: (message) => message.roomId === roomId,
  });
}

function sendMessage(roomId: string, text: string): Promise<boolean> {
  return evem.publish('ws.send', { event: 'chat.send', data: { roomId, text } });
}

evem.subscribe<{ user: string }>('server.system.ready', ({ user }) => {
  console.log(`connected as ${user}`);
}, { once: true });

evem.subscribe<{ user: string }>('server.user.*', ({ user }) => {
  console.log(`presence: ${user}`); // user.joined and user.left
});

const lobby = onRoomMessage('lobby', (message) => {
  console.log(`[lobby] ${message.user}: ${message.text}`);
});

const earlier = await handler.request<ChatMessage[]>('chat.history', { roomId: 'lobby', limit: 20 });
console.log(`${earlier.length} earlier messages`);

await sendMessage('lobby', 'Hello everyone!');

// Later
evem.unsubscribeById(lobby);
await handler.disconnect();
```

## Using with React

Create the handler once, in an effect at the top of the app, and disconnect it when that component unmounts. Components subscribe to the shared emitter in their own effects and unsubscribe in the cleanup.

```tsx
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { EvEm } from '@jcfigueiredo/evem';
import { WebSocketHandler, type ConnectionStateChangeEvent } from '@jcfigueiredo/evem/websocket';

// One emitter for the app, and one WebSocketHandler for it
export const evem = new EvEm();
const HandlerContext = createContext<WebSocketHandler | null>(null);

export function WebSocketProvider({ url, children }: { url: string; children: ReactNode }) {
  const [handler, setHandler] = useState<WebSocketHandler | null>(null);

  useEffect(() => {
    const created = new WebSocketHandler(url, evem, { reconnect: true });
    setHandler(created);
    return () => {
      void created.disconnect();
    };
  }, [url]);

  return <HandlerContext.Provider value={handler}>{children}</HandlerContext.Provider>;
}

/** The handler, for request(); null until the provider's effect has run */
export function useWebSocketHandler(): WebSocketHandler | null {
  return useContext(HandlerContext);
}

/** Subscribe to an EvEm event (e.g. 'server.chat.message') while the component is mounted */
export function useEvent<T>(pattern: string, onEvent: (data: T) => void): void {
  const latest = useRef(onEvent);
  useEffect(() => {
    latest.current = onEvent;
  });

  useEffect(() => {
    const id = evem.subscribe<T>(pattern, (data) => latest.current(data));
    return () => evem.unsubscribeById(id);
  }, [pattern]);
}

interface ChatMessage {
  roomId: string;
  user: string;
  text: string;
}

function Chat({ roomId }: { roomId: string }) {
  const handler = useWebSocketHandler();
  const [state, setState] = useState('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');

  useEvent<ConnectionStateChangeEvent>('ws.connection.state', ({ to }) => setState(to));
  useEvent<ChatMessage>('server.chat.message', (message) => {
    if (message.roomId === roomId) {
      setMessages((previous) => [...previous, message]);
    }
  });

  useEffect(() => {
    if (!handler) return;
    let current = true;
    handler
      .request<ChatMessage[]>('chat.history', { roomId, limit: 50 })
      .then((history) => {
        if (current) setMessages((live) => [...history, ...live]);
      })
      .catch((error: unknown) => console.error('Could not load history', error));
    return () => {
      current = false;
    };
  }, [handler, roomId]);

  const send = () => {
    void evem.publish('ws.send', { event: 'chat.send', data: { roomId, text } });
    setText('');
  };

  return (
    <div>
      <p>Connection: {state}</p>
      <ul>
        {messages.map((message, index) => (
          <li key={index}>
            <strong>{message.user}:</strong> {message.text}
          </li>
        ))}
      </ul>
      <input value={text} onChange={(event) => setText(event.target.value)} />
      <button onClick={send}>Send</button>
    </div>
  );
}

export function App() {
  return (
    <WebSocketProvider url="ws://localhost:8080">
      <Chat roomId="lobby" />
    </WebSocketProvider>
  );
}
```

In development, React's Strict Mode runs effects twice. The provider then creates a handler, disconnects it, and creates another one. This is expected, and the cleanup above handles it.

## Tips

- **Namespace server events** (`user.*`, `chat.*`, `notification.*`) so wildcards stay useful.
- **Put routing data in the payload** (a room id, a user id), and filter on it. Patterns only match event names.
- **Type your payloads** with `subscribe<T>()`. If the server's data can't be trusted, validate it with the `schema` option.
- **Unsubscribe** (`evem.unsubscribeById(id)`) when a view goes away. `handler.disconnect()` removes only the handler's own subscriptions, not yours.
- **Expect overlapping async subscribers.** Incoming messages are published as they arrive. A slow `async` subscriber can still be handling one message when the next one arrives.
- **Watch `ws.parse.error` and `ws.message`** during development. They show messages that didn't match any route.
