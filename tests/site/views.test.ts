import { describe, expect, it } from 'vitest';
import { tabAfterKey } from '../../demo/src/playground/views';

describe('tabAfterKey', () => {
  it('moves to the next or previous tab with the arrow keys, wrapping around', () => {
    expect(tabAfterKey(3, 0, 'ArrowRight')).toBe(1);
    expect(tabAfterKey(3, 2, 'ArrowRight')).toBe(0);
    expect(tabAfterKey(3, 0, 'ArrowLeft')).toBe(2);
    expect(tabAfterKey(3, 2, 'ArrowLeft')).toBe(1);
  });

  it('goes to the first tab with Home and the last with End, and ignores other keys', () => {
    expect(tabAfterKey(3, 1, 'Home')).toBe(0);
    expect(tabAfterKey(3, 1, 'End')).toBe(2);
    expect(tabAfterKey(3, 1, 'Enter')).toBeUndefined();
    expect(tabAfterKey(3, 1, 'ArrowDown')).toBeUndefined();
  });
});
