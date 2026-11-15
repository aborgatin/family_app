import type { Member } from '@/features/auth';
import { api } from '@/shared/api';

// The Notifications switch is a Member profile field: changed online only (S4 exception).

/** Turns the logged-in Member's Notifications switch on or off; resolves with the Member. */
export function switchNotifications(notificationsEnabled: boolean): Promise<Member> {
  return api.patch<Member>('/api/members/me', { notificationsEnabled });
}
