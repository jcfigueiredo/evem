import { describe, expect, it, vi } from 'vitest';
import { EvEm } from '../src/eventEmitter';

/** Which of these names a subscription to the pattern receives */
async function receivedBy(evem: EvEm, pattern: string, names: string[]): Promise<string[]> {
  const got: string[] = [];
  evem.subscribe(pattern, (name: string) => {
    got.push(name);
  });
  for (const name of names) await evem.publish(name, name);
  return got;
}

describe('Separator', () => {
  it('is a dot by default', async () => {
    const evem = new EvEm();
    expect(evem.separator).toBe('.');
    expect(await receivedBy(evem, 'task.*', ['task.opened', 'task:closed'])).toEqual(['task.opened']);
  });

  it('splits names on the separator given, for every wildcard rule', async () => {
    const names = ['task:opened', 'task:comment:added', 'task', 'user:login', 'server.task-changed'];
    const evem = () => new EvEm({ separator: ':' });

    expect(evem().separator).toBe(':');
    expect(await receivedBy(evem(), 'task:*', names)).toEqual(['task:opened', 'task:comment:added']);
    expect(await receivedBy(evem(), '*:login', names)).toEqual(['user:login']);
    expect(await receivedBy(evem(), 'task:*:added', names)).toEqual(['task:comment:added']);
    expect(await receivedBy(evem(), '*', names)).toEqual(names);
  });

  it('treats dots as ordinary characters with another separator', async () => {
    const evem = new EvEm({ separator: ':' });
    expect(await receivedBy(evem, 'server.*', ['server.task-changed', 'server.task'])).toEqual([]);
    expect(await receivedBy(new EvEm({ separator: ':' }), '*', ['server.task-changed'])).toEqual([
      'server.task-changed'
    ]);
  });

  it('takes a separator of several characters', async () => {
    const evem = new EvEm({ separator: '::' });
    expect(await receivedBy(evem, 'task::*', ['task::opened', 'task:opened'])).toEqual(['task::opened']);
  });

  it('applies to middleware patterns, history and info()', async () => {
    const evem = new EvEm({ separator: ':' });
    const seen: string[] = [];
    evem.use({
      pattern: 'task:*',
      handler: (event, data) => {
        seen.push(event);
        return data;
      }
    });
    evem.enableHistory();
    evem.subscribe('task:opened', () => {});
    evem.subscribe('user:login', () => {});

    await evem.publish('task:opened', 1);
    await evem.publish('user:login', 2);

    expect(seen).toEqual(['task:opened']);
    expect(evem.getEventHistory('task:*').map(record => record.event)).toEqual(['task:opened']);
    const info = evem.info('task:*');
    expect(info.filter(entry => !entry.isMiddleware).map(entry => entry.event)).toEqual(['task:opened']);
    expect(info.filter(entry => entry.isMiddleware).map(entry => entry.pattern)).toEqual(['task:*']);
  });

  it('keeps the recursion limit as a number argument or an option', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const evem of [new EvEm(1), new EvEm({ maxRecursionDepth: 1, separator: ':' })]) {
      let depth = 0;
      evem.subscribe('loop', async () => {
        depth++;
        await evem.publish('loop').catch(() => {});
      });
      await evem.publish('loop');
      expect(depth).toBe(1);
    }
    vi.restoreAllMocks();
  });

  it('rejects a separator that is empty, contains the wildcard, or is not a string', () => {
    for (const separator of ['', '*', 'a*b', 3 as unknown as string]) {
      expect(() => new EvEm({ separator })).toThrow(TypeError);
    }
    expect(() => new EvEm({ separator: '*' })).toThrow("The separator can't be empty or contain '*'");
    expect(() => new EvEm({ separator: 3 as unknown as string })).toThrow('and must be a string');
  });
});
