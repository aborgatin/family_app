package io.github.aborgatin.familyapp;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;

/**
 * Test fixture: puts the shared Testcontainers database back to a fresh installation (no Members,
 * no sessions) so each test starts from the state a new Family sees. Only fixture set-up touches
 * tables directly; assertions go through the HTTP API (T1).
 */
public final class FreshInstallation {

  private FreshInstallation() {}

  public static void reset(JdbcTemplate jdbc) {
    jdbc.execute("TRUNCATE spring_session CASCADE");
    jdbc.execute("TRUNCATE child CASCADE");
    removeMembersOnly(jdbc);
  }

  /** Removes every Member but leaves existing sessions in place. */
  public static void removeMembersOnly(JdbcTemplate jdbc) {
    jdbc.execute("TRUNCATE member CASCADE");
  }

  /**
   * Removes every Child field, the Defaults included, so a test can set up exactly the fields it
   * needs. (The Defaults themselves are checked on a really fresh database by {@code
   * ChildFieldDefaultsTest}.)
   */
  public static void removeChildFields(JdbcTemplate jdbc) {
    jdbc.execute("TRUNCATE child_field CASCADE");
  }

  /**
   * Adds a Member who can log in with {@code password}, for tests that need a second Member without
   * going through an Invite.
   */
  public static void addMember(
      JdbcTemplate jdbc,
      String email,
      String password,
      String displayName,
      String grammaticalGender) {
    jdbc.update(
        """
        INSERT INTO member (id, family_id, email, password_hash, display_name, grammatical_gender)
        VALUES (?, (SELECT id FROM family), ?, ?, ?, ?)
        """,
        UUID.randomUUID(),
        email,
        PasswordEncoderFactories.createDelegatingPasswordEncoder().encode(password),
        displayName,
        grammaticalGender);
  }
}
