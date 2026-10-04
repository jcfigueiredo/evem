import type { Scenario } from '../engine/session';

export const errorPolicies: Scenario = {
  id: 'error-policies',
  group: 'Control & errors',
  title: 'Error policies & timeouts',
  summary:
    "A publish's errorPolicy decides what a callback's error does: log and go on, ignore it, stop the event, or reject. A callback slower than the timeout is an error too, but it keeps running.",
  docs: 'https://github.com/jcfigueiredo/evem/blob/main/docs/guide/errors.md#error-policy-configuration',
  controls: {
    policy: {
      kind: 'select',
      label: 'errorPolicy',
      hint: "What a callback's error does to the publish: log and go on, ignore it, stop the event, or reject.",
      options: [
        'ErrorPolicy.LOG_AND_CONTINUE',
        'ErrorPolicy.SILENT',
        'ErrorPolicy.CANCEL_ON_ERROR',
        'ErrorPolicy.THROW'
      ],
      default: 'ErrorPolicy.LOG_AND_CONTINUE',
      raw: true
    },
    timeout: {
      kind: 'number',
      label: 'timeout (ms)',
      hint: 'How long publish waits for each async callback; the slow report takes 1000 ms.',
      min: 100,
      max: 3000,
      step: 100,
      default: 500
    }
  },
  helpers: {},
  code: [
    "import { EvEm, ErrorPolicy } from '@jcfigueiredo/evem';",
    '',
    'const evem = new EvEm();',
    'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));',
    '',
    'const validate = data => {',
    "  if (!data.valid) throw new Error('Invalid data');",
    '};',
    "const save = () => console.log('saved');",
    'const slowReport = async () => {',
    '  await sleep(1000);',
    "  console.log('report finished (the callback kept running)');",
    '};',
    '',
    "evem.subscribe('data.process', validate, { priority: 'high' });",
    "evem.subscribe('data.process', save);",
    "evem.subscribe('report.generate', slowReport);",
    '',
    '// ▶ Publish invalid data',
    'await evem',
    "  .publish('data.process', { valid: false }, { errorPolicy: {{policy}} })",
    "  .then(completed => console.log('publish resolved', completed))",
    "  .catch(error => console.log('publish rejected:', error.message));",
    '',
    '// ▶ Generate a slow report',
    'await evem',
    "  .publish('report.generate', undefined, { timeout: {{timeout}}, errorPolicy: {{policy}} })",
    "  .then(completed => console.log('publish resolved', completed))",
    "  .catch(error => console.log('publish rejected:', error.message));"
  ].join('\n'),
  checks: [
    {
      action: 'publish-invalid-data',
      calls: ['validate', 'save'],
      result: true,
      logs: ['Error in event handler for "data.process"', 'saved', 'publish resolved true']
    },
    {
      values: { policy: 'ErrorPolicy.SILENT' },
      action: 'publish-invalid-data',
      calls: ['validate', 'save'],
      result: true,
      logs: ['saved', 'publish resolved true']
    },
    {
      values: { policy: 'ErrorPolicy.CANCEL_ON_ERROR' },
      action: 'publish-invalid-data',
      calls: ['validate'],
      result: false,
      skipped: ['save: canceled'],
      logs: ['Error in event handler', 'publish resolved false']
    },
    {
      values: { policy: 'ErrorPolicy.THROW' },
      action: 'publish-invalid-data',
      calls: ['validate'],
      rejects: 'Invalid data',
      skipped: ['save: stopped'],
      logs: ['publish rejected: Invalid data']
    },
    {
      action: 'generate-a-slow-report',
      calls: ['slowReport'],
      result: true,
      logs: ['Event handler timed out after 500ms', 'publish resolved true', 'report finished']
    },
    {
      values: { timeout: 3000 },
      action: 'generate-a-slow-report',
      calls: ['slowReport'],
      result: true,
      logs: ['report finished', 'publish resolved true']
    },
    {
      values: { policy: 'ErrorPolicy.THROW' },
      action: 'generate-a-slow-report',
      calls: ['slowReport'],
      rejects: 'timed out',
      logs: ['publish rejected: Event handler timed out after 500ms']
    }
  ]
};
