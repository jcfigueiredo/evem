import { EvEm } from '~/eventEmitter';
import { INLINE_EVEM_PAGES, extractClassSource, listDemoPages, loadInlineEvEm, readDemoPage } from './demoPages';
import { describe, expect, it } from 'vitest';

/**
 * Regression tests: the demo pages' inline EvEm copies must call each matching subscription exactly
 * once per publish, like the real library. Several copies collected exact-match handlers and then
 * collected them again while scanning patterns, so every handler ran twice.
 */

const pages = Object.entries(INLINE_EVEM_PAGES);

describe('demo pages: inline EvEm dispatch', () => {
  it('covers every demo page that has an inline EvEm', () => {
    const pagesWithInlineEvEm = listDemoPages().filter(file => extractClassSource(readDemoPage(file), 'EvEm'));
    expect(pagesWithInlineEvEm).toEqual(Object.keys(INLINE_EVEM_PAGES).sort());
  });

  describe.each(pages)('%s', (file, features) => {
    it('calls an exact subscription exactly once per publish', async () => {
      const { EvEm: InlineEvEm } = loadInlineEvEm(file);
      const evem = new InlineEvEm();
      const received: unknown[] = [];

      evem.subscribe('user.login', (data: unknown) => {
        received.push(data);
      });
      await evem.publish('user.login', { username: 'Alice' });
      expect(received).toEqual([{ username: 'Alice' }]);

      await evem.publish('user.login', { username: 'Bob' });
      expect(received).toEqual([{ username: 'Alice' }, { username: 'Bob' }]);
    });

    it.runIf(features.priority)('runs each priority handler once, HIGH -> NORMAL -> LOW', async () => {
      const { EvEm: InlineEvEm } = loadInlineEvEm(file);
      const evem = new InlineEvEm();
      const order: string[] = [];

      evem.subscribe(
        'app.startup',
        () => {
          order.push('LOW');
        },
        { priority: 'low' }
      );
      evem.subscribe(
        'app.startup',
        () => {
          order.push('HIGH');
        },
        { priority: 'high' }
      );
      evem.subscribe(
        'app.startup',
        () => {
          order.push('NORMAL');
        },
        { priority: 'normal' }
      );
      await evem.publish('app.startup', {});

      expect(order).toEqual(['HIGH', 'NORMAL', 'LOW']);
    });

    it.runIf(features.wildcards)('calls an exact and a wildcard subscription once each', async () => {
      const { EvEm: InlineEvEm } = loadInlineEvEm(file);
      const evem = new InlineEvEm();
      const calls: string[] = [];

      evem.subscribe('user.login', () => {
        calls.push('exact');
      });
      evem.subscribe('user.*', () => {
        calls.push('wildcard');
      });
      await evem.publish('user.login', {});

      expect(calls.sort()).toEqual(['exact', 'wildcard']);
    });
  });

  it('the real library also calls an exact subscription once and runs priorities HIGH -> NORMAL -> LOW', async () => {
    const evem = new EvEm();
    const calls: string[] = [];
    evem.subscribe('user.login', () => {
      calls.push('exact');
    });
    evem.subscribe('user.*', () => {
      calls.push('wildcard');
    });
    evem.subscribe(
      'app.startup',
      () => {
        calls.push('LOW');
      },
      { priority: 'low' }
    );
    evem.subscribe(
      'app.startup',
      () => {
        calls.push('HIGH');
      },
      { priority: 'high' }
    );
    evem.subscribe(
      'app.startup',
      () => {
        calls.push('NORMAL');
      },
      { priority: 'normal' }
    );

    await evem.publish('user.login', {});
    await evem.publish('app.startup', {});

    expect(calls).toEqual(['exact', 'wildcard', 'HIGH', 'NORMAL', 'LOW']);
  });
});
