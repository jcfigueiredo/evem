/**
 * How the workbench's cards share a wide screen: `normal` puts the code under the scenario's controls, beside the
 * output; `wide` gives the code the wide column at its full height, with the scenario and the output beside it (the
 * code's ▶ buttons still run its actions). Below the `lg` breakpoint the cards stack either way; there, `wide` only
 * makes the code taller.
 */
export type CodeLayout = 'normal' | 'wide';

export const CODE_LAYOUT_STORAGE_KEY = 'evem-code-layout';

/**
 * The grid's rows, in both layouts: the scenario's card as tall as its content, but never so tall that the row under
 * it (the code, or in the wide layout the output) gets less than 20rem; on a short screen the scenario's card scrolls
 * instead
 */
export const GRID_ROWS = 'lg:grid-rows-[minmax(0,max-content)_minmax(20rem,1fr)]';

/** The classes that place the grid's columns and each card (written out whole, for Tailwind) */
export interface LayoutClasses {
  grid: string;
  scenario: string;
  output: string;
  code: string;
}

export const LAYOUTS: Record<CodeLayout, LayoutClasses> = {
  normal: {
    grid: 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]',
    scenario: 'lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto',
    output: 'h-[32rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto lg:min-h-0',
    code: 'h-[28rem] lg:col-start-1 lg:row-start-2 lg:h-auto lg:min-h-0'
  },
  wide: {
    grid: 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]',
    scenario: 'lg:col-start-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto',
    output: 'h-[32rem] lg:col-start-2 lg:row-start-2 lg:h-auto lg:min-h-0',
    code: 'h-[85dvh] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-auto lg:min-h-0'
  }
};

/** The saved layout, or the normal one when there's none, it's unknown, or storage can't be read */
export function readCodeLayout(storage: Pick<Storage, 'getItem'> | undefined): CodeLayout {
  try {
    return storage?.getItem(CODE_LAYOUT_STORAGE_KEY) === 'wide' ? 'wide' : 'normal';
  } catch {
    return 'normal';
  }
}

/** Save the layout; storage that can't be written (private mode, blocked) is ignored */
export function saveCodeLayout(storage: Pick<Storage, 'setItem'> | undefined, layout: CodeLayout): void {
  try {
    storage?.setItem(CODE_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // The layout still applies to this page
  }
}
