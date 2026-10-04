import { EvEm } from '@jcfigueiredo/evem';
import { ActionGate } from '../actionGate';
import { el } from '../dom';
import type { CodeEditor } from '../editor';
import { ScenarioSession, type Scenario } from '../engine/session';
import type { TraceEntry } from '../engine/trace';
import { laneChart } from '../lanes';
import { renderLaneChart } from '../playground/laneChart';
import {
  actionControls,
  BUTTON,
  controlField,
  groupItems,
  replaceKeepingFocus,
  restoreFocus,
  tabList,
  wireItem,
  type Tab
} from '../playground/views';
import { scenarioPath } from '../routing';
import {
  groupRuns,
  keepsFollowingTop,
  latestConnectionState,
  liveAnnouncement,
  sinceLatestAction,
  timelineRows
} from '../timeline';

/**
 * The height of a widget, which its slot in index.html reserves (as a card of the same size) until it mounts: a
 * widget coming in, or its output growing, never moves the page. Taller on phones, where the controls and the
 * buttons wrap onto more lines and would leave the output little room.
 */
export const WIDGET_HEIGHT = 'h-[36rem] sm:h-[32rem]';

/** How many wire lines an adapter's card keeps */
const WIRE_SHOWN = 100;

/** How many of its stream's entries an adapter's card shows: a card left open for hours renders as fast as a new one */
export const OUTPUT_SHOWN = 150;

/** Whether a scenario talks to a server: an adapter's card, with its stream, its wire and the server's controls */
const isAdapter = (scenario: Scenario) => Boolean(scenario.websocket || scenario.sse);

/**
 * The entries a widget shows: a feature's latest action; an adapter's stream after its setup (its latest
 * `OUTPUT_SHOWN` entries), since a stream doesn't wait for a button
 */
export function widgetEntries(scenario: Scenario, entries: readonly TraceEntry[], setupEnd: number): TraceEntry[] {
  return isAdapter(scenario)
    ? entries.slice(Math.max(setupEnd, entries.length - OUTPUT_SHOWN))
    : sinceLatestAction(entries);
}

/** The server's controls an adapter's card offers (a command for its server's `run`); none for a feature */
export function serverControls(scenario: Scenario): Array<{ label: string; command: string }> {
  if (scenario.websocket) return [{ label: 'Drop the connection', command: 'drop' }];
  if (scenario.sse) return [{ label: 'Drop the stream', command: 'drop' }];
  return [];
}

/**
 * A scenario in the showcase, compact: its controls, its actions, and Output and Code tabs: what EvEm did in the
 * latest action (or, for flow control, the lane chart), and the code it runs (loaded the first time it's shown), with
 * a link to the scenario in the playground. It fills its slot, whose height is fixed; the output scrolls inside. It's
 * the playground's own session, so the two pages can't disagree. It runs its first action at the start, and again
 * when a control changes, so the output always matches the controls. An adapter's card (a scenario with a server)
 * shows its stream from the start instead, with the server's controls (drop the connection) and a Wire tab.
 */
export async function mountWidget(host: HTMLElement, scenario: Scenario): Promise<void> {
  const bus = new EvEm();
  const session = new ScenarioSession(scenario, bus);
  const prefix = `widget-${scenario.id}`;
  // A run from before a control changed must not free the buttons while a newer run holds them
  const gate = new ActionGate();
  let lastInteraction = Number.NEGATIVE_INFINITY;
  /** The reader did something the output follows from (see liveAnnouncement) */
  const acted = () => {
    lastInteraction = performance.now();
  };

  // Two columns even on phones, where stacked controls would leave the output little room
  const controls = el('div', { class: 'grid grid-cols-2 gap-x-3' });
  const actions = el('div', { class: 'flex flex-wrap gap-2' });
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
  const output = scenario.lanes
    ? el('div', { class: 'min-h-0 flex-1 overflow-auto' })
    : el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [timeline]);
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  const codeHost = el('div', { class: 'min-h-0 flex-1' });
  const adapter = isAdapter(scenario);
  const wire = el('ol', { class: 'space-y-1 font-mono text-xs' });
  const wireBox = el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [wire]);
  // The editor loads on demand, once, however quickly the Code tab is pressed
  let editor: Promise<CodeEditor> | undefined;
  const showCode = () =>
    (editor ??= import('../editor')
      .then(({ createEditor }) =>
        createEditor(codeHost, session.code, () => undefined, {
          // The ▶ in the code's margin runs that action, and shows its output
          onRunAction: label => {
            const action = session.actions.find(candidate => candidate.label === label);
            if (!action) return;
            tabs.select('output');
            void run(action.id);
          }
        })
      )
      .then(view => {
        // Opened during a run, its ▶ buttons start disabled, like the action buttons
        view.setRunsEnabled(!gate.busy);
        return view;
      }));
  // Output and code take turns in the card, whose height is fixed
  const tabs = tabList(
    [
      { id: 'output', label: 'Output', panel: output },
      ...(adapter ? [{ id: 'wire', label: 'Wire', panel: wireBox } satisfies Tab] : []),
      { id: 'code', label: 'Code', panel: codeHost }
    ],
    {
      label: `${scenario.title}: ${adapter ? 'output, wire or code' : 'output or code'}`,
      idPrefix: prefix,
      onSelect: id => {
        if (id === 'code') void showCode();
        // Rows that came while another tab was shown couldn't scroll the hidden panel: it follows its end now
        else if (id === 'wire' && followingWire) wireBox.scrollTop = 0;
        else if (id === 'output' && following) output.scrollTop = 0;
      }
    }
  );
  // Whether the output and the wire follow their top, where the newest is (see keepsFollowingTop)
  let following = true;
  let followingWire = true;

  let announced = 0;
  // An adapter's card announces by trace entry, not by row: its rows stop growing at OUTPUT_SHOWN
  let announcedTrace: unknown;
  let announcedEntries = 0;
  let wireShown: { server: unknown; length: number } = { server: undefined, length: -1 };
  // Which folds the reader opened or closed, per trace (a control's change starts a new one); see groupItems
  const folds = new Map<string, boolean>();
  let traces = 0;
  let foldedTrace: unknown;
  const render = () => {
    if (session.trace !== foldedTrace) {
      foldedTrace = session.trace;
      traces++;
    }
    const entries = widgetEntries(scenario, session.trace.entries, session.setupEnd);
    const rows = timelineRows(entries);
    if (scenario.lanes) {
      renderLaneChart(output, laneChart(session.trace.entries));
    } else {
      // Newest first, like the playground: what's added goes above, so a reader who scrolled down keeps their place
      following = keepsFollowingTop(output, following);
      const fromBottom = output.scrollHeight - output.scrollTop;
      replaceKeepingFocus(timeline, groupItems(groupRuns(rows, session.trace.runs), folds, String(traces)));
      if (rows.length === 0) {
        const first = session.actions[0];
        timeline.append(
          el('li', { class: 'ps-4 text-sm text-base-content/70' }, [
            first ? `Press “${first.label}” to see what EvEm does.` : 'Nothing yet.'
          ])
        );
      }
      output.scrollTop = following ? 0 : output.scrollHeight - fromBottom;
    }
    // The wire is rebuilt only when it grew, or the scenario started over with a new server
    const lines = session.server?.wire ?? [];
    if (adapter && (session.server !== wireShown.server || lines.length !== wireShown.length)) {
      followingWire = keepsFollowingTop(wireBox, followingWire);
      const fromBottom = wireBox.scrollHeight - wireBox.scrollTop;
      wire.replaceChildren(...lines.slice(-WIRE_SHOWN).reverse().map(wireItem));
      wireBox.scrollTop = followingWire ? 0 : wireBox.scrollHeight - fromBottom;
      wireShown = { server: session.server, length: lines.length };
    }
    refreshSwitches();
    if (adapter) announceStream();
    else if (rows.length > announced) {
      const text = liveAnnouncement(rows.slice(announced), performance.now() - lastInteraction);
      if (text !== undefined) announcer.textContent = text;
    }
    announced = rows.length;
  };
  /**
   * A stream never stops, so an adapter's card says once what followed the reader's click, not every tick after it;
   * and when its connection changes (a drop, the reconnect), it says so, click or not
   */
  const announceStream = () => {
    const all = session.trace.entries;
    if (session.trace !== announcedTrace) {
      announcedTrace = session.trace;
      announcedEntries = 0;
    }
    const fresh = all.slice(Math.max(announcedEntries, session.setupEnd));
    announcedEntries = all.length;
    if (fresh.length === 0) return;
    const text = liveAnnouncement(timelineRows(fresh), performance.now() - lastInteraction);
    if (text !== undefined) {
      announcer.textContent = text;
      lastInteraction = Number.NEGATIVE_INFINITY;
      return;
    }
    const state = latestConnectionState(fresh);
    if (state !== undefined) announcer.textContent = `Connection: ${state}.`;
  };
  // One render per frame, however many entries, wire lines or resizes came in it
  let pending = false;
  const scheduleRender = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      render();
    });
  };
  bus.subscribe('trace.entry', scheduleRender);
  if (adapter) bus.subscribe('wire.entry', scheduleRender);
  if (scenario.lanes) new ResizeObserver(scheduleRender).observe(output);

  const run = async (id: string) => {
    const token = gate.start();
    if (token === undefined) return;
    acted();
    // Disabling the control the reader used drops keyboard focus: it goes back there after the run
    const focused = document.activeElement;
    for (const control of actions.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      'button:not([data-server-control]), input'
    ))
      control.disabled = true;
    void editor?.then(view => view.setRunsEnabled(false));
    if (!adapter) announced = 0;
    try {
      await session.run(id);
    } finally {
      if (gate.end(token)) {
        for (const control of actions.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
          'button:not([data-server-control]), input'
        ))
          control.disabled = false;
        void editor?.then(view => view.setRunsEnabled(true));
        restoreFocus(focused);
      }
    }
  };
  // The switches show what EvEm did, so they're refreshed with the output (see actionControls)
  let refreshSwitches = () => {};
  const renderActions = () => {
    const { buttons, switches, refresh } = actionControls(scenario, session.actions, run, () => session.trace.entries);
    refreshSwitches = refresh;
    actions.replaceChildren(
      ...buttons,
      // The server's own controls act on whichever server the session has now, outside the action buttons' gate
      ...serverControls(scenario).map(({ label, command }) => {
        const button = el('button', { type: 'button', class: BUTTON.other, 'data-server-control': '' }, [label]);
        button.addEventListener('click', () => {
          acted();
          session.server?.run(command);
        });
        return button;
      }),
      ...(switches ? [switches] : [])
    );
  };
  const renderControls = () => {
    controls.replaceChildren(
      ...Object.entries(scenario.controls).map(([name, control]) =>
        controlField(
          name,
          control,
          session.values[name]!,
          async value => {
            acted();
            gate.reset();
            await session.setValue(name, value);
            void editor?.then(view => {
              view.setCode(session.code);
              view.setRunsEnabled(true);
            });
            renderActions();
            announced = 0;
            render();
            // The output always matches the controls: a feature runs its first action again (an adapter's stream
            // starts over by itself)
            const first = session.actions[0];
            if (first && !adapter) await run(first.id);
          },
          prefix,
          // The card's height is fixed: its controls' hints are tooltips (and read by screen readers)
          false
        )
      )
    );
  };

  // A feature card's output only changes when an action runs, so any click or key in it counts. An adapter's stream
  // never stops: there only what acts counts (an action, a server control, a control change, above), or moving
  // through the card with Tab would have the next tick read out
  if (!adapter) for (const type of ['click', 'change', 'keydown']) host.addEventListener(type, acted);

  // The slot is the card; the widget fills it
  host.replaceChildren(
    el('div', { class: 'card-body h-full min-h-0 gap-3 p-4' }, [
      controls,
      actions,
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        tabs.element,
        // Short on phones, so the link stays on the tabs' row
        el('a', { class: 'link link-primary text-sm', href: `./playground/${scenarioPath(scenario)}` }, [
          el('span', { class: 'hidden sm:inline' }, ['Explore in the playground →']),
          el('span', { class: 'sm:hidden' }, ['Playground →'])
        ])
      ]),
      output,
      // Only an adapter's card has a Wire tab; elsewhere its panel would be an empty box taking half the room
      ...(adapter ? [wireBox] : []),
      codeHost,
      announcer
    ])
  );

  await session.reset();
  renderControls();
  renderActions();
  render();
  // Something to see from the start: a feature's first action, once (an adapter's stream is already running)
  const first = session.actions[0];
  if (first && !adapter) await run(first.id);
}
