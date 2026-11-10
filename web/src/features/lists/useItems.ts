import { useCallback, useMemo } from 'react';
import { deleteRow, upsertRow, useRows } from '@/shared/sync';
import type { Item, List, ListKind, Repeat } from './listTypes';
import { compare, normalizedName, sortableTime } from './itemKeys';

/**
 * One List's open and Done Items and the ways to change them: the only data access for Items. It reads the
 * local store and writes through the Outbox (S4), so it works the same offline. `items` is
 * `undefined` until the first local read. On a Todo list `doneItems` are only those marked Done
 * today or in the six calendar days before, by the device clock, and not hidden by «Скрыть»
 * (`hideDone`, `hidden()`), and `earlierDoneItems` the rest («Выполненные ранее»); on other Lists `doneItems` are all of them and `earlierDoneItems` is empty. `saveFailure` is «Не удалось сохранить» after the server
 * rejected a change; the next pull has already put the server's copy back.
 */
export function useItems(list: Pick<List, 'id' | 'kind' | 'doneHiddenAt' | 'doneHiddenHereAt'>) {
  const { id: listId, kind, doneHiddenAt, doneHiddenHereAt } = list;
  const rows = useRows('item') as Item[] | undefined;

  const items = useMemo(
    () => (rows === undefined ? undefined : openInOrder(rows, listId, kind)),
    [rows, listId, kind],
  );
  const allDoneItems = useMemo(
    () => (rows === undefined ? undefined : doneInOrder(rows, listId)),
    [rows, listId],
  );
  // A Todo list's Done window; a number, so the split below is redone only when the day changes.
  const windowStart = kind === 'TODO' ? doneWindowStart(new Date()) : undefined;
  const earlier = useCallback(
    (item: Item) =>
      kind === 'TODO' &&
      (doneBefore(item, windowStart) || hidden(item, doneHiddenAt, doneHiddenHereAt)),
    [kind, windowStart, doneHiddenAt, doneHiddenHereAt],
  );
  const doneItems = useMemo(
    () => allDoneItems?.filter((item) => !earlier(item)),
    [allDoneItems, earlier],
  );
  const earlierDoneItems = useMemo(
    () => allDoneItems?.filter((item) => earlier(item)),
    [allDoneItems, earlier],
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
   * Sets a todo item's Due date to this day (`YYYY-MM-DD`), sending only `dueDate`; `null` removes
   * the Due date, and its time and Repeat with it (the server clears both too).
   */
  const setDueDate = useCallback(async (item: Item, dueDate: string | null): Promise<void> => {
    await upsertRow(
      'item',
      item.id,
      dueDate === null ? { dueDate, dueTime: null, repeat: null } : { dueDate },
    );
  }, []);

  /** Sets the time of day (`HH:MM`) of a todo item's Due date, or removes it (`null`). */
  const setDueTime = useCallback(async (item: Item, dueTime: string | null): Promise<void> => {
    await upsertRow('item', item.id, { dueTime });
  }, []);

  /** Sets a todo item's Repeat, or removes it (`null`), sending only `repeat`. */
  const setRepeat = useCallback(async (item: Item, repeat: Repeat | null): Promise<void> => {
    await upsertRow('item', item.id, { repeat });
  }, []);

  /** Makes this Member the todo item's Assignee, or nobody (`null`), sending only `assigneeId`. */
  const setAssignee = useCallback(async (item: Item, assigneeId: string | null): Promise<void> => {
    await upsertRow('item', item.id, { assigneeId });
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

  /**
   * Hide done («Скрыть», a Todo list's): every Item now in «Выполнено» moves to «Выполненные
   * ранее», for both Members. Sends `hideDone`, a new id for every press (so each press is sent,
   * and a repeated push of it is applied once, S3); the server stamps the moment (`doneHiddenAt`).
   * Until its copy arrives, the press is kept here as `doneHiddenHereAt` (never sent), so it works
   * offline at once.
   */
  const hideDone = useCallback(async (): Promise<void> => {
    await upsertRow(
      'list',
      listId,
      { hideDone: crypto.randomUUID() },
      { doneHiddenHereAt: tickTime() },
    );
  }, [listId]);

  return {
    items,
    doneItems,
    earlierDoneItems,
    add,
    rename,
    describe,
    move,
    setDueDate,
    setDueTime,
    setRepeat,
    setAssignee,
    setDone,
    remove,
    hideDone,
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
 * The List's open Items. In the order added, newest at the bottom (spec #3, List screen): by the
 * server's created at, ties by id. An Item added on this device and not yet pulled back has no
 * created at; it is newer than every pulled one, and its time-ordered id keeps those in the order
 * they were added. On a Todo list (spec #81) the ones with a Due date come first, soonest on top:
 * by day, on one day those with a time before those without, by time, then in the order added;
 * the ones without a Due date follow in the order added.
 */
function openInOrder(rows: Item[], listId: string, kind: ListKind): Item[] {
  return rows
    .filter((item) => item.listId === listId && !item.done)
    .sort(
      (a, b) =>
        (kind === 'TODO' ? compare(dueKey(a), dueKey(b)) : 0) ||
        compare(sortableTime(a.createdAt), sortableTime(b.createdAt)) ||
        compare(a.id, b.id),
    );
}

/**
 * Orders Items by Due date as text: `YYYY-MM-DD` and `HH:MM` sort as they read; a day without a
 * time goes after that day's times, and no Due date after every day.
 */
function dueKey(item: Item): string {
  return item.dueDate == null ? '~' : `${item.dueDate} ${item.dueTime ?? '~'}`;
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

/** How many calendar days a Todo list's Done section covers: today and the six days before. */
const DONE_WINDOW_DAYS = 7;

/** The start (ms) of the first calendar day of the Done window that ends on `now`'s day, by the device clock. */
function doneWindowStart(now: Date): number {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (DONE_WINDOW_DAYS - 1),
  ).getTime();
}

/**
 * Whether the Item was marked Done before the window that starts at `windowStart` (none: nothing
 * is). One ticked off on this device and not pulled back yet has no done at: it was done just now.
 */
function doneBefore(item: Item, windowStart: number | undefined): boolean {
  return windowStart !== undefined && item.doneAt != null && Date.parse(item.doneAt) < windowStart;
}

/**
 * Whether «Скрыть» hid the Done Item: the List's Done items marked Done up to the server's
 * `doneHiddenAt`. While a press made here (`doneHiddenHereAt`) is not sent yet, the server's moment
 * will come after every Done time it has already given, so every Item with one is hidden, and one
 * ticked off here and not pulled back is hidden when it was ticked before the press (both by this
 * device's `tickTime()`). One ticked off here after a press the server has stamped is not: its
 * Done time will be later.
 */
function hidden(
  item: Item,
  doneHiddenAt: string | null | undefined,
  doneHiddenHereAt: number | undefined,
): boolean {
  if (item.doneAt == null) {
    return doneHiddenHereAt !== undefined && (item.doneHereAt ?? 0) <= doneHiddenHereAt;
  }
  if (doneHiddenHereAt !== undefined) return true;
  return doneHiddenAt != null && Date.parse(item.doneAt) <= Date.parse(doneHiddenAt);
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
