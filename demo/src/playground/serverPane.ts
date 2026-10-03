import { el } from '../dom';
import type { ScenarioSession } from '../engine/session';
import type { WireEntry } from '../fakes/webSocketServer';

// Full class names, so Tailwind finds them in the source
const DIRECTION: Record<WireEntry['direction'], { mark: string; label: string; className: string }> = {
  client: { mark: '→', label: 'client sent', className: 'text-info' },
  server: { mark: '←', label: 'server sent', className: 'text-success' },
  note: { mark: '·', label: 'connection', className: 'text-base-content/70' }
};

/** How many wire lines the pane keeps on screen */
const SHOWN = 200;

/**
 * The scenario's fake server, as a card: its wire log (frames each way, and what happened to connections) and controls
 * to send a frame to the client, drop the connection or refuse the next one. The controls act on the session's
 * current server, so they keep working when the scenario starts over; `render()` redraws the log.
 */
export function serverPane(session: ScenarioSession, sample: string): { element: HTMLElement; render: () => void } {
  const log = el('ol', { class: 'space-y-0.5 font-mono text-xs' });
  const logBox = el('div', { class: 'max-h-64 overflow-y-auto pe-2' }, [log]);
  const status = el('p', { class: 'text-sm text-base-content/70' });
  const frame = el('textarea', {
    class: 'textarea textarea-sm w-full font-mono text-xs',
    rows: '4',
    spellcheck: 'false',
    'aria-label': 'Frame to send to the client'
  });
  frame.value = sample;
  const button = (label: string, className: string, onClick: () => void) => {
    const element = el('button', { type: 'button', class: className }, [label]);
    element.addEventListener('click', onClick);
    return element;
  };

  const render = () => {
    const wire = session.server?.wire ?? [];
    log.replaceChildren(
      ...wire.slice(-SHOWN).map(entry => {
        const direction = DIRECTION[entry.direction];
        return el('li', { class: 'flex gap-2' }, [
          el(
            'span',
            { class: `${direction.className} shrink-0`, title: direction.label, 'aria-label': direction.label },
            [direction.mark]
          ),
          el('span', { class: 'break-all' }, [entry.text]),
          el('span', { class: 'shrink-0 text-base-content/70' }, [`${entry.at} ms`])
        ]);
      })
    );
    if (wire.length === 0) log.append(el('li', { class: 'text-base-content/70' }, ['Nothing on the wire yet.']));
    logBox.scrollTop = logBox.scrollHeight;
    const open = session.server?.openConnections ?? 0;
    status.textContent = `${open} open connection${open === 1 ? '' : 's'}`;
  };

  const legend = el(
    'p',
    { class: 'mb-2 flex flex-wrap gap-x-4 text-xs text-base-content/70' },
    (['client', 'server', 'note'] as const).map(direction =>
      el('span', {}, [
        el('span', { class: DIRECTION[direction].className }, [DIRECTION[direction].mark]),
        ` ${DIRECTION[direction].label}`
      ])
    )
  );

  const element = el('div', { class: 'grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]' }, [
    el('div', { class: 'min-w-0' }, [legend, logBox]),
    el('div', { class: 'flex flex-col gap-2' }, [
      status,
      frame,
      button('Send to the client', 'btn btn-sm btn-primary', () => session.server?.send(frame.value)),
      button('Drop the connection', 'btn btn-sm', () => session.server?.drop()),
      button('Refuse the next connection', 'btn btn-sm', () => session.server?.refuseNext())
    ])
  ]);
  render();
  return { element, render };
}
