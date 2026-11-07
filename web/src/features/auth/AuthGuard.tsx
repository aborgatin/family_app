import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { ApiError, errorMessageKey } from '@/shared/api';
import { fetchSession, type Member, type Session } from './authApi';
import { SessionContext, type SessionState } from './session';

export const SETUP_PATH = '/setup';
export const LOGIN_PATH = '/login';
export const RESET_PASSWORD_PATH = '/reset-password/:token';

/** Screens a logged-out device may open: a reset link must work without logging in first. */
function isPublic(pathname: string): boolean {
  return pathname.startsWith('/reset-password/');
}

/** What the guard remembers in the `/login` history entry: where the visit was going. */
interface LoginState {
  from: string;
}

function intendedPath(state: unknown): string {
  const from = (state as Partial<LoginState> | null)?.from;
  // Only paths inside the app; never back to the auth screens themselves.
  return typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.startsWith(LOGIN_PATH)
    ? from
    : '/';
}

type Load =
  | { status: 'loading' }
  | { status: 'failed'; error: ApiError }
  | { status: 'ready'; session: Session };

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'unknown');
}

/**
 * Route guard for the whole app. Asks `GET /api/auth/session` once at start, then sends the user
 * where the answer says: to `/setup` while the installation has no Member yet, away from it after;
 * to `/login` while this device is logged out, remembering the intended path, and back to that
 * path once logged in. A password reset link opens whether or not this device is logged in.
 */
export function AuthGuard() {
  const { t } = useTranslation();
  const location = useLocation();
  const { pathname } = location;
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
            loggedOut: () => {
              setLoad({ status: 'ready', session: { bootstrapRequired: false, member: null } });
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

  const { bootstrapRequired, member } = state.session;
  const onSetup = pathname === SETUP_PATH;
  const onLogin = pathname === LOGIN_PATH;
  if (bootstrapRequired && !onSetup) {
    return <Navigate to={SETUP_PATH} replace />;
  }
  if (!bootstrapRequired && onSetup) {
    return <Navigate to="/" replace />;
  }
  if (!bootstrapRequired && member === null && !onLogin && !isPublic(pathname)) {
    const from: LoginState = { from: pathname + location.search + location.hash };
    return <Navigate to={LOGIN_PATH} state={from} replace />;
  }
  if (member !== null && onLogin) {
    return <Navigate to={intendedPath(location.state)} replace />;
  }
  return (
    <SessionContext value={state}>
      <Outlet />
    </SessionContext>
  );
}
