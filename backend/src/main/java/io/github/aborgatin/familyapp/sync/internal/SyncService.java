package io.github.aborgatin.familyapp.sync.internal;

import io.github.aborgatin.familyapp.error.ApiError;
import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncLock;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The push and the pull (spec #3 "Write path", "Read path"). A push applies Outbox operations in
 * arrival order, in one transaction under the {@link SyncLock}; each operation runs in its own
 * savepoint, so a rejected one rolls back alone. A pull reads every table from one snapshot.
 */
@Service
class SyncService {

  private final Map<String, SyncableTable> tables;
  private final SyncLock lock;
  private final JdbcTemplate jdbc;
  @PersistenceContext private EntityManager entityManager;

  SyncService(List<SyncableTable> tables, SyncLock lock, JdbcTemplate jdbc) {
    // A second table with the same name fails start-up here.
    this.tables =
        tables.stream().collect(Collectors.toMap(SyncableTable::name, Function.identity()));
    this.lock = lock;
    this.jdbc = jdbc;
  }

  /** An operation as it arrived: any part may be missing or malformed. */
  record Incoming(
      @Nullable String table,
      @Nullable String id,
      @Nullable String op,
      @Nullable Map<String, Object> fields) {}

  /** One operation's result: {@code applied}, {@code ignored}, or {@code rejected} + error. */
  record Result(String status, @Nullable ApiError error) {
    static final Result APPLIED = new Result("applied", null);
    static final Result IGNORED = new Result("ignored", null);
  }

  record Pushed(List<Result> results, long version) {}

  record Change(String table, SyncRow row) {}

  record Pulled(List<Change> changes, long version) {}

  @Transactional
  Pushed push(UUID memberId, List<Incoming> operations) {
    lock.lock();
    List<Result> results = new ArrayList<>();
    for (Incoming incoming : operations) {
      results.add(applyOne(memberId, incoming));
    }
    return new Pushed(results, latestVersion());
  }

  /**
   * Runs one operation inside an SQL savepoint (Hibernate's JPA dialect has none of its own). A
   * rejection rolls the database back to it and drops whatever the operation left in the
   * persistence context; tables flush their writes, so nothing of earlier operations is lost.
   */
  private Result applyOne(UUID memberId, Incoming incoming) {
    jdbc.execute("SAVEPOINT sync_operation");
    try {
      Operation operation = parse(memberId, incoming);
      Outcome outcome = table(incoming.table()).apply(operation);
      jdbc.execute("RELEASE SAVEPOINT sync_operation");
      return outcome == Outcome.IGNORED ? Result.IGNORED : Result.APPLIED;
    } catch (ApiException rejected) {
      entityManager.clear();
      jdbc.execute("ROLLBACK TO SAVEPOINT sync_operation");
      return new Result("rejected", rejected.error());
    }
  }

  private SyncableTable table(@Nullable String name) {
    SyncableTable table = name == null ? null : tables.get(name);
    if (table == null) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "sync.table_unknown", Map.of("table", String.valueOf(name)));
    }
    return table;
  }

  private static Operation parse(UUID memberId, Incoming incoming) {
    Operation.Type type;
    UUID id;
    try {
      type = Operation.Type.valueOf(String.valueOf(incoming.op()).toUpperCase(Locale.ROOT));
      id = UUID.fromString(String.valueOf(incoming.id()));
    } catch (IllegalArgumentException e) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "request.invalid");
    }
    Map<String, Object> fields = incoming.fields() == null ? Map.of() : incoming.fields();
    return new Operation(memberId, id, type, type == Operation.Type.DELETE ? Map.of() : fields);
  }

  /**
   * Every row changed since {@code since} that the Member may see, oldest Version first, and the
   * high-water Version to ask from next time. All tables are read from one snapshot, so the
   * high-water mark covers exactly what was read. With {@code since = 0} (first sync) deleted rows
   * are left out.
   */
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  Pulled pull(UUID memberId, long since) {
    long highWater = Math.max(since, 0);
    List<Change> changes = new ArrayList<>();
    for (SyncableTable table : tables.values()) {
      for (SyncRow row : table.changesSince(since, memberId)) {
        highWater = Math.max(highWater, row.version());
        if (since > 0 || !row.deleted()) {
          changes.add(new Change(table.name(), row));
        }
      }
    }
    changes.sort(Comparator.comparingLong(change -> change.row().version()));
    return new Pulled(changes, highWater);
  }

  /** The last Version handed out; under the lock every lower one is committed or abandoned. */
  long latestVersion() {
    Long version = jdbc.queryForObject("SELECT last_value FROM version_seq", Long.class);
    return version == null ? 0 : version;
  }
}
