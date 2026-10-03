import { el } from '../dom';
import { createFlow, FLOW_EVENTS, FLOW_SUBSCRIBERS, type FlowRun } from './flow';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Milliseconds between two events, after one's animation ends */
const GAP = 1400;

// Full class names, so Tailwind finds them in the source
const ACTIVE = ['border-primary', 'shadow-[0_0_12px_var(--color-primary)]'];
const DIM = 'opacity-50';

/**
 * Animate the hero's diagram (`#flow` in index.html) with a real EvEm (`createFlow`): every few seconds it publishes
 * the next event, and a dot follows it from the publish node through the middleware to each subscriber that ran, in
 * the order they ran. It pauses when the reader presses Pause, scrolls it out of view or leaves the tab. With reduced
 * motion (or without JavaScript), the diagram stays still under its "How an event flows" label. Going live changes
 * the label and shows Pause, which kept its place while invisible, so the card's size never changes.
 */
export function mountHeroFlow(root: HTMLElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelector<HTMLElement>('[data-flow-label]')!.textContent = 'Live';
  const pause = root.querySelector<HTMLButtonElement>('[data-flow-pause]')!;
  pause.classList.remove('invisible');
  const stage = root.querySelector<HTMLElement>('[data-flow]')!;
  const node = (name: string) => stage.querySelector<HTMLElement>(`[data-flow-node="${name}"]`)!;
  const eventLabel = stage.querySelector<HTMLElement>('[data-flow-event]')!;
  const status = stage.querySelector<HTMLElement>('[data-flow-status]')!;
  const dot = el('span', {
    class:
      'pointer-events-none absolute top-0 left-0 size-3 rounded-full bg-primary opacity-0 signal-glow text-primary',
    'aria-hidden': 'true'
  });
  stage.append(dot);
  const flow = createFlow();

  let paused = false;
  let onScreen = true;
  let resume: (() => void) | undefined;
  const running = () => !paused && onScreen && document.visibilityState === 'visible';
  const update = () => {
    if (running()) resume?.();
  };
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Play' : 'Pause';
    pause.setAttribute('aria-pressed', String(paused));
    update();
  });
  new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    update();
  }).observe(root);
  document.addEventListener('visibilitychange', update);

  /** The middle of a node, relative to the stage, less half the dot */
  const centerOf = (element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    const frame = stage.getBoundingClientRect();
    return { x: box.left - frame.left + box.width / 2 - 6, y: box.top - frame.top + box.height / 2 - 6 };
  };
  const travel = (from: HTMLElement, to: HTMLElement) => {
    const a = centerOf(from);
    const b = centerOf(to);
    return dot.animate(
      [
        { transform: `translate(${a.x}px, ${a.y}px)`, opacity: 1 },
        { transform: `translate(${b.x}px, ${b.y}px)`, opacity: 1 }
      ],
      { duration: 450, easing: 'ease-in-out', fill: 'forwards' }
    ).finished;
  };
  const light = (element: HTMLElement, on: boolean) => {
    for (const name of ACTIVE) element.classList.toggle(name, on);
  };

  const draw = async (run: FlowRun) => {
    const publish = node('publish');
    const middleware = node('middleware');
    eventLabel.textContent = run.event;
    status.textContent = '';
    for (const subscriber of FLOW_SUBSCRIBERS) {
      const element = node(subscriber.name);
      light(element, false);
      element.classList.remove(DIM);
    }
    light(publish, true);
    await travel(publish, middleware);
    light(publish, false);
    light(middleware, true);
    await sleep(250);
    light(middleware, false);
    if (run.dropped) {
      status.textContent = 'dropped';
      for (const subscriber of FLOW_SUBSCRIBERS) node(subscriber.name).classList.add(DIM);
      dot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      return;
    }
    for (const subscriber of FLOW_SUBSCRIBERS) {
      if (!run.calls.includes(subscriber.name)) node(subscriber.name).classList.add(DIM);
    }
    let from = middleware;
    for (const name of run.calls) {
      const target = node(name);
      await travel(from, target);
      light(target, true);
      from = target;
    }
    dot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
  };

  void (async () => {
    for (let turn = 0; ; turn++) {
      if (!running()) await new Promise<void>(resolve => (resume = resolve));
      resume = undefined;
      await draw(await flow(FLOW_EVENTS[turn % FLOW_EVENTS.length]!));
      await sleep(GAP);
    }
  })();
}
