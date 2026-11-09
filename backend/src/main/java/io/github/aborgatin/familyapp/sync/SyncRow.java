package io.github.aborgatin.familyapp.sync;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Predicate;
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

  /**
   * The pull's rows for changed records (what {@link SyncableTable#changesSince} returns): a
   * tombstone for a deleted record and for one the Member may not see ({@code visible} false; A1),
   * else the fields {@code fields} puts, in the order put (values may be {@code null}).
   */
  public static <R extends SyncedRecord> List<SyncRow> changes(
      List<R> records, Predicate<R> visible, BiConsumer<R, Map<String, Object>> fields) {
    return records.stream()
        .map(
            record -> {
              if (record.deleted() || !visible.test(record)) {
                return tombstone(record.id(), record.version());
              }
              Map<String, Object> row = new LinkedHashMap<>();
              fields.accept(record, row);
              return of(record.id(), record.version(), row);
            })
        .toList();
  }

  /** {@link #changes(List, Predicate, BiConsumer)} for a table every Member sees whole. */
  public static <R extends SyncedRecord> List<SyncRow> changes(
      List<R> records, BiConsumer<R, Map<String, Object>> fields) {
    return changes(records, record -> true, fields);
  }
}
