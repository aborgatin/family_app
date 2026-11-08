import type { GrammaticalGender, Member } from '@/features/auth';
import { api } from '@/shared/api';

// Member account changes are online-only by design (S4 exception): they call REST directly.

export function fetchMembers(): Promise<Member[]> {
  return api.get<Member[]>('/api/members');
}

/** Only the fields present are changed. */
export interface ProfileChange {
  displayName?: string;
  grammaticalGender?: GrammaticalGender;
}

export function updateProfile(change: ProfileChange): Promise<Member> {
  return api.patch<Member>('/api/members/me', change);
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}

/** `400 auth.invalid_credentials` when the current password is wrong. */
export function changePassword(change: PasswordChange): Promise<void> {
  return api.post<undefined>('/api/members/me/password', change);
}
