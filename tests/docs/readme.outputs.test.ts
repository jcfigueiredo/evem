import { describe, expect, it } from 'vitest';
import * as core from '../../src/index';
import * as sse from '../../src/sse/index';
import * as sseServer from '../../src/sse/server';
import * as websocket from '../../src/websocket/index';
import { extractCodeBlocks, readDoc, TYPESCRIPT_LANGUAGES } from './codeBlocks';
import { findMissingExpectation, parseExpectations, runSample } from './outputs';

const MODULES = {
  '@jcfigueiredo/evem': core,
  '@jcfigueiredo/evem/websocket': websocket,
  '@jcfigueiredo/evem/sse': sse,
  '@jcfigueiredo/evem/sse/server': sseServer
};

const samples = extractCodeBlocks(readDoc('README.md'), 'README.md', TYPESCRIPT_LANGUAGES).filter(block =>
  /\/\/ (Output|Logs)\b/.test(block.code)
);

describe('README samples with // Output: or // Logs: comments', () => {
  it('exist', () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it.each(samples.map(block => [`README.md:${block.line}`, block] as const))(
    '%s prints what its comments say',
    async (location, block) => {
      const expected = parseExpectations(block.code, location);
      // Samples that continue an earlier one use the Quick Start's emitter
      const scope = /\b(?:const|let|var)\s+evem\b/.test(block.code) ? {} : { evem: new core.EvEm() };
      const run = await runSample(block.code, location, MODULES, scope);

      const problems = [
        ['console.log', findMissingExpectation(run.output, expected.output)],
        ['console.error / console.warn', findMissingExpectation(run.logs, expected.logs)]
      ]
        .filter(([, missing]) => missing !== undefined)
        .map(([stream, missing]) => `missing from ${stream}: ${missing}`);
      const report = problems.length
        ? [
            `${location}`,
            ...problems,
            '--- console.log:',
            ...run.output,
            '--- console.error / console.warn:',
            ...run.logs
          ].join('\n')
        : '';
      expect(report).toBe('');
    }
  );
});
