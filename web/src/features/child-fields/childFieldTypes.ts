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
