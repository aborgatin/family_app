package io.github.aborgatin.familyapp.notifications.schedule;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * When the scheduler step last ran ({@code scheduler_step}, a single row; V17), in the database so
 * that after downtime the Reminders' window starts where the last run left off (spec #104).
 */
@Repository
public class StepRuns {

  private final JdbcTemplate jdbc;

  StepRuns(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /**
   * Records that a step ran at {@code at}, in the caller's transaction, and returns when the
   * previous one ran (empty before the first run). The row stays locked until the caller commits,
   * so two steps never share a window.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public Optional<Instant> replaceLastRun(Instant at) {
    Timestamp previous =
        jdbc.queryForObject("SELECT last_run_at FROM scheduler_step FOR UPDATE", Timestamp.class);
    jdbc.update("UPDATE scheduler_step SET last_run_at = ?", Timestamp.from(at));
    return Optional.ofNullable(previous).map(Timestamp::toInstant);
  }
}
