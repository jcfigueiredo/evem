/** The board's state in the card's own store: how many task subscriptions there are, and the server's controls */
interface BoardStore {
  subscriptions: number;
  drop(): void;
}

/**
 * Start the Alpine card: Alpine (loaded here, so the page doesn't load it before the card nears the screen), the
 * EvEm plugin on the board's emitter, and a store for what the markup shows beside EvEm's own `$store.evem`. The
 * markup is static in index.html, hidden with x-cloak until Alpine starts.
 */
export async function mountAlpineCard(host: HTMLElement): Promise<void> {
  const [{ default: Alpine }, { evemAlpine }, { createBoard }] = await Promise.all([
    import('alpinejs'),
    import('@jcfigueiredo/evem/alpine'),
    import('./board')
  ]);
  const { evem, sse, server } = createBoard();
  const countSubscriptions = () =>
    evem.info().filter(entry => !entry.isMiddleware && entry.event.startsWith('server:task')).length;

  Alpine.plugin(evemAlpine(evem, { sse }));
  Alpine.store('board', {
    subscriptions: 0,
    drop: () => server.run('drop')
  } satisfies BoardStore);
  const store = Alpine.store('board') as BoardStore;
  // Alpine unsubscribes as it removes an element; the count follows shortly after
  setInterval(() => {
    store.subscriptions = countSubscriptions();
  }, 300);
  host.querySelector('[data-alpine-loading]')?.remove();
  Alpine.start();
}
