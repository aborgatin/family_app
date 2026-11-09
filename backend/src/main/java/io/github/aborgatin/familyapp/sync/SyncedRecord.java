package io.github.aborgatin.familyapp.sync;

import java.util.UUID;

/**
 * A row of a syncable table (S1) as its entity holds it: what {@link Outcome#deleteWins} and {@link
 * SyncRow#changes} need to know about every record, whatever its table.
 */
public interface SyncedRecord {

  UUID id();

  /** The Version the database trigger stamped on the last write. */
  long version();

  /** Soft-deleted (S2). */
  boolean deleted();
}
