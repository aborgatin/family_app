import type { ParseKeys } from 'i18next';

// A List's shapes. Lists are read from the local store and written through the Outbox by
// `useLists()` only (S4); there are no REST calls for them.

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

export const LIST_KINDS: readonly ListKind[] = ['SHOPPING', 'TODO', 'WISH'];

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
  }
> = {
  SHOPPING: {
    choice: 'lists.kind.shopping',
    name: 'lists.kindName.shopping',
    noItems: 'lists.noItems.shopping',
  },
  TODO: { choice: 'lists.kind.todo', name: 'lists.kindName.todo', noItems: 'lists.noItems.todo' },
  WISH: { choice: 'lists.kind.wish', name: 'lists.kindName.wish', noItems: 'lists.noItems.wish' },
};
