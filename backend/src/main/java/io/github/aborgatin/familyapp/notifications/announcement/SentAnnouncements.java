package io.github.aborgatin.familyapp.notifications.announcement;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The catalog entries the scheduler step has handled ({@code announcement_sent}, V19): sent, or
 * recorded unsent on a fresh database's first step. A row is never deleted.
 */
@Repository
class SentAnnouncements {

  private final JdbcTemplate jdbc;

  SentAnnouncements(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /**
   * Records the entry {@code id} as handled at {@code at}, in the caller's transaction; {@code
   * false} when it already was.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  boolean recordIfNew(String id, Instant at) {
    return jdbc.update(
            "INSERT INTO announcement_sent (id, sent_at) VALUES (?, ?) ON CONFLICT DO NOTHING",
            id,
            Timestamp.from(at))
        == 1;
  }
}
