import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
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

/**
 * Creates the row or changes the given fields of it, locally and in the Outbox. For a new row pass
 * every required field; for an existing one only the fields that changed (Last write wins per
 * field). Nothing to change → nothing is written. `local` fields go only into the local row, until
 * the server's copy replaces it: they are never sent (e.g. when an Item was ticked off here, which
 * the server records itself).
 */
export async function upsertRow(
  table: SyncedTable,
  id: string,
  fields: Record<string, unknown>,
  local?: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  await write({ table, id, op: 'upsert', fields, ...(local !== undefined && { local }) });
}

/** Deletes the row, locally and in the Outbox. */
export async function deleteRow(table: SyncedTable, id: string): Promise<void> {
  await write({ table, id, op: 'delete' });
}

async function write(operation: Operation) {
  // The Member is making the next change: «Не удалось сохранить» about an earlier one goes.
  dismissSaveRejection();
  await localStore.transaction(
    'rw',
    [localStore.rows(operation.table), localStore.outbox],
    async () => {
      const creates =
        operation.op === 'upsert' &&
        (await localStore.rows(operation.table).get(operation.id)) === undefined;
      await applyLocally(operation);
      await localStore.outbox.add(creates ? { ...operation, creates } : operation);
    },
  );
  requestSync();
}
