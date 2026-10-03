import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../demo/src/styles.css', import.meta.url), 'utf8');

/** The `--color-*` values of each daisyUI theme in styles.css, by theme name */
function themes(): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  for (const block of css.matchAll(/@plugin "daisyui\/theme" \{([\s\S]*?)\n\}/g)) {
    const name = /name: ["']([^"']+)["']/.exec(block[1]!)![1]!;
    result.set(
      name,
      new Map([...block[1]!.matchAll(/--color-([\w-]+): (#[0-9a-f]{6});/g)].map(match => [match[1]!, match[2]!]))
    );
  }
  return result;
}

/** The shared code-panel colors (`--code-*`) */
const codeColors = new Map([...css.matchAll(/--code-([\w-]+): (#[0-9a-f]{6});/g)].map(match => [match[1]!, match[2]!]));

/** WCAG 2.1 contrast ratio of two #rrggbb colors */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe('theme colors', () => {
  it('defines Signal and Signal Light', () => {
    expect([...themes().keys()]).toEqual(['signal', 'signal-light']);
  });

  describe.each([...themes()])('%s', (_name, colors) => {
    const color = (token: string) => {
      const value = colors.get(token);
      if (!value) throw new Error(`--color-${token} missing`);
      return value;
    };
    const pairs: Array<[string, string]> = [
      ...['base-100', 'base-200', 'base-300'].map(base => ['base-content', base] as [string, string]),
      ...['primary', 'secondary', 'accent', 'neutral', 'info', 'success', 'warning', 'error'].map(
        token => [`${token}-content`, token] as [string, string]
      ),
      // Text in these colors on panels (links, timeline text)
      ...['primary', 'info', 'success', 'warning', 'error'].map(token => [token, 'base-100'] as [string, string])
    ];

    it.each(pairs)('%s on %s meets WCAG AA (4.5:1)', (foreground, background) => {
      expect(contrast(color(foreground), color(background))).toBeGreaterThanOrEqual(4.5);
    });

    it.each([...codeColors.keys()])('code color %s meets WCAG AA on the code panel', token => {
      expect(contrast(codeColors.get(token)!, color('neutral'))).toBeGreaterThanOrEqual(4.5);
    });
  });
});
