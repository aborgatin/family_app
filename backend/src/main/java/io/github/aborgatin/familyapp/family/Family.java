package io.github.aborgatin.familyapp.family;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The single Family (ADR-0004): one row, created by the first migration, never written by the app.
 * Rows that belong to it ({@code member}, {@code child}, {@code child_field}) store its id.
 */
@Component
public class Family {

  private final JdbcTemplate jdbc;

  Family(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** The Family's id. Takes no lock: a write takes {@link FamilyLock} itself. */
  public UUID id() {
    return jdbc.queryForObject("SELECT id FROM family", UUID.class);
  }
}
