import { el } from '../dom';
import type { ControlValue } from '../engine/program';
import { numberInput, optionLabel, type Control } from '../engine/session';
import type { WireEntry } from '../fakes/wire';
import type { TimelineRow, Tone } from '../timeline';

// Full class names, so Tailwind finds them in the source
const TONE_CLASS: Record<Tone, string> = {
  primary: 'status-primary text-primary',
  neutral: 'bg-base-content/60 text-base-content/60',
  info: 'status-info text-info',
  success: 'status-success text-success',
  warning: 'status-warning text-warning',
  error: 'status-error text-error'
};

/**
 * A control's field: a toggle, a number, a text input with suggestions, or a select. `idPrefix` keeps the ids of
 * suggestion lists apart when several scenarios share a page (the showcase)
 */
export function controlField(
  name: string,
  control: Control,
  value: ControlValue,
  onChange: (value: ControlValue) => void,
  idPrefix = 'control'
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
    const listId = `${idPrefix}-${name}-suggestions`;
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
      const element = el('option', { value: JSON.stringify(option) }, [optionLabel(option)]);
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
 * The buttons' looks, in one place: the main action (`btn-primary`), the other actions (`btn-soft`, which reads as a
 * button in both themes: plain `btn` is nearly the card's own color in Signal), minor ones (`btn-ghost`), and the
 * Server tab's compact controls
 */
export const BUTTON = {
  main: 'btn btn-sm btn-primary',
  other: 'btn btn-sm btn-soft',
  minor: 'btn btn-sm btn-ghost',
  server: 'btn btn-xs btn-soft'
} as const;

/** A row's time: an action's start since the scenario started; anything after an action, since that action */
function timeOf(row: TimelineRow): string {
  if (row.kind === 'action' || row.since === undefined) return `${row.at} ms`;
  return `+${row.since} ms`;
}

/**
 * One timeline row: a status dot in its tone, the text, its detail (data, in short) and its time. What the code
 * logged (a plain log) reads as console output, set apart from EvEm's own steps.
 */
export function timelineItem(row: TimelineRow): HTMLElement {
  const indent = `margin-inline-start: ${row.depth * 1.25}rem`;
  const time = el('span', { class: 'text-xs text-base-content/60 ms-2' }, [timeOf(row)]);
  if (row.kind === 'log' && row.tone === 'neutral') {
    return el('li', { class: 'relative ps-4', style: indent }, [
      el(
        'span',
        { class: 'absolute -start-[0.3rem] top-0 font-mono text-sm text-base-content/70', 'aria-hidden': 'true' },
        ['›']
      ),
      el('span', { class: 'rounded bg-base-200 px-1.5 py-0.5 font-mono text-sm break-words whitespace-pre-wrap' }, [
        row.text
      ]),
      time
    ]);
  }
  return el('li', { class: 'relative ps-4', style: indent }, [
    el('span', {
      class: `status ${TONE_CLASS[row.tone]} absolute -start-[0.3rem] top-[0.45rem] signal-glow`,
      'aria-hidden': 'true'
    }),
    el('span', { class: 'font-mono text-sm break-words whitespace-pre-wrap' }, [row.text]),
    row.detail ? el('span', { class: 'font-mono text-xs text-base-content/60 ms-2 break-all' }, [row.detail]) : null,
    time
  ]);
}

/**
 * The tab a key moves to, in a list of `count` tabs where the one at `index` has focus: the arrow keys go to the next
 * or previous one, wrapping around, Home to the first and End to the last (the WAI-ARIA tabs pattern); undefined for
 * any other key
 */
export function tabAfterKey(count: number, index: number, key: string): number | undefined {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/** One tab of a tab list, and the panel it shows */
export interface Tab {
  id: string;
  label: string;
  panel: HTMLElement;
}

/**
 * daisyUI tabs (`tabs-border`) over panels, following the WAI-ARIA tabs pattern: the arrow keys (and Home, End) move
 * between tabs, the selected tab is `aria-selected`, and each panel is labelled by its tab. `setCount` shows a badge
 * with what's new on a tab that isn't selected (0 hides it); `onSelect` hears every change (not the first selection).
 */
export function tabList(
  tabs: readonly Tab[],
  {
    label,
    initial,
    idPrefix,
    onSelect
  }: { label: string; initial?: string; idPrefix: string; onSelect?: (id: string) => void }
): {
  element: HTMLElement;
  select: (id: string) => void;
  selected: () => string;
  setCount: (id: string, count: number) => void;
} {
  let current = tabs.some(tab => tab.id === initial) ? initial! : tabs[0]!.id;
  const badges = new Map<string, HTMLElement>();
  const buttons = tabs.map(tab => {
    const badge = el('span', { class: 'badge badge-sm badge-primary ms-1 hidden', 'aria-hidden': 'true' });
    badges.set(tab.id, badge);
    const button = el(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `${idPrefix}-tab-${tab.id}`,
        'aria-controls': `${idPrefix}-panel-${tab.id}`,
        class: 'tab'
      },
      [tab.label, badge]
    );
    tab.panel.id = `${idPrefix}-panel-${tab.id}`;
    tab.panel.setAttribute('role', 'tabpanel');
    tab.panel.setAttribute('aria-labelledby', button.id);
    button.addEventListener('click', () => select(tab.id));
    button.addEventListener('keydown', event => {
      const index = tabAfterKey(tabs.length, tabs.indexOf(tab), event.key);
      if (index === undefined) return;
      const next = tabs[index]!;
      event.preventDefault();
      select(next.id);
      document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
    });
    return button;
  });
  /** Show a tab's panel, without telling `onSelect` (the first selection isn't a change) */
  const show = (id: string) => {
    current = id;
    tabs.forEach((tab, index) => {
      const on = tab.id === id;
      const button = buttons[index]!;
      button.classList.toggle('tab-active', on);
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      tab.panel.hidden = !on;
      if (on) setCount(id, 0);
    });
  };
  const select = (id: string) => {
    show(id);
    onSelect?.(id);
  };
  const setCount = (id: string, count: number) => {
    const badge = badges.get(id);
    if (!badge) return;
    const shown = count > 0 && id !== current;
    badge.classList.toggle('hidden', !shown);
    badge.textContent = shown ? String(count) : '';
    // The badge is hidden from assistive tech; the tab's name says it instead
    const index = tabs.findIndex(tab => tab.id === id);
    if (shown) buttons[index]!.setAttribute('aria-label', `${tabs[index]!.label}, ${count} new`);
    else buttons[index]!.removeAttribute('aria-label');
  };
  const element = el('div', { role: 'tablist', class: 'tabs tabs-border', 'aria-label': label }, buttons);
  show(current);
  return { element, select, selected: () => current, setCount };
}

// Full class names, so Tailwind finds them in the source
/** How each kind of wire line is marked: what the client sent, what the server sent, and what happened to connections */
export const WIRE_DIRECTION: Record<WireEntry['direction'], { mark: string; label: string; className: string }> = {
  client: { mark: '→', label: 'client sent', className: 'text-info' },
  server: { mark: '←', label: 'server sent', className: 'text-success' },
  note: { mark: '·', label: 'connection', className: 'text-base-content/70' }
};

/** A wire entry's text with its line breaks visible (`↵`), since in an event stream they're the syntax */
const visible = (text: string): string => text.replace(/\r/g, '␍').replace(/\n/g, '↵\n');

/** One line of a server's wire log: its direction's mark, its text, and its time; for the Server tab and the cards */
export function wireItem(entry: WireEntry): HTMLElement {
  const direction = WIRE_DIRECTION[entry.direction];
  return el('li', { class: 'flex gap-2' }, [
    el('span', { class: `${direction.className} shrink-0`, title: direction.label, 'aria-label': direction.label }, [
      direction.mark
    ]),
    el('span', { class: 'break-all whitespace-pre-wrap' }, [visible(entry.text)]),
    el('span', { class: 'shrink-0 text-base-content/70' }, [`${entry.at} ms`])
  ]);
}
