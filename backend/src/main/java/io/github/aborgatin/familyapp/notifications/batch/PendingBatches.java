package io.github.aborgatin.familyapp.notifications.batch;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The pending Batches ({@code pending_batch}, {@code pending_batch_item}; V17): one per (acting
 * Member, List), in the database so a restart loses none.
 */
@Repository
class PendingBatches {

  /** A Batch is sent once its last change is this old: the Member paused. */
  static final Duration QUIET = Duration.ofMinutes(2);

  /** A Batch is sent once its first change is this old, however busy the Member still is. */
  static final Duration LONGEST = Duration.ofMinutes(10);

  /** A Batch taken to be sent: its Items in the order first recorded. */
  record Batch(UUID actorId, UUID listId, List<Entry> items) {}

  /** An Item of a Batch: added, and/or assigned to {@code assigneeId}. */
  record Entry(UUID itemId, boolean added, @Nullable UUID assigneeId) {}

  private final JdbcTemplate jdbc;

  PendingBatches(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /**
   * Records a change to the Item into the Batch of (actor, List), starting one when there is none,
   * in the caller's transaction. An Item recorded again keeps its place; {@code added} only ever
   * turns on, and a later Assignee replaces an earlier one.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  void record(
      UUID actorId,
      UUID listId,
      UUID itemId,
      boolean added,
      @Nullable UUID assigneeId,
      Instant at) {
    Timestamp time = Timestamp.from(at);
    jdbc.update(
        """
        INSERT INTO pending_batch (actor_id, list_id, first_change_at, last_change_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (actor_id, list_id) DO UPDATE SET last_change_at = EXCLUDED.last_change_at
        """,
        actorId,
        listId,
        time,
        time);
    jdbc.update(
        """
        INSERT INTO pending_batch_item (actor_id, list_id, item_id, added, assignee_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (actor_id, list_id, item_id) DO UPDATE SET
          added = pending_batch_item.added OR EXCLUDED.added,
          assignee_id = COALESCE(EXCLUDED.assignee_id, pending_batch_item.assignee_id)
        """,
        actorId,
        listId,
        itemId,
        added,
        assigneeId);
  }

  /**
   * Takes the Batches due at {@code now} (quiet for {@link #QUIET}, or {@link #LONGEST} old) out of
   * the table, oldest first, in the caller's transaction. A Batch a push is adding to right now is
   * left for a later step (its change is new, so it isn't due anyway).
   */
  @Transactional(propagation = Propagation.MANDATORY)
  List<Batch> takeDue(Instant now) {
    List<UUID[]> keys =
        jdbc.query(
            """
            SELECT actor_id, list_id FROM pending_batch
            WHERE last_change_at <= ? OR first_change_at <= ?
            ORDER BY first_change_at, actor_id, list_id
            FOR UPDATE SKIP LOCKED
            """,
            (rs, row) ->
                new UUID[] {
                  rs.getObject("actor_id", UUID.class), rs.getObject("list_id", UUID.class)
                },
            Timestamp.from(now.minus(QUIET)),
            Timestamp.from(now.minus(LONGEST)));
    List<Batch> due =
        keys.stream().map(key -> new Batch(key[0], key[1], entries(key[0], key[1]))).toList();
    for (Batch batch : due) {
      jdbc.update(
          "DELETE FROM pending_batch WHERE actor_id = ? AND list_id = ?",
          batch.actorId(),
          batch.listId());
    }
    return due;
  }

  private List<Entry> entries(UUID actorId, UUID listId) {
    return jdbc.query(
        """
        SELECT item_id, added, assignee_id FROM pending_batch_item
        WHERE actor_id = ? AND list_id = ? ORDER BY position
        """,
        (rs, row) ->
            new Entry(
                rs.getObject("item_id", UUID.class),
                rs.getBoolean("added"),
                rs.getObject("assignee_id", UUID.class)),
        actorId,
        listId);
  }
}
