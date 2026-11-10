package io.github.aborgatin.familyapp.family;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Children for other modules: whether a Child exists, for rows of another module that are about a
 * Child (a Child list). The Children themselves are written by the push and read by the pull.
 */
@Component
public class Children {

  private final JdbcTemplate jdbc;

  Children(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** Whether a Child with this id was ever created, a deleted one included. */
  public boolean known(UUID id) {
    return count("SELECT count(*) FROM child WHERE id = ?", id) > 0;
  }

  /** Whether the Child with this id is there: created and not deleted. */
  public boolean present(UUID id) {
    return count("SELECT count(*) FROM child WHERE id = ? AND NOT deleted", id) > 0;
  }

  private int count(String sql, UUID id) {
    Integer count = jdbc.queryForObject(sql, Integer.class, id);
    return count == null ? 0 : count;
  }
}
