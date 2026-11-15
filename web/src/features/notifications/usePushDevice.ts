import { useCallback, useEffect, useState } from 'react';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import { readPushState, subscribeThisDevice, type PushState } from '@/shared/push';

/**
 * This device's push state, read when the screen opens (`undefined` until it is known), and
 * `enable()`, which asks for permission and subscribes. Call `enable()` inside the tap: iOS shows
 * its permission prompt only then. `failure` is why the server couldn't be told.
 */
export function usePushDevice() {
  const [state, setState] = useState<PushState>();
  const [failure, setFailure] = useState<ErrorMessage>();

  useEffect(() => {
    let active = true;
    void readPushState().then((read) => {
      if (active) setState((current) => current ?? read);
    });
    return () => {
      active = false;
    };
  }, []);

  const enable = useCallback(() => {
    setFailure(undefined);
    subscribeThisDevice().then(setState, (error: unknown) => {
      setState('notSubscribed');
      setFailure(errorMessage(asApiError(error)));
    });
  }, []);

  return { state, failure, enable };
}
