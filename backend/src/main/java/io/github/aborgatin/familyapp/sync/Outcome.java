package io.github.aborgatin.familyapp.sync;

/**
 * What applying an operation did. A rejection is not an outcome: the table throws an {@code
 * ApiException} instead, and the push reports its {@code {code, params}}.
 */
public enum Outcome {
  /** The operation changed the record, or found it already as the operation would leave it. */
  APPLIED,
  /** Delete wins: the record is deleted, or a delete found nothing to delete. */
  IGNORED
}
