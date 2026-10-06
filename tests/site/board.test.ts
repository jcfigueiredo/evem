import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardTask } from '../../demo/src/showcase/board';
import { BOARD_TASKS, createBoard, MOVE_EVERY } from '../../demo/src/showcase/board';

describe("the Alpine card's board", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('streams every task once the server is live, then moves one per interval, as server:task:moved', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { href: 'http://localhost:5199/' });
    const { evem, sse, stop } = createBoard();
    const moved: BoardTask[] = [];
    evem.subscribe('server:task:*', (task: BoardTask) => {
      moved.push(task);
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(sse.isReady()).toBe(true);
    expect(moved).toEqual(BOARD_TASKS);

    await vi.advanceTimersByTimeAsync(MOVE_EVERY);
    expect(moved.at(-1)).toEqual({ ...BOARD_TASKS[0], lane: 'done' });
    await stop();
  });

  it('resumes after a dropped connection, and keeps the history for subscribers that come late', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { href: 'http://localhost:5199/' });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { evem, sse, server, stop } = createBoard();
    await vi.advanceTimersByTimeAsync(300);

    server.run('drop');
    await vi.advanceTimersByTimeAsync(1500);
    expect(sse.isReady()).toBe(true);
    expect(server.wire.map(entry => entry.text).join('\n')).toContain('last-event-id: 4');

    const replayed: BoardTask[] = [];
    evem.subscribe(
      'server:task:*',
      (task: BoardTask) => {
        replayed.push(task);
      },
      { replayHistory: true }
    );
    expect(replayed.length).toBeGreaterThanOrEqual(BOARD_TASKS.length);
    await stop();
  });
});
