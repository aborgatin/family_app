// The Child's shapes. Children are read from the local store and written through the Outbox by
// `useChildren()` only (S4); there are no REST calls for them.

/** A Child as the local store keeps it (the fields the sync pull sends). */
export interface Child {
  id: string;
  name: string;
  /** A Child color palette code. */
  color: string;
  /** `YYYY-MM-DD`, or `null` when unknown. */
  birthday: string | null;
}

/** What a Member edits. */
export interface ChildDetails {
  name: string;
  color: string;
  birthday: string | null;
}
