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

/** `--child-tint-amount` (a fraction) in the first block after `opener`. */
function tintAmount(opener: string): number {
  const start = css.indexOf(opener, css.indexOf('@layer base'));
  const found = /--child-tint-amount:\s*(\d+)%;/.exec(css.slice(start));
  if (!found?.[1]) throw new Error(`no --child-tint-amount after ${opener}`);
  return Number(found[1]) / 100;
}

/** `color-mix(in srgb, a amount, b)` as #rrggbb. */
function mix(a: string, b: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(channel(a, i) * amount + channel(b, i) * (1 - amount)))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

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

  // A ChildAvatar without a Child avatar shows the initial in `label` on the `child-tint` of the Child
  // color: the colour mixed into `cell` by `--child-tint-amount`, which must read on every colour.
  it.each(CHILD_COLORS.map((color) => [color.code, color.hex]))(
    'label on the child-tint of %s meets 4.5:1',
    (_code, hex) => {
      const fg = colors.get('label');
      const cell = colors.get('cell');
      const amount = tintAmount(colors === THEMES.dark ? "[data-theme='dark']" : ':root {');
      expect(contrast(fg ?? '', mix(hex, cell ?? '', amount))).toBeGreaterThanOrEqual(4.5);
    },
  );
});
