package io.github.aborgatin.familyapp.sync;

import java.util.Map;
import java.util.UUID;
import org.springframework.lang.Nullable;

/**
 * One changed row of a syncable table, as a pull returns it: the row's fields (what the client
 * stores, never secrets), or a tombstone without fields for a deleted row.
 */
public record SyncRow(
    UUID id, long version, boolean deleted, @Nullable Map<String, Object> fields) {

  /** A row that exists, with the fields the client stores. Values may be {@code null}. */
  public static SyncRow of(UUID id, long version, Map<String, Object> fields) {
    return new SyncRow(id, version, false, fields);
  }

  /** A deleted row: only its id and Version. */
  public static SyncRow tombstone(UUID id, long version) {
    return new SyncRow(id, version, true, null);
  }
}
