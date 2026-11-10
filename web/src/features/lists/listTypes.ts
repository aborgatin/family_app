import type { ParseKeys } from 'i18next';

// The shapes of Lists and Items. They are read from the local store and written through the
// Outbox by `useLists()` and `useItems()` only (S4); there are no REST calls for them.

/** A List's kind (GLOSSARY: Shopping list, Todo list, Wish list); fixed once created. */
export type ListKind = 'SHOPPING' | 'TODO' | 'WISH';

/** Private (only the Owner sees it) or Shared (every Member does). A Wish list is always Shared. */
export type Visibility = 'PRIVATE' | 'SHARED';

/** A List as the local store keeps it (the fields the sync pull sends). */
export interface List {
  id: string;
  name: string;
  kind: ListKind;
  visibility: Visibility;
  /**
   * The Unnamed category's place among the Categories (a Shopping list's): ordered with their
   * positions. Absent on a row pulled before Categories existed: 0.
   */
  unnamedCategoryPosition?: number;
  /** The Owner's Member id. Set by the server: absent until the pull after creating the List. */
  ownerId?: string;
  /** ISO-8601. Set by the server: absent until the pull after creating the List. */
  createdAt?: string;
}

/** What a Member writes: everything when creating, the changed fields afterwards. */
export interface ListDetails {
  name: string;
  kind: ListKind;
  visibility: Visibility;
}

/** An Item as the local store keeps it (the fields the sync pull sends). */
export interface Item {
  id: string;
  listId: string;
  text: string;
  /** The Item's Category in a Shopping list; none (`null` or absent) is the Unnamed category. */
  categoryId?: string | null;
  note: string | null;
  /** Done, and who marked it Done and when (set by the server when Done changes). */
  done: boolean;
  doneById?: string | null;
  doneAt?: string | null;
  /**
   * When this device ticked it off (ms), kept only until the server's copy with its done at
   * arrives; never sent (the server sets done at itself).
   */
  doneHereAt?: number;
  /** The Creator's Member id. Set by the server: absent until the pull after adding the Item. */
  creatorId?: string;
  /** ISO-8601. Set by the server: absent until the pull after adding the Item. */
  createdAt?: string;
}

/** A Category of a Shopping list as the local store keeps it (the fields the sync pull sends). */
export interface Category {
  id: string;
  listId: string;
  name: string;
  /** The ordering key: by position, ties by id; the Unnamed category's is the List's. */
  position: number;
}

export const LIST_KINDS: readonly ListKind[] = ['SHOPPING', 'TODO', 'WISH'];

/** Whether a List of this kind has a Visibility to choose: a Wish list is always Shared. */
export function hasVisibility(kind: ListKind): boolean {
  return kind !== 'WISH';
}

/** The «Личный» / «Общий» segments, wherever a List's Visibility is chosen. */
export const VISIBILITY_CHOICES: readonly { value: Visibility; label: ParseKeys }[] = [
  { value: 'PRIVATE', label: 'lists.visibility.private' },
  { value: 'SHARED', label: 'lists.visibility.shared' },
];

/** The texts that depend on a List's kind. */
export const KIND_TEXTS: Record<
  ListKind,
  {
    /** The kind's segment in «Вид». */
    choice: ParseKeys;
    /** The kind as a row's subtitle on Home. */
    name: ParseKeys;
    /** The List screen while the List has no Items. */
    noItems: ParseKeys;
    /** The header of the List screen's Items. */
    items: ParseKeys;
    /** An Item's text field, «Товар «{{text}}»». */
    itemText: ParseKeys;
    /** The last row, which adds an Item. */
    newItem: ParseKeys;
    /** The kind's Done label, heading the Done Items. */
    done: ParseKeys;
    /** An Item's Done toggle, «Куплено «{{text}}»». */
    doneToggle: ParseKeys;
  }
> = {
  SHOPPING: {
    choice: 'lists.kind.shopping',
    name: 'lists.kindName.shopping',
    noItems: 'lists.noItems.shopping',
    items: 'lists.items.shopping',
    itemText: 'lists.itemText.shopping',
    newItem: 'lists.newItem.shopping',
    done: 'lists.done.shopping',
    doneToggle: 'lists.doneToggle.shopping',
  },
  TODO: {
    choice: 'lists.kind.todo',
    name: 'lists.kindName.todo',
    noItems: 'lists.noItems.todo',
    items: 'lists.items.todo',
    itemText: 'lists.itemText.todo',
    newItem: 'lists.newItem.todo',
    done: 'lists.done.todo',
    doneToggle: 'lists.doneToggle.todo',
  },
  WISH: {
    choice: 'lists.kind.wish',
    name: 'lists.kindName.wish',
    noItems: 'lists.noItems.wish',
    items: 'lists.items.wish',
    itemText: 'lists.itemText.wish',
    newItem: 'lists.newItem.wish',
    done: 'lists.done.wish',
    doneToggle: 'lists.doneToggle.wish',
  },
};
