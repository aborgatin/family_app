import { api } from '@/shared/api';

// Invites are online-only by design (S4 exception): they call REST directly.

/** The API's `Invite` shape (spec #5, API contract). */
export interface Invite {
  id: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

/** Only the response to creating an Invite carries its link; it can't be fetched again. */
export interface NewInvite extends Invite {
  url: string;
}

/** Active Invites only: not accepted, not revoked, not expired; newest first. */
export function fetchInvites(): Promise<Invite[]> {
  return api.get<Invite[]>('/api/invites');
}

export function createInvite(): Promise<NewInvite> {
  return api.post<NewInvite>('/api/invites');
}

/** Idempotent. */
export function revokeInvite(id: string): Promise<void> {
  return api.delete<undefined>(`/api/invites/${encodeURIComponent(id)}`);
}
