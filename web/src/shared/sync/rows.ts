import { liveQuery } from 'dexie';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestSync } from './engine';
import { dismissSaveRejection } from './saveRejection';
import { applyLocally, localStore, type Operation, type Row, type SyncedTable } from './localStore';

/*
 * What features use to read and write synced data (S4). A write changes the local store at once
 * and appends an Outbox operation in the same transaction; the sync engine sends it when it can.
 */

/**
 * Every local row of `table`, kept up to date as the store changes (local writes and pulls);
 * `undefined` until the first read. The rows are in no particular order: sort them in the feature,
 * and give them the feature's type there (`rows as Child[]`): the store holds what the pull sent.
 */
export function useRows(table: SyncedTable): Row[] | undefined {
  const [rows, setRows] = useState<Row[]>();
  useEffect(() => {
    const subscription = liveQuery(() => localStore.rows(table).toArray()).subscribe({
      next: (value) => {
        setRows(value);
      },
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [table]);
  return rows;
}

/** The rows of a synced table in the feature's order: `loading` until the first local read. */
export type LocalLoad<T> = { status: 'loading' } | { status: 'ready'; value: T[] };

/**
 * A synced table as a feature's data hook uses it: `load` (every local row, sorted by `inOrder`,
 * a function that stays the same between renders), `save(id, fields)` (`upsertRow`) and
 * `remove(id)` (`deleteRow`). Works the same offline; a rejected change shows app-wide.
 */
export function useSyncedRows<T extends { id: string }>(
  table: SyncedTable,
  inOrder: (rows: T[]) => T[],
) {
  const rows = useRows(table) as unknown as T[] | undefined;
  const load = useMemo<LocalLoad<T>>(
    () => (rows === undefined ? { status: 'loading' } : { status: 'ready', value: inOrder(rows) }),
    [rows, inOrder],
  );
  const save = useCallback(
    (id: string, fields: Partial<Omit<T, 'id'>>) => upsertRow(table, id, fields),
    [table],
  );
  const remove = useCallback((id: string) => deleteRow(table, id), [table]);
  return { load, save, remove };
}

/**
 * Creates the row or changes the given fields of it, locally and in the Outbox. For a new row pass
 * every required field; for an existing one the fields to set: only those that differ from the
 * local row are sent (Last write wins per field, so a change from the other Member that a pull
 * brought stays). Nothing differs → nothing is written. `local` fields go only into the local row,
 * until the server's copy replaces it: they are never sent (e.g. when an Item was ticked off here,
 * which the server records itself).
 */
export async function upsertRow(
  table: SyncedTable,
  id: string,
  fields: Record<string, unknown>,
  local?: Record<string, unknown>,
): Promise<void> {
  await write(table, id, (existing): Operation | undefined => {
    const changed =
      existing === undefined
        ? fields
        : Object.fromEntries(
            Object.entries(fields).filter(([field, value]) => existing[field] !== value),
          );
    if (Object.keys(changed).length === 0) return undefined;
    return { table, id, op: 'upsert', fields: changed, ...(local !== undefined && { local }) };
  });
}

/** Deletes the row, locally and in the Outbox. */
export async function deleteRow(table: SyncedTable, id: string): Promise<void> {
  await write(table, id, () => ({ table, id, op: 'delete' }));
}

/**
 * Writes the operation `operationFor` makes from the local row (`undefined`: nothing to write) to
 * the local row and the Outbox, in one transaction, then asks the engine to sync.
 */
async function write(
  table: SyncedTable,
  id: string,
  operationFor: (existing: Row | undefined) => Operation | undefined,
) {
  // The Member is making the next change: «Не удалось сохранить» about an earlier one goes.
  dismissSaveRejection();
  const written = await localStore.transaction(
    'rw',
    [localStore.rows(table), localStore.outbox],
    async () => {
      const existing = await localStore.rows(table).get(id);
      const operation = operationFor(existing);
      if (operation === undefined) return false;
      await applyLocally(operation);
      // An upsert with no local row creates it (`Operation.creates`).
      const creates = operation.op === 'upsert' && existing === undefined;
      await localStore.outbox.add(creates ? { ...operation, creates } : operation);
      return true;
    },
  );
  if (written) requestSync();
}
