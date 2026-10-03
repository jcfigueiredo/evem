import { readdirSync, readFileSync } from 'node:fs';
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

/** The color token styles.css gives a daisyUI menu variable, or daisyUI's default */
const menuColor = (variable: string, fallback: string) =>
  new RegExp(`--${variable}: var\\(--color-([\\w-]+)\\)`).exec(css)?.[1] ?? fallback;

/** The token of the keyboard focus ring styles.css gives menu items (daisyUI shows none on the current link) */
const focusRing = /\.menu :is\(a, button\):focus-visible \{\s*outline: 2px solid var\(--color-([\w-]+)\)/.exec(
  css
)?.[1];

/** The site's markup and scripts: the pages, and everything under demo/src */
const demoFile = (path: string) => readFileSync(new URL(`../../demo/${path}`, import.meta.url), 'utf8');
const sources = [
  demoFile('index.html'),
  demoFile('playground/index.html'),
  ...readdirSync(new URL('../../demo/src', import.meta.url), { recursive: true })
    .map(String)
    .filter(path => path.endsWith('.ts'))
    .map(path => demoFile(`src/${path}`))
].join('\n');

/** The opacities the sources use with a base-content utility (`text-base-content/60` → 60) */
const opacities = (utility: string) => [
  ...new Set([...sources.matchAll(new RegExp(`\\b${utility}-base-content/(\\d+)`, 'g'))].map(match => Number(match[1])))
];

/** `foreground` at `opacity` over `background`, as the browser composites it (per sRGB channel) */
function blend(foreground: string, background: string, opacity: number): string {
  const channel = (hex: string, index: number) => parseInt(hex.slice(index, index + 2), 16);
  return `#${[1, 3, 5]
    .map(index => Math.round(channel(foreground, index) * opacity + channel(background, index) * (1 - opacity)))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

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

    // The sidebar (base-300): where you are, and where keyboard focus is, must show (WCAG 1.4.11: 3:1 for non-text)
    it("the sidebar's current link stands out from the sidebar, and its text reads on it", () => {
      const background = color(menuColor('menu-active-bg', 'neutral'));
      expect(contrast(background, color('base-300'))).toBeGreaterThanOrEqual(3);
      expect(contrast(color(menuColor('menu-active-fg', 'neutral-content')), background)).toBeGreaterThanOrEqual(4.5);
    });

    // Faded text and shapes (`text-base-content/60`, the neutral timeline dot): the theme tokens alone don't show them
    const bases = ['base-100', 'base-200', 'base-300'];

    it.each(opacities('text'))('base-content text at %i%% opacity meets WCAG AA on every base color', opacity => {
      for (const base of bases) {
        const faded = blend(color('base-content'), color(base), opacity / 100);
        expect(contrast(faded, color(base)), `on ${base}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it.each(opacities('bg'))('base-content shapes at %i%% opacity stand out from every base color (3:1)', opacity => {
      for (const base of bases) {
        const faded = blend(color('base-content'), color(base), opacity / 100);
        expect(contrast(faded, color(base)), `on ${base}`).toBeGreaterThanOrEqual(3);
      }
    });

    it('menu items show keyboard focus with a ring that stands out from the sidebar', () => {
      expect(focusRing, 'a :focus-visible outline for menu items in styles.css').toBeDefined();
      expect(contrast(color(focusRing!), color('base-300'))).toBeGreaterThanOrEqual(3);
    });
  });
});
