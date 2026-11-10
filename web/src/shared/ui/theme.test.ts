import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHILD_COLORS } from '@/shared/palette';

// Read from disk: Vitest serves CSS imports (`?raw` too) as empty strings.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'theme.css'), 'utf8');

/*
 * WCAG AA for the colour tokens in theme.css, in both themes (docs/design.md "Tokens"): text needs
 * 4.5:1 against what it sits on. When a new token carries text or sits under it, add its pair here.
 * Decoration that isn't text (tertiary-label chevrons, separators) is left out on purpose: iOS
 * keeps it faint.
 */
const TEXT_PAIRS: [text: string, background: string][] = [
  ['label', 'background'],
  ['label', 'cell'],
  ['label', 'fill'],
  ['label', 'segment'],
  ['secondary-label', 'background'],
  ['secondary-label', 'cell'],
  ['accent', 'background'],
  ['accent', 'cell'],
  ['on-accent', 'accent-fill'],
  ['destructive', 'background'],
  ['destructive', 'cell'],
  ['on-accent', 'destructive-fill'],
];

/** `--color-<name>: #rrggbb;` declarations inside the block that starts at `opener`. */
function tokens(opener: string): Map<string, string> {
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`no ${opener} block in theme.css`);
  const block = css.slice(start, css.indexOf('\n  }', start));
  return new Map(
    [...block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name = '', hex = '']) => [
      name,
      hex,
    ]),
  );
}

const light = tokens('@theme {');
const THEMES = {
  light,
  // The dark block overrides only what changes.
  dark: new Map([...light, ...tokens(":root[data-theme='dark'] {")]),
};

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(Object.entries(THEMES))('%s theme', (_, colors) => {
  it.each(TEXT_PAIRS)('%s on %s meets 4.5:1', (text, background) => {
    const fg = colors.get(text);
    const bg = colors.get(background);
    expect(fg, `--color-${text} as #rrggbb`).toBeDefined();
    expect(bg, `--color-${background} as #rrggbb`).toBeDefined();
    expect(contrast(fg ?? '', bg ?? '')).toBeGreaterThanOrEqual(4.5);
  });

  // A `Tile` is filled with a Child color, the same in both themes, and its text is
  // `on-child-color`: it must read on every colour of the palette.
  it.each(CHILD_COLORS.map((color) => [color.code, color.hex]))(
    'on-child-color on the Child color %s meets 4.5:1',
    (_code, hex) => {
      const fg = colors.get('on-child-color');
      expect(fg, '--color-on-child-color as #rrggbb').toBeDefined();
      expect(contrast(fg ?? '', hex)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
