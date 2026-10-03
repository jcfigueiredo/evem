import { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import type { CodeEditor } from '../editor';
import { ScenarioSession, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { renderLaneChart } from '../playground/laneChart';
import { controlField, timelineItem } from '../playground/views';
import { scenarioPath } from '../routing';
import { isAtEnd, liveAnnouncement, sinceLatestAction, timelineRows } from '../timeline';

/**
 * A scenario in the showcase, compact: its controls, its actions, and what EvEm did in the latest one (or, for flow
 * control, the lane chart), with "Show code" (the code it runs, loaded on demand) and a link to the scenario in the
 * playground. It's the playground's own session, so the two pages can't disagree. It runs its first action once, to
 * start with something to see.
 */
export async function mountWidget(host: HTMLElement, scenario: Scenario): Promise<void> {
  const bus = new EvEm();
  const session = new ScenarioSession(scenario, bus);
  const prefix = `widget-${scenario.id}`;
  let busy = false;
  let lastInteraction = Number.NEGATIVE_INFINITY;

  const controls = el('div', { class: 'grid gap-x-3 sm:grid-cols-2' });
  const actions = el('div', { class: 'flex flex-wrap gap-2' });
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
  const output = scenario.lanes
    ? el('div', {})
    : el('div', { class: 'max-h-80 min-h-24 overflow-y-auto pe-2' }, [timeline]);
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  const codeHost = el('div', { class: 'hidden' });
  const codeButton = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false' }, [
    'Show code'
  ]);
  let editor: CodeEditor | undefined;

  let announced = 0;
  const render = () => {
    const entries = sinceLatestAction(session.trace.entries);
    const rows = timelineRows(entries);
    if (scenario.lanes) {
      renderLaneChart(output, laneChart(session.trace.entries));
    } else {
      const follow = isAtEnd(output);
      timeline.replaceChildren(...rows.map(timelineItem));
      if (rows.length === 0) {
        const first = session.actions[0];
        timeline.append(
          el('li', { class: 'ps-4 text-sm text-base-content/70' }, [
            first ? `Press “${first.label}” to see what EvEm does.` : 'Nothing yet.'
          ])
        );
      }
      if (follow) output.scrollTop = output.scrollHeight;
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
    if (busy) return;
    busy = true;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    announced = 0;
    try {
      await session.run(id);
    } finally {
      busy = false;
      for (const button of actions.querySelectorAll('button')) button.disabled = false;
    }
  };
  const renderActions = () => {
    actions.replaceChildren(
      ...session.actions.map((action, index) => {
        const button = el('button', { type: 'button', class: index === 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm' }, [
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
            busy = false;
            await session.setValue(name, value);
            editor?.setCode(session.code);
            renderActions();
            render();
          },
          prefix
        )
      )
    );
  };

  codeButton.addEventListener('click', async () => {
    const open = codeHost.classList.toggle('hidden') === false;
    codeButton.textContent = open ? 'Hide code' : 'Show code';
    codeButton.setAttribute('aria-expanded', String(open));
    if (open && !editor) {
      const { createEditor } = await import('../editor');
      editor = createEditor(codeHost, session.code, () => undefined);
    }
  });
  for (const type of ['click', 'change', 'keydown']) {
    host.addEventListener(type, () => {
      lastInteraction = performance.now();
    });
  }

  host.replaceChildren(
    el('div', { class: 'card border border-base-300 bg-base-100' }, [
      el('div', { class: 'card-body gap-3 p-4' }, [
        controls,
        actions,
        output,
        announcer,
        el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
          codeButton,
          el('a', { class: 'link link-primary text-sm', href: `./playground/${scenarioPath(scenario)}` }, [
            'Explore in the playground →'
          ])
        ]),
        codeHost
      ])
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
