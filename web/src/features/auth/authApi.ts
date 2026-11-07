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
