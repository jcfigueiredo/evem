import { el } from '../dom';
import type { ControlValue } from '../engine/program';
import { numberInput, optionLabel, type Control } from '../engine/session';
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

/** One timeline row: a status dot in its tone, the text, its detail (data, in short) and its time */
export function timelineItem(row: TimelineRow): HTMLElement {
  return el('li', { class: 'relative ps-4', style: `margin-inline-start: ${row.depth * 1.25}rem` }, [
    el('span', {
      class: `status ${TONE_CLASS[row.tone]} absolute -start-[0.3rem] top-[0.45rem] signal-glow`,
      'aria-hidden': 'true'
    }),
    el('span', { class: 'font-mono text-sm break-words whitespace-pre-wrap' }, [row.text]),
    row.detail ? el('span', { class: 'font-mono text-xs text-base-content/60 ms-2 break-all' }, [row.detail]) : null,
    el('span', { class: 'text-xs text-base-content/60 ms-2' }, [`${row.at} ms`])
  ]);
}
