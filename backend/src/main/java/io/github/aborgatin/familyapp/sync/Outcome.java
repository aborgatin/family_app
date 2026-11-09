package io.github.aborgatin.familyapp.sync;

import java.util.Optional;
import java.util.function.Function;

/**
 * What applying an operation did. A rejection is not an outcome: the table throws an {@code
 * ApiException} instead, and the push reports its {@code {code, params}}.
 */
public enum Outcome {
  /** The operation changed the record, or found it already as the operation would leave it. */
  APPLIED,
  /** Delete wins: the record is deleted, or a delete found nothing to delete. */
  IGNORED;

  /** Applies an upsert to the record, or creates it when {@code existing} is empty. */
  @FunctionalInterface
  public interface Upsert<R extends SyncedRecord> {
    Outcome apply(Operation operation, Optional<R> existing);
  }

  /**
   * The skeleton of {@link SyncableTable#apply}, delete wins: anything on a deleted record, and
   * deleting an unknown one, is {@link #IGNORED}; otherwise a delete goes to {@code delete} and an
   * upsert to {@code upsert} (with the record, or empty to create it). Checks that come first (who
   * may see the record) run before calling it.
   */
  public static <R extends SyncedRecord> Outcome deleteWins(
      Operation operation, Optional<R> existing, Upsert<R> upsert, Function<R, Outcome> delete) {
    if (existing.isPresent() && existing.get().deleted()) {
      return IGNORED;
    }
    return switch (operation.type()) {
      case UPSERT -> upsert.apply(operation, existing);
      case DELETE -> existing.map(delete).orElse(IGNORED);
    };
  }
}
