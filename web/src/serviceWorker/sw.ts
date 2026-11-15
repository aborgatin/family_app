/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { notificationClickTarget } from './notificationClick';
import { readPushMessage } from './pushMessages';

// The app's service worker (frontend.md "PWA"), built by vite-plugin-pwa's injectManifest into
// `sw.js`. Only glue lives here: what a push shows and where a tap goes are the pure functions in
// pushMessages.ts and notificationClick.ts, tested without a worker.

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[];
};

// Updates: the new worker takes over at once; the open page is never reloaded (vite.config.ts).
void self.skipWaiting();
clientsClaim();

// The built shell, precached; old precaches removed. No runtime caching: the API always goes to
// the network, and navigations under /api and /actuator never get the cached shell.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api(\/|$)/, /^\/actuator(\/|$)/],
  }),
);

// Every push shows a notification, even one whose data can't be read: iOS revokes the
// subscription of a worker that shows none.
self.addEventListener('push', (event) => {
  const message = readPushMessage(pushText(event.data), new Date());
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      data: { url: message.url },
    }),
  );
});

function pushText(data: PushMessageData | null): string | undefined {
  try {
    return data?.text();
  } catch {
    return undefined;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openScreen(event.notification.data));
});

/** Focuses an open app window and takes it to the notification's screen, or opens one there. */
async function openScreen(data: unknown): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const target = notificationClickTarget(
    data,
    windows.map(({ id, url, focused }) => ({ id, url, focused })),
    self.location.origin,
  );
  if ('open' in target) {
    await self.clients.openWindow(target.open);
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
  if (navigated === null) await self.clients.openWindow(target.navigateTo);
}
