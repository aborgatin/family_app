import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { ApiError, errorMessageKey } from '@/shared/api';
import { fetchSession, type Member, type Session } from './authApi';
import { SessionContext, type SessionState } from './session';

export const SETUP_PATH = '/setup';

type Load =
  | { status: 'loading' }
  | { status: 'failed'; error: ApiError }
  | { status: 'ready'; session: Session };

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'unknown');
}

/**
 * Route guard for the whole app. Asks `GET /api/auth/session` once at start, then sends the user
 * where the answer says: to `/setup` while the installation has no Member yet, away from it after.
 */
export function AuthGuard() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    fetchSession().then(
      (session) => {
        if (current) setLoad({ status: 'ready', session });
      },
      (error: unknown) => {
        if (current) setLoad({ status: 'failed', error: asApiError(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const state = useMemo<SessionState | null>(
    () =>
      load.status === 'ready'
        ? {
            session: load.session,
            loggedIn: (member: Member) => {
              setLoad({ status: 'ready', session: { bootstrapRequired: false, member } });
            },
          }
        : null,
    [load],
  );

  if (load.status === 'loading') {
    return <p role="status">{t('common.loading')}</p>;
  }
  if (load.status === 'failed' || state === null) {
    const code = load.status === 'failed' ? load.error.code : 'unknown';
    return (
      <main>
        <p role="alert">{t(errorMessageKey(code))}</p>
        <button
          type="button"
          onClick={() => {
            setLoad({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
        >
          {t('common.retry')}
        </button>
      </main>
    );
  }

  const onSetup = pathname === SETUP_PATH;
  if (state.session.bootstrapRequired && !onSetup) {
    return <Navigate to={SETUP_PATH} replace />;
  }
  if (!state.session.bootstrapRequired && onSetup) {
    return <Navigate to="/" replace />;
  }
  return (
    <SessionContext value={state}>
      <Outlet />
    </SessionContext>
  );
}
