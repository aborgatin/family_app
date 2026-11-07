import { createContext, use } from 'react';
import type { Member, Session } from './authApi';

export interface SessionState {
  session: Session;
  /** Records that this device is now logged in as `member` (after bootstrap, login, …). */
  loggedIn: (member: Member) => void;
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
