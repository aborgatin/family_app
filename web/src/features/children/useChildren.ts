import { useSyncedRows, type LocalLoad } from '@/shared/sync';
import type { Child } from './childTypes';

export type ChildrenLoad = LocalLoad<Child>;

/**
 * The Family's Children and the ways to change them: the only data access of this feature. It
 * reads the local store and writes through the Outbox (S4), so it works the same offline; the sync
 * engine sends the changes and pulls the other Member's. `load` is `loading` until the first local
 * read, then the Children in order. `save(id, fields)` creates a Child (`id` from `newChildId()`,
 * every field) or sets the given fields, sending only those that differ from the local row, so a
 * change from the other Member stays (Last write wins per field). `remove(id)` deletes.
 */
export function useChildren() {
  return useSyncedRows<Child>('child', inOrder);
}

/** Children are created with an id the client generates (S3). */
export function newChildId(): string {
  return crypto.randomUUID();
}

/** Names compare the Russian way («ё» sorts with «е»). */
const byName = new Intl.Collator('ru');

/** Oldest first, no birthday last, then by name, then id (spec #5, Ordering). */
function inOrder(children: Child[]): Child[] {
  return [...children].sort((a, b) => {
    if (a.birthday !== b.birthday) {
      if (a.birthday === null) return 1;
      if (b.birthday === null) return -1;
      return a.birthday < b.birthday ? -1 : 1;
    }
    return byName.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
