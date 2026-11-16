/*
 * A new version without a force-close (#126; frontend.md "PWA", Updates). iOS keeps an installed
 * app suspended instead of closing it, so coming back to it resumes the old page, and it seldom
 * checks for a new `sw.js` on its own. So: each time the app comes back to the foreground, ask the
 * service worker to check for an update; when a new worker takes control of this page, reload it
 * once, at a moment the Member can't be in the middle of something.
 */

/** How long after coming back to the foreground a reload still counts as part of the return. */
export const RELOAD_WINDOW_MS = 10_000;

/** The input events that mean the Member has started doing something on the page. */
const INPUT_EVENTS = ['pointerdown', 'keydown'] as const;

/** What `startAppUpdates` uses of the browser; tests pass fakes. */
export interface AppUpdateEnvironment {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  /** `navigator.serviceWorker`, or undefined where there is none. */
  serviceWorker:
    | Pick<
        ServiceWorkerContainer,
        'controller' | 'getRegistration' | 'addEventListener' | 'removeEventListener'
      >
    | undefined;
  reload: () => void;
  now: () => number;
}

function browserEnvironment(): AppUpdateEnvironment {
  return {
    document,
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    reload: () => {
      window.location.reload();
    },
    now: () => Date.now(),
  };
}

/**
 * Starts watching for a new version; returns the function that stops. When a new worker takes
 * control, the page reloads at once if it came back to the foreground less than
 * `RELOAD_WINDOW_MS` ago (or just loaded) and nothing has been touched or typed since; otherwise
 * it reloads the next time it comes back to the foreground. A worker taking control of a page
 * that had none (the first install) is not a new version.
 */
export function startAppUpdates(env: AppUpdateEnvironment = browserEnvironment()): () => void {
  const { document: doc, serviceWorker } = env;
  if (!serviceWorker) return () => {};

  let hadController = serviceWorker.controller != null;
  let visibleSince: number | undefined = doc.visibilityState === 'visible' ? env.now() : undefined;
  let touched = false;
  let reloadPending = false;
  let reloaded = false;

  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    env.reload();
  };

  const checkForUpdate = () => {
    serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {
        // Offline or the check failed: the next return to the foreground tries again.
      });
  };

  const onVisibilityChange = () => {
    if (doc.visibilityState !== 'visible') {
      visibleSince = undefined;
      return;
    }
    if (reloadPending) {
      reload();
      return;
    }
    visibleSince = env.now();
    touched = false;
    checkForUpdate();
  };

  const onInput = () => {
    touched = true;
  };

  const onControllerChange = () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    const justReturned =
      visibleSince !== undefined && env.now() - visibleSince <= RELOAD_WINDOW_MS && !touched;
    if (justReturned) reload();
    else reloadPending = true;
  };

  doc.addEventListener('visibilitychange', onVisibilityChange);
  for (const type of INPUT_EVENTS) doc.addEventListener(type, onInput, { capture: true });
  serviceWorker.addEventListener('controllerchange', onControllerChange);

  return () => {
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    for (const type of INPUT_EVENTS) doc.removeEventListener(type, onInput, { capture: true });
    serviceWorker.removeEventListener('controllerchange', onControllerChange);
  };
}
