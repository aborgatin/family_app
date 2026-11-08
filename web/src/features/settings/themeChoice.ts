/** This device's theme: follow the system («Авто»), or always light / dark. */
export type ThemeChoice = 'auto' | 'light' | 'dark';

/** The `localStorage` key the theme script in index.html reads (docs/design.md "Theme"). */
const KEY = 'theme';

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

/** Stores the choice and tells the theme script to apply it in this window now. */
export function storeThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked: the theme script can't see the choice, so the theme stays as it is.
  }
  window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
}
