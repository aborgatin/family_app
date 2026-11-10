// The Child field's shapes. Child fields are read from the local store and written through the
// Outbox by `useChildFields()` only (S4); there are no REST calls for them.

/** See GLOSSARY.md "Value type". Fixed when the Child field is created (ADR-0007). */
export type ValueType = 'TEXT' | 'DATE';

/** A Child field as the local store keeps it (the fields the sync pull sends). */
export interface ChildField {
  id: string;
  name: string;
  valueType: ValueType;
  position: number;
}

/**
 * One entry of the timeline of a Child's value for a Child field (ADR-0007), as the local store
 * keeps it. Saving a value appends an entry; entries never change.
 */
export interface ChildFieldValue {
  id: string;
  childId: string;
  childFieldId: string;
  /** In the Value type's canonical format (a date as `YYYY-MM-DD`); `''` for a cleared value. */
  value: string;
  /** Set by the server; absent until the pull after the save. */
  recordedAt?: string;
  /** The Version the pull sent the entry with; absent until then. */
  version?: number;
  /** When this device saved the entry (ms), device-only: orders the entries not sent yet. */
  savedHereAt?: number;
}
