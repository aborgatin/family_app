import { useCallback, useMemo } from 'react';
import { upsertRow, useRows } from '@/shared/sync';
import type { Category, Item, List } from './listTypes';

/**
 * A Shopping list's Categories and the ways to change them: the only data access for Categories.
 * It reads the local store and writes through the Outbox (S4), so it works the same offline; each
 * write sends only what it changes (Last write wins per field). `categories` are the List's, by
 * position, ties by id; `undefined` until the first local read.
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

  return { categories, add };
}

/** A new Category's id, made on the device (S3) once when its title starts being edited. */
export function newCategoryId(): string {
  return crypto.randomUUID();
}

/** One section of the Shopping list screen: a Category's open Items, or the Unnamed category's. */
export interface CategorySection {
  /** `undefined` for the Unnamed category. */
  category: Category | undefined;
  items: Item[];
}

/**
 * The Shopping list screen's sections in walking order: every Category and the Unnamed category,
 * by position (the Unnamed one's is the List's `unnamedCategoryPosition`; on a tie it goes first,
 * then the Categories by id), each with its open Items in the order given. An Item whose Category
 * isn't on the device (deleted meanwhile) is in the Unnamed category.
 */
export function sectionsInOrder(
  list: List,
  categories: readonly Category[],
  items: readonly Item[],
): CategorySection[] {
  const known = new Set(categories.map(({ id }) => id));
  const unnamed: CategorySection = {
    category: undefined,
    items: items.filter((item) => item.categoryId == null || !known.has(item.categoryId)),
  };
  const named = categories.map((category) => ({
    category,
    items: items.filter((item) => item.categoryId === category.id),
  }));
  const unnamedPosition = list.unnamedCategoryPosition ?? 0;
  const before = named.filter(({ category }) => category.position < unnamedPosition);
  const after = named.filter(({ category }) => category.position >= unnamedPosition);
  return [...before, unnamed, ...after];
}

/** By position, ties by id. */
function inOrder(categories: Category[]): Category[] {
  return [...categories].sort((a, b) =>
    a.position === b.position ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.position - b.position,
  );
}

/** The largest position among the List's Categories and its Unnamed category. */
function lastPosition(list: List, categories: readonly Category[]): number {
  return Math.max(list.unnamedCategoryPosition ?? 0, ...categories.map(({ position }) => position));
}
