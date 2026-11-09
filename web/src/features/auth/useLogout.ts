import { useState } from 'react';
import { asApiError, errorMessage, type ErrorMessage, NETWORK_UNAVAILABLE } from '@/shared/api';
import { flushOutbox, stopSyncAndWipe } from '@/shared/sync';
import { logout, markLogoutPending } from './logoutApi';
import { useSession } from './session';

/**
 * Logging this device out (spec #3 "Logout"): the only data access of `LogoutSection`.
 *
 * `logOut()` sends unsent changes first. When they can't be sent (the server can't be reached, or
 * the session has already ended) it sets `unsentWarning` instead: the Member confirms with
 * `logOut({discardUnsent: true})` or cancels with `dismissWarning()`. Then the server's logout,
 * and every table of the local store is wiped (rows, Outbox, the owner and its copy), so nothing of
 * the Member's data stays on the device and an offline start can't open as them. When the server
 * can't be reached the device logs out at once, and the server is told when it can be (a pending
 * logout, `logoutApi.ts`); a session that has already ended counts as logged out.
 */
export function useLogout() {
  const { loggedOut } = useSession();
  const [error, setError] = useState<ErrorMessage>();
  const [pending, setPending] = useState(false);
  const [unsentWarning, setUnsentWarning] = useState(false);

  async function logOut({ discardUnsent = false }: { discardUnsent?: boolean } = {}) {
    setError(undefined);
    setPending(true);
    if (!discardUnsent) {
      try {
        await flushOutbox();
      } catch {
        setPending(false);
        setUnsentWarning(true);
        return;
      }
    }
    try {
      await logout();
    } catch (failure: unknown) {
      const apiError = asApiError(failure);
      if (apiError.code === NETWORK_UNAVAILABLE) {
        // Logged out on this device now; the server is told once it can be reached.
        markLogoutPending();
      } else if (apiError.code !== 'auth.required') {
        // `auth.required`: the session had already ended (e.g. expired): logged out either way.
        setPending(false);
        setError(errorMessage(apiError));
        return;
      }
    }
    await stopSyncAndWipe();
    loggedOut();
  }

  return {
    logOut,
    pending,
    error,
    unsentWarning,
    /** Hides the warning: the Member cancelled and keeps everything. */
    dismissWarning: () => {
      setUnsentWarning(false);
    },
  };
}
