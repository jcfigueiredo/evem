import type { Scenario } from '../engine/session';

export const domBridge: Scenario = {
  id: 'dom-bridge',
  group: 'Browser',
  title: 'DOM bridge',
  summary:
    "bridgeToDom dispatches EvEm events as CustomEvents, so DOM listeners get them: Alpine's @toast.window, htmx's hx-trigger=\"toast from:window\". bridgeFromDom publishes DOM events, such as Alpine's $dispatch, in EvEm. Bridge a name both ways and each event still reaches each side once.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/dom.md',
  controls: {
    fromDom: {
      kind: 'select',
      label: 'bridgeFromDom names',
      hint: 'Add toast to bridge it both ways: a toast dispatched in the DOM then reaches EvEm too, once.',
      options: ["['lane:expand']", "['lane:expand', 'toast']"],
      raw: true,
      default: "['lane:expand']"
    }
  },
  helpers: {},
  code: [
    "import { EvEm } from '@jcfigueiredo/evem';",
    "import { bridgeFromDom, bridgeToDom } from '@jcfigueiredo/evem/dom';",
    '',
    "const evem = new EvEm({ separator: ':' });",
    "// Stands in for window, where Alpine's @event.window and htmx's from:window listen",
    'const page = new EventTarget();',
    "bridgeToDom(evem, ['toast', 'server:*'], { target: page });",
    'bridgeFromDom(evem, {{fromDom}}, { target: page });',
    '',
    "const domListener = event => console.log('DOM listener got', event.type, event.detail);",
    "page.addEventListener('toast', domListener);",
    "const onLane = lane => console.log('EvEm subscriber got lane:expand', lane);",
    "const onToast = toast => console.log('EvEm subscriber got toast', toast);",
    "evem.subscribe('lane:expand', onLane);",
    "evem.subscribe('toast', onToast);",
    '',
    '// ▶ Publish a toast in EvEm',
    "await evem.publish('toast', { message: 'Saved' });",
    '',
    '// ▶ Dispatch lane:expand in the DOM',
    "// As Alpine's $dispatch('lane:expand', { lane: 'doing' }) does",
    "page.dispatchEvent(new CustomEvent('lane:expand', { detail: { lane: 'doing' } }));",
    '',
    '// ▶ Dispatch a toast in the DOM',
    "page.dispatchEvent(new CustomEvent('toast', { detail: { message: 'From a template' } }));"
  ].join('\n'),
  checks: [
    {
      action: 'publish-a-toast-in-evem',
      calls: ['onToast'],
      logs: ['DOM listener got toast {"message":"Saved"}', 'EvEm subscriber got toast {"message":"Saved"}']
    },
    {
      action: 'dispatch-lane-expand-in-the-dom',
      calls: ['onLane'],
      logs: ['EvEm subscriber got lane:expand {"lane":"doing"}']
    },
    {
      action: 'dispatch-a-toast-in-the-dom',
      calls: [],
      logs: ['DOM listener got toast {"message":"From a template"}']
    },
    {
      values: { fromDom: "['lane:expand', 'toast']" },
      action: 'dispatch-a-toast-in-the-dom',
      calls: ['onToast'],
      logs: [
        'DOM listener got toast {"message":"From a template"}',
        'EvEm subscriber got toast {"message":"From a template"}'
      ]
    }
  ]
};
