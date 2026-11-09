package io.github.aborgatin.familyapp.sync;

import io.github.aborgatin.familyapp.error.ApiException;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;

/**
 * A syncable table (S1) as the sync push and pull see it. The module that owns the table implements
 * this as a Spring bean; the {@code sync} module collects every implementation. See "Adding a
 * syncable table" in {@code docs/architecture/backend.md}.
 */
public interface SyncableTable {

  /** The table's name, as operations and pulled changes name it, e.g. {@code child}. */
  String name();

  /**
   * Applies one operation. Runs inside the push transaction, after the {@link SyncLock}, in the
   * order operations arrived. Delete wins: an operation on a deleted record, and deleting an
   * unknown or deleted id, is {@link Outcome#IGNORED}. To reject the operation, throw an {@link
   * ApiException} (field validation: {@code FieldErrors}); the push rolls back this one operation
   * and goes on with the next. Validate before changing anything.
   *
   * <p>The default rejects every operation with {@code sync.read_only}: the table is pull-only.
   */
  default Outcome apply(Operation operation) {
    throw new ApiException(HttpStatus.BAD_REQUEST, "sync.read_only");
  }

  /**
   * The rows changed since {@code version} that {@code memberId} may see, deleted ones as
   * tombstones. Runs inside the pull's read-only transaction. A row the Member may not see is sent
   * as a tombstone or left out, never with its fields.
   */
  List<SyncRow> changesSince(long version, UUID memberId);
}
