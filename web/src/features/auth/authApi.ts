import { api } from '@/shared/api';

import type { GrammaticalGender } from '@/shared/ui';

export type { GrammaticalGender };

/** The API's `Member` shape (spec #5, API contract). */
export interface Member {
  id: string;
  email: string;
  displayName: string;
  grammaticalGender: GrammaticalGender;
  version: number;
  updatedAt: string;
}

export interface Session {
  bootstrapRequired: boolean;
  member: Member | null;
}

export interface Registration {
  email: string;
  password: string;
  displayName: string;
  grammaticalGender: GrammaticalGender;
}

/** Also makes the server issue the `XSRF-TOKEN` cookie every later write needs. */
export function fetchSession(): Promise<Session> {
  return api.get<Session>('/api/auth/session');
}

export function bootstrap(registration: Registration): Promise<Member> {
  return api.post<Member>('/api/auth/bootstrap', registration);
}

export interface Credentials {
  email: string;
  password: string;
}

export function login(credentials: Credentials): Promise<Member> {
  return api.post<Member>('/api/auth/login', credentials);
}

/** Ends this device's session only. */
export function logout(): Promise<void> {
  return api.post<undefined>('/api/auth/logout');
}

/** Whether an Invite link still works; fails with an `invite.*` code when not. */
export function fetchInvite(token: string): Promise<{ expiresAt: string }> {
  return api.get<{ expiresAt: string }>(`/api/invites/by-token/${encodeURIComponent(token)}`);
}

/** Registers the invited adult as a Member; the server logs them in on this device. */
export function acceptInvite(token: string, registration: Registration): Promise<Member> {
  return api.post<Member>(
    `/api/invites/by-token/${encodeURIComponent(token)}/accept`,
    registration,
  );
}

/** Whether a password reset link still works; fails with a `password_reset.*` code when not. */
export function fetchPasswordReset(token: string): Promise<{ expiresAt: string }> {
  return api.get<{ expiresAt: string }>(
    `/api/password-resets/by-token/${encodeURIComponent(token)}`,
  );
}

/** Sets the new password; the server logs the Member out everywhere else and in on this device. */
export function completePasswordReset(token: string, newPassword: string): Promise<Member> {
  return api.post<Member>(`/api/password-resets/by-token/${encodeURIComponent(token)}/complete`, {
    newPassword,
  });
}
