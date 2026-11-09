import { useCallback, useMemo } from 'react';
import type { ErrorMessage } from '@/shared/api';
import { deleteRow, upsertRow, useRows, useSaveRejected } from '@/shared/sync';
import type { Item } from './listTypes';

const SAVE_REJECTED: ErrorMessage = { key: 'sync.saveRejected', values: {} };

/**
 * One List's open Items and the ways to change them: the only data access for Items. It reads the
 * local store and writes through the Outbox (S4), so it works the same offline. `items` is
 * `undefined` until the first local read. `saveFailure` is «Не удалось сохранить» after the server
 * rejected a change; the next pull has already put the server's copy back.
 */
export function useItems(listId: string) {
  const rows = useRows('item') as Item[] | undefined;
  const { rejected, clear } = useSaveRejected('item');

  const items = useMemo(
    () => (rows === undefined ? undefined : openInOrder(rows, listId)),
    [rows, listId],
  );

  /** Adds an Item with this text at the bottom. */
  const add = useCallback(
    async (text: string): Promise<void> => {
      clear();
      await upsertRow('item', newItemId(), { listId, text });
    },
    [clear, listId],
  );

  /** Changes the Item's text, sending only the text; resolves with it as saved. */
  const rename = useCallback(
    async (item: Item, text: string): Promise<string> => {
      clear();
      await upsertRow('item', item.id, { text });
      return text;
    },
    [clear],
  );

  /** Deletes the Item; resolves at once, offline too. */
  const remove = useCallback(
    async (item: Item): Promise<void> => {
      clear();
      await deleteRow('item', item.id);
    },
    [clear],
  );

  return { items, add, rename, remove, saveFailure: rejected ? SAVE_REJECTED : undefined };
}

/**
 * The List's open Items in the order added, newest at the bottom (spec #3, List screen): by the
 * server's created at, ties by id. An Item added on this device and not yet pulled back has no
 * created at; it is newer than every pulled one, and its time-ordered id keeps those in the order
 * they were added.
 */
function openInOrder(rows: Item[], listId: string): Item[] {
  return rows
    .filter((item) => item.listId === listId && !item.done)
    .sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id));
}

/** Ascending; a missing value after every present one. */
function compare(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : 1;
}

let lastIdTime = 0;

/**
 * Items are created with an id the client generates (S3): a UUID version 7, whose first 48 bits
 * are the time in milliseconds, so ids made on this device sort in the order they were made (each
 * one at least a millisecond after the last).
 */
export function newItemId(): string {
  lastIdTime = Math.max(Date.now(), lastIdTime + 1);
  const time = lastIdTime.toString(16).padStart(12, '0');
  // A random version 4 UUID gives the random bits and the variant; version 7 replaces the version.
  const random = crypto.randomUUID();
  return `${time.slice(0, 8)}-${time.slice(8, 12)}-7${random.slice(15)}`;
}
