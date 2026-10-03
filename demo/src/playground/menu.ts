import { el } from '../dom';
import type { Scenario } from '../engine/session';
import { scenarioPath } from '../routing';

/** The sidebar: scenarios grouped as they are listed, the current one marked */
export function renderMenu(menu: HTMLElement, scenarios: readonly Scenario[], current: Scenario): void {
  const items: HTMLElement[] = [];
  let group = '';
  for (const scenario of scenarios) {
    if (scenario.group !== group) {
      group = scenario.group;
      items.push(el('li', { class: 'menu-title' }, [group]));
    }
    const active = scenario === current;
    items.push(
      el('li', {}, [
        el(
          'a',
          {
            href: scenarioPath(scenario),
            class: active ? 'menu-active' : '',
            ...(active ? { 'aria-current': 'page' } : {})
          },
          [scenario.title]
        )
      ])
    );
  }
  menu.replaceChildren(...items);
}
