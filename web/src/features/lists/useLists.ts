import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Load } from '@/shared/load';
import { deleteRow, upsertRow, useRows } from '@/shared/sync';
import type { List, ListDetails } from './listTypes';

export type ListsLoad = Load<List[]>;

/**
 * Every List the Member may see (the pull never brings the other Member's Private Lists) and the
 * ways to change them: the only data access of this feature. It reads the local store and writes
 * through the Outbox (S4), so it works the same offline. `saveFailure` is «Не удалось сохранить»
 * after the server rejected a change; the next pull has already put the server's copy back.
 */
export function useLists() {
  const rows = useRows('list') as List[] | undefined;
  // Screens pass the whole List, built on the one they show. Comparing with the current local row
  // sends only what the Member changed (Last write wins per field), as `useChildren` does.
  const current = useRef(new Map<string, ListDetails>());
  useEffect(() => {
    current.current = new Map((rows ?? []).map((list) => [list.id, list]));
  }, [rows]);

  const load = useMemo<ListsLoad>(
    () => (rows === undefined ? { status: 'loading' } : { status: 'ready', value: inOrder(rows) }),
    [rows],
  );

  /** Creates a List (`id` from `newListId()`) or changes an existing one. */
  const save = useCallback(
    async (id: string, details: ListDetails): Promise<void> => {
      const before = current.current.get(id);
      await upsertRow('list', id, before === undefined ? { ...details } : changed(before, details));
    },
    [],
  );

  /** Deletes the List (the server deletes its Items with it); resolves at once, offline too. */
  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteRow('list', id);
    },
    [],
  );

  return { load, save, remove };
}

/** The fields of `after` that differ from `before`. */
function changed(before: ListDetails, after: ListDetails): Partial<ListDetails> {
  return Object.fromEntries(
    (Object.keys(after) as (keyof ListDetails)[])
      .filter((field) => before[field] !== after[field])
      .map((field) => [field, after[field]]),
  );
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
