import { useCallback, useMemo } from 'react';
import { deleteRow, upsertRow, useRows } from '@/shared/sync';
import type { Item, List } from './listTypes';
import { compare, normalizedName, sortableTime } from './itemKeys';

/**
 * One List's open and Done Items and the ways to change them: the only data access for Items. It reads the
 * local store and writes through the Outbox (S4), so it works the same offline. `items` is
 * `undefined` until the first local read. `saveFailure` is «Не удалось сохранить» after the server
 * rejected a change; the next pull has already put the server's copy back.
 */
export function useItems(list: Pick<List, 'id' | 'kind'>) {
  const { id: listId, kind } = list;
  const rows = useRows('item') as Item[] | undefined;

  const items = useMemo(
    () => (rows === undefined ? undefined : openInOrder(rows, listId)),
    [rows, listId],
  );
  const doneItems = useMemo(
    () => (rows === undefined ? undefined : doneInOrder(rows, listId)),
    [rows, listId],
  );

  /**
   * Adds an Item with this text, and this Description if given (non-blank), into this Category
   * (none: the Unnamed category), at the bottom, in one upsert.
   * A Shopping list never gets a second Item with a name it already has (trimmed, lower-cased): an
   * open one is left as it is and resolves, to be shown; with none open, the most recently created
   * Done one is set open in this Category, sending only `done` and `categoryId`, and the
   * Description if one is given.
   */
  const add = useCallback(
    async (text: string, categoryId?: string, description?: string): Promise<Item | undefined> => {
      const match = kind === 'SHOPPING' ? sameNamed(rows ?? [], listId, text) : undefined;
      if (match !== undefined && !match.done) return match;
      if (match !== undefined) {
        await upsertRow(
          'item',
          match.id,
          {
            done: false,
            categoryId: categoryId ?? null,
            ...(description !== undefined && { description }),
          },
          { doneById: null, doneAt: null },
        );
        return undefined;
      }
      await upsertRow('item', newItemId(), {
        listId,
        text,
        ...(categoryId !== undefined && { categoryId }),
        ...(description !== undefined && { description }),
      });
      return undefined;
    },
    [rows, listId, kind],
  );

  /** Changes the Item's text, sending only the text; resolves with it as saved. */
  const rename = useCallback(async (item: Item, text: string): Promise<string> => {
    await upsertRow('item', item.id, { text });
    return text;
  }, []);

  /**
   * Changes the Item's Description, sending only it: a blank one as `null` (none). Resolves with
   * it as saved (`''` for none).
   */
  const describe = useCallback(async (item: Item, description: string): Promise<string> => {
    const saved = description.trim() === '' ? null : description;
    await upsertRow('item', item.id, { description: saved });
    return saved ?? '';
  }, []);

  /** Moves the Item to this Category (`null`: the Unnamed category), sending only `categoryId`. */
  const move = useCallback(async (item: Item, categoryId: string | null): Promise<void> => {
    await upsertRow('item', item.id, { categoryId });
  }, []);

  /**
   * Ticks the Item off, or back on (`done` false); the server records who did it and when. Until
   * its copy arrives, the old done by / done at are cleared locally (never sent), so an Item ticked
   * back on and off again goes on top, not where it was last done.
   */
  const setDone = useCallback(async (item: Item, done: boolean): Promise<void> => {
    await upsertRow(
      'item',
      item.id,
      { done },
      { doneById: null, doneAt: null, ...(done && { doneHereAt: tickTime() }) },
    );
  }, []);

  /** Deletes the Item; resolves at once, offline too. */
  const remove = useCallback(async (item: Item): Promise<void> => {
    await deleteRow('item', item.id);
  }, []);

  return {
    items,
    doneItems,
    add,
    rename,
    describe,
    move,
    setDone,
    remove,
  };
}

/**
 * How many open Items each List has, by List id (a List with none is absent); `undefined` until
 * the first local read. Follows local writes and pulls, like `useItems()`.
 */
export function useOpenItemCounts(): ReadonlyMap<string, number> | undefined {
  const rows = useRows('item') as Item[] | undefined;
  return useMemo(() => {
    if (rows === undefined) return undefined;
    const counts = new Map<string, number>();
    for (const item of rows) {
      if (!item.done) counts.set(item.listId, (counts.get(item.listId) ?? 0) + 1);
    }
    return counts;
  }, [rows]);
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
    .sort(
      (a, b) =>
        compare(sortableTime(a.createdAt), sortableTime(b.createdAt)) || compare(a.id, b.id),
    );
}

/**
 * The List's Done Items, most recently done first (spec #3, List screen): by the server's done at,
 * ties by id. An Item ticked off on this device and not yet pulled back has no done at; it is more
 * recent than every pulled one, since the server sets done at when the tick arrives, so it goes on
 * top, the last ticked first. Its place doesn't change when the server's copy arrives.
 */
function doneInOrder(rows: Item[], listId: string): Item[] {
  return rows
    .filter((item) => item.listId === listId && item.done)
    .sort(
      (a, b) =>
        doneHere(b) - doneHere(a) ||
        compare(sortableTime(b.doneAt ?? undefined), sortableTime(a.doneAt ?? undefined)) ||
        compare(a.id, b.id),
    );
}

/**
 * The List's Item named `text` (both trimmed and lower-cased) to add again: an open one if there
 * is one, else the most recently created Done one (one not pulled back yet is newer than every
 * pulled one).
 */
function sameNamed(rows: Item[], listId: string, text: string): Item | undefined {
  const name = normalizedName(text);
  const named = rows
    .filter((item) => item.listId === listId && normalizedName(item.text) === name)
    .sort(
      (a, b) =>
        compare(sortableTime(b.createdAt), sortableTime(a.createdAt)) || compare(b.id, a.id),
    );
  return named.find((item) => !item.done) ?? named[0];
}

let lastTickTime = 0;

/** Now in ms, at least a millisecond after the last tick, so two quick ticks keep their order. */
function tickTime(): number {
  lastTickTime = Math.max(Date.now(), lastTickTime + 1);
  return lastTickTime;
}

/** When this device ticked the Item off (ms); 0 once the server's copy with done at is here. */
function doneHere(item: Item): number {
  return item.doneAt == null ? (item.doneHereAt ?? 0) : 0;
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
