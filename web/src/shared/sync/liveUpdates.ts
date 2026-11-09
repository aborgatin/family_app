import { subscribeServerReachable } from '@/shared/api';
import { storedVersion } from './localStore';

/*
 * Live updates (spec #3 "Live updates: SSE"): an `EventSource` on the server's stream. Its only
 * event, `changed`, carries the server's latest Version (never data); when that is above the
 * stored one, the engine is asked to sync, and the pull brings the change. The server sends one on
 * connect too, so a reconnect catches up on what was missed.
 *
 * The browser reconnects by itself after most drops. When it gives up (an error answer, e.g. the
 * server is down or the session ended), this reopens the stream with backoff (1 s doubling to
 * 30 s), and at once when the network or the server is back or the app returns to the foreground.
 */

export const LIVE_UPDATES_URL = '/api/sync/events';

const FIRST_RETRY_MS = 1000;
const LAST_RETRY_MS = 30_000;

/** Opens the stream, calling `onNewerVersion` when the server is ahead; returns the close. */
export function openLiveUpdates(onNewerVersion: () => void): () => void {
  let source: EventSource | undefined;
  let closed = false;
  let retryDelay = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const onChanged = (event: MessageEvent<string>) => {
    const version = versionOf(event.data);
    if (version === undefined) return;
    void storedVersion().then((stored) => {
      if (!closed && version > stored) onNewerVersion();
    });
  };

  const connect = () => {
    clearTimeout(retryTimer);
    source?.close();
    const current = new EventSource(LIVE_UPDATES_URL);
    source = current;
    current.addEventListener('changed', onChanged);
    current.addEventListener('open', () => {
      retryDelay = 0;
    });
    current.addEventListener('error', () => {
      if (current === source && current.readyState === EventSource.CLOSED) scheduleRetry();
    });
  };

  const scheduleRetry = () => {
    retryDelay = retryDelay === 0 ? FIRST_RETRY_MS : Math.min(retryDelay * 2, LAST_RETRY_MS);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryDelay);
  };

  /** The network, the server or the app is back: reopen a stream the browser gave up on. */
  const reconnectIfGivenUp = () => {
    if (!closed && source?.readyState === EventSource.CLOSED) connect();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') reconnectIfGivenUp();
  };

  connect();
  window.addEventListener('online', reconnectIfGivenUp);
  document.addEventListener('visibilitychange', onVisibilityChange);
  const stopReachable = subscribeServerReachable((reachable) => {
    if (reachable) reconnectIfGivenUp();
  });

  return () => {
    closed = true;
    clearTimeout(retryTimer);
    source?.close();
    window.removeEventListener('online', reconnectIfGivenUp);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    stopReachable();
  };
}

function versionOf(data: string): number | undefined {
  try {
    const { version } = JSON.parse(data) as { version?: unknown };
    return typeof version === 'number' ? version : undefined;
  } catch {
    return undefined;
  }
}
