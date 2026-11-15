package io.github.aborgatin.familyapp.family;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Members' login sessions, for modules that keep something per session (spec #104: a push
 * subscription belongs to the session that registered it). A session is named by its <em>key</em>:
 * the stored session's lasting id ({@code spring_session.primary_id}), which stays when a login
 * changes the session id, unlike the id in the cookie. A table may reference {@code spring_session
 * (primary_id)} with {@code ON DELETE CASCADE} to end with the session: logout, the expired-session
 * cleanup and a password reset delete the row.
 */
@Component
public class Sessions {

  private final JdbcTemplate jdbc;
  private final Clock clock;

  Sessions(JdbcTemplate jdbc, Clock clock) {
    this.jdbc = jdbc;
    this.clock = clock;
  }

  /** The key of the stored session with this id (the request's), empty when none is stored. */
  public Optional<String> keyOf(String sessionId) {
    return jdbc
        .queryForList(
            "SELECT primary_id FROM spring_session WHERE session_id = ?", String.class, sessionId)
        .stream()
        .findFirst();
  }

  /**
   * The keys of the Member's live sessions: unexpired by the app's {@link Clock} and still logged
   * in as that Member.
   */
  public List<String> liveKeysOf(UUID memberId) {
    // The session's principal is named by the Member id (family.auth.AuthenticatedMember).
    return jdbc.queryForList(
        "SELECT primary_id FROM spring_session WHERE principal_name = ? AND expiry_time > ?",
        String.class,
        memberId.toString(),
        clock.millis());
  }
}
