/*
 * The test network, like a phone's signal: `network.goOffline()` makes every request fail like a
 * lost network (fetch rejects with a TypeError), whichever MSW handler would have answered it, so
 * an "offline" test can't pass because some endpoint still answered. `setup.ts` installs it for
 * every test and goes back online after each.
 *
 *   network.goOffline();   // no signal: every request fails
 *   network.goOnline();    // the server answers again (the app notices on its next request)
 *
 * To fail only the sync API while the rest answers, say so: `syncServer.failSyncOnly()`.
 */

import { encodeMultipart } from './multipart';

let offline = false;

export const network = {
  get offline(): boolean {
    return offline;
  },
  goOffline() {
    offline = true;
  },
  goOnline() {
    offline = false;
  },
};

/**
 * Wraps `fetch` (after MSW has patched it) so requests fail while the network is offline, and a
 * `FormData` body goes as `multipart/form-data` (`multipart.ts`).
 */
export function installNetwork() {
  const answering = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (offline) throw new TypeError('Failed to fetch');
    if (!(init?.body instanceof FormData)) return answering(input, init);
    const { body, contentType } = await encodeMultipart(init.body);
    const headers = new Headers(init.headers);
    headers.set('Content-Type', contentType);
    return answering(input, { ...init, headers, body });
  };
}
