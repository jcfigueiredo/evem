// @vitest-environment happy-dom
import Alpine from 'alpinejs';
import { beforeAll, describe, expect, it } from 'vitest';
import { evemAlpine } from '../../src/alpine/index';
import { EvEm } from '../../src/eventEmitter';
import { SseHandler } from '../../src/sse/SseHandler';
import { FakeTransport } from '../sse/helpers/FakeTransport';

/** Let Alpine's mutation observer and reactive effects run */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** Add markup to the page; Alpine (started once) initializes it */
async function mount(html: string): Promise<HTMLElement> {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  await settle();
  return root;
}

const text = (root: HTMLElement, selector: string) => root.querySelector(selector)!.textContent;

describe('Alpine plugin', () => {
  beforeAll(() => {
    Alpine.start();
  });

  it('publishes from a template with $evem.publish', async () => {
    const evem = new EvEm({ separator: ':' });
    Alpine.plugin(evemAlpine(evem));
    const lanes: unknown[] = [];
    evem.subscribe('lane:*', (lane: unknown) => {
      lanes.push(lane);
    });
    const root = await mount(`<button @click="$evem.publish('lane:expand', { lane: 'doing' })">Expand</button>`);

    root.querySelector('button')!.click();
    await settle();

    expect(lanes).toEqual([{ lane: 'doing' }]);
  });

  it('subscribes with $evem.on, wildcards and options included, and the component updates', async () => {
    const evem = new EvEm({ separator: ':' });
    Alpine.plugin(evemAlpine(evem));
    const root = await mount(`
      <div x-data="{ ids: [] }" x-init="$evem.on('task:*', task => ids.push(task.id), { filter: task => task.id > 0 })">
        <span x-text="ids.join(',')"></span>
      </div>`);

    await evem.publish('task:opened', { id: 1 });
    await evem.publish('task:closed', { id: -1 });
    await evem.publish('task:comment:added', { id: 2 });
    await settle();

    expect(text(root, 'span')).toBe('1,2');
  });

  it('unsubscribes when Alpine removes the element', async () => {
    const evem = new EvEm();
    Alpine.plugin(evemAlpine(evem));
    const calls: unknown[] = [];
    (globalThis as { record?: (value: unknown) => void }).record = value => calls.push(value);
    const root = await mount(`<div x-data x-init="$evem.on('ping', value => record(value))"></div>`);
    await evem.publish('ping', 1);

    root.remove();
    await settle();
    await evem.publish('ping', 2);

    expect(calls).toEqual([1]);
    expect(evem.info().filter(entry => !entry.isMiddleware)).toEqual([]);
  });

  it('returns the subscription, to unsubscribe sooner', async () => {
    const evem = new EvEm();
    Alpine.plugin(evemAlpine(evem));
    const root = await mount(`
      <div x-data="{ count: 0, sub: null }" x-init="sub = $evem.on('ping', () => count++)">
        <button @click="sub.unsubscribe()">Stop</button>
        <span x-text="count"></span>
      </div>`);

    await evem.publish('ping');
    root.querySelector('button')!.click();
    await evem.publish('ping');
    await settle();

    expect(text(root, 'span')).toBe('1');
  });

  it("follows an SseHandler's connection in $store.evem, with any separator", async () => {
    for (const separator of ['.', ':']) {
      const evem = new EvEm({ separator });
      const transport = new FakeTransport();
      const sse = new SseHandler('https://api.test/events', evem, { transport, readyEvent: 'keepalive' });
      Alpine.plugin(evemAlpine(evem, { sse }));
      const root = await mount(`
        <div x-data>
          <span class="state" x-text="$store.evem.state"></span>
          <span class="ready" x-show="!$store.evem.ready">Reconnecting…</span>
        </div>`);
      expect(text(root, '.state')).toBe('connecting');

      transport.open();
      await settle();
      expect(text(root, '.state')).toBe('connected');
      expect((root.querySelector('.ready') as HTMLElement).style.display).toBe('');

      transport.send('"ok"', 'keepalive');
      await settle();
      expect((root.querySelector('.ready') as HTMLElement).style.display).toBe('none');

      await sse.disconnect();
      await settle();
      expect(text(root, '.state')).toBe('disconnected');
      expect((root.querySelector('.ready') as HTMLElement).style.display).toBe('');
      root.remove();
    }
  });

  it('can register the magic and the store under other names', async () => {
    const evem = new EvEm();
    const transport = new FakeTransport();
    const sse = new SseHandler('https://api.test/events', evem, { transport, autoConnect: false });
    Alpine.plugin(evemAlpine(evem, { sse, magic: 'bus', store: 'live' }));
    const got: unknown[] = [];
    evem.subscribe('hello', (value: unknown) => {
      got.push(value);
    });
    const root = await mount(
      `<div x-data x-init="$bus.publish('hello', 1)"><span x-text="$store.live.state"></span></div>`
    );

    expect(got).toEqual([1]);
    expect(text(root, 'span')).toBe('disconnected');
  });
});
