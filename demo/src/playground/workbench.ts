import type { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import type { ControlValue } from '../engine/program';
import { numberInput, ScenarioSession, type Control, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { announcement, timelineRows, type Tone } from '../timeline';
import { renderLaneChart } from './laneChart';
import { serverPane } from './serverPane';

// Full class names, so Tailwind finds them in the source
const TONE_CLASS: Record<Tone, string> = {
  primary: 'status-primary text-primary',
  neutral: 'bg-base-content/60 text-base-content/60',
  info: 'status-info text-info',
  success: 'status-success text-success',
  warning: 'status-warning text-warning',
  error: 'status-error text-error'
};

function controlField(
  name: string,
  control: Control,
  value: ControlValue,
  onChange: (value: ControlValue) => void
): HTMLElement {
  if (control.kind === 'toggle') {
    const input = el('input', { type: 'checkbox', class: 'toggle toggle-sm', name });
    input.checked = value === true;
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { class: 'label justify-between w-full py-1' }, [el('span', {}, [control.label]), input]);
  }
  if (control.kind === 'number') {
    const input = el('input', {
      type: 'number',
      class: 'input input-sm w-full',
      name,
      min: String(control.min),
      max: String(control.max),
      step: String(control.step ?? 1),
      value: String(value)
    });
    let current = Number(value);
    input.addEventListener('change', () => {
      const next = numberInput(input.value, control, current);
      input.value = String(next);
      if (next === current) return;
      current = next;
      onChange(next);
    });
    return el('fieldset', { class: 'fieldset py-1' }, [
      el('legend', { class: 'fieldset-legend' }, [control.label]),
      input
    ]);
  }
  if (control.kind === 'text') {
    const listId = `control-${name}-suggestions`;
    const input = el('input', {
      type: 'text',
      class: 'input input-sm w-full font-mono',
      name,
      value: String(value),
      list: listId,
      autocomplete: 'off',
      spellcheck: 'false'
    });
    // change fires on Enter and when the input loses focus, not on every key
    input.addEventListener('change', () => onChange(input.value));
    return el('fieldset', { class: 'fieldset py-1' }, [
      el('legend', { class: 'fieldset-legend' }, [control.label]),
      input,
      el(
        'datalist',
        { id: listId },
        (control.suggestions ?? []).map(suggestion => el('option', { value: suggestion }))
      )
    ]);
  }
  const select = el(
    'select',
    { class: 'select select-sm w-full', name },
    control.options.map(option => {
      const element = el('option', { value: JSON.stringify(option) }, [String(option)]);
      element.selected = option === value;
      return element;
    })
  );
  select.addEventListener('change', () => onChange(JSON.parse(select.value) as ControlValue));
  return el('fieldset', { class: 'fieldset py-1' }, [
    el('legend', { class: 'fieldset-legend' }, [control.label]),
    select
  ]);
}

/**
 * Show a scenario in `root`: its controls and actions, the timeline of what EvEm did, and the code that runs.
 * Returns a function that tears it down (subscriptions and editor).
 */
export async function mountWorkbench(root: HTMLElement, scenario: Scenario, bus: EvEm): Promise<() => void> {
  const session = new ScenarioSession(scenario, bus);
  let busy = false;
  // Bumped whenever the scenario starts over, so an action from before (one that never finishes, say) can't leave
  // the new action buttons disabled
  let generation = 0;
  const startOver = () => {
    generation++;
    busy = false;
  };

  const timeline = el('ol', { class: 'relative ms-2 border-s border-base-300 space-y-1.5' });
  // The list is rebuilt on every render, so screen readers hear only what's new, from this status line
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  let announcedTrace = session.trace;
  let announcedRows = 0;
  const timelineBox = el('div', { class: 'max-h-[26rem] overflow-y-auto pe-2' }, [timeline]);
  const controls = el('fieldset', { class: 'space-y-1' });
  const actions = el('div', { class: 'flex flex-wrap gap-2 pt-2' });
  const editedBadge = el('span', { class: 'badge badge-warning badge-sm hidden' }, ['edited']);
  const codeHost = el('div', { class: 'min-h-24' });
  const editButton = el('button', { type: 'button', class: 'btn btn-sm' }, ['Edit']);
  const runEditedButton = el('button', { type: 'button', class: 'btn btn-sm hidden' }, ['Run edited code']);
  const resetButton = el('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, ['Reset']);
  const editingNote = el('p', { class: 'text-sm text-warning hidden' }, [
    'The code is edited, so the controls are off. Run it with ⌘/Ctrl+Enter; Reset goes back to the controls.'
  ]);

  // Flow control scenarios show the latest action over time too
  const lanesHost = scenario.lanes ? el('div', {}) : undefined;
  // Adapter scenarios show their fake server: the wire log, and controls
  const server = scenario.websocket ? serverPane(session, scenario.websocket.sample ?? '') : undefined;

  const renderTimeline = () => {
    const rows = timelineRows(session.trace.entries);
    timeline.replaceChildren(
      ...rows.map(row =>
        el('li', { class: 'relative ps-4', style: `margin-inline-start: ${row.depth * 1.25}rem` }, [
          el('span', {
            class: `status ${TONE_CLASS[row.tone]} absolute -start-[0.3rem] top-[0.45rem] signal-glow`,
            'aria-hidden': 'true'
          }),
          el('span', { class: 'font-mono text-sm break-words whitespace-pre-wrap' }, [row.text]),
          row.detail
            ? el('span', { class: 'font-mono text-xs text-base-content/60 ms-2 break-all' }, [row.detail])
            : null,
          el('span', { class: 'text-xs text-base-content/60 ms-2' }, [`${row.at} ms`])
        ])
      )
    );
    if (rows.length === 0) {
      timeline.append(el('li', { class: 'ps-4 text-sm text-base-content/60' }, ['Nothing yet: run an action.']));
    }
    timelineBox.scrollTop = timelineBox.scrollHeight;
    if (lanesHost) renderLaneChart(lanesHost, laneChart(session.trace.entries));
    server?.render();
    // A new trace means the reader started over (a control, Reset, edited code): its setup isn't announced
    if (session.trace !== announcedTrace) {
      announcedTrace = session.trace;
    } else if (rows.length > announcedRows) {
      announcer.textContent = announcement(rows.slice(announcedRows));
    }
    announcedRows = rows.length;
  };
  let pending = false;
  const scheduleRender = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      renderTimeline();
    });
  };
  const traceSubscription = bus.subscribe('trace.entry', scheduleRender);
  const wireSubscription = bus.subscribe('wire.entry', scheduleRender);
  // The chart's tick labels depend on its width: draw it again when that changes
  const resizes = lanesHost ? new ResizeObserver(() => scheduleRender()) : undefined;
  if (lanesHost) resizes?.observe(lanesHost);

  const runAction = async (id: string) => {
    if (busy) return;
    const started = generation;
    busy = true;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    try {
      await session.run(id);
    } finally {
      if (generation === started) {
        busy = false;
        for (const button of actions.querySelectorAll('button')) button.disabled = false;
      }
    }
  };

  const renderActions = () => {
    actions.replaceChildren(
      ...session.actions.map((action, index) => {
        const button = el('button', { type: 'button', class: index === 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm' }, [
          action.label
        ]);
        button.addEventListener('click', () => void runAction(action.id));
        return button;
      })
    );
  };

  const renderControls = () => {
    controls.replaceChildren(
      ...Object.entries(scenario.controls).map(([name, control]) =>
        controlField(name, control, session.values[name]!, async value => {
          startOver();
          await session.setValue(name, value);
          editor.setCode(session.code);
          renderActions();
          renderTimeline();
        })
      )
    );
    controls.disabled = session.edited;
  };

  const { createEditor } = await import('../editor');
  const runEdited = async () => {
    startOver();
    await session.edit(editor.getCode());
    renderActions();
    renderTimeline();
  };
  const editor = createEditor(codeHost, session.code, () => void runEdited());

  const setEditing = (editing: boolean) => {
    editor.setEditable(editing);
    editButton.classList.toggle('hidden', editing);
    runEditedButton.classList.toggle('hidden', !editing);
    editingNote.classList.toggle('hidden', !editing);
    editedBadge.classList.toggle('hidden', !editing);
    controls.disabled = editing;
    if (editing) editor.focus();
  };
  editButton.addEventListener('click', () => setEditing(true));
  runEditedButton.addEventListener('click', () => void runEdited());
  resetButton.addEventListener('click', async () => {
    setEditing(false);
    startOver();
    await session.restoreTemplate();
    editor.setCode(session.code);
    renderActions();
    renderTimeline();
  });

  root.replaceChildren(
    el('header', { class: 'mb-6' }, [
      el('p', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, [scenario.group]),
      el('h1', { class: 'font-mono text-3xl font-bold tracking-tight' }, [scenario.title]),
      el('p', { class: 'mt-2 text-base-content/70 max-w-prose' }, [
        scenario.summary,
        ' ',
        el('a', { class: 'link link-primary', href: scenario.docs, target: '_blank', rel: 'noopener' }, ['Docs ↗'])
      ])
    ]),
    el('div', { class: 'grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]' }, [
      el('section', { class: 'card bg-base-100 border border-base-300', 'aria-label': 'Scenario' }, [
        el('div', { class: 'card-body p-4 gap-2' }, [
          el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, ['Scenario']),
          controls,
          actions
        ])
      ]),
      el('section', { class: 'card bg-base-100 border border-base-300', 'aria-label': 'What EvEm did' }, [
        el('div', { class: 'card-body p-4 gap-3' }, [
          el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, ['What EvEm did']),
          timelineBox,
          announcer
        ])
      ])
    ]),
    ...(lanesHost
      ? [
          el('section', { class: 'card bg-base-100 border border-base-300 mt-4', 'aria-label': 'Over time' }, [
            el('div', { class: 'card-body p-4 gap-3' }, [
              el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, ['Over time']),
              lanesHost
            ])
          ])
        ]
      : []),
    ...(server
      ? [
          el('section', { class: 'card bg-base-100 border border-base-300 mt-4', 'aria-label': 'Server' }, [
            el('div', { class: 'card-body p-4 gap-3' }, [
              el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70' }, ['Server']),
              server.element
            ])
          ])
        ]
      : []),
    el('section', { class: 'card bg-base-100 border border-base-300 mt-4', 'aria-label': 'Code' }, [
      el('div', { class: 'card-body p-4 gap-3' }, [
        el('div', { class: 'flex flex-wrap items-center gap-2' }, [
          el('h2', { class: 'text-xs uppercase tracking-widest text-base-content/70 me-auto' }, [
            'Code that runs ',
            editedBadge
          ]),
          editButton,
          runEditedButton,
          resetButton
        ]),
        editingNote,
        codeHost
      ])
    ])
  );

  await session.reset();
  renderControls();
  renderActions();
  renderTimeline();

  return () => {
    bus.unsubscribeById(traceSubscription);
    bus.unsubscribeById(wireSubscription);
    resizes?.disconnect();
    editor.destroy();
    // Leaving the scenario ends its connections, which would otherwise keep reconnecting
    session.stop();
  };
}
