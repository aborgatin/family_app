package io.github.aborgatin.familyapp.family;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Test fixture: puts the shared Testcontainers database back to a fresh installation (no Members,
 * no sessions) so each test starts from the state a new Family sees. Only fixture set-up touches
 * tables directly; assertions go through the HTTP API (T1).
 */
final class FreshInstallation {

  private FreshInstallation() {}

  static void reset(JdbcTemplate jdbc) {
    jdbc.execute("TRUNCATE spring_session CASCADE");
    removeMembersOnly(jdbc);
  }

  /** Removes every Member but leaves existing sessions in place. */
  static void removeMembersOnly(JdbcTemplate jdbc) {
    jdbc.execute("TRUNCATE member CASCADE");
  }
}
