import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The inline script in index.html applies the theme before React starts, so the wrong theme never
// flashes. These tests run that script as the browser would, against a copy of index.html's head.
const html = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8');
const head = /<head>([\s\S]*)<\/head>/.exec(html)?.[1] ?? '';
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(head)?.[1] ?? '';

type Listener = () => void;

/** Stubs `matchMedia('(prefers-color-scheme: dark)')`; returns a way to flip the system theme. */
function systemTheme(dark: boolean) {
  const listeners: Listener[] = [];
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: Listener) => listeners.push(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return (nowDark: boolean) => {
    query.matches = nowDark;
    listeners.forEach((listener) => {
      listener();
    });
  };
}

function runScript() {
  document.head.innerHTML = head.replace(/<script[\s\S]*?<\/script>/g, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs index.html's own inline script
  const script = new Function(inlineScript) as () => void;
  script();
}

const theme = () => document.documentElement.dataset.theme;
const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

describe('theme script in index.html', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the system by default', () => {
    systemTheme(true);

    runScript();

    expect(theme()).toBe('dark');
    expect(themeColor()).toBe('#000000');
  });

  it('follows the system when it changes', () => {
    const flip = systemTheme(false);
    runScript();
    expect(theme()).toBe('light');
    expect(themeColor()).toBe('#f2f2f7');

    flip(true);

    expect(theme()).toBe('dark');
    expect(themeColor()).toBe('#000000');
  });

  it('applies the stored choice over the system', () => {
    systemTheme(true);
    localStorage.setItem('theme', 'light');

    runScript();

    expect(theme()).toBe('light');
    expect(themeColor()).toBe('#f2f2f7');
  });

  it('re-applies when the stored choice changes', () => {
    systemTheme(false);
    runScript();

    localStorage.setItem('theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));

    expect(theme()).toBe('dark');
    expect(themeColor()).toBe('#000000');
  });

  it('treats an unknown stored value as «Авто»', () => {
    systemTheme(false);
    localStorage.setItem('theme', 'sepia');

    runScript();

    expect(theme()).toBe('light');
  });
});
