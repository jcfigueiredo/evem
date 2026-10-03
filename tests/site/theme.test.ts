import { describe, expect, it } from 'vitest';
import { readChoice, resolveTheme, saveChoice, THEME_STORAGE_KEY } from '../../demo/src/theme';

const storageWith = (value: string | null) => ({
  getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null)
});
const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: (): void => {
    throw new Error('blocked');
  }
};

describe('resolveTheme', () => {
  it.each([
    ['signal', false, 'signal'],
    ['signal', true, 'signal'],
    ['signal-light', false, 'signal-light'],
    ['system', true, 'signal-light'],
    ['system', false, 'signal']
  ] as const)('%s with prefers-light %s is %s', (choice, prefersLight, theme) => {
    expect(resolveTheme(choice, prefersLight)).toBe(theme);
  });
});

describe('readChoice', () => {
  it('returns a saved choice', () => {
    expect(readChoice(storageWith('system'))).toBe('system');
    expect(readChoice(storageWith('signal-light'))).toBe('signal-light');
  });

  it('falls back to Signal for nothing saved, an unknown value, blocked storage or no storage', () => {
    expect(readChoice(storageWith(null))).toBe('signal');
    expect(readChoice(storageWith('dracula'))).toBe('signal');
    expect(readChoice(throwing)).toBe('signal');
    expect(readChoice(undefined)).toBe('signal');
  });
});

describe('saveChoice', () => {
  it('saves the choice under its key, and ignores storage that throws', () => {
    const saved = new Map<string, string>();
    saveChoice({ setItem: (key, value) => saved.set(key, value) }, 'signal-light');
    expect(saved.get(THEME_STORAGE_KEY)).toBe('signal-light');
    expect(() => saveChoice(throwing, 'signal')).not.toThrow();
  });
});
