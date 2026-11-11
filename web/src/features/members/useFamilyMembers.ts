import { useMemo } from 'react';
import type { GrammaticalGender } from '@/features/auth';
import { useRows } from '@/shared/sync';

/** A Member as the local store keeps them (the fields the sync pull sends: no email). */
export interface FamilyMember {
  id: string;
  displayName: string;
  /** Absent on a row pulled before it was asked for. */
  grammaticalGender?: GrammaticalGender | null;
}

/**
 * The Family's Members on the local store, by id, for saying who did something (who added an
 * Item, who marked it Done): there offline too, unlike `useMembers()`. `undefined` until the first
 * local read. Read-only: Member changes stay online-only (S4 exception).
 */
export function useFamilyMembers(): ReadonlyMap<string, FamilyMember> | undefined {
  const rows = useRows('member') as FamilyMember[] | undefined;
  return useMemo(
    () => (rows === undefined ? undefined : new Map(rows.map((member) => [member.id, member]))),
    [rows],
  );
}
