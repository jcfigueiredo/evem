import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { EvEm, type CancelableEvent, type EventRecord } from '../src/eventEmitter';
import {
  SEPARATOR,
  defineEvents,
  payload,
  type Cancelable,
  type EventsOf,
  type WithSeparator
} from '../src/eventTypes';
import { SseHandler } from '../src/sse/SseHandler';
import type { SseEvents } from '../src/sse/types';
import { WebSocketHandler } from '../src/websocket/WebSocketHandler';
import { FakeTransport } from './sse/helpers/FakeTransport';
import { createMockWebSocketConstructor } from './websocket/mocks/MockWebSocket';

interface Task {
  id: string;
  lane: string;
}

interface AppEvents {
  'task.opened': { id: string };
  'task.closed': { id: string; reason: string };
  'task.comment.added': { text: string };
  'server.task-changed': Task;
  toast: { message: string };
  'app.ready': void;
  'order.placing': Cancelable<{ total: number }>;
}

// Type checks run in `pnpm typecheck`; each `@ts-expect-error` fails the check if its line stops being an error.
// The functions below are never called: they only need to compile.

export function untypedEmittersAreUnchanged(): void {
  const evem = new EvEm();
  evem.subscribe<{ id: number }>('user.login', user => {
    expectTypeOf(user).toEqualTypeOf<{ id: number }>();
  });
  evem.subscribe('anything', (user: { name: string }) => {
    void user.name;
  });
  void evem.publish<{ id: number }>('user.login', { id: 1 });
  void evem.publish('whatever');
  evem.use((event, data) => [event, data]);
  expectTypeOf(evem.getEventHistory<{ id: number }>()).toEqualTypeOf<EventRecord<{ id: number }>[]>();
  const plain: EvEm = new EvEm({ separator: ':' }); // any untyped emitter fits a plain EvEm annotation
  void plain;
  new EvEm(5);
}

export function typedEmittersCheckNamesAndPayloads(): void {
  const evem = new EvEm<AppEvents>();
  void evem.publish('toast', { message: 'Saved' });
  // @ts-expect-error -- not an event
  void evem.publish('toast:show', { message: 'x' });
  // @ts-expect-error -- wrong payload
  void evem.publish('task.opened', { id: 7 });
  void evem.publish('app.ready');
  // @ts-expect-error -- a payload is required
  void evem.publish('toast');
  void evem.publish('order.placing', { total: 3 }, { cancelable: true });
  // @ts-expect-error -- a cancelable event says so when it's published
  void evem.publish('order.placing', { total: 3 });
  void new EvEm<{ toast: { variant: 'success' | 'error' } }>().publish('toast', { variant: 'success' });
  // @ts-expect-error -- explicit payload types are for untyped emitters
  void evem.publish<{ id: number }>('toast', { id: 1 });

  evem.subscribe('task.*', task => {
    expectTypeOf(task).toEqualTypeOf<{ id: string } | { id: string; reason: string } | { text: string }>();
  });
  evem.subscribe('task.*.added', comment => {
    expectTypeOf(comment).toEqualTypeOf<{ text: string }>();
  });
  evem.subscribe('order.placing', order => {
    expectTypeOf(order).toEqualTypeOf<{ total: number } & CancelableEvent>();
  });
  evem.subscribeOnce('server.*', task => {
    expectTypeOf(task).toEqualTypeOf<Task>();
  });
  // @ts-expect-error -- matches no event
  evem.subscribe('billing.*', () => {});
  // @ts-expect-error -- matches no event
  evem.unsubscribe('billing.*', () => {});
  evem.subscribe('task.opened', () => {}, { filter: task => task.id !== '', transform: task => ({ id: task.id }) });
  // @ts-expect-error -- a transform keeps the payload type
  evem.subscribe('task.opened', () => {}, { transform: () => 42 });

  evem.use({
    pattern: 'task.*',
    handler: (event, data) => {
      if (event === 'task.closed') expectTypeOf(data).toEqualTypeOf<{ id: string; reason: string }>();
      return data;
    }
  });
  evem.use({ pattern: 'toast', handler: () => ({ event: 'task.opened', data: { id: '1' } }) });
  evem.use(() => ({ event: 'task.opened', data: { id: '1' } }));
  evem.use({ pattern: 'toast', handler: (_event, _data) => ({ event: 'task.opened', data: { id: '1' } }) });
  // @ts-expect-error -- a reroute names an event and gives its payload
  evem.use({ pattern: 'toast', handler: () => ({ event: 'task.opened', data: { id: 1 } }) });

  expectTypeOf(evem.getEventHistory('toast')).toEqualTypeOf<
    { event: 'toast'; data: { message: string }; timestamp: number }[]
  >();
}

export function separatorsAreDeclaredOnce(): void {
  interface ColonEvents {
    [SEPARATOR]: ':';
    'task:opened': { id: string };
    'server:task-changed': Task;
  }
  const colon = new EvEm<ColonEvents>({ separator: ':' });
  colon.subscribe('server:*', task => {
    expectTypeOf(task).toEqualTypeOf<Task>();
  });
  // @ts-expect-error -- the map declares ':', so the separator option is required
  new EvEm<ColonEvents>();
  // @ts-expect-error -- and must be ':'
  new EvEm<ColonEvents>({ separator: '.' });

  const appEvents = defineEvents(
    { 'task:opened': payload<{ id: string }>(), 'lane:expand': payload<{ lane: string }>() },
    { separator: ':' }
  );
  const inferred = new EvEm({ events: appEvents });
  inferred.subscribe('lane:*', lane => {
    expectTypeOf(lane).toEqualTypeOf<{ lane: string }>();
  });
  // @ts-expect-error -- dots aren't this map's separator
  inferred.subscribe('lane.*', () => {});
  const explicit = new EvEm<EventsOf<typeof appEvents>>({ separator: ':', events: appEvents });
  explicit.subscribe('task:*', task => {
    expectTypeOf(task).toEqualTypeOf<{ id: string }>();
  });

  interface WithSse extends WithSeparator<SseEvents, ':'> {
    [SEPARATOR]: ':';
    'server:task-changed': Task;
  }
  const withSse = new EvEm<WithSse>({ separator: ':' });
  withSse.subscribe('sse:ready', ready => {
    expectTypeOf(ready).toEqualTypeOf<{ timestamp: number }>();
  });
  new SseHandler('https://api.test/events', withSse, { autoConnect: false }); // adapters take any emitter
}

describe('Typed events at runtime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('takes its separator from the events, and refuses a different one', () => {
    const events = defineEvents({ 'task:opened': payload<{ id: string }>() }, { separator: ':' });
    expect(new EvEm({ events }).separator).toBe(':');
    expect(defineEvents({ a: payload() }).separator).toBe('.');
    expect(() => new EvEm({ events, separator: '.' } as never)).toThrow(TypeError);
    expect(() => new EvEm({ events, separator: '.' } as never)).toThrow('differs from the events');
  });

  it('lists the declared names', () => {
    expect(defineEvents({ 'task.opened': payload(), toast: payload<string>() }).names).toEqual([
      'task.opened',
      'toast'
    ]);
  });

  it('with devWarnings, reports once each undeclared name published and each pattern that matches nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const events = defineEvents({ 'task.opened': payload<{ id: string }>(), 'task.closed': payload() });
    const evem = new EvEm({ events, devWarnings: true }) as unknown as EvEm;

    evem.subscribe('task.*', () => {});
    evem.subscribe('billing.*', () => {});
    evem.subscribe('billing.*', () => {});
    evem.use({ pattern: 'audit.*', handler: (_event, data) => data });
    await evem.publish('task.opened', { id: '1' });
    await evem.publish('toast:show', 'x');
    await evem.publish('toast:show', 'x');

    expect(warn.mock.calls.map(call => call[0])).toEqual([
      'EvEm: no declared event matches "billing.*".',
      'EvEm: no declared event matches "audit.*".',
      'EvEm: "toast:show" is not a declared event.'
    ]);
  });

  it('checks the pattern of a middleware config, and nothing for middleware that sees every event', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const events = defineEvents({ 'task.opened': payload() });
    const evem = new EvEm({ events, devWarnings: true }) as unknown as EvEm;

    evem.use((_event, data) => data);
    evem.use({ handler: (_event, data) => data });
    evem.use({ pattern: 'task.*', handler: (_event, data) => data });

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet about the WebSocket adapter's own events", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const evem = new EvEm({ events: defineEvents({ 'server.task-changed': payload() }), devWarnings: true });
    const { constructor: Socket, instances } = createMockWebSocketConstructor({ autoConnect: false });
    const handler = new WebSocketHandler('wss://test.example.com', evem, { WebSocketConstructor: Socket });
    (evem as unknown as EvEm).subscribe('ws.*', () => {});
    instances[0]!.simulateOpen();
    await (evem as unknown as EvEm).publish('ws.send', { a: 1 });
    instances[0]!.simulateMessage('{"event":"task-changed","data":{}}');
    await new Promise(resolve => setTimeout(resolve, 0));
    await handler.disconnect();

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet without devWarnings, without declared events, and about the adapters' own events", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const events = defineEvents({ 'server.task-changed': payload() });
    const quiet = new EvEm({ events }) as unknown as EvEm;
    quiet.subscribe('billing.*', () => {});
    await quiet.publish('toast:show', 'x');
    const undeclared = new EvEm({ devWarnings: true });
    undeclared.subscribe('billing.*', () => {});
    undeclared.addKnownEvents(['x']);

    const evem = new EvEm({ events, devWarnings: true }) as unknown as EvEm;
    const transport = new FakeTransport();
    const sse = new SseHandler('https://api.test/events', evem, { transport });
    evem.subscribe('sse.*', () => {});
    for (let i = 0; i < 5; i++) await Promise.resolve();
    transport.open();
    transport.send('{}', 'task-changed');
    await new Promise(resolve => setTimeout(resolve, 0));
    await sse.disconnect();

    expect(warn).not.toHaveBeenCalled();
  });
});
