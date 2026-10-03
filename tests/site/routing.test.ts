import { describe, expect, it } from 'vitest';
import { scenarioForHash, scenarioPath } from '../../demo/src/routing';

const list = [
  { id: 'priorities', group: 'Core' },
  { id: 'throttle', group: 'Flow control' }
];

describe('scenarioPath', () => {
  it('is #/<group>/<id>, with the group as a slug', () => {
    expect(scenarioPath(list[1]!)).toBe('#/flow-control/throttle');
  });
});

describe('scenarioForHash', () => {
  it('finds the scenario a hash points to', () => {
    expect(scenarioForHash('#/flow-control/throttle', list)).toBe(list[1]);
  });

  it('falls back to the first scenario for an empty or unknown hash', () => {
    expect(scenarioForHash('', list)).toBe(list[0]);
    expect(scenarioForHash('#/nope/missing', list)).toBe(list[0]);
  });

  it('throws when there are no scenarios', () => {
    expect(() => scenarioForHash('', [])).toThrow('There are no scenarios');
  });
});
