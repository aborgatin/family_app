import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import { logout } from './authApi';
import { useSession } from './session';

/**
 * Logs this device out (the Member's other devices stay logged in). Online-only (S4 exception):
 * when the server can't be reached the device stays logged in and says so.
 */
export function LogoutButton() {
  const { t } = useTranslation();
  const { loggedOut } = useSession();
  const [error, setError] = useState<ErrorMessage>();
  const [pending, setPending] = useState(false);

  async function logOut() {
    setError(undefined);
    setPending(true);
    try {
      await logout();
      loggedOut();
    } catch (failure: unknown) {
      const apiError = failure instanceof ApiError ? failure : new ApiError(0, 'unknown');
      if (apiError.code === 'auth.required') {
        // The session had already ended (e.g. expired): this device is logged out either way.
        loggedOut();
        return;
      }
      setPending(false);
      setError(errorMessage(apiError));
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          void logOut();
        }}
      >
        {pending ? t('logout.inProgress') : t('logout.action')}
      </button>
      {error !== undefined && <p role="alert">{t(error.key, error.values)}</p>}
    </>
  );
}
