import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvEm } from '../src/eventEmitter';
import { RequestResponseManager } from '../src/websocket/RequestResponseManager';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Subscription and request ids', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should be UUIDs', () => {
    const evem = new EvEm();

    expect(evem.subscribe('user.login', () => {})).toMatch(UUID_V4);
  });

  // Browsers only expose crypto.randomUUID() in secure contexts (HTTPS or localhost)
  it('should still be unique UUIDs where crypto.randomUUID() is unavailable', async () => {
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) });
    const evem = new EvEm();

    const ids = Array.from({ length: 100 }, () => evem.subscribe('user.login', () => {}));

    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(100);

    const sent: any[] = [];
    evem.subscribe('ws.send.request', (request: any) => { sent.push(request); });
    const manager = new RequestResponseManager(evem);
    const pending = manager.request('ping', undefined, { timeout: 10 }).catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sent[0]?.id).toMatch(UUID_V4);
    await pending;
  });
});
