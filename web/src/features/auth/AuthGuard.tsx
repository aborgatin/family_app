import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import {
  asApiError,
  errorMessageKey,
  NETWORK_UNAVAILABLE,
  subscribeServerReachable,
} from '@/shared/api';
import { useLoad } from '@/shared/load';
import { claimLocalStore, ownerCopy, saveOwnerCopy, startSync } from '@/shared/sync';
import { Button, StatusScreen } from '@/shared/ui';
import { fetchSession, type Member, type Session } from './authApi';
import { isLogoutPending, sendPendingLogout } from './logoutApi';
import { SessionContext, type SessionState } from './session';

export const SETUP_PATH = '/setup';
export const LOGIN_PATH = '/login';
export const RESET_PASSWORD_PATH = '/reset-password/:token';
export const INVITE_PATH = '/invite/:token';

/** Screens a logged-out device may open: reset and Invite links work without logging in. */
function isPublic(pathname: string): boolean {
  return pathname.startsWith('/reset-password/') || pathname.startsWith('/invite/');
}

/**
 * A session as the guard holds it. `fromDevice` marks one the server hasn't confirmed yet: the
 * app started with no connection as the Member whose data the device holds.
 */
type DeviceSession = Session & { fromDevice?: true };

/** Backoff of the session check after starting from the device: 1 s doubling to 30 s. */
const FIRST_RECHECK_MS = 1000;
const LAST_RECHECK_MS = 30_000;

/**
 * The server's session, except that a device with a pending logout stays logged out: its session
 * may still be valid on the server, but the device has already wiped the Member's data.
 */
async function sessionOnThisDevice(): Promise<Session> {
  const session = await fetchSession();
  return isLogoutPending() ? { ...session, member: null } : session;
}

/**
 * The session at start. When the server can't be reached, there is no pending logout and the
 * local store has an owner, the app starts as that owner from the copy kept on the device
 * (`saveOwnerCopy`); otherwise the failure stands and the start-up error screen shows.
 */
async function sessionAtStart(): Promise<DeviceSession> {
  try {
    return await sessionOnThisDevice();
  } catch (failure: unknown) {
    if (asApiError(failure).code !== NETWORK_UNAVAILABLE || isLogoutPending()) throw failure;
    const member = await ownerCopy();
    if (!isMember(member)) throw failure;
    return { bootstrapRequired: false, member, fromDevice: true };
  }
}

function isMember(value: unknown): value is Member {
  const member = value as Partial<Member> | undefined;
  return typeof member?.id === 'string' && typeof member.email === 'string';
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

/**
 * Route guard for the whole app. Asks `GET /api/auth/session` once at start, then sends the user
 * where the answer says: to `/setup` while the installation has no Member yet, away from it after;
 * to `/login` while this device is logged out, remembering the intended path, and back to that
 * path once logged in (but not to the screen this device logged out from: then Home). Password reset and Invite links open whether or not this device is logged
 * in. With no connection at start it opens as the Member whose data the device holds
 * (`sessionAtStart`).
 */
export function AuthGuard() {
  const { t } = useTranslation();
  const location = useLocation();
  const { pathname } = location;
  const { load, retry, update } = useLoad(sessionAtStart);
  // Logging out on purpose isn't "sent to login from here": logging in again opens Home.
  const [loggedOutHere, setLoggedOutHere] = useState(false);

  const state = useMemo<SessionState | null>(
    () =>
      load.status === 'ready'
        ? {
            session: load.value,
            loggedIn: (member: Member) => {
              setLoggedOutHere(false);
              update((): Session => ({ bootstrapRequired: false, member }));
            },
            memberChanged: (member: Member) => {
              update((session) => ({ ...session, member }));
            },
            loggedOut: () => {
              setLoggedOutHere(true);
              update((): Session => ({ bootstrapRequired: false, member: null }));
            },
          }
        : null,
    [load, update],
  );

  // A logout the server hasn't heard of is sent at start and whenever the server is reachable.
  useEffect(() => {
    const send = () => void sendPendingLogout();
    send();
    const unsubscribe = subscribeServerReachable((reachable) => {
      if (reachable) send();
    });
    window.addEventListener('online', send);
    return () => {
      unsubscribe();
      window.removeEventListener('online', send);
    };
  }, []);

  // Sync runs while a Member is logged in on this device (spec #3 "Client").
  // First the store is made this Member's (wiped if another Member's data is in it), so neither
  // their screens nor the engine ever see the previous Member's rows or Outbox.
  const member = load.status === 'ready' ? load.value.member : null;
  const memberId = member?.id;
  // A session started from the device waits for the server before syncing: the session answer
  // brings the CSRF cookie every push needs, or says the session has ended.
  const confirmed = load.status === 'ready' && load.value.fromDevice !== true;
  const [storeOwner, setStoreOwner] = useState<string>();
  useEffect(() => {
    if (memberId === undefined) return undefined;
    let active = true;
    let stop: (() => void) | undefined;
    void claimLocalStore(memberId).then(() => {
      if (!active) return;
      setStoreOwner(memberId);
      if (confirmed) stop = startSync();
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [memberId, confirmed]);

  // Started from the device: the session is asked again whenever the server may be back (the
  // browser's `online`, any API answer, the foreground) and with backoff, until it answers.
  const fromDevice = load.status === 'ready' && load.value.fromDevice === true;
  useEffect(() => {
    if (!fromDevice) return undefined;
    let active = true;
    let asking = false;
    let delay = FIRST_RECHECK_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recheck = () => {
      if (asking || !active) return;
      asking = true;
      clearTimeout(timer);
      sessionOnThisDevice().then(
        (session) => {
          if (active) update((): Session => session);
        },
        () => {
          asking = false;
          if (!active) return;
          timer = setTimeout(recheck, delay);
          delay = Math.min(delay * 2, LAST_RECHECK_MS);
        },
      );
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    const unsubscribe = subscribeServerReachable((reachable) => {
      if (reachable) recheck();
    });
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', onVisibilityChange);
    timer = setTimeout(recheck, delay);
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fromDevice, update]);

  // The copy the app starts from with no connection, kept as the server last answered.
  useEffect(() => {
    if (confirmed && member !== null && storeOwner === member.id) void saveOwnerCopy(member);
  }, [confirmed, member, storeOwner]);

  if (load.status === 'loading' || (memberId !== undefined && storeOwner !== memberId)) {
    return <StatusScreen role="status">{t('common.loading')}</StatusScreen>;
  }
  if (load.status === 'failed' || state === null) {
    const code = load.status === 'failed' ? load.error.code : 'unknown';
    return (
      <StatusScreen role="alert" action={<Button onClick={retry}>{t('common.retry')}</Button>}>
        {t(errorMessageKey(code))}
      </StatusScreen>
    );
  }

  const { bootstrapRequired } = state.session;
  const onSetup = pathname === SETUP_PATH;
  const onLogin = pathname === LOGIN_PATH;
  if (bootstrapRequired && !onSetup) {
    return <Navigate to={SETUP_PATH} replace />;
  }
  if (!bootstrapRequired && onSetup) {
    return <Navigate to="/" replace />;
  }
  if (!bootstrapRequired && member === null && !onLogin && !isPublic(pathname)) {
    const from: LoginState | undefined = loggedOutHere
      ? undefined
      : { from: pathname + location.search + location.hash };
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
