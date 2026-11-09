import { useSyncedRows, type LocalLoad } from '@/shared/sync';
import type { List } from './listTypes';

export type ListsLoad = LocalLoad<List>;

/**
 * Every List the Member may see (the pull never brings the other Member's Private Lists) and the
 * ways to change them: the only data access of this feature. It reads the local store and writes
 * through the Outbox (S4), so it works the same offline. `save(id, fields)` creates a List (`id`
 * from `newListId()`, all of name, kind and Visibility) or sets the given fields, sending only
 * those that differ from the local row; `remove(id)` deletes it (the server deletes its Items
 * with it).
 */
export function useLists() {
  return useSyncedRows<List>('list', inOrder);
}

/** Lists are created with an id the client generates (S3). */
export function newListId(): string {
  return crypto.randomUUID();
}

/** Names compare the Russian way («ё» with «е»), as Children's do. */
const byName = new Intl.Collator('ru');

/** By name, ties by id (spec #3, Home). */
function inOrder(lists: List[]): List[] {
  return [...lists].sort(
    (a, b) => byName.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
