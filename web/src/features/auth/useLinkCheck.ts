import { useCallback, useState } from 'react';
import type { ParseKeys } from 'i18next';
import { errorMessageKey } from '@/shared/api';
import { useLoad } from '@/shared/load';

export type LinkState =
  | { status: 'checking' }
  | { status: 'working' }
  | { status: 'broken'; message: ParseKeys }
  | { status: 'unreachable'; message: ParseKeys };

/**
 * Checks a one-time link (Invite, password reset) when its screen opens. A failure with one of
 * `linkErrors` means the link itself doesn't work (`broken`); any other failure means it couldn't
 * be checked (`unreachable`), and `retry()` checks again. `broke(code)` marks the link broken when
 * a later submit finds it no longer works, and says whether it did.
 */
export function useLinkCheck(
  check: () => Promise<unknown>,
  token: string,
  linkErrors: ReadonlySet<string>,
) {
  const { load, retry } = useLoad(check, token);
  const [brokenWith, setBrokenWith] = useState<string>();

  const broke = useCallback(
    (code: string) => {
      if (!linkErrors.has(code)) return false;
      setBrokenWith(code);
      return true;
    },
    [linkErrors],
  );

  let link: LinkState;
  if (brokenWith !== undefined) {
    link = { status: 'broken', message: errorMessageKey(brokenWith) };
  } else if (load.status === 'loading') {
    link = { status: 'checking' };
  } else if (load.status === 'failed') {
    const { code } = load.error;
    link = {
      status: linkErrors.has(code) ? 'broken' : 'unreachable',
      message: errorMessageKey(code),
    };
  } else {
    link = { status: 'working' };
  }

  return { link, retry, broke };
}
