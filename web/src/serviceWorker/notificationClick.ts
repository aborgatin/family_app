// What a tap on a push does (spec #104 "Service worker"). Pure: the worker passes in the
// notification's data and its open app windows, and carries out the answer.

/** An open app window, as the worker's `clients.matchAll({ type: 'window' })` sees it. */
export interface AppWindow {
  id: string;
  url: string;
  focused: boolean;
}

/** Focus that window (and take it to `navigateTo`, unless it is already there), or open one. */
export type ClickTarget = { focus: string; navigateTo?: string } | { open: string };

/**
 * Where a tap on a notification with `data` (its payload's `{ url }`) goes: the focused open app
 * window, else the first, taken to the payload's screen; or a new window there when none is open.
 * A missing URL, or one that isn't a path in this app, goes to `/`.
 */
export function notificationClickTarget(
  data: unknown,
  windows: AppWindow[],
  origin: string,
): ClickTarget {
  const url = new URL(screenPath(data), origin).href;
  const window = windows.find((w) => w.focused) ?? windows[0];
  if (window === undefined) return { open: url };
  return window.url === url ? { focus: window.id } : { focus: window.id, navigateTo: url };
}

/** The payload's path, or `/` when it has none or it leads off this app. */
function screenPath(data: unknown): string {
  const url = typeof data === 'object' && data !== null && 'url' in data ? data.url : undefined;
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}
