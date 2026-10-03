import { EvEm } from '@jcfigueiredo/evem';
import { ActionGate } from '../actionGate';
import { el } from '../dom';
import type { CodeEditor } from '../editor';
import { ScenarioSession, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { renderLaneChart } from '../playground/laneChart';
import { BUTTON, controlField, tabList, timelineItem } from '../playground/views';
import { scenarioPath } from '../routing';
import { keepsFollowing, liveAnnouncement, sinceLatestAction, timelineRows } from '../timeline';

/**
 * The height of a widget, which its slot in index.html reserves (as a card of the same size) until it mounts: a
 * widget coming in, or its output growing, never moves the page
 */
export const WIDGET_HEIGHT = 'h-[32rem]';

/**
 * A scenario in the showcase, compact: its controls, its actions, and Output and Code tabs: what EvEm did in the
 * latest action (or, for flow control, the lane chart), and the code it runs (loaded the first time it's shown), with
 * a link to the scenario in the playground. It fills its slot, whose height is fixed; the output scrolls inside. It's
 * the playground's own session, so the two pages can't disagree. It runs its first action at the start, and again
 * when a control changes, so the output always matches the controls.
 */
export async function mountWidget(host: HTMLElement, scenario: Scenario): Promise<void> {
  const bus = new EvEm();
  const session = new ScenarioSession(scenario, bus);
  const prefix = `widget-${scenario.id}`;
  // A run from before a control changed must not free the buttons while a newer run holds them
  const gate = new ActionGate();
  let lastInteraction = Number.NEGATIVE_INFINITY;

  const controls = el('div', { class: 'grid gap-x-3 sm:grid-cols-2' });
  const actions = el('div', { class: 'flex flex-wrap gap-2' });
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
  const output = scenario.lanes
    ? el('div', { class: 'min-h-0 flex-1 overflow-auto' })
    : el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [timeline]);
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  const codeHost = el('div', { class: 'min-h-0 flex-1' });
  // The editor loads on demand, once, however quickly the Code tab is pressed
  let editor: Promise<CodeEditor> | undefined;
  const showCode = () =>
    (editor ??= import('../editor').then(({ createEditor }) =>
      createEditor(codeHost, session.code, () => undefined, {
        // The ▶ in the code's margin runs that action, and shows its output
        onRunAction: label => {
          const action = session.actions.find(candidate => candidate.label === label);
          if (!action) return;
          tabs.select('output');
          void run(action.id);
        }
      })
    ));
  // Output and code take turns in the card, whose height is fixed
  const tabs = tabList(
    [
      { id: 'output', label: 'Output', panel: output },
      { id: 'code', label: 'Code', panel: codeHost }
    ],
    {
      label: `${scenario.title}: output or code`,
      idPrefix: prefix,
      onSelect: id => {
        if (id === 'code') void showCode();
        // Rows that came while the code was shown couldn't scroll the hidden output: it follows its end now
        else if (following) output.scrollTop = output.scrollHeight;
      }
    }
  );
  // Whether the output follows its end (see keepsFollowing)
  let following = true;

  let announced = 0;
  const render = () => {
    const entries = sinceLatestAction(session.trace.entries);
    const rows = timelineRows(entries);
    if (scenario.lanes) {
      renderLaneChart(output, laneChart(session.trace.entries));
    } else {
      following = keepsFollowing(output, following);
      timeline.replaceChildren(...rows.map(timelineItem));
      if (rows.length === 0) {
        const first = session.actions[0];
        timeline.append(
          el('li', { class: 'ps-4 text-sm text-base-content/70' }, [
            first ? `Press “${first.label}” to see what EvEm does.` : 'Nothing yet.'
          ])
        );
      }
      if (following) output.scrollTop = output.scrollHeight;
    }
    if (rows.length > announced) {
      const text = liveAnnouncement(rows.slice(announced), performance.now() - lastInteraction);
      if (text !== undefined) announcer.textContent = text;
    }
    announced = rows.length;
  };
  let pending = false;
  bus.subscribe('trace.entry', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      render();
    });
  });
  if (scenario.lanes) new ResizeObserver(() => render()).observe(output);

  const run = async (id: string) => {
    const token = gate.start();
    if (token === undefined) return;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    announced = 0;
    try {
      await session.run(id);
    } finally {
      if (gate.end(token)) for (const button of actions.querySelectorAll('button')) button.disabled = false;
    }
  };
  const renderActions = () => {
    actions.replaceChildren(
      ...session.actions.map((action, index) => {
        const button = el('button', { type: 'button', class: index === 0 ? BUTTON.main : BUTTON.other }, [
          action.label
        ]);
        button.addEventListener('click', () => void run(action.id));
        return button;
      })
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
            gate.reset();
            await session.setValue(name, value);
            void editor?.then(view => view.setCode(session.code));
            renderActions();
            render();
            // The output always matches the controls: run the first action again
            const first = session.actions[0];
            if (first) await run(first.id);
          },
          prefix
        )
      )
    );
  };

  for (const type of ['click', 'change', 'keydown']) {
    host.addEventListener(type, () => {
      lastInteraction = performance.now();
    });
  }

  // The slot is the card; the widget fills it
  host.replaceChildren(
    el('div', { class: 'card-body h-full min-h-0 gap-3 p-4' }, [
      controls,
      actions,
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        tabs.element,
        el('a', { class: 'link link-primary text-sm', href: `./playground/${scenarioPath(scenario)}` }, [
          'Explore in the playground →'
        ])
      ]),
      output,
      codeHost,
      announcer
    ])
  );

  await session.reset();
  renderControls();
  renderActions();
  render();
  // Something to see from the start: the first action, once
  const first = session.actions[0];
  if (first) await run(first.id);
}
