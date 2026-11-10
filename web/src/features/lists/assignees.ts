import type { FamilyMember } from '@/features/members';
import type { Item, List } from './listTypes';

/** Whether the List's todo items may have an Assignee: only on a Shared list. */
export function assignable(list: Pick<List, 'visibility'>): boolean {
  return list.visibility === 'SHARED';
}

/**
 * The Member shown as the Item's Assignee: none without one or while the Members aren't read
 * yet, and none on a Private list (whose Items have no Assignee: one the server hasn't removed yet
 * isn't shown).
 */
export function assigneeOf(
  list: Pick<List, 'visibility'>,
  item: Pick<Item, 'assigneeId'>,
  members: ReadonlyMap<string, FamilyMember> | undefined,
): FamilyMember | undefined {
  return assignable(list) && item.assigneeId != null ? members?.get(item.assigneeId) : undefined;
}
