import { useEffect, useState } from 'react';
import { readPushState, type PushState } from '@/shared/push';

/** This device's push state, read when the screen opens; `undefined` until it is known. */
export function usePushDevice() {
  const [state, setState] = useState<PushState>();

  useEffect(() => {
    let active = true;
    void readPushState().then((read) => {
      if (active) setState(read);
    });
    return () => {
      active = false;
    };
  }, []);

  return { state };
}
