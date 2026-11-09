import { api, asApiError } from '@/shared/api';

/*
 * Logout, and a logout the server hasn't heard of yet. Logging out while the server can't be
 * reached logs the device out at once (store wiped, login screen), but the session may still be
 * valid on the server. A flag in `localStorage`, which survives restarts, then keeps the device
 * logged out until the server is told (`sendPendingLogout`) or the device logs in again
 * (`loggingIn`).
 */

const PENDING_KEY = 'family-app.logout-pending';

let sending: Promise<void> | undefined;
/** While a login is under way a pending logout waits: it would end the new session. */
let loginsUnderWay = 0;

/** Ends this device's session only. */
export function logout(): Promise<void> {
  return api.post<undefined>('/api/auth/logout');
}

export function isLogoutPending(): boolean {
  try {
    return localStorage.getItem(PENDING_KEY) !== null;
  } catch {
    return false;
  }
}

export function markLogoutPending(): void {
  try {
    localStorage.setItem(PENDING_KEY, 'true');
  } catch {
    // Storage blocked: the device still logs out; a restart may find the session again.
  }
}

function clearLogoutPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing was stored then.
  }
}

/**
 * Tells the server about a pending logout, if there is one; resolves either way. One at a time;
 * a session the server has already ended (`auth.required`) counts as told.
 */
export function sendPendingLogout(): Promise<void> {
  if (!isLogoutPending() || loginsUnderWay > 0) return Promise.resolve();
  sending ??= logout()
    .then(clearLogoutPending, (failure: unknown) => {
      if (asApiError(failure).code === 'auth.required') clearLogoutPending();
    })
    .finally(() => {
      sending = undefined;
    });
  return sending;
}

/**
 * Logs in through `request` (bootstrap, login, Invite, password reset). A pending logout is sent
 * first and never during the login, so it can't end the new session; a login ends it.
 */
export async function loggingIn<T>(request: () => Promise<T>): Promise<T> {
  await sendPendingLogout();
  loginsUnderWay += 1;
  try {
    const result = await request();
    clearLogoutPending();
    return result;
  } finally {
    loginsUnderWay -= 1;
  }
}
