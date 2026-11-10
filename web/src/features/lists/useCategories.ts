import { useCallback, useMemo } from 'react';
import { deleteRow, upsertRow, useRows } from '@/shared/sync';
import type { Category, Item, List } from './listTypes';

/**
 * A Shopping list's Categories and the ways to change them: the only data access for Categories
 * and the List's Unnamed category position. It reads the local store and writes through the
 * Outbox (S4), so it works the same offline; each write sends only what it changes (Last write
 * wins per field). `categories` are the List's, by position, ties by id; `undefined` until the
 * first local read. Deleting a Category leaves its Items: the server moves them to the Unnamed
 * category, and until the pull brings them so, the screens show them there anyway.
 */
export function useCategories(list: List) {
  const rows = useRows('category') as Category[] | undefined;
  const listId = list.id;
  const categories = useMemo(
    () => (rows === undefined ? undefined : inOrder(rows.filter((row) => row.listId === listId))),
    [rows, listId],
  );

  const last = lastPosition(list, categories ?? []);

  /** Adds a Category at the end of the order, after the Unnamed category too, with this id. */
  const add = useCallback(
    async (id: string, name: string): Promise<void> => {
      await upsertRow('category', id, { listId, name, position: last + 1 });
    },
    [listId, last],
  );

  const rename = useCallback(async (category: Category, name: string): Promise<void> => {
    await upsertRow('category', category.id, { name });
  }, []);

  /**
   * Moves a Category, or the Unnamed category (`undefined`), to index `to` of the Category order
   * (counted after the move): only its position is written, the midpoint between its new
   * neighbours (one past the end neighbour at the top or bottom). The Unnamed category's position
   * is a field of the List.
   */
  const move = useCallback(
    async (moved: Category | undefined, to: number): Promise<void> => {
      const order = categoryOrder(list, categories ?? []);
      const position = positionAfterMove(
        order.map((category) => category?.position ?? unnamedPosition(list)),
        order.indexOf(moved),
        to,
      );
      if (position === undefined) return;
      await (moved === undefined
        ? upsertRow('list', list.id, { unnamedCategoryPosition: position })
        : upsertRow('category', moved.id, { position }));
    },
    [list, categories],
  );

  const remove = useCallback(async (category: Category): Promise<void> => {
    await deleteRow('category', category.id);
  }, []);

  return { categories, add, rename, move, remove };
}

/** A new Category's id, made on the device (S3) once when its title starts being edited. */
export function newCategoryId(): string {
  return crypto.randomUUID();
}

/**
 * The Unnamed category's key where Categories are keyed by id (a React key, a `SortableList` id);
 * never a Category's id, since those are UUIDs.
 */
export const UNNAMED_CATEGORY_KEY = 'unnamed';

/** The Unnamed category's position: the List's, 0 on a row pulled before Categories existed. */
function unnamedPosition(list: List): number {
  return list.unnamedCategoryPosition ?? 0;
}

/**
 * The List's Categories and its Unnamed category (`undefined`) in the order the list is shown in:
 * by position (the Unnamed one's is the List's `unnamedCategoryPosition`; on a tie it goes first,
 * then the Categories by id). `categories` must be in order already.
 */
export function categoryOrder(
  list: List,
  categories: readonly Category[],
): (Category | undefined)[] {
  const unnamed = unnamedPosition(list);
  const before = categories.filter(({ position }) => position < unnamed);
  const after = categories.filter(({ position }) => position >= unnamed);
  return [...before, undefined, ...after];
}

/** A Category's open Items, or the Unnamed category's: one section of the Shopping list screen. */
export interface CategoryItems {
  /** `undefined` for the Unnamed category. */
  category: Category | undefined;
  items: Item[];
}

/**
 * Each Category's Items in `categoryOrder`, the Items in the order given. An Item whose Category
 * isn't on the device (deleted meanwhile) is in the Unnamed category.
 */
export function itemsByCategory(
  list: List,
  categories: readonly Category[],
  items: readonly Item[],
): CategoryItems[] {
  const known = new Set(categories.map(({ id }) => id));
  return categoryOrder(list, categories).map((category) => ({
    category,
    items: items.filter((item) =>
      category === undefined
        ? item.categoryId == null || !known.has(item.categoryId)
        : item.categoryId === category.id,
    ),
  }));
}

/**
 * The position of the entry at `from` moved to index `to` (counted after the move), given every
 * entry's position in order: the midpoint between its new neighbours, or one past the end
 * neighbour. `undefined` when it doesn't move.
 */
function positionAfterMove(
  positions: readonly number[],
  from: number,
  to: number,
): number | undefined {
  if (from === -1 || to === from || to < 0 || to >= positions.length) return undefined;
  const others = positions.filter((_, index) => index !== from);
  const before = others[to - 1];
  const after = others[to];
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** By position, ties by id. */
function inOrder(categories: Category[]): Category[] {
  return [...categories].sort((a, b) =>
    a.position === b.position ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.position - b.position,
  );
}

/** The largest position among the List's Categories and its Unnamed category. */
function lastPosition(list: List, categories: readonly Category[]): number {
  return Math.max(unnamedPosition(list), ...categories.map(({ position }) => position));
}
