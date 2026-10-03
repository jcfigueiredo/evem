import { el } from '../dom';
import { timeAxis, type LaneChart, type LaneDot } from '../lanes';

// Full class names, so Tailwind finds them in the source
const DOT_CLASS: Record<LaneDot['kind'], string> = {
  publish: 'bg-primary',
  ran: 'bg-success',
  held: 'border-2 border-base-content/60 bg-base-100'
};

const times = (count: number) => `${count} time${count === 1 ? '' : 's'}`;

/** What the chart shows, in words, for screen readers */
function summary(chart: LaneChart): string {
  const lanes = chart.lanes.map(lane => {
    const ran = lane.dots.filter(dot => dot.kind === 'ran').length;
    const held = lane.dots.filter(dot => dot.kind === 'held').length;
    return `${lane.name} ran ${times(ran)}${held > 0 ? `, held back ${times(held)}` : ''}`;
  });
  return [`published ${times(chart.published.length)}`, ...lanes].join('; ');
}

/**
 * Draw `chart` in `container`: a lane for the publishes and one per subscriber, each mark placed by time (its
 * tooltip says what it is), and the time axis below. Before any action, a hint.
 */
export function renderLaneChart(container: HTMLElement, chart: LaneChart | undefined): void {
  if (!chart) {
    container.replaceChildren(
      el('p', { class: 'text-sm text-base-content/70' }, ['Run an action to see its events and runs over time.'])
    );
    return;
  }
  // Room for a tick label about every 72 px of the time track (the chart's width, less the name column and gap)
  const maxIntervals = Math.min(8, Math.max(2, Math.floor((container.clientWidth - 156) / 72)));
  const { span, ticks } = timeAxis(chart.end - chart.start, maxIntervals);
  const left = (at: number) => `left: ${(((at - chart.start) / span) * 100).toFixed(2)}%`;
  const lane = (label: string, dots: LaneDot[]) => [
    el('span', { class: 'font-mono text-xs text-base-content/70 truncate', title: label }, [label]),
    el(
      'div',
      { class: 'relative h-7 border-b border-base-300' },
      dots.map(dot =>
        el('span', {
          class: `absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${DOT_CLASS[dot.kind]}`,
          style: left(dot.at),
          title: dot.title
        })
      )
    )
  ];
  container.replaceChildren(
    el(
      'div',
      {
        class: 'grid grid-cols-[fit-content(9rem)_minmax(0,1fr)] items-center gap-x-3',
        role: 'img',
        'aria-label': summary(chart)
      },
      [
        ...lane('published', chart.published),
        ...chart.lanes.flatMap(subscriber => lane(subscriber.name, subscriber.dots)),
        el('span', {}, []),
        el(
          'div',
          { class: 'relative h-5' },
          // Labels centered on their tick; the last ends at it, so it never hangs past the chart (on phones, that
          // would scroll the chart sideways)
          ticks.map((tick, index) =>
            el(
              'span',
              {
                class:
                  index === ticks.length - 1
                    ? 'absolute top-1 -translate-x-full whitespace-nowrap text-xs text-base-content/70'
                    : 'absolute top-1 -translate-x-1/2 whitespace-nowrap text-xs text-base-content/70',
                style: left(chart.start + tick)
              },
              [`${tick} ms`]
            )
          )
        )
      ]
    )
  );
}
