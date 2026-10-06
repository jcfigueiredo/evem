import { EvEm } from '@jcfigueiredo/evem';
import { el } from '../dom';
import { closeOnLeave } from '../dropdown';
import { scenarios } from '../scenarios';
import { mountThemePicker } from '../theme';
import { mountHeroFlow } from './heroFlow';
import { mountWidget } from './widget';

// The showcase's own events go through EvEm, like the playground's
const bus = new EvEm();
mountThemePicker(document.getElementById('theme-picker')!, bus, 'dropdown-end');
mountHeroFlow(document.getElementById('flow')!);

// The phone menu closes once a link is chosen, on Escape, and when a click or the focus goes elsewhere
for (const menu of document.querySelectorAll<HTMLDetailsElement>('details[data-menu]')) closeOnLeave(menu);

// Copy buttons: the text in data-copy, and a moment of "Copied", which screen readers hear too (the button's own
// name stays what it does)
const copyStatus = el('p', { class: 'sr-only', 'aria-live': 'polite' });
document.body.append(copyStatus);
const copy = async (button: HTMLButtonElement) => {
  try {
    await navigator.clipboard.writeText(button.dataset['copy'] ?? '');
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  copyStatus.textContent = button.textContent;
  setTimeout(() => {
    button.textContent = 'Copy';
    copyStatus.textContent = '';
  }, 1500);
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', () => void copy(button));
}

// Each feature's widget starts when it comes near the screen, so the page doesn't run seven scenarios at load
const widgets = new IntersectionObserver(
  entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      widgets.unobserve(entry.target);
      const host = entry.target as HTMLElement;
      const scenario = scenarios.find(candidate => candidate.id === host.dataset['scenario']);
      if (scenario) void mountWidget(host, scenario);
    }
  },
  { rootMargin: '200px' }
);
for (const host of document.querySelectorAll<HTMLElement>('[data-scenario]')) widgets.observe(host);

// The Alpine card loads Alpine and starts its board when it comes near the screen, like the widgets
const alpineCard = document.querySelector<HTMLElement>('[data-alpine-card]');
if (alpineCard) {
  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void import('./alpineCard').then(({ mountAlpineCard }) => mountAlpineCard(alpineCard));
    },
    { rootMargin: '200px' }
  );
  observer.observe(alpineCard);
}
