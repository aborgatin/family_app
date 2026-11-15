package io.github.aborgatin.familyapp.notifications.push;

import io.github.aborgatin.familyapp.notifications.PushSubscription;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * The {@code push_subscription} table (server-only, V16). A row belongs to the Spring Session that
 * registered it (a foreign key with {@code ON DELETE CASCADE} to {@code spring_session}), so it is
 * deleted with that session: logout, the expired-session cleanup, a password reset ending every
 * session. A device counts only while that session is unexpired and still logged in as the row's
 * Member (Spring Session keeps the same row when a login changes the session id).
 */
@Repository
public class PushSubscriptions {

  private final JdbcTemplate jdbc;
  private final Clock clock;

  PushSubscriptions(JdbcTemplate jdbc, Clock clock) {
    this.jdbc = jdbc;
    this.clock = clock;
  }

  /**
   * Inserts the subscription for this Member and session, or moves an existing one with the same
   * endpoint to them. Returns {@code false} when no stored session has this id.
   */
  boolean upsert(PushSubscription subscription, UUID memberId, String sessionId) {
    return jdbc.update(
            """
            INSERT INTO push_subscription
              (endpoint, p256dh, auth, member_id, session_primary_id, created_at)
            SELECT ?, ?, ?, ?, primary_id, ? FROM spring_session WHERE session_id = ?
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
            java.sql.Timestamp.from(clock.instant()),
            sessionId)
        > 0;
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

  /** The Member's devices whose session is still alive and logged in as them. */
  public List<PushSubscription> ofMember(UUID memberId) {
    return jdbc.query(
        """
        SELECT p.endpoint, p.p256dh, p.auth
        FROM push_subscription p
        JOIN spring_session s ON s.primary_id = p.session_primary_id
        WHERE p.member_id = ? AND s.principal_name = ? AND s.expiry_time > ?
        ORDER BY p.created_at, p.endpoint
        """,
        (rs, row) ->
            new PushSubscription(
                rs.getString("endpoint"), rs.getString("p256dh"), rs.getString("auth")),
        memberId,
        memberId.toString(),
        clock.millis());
  }
}
