import type { EvEm } from '@jcfigueiredo/evem';
import { el } from './dom';
import { closeOnLeave } from './dropdown';

/** The themes: Signal (dark, the default) and Signal Light */
export type Theme = 'signal' | 'signal-light';
/** What the picker offers: a theme, or following the operating system */
export type ThemeChoice = Theme | 'system';

export const THEME_STORAGE_KEY = 'evem-theme';

const CHOICES: Array<{ choice: ThemeChoice; label: string }> = [
  { choice: 'signal', label: 'Signal' },
  { choice: 'signal-light', label: 'Signal Light' },
  { choice: 'system', label: 'Match system' }
];

/** The theme a choice stands for; "system" follows prefers-color-scheme */
export function resolveTheme(choice: ThemeChoice, prefersLight: boolean): Theme {
  if (choice === 'system') return prefersLight ? 'signal-light' : 'signal';
  return choice;
}

/** The saved choice, or Signal when there's none, it's unknown, or storage can't be read */
export function readChoice(storage: Pick<Storage, 'getItem'> | undefined): ThemeChoice {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    return CHOICES.some(option => option.choice === saved) ? (saved as ThemeChoice) : 'signal';
  } catch {
    return 'signal';
  }
}

/** Save the choice; storage that can't be written (private mode, blocked) is ignored */
export function saveChoice(storage: Pick<Storage, 'setItem'> | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // The choice still applies to this page
  }
}

/** The browser's localStorage, or undefined where it can't be reached (blocked, sandboxed) */
export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * A theme picker in `container`: a dropdown with Signal, Signal Light and Match system. It applies the choice to
 * <html data-theme>, saves it, follows the system while "Match system" is chosen, and publishes `theme.changed`
 * with the theme on the playground's emitter.
 */
export function mountThemePicker(container: HTMLElement, bus: EvEm, placement = 'dropdown-top'): void {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  let choice = readChoice(browserStorage());
  const label = el('span', {}, []);
  // On narrow screens the label is just the theme's name, on one line; its accessible name keeps "Theme:"
  const summary = el(
    'summary',
    { class: 'btn btn-sm btn-ghost w-full justify-between font-normal whitespace-nowrap' },
    [
      el('span', { class: 'hidden sm:inline', 'aria-hidden': 'true' }, ['Theme: ']),
      label,
      el('span', { 'aria-hidden': 'true' }, ['▾'])
    ]
  );
  const menu = el('ul', {
    class: 'dropdown-content menu bg-base-100 rounded-box z-10 w-48 p-2 shadow-lg border border-base-300'
  });
  const details = el('details', { class: `dropdown ${placement} w-full` }, [summary, menu]);

  const apply = () => {
    const theme = resolveTheme(choice, media.matches);
    document.documentElement.setAttribute('data-theme', theme);
    const name = CHOICES.find(option => option.choice === choice)!.label;
    label.textContent = name;
    summary.setAttribute('aria-label', `Theme: ${name}`);
    for (const button of menu.querySelectorAll('button')) {
      button.classList.toggle('menu-active', button.dataset['choice'] === choice);
    }
    void bus.publish('theme.changed', theme);
  };

  for (const option of CHOICES) {
    const button = el('button', { type: 'button', 'data-choice': option.choice }, [option.label]);
    button.addEventListener('click', () => {
      choice = option.choice;
      saveChoice(browserStorage(), choice);
      apply();
      details.removeAttribute('open');
    });
    menu.append(el('li', {}, [button]));
  }
  media.addEventListener('change', () => {
    if (choice === 'system') apply();
  });
  // It closes like the phone menu: on a choice (above), Escape, and a click or the focus elsewhere
  closeOnLeave(details);
  container.replaceChildren(details);
  apply();
}
