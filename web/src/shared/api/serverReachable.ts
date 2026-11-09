import { useSyncExternalStore } from 'react';

/*
 * Whether the server answered the last API request. Every request through `api` reports here:
 * one that never got an answer (`network.unavailable`) makes the server unreachable, the next one
 * that gets any answer makes it reachable again. `navigator.onLine` is not used: it is unreliable
 * on iOS and says nothing about our server.
 */
let reachable = true;
const listeners = new Set<() => void>();
const changeListeners = new Set<(reachable: boolean) => void>();

export function reportServerReachable(value: boolean) {
  if (value === reachable) {
    return;
  }
  reachable = value;
  listeners.forEach((listener) => {
    listener();
  });
  changeListeners.forEach((listener) => {
    listener(value);
  });
}

/** Calls `listener` whenever reachability changes (the sync engine retries on `true`). */
export function subscribeServerReachable(listener: (reachable: boolean) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isServerReachable() {
  return reachable;
}

/** `false` from a request that couldn't reach the server until the next one that did. */
export function useServerReachable(): boolean {
  return useSyncExternalStore(subscribe, isServerReachable);
}
