package io.github.aborgatin.familyapp.family;

import io.github.aborgatin.familyapp.error.ApiException;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Children for the other packages and modules: whether a Child exists, for rows that are about a
 * Child (a Child list, a Child field value). The Children themselves are written by the push and
 * read by the pull.
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

  /** The rejection of a row about a Child that was never created: {@code child.not_found}. */
  public static ApiException notFound(UUID id) {
    return new ApiException(
        HttpStatus.NOT_FOUND, "child.not_found", Map.of("childId", id.toString()));
  }

  private int count(String sql, UUID id) {
    Integer count = jdbc.queryForObject(sql, Integer.class, id);
    return count == null ? 0 : count;
  }
}
