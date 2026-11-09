import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ErrorMessage } from '@/shared/api';
import type { Load } from '@/shared/load';
import { deleteRow, upsertRow, useRows, useSaveRejected } from '@/shared/sync';
import type { Child, ChildDetails } from './childrenApi';

export type ChildrenLoad = Load<Child[]>;

const SAVE_REJECTED: ErrorMessage = { key: 'sync.saveRejected', values: {} };

/**
 * The Family's Children and the ways to change them: the only data access of this feature. It
 * reads the local store and writes through the Outbox (S4), so it works the same offline; the sync
 * engine sends the changes and pulls the other Member's. `saveFailure` is «Не удалось сохранить»
 * after the server rejected a change; the next pull has already put the server's copy back.
 */
export function useChildren() {
  const rows = useRows('child') as Child[] | undefined;
  const { rejected, clear } = useSaveRejected('child');
  // The screens pass the whole Child to `save`, built on what they showed first and saved since.
  // Comparing with the same (each Child as this hook first saw it, then as last saved) sends only
  // what the Member changed, so a change from the other Member that arrived meanwhile stays (Last
  // write wins per field).
  const baseline = useRef(new Map<string, ChildDetails>());
  useEffect(() => {
    for (const child of rows ?? []) {
      if (!baseline.current.has(child.id)) baseline.current.set(child.id, child);
    }
  }, [rows]);

  const load = useMemo<ChildrenLoad>(
    () => (rows === undefined ? { status: 'loading' } : { status: 'ready', value: inOrder(rows) }),
    [rows],
  );

  /** Adds a new Child (`id` from `newChildId()`) or changes an existing one. */
  const save = useCallback(
    async (id: string, details: ChildDetails): Promise<Child> => {
      clear();
      const before = baseline.current.get(id);
      await upsertRow(
        'child',
        id,
        before === undefined ? { ...details } : changed(before, details),
      );
      baseline.current.set(id, details);
      return { id, ...details };
    },
    [clear],
  );

  const remove = useCallback(
    async (id: string) => {
      clear();
      await deleteRow('child', id);
    },
    [clear],
  );

  const retry = useCallback(() => undefined, []);

  return {
    load,
    retry,
    save,
    remove,
    saveFailure: rejected ? SAVE_REJECTED : undefined,
  };
}

/** The fields of `after` that differ from `before`. */
function changed(before: ChildDetails, after: ChildDetails): Partial<ChildDetails> {
  return Object.fromEntries(
    (Object.keys(after) as (keyof ChildDetails)[])
      .filter((field) => before[field] !== after[field])
      .map((field) => [field, after[field]]),
  );
}

/** Children are created with an id the client generates (S3). */
export function newChildId(): string {
  return crypto.randomUUID();
}

/**
 * Names compare by ICU's Russian collation, the one the server names in its query (`ru-x-icu`)
 * («ё» sorts with «е»).
 */
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
