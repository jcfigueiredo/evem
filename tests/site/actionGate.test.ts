import { describe, expect, it } from 'vitest';
import { ActionGate } from '../../demo/src/actionGate';

describe('ActionGate', () => {
  it('lets one run at a time hold the buttons', () => {
    const gate = new ActionGate();
    const run = gate.start();
    expect(run).toBeDefined();
    expect(gate.busy).toBe(true);
    expect(gate.start()).toBeUndefined();
    expect(gate.end(run!)).toBe(true);
    expect(gate.busy).toBe(false);
  });

  it('keeps a run from before a reset from freeing the gate while a newer run holds it', () => {
    const gate = new ActionGate();
    const old = gate.start()!;
    // A control changed: the scenario started over while the old run was still going
    gate.reset();
    expect(gate.busy).toBe(false);
    const current = gate.start()!;
    // The old run ends now: the buttons must stay disabled, the current run still holds them
    expect(gate.end(old)).toBe(false);
    expect(gate.busy).toBe(true);
    expect(gate.start()).toBeUndefined();
    expect(gate.end(current)).toBe(true);
    expect(gate.busy).toBe(false);
  });
});
