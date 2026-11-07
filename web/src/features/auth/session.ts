import { createContext, use } from 'react';
import type { Member, Session } from './authApi';

export interface SessionState {
  session: Session;
  /** Records that this device is now logged in as `member` (after bootstrap, login, …). */
  loggedIn: (member: Member) => void;
  /** Records a change to the logged-in Member's own profile (display name, …). */
  memberChanged: (member: Member) => void;
  /** Records that this device's session has ended; the route guard then shows the login screen. */
  loggedOut: () => void;
}

export const SessionContext = createContext<SessionState | null>(null);

/** The session the route guard loaded. Only usable below the guard. */
export function useSession(): SessionState {
  const state = use(SessionContext);
  if (state === null) {
    throw new Error('useSession() must be used inside <AuthGuard>');
  }
  return state;
}
