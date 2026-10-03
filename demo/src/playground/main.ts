import '../styles.css';
import { EvEm } from '@jcfigueiredo/evem';
import { scenarioForHash } from '../routing';
import { scenarios } from '../scenarios';
import { mountThemePicker } from '../theme';
import { renderMenu } from './menu';
import { mountWorkbench } from './workbench';

// The playground's own events (navigation, theme, trace entries) go through EvEm too
const bus = new EvEm();
const menu = document.getElementById('scenario-menu')!;
const workbench = document.getElementById('workbench')!;
const sidebarToggle = document.getElementById('sidebar') as HTMLInputElement;
let teardown: (() => void) | undefined;
// Counts navigations: a workbench that finishes mounting after a newer navigation is torn down at once
let navigation = 0;

bus.subscribe<string>('playground.navigate', async hash => {
  const current = ++navigation;
  const scenario = scenarioForHash(hash, scenarios);
  renderMenu(menu, scenarios, scenario);
  document.title = `${scenario.title} · EvEm Playground`;
  sidebarToggle.checked = false;
  teardown?.();
  teardown = undefined;
  const mounted = await mountWorkbench(workbench, scenario, bus);
  if (current === navigation) teardown = mounted;
  else mounted();
});

window.addEventListener('hashchange', () => void bus.publish('playground.navigate', location.hash));
// Choosing a scenario closes the drawer, the current one too (its link doesn't change the hash, so no navigate)
menu.addEventListener('click', event => {
  if ((event.target as Element).closest('a')) sidebarToggle.checked = false;
});
mountThemePicker(document.getElementById('theme-picker')!, bus);
void bus.publish('playground.navigate', location.hash);
