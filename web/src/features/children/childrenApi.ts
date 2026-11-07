import { api } from '@/shared/api';

// Online-only until M2 (S4, planned exception): only useChildren() calls these, so M2 can move
// Children onto the local store + Outbox by changing the hook, not the components.

/** A Child as the API returns it (spec #5, API contract). */
export interface Child {
  id: string;
  name: string;
  /** A Child color palette code. */
  color: string;
  /** `YYYY-MM-DD`, or `null` when unknown. */
  birthday: string | null;
  version: number;
  updatedAt: string;
}

/** What a Member edits: the body of `PUT /api/children/{id}`. */
export interface ChildDetails {
  name: string;
  color: string;
  birthday: string | null;
}

/** Non-deleted Children, oldest first, those without a birthday last, then by name. */
export function fetchChildren(): Promise<Child[]> {
  return api.get<Child[]>('/api/children');
}

/** Creates or replaces the Child with this client-generated id; repeatable. */
export function putChild(id: string, details: ChildDetails): Promise<Child> {
  return api.put<Child>(`/api/children/${id}`, details);
}

/** Soft delete; succeeds even if the Child is already gone. */
export function deleteChild(id: string): Promise<void> {
  return api.delete<undefined>(`/api/children/${id}`);
}
