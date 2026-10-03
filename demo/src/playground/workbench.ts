import type { EvEm } from '@jcfigueiredo/evem';
import { ActionGate } from '../actionGate';
import { el } from '../dom';
import { ScenarioSession, type Scenario } from '../engine/session';
import { laneChart } from '../lanes';
import { browserStorage } from '../theme';
import { keepsFollowing, liveAnnouncement, rowsFrom, setupSummary, timelineRows, unseenRows } from '../timeline';
import { renderLaneChart } from './laneChart';
import { GRID_ROWS, LAYOUTS, readCodeLayout, saveCodeLayout, type CodeLayout } from './layout';
import { serverPane } from './serverPane';
import { BUTTON, controlField, tabList, timelineItem, type Tab } from './views';

const CARD = 'card bg-base-100 border border-base-300';
const HEADING = 'text-xs uppercase tracking-widest text-base-content/70';

/**
 * Show a scenario in `root`, code beside output: on the left, the scenario's summary, controls and actions, with the
 * code right under them (its `// ▶` lines have run buttons); on the right, the output in tabs: what EvEm did (the
 * setup folded into one line), and for some scenarios the lane chart or the server. On wide screens both columns fill
 * the screen and scroll inside, so nothing pushes the code away from its controls. Expand gives the code the wide
 * column instead (remembered, see `layout.ts`). Returns a function that tears it down (subscriptions, editor,
 * connections).
 */
export async function mountWorkbench(root: HTMLElement, scenario: Scenario, bus: EvEm): Promise<() => void> {
  const session = new ScenarioSession(scenario, bus);
  // One action at a time; starting over (a control, Reset, edited code) frees the buttons from earlier runs
  const gate = new ActionGate();

  // What EvEm did: the setup folded away, then everything after it (from where the reader last cleared it)
  const setupList = el('ol', { class: 'relative ms-2 mt-2 space-y-1.5 border-s border-base-300' });
  const setupSummaryLine = el('summary', { class: 'cursor-pointer text-sm text-base-content/70' });
  const setupFold = el('details', { class: 'mb-3' }, [setupSummaryLine, setupList]);
  const timeline = el('ol', { class: 'relative ms-2 space-y-1.5 border-s border-base-300' });
  const timelineBox = el('div', { class: 'min-h-0 flex-1 overflow-y-auto pe-2' }, [setupFold, timeline]);
  const clearButton = el('button', { type: 'button', class: BUTTON.minorSmall }, ['Clear']);
  // The list is rebuilt on every render, so screen readers hear only what's new, from this status line
  const announcer = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  let announcedTrace = session.trace;
  let announcedRows = 0;
  // New rows are read out only after the reader did something (see liveAnnouncement)
  let lastInteraction = Number.NEGATIVE_INFINITY;
  const interacted = () => {
    lastInteraction = performance.now();
  };
  for (const type of ['click', 'change', 'keydown']) root.addEventListener(type, interacted);
  // The timeline follows new rows only for a reader at its end (and on a new trace, which starts at the top)
  let shownTrace = session.trace;
  // The first entry the timeline shows: after the setup, or after the reader cleared it
  let clearedFrom = 0;
  // Whether the timeline follows its end (see keepsFollowing)
  let followTimeline = true;

  const summary = el('p', { class: 'text-sm text-base-content/70' }, [
    scenario.summary,
    ' ',
    el('a', { class: 'link link-primary', href: scenario.docs, target: '_blank', rel: 'noopener' }, ['Docs ↗'])
  ]);
  const controls = el('fieldset', { class: 'grid gap-x-3 sm:grid-cols-2' });
  const actions = el('div', { class: 'flex flex-wrap gap-2' });
  const editedBadge = el('span', { class: 'badge badge-warning badge-sm hidden' }, ['edited']);
  const codeHost = el('div', { class: 'min-h-0 flex-1' });
  const editButton = el('button', { type: 'button', class: BUTTON.other }, ['Edit']);
  const runEditedButton = el('button', { type: 'button', class: `${BUTTON.main} hidden` }, ['Run edited code']);
  const resetButton = el('button', { type: 'button', class: BUTTON.minor }, ['Reset']);
  const layoutButton = el('button', { type: 'button', class: BUTTON.minor });
  const editingNote = el('p', { class: 'grow-0 text-sm text-warning hidden' }, [
    'The code is edited, so the controls are off. Run it with ⌘/Ctrl+Enter; Reset goes back to the controls.'
  ]);

  const restart = async (change: () => Promise<void>) => {
    gate.reset();
    clearedFrom = 0;
    await change();
    editor.setCode(session.code);
    // A run from before the reset may never end: the ▶ buttons are free again, like the action buttons
    editor.setRunsEnabled(true);
    renderActions();
    renderTimeline();
  };

  // The output's tabs: what EvEm did; the lane chart (flow control); the server (adapters)
  const lanesHost = scenario.lanes ? el('div', {}) : undefined;
  const server =
    scenario.websocket || scenario.sse
      ? serverPane(session, local => restart(() => session.useLocalServer(local)))
      : undefined;
  const timelinePanel = el('div', { class: 'flex min-h-0 flex-1 flex-col' }, [timelineBox]);
  const outputTabs: Tab[] = [
    { id: 'timeline', label: 'What EvEm did', panel: timelinePanel, scroller: timelineBox },
    ...(lanesHost
      ? [{ id: 'lanes', label: 'Over time', panel: el('div', { class: 'min-h-0 flex-1 overflow-auto' }, [lanesHost]) }]
      : []),
    ...(server
      ? [
          {
            id: 'server',
            label: 'Server',
            panel: el('div', { class: 'flex min-h-0 flex-1 flex-col' }, [server.element]),
            scroller: server.log
          }
        ]
      : [])
  ];
  // What each tab had the last time the reader looked at it, for the counts on the others
  const seen = { timeline: 0, server: 0 };
  const tabs = tabList(outputTabs, {
    label: 'Output',
    idPrefix: 'output',
    initial: scenario.lanes ? 'lanes' : 'timeline',
    onSelect: id => {
      clearButton.classList.toggle('invisible', id !== 'timeline');
      // A panel that grew while hidden couldn't scroll: one that was following its end goes there now it's shown
      if (id === 'timeline' && followTimeline) timelineBox.scrollTop = timelineBox.scrollHeight;
      if (id === 'server') server?.reveal();
      scheduleRender();
    }
  });

  // Clear empties the timeline, so it's there only on that tab
  clearButton.classList.toggle('invisible', tabs.selected() !== 'timeline');

  const renderTimeline = () => {
    const entries = session.trace.entries;
    const setupEnd = session.setupEnd;
    const from = Math.max(setupEnd, clearedFrom);
    const setupEntries = clearedFrom === 0 ? entries.slice(0, setupEnd) : [];
    const rows = rowsFrom(entries, from);
    followTimeline = session.trace !== shownTrace || keepsFollowing(timelineBox, followTimeline);
    shownTrace = session.trace;

    setupFold.hidden = setupEntries.length === 0;
    setupSummaryLine.textContent = setupSummary(setupEntries);
    setupList.replaceChildren(...timelineRows(setupEntries).map(timelineItem));
    timeline.replaceChildren(...rows.map(timelineItem));
    if (rows.length === 0) {
      const first = session.actions[0];
      timeline.append(
        el('li', { class: 'ps-4 text-sm text-base-content/60' }, [
          clearedFrom > 0
            ? 'Cleared: what EvEm does next shows here.'
            : first
              ? `Nothing yet: press “${first.label}”, or ▶ in the code.`
              : 'Nothing yet.'
        ])
      );
    }
    if (followTimeline) timelineBox.scrollTop = timelineBox.scrollHeight;
    if (lanesHost) renderLaneChart(lanesHost, laneChart(entries));
    server?.render();

    // Counts on the tabs the reader isn't looking at
    const wire = server ? (session.server?.wire.length ?? 0) : 0;
    if (tabs.selected() === 'timeline') seen.timeline = entries.length;
    if (tabs.selected() === 'server') seen.server = wire;
    tabs.setCount('timeline', unseenRows(entries.length, from, seen.timeline));
    if (server) tabs.setCount('server', wire - seen.server);

    // A new trace means the reader started over (a control, Reset, edited code): what it holds isn't news (seen is an
    // entry index, so the rest of a setup still running drops out once its end is known)
    if (session.trace !== announcedTrace) {
      announcedTrace = session.trace;
      seen.timeline = entries.length;
      seen.server = wire;
    } else if (rows.length > announcedRows) {
      const text = liveAnnouncement(rows.slice(announcedRows), performance.now() - lastInteraction);
      if (text !== undefined) announcer.textContent = text;
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

  clearButton.addEventListener('click', () => {
    clearedFrom = session.trace.entries.length;
    announcedRows = 0;
    renderTimeline();
  });

  const runAction = async (id: string) => {
    const token = gate.start();
    if (token === undefined) return;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    editor.setRunsEnabled(false);
    try {
      await session.run(id);
    } finally {
      if (gate.end(token)) {
        for (const button of actions.querySelectorAll('button')) button.disabled = false;
        editor.setRunsEnabled(true);
      }
    }
  };

  const renderActions = () => {
    actions.replaceChildren(
      ...session.actions.map((action, index) => {
        const button = el('button', { type: 'button', class: index === 0 ? BUTTON.main : BUTTON.other }, [
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
        controlField(name, control, session.values[name]!, value => restart(() => session.setValue(name, value)))
      )
    );
    controls.disabled = session.edited;
  };

  const { createEditor } = await import('../editor');
  const runEdited = () => restart(() => session.edit(editor.getCode()));
  // The ▶ in the code's margin runs the action with that line's label, like its button
  const editor = createEditor(codeHost, session.code, () => void runEdited(), {
    onRunAction: label => {
      const action = session.actions.find(candidate => candidate.label === label);
      if (action) void runAction(action.id);
    }
  });

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
  resetButton.addEventListener('click', () => {
    setEditing(false);
    void restart(() => session.restoreTemplate());
  });

  const scenarioCard = el('section', { 'aria-label': 'Scenario' }, [
    el('div', { class: 'card-body gap-3 p-4' }, [summary, controls, actions])
  ]);
  const outputCard = el('section', { 'aria-label': 'Output' }, [
    el('div', { class: 'card-body min-h-0 flex-1 gap-3 p-4' }, [
      el('div', { class: 'flex items-center justify-between gap-2' }, [tabs.element, clearButton]),
      ...outputTabs.map(tab => tab.panel),
      announcer
    ])
  ]);
  const codeCard = el('section', { 'aria-label': 'Code' }, [
    el('div', { class: 'card-body min-h-0 flex-1 gap-3 p-4' }, [
      el('div', { class: 'flex flex-wrap items-center gap-2' }, [
        // "Code", and on wider columns "Code that runs": the header stays on one line beside its buttons
        el('h2', { class: `${HEADING} me-auto` }, [
          'Code',
          el('span', { class: 'hidden xl:inline' }, [' that runs']),
          ' ',
          editedBadge
        ]),
        editButton,
        runEditedButton,
        resetButton,
        layoutButton
      ]),
      editingNote,
      codeHost
    ])
  ]);
  const grid = el('div', {}, [scenarioCard, outputCard, codeCard]);
  // The cards' places come from the layout; the code's own buttons say which one it is and switch to the other
  const applyLayout = (layout: CodeLayout) => {
    const classes = LAYOUTS[layout];
    grid.className = `grid min-h-0 flex-1 grid-cols-1 gap-4 ${GRID_ROWS} ${classes.grid}`;
    scenarioCard.className = `${CARD} ${classes.scenario}`;
    outputCard.className = `${CARD} ${classes.output}`;
    codeCard.className = `${CARD} ${classes.code}`;
    const wide = layout === 'wide';
    layoutButton.replaceChildren(
      el('span', { 'aria-hidden': 'true' }, [wide ? '⤡' : '⤢']),
      wide ? ' Shrink' : ' Expand'
    );
    layoutButton.title = wide
      ? 'Put the code back under the controls'
      : 'Give the code the wide column; the controls and the output move beside it';
  };
  let layout = readCodeLayout(browserStorage());
  applyLayout(layout);
  layoutButton.addEventListener('click', () => {
    layout = layout === 'wide' ? 'normal' : 'wide';
    saveCodeLayout(browserStorage(), layout);
    applyLayout(layout);
  });

  root.replaceChildren(
    el('header', { class: 'flex shrink-0 flex-wrap items-baseline gap-x-3' }, [
      el('p', { class: HEADING }, [scenario.group]),
      el('h1', { class: 'font-mono text-2xl font-bold tracking-tight' }, [scenario.title])
    ]),
    grid
  );

  await session.reset();
  renderControls();
  renderActions();
  renderTimeline();

  return () => {
    for (const type of ['click', 'change', 'keydown']) root.removeEventListener(type, interacted);
    bus.unsubscribeById(traceSubscription);
    bus.unsubscribeById(wireSubscription);
    resizes?.disconnect();
    editor.destroy();
    // Leaving the scenario ends its connections, which would otherwise keep reconnecting
    session.stop();
  };
}
