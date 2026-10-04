import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../demo/src/engine/session';
import { menuSections } from '../../demo/src/playground/menu';
import { scenarios } from '../../demo/src/scenarios';

describe('menuSections', () => {
  const titles = (scenarios: readonly Scenario[]) => scenarios.map(scenario => scenario.title);

  it('puts the groups that talk to a server under Adapters, the others under Features, in their order', () => {
    const sections = menuSections(scenarios);
    expect(sections.map(section => [section.label, section.groups.map(group => group.name)])).toEqual([
      ['Features', ['Core', 'Flow control', 'Data', 'Middleware', 'Control & errors', 'State & diagnostics']],
      ['Adapters', ['WebSocket', 'SSE', 'Recipes']]
    ]);
  });

  it('lists every scenario once, in the order of the scenario list', () => {
    const listed = menuSections(scenarios).flatMap(section => section.groups.flatMap(group => group.scenarios));
    expect(titles(listed)).toEqual(titles(scenarios));
  });

  it('gives each section an id an element can have', () => {
    expect(menuSections(scenarios).map(section => section.id)).toEqual(['menu-features', 'menu-adapters']);
  });
});
