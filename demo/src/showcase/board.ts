import { EvEm } from '@jcfigueiredo/evem';
import { SseHandler } from '@jcfigueiredo/evem/sse';
import { FakeSseServer, type SseStream } from '../fakes/sseServer';

/** A task on the Alpine card's board */
export interface BoardTask {
  id: number;
  title: string;
  lane: 'todo' | 'doing' | 'done';
}

export const BOARD_LANES = ['todo', 'doing', 'done'] as const;

/** The tasks as the server starts them; each connection streams them, then moves one every MOVE_EVERY ms */
export const BOARD_TASKS: readonly BoardTask[] = [
  { id: 1, title: 'Write the docs', lane: 'doing' },
  { id: 2, title: 'Review the pull request', lane: 'todo' },
  { id: 3, title: 'Release 0.5.0', lane: 'done' },
  { id: 4, title: 'Try it in Syzygy', lane: 'todo' }
];

export const MOVE_EVERY = 2000;

/**
 * The server: it subscribes to its source after 200 ms and says so with a keepalive, sends every task as it stands,
 * then moves one task to the next lane (done goes back to todo) every MOVE_EVERY ms. Every message has an id, so a
 * reconnection resumes where it stopped.
 */
function moves(tasks: BoardTask[]): (stream: SseStream) => () => void {
  let id = 0;
  let next = 0;
  return stream => {
    const send = (task: BoardTask) => stream.send({ event: 'task:moved', data: { ...task }, id: ++id });
    const timers = [
      setTimeout(() => {
        stream.write('event: keepalive\ndata: connected\n\n');
        tasks.forEach(send);
      }, 200)
    ];
    const mover = setInterval(() => {
      const task = tasks[next++ % tasks.length]!;
      task.lane = BOARD_LANES[(BOARD_LANES.indexOf(task.lane) + 1) % BOARD_LANES.length]!;
      send(task);
    }, MOVE_EVERY);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(mover);
    };
  };
}

/** The Alpine card's EvEm, with ':' as separator, history for late subscribers, and an SseHandler on a fake server */
export function createBoard(): { evem: EvEm; sse: SseHandler; server: FakeSseServer; stop: () => Promise<void> } {
  const server = new FakeSseServer({ latency: 30, onOpen: moves(BOARD_TASKS.map(task => ({ ...task }))) });
  const evem = new EvEm({ separator: ':' });
  evem.enableHistory(20);
  const sse = new SseHandler('/board/events', evem, {
    fetch: server.fetch,
    readyEvent: 'keepalive',
    reconnectDelay: 1000,
    parseData: (data, type) => (type === 'keepalive' ? data : JSON.parse(data))
  });
  const stop = async () => {
    await sse.disconnect();
    server.close();
  };
  return { evem, sse, server, stop };
}
