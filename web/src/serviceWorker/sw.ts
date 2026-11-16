/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { openScreen } from './notificationClick';
import { readPushMessage } from './pushMessages';

// The app's service worker (frontend.md "PWA"), built by vite-plugin-pwa's injectManifest into
// `sw.js`. Only glue lives here: what a push shows and where a tap goes are the pure functions in
// pushMessages.ts and notificationClick.ts, tested without a worker.

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[];
};

// Updates: the new worker takes over at once; the page reloads itself at a safe moment
// (startAppUpdates in @/shared/pwa).
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
  event.waitUntil(openScreen(self.clients, event.notification.data, self.location.origin));
});
