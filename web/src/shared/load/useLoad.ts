import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { asApiError, type ApiError } from '@/shared/api';

/** Where a load from the server stands. */
export type Load<T> =
  { status: 'loading' } | { status: 'failed'; error: ApiError } | { status: 'ready'; value: T };

/**
 * Loads `fetch()` when the component mounts and again whenever `key` changes (e.g. a token from the
 * URL). A failure is kept as an `ApiError`; `retry()` goes back to loading and asks again.
 * `update(change)` changes the loaded value in place, e.g. after a save, and does nothing until
 * the value is there. An answer that arrives after unmounting, or for an older `key`, is dropped.
 */
export function useLoad<T>(fetch: () => Promise<T>, key = '') {
  const [load, setLoad] = useState<Load<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const fetchLatest = useEffectEvent(fetch);

  useEffect(() => {
    let current = true;
    fetchLatest().then(
      (value) => {
        if (current) setLoad({ status: 'ready', value });
      },
      (error: unknown) => {
        if (current) setLoad({ status: 'failed', error: asApiError(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [key, attempt]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const update = useCallback((change: (value: T) => T) => {
    setLoad((previous) =>
      previous.status === 'ready' ? { status: 'ready', value: change(previous.value) } : previous,
    );
  }, []);

  return { load, retry, update };
}
