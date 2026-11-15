package io.github.aborgatin.familyapp.notifications.push;

import io.github.aborgatin.familyapp.family.Sessions;
import io.github.aborgatin.familyapp.notifications.PushSubscription;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * The {@code push_subscription} table (server-only, V16). A row belongs to the session that
 * registered it, by its key ({@link Sessions}; a foreign key with {@code ON DELETE CASCADE}), so it
 * is deleted with that session: logout, the expired-session cleanup, a password reset ending every
 * session. A device counts only while that session is live and logged in as the row's Member.
 */
@Repository
public class PushSubscriptions {

  private final JdbcTemplate jdbc;
  private final Sessions sessions;
  private final Clock clock;

  PushSubscriptions(JdbcTemplate jdbc, Sessions sessions, Clock clock) {
    this.jdbc = jdbc;
    this.sessions = sessions;
    this.clock = clock;
  }

  /**
   * Inserts the subscription for this Member and session, or moves an existing one with the same
   * endpoint to them. Returns {@code false} when the session ended meanwhile (its row is gone).
   */
  boolean upsert(PushSubscription subscription, UUID memberId, String sessionKey) {
    try {
      jdbc.update(
          """
        INSERT INTO push_subscription
          (endpoint, p256dh, auth, member_id, session_primary_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (endpoint) DO UPDATE SET
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          member_id = EXCLUDED.member_id,
          session_primary_id = EXCLUDED.session_primary_id
        """,
          subscription.endpoint(),
          subscription.p256dh(),
          subscription.auth(),
          memberId,
          sessionKey,
          Timestamp.from(clock.instant()));
      return true;
    } catch (DataIntegrityViolationException e) {
      return false; // the foreign key to the session's row
    }
  }

  /** Deletes the Member's own subscription with this endpoint; anyone else's stays. */
  void delete(String endpoint, UUID memberId) {
    jdbc.update(
        "DELETE FROM push_subscription WHERE endpoint = ? AND member_id = ?", endpoint, memberId);
  }

  /** Forgets a subscription the push service no longer knows ({@code GONE}). */
  public void deleteGone(String endpoint) {
    jdbc.update("DELETE FROM push_subscription WHERE endpoint = ?", endpoint);
  }

  /** The Member's devices whose session is still live and logged in as them. */
  public List<PushSubscription> ofMember(UUID memberId) {
    List<String> liveSessions = sessions.liveKeysOf(memberId);
    if (liveSessions.isEmpty()) {
      return List.of();
    }
    return jdbc.query(
        """
        SELECT endpoint, p256dh, auth FROM push_subscription
        WHERE member_id = ? AND session_primary_id = ANY (?)
        ORDER BY created_at, endpoint
        """,
        (rs, row) ->
            new PushSubscription(
                rs.getString("endpoint"), rs.getString("p256dh"), rs.getString("auth")),
        memberId,
        liveSessions.toArray(String[]::new));
  }
}
