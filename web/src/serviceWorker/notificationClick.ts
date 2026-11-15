// What a tap on a push does (spec #104 "Service worker"). The choice of window and URL is pure;
// openScreen carries it out against the worker's `clients`, which tests replace with fakes.

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

/** An open app window the worker can act on: the parts of a `WindowClient` a tap uses. */
export interface AppWindowClient extends AppWindow {
  focus(): Promise<unknown>;
  /** Resolves to the window, or rejects when the worker doesn't control it yet. */
  navigate(url: string): Promise<AppWindowClient | null>;
}

/** The parts of the worker's `clients` a tap uses. */
export interface AppClients {
  matchAll(options: {
    type: 'window';
    includeUncontrolled: boolean;
  }): Promise<readonly AppWindowClient[]>;
  openWindow(url: string): Promise<unknown>;
}

/**
 * Carries out a tap on a notification with `data`: focuses an open app window and takes it to the
 * notification's screen, or opens a new window there.
 */
export async function openScreen(
  clients: AppClients,
  data: unknown,
  origin: string,
): Promise<void> {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const target = notificationClickTarget(data, [...windows], origin);
  if ('open' in target) {
    await clients.openWindow(target.open);
    return;
  }
  const window = windows.find((w) => w.id === target.focus);
  if (window === undefined) return;
  if (target.navigateTo === undefined) {
    await window.focus();
    return;
  }
  // Navigate first, so the screen changes even if focusing is refused. navigate() fails for a
  // window this worker doesn't control yet: open the screen in a new window instead.
  const navigated = await window.navigate(target.navigateTo).catch(() => null);
  await (navigated ?? window).focus();
  if (navigated === null) await clients.openWindow(target.navigateTo);
}
