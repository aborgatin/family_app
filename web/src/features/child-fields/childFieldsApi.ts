import { api } from '@/shared/api';

// Child fields are family data. In M1 they are online-only and call REST directly; M2 moves them
// onto the local store + Outbox (spec #5, S4). Only `useChildFields` may use this file, so that
// swap changes the hook and not the components.

/** See GLOSSARY.md "Value type". Fixed when the Child field is created (ADR-0007). */
export type ValueType = 'TEXT' | 'DATE';

/** The API's `ChildField` shape (spec #5, API contract). */
export interface ChildField {
  id: string;
  name: string;
  valueType: ValueType;
  position: number;
  version: number;
  updatedAt: string;
}

/** The body of `PUT /api/child-fields/{id}`: a full replacement. */
export interface ChildFieldWrite {
  name: string;
  valueType: ValueType;
  position: number;
}

/** Ordered by position, ties by id. */
export function fetchChildFields(): Promise<ChildField[]> {
  return api.get<ChildField[]>('/api/child-fields');
}

/**
 * Creates or replaces the Child field with this id (idempotent). `409 child_field.deleted`,
 * `409 child_field.value_type_immutable`.
 */
export function putChildField(id: string, write: ChildFieldWrite): Promise<ChildField> {
  return api.put<ChildField>(`/api/child-fields/${encodeURIComponent(id)}`, write);
}

/** Soft delete; `204` even when already deleted. */
export function deleteChildField(id: string): Promise<void> {
  return api.delete<undefined>(`/api/child-fields/${encodeURIComponent(id)}`);
}
