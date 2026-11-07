import { useCallback } from 'react';
import type { Member } from '@/features/auth';
import { useLoad, type Load } from '@/shared/load';
import { fetchMembers } from './membersApi';

export type MembersLoad = Load<Member[]>;

/**
 * The Family's Members, loaded from the server each time Settings opens (online-only, S4
 * exception). `replaced` puts a changed Member into the list without asking the server again.
 */
export function useMembers() {
  const { load, retry, update } = useLoad(fetchMembers);

  const replaced = useCallback(
    (member: Member) => {
      update((members) => members.map((m) => (m.id === member.id ? member : m)));
    },
    [update],
  );

  return { load, retry, replaced };
}
