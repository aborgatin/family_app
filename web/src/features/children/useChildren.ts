import { useCallback } from 'react';
import { useLoad, type Load } from '@/shared/load';
import { deleteChild, fetchChildren, putChild, type Child, type ChildDetails } from './childrenApi';

export type ChildrenLoad = Load<Child[]>;

/**
 * The Family's Children and the ways to change them: the only data access of this feature.
 * In M1 it loads from the server each time Settings opens and writes through REST (S4, planned
 * exception); M2 swaps this hook onto the local store + Outbox without touching the components.
 */
export function useChildren() {
  const { load, retry, update } = useLoad(fetchChildren);

  /** Adds a new Child (`id` from `newChildId()`) or replaces an existing one. */
  const save = useCallback(
    async (id: string, details: ChildDetails) => {
      const saved = await putChild(id, details);
      update((children) => inOrder([...children.filter((c) => c.id !== id), saved]));
      return saved;
    },
    [update],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteChild(id);
      update((children) => children.filter((c) => c.id !== id));
    },
    [update],
  );

  return { load, retry, save, remove };
}

/** Children are created with an id the client generates (S3). */
export function newChildId(): string {
  return crypto.randomUUID();
}

/**
 * Names compare by ICU's Russian collation, the one the server names in its query (`ru-x-icu`), so
 * a Child placed here lands where the next load from the server puts it («ё» sorts with «е»).
 */
const byName = new Intl.Collator('ru');

/** The API's order: oldest first, no birthday last, then by name, then id (spec #5, Ordering). */
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
