import { describe, expect, it } from 'vitest';
import { CODE_LAYOUT_STORAGE_KEY, LAYOUTS, readCodeLayout, saveCodeLayout } from '../../demo/src/playground/layout';

/** The cells of the wide grid (two columns, two rows) a card's `lg:` classes put it in */
function cells(classes: string): string[] {
  const column = Number(/lg:col-start-(\d)/.exec(classes)?.[1]);
  const row = Number(/lg:row-start-(\d)/.exec(classes)?.[1]);
  const span = Number(/lg:row-span-(\d)/.exec(classes)?.[1] ?? 1);
  return Array.from({ length: span }, (_, index) => `${column},${row + index}`);
}

describe('the workbench layouts', () => {
  it.each(Object.entries(LAYOUTS))('%s: the three cards fill the wide grid, each in its own cells', (_, layout) => {
    const taken = [layout.scenario, layout.output, layout.code].flatMap(cells);
    expect(taken.sort()).toEqual(['1,1', '1,2', '2,1', '2,2']);
  });

  it('gives the code the wide column, and its whole height, in the wide layout', () => {
    expect(cells(LAYOUTS.wide.code)).toEqual(['1,1', '1,2']);
    expect(LAYOUTS.wide.grid).toBe('lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]');
    expect(LAYOUTS.normal.grid).toBe('lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]');
  });
});

describe('the saved layout', () => {
  it('is the wide one only when saved so; anything else, nothing, or storage that fails is the normal one', () => {
    const saved = (value: string | null) => ({
      getItem: (key: string) => (key === CODE_LAYOUT_STORAGE_KEY ? value : null)
    });
    expect(readCodeLayout(saved('wide'))).toBe('wide');
    expect(readCodeLayout(saved('normal'))).toBe('normal');
    expect(readCodeLayout(saved('huge'))).toBe('normal');
    expect(readCodeLayout(saved(null))).toBe('normal');
    expect(readCodeLayout(undefined)).toBe('normal');
    expect(
      readCodeLayout({
        getItem: () => {
          throw new Error('blocked');
        }
      })
    ).toBe('normal');
  });

  it('is saved under its key, and storage that cannot be written is ignored', () => {
    const store = new Map<string, string>();
    saveCodeLayout({ setItem: (key, value) => void store.set(key, value) }, 'wide');
    expect(store.get(CODE_LAYOUT_STORAGE_KEY)).toBe('wide');
    expect(() =>
      saveCodeLayout(
        {
          setItem: () => {
            throw new Error('full');
          }
        },
        'normal'
      )
    ).not.toThrow();
  });
});
