package io.github.aborgatin.familyapp;

import java.time.Duration;
import java.time.Instant;
import java.util.function.BooleanSupplier;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Watching concurrent requests wait on a row lock, for the tests of the "Versions commit in order"
 * guarantee (sync.md). The one exception to "assert through HTTP only" (backend.md Testing): no
 * HTTP answer shows that a request is blocked on the Family lock rather than slow, so these read
 * {@code pg_stat_activity}.
 */
public final class LockWaits {

  /** How long a test waits for the concurrent requests before failing. */
  public static final Duration PATIENCE = Duration.ofSeconds(10);

  private LockWaits() {}

  /** How many transactions of the test database are waiting on a lock right now. */
  public static int transactionsWaitingOnALock(JdbcTemplate jdbc) {
    Integer waiting =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
            """,
            Integer.class);
    return waiting == null ? 0 : waiting;
  }

  /** Waits until {@code condition} holds; fails after {@link #PATIENCE}. */
  public static void waitUntil(BooleanSupplier condition) throws InterruptedException {
    Instant deadline = Instant.now().plus(PATIENCE);
    while (!condition.getAsBoolean()) {
      if (Instant.now().isAfter(deadline)) {
        throw new AssertionError("timed out waiting for the concurrent requests");
      }
      Thread.sleep(20);
    }
  }
}
