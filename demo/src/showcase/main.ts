import { EvEm } from '@jcfigueiredo/evem';
import { scenarios } from '../scenarios';
import { mountThemePicker } from '../theme';
import { mountHeroFlow } from './heroFlow';
import { mountWidget } from './widget';

// The showcase's own events go through EvEm, like the playground's
const bus = new EvEm();
mountThemePicker(document.getElementById('theme-picker')!, bus, 'dropdown-end');
mountHeroFlow(document.getElementById('flow')!);

// Copy buttons: the text in data-copy, and a moment of "Copied"
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset['copy'] ?? '');
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    setTimeout(() => (button.textContent = 'Copy'), 1500);
  });
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
