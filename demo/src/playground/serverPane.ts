import { el } from '../dom';
import type { ScenarioSession, ServerSample } from '../engine/session';
import { checkLocalServer } from '../fakes/localSseServer';
import { keepsFollowing } from '../timeline';
import { BUTTON } from './views';
import type { FakeServer, WireEntry } from '../fakes/wire';

// Full class names, so Tailwind finds them in the source
const DIRECTION: Record<WireEntry['direction'], { mark: string; label: string; className: string }> = {
  client: { mark: '→', label: 'client sent', className: 'text-info' },
  server: { mark: '←', label: 'server sent', className: 'text-success' },
  note: { mark: '·', label: 'connection', className: 'text-base-content/70' }
};

/** How many wire lines the pane keeps on screen */
const SHOWN = 200;

/** Statuses the SSE server can answer the next request with */
const STATUSES = ['401', '403', '404', '408', '429', '500', '503', '204'];

/**
 * What the card's connection count means: the open connections, or, with none, what the code's handlers are doing
 * (reconnecting between attempts, or stopped for good)
 */
export function connectionStatus(open: number, states: readonly string[]): string {
  if (open > 0) return `${open} open connection${open === 1 ? '' : 's'}`;
  if (states.includes('reconnecting')) return 'No open connection: the client is reconnecting.';
  if (states.includes('connecting')) return 'No open connection yet: the client is connecting.';
  if (states.length > 0) return 'No open connection: the client has stopped. Reset starts over.';
  return 'No open connection.';
}

/** A wire entry's text with its line breaks visible (`↵`), since in an event stream they're the syntax */
const visible = (text: string): string => text.replace(/\r/g, '␍').replace(/\n/g, '↵\n');

/**
 * The scenario's server, as a card: its wire log (what each side sent, and what happened to connections) and
 * controls: a send box with samples, and the server's own buttons (WebSocket: drop, refuse; SSE: split, ping, end,
 * drop, refuse, silence, restart with a status). With a local SSE server available (development only), a switch
 * between the simulated server and the local one, which shows how to start it and whether it answers. The controls
 * act on the session's current server, so they keep working when the scenario starts over; `render()` redraws.
 */
export function serverPane(
  session: ScenarioSession,
  onLocalServer: (local: boolean) => Promise<void>
): { element: HTMLElement; render: () => void; reveal: () => void } {
  const { websocket, sse } = session.scenario;
  const samples: ServerSample[] =
    sse?.samples ?? (websocket?.sample ? [{ label: 'Sample', text: websocket.sample }] : []);
  const local = import.meta.env.DEV && sse?.local ? sse.local : undefined;

  const log = el('ol', { class: 'space-y-0.5 font-mono text-xs' });
  const logBox = el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [log]);
  const status = el('p', { class: 'text-sm text-base-content/70' });
  const button = (label: string, className: string, onClick: () => void) => {
    const element = el('button', { type: 'button', class: className }, [label]);
    element.addEventListener('click', onClick);
    return element;
  };
  const run = (command: string, argument?: string) => session.server?.run(command, argument);

  // The send box, with the scenario's samples to start from
  const frame = el('textarea', {
    class: 'textarea textarea-sm w-full font-mono text-xs',
    rows: '2',
    spellcheck: 'false',
    'aria-label': sse ? 'Text to write to the stream' : 'Frame to send to the client'
  });
  frame.value = samples[0]?.text ?? '';
  const sampleSelect =
    samples.length > 1
      ? el(
          'select',
          { class: 'select select-xs w-auto max-w-60', 'aria-label': 'Sample' },
          samples.map((sample, index) => el('option', { value: String(index) }, [sample.label]))
        )
      : undefined;
  sampleSelect?.addEventListener('change', () => {
    frame.value = samples[Number(sampleSelect.value)]?.text ?? '';
  });

  // SSE: end the stream and answer the next request with a status
  const statusSelect = el(
    'select',
    { class: 'select select-xs join-item w-16 shrink-0', 'aria-label': 'Status' },
    STATUSES.map(code => el('option', { value: code }, [code]))
  );
  statusSelect.value = '503';
  const retryAfter = el('input', {
    type: 'number',
    min: '0',
    max: '60',
    placeholder: 'Retry-After',
    class: 'input input-xs join-item w-24',
    'aria-label': 'Retry-After, in seconds (optional)'
  });

  // The server's controls: a send row, the text to send, then one wrapping row of compact buttons
  const simulated = el('div', { class: 'flex flex-col gap-2' }, [
    el('div', { class: 'flex flex-wrap items-center gap-1.5' }, [
      ...(sampleSelect ? [sampleSelect] : []),
      button(sse ? 'Write to the stream' : 'Send to the client', 'btn btn-xs btn-primary', () =>
        run('send', frame.value)
      ),
      ...(sse ? [button('Write it in two chunks', BUTTON.server, () => run('split', frame.value))] : [])
    ]),
    frame,
    el(
      'div',
      { class: 'flex flex-wrap items-center gap-1.5' },
      sse
        ? [
            button('Heartbeat', BUTTON.server, () => run('ping')),
            button('Go silent', BUTTON.server, () => run('silent')),
            button('End the stream', BUTTON.server, () => run('end')),
            button('Drop it', BUTTON.server, () => run('drop')),
            button('Refuse the next connection', BUTTON.server, () => run('refuse')),
            el(
              'div',
              {
                class: 'join',
                title:
                  'Restart ends the stream and answers the next request with that status (and Retry-After, in seconds)'
              },
              [
                statusSelect,
                retryAfter,
                button('Restart', `${BUTTON.server} join-item`, () =>
                  run('restart', `${statusSelect.value} ${retryAfter.value}`)
                )
              ]
            )
          ]
        : [
            button('Drop the connection', BUTTON.server, () => run('drop')),
            button('Refuse the next connection', BUTTON.server, () => run('refuse'))
          ]
    )
  ]);

  // Development only: the local server, the command that starts it, and whether it answers
  const localStatus = el('p', { class: 'text-sm' });
  const checkLocal = async () => {
    localStatus.textContent = 'Checking…';
    const result = await checkLocalServer();
    localStatus.textContent = result === 'answering' ? 'It answers on /events.' : `Not answering: ${result}.`;
  };
  const localPanel = local
    ? el('div', { class: 'flex flex-col gap-2' }, [
        el('p', { class: 'text-sm text-base-content/70' }, ['Start it from the repository, then Reset:']),
        el('code', { class: 'font-mono text-xs break-all rounded bg-base-200 p-2' }, [local.command]),
        localStatus,
        button('Check again', BUTTON.server, () => void checkLocal())
      ])
    : undefined;
  const showMode = () => {
    modeButtons.forEach((element, index) => {
      const active = (index === 1) === session.localServer;
      element.classList.toggle('btn-primary', active);
      element.setAttribute('aria-pressed', String(active));
    });
    simulated.classList.toggle('hidden', session.localServer);
    localPanel?.classList.toggle('hidden', !session.localServer);
  };
  const switchServer = async (useLocal: boolean) => {
    await onLocalServer(useLocal);
    showMode();
    if (useLocal) await checkLocal();
  };
  const modeButtons = local
    ? ['Simulated', 'Local server'].map((label, index) =>
        button(label, 'btn btn-xs join-item', () => void switchServer(index === 1))
      )
    : [];

  // A div, not a p: daisyUI's card-body makes every p inside it grow, which would split the log's space with it
  const legend = el(
    'div',
    { class: 'flex flex-wrap gap-x-4 text-xs text-base-content/70' },
    (['client', 'server', 'note'] as const).map(direction =>
      el('span', {}, [
        el('span', { class: DIRECTION[direction].className }, [DIRECTION[direction].mark]),
        ` ${DIRECTION[direction].label}`
      ])
    )
  );

  // The log is rebuilt only when it changed, and kept at its end unless the reader scrolled up
  let shown: { server: FakeServer | undefined; length: number } = { server: undefined, length: -1 };
  // Whether the log follows its end (see keepsFollowing); `reveal` scrolls there when its tab is shown again
  let following = true;
  const reveal = () => {
    if (following) logBox.scrollTop = logBox.scrollHeight;
  };
  const render = () => {
    const server = session.server;
    const wire = server?.wire ?? [];
    if (server !== shown.server || wire.length !== shown.length) {
      following = server !== shown.server || keepsFollowing(logBox, following);
      log.replaceChildren(
        ...wire.slice(-SHOWN).map(entry => {
          const direction = DIRECTION[entry.direction];
          return el('li', { class: 'flex gap-2' }, [
            el(
              'span',
              { class: `${direction.className} shrink-0`, title: direction.label, 'aria-label': direction.label },
              [direction.mark]
            ),
            el('span', { class: 'break-all whitespace-pre-wrap' }, [visible(entry.text)]),
            el('span', { class: 'shrink-0 text-base-content/70' }, [`${entry.at} ms`])
          ]);
        })
      );
      if (wire.length === 0) log.append(el('li', { class: 'text-base-content/70' }, ['Nothing on the wire yet.']));
      reveal();
      shown = { server, length: wire.length };
    }
    status.textContent = connectionStatus(server?.openConnections ?? 0, session.connectionStates());
  };

  // Top to bottom: which server and its connections, its controls, then the log, which takes the rest and scrolls
  const element = el('div', { class: 'flex min-h-0 flex-1 flex-col gap-3' }, [
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
      ...(local ? [el('div', { class: 'join', role: 'group', 'aria-label': 'Which server' }, modeButtons)] : []),
      status
    ]),
    simulated,
    ...(localPanel ? [localPanel] : []),
    legend,
    logBox
  ]);
  showMode();
  render();
  return { element, render, reveal };
}
