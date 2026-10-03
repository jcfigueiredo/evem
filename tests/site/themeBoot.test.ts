import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readChoice, resolveTheme } from '../../demo/src/theme';

/** The inline <script> (no src) in a page's <head>: it applies the saved theme before the page paints */
function bootScript(page: string): string {
  const html = readFileSync(new URL(`../../demo/${page}`, import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]!);
  if (scripts.length !== 1)
    throw new Error(`demo/${page} should have exactly one inline script, found ${scripts.length}`);
  return scripts[0]!;
}

/** Run a boot script with a saved value (or storage that throws) and a system preference; returns data-theme */
function boot(script: string, saved: string | null | 'throws', prefersLight: boolean): string | undefined {
  const attributes = new Map<string, string>();
  const localStorage = {
    getItem: () => {
      if (saved === 'throws') throw new Error('blocked');
      return saved;
    }
  };
  const window = {
    matchMedia: (query: string) => ({ matches: query === '(prefers-color-scheme: light)' && prefersLight })
  };
  const document = { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } };
  new Function('localStorage', 'window', 'document', script)(localStorage, window, document);
  return attributes.get('data-theme');
}

describe.each(['index.html', 'playground/index.html'])('the theme boot script in demo/%s', page => {
  const script = bootScript(page);
  const savedValues = [null, 'signal', 'signal-light', 'system', 'dracula', 'throws'] as const;

  it.each(savedValues.flatMap(saved => [true, false].map(prefersLight => [saved, prefersLight] as const)))(
    'saved %s, prefers light %s: picks the theme resolveTheme picks',
    (saved, prefersLight) => {
      const storage = {
        getItem: () => {
          if (saved === 'throws') throw new Error('blocked');
          return saved;
        }
      };
      expect(boot(script, saved, prefersLight)).toBe(resolveTheme(readChoice(storage), prefersLight));
    }
  );
});
