import { el } from '../dom';
import type { Scenario } from '../engine/session';
import { scenarioPath } from '../routing';

/** A group of scenarios, as the scenario list has them (each group together) */
export interface MenuGroup {
  name: string;
  scenarios: Scenario[];
}

/** One of the megamenu's panels: its button's label, its popover's id, and its groups, shown as columns */
export interface MenuSection {
  id: string;
  label: string;
  groups: MenuGroup[];
}

const talksToServer = (scenario: Scenario) => Boolean(scenario.websocket || scenario.sse);

/**
 * The megamenu's panels: Features (the core library) and Adapters, the groups whose scenarios all talk to a server
 * (WebSocket, SSE, the recipes built on them). Groups and scenarios keep the scenario list's order.
 */
export function menuSections(scenarios: readonly Scenario[]): MenuSection[] {
  const groups: MenuGroup[] = [];
  for (const scenario of scenarios) {
    const last = groups.at(-1);
    if (last?.name === scenario.group) last.scenarios.push(scenario);
    else groups.push({ name: scenario.group, scenarios: [scenario] });
  }
  const adapters = (group: MenuGroup) => group.scenarios.every(talksToServer);
  return [
    { id: 'menu-features', label: 'Features', groups: groups.filter(group => !adapters(group)) },
    { id: 'menu-adapters', label: 'Adapters', groups: groups.filter(adapters) }
  ];
}

/**
 * The top bar's megamenu (daisyUI): a button per section, opening a panel with its groups in columns, the current
 * scenario marked, and its section's button underlined. On phones the whole menu is a popover that lists every
 * section at once (`max-lg:megamenu-vertical`, opened by the bar's Menu button).
 */
export function renderMenu(menu: HTMLElement, scenarios: readonly Scenario[], current: Scenario): void {
  menu.replaceChildren(
    el('span', { class: 'megamenu-active' }),
    ...menuSections(scenarios).flatMap(section => {
      const here = section.groups.some(group => group.scenarios.includes(current));
      return [
        el(
          'button',
          {
            type: 'button',
            popovertarget: section.id,
            // On phones the section's name is a heading over its groups, faded by daisyUI below WCAG AA
            class: `max-lg:text-base-content/70 ${here ? 'underline decoration-primary decoration-2 underline-offset-8' : ''}`
          },
          [section.label]
        ),
        el('div', { id: section.id, popover: '', class: 'p-2' }, [
          el(
            'div',
            { class: 'grid lg:grid-cols-3' },
            section.groups.map(group =>
              el('ul', { class: 'menu w-full lg:w-56' }, [
                el('li', { class: 'menu-title text-base-content/70' }, [group.name]),
                ...group.scenarios.map(scenario => {
                  const active = scenario === current;
                  return el('li', {}, [
                    el(
                      'a',
                      {
                        href: scenarioPath(scenario),
                        class: active ? 'menu-active' : '',
                        ...(active ? { 'aria-current': 'page' } : {})
                      },
                      [scenario.title]
                    )
                  ]);
                })
              ])
            )
          )
        ])
      ];
    })
  );
}
