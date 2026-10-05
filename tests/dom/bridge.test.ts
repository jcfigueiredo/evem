import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeFromDom, bridgeToDom } from '../../src/dom/index';
import { EvEm, ErrorPolicy } from '../../src/eventEmitter';

/** The DOM events a target receives, as `name detail` */
function listen(target: EventTarget, ...names: string[]): string[] {
  const got: string[] = [];
  for (const name of names) {
    target.addEventListener(name, event => {
      got.push(`${event.type} ${JSON.stringify((event as CustomEvent).detail)}`);
    });
  }
  return got;
}

/** What EvEm subscribers to the pattern receive */
function received(evem: EvEm, pattern: string): unknown[] {
  const got: unknown[] = [];
  evem.subscribe(pattern, (data: unknown) => {
    got.push(data);
  });
  return got;
}

describe('bridgeToDom', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dispatches the events its patterns match as CustomEvents, with the data as detail', async () => {
    const evem = new EvEm({ separator: ':' });
    const target = new EventTarget();
    const dom = listen(target, 'server:task-changed', 'server:chat:run-started', 'toast', 'other');
    bridgeToDom(evem, ['server:*', 'toast'], { target });

    await evem.publish('server:task-changed', { lane: 'doing' });
    await evem.publish('server:chat:run-started', { run: 7 });
    await evem.publish('toast', 'Saved');
    await evem.publish('other', 1);

    expect(dom).toEqual(['server:task-changed {"lane":"doing"}', 'server:chat:run-started {"run":7}', 'toast "Saved"']);
  });

  it('takes one pattern as a string, and renames events for the DOM', async () => {
    const evem = new EvEm();
    const target = new EventTarget();
    const dom = listen(target, 'server:task-changed');
    bridgeToDom(evem, 'server.*', { target, rename: (name: string) => name.replaceAll('.', ':') });

    await evem.publish('server.task-changed', 1);

    expect(dom).toEqual(['server:task-changed 1']);
  });

  it('sends what earlier middleware made of the event, and nothing it canceled', async () => {
    const evem = new EvEm();
    const target = new EventTarget();
    const dom = listen(target, 'a', 'b', 'c');
    evem.use({ pattern: 'a', handler: (_event, data: number) => data * 10 });
    evem.use({ pattern: 'b', handler: () => ({ event: 'c', data: 'rerouted' }) });
    evem.use({ pattern: 'x', handler: () => null });
    bridgeToDom(evem, '*', { target });

    await evem.publish('a', 1);
    await evem.publish('b', 2);
    await evem.publish('x', 3);

    expect(dom).toEqual(['a 10', 'c "rerouted"']);
  });

  it('stops when the function it returns is called', async () => {
    const evem = new EvEm();
    const target = new EventTarget();
    const dom = listen(target, 'toast');
    const stop = bridgeToDom(evem, 'toast', { target });
    stop();

    await evem.publish('toast', 1);

    expect(dom).toEqual([]);
    expect(evem.info().filter(entry => entry.isMiddleware)).toEqual([]);
  });

  it('throws a TypeError when the global object can only dispatch, or only listen', () => {
    const page = new EventTarget();
    vi.stubGlobal('dispatchEvent', page.dispatchEvent.bind(page));
    expect(() => bridgeToDom(new EvEm(), 'toast')).toThrow(TypeError);
    vi.unstubAllGlobals();
    vi.stubGlobal('addEventListener', page.addEventListener.bind(page));
    expect(() => bridgeFromDom(new EvEm(), 'toast')).toThrow(TypeError);
  });

  it('uses the global window by default, and throws a TypeError where there is none', async () => {
    expect(() => bridgeToDom(new EvEm(), 'toast')).toThrow(TypeError);
    expect(() => bridgeToDom(new EvEm(), 'toast')).toThrow('pass a target');

    const page = new EventTarget();
    vi.stubGlobal('dispatchEvent', page.dispatchEvent.bind(page));
    vi.stubGlobal('addEventListener', page.addEventListener.bind(page));
    const evem = new EvEm();
    const dom = listen(page, 'toast');
    bridgeToDom(evem, 'toast');
    await evem.publish('toast', 'hi');
    expect(dom).toEqual(['toast "hi"']);
  });
});

describe('bridgeFromDom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes the DOM events it listens to, with their detail as data', async () => {
    const evem = new EvEm({ separator: ':' });
    const target = new EventTarget();
    const lanes = received(evem, 'lane:*');
    bridgeFromDom(evem, ['lane:expand', 'lane:collapse'], { target });

    target.dispatchEvent(new CustomEvent('lane:expand', { detail: { lane: 'doing' } }));
    target.dispatchEvent(new CustomEvent('lane:collapse', { detail: { lane: 'done' } }));
    target.dispatchEvent(new CustomEvent('lane:other', { detail: 1 }));
    await Promise.resolve();

    expect(lanes).toEqual([{ lane: 'doing' }, { lane: 'done' }]);
  });

  it('renames DOM events for EvEm, and stops when asked', async () => {
    const evem = new EvEm();
    const target = new EventTarget();
    const toasts = received(evem, 'ui.toast');
    const stop = bridgeFromDom(evem, 'toast', { target, rename: (name: string) => `ui.${name}` });

    target.dispatchEvent(new CustomEvent('toast', { detail: 'one' }));
    stop();
    target.dispatchEvent(new CustomEvent('toast', { detail: 'two' }));
    await Promise.resolve();

    expect(toasts).toEqual(['one']);
  });

  it('logs a publish that rejects instead of leaving it unhandled', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const evem = new EvEm();
    const target = new EventTarget();
    evem.subscribe('strict', () => {}, { schema: () => false, schemaErrorPolicy: ErrorPolicy.THROW });
    bridgeFromDom(evem, 'strict', { target });

    target.dispatchEvent(new CustomEvent('strict', { detail: 1 }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(error).toHaveBeenCalledWith('Error publishing "strict" from the DOM bridge:', expect.any(Error));
  });
});

describe('Bridging both ways', () => {
  it('delivers each event once to EvEm subscribers and once to DOM listeners, whichever side sends it', async () => {
    const evem = new EvEm();
    const target = new EventTarget();
    const dom = listen(target, 'toast');
    const subscribers = received(evem, 'toast');
    bridgeToDom(evem, 'toast', { target });
    bridgeFromDom(evem, 'toast', { target });

    await evem.publish('toast', 'from EvEm');
    target.dispatchEvent(new CustomEvent('toast', { detail: 'from the DOM' }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(subscribers).toEqual(['from EvEm', 'from the DOM']);
    expect(dom).toEqual(['toast "from EvEm"', 'toast "from the DOM"']);
  });

  it('keeps track of DOM events of the same name whose publishes overlap', async () => {
    const evem = new EvEm();
    const target = new EventTarget();
    const dom = listen(target, 'toast');
    let open!: () => void;
    const gate = new Promise<void>(resolve => {
      open = resolve;
    });
    // The first toast waits here, before the bridge sees it, while the second goes all the way through
    evem.use({ pattern: 'toast', handler: async (_event, data) => (data === 'first' ? gate.then(() => data) : data) });
    bridgeToDom(evem, 'toast', { target });
    bridgeFromDom(evem, 'toast', { target });

    target.dispatchEvent(new CustomEvent('toast', { detail: 'first' }));
    target.dispatchEvent(new CustomEvent('toast', { detail: 'second' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    open();
    await new Promise(resolve => setTimeout(resolve, 0));
    await evem.publish('toast', 'third, from EvEm');

    expect(dom).toEqual(['toast "first"', 'toast "second"', 'toast "third, from EvEm"']);
  });

  it('still sends to the DOM the same events published from elsewhere, before and after', async () => {
    const evem = new EvEm();
    const target = new EventTarget();
    const dom = listen(target, 'toast');
    bridgeToDom(evem, 'toast', { target });
    bridgeFromDom(evem, 'toast', { target });

    target.dispatchEvent(new CustomEvent('toast', { detail: 'from the DOM' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    await evem.publish('toast', 'later, from EvEm');

    expect(dom).toEqual(['toast "from the DOM"', 'toast "later, from EvEm"']);
  });
});
